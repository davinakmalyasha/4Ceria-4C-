package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROPOSE FEE — the counter-offer round.
//
// The bidder (or the owner) proposes a new price, fee structure, payment plan,
// milestones, services and team; the service recomputes the total, snapshots
// the previous round into `bid_negotiation_logs`, and moves the bid to
// `negotiating`. The payment plan must total exactly 100%.

// feeProposal is the validated payload.
type feeProposal struct {
	bidID       int64
	bidType     string
	priceText   string
	price       float64
	feeType     string
	note        *string
	termins     []map[string]any
	milestones  []map[string]any
	hasMilestones bool
	services    []map[string]any
	hasServices bool
	team        []map[string]any
	hasTeam     bool
	length      *float64
	width       *float64
}

// numericArrayItem reads a JSON object from a decoded array.
func numericArrayItem(raw any) (map[string]any, bool) {
	item, ok := raw.(map[string]any)
	return item, ok
}

// validateFeeProposal enforces the rules in declaration order. Nested errors
// use Laravel's dotted keys (`proposed_termins.0.percentage`).
func validateFeeProposal(fields map[string]any, failures *errorBag) feeProposal {
	var input feeProposal

	if raw, present := fields["bid_id"]; !present || raw == nil {
		failures.add("bid_id", "The bid id field is required.")
	} else {
		text, ok := numericTextOf(raw)
		parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
		if !ok || err != nil {
			failures.add("bid_id", "The bid id field must be an integer.")
		} else {
			input.bidID = parsed
		}
	}

	validRoles := []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager", "structural", "mep"}
	if raw, present := fields["bid_type"]; !present || raw == nil {
		failures.add("bid_type", "The bid type field is required.")
	} else if text, ok := raw.(string); !ok {
		failures.add("bid_type", "The selected bid type is invalid.")
	} else {
		valid := false
		for _, role := range validRoles {
			if text == role {
				valid = true
				break
			}
		}
		if !valid {
			failures.add("bid_type", "The selected bid type is invalid.")
		} else {
			input.bidType = text
		}
	}

	// price: notaris allows 0; everyone else must be > 0.
	if raw, present := fields["price"]; !present || raw == nil {
		failures.add("price", "The price field is required.")
	} else if text, ok := numericTextOf(raw); !ok || !isNumericText(text) {
		failures.add("price", "The price field must be a number.")
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("price", "The price field must be a number.")
	} else if input.bidType == "notaris" {
		if parsed < 0 {
			failures.add("price", "The price field must be at least 0.")
		} else {
			input.priceText, input.price = text, parsed
		}
	} else if parsed <= 0 {
		failures.add("price", "The price field must be greater than 0.")
	} else {
		input.priceText, input.price = text, parsed
	}

	if raw, present := fields["fee_type"]; present && raw != nil {
		text, ok := raw.(string)
		if !ok {
			failures.add("fee_type", "The selected fee type is invalid.")
		} else {
			valid := text == "fixed" || text == "percentage" || text == "unit" || text == "sqm" || text == "hourly"
			if !valid {
				failures.add("fee_type", "The selected fee type is invalid.")
			} else {
				input.feeType = text
			}
		}
	}

	if raw, present := fields["note"]; present && raw != nil {
		if text, ok := raw.(string); ok {
			input.note = &text
		} else {
			failures.add("note", "The note field must be a string.")
		}
	}

	// proposed_termins: required array.
	if raw, present := fields["proposed_termins"]; !present || raw == nil {
		failures.add("proposed_termins", "The proposed termins field is required.")
	} else if list, ok := raw.([]any); !ok {
		failures.add("proposed_termins", "The proposed termins field must be an array.")
	} else {
		input.termins = make([]map[string]any, 0, len(list))
		for index, item := range list {
			termin, ok := numericArrayItem(item)
			prefix := "proposed_termins." + strconv.Itoa(index)
			if !ok {
				failures.add(prefix, "The "+prefix+" field must be an object.")
				continue
			}
			if value, present := termin["percentage"]; !present || value == nil {
				failures.add(prefix+".percentage", "The "+prefix+".percentage field is required.")
			} else if text, ok := numericTextOf(value); !ok || !isNumericText(text) {
				failures.add(prefix+".percentage", "The "+prefix+".percentage field must be a number.")
			} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
				failures.add(prefix+".percentage", "The "+prefix+".percentage field must be a number.")
			} else if parsed < 0 || parsed > 100 {
				failures.add(prefix+".percentage", "The "+prefix+".percentage field must be between 0 and 100.")
			}
			if value, present := termin["trigger_description"]; !present || value == nil || (func() bool {
				text, ok := value.(string)
				return ok && strings.TrimSpace(text) == ""
			}()) {
				failures.add(prefix+".trigger_description", "The "+prefix+".trigger_description field is required.")
			} else if _, ok := value.(string); !ok {
				failures.add(prefix+".trigger_description", "The "+prefix+".trigger_description field must be a string.")
			}
			if value, present := termin["milestone_index"]; present && value != nil {
				text, ok := numericTextOf(value)
				if _, err := strconv.Atoi(strings.TrimSpace(text)); !ok || err != nil {
					failures.add(prefix+".milestone_index", "The "+prefix+".milestone_index field must be an integer.")
				}
			}
			sanitized := map[string]any{}
			for _, key := range []string{"percentage", "trigger_description", "milestone_index"} {
				if value, present := termin[key]; present {
					sanitized[key] = value
				}
			}
			input.termins = append(input.termins, sanitized)
		}
	}

	if raw, present := fields["proposed_milestones"]; present && raw != nil {
		if list, ok := raw.([]any); !ok {
			failures.add("proposed_milestones", "The proposed milestones field must be an array.")
		} else {
			input.hasMilestones = true
			input.milestones = make([]map[string]any, 0, len(list))
			for index, item := range list {
				milestone, ok := numericArrayItem(item)
				prefix := "proposed_milestones." + strconv.Itoa(index)
				if !ok {
					failures.add(prefix, "The "+prefix+" field must be an object.")
					continue
				}
				if value, present := milestone["title"]; !present || value == nil || (func() bool {
					text, ok := value.(string)
					return ok && strings.TrimSpace(text) == ""
				}()) {
					failures.add(prefix+".title", "The "+prefix+".title field is required.")
				} else if _, ok := value.(string); !ok {
					failures.add(prefix+".title", "The "+prefix+".title field must be a string.")
				}
				if value, present := milestone["description"]; present && value != nil {
					if _, ok := value.(string); !ok {
						failures.add(prefix+".description", "The "+prefix+".description field must be a string.")
					}
				}
				sanitized := map[string]any{}
				for _, key := range []string{"title", "description"} {
					if value, present := milestone[key]; present {
						sanitized[key] = value
					}
				}
				input.milestones = append(input.milestones, sanitized)
			}
		}
	}

	if raw, present := fields["selected_services"]; present && raw != nil {
		if list, ok := raw.([]any); !ok {
			failures.add("selected_services", "The selected services field must be an array.")
		} else {
			input.hasServices = true
			input.services = make([]map[string]any, 0, len(list))
			for _, item := range list {
				service, ok := numericArrayItem(item)
				if !ok {
					continue
				}
				input.services = append(input.services, service)
			}
		}
	}

	if raw, present := fields["proposed_team"]; present && raw != nil {
		if list, ok := raw.([]any); !ok {
			failures.add("proposed_team", "The proposed team field must be an array.")
		} else {
			input.hasTeam = true
			input.team = make([]map[string]any, 0, len(list))
			for index, item := range list {
				member, ok := numericArrayItem(item)
				prefix := "proposed_team." + strconv.Itoa(index)
				if !ok {
					failures.add(prefix, "The "+prefix+" field must be an object.")
					continue
				}
				if value, present := member["team_member_id"]; present && value != nil {
					text, ok := numericTextOf(value)
					if _, err := strconv.Atoi(strings.TrimSpace(text)); !ok || err != nil {
						failures.add(prefix+".team_member_id", "The "+prefix+".team_member_id field must be an integer.")
					}
				}
				for field, max := range map[string]int{"name": 255, "role_title": 100, "role": 50} {
					key := prefix + "." + field
					if value, present := member[field]; !present || value == nil || (func() bool {
						text, ok := value.(string)
						return ok && strings.TrimSpace(text) == ""
					}()) {
						failures.add(key, "The "+key+" field is required.")
					} else if text, ok := value.(string); !ok {
						failures.add(key, "The "+key+" field must be a string.")
					} else if len([]rune(text)) > max {
						failures.add(key, "The "+key+" field must not be greater than "+strconv.Itoa(max)+" characters.")
					}
				}
				if value, present := member["fee"]; !present || value == nil {
					failures.add(prefix+".fee", "The "+prefix+".fee field is required.")
				} else if text, ok := numericTextOf(value); !ok || !isNumericText(text) {
					failures.add(prefix+".fee", "The "+prefix+".fee field must be a number.")
				} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
					failures.add(prefix+".fee", "The "+prefix+".fee field must be a number.")
				} else if parsed < 0 {
					failures.add(prefix+".fee", "The "+prefix+".fee field must be at least 0.")
				}
				if value, present := member["fee_type"]; !present || value == nil {
					failures.add(prefix+".fee_type", "The "+prefix+".fee_type field is required.")
				} else if text, ok := value.(string); !ok || (text != "fixed" && text != "percentage") {
					failures.add(prefix+".fee_type", "The selected "+prefix+".fee_type is invalid.")
				}
				if value, present := member["note"]; present && value != nil {
					if text, ok := value.(string); !ok {
						failures.add(prefix+".note", "The "+prefix+".note field must be a string.")
					} else if len([]rune(text)) > 500 {
						failures.add(prefix+".note", "The "+prefix+".note field must not be greater than 500 characters.")
					}
				}
				sanitized := map[string]any{}
				for _, key := range []string{"team_member_id", "name", "role_title", "role", "fee", "fee_type", "note"} {
					if value, present := member[key]; present {
						sanitized[key] = value
					}
				}
				input.team = append(input.team, sanitized)
			}
		}
	}

	for _, pair := range []struct {
		key   string
		value **float64
	}{{"project_length", &input.length}, {"project_width", &input.width}} {
		if raw, present := fields[pair.key]; present && raw != nil {
			text, ok := numericTextOf(raw)
			if !ok || !isNumericText(text) {
				failures.add(pair.key, "The "+pair.key+" field must be a number.")
			} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
				failures.add(pair.key, "The "+pair.key+" field must be a number.")
			} else if parsed < 0 {
				failures.add(pair.key, "The "+pair.key+" field must be at least 0.")
			} else {
				*pair.value = &parsed
			}
		}
	}

	return input
}

// feeCalculation is BidCalculationService::calculate.
func feeCalculation(feeType string, price, unitPrice, quantity float64, budget float64, dimensions map[string]any) map[string]any {
	var total float64
	switch feeType {
	case "percentage":
		if budget > 0 {
			total = (price / 100) * budget
		}
	case "unit":
		total = unitPrice * quantity
	case "sqm":
		area := 1.0
		for _, key := range []string{"building_area", "building_size", "renovation_area", "area_size", "land_area", "land_size"} {
			if value, ok := dimensions[key]; ok {
				if parsed, err := strconv.ParseFloat(jsonScalarText(value), 64); err == nil && parsed > 0 {
					area = parsed
					break
				}
			}
		}
		total = price * area
		quantity = area
		unitPrice = price
	case "hourly":
		total = price
	default:
		total = price
	}

	calculated := 0.0
	if total > 0 {
		calculated = math.Ceil(total)
		if calculated < 1 {
			calculated = 1
		}
	}
	return map[string]any{
		"fee_type":         feeType,
		"price":            price,
		"unit_price":       unitPrice,
		"quantity":         quantity,
		"calculated_total": calculated,
	}
}

// jsonScalarText renders a decoded JSON scalar as text.
func jsonScalarText(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case json.Number:
		return typed.String()
	default:
		return ""
	}
}

// ProposeFeeHandler serves `POST /api/projects/{project}/propose-fee`.
func ProposeFeeHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("propose-fee: project", "error", err)
			serverError(w)
			return
		}

		// Keep the caller's JSON documents for the response: the oracle's
		// in-memory cast preserves REQUEST key order, while a re-read from
		// jsonb sorts keys. Laravel answers the just-updated model.
		var rawFields map[string]json.RawMessage
		if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			rawBody, _ := io.ReadAll(r.Body)
			r.Body = io.NopCloser(bytes.NewReader(rawBody))
			_ = json.Unmarshal(rawBody, &rawFields)
		}
		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}
		failures := &errorBag{}
		input := validateFeeProposal(body, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		totalPercentage := 0.0
		for _, termin := range input.termins {
			text, _ := numericTextOf(termin["percentage"])
			parsed, _ := strconv.ParseFloat(text, 64)
			totalPercentage += parsed
		}
		if math.Abs(totalPercentage-100) > 0.01 {
			message(w, http.StatusUnprocessableEntity, "The total percentage of payment termins must equal exactly 100%.")
			return
		}

		if input.bidType == "project_manager" && input.feeType != "" &&
			input.feeType != "fixed" && input.feeType != "percentage" {
			message(w, http.StatusUnprocessableEntity, "Invalid fee structure for Project Managers. Project Managers are only permitted to use Fixed Fee or Percentage structures.")
			return
		}

		bidFields, bidValues, found, err := engineeringBid(ctx, pool, projectID, input.bidType, input.bidID)
		if err != nil {
			slog.Error("propose-fee: bid", "error", err)
			serverError(w)
			return
		}
		if !found {
			message(w, http.StatusNotFound, "Bid not found.")
			return
		}
		bid := projectColumnsByName(bidFields, bidValues)

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("propose-fee: viewer", "error", err)
			serverError(w)
			return
		}

		isOwner := projectInt(values, fields, "user_id") == caller.UserID()
		isBidOwner := false
		if column, ok := bidProfileColumn(input.bidType); ok {
			if profileID := intPtrOf(bid[column]); profileID != nil {
				if own, ok := viewer.profiles[roleKey(input.bidType)]; ok && own == *profileID {
					isBidOwner = true
				}
			}
		}
		if !isOwner && !isBidOwner {
			message(w, http.StatusForbidden, "Unauthorized. You do not have permission to counter this bid.")
			return
		}

		status := stringOf(bid["status"])
		if status != "shortlisted" && status != "negotiating" {
			message(w, http.StatusUnprocessableEntity, "Proposals can only be made during the shortlisting/negotiation phase.")
			return
		}

		wireID := bidWireID(bid)
		oldPrice := strings.TrimSpace(derefString(intPtrString(bid["price"]), "0"))
		oldFeeType := stringOrNilText(asStringPtr(bid["fee_type"]))
		oldTermins := bid["proposed_termins"]
		oldMilestones := bid["proposed_milestones"]

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("propose-fee: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		// Project dimensions: merge the length/width pair by category.
		if input.length != nil && input.width != nil && *input.length > 0 && *input.width > 0 {
			dims := map[string]any{}
			switch current := projectJSONValue(values, fields, "project_dimensions").(type) {
			case map[string]any:
				for key, value := range current {
					dims[key] = value
				}
			}
			area := *input.length * *input.width
			category := stringOf(projectText(values, fields, "project_category"))
			var lengthKey, widthKey, areaKey string
			switch category {
			case "new_build":
				lengthKey, widthKey, areaKey = "building_length", "building_width", "building_size"
			case "renovation":
				lengthKey, widthKey, areaKey = "renovation_length", "renovation_width", "renovation_area"
			case "interior":
				lengthKey, widthKey, areaKey = "area_length", "area_width", "area_size"
			default:
				lengthKey, widthKey, areaKey = "building_length", "building_width", "building_size"
			}
			dims[lengthKey] = *input.length
			dims[widthKey] = *input.width
			dims[areaKey] = area
			encoded, err := json.Marshal(dims)
			if err != nil {
				slog.Error("propose-fee: dimensions", "error", err)
				serverError(w)
				return
			}
			if _, err := tx.Exec(ctx, `UPDATE projects SET project_dimensions = $2::jsonb,
				updated_at = date_trunc('second', now()) WHERE id = $1`, projectID, string(encoded)); err != nil {
				slog.Error("propose-fee: dimensions write", "error", err)
				serverError(w)
				return
			}
		}

		budgetText := derefString(intPtrString(projectText(values, fields, "budget")), "0")
		budget, _ := strconv.ParseFloat(strings.TrimSpace(budgetText), 64)
		feeType := input.feeType
		if feeType == "" {
			feeType = stringOrNilText(asStringPtr(bid["fee_type"]))
		}
		if feeType == "" {
			feeType = "fixed"
		}
		unitPrice, _ := strconv.ParseFloat(derefString(intPtrString(bid["unit_price"]), "0"), 64)
		quantity, _ := strconv.ParseFloat(derefString(intPtrString(bid["quantity"]), "0"), 64)

		dimensions := map[string]any{}
		if current, ok := projectJSONValue(values, fields, "project_dimensions").(map[string]any); ok {
			dimensions = current
		} else if input.length != nil && input.width != nil {
			dimensions["building_size"] = *input.length * *input.width
		}
		calc := feeCalculation(feeType, input.price, unitPrice, quantity, budget, dimensions)
		calculatedTotal := calc["calculated_total"].(float64)

		servicesTotal := 0.0
		for _, service := range input.services {
			if value, ok := service["price"]; ok {
				parsed, _ := strconv.ParseFloat(jsonScalarText(value), 64)
				servicesTotal += parsed
			}
		}

		teamTotal := 0.0
		for _, member := range input.team {
			fee, _ := strconv.ParseFloat(jsonScalarText(member["fee"]), 64)
			feeType := "fixed"
			if text, ok := member["fee_type"].(string); ok {
				feeType = text
			}
			actual := fee
			if feeType == "percentage" {
				actual = (fee / 100) * calculatedTotal
			}
			teamTotal += math.Round(actual)
		}

		grandTotal := calculatedTotal + servicesTotal + teamTotal
		if grandTotal <= 0 {
			message(w, http.StatusUnprocessableEntity, "Proposed fee must be greater than zero.")
			return
		}

		// Negotiation snapshot BEFORE this proposal.
		snapshot := map[string]any{
			"price":               decimalTextOrNil(oldPrice),
			"fee_type":            nullableTextValue(oldFeeType),
			"proposed_termins":    jsonOrNil(oldTermins),
			"proposed_milestones": jsonOrNil(oldMilestones),
		}
		snapshotJSON, _ := json.Marshal(snapshot)

		changes := make([]any, 0)
		oldPriceFloat, _ := strconv.ParseFloat(strings.TrimSpace(oldPrice), 64)
		if oldPriceFloat != input.price {
			changes = append(changes, map[string]any{
				"field": "price", "old": oldPrice, "new": input.priceText,
				"message": "Changed price from " + phpNumberFormat(oldPrice) + " to " + phpNumberFormat(input.priceText),
			})
		}
		if oldFeeType != feeType {
			changes = append(changes, map[string]any{
				"field": "fee_type", "old": nullableTextValue(oldFeeType), "new": feeType,
				"message": "Changed fee structure to " + strings.ToUpper(feeType),
			})
		}
		oldTerminsJSON, _ := json.Marshal(jsonOrNil(oldTermins))
		newTerminsJSON, _ := json.Marshal(input.termins)
		if string(oldTerminsJSON) != string(newTerminsJSON) {
			changes = append(changes, map[string]any{
				"field": "payment_schedule", "message": "Updated payment phases and percentages",
			})
		}
		oldMilestonesJSON, _ := json.Marshal(jsonOrNil(oldMilestones))
		var newMilestones any
		if input.hasMilestones {
			newMilestones = input.milestones
		}
		newMilestonesJSON, _ := json.Marshal(newMilestones)
		if string(oldMilestonesJSON) != string(newMilestonesJSON) {
			changes = append(changes, map[string]any{
				"field": "milestones", "message": "Revised project milestones",
			})
		}
		changesJSON, _ := json.Marshal(changes)

		bySpelling, _, err := registryIDs(ctx, pool)
		if err != nil {
			slog.Error("propose-fee: registry", "error", err)
			serverError(w)
			return
		}
		bidTypeID, ok := bySpelling[bidModelNameForRole(input.bidType)]
		if !ok {
			slog.Error("propose-fee: registry type", "type", input.bidType)
			serverError(w)
			return
		}

		round := intPtrDeref(bid["negotiation_count"]) + 1
		noteArg := any(nil)
		if input.note != nil {
			noteArg = *input.note
		}
		if _, err := tx.Exec(ctx, `INSERT INTO bid_negotiation_logs
			(bid_type_id, bid_id, user_id, round_number, snapshot, note, changes_detected, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, date_trunc('second', now()), date_trunc('second', now()))`,
			bidTypeID, wireID, caller.UserID(), round, string(snapshotJSON), noteArg, string(changesJSON)); err != nil {
			slog.Error("propose-fee: log", "error", err)
			serverError(w)
			return
		}

		terminsJSON, _ := json.Marshal(input.termins)
		var milestonesArg any
		if input.hasMilestones {
			encoded, _ := json.Marshal(input.milestones)
			milestonesArg = string(encoded)
		}
		var servicesArg any
		if input.hasServices {
			encoded, _ := json.Marshal(input.services)
			servicesArg = string(encoded)
		} else if existing := bid["selected_services"]; existing != nil {
			servicesArg = jsonTextOrNil(existing)
		}
		var teamArg any
		if input.hasTeam {
			encoded, _ := json.Marshal(input.team)
			teamArg = string(encoded)
		}

		sets := []string{
			"price = $2::numeric", "fee_type = $3", "calculated_total = $4::numeric",
			"proposed_termins = $5::jsonb", "proposed_milestones = $6::jsonb",
			"status = 'negotiating'", "offered_by_id = $7",
			"negotiation_count = COALESCE(negotiation_count, 0) + 1",
			"updated_at = date_trunc('second', now())",
		}
		args := []any{intPtrDeref(bid["id"]), input.priceText, feeType, formatFloatPHP(grandTotal),
			string(terminsJSON), milestonesArg, caller.UserID()}
		// Only columns the role's legacy model can fill are written; the oracle
		// strips the rest to avoid MassAssignmentException.
		if bidLegacyHasColumn(input.bidType, "selected_services") {
			args = append(args, servicesArg)
			sets = append(sets, "selected_services = $"+strconv.Itoa(len(args))+"::jsonb")
		}
		if bidLegacyHasColumn(input.bidType, "proposed_team") {
			args = append(args, teamArg)
			sets = append(sets, "proposed_team = $"+strconv.Itoa(len(args))+"::jsonb")
		}
		if _, err := tx.Exec(ctx, `UPDATE bids SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("propose-fee: update", "error", err)
			serverError(w)
			return
		}

		var userName string
		_ = tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, caller.UserID()).Scan(&userName)
		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "fee_proposed",
			userName+" proposed a counter-offer (Round "+strconv.FormatInt(round, 10)+")."); err != nil {
			slog.Error("propose-fee: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("propose-fee: commit", "error", err)
			serverError(w)
			return
		}

		freshFields, freshValues, _, err := engineeringBid(ctx, pool, projectID, input.bidType, input.bidID)
		if err != nil {
			slog.Error("propose-fee: reload", "error", err)
			serverError(w)
			return
		}

		bidEntry := rawBidObject(input.bidType, freshFields, freshValues)
		for _, key := range []string{"proposed_termins", "proposed_milestones", "proposed_team", "selected_services"} {
			if _, present := bidEntry.Get(key); !present {
				continue
			}
			if raw, present := rawFields[key]; present {
				bidEntry.Set(key, jsonphp.Raw(jsonphp.CompactJSON(raw)))
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Fee and phases proposed successfully")
		payload.Set("data", bidEntry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// bidLegacyHasColumn reports whether the role's legacy bid model owns a
// proposal column (selected_services is notaris-only; proposed_team is absent
// from notaris, interior and project_manager).
func bidLegacyHasColumn(role, column string) bool {
	switch column {
	case "proposed_team":
		return role == "arsitek" || role == "kontraktor" || role == "structural" || role == "mep"
	case "selected_services":
		return role == "notaris"
	}
	return false
}

// roleKey maps a bid role to the viewer.profiles key.
func roleKey(role string) string {
	if role == "project_manager" {
		return "project_manager"
	}
	return role
}

// intPtrString reads a nullable text column as a pointer.
func intPtrString(value any) *string {
	if text, ok := value.(string); ok {
		return &text
	}
	return nil
}

// asStringPtr reads a nullable string pointer.
func asStringPtr(value any) *string {
	return intPtrString(value)
}

// decimalTextOrNil renders a decimal string, empty as "0".
func decimalTextOrNil(text string) any {
	if strings.TrimSpace(text) == "" {
		return "0.00"
	}
	return text
}

// nullableStringValue renders a *string as a wire string or nil.
func nullableStringValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

// nullableTextValue renders an empty string as nil.
func nullableTextValue(value string) any {
	if value == "" {
		return nil
	}
	return value
}

// jsonTextOrNil renders a JSON value back to text.
func jsonTextOrNil(value any) any {
	if value == nil {
		return nil
	}
	encoded, err := json.Marshal(jsonOrNil(value))
	if err != nil {
		return nil
	}
	return string(encoded)
}

// phpNumberFormat is number_format($x) with no decimals.
func phpNumberFormat(text string) string {
	parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
	if err != nil {
		return text
	}
	rounded := int64(math.Round(parsed))
	negative := rounded < 0
	if negative {
		rounded = -rounded
	}
	digits := strconv.FormatInt(rounded, 10)
	var out []byte
	for i, c := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, byte(c))
	}
	if negative {
		return "-" + string(out)
	}
	return string(out)
}

// formatFloatPHP renders a float the way PDO would bind it: no exponent,
// shortest round-trip, integer when whole.
func formatFloatPHP(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}
