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

// DOCUMENT WRITES — upload, rename, delete and verify.
//
//   - store: any project participant may upload (owner, assigned PM, hired
//     pro, active sub-professional); the file lands on the vault disk under
//     `project_documents/`, and a `parent_id` mints the next VERSION of that
//     document, inheriting its category and target role;
//   - update: the uploader or the owner may rename it, and a verified or
//     approved document is LOCKED (403);
//   - destroy: the same gates and lock, removing the file from the same
//     disk it was written to, logging `document_deleted`;
//   - verify: only the owner or the assigned PM, flipping the status and
//     logging `document_verified`.
//
// The upload answer is the raw model with its uploader loaded — not the
// resource's projection — so `file_url` (an environment-dependent URL)
// travels with it; the byte gate therefore holds only the failure paths.

// documentStatuses is the store/validation vocabulary.
var documentStatuses = map[string]bool{
	"uploaded": true, "under_review": true, "awaiting_signature": true, "legally_binding": true,
}

// documentTargetRoles is the store/validation vocabulary.
var documentTargetRoles = map[string]bool{
	"structural": true, "mep": true, "architect": true, "contractor": true, "notary": true,
	"interior": true, "pm": true, "civil": true, "mechanical": true, "electrical": true,
	"plumbing": true, "roofing": true, "finishing": true, "general": true,
}

// documentMimes is the store file vocabulary.
var documentMimes = map[string]bool{
	"pdf": true, "doc": true, "docx": true, "jpg": true, "png": true,
	"xlsx": true, "xls": true, "dwg": true, "zip": true,
}

// documentRow reads one document bound to the project.
func documentRow(ctx context.Context, pool *pgxpool.Pool, projectID, docID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, uploader_id, parent_id, file_name, description, version,
		file_path, category, target_role, status, review_note, reviewed_at, version_label, file_type,
		created_at, updated_at FROM project_documents WHERE id = $1 AND project_id = $2`, docID, projectID)
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

// documentObject renders a document row exactly like the model: table
// order, the `file_url` append, and the loaded uploader.
func documentObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range docColumns {
		value := byName[column]
		switch column {
		case "reviewed_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	entry.Set("file_url", documentFileURL(ctx, byName))
	if uploader := intPtrDeref(byName["uploader_id"]); uploader != 0 {
		block, err := fullProfileUser(ctx, pool, uploader, false)
		if err != nil {
			block = nil
		}
		entry.Set("uploader", block)
	} else {
		entry.Set("uploader", nil)
	}
	return entry
}

// StoreDocumentHandler serves `POST /api/projects/{project}/documents`.
func StoreDocumentHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("doc-store: viewer", "error", err)
			serverError(w)
			return
		}

		formFields, formFiles, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}
		input := validateDocumentStore(ctx, pool, projectID, formFields, formFiles, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		allowed, err := documentAccess(ctx, pool, viewer, projectID)
		if err != nil {
			slog.Error("doc-store: access", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized. You must be assigned to this project to upload documents.")
			return
		}

		contents, err := readUploadedFile(r, "file")
		if err != nil {
			slog.Error("doc-store: read", "error", err)
			serverError(w)
			return
		}

		stored, err := storeVaultFile("project_documents", input.file.filename, contents)
		if err != nil {
			slog.Error("doc-store: store", "error", err)
			serverError(w)
			return
		}

		fileName := input.title
		if fileName == "" {
			fileName = input.file.filename
		}

		category := input.category
		if category == "" {
			category = "general"
		}
		status := input.status
		if status == "" {
			status = "uploaded"
		}

		version := int64(1)
		if input.parentID != nil {
			var parentCategory, parentRole *string
			var parentProject int64
			if err := pool.QueryRow(ctx, `SELECT project_id, category, target_role FROM project_documents WHERE id = $1`, *input.parentID).
				Scan(&parentProject, &parentCategory, &parentRole); err != nil {
				if isNoRows(err) {
					modelNotFound(w, `App\Models\ProjectDocument`, strconv.FormatInt(*input.parentID, 10))
					return
				}
				slog.Error("doc-store: parent", "error", err)
				serverError(w)
				return
			}
			if parentProject != projectID {
				message(w, http.StatusForbidden, "Invalid parent document.")
				return
			}
			if parentCategory != nil {
				category = *parentCategory
			}
			input.targetRole = parentRole
			var maxVersion *int64
			_ = pool.QueryRow(ctx, `SELECT MAX(version) FROM project_documents WHERE id = $1 OR parent_id = $1`, *input.parentID).Scan(&maxVersion)
			if maxVersion != nil {
				version = *maxVersion + 1
			}
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("doc-store: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var docID int64
		if err := tx.QueryRow(ctx, `INSERT INTO project_documents
			(project_id, uploader_id, parent_id, version, file_name, description, file_path, file_type,
			 category, status, target_role, version_label, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
			 date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, viewer.id, input.parentID, version, fileName, input.description, stored, input.file.ext,
			category, status, input.targetRole, input.versionLabel).Scan(&docID); err != nil {
			slog.Error("doc-store: insert", "error", err)
			serverError(w)
			return
		}

		details := "Uploaded: " + fileName + " (v" + strconv.FormatInt(version, 10) + ")"
		if input.versionLabel != nil && *input.versionLabel != "" {
			details += " (" + *input.versionLabel + ")"
		}
		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "document_uploaded", details); err != nil {
			slog.Error("doc-store: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("doc-store: commit", "error", err)
			serverError(w)
			return
		}

		byName, found, err := documentRow(ctx, pool, projectID, docID)
		if err != nil || !found {
			slog.Error("doc-store: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", documentCreatedObject(ctx, pool, byName))
		writeJSON(w, http.StatusOK, payload)
	}
}


// documentCreatedObject renders Eloquent\u0027s CREATED model for the store
// response: the create payload order, then timestamps and id, then the
// file_url append and the loaded uploader.
func documentCreatedObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("uploader_id", projectRawValue(byName["uploader_id"]))
	entry.Set("parent_id", projectRawValue(byName["parent_id"]))
	entry.Set("version", projectRawValue(byName["version"]))
	entry.Set("file_name", projectRawValue(byName["file_name"]))
	entry.Set("description", projectRawValue(byName["description"]))
	entry.Set("file_path", projectRawValue(byName["file_path"]))
	entry.Set("file_type", projectRawValue(byName["file_type"]))
	entry.Set("category", projectRawValue(byName["category"]))
	entry.Set("status", projectRawValue(byName["status"]))
	entry.Set("target_role", projectRawValue(byName["target_role"]))
	entry.Set("version_label", projectRawValue(byName["version_label"]))
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	entry.Set("file_url", documentFileURL(ctx, byName))
	if uploader := intPtrDeref(byName["uploader_id"]); uploader != 0 {
		block, err := fullProfileUser(ctx, pool, uploader, false)
		if err != nil {
			block = nil
		}
		entry.Set("uploader", block)
	} else {
		entry.Set("uploader", nil)
	}
	return entry
}

// documentStoreInput is the validated upload.
type documentStoreInput struct {
	file         *uploadedFile
	category     string
	status       string
	targetRole   *string
	versionLabel *string
	parentID     *int64
	title        string
	description  any
}

// validateDocumentStore enforces the store rules in declaration order.
func validateDocumentStore(ctx context.Context, pool *pgxpool.Pool, projectID int64, fields map[string]any, files map[string]*uploadedFile, failures *errorBag) documentStoreInput {
	var input documentStoreInput

	file, present := files["file"]
	if !present || file == nil {
		failures.add("file", "The file field is required.")
	} else if !documentMimes[strings.ToLower(file.ext)] {
		failures.add("file", "The file field must be a file of type: pdf, doc, docx, jpg, png, xlsx, xls, dwg, zip.")
	} else if file.size > 20480*1024 {
		failures.add("file", "The file field must not be greater than 20480 kilobytes.")
	} else {
		input.file = file
	}

	if raw, present := fields["category"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s != "" {
			if len([]rune(s)) > 50 {
				failures.add("category", "The category field must not be greater than 50 characters.")
			} else {
				input.category = s
			}
		}
	}

	if raw, present := fields["status"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s != "" {
			if !documentStatuses[s] {
				failures.add("status", "The selected status is invalid.")
			} else {
				input.status = s
			}
		}
	}

	if raw, present := fields["target_role"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s != "" {
			if !documentTargetRoles[s] {
				failures.add("target_role", "The selected target role is invalid.")
			} else {
				dup := s
				input.targetRole = &dup
			}
		}
	}

	if raw, present := fields["version_label"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s != "" {
			if len([]rune(s)) > 50 {
				failures.add("version_label", "The version label field must not be greater than 50 characters.")
			} else {
				dup := s
				input.versionLabel = &dup
			}
		}
	}

	if raw, present := fields["parent_id"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
				var exists bool
				_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_documents WHERE id = $1 AND project_id = $2)`, parsed, projectID).Scan(&exists)
				if !exists {
					failures.add("parent_id", "The selected parent id is invalid.")
				} else {
					dup := parsed
					input.parentID = &dup
				}
			}
		} else {
			failures.add("parent_id", "The parent id field must be an integer.")
		}
	}

	if raw, present := fields["title"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s != "" {
			if len([]rune(s)) > 255 {
				failures.add("title", "The title field must not be greater than 255 characters.")
			} else {
				input.title = s
			}
		}
	}

	if raw, present := fields["description"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("description", "The description field must be a string.")
		} else if s != "" {
			input.description = s
		}
	}

	return input
}

// UpdateDocumentHandler serves
// `PUT /api/projects/{project}/documents/{document}`.
func UpdateDocumentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		documentMutation(pool, "update")(w, r)
	}
}

// DestroyDocumentHandler serves
// `DELETE /api/projects/{project}/documents/{document}`.
func DestroyDocumentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		documentMutation(pool, "destroy")(w, r)
	}
}

// VerifyDocumentHandler serves
// `POST /api/projects/{project}/documents/{document}/verify`.
func VerifyDocumentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawDoc := documentPathID(r)
		docID, parseErr := strconv.ParseInt(rawDoc, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectDocument`, rawDoc)
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
			slog.Error("doc-verify: viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmProfile *int64
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &pmProfile); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("doc-verify: project", "error", err)
			serverError(w)
			return
		}

		isOwner := viewer.id == ownerID
		isPM := verifyAssignedPM(viewer, pmProfile)
		if !isOwner && !isPM {
			message(w, http.StatusForbidden, "Unauthorized. Only owner or PM can verify documents.")
			return
		}

		byName, found, err := documentRow(ctx, pool, projectID, docID)
		if err != nil || !found {
			modelNotFound(w, `App\Models\ProjectDocument`, rawDoc)
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_documents SET status = 'verified', updated_at = date_trunc('second', now()) WHERE id = $1`, docID); err != nil {
			slog.Error("doc-verify: update", "error", err)
			serverError(w)
			return
		}

		fileName, _ := byName["file_name"].(string)
		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "document_verified",
			"Verified document: "+fileName); err != nil {
			slog.Error("doc-verify: log", "error", err)
			serverError(w)
			return
		}

		updated, _, err := documentRow(ctx, pool, projectID, docID)
		if err != nil {
			slog.Error("doc-verify: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Document verified")
		payload.Set("data", documentObject(ctx, pool, updated))
		writeJSON(w, http.StatusOK, payload)
	}
}

// documentMutation runs update or destroy behind the shared gates.
func documentMutation(pool *pgxpool.Pool, verb string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawDoc := documentPathID(r)
		docID, parseErr := strconv.ParseInt(rawDoc, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectDocument`, rawDoc)
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
			slog.Error("doc-"+verb+": viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := documentRow(ctx, pool, projectID, docID)
		if err != nil {
			slog.Error("doc-"+verb+": load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectDocument`, rawDoc)
			return
		}

		var ownerID int64
		if err := pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID); err != nil {
			slog.Error("doc-"+verb+": project", "error", err)
			serverError(w)
			return
		}

		uploader := intPtrDeref(byName["uploader_id"])
		if uploader != viewer.id && ownerID != viewer.id {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		status, _ := byName["status"].(string)
		if status == "verified" || status == "approved" {
			if verb == "update" {
				message(w, http.StatusForbidden, "Cannot modify a verified or approved document.")
			} else {
				message(w, http.StatusForbidden, "Cannot delete a verified or approved document.")
			}
			return
		}

		if verb == "destroy" {
			if path, ok := byName["file_path"].(string); ok && path != "" {
				_ = removeVaultFile(path)
			}
			if _, err := pool.Exec(ctx, `DELETE FROM project_documents WHERE id = $1`, docID); err != nil {
				slog.Error("doc-destroy: delete", "error", err)
				serverError(w)
				return
			}
			fileName, _ := byName["file_name"].(string)
			if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "document_deleted",
				"Removed: "+fileName); err != nil {
				slog.Error("doc-destroy: log", "error", err)
				serverError(w)
				return
			}
			message(w, http.StatusOK, "Deleted")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		fileName, versionLabel := validateDocumentUpdate(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_documents SET file_name = $2, version_label = $3,
			updated_at = date_trunc('second', now()) WHERE id = $1`, docID, fileName, versionLabel); err != nil {
			slog.Error("doc-update: update", "error", err)
			serverError(w)
			return
		}

		updated, _, err := documentRow(ctx, pool, projectID, docID)
		if err != nil {
			slog.Error("doc-update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", documentObject(ctx, pool, updated))
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateDocumentUpdate enforces file_name required|string|max:255 and
// version_label nullable|string|max:255.
func validateDocumentUpdate(fields map[string]any, failures *errorBag) (fileName string, versionLabel any) {
	raw, present := fields["file_name"]
	if !present || raw == nil {
		failures.add("file_name", "The file name field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("file_name", "The file name field must be a string.")
	} else if s == "" {
		failures.add("file_name", "The file name field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("file_name", "The file name field must not be greater than 255 characters.")
	} else {
		fileName = s
	}

	if raw, present := fields["version_label"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("version_label", "The version label field must be a string.")
		} else if len([]rune(s)) > 255 {
			failures.add("version_label", "The version label field must not be greater than 255 characters.")
		} else {
			versionLabel = s
		}
	}

	return fileName, versionLabel
}

// documentPathID reads the segment after "documents", skipping the design
// verbs.
func documentPathID(r *http.Request) string {
	if raw := r.PathValue("document"); raw != "" {
		return raw
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	for i := 0; i+1 < len(parts); i++ {
		if parts[i] != "documents" {
			continue
		}
		next := parts[i+1]
		if next == "submit-design" || next == "approve-design" || next == "revise-design" {
			continue
		}
		return next
	}
	return lastPathSegment(r.URL.Path)
}
