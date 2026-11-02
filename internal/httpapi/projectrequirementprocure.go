package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/domain/terminplan"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROCUREMENT — the payable-obligation write.
//
// request-procurement mints a procurement row behind the kontraktor /
// helper-sub / PM / owner gate, refuses while a dispute is open (it
// creates a new payable, exactly what the termin and change-order paths
// refuse), then fans out: a PM on the project gets a review
// notification, otherwise a pm_material addendum plus an owner
// authorization notification. The list renders every row with its
// requirement and its requester, in id order. The 200 answers the row
// in create order.

// ProcurementListHandler serves
// `GET /api/projects/{project}/procurement-requests`.
func ProcurementListHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("procure-list: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("procure-list: project", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)

		allowed, err := requirementGate(ctx, pool, viewer, projectID, ownerID)
		if err != nil {
			slog.Error("procure-list: gate", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT * FROM project_procurement_requests WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			slog.Error("procure-list: list", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			row, err := scanProcurementRow(rows, 14)
			if err != nil {
				slog.Error("procure-list: scan", "error", err)
				serverError(w)
				return
			}

			entry, err := procurementEntry(ctx, pool, row, true, true)
			if err != nil {
				slog.Error("procure-list: render", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("procure-list: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)

		writeJSON(w, http.StatusOK, payload)
	}
}

// procurementRow is one scanned procurement row.
type procurementRow struct {
	fields []string
	values []any
	byName map[string]any
}

// scanProcurementRow reads one procurement row.
func scanProcurementRow(rows pgx.Rows, width int) (procurementRow, error) {
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return procurementRow{}, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	return procurementRow{fields: fields, values: values, byName: byName}, nil
}

// procurementEntry renders one row: table columns in order with the
// decimal casts, the nested requirement (columns plus image_url, no
// user) and the requesting user.
func procurementEntry(ctx context.Context, pool *pgxpool.Pool, row procurementRow, withRequirement, withRequester bool) (*jsonphp.Object, error) {
	byName := row.byName

	entry := jsonphp.NewObject()
	for _, column := range row.fields {
		value := byName[column]
		switch column {
		case "quantity_needed", "estimated_unit_cost", "estimated_cost":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "offer_to_buy":
			entry.Set(column, boolOrFalse(value))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	if withRequirement {
		req, err := loadRequirement(ctx, pool, intPtrDeref(byName["requirement_id"]))
		if err != nil {
			return nil, err
		}
		entry.Set("requirement", historyRequirement(ctx, req))
	}

	if withRequester {
		requester, err := nullableUser(ctx, pool, intPtrOf(byName["requested_by"]))
		if err != nil {
			return nil, err
		}
		entry.Set("requester", requester)
	}

	return entry, nil
}

// RequestProcurementHandler serves
// `POST /api/projects/{project}/requirements/{requirement}/request-procurement`.
func RequestProcurementHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		rawReq := r.PathValue("requirement")
		if rawReq == "" {
			rawReq = historyRequirementID(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("procure: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("procure: project", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)

		row, ok := stockRequirement(w, r, ctx, pool, projectID, rawReq)
		if !ok {
			return
		}

		if !procurementGate(ctx, pool, viewer, projectID, ownerID) {
			message(w, http.StatusForbidden, "Unauthorized. Only contractors, hired helper sub-professionals, or managers can request procurement.")
			return
		}

		var openID int64
		var openTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
			message(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}
		input, valid := validateProcurement(formFields, failures)
		if !valid || !failures.empty() {
			failures.write(w)
			return
		}

		requirementID, _ := strconv.ParseInt(rawReq, 10, 64)

		unitCostText := input.estimatedText
		if unitCostText == "" {
			// The scanned wall may be text or pgtype.Numeric; the
			// decimal renderer normalizes either, and nil means 0 —
			// the oracle's `?? 0` fallback.
			if text, ok := decimalOrNilBid(row.byName, "estimated_unit_cost").(string); ok {
				unitCostText = text
			} else {
				unitCostText = "0"
			}
		}

		qty, err := strconv.ParseFloat(input.quantityText, 64)
		if err != nil {
			slog.Error("procure: quantity", "error", err)
			serverError(w)
			return
		}
		unitMoney, err := money.FromColumn(unitCostText, "IDR")
		if err != nil {
			slog.Error("procure: unit", "error", err)
			serverError(w)
			return
		}
		totalMoney, err := unitMoney.MultiplyBy(qty)
		if err != nil {
			slog.Error("procure: total", "error", err)
			serverError(w)
			return
		}

		var pmID *int64
		if id, ok := byName["pm_id"].(int64); ok && id != 0 {
			dup := id
			pmID = &dup
		}
		hasPM := pmID != nil

		status := "pending_owner"
		if hasPM {
			status = "pending_pm"
		}

		messageText := input.message
		offer := input.offer

		var createdID int64
		err = pool.QueryRow(ctx, `INSERT INTO project_procurement_requests (project_id, requirement_id, requested_by, quantity_needed, estimated_unit_cost, estimated_cost, message, offer_to_buy, status, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, requirementID, viewer.id, input.quantityText, unitCostText, nullableTotal(hasPM, totalMoney), messageText, offer, status).Scan(&createdID)
		if err != nil {
			slog.Error("procure: insert", "error", err)
			serverError(w)
			return
		}

		unit, _ := row.byName["unit"].(string)
		name, _ := row.byName["name"].(string)

		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "procurement_requested", "Requested procurement for "+name+" ("+input.quantityText+" "+unit+")"); err != nil {
			slog.Error("procure: log", "error", err)
			serverError(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("procure: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if hasPM {
			var pmUserID int64
			if err := tx.QueryRow(ctx, `SELECT user_id FROM project_managers WHERE id = $1`, *pmID).Scan(&pmUserID); err != nil {
				slog.Error("procure: pm", "error", err)
				serverError(w)
				return
			}
			data := mysqlJSONPair(`"project_id": `+strconv.FormatInt(projectID, 10), `"request_id": `+strconv.FormatInt(createdID, 10))
			if err := insertNotification(ctx, tx, pmUserID, "verification_required", "Material Procurement Requested",
				"A new request for "+name+" ("+input.quantityText+" "+unit+") is pending your review.", data); err != nil {
				slog.Error("procure: notify pm", "error", err)
				serverError(w)
				return
			}
		} else {
			whole := terminplan.FormatWhole(totalMoney)
			reason := messageText
			if reason == "" {
				reason = "N/A"
			}
			var addendumID int64
			if err := tx.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, description, amount, status, procurement_request_id, created_at, updated_at)
				VALUES ($1, 'pm_material', $2, $3, $4, $5, 'pending_approval', $6, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
				projectID, viewer.id, "Material Procurement: "+name,
				"Direct request for "+input.quantityText+" "+unit+" of "+name+" (No PM assigned). Cost: Rp "+whole+". Reason: "+reason,
				totalMoney.Decimal(), createdID).Scan(&addendumID); err != nil {
				slog.Error("procure: addendum", "error", err)
				serverError(w)
				return
			}
			data := mysqlJSONPair(`"project_id": `+strconv.FormatInt(projectID, 10), `"request_id": `+strconv.FormatInt(createdID, 10), `"addendum_id": `+strconv.FormatInt(addendumID, 10))
			if err := insertNotification(ctx, tx, ownerID, "budget_approval_needed", "Budget Authorization Needed",
				"Direct procurement request for "+name+". Authorize Rp "+whole+" to proceed.", data); err != nil {
				slog.Error("procure: notify owner", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("procure: commit", "error", err)
			serverError(w)
			return
		}

		created, err := loadProcurement(ctx, pool, createdID)
		if err != nil {
			slog.Error("procure: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", procurementCreateResponse(created))

		writeJSON(w, http.StatusOK, payload)
	}
}

// procurementGate admits the hired kontraktor, an active helper sub
// under the kontraktor, the assigned PM, and the owner — and nobody
// else. It mirrors the oracle's explicit four-way check, including the
// `active`-status sub-professional rule.
func procurementGate(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID, ownerID int64) bool {
	if viewer.id == ownerID {
		return true
	}

	subject, err := loadSubject(ctx, pool, viewer.id)
	if err != nil {
		return false
	}

	parties, err := loadProjectParties(ctx, pool, projectID)
	if err != nil {
		return false
	}

	if subject.RoleType() == "kontraktor" && authz.Matches(parties, subject, identity.RoleKontraktor) {
		return true
	}

	var activeSub bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2 AND parent_role = 'kontraktor' AND status::text = 'active')`,
		projectID, viewer.id).Scan(&activeSub); err == nil && activeSub {
		return true
	}

	if subject.RoleType() == "project_manager" {
		if hired := parties.HiredProfileID(identity.RoleProjectManager); hired != nil && hired.Valid() {
			if own, ok := viewer.profiles["project_manager"]; ok && own == int64(*hired) {
				return true
			}
		}
	}

	return false
}

// procurementInput is one validated procurement request.
type procurementInput struct {
	quantityText  string
	estimatedText string
	message       string
	offer         bool
}

// validateProcurement enforces quantity_needed required|numeric|min:0.01,
// estimated_unit_cost nullable|numeric|min:0, message nullable|string|max:500
// and offer_to_buy nullable|boolean — true/false/1/0/"1"/"0", nothing else.
func validateProcurement(fields map[string]any, failures *errorBag) (procurementInput, bool) {
	var input procurementInput
	ok := true

	if raw, present := fields["quantity_needed"]; !present || raw == nil {
		failures.add("quantity_needed", requiredMsg(attrName("quantity_needed")))
		ok = false
	} else if text, present := numericTextOf(raw); !present || text == "" {
		failures.add("quantity_needed", "The quantity needed field must be a number.")
		ok = false
	} else if !isNumericText(text) {
		failures.add("quantity_needed", "The quantity needed field must be a number.")
		ok = false
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("quantity_needed", "The quantity needed field must be a number.")
		ok = false
	} else {
		input.quantityText = text
		if parsed < 0.01 {
			failures.add("quantity_needed", "The quantity needed field must be at least 0.01.")
			ok = false
		}
	}

	if raw, present := fields["estimated_unit_cost"]; present && raw != nil {
		if text, present := numericTextOf(raw); !present || text == "" {
			failures.add("estimated_unit_cost", "The estimated unit cost field must be a number.")
			ok = false
		} else if !isNumericText(text) {
			failures.add("estimated_unit_cost", "The estimated unit cost field must be a number.")
			ok = false
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add("estimated_unit_cost", "The estimated unit cost field must be a number.")
			ok = false
		} else {
			input.estimatedText = text
			if parsed < 0 {
				failures.add("estimated_unit_cost", "The estimated unit cost field must be at least 0.")
				ok = false
			}
		}
	}

	if raw, present := fields["message"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("message", "The message field must be a string.")
			ok = false
		} else if len(s) > 500 {
			failures.add("message", "The message field must not be greater than 500 characters.")
			ok = false
		} else {
			input.message = s
		}
	}

	if raw, present := fields["offer_to_buy"]; present && raw != nil {
		switch typed := raw.(type) {
		case bool:
			input.offer = typed
		case string:
			if typed == "1" {
				input.offer = true
			} else if typed == "0" {
				input.offer = false
			} else {
				failures.add("offer_to_buy", "The offer to buy field must be true or false.")
				ok = false
			}
		default:
			if text, present := numericTextOf(raw); present && text != "" {
				if text == "1" {
					input.offer = true
				} else if text == "0" {
					input.offer = false
				} else {
					failures.add("offer_to_buy", "The offer to buy field must be true or false.")
					ok = false
				}
			} else {
				failures.add("offer_to_buy", "The offer to buy field must be true or false.")
				ok = false
			}
		}
	}

	return input, ok
}

// nullableTotal renders the estimated total, or null on the PM path.
func nullableTotal(hasPM bool, total money.Money) any {
	if hasPM {
		return nil
	}
	return total.Decimal()
}

// procurementCreateResponse renders the 200 in create order: the
// assigned fields as written, then project_id, the timestamps and id.
func procurementCreateResponse(row procurementRow) *jsonphp.Object {
	byName := row.byName

	entry := jsonphp.NewObject()
	entry.Set("requirement_id", nullableInt64(intPtrOf(byName["requirement_id"])))
	entry.Set("requested_by", nullableInt64(intPtrOf(byName["requested_by"])))
	entry.Set("quantity_needed", decimalOrNilBid(byName, "quantity_needed"))
	entry.Set("estimated_unit_cost", decimalOrNilBid(byName, "estimated_unit_cost"))
	entry.Set("estimated_cost", decimalOrNilBid(byName, "estimated_cost"))
	entry.Set("message", nullableString(stringPtrOf(byName["message"])))
	entry.Set("offer_to_buy", boolOrFalse(byName["offer_to_buy"]))
	entry.Set("status", nullableString(stringPtrOf(byName["status"])))
	entry.Set("project_id", nullableInt64(intPtrOf(byName["project_id"])))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", nullableInt64(intPtrOf(byName["id"])))

	return entry
}
