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

// PAYMENT VERIFICATION — POST
// /api/projects/{project}/payments/{type}/{id}/verify-proof.
//
// The payee confirms (accept) or refuses (reject) a transfer the payer
// uploaded a proof for. Validation answers the standard 422 bag, but every
// service throw answers {status:"error",message} with the exception's own
// code — 400 for a bad type, 403 past the gate, 404 for a missing row,
// 422 for the business guards — exactly like the upload-proof envelope,
// because both go through `SafeError` in the same controller.
//
// WHAT THE GATE AUTHORIZES
// ------------------------
//   - bids: only the bidding professional (the profile's user).
//   - everything else: the assigned PM first (profile-id match, the Hire
//     rule), then per type — termin by recipient (or the hired pro for the
//     role on legacy recipient-less rows), addendum by specialist assignee
//     or any hired pro, material by the supplier's user or the PM.
//     The material and legacy-termin PM checks compare `projects.pm_id`
//     against the USER id — the oracle's own spelling, kept byte for byte.
//
// WHAT REJECT DOES
// -----------------
// Reset the settlement state (bids to `pending`, addendums to
// `approved_unpaid`, everything else to `pending`), stamp the notes, and
// notify the owner. The notification `data` renders in MySQL's
// sorted-key order with a space after each separator.
//
// WHAT ACCEPT DOES
// -----------------
// Flip to paid, write the ledger row through the same escrow guard every
// other payment uses (insufficient escrow 422s), touch the project,
// activate the awaiting bid (termins) or the specialist assignment
// (addendums), and notify both parties. The receipt email is the mailer's
// job — like the release path, the port logs instead of inventing SMTP.
//
// RESPONSE SHAPES
// ---------------
// The answer is the reloaded row: bids in legacy column order with the
// profile block, termins in table order WITHOUT the milestone key (the
// service never eager-loads it — unlike the upload path, which does),
// addendums and materials in table order.

// VerifyProofHandler serves
// `POST /api/projects/{project}/payments/{type}/{id}/verify-proof`.
func VerifyProofHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		paymentType := r.PathValue("type")
		if paymentType == "" {
			paymentType = proofTypeFromPath(r.URL.Path)
		}

		rawID := r.PathValue("id")
		if rawID == "" {
			rawID = verifyIDFromPath(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("verify: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("verify: project", "error", err)
			serverError(w)
			return
		}
		_ = values

		formFields, _, err := requestFields(r)
		if err != nil {
			// An unreadable body carries no fields; the required rule
			// reports that, the same way every other JSON handler does.
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		action, notes, notesSet := validateVerifyProof(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)

		var openID int64
		var openTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
			proofError(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		bySpelling, _, err := registryIDs(ctx, pool)
		if err != nil {
			slog.Error("verify: registry", "error", err)
			serverError(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("verify: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `SELECT id FROM projects WHERE id = $1 FOR UPDATE`, projectID); err != nil {
			slog.Error("verify: lock", "error", err)
			serverError(w)
			return
		}

		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
			proofError(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		target, vrow, err := lockVerifyRow(ctx, tx, pool, projectID, paymentType, rawID)
		if err != nil {
			if verr, ok := err.(proofErrorValue); ok {
				proofError(w, verr.status, verr.message)
				return
			}
			slog.Error("verify: load", "error", err)
			serverError(w)
			return
		}

		if !verifyAuthorized(ctx, tx, viewer, ownerID, target, vrow) {
			proofError(w, http.StatusForbidden, "Unauthorized. You do not have permission to verify this payment.")
			return
		}

		if settled := proofSettled(target.current, target.lifecycle); settled != nil {
			proofError(w, settled.status, settled.message)
			return
		}

		if target.proofPath == "" {
			proofError(w, http.StatusUnprocessableEntity, "No transfer proof on file. The payer must upload a payment proof before this payment can be verified.")
			return
		}

		if target.current == nil || *target.current != "verifying" {
			found := ""
			if target.current != nil {
				found = *target.current
			}
			proofError(w, http.StatusUnprocessableEntity, "This payment is not awaiting verification. Expected status 'verifying' (proof uploaded by the payer), found '"+found+"'.")
			return
		}

		var data *jsonphp.Object
		var msg string

		if action == "reject" {
			if err := rejectVerifyRow(ctx, tx, target, notes, notesSet); err != nil {
				slog.Error("verify: reject", "error", err)
				serverError(w)
				return
			}

			label := verifyLabel(target)
			body := "The professional has rejected your payment proof for \"" + label + "\". Reason: " + rejectReason(notes, notesSet)
			ndata := verifyRejectData(projectID, paymentType, target.refID, notes, notesSet)
			if _, err := tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at) VALUES ($1, 'payment_rejected', 'Payment Proof Rejected', $2, $3, date_trunc('second', now()), date_trunc('second', now()))`,
				ownerID, body, ndata); err != nil {
				slog.Error("verify: notify", "error", err)
				serverError(w)
				return
			}

			msg = "Payment proof rejected. The owner will be notified."
		} else {
			accepted, werr := acceptVerifyRow(ctx, tx, pool, bySpelling, projectID, ownerID, viewer, target, vrow, paymentType)
			if werr != nil {
				if verr, ok := werr.(proofErrorValue); ok {
					proofError(w, verr.status, verr.message)
					return
				}
				slog.Error("verify: accept", "error", werr)
				serverError(w)
				return
			}
			_ = accepted

			msg = "Payment verified successfully."
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("verify: commit", "error", err)
			serverError(w)
			return
		}

		data, err = reloadVerifyRow(ctx, pool, target)
		if err != nil {
			slog.Error("verify: reload", "error", err)
			serverError(w)
			return
		}

		if action == "accept" {
			notifyPaymentVerified(ctx, pool, projectID, target.projectTitle, ownerID, viewer.id, paymentType, target.refID, verifyNotifyLabel(target, paymentType), verifyNotifyMinor(target))
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("message", msg)
		payload.Set("data", data)

		writeJSON(w, http.StatusOK, payload)
	}
}

// verifyIDFromPath reads the segment before a trailing "verify-proof".
func verifyIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] == "verify-proof" && i > 0 {
			return parts[i-1]
		}
	}
	return lastPathSegment(path)
}

// validateVerifyProof enforces `action` required|string|in:accept,reject
// (with the custom `in` message) and `notes` nullable|string|max:1000.
// An empty string reads as missing — `ConvertEmptyStringsToNull` runs
// before validation on the legacy stack.
func validateVerifyProof(fields map[string]any, failures *errorBag) (action string, notes string, notesSet bool) {
	raw, present := fields["action"]
	text := ""
	isStr := false
	if present && raw != nil {
		if s, ok := raw.(string); ok && strings.TrimSpace(s) != "" {
			text, isStr = strings.TrimSpace(s), true
		}
	}

	empty := false
	if s, ok := raw.(string); ok && strings.TrimSpace(s) == "" {
		empty = true
	}

	switch {
	case !present || raw == nil || empty:
		failures.add("action", "The action field is required.")
	case !isStr:
		failures.add("action", "The action field must be a string.")
		failures.add("action", "The action must be either accept or reject.")
	case text != "accept" && text != "reject":
		failures.add("action", "The action must be either accept or reject.")
	default:
		action = text
	}

	if raw, present := fields["notes"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("notes", "The notes field must be a string.")
		} else if s == "" {
			// ConvertEmptyStringsToNull: absent.
		} else if len([]rune(s)) > 1000 {
			failures.add("notes", "The notes field must not be greater than 1000 characters.")
		} else {
			notes, notesSet = s, true
		}
	}

	return action, notes, notesSet
}

// verifyRow is a locked payment row with the fields the gate reads.
type verifyRow struct {
	table     string
	label     *string
	title     *string
	current   *string
	lifecycle *string
	proofPath string
	role      string
	roleType  string
	// refID is the ledger/API id: the legacy id for migrated bids, the
	// physical id otherwise.
	refID int64
	// physID is the physical row id for writes.
	physID       int64
	projectTitle string
}

// verifyTarget carries the resolved payment plus its auth context.
type verifyTarget struct {
	verifyRow
	// bid columns for the accept ledger.
	calculated *string
	price      *string
	amount     *string
	net        *string
	retention  *string
	total      *string
	shipping   *string
}

// lockVerifyRow resolves and locks the payment row: 400 for a bad type,
// 404 when the row is not on this project. Bids resolve by (role,
// legacy-or-physical id), preferring the legacy hit.
func lockVerifyRow(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID int64, short, rawID string) (*verifyTarget, map[string]any, error) {
	_ = pool

	paymentID, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil {
		return nil, nil, proofErrorValue{status: 404, message: "Payment record not found."}
	}

	var title string
	if err := tx.QueryRow(ctx, `SELECT title FROM projects WHERE id = $1`, projectID).Scan(&title); err != nil {
		return nil, nil, err
	}

	target := &verifyTarget{}
	target.projectTitle = title
	target.refID = paymentID

	switch short {
	case "termin", "addendum", "material":
		target.table = map[string]string{"termin": "project_payment_termins", "addendum": "project_addendums", "material": "material_orders"}[short]
	default:
		if _, known := bidShortSet()[short]; !known {
			return nil, nil, proofErrorValue{status: 400, message: "Invalid payment type: " + short}
		}
		target.table = "bids"
		target.role = shortRole(short)
	}

	vrow := map[string]any{}

	switch short {
	case "termin":
		var id, project, recipient, milestone, changeOrder *int64
		var roleType, label, percentage, amount, retention, retentionReleased, net, trigger, status, proofPath, verificationNotes, notes, retentionNotes, refunded *string
		var paidAt, retentionReleasedAt, createdAt, updatedAt any
		err := tx.QueryRow(ctx, `SELECT id, project_id, role_type, recipient_id, label, percentage::text, amount::text, retention_amount::text, retention_released_at, retention_released_amount::text, net_amount::text, trigger_description, status::text, payment_proof_path, verification_notes, milestone_id, change_order_id, paid_at, notes, retention_notes, created_at, updated_at, refunded_amount::text
			  FROM project_payment_termins WHERE id = $1 AND project_id = $2 FOR UPDATE`, paymentID, projectID).Scan(
			&id, &project, &roleType, &recipient, &label, &percentage, &amount, &retention, &retentionReleasedAt, &retentionReleased, &net, &trigger, &status, &proofPath, &verificationNotes, &milestone, &changeOrder, &paidAt, &notes, &retentionNotes, &createdAt, &updatedAt, &refunded)
		if err != nil {
			if isNoRows(err) {
				return nil, nil, proofErrorValue{status: 404, message: "Payment record not found."}
			}
			return nil, nil, err
		}
		target.physID = paymentID
		target.label = label
		if status != nil {
			dup := *status
			target.current = &dup
			target.lifecycle = &dup
		}
		if proofPath != nil {
			target.proofPath = *proofPath
		}
		if roleType != nil {
			target.roleType = *roleType
		}
		target.amount, target.net, target.retention = amount, net, retention
		vrow["recipient_id"] = recipient
		vrow["role_type"] = roleType
		vrow["status"] = status
	case "addendum":
		var id, project, userID, teamMemberID, recommendedBidID, procurementID, assignedUserID *int64
		var addType, roleType, specialistType, addTitle, description, negotiationNote, attachmentPath, amount, counterOffer, recommendedBidType, status, proofPath, verificationNotes, refunded *string
		var paidAt, createdAt, updatedAt any
		err := tx.QueryRow(ctx, `SELECT id, project_id, type, role_type, user_id, team_member_id, specialist_type, title, description, negotiation_note, attachment_path, amount::text, counter_offer_amount::text, recommended_bid_id, recommended_bid_type::text, status::text, payment_proof_path, verification_notes, paid_at, created_at, updated_at, procurement_request_id, assigned_user_id, refunded_amount::text
			  FROM project_addendums WHERE id = $1 AND project_id = $2 FOR UPDATE`, paymentID, projectID).Scan(
			&id, &project, &addType, &roleType, &userID, &teamMemberID, &specialistType, &addTitle, &description, &negotiationNote, &attachmentPath, &amount, &counterOffer, &recommendedBidID, &recommendedBidType, &status, &proofPath, &verificationNotes, &paidAt, &createdAt, &updatedAt, &procurementID, &assignedUserID, &refunded)
		if err != nil {
			if isNoRows(err) {
				return nil, nil, proofErrorValue{status: 404, message: "Payment record not found."}
			}
			return nil, nil, err
		}
		target.physID = paymentID
		target.title = addTitle
		if status != nil {
			dup := *status
			target.current = &dup
			target.lifecycle = &dup
		}
		if proofPath != nil {
			target.proofPath = *proofPath
		}
		if roleType != nil {
			target.roleType = *roleType
		}
		target.amount = amount
		vrow["type"] = addType
		vrow["team_member_id"] = teamMemberID
		vrow["assigned_user_id"] = assignedUserID
		vrow["status"] = status
	case "material":
		var id, userID, supplierID, project *int64
		var status, proofPath, verificationNotes *string
		var total, shipping *string
		err := tx.QueryRow(ctx, `SELECT id, user_id, supplier_id, project_id, status::text, payment_proof_path, verification_notes, total_price::text, shipping_cost::text
			  FROM material_orders WHERE id = $1 AND project_id = $2 FOR UPDATE`, paymentID, projectID).Scan(
			&id, &userID, &supplierID, &project, &status, &proofPath, &verificationNotes, &total, &shipping)
		if err != nil {
			if isNoRows(err) {
				return nil, nil, proofErrorValue{status: 404, message: "Payment record not found."}
			}
			return nil, nil, err
		}
		target.physID = paymentID
		if status != nil {
			dup := *status
			target.current = &dup
			target.lifecycle = &dup
		}
		if proofPath != nil {
			target.proofPath = *proofPath
		}
		target.total, target.shipping = total, shipping
		vrow["supplier_id"] = supplierID
		vrow["status"] = status
	default:
		role := shortRole(short)
		var legacyID *int64
		var status, paymentStatus *string
		var calculated, price *string
		var bidderUserID, bidderProfileID int64
		var proofPath *string
		if err := tx.QueryRow(ctx, `SELECT id, legacy_id, status::text, payment_status::text, calculated_total::text, price::text, payment_proof_path, bidder_user_id, bidder_profile_id
			  FROM bids WHERE role::text = $1 AND (id = $2 OR legacy_id = $2) AND project_id = $3
			 ORDER BY CASE WHEN legacy_id = $2 THEN 0 ELSE 1 END, id LIMIT 1 FOR UPDATE`,
			role, paymentID, projectID).Scan(
			&target.physID, &legacyID, &status, &paymentStatus, &calculated, &price, &proofPath, &bidderUserID, &bidderProfileID); err != nil {
			if isNoRows(err) {
				return nil, nil, proofErrorValue{status: 404, message: "Payment record not found."}
			}
			return nil, nil, err
		}
		if status != nil {
			dup := *status
			target.lifecycle = &dup
		}
		if paymentStatus != nil && *paymentStatus != "" {
			dup := *paymentStatus
			target.current = &dup
		} else {
			target.current = target.lifecycle
		}
		if proofPath != nil {
			target.proofPath = *proofPath
		}
		if legacyID != nil {
			target.refID = *legacyID
		} else {
			target.refID = target.physID
		}
		target.calculated, target.price = calculated, price
		vrow["bidder_user_id"] = bidderUserID
		vrow["bidder_profile_id"] = bidderProfileID
		vrow["status"] = status
	}

	return target, vrow, nil
}

// verifyAssignedPM mirrors `Hire::isAssignedPm`: the caller's PM profile
// against the project's `pm_id` — both profile ids.
func verifyAssignedPM(viewer *projectViewer, pmID *int64) bool {
	if viewer == nil || viewer.role != "project_manager" {
		return false
	}
	if pmID == nil || *pmID == 0 {
		return false
	}
	own, ok := viewer.profiles["project_manager"]
	return ok && own == *pmID
}

// verifyHiredUserID reads the hired profile's user for a role.
func verifyHiredUserID(ctx context.Context, tx pgx.Tx, projectID int64, role string) *int64 {
	var column, table string
	switch role {
	case "arsitek":
		column, table = "selected_arsitek_id", "arsiteks"
	case "kontraktor":
		column, table = "selected_kontraktor_id", "kontraktors"
	case "notaris":
		column, table = "selected_notaris_id", "notaris_profiles"
	case "interior":
		column, table = "selected_interior_id", "interior_profiles"
	case "structural":
		column, table = "structural_id", "structural_engineers"
	case "mep":
		column, table = "mep_id", "mep_engineers"
	default:
		return nil
	}

	var profileID *int64
	if err := tx.QueryRow(ctx, `SELECT `+column+` FROM projects WHERE id = $1`, projectID).Scan(&profileID); err != nil || profileID == nil || *profileID == 0 {
		return nil
	}

	var userID *int64
	if err := tx.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, *profileID).Scan(&userID); err != nil || userID == nil {
		return nil
	}

	return userID
}

// verifyHiredForRole mirrors the service's `isHiredProForRole` — including
// its `project_manager` spelling, which compares `pm_id` against the user
// id rather than the profile.
func verifyHiredForRole(ctx context.Context, tx pgx.Tx, projectID int64, role string, userID int64) bool {
	if role == "project_manager" {
		var pmID *int64
		if err := tx.QueryRow(ctx, `SELECT pm_id FROM projects WHERE id = $1`, projectID).Scan(&pmID); err != nil {
			return false
		}
		return pmID != nil && *pmID == userID
	}

	hired := verifyHiredUserID(ctx, tx, projectID, role)
	return hired != nil && *hired == userID
}

// verifyHiredForAnyRole mirrors `isHiredProForAnyRole`.
func verifyHiredForAnyRole(ctx context.Context, tx pgx.Tx, projectID int64, userID int64) bool {
	for _, role := range []string{"arsitek", "kontraktor", "notaris", "interior", "structural", "mep", "project_manager"} {
		if verifyHiredForRole(ctx, tx, projectID, role, userID) {
			return true
		}
	}
	return false
}

// verifyAuthorized mirrors the service's authorization, branch for branch.
func verifyAuthorized(ctx context.Context, tx pgx.Tx, viewer *projectViewer, ownerID int64, target *verifyTarget, vrow map[string]any) bool {
	short := ""
	switch target.table {
	case "project_payment_termins":
		short = "termin"
	case "project_addendums":
		short = "addendum"
	case "material_orders":
		short = "material"
	default:
		for code := range bidShortSet() {
			if shortRole(code) == target.role && target.table == "bids" {
				short = code
				break
			}
		}
	}

	if _, isBid := bidShortSet()[short]; isBid {
		if bidder, ok := vrow["bidder_user_id"].(int64); ok {
			return viewer.id == bidder
		}
		return false
	}

	var pmID *int64
	projectID := verifyProjectOf(ctx, tx, target)
	_ = tx.QueryRow(ctx, `SELECT pm_id FROM projects WHERE id = $1`, projectID).Scan(&pmID)

	if viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID) {
		return true
	}

	switch short {
	case "addendum":
		addType, _ := vrow["type"].(*string)
		teamMember, _ := vrow["team_member_id"].(*int64)
		assigned, _ := vrow["assigned_user_id"].(*int64)
		isSpecialist := addType != nil && (*addType == "specialist_assignment" || *addType == "specialist_request") &&
			((teamMember != nil && *teamMember != 0) || (assigned != nil && *assigned != 0))
		if isSpecialist {
			if assigned != nil && *assigned != 0 && *assigned == viewer.id {
				return true
			}
			if viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID) {
				return true
			}
			return false
		}
		if viewer.id != ownerID && verifyHiredForAnyRole(ctx, tx, projectID, viewer.id) {
			return true
		}
	case "termin":
		if recipient, ok := vrow["recipient_id"].(*int64); ok && recipient != nil && *recipient != 0 {
			return *recipient == viewer.id
		}
		role := ""
		if r, ok := vrow["role_type"].(*string); ok && r != nil {
			role = *r
		}
		return verifyHiredForRole(ctx, tx, projectID, role, viewer.id)
	case "material":
		if supplier, ok := vrow["supplier_id"].(*int64); ok && supplier != nil && *supplier != 0 {
			var supplierUser *int64
			if err := tx.QueryRow(ctx, `SELECT user_id FROM suppliers WHERE id = $1`, *supplier).Scan(&supplierUser); err == nil && supplierUser != nil && *supplierUser == viewer.id {
				return true
			}
		}
		if viewer.role == "project_manager" {
			var pid *int64
			if err := tx.QueryRow(ctx, `SELECT pm_id FROM projects WHERE id = $1`, projectID).Scan(&pid); err == nil && pid != nil && *pid == viewer.id {
				return true
			}
		}
	}

	return false
}

// verifyProjectOf reads the target's project id for the hired checks.
func verifyProjectOf(ctx context.Context, tx pgx.Tx, target *verifyTarget) int64 {
	var projectID int64
	switch target.table {
	case "project_payment_termins":
		_ = tx.QueryRow(ctx, `SELECT project_id FROM project_payment_termins WHERE id = $1`, target.physID).Scan(&projectID)
	case "project_addendums":
		_ = tx.QueryRow(ctx, `SELECT project_id FROM project_addendums WHERE id = $1`, target.physID).Scan(&projectID)
	case "material_orders":
		_ = tx.QueryRow(ctx, `SELECT project_id FROM material_orders WHERE id = $1`, target.physID).Scan(&projectID)
	default:
		_ = tx.QueryRow(ctx, `SELECT project_id FROM bids WHERE id = $1`, target.physID).Scan(&projectID)
	}
	return projectID
}

// verifyLabel mirrors the reject notification's label fallback.
func verifyLabel(target *verifyTarget) string {
	if target.label != nil {
		return *target.label
	}
	if target.title != nil {
		return *target.title
	}
	return "a payment stage"
}

// rejectReason mirrors `$notes ?: 'No specific reason provided.'`.
func rejectReason(notes string, set bool) string {
	if set && notes != "" {
		return notes
	}
	return "No specific reason provided."
}

// verifyRejectData renders the notification data in MySQL's sorted-key
// order with a space after each separator.
func verifyRejectData(projectID int64, short string, paymentID int64, notes string, set bool) string {
	var noteValue string
	if set {
		noteValue = mysqlJSONStr(notes)
	} else {
		noteValue = "null"
	}
	return `{"notes": ` + noteValue +
		`, "payment_id": ` + strconv.FormatInt(paymentID, 10) +
		`, "project_id": ` + strconv.FormatInt(projectID, 10) +
		`, "payment_type": ` + mysqlJSONStr(short) + `}`
}

// rejectVerifyRow applies the rejection state reset.
func rejectVerifyRow(ctx context.Context, tx pgx.Tx, target *verifyTarget, notes string, set bool) error {
	var noteValue any
	if set {
		noteValue = notes
	}

	switch target.table {
	case "bids":
		if _, err := tx.Exec(ctx, `UPDATE bids SET verification_notes = $2, payment_status = 'pending', updated_at = date_trunc('second', now()) WHERE id = $1`, target.physID, noteValue); err != nil {
			return err
		}
	case "project_payment_termins":
		if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET verification_notes = $2, status = 'pending', updated_at = date_trunc('second', now()) WHERE id = $1`, target.physID, noteValue); err != nil {
			return err
		}
	case "project_addendums":
		if _, err := tx.Exec(ctx, `UPDATE project_addendums SET verification_notes = $2, status = 'approved_unpaid', updated_at = date_trunc('second', now()) WHERE id = $1`, target.physID, noteValue); err != nil {
			return err
		}
	case "material_orders":
		if _, err := tx.Exec(ctx, `UPDATE material_orders SET verification_notes = $2, status = 'pending', updated_at = date_trunc('second', now()) WHERE id = $1`, target.physID, noteValue); err != nil {
			return err
		}
	}

	return nil
}

// verifyBidAmount mirrors `(float)($model->calculated_total ?? $model->price)`.
func verifyBidAmount(target *verifyTarget) int64 {
	if target.calculated != nil {
		if minor, ok := parseMinor(*target.calculated); ok {
			return minor
		}
	}
	if target.price != nil {
		if minor, ok := parseMinor(*target.price); ok {
			return minor
		}
	}
	return 0
}

// verifyAmountMinor is the ledger amount per type: the bid value, the
// retention NET for termins, the gross for addendums, and total+shipping
// for materials.
func verifyAmountMinor(target *verifyTarget) int64 {
	switch target.table {
	case "bids":
		return verifyBidAmount(target)
	case "project_payment_termins":
		var amount, net, retention *string
		amount, net, retention = target.amount, target.net, target.retention
		return terminNetMinor(amount, net, retention)
	case "project_addendums":
		if minor, ok := parseMinor(orEmpty(target.amount)); ok {
			return minor
		}
		return 0
	case "material_orders":
		total, _ := parseMinor(orEmpty(target.total))
		ship, _ := parseMinor(orEmpty(target.shipping))
		return total + ship
	}
	return 0
}

// verifyLedgerTitle mirrors the service's per-type ledger title.
func verifyLedgerTitle(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, target *verifyTarget, short string) string {
	_ = pool
	switch short {
	case "termin":
		label := ""
		if target.label != nil {
			label = *target.label
		}
		return "Payment: " + label + " (" + target.roleType + ")"
	case "addendum":
		title := ""
		if target.title != nil {
			title = *target.title
		}
		return "Payment: " + title
	case "material":
		return "Payment: Material Procurement"
	default:
		name := bidderDisplayName(ctx, tx, short, 0, 0)
		if name == "" {
			name = verifyBidderName(ctx, tx, target)
		}
		return "Professional Fee: " + name
	}
}

// verifyBidderName reads the profile nama, else the user name.
func verifyBidderName(ctx context.Context, tx pgx.Tx, target *verifyTarget) string {
	var profileID, userID int64
	if err := tx.QueryRow(ctx, `SELECT bidder_profile_id, bidder_user_id FROM bids WHERE id = $1`, target.physID).Scan(&profileID, &userID); err != nil {
		return ""
	}

	role, err := parseRoleShort(target.role)
	if err != nil {
		return ""
	}

	if table, ok := bidProfileTable(role); ok && profileID != 0 {
		var nama *string
		_ = tx.QueryRow(ctx, `SELECT nama FROM `+table+` WHERE id = $1`, profileID).Scan(&nama)
		if nama != nil && *nama != "" {
			return *nama
		}
	}

	var userName string
	if err := tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, userID).Scan(&userName); err == nil {
		return userName
	}

	return ""
}

// parseRoleShort maps a unified role back through the identity roles.
func parseRoleShort(role string) (string, error) {
	switch role {
	case "arsitek", "kontraktor", "notaris", "interior", "project_manager", "structural", "mep":
		return role, nil
	}
	return "", errVerifyRole(role)
}

type errVerifyRole string

func (e errVerifyRole) Error() string { return "unknown role: " + string(e) }

// acceptVerifyRow applies the acceptance: state flip, escrow ledger row,
// bid activation, and specialist finalisation. It mirrors
// `verifyProof`'s acceptance branch in the same order.
func acceptVerifyRow(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, bySpelling map[string]int64, projectID, ownerID int64, viewer *projectViewer, target *verifyTarget, vrow map[string]any, short string) (bool, error) {
	fqcn, ok := paymentFQCNs[short]
	if !ok {
		return false, proofErrorValue{status: 400, message: "Invalid payment type: " + short}
	}
	registryID, ok := bySpelling[fqcn]
	if !ok {
		return false, proofErrorValue{status: 400, message: "Invalid payment type: " + short}
	}

	amountMinor := verifyAmountMinor(target)

	if target.table == "bids" {
		if _, err := tx.Exec(ctx, `UPDATE bids SET payment_status = 'paid', status = 'active', paid_at = date_trunc('second', now()), verification_notes = NULL, updated_at = date_trunc('second', now()) WHERE id = $1`, target.physID); err != nil {
			return false, err
		}

		title := verifyLedgerTitle(ctx, tx, pool, target, short)
		written, _, err := recordPaymentMinor(ctx, tx, projectID, amountMinor, title, fqcn, target.refID, registryID, viewer.id, viewer.role)
		if err != nil {
			return false, err
		}
		if !written {
			return false, proofErrorValue{status: 422, message: "Project budget is insufficient for this payment (" + formatIntCommas(amountMinor) + "). Please increase the project budget first."}
		}

		if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			return false, err
		}

		if err := transitionBidProjectStatus(ctx, tx, projectID, short); err != nil {
			return false, err
		}

		return true, nil
	}

	if _, err := tx.Exec(ctx, `UPDATE `+target.table+` SET status = 'paid', verification_notes = NULL, updated_at = date_trunc('second', now()) WHERE id = $1`, target.physID); err != nil {
		return false, err
	}

	if short == "termin" {
		checkAndActivateBid(ctx, tx, projectID, target.projectTitle, target.roleType)
	}

	if short == "addendum" {
		if err := acceptSpecialistAddendum(ctx, tx, pool, projectID, target, vrow); err != nil {
			return false, err
		}
	}

	title := verifyLedgerTitle(ctx, tx, pool, target, short)
	written, available, err := recordPaymentMinor(ctx, tx, projectID, amountMinor, title, fqcn, target.refID, registryID, viewer.id, viewer.role)
	if err != nil {
		return false, err
	}
	if !written {
		return false, proofErrorValue{status: 422, message: "Project budget is insufficient for this payment (" + formatIntCommas(amountMinor) + "). Available: " + formatIntCommas(available) + ". Please increase the project budget first."}
	}

	if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
		return false, err
	}

	// `isset($model->paid_at)`: a stamp already holding a value advances,
	// a NULL stays NULL.
	var hasPaidAt bool
	switch target.table {
	case "project_payment_termins":
		_ = tx.QueryRow(ctx, `SELECT paid_at IS NOT NULL FROM project_payment_termins WHERE id = $1`, target.physID).Scan(&hasPaidAt)
	case "project_addendums":
		_ = tx.QueryRow(ctx, `SELECT paid_at IS NOT NULL FROM project_addendums WHERE id = $1`, target.physID).Scan(&hasPaidAt)
	case "material_orders":
		_ = tx.QueryRow(ctx, `SELECT paid_at IS NOT NULL FROM material_orders WHERE id = $1`, target.physID).Scan(&hasPaidAt)
	}
	if hasPaidAt {
		if _, err := tx.Exec(ctx, `UPDATE `+target.table+` SET paid_at = date_trunc('second', now()) WHERE id = $1`, target.physID); err != nil {
			return false, err
		}
	}

	return true, nil
}

// acceptSpecialistAddendum mirrors the service's specialist-assignment
// finalisation: consent already given activates, otherwise the record is
// created (or left) in the invited state and the specialist is notified.
func acceptSpecialistAddendum(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID int64, target *verifyTarget, vrow map[string]any) error {
	_ = pool

	addType, _ := vrow["type"].(*string)
	teamMember, _ := vrow["team_member_id"].(*int64)
	assigned, _ := vrow["assigned_user_id"].(*int64)

	isSpecialist := addType != nil && (*addType == "specialist_assignment" || *addType == "specialist_request") &&
		((teamMember != nil && *teamMember != 0) || (assigned != nil && *assigned != 0))
	if !isSpecialist {
		return nil
	}

	var roleType, specialistType *string
	var addUserID *int64
	var amount *string
	if err := tx.QueryRow(ctx, `SELECT role_type, specialist_type, user_id, amount::text FROM project_addendums WHERE id = $1`, target.physID).Scan(&roleType, &specialistType, &addUserID, &amount); err != nil {
		return err
	}

	subRole := ""
	if specialistType != nil && *specialistType != "" {
		subRole = *specialistType
	} else if roleType != nil {
		subRole = *roleType
	}

	var specialistUserID *int64
	specialistName := ""
	if assigned != nil && *assigned != 0 {
		var userName string
		if err := tx.QueryRow(ctx, `SELECT id, name FROM users WHERE id = $1`, *assigned).Scan(&specialistUserID, &userName); err == nil {
			specialistName = userName
		} else {
			dup := *assigned
			specialistUserID = &dup
		}
	} else if teamMember != nil && *teamMember != 0 {
		var memberName *string
		_ = tx.QueryRow(ctx, `SELECT name FROM team_members WHERE id = $1`, *teamMember).Scan(&memberName)
		if memberName != nil {
			specialistName = *memberName
		}
	}

	if specialistName == "" && specialistUserID == nil {
		return nil
	}

	var existingID *int64
	var existingStatus *string
	var existingAccepted *string
	_ = tx.QueryRow(ctx, `SELECT id, status::text, accepted_at::text FROM project_sub_professionals WHERE project_id = $1 AND sub_role = $2 LIMIT 1`, projectID, subRole).Scan(&existingID, &existingStatus, &existingAccepted)

	wasAccepted := existingID != nil && (existingStatus != nil && (*existingStatus == "active" || *existingStatus == "accepted") || existingAccepted != nil)

	var parentRole string
	if addUserID != nil {
		var leadRole *string
		_ = tx.QueryRow(ctx, `SELECT role_type FROM users WHERE id = $1`, *addUserID).Scan(&leadRole)
		if leadRole != nil && *leadRole == "kontraktor" {
			parentRole = "kontraktor"
		} else {
			parentRole = "arsitek"
		}
	} else {
		parentRole = "arsitek"
	}

	amountText := "0"
	if amount != nil {
		amountText = *amount
	}

	specialistTitle := "Assigned via Paid Addendum: " + specialistName
	var subID int64

	if wasAccepted {
		if existingID != nil {
			if _, err := tx.Exec(ctx, `UPDATE project_sub_professionals SET user_id = $2, parent_role = $3, assigned_by = $4, status = 'active', rate = $5::numeric, lead_pro_notes = $6, hired_at = date_trunc('second', now()) WHERE id = $1`,
				*existingID, specialistUserID, parentRole, addUserID, amountText, specialistTitle); err != nil {
				return err
			}
			subID = *existingID
		}
	} else if existingID == nil {
		if err := tx.QueryRow(ctx, `INSERT INTO project_sub_professionals (project_id, sub_role, user_id, parent_role, assigned_by, status, rate, lead_pro_notes, hired_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, 'invited', $6::numeric, $7, NULL, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, subRole, specialistUserID, parentRole, addUserID, amountText, specialistTitle).Scan(&subID); err != nil {
			return err
		}
	}

	if wasAccepted && subID != 0 {
		switch subRole {
		case "structural":
			if specialistUserID != nil {
				var profileID *int64
				_ = tx.QueryRow(ctx, `SELECT id FROM structural_engineers WHERE user_id = $1 LIMIT 1`, *specialistUserID).Scan(&profileID)
				if profileID != nil {
					_, _ = tx.Exec(ctx, `UPDATE projects SET structural_id = $2 WHERE id = $1`, projectID, *profileID)
				}
			}
		case "mep":
			if specialistUserID != nil {
				var profileID *int64
				_ = tx.QueryRow(ctx, `SELECT id FROM mep_engineers WHERE user_id = $1 LIMIT 1`, *specialistUserID).Scan(&profileID)
				if profileID != nil {
					_, _ = tx.Exec(ctx, `UPDATE projects SET mep_id = $2 WHERE id = $1`, projectID, *profileID)
				}
			}
		case "interior":
			if specialistUserID != nil {
				var profileID *int64
				_ = tx.QueryRow(ctx, `SELECT id FROM interior_profiles WHERE user_id = $1 LIMIT 1`, *specialistUserID).Scan(&profileID)
				if profileID != nil {
					_, _ = tx.Exec(ctx, `UPDATE projects SET selected_interior_id = $2 WHERE id = $1`, projectID, *profileID)
				}
			}
		}
	} else if specialistUserID != nil && subID != 0 {
		_, _ = tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at)
			VALUES ($1, 'sub_professional_invite', 'New Sub-Professional Invitation', $2, $3, date_trunc('second', now()), date_trunc('second', now()))`,
			*specialistUserID,
			"You have been invited as a "+subRole+" for \""+target.projectTitle+"\".",
			`{"project_id":`+strconv.FormatInt(projectID, 10)+`,"sub_professional_id":`+strconv.FormatInt(subID, 10)+`}`)
	}

	return nil
}

// verifyNotifyLabel mirrors `notifyPaymentVerified`'s label fallback.
func verifyNotifyLabel(target *verifyTarget, short string) string {
	if target.label != nil {
		return *target.label
	}
	if target.title != nil {
		return *target.title
	}
	pretty := strings.ReplaceAll(short, "_", " ")
	if pretty == "" {
		return pretty
	}
	return strings.ToUpper(pretty[:1]) + pretty[1:]
}

// verifyNotifyMinor mirrors the receipt amount: the bid value, the termin
// or addendum amount — and 0 for materials, which carry neither column.
func verifyNotifyMinor(target *verifyTarget) int64 {
	switch target.table {
	case "bids":
		return verifyBidAmount(target)
	case "project_payment_termins", "project_addendums":
		if minor, ok := parseMinor(orEmpty(target.amount)); ok {
			return minor
		}
	}
	return 0
}

// reloadVerifyRow re-reads the payment in its verify-response shape: bids
// with the profile block, termins WITHOUT the milestone key (the service
// never eager-loads it), addendums and materials in table order.
func reloadVerifyRow(ctx context.Context, pool *pgxpool.Pool, target *verifyTarget) (*jsonphp.Object, error) {
	switch target.table {
	case "project_payment_termins":
		return reloadVerifyTermin(ctx, pool, target.physID)
	case "project_addendums":
		rows, err := pool.Query(ctx, `SELECT id, project_id, type, role_type, user_id, team_member_id, specialist_type, title, description, negotiation_note, attachment_path, amount::text, counter_offer_amount::text, recommended_bid_id, recommended_bid_type::text, status::text, payment_proof_path, verification_notes, paid_at, created_at, updated_at, procurement_request_id, assigned_user_id, refunded_amount::text
			FROM project_addendums WHERE id = $1`, target.physID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		if !rows.Next() {
			return nil, proofErrorValue{status: 404, message: "Payment record not found."}
		}
		fields := fieldNames(rows)
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		byName := map[string]any{}
		for i, column := range fields {
			byName[column] = values[i]
		}
		entry := jsonphp.NewObject()
		for _, column := range fields {
			value := byName[column]
			switch column {
			case "amount", "counter_offer_amount", "refunded_amount":
				entry.Set(column, decimalOrNilBid(byName, column))
			case "paid_at", "created_at", "updated_at":
				entry.Set(column, projectTimeValue(value))
			default:
				entry.Set(column, projectRawValue(value))
			}
		}
		return entry, rows.Err()
	case "material_orders":
		return reloadMaterialVerify(ctx, pool, target.physID)
	default:
		rows, err := pool.Query(ctx, `SELECT * FROM bids WHERE id = $1`, target.physID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		if !rows.Next() {
			return nil, proofErrorValue{status: 404, message: "Payment record not found."}
		}
		fields := fieldNames(rows)
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		entry := rawBidObject(target.role, fields, values)
		if key, table, profile, ok := bidRelationKey(target.role, bidMap(fields, values)); ok {
			block, err := budgetProfileBlock(ctx, pool, table, profile, target.role)
			if err != nil {
				return nil, err
			}
			entry.Set(key, block)
		}
		return entry, nil
	}
}

// reloadVerifyTermin renders one termin in table order, without the
// milestone key.
func reloadVerifyTermin(ctx context.Context, pool *pgxpool.Pool, terminID int64) (*jsonphp.Object, error) {
	var id, projectID, recipientID, milestoneID, changeOrderID *int64
	var roleType, label, percentage, amount, retention, retentionReleased, net, trigger, status, proofPath, verificationNotes, notes, retentionNotes, refunded *string
	var paidAt, createdAt, updatedAt, retentionReleasedAt any

	if err := pool.QueryRow(ctx, `SELECT id, project_id, role_type, recipient_id, label, percentage::text, amount::text, retention_amount::text, retention_released_at, retention_released_amount::text, net_amount::text, trigger_description, status::text, payment_proof_path, verification_notes, milestone_id, change_order_id, paid_at, notes, retention_notes, created_at, updated_at, refunded_amount::text
		FROM project_payment_termins WHERE id = $1`, terminID).Scan(
		&id, &projectID, &roleType, &recipientID, &label, &percentage, &amount, &retention, &retentionReleasedAt, &retentionReleased, &net, &trigger, &status, &proofPath, &verificationNotes, &milestoneID, &changeOrderID, &paidAt, &notes, &retentionNotes, &createdAt, &updatedAt, &refunded); err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	entry.Set("id", nullableInt64(id))
	entry.Set("project_id", nullableInt64(projectID))
	entry.Set("role_type", nullableString(roleType))
	entry.Set("recipient_id", nullableInt64(recipientID))
	entry.Set("label", nullableString(label))
	entry.Set("percentage", nullableString(percentage))
	entry.Set("amount", nullableString(amount))
	entry.Set("retention_amount", nullableString(retention))
	entry.Set("retention_released_at", projectTimeValue(retentionReleasedAt))
	entry.Set("retention_released_amount", nullableString(retentionReleased))
	entry.Set("net_amount", nullableString(net))
	entry.Set("trigger_description", nullableString(trigger))
	entry.Set("status", nullableString(status))
	entry.Set("payment_proof_path", nullableString(proofPath))
	entry.Set("verification_notes", nullableString(verificationNotes))
	entry.Set("milestone_id", nullableInt64(milestoneID))
	entry.Set("change_order_id", nullableInt64(changeOrderID))
	entry.Set("paid_at", projectTimeValue(paidAt))
	entry.Set("notes", nullableString(notes))
	entry.Set("retention_notes", nullableString(retentionNotes))
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("updated_at", projectTimeValue(updatedAt))
	entry.Set("refunded_amount", nullableString(refunded))

	return entry, nil
}

// reloadMaterialVerify renders one material order in table order.
func reloadMaterialVerify(ctx context.Context, pool *pgxpool.Pool, orderID int64) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, `SELECT id, user_id, supplier_id, project_id, status, verification_notes, total_price::text, shipping_cost::text, whatsapp_order_id, payment_proof_path, notes, paid_at, ready_for_pickup_at, shipped_at, delivered_at, completed_at, created_at, updated_at, refunded_amount::text, delivery_method, ready_for_pickup_at, latitude, longitude, delivery_address, address_detail, delivery_documentation_path, is_stock_decremented, total_weight::text
		FROM material_orders WHERE id = $1`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, proofErrorValue{status: 404, message: "Payment record not found."}
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	entry := jsonphp.NewObject()
	for _, column := range fields {
		value := byName[column]
		switch column {
		case "total_price", "shipping_cost", "refunded_amount", "total_weight":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "paid_at", "shipped_at", "delivered_at", "completed_at", "created_at", "updated_at", "ready_for_pickup_at":
			entry.Set(column, projectTimeValue(value))
		case "is_stock_decremented":
			entry.Set(column, tinyInt(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	return entry, nil
}
