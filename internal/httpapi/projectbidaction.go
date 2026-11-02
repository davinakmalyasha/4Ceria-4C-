package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BID ACTIONS — accept-invite, reject-invite, negotiate, confirm-fee.
//
// These four mutate ONE bid row and answer `{"message": ..., "bid": ...}`
// where `bid` is the legacy model's `toArray`: keys in the legacy TABLE
// column order (not the unified table's), decimals as 2dp strings, the
// wire id (legacy id for migrated rows), datetimes as Carbon.
//
// Defects fixed in the oracle first (never smuggled into the port):
//   - rejectInvite's closure missed `use ($request)` → every success 500'd.
//   - rejectInvite wrote `rejection_reason`, which is neither fillable nor
//     a column on any bid table → MassAssignmentException. The update now
//     writes status only; the reason was never persisted anywhere.
//   - negotiateBidFee wrote `selected_services` to every role, but only
//     the notaris bid carries that column → 500 for six roles. Only
//     notaris persists it now.
//   - negotiateBidFee read `$bid->proposed_team` on roles without the
//     column → strict-mode 500 in development (production read null).
//     The team total now runs only where the column exists.

// bidLegacyModels names the Eloquent model per role for firstOrFail 404s.
var bidLegacyModels = map[string]string{
	"arsitek":         `App\Models\BidArsitek`,
	"kontraktor":      `App\Models\BidKontraktor`,
	"notaris":         `App\Models\BidNotaris`,
	"interior":        `App\Models\BidInterior`,
	"structural":      `App\Models\BidStructural`,
	"mep":             `App\Models\BidMep`,
	"project_manager": `App\Models\BidProjectManager`,
}

// bidTypeOrder is the `in:` vocabulary order (config/bids.php key order).
var bidTypeOrder = []string{"arsitek", "kontraktor", "notaris", "interior", "structural", "mep", "project_manager"}

// bidLegacyColumns is the legacy TABLE column order per role — the wire
// key order for the raw bid JSON.
var bidLegacyColumns = map[string][]string{
	"arsitek":         {"id", "project_id", "arsitek_id", "price", "price_max", "negotiation_count", "fee_type", "unit_price", "quantity", "calculated_total", "proposal", "status", "is_recommended", "estimated_duration", "duration_unit", "attachment_1", "attachment_2", "attachment_3", "payment_status", "paid_at", "scopes", "deliverables", "style", "created_at", "updated_at", "offered_by_id", "fee_agreed_at", "payment_proof_path", "verification_notes", "proposed_termins", "proposed_milestones", "proposed_team", "refunded_amount"},
	"kontraktor":      {"id", "project_id", "kontraktor_id", "price", "price_max", "negotiation_count", "fee_type", "unit_price", "quantity", "calculated_total", "proposal", "status", "is_recommended", "estimated_duration", "duration_unit", "attachment_1", "attachment_2", "attachment_3", "construction_method", "cost_breakdown", "workforce_count", "equipment_owned", "warranty_months", "payment_preference", "payment_status", "paid_at", "scopes", "deliverables", "created_at", "updated_at", "offered_by_id", "fee_agreed_at", "payment_proof_path", "verification_notes", "proposed_termins", "proposed_milestones", "proposed_team", "refunded_amount"},
	"notaris":         {"id", "project_id", "notaris_id", "price", "price_max", "negotiation_count", "fee_type", "unit_price", "quantity", "calculated_total", "tax_estimate", "fee_percentage", "proposal", "status", "is_recommended", "estimated_duration", "duration_unit", "attachment_1", "attachment_2", "attachment_3", "payment_status", "paid_at", "selected_services", "created_at", "updated_at", "offered_by_id", "fee_agreed_at", "payment_proof_path", "verification_notes", "proposed_termins", "proposed_milestones", "refunded_amount"},
	"interior":        {"id", "project_id", "interior_id", "price", "price_max", "negotiation_count", "fee_type", "unit_price", "quantity", "calculated_total", "proposal", "scopes", "deliverables", "style", "status", "is_recommended", "estimated_duration", "duration_unit", "payment_status", "paid_at", "attachment_1", "attachment_2", "attachment_3", "created_at", "updated_at", "offered_by_id", "fee_agreed_at", "payment_proof_path", "verification_notes", "proposed_termins", "proposed_milestones", "refunded_amount"},
	"structural":      {"id", "project_id", "structural_id", "license_number", "experience_years", "price", "price_max", "negotiation_count", "fee_type", "unit_price", "quantity", "calculated_total", "proposal", "technical_notes", "status", "is_recommended", "interview_notes", "estimated_duration", "duration_unit", "attachment_1", "attachment_2", "attachment_3", "scopes", "deliverables", "payment_status", "paid_at", "created_at", "updated_at", "offered_by_id", "fee_agreed_at", "payment_proof_path", "verification_notes", "proposed_termins", "proposed_milestones", "refunded_amount"},
	"mep":             {"id", "project_id", "mep_id", "license_number", "experience_years", "price", "price_max", "negotiation_count", "fee_type", "unit_price", "quantity", "calculated_total", "proposal", "technical_notes", "status", "is_recommended", "interview_notes", "estimated_duration", "duration_unit", "attachment_1", "attachment_2", "attachment_3", "scopes", "deliverables", "payment_status", "paid_at", "created_at", "updated_at", "offered_by_id", "fee_agreed_at", "payment_proof_path", "verification_notes", "proposed_termins", "proposed_milestones", "refunded_amount"},
	"project_manager": {"id", "project_id", "pm_id", "price", "price_max", "negotiation_count", "proposal", "status", "estimated_duration", "duration_unit", "attachment_1", "attachment_2", "attachment_3", "fee_type", "unit_price", "quantity", "calculated_total", "scopes", "deliverables", "payment_status", "paid_at", "created_at", "updated_at", "offered_by_id", "fee_agreed_at", "payment_proof_path", "verification_notes", "proposed_termins", "proposed_milestones", "refunded_amount"},
}

var bidDecimalCols = map[string]bool{"price": true, "price_max": true, "unit_price": true, "quantity": true, "calculated_total": true, "tax_estimate": true, "fee_percentage": true, "refunded_amount": true}
var bidArrayCols = map[string]bool{"scopes": true, "deliverables": true, "cost_breakdown": true, "selected_services": true, "proposed_termins": true, "proposed_milestones": true, "proposed_team": true}
var bidTimeCols = map[string]bool{"paid_at": true, "created_at": true, "updated_at": true, "fee_agreed_at": true}
var bidProfileIDCols = map[string]bool{"arsitek_id": true, "kontraktor_id": true, "notaris_id": true, "interior_id": true, "pm_id": true, "structural_id": true, "mep_id": true}

// rawBidObject renders one unified bid row as the legacy model's toArray.
func rawBidObject(role string, fields []string, values []any) *jsonphp.Object {
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	entry := jsonphp.NewObject()

	for _, column := range bidLegacyColumns[role] {
		switch {
		case column == "id":
			entry.Set("id", bidWireID(byName))
		case column == "estimated_duration":
			entry.Set(column, bidDurationRaw(byName["estimated_duration"], role))
		case column == "is_recommended":
			entry.Set(column, boolOrFalse(byName[column]))
		case bidDecimalCols[column]:
			entry.Set(column, decimalOrNilBid(byName, column))
		case bidArrayCols[column]:
			entry.Set(column, jsonOrNil(byName[column]))
		case bidTimeCols[column]:
			entry.Set(column, timeOrNilBid(byName, column))
		case column == "project_id" || column == "negotiation_count" || column == "offered_by_id" || column == "workforce_count" || column == "experience_years" || column == "warranty_months" || bidProfileIDCols[column]:
			entry.Set(column, intOrNilBid(byName, column))
		default:
			entry.Set(column, stringOrNil(byName[column]))
		}
	}

	return entry
}

// bidDurationRaw mirrors the legacy column types: varchar on notaris and
// interior (a string on the wire), integer everywhere else.
func bidDurationRaw(value any, role string) any {
	ptr := intPtrOf(value)
	if ptr == nil {
		return nil
	}
	if role == "notaris" || role == "interior" {
		return strconv.FormatInt(*ptr, 10)
	}
	return *ptr
}

// validateBidType validates `bid_type` with the string rule (confirm,
// invites): required|string|in.
func validateBidType(fields map[string]any, failures *errorBag) (string, bool) {
	raw, present := fields["bid_type"]
	if !present || raw == nil {
		failures.add("bid_type", "The bid type field is required.")
		return "", false
	}

	text, isStr := raw.(string)
	if !isStr {
		failures.add("bid_type", "The bid type field must be a string.")
		failures.add("bid_type", "The selected bid type is invalid.")
		return "", false
	}

	if text == "" {
		failures.add("bid_type", "The bid type field is required.")
		return "", false
	}

	for _, role := range bidTypeOrder {
		if text == role {
			return text, true
		}
	}

	failures.add("bid_type", "The selected bid type is invalid.")
	return "", false
}

// validateBidTypeIn validates `bid_type` with required|in (negotiate: no
// string rule, so a number fails only the `in` rule).
func validateBidTypeIn(fields map[string]any, failures *errorBag) (string, bool) {
	raw, present := fields["bid_type"]
	if !present || raw == nil {
		failures.add("bid_type", "The bid type field is required.")
		return "", false
	}

	if text, isStr := raw.(string); isStr {
		if text == "" {
			failures.add("bid_type", "The bid type field is required.")
			return "", false
		}
		for _, role := range bidTypeOrder {
			if text == role {
				return text, true
			}
		}
	}

	failures.add("bid_type", "The selected bid type is invalid.")
	return "", false
}

// findBid loads one unified bid by (project, role, wire id), preferring
// the legacy hit — the same reference every existing caller names.
func findBid(ctx context.Context, pool *pgxpool.Pool, projectID int64, role, bidRaw string) (fields []string, values []any, found bool, err error) {
	bidID, parseErr := strconv.ParseInt(bidRaw, 10, 64)
	if parseErr != nil {
		return nil, nil, false, nil
	}

	rows, err := pool.Query(ctx, `SELECT * FROM bids WHERE project_id = $1 AND role::text = $2 AND (id = $3 OR legacy_id = $3) ORDER BY CASE WHEN legacy_id = $3 THEN 0 ELSE 1 END LIMIT 1`,
		projectID, role, bidID)
	if err != nil {
		return nil, nil, false, err
	}
	defer rows.Close()

	fields = fieldNames(rows)
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, nil, false, err
		}
		return nil, nil, false, nil
	}

	values, err = scanRow(rows, len(fields))
	if err != nil {
		return nil, nil, false, err
	}

	return fields, values, true, rows.Err()
}

// bidNotFound answers firstOrFail's 404 verbatim (no id suffix).
func bidNotFound(w http.ResponseWriter, role string) {
	model, ok := bidLegacyModels[role]
	if !ok {
		model = `App\Models\Bid`
	}
	message(w, http.StatusNotFound, "No query results for model ["+model+"].")
}

// bidProjectID reads the project route param or 404s like route binding.
func bidProjectID(r *http.Request) (int64, string, bool) {
	raw := r.PathValue("project")
	if raw == "" {
		raw = lastPathSegment(r.URL.Path)
	}

	projectID, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, raw, false
	}

	return projectID, raw, true
}

// bidderUserID mirrors getBidderUserId: the profile row's user, null-safe.
func bidderUserID(ctx context.Context, pool *pgxpool.Pool, role string, bid map[string]any) *int64 {
	column, ok := bidProfileColumn(role)
	if !ok {
		return nil
	}

	profileID := profileID(bid, column)
	if profileID == 0 {
		return nil
	}

	table, ok := bidProfileTable(role)
	if !ok {
		return nil
	}

	var userID *int64
	if err := pool.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, profileID).Scan(&userID); err != nil {
		return nil
	}

	return userID
}

// negotiateParties loads owner, assigned-PM profile, bidder and lead
// professional user ids for the four-party gate.
func negotiateParties(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64, role string, bid map[string]any) (ownerID int64, isPM bool, proUserID *int64, leadArchUserID, leadContUserID *int64, err error) {
	var owner, pm, selArsitek, selKontraktor *int64
	if err = pool.QueryRow(ctx, `SELECT user_id, pm_id, selected_arsitek_id, selected_kontraktor_id FROM projects WHERE id = $1`, projectID).
		Scan(&owner, &pm, &selArsitek, &selKontraktor); err != nil {
		return 0, false, nil, nil, nil, err
	}

	if owner != nil {
		ownerID = *owner
	}

	if pm != nil && *pm != 0 {
		if own, ok := viewer.profiles["project_manager"]; ok && own == *pm {
			isPM = true
		}
	}

	proUserID = bidderUserID(ctx, pool, role, bid)

	if selArsitek != nil && *selArsitek != 0 {
		_ = pool.QueryRow(ctx, `SELECT user_id FROM arsiteks WHERE id = $1`, *selArsitek).Scan(&leadArchUserID)
	}

	if selKontraktor != nil && *selKontraktor != 0 {
		_ = pool.QueryRow(ctx, `SELECT user_id FROM kontraktors WHERE id = $1`, *selKontraktor).Scan(&leadContUserID)
	}

	return ownerID, isPM, proUserID, leadArchUserID, leadContUserID, nil
}

// userMatchesOne reports whether the user is any of the given user ids.
func userMatchesOne(userID int64, ids ...*int64) bool {
	for _, id := range ids {
		if id != nil && *id == userID {
			return true
		}
	}
	return false
}

// AcceptInviteHandler serves `POST /api/projects/{project}/bids/{bid}/accept-invite`.
func AcceptInviteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, projectRaw, ok := bidProjectID(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, projectRaw)
			return
		}

		bidRaw := r.PathValue("bid")
		if bidRaw == "" {
			bidRaw = lastPathSegment(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()
		fields, files, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		_ = files

		failures := &errorBag{}
		role, roleOK := validateBidType(fields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		bidFields, bidValues, found, err := findBid(ctx, pool, projectID, role, bidRaw)
		if err != nil {
			slog.Error("accept-invite: lookup", "error", err)
			serverError(w)
			return
		}
		if !found {
			bidNotFound(w, role)
			return
		}
		_ = roleOK

		bid := map[string]any{}
		for i, column := range bidFields {
			bid[column] = bidValues[i]
		}

		proUserID := bidderUserID(ctx, pool, role, bid)
		if proUserID == nil || caller.UserID() != *proUserID {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		status, _ := bid["status"].(string)
		if status != "invited" {
			message(w, http.StatusUnprocessableEntity, "This invitation is no longer active.")
			return
		}

		var physicalID int64
		if id, ok := bid["id"].(int64); ok {
			physicalID = id
		}

		if _, err := pool.Exec(ctx, `UPDATE bids SET status = 'shortlisted', updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID); err != nil {
			slog.Error("accept-invite: update", "error", err)
			serverError(w)
			return
		}

		refreshed, err := reloadBid(ctx, pool, physicalID)
		if err != nil {
			slog.Error("accept-invite: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Invitation accepted. You are now in the interview phase.")
		payload.Set("bid", rawBidObject(role, refreshed.fields, refreshed.values))

		writeJSON(w, http.StatusOK, payload)
	}
}

// bidFloatOf reads a bid numeric (string, float, int or pg numeric).
func bidFloatOf(value any) float64 {
	if n, ok := value.(pgtype.Numeric); ok {
		if s, ok := numericText(n).(string); ok {
			if parsed, err := strconv.ParseFloat(s, 64); err == nil {
				return parsed
			}
		}
		return 0
	}
	return floatOf(value)
}

// bidRow is one reloaded bid row.
type bidRow struct {
	fields []string
	values []any
}

// reloadBid re-reads one unified bid by physical id.
func reloadBid(ctx context.Context, pool *pgxpool.Pool, physicalID int64) (bidRow, error) {
	rows, err := pool.Query(ctx, `SELECT * FROM bids WHERE id = $1`, physicalID)
	if err != nil {
		return bidRow{}, err
	}
	defer rows.Close()

	fields := fieldNames(rows)
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return bidRow{}, err
		}
		return bidRow{}, errBidGone
	}

	values, err := scanRow(rows, len(fields))
	if err != nil {
		return bidRow{}, err
	}

	return bidRow{fields: fields, values: values}, rows.Err()
}

var errBidGone = bidGoneError{}

type bidGoneError struct{}

func (bidGoneError) Error() string { return "bid row vanished mid-request" }

// RejectInviteHandler serves `POST /api/projects/{project}/bids/{bid}/reject-invite`.
//
// The oracle's closure missed `use ($request)` and wrote a `rejection_reason`
// that is neither fillable nor a column — every success 500'd. Both are
// fixed in the oracle first; the port writes status only.
func RejectInviteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, projectRaw, ok := bidProjectID(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, projectRaw)
			return
		}

		bidRaw := r.PathValue("bid")
		if bidRaw == "" {
			bidRaw = lastPathSegment(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()
		fields, files, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		_ = files

		failures := &errorBag{}
		role, _ := validateBidType(fields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		bidFields, bidValues, found, err := findBid(ctx, pool, projectID, role, bidRaw)
		if err != nil {
			slog.Error("reject-invite: lookup", "error", err)
			serverError(w)
			return
		}
		if !found {
			bidNotFound(w, role)
			return
		}

		bid := map[string]any{}
		for i, column := range bidFields {
			bid[column] = bidValues[i]
		}

		proUserID := bidderUserID(ctx, pool, role, bid)
		if proUserID == nil || caller.UserID() != *proUserID {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		var physicalID int64
		if id, ok := bid["id"].(int64); ok {
			physicalID = id
		}

		if _, err := pool.Exec(ctx, `UPDATE bids SET status = 'rejected', updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID); err != nil {
			slog.Error("reject-invite: update", "error", err)
			serverError(w)
			return
		}

		refreshed, err := reloadBid(ctx, pool, physicalID)
		if err != nil {
			slog.Error("reject-invite: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Invitation rejected.")
		payload.Set("bid", rawBidObject(role, refreshed.fields, refreshed.values))

		writeJSON(w, http.StatusOK, payload)
	}
}

// NegotiateBidFeeHandler serves `POST /api/projects/{project}/bids/{bid}/negotiate`.
func NegotiateBidFeeHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, projectRaw, ok := bidProjectID(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, projectRaw)
			return
		}

		bidRaw := r.PathValue("bid")
		if bidRaw == "" {
			bidRaw = lastPathSegment(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()
		formFields, files, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		_ = files

		// The price rule reads the UNVALIDATED bid_type — mirror that.
		rawBidType, _ := formFields["bid_type"].(string)
		priceRuleMin := rawBidType == "notaris"

		failures := &errorBag{}
		role, _ := validateBidTypeIn(formFields, failures)

		priceText, pricePresent := fieldNumeric(formFields, "price")
		var priceVal float64
		priceOK := false
		if !pricePresent || priceText == "" {
			failures.add("price", "The price field is required.")
		} else if !isNumericText(priceText) {
			failures.add("price", "The price field must be a number.")
			if !priceRuleMin {
				failures.add("price", "The price field must be greater than 0.")
			}
		} else if parsed, err := strconv.ParseFloat(priceText, 64); err != nil {
			failures.add("price", "The price field must be a number.")
			if !priceRuleMin {
				failures.add("price", "The price field must be greater than 0.")
			}
		} else {
			priceVal = parsed
			priceOK = true
			if priceRuleMin {
				if priceVal < 0 {
					failures.add("price", "The price field must be at least 0.")
				}
			} else if priceVal <= 0 {
				failures.add("price", "The price field must be greater than 0.")
			}
		}

		if raw, present := formFields["selected_services"]; present && raw != nil {
			if _, isArr := raw.([]any); !isArr {
				failures.add("selected_services", "The selected services field must be an array.")
			}
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("negotiate: viewer", "error", err)
			serverError(w)
			return
		}

		projectFields, projectValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, projectRaw)
				return
			}
			slog.Error("negotiate: project", "error", err)
			serverError(w)
			return
		}

		bidFields, bidValues, found, err := findBid(ctx, pool, projectID, role, bidRaw)
		if err != nil {
			slog.Error("negotiate: lookup", "error", err)
			serverError(w)
			return
		}
		if !found {
			bidNotFound(w, role)
			return
		}

		bid := map[string]any{}
		for i, column := range bidFields {
			bid[column] = bidValues[i]
		}

		ownerID, isPM, proUserID, leadArch, leadCont, err := negotiateParties(ctx, pool, viewer, projectID, role, bid)
		if err != nil {
			slog.Error("negotiate: parties", "error", err)
			serverError(w)
			return
		}

		if viewer.id != ownerID && !isPM && !userMatchesOne(viewer.id, proUserID, leadArch, leadCont) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		var offeredBy int64
		switch typed := bid["offered_by_id"].(type) {
		case int64:
			offeredBy = typed
		case int32:
			offeredBy = int64(typed)
		case int:
			offeredBy = int64(typed)
		}
		if offeredBy == viewer.id {
			message(w, http.StatusUnprocessableEntity, "You have already made an offer. Please wait for the other party to respond.")
			return
		}

		var negCount int64
		switch typed := bid["negotiation_count"].(type) {
		case int64:
			negCount = typed
		case int32:
			negCount = int64(typed)
		case int:
			negCount = int64(typed)
		}
		if negCount >= 5 {
			message(w, http.StatusUnprocessableEntity, "Negotiation limit reached (max 5 rounds). You can no longer counter-offer, but you can accept the current proposal (\"Agree on Fee\") or decline the bid.")
			return
		}

		bidFeeType, _ := bid["fee_type"].(string)
		bidUnit := bidFloatOf(bid["unit_price"])
		bidQty := bidFloatOf(bid["quantity"])

		projectByName := projectColumnsByName(projectFields, projectValues)
		var budgetText string
		if s, ok := projectByName["budget"].(string); ok {
			budgetText = s
		}
		dimensionsText := projectJSONRaw(projectValues, projectFields, "project_dimensions")

		_, _, calcUnit, calcQty, calcTotal := bidCalculation(bidFeeType, priceVal, bidUnit, bidQty, budgetText, dimensionsText)
		_ = priceOK

		var services []any
		if raw, present := formFields["selected_services"]; present && raw != nil {
			if arr, isArr := raw.([]any); isArr {
				services = arr
			}
		} else if current := jsonOrNil(bid["selected_services"]); current != nil {
			if arr, isArr := current.([]any); isArr {
				services = arr
			}
		}

		servicesTotal := 0.0
		for _, item := range services {
			if m, ok := item.(map[string]any); ok {
				servicesTotal += floatOf(m["price"])
			}
		}

		// The team total runs only where the column exists (arsitek,
		// kontraktor) — everywhere else the oracle reads null.
		teamTotal := 0.0
		if role == "arsitek" || role == "kontraktor" {
			if team := jsonOrNil(bid["proposed_team"]); team != nil {
				if members, isArr := team.([]any); isArr {
					for _, item := range members {
						m, ok := item.(map[string]any)
						if !ok {
							continue
						}
						feeVal := floatOf(m["fee"])
						feeType, _ := m["fee_type"].(string)
						if feeType == "percentage" {
							teamTotal += math.Round((feeVal / 100) * calcTotal)
						} else {
							teamTotal += math.Round(feeVal)
						}
					}
				}
			}
		}

		newTotal := calcTotal + servicesTotal + teamTotal
		if newTotal <= 0 {
			message(w, http.StatusUnprocessableEntity, "Proposed fee must be greater than zero.")
			return
		}

		var physicalID int64
		if id, ok := bid["id"].(int64); ok {
			physicalID = id
		}

		calcPrice := priceVal
		if _, _, cu, cq, ct := bidCalculation(bidFeeType, priceVal, bidUnit, bidQty, budgetText, dimensionsText); true {
			_ = cu
			_ = cq
			calcPrice, calcUnit, calcQty, calcTotal = priceVal, cu, cq, ct
			_ = calcPrice
		}

		if role == "notaris" {
			servicesJSON := "[]"
			if len(services) > 0 {
				if encoded, err := json.Marshal(services); err == nil {
					servicesJSON = string(encoded)
				}
			}
			if _, err := pool.Exec(ctx, `UPDATE bids SET price = $1, calculated_total = $2, selected_services = $3::jsonb, unit_price = $4, quantity = $5, status = 'negotiating', offered_by_id = $6, negotiation_count = $7, fee_agreed_at = NULL, updated_at = date_trunc('second', now()) WHERE id = $8`,
				numText(calcPrice), numText(newTotal), servicesJSON, numText(calcUnit), numText(calcQty), viewer.id, negCount+1, physicalID); err != nil {
				slog.Error("negotiate: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if _, err := pool.Exec(ctx, `UPDATE bids SET price = $1, calculated_total = $2, unit_price = $3, quantity = $4, status = 'negotiating', offered_by_id = $5, negotiation_count = $6, fee_agreed_at = NULL, updated_at = date_trunc('second', now()) WHERE id = $7`,
				numText(calcPrice), numText(newTotal), numText(calcUnit), numText(calcQty), viewer.id, negCount+1, physicalID); err != nil {
				slog.Error("negotiate: update", "error", err)
				serverError(w)
				return
			}
		}

		refreshed, err := reloadBid(ctx, pool, physicalID)
		if err != nil {
			slog.Error("negotiate: reload", "error", err)
			serverError(w)
			return
		}

		var newCount int64
		for i, column := range refreshed.fields {
			if column == "negotiation_count" {
				if ptr := intPtrOf(refreshed.values[i]); ptr != nil {
					newCount = *ptr
				}
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Fee proposal submitted ("+strconv.FormatInt(newCount, 10)+"/5).")
		payload.Set("bid", rawBidObject(role, refreshed.fields, refreshed.values))

		writeJSON(w, http.StatusOK, payload)
	}
}

// rawProjectColumns is the legacy projects table column order — the wire
// key order for a lazily-loaded nested project (confirm-fee touches
// `$bid->project`, which appends the whole model to the bid JSON).
var rawProjectColumns = []string{"id", "user_id", "title", "description", "budget", "lokasi", "jenis_proyek", "owner_id", "selected_arsitek_id", "selected_kontraktor_id", "selected_notaris_id", "selected_interior_id", "pm_id", "structural_id", "mep_id", "structural_approved_at", "mep_approved_at", "status", "published_bidding_roles", "bidding_choices", "target_role", "needed_phases", "completed_phases", "wants_project_manager", "requires_structural", "requires_mep", "requires_interior", "latitude", "longitude", "province", "city", "kecamatan", "kelurahan", "postal_code", "street_name", "design_details", "design_completed_at", "design_authorized_at", "materials_authorized_at", "design_locked_at", "legal_completed_at", "pbg_verified_at", "slf_verified_at", "legal_locked_at", "construction_details", "construction_completed_at", "construction_authorized_at", "construction_locked_at", "construction_brief_status", "construction_brief_revision_notes", "interior_details", "interior_locked_at", "interior_completed_at", "planning_status", "negotiated_fee", "payment_instructions", "planning_submitted_at", "planning_approved_at", "design_payment_verified_at", "construction_payment_verified_at", "interior_payment_verified_at", "arsitek_kickoff_at", "kontraktor_kickoff_at", "pm_audit_notes", "pm_audit_attachments", "architect_notes", "planning_iteration", "project_category", "project_dimensions", "legal_detail", "wants_to_discuss_later", "legal_requirements", "share_token", "attachment", "deadline", "created_at", "updated_at", "design_handover_submitted_at", "construction_handover_submitted_at", "interior_handover_submitted_at", "design_handover_notes", "construction_handover_notes", "interior_handover_notes", "legal_handover_submitted_at", "legal_handover_notes", "final_walkthrough_at", "walkthrough_status", "completed_at", "owner_accepted_at", "owner_acceptance_notes", "owner_design_approved_at", "owner_build_approved_at", "owner_interior_approved_at", "owner_legal_approved_at", "warranty_start_at", "warranty_end_at", "deleted_at"}

var rawProjectFloats = map[string]bool{"latitude": true, "longitude": true}
var rawProjectDecimals = map[string]bool{"budget": true, "negotiated_fee": true}
var rawProjectArrays = map[string]bool{"needed_phases": true, "completed_phases": true, "design_details": true, "construction_details": true, "interior_details": true, "project_dimensions": true, "legal_requirements": true, "published_bidding_roles": true, "bidding_choices": true, "pm_audit_attachments": true}
var rawProjectBools = map[string]bool{"wants_project_manager": true, "requires_structural": true, "requires_mep": true, "requires_interior": true, "wants_to_discuss_later": true}
var rawProjectInts = map[string]bool{"id": true, "user_id": true, "owner_id": true, "selected_arsitek_id": true, "selected_kontraktor_id": true, "selected_notaris_id": true, "selected_interior_id": true, "pm_id": true, "structural_id": true, "mep_id": true}

// rawProjectCarbons is the model's datetime casts (Carbon); the remaining
// *_at columns have no cast and render as MySQL wall strings.
var rawProjectCarbons = map[string]bool{"design_locked_at": true, "construction_locked_at": true, "interior_locked_at": true, "planning_submitted_at": true, "planning_approved_at": true, "design_payment_verified_at": true, "materials_authorized_at": true, "legal_completed_at": true, "legal_locked_at": true, "structural_approved_at": true, "mep_approved_at": true, "pbg_verified_at": true, "slf_verified_at": true, "design_handover_submitted_at": true, "construction_handover_submitted_at": true, "interior_handover_submitted_at": true, "legal_handover_submitted_at": true, "final_walkthrough_at": true, "completed_at": true, "owner_accepted_at": true, "owner_design_approved_at": true, "owner_build_approved_at": true, "owner_interior_approved_at": true, "owner_legal_approved_at": true, "warranty_start_at": true, "warranty_end_at": true, "created_at": true, "updated_at": true, "deleted_at": true}

var rawProjectWalls = map[string]bool{"design_completed_at": true, "design_authorized_at": true, "construction_completed_at": true, "construction_authorized_at": true, "interior_completed_at": true, "construction_payment_verified_at": true, "interior_payment_verified_at": true, "arsitek_kickoff_at": true, "kontraktor_kickoff_at": true}

// rawProjectObject renders one project row as the model's toArray.
func rawProjectObject(fields []string, values []any) *jsonphp.Object {
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	entry := jsonphp.NewObject()

	for _, column := range rawProjectColumns {
		value, present := byName[column]
		if !present {
			entry.Set(column, nil)
			continue
		}

		switch {
		case rawProjectFloats[column]:
			if value == nil {
				entry.Set(column, nil)
			} else {
				entry.Set(column, bidFloatOf(value))
			}
		case rawProjectDecimals[column]:
			entry.Set(column, decimalOrNilBid(byName, column))
		case rawProjectArrays[column]:
			entry.Set(column, jsonOrNil(value))
		case rawProjectBools[column]:
			entry.Set(column, boolOrFalse(value))
		case column == "planning_iteration":
			if ptr := intPtrOf(value); ptr != nil {
				entry.Set(column, *ptr)
			} else {
				entry.Set(column, 0)
			}
		case rawProjectInts[column]:
			entry.Set(column, intOrNilBid(byName, column))
		case rawProjectCarbons[column]:
			entry.Set(column, timeOrNilBid(byName, column))
		case rawProjectWalls[column]:
			entry.Set(column, mysqlWallTime(value))
		case column == "deadline":
			entry.Set(column, mysqlDate(value))
		default:
			entry.Set(column, stringOrNil(value))
		}
	}

	return entry
}

// mysqlWallTime renders a timestamptz as a MySQL wall string.
func mysqlWallTime(value any) any {
	if value == nil {
		return nil
	}
	if typed, ok := value.(time.Time); ok {
		return typed.UTC().Format("2006-01-02 15:04:05")
	}
	return stringOrNil(value)
}

// mysqlDate renders a date as Y-m-d.
func mysqlDate(value any) any {
	if value == nil {
		return nil
	}
	if typed, ok := value.(time.Time); ok {
		return typed.UTC().Format("2006-01-02")
	}
	if s, ok := value.(string); ok && len(s) >= 10 {
		return s[:10]
	}
	return stringOrNil(value)
}

// ConfirmBidFeeHandler serves `POST /api/projects/{project}/bids/{bid}/confirm-fee`.
func ConfirmBidFeeHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, projectRaw, ok := bidProjectID(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, projectRaw)
			return
		}

		bidRaw := r.PathValue("bid")
		if bidRaw == "" {
			bidRaw = lastPathSegment(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()
		formFields, files, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		_ = files

		failures := &errorBag{}
		role, _ := validateBidType(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		bidFields, bidValues, found, err := findBid(ctx, pool, projectID, role, bidRaw)
		if err != nil {
			slog.Error("confirm-fee: lookup", "error", err)
			serverError(w)
			return
		}
		if !found {
			bidNotFound(w, role)
			return
		}

		bid := map[string]any{}
		for i, column := range bidFields {
			bid[column] = bidValues[i]
		}

		var offeredBy int64
		switch typed := bid["offered_by_id"].(type) {
		case int64:
			offeredBy = typed
		case int32:
			offeredBy = int64(typed)
		case int:
			offeredBy = int64(typed)
		}
		if offeredBy == caller.UserID() {
			message(w, http.StatusUnprocessableEntity, "You cannot confirm your own proposal. Wait for the other party.")
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("confirm-fee: viewer", "error", err)
			serverError(w)
			return
		}

		ownerID, isPM, proUserID, leadArch, leadCont, err := negotiateParties(ctx, pool, viewer, projectID, role, bid)
		if err != nil {
			slog.Error("confirm-fee: parties", "error", err)
			serverError(w)
			return
		}

		if viewer.id != ownerID && !isPM && !userMatchesOne(viewer.id, proUserID, leadArch, leadCont) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		status, _ := bid["status"].(string)

		var physicalID int64
		if id, ok := bid["id"].(int64); ok {
			physicalID = id
		}

		if (status == "negotiating" || status == "invited") && (viewer.id == ownerID || isPM) {
			if _, err := pool.Exec(ctx, `UPDATE bids SET fee_agreed_at = date_trunc('second', now()), status = 'shortlisted', updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID); err != nil {
				slog.Error("confirm-fee: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if _, err := pool.Exec(ctx, `UPDATE bids SET fee_agreed_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID); err != nil {
				slog.Error("confirm-fee: update", "error", err)
				serverError(w)
				return
			}
		}

		refreshed, err := reloadBid(ctx, pool, physicalID)
		if err != nil {
			slog.Error("confirm-fee: reload", "error", err)
			serverError(w)
			return
		}

		// `$bid->project` is touched by the owner/PM check above, which
		// lazy-loads the relation onto the model — so the wire bid carries
		// the whole project behind it. The relation is what makes the
		// confirm response the largest of the four.
		projectFields, projectValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("confirm-fee: project", "error", err)
			serverError(w)
			return
		}

		bidObject := rawBidObject(role, refreshed.fields, refreshed.values)
		bidObject.Set("project", rawProjectObject(projectFields, projectValues))

		payload := jsonphp.NewObject()
		payload.Set("message", "Fee agreement confirmed.")
		payload.Set("bid", bidObject)

		writeJSON(w, http.StatusOK, payload)
	}
}
