package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SNAG ITEMS — the defect list raised at handover.
//
//   - GET snag-items: any participant (owner or hired professional). Rows
//     in table order with the model's `is_overdue`/`age_days` appends and
//     the reporter reduced to {id, name}.
//   - POST snag-items: owner or assigned PM only. Photos (max 5) go to
//     `projects/{id}/snags`; `due_at` is now + the severity's SLA days
//     (critical 3, major 7, minor 14). Answers the CREATED model.
//   - PUT snag-items/{snagItem}: only the assigned contractor (or the
//     interior designer for interior snags) may progress/resolve their own
//     defect. `resolved` stamps resolved_at, stores the note and up to
//     three resolution photos; the answer is the FRESH row.
//   - POST snag-items/{snagItem}/accept: owner or PM, `resolved` only, sets
//     `accepted` and answers a bare message.
//
// Both photo arrays are rewritten to absolute URLs by the model's toArray
// override, and `age_days` is the whole-day difference from created_at.

// snagColumns is the table order.
var snagColumns = []string{
	"id", "project_id", "title", "description", "location", "severity", "photos",
	"status", "due_at", "escalated_at", "assigned_role", "reported_by", "resolved_at",
	"resolution_note", "resolution_photos", "created_at", "updated_at",
}

// snagSLA is the config('snags.sla_days') map.
var snagSLA = map[string]int64{"critical": 3, "major": 7, "minor": 14}

// snagObject renders a loaded snag item with appends.
func snagObject(ctx context.Context, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range snagColumns {
		switch column {
		case "photos", "resolution_photos":
			// The array cast keeps NULL as null; only a stored [] becomes [].
			if byName[column] == nil {
				entry.Set(column, nil)
			} else {
				entry.Set(column, snagPhotoURLs(ctx, byName[column]))
			}
		case "due_at", "escalated_at", "resolved_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}

	status, _ := byName["status"].(string)
	overdue := false
	if due, ok := byName["due_at"].(time.Time); ok && status != "resolved" && status != "accepted" {
		overdue = due.Before(time.Now())
	}
	entry.Set("is_overdue", overdue)
	entry.Set("age_days", snagAgeDays(byName["created_at"]))

	return entry
}

// snagCreatedObject renders Eloquent's CREATED snag.
func snagCreatedObject(ctx context.Context, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("title", projectRawValue(byName["title"]))
	entry.Set("description", projectRawValue(byName["description"]))
	entry.Set("location", projectRawValue(byName["location"]))
	entry.Set("severity", projectRawValue(byName["severity"]))
	entry.Set("assigned_role", projectRawValue(byName["assigned_role"]))
	entry.Set("reported_by", projectRawValue(byName["reported_by"]))
	entry.Set("photos", snagPhotoURLs(ctx, byName["photos"]))
	entry.Set("due_at", projectTimeValue(byName["due_at"]))
	// The relation create() stamps the FK AFTER the payload attributes.
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	entry.Set("is_overdue", false)
	entry.Set("age_days", snagAgeDays(byName["created_at"]))
	return entry
}

// snagPhotoURLs resolves stored paths to absolute URLs.
func snagPhotoURLs(ctx context.Context, value any) []any {
	out := make([]any, 0)
	list, ok := value.([]any)
	if !ok {
		return out
	}
	for _, item := range list {
		path, ok := item.(string)
		if !ok || path == "" {
			continue
		}
		out = append(out, projectStorageURL(ctx, path))
	}
	return out
}

// snagAgeDays mirrors the accessor: whole days between created_at and now.
func snagAgeDays(value any) int64 {
	created, ok := value.(time.Time)
	if !ok {
		return 0
	}
	seconds := time.Since(created).Seconds()
	if seconds < 0 {
		return 0
	}
	return int64(seconds / 86400)
}

// snagRow reads one snag item bound to nothing (the binding is explicit).
func snagRow(ctx context.Context, pool *pgxpool.Pool, snagID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(snagColumns, ", ")+`
		FROM project_snag_items WHERE id = $1`, snagID)
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

// SnagItemsIndexHandler serves `GET /api/projects/{project}/snag-items`.
func SnagItemsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("snags: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("snags: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(snagColumns, ", ")+`
			FROM project_snag_items WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			slog.Error("snags: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("snags: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry := snagObject(ctx, byName)
			if reporter := intPtrDeref(byName["reported_by"]); reporter != 0 {
				var name string
				if err := pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, reporter).Scan(&name); err == nil {
					block := jsonphp.NewObject()
					block.Set("id", reporter)
					block.Set("name", name)
					entry.Set("reporter", block)
				} else {
					entry.Set("reporter", nil)
				}
			} else {
				entry.Set("reporter", nil)
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("snags: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreSnagItemHandler serves `POST /api/projects/{project}/snag-items`.
func StoreSnagItemHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("snag-store: viewer", "error", err)
			serverError(w)
			return
		}

		projectFields, projectValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("snag-store: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(projectFields, projectValues)
		ownerID, _ := project["user_id"].(int64)
		var pmProfile *int64
		if id, ok := project["pm_id"].(int64); ok {
			pmProfile = &id
		}

		if viewer.id != ownerID && !verifyAssignedPM(viewer, pmProfile) {
			message(w, http.StatusForbidden, "Only the Owner or PM can report defects.")
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

		failures := &errorBag{}
		input := validateSnagStore(formFields, r, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		photos := []any{}
		for _, upload := range input.photos {
			stored, err := storeVaultFile("projects/"+strconv.FormatInt(projectID, 10)+"/snags", upload.filename, upload.data)
			if err != nil {
				slog.Error("snag-store: photo", "error", err)
				message(w, http.StatusInternalServerError, "Failed to report defect.")
				return
			}
			photos = append(photos, stored)
		}

		// The oracle's column keeps whole seconds: the response shows .000000.
		dueAt := time.Now().UTC().Truncate(time.Second).AddDate(0, 0, int(snagSLA[input.severity]))
		encoded, err := jsonphp.Marshal(photos)
		if err != nil {
			serverError(w)
			return
		}

		var snagID int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO project_snag_items
			(project_id, title, description, location, severity, photos, status, assigned_role, reported_by, due_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'open', $7, $8, $9, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			projectID, input.title, input.description, input.location, input.severity, string(encoded),
			input.assignedRole, viewer.id, dueAt).Scan(&snagID, &createdAt, &updatedAt); err != nil {
			slog.Error("snag-store: insert", "error", err)
			message(w, http.StatusInternalServerError, "Failed to report defect.")
			return
		}

		byName := map[string]any{
			"id": snagID, "project_id": projectID, "title": input.title,
			"description": input.description, "location": input.location,
			"severity": input.severity, "photos": photos, "status": "open",
			"assigned_role": input.assignedRole, "reported_by": viewer.id,
			"due_at": dueAt, "created_at": createdAt, "updated_at": updatedAt,
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Defect reported.")
		payload.Set("data", snagCreatedObject(ctx, byName))
		writeJSON(w, http.StatusCreated, payload)
	}
}

// snagStoreInput is the validated report.
type snagStoreInput struct {
	title        string
	description  any
	location     any
	severity     string
	assignedRole any
	photos       []*galleryUpload
}

// validateSnagStore enforces the store rules.
func validateSnagStore(fields map[string]any, r *http.Request, failures *errorBag) snagStoreInput {
	var input snagStoreInput
	input.photos = nil

	if raw, present := fields["title"]; !present || raw == nil {
		failures.add("title", "The title field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("title", "The title field must be a string.")
	} else if s == "" {
		failures.add("title", "The title field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("title", "The title field must not be greater than 255 characters.")
	} else {
		input.title = s
	}

	if raw, present := fields["description"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("description", "The description field must be a string.")
		} else if len([]rune(s)) > 2000 {
			failures.add("description", "The description field must not be greater than 2000 characters.")
		} else if s != "" {
			input.description = s
		}
	}

	if raw, present := fields["location"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("location", "The location field must be a string.")
		} else if len([]rune(s)) > 255 {
			failures.add("location", "The location field must not be greater than 255 characters.")
		} else if s != "" {
			input.location = s
		}
	}

	if raw, present := fields["severity"]; !present || raw == nil {
		failures.add("severity", "The severity field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("severity", "The selected severity is invalid.")
	} else if s != "minor" && s != "major" && s != "critical" {
		failures.add("severity", "The selected severity is invalid.")
	} else {
		input.severity = s
	}

	if raw, present := fields["assigned_role"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("assigned_role", "The selected assigned role is invalid.")
		} else if s != "" && s != "kontraktor" && s != "interior" {
			failures.add("assigned_role", "The selected assigned role is invalid.")
		} else if s != "" {
			input.assignedRole = s
		}
	}

	photos := requestFilesNamed(r, "photos")
	if len(photos) > 5 {
		failures.add("photos", "The photos field must not have more than 5 items.")
	}
	for i, upload := range photos {
		key := "photos." + strconv.Itoa(i)
		if !upload.isImage {
			failures.add(key, "The "+key+" field must be an image.")
			continue
		}
		if !snagImageExt(upload.ext) {
			failures.add(key, "The "+key+" field must be a file of type: jpeg, png, jpg, gif, webp.")
			continue
		}
		if upload.sizeBytes() > 5120*1024 {
			failures.add(key, "The "+key+" field must not be greater than 5120 kilobytes.")
		}
	}
	input.photos = photos

	// A JSON `photos` array cannot contain uploads: Laravel's image rule fails
	// every string entry.
	if raw, present := fields["photos"]; present && raw != nil {
		if list, ok := raw.([]any); ok {
			if len(list) > 5 {
				failures.add("photos", "The photos field must not have more than 5 items.")
			} else {
				for i := range list {
					key := "photos." + strconv.Itoa(i)
					failures.add(key, "The "+key+" field must be an image.")
				}
			}
		} else {
			failures.add("photos", "The photos field must be an array.")
		}
	}

	return input
}

// snagImageExt reports an allowed image extension.
func snagImageExt(ext string) bool {
	switch ext {
	case "jpeg", "png", "jpg", "gif", "webp":
		return true
	}
	return false
}

// UpdateSnagItemHandler serves `PUT /api/projects/{project}/snag-items/{snagItem}`.
func UpdateSnagItemHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("snagItem")
		if rawID == "" {
			rawID = lastPathSegment(r.URL.Path)
		}
		snagID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectSnagItem`, rawID)
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
			slog.Error("snag-update: viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := snagRow(ctx, pool, snagID)
		if err != nil {
			slog.Error("snag-update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectSnagItem`, rawID)
			return
		}
		if rowProject, _ := byName["project_id"].(int64); rowProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		assignedRole, _ := byName["assigned_role"].(string)
		isAssignedContractor := false
		isAssignedInterior := false
		if viewer.role == "kontraktor" || viewer.role == "interior" {
			subject, serr := loadSubject(ctx, pool, viewer.id)
			parties, perr := loadProjectParties(ctx, pool, projectID)
			if serr == nil && perr == nil && authzMatchesRole(parties, subject, viewer.role) {
				if viewer.role == "kontraktor" && (assignedRole == "" || assignedRole == "kontraktor") {
					isAssignedContractor = true
				}
				if viewer.role == "interior" && assignedRole == "interior" {
					isAssignedInterior = true
				}
			}
		}
		if !isAssignedContractor && !isAssignedInterior {
			message(w, http.StatusForbidden, "Only the assigned professional can update this defect.")
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

		failures := &errorBag{}
		status, note, photos := validateSnagUpdate(formFields, r, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		sets := []string{"status = $2", "updated_at = date_trunc('second', now())"}
		args := []any{snagID, status}
		if status == "resolved" {
			args = append(args, note)
			sets = append(sets, "resolved_at = date_trunc('second', now())", "resolution_note = $"+strconv.Itoa(len(args)))
			if len(photos) > 0 {
				stored := []any{}
				for _, upload := range photos {
					path, err := storeVaultFile("projects/"+strconv.FormatInt(projectID, 10)+"/snags/resolutions", upload.filename, upload.data)
					if err != nil {
						slog.Error("snag-update: photo", "error", err)
						message(w, http.StatusInternalServerError, "Update failed.")
						return
					}
					stored = append(stored, path)
				}
				encoded, err := jsonphp.Marshal(stored)
				if err != nil {
					serverError(w)
					return
				}
				args = append(args, string(encoded))
				sets = append(sets, "resolution_photos = $"+strconv.Itoa(len(args))+"::jsonb")
			}
		}

		if _, err := pool.Exec(ctx, `UPDATE project_snag_items SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("snag-update: exec", "error", err)
			message(w, http.StatusInternalServerError, "Update failed.")
			return
		}

		fresh, _, err := snagRow(ctx, pool, snagID)
		if err != nil {
			slog.Error("snag-update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Snag item updated.")
		payload.Set("data", snagObject(ctx, fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateSnagUpdate enforces status required|in:in_progress,resolved,
// resolution_note nullable|string|max:2000 and up to three photos.
func validateSnagUpdate(fields map[string]any, r *http.Request, failures *errorBag) (string, any, []*galleryUpload) {
	status := ""
	if raw, present := fields["status"]; !present || raw == nil {
		failures.add("status", "The status field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("status", "The selected status is invalid.")
	} else if s != "in_progress" && s != "resolved" {
		failures.add("status", "The selected status is invalid.")
	} else {
		status = s
	}

	var note any
	if raw, present := fields["resolution_note"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("resolution_note", "The resolution note field must be a string.")
		} else if len([]rune(s)) > 2000 {
			failures.add("resolution_note", "The resolution note field must not be greater than 2000 characters.")
		} else if s != "" {
			note = s
		}
	}

	photos := requestFilesNamed(r, "resolution_photos")
	if len(photos) > 3 {
		failures.add("resolution_photos", "The resolution photos field must not have more than 3 items.")
	}
	for i, upload := range photos {
		key := "resolution_photos." + strconv.Itoa(i)
		if !upload.isImage {
			failures.add(key, "The "+key+" field must be an image.")
			continue
		}
		if !snagImageExt(upload.ext) {
			failures.add(key, "The "+key+" field must be a file of type: jpeg, png, jpg, gif, webp.")
			continue
		}
		if upload.sizeBytes() > 5120*1024 {
			failures.add(key, "The "+key+" field must not be greater than 5120 kilobytes.")
		}
	}

	return status, note, photos
}

// AcceptSnagHandler serves
// `POST /api/projects/{project}/snag-items/{snagItem}/accept`.
func AcceptSnagHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("snagItem")
		if rawID == "" {
			rawID = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/accept"))
		}
		snagID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectSnagItem`, rawID)
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
			slog.Error("snag-accept: viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := snagRow(ctx, pool, snagID)
		if err != nil {
			slog.Error("snag-accept: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectSnagItem`, rawID)
			return
		}
		if rowProject, _ := byName["project_id"].(int64); rowProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			serverError(w)
			return
		}
		project := projectColumnsByName(fields, values)
		ownerID, _ := project["user_id"].(int64)
		var pmProfile *int64
		if id, ok := project["pm_id"].(int64); ok {
			pmProfile = &id
		}
		if viewer.id != ownerID && !verifyAssignedPM(viewer, pmProfile) {
			message(w, http.StatusForbidden, "Only the Owner or PM can accept resolutions.")
			return
		}

		status, _ := byName["status"].(string)
		if status != "resolved" {
			message(w, http.StatusUnprocessableEntity, "Only resolved defect items can be accepted.")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_snag_items SET status = 'accepted',
			updated_at = date_trunc('second', now()) WHERE id = $1`, snagID); err != nil {
			slog.Error("snag-accept: update", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Resolution accepted.")
	}
}
