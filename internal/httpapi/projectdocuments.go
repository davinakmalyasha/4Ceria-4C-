package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT DOCUMENTS — the list route and the two resource projections.
//
// `GET /api/projects/{project}/documents` answers the raw document rows
// (table order plus the `file_url` append and the loaded uploader) behind
// the project-access gate, with an optional `?target_role=` filter. The
// resource's `documents` block is a DIFFERENT, narrower projection
// (11 keys, uploader trimmed to id/name/role_type) — the seals and
// verify-legal render it, so both live here.
//
// `comments` is the resource's thread projection (message duplicated as
// `content` for the SPA, the author's `pic` as `profile_picture`).

// docColumns is the document table order.
var docColumns = []string{
	"id", "project_id", "uploader_id", "parent_id", "file_name", "description",
	"version", "file_path", "category", "target_role", "status", "review_note",
	"reviewed_at", "version_label", "file_type", "created_at", "updated_at",
}

// DocumentsIndexHandler serves
// `GET /api/projects/{project}/documents`.
func DocumentsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("docs: viewer", "error", err)
			serverError(w)
			return
		}

		if _, _, err := projectRowByID(ctx, pool, projectID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("docs: project", "error", err)
			serverError(w)
			return
		}

		allowed, err := documentAccess(ctx, pool, viewer, projectID)
		if err != nil {
			slog.Error("docs: access", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized. You must be assigned to this project to view documents.")
			return
		}

		query := `SELECT id, project_id, uploader_id, parent_id, file_name, description, version, file_path,
			category, target_role, status, review_note, reviewed_at, version_label, file_type, created_at, updated_at
			FROM project_documents WHERE project_id = $1`
		args := []any{projectID}
		if role := r.URL.Query().Get("target_role"); role != "" {
			query += ` AND target_role = $2`
			args = append(args, role)
		}
		query += ` ORDER BY id`

		rows, err := pool.Query(ctx, query, args...)
		if err != nil {
			slog.Error("docs: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("docs: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}

			entry := jsonphp.NewObject()
			for _, column := range docColumns {
				value := byName[column]
				switch column {
				case "reviewed_at":
					// ProjectDocument has no casts: reviewed_at stays a raw
					// MySQL datetime string.
					entry.Set(column, mysqlDateTime(value))
				case "created_at", "updated_at":
					entry.Set(column, projectTimeValue(value))
				default:
					entry.Set(column, projectRawValue(value))
				}
			}
			// The `file_url` append: private/vault paths resolve through the
			// vault, everything else through the public disk's URL. A signed
			// URL is environment-dependent, so documents with rows stay out of
			// the byte gate (same class as dispute evidence).
			entry.Set("file_url", documentFileURL(ctx, byName))
			if uploader := intPtrDeref(byName["uploader_id"]); uploader != 0 {
				block, uerr := fullProfileUser(ctx, pool, uploader, false)
				if uerr != nil {
					block = nil
				}
				entry.Set("uploader", block)
			} else {
				entry.Set("uploader", nil)
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("docs: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// documentAccess mirrors the controller's canAccess: owner, assigned PM,
// any hired professional, or an active sub-professional.
func documentAccess(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64) (bool, error) {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		return false, err
	}
	byName := projectColumnsByName(fields, values)
	ownerID, _ := byName["user_id"].(int64)

	if viewer.id == ownerID {
		return true, nil
	}
	var pmID *int64
	if id, ok := byName["pm_id"].(int64); ok {
		pmID = &id
	}
	if viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID) {
		return true, nil
	}

	selected := map[string]string{
		"selected_arsitek_id":    "arsitek",
		"selected_kontraktor_id": "kontraktor",
		"selected_notaris_id":    "notaris",
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
			return true, nil
		}
	}

	var active bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2 AND status::text = 'active')`,
		projectID, viewer.id).Scan(&active); err != nil {
		return false, err
	}
	return active, nil
}

// documentFileURL mirrors the `file_url` accessor: vault paths resolve
// through the storage helper, absolute URLs pass through, everything else
// falls back to the public asset URL.
func documentFileURL(ctx context.Context, byName map[string]any) any {
	path, _ := byName["file_path"].(string)
	return resolveStorageURL(ctx, path)
}

// resourceDocuments renders the resource's `documents` projection.
func resourceDocuments(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, file_name, file_path, file_type, category, status, target_role,
		version_label, review_note, reviewed_at, uploader_id, created_at
		FROM project_documents WHERE project_id = $1 ORDER BY id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var id, uploaderID, parentID *int64
		var fileName, filePath, fileType, category, status, targetRole, versionLabel, reviewNote *string
		var reviewedAt, createdAt any
		if err := rows.Scan(&id, &fileName, &filePath, &fileType, &category, &status, &targetRole,
			&versionLabel, &reviewNote, &reviewedAt, &uploaderID, &createdAt); err != nil {
			return nil, err
		}
		_ = parentID

		entry := jsonphp.NewObject()
		entry.Set("id", nullableInt64(id))
		entry.Set("file_name", nullableString(fileName))
		path := ""
		if filePath != nil {
			path = *filePath
		}
		entry.Set("file_path", resolveStorageURL(ctx, path))
		entry.Set("file_type", nullableString(fileType))
		entry.Set("category", nullableString(category))
		entry.Set("status", nullableString(status))
		entry.Set("target_role", nullableString(targetRole))
		entry.Set("version_label", nullableString(versionLabel))
		entry.Set("review_note", nullableString(reviewNote))
		entry.Set("reviewed_at", mysqlDateTime(reviewedAt))
		if uploaderID != nil && *uploaderID != 0 {
			block := jsonphp.NewObject()
			var name string
			var role *string
			if err := pool.QueryRow(ctx, `SELECT name, role_type::text FROM users WHERE id = $1`, *uploaderID).Scan(&name, &role); err == nil {
				block.Set("id", *uploaderID)
				block.Set("name", name)
				block.Set("role_type", nullableString(role))
				entry.Set("uploader", block)
			} else {
				entry.Set("uploader", nil)
			}
		} else {
			entry.Set("uploader", nil)
		}
		entry.Set("created_at", projectTimeValue(createdAt))
		out = append(out, entry)
	}
	return out, rows.Err()
}

// resourceComments renders the resource's `comments` projection.
func resourceComments(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, user_id, project_id, message, parent_id, created_at, updated_at
		FROM project_comments WHERE project_id = $1 ORDER BY id`, projectID)
	if err != nil {
		// The comments table may not exist in a scratch mirror; an absent
		// relation renders as an empty list, not a 500.
		if isNoRows(err) || strings.Contains(err.Error(), "does not exist") {
			return []any{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var id, userID, projID, parentID *int64
		var message *string
		var createdAt, updatedAt any
		if err := rows.Scan(&id, &userID, &projID, &message, &parentID, &createdAt, &updatedAt); err != nil {
			return nil, err
		}

		entry := jsonphp.NewObject()
		entry.Set("id", nullableInt64(id))
		entry.Set("user_id", nullableInt64(userID))
		entry.Set("project_id", nullableInt64(projID))
		entry.Set("message", nullableString(message))
		entry.Set("content", nullableString(message))
		entry.Set("parent_id", nullableInt64(parentID))
		if userID != nil && *userID != 0 {
			var name string
			var pic *string
			if err := pool.QueryRow(ctx, `SELECT name, pic FROM users WHERE id = $1`, *userID).Scan(&name, &pic); err == nil {
				block := jsonphp.NewObject()
				block.Set("id", *userID)
				block.Set("name", name)
				block.Set("profile_picture", projectStorageURL(ctx, nullableString(pic)))
				entry.Set("user", block)
			} else {
				entry.Set("user", nil)
			}
		} else {
			entry.Set("user", nil)
		}
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		out = append(out, entry)
	}
	return out, rows.Err()
}
