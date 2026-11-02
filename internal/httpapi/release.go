package httpapi

import (
	"context"
	"log/slog"

	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE RELEASE PATH
// ----------------
// `release_payment` is dispute arbitration settling the linked payment:
// `PaymentVerificationService::verifyProof` with the admin override. The
// override skips ONLY the payee/PM authorization and the proof-on-file
// gates — the freeze (already inside an open dispute by design), the
// terminal/lifecycle guards, the budget check, the ledger write, the bid
// activation and the notifications all still run.
//
// It is implemented here rather than in money.go because it is arbitration
// flow (close the dispute, log, notify) wrapped around a payment, not a
// ledger primitive.
//
// WHAT DIFFERS FROM A NORMAL VERIFY
// ----------------------------------
// verifyProof's non-admin path enforces proof-on-file, `verifying` status
// and payee/PM authorization. The arbitration path skips exactly those
// three; everything else is the same code Laravel runs, in the same order.

// releaseTarget is a linked payment row read for release.
// errPaymentInvalid reports a type the switch does not know —
// `getModel` throws 400 `Invalid payment type: X`.
type errPaymentInvalid struct{ short string }

func (e *errPaymentInvalid) Error() string { return "Invalid payment type: " + e.short }

// terminNetMinor is `RetentionService::forTermin`: the persisted split, the
// half-written repair, or the gross for pre-retention rows.
func terminNetMinor(amount, net, retention *string) int64 {
	gross, _ := parseMinor(orEmpty(amount))
	netMinor, _ := parseMinor(orEmpty(net))
	retentionMinor, _ := parseMinor(orEmpty(retention))

	if netMinor <= 0 && retentionMinor > 0 {
		return gross - retentionMinor
	}

	if netMinor <= 0 && retentionMinor <= 0 {
		return gross
	}

	return netMinor
}

func orEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// paidTotalMinor is `paidTotalMoney`: every disbursement type nets into one
// sum, so a refund frees the escrow again instead of consuming it twice.
func paidTotalMinor(ctx context.Context, tx pgx.Tx, projectID int64) (int64, error) {
	var total int64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE((SUM(amount) * 100)::bigint, 0)
		  FROM project_budget_transactions
		 WHERE project_id = $1
		   AND transaction_type::text IN ('payment', 'refund', 'platform_fee', 'retention_release')
	`, projectID).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

// recordPaymentMinor is `deductBudget` + `recordPayment` for a `payment`:
// dedupe on the reference, lock the project, check the escrow fits, write
// the row, touch. The platform fee is a no-op at the default 0% (its own
// primitive, like the mailer, is a separate port).
//
// Returns (written, availableMinor, error). written=false means the escrow
// cannot cover it — the caller throws the insufficient message.
func recordPaymentMinor(ctx context.Context, tx pgx.Tx, projectID, amountMinor int64,
	title, refFQCN string, refID int64, refRegistryID int64,
	actorID int64, actorRole string) (bool, int64, error) {
	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT exists(
			SELECT 1 FROM project_budget_transactions
			 WHERE project_id = $1 AND reference_id = $2
			   AND transaction_type = 'payment' AND reference_type_id = $3
		)
	`, projectID, refID, refRegistryID).Scan(&exists); err != nil {
		return false, 0, err
	}
	if exists {
		// Double-charge protection: the row is already there. The legacy
		// code ALSO matches the short spelling for rows written before the
		// FQCN normalisation; PG rows only ever carry the registry id.
		// Written=true: the unique index is the real guarantee, and a
		// concurrent verify that lost the race still reports success.
		return true, 0, nil
	}

	var lockedBudget string
	if err := tx.QueryRow(ctx,
		`SELECT budget::text FROM projects WHERE id = $1 FOR UPDATE`, projectID,
	).Scan(&lockedBudget); err != nil {
		return false, 0, err
	}

	budgetMinor, _ := parseMinor(lockedBudget)
	paid, err := paidTotalMinor(ctx, tx, projectID)
	if err != nil {
		return false, 0, err
	}
	available := budgetMinor - paid

	if available < amountMinor {
		return false, available, nil
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO project_budget_transactions
			(project_id, transaction_type, amount, title,
			 reference_type_id, reference_id, transaction_date,
			 actor_user_id, actor_role)
		VALUES ($1, 'payment', $2, $3, $4, $5, date_trunc('second', now()), $6, $7)
	`, projectID, formatMinor(amountMinor), title, refRegistryID, refID, actorID, actorRole); err != nil {
		return false, 0, err
	}

	return true, available - amountMinor, nil
}

// formatIntCommas renders `number_format($n)`: thousands with commas.
func formatIntCommas(minor int64) string {
	negative := minor < 0
	if negative {
		minor = -minor
	}

	whole := minor / 100
	digits := formatInt(whole)

	var grouped []byte
	for i, c := range []byte(digits) {
		if i > 0 && (len(digits)-i)%3 == 0 {
			grouped = append(grouped, ',')
		}
		grouped = append(grouped, c)
	}

	if negative {
		return "-" + string(grouped)
	}
	return string(grouped)
}

// formatIDAmount renders `number_format($amount, 0, ',', '.')`: thousands
// with dots — the payer receipt figure.
func formatIDAmount(minor int64) string {
	negative := minor < 0
	if negative {
		minor = -minor
	}

	whole := formatInt(minor / 100)
	var grouped []byte
	for i, c := range []byte(whole) {
		if i > 0 && (len(whole)-i)%3 == 0 {
			grouped = append(grouped, '.')
		}
		grouped = append(grouped, c)
	}

	if negative {
		return "-" + string(grouped)
	}
	return string(grouped)
}

// notifyPaymentVerified mirrors the service: the payer (owner) always hears
// (`Payment Verified`), the verifier hears unless they are the payer
// (`Payment Confirmed`). The receipt email is the mailer's job — Laravel
// queues it so the API never blocks on it — so Go logs the send instead of
// inventing an SMTP path.
func notifyPaymentVerified(ctx context.Context, pool *pgxpool.Pool, projectID int64,
	projectTitle string, ownerID, payeeID int64, short string, paymentID int64,
	label string, amountMinor int64) {
	formatted := "Rp " + formatIDAmount(amountMinor)
	data := `{"payment_id": ` + formatInt(paymentID) +
		`, "payment_type": ` + mysqlJSONStr(short) +
		`, "project_id": ` + formatInt(projectID) + `}`

	if _, err := pool.Exec(ctx, `
		INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at)
		VALUES ($1, 'payment_verified', 'Payment Verified', $2, $3, date_trunc('second', now()), date_trunc('second', now()))
	`, ownerID,
		"Your "+formatted+" payment for \""+label+"\" on \""+projectTitle+"\" has been verified.",
		data); err != nil {
		slog.Error("release: payer notify", "error", err)
	}

	if payeeID != ownerID {
		if _, err := pool.Exec(ctx, `
			INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at)
			VALUES ($1, 'payment_verified', 'Payment Confirmed', $2, $3, date_trunc('second', now()), date_trunc('second', now()))
		`, payeeID,
			"The "+formatted+" payment for \""+label+"\" has been confirmed by the payer.",
			data); err != nil {
			slog.Error("release: payee notify", "error", err)
		}
	}

	slog.Info("release: receipt email skipped (no mailer)",
		"project", projectID, "label", label, "amount", formatted)
}

// transitionBidProjectStatus mirrors the service: an arsitek acceptance
// moves an open project to accepted_arsitek; a kontraktor acceptance moves
// an accepted_arsitek (or kontraktor-targeted) project to in_progress,
// otherwise to accepted_kontraktor.
func transitionBidProjectStatus(ctx context.Context, tx pgx.Tx, projectID int64, short string) error {
	var status string
	var targetRole *string
	if err := tx.QueryRow(ctx,
		`SELECT status::text, target_role FROM projects WHERE id = $1`, projectID,
	).Scan(&status, &targetRole); err != nil {
		return err
	}

	target := ""
	if targetRole != nil {
		target = *targetRole
	}

	switch short {
	case "arsitek_bid":
		if status == "open" {
			_, err := tx.Exec(ctx, `UPDATE projects SET status = 'accepted_arsitek' WHERE id = $1`, projectID)
			return err
		}
	case "kontraktor_bid":
		if status == "accepted_arsitek" || target == "kontraktor" {
			_, err := tx.Exec(ctx, `UPDATE projects SET status = 'in_progress' WHERE id = $1`, projectID)
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE projects SET status = 'accepted_kontraktor' WHERE id = $1`, projectID)
		return err
	}

	return nil
}

// checkAndActivateBid mirrors the service for the termin just paid: flip an
// `awaiting_payment` bid for the role to `accepted`, take the project
// slot from the bid's profile id, and activate consenting
// sub-professionals with a notification each. No awaiting bid — the common
// arbitration case — is a no-op.
func checkAndActivateBid(ctx context.Context, tx pgx.Tx, projectID int64, projectTitle, terminRole string) {
	role, err := identity.ParseRole(terminRole)
	if err != nil {
		return
	}

	// The unified `bids` profile columns are NOT the project slot names:
	// `kontraktor_id`, not `selected_kontraktor_id` (the slot map,
	// `ProjectColumnFor`, names the projects side).
	var bidColumn string
	switch role {
	case identity.RoleArsitek:
		bidColumn = "arsitek_id"
	case identity.RoleKontraktor:
		bidColumn = "kontraktor_id"
	case identity.RoleNotaris:
		bidColumn = "notaris_id"
	case identity.RoleInterior:
		bidColumn = "interior_id"
	case identity.RoleStructural:
		bidColumn = "structural_id"
	case identity.RoleMep:
		bidColumn = "mep_id"
	case identity.RoleProjectManager:
		bidColumn = "pm_id"
	default:
		return
	}

	slotColumn, ok := identity.ProjectColumnFor(role)
	if !ok {
		return
	}

	var bidID, profileID int64
	if err := tx.QueryRow(ctx, `
		SELECT id, `+bidColumn+` FROM bids
		 WHERE project_id = $1 AND role::text = $2 AND status::text = 'awaiting_payment'
		 LIMIT 1
	`, projectID, role.String()).Scan(&bidID, &profileID); err != nil {
		if !isNoRows(err) {
			slog.Error("release: awaiting bid", "error", err)
		}
		return
	}

	if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'accepted' WHERE id = $1`, bidID); err != nil {
		slog.Error("release: activate bid", "error", err)
		return
	}

	if _, err := tx.Exec(ctx,
		`UPDATE projects SET `+string(slotColumn)+` = $2 WHERE id = $1`, projectID, profileID); err != nil {
		slog.Error("release: take slot", "error", err)
		return
	}

	subRows, err := tx.Query(ctx, `
		SELECT id, user_id, sub_role FROM project_sub_professionals
		 WHERE project_id = $1 AND parent_role::text = $2
		   AND status::text IN ('invited', 'accepted')
	`, projectID, role.String())
	if err != nil {
		slog.Error("release: subs", "error", err)
		return
	}
	defer subRows.Close()

	for subRows.Next() {
		var subID, subUserID int64
		var subRole string
		if err := subRows.Scan(&subID, &subUserID, &subRole); err != nil {
			continue
		}

		if _, err := tx.Exec(ctx, `
			UPDATE project_sub_professionals
			   SET status = 'active',
			       accepted_at = COALESCE(accepted_at, date_trunc('second', now())),
			       hired_at = date_trunc('second', now())
			 WHERE id = $1
		`, subID); err != nil {
			slog.Error("release: activate sub", "error", err)
			continue
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at)
			VALUES ($1, 'sub_professional_activated', 'Project Assignment Active', $2, $3, date_trunc('second', now()), date_trunc('second', now()))
		`, subUserID,
			"The first payment has been verified! You are now active on project \""+projectTitle+"\" as a "+subRole+".",
			`{"project_id":`+formatInt(projectID)+`,"sub_professional_id":`+formatInt(subID)+`}`); err != nil {
			slog.Error("release: sub notify", "error", err)
		}
	}
}
