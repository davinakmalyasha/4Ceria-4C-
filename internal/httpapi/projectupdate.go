package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/escrow"
	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/domain/terminplan"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UPDATE PROJECT — `PUT/PATCH /api/projects/{project}` and
// `POST /api/projects/{project}/update`.
//
// The owner may rewrite everything except the escrow ceiling (there is a
// ledger-backed endpoint for that) and the payment plan side effect is
// re-validated through TerminPlanService. A hired professional may edit the
// project but never the owner's commercial fields; the assigned PM sits with
// the owner for the payment plan only.

// projectUpdateGate checks the caller: owner, selected professional, or PM.
func projectUpdateGate(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer,
	values []any, fields []string) bool {
	if viewer == nil {
		return false
	}
	ownerID := projectInt(values, fields, "user_id")
	if viewer.id == ownerID {
		return true
	}
	if verifyAssignedPM(viewer, projectIntPtr(values, fields, "pm_id")) {
		return true
	}
	for _, pair := range []struct {
		column string
		role   string
		table  string
	}{
		{"selected_arsitek_id", "arsitek", "arsiteks"},
		{"selected_kontraktor_id", "kontraktor", "kontraktors"},
		{"selected_interior_id", "interior", "interior_profiles"},
	} {
		selected := projectIntPtr(values, fields, pair.column)
		if selected == nil || viewer.role != pair.role {
			continue
		}
		if own, ok := viewer.profiles[pair.role]; ok && own == *selected {
			return true
		}
	}
	return false
}

// updateMergeObject merges the request object over the stored JSON object.
func updateMergeObject(existing any, incoming map[string]any) map[string]any {
	merged := map[string]any{}
	if object, ok := existing.(map[string]any); ok {
		for key, value := range object {
			merged[key] = value
		}
	}
	for key, value := range incoming {
		merged[key] = value
	}
	return merged
}

// UpdateProjectHandler serves both update routes.
func UpdateProjectHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("project update: project", "error", err)
			serverError(w)
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("project update: viewer", "error", err)
			serverError(w)
			return
		}
		if !projectUpdateGate(ctx, pool, viewer, values, fields) {
			message(w, http.StatusForbidden, "Unauthorized. Must be project owner, hired professional, or PM.")
			return
		}

		body, files, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
			files = map[string]*uploadedFile{}
		}
		hasPaymentTermins := false
		if _, present := body["payment_termins"]; present {
			hasPaymentTermins = true
		}
		deletedImages := body["deleted_images"]

		// THE ESCROW CEILING IS NOT EDITABLE HERE.
		if _, present := body["budget"]; present {
			message(w, http.StatusUnprocessableEntity,
				"The project budget cannot be edited directly. Use POST /projects/{$project->id}/budget/transactions with transaction_type \"deposit\" (to add funds) or \"adjustment_down\" (to reduce), so the change is recorded in the ledger.")
			return
		}

		isOwner := projectInt(values, fields, "user_id") == viewer.id

		failures := &errorBag{}
		// Validation follows UpdateProjectRequest's declaration order.
		if raw, present := body["title"]; present && raw != nil {
			text, ok := raw.(string)
			if !ok {
				failures.add("title", "The title field must be a string.")
			} else if len([]rune(text)) > 255 {
				failures.add("title", "The title field must not be greater than 255 characters.")
			}
		}
		if raw, present := body["description"]; present && raw != nil {
			if _, ok := raw.(string); !ok {
				failures.add("description", "The description field must be a string.")
			}
		}
		if raw, present := body["lokasi"]; present && raw != nil {
			text, ok := raw.(string)
			if !ok {
				failures.add("lokasi", "The lokasi field must be a string.")
			} else if len([]rune(text)) > 255 {
				failures.add("lokasi", "The lokasi field must not be greater than 255 characters.")
			}
		}
		for _, key := range []string{"latitude", "longitude", "province", "city", "kecamatan",
			"kelurahan", "postal_code", "street_name"} {
			if raw, present := body[key]; present && raw != nil {
				if _, ok := raw.(string); !ok {
					failures.add(key, "The "+key+" field must be a string.")
				}
			}
		}
		if raw, present := body["status"]; present && raw != nil {
			text, ok := raw.(string)
			if !ok {
				failures.add("status", "The selected status is invalid.")
			} else if text != "open" && text != "in_progress" && text != "completed" && text != "cancelled" {
				failures.add("status", "The selected status is invalid.")
			}
		}
		if raw, present := body["target_role"]; present && raw != nil {
			text, ok := raw.(string)
			if !ok {
				failures.add("target_role", "The selected target role is invalid.")
			} else if text != "both" && text != "arsitek" && text != "kontraktor" {
				failures.add("target_role", "The selected target role is invalid.")
			}
		}
		if raw, present := body["deadline"]; present && raw != nil {
			if text, ok := raw.(string); !ok {
				failures.add("deadline", "The deadline field must be a valid date.")
			} else if _, valid := parseDeadline(text); !valid {
				failures.add("deadline", "The deadline field must be a valid date.")
			}
		}
		if raw, present := body["negotiated_fee"]; present && raw != nil {
			text, ok := numericTextOf(raw)
			if !ok || !isNumericText(text) {
				failures.add("negotiated_fee", "The negotiated fee field must be a number.")
			} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
				failures.add("negotiated_fee", "The negotiated fee field must be a number.")
			} else if parsed < 0 {
				failures.add("negotiated_fee", "The negotiated fee field must be at least 0.")
			}
		}
		if raw, present := body["payment_instructions"]; present && raw != nil {
			if _, ok := raw.(string); !ok {
				failures.add("payment_instructions", "The payment instructions field must be a string.")
			}
		}
		if raw, present := body["deleted_images"]; present && raw != nil {
			if _, ok := raw.([]any); !ok {
				failures.add("deleted_images", "The deleted images field must be an array.")
			}
		}
		for _, key := range []string{"design_details", "construction_details", "interior_details",
			"completed_phases", "legal_requirements", "payment_termins"} {
			if raw, present := body[key]; present && raw != nil {
				if _, ok := raw.(map[string]any); !ok {
					if _, isList := raw.([]any); !isList {
						failures.add(key, "The "+key+" field must be an array.")
					}
				}
			}
		}
		if raw, present := body["needed_phases"]; present && raw != nil {
			if _, ok := raw.(string); !ok {
				failures.add("needed_phases", "The needed phases field must be a string.")
			}
		}

		termins, terminFailures := validateUpdateTermins(ctx, pool, projectID, body["payment_termins"])
		_ = termins
		for _, field := range terminFailures.fields {
			for _, message := range terminFailures.bag[field] {
				failures.add(field, message)
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		// Non-owners may not move the owner's commercial/lifecycle fields.
		if !isOwner {
			for _, key := range []string{"status", "budget", "deadline", "completed_phases",
				"negotiated_fee", "payment_instructions", "target_role", "requires_structural",
				"requires_mep", "wants_project_manager"} {
				delete(body, key)
			}
		}
		delete(body, "payment_termins")

		// Merge structured detail objects.
		designDetails := projectJSONValue(values, fields, "design_details")
		if incoming, ok := body["design_details"].(map[string]any); ok {
			merged := updateMergeObject(designDetails, incoming)
			oldDesign, _ := designDetails.(map[string]any)
			if oldDesign == nil {
				oldDesign = map[string]any{}
			}
			notifyTaggedRequirements(ctx, pool, viewer, projectID,
				projectInt(values, fields, "user_id"), values, fields, oldDesign, merged)
			body["design_details"] = merged
			designDetails = merged
		}
		if incoming, ok := body["construction_details"].(map[string]any); ok {
			body["construction_details"] = updateMergeObject(
				projectJSONValue(values, fields, "construction_details"), incoming)
		}
		if incoming, ok := body["interior_details"].(map[string]any); ok {
			body["interior_details"] = updateMergeObject(
				projectJSONValue(values, fields, "interior_details"), incoming)
		}
		if raw, present := body["needed_phases"]; present {
			if text, ok := raw.(string); ok {
				var decoded any
				if json.Unmarshal([]byte(text), &decoded) == nil {
					body["needed_phases"] = decoded
				} else {
					delete(body, "needed_phases")
				}
			}
		}
		for _, key := range []string{"wants_project_manager", "requires_structural", "requires_mep"} {
			if raw, present := body[key]; present {
				if value, valid := parseLaravelBoolean(raw); valid {
					body[key] = value
				}
			}
		}
		delete(body, "deleted_images")

		// Attachment / images are side effects, not project columns.
		if file, present := files["attachment"]; present && file != nil {
			stored, err := storePublicUpload(r, "attachment", "project_attachments", file)
			if err != nil {
				slog.Error("project update: attachment", "error", err)
				serverError(w)
				return
			}
			body["attachment"] = stored
		}

		// Payment plan rewrite: validate role, in-flight, split and contract.
		var planTermins []map[string]any
		if hasPaymentTermins {
			planTermins = termins
		}
		rawTarget, hasTarget := body["target_role"]
		targetRole := caller.RoleType()
		if hasTarget {
			targetRole = stringOf(rawTarget)
		}
		canActForOthers := isOwner || verifyAssignedPM(viewer, projectIntPtr(values, fields, "pm_id"))
		if hasPaymentTermins {
			if !canActForOthers && targetRole != caller.RoleType() {
				message(w, http.StatusForbidden, "Unauthorized. You can only modify payment termins for your own role.")
				return
			}
			if err := terminplan.AssertKnownRole(targetRole); err != nil {
				message(w, http.StatusUnprocessableEntity, err.Error())
				return
			}
			var inFlight bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_payment_termins
				WHERE project_id = $1 AND role_type::text = $2 AND status::text IN ('verifying','paid'))`,
				projectID, targetRole).Scan(&inFlight); err != nil {
				slog.Error("project update: in flight", "error", err)
				serverError(w)
				return
			}
			if inFlight {
				message(w, http.StatusUnprocessableEntity, "Cannot replace payment termins while any of them is verifying or paid.")
				return
			}

			percentages := make([]float64, 0, len(planTermins))
			totalAmount := "0"
			for _, termin := range planTermins {
				text, _ := numericTextOf(termin["percentage"])
				parsed, _ := strconv.ParseFloat(text, 64)
				percentages = append(percentages, parsed)
				amountText, _ := numericTextOf(termin["amount"])
				amount, _ := money.FromColumn(amountText, "IDR")
				prior, _ := money.FromColumn(totalAmount, "IDR")
				if added, err := prior.Add(amount); err == nil {
					totalAmount = added.Decimal()
				}
			}
			if err := terminplan.AssertPercentagesWithinWhole(percentages); err != nil {
				message(w, http.StatusUnprocessableEntity, err.Error())
				return
			}
			contract, err := signContractValue(ctx, pool, projectID, targetRole)
			if err != nil {
				slog.Error("project update: contract", "error", err)
				serverError(w)
				return
			}
			total, _ := money.FromColumn(totalAmount, "IDR")
			if err := terminplan.AssertTotalWithinContractValue(contract, total); err != nil {
				message(w, http.StatusUnprocessableEntity, err.Error())
				return
			}
		}

		// Build the column patch. JSON columns need explicit casts.
		jsonColumns := map[string]bool{
			"needed_phases": true, "design_details": true, "construction_details": true,
			"interior_details": true, "completed_phases": true, "legal_requirements": true,
		}
		timeColumns := map[string]bool{"deadline": true}
		sets := make([]string, 0, len(body)+1)
		args := make([]any, 0, len(body)+1)
		for key, value := range body {
			switch key {
			case "title", "description", "lokasi", "latitude", "longitude", "province", "city",
				"kecamatan", "kelurahan", "postal_code", "street_name", "status", "target_role",
				"negotiated_fee", "payment_instructions", "attachment", "wants_project_manager",
				"requires_structural", "requires_mep", "deadline",
				"design_details", "construction_details", "interior_details", "completed_phases",
				"legal_requirements", "needed_phases":
			default:
				continue
			}
			var encoded any = value
			if jsonColumns[key] {
				bytes, err := json.Marshal(value)
				if err != nil {
					continue
				}
				encoded = string(bytes)
			}
			args = append(args, encoded)
			placeholder := "$" + strconv.Itoa(len(args))
			if jsonColumns[key] {
				placeholder += "::jsonb"
			}
			if timeColumns[key] {
				placeholder += "::timestamptz"
			}
			if key == "wants_project_manager" || key == "requires_structural" || key == "requires_mep" {
				placeholder += "::boolean"
			}
			sets = append(sets, key+" = "+placeholder)
		}
		args = append(args, projectID)
		sets = append(sets, "updated_at = date_trunc('second', now())")

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("project update: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET `+strings.Join(sets, ", ")+
			` WHERE id = $`+strconv.Itoa(len(args)), args...); err != nil {
			slog.Error("project update: write", "error", err)
			serverError(w)
			return
		}

		// Deleted images (scoped to this project).
		if deletedImages != nil {
			if list, ok := deletedImages.([]any); ok {
				for _, item := range list {
					if parsed, ok := numericTextOf(item); ok {
						if id, err := strconv.ParseInt(strings.TrimSpace(parsed), 10, 64); err == nil {
							_, _ = tx.Exec(ctx, `DELETE FROM project_images WHERE id = $1 AND project_id = $2`, id, projectID)
						}
					}
				}
			}
		}

		// New images.
		images := requestGalleryFilesNamed(r, "images")
		if len(images) > 0 {
			var maxSort *int
			_ = tx.QueryRow(ctx, `SELECT MAX(sort_order) FROM project_images WHERE project_id = $1`, projectID).Scan(&maxSort)
			base := -1
			if maxSort != nil {
				base = *maxSort
			}
			for index, image := range images {
				stored, err := storePublicUploadMulti(r, "images", index, "project_images", image)
				if err != nil {
					slog.Error("project update: image", "error", err)
					serverError(w)
					return
				}
				if _, err := tx.Exec(ctx, `INSERT INTO project_images
					(project_id, image_path, sort_order, created_at, updated_at)
					VALUES ($1, $2, $3, date_trunc('second', now()), date_trunc('second', now()))`,
					projectID, stored, base+index+1); err != nil {
					slog.Error("project update: image row", "error", err)
					serverError(w)
					return
				}
			}
		}

		if hasPaymentTermins {
			if _, err := tx.Exec(ctx, `DELETE FROM project_payment_termins
				WHERE project_id = $1 AND role_type::text = $2`, projectID, targetRole); err != nil {
				slog.Error("project update: delete termins", "error", err)
				serverError(w)
				return
			}
			for _, termin := range planTermins {
				label := stringOf(termin["label"])
				percentText, _ := numericTextOf(termin["percentage"])
				amountText, _ := numericTextOf(termin["amount"])
				amount, err := money.FromColumn(amountText, "IDR")
				if err != nil {
					serverError(w)
					return
				}
				split, err := escrow.SplitRetention(amount, "5")
				if err != nil {
					serverError(w)
					return
				}
				var trigger, notes any
				if value, present := termin["trigger_description"]; present {
					trigger = value
				}
				if value, present := termin["notes"]; present {
					notes = value
				}
				var milestone any
				if value, present := termin["milestone_id"]; present && value != nil {
					milestone = value
				}
				var recipient any
				if targetRole == caller.RoleType() {
					recipient = viewer.id
				}
				if _, err := tx.Exec(ctx, `INSERT INTO project_payment_termins
					(project_id, label, percentage, amount, retention_amount, net_amount,
					 trigger_description, status, milestone_id, notes, role_type, recipient_id,
					 created_at, updated_at)
					VALUES ($1, $2, $3::numeric, $4::numeric, $5::numeric, $6::numeric,
					 $7, 'locked', $8, $9, $10, $11,
					 date_trunc('second', now()), date_trunc('second', now()))`,
					projectID, label, percentText, amountText, split.Retention.Decimal(), split.Net.Decimal(),
					trigger, milestone, notes, targetRole, recipient); err != nil {
					slog.Error("project update: termin", "error", err)
					serverError(w)
					return
				}
			}
		}

		if raw, present := body["status"]; present {
			if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "status_changed",
				"Status changed to "+stringOf(raw)); err != nil {
				slog.Error("project update: activity", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("project update: commit", "error", err)
			serverError(w)
			return
		}

		freshViewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("project update: reload viewer", "error", err)
			serverError(w)
			return
		}
		renderProjectAnswer(ctx, pool, w, projectID, freshViewer, projectLoad{budgetSummary: true})
	}
}

// validateUpdateTermins validates the nested payment_termins array.
func validateUpdateTermins(ctx context.Context, pool *pgxpool.Pool, projectID int64,
	raw any) ([]map[string]any, *errorBag) {
	failures := &errorBag{}
	if raw == nil {
		return nil, failures
	}
	list, ok := raw.([]any)
	if !ok {
		failures.add("payment_termins", "The payment termins field must be an array.")
		return nil, failures
	}
	out := make([]map[string]any, 0, len(list))
	for index, item := range list {
		termin, ok := item.(map[string]any)
		prefix := "payment_termins." + strconv.Itoa(index)
		if !ok {
			failures.add(prefix, "The "+prefix+" field must be an object.")
			continue
		}
		if value, present := termin["label"]; !present || value == nil || (func() bool {
			text, ok := value.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			failures.add(prefix+".label", "The "+prefix+".label field is required.")
		} else if _, ok := value.(string); !ok {
			failures.add(prefix+".label", "The "+prefix+".label field must be a string.")
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
		if value, present := termin["amount"]; !present || value == nil {
			failures.add(prefix+".amount", "The "+prefix+".amount field is required.")
		} else if text, ok := numericTextOf(value); !ok || !isNumericText(text) {
			failures.add(prefix+".amount", "The "+prefix+".amount field must be a number.")
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add(prefix+".amount", "The "+prefix+".amount field must be a number.")
		} else if parsed < 0 {
			failures.add(prefix+".amount", "The "+prefix+".amount field must be at least 0.")
		}
		if value, present := termin["notes"]; present && value != nil {
			if text, ok := value.(string); !ok {
				failures.add(prefix+".notes", "The "+prefix+".notes field must be a string.")
			} else if len([]rune(text)) > 250 {
				failures.add(prefix+".notes", "The "+prefix+".notes field must not be greater than 250 characters.")
			}
		}
		if value, present := termin["milestone_id"]; present && value != nil {
			text, ok := numericTextOf(value)
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if !ok || err != nil || !milestoneInProject(ctx, pool, projectID, parsed) {
				failures.add(prefix+".milestone_id", "The selected work phase does not belong to this project.")
			}
		}
		out = append(out, termin)
	}
	return out, failures
}

// notifyTaggedRequirements fans `requirement_tagged` when a design requirement
// gains a specialist tag.
func notifyTaggedRequirements(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer,
	projectID, ownerID int64, values []any, fields []string, oldDetails, newDetails map[string]any) {
	oldRequirements := map[string]map[string]any{}
	if list, ok := oldDetails["requirements"].([]any); ok {
		for _, item := range list {
			if entry, ok := item.(map[string]any); ok {
				oldRequirements[stringOf(entry["id"])] = entry
			}
		}
	}
	list, ok := newDetails["requirements"].([]any)
	if !ok {
		return
	}
	for _, item := range list {
		requirement, ok := item.(map[string]any)
		if !ok {
			continue
		}
		taggedRole := stringOf(requirement["tagged_role"])
		if taggedRole == "" {
			continue
		}
		reqID := stringOf(requirement["id"])
		if old, ok := oldRequirements[reqID]; ok && stringOf(old["tagged_role"]) == taggedRole {
			continue
		}
		column := ""
		switch taggedRole {
		case "structural":
			column = "structural_id"
		case "mep":
			column = "mep_id"
		case "interior":
			column = "selected_interior_id"
		}
		if column == "" {
			continue
		}
		profileID := projectIntPtr(values, fields, column)
		if profileID == nil {
			continue
		}
		table := map[string]string{"structural": "structural_engineers", "mep": "mep_engineers", "interior": "interior_profiles"}[taggedRole]
		var targetUser *int64
		_ = pool.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, *profileID).Scan(&targetUser)
		if targetUser == nil || *targetUser == 0 {
			continue
		}
		title := stringOf(requirement["title"])
		if title == "" {
			title = "New Requirement"
		}
		body := "You have been tagged in the design requirement: \"" + title + "\". Please check the Architecture subtab to provide your feedback."
		data := `{"project_id":` + strconv.FormatInt(projectID, 10) +
			`,"requirement_id":` + reqIDJSON(reqID) + `}`
		if _, err := pool.Exec(ctx, `INSERT INTO notifications
			(user_id, type, title, body, data, created_at, updated_at)
			VALUES ($1, 'requirement_tagged', '🚨 Tagged in Requirement Brief', $2, $3::jsonb,
			 date_trunc('second', now()), date_trunc('second', now()))`,
			*targetUser, body, data); err != nil {
			slog.Warn("project update: tag notify", "error", err)
		}
	}
}

// reqIDJSON renders a requirement id as JSON (number when numeric).
func reqIDJSON(value string) string {
	if _, err := strconv.ParseInt(value, 10, 64); err == nil {
		return value
	}
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
