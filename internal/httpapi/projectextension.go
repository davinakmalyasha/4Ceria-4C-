package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TIMELINE EXTENSIONS — participants request days, the PM reviews, the
// owner approves.
//
// index answers the raw rows with their requester; store records the
// request against the project's CURRENT deadline; pm-review moves it to
// pm_reviewed/rejected with notes; owner-decide moves it to
// approved/rejected — an approval computes `new_deadline_date` by adding
// the requested days to the project deadline (or today when there is
// none) and pushes `projects.deadline` forward.

// extensionCreatedObject renders Eloquent\u0027s CREATED extension.
func extensionCreatedObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("requester_id", projectRawValue(byName["requester_id"]))
	entry.Set("reason", projectRawValue(byName["reason"]))
	entry.Set("description", projectRawValue(byName["description"]))
	entry.Set("days_requested", projectRawValue(byName["days_requested"]))
	entry.Set("original_deadline", mysqlDate(byName["original_deadline"]))
	entry.Set("status", projectRawValue(byName["status"]))
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// loadExtension reads one extension bound to the project.
func loadExtension(ctx context.Context, q rowQuerier, projectID, id int64) (map[string]any, bool, error) {
	rows, err := q.(interface {
		Query(context.Context, string, ...any) (pgx.Rows, error)
	}).Query(ctx, `SELECT `+joinColumns(extensionColumns)+` FROM project_timeline_extensions WHERE id = $1 AND project_id = $2`, id, projectID)
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

// ExtensionsIndexHandler serves
// `GET /api/projects/{project}/extensions`.
func ExtensionsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("ext-index: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("ext-index: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+joinColumns(extensionColumns)+` FROM project_timeline_extensions WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			slog.Error("ext-index: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("ext-index: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry := extensionObject(byName)
			if requester := intPtrDeref(byName["requester_id"]); requester != 0 {
				block, err := fullProfileUser(ctx, pool, requester, false)
				if err != nil {
					block = nil
				}
				entry.Set("requester", block)
			} else {
				entry.Set("requester", nil)
			}
			out = append(out, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreExtensionHandler serves
// `POST /api/projects/{project}/extensions`.
func StoreExtensionHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("ext-store: viewer", "error", err)
			serverError(w)
			return
		}
		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("ext-store: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("ext-store: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized. Only project participants can request extensions.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		reason, description, days := validateExtension(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var deadline *time.Time
		_ = pool.QueryRow(ctx, `SELECT deadline::timestamp FROM projects WHERE id = $1`, projectID).Scan(&deadline)

		var extID int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_timeline_extensions
			(project_id, requester_id, reason, description, days_requested, status, original_deadline, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, 'proposed', $6, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`,
			projectID, viewer.id, reason, description, days, deadline).Scan(&extID); err != nil {
			slog.Error("ext-store: insert", "error", err)
			serverError(w)
			return
		}

		byName, _, err := loadExtension(ctx, pool, projectID, extID)
		if err != nil {
			slog.Error("ext-store: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Extension requested")
		payload.Set("data", extensionCreatedObject(byName))
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateExtension enforces reason required|string|max:255, description
// nullable|string and days_requested required|integer|min:1.
func validateExtension(fields map[string]any, failures *errorBag) (reason string, description any, days int64) {
	raw, present := fields["reason"]
	if !present || raw == nil {
		failures.add("reason", "The reason field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("reason", "The reason field must be a string.")
	} else if s == "" {
		failures.add("reason", "The reason field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("reason", "The reason field must not be greater than 255 characters.")
	} else {
		reason = s
	}

	if raw, present := fields["description"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("description", "The description field must be a string.")
		} else if s != "" {
			description = s
		}
	}

	rawDays, present := fields["days_requested"]
	if !present || rawDays == nil {
		failures.add("days_requested", "The days requested field is required.")
	} else if text, ok := numericTextOf(rawDays); !ok || text == "" || !isIntegerText(text) {
		failures.add("days_requested", "The days requested field must be an integer.")
	} else if parsed, err := strconv.ParseInt(stringsTrim(text), 10, 64); err != nil {
		failures.add("days_requested", "The days requested field must be an integer.")
	} else if parsed < 1 {
		failures.add("days_requested", "The days requested field must be at least 1.")
	} else {
		days = parsed
	}

	return reason, description, days
}

// ExtensionDecisionHandler serves pm-review and owner-decide.
func ExtensionDecisionHandler(pool *pgxpool.Pool, verb string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("extension")
		if rawID == "" {
			rawID = lastPathSegment(stringsTrimSuffix(r.URL.Path, "/"+verb))
		}
		extID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectTimelineExtension`, rawID)
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
			slog.Error("ext-"+verb+": viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmProfile *int64
		var deadline *time.Time
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id, deadline::timestamp FROM projects WHERE id = $1`, projectID).
			Scan(&ownerID, &pmProfile, &deadline); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			serverError(w)
			return
		}

		byName, found, err := loadExtension(ctx, pool, projectID, extID)
		if err != nil || !found {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}

		if verb == "pm-review" {
			if !verifyAssignedPM(viewer, pmProfile) {
				message(w, http.StatusForbidden, "Unauthorized. Only the assigned Project Manager can review extensions.")
				return
			}
			status, notes := validateExtensionReview(formFields, failures)
			if !failures.empty() {
				failures.write(w)
				return
			}
			if _, err := pool.Exec(ctx, `UPDATE project_timeline_extensions SET status = $2, pm_notes = $3,
				updated_at = date_trunc('second', now()) WHERE id = $1`, extID, status, notes); err != nil {
				slog.Error("ext-pm: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if viewer.id != ownerID {
				message(w, http.StatusForbidden, "Unauthorized. Only the project owner can approve or reject extensions.")
				return
			}
			status, notes := validateExtensionOwner(formFields, failures)
			if !failures.empty() {
				failures.write(w)
				return
			}

			tx, err := pool.Begin(ctx)
			if err != nil {
				slog.Error("ext-owner: begin", "error", err)
				serverError(w)
				return
			}
			defer tx.Rollback(ctx)

			var newDeadline *time.Time
			if status == "approved" {
				base := time.Now().UTC()
				if deadline != nil {
					base = deadline.UTC()
				}
				days := intPtrDeref(byName["days_requested"])
				computed := base.AddDate(0, 0, int(days))
				newDeadline = &computed
			}

			if _, err := tx.Exec(ctx, `UPDATE project_timeline_extensions SET status = $2, owner_notes = $3,
				new_deadline_date = $4, updated_at = date_trunc('second', now()) WHERE id = $1`,
				extID, status, notes, newDeadline); err != nil {
				slog.Error("ext-owner: update", "error", err)
				serverError(w)
				return
			}

			if status == "approved" && newDeadline != nil {
				if _, err := tx.Exec(ctx, `UPDATE projects SET deadline = $2, updated_at = date_trunc('second', now()) WHERE id = $1`,
					projectID, newDeadline); err != nil {
					slog.Error("ext-owner: project", "error", err)
					serverError(w)
					return
				}
			}

			if err := tx.Commit(ctx); err != nil {
				slog.Error("ext-owner: commit", "error", err)
				serverError(w)
				return
			}
		}

		fresh, _, err := loadExtension(ctx, pool, projectID, extID)
		if err != nil {
			slog.Error("ext-"+verb+": reload", "error", err)
			serverError(w)
			return
		}

		msg := "Review submitted"
		if verb != "pm-review" {
			msg = "Decision recorded"
		}
		payload := jsonphp.NewObject()
		payload.Set("message", msg)
		payload.Set("data", extensionObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateExtensionReview enforces status required|in:pm_reviewed,rejected
// and pm_notes nullable|string.
func validateExtensionReview(fields map[string]any, failures *errorBag) (string, any) {
	status := extensionStatus(fields, failures, "pm_reviewed", "rejected")
	return status, optionalString(fields, "pm_notes", failures)
}

// validateExtensionOwner enforces status required|in:approved,rejected
// and owner_notes nullable|string.
func validateExtensionOwner(fields map[string]any, failures *errorBag) (string, any) {
	status := extensionStatus(fields, failures, "approved", "rejected")
	return status, optionalString(fields, "owner_notes", failures)
}

// extensionStatus validates the `status` choice.
func extensionStatus(fields map[string]any, failures *errorBag, allowed ...string) string {
	raw, present := fields["status"]
	if !present || raw == nil {
		failures.add("status", "The status field is required.")
		return ""
	}
	s, isStr := raw.(string)
	if !isStr {
		failures.add("status", "The selected status is invalid.")
		return ""
	}
	if s == "" {
		failures.add("status", "The status field is required.")
		return ""
	}
	for _, a := range allowed {
		if s == a {
			return s
		}
	}
	failures.add("status", "The selected status is invalid.")
	return ""
}

// optionalString validates a nullable|string field.
func optionalString(fields map[string]any, key string, failures *errorBag) any {
	raw, present := fields[key]
	if !present || raw == nil {
		return nil
	}
	s, isStr := raw.(string)
	if !isStr {
		failures.add(key, "The "+attrName(key)+" field must be a string.")
		return nil
	}
	if s == "" {
		return nil
	}
	return s
}
