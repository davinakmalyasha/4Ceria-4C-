package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PHASE HANDOVER — the PM approves or sends a phase back for revision.
//
// Both answer `loadFullProject`'s shape: hired professionals with their
// users, every bid list with `bidder: null` (the relations were never
// eager-loaded), documents/comments/addendums/milestones, the PM block,
// the interior engineer and the termins — 135 keys on the probe project.
//
// approve runs `verifyPhase`: design additionally auto-verifies the
// hired roles' documents, approves their milestones, unlocks the linked
// stages and stamps the four approval columns; every phase appends to
// `completed_phases`, logs, unblocks the first locked stage of the role
// and notifies the professional.
//
// reject (`handover/reject`) validates `phase` against design|build|
// interior|legal — note BUILD, unlike approve's construction — clears the
// handover stamp, stores the note and re-answers the same resource.

// handoverLoadSpec is loadFullProject().
func handoverLoadSpec() projectLoad {
	return projectLoad{
		milestones:        true,
		documents:         true,
		comments:          true,
		addendums:         true,
		paymentTermins:    true,
		hiredPros:         true,
		pmBlock:           true,
		engineers:         []string{"interior_engineer"},
		viewerBidRoles:    []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager", "structural", "mep"},
		unscopedBids:      true,
		bidsWithoutBidder: true,
		budgetSummary:     true,
	}
}

// handoverRespond renders the full resource after a commit.
func handoverRespond(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter, projectID int64, viewer *projectViewer) {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		slog.Error("handover: reload", "error", err)
		serverError(w)
		return
	}

	entry, err := projectResource(ctx, pool, fields, values, viewer, handoverLoadSpec(), nil)
	if err != nil {
		slog.Error("handover: render", "error", err)
		serverError(w)
		return
	}

	payload := jsonphp.NewObject()
	payload.Set("data", entry)
	writeJSON(w, http.StatusOK, payload)
}

// PhaseHandoverApproveHandler serves
// `POST /api/projects/{project}/handover/approve`.
func PhaseHandoverApproveHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("handover-approve: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("handover-approve: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(fields, values)
		var pmProfile *int64
		if id, ok := project["pm_id"].(int64); ok {
			pmProfile = &id
		}
		if viewer.role != "project_manager" || !verifyAssignedPM(viewer, pmProfile) {
			message(w, http.StatusForbidden, "Unauthorized. Only the assigned PM can approve handovers.")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		phase := validateHandoverPhase(formFields, failures, "construction")
		if !failures.empty() {
			failures.write(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("handover-approve: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if !verifyPhaseTx(ctx, tx, projectID, project, phase, viewer.id) {
			message(w, http.StatusUnprocessableEntity, "Phase verification failed.")
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("handover-approve: commit", "error", err)
			serverError(w)
			return
		}

		handoverRespond(ctx, pool, w, projectID, viewer)
	}
}

// PhaseHandoverRevisionHandler serves
// `POST /api/projects/{project}/handover/reject`.
func PhaseHandoverRevisionHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("handover-reject: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("handover-reject: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(fields, values)
		var pmProfile *int64
		if id, ok := project["pm_id"].(int64); ok {
			pmProfile = &id
		}
		if viewer.role != "project_manager" || !verifyAssignedPM(viewer, pmProfile) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		phase, notes := validateHandoverRevision(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("handover-reject: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		// `build` shares the construction columns.
		columnPhase := phase
		if phase == "build" {
			columnPhase = "construction"
		}
		if _, err := tx.Exec(ctx, `UPDATE projects SET `+columnPhase+"_handover_submitted_at"+` = NULL,
			`+columnPhase+"_handover_notes"+` = $2, updated_at = date_trunc('second', now()) WHERE id = $1`,
			projectID, notes); err != nil {
			slog.Error("handover-reject: update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, phase+"_handover_revision",
			"PM requested revisions for "+phase+" handover: "+notes); err != nil {
			slog.Error("handover-reject: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("handover-reject: commit", "error", err)
			serverError(w)
			return
		}

		handoverRespond(ctx, pool, w, projectID, viewer)
	}
}

// validateHandoverPhase enforces phase required|in:design,construction,
// interior,legal (approve) — the reject path uses design|build|interior|legal.
func validateHandoverPhase(fields map[string]any, failures *errorBag, constructionSpelling string) string {
	raw, present := fields["phase"]
	if !present || raw == nil {
		failures.add("phase", "The phase field is required.")
		return ""
	}
	s, ok := raw.(string)
	if !ok {
		failures.add("phase", "The selected phase is invalid.")
		return ""
	}
	switch s {
	case "design", "interior", "legal":
		return s
	case constructionSpelling:
		return s
	}
	failures.add("phase", "The selected phase is invalid.")
	return ""
}

// validateHandoverRevision enforces phase in design,build,interior,legal
// and notes required|string|max:1000.
func validateHandoverRevision(fields map[string]any, failures *errorBag) (string, string) {
	phase := ""
	if raw, present := fields["phase"]; !present || raw == nil {
		failures.add("phase", "The phase field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("phase", "The selected phase is invalid.")
	} else {
		switch s {
		case "design", "build", "interior", "legal":
			phase = s
		default:
			failures.add("phase", "The selected phase is invalid.")
		}
	}

	notes := ""
	if raw, present := fields["notes"]; !present || raw == nil {
		failures.add("notes", "The notes field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("notes", "The notes field must be a string.")
	} else if s == "" {
		failures.add("notes", "The notes field is required.")
	} else if len([]rune(s)) > 1000 {
		failures.add("notes", "The notes field must not be greater than 1000 characters.")
	} else {
		notes = s
	}

	return phase, notes
}

// verifyPhaseTx mirrors ProjectLifecycleService::verifyPhase inside a tx.
func verifyPhaseTx(ctx context.Context, tx pgx.Tx, projectID int64, project map[string]any, phase string, actorID int64) bool {
	action := ""
	details := ""
	nowCols := []string{}
	nullCols := []string{}

	switch phase {
	case "design":
		nowCols = append(nowCols, "owner_design_approved_at", "design_locked_at", "design_completed_at")

		type roleCfg struct {
			role   string
			column string
			docCat string
		}
		configs := []roleCfg{
			{"design", "selected_arsitek_id", "blueprint"},
			{"structural", "structural_id", "structural_calc"},
			{"mep", "mep_id", "mep_layout"},
			{"interior", "selected_interior_id", "interior_design"},
		}
		for _, cfg := range configs {
			hired := intPtrDeref(project[cfg.column])
			if hired == 0 {
				continue
			}
			switch cfg.role {
			case "design":
				nowCols = append(nowCols, "owner_design_approved_at")
			case "structural":
				nowCols = append(nowCols, "structural_approved_at")
			case "mep":
				nowCols = append(nowCols, "mep_approved_at")
			case "interior":
				nowCols = append(nowCols, "owner_interior_approved_at")
			}

			if _, err := tx.Exec(ctx, `UPDATE project_documents SET status = 'verified',
				reviewed_at = date_trunc('second', now()), updated_at = date_trunc('second', now())
				WHERE project_id = $1 AND category = $2`, projectID, cfg.docCat); err != nil {
				return false
			}

			rows, err := tx.Query(ctx, `SELECT id, title FROM project_milestones
				WHERE project_id = $1 AND phase_context = $2 AND approval_status::text <> 'approved' ORDER BY id`,
				projectID, cfg.role)
			if err != nil {
				return false
			}
			type milestone struct {
				id    int64
				title string
			}
			list := make([]milestone, 0)
			for rows.Next() {
				var item milestone
				if err := rows.Scan(&item.id, &item.title); err != nil {
					rows.Close()
					return false
				}
				list = append(list, item)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return false
			}

			for _, item := range list {
				if _, err := tx.Exec(ctx, `UPDATE project_milestones SET is_completed = true,
					approval_status = 'approved', pm_verified_at = date_trunc('second', now()),
					updated_at = date_trunc('second', now()) WHERE id = $1`, item.id); err != nil {
					return false
				}

				terminRows, err := tx.Query(ctx, `SELECT id, COALESCE(label, '') FROM project_payment_termins
					WHERE milestone_id = $1 AND status::text IN ('locked', 'pending') ORDER BY id`, item.id)
				if err != nil {
					return false
				}
				type termin struct {
					id    int64
					label string
				}
				termins := make([]termin, 0)
				for terminRows.Next() {
					var t termin
					if err := terminRows.Scan(&t.id, &t.label); err != nil {
						terminRows.Close()
						return false
					}
					termins = append(termins, t)
				}
				terminRows.Close()
				if err := terminRows.Err(); err != nil {
					return false
				}

				for _, t := range termins {
					if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET status = 'pending',
						updated_at = date_trunc('second', now()) WHERE id = $1`, t.id); err != nil {
						return false
					}
					if err := insertActivityLog(ctx, tx, projectID, actorID, "payment_triggered",
						"Progress Verified: '"+item.title+"' via Design Phase Handover Approval. Payment Termin '"+t.label+"' is now unlocked."); err != nil {
						return false
					}
				}
			}
		}

		action = "design_verified"
		details = "PM/Owner formally verified and approved the Design Phase."
	case "construction":
		nowCols = append(nowCols, "owner_build_approved_at", "construction_locked_at", "construction_completed_at")
		action = "construction_verified"
		details = "PM/Owner formally verified and approved the Construction Phase."
	case "interior":
		nowCols = append(nowCols, "owner_interior_approved_at", "interior_locked_at", "interior_completed_at")
		action = "interior_verified"
		details = "PM/Owner formally verified and approved the Interior Phase."
	case "legal":
		nowCols = append(nowCols, "owner_legal_approved_at", "legal_locked_at", "legal_completed_at")
		nullCols = append(nullCols, "legal_handover_submitted_at", "legal_handover_notes")
		action = "legal_verified"
		details = "PM/Owner formally verified and approved the Legal Phase."
	default:
		return false
	}

	completed := sortedPhaseList(project["completed_phases"])
	found := false
	for _, item := range completed {
		if item == phase {
			found = true
			break
		}
	}
	if !found {
		completed = append(completed, phase)
		sortStrings(completed)
	}
	encoded, err := jsonphp.Marshal(stringSliceToAny(completed))
	if err != nil {
		return false
	}

	// The design branch can name the same column twice (initial stamp +
	// role stamp); PostgreSQL rejects a repeated assignment target.
	seen := map[string]bool{}
	setParts := make([]string, 0, len(nowCols)+len(nullCols)+2)
	for _, column := range nowCols {
		if seen[column] {
			continue
		}
		seen[column] = true
		setParts = append(setParts, column+" = date_trunc('second', now())")
	}
	for _, column := range nullCols {
		setParts = append(setParts, column+" = NULL")
	}
	setParts = append(setParts, "completed_phases = $2::jsonb", "updated_at = date_trunc('second', now())")

	if _, err := tx.Exec(ctx, `UPDATE projects SET `+strings.Join(setParts, ", ")+` WHERE id = $1`,
		projectID, string(encoded)); err != nil {
		slog.Error("verifyPhase: project update", "error", err)
		return false
	}

	if err := insertActivityLog(ctx, tx, projectID, actorID, action, details); err != nil {
		slog.Error("verifyPhase: activity", "error", err)
		return false
	}

	if err := triggerPaymentForPhaseTx(ctx, tx, projectID, phase, actorID); err != nil {
		slog.Error("verifyPhase: trigger", "error", err, "phase", phase)
		return false
	}

	if err := notifyPhaseProfessional(ctx, tx, projectID, phase); err != nil {
		slog.Warn("handover: notification failed", "error", err)
	}

	return true
}
// triggerPaymentForPhaseTx unblocks the FIRST locked stage of the role.
func triggerPaymentForPhaseTx(ctx context.Context, tx pgx.Tx, projectID int64, phase string, actorID int64) error {
	role := ""
	switch phase {
	case "design":
		role = "arsitek"
	case "construction":
		role = "kontraktor"
	case "interior":
		role = "interior"
	case "legal":
		role = "notaris"
	default:
		return nil
	}

	var terminID int64
	var label string
	err := tx.QueryRow(ctx, `SELECT id, COALESCE(label, '') FROM project_payment_termins
		WHERE project_id = $1 AND role_type::text = $2 AND status::text = 'locked' ORDER BY id LIMIT 1`,
		projectID, role).Scan(&terminID, &label)
	if err != nil {
		if isNoRows(err) {
			return nil
		}
		return err
	}

	if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET status = 'pending',
		updated_at = date_trunc('second', now()) WHERE id = $1`, terminID); err != nil {
		return err
	}

	return insertActivityLog(ctx, tx, projectID, actorID, "payment_unblocked",
		"Payment Termin \""+label+"\" automatically unblocked after phase verification.")
}

// sortStrings sorts in place (PHP's sort()).
func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

// stringSliceToAny renders a []string as a JSON array value.
func stringSliceToAny(values []string) []any {
	out := make([]any, 0, len(values))
	for _, v := range values {
		out = append(out, v)
	}
	return out
}
