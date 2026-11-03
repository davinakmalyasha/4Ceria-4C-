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

// REQUIREMENT HISTORY — the two read-only history surfaces.
//
// GET .../requirements-history lists every history row of the project's
// requirements (newest first) with the actor and the requirement.
// GET .../requirements/{requirement}/history scopes to one requirement
// (binding-checked, then hire-gated) and renders the same rows without
// the requirement key. Both reuse the hire gate — history is part of the
// bill of materials, never a stranger's or a notary's view.

// historyRow is one scanned history row with its columns.
type historyRow struct {
	fields []string
	values []any
	byName map[string]any
}

// scanHistoryRow reads one history row.
func scanHistoryRow(rows pgx.Rows, width int) (historyRow, error) {
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return historyRow{}, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	return historyRow{fields: fields, values: values, byName: byName}, nil
}

// historyRequirement renders the nested requirement: table columns in
// order with the decimal casts plus the image_url append — and nothing
// else. The oracle loads only the `requirement` relation (no nested
// user, no folder), so neither key appears.
func historyRequirement(ctx context.Context, row requirementRow) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range row.fields {
		value := row.byName[column]
		switch column {
		case "quantity_required", "estimated_unit_cost", "quantity_procured_externally", "external_cost", "quantity_on_site", "quantity_used":
			entry.Set(column, decimalOrNilBid(row.byName, column))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	entry.Set("image_url", requirementImageURL(ctx, row.byName["image_path"]))

	return entry
}

// historyEntry renders one history row: table columns in order with the
// decimal cast, the actor, and optionally the requirement.
func historyEntry(ctx context.Context, pool *pgxpool.Pool, row historyRow, withRequirement bool) (*jsonphp.Object, error) {
	byName := row.byName

	entry := jsonphp.NewObject()
	for _, column := range row.fields {
		value := byName[column]
		switch column {
		case "quantity":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	user, err := nullableUser(ctx, pool, intPtrOf(byName["user_id"]))
	if err != nil {
		return nil, err
	}
	entry.Set("user", user)

	if withRequirement {
		req, err := loadRequirement(ctx, pool, intPtrDeref(byName["project_requirement_id"]))
		if err != nil {
			return nil, err
		}
		entry.Set("requirement", historyRequirement(ctx, req))
	}

	return entry, nil
}

// intPtrDeref reads an integer id or zero.
func intPtrDeref(value any) int64 {
	if id := intPtrOf(value); id != nil {
		return *id
	}
	return 0
}

// ProjectHistoryHandler serves
// `GET /api/projects/{project}/requirements-history`.
func ProjectHistoryHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("reqhist: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("reqhist: project", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)

		allowed, err := requirementGate(ctx, pool, viewer, projectID, ownerID)
		if err != nil {
			slog.Error("reqhist: gate", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+requirementHistoriesColumns+` FROM project_requirement_histories WHERE project_requirement_id IN (SELECT id FROM project_requirements WHERE project_id = $1) ORDER BY created_at DESC`, projectID)
		if err != nil {
			slog.Error("reqhist: list", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			row, err := scanHistoryRow(rows, 8)
			if err != nil {
				slog.Error("reqhist: scan", "error", err)
				serverError(w)
				return
			}

			entry, err := historyEntry(ctx, pool, row, true)
			if err != nil {
				slog.Error("reqhist: render", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("reqhist: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)

		writeJSON(w, http.StatusOK, payload)
	}
}

// RequirementHistoryHandler serves
// `GET /api/projects/{project}/requirements/{requirement}/history`.
func RequirementHistoryHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		requirementID, err := strconv.ParseInt(rawReq, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\ProjectRequirement`, rawReq)
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
			slog.Error("reqhist-one: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("reqhist-one: project", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)

		row, err := loadRequirement(ctx, pool, requirementID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectRequirement`, rawReq)
				return
			}
			slog.Error("reqhist-one: load", "error", err)
			serverError(w)
			return
		}

		if projectOf(row) != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		allowed, err := requirementGate(ctx, pool, viewer, projectID, ownerID)
		if err != nil {
			slog.Error("reqhist-one: gate", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+requirementHistoriesColumns+` FROM project_requirement_histories WHERE project_requirement_id = $1 ORDER BY created_at DESC`, requirementID)
		if err != nil {
			slog.Error("reqhist-one: list", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			hrow, err := scanHistoryRow(rows, 8)
			if err != nil {
				slog.Error("reqhist-one: scan", "error", err)
				serverError(w)
				return
			}

			entry, err := historyEntry(ctx, pool, hrow, false)
			if err != nil {
				slog.Error("reqhist-one: render", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("reqhist-one: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)

		writeJSON(w, http.StatusOK, payload)
	}
}

// historyRequirementID reads the segment before a trailing "history".
func historyRequirementID(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] == "history" && i > 0 {
			return parts[i-1]
		}
	}
	return lastPathSegment(path)
}
