package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// REQUIREMENT STOCK — restock, use and usage.
//
// Three narrow writes on one requirement, all behind a transaction with a
// row lock. restock adds to quantity_on_site; use and usage (logUsage)
// move stock on_site → used, refusing below zero with the plain 422.
// restock and use answer message + requirement + history (the requirement
// bare — columns plus image_url, no user — and the history with its
// actor); usage answers the bare requirement under `data`.
//
// THE GATE IS NARROWER HERE. restock and use admit only the owner, the
// hired kontraktor and the assigned PM — an arsitek or interior
// colleague reads the BOM but never mints stock. usage (logUsage) keeps
// the full BOM gate. A notary or a stranger reads 403 on all three.

// stockGate reports whether the caller may move stock: the owner, the
// hired kontraktor, or the assigned PM.
func stockGate(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64, ownerID int64) (bool, error) {
	if viewer.id == ownerID {
		return true, nil
	}

	subject, err := loadSubject(ctx, pool, viewer.id)
	if err != nil {
		return false, err
	}

	parties, err := loadProjectParties(ctx, pool, projectID)
	if err != nil {
		return false, err
	}

	if subject.RoleType() == "kontraktor" && authz.Matches(parties, subject, identity.RoleKontraktor) {
		return true, nil
	}

	if subject.RoleType() == "project_manager" {
		if hired := parties.HiredProfileID(identity.RoleProjectManager); hired != nil && hired.Valid() {
			if own, ok := viewer.profiles["project_manager"]; ok && own == int64(*hired) {
				return true, nil
			}
		}
	}

	return false, nil
}

// validateStockQuantity enforces required|numeric|min:0.01 plus the
// nullable notes cap. It returns the quantity text as submitted — the
// activity line echoes the raw figure ("5.5", never "5.50").
func validateStockQuantity(fields map[string]any, failures *errorBag) (quantity, notes string, notesSet bool, ok bool) {
	ok = true

	if raw, present := fields["quantity"]; !present || raw == nil {
		failures.add("quantity", requiredMsg(attrName("quantity")))
		return "", "", false, false
	} else if text, present := numericTextOf(raw); !present || text == "" {
		failures.add("quantity", "The quantity field must be a number.")
		return "", "", false, false
	} else if !isNumericText(text) {
		failures.add("quantity", "The quantity field must be a number.")
		return "", "", false, false
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("quantity", "The quantity field must be a number.")
		return "", "", false, false
	} else {
		quantity = text
		if parsed < 0.01 {
			failures.add("quantity", "The quantity field must be at least 0.01.")
			return "", "", false, false
		}
	}

	if raw, present := fields["notes"]; present && raw != nil {
		notesSet = true
		if s, isStr := raw.(string); !isStr {
			failures.add("notes", "The notes field must be a string.")
			ok = false
		} else if len(s) > 1000 {
			failures.add("notes", "The notes field must not be greater than 1000 characters.")
			ok = false
		} else {
			notes = s
		}
	}

	return quantity, notes, notesSet, ok && failures.empty()
}

// stockRequirement loads the requirement or answers the binding/model
// 404. It returns false when it answered.
func stockRequirement(w http.ResponseWriter, r *http.Request, ctx context.Context, pool *pgxpool.Pool, projectID int64, rawReq string) (requirementRow, bool) {
	requirementID, err := strconv.ParseInt(rawReq, 10, 64)
	if err != nil {
		modelNotFound(w, `App\Models\ProjectRequirement`, rawReq)
		return requirementRow{}, false
	}

	row, err := loadRequirement(ctx, pool, requirementID)
	if err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\ProjectRequirement`, rawReq)
			return requirementRow{}, false
		}
		slog.Error("stock: load", "error", err)
		serverError(w)
		return requirementRow{}, false
	}

	if projectOf(row) != projectID {
		message(w, http.StatusNotFound, "Not found.")
		return requirementRow{}, false
	}

	return row, true
}

// stockProject loads the project row or answers the model 404.
func stockProject(w http.ResponseWriter, ctx context.Context, pool *pgxpool.Pool, projectID int64, raw string) (int64, bool) {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\Project`, raw)
			return 0, false
		}
		slog.Error("stock: project", "error", err)
		serverError(w)
		return 0, false
	}

	ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)
	return ownerID, true
}

// RestockHandler serves
// `POST /api/projects/{project}/requirements/{requirement}/restock`.
func RestockHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stockHandler(w, r, pool, "restock")
	}
}

// UseHandler serves
// `POST /api/projects/{project}/requirements/{requirement}/use`.
func UseHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stockHandler(w, r, pool, "use")
	}
}

// UsageHandler serves
// `POST /api/projects/{project}/requirements/{requirement}/usage`
// (logUsage: the full BOM gate, the bare requirement under `data`).
func UsageHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stockHandler(w, r, pool, "usage")
	}
}

// stockHandler runs the restock/use/usage writes. `kind` selects the
// gate (narrow for restock/use, full BOM for usage), the history type
// and notes default, the activity action, and the response envelope.
func stockHandler(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, kind string) {
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
		slog.Error("stock: viewer", "error", err)
		serverError(w)
		return
	}

	ownerID, ok := stockProject(w, ctx, pool, projectID, rawProject)
	if !ok {
		return
	}

	row, ok := stockRequirement(w, r, ctx, pool, projectID, rawReq)
	if !ok {
		return
	}

	if kind == "usage" {
		allowed, err := requirementGate(ctx, pool, viewer, projectID, ownerID)
		if err != nil {
			slog.Error("stock: gate", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
	} else {
		allowed, err := stockGate(ctx, pool, viewer, projectID, ownerID)
		if err != nil {
			slog.Error("stock: gate", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
	}

	formFields, _, err := requestFields(r)
	if err != nil {
		message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
		return
	}

	failures := &errorBag{}
	quantity, notes, _, valid := validateStockQuantity(formFields, failures)
	if !valid || !failures.empty() {
		failures.write(w)
		return
	}

	requirementID, _ := strconv.ParseInt(rawReq, 10, 64)

	historyType := "restock"
	historyNotes := "Manual stock addition."
	activityAction := "external_procurement"
	activityVerb := "Restocked"
	if kind != "restock" {
		historyType = "use"
		historyNotes = "Logged material usage."
		if kind == "usage" {
			historyNotes = "Usage logged."
		}
		activityAction = "material_used"
		activityVerb = "Used"
	}
	if notes != "" || stockNotesSet(formFields) {
		historyNotes = notes
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		slog.Error("stock: begin", "error", err)
		serverError(w)
		return
	}
	defer tx.Rollback(ctx)

	var onSite *string
	if err := tx.QueryRow(ctx, `SELECT quantity_on_site::text FROM project_requirements WHERE id = $1 FOR UPDATE`, requirementID).Scan(&onSite); err != nil {
		slog.Error("stock: lock", "error", err)
		serverError(w)
		return
	}

	if kind != "restock" {
		if stockLess(onSite, quantity) {
			message(w, http.StatusUnprocessableEntity, "Insufficient stock on site.")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE project_requirements SET quantity_on_site = quantity_on_site - $2::numeric, quantity_used = quantity_used + $2::numeric, updated_at = date_trunc('second', now()) WHERE id = $1`, requirementID, quantity); err != nil {
			slog.Error("stock: consume", "error", err)
			serverError(w)
			return
		}
	} else {
		if _, err := tx.Exec(ctx, `UPDATE project_requirements SET quantity_on_site = quantity_on_site + $2::numeric, updated_at = date_trunc('second', now()) WHERE id = $1`, requirementID, quantity); err != nil {
			slog.Error("stock: restock", "error", err)
			serverError(w)
			return
		}
	}

	unit, _ := row.byName["unit"].(string)
	name, _ := row.byName["name"].(string)

	var historyID int64
	if err := tx.QueryRow(ctx, `INSERT INTO project_requirement_histories (project_requirement_id, user_id, type, quantity, notes, created_at, updated_at) VALUES ($1, $2, $3, $4::numeric, $5, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
		requirementID, viewer.id, historyType, quantity, historyNotes).Scan(&historyID); err != nil {
		slog.Error("stock: history", "error", err)
		serverError(w)
		return
	}

	if err := insertActivityLog(ctx, tx, projectID, viewer.id, activityAction, activityVerb+" "+quantity+" "+unit+" of "+name); err != nil {
		slog.Error("stock: log", "error", err)
		serverError(w)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("stock: commit", "error", err)
		serverError(w)
		return
	}

	refreshed, err := loadRequirement(ctx, pool, requirementID)
	if err != nil {
		slog.Error("stock: reload", "error", err)
		serverError(w)
		return
	}

	reqEntry := historyRequirement(ctx, refreshed)

	if kind == "usage" {
		payload := jsonphp.NewObject()
		payload.Set("data", reqEntry)
		writeJSON(w, http.StatusOK, payload)
		return
	}

	hrow, err := loadHistory(ctx, pool, historyID)
	if err != nil {
		slog.Error("stock: history reload", "error", err)
		serverError(w)
		return
	}

	histEntry, err := historyCreateResponse(ctx, pool, hrow)
	if err != nil {
		slog.Error("stock: history render", "error", err)
		serverError(w)
		return
	}

	payload := jsonphp.NewObject()
	if kind == "restock" {
		payload.Set("message", "Material successfully restocked.")
	} else {
		payload.Set("message", "Material usage logged.")
	}
	payload.Set("requirement", reqEntry)
	payload.Set("history", histEntry)

	writeJSON(w, http.StatusOK, payload)
}

// stockNotesSet reports whether an explicit notes key arrived (even
// null) — an explicit null writes SQL NULL, not the default text.
func stockNotesSet(fields map[string]any) bool {
	raw, present := fields["notes"]
	return present && raw == nil
}

// stockLess compares two decimal texts as floats, the way the oracle's
// loose comparison does.
func stockLess(onSite *string, quantity string) bool {
	if onSite == nil {
		return true
	}
	have, err := strconv.ParseFloat(*onSite, 64)
	if err != nil {
		return true
	}
	want, err := strconv.ParseFloat(quantity, 64)
	if err != nil {
		return false
	}
	return have < want
}

// historyCreateResponse renders a fresh history row in create order:
// the fillable keys as assigned, then updated_at, created_at, id, and
// the actor. A re-read emits table order instead — and the oracle
// answers create order on every one of these 200s.
func historyCreateResponse(ctx context.Context, pool *pgxpool.Pool, row historyRow) (*jsonphp.Object, error) {
	byName := row.byName

	entry := jsonphp.NewObject()
	entry.Set("project_requirement_id", nullableInt64(intPtrOf(byName["project_requirement_id"])))
	entry.Set("user_id", nullableInt64(intPtrOf(byName["user_id"])))
	entry.Set("type", nullableString(stringPtrOf(byName["type"])))
	entry.Set("quantity", decimalOrNilBid(byName, "quantity"))
	entry.Set("notes", nullableString(stringPtrOf(byName["notes"])))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", nullableInt64(intPtrOf(byName["id"])))

	user, err := nullableUser(ctx, pool, intPtrOf(byName["user_id"]))
	if err != nil {
		return nil, err
	}
	entry.Set("user", user)

	return entry, nil
}

// stringPtrOf reads an optional text column.
func stringPtrOf(value any) *string {
	if s, ok := value.(string); ok {
		dup := s
		return &dup
	}
	return nil
}
func loadHistory(ctx context.Context, pool *pgxpool.Pool, historyID int64) (historyRow, error) {
	rows, err := pool.Query(ctx, `SELECT * FROM project_requirement_histories WHERE id = $1`, historyID)
	if err != nil {
		return historyRow{}, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return historyRow{}, err
		}
		return historyRow{}, errNoHistory
	}

	row, err := scanHistoryRow(rows, 8)
	if err != nil {
		return historyRow{}, err
	}
	if err := rows.Err(); err != nil {
		return historyRow{}, err
	}

	return row, nil
}

var errNoHistory = noHistoryError{}

type noHistoryError struct{}

func (noHistoryError) Error() string { return "history row vanished mid-request" }
