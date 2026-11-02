package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MARK-PAID — the owner's "I already transferred it" button.
//
// `POST /api/projects/{project}/budget/mark-paid` flips any unpaid row
// to paid and writes the ledger row through the shared escrow guard —
// with NO proof-on-file gate and NO verifying gate, which is what makes
// it the most common real flow and the one that must share deductBudget's
// guarantees: project row lock, affordability, one row per reference.
//
// The request names the legacy bid spellings (`bid_arsitek`, …), which
// the unified `bids` table resolves by (role, legacy-or-physical id).
// Validation answers the standard bag, but every service throw answers
// the bare `{"message"}` envelope — including a missing row, which
// `findOrFail` turns into a 500 generic, never a 404.
//
// WHAT DIFFERS PER TYPE
// ---------------------
//   - bids flip `payment_status` (+`paid_at` unconditionally) and book
//     calculated_total ?? price under a per-role title. pm/structural/
//     mep bids also take the project slot.
//   - addendums flip `status`, touch the project, authorize a linked
//     procurement, finalize a specialist assignment (always active here,
//     consent-checked only on the verify path), and settle a
//     recommended specialist bid with its own ledger row — each with its
//     own insufficient-escrow sentence.
//   - termins flip `status` and book the retention NET with a per-role
//     title (`Paid {Architect,…} Termin: {label}`).
//
// The audit trail is an activity log (`payment_released`, source
// owner_declared) plus a `payment_verified`/`Payment Released`
// notification to the payee — the unified bid row carries
// `bidder_user_id` directly, so no relation walk is needed.

// markPaidTypes is the validator vocabulary in declaration order.
var markPaidTypes = []string{"bid_arsitek", "bid_kontraktor", "bid_notaris", "bid_interior", "bid_structural", "bid_mep", "bid_project_manager", "addendum", "termin"}

// markPaidFQCNs maps the request spelling to the payment model's FQCN.
var markPaidFQCNs = map[string]string{
	"bid_arsitek":         `App\Models\BidArsitek`,
	"bid_kontraktor":      `App\Models\BidKontraktor`,
	"bid_notaris":         `App\Models\BidNotaris`,
	"bid_interior":        `App\Models\BidInterior`,
	"bid_structural":      `App\Models\BidStructural`,
	"bid_mep":             `App\Models\BidMep`,
	"bid_project_manager": `App\Models\BidProjectManager`,
	"addendum":            `App\Models\ProjectAddendum`,
	"termin":              `App\Models\ProjectPaymentTermin`,
}

// markPaidTitles is the per-branch ledger title.
var markPaidTitles = map[string]string{
	"bid_arsitek":         "Paid Architect Base Fee",
	"bid_kontraktor":      "Paid Contractor Base Fee",
	"bid_project_manager": "Paid Project Manager Base Fee",
	"bid_notaris":         "Paid Notaris Base Fee",
	"bid_interior":        "Paid Interior Designer Base Fee",
	"bid_structural":      "Paid Structural Engineer Resource",
	"bid_mep":             "Paid MEP Engineer Resource",
}

// MarkPaidHandler serves
// `POST /api/projects/{project}/budget/mark-paid`.
func MarkPaidHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		rawProject := r.PathValue("project")
		if rawProject == "" {
			rawProject = projectPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(rawProject, 10, 64)
		if err != nil {
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
			slog.Error("markpaid: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("markpaid: project", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)
		if viewer.id != ownerID {
			message(w, http.StatusForbidden, "Unauthorized. Only the project owner can confirm payments.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		payType, payID := validateMarkPaid(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		bySpelling, _, err := registryIDs(ctx, pool)
		if err != nil {
			slog.Error("markpaid: registry", "error", err)
			serverError(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("markpaid: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `SELECT id FROM projects WHERE id = $1 FOR UPDATE`, projectID); err != nil {
			slog.Error("markpaid: lock", "error", err)
			serverError(w)
			return
		}

		var openID int64
		var openTitle string
		if err := tx.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
			message(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		if err := markPaidApply(ctx, tx, pool, bySpelling, projectID, ownerID, viewer, payType, payID); err != nil {
			if mverr, ok := err.(markPaidError); ok {
				message(w, mverr.status, mverr.message)
				return
			}
			slog.Error("markpaid: apply", "error", err)
			message(w, http.StatusInternalServerError, "Failed to process payment tracking.")
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("markpaid: commit", "error", err)
			serverError(w)
			return
		}

		var freshBudget string
		if err := pool.QueryRow(ctx, `SELECT budget::text FROM projects WHERE id = $1`, projectID).Scan(&freshBudget); err != nil {
			slog.Error("markpaid: fresh", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Successfully marked as paid and deducted from budget.")
		payload.Set("budget", freshBudget)

		writeJSON(w, http.StatusOK, payload)
	}
}

// markPaidError carries a service throw: a 422 business sentence.
type markPaidError struct {
	status  int
	message string
}

func (markPaidError) Error() string { return "mark-paid rejected" }

// validateMarkPaid enforces type required|in:9 and id required|integer.
// An integral float passes; `true` passes as 1; `false` fails.
func validateMarkPaid(fields map[string]any, failures *errorBag) (payType string, payID int64) {
	raw, present := fields["type"]
	if !present || raw == nil {
		failures.add("type", "The type field is required.")
	} else if s, isStr := raw.(string); isStr && strings.TrimSpace(s) == "" {
		failures.add("type", "The type field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("type", "The selected type is invalid.")
	} else {
		known := false
		for _, known_ := range markPaidTypes {
			if s == known_ {
				known = true
				break
			}
		}
		if !known {
			failures.add("type", "The selected type is invalid.")
		} else {
			payType = s
		}
	}

	rawID, present := fields["id"]
	if !present || rawID == nil {
		failures.add("id", "The id field is required.")
	} else {
		switch typed := rawID.(type) {
		case string:
			if strings.TrimSpace(typed) == "" {
				failures.add("id", "The id field is required.")
			} else if !isIntegerText(typed) {
				failures.add("id", "The id field must be an integer.")
			} else if parsed, err := strconv.ParseInt(strings.TrimSpace(typed), 10, 64); err != nil {
				failures.add("id", "The id field must be an integer.")
			} else {
				payID = parsed
			}
		case float64:
			if typed != math_Trunc(typed) {
				failures.add("id", "The id field must be an integer.")
			} else {
				payID = int64(typed)
			}
		case bool:
			if typed {
				payID = 1
			} else {
				failures.add("id", "The id field must be an integer.")
			}
		default:
			text, _ := fieldNumeric(fields, "id")
			if text == "" {
				failures.add("id", "The id field is required.")
			} else if !isIntegerText(text) {
				failures.add("id", "The id field must be an integer.")
			} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
				failures.add("id", "The id field must be an integer.")
			} else {
				payID = parsed
			}
		}
	}

	return payType, payID
}

// markPaidApply runs the whole decision inside the caller's transaction.
// Anything unexpected is a plain error (the 500 generic); only the
// oracle's business sentences carry a status.
func markPaidApply(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, bySpelling map[string]int64, projectID, ownerID int64, viewer *projectViewer, payType string, payID int64) error {
	fqcn := markPaidFQCNs[payType]
	registryID, ok := bySpelling[fqcn]
	if !ok {
		return markPaidError{status: 422, message: "The selected type is invalid."}
	}

	var projectTitle string
	if err := tx.QueryRow(ctx, `SELECT title FROM projects WHERE id = $1`, projectID).Scan(&projectTitle); err != nil {
		return err
	}

	// The refund double-charge guard runs before the per-branch lookup:
	// a missing row falls through to the branch 404.
	if state, found, err := markPaidSettlement(ctx, tx, payType, payID, projectID); err != nil {
		return err
	} else if found && state == "refunded" {
		return markPaidError{status: 422, message: "This payment was refunded through dispute arbitration and cannot be charged again. Open a new dispute if the refund itself is disputed."}
	}

	amountMinor, title, refID, payeeID, err := markPaidBranch(ctx, tx, pool, projectID, viewer, payType, payID)
	if err != nil {
		return err
	}

	written, _, err := recordPaymentMinor(ctx, tx, projectID, amountMinor, title, fqcn, refID, registryID, viewer.id, viewer.role)
	if err != nil {
		return err
	}
	if !written {
		return markPaidError{status: 422, message: "Insufficient project budget to record this payment."}
	}

	formatted := "Rp " + formatIDAmount(amountMinor)
	if _, err := tx.Exec(ctx, `INSERT INTO project_activity_logs (project_id, user_id, action, details, created_at, updated_at) VALUES ($1, $2, 'payment_released', $3, date_trunc('second', now()), date_trunc('second', now()))`,
		projectID, viewer.id, title+" ("+formatted+") released by the project owner [source: owner_declared, ref: "+payType+"#"+strconv.FormatInt(payID, 10)+"]."); err != nil {
		return err
	}

	if payeeID != 0 && payeeID != viewer.id {
		data := `{"payment_id": ` + strconv.FormatInt(payID, 10) +
			`, "payment_type": ` + mysqlJSONStr(payType) +
			`, "project_id": ` + strconv.FormatInt(projectID, 10) + `}`
		if _, err := tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at) VALUES ($1, 'payment_verified', 'Payment Released', $2, $3, date_trunc('second', now()), date_trunc('second', now()))`,
			payeeID,
			"The project owner confirmed payment of "+formatted+" for \""+title+"\" on \""+projectTitle+"\".",
			data); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
		return err
	}

	return nil
}

// markPaidSettlement reads the settlement state for the refund guard:
// payment_status for bids, status otherwise. found=false when the row
// is missing (the branch reports the 404-equivalent).
func markPaidSettlement(ctx context.Context, tx pgx.Tx, payType string, payID, projectID int64) (string, bool, error) {
	switch payType {
	case "termin":
		var status *string
		if err := tx.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id = $1 AND project_id = $2`, payID, projectID).Scan(&status); err != nil {
			if isNoRows(err) {
				return "", false, nil
			}
			return "", false, err
		}
		if status == nil {
			return "", true, nil
		}
		return *status, true, nil
	case "addendum":
		var status *string
		if err := tx.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id = $1 AND project_id = $2`, payID, projectID).Scan(&status); err != nil {
			if isNoRows(err) {
				return "", false, nil
			}
			return "", false, err
		}
		if status == nil {
			return "", true, nil
		}
		return *status, true, nil
	default:
		role := markPaidBidRole(payType)
		if role == "" {
			return "", false, nil
		}
		var paymentStatus *string
		if err := tx.QueryRow(ctx, `SELECT payment_status::text FROM bids WHERE role::text = $1 AND (id = $2 OR legacy_id = $2) AND project_id = $3
			ORDER BY CASE WHEN legacy_id = $2 THEN 0 ELSE 1 END, id LIMIT 1`, role, payID, projectID).Scan(&paymentStatus); err != nil {
			if isNoRows(err) {
				return "", false, nil
			}
			return "", false, err
		}
		if paymentStatus == nil {
			return "", true, nil
		}
		return *paymentStatus, true, nil
	}
}

// markPaidBidRole maps the request bid spelling to the unified role.
func markPaidBidRole(payType string) string {
	switch payType {
	case "bid_arsitek":
		return "arsitek"
	case "bid_kontraktor":
		return "kontraktor"
	case "bid_notaris":
		return "notaris"
	case "bid_interior":
		return "interior"
	case "bid_structural":
		return "structural"
	case "bid_mep":
		return "mep"
	case "bid_project_manager":
		return "project_manager"
	}
	return ""
}

// markPaidBranch flips the row, applies the side effects, and returns
// the ledger amount, title, reference id and payee. A missing row is
// the oracle's 500 generic, never a 404.
func markPaidBranch(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID int64, viewer *projectViewer, payType string, payID int64) (int64, string, int64, int64, error) {
	_ = pool

	if role := markPaidBidRole(payType); role != "" {
		return markPaidBid(ctx, tx, projectID, viewer, payType, role, payID)
	}

	switch payType {
	case "termin":
		return markPaidTermin(ctx, tx, projectID, payID)
	case "addendum":
		return markPaidAddendum(ctx, tx, pool, projectID, viewer, payID)
	}

	return 0, "", 0, 0, markPaidError{status: 422, message: "The selected type is invalid."}
}

// markPaidBid flips one bid row to paid.
func markPaidBid(ctx context.Context, tx pgx.Tx, projectID int64, viewer *projectViewer, payType, role string, payID int64) (int64, string, int64, int64, error) {
	var physID int64
	var legacyID *int64
	var paymentStatus *string
	var calculated, price *string
	var bidderUserID, profileID int64
	var profileColumn string
	switch role {
	case "arsitek":
		profileColumn = "arsitek_id"
	case "kontraktor":
		profileColumn = "kontraktor_id"
	case "notaris":
		profileColumn = "notaris_id"
	case "interior":
		profileColumn = "interior_id"
	case "project_manager":
		profileColumn = "pm_id"
	case "structural":
		profileColumn = "structural_id"
	case "mep":
		profileColumn = "mep_id"
	}

	if err := tx.QueryRow(ctx, `SELECT id, legacy_id, payment_status::text, calculated_total::text, price::text, bidder_user_id, `+profileColumn+`
		FROM bids WHERE role::text = $1 AND (id = $2 OR legacy_id = $2) AND project_id = $3
		ORDER BY CASE WHEN legacy_id = $2 THEN 0 ELSE 1 END, id LIMIT 1 FOR UPDATE`,
		role, payID, projectID).Scan(&physID, &legacyID, &paymentStatus, &calculated, &price, &bidderUserID, &profileID); err != nil {
		if isNoRows(err) {
			return 0, "", 0, 0, errMarkPaidGone
		}
		return 0, "", 0, 0, err
	}

	if paymentStatus != nil && *paymentStatus == "paid" {
		return 0, "", 0, 0, markPaidError{status: 422, message: "This payment has already been marked as paid."}
	}

	if _, err := tx.Exec(ctx, `UPDATE bids SET payment_status = 'paid', paid_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, physID); err != nil {
		return 0, "", 0, 0, err
	}

	amountMinor := int64(0)
	if calculated != nil {
		if minor, ok := parseMinor(*calculated); ok {
			amountMinor = minor
		}
	} else if price != nil {
		if minor, ok := parseMinor(*price); ok {
			amountMinor = minor
		}
	}

	refID := physID
	if legacyID != nil {
		refID = *legacyID
	}

	switch payType {
	case "bid_project_manager":
		var projectPM *int64
		_ = tx.QueryRow(ctx, `SELECT pm_id FROM projects WHERE id = $1`, projectID).Scan(&projectPM)
		if projectPM == nil || *projectPM == 0 {
			if _, err := tx.Exec(ctx, `UPDATE projects SET pm_id = $2 WHERE id = $1`, projectID, profileID); err != nil {
				return 0, "", 0, 0, err
			}
		}
	case "bid_structural":
		if _, err := tx.Exec(ctx, `UPDATE projects SET structural_id = $2 WHERE id = $1`, projectID, profileID); err != nil {
			return 0, "", 0, 0, err
		}
	case "bid_mep":
		if _, err := tx.Exec(ctx, `UPDATE projects SET mep_id = $2 WHERE id = $1`, projectID, profileID); err != nil {
			return 0, "", 0, 0, err
		}
	}

	return amountMinor, markPaidTitles[payType], refID, bidderUserID, nil
}

// markPaidTermin flips one termin to paid and prices the retention net.
func markPaidTermin(ctx context.Context, tx pgx.Tx, projectID, payID int64) (int64, string, int64, int64, error) {
	var status *string
	var label, roleType *string
	var amount, net, retention *string
	var recipientID *int64
	if err := tx.QueryRow(ctx, `SELECT status::text, label, role_type, amount::text, net_amount::text, retention_amount::text, recipient_id
		FROM project_payment_termins WHERE id = $1 AND project_id = $2 FOR UPDATE`, payID, projectID).Scan(
		&status, &label, &roleType, &amount, &net, &retention, &recipientID); err != nil {
		if isNoRows(err) {
			return 0, "", 0, 0, errMarkPaidGone
		}
		return 0, "", 0, 0, err
	}

	if status != nil && *status == "paid" {
		return 0, "", 0, 0, markPaidError{status: 422, message: "This payment has already been marked as paid."}
	}

	if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET status = 'paid', paid_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, payID); err != nil {
		return 0, "", 0, 0, err
	}

	roleLabel := "Contractor"
	if roleType != nil {
		switch *roleType {
		case "notaris":
			roleLabel = "Notary"
		case "project_manager", "pm":
			roleLabel = "Project Manager"
		case "arsitek":
			roleLabel = "Architect"
		case "interior":
			roleLabel = "Interior"
		}
	}

	name := ""
	if label != nil {
		name = *label
	}

	var payee int64
	if recipientID != nil {
		payee = *recipientID
	}

	return terminNetMinor(amount, net, retention), "Paid " + roleLabel + " Termin: " + name, payID, payee, nil
}

// markPaidAddendum flips one addendum to paid with the procurement,
// specialist and recommended-bid side effects.
func markPaidAddendum(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID int64, viewer *projectViewer, payID int64) (int64, string, int64, int64, error) {
	var status *string
	var addType, roleType, specialistType, title *string
	var teamMemberID, assignedUserID, procurementID *int64
	var amount *string
	var addUserID *int64
	var recommendedBidID *int64
	var recommendedBidType *string
	if err := tx.QueryRow(ctx, `SELECT status::text, type, role_type, specialist_type, title, team_member_id, assigned_user_id, procurement_request_id, amount::text, user_id, recommended_bid_id, recommended_bid_type::text
		FROM project_addendums WHERE id = $1 AND project_id = $2 FOR UPDATE`, payID, projectID).Scan(
		&status, &addType, &roleType, &specialistType, &title, &teamMemberID, &assignedUserID, &procurementID, &amount, &addUserID, &recommendedBidID, &recommendedBidType); err != nil {
		if isNoRows(err) {
			return 0, "", 0, 0, errMarkPaidGone
		}
		return 0, "", 0, 0, err
	}

	if status != nil && *status == "paid" {
		return 0, "", 0, 0, markPaidError{status: 422, message: "This payment has already been marked as paid."}
	}

	if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = 'paid', paid_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, payID); err != nil {
		return 0, "", 0, 0, err
	}

	name := ""
	if title != nil {
		name = *title
	}
	amountMinor, _ := parseMinor(orEmpty(amount))

	var payee int64
	if addUserID != nil {
		payee = *addUserID
	}

	if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
		return 0, "", 0, 0, err
	}

	if procurementID != nil && *procurementID != 0 {
		if _, err := tx.Exec(ctx, `UPDATE project_procurement_requests SET status = 'authorized', updated_at = date_trunc('second', now()) WHERE id = $1`, *procurementID); err != nil {
			return 0, "", 0, 0, err
		}
	}

	if addType != nil && (*addType == "specialist_assignment" || *addType == "specialist_request") &&
		((teamMemberID != nil && *teamMemberID != 0) || (assignedUserID != nil && *assignedUserID != 0)) {
		if err := markPaidSpecialist(ctx, tx, pool, projectID, viewer, payID, addType, roleType, specialistType, teamMemberID, assignedUserID, amount, name); err != nil {
			return 0, "", 0, 0, err
		}
	}

	if recommendedBidID != nil && *recommendedBidID != 0 && recommendedBidType != nil {
		if err := markPaidRecommended(ctx, tx, pool, projectID, viewer, *recommendedBidID, *recommendedBidType); err != nil {
			return 0, "", 0, 0, err
		}
	}

	return amountMinor, "Paid Addendum: " + name, payID, payee, nil
}

// markPaidSpecialist finalizes a specialist hiring addendum: the record
// is always activated (the consent gate lives on the verify path only),
// the caller is recorded as the assigner, and the project slot takes the
// profile id — or NULL when the specialist has no profile for the role.
func markPaidSpecialist(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID int64, viewer *projectViewer, payID int64, addType, roleType, specialistType *string, teamMemberID, assignedUserID *int64, amount *string, name string) error {
	_ = pool

	subRole := ""
	if specialistType != nil && *specialistType != "" {
		subRole = *specialistType
	} else if roleType != nil {
		subRole = *roleType
	}

	var specialistUserID *int64
	specialistName := ""
	if assignedUserID != nil && *assignedUserID != 0 {
		var userName string
		if err := tx.QueryRow(ctx, `SELECT id, name FROM users WHERE id = $1`, *assignedUserID).Scan(&specialistUserID, &userName); err == nil {
			specialistName = userName
		} else {
			dup := *assignedUserID
			specialistUserID = &dup
		}
	} else if teamMemberID != nil && *teamMemberID != 0 {
		var memberName *string
		_ = tx.QueryRow(ctx, `SELECT name FROM team_members WHERE id = $1`, *teamMemberID).Scan(&memberName)
		if memberName != nil {
			specialistName = *memberName
		}
	}

	if specialistName == "" && specialistUserID == nil {
		return nil
	}

	parentRole := ""
	if roleType != nil {
		parentRole = *roleType
	}

	amountText := "0"
	if amount != nil {
		amountText = *amount
	}

	var subID int64
	var existingSub *int64
	_ = tx.QueryRow(ctx, `SELECT id FROM project_sub_professionals WHERE project_id = $1 AND sub_role = $2 LIMIT 1`, projectID, subRole).Scan(&existingSub)

	if existingSub != nil {
		if _, err := tx.Exec(ctx, `UPDATE project_sub_professionals SET user_id = $2, parent_role = $3, assigned_by = $4, status = 'active', rate = $5::numeric, lead_pro_notes = $6, hired_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`,
			*existingSub, specialistUserID, parentRole, viewer.id, amountText, "Assigned via Paid Addendum: "+specialistName); err != nil {
			return err
		}
		subID = *existingSub
	} else {
		if err := tx.QueryRow(ctx, `INSERT INTO project_sub_professionals (project_id, sub_role, user_id, parent_role, assigned_by, status, rate, lead_pro_notes, hired_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, 'active', $6::numeric, $7, date_trunc('second', now()), date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, subRole, specialistUserID, parentRole, viewer.id, amountText, "Assigned via Paid Addendum: "+specialistName).Scan(&subID); err != nil {
			return err
		}
	}
	_ = subID

	switch subRole {
	case "structural":
		var profileID *int64
		if specialistUserID != nil {
			_ = tx.QueryRow(ctx, `SELECT id FROM structural_engineers WHERE user_id = $1 LIMIT 1`, *specialistUserID).Scan(&profileID)
		}
		if _, err := tx.Exec(ctx, `UPDATE projects SET structural_id = $2 WHERE id = $1`, projectID, profileID); err != nil {
			return err
		}
	case "mep":
		var profileID *int64
		if specialistUserID != nil {
			_ = tx.QueryRow(ctx, `SELECT id FROM mep_engineers WHERE user_id = $1 LIMIT 1`, *specialistUserID).Scan(&profileID)
		}
		if _, err := tx.Exec(ctx, `UPDATE projects SET mep_id = $2 WHERE id = $1`, projectID, profileID); err != nil {
			return err
		}
	case "interior":
		var profileID *int64
		if specialistUserID != nil {
			_ = tx.QueryRow(ctx, `SELECT id FROM interior_profiles WHERE user_id = $1 LIMIT 1`, *specialistUserID).Scan(&profileID)
		}
		if _, err := tx.Exec(ctx, `UPDATE projects SET selected_interior_id = $2 WHERE id = $1`, projectID, profileID); err != nil {
			return err
		}
	}

	return nil
}

// markPaidRecommended settles a recommended specialist bid scoped to this
// project: flip to paid, take the slot, and book the specialist fee with
// its own insufficient-escrow sentence.
func markPaidRecommended(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID int64, viewer *projectViewer, bidID int64, bidType string) error {
	var table, role, column, title, insufficient string
	switch bidType {
	case "structural":
		table, role, column = "bids", "structural", "structural_id"
		title = "Paid Structural Engineer Fee (via specialist addendum)"
		insufficient = "Insufficient project budget to record the structural engineer fee of "
	case "mep":
		table, role, column = "bids", "mep", "mep_id"
		title = "Paid MEP Engineer Fee (via specialist addendum)"
		insufficient = "Insufficient project budget to record the MEP engineer fee of "
	default:
		return nil
	}
	_ = table

	var physID, profileID int64
	var legacyID *int64
	var calculated, price *string
	if err := tx.QueryRow(ctx, `SELECT id, legacy_id, calculated_total::text, price::text, `+column+`
		FROM bids WHERE role::text = $1 AND project_id = $2 AND (id = $3 OR legacy_id = $3)
		ORDER BY CASE WHEN legacy_id = $3 THEN 0 ELSE 1 END, id LIMIT 1 FOR UPDATE`,
		role, projectID, bidID).Scan(&physID, &legacyID, &calculated, &price, &profileID); err != nil {
		if isNoRows(err) {
			return nil
		}
		return err
	}

	refID := physID
	if legacyID != nil {
		refID = *legacyID
	}

	if _, err := tx.Exec(ctx, `UPDATE bids SET payment_status = 'paid', paid_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, physID); err != nil {
		return err
	}

	slot := ""
	switch bidType {
	case "structural":
		slot = "structural_id"
	case "mep":
		slot = "mep_id"
	}
	if _, err := tx.Exec(ctx, `UPDATE projects SET `+slot+` = $2 WHERE id = $1`, projectID, profileID); err != nil {
		return err
	}

	var feeMinor int64
	if calculated != nil {
		if minor, ok := parseMinor(*calculated); ok {
			feeMinor = minor
		}
	} else if price != nil {
		if minor, ok := parseMinor(*price); ok {
			feeMinor = minor
		}
	}

	if feeMinor > 0 {
		fqcn := `App\Models\BidStructural`
		if bidType == "mep" {
			fqcn = `App\Models\BidMep`
		}
		bySpelling, _, err := registryIDs(ctx, pool)
		if err != nil {
			return err
		}
		registryID, ok := bySpelling[fqcn]
		if !ok {
			return markPaidError{status: 422, message: insufficient + "Rp " + formatIDAmount(feeMinor) + "."}
		}
		written, _, err := recordPaymentMinor(ctx, tx, projectID, feeMinor, title, fqcn, refID, registryID, viewer.id, viewer.role)
		if err != nil {
			return err
		}
		if !written {
			return markPaidError{status: 422, message: insufficient + "Rp " + formatIDAmount(feeMinor) + "."}
		}
	}

	return nil
}

// errMarkPaidGone reports a missing payment row: the oracle answers its
// 500 generic, never a 404.
type errMarkPaidGoneT struct{}

func (errMarkPaidGoneT) Error() string { return "mark-paid payment not found" }

var errMarkPaidGone = errMarkPaidGoneT{}
