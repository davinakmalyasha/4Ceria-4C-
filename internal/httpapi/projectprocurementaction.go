package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/domain/terminplan"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROCUREMENT DECISIONS — the assigned PM verifies or rejects.
//
// Verify moves pending_pm → pending_owner at a PM-set estimated cost,
// minting the pm_material addendum, an owner authorization notification
// and a verified activity line, answering message + the full row with
// its requirement. Reject flips any state to rejected with a mandatory
// note, notifies the requester, and answers the bare row. The gates
// differ on purpose: verify names the PM at length, reject answers the
// bare word both stacks have always served.
// The list lives in projectrequirementprocure.go; the row type, scanner,
// entry renderer and by-id loader live there too and are reused here.

// VerifyProcurementHandler serves
// `POST /api/projects/{project}/procurement-requests/{procurementRequest}/verify`.
func VerifyProcurementHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		rawReq := r.PathValue("procurementRequest")
		if rawReq == "" {
			rawReq = lastPathSegment(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("proc-verify: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("proc-verify: project", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		var pmID int64
		if id, ok := byName["pm_id"].(int64); ok {
			pmID = id
		}

		if viewer.role != "project_manager" || pmID == 0 || viewer.profiles["project_manager"] != pmID {
			message(w, http.StatusForbidden, "Unauthorized. Only the assigned PM can verify procurement requests.")
			return
		}

		row, ok := stockProcurement(w, ctx, pool, projectID, rawReq)
		if !ok {
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}
		costText, note, noteSet := validateVerify(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if status, _ := row.byName["status"].(string); status != "pending_pm" {
			message(w, http.StatusUnprocessableEntity, "Request is not in a verifiable state")
			return
		}

		var openID int64
		var openTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
			message(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		cost, err := money.FromColumn(costText, "IDR")
		if err != nil {
			slog.Error("proc-verify: cost", "error", err)
			serverError(w)
			return
		}

		requirementID := intPtrDeref(row.byName["requirement_id"])
		req, err := loadRequirement(ctx, pool, requirementID)
		if err != nil {
			slog.Error("proc-verify: requirement", "error", err)
			serverError(w)
			return
		}
		reqName, _ := req.byName["name"].(string)
		reqUnit, _ := req.byName["unit"].(string)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("proc-verify: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		procurementID, _ := row.byName["id"].(int64)
		var pmNoteValue any
		if noteSet {
			pmNoteValue = note
		}
		if _, err := tx.Exec(ctx, `UPDATE project_procurement_requests SET estimated_cost = $2::numeric, pm_note = $3, status = 'pending_owner', updated_at = date_trunc('second', now()) WHERE id = $1`,
			procurementID, cost.Decimal(), pmNoteValue); err != nil {
			slog.Error("proc-verify: update", "error", err)
			serverError(w)
			return
		}

		pmNoteLine := note
		if !noteSet {
			pmNoteLine = "Verified by PM"
		}
		var addendumID int64
		if err := tx.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, description, amount, status, procurement_request_id, created_at, updated_at)
			VALUES ($1, 'pm_material', $2, $3, $4, $5, 'pending_approval', $6, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, viewer.id, "Material Procurement: "+reqName,
			"Request for "+inputQuantity(row)+" "+reqUnit+" of "+reqName+". PM Note: "+pmNoteLine,
			cost.Decimal(), procurementID).Scan(&addendumID); err != nil {
			slog.Error("proc-verify: addendum", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := byName["user_id"].(int64)
		whole := terminplan.FormatWhole(cost)
		data := mysqlJSONPair(`"project_id": `+strconv.FormatInt(projectID, 10), `"addendum_id": `+strconv.FormatInt(addendumID, 10), `"request_id": `+strconv.FormatInt(procurementID, 10))
		if err := insertNotification(ctx, tx, ownerID, "budget_approval_needed", "Budget Authorization Needed",
			"PM has verified a procurement request for "+reqName+". Authorize Rp "+whole+" to proceed.", data); err != nil {
			slog.Error("proc-verify: notify", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "procurement_verified",
			"PM verified procurement for "+reqName+" with estimated cost Rp "+whole); err != nil {
			slog.Error("proc-verify: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("proc-verify: commit", "error", err)
			serverError(w)
			return
		}

		refreshed, err := loadProcurement(ctx, pool, procurementID)
		if err != nil {
			slog.Error("proc-verify: reload", "error", err)
			serverError(w)
			return
		}

		entry, err := procurementEntry(ctx, pool, refreshed, true, false)
		if err != nil {
			slog.Error("proc-verify: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Request forwarded to Owner for budget approval.")
		payload.Set("data", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// RejectProcurementHandler serves
// `POST /api/projects/{project}/procurement-requests/{procurementRequest}/reject`.
func RejectProcurementHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		rawReq := r.PathValue("procurementRequest")
		if rawReq == "" {
			rawReq = lastPathSegment(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("proc-reject: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("proc-reject: project", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		var pmID int64
		if id, ok := byName["pm_id"].(int64); ok {
			pmID = id
		}

		if viewer.role != "project_manager" || pmID == 0 || viewer.profiles["project_manager"] != pmID {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		row, ok := stockProcurement(w, ctx, pool, projectID, rawReq)
		if !ok {
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}
		note := validateRejectNote(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		procurementID, _ := row.byName["id"].(int64)
		requestedBy := intPtrDeref(row.byName["requested_by"])

		requirementID := intPtrDeref(row.byName["requirement_id"])
		req, err := loadRequirement(ctx, pool, requirementID)
		if err != nil {
			slog.Error("proc-reject: requirement", "error", err)
			serverError(w)
			return
		}
		reqName, _ := req.byName["name"].(string)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("proc-reject: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE project_procurement_requests SET status = 'rejected', pm_note = $2, updated_at = date_trunc('second', now()) WHERE id = $1`,
			procurementID, note); err != nil {
			slog.Error("proc-reject: update", "error", err)
			serverError(w)
			return
		}

		data := mysqlJSONPair(`"project_id": ` + strconv.FormatInt(projectID, 10))
		if err := insertNotification(ctx, tx, requestedBy, "procurement_rejected", "Procurement Request Rejected",
			"PM rejected your request for "+reqName+". Note: "+note, data); err != nil {
			slog.Error("proc-reject: notify", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "procurement_rejected",
			"PM rejected procurement for "+reqName+"."); err != nil {
			slog.Error("proc-reject: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("proc-reject: commit", "error", err)
			serverError(w)
			return
		}

		refreshed, err := loadProcurement(ctx, pool, procurementID)
		if err != nil {
			slog.Error("proc-reject: reload", "error", err)
			serverError(w)
			return
		}

		entry, err := procurementEntry(ctx, pool, refreshed, true, false)
		if err != nil {
			slog.Error("proc-reject: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// stockProcurement loads the procurement row with the binding check:
// the row must belong to the URL project. It answers the model 404 or
// the plain 'Not found.' itself and reports whether to continue.
func stockProcurement(w http.ResponseWriter, ctx context.Context, pool *pgxpool.Pool, projectID int64, rawReq string) (procurementRow, bool) {
	procurementID, err := strconv.ParseInt(rawReq, 10, 64)
	if err != nil {
		modelNotFound(w, `App\Models\ProjectProcurementRequest`, rawReq)
		return procurementRow{}, false
	}

	row, err := loadProcurement(ctx, pool, procurementID)
	if err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\ProjectProcurementRequest`, rawReq)
			return procurementRow{}, false
		}
		slog.Error("procurement: load", "error", err)
		serverError(w)
		return procurementRow{}, false
	}

	var rowProject int64
	if id, ok := row.byName["project_id"].(int64); ok {
		rowProject = id
	}
	if rowProject != projectID {
		message(w, http.StatusNotFound, "Not found.")
		return procurementRow{}, false
	}

	return row, true
}

// validateVerify enforces estimated_cost required|numeric|min:0 and
// pm_note nullable|string|max:500.
func validateVerify(fields map[string]any, failures *errorBag) (costText, note string, noteSet bool) {
	if raw, present := fields["estimated_cost"]; !present || raw == nil {
		failures.add("estimated_cost", requiredMsg(attrName("estimated_cost")))
	} else if text, present := numericTextOf(raw); !present || text == "" {
		failures.add("estimated_cost", "The estimated cost field must be a number.")
	} else if !isNumericText(text) {
		failures.add("estimated_cost", "The estimated cost field must be a number.")
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("estimated_cost", "The estimated cost field must be a number.")
	} else {
		costText = text
		if parsed < 0 {
			failures.add("estimated_cost", "The estimated cost field must be at least 0.")
		}
	}

	if raw, present := fields["pm_note"]; present && raw != nil {
		noteSet = true
		if s, isStr := raw.(string); !isStr {
			failures.add("pm_note", "The pm note field must be a string.")
		} else if len(s) > 500 {
			failures.add("pm_note", "The pm note field must not be greater than 500 characters.")
		} else {
			note = s
		}
	}

	return costText, note, noteSet
}

// validateRejectNote enforces pm_note required|string|max:500.
func validateRejectNote(fields map[string]any, failures *errorBag) string {
	raw, present := fields["pm_note"]
	if !present || raw == nil {
		failures.add("pm_note", requiredMsg(attrName("pm_note")))
		return ""
	}
	s, isStr := raw.(string)
	if !isStr {
		failures.add("pm_note", "The pm note field must be a string.")
		return ""
	}
	if len(s) > 500 {
		failures.add("pm_note", "The pm note field must not be greater than 500 characters.")
		return ""
	}
	if s == "" {
		failures.add("pm_note", requiredMsg(attrName("pm_note")))
		return ""
	}
	return s
}

// inputQuantity renders the validated quantity text from a row.
func inputQuantity(row procurementRow) string {
	if text, ok := decimalOrNilBid(row.byName, "quantity_needed").(string); ok {
		return text
	}
	return ""
}

// loadProcurement reads one procurement row by id.
func loadProcurement(ctx context.Context, pool *pgxpool.Pool, procurementID int64) (procurementRow, error) {
	rows, err := pool.Query(ctx, `SELECT `+procurementColumns+` FROM project_procurement_requests WHERE id = $1`, procurementID)
	if err != nil {
		return procurementRow{}, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return procurementRow{}, err
		}
		return procurementRow{}, pgx.ErrNoRows
	}

	row, err := scanProcurementRow(rows, 14)
	if err != nil {
		return procurementRow{}, err
	}
	if err := rows.Err(); err != nil {
		return procurementRow{}, err
	}

	return row, nil
}
