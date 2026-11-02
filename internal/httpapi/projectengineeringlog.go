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

// MANUAL ENGINEERING LOGS — the structural/MEP diary.
//
// `POST engineering-logs` is participant-gated, validates role_type
// (structural|mep), title, description and up to N image/PDF files, stores
// the files under `milestones/gallery` on the public disk, and creates an
// ALREADY-APPROVED `generic` milestone whose content records the checklist
// placeholder, gallery, `is_manual_log` and its author. `sort_order` is the
// phase's current count + 1.
//
// `DELETE engineering-logs/{milestone}` is participant-gated, binds the row
// to the project (a mismatch is a 403 whose message has NO period), refuses
// non-manual records with a 400 pointing at the milestone endpoint, and
// refuses a milestone whose FIRST linked stage is paid. Manual logs are born
// approved, so the old approved-status guard made this endpoint unreachable;
// the oracle now skips it for manual logs.

// engineeringLogColumns is the milestone table order (same shape as the
// approve renderer, no relations).
var engineeringLogColumns = milestoneApproveColumns

// StoreEngineeringLogHandler serves
// `POST /api/projects/{project}/engineering-logs`.
func StoreEngineeringLogHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("eng-log: viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("eng-log: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("eng-log: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
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
		roleType, title, description, files := validateEngineeringLog(formFields, r, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		gallery := []any{}
		for _, upload := range files {
			stored, err := storeVaultFile("milestones/gallery", upload.filename, upload.data)
			if err != nil {
				slog.Error("eng-log: store file", "error", err)
				serverError(w)
				return
			}
			gallery = append(gallery, stored)
		}

		var sortOrder int64
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE project_id = $1 AND phase_context = $2`,
			projectID, roleType).Scan(&sortOrder); err != nil {
			slog.Error("eng-log: count", "error", err)
			serverError(w)
			return
		}

		content := jsonphp.NewObject()
		content.Set("checklist", []any{})
		content.Set("gallery", gallery)
		content.Set("is_manual_log", true)
		content.Set("added_by", viewer.id)
		encoded, err := jsonphp.Marshal(content)
		if err != nil {
			slog.Error("eng-log: content", "error", err)
			serverError(w)
			return
		}

		var milestoneID int64
		var pmVerifiedAt, createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO project_milestones
			(project_id, phase_context, title, description, type, approval_status, pm_verified_at, content, sort_order, created_at, updated_at)
			VALUES ($1, $2, $3, $4, 'generic', 'approved', date_trunc('second', now()), $5::jsonb, $6,
			 date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, pm_verified_at, created_at, updated_at`,
			projectID, roleType, title, description, string(encoded), sortOrder+1).Scan(&milestoneID, &pmVerifiedAt, &createdAt, &updatedAt); err != nil {
			slog.Error("eng-log: insert", "error", err)
			serverError(w)
			return
		}

		// The answer is Eloquent's CREATED model: only the attributes the
		// create() sent, in create order, with timestamps and id. `content`
		// therefore renders the IN-MEMORY array order, not the jsonb order.
		entry := jsonphp.NewObject()
		entry.Set("project_id", projectID)
		entry.Set("phase_context", roleType)
		entry.Set("title", title)
		entry.Set("description", description)
		entry.Set("type", "generic")
		entry.Set("approval_status", "approved")
		entry.Set("pm_verified_at", projectTimeValue(pmVerifiedAt))
		// The model's toArray override rewrites gallery entries to absolute
		// URLs, so the response content is the URL form of the same array.
		responseContent := jsonphp.NewObject()
		responseContent.Set("checklist", []any{})
		responseContent.Set("gallery", milestoneGalleryURLs(ctx, gallery))
		responseContent.Set("is_manual_log", true)
		responseContent.Set("added_by", viewer.id)
		entry.Set("content", responseContent)
		entry.Set("sort_order", sortOrder+1)
		entry.Set("updated_at", projectTimeValue(updatedAt))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("id", milestoneID)

		payload := jsonphp.NewObject()
		payload.Set("message", "Log recorded successfully")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateEngineeringLog enforces the store rules.
func validateEngineeringLog(fields map[string]any, r *http.Request, failures *errorBag) (string, any, any, []*galleryUpload) {
	roleType := ""
	if raw, present := fields["role_type"]; !present || raw == nil {
		failures.add("role_type", "The role type field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("role_type", "The selected role type is invalid.")
	} else if s != "structural" && s != "mep" {
		failures.add("role_type", "The selected role type is invalid.")
	} else {
		roleType = s
	}

	title := ""
	if raw, present := fields["title"]; !present || raw == nil {
		failures.add("title", "The title field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("title", "The title field must be a string.")
	} else if s == "" {
		failures.add("title", "The title field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("title", "The title field must not be greater than 255 characters.")
	} else {
		title = s
	}

	var description any
	if raw, present := fields["description"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("description", "The description field must be a string.")
		} else if s != "" {
			description = s
		}
	}

	files := requestFilesNamed(r, "files")

	allowed := map[string]bool{"jpg": true, "jpeg": true, "png": true, "webp": true, "pdf": true}
	for i, upload := range files {
		key := "files." + strconv.Itoa(i)
		if upload == nil {
			continue
		}
		if !allowed[upload.ext] {
			failures.add(key, "The "+key+" field must be a file of type: jpg, jpeg, png, webp, pdf.")
			continue
		}
		if upload.sizeBytes() > 10240*1024 {
			failures.add(key, "The "+key+" field must not be greater than 10240 kilobytes.")
		}
	}

	return roleType, title, description, files
}

// DeleteEngineeringLogHandler serves
// `DELETE /api/projects/{project}/engineering-logs/{milestone}`.
func DeleteEngineeringLogHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("milestone")
		if rawID == "" {
			rawID = lastPathSegment(r.URL.Path)
		}
		milestoneID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectMilestone`, rawID)
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
			slog.Error("eng-del: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("eng-del: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		byName, found, err := loadMilestoneRow(ctx, pool, projectID, milestoneID)
		if err != nil {
			slog.Error("eng-del: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			// The oracle's binding check compares project ids; a row loaded
			// from another project still exists, so it answers 403 instead.
			var otherProject int64
			_ = pool.QueryRow(ctx, `SELECT project_id FROM project_milestones WHERE id = $1`, milestoneID).Scan(&otherProject)
			if otherProject != 0 && otherProject != projectID {
				message(w, http.StatusForbidden, "Unauthorized")
				return
			}
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		isManualLog := false
		content := byName["content"]
		if obj, ok := content.(map[string]any); ok {
			if flag, ok := obj["is_manual_log"].(bool); ok && flag {
				isManualLog = true
			}
		}
		if mtype, _ := byName["type"].(string); mtype == "generic" {
			isManualLog = true
		}
		if !isManualLog {
			message(w, http.StatusBadRequest, "Only manual engineering log entries can be removed here. Use the milestone endpoint for work-phase records.")
			return
		}

		var linkedStatus *string
		_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE milestone_id = $1 ORDER BY id LIMIT 1`,
			milestoneID).Scan(&linkedStatus)
		if linkedStatus != nil && *linkedStatus == "paid" {
			message(w, http.StatusBadRequest, "Cannot delete a step linked to a PAID payment.")
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM project_milestones WHERE id = $1`, milestoneID); err != nil {
			slog.Error("eng-del: delete", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Log removed")
	}
}

// milestoneColumnsObject renders the milestone model with no relations.
func milestoneColumnsObject(ctx context.Context, pool *pgxpool.Pool, projectID, milestoneID int64, pmCarbon bool) (*jsonphp.Object, error) {
	columns := make([]string, 0, len(engineeringLogColumns))
	for _, column := range engineeringLogColumns {
		if column == "content" {
			columns = append(columns, "content::text AS content")
			continue
		}
		columns = append(columns, column)
	}

	rows, err := pool.Query(ctx, `SELECT `+strings.Join(columns, ", ")+`
		FROM project_milestones WHERE id = $1 AND project_id = $2`, milestoneID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, errLedgerGone
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	for i, column := range fields {
		switch column {
		case "content":
			entry.Set(column, milestoneContentObject(ctx, values[i]))
		case "start_date", "due_date", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(values[i]))
		case "lead_pro_verified_at":
			entry.Set(column, mysqlDateTime(values[i]))
		case "pm_verified_at":
			if pmCarbon {
				entry.Set(column, projectTimeValue(values[i]))
			} else {
				entry.Set(column, mysqlDateTime(values[i]))
			}
		case "is_completed":
			boolean := false
			if typed, ok := values[i].(bool); ok {
				boolean = typed
			}
			entry.Set(column, boolean)
		default:
			entry.Set(column, projectRawValue(values[i]))
		}
	}

	return entry, rows.Err()
}

// requestFilesNamed collects every upload under `name` or `name[]`.
func requestFilesNamed(r *http.Request, name string) []*galleryUpload {
	if r.MultipartForm == nil || r.MultipartForm.File == nil {
		return nil
	}
	out := make([]*galleryUpload, 0)
	for _, key := range []string{name + "[]", name} {
		for _, header := range r.MultipartForm.File[key] {
			upload, err := readGalleryFile(header)
			if err != nil {
				continue
			}
			out = append(out, upload)
		}
		if len(out) > 0 {
			break
		}
	}
	return out
}
