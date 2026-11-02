package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MATERIAL FOLDERS — the BOM grouping used by requirements.
//
// All four routes sit behind `isAuthorizedPro`: the owner, the assigned PM,
// or a HIRED professional in any of the five licensed roles (the interior
// check is role AND hire, after an unscoped-role bug let any interior user
// edit folders). The list and the update answer the folder with its
// creator; create answers the CREATED model in create order (name,
// created_by, bom_type, project_id, timestamps, id, creator); delete
// detaches its requirements first and answers a bare message.

// materialFolderColumns is the folder table order.
var materialFolderColumns = []string{
	"id", "project_id", "name", "bom_type", "created_by", "created_at", "updated_at",
}

// materialFolderAuthorized mirrors isAuthorizedPro.
func materialFolderAuthorized(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64) bool {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		return false
	}
	byName := projectColumnsByName(fields, values)
	ownerID, _ := byName["user_id"].(int64)
	if viewer.id == ownerID {
		return true
	}

	var pmID *int64
	if id, ok := byName["pm_id"].(int64); ok {
		pmID = &id
	}
	if viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID) {
		return true
	}

	selected := map[string]string{
		"selected_arsitek_id":    "arsitek",
		"selected_kontraktor_id": "kontraktor",
		"selected_interior_id":   "interior",
		"structural_id":          "structural",
		"mep_id":                 "mep",
	}
	for column, role := range selected {
		if viewer.role != role {
			continue
		}
		raw, ok := byName[column]
		if !ok || raw == nil {
			continue
		}
		if id, ok := raw.(int64); ok && id != 0 && viewer.profiles[role] == id {
			return true
		}
	}
	return false
}

// materialFolderObject renders a folder in table order with its creator.
func materialFolderObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range materialFolderColumns {
		value := byName[column]
		switch column {
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	if creator := intPtrDeref(byName["created_by"]); creator != 0 {
		block, err := fullProfileUser(ctx, pool, creator, false)
		if err != nil {
			block = nil
		}
		entry.Set("creator", block)
	} else {
		entry.Set("creator", nil)
	}
	return entry
}

// materialFolderCreatedObject renders Eloquent's CREATED model.
func materialFolderCreatedObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("name", projectRawValue(byName["name"]))
	entry.Set("created_by", projectRawValue(byName["created_by"]))
	entry.Set("bom_type", projectRawValue(byName["bom_type"]))
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	if creator := intPtrDeref(byName["created_by"]); creator != 0 {
		block, err := fullProfileUser(ctx, pool, creator, false)
		if err != nil {
			block = nil
		}
		entry.Set("creator", block)
	} else {
		entry.Set("creator", nil)
	}
	return entry
}

// loadMaterialFolder reads one folder bound to the project.
func loadMaterialFolder(ctx context.Context, pool *pgxpool.Pool, projectID, folderID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, name, bom_type, created_by, created_at, updated_at
		FROM project_material_folders WHERE id = $1 AND project_id = $2`, folderID, projectID)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, false, rows.Err()
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, false, err
	}
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}
	return byName, true, rows.Err()
}

// MaterialFoldersIndexHandler serves
// `GET /api/projects/{project}/material-folders`.
func MaterialFoldersIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("folders: viewer", "error", err)
			serverError(w)
			return
		}

		if !materialFolderAuthorized(ctx, pool, viewer, projectID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT id, project_id, name, bom_type, created_by, created_at, updated_at
			FROM project_material_folders WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			slog.Error("folders: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("folders: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			out = append(out, materialFolderObject(ctx, pool, byName))
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreMaterialFolderHandler serves
// `POST /api/projects/{project}/material-folders`.
func StoreMaterialFolderHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("folders-store: viewer", "error", err)
			serverError(w)
			return
		}

		if !materialFolderAuthorized(ctx, pool, viewer, projectID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		name, bomType := validateMaterialFolder(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var folderID int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO project_material_folders (project_id, name, created_by, bom_type, created_at, updated_at)
			VALUES ($1, $2, $3, $4, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`, projectID, name, viewer.id, bomType).Scan(&folderID, &createdAt, &updatedAt); err != nil {
			slog.Error("folders-store: insert", "error", err)
			serverError(w)
			return
		}

		byName := map[string]any{
			"id": folderID, "project_id": projectID, "name": name,
			"bom_type": bomType, "created_by": viewer.id,
			"created_at": createdAt, "updated_at": updatedAt,
		}

		payload := jsonphp.NewObject()
		payload.Set("data", materialFolderCreatedObject(ctx, pool, byName))
		writeJSON(w, http.StatusCreated, payload)
	}
}

// UpdateMaterialFolderHandler serves
// `PUT /api/projects/{project}/material-folders/{folder}`.
func UpdateMaterialFolderHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawFolder := r.PathValue("folder")
		if rawFolder == "" {
			rawFolder = lastPathSegment(r.URL.Path)
		}
		folderID, parseErr := strconv.ParseInt(rawFolder, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectMaterialFolder`, rawFolder)
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
			slog.Error("folders-update: viewer", "error", err)
			serverError(w)
			return
		}

		if _, found, err := loadMaterialFolder(ctx, pool, projectID, folderID); err != nil || !found {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		if !materialFolderAuthorized(ctx, pool, viewer, projectID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		name, bomType := validateMaterialFolder(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}
		_ = bomType

		if _, err := pool.Exec(ctx, `UPDATE project_material_folders SET name = $2, updated_at = date_trunc('second', now()) WHERE id = $1`,
			folderID, name); err != nil {
			slog.Error("folders-update: update", "error", err)
			serverError(w)
			return
		}

		byName, found, err := loadMaterialFolder(ctx, pool, projectID, folderID)
		if err != nil || !found {
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", materialFolderObject(ctx, pool, byName))
		writeJSON(w, http.StatusOK, payload)
	}
}

// DestroyMaterialFolderHandler serves
// `DELETE /api/projects/{project}/material-folders/{folder}`.
func DestroyMaterialFolderHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawFolder := r.PathValue("folder")
		if rawFolder == "" {
			rawFolder = lastPathSegment(r.URL.Path)
		}
		folderID, parseErr := strconv.ParseInt(rawFolder, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectMaterialFolder`, rawFolder)
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
			slog.Error("folders-destroy: viewer", "error", err)
			serverError(w)
			return
		}

		if _, found, err := loadMaterialFolder(ctx, pool, projectID, folderID); err != nil || !found {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		if !materialFolderAuthorized(ctx, pool, viewer, projectID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_requirements SET folder_id = NULL, updated_at = date_trunc('second', now()) WHERE folder_id = $1`, folderID); err != nil {
			slog.Error("folders-destroy: detach", "error", err)
			serverError(w)
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM project_material_folders WHERE id = $1`, folderID); err != nil {
			slog.Error("folders-destroy: delete", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Folder deleted successfully.")
	}
}

// validateMaterialFolder enforces name required|string|max:255 and
// bom_type nullable|string|in:raw,finishing (default raw).
func validateMaterialFolder(fields map[string]any, failures *errorBag) (string, string) {
	name := ""
	bomType := "raw"

	raw, present := fields["name"]
	if !present || raw == nil {
		failures.add("name", "The name field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("name", "The name field must be a string.")
	} else if s == "" {
		failures.add("name", "The name field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("name", "The name field must not be greater than 255 characters.")
	} else {
		name = s
	}

	if raw, present := fields["bom_type"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("bom_type", "The selected bom type is invalid.")
		} else if s == "" {
			// absent
		} else if s != "raw" && s != "finishing" {
			failures.add("bom_type", "The selected bom type is invalid.")
		} else {
			bomType = s
		}
	}

	return name, bomType
}
