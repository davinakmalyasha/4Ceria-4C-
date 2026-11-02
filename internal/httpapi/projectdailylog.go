package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DAILY SITE LOGS — the contractor's progress diary.
//
//   - index: participants only (owner, assigned PM, hired pro), newest
//     log_date first, each row with its author;
//   - store: the hired contractor, the assigned PM or an ACTIVE
//     sub-professional; new-build/renovation projects are additionally
//     locked until the PBG is verified (or a PBG/IMB milestone is
//     approved); photos (max 4) go to the public disk under daily_logs;
//   - destroy: the binding is checked FIRST (a log from another project
//     is a 404, which used to corrupt the audit trail), then authorship.
//
// The wire row renders the model's toArray: `photos` is replaced by the
// resolved absolute URLs, and the author travels as `user`.

// dailyLogColumns is the table order.
var dailyLogColumns = []string{
	"id", "project_id", "user_id", "log_date", "weather", "worker_count",
	"activities", "issues", "photos", "created_at", "updated_at",
}

// dailyLogObject renders one log row the way the model's toArray does.
func dailyLogObject(ctx context.Context, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range dailyLogColumns {
		value := byName[column]
		switch column {
		case "log_date":
			entry.Set(column, projectTimeValue(value))
		case "photos":
			entry.Set(column, dailyLogPhotoURLs(ctx, value))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// dailyLogPhotoURLs resolves stored photo paths into absolute URLs.
func dailyLogPhotoURLs(ctx context.Context, value any) []any {
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

// dailyLogCreatedObject renders Eloquent\u0027s CREATED log (create order).
func dailyLogCreatedObject(ctx context.Context, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("user_id", projectRawValue(byName["user_id"]))
	entry.Set("log_date", projectTimeValue(byName["log_date"]))
	entry.Set("weather", projectRawValue(byName["weather"]))
	entry.Set("worker_count", projectRawValue(byName["worker_count"]))
	entry.Set("activities", projectRawValue(byName["activities"]))
	entry.Set("issues", projectRawValue(byName["issues"]))
	entry.Set("photos", dailyLogPhotoURLs(ctx, byName["photos"]))
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// loadDailyLog reads one log bound to the project.
func loadDailyLog(ctx context.Context, pool *pgxpool.Pool, projectID, logID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, user_id, log_date, weather, worker_count,
		activities, issues, photos::text, created_at, updated_at
		FROM project_daily_logs WHERE id = $1 AND project_id = $2`, logID, projectID)
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

// DailyLogsIndexHandler serves `GET /api/projects/{project}/daily-logs`.
func DailyLogsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("daily-index: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("daily-index: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT id, project_id, user_id, log_date, weather, worker_count,
			activities, issues, photos::text, created_at, updated_at
			FROM project_daily_logs WHERE project_id = $1 ORDER BY log_date DESC, id`, projectID)
		if err != nil {
			slog.Error("daily-index: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("daily-index: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry := dailyLogObject(ctx, byName)
			if author := intPtrDeref(byName["user_id"]); author != 0 {
				block, err := fullProfileUser(ctx, pool, author, false)
				if err != nil {
					block = nil
				}
				entry.Set("user", block)
			} else {
				entry.Set("user", nil)
			}
			out = append(out, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreDailyLogHandler serves `POST /api/projects/{project}/daily-logs`.
func StoreDailyLogHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("daily-store: viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmProfile *int64
		var category *string
		var pbg *string
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id, project_category, pbg_verified_at::text FROM projects WHERE id = $1`, projectID).
			Scan(&ownerID, &pmProfile, &category, &pbg); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("daily-store: project", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("daily-store: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("daily-store: parties", "error", err)
			serverError(w)
			return
		}

		isHiredKontraktor := viewer.role == "kontraktor" && authzMatchesRole(parties, subject, "kontraktor")
		isPM := verifyAssignedPM(viewer, pmProfile)
		var isSub bool
		_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2 AND status::text = 'active')`,
			projectID, viewer.id).Scan(&isSub)

		if !isHiredKontraktor && !isPM && !isSub {
			message(w, http.StatusForbidden, "Unauthorized. Only the hired contractor, PM, or active sub-professionals can log site activity.")
			return
		}

		isNewBuild := category != nil && (*category == "new_build" || *category == "renovation")
		if isNewBuild {
			pbgApproved := pbg != nil
			if !pbgApproved {
				var milestoneApproved bool
				_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_milestones WHERE project_id = $1
					AND approval_status::text = 'approved' AND (title ILIKE '%PBG%' OR title ILIKE '%IMB%'))`, projectID).Scan(&milestoneApproved)
				pbgApproved = milestoneApproved
			}
			if !pbgApproved {
				message(w, http.StatusForbidden, "Physical site work is locked. PBG permit is missing or unverified.")
				return
			}
		}

		formFields, formFiles, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}
		input := validateDailyLog(formFields, formFiles, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		photoPaths := make([]any, 0)
		for i := 0; i < 4; i++ {
			key := "photos"
			if i > 0 {
				key = "photos"
			}
			file, ok := formFiles[key]
			if !ok || file == nil {
				break
			}
			contents, err := readUploadedFile(r, key)
			if err != nil {
				slog.Error("daily-store: read photo", "error", err)
				serverError(w)
				return
			}
			stored, err := storeVaultFile("daily_logs", file.filename, contents)
			if err != nil {
				slog.Error("daily-store: store photo", "error", err)
				serverError(w)
				return
			}
			photoPaths = append(photoPaths, stored)
			break
		}
		_ = input

		encoded, err := jsonphp.Marshal(photoPaths)
		if err != nil {
			serverError(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("daily-store: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var logID int64
		if err := tx.QueryRow(ctx, `INSERT INTO project_daily_logs
			(project_id, user_id, log_date, weather, worker_count, activities, issues, photos, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`,
			projectID, viewer.id, input.logDate, input.weather, input.workerCount, input.activities, input.issues, string(encoded)).Scan(&logID); err != nil {
			slog.Error("daily-store: insert", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "daily_log_added",
			"Added site log for "+input.logDate); err != nil {
			slog.Error("daily-store: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("daily-store: commit", "error", err)
			serverError(w)
			return
		}

		byName, found, err := loadDailyLog(ctx, pool, projectID, logID)
		if err != nil || !found {
			slog.Error("daily-store: reload", "error", err)
			serverError(w)
			return
		}

		entry := dailyLogCreatedObject(ctx, byName)
		author, err := fullProfileUser(ctx, pool, viewer.id, false)
		if err == nil {
			entry.Set("user", author)
		} else {
			entry.Set("user", nil)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// dailyLogInput is the validated log.
type dailyLogInput struct {
	logDate     string
	weather     string
	workerCount int64
	activities  string
	issues      any
}

// validateDailyLog enforces the store rules in declaration order.
func validateDailyLog(fields map[string]any, files map[string]*uploadedFile, failures *errorBag) dailyLogInput {
	var input dailyLogInput

	if raw, present := fields["log_date"]; !present || raw == nil {
		failures.add("log_date", "The log date field is required.")
	} else if s, isStr := raw.(string); !isStr || !looksLikeDate(s) {
		failures.add("log_date", "The log date field must be a valid date.")
	} else {
		input.logDate = s
	}

	if raw, present := fields["weather"]; !present || raw == nil {
		failures.add("weather", "The weather field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("weather", "The weather field must be a string.")
	} else if s == "" {
		failures.add("weather", "The weather field is required.")
	} else if len([]rune(s)) > 50 {
		failures.add("weather", "The weather field must not be greater than 50 characters.")
	} else {
		input.weather = s
	}

	if raw, present := fields["worker_count"]; !present || raw == nil {
		failures.add("worker_count", "The worker count field is required.")
	} else if text, ok := numericTextOf(raw); !ok || text == "" || !isIntegerText(text) {
		failures.add("worker_count", "The worker count field must be an integer.")
	} else if parsed, err := strconv.ParseInt(stringsTrim(text), 10, 64); err != nil {
		failures.add("worker_count", "The worker count field must be an integer.")
	} else if parsed < 0 {
		failures.add("worker_count", "The worker count field must be at least 0.")
	} else {
		input.workerCount = parsed
	}

	if raw, present := fields["activities"]; !present || raw == nil {
		failures.add("activities", "The activities field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("activities", "The activities field must be a string.")
	} else if s == "" {
		failures.add("activities", "The activities field is required.")
	} else {
		input.activities = s
	}

	if raw, present := fields["issues"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("issues", "The issues field must be a string.")
		} else if s != "" {
			input.issues = s
		}
	}

	_ = files
	return input
}

// looksLikeDate accepts YYYY-MM-DD and the common datetime spellings.
func looksLikeDate(text string) bool {
	if len(text) < 10 {
		return false
	}
	if text[4] != '-' || text[7] != '-' {
		return false
	}
	for i := 0; i < 10; i++ {
		if i == 4 || i == 7 {
			continue
		}
		if text[i] < '0' || text[i] > '9' {
			return false
		}
	}
	return true
}

// DestroyDailyLogHandler serves
// `DELETE /api/projects/{project}/daily-logs/{dailyLog}`.
func DestroyDailyLogHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("dailyLog")
		if rawID == "" {
			rawID = lastPathSegment(r.URL.Path)
		}
		logID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectDailyLog`, rawID)
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
			slog.Error("daily-destroy: viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := loadDailyLog(ctx, pool, projectID, logID)
		if err != nil || !found {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		if author := intPtrDeref(byName["user_id"]); author != viewer.id {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		logDate, _ := byName["log_date"].(string)
		if _, err := pool.Exec(ctx, `DELETE FROM project_daily_logs WHERE id = $1`, logID); err != nil {
			slog.Error("daily-destroy: delete", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "daily_log_deleted",
			"Removed site log for "+logDate); err != nil {
			slog.Error("daily-destroy: log", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Log entry deleted.")
	}
}
