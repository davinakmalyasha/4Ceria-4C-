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

// PROJECT-MANAGER BIDS — submit, shortlist, hire and decline.
//
// `POST /pm-bids` is the PM's own proposal: role-gated, requires the
// project to be looking for a PM and to have none, and prices the bid
// through the shared calculator (fixed/percentage/unit/sqm). The answer
// is the CREATED model in the model's declared default order —
// `duration_unit`, `status`, `payment_status` come from `$attributes`,
// then the create payload — followed by timestamps and id.
//
// shortlist/accept/decline answer the ProjectResource with the
// controller's own load set: images, milestones, the owner, the four
// hired-role blocks, the PM bids, ratings and the PM block plus five
// counts. Shortlist and accept also load the termin relation; decline
// does not.
//
// ACCEPT WRITES THE PM'S **USER** ID into `projects.pm_id`. The schema
// docblock says the column holds a PROFILE id (Hire::isAssignedPm), and
// every other writer complies — this one does not, and parity means
// reproducing the write, not correcting it behind the oracle's back.

// pmBidDefaults is the model's declared attribute order.
var pmBidDefaults = []string{"duration_unit", "status", "payment_status"}

// pmBidRest is the create payload order.
var pmBidRest = []string{
	"project_id", "pm_id", "price", "fee_type", "unit_price", "quantity",
	"calculated_total", "proposal", "estimated_duration", "scopes", "deliverables",
}

// SubmitPMBidHandler serves `POST /api/projects/{project}/pm-bids`.
func SubmitPMBidHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("pm-bid: viewer", "error", err)
			serverError(w)
			return
		}

		if viewer.role != "project_manager" {
			message(w, http.StatusForbidden, "Only Project Managers can submit this bid.")
			return
		}

		pmProfile, ok := viewer.profiles["project_manager"]
		if !ok || pmProfile == 0 {
			message(w, http.StatusUnprocessableEntity, "Project Manager profile not found.")
			return
		}

		var wantsPM bool
		var projectPM *int64
		var projectBudget *string
		var projectTitle, ownerName string
		var ownerID int64
		if err := pool.QueryRow(ctx, `SELECT wants_project_manager, pm_id, budget::text, title, user_id FROM projects WHERE id = $1`, projectID).
			Scan(&wantsPM, &projectPM, &projectBudget, &projectTitle, &ownerID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("pm-bid: project", "error", err)
			serverError(w)
			return
		}

		if !wantsPM {
			message(w, http.StatusBadRequest, "This project does not require a Project Manager.")
			return
		}
		if projectPM != nil && *projectPM != 0 {
			message(w, http.StatusBadRequest, "This project already has an assigned Project Manager.")
			return
		}

		var existing int64
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM bids WHERE project_id = $1 AND role::text = 'project_manager' AND pm_id = $2`,
			projectID, pmProfile).Scan(&existing); err != nil {
			slog.Error("pm-bid: existing", "error", err)
			serverError(w)
			return
		}
		if existing > 0 {
			message(w, http.StatusBadRequest, "You have already submitted a bid for this project.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		input := validatePMBid(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		budgetText := "0"
		if projectBudget != nil {
			budgetText = *projectBudget
		}
		calc := calculateBid(input.priceText, input.feeType, input.unitPriceText, input.quantityText, budgetText, nil)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("pm-bid: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var bidID int64
		var createdAt, updatedAt any
		if err := tx.QueryRow(ctx, `INSERT INTO bids
			(project_id, role, bidder_user_id, bidder_profile_id, pm_id, price, fee_type, unit_price, quantity, calculated_total,
			 proposal, estimated_duration, duration_unit, scopes, deliverables, status, payment_status, created_at, updated_at)
			VALUES ($1, 'project_manager', $2, $3, $3, $4::numeric, $5, $6::numeric, $7::numeric, $8::numeric,
			 $9, $10, $11, $12::jsonb, $13::jsonb, 'pending', 'unpaid', date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			projectID, viewer.id, pmProfile, calc.priceText, calc.feeType, calc.unitPriceText, calc.quantityText, calc.totalText,
			input.proposal, input.duration, input.durationUnit, input.scopesJSON, input.deliverablesJSON).Scan(&bidID, &createdAt, &updatedAt); err != nil {
			slog.Error("pm-bid: insert", "error", err)
			serverError(w)
			return
		}

		_ = tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, ownerID).Scan(&ownerName)

		if err := insertNotification(ctx, tx, ownerID, "pm_bid_received", "Project Manager Bid Received!",
			ownerDisplayName(ctx, tx, viewer.id)+" has submitted a proposal to manage your project: \""+projectTitle+"\".",
			`{"bid_id": `+strconv.FormatInt(bidID, 10)+`, "project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
			slog.Error("pm-bid: notify", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("pm-bid: commit", "error", err)
			serverError(w)
			return
		}

		bid := jsonphp.NewObject()
		bid.Set("duration_unit", input.durationUnit)
		bid.Set("status", "pending")
		bid.Set("payment_status", "unpaid")
		bid.Set("project_id", projectID)
		bid.Set("pm_id", pmProfile)
		bid.Set("price", calc.priceText)
		bid.Set("fee_type", calc.feeType)
		bid.Set("unit_price", calc.unitPriceText)
		bid.Set("quantity", calc.quantityText)
		bid.Set("calculated_total", calc.totalText)
		bid.Set("proposal", input.proposal)
		bid.Set("estimated_duration", input.duration)
		bid.Set("scopes", jsonOrNil(input.scopesJSON))
		bid.Set("deliverables", jsonOrNil(input.deliverablesJSON))
		bid.Set("updated_at", projectTimeValue(updatedAt))
		bid.Set("created_at", projectTimeValue(createdAt))
		bid.Set("id", bidID)

		payload := jsonphp.NewObject()
		payload.Set("message", "Bid submitted successfully!")
		payload.Set("bid", bid)

		writeJSON(w, http.StatusOK, payload)
	}
}

// ownerDisplayName reads a user's display name.
func ownerDisplayName(ctx context.Context, tx pgx.Tx, userID int64) string {
	var name string
	_ = tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, userID).Scan(&name)
	return name
}

// pmBidInput is the validated submission.
type pmBidInput struct {
	priceText        string
	proposal         string
	duration         int64
	durationUnit     string
	feeType          string
	unitPriceText    string
	quantityText     string
	scopesJSON       *string
	deliverablesJSON *string
}

// validatePMBid enforces price required|numeric|gt:0, proposal
// required|string, estimated_duration nullable|integer, duration_unit
// nullable|string, fee_type nullable|in:fixed,percentage,unit, and the
// unit/quantity numeric mins.
func validatePMBid(fields map[string]any, failures *errorBag) pmBidInput {
	out := pmBidInput{feeType: "fixed", duration: 1, durationUnit: "weeks", unitPriceText: "0.00", quantityText: "0.00"}

	if raw, present := fields["price"]; !present || raw == nil {
		failures.add("price", "The price field is required.")
	} else if text, ok := numericTextOf(raw); !ok || text == "" {
		failures.add("price", "The price field must be a number.")
	} else if !isNumericText(text) {
		failures.add("price", "The price field must be a number.")
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("price", "The price field must be a number.")
	} else if parsed <= 0 {
		failures.add("price", "The price field must be greater than 0.")
	} else {
		out.priceText = strings.TrimSpace(text)
	}

	if raw, present := fields["proposal"]; !present || raw == nil {
		failures.add("proposal", "The proposal field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("proposal", "The proposal field must be a string.")
	} else if s == "" {
		failures.add("proposal", "The proposal field is required.")
	} else {
		out.proposal = s
	}

	if raw, present := fields["estimated_duration"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && text != "" {
			if !isIntegerText(text) {
				failures.add("estimated_duration", "The estimated duration field must be an integer.")
			} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
				failures.add("estimated_duration", "The estimated duration field must be an integer.")
			} else if parsed != 0 {
				out.duration = parsed
			}
		}
	}

	if raw, present := fields["duration_unit"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s != "" {
			out.durationUnit = s
		}
	}

	if raw, present := fields["fee_type"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s != "" {
			if s != "fixed" && s != "percentage" && s != "unit" {
				failures.add("fee_type", "The selected fee type is invalid.")
			} else {
				out.feeType = s
			}
		}
	}

	if raw, present := fields["unit_price"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && text != "" && isNumericText(text) {
			if parsed, err := strconv.ParseFloat(text, 64); err == nil {
				if parsed < 0 {
					failures.add("unit_price", "The unit price field must be at least 0.")
				} else {
					out.unitPriceText = formatMinor(mustMinor(text))
				}
			}
		} else {
			failures.add("unit_price", "The unit price field must be a number.")
		}
	}

	if raw, present := fields["quantity"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && text != "" && isNumericText(text) {
			if parsed, err := strconv.ParseFloat(text, 64); err == nil {
				if parsed < 0 {
					failures.add("quantity", "The quantity field must be at least 0.")
				} else {
					out.quantityText = formatMinor(mustMinor(text))
				}
			}
		} else {
			failures.add("quantity", "The quantity field must be a number.")
		}
	}

	out.scopesJSON = jsonColumnText(fields["scopes"])
	out.deliverablesJSON = jsonColumnText(fields["deliverables"])

	return out
}

// mustMinor parses a decimal that already passed validation.
func mustMinor(text string) int64 {
	minor, _ := parseMinor(strings.TrimSpace(text))
	return minor
}

// jsonColumnText renders a nullable JSON column from the request: a
// string is decoded and re-encoded (the oracle decodes it), an array is
// marshalled, anything else is NULL.
func jsonColumnText(value any) *string {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" || trimmed == "null" {
			return nil
		}
		decoded := decodeJSONValue(trimmed)
		encoded, err := jsonphp.Marshal(decoded)
		if err != nil {
			return nil
		}
		text := string(encoded)
		return &text
	case []any, map[string]any:
		encoded, err := jsonphp.Marshal(typed)
		if err != nil {
			return nil
		}
		text := string(encoded)
		return &text
	default:
		return nil
	}
}

// calcResult is the calculator's output.
type calcResult struct {
	priceText     string
	feeType       string
	unitPriceText string
	quantityText  string
	totalText     string
}

// calculateBid mirrors BidCalculationService::calculate for the fee
// types the PM validator admits.
func calculateBid(priceText, feeType, unitPriceText, quantityText, budgetText string, dimensions map[string]any) calcResult {
	priceMinor := mustMinor(priceText)
	unitMinor := mustMinor(unitPriceText)
	quantityMinor := mustMinor(quantityText)
	budgetMinor := mustMinor(budgetText)
	_ = dimensions

	total := int64(0)
	switch feeType {
	case "percentage":
		if budgetMinor > 0 {
			total = priceMinor * budgetMinor / 10000
		}
	case "unit":
		total = unitMinor * quantityMinor / 100
	case "sqm":
		total = priceMinor
	default:
		total = priceMinor
	}

	return calcResult{
		priceText:     formatMinor(priceMinor),
		feeType:       feeType,
		unitPriceText: formatMinor(unitMinor),
		quantityText:  formatMinor(quantityMinor),
		totalText:     formatMinor(total),
	}
}

// pmBidResourceLoad is the controller's load set for the three decision
// verbs.
func pmBidResourceLoad(withTermins bool) projectLoad {
	return projectLoad{
		images:         true,
		milestones:     true,
		ownerPhone:     false,
		viewerBidRoles: []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager"},
		unscopedBids:   true,
		countRoles:     []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager"},
		hiredPros:      true,
		engineers:      []string{"interior_engineer"},
		pmBlock:        true,
		paymentTermins: withTermins,
		ratings:        true,
		budgetSummary:  true,
	}
}

// PMBidDecisionHandler serves shortlist, accept and decline.
func PMBidDecisionHandler(pool *pgxpool.Pool, verb string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawBid := r.PathValue("bid")
		if rawBid == "" {
			rawBid = pmBidPathID(r.URL.Path)
		}
		bidID, parseErr := strconv.ParseInt(rawBid, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\BidProjectManager`, rawBid)
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
			slog.Error("pm-"+verb+": viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var projectPM *int64
		var projectTitle string
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id, title FROM projects WHERE id = $1`, projectID).
			Scan(&ownerID, &projectPM, &projectTitle); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("pm-"+verb+": project", "error", err)
			serverError(w)
			return
		}

		var bidProject int64
		var status *string
		var bidderUserID, bidderProfileID int64
		if err := pool.QueryRow(ctx, `SELECT project_id, status::text, bidder_user_id, bidder_profile_id
			FROM bids WHERE id = $1 AND role::text = 'project_manager'`, bidID).
			Scan(&bidProject, &status, &bidderUserID, &bidderProfileID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\BidProjectManager`, rawBid)
				return
			}
			slog.Error("pm-"+verb+": bid", "error", err)
			serverError(w)
			return
		}

		if bidProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		if viewer.id != ownerID {
			if verb == "shortlist" {
				message(w, http.StatusForbidden, "Unauthorized. Only project owner can shortlist.")
			} else {
				message(w, http.StatusForbidden, "Unauthorized.")
			}
			return
		}

		current := ""
		if status != nil {
			current = *status
		}

		switch verb {
		case "shortlist":
			if current != "pending" {
				message(w, http.StatusBadRequest, "Bid must be pending to be shortlisted.")
				return
			}
		case "accept":
			if projectPM != nil && *projectPM != 0 {
				message(w, http.StatusBadRequest, "Project already has a Project Manager.")
				return
			}
			if current != "shortlisted" && current != "negotiating" {
				message(w, http.StatusUnprocessableEntity, "You must shortlist or negotiate with this professional first before hiring.")
				return
			}
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("pm-"+verb+": begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		switch verb {
		case "shortlist":
			if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'shortlisted', updated_at = date_trunc('second', now()) WHERE id = $1`, bidID); err != nil {
				slog.Error("pm-shortlist: update", "error", err)
				serverError(w)
				return
			}
			if err := insertNotification(ctx, tx, bidderUserID, "pm_bid_shortlisted", "Proposal Shortlisted!",
				"You have been shortlisted for project \""+projectTitle+"\". The owner wants to discuss your proposal.",
				`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
				slog.Error("pm-shortlist: notify", "error", err)
				serverError(w)
				return
			}
		case "accept":
			// `projects.pm_id` holds the PM's PROFILE id — matching every
			// other writer and `Hire::isAssignedPm`. The oracle used to write
			// the user id here, which no Hire-gated route could match and
			// PostgreSQL's FK rejects; fixed in the oracle first.
			if _, err := tx.Exec(ctx, `UPDATE projects SET pm_id = $2, updated_at = date_trunc('second', now()) WHERE id = $1`, projectID, bidderProfileID); err != nil {
				slog.Error("pm-accept: project", "error", err)
				serverError(w)
				return
			}
			if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'contract_pending', verification_notes = NULL, updated_at = date_trunc('second', now()) WHERE id = $1`, bidID); err != nil {
				slog.Error("pm-accept: bid", "error", err)
				serverError(w)
				return
			}
			if err := insertNotification(ctx, tx, bidderUserID, "pm_hire_initiated", "Hire Initiated!",
				"Congratulations! The owner has initiated your hire for: \""+projectTitle+"\". Please review the SPK and define your payment milestones.",
				`{"bid_id": `+strconv.FormatInt(bidID, 10)+`, "project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
				slog.Error("pm-accept: notify", "error", err)
				serverError(w)
				return
			}
			if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'declined', updated_at = date_trunc('second', now())
				WHERE project_id = $1 AND role::text = 'project_manager' AND id <> $2`, projectID, bidID); err != nil {
				slog.Error("pm-accept: decline others", "error", err)
				serverError(w)
				return
			}
			if err := insertNotification(ctx, tx, bidderUserID, "pm_bid_accepted", "Proposal Accepted!",
				"Congratulations! You have been hired as the Project Manager for: \""+projectTitle+"\".",
				`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
				slog.Error("pm-accept: notify2", "error", err)
				serverError(w)
				return
			}
		case "decline":
			if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'declined', updated_at = date_trunc('second', now()) WHERE id = $1`, bidID); err != nil {
				slog.Error("pm-decline: update", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("pm-"+verb+": commit", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("pm-"+verb+": reload", "error", err)
			serverError(w)
			return
		}

		entry, err := projectResource(ctx, pool, fields, values, viewer, pmBidResourceLoad(verb != "decline"), nil, nil)
		if err != nil {
			slog.Error("pm-"+verb+": render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// pmBidPathID reads the bid segment before the verb.
func pmBidPathID(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := 0; i+1 < len(parts); i++ {
		if parts[i] == "pm-bids" {
			return parts[i+1]
		}
	}
	return lastPathSegment(path)
}
