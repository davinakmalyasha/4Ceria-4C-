package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT ACTIVITY — GET /api/projects/{project}/activity.
//
// The project's event stream: financial and lifecycle entries, newest
// first, capped at 50. Participants only (owner or hired professional —
// the same rule as the dispute thread, via isParticipant, which is
// authorizeProjectAccess without the abort): a bidder or a stranger reads
// 403 with the trait's sentence, not the policy shape.

// ActivityHandler serves `GET /api/projects/{project}/activity`.
func ActivityHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("activity: subject", "error", err)
			serverError(w)
			return
		}

		projectFields, projectValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("activity: project", "error", err)
			serverError(w)
			return
		}
		_ = projectFields
		_ = projectValues

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("activity: parties", "error", err)
			serverError(w)
			return
		}

		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT id, project_id, user_id, action, details, created_at, updated_at FROM project_activity_logs WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`, projectID)
		if err != nil {
			slog.Error("activity: logs", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			var id, projectIDVal, userID *int64
			var action, details *string
			var createdAt, updatedAt any

			if err := rows.Scan(&id, &projectIDVal, &userID, &action, &details, &createdAt, &updatedAt); err != nil {
				slog.Error("activity: scan", "error", err)
				serverError(w)
				return
			}

			entry := jsonphp.NewObject()
			entry.Set("id", nullableInt64(id))
			entry.Set("project_id", nullableInt64(projectIDVal))
			entry.Set("user_id", nullableInt64(userID))
			entry.Set("action", nullableString(action))
			entry.Set("details", nullableString(details))
			entry.Set("created_at", projectTimeValue(createdAt))
			entry.Set("updated_at", projectTimeValue(updatedAt))

			user, err := nullableUser(ctx, pool, userID)
			if err != nil {
				slog.Error("activity: user", "error", err)
				serverError(w)
				return
			}
			entry.Set("user", user)

			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("activity: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)

		writeJSON(w, http.StatusOK, payload)
	}
}
