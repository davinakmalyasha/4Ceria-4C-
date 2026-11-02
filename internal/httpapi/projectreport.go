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

// PROJECT REPORTS — the owner/PM progress publication.
//
//   - GET reports: owner or assigned PM; answers a BARE ARRAY (not {data}),
//     newest `published_at` first, each row with its full `creator` user.
//   - POST reports: owner or assigned PM. Photos (≤ any count, each an image
//     ≤5 MB) store under projects/{id}/reports/photos; attachments (pdf, doc,
//     docx, xls, xlsx, zip, rar ≤10 MB) store under .../reports/docs as
//     {name, path, size} objects. The answer is 201 with the CREATED model.
//   - PUT reports/{report}: the creator or the project owner. Provided fields
//     update; uploads APPEND to the stored arrays. The answer carries the
//     report in table order PLUS `project` — the policy's loadMissing leaves
//     that relation on the model before serialization.
//   - DELETE reports/{report}: creator or owner; removes the stored files and
//     the row.
//
// Validation uses the controller's CUSTOM envelope: the fixed message
// "The given data was invalid." with the field bag — not the summarize()
// wording the shared bag writes.

// projectReportColumns is the table order.
var projectReportColumns = []string{
	"id", "project_id", "phase_slug", "created_by", "summary", "progress_percentage",
	"budget_health", "site_photos", "attachments", "published_at", "created_at", "updated_at",
}

// reportPhotoMimes / reportAttachmentMimes are the controller's allowlists.
var reportPhotoMimes = map[string]bool{"jpeg": true, "png": true, "jpg": true, "webp": true}

var reportAttachmentMimes = map[string]bool{
	"pdf": true, "doc": true, "docx": true, "xls": true, "xlsx": true, "zip": true, "rar": true,
}

// reportObject renders a loaded report in table order.
func projectReportObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range projectReportColumns {
		value := byName[column]
		switch column {
		case "site_photos", "attachments":
			entry.Set(column, eloquentJSONValue(value))
		case "published_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		case "progress_percentage":
			entry.Set(column, projectIntValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// reportCreatedObject renders Eloquent's CREATED report: the property
// assignment order in the service, then the save timestamps and id.
func reportCreatedObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("created_by", projectRawValue(byName["created_by"]))
	entry.Set("summary", projectRawValue(byName["summary"]))
	entry.Set("progress_percentage", projectIntValue(byName["progress_percentage"]))
	entry.Set("budget_health", projectRawValue(byName["budget_health"]))
	entry.Set("phase_slug", projectRawValue(byName["phase_slug"]))
	entry.Set("site_photos", eloquentJSONValue(byName["site_photos"]))
	entry.Set("attachments", eloquentJSONValue(byName["attachments"]))
	entry.Set("published_at", projectTimeValue(byName["published_at"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// reportRow reads one report.
func reportRow(ctx context.Context, pool *pgxpool.Pool, reportID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(projectReportColumns, ", ")+`
		FROM project_reports WHERE id = $1`, reportID)
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

// writeValidationEnvelope mirrors the reports controller's own 422 body.
func writeValidationEnvelope(w http.ResponseWriter, failures *errorBag) {
	errors := jsonphp.NewObject()
	for _, field := range failures.fields {
		messages := make([]any, 0, len(failures.bag[field]))
		for _, message := range failures.bag[field] {
			messages = append(messages, message)
		}
		errors.Set(field, messages)
	}
	payload := jsonphp.NewObject()
	payload.Set("message", "The given data was invalid.")
	payload.Set("errors", errors)
	writeJSON(w, http.StatusUnprocessableEntity, payload)
}

// reportGate answers the owner-or-assigned-PM rule used by index and store.
func reportGate(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter, r *http.Request, projectID int64) (*projectViewer, bool) {
	caller, ok := CallerFrom(r.Context())
	if !ok {
		message(w, http.StatusUnauthorized, "Unauthenticated.")
		return nil, false
	}
	viewer, err := loadViewer(ctx, pool, caller)
	if err != nil {
		slog.Error("report: viewer", "error", err)
		serverError(w)
		return nil, false
	}
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\Project`, strconv.FormatInt(projectID, 10))
			return nil, false
		}
		slog.Error("report: project", "error", err)
		serverError(w)
		return nil, false
	}
	project := projectColumnsByName(fields, values)
	ownerID, _ := project["user_id"].(int64)
	var pmProfile *int64
	if id, ok := project["pm_id"].(int64); ok {
		pmProfile = &id
	}
	if viewer.id != ownerID && !verifyAssignedPM(viewer, pmProfile) {
		message(w, http.StatusForbidden, "This action is unauthorized.")
		return nil, false
	}
	return viewer, true
}

// reportEditGate is the creator-or-owner rule for update/delete.
func reportEditGate(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter, viewer *projectViewer, byName map[string]any) bool {
	if createdBy := intPtrDeref(byName["created_by"]); createdBy == viewer.id {
		return true
	}
	projectID := intPtrDeref(byName["project_id"])
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		serverError(w)
		return false
	}
	ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)
	if ownerID == viewer.id {
		return true
	}
	message(w, http.StatusForbidden, "This action is unauthorized.")
	return false
}

// ProjectReportsIndexHandler serves `GET /api/projects/{project}/reports`.
func ProjectReportsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		ctx := r.Context()
		if _, ok := reportGate(ctx, pool, w, r, projectID); !ok {
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(projectReportColumns, ", ")+`
			FROM project_reports WHERE project_id = $1
			ORDER BY published_at DESC, id DESC`, projectID)
		if err != nil {
			slog.Error("reports: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("reports: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry := projectReportObject(byName)
			creatorID := intPtrDeref(byName["created_by"])
			if creatorID != 0 {
				creator, err := fullProfileUser(ctx, pool, creatorID, false)
				if err != nil {
					creator = nil
				}
				entry.Set("creator", creator)
			} else {
				entry.Set("creator", nil)
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("reports: rows", "error", err)
			serverError(w)
			return
		}

		writeJSON(w, http.StatusOK, out)
	}
}

// reportUpload holds the validated multipart payload.
type reportUpload struct {
	summary      *string
	progress     *int64
	budgetHealth *string
	phaseSlug    *string
	photos       []*galleryUpload
	attachments  []*galleryUpload
}

// validateReportUpload applies the store/update rules. `partial` turns the
// required fields into `sometimes|required` (the update path).
func validateReportUpload(fields map[string]any, photos, attachments []*galleryUpload, partial bool, failures *errorBag) reportUpload {
	var input reportUpload
	input.photos = photos
	input.attachments = attachments

	if raw, present := fields["summary"]; present || !partial {
		if !present || raw == nil {
			failures.add("summary", "The summary field is required.")
		} else if s, ok := raw.(string); !ok {
			failures.add("summary", "The summary field must be a string.")
		} else if s == "" {
			failures.add("summary", "The summary field is required.")
		} else {
			dup := s
			input.summary = &dup
		}
	}

	if raw, present := fields["progress_percentage"]; present || !partial {
		if !present || raw == nil {
			failures.add("progress_percentage", "The progress percentage field is required.")
		} else if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
				if parsed < 0 {
					failures.add("progress_percentage", "The progress percentage field must be at least 0.")
				} else if parsed > 100 {
					failures.add("progress_percentage", "The progress percentage field must not be greater than 100.")
				} else {
					input.progress = &parsed
				}
			}
		} else {
			failures.add("progress_percentage", "The progress percentage field must be an integer.")
		}
	}

	if raw, present := fields["budget_health"]; present || !partial {
		if !present || raw == nil {
			failures.add("budget_health", "The budget health field is required.")
		} else if s, ok := raw.(string); !ok {
			failures.add("budget_health", "The selected budget health is invalid.")
		} else if s != "on_track" && s != "warning" && s != "critical" {
			failures.add("budget_health", "The selected budget health is invalid.")
		} else {
			dup := s
			input.budgetHealth = &dup
		}
	}

	if raw, present := fields["phase_slug"]; present && raw != nil {
		if s, ok := raw.(string); ok && s != "" {
			dup := s
			input.phaseSlug = &dup
		}
	}

	for i, upload := range photos {
		key := "photos." + strconv.Itoa(i)
		if !upload.isImage || !reportPhotoMimes[upload.ext] {
			failures.add(key, "The "+key+" field must be an image.")
			continue
		}
		if upload.sizeBytes() > 5120*1024 {
			failures.add(key, "The "+key+" field must not be greater than 5120 kilobytes.")
		}
	}

	for i, upload := range attachments {
		key := "attachments." + strconv.Itoa(i)
		if !reportAttachmentMimes[upload.ext] {
			failures.add(key, "The "+key+" field must be a file of type: pdf, doc, docx, xls, xlsx, zip, rar.")
			continue
		}
		if upload.sizeBytes() > 10240*1024 {
			failures.add(key, "The "+key+" field must not be greater than 10240 kilobytes.")
		}
	}

	return input
}

// StoreReportHandler serves `POST /api/projects/{project}/reports`.
func StoreReportHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		ctx := r.Context()
		viewer, ok := reportGate(ctx, pool, w, r, projectID)
		if !ok {
			return
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(64 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		photos := requestFilesNamed(r, "photos")
		attachments := requestFilesNamed(r, "attachments")

		failures := &errorBag{}
		input := validateReportUpload(formFields, photos, attachments, false, failures)
		if !failures.empty() {
			writeValidationEnvelope(w, failures)
			return
		}

		photoPaths := []any{}
		for _, upload := range photos {
			stored, err := storeVaultFile("projects/"+strconv.FormatInt(projectID, 10)+"/reports/photos", upload.filename, upload.data)
			if err != nil {
				slog.Error("report store: photo", "error", err)
				message(w, http.StatusInternalServerError, "Failed to publish report: Server Error")
				return
			}
			photoPaths = append(photoPaths, stored)
		}

		attachmentPaths := []any{}
		for _, upload := range attachments {
			stored, err := storeVaultFile("projects/"+strconv.FormatInt(projectID, 10)+"/reports/docs", upload.filename, upload.data)
			if err != nil {
				slog.Error("report store: attachment", "error", err)
				message(w, http.StatusInternalServerError, "Failed to publish report: Server Error")
				return
			}
			entry := jsonphp.NewObject()
			entry.Set("name", upload.filename)
			entry.Set("path", stored)
			entry.Set("size", upload.sizeBytes())
			attachmentPaths = append(attachmentPaths, entry)
		}

		summary := ""
		if input.summary != nil {
			summary = *input.summary
		}
		progress := int64(0)
		if input.progress != nil {
			progress = *input.progress
		}
		health := "on_track"
		if input.budgetHealth != nil {
			health = *input.budgetHealth
		}

		photosJSON, _ := jsonphp.Marshal(photoPaths)
		attachmentsJSON, _ := jsonphp.Marshal(attachmentPaths)

		var reportID int64
		var publishedAt, createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO project_reports
			(project_id, phase_slug, created_by, summary, progress_percentage, budget_health,
			 site_photos, attachments, published_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb,
			 date_trunc('second', now()), date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, published_at, created_at, updated_at`,
			projectID, input.phaseSlug, viewer.id, summary, progress, health,
			string(photosJSON), string(attachmentsJSON)).Scan(&reportID, &publishedAt, &createdAt, &updatedAt); err != nil {
			slog.Error("report store: insert", "error", err)
			message(w, http.StatusInternalServerError, "Failed to publish report: Server Error")
			return
		}

		byName := map[string]any{
			"id": reportID, "project_id": projectID, "phase_slug": nil, "created_by": viewer.id,
			"summary": summary, "progress_percentage": progress, "budget_health": health,
			"site_photos": photoPaths, "attachments": attachmentPaths,
			"published_at": publishedAt, "created_at": createdAt, "updated_at": updatedAt,
		}
		if input.phaseSlug != nil {
			byName["phase_slug"] = *input.phaseSlug
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Report published successfully!")
		payload.Set("report", reportCreatedObject(byName))
		writeJSON(w, http.StatusCreated, payload)
	}
}

// UpdateReportHandler serves `PUT /api/projects/{project}/reports/{report}`.
func UpdateReportHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		rawID := r.PathValue("report")
		reportID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\ProjectReport`, rawID)
			return
		}

		ctx := r.Context()
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("report update: viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := reportRow(ctx, pool, reportID)
		if err != nil {
			slog.Error("report update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectReport`, rawID)
			return
		}
		if !reportEditGate(ctx, pool, w, viewer, byName) {
			return
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(64 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		photos := requestFilesNamed(r, "photos")
		attachments := requestFilesNamed(r, "attachments")

		failures := &errorBag{}
		input := validateReportUpload(formFields, photos, attachments, true, failures)
		if !failures.empty() {
			writeValidationEnvelope(w, failures)
			return
		}

		sets := []string{"updated_at = date_trunc('second', now())"}
		args := []any{reportID}
		add := func(column string, value any) {
			args = append(args, value)
			sets = append(sets, column+" = $"+strconv.Itoa(len(args)))
		}
		addJSON := func(column string, value any) {
			args = append(args, value)
			sets = append(sets, column+" = $"+strconv.Itoa(len(args))+"::jsonb")
		}
		if input.summary != nil {
			add("summary", *input.summary)
		}
		if input.progress != nil {
			add("progress_percentage", *input.progress)
		}
		if input.budgetHealth != nil {
			add("budget_health", *input.budgetHealth)
		}
		if input.phaseSlug != nil {
			add("phase_slug", *input.phaseSlug)
		}

		reportProject := intPtrDeref(byName["project_id"])
		if len(photos) > 0 {
			existing := jsonList(byName["site_photos"])
			for _, upload := range photos {
				stored, err := storeVaultFile("projects/"+strconv.FormatInt(reportProject, 10)+"/reports/photos", upload.filename, upload.data)
				if err != nil {
					slog.Error("report update: photo", "error", err)
					message(w, http.StatusInternalServerError, "Failed to update report: Server Error")
					return
				}
				existing = append(existing, stored)
			}
			encoded, _ := jsonphp.Marshal(existing)
			addJSON("site_photos", string(encoded))
		}
		if len(attachments) > 0 {
			existing := jsonList(byName["attachments"])
			for _, upload := range attachments {
				stored, err := storeVaultFile("projects/"+strconv.FormatInt(reportProject, 10)+"/reports/docs", upload.filename, upload.data)
				if err != nil {
					slog.Error("report update: attachment", "error", err)
					message(w, http.StatusInternalServerError, "Failed to update report: Server Error")
					return
				}
				entry := jsonphp.NewObject()
				entry.Set("name", upload.filename)
				entry.Set("path", stored)
				entry.Set("size", upload.sizeBytes())
				existing = append(existing, entry)
			}
			encoded, _ := jsonphp.Marshal(existing)
			addJSON("attachments", string(encoded))
		}

		if _, err := pool.Exec(ctx, `UPDATE project_reports SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("report update: exec", "error", err)
			message(w, http.StatusInternalServerError, "Failed to update report: Server Error")
			return
		}

		fresh, _, err := reportRow(ctx, pool, reportID)
		if err != nil {
			slog.Error("report update: reload", "error", err)
			serverError(w)
			return
		}
		entry := projectReportObject(fresh)
		project, err := rawProjectModel(ctx, pool, reportProject)
		if err != nil {
			slog.Error("report update: project", "error", err)
			serverError(w)
			return
		}
		entry.Set("project", project)

		payload := jsonphp.NewObject()
		payload.Set("message", "Report updated successfully!")
		payload.Set("report", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// jsonList normalizes a JSON array column into []any.
func jsonList(value any) []any {
	decoded := eloquentJSONValue(value)
	if list, ok := decoded.([]any); ok {
		return list
	}
	return []any{}
}

// DestroyReportHandler serves `DELETE /api/projects/{project}/reports/{report}`.
func DestroyReportHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		rawID := r.PathValue("report")
		reportID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\ProjectReport`, rawID)
			return
		}

		ctx := r.Context()
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("report delete: viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := reportRow(ctx, pool, reportID)
		if err != nil {
			slog.Error("report delete: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectReport`, rawID)
			return
		}
		if !reportEditGate(ctx, pool, w, viewer, byName) {
			return
		}

		for _, photo := range jsonList(byName["site_photos"]) {
			if path, ok := photo.(string); ok && path != "" {
				_ = removeVaultFile(path)
			}
		}
		for _, attachment := range jsonList(byName["attachments"]) {
			if object, ok := attachment.(*jsonphp.Object); ok {
				if path, ok := object.Get("path"); ok {
					if text, ok := path.(string); ok && text != "" {
						_ = removeVaultFile(text)
					}
				}
			}
		}

		if _, err := pool.Exec(ctx, `DELETE FROM project_reports WHERE id = $1`, reportID); err != nil {
			slog.Error("report delete: exec", "error", err)
			message(w, http.StatusInternalServerError, "Failed to delete report.")
			return
		}

		message(w, http.StatusOK, "Report deleted successfully.")
	}
}
