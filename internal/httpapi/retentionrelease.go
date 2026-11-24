package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RETENTION RELEASE — this service of `escrow:release-retention`.
//
// WHY A SWEEPER, NOT A REQUEST HOOK
// ----------------------------------
// A retention balance becomes releasable by the passage of TIME (warranty_end_at
// passes), not by a user action. Hanging it off a request would leave money
// stranded until someone loads the right page. So it is a scheduled sweep,
// re-runnable: if the app was down on expiry day, the next run picks it up.
//
// RULES, IN ORDER (mirrors the previous command):
//  1. Warranty must have EXPIRED (projects.warranty_end_at < now()).
//     Read from the recorded date, never recomputed.
//  2. No warranty claim may still contest it: `open`/`fixing` block,
//     `resolved`/`closed` do not.
//  3. No open project dispute may exist (improvement over legacy: the previous
//     command did not check disputes, but every other disbursement is frozen
//     while a dispute is open, and a retention payout is a disbursement).
//  4. The write is a `retention_release` ledger row (never `payment` — reusing
//     the termin's payment reference with type payment matched the dedupe and
//     became a silent no-op) plus marking the stage released in the SAME
//     transaction.
//
// IDEMPOTENCY: stages with retention_released_at set are skipped; the tx
// re-reads the stage and bails if another replica released it first.

type RetentionReleaseResult struct {
	Scanned            int
	ReleasedStages     int
	ReleasedTotalMinor int64
	SkippedBlocked     int
	SkippedNothingHeld int
	SkippedDispute     int
	Lines              []string
}

// ReleaseExpiredRetentions sweeps releasable retentions. When projectFilter is
// non-nil only that project is scanned. When dryRun is true nothing is written.
func ReleaseExpiredRetentions(ctx context.Context, pool *pgxpool.Pool, projectFilter *int64, dryRun bool, logger *slog.Logger) (RetentionReleaseResult, error) {
	var res RetentionReleaseResult

	var projectIDs []int64
	if projectFilter != nil {
		var expired bool
		if err := pool.QueryRow(ctx,
			`SELECT (warranty_end_at IS NOT NULL AND warranty_end_at < now()) FROM projects WHERE id = $1`,
			*projectFilter,
		).Scan(&expired); err != nil {
			if isNoRows(err) {
				return res, nil
			}
			return res, err
		}
		if !expired {
			return res, nil
		}
		projectIDs = []int64{*projectFilter}
	} else {
		qrows, err := pool.Query(ctx, `SELECT id FROM projects WHERE warranty_end_at IS NOT NULL AND warranty_end_at < now() ORDER BY id`)
		if err != nil {
			return res, err
		}
		for qrows.Next() {
			var id int64
			if err := qrows.Scan(&id); err != nil {
				qrows.Close()
				return res, err
			}
			projectIDs = append(projectIDs, id)
		}
		if err := qrows.Err(); err != nil {
			qrows.Close()
			return res, err
		}
		qrows.Close()
	}

	res.Scanned = len(projectIDs)

	bySpelling, _, err := registryIDs(ctx, pool)
	if err != nil {
		return res, err
	}
	terminRegistryID := bySpelling[`App\Models\ProjectPaymentTermin`]

	blocking, err := retentionBlockingBatch(ctx, pool, projectIDs)
	if err != nil {
		return res, err
	}
	disputes, err := retentionDisputesBatch(ctx, pool, projectIDs)
	if err != nil {
		return res, err
	}
	held, err := retentionStagesBatch(ctx, pool, projectIDs)
	if err != nil {
		return res, err
	}

	for _, projectID := range projectIDs {
		// 2. Blocking warranty claims.
		if count := blocking[projectID]; count > 0 {
			res.SkippedBlocked++
			res.Lines = append(res.Lines, "project "+strconv.FormatInt(projectID, 10)+": "+strconv.Itoa(count)+" blocking claim(s) - held back")
			continue
		}

		// 3. Open dispute also freezes the release (improvement over legacy).
		if dispute, ok := disputes[projectID]; ok {
			res.SkippedDispute++
			res.Lines = append(res.Lines, "project "+strconv.FormatInt(projectID, 10)+": open dispute #"+strconv.FormatInt(dispute.id, 10)+" - held back")
			continue
		}

		// 4. Stages holding retention.
		stages := held[projectID]
		if len(stages) == 0 {
			res.SkippedNothingHeld++
			continue
		}

		for _, st := range stages {
			retentionMinor, ok := parseMinor(st.retention)
			if !ok || retentionMinor <= 0 {
				continue
			}

			if dryRun {
				res.ReleasedStages++
				res.ReleasedTotalMinor += retentionMinor
				res.Lines = append(res.Lines, "project "+strconv.FormatInt(projectID, 10)+" stage "+strconv.FormatInt(st.id, 10)+": WOULD release Rp "+formatIDAmount(retentionMinor)+" ("+st.label+")")
				continue
			}

			released, err := releaseOneRetention(ctx, pool, projectID, st.id, st.label, retentionMinor, terminRegistryID)
			if err != nil {
				if logger != nil {
					logger.Error("retention: release failed", "project", projectID, "stage", st.id, "error", err)
				}
				res.Lines = append(res.Lines, "project "+strconv.FormatInt(projectID, 10)+" stage "+strconv.FormatInt(st.id, 10)+": FAILED - "+err.Error())
				continue
			}
			if !released {
				continue
			}
			res.ReleasedStages++
			res.ReleasedTotalMinor += retentionMinor
			res.Lines = append(res.Lines, "project "+strconv.FormatInt(projectID, 10)+" stage "+strconv.FormatInt(st.id, 10)+": released Rp "+formatIDAmount(retentionMinor)+" ("+st.label+")")
		}
	}

	return res, nil
}

type retentionStage struct {
	id        int64
	label     string
	retention string
}

type retentionDispute struct {
	id    int64
	title string
}

// retentionBlockingBatch counts blocking claims for every candidate in one
// grouped query instead of one query per project.
func retentionBlockingBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64) (map[int64]int, error) {
	out := map[int64]int{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT project_id, count(*)
		FROM project_warranty_claims
		WHERE project_id = ANY($1) AND status::text IN ('open','fixing')
		GROUP BY project_id`, projectIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var count int
		if err := rows.Scan(&id, &count); err != nil {
			return nil, err
		}
		out[id] = count
	}
	return out, rows.Err()
}

// retentionDisputesBatch finds the first open dispute per candidate.
func retentionDisputesBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64) (map[int64]retentionDispute, error) {
	out := map[int64]retentionDispute{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT DISTINCT ON (project_id) project_id, id, title
		FROM project_disputes
		WHERE project_id = ANY($1) AND status::text = 'open'
		ORDER BY project_id, id`, projectIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var projectID int64
		var dispute retentionDispute
		if err := rows.Scan(&projectID, &dispute.id, &dispute.title); err != nil {
			return nil, err
		}
		out[projectID] = dispute
	}
	return out, rows.Err()
}

// retentionStagesBatch loads every unreleased retention stage for the page.
func retentionStagesBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64) (map[int64][]retentionStage, error) {
	out := map[int64][]retentionStage{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT project_id, id, label, retention_amount::text
		FROM project_payment_termins
		WHERE project_id = ANY($1) AND retention_amount > 0 AND retention_released_at IS NULL
		ORDER BY project_id, id`, projectIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var projectID int64
		var stage retentionStage
		if err := rows.Scan(&projectID, &stage.id, &stage.label, &stage.retention); err != nil {
			return nil, err
		}
		out[projectID] = append(out[projectID], stage)
	}
	return out, rows.Err()
}

func releaseOneRetention(ctx context.Context, pool *pgxpool.Pool, projectID, stageID int64, label string, retentionMinor, terminRegistryID int64) (bool, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	// Re-read inside the tx: another replica may have released it.
	var already any
	if err := tx.QueryRow(ctx, `SELECT retention_released_at FROM project_payment_termins WHERE id = $1 AND project_id = $2`, stageID, projectID).Scan(&already); err != nil {
		return false, err
	}
	if already != nil {
		return false, nil
	}

	// Affordability: retention was withheld from the same ceiling, so the
	// escrow should cover it — but a budget cut after the fact could leave
	// it short. Returning false (not an error) leaves it for the next run.
	var lockedBudget string
	if err := tx.QueryRow(ctx, `SELECT budget::text FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedBudget); err != nil {
		return false, err
	}
	budgetMinor, _ := parseMinor(lockedBudget)
	paid, err := paidTotalMinor(ctx, tx, projectID)
	if err != nil {
		return false, err
	}
	if budgetMinor-paid < retentionMinor {
		return false, nil
	}

	// THE TYPE MUST BE retention_release, NOT payment (previous silent no-op).
	title := "Retention released: " + label + " (warranty expired)"
	if terminRegistryID != 0 {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT exists(SELECT 1 FROM project_budget_transactions WHERE project_id = $1 AND reference_id = $2 AND transaction_type = 'retention_release' AND reference_type_id = $3)`, projectID, stageID, terminRegistryID).Scan(&exists); err != nil {
			return false, err
		}
		if exists {
			// Already released under the ledger but the stage was never
			// marked (crash between the two writes): repair the mark.
			if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET retention_released_at = date_trunc('second', now()), retention_released_amount = $2::numeric, updated_at = date_trunc('second', now()) WHERE id = $1`, stageID, formatMinor(retentionMinor)); err != nil {
				return false, err
			}
			if err := tx.Commit(ctx); err != nil {
				return false, err
			}
			return true, nil
		}
		if _, err := tx.Exec(ctx, `INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title, reference_type_id, reference_id, transaction_date, created_at, updated_at) VALUES ($1, 'retention_release', $2, $3, $4, $5, date_trunc('second', now()), date_trunc('second', now()), date_trunc('second', now()))`, projectID, formatMinor(retentionMinor), title, terminRegistryID, stageID); err != nil {
			return false, err
		}
	} else {
		if _, err := tx.Exec(ctx, `INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title, reference_id, transaction_date, created_at, updated_at) VALUES ($1, 'retention_release', $2, $3, $4, date_trunc('second', now()), date_trunc('second', now()), date_trunc('second', now()))`, projectID, formatMinor(retentionMinor), title, stageID); err != nil {
			return false, err
		}
	}

	if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET retention_released_at = date_trunc('second', now()), retention_released_amount = $2::numeric, updated_at = date_trunc('second', now()) WHERE id = $1`, stageID, formatMinor(retentionMinor)); err != nil {
		return false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	var ownerID int64
	var projectTitle string
	if err := pool.QueryRow(ctx, `SELECT user_id, title FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &projectTitle); err == nil && ownerID != 0 {
		_ = insertNotificationPool(ctx, pool, ownerID, "retention_released",
			"Retention Released",
			"Retention Rp "+formatIDAmount(retentionMinor)+" for \""+projectTitle+"\" ("+label+") was released. Warranty has expired.",
			`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`)
	}
	return true, nil
}

// AdminRetentionReleaseHandler serves `POST /api/admin/retention/release`.
// Admin only. Body (JSON or form): {project_id?, dry_run?}. Runs the same
// sweeper as the scheduled command and answers the counts.
func AdminRetentionReleaseHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		fields, _, err := requestFields(r)
		if err != nil {
			fields = map[string]any{}
		}

		var filter *int64
		if raw, present := fields["project_id"]; present && raw != nil {
			text, _ := fieldNumeric(fields, "project_id")
			if text != "" {
				if parsed, perr := strconv.ParseInt(text, 10, 64); perr == nil && parsed > 0 {
					filter = &parsed
				}
			}
		}
		dryRun := false
		if raw, present := fields["dry_run"]; present && raw != nil {
			if b, ok := parseBooleanFlag(raw); ok {
				dryRun = b
			} else if s, ok := raw.(string); ok && (s == "1" || s == "true") {
				dryRun = true
			}
		}

		res, err := ReleaseExpiredRetentions(ctx, pool, filter, dryRun, slog.Default())
		if err != nil {
			slog.Error("retention: admin sweep", "error", err)
			serverError(w)
			return
		}

		payload := jsonwire.NewObject()
		payload.Set("message", "Retention sweep complete")
		payload.Set("dry_run", dryRun)
		payload.Set("projects_scanned", res.Scanned)
		payload.Set("released_stages", res.ReleasedStages)
		payload.Set("released_total", formatMinor(res.ReleasedTotalMinor))
		payload.Set("skipped_blocking_claim", res.SkippedBlocked)
		payload.Set("skipped_open_dispute", res.SkippedDispute)
		payload.Set("skipped_nothing_held", res.SkippedNothingHeld)
		lines := make([]any, 0, len(res.Lines))
		for _, l := range res.Lines {
			lines = append(lines, l)
		}
		payload.Set("lines", lines)

		writeJSON(w, http.StatusOK, payload)
	}
}
