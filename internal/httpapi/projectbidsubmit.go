package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SUBMIT-BID HELPERS.

// jsonUnmarshal decodes JSON text.
func jsonUnmarshal(data []byte, target any) error {
	return json.Unmarshal(data, target)
}

// floatOf reads a numeric field as float64.
func floatOf(value any) float64 {
	switch typed := value.(type) {
	case nil:
		return 0
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int64:
		return float64(typed)
	case int:
		return float64(typed)
	case string:
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64); err == nil {
			return parsed
		}
		return 0
	default:
		return 0
	}
}

// jsonQuote renders a string as JSON.
func jsonQuote(value string) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return `""`
	}
	return string(encoded)
}

// isUniqueViolation reports a unique-constraint failure.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "23505")
}

// bidShowAfterWrite reloads the project for the submit 200.
func bidShowAfterWrite(ctx context.Context, pool *pgxpool.Pool, projectID int64, viewer *projectViewer) (*jsonphp.Object, error) {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		return nil, err
	}

	return projectResource(ctx, pool, fields, values, viewer, submitBidLoad(), map[int64]*clientHistory{})
}

// updateBidInvited converts an invited structural/mep bid into a live one.
func updateBidInvited(ctx context.Context, pool *pgxpool.Pool, bidID int64, role string, price, feeType string, unit, qty float64, total float64, proposal string, formFields map[string]any) error {
	textOf := func(key string) *string {
		if raw, ok := formFields[key]; ok && raw != nil {
			if s, ok := raw.(string); ok && s != "" {
				dup := s
				return &dup
			}
		}
		return nil
	}

	intOf := func(key string) *int64 {
		if raw, ok := formFields[key]; ok && raw != nil {
			if text, present := fieldNumeric(formFields, key); present && text != "" {
				if val, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
					dup := val
					return &dup
				}
			}
		}
		return nil
	}

	_ = textOf
	_ = intOf

	scopesText := jsonTextOf(formFields["scopes"])
	deliverablesText := jsonTextOf(formFields["deliverables"])

	_, err := pool.Exec(ctx, `UPDATE bids SET price = $1, fee_type = $2, unit_price = $3, quantity = $4, calculated_total = $5, proposal = $6, status = 'pending', scopes = $7::jsonb, deliverables = $8::jsonb, updated_at = date_trunc('second', now()) WHERE id = $9`,
		price, feeType, numText(unit), numText(qty), numText(total), proposal, scopesText, deliverablesText, bidID)
	return err
}

// jsonTextOf renders a scopes/deliverables value as JSON text.
func jsonTextOf(value any) *string {
	if value == nil {
		return nil
	}
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return nil
		}
		dup := typed
		return &dup
	case []any, map[string]any:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return nil
		}
		dup := string(encoded)
		return &dup
	default:
		return nil
	}
}

// numText renders a float as minor-unit decimal text.
func numText(value float64) string {
	return strconv.FormatFloat(value, 'f', 2, 64)
}

// insertBid writes one unified bid row.
func insertBid(ctx context.Context, pool *pgxpool.Pool, projectID int64, role, column string, profileID, userID int64, price string, formFields map[string]any, feeType string, unit, qty, total float64, proposal string, estimatedDuration int, durationUnit string, selectedServices any) (int64, error) {
	priceMax := nullableTextOf(formFields["price_max"])
	scopes := jsonTextOf(formFields["scopes"])
	deliverables := jsonTextOf(formFields["deliverables"])
	style := nullableTextOf(formFields["style"])
	constructionMethod := nullableTextOf(formFields["construction_method"])
	costBreakdown := jsonTextOf(formFields["cost_breakdown"])
	workforceCount := nullableIntOf(formFields, "workforce_count")
	equipmentOwned := nullableTextOf(formFields["equipment_owned"])
	warrantyMonths := nullableIntOf(formFields, "warranty_months")
	if role == "kontraktor" && warrantyMonths == nil {
		six := int64(6)
		warrantyMonths = &six
	}
	paymentPreference := nullableTextOf(formFields["payment_preference"])
	taxEstimate := nullableTextOf(formFields["tax_estimate"])
	feePercentage := nullableTextOf(formFields["fee_percentage"])
	selectedServicesText := jsonTextOf(selectedServices)
	if selectedServicesText == nil {
		selectedServicesText = jsonTextOf(formFields["selected_services"])
	}
	licenseNumber := nullableTextOf(formFields["license_number"])
	experienceYears := nullableIntOf(formFields, "experience_years")
	technicalNotes := nullableTextOf(formFields["technical_notes"])
	interviewNotes := nullableTextOf(formFields["interview_notes"])

	_ = feePercentage
	_ = licenseNumber
	_ = experienceYears
	_ = technicalNotes
	_ = interviewNotes

	var arsitekID, kontraktorID, notarisID, interiorID, pmID, structuralID, mepID *int64
	switch role {
	case "arsitek":
		dup := profileID
		arsitekID = &dup
	case "kontraktor":
		dup := profileID
		kontraktorID = &dup
	case "notaris":
		dup := profileID
		notarisID = &dup
	case "interior":
		dup := profileID
		interiorID = &dup
	case "project_manager":
		dup := profileID
		pmID = &dup
	case "structural":
		dup := profileID
		structuralID = &dup
	case "mep":
		dup := profileID
		mepID = &dup
	}

	var bidID int64
	err := pool.QueryRow(ctx, `
		INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id,
			arsitek_id, kontraktor_id, notaris_id, interior_id, pm_id, structural_id, mep_id,
			price, price_max, negotiation_count, fee_type, unit_price, quantity, calculated_total,
			proposal, status, estimated_duration, duration_unit,
			attachment_1, attachment_2, attachment_3,
			payment_status, scopes, deliverables,
			offered_by_id, created_at, updated_at,
			style, construction_method, cost_breakdown, workforce_count, equipment_owned,
			warranty_months, payment_preference, tax_estimate, selected_services)
		VALUES ($1, $2::bid_role, $3, $4,
			$5, $6, $7, $8, $9, $10, $11,
			$12, $13, 0, $14, $15, $16, $17,
			$18, 'pending', $19, $20,
			NULL, NULL, NULL,
			'unpaid', $21::jsonb, $22::jsonb,
			$3, date_trunc('second', now()), date_trunc('second', now()),
			$23, $24, $25::jsonb, $26, $27,
			$28, $29, $30, $31::jsonb)
		RETURNING id
	`, projectID, role, userID, profileID,
		arsitekID, kontraktorID, notarisID, interiorID, pmID, structuralID, mepID,
		price, priceMax, feeType, numText(unit), numText(qty), numText(total),
		proposal, estimatedDuration, durationUnit,
		scopes, deliverables,
		style, constructionMethod, costBreakdown, workforceCount, equipmentOwned,
		warrantyMonths, paymentPreference, taxEstimate, selectedServicesText,
	).Scan(&bidID)

	return bidID, err
}

// nullableTextOf renders an optional text value.
func nullableTextOf(value any) *string {
	if value == nil {
		return nil
	}
	if s, ok := value.(string); ok {
		if s == "" {
			return nil
		}
		dup := s
		return &dup
	}
	return nil
}

// nullableIntOf renders an optional integer value.
func nullableIntOf(formFields map[string]any, key string) *int64 {
	raw, ok := formFields[key]
	if !ok || raw == nil {
		return nil
	}
	text, present := fieldNumeric(formFields, key)
	if !present || text == "" {
		return nil
	}
	if val, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
		dup := val
		return &dup
	}
	return nil
}

// SubmitProjectBidHandler serves `POST /api/projects/{project}/bids`.
func SubmitProjectBidHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		raw := r.PathValue("project")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, raw)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		viewer, err := loadViewer(r.Context(), pool, caller)
		if err != nil {
			slog.Error("project submit-bid: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(r.Context(), pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("project submit-bid: query", "error", err)
			serverError(w)
			return
		}

		role := viewer.role
		if role != "arsitek" && role != "kontraktor" && role != "notaris" && role != "interior" && role != "structural" && role != "mep" && role != "project_manager" {
			message(w, http.StatusForbidden, "Only verified professionals can submit bids.")
			return
		}

		profileID, hasProfile := viewer.profiles[role]
		if !hasProfile || profileID == 0 {
			message(w, http.StatusForbidden, "Complete your professional profile before bidding.")
			return
		}

		profileTable, ok := bidProfileTable(role)
		if !ok {
			message(w, http.StatusForbidden, "Complete your professional profile before bidding.")
			return
		}

		var verificationStatus *string
		if err := pool.QueryRow(r.Context(), `SELECT verification_status FROM `+profileTable+` WHERE id = $1`, profileID).Scan(&verificationStatus); err != nil {
			message(w, http.StatusForbidden, "Complete your professional profile before bidding.")
			return
		}
		if verificationStatus == nil || *verificationStatus != "verified" {
			message(w, http.StatusForbidden, "Your professional profile is still awaiting verification, so you cannot bid yet. We will notify you once it is approved.")
			return
		}

		byName := projectColumnsByName(fields, values)
		status, _ := byName["status"].(string)

		allowedStatuses := map[string]bool{"open": true, "accepted_arsitek": true, "accepted_kontraktor": true, "procurement": true, "in_progress": true, "completed_build": true, "awaiting_payment": true}
		if !allowedStatuses[status] {
			message(w, http.StatusUnprocessableEntity, "This project is no longer accepting bids.")
			return
		}

		vacancyMsg := map[string]string{
			"arsitek":         "An architect has already been hired for this project.",
			"kontraktor":      "A contractor has already been hired for this project.",
			"notaris":         "A notary has already been hired for this project.",
			"interior":        "An interior designer has already been hired for this project.",
			"structural":      "A structural engineer has already been hired for this project.",
			"mep":             "An MEP engineer has already been hired for this project.",
			"project_manager": "A Project Manager has already been hired for this project.",
		}
		vacancyCol := map[string]string{
			"arsitek": "selected_arsitek_id", "kontraktor": "selected_kontraktor_id",
			"notaris": "selected_notaris_id", "interior": "selected_interior_id",
			"structural": "structural_id", "mep": "mep_id", "project_manager": "pm_id",
		}
		if col, ok := vacancyCol[role]; ok {
			if ptr := projectIntPtr(values, fields, col); ptr != nil && *ptr != 0 {
				message(w, http.StatusUnprocessableEntity, vacancyMsg[role])
				return
			}
		}

		targetRole, _ := byName["target_role"].(string)
		if targetRole != "both" && targetRole != role {
			message(w, http.StatusUnprocessableEntity, "This project is not seeking a "+role+".")
			return
		}

		if role == "kontraktor" && targetRole == "both" {
			var designDone bool
			for i, name := range fields {
				if name == "design_completed_at" {
					designDone = values[i] != nil
					break
				}
			}
			if !designDone {
				published := projectJSONRaw(values, fields, "published_bidding_roles")
				if !strings.Contains(published, `"kontraktor"`) {
					message(w, http.StatusUnprocessableEntity, "Contractor bids are only accepted after the design package has been finalized and sealed by the Architect.")
					return
				}
			}
		}

		ctx := r.Context()
		formFields, formFiles, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}

		priceText, pricePresent := fieldNumeric(formFields, "price")
		if !pricePresent || priceText == "" {
			failures.add("price", "The price field is required.")
		} else if !isNumericText(priceText) {
			failures.add("price", "The price field must be a number.")
		} else {
			priceVal, _ := strconv.ParseFloat(priceText, 64)
			if role == "notaris" {
				if priceVal < 0 {
					failures.add("price", "The price field must be at least 0.")
				}
			} else if priceVal <= 0 {
				failures.add("price", "The price field must be greater than 0.")
			}
		}

		if raw, ok := formFields["price_max"]; ok && raw != nil && raw != "" {
			if text, present := fieldNumeric(formFields, "price_max"); present && text != "" {
				if !isNumericText(text) {
					failures.add("price_max", "The price max field must be a number.")
				} else if val, err := strconv.ParseFloat(text, 64); err == nil && val < 0 {
					failures.add("price_max", "The price max field must be at least 0.")
				}
			} else {
				failures.add("price_max", "The price max field must be a number.")
			}
		}

		proposalText := ""
		if raw, ok := formFields["proposal"]; ok && raw != nil {
			if s, isStr := raw.(string); !isStr {
				failures.add("proposal", "The proposal field must be a string.")
			} else if strings.TrimSpace(s) == "" {
				failures.add("proposal", "The proposal field is required.")
			} else if len(s) > 2000 {
				failures.add("proposal", "The proposal field must not be greater than 2000 characters.")
			} else {
				proposalText = s
			}
		} else {
			failures.add("proposal", "The proposal field is required.")
		}

		estimatedDuration := 1
		if raw, ok := formFields["estimated_duration"]; ok && raw != nil && raw != "" {
			text, _ := fieldNumeric(formFields, "estimated_duration")
			if text == "" {
				failures.add("estimated_duration", "The estimated duration field must be an integer.")
			} else {
				trimmed := strings.TrimSpace(text)
				isInt := true
				for _, c := range trimmed {
					if (c < '0' || c > '9') && c != '+' && c != '-' {
						isInt = false
						break
					}
				}
				if !isInt || strings.Contains(trimmed, ".") {
					failures.add("estimated_duration", "The estimated duration field must be an integer.")
				} else if val, err := strconv.Atoi(trimmed); err != nil {
					failures.add("estimated_duration", "The estimated duration field must be an integer.")
				} else if val < 1 {
					failures.add("estimated_duration", "The estimated duration field must be at least 1.")
				} else {
					estimatedDuration = val
				}
			}
		}

		durationUnit := "weeks"
		if raw, ok := formFields["duration_unit"]; ok && raw != nil && raw != "" {
			if s, isStr := raw.(string); !isStr {
				failures.add("duration_unit", "The selected duration unit is invalid.")
			} else if s != "days" && s != "weeks" && s != "months" {
				failures.add("duration_unit", "The selected duration unit is invalid.")
			} else {
				durationUnit = s
			}
		}

		feeType := ""
		if raw, ok := formFields["fee_type"]; ok && raw != nil && raw != "" {
			if s, isStr := raw.(string); !isStr {
				failures.add("fee_type", "The selected fee type is invalid.")
			} else if s != "fixed" && s != "percentage" && s != "unit" && s != "sqm" && s != "hourly" {
				failures.add("fee_type", "The selected fee type is invalid.")
			} else {
				feeType = s
			}
		}

		unitPriceText, _ := optionalNumeric(formFields, "unit_price", failures)
		quantityText, _ := optionalNumeric(formFields, "quantity", failures)
		if raw, ok := formFields["unit_price"]; ok && raw != nil && raw != "" {
			if text, present := fieldNumeric(formFields, "unit_price"); present && text != "" {
				if val, err := strconv.ParseFloat(text, 64); err == nil && val < 0 {
					failures.add("unit_price", "The unit price field must be at least 0.")
				}
			}
		}
		if raw, ok := formFields["quantity"]; ok && raw != nil && raw != "" {
			if text, present := fieldNumeric(formFields, "quantity"); present && text != "" {
				if val, err := strconv.ParseFloat(text, 64); err == nil && val < 0 {
					failures.add("quantity", "The quantity field must be at least 0.")
				}
			}
		}

		for _, key := range []string{"attachment_1", "attachment_2", "attachment_3"} {
			validateFile(key, formFiles[key], false, []string{"jpeg", "png", "jpg", "gif", "webp", "pdf", "zip"}, 10240, failures)
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		priceVal, _ := strconv.ParseFloat(priceText, 64)
		var unitVal, qtyVal float64
		if unitPriceText != "" {
			unitVal, _ = strconv.ParseFloat(unitPriceText, 64)
		}
		if quantityText != "" {
			qtyVal, _ = strconv.ParseFloat(quantityText, 64)
		}

		var budgetText string
		if s, ok := byName["budget"].(string); ok {
			budgetText = s
		}
		dimensionsText := projectJSONRaw(values, fields, "project_dimensions")

		calcFee, calcPrice, calcUnit, calcQty, calcTotal := bidCalculation(feeType, priceVal, unitVal, qtyVal, budgetText, dimensionsText)

		servicesTotal := 0.0
		var selectedServices any
		if raw, ok := formFields["selected_services"]; ok && raw != nil {
			switch typed := raw.(type) {
			case string:
				if typed != "" {
					var decoded []any
					if err := jsonUnmarshal([]byte(typed), &decoded); err == nil {
						selectedServices = decoded
						for _, item := range decoded {
							if m, ok := item.(map[string]any); ok {
								servicesTotal += floatOf(m["price"])
							}
						}
					} else {
						selectedServices = typed
					}
				}
			case []any:
				selectedServices = typed
				for _, item := range typed {
					if m, ok := item.(map[string]any); ok {
						servicesTotal += floatOf(m["price"])
					}
				}
			default:
				selectedServices = raw
			}
		}

		grandTotal := calcTotal + servicesTotal
		if grandTotal <= 0 {
			message(w, http.StatusUnprocessableEntity, "Proposed fee must be greater than zero.")
			return
		}

		column, _ := bidProfileColumn(role)

		var existingID int64
		var existingStatus string
		_ = pool.QueryRow(ctx, `SELECT id, status::text FROM bids WHERE project_id = $1 AND role::text = $2 AND `+column+` = $3`, projectID, role, profileID).Scan(&existingID, &existingStatus)
		if existingID != 0 {
			if (role == "structural" || role == "mep") && existingStatus == "invited" {
				if err := updateBidInvited(ctx, pool, existingID, role, strconv.FormatFloat(calcPrice, 'f', 2, 64), calcFee, calcUnit, calcQty, grandTotal, proposalText, formFields); err != nil {
					slog.Error("project submit-bid: update invited", "error", err)
					serverError(w)
					return
				}
				row, err := bidShowAfterWrite(ctx, pool, projectID, viewer)
				if err != nil {
					slog.Error("project submit-bid: reload", "error", err)
					serverError(w)
					return
				}
				payload := jsonphp.NewObject()
				payload.Set("data", row)
				writeJSON(w, http.StatusOK, payload)
				return
			}
			message(w, http.StatusUnprocessableEntity, "You have already submitted a bid for this project.")
			return
		}

		priceTextOut := strconv.FormatFloat(calcPrice, 'f', 2, 64)
		bidID, err := insertBid(ctx, pool, projectID, role, column, profileID, viewer.id, priceTextOut, formFields, calcFee, calcUnit, calcQty, grandTotal, proposalText, estimatedDuration, durationUnit, selectedServices)
		if err != nil {
			if isUniqueViolation(err) {
				message(w, http.StatusUnprocessableEntity, "You have already submitted a bid for this project.")
				return
			}
			slog.Error("project submit-bid: insert", "error", err)
			serverError(w)
			return
		}
		_ = bidID

		var ownerID int64
		var projectTitle string
		var bidderName string
		_ = pool.QueryRow(ctx, `SELECT user_id, title FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &projectTitle)
		_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, viewer.id).Scan(&bidderName)

		roleLabel := map[string]string{"arsitek": "Arsitek", "kontraktor": "Kontraktor", "notaris": "Notaris", "interior": "Desainer Interior", "project_manager": "Project Manager", "structural": "Structural Engineer", "mep": "MEP Engineer"}[role]
		notifData := `{"project_id":` + strconv.FormatInt(projectID, 10) + `,"bidder_name":` + jsonQuote(bidderName) + `,"role_type":` + jsonQuote(role) + `}`
		if _, err := pool.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at) VALUES ($1, 'bid_received', 'New Bid Received!', $2, $3, date_trunc('second', now()), date_trunc('second', now()))`,
			ownerID, bidderName+" ("+roleLabel+") telah mengirimkan penawaran untuk proyek \""+projectTitle+"\".", notifData); err != nil {
			slog.Error("project submit-bid: notify", "error", err)
			serverError(w)
			return
		}

		row, err := bidShowAfterWrite(ctx, pool, projectID, viewer)
		if err != nil {
			slog.Error("project submit-bid: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", row)
		writeJSON(w, http.StatusOK, payload)
	}
}
