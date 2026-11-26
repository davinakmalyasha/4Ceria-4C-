package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StatsHandler serves `GET /api/admin/stats`.
//
// The body is assembled in a deliberate order (`jsonwire.Object`, not a map)
// because clients and fixtures read it as a stable document. Counts are
// integers, not floats: a count is exact, and `34` and `34.0` are different
// JSON values to a strict client.
func StatsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		var stats struct {
			users               int
			houses              int
			projects            int
			pendingVerification int
			activeProjects      int
			roles               map[string]int
		}

		// One round trip: every counter is a scalar subquery, and the role
		// distribution is aggregated inside PostgreSQL. Six sequential
		// queries were six chances for a dashboard load to queue.
		var rolesJSON []byte
		err := pool.QueryRow(ctx, `
			SELECT
				(SELECT count(*) FROM users),
				(SELECT count(*) FROM house),
				(SELECT count(*) FROM projects),
				(SELECT count(*) FROM arsiteks             WHERE verification_status = 'pending')
				+ (SELECT count(*) FROM kontraktors          WHERE verification_status = 'pending')
				+ (SELECT count(*) FROM project_managers     WHERE verification_status = 'pending')
				+ (SELECT count(*) FROM structural_engineers WHERE verification_status = 'pending')
				+ (SELECT count(*) FROM mep_engineers        WHERE verification_status = 'pending')
				+ (SELECT count(*) FROM suppliers            WHERE verification_status = 'pending')
				+ (SELECT count(*) FROM interior_profiles    WHERE verification_status = 'pending')
				+ (SELECT count(*) FROM notaris_profiles     WHERE verification_status = 'pending'),
				(SELECT count(*) FROM projects WHERE status NOT IN ('completed', 'cancelled')),
				COALESCE((
					SELECT jsonb_object_agg(role, total)
					  FROM (
						SELECT COALESCE(role_type::text, 'user') AS role, count(*) AS total
						  FROM users
						 GROUP BY role_type
					  ) distribution
				), '{}'::jsonb)
		`).Scan(
			&stats.users,
			&stats.houses,
			&stats.projects,
			&stats.pendingVerification,
			&stats.activeProjects,
			&rolesJSON,
		)
		if err != nil {
			slog.Error("stats", "error", err)
			serverError(w)
			return
		}
		stats.roles = map[string]int{}
		if err := json.Unmarshal(rolesJSON, &stats.roles); err != nil {
			slog.Error("stats: roles", "error", err)
			serverError(w)
			return
		}

		body := jsonwire.NewObject()
		body.Set("total_users", stats.users)
		body.Set("total_houses", stats.houses)
		body.Set("total_projects", stats.projects)
		body.Set("pending_verifications", stats.pendingVerification)
		body.Set("active_projects", stats.activeProjects)

		distribution := jsonwire.NewObject()

		// The UI's role order. A role absent from the data is `0`, not missing:
		// the distribution always has the same keys.
		for _, key := range []string{
			"client", "arsitek", "kontraktor", "supplier", "notaris", "interior", "project_manager",
		} {
			role := key

			if key == "client" {
				role = "user"
			}

			distribution.Set(key, stats.roles[role])
		}

		body.Set("role_distribution", distribution)

		writeJSON(w, http.StatusOK, body)
	}
}

// serverError is the 500 the original application returns with `APP_DEBUG=false`.
//
// The CAUSE is logged, with the query's own message, and never returned.
//
// The MESSAGE IS FIXED and carries no detail: an internal error must not leak a
// query, a path or a stack to the caller.
func serverError(w http.ResponseWriter) {
	message(w, http.StatusInternalServerError, "Server Error")
}

// gateError answers a loader-gate failure.
//
// A gate that cannot find its row is answering for a client-supplied id
// that names nothing: that is a 404, not a 500. Every other gate failure
// keeps the old 500, so swapping a gate's `serverError` for this changes
// nothing except genuine no-rows cases (matched with errors.Is, so
// wrapped pgx.ErrNoRows counts too). The body stays entity-neutral:
// these gates load projects, termins, bids and milestones alike.
func gateError(w http.ResponseWriter, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		message(w, http.StatusNotFound, "Record not found.")
		return
	}
	serverError(w)
}

// NotificationsHandler serves `GET /api/notifications`.
//
// The list is the caller's newest 20 rows, `created_at DESC`. The `data`
// column is a JSON document and is embedded as a document, not as a string;
// timestamps use the API's fixed `2006-01-02T15:04:05.000000Z` shape.
func NotificationsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())

		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		rows, err := pool.Query(r.Context(), `
			SELECT id, user_id, type, title, body, COALESCE(data::text, '{}'), read_at, created_at, updated_at
			  FROM notifications
			 WHERE user_id = $1
			 ORDER BY created_at DESC
			 LIMIT 20
		`, caller.UserID())
		if err != nil {
			slog.Error("notifications: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		list := make([]any, 0, 20)

		for rows.Next() {
			var (
				id, userID                   int64
				kind, title, body            string
				data                         []byte
				readAt, createdAt, updatedAt *time.Time
			)

			if err := rows.Scan(&id, &userID, &kind, &title, &body, &data, &readAt, &createdAt, &updatedAt); err != nil {
				slog.Error("notifications: scan", "error", err)
				serverError(w)
				return
			}

			row := jsonwire.NewObject()
			row.Set("id", id)
			row.Set("user_id", userID)
			row.Set("type", kind)
			row.Set("title", title)
			row.Set("body", body)

			// A `json`/`jsonb` column: the response embeds the DOCUMENT, not a
			// string containing one. Compact it first so insignificant
			// whitespace from the driver never changes the wire shape.
			row.Set("data", jsonwire.Raw(jsonwire.CompactJSON(data)))

			row.Set("read_at", apiTimestamp(readAt))
			row.Set("created_at", apiTimestamp(createdAt))
			row.Set("updated_at", apiTimestamp(updatedAt))

			list = append(list, row)
		}

		if err := rows.Err(); err != nil {
			slog.Error("notifications: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonwire.NewObject()
		payload.Set("data", list)

		writeJSON(w, http.StatusOK, payload)
	}
}

// apiTimestamp renders a timestamp in the API's wire shape.
//
// It is ISO 8601 in UTC with SIX fractional digits and a `Z` — not Go's
// `time.RFC3339Nano`, which trims trailing zeros and would render `…:05Z`
// instead of the stable `…:05.000000Z`.
func apiTimestamp(value *time.Time) any {
	if value == nil {
		return nil
	}

	return value.UTC().Format("2006-01-02T15:04:05.000000Z")
}

// ActiveProjectsHandler serves `GET /api/user/active-projects`.
//
// A clause is added only for a profile the caller actually has. Comparing a
// nullable profile id without that guard matches every project whose column is
// null, which is how an account with no profile could see projects it neither
// owned nor worked on. The narrow filter is the intended rule.
func ActiveProjectsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empty := func() {
			payload := jsonwire.NewObject()
			payload.Set("data", []any{})
			writeJSON(w, http.StatusOK, payload)
		}

		// An anonymous caller gets `{"data":[]}`
		// rather than 401 — the route has no `auth` middleware.
		caller, ok := CallerFrom(r.Context())

		if !ok {
			empty()
			return
		}

		ctx := r.Context()

		// The caller's profile per role, in ONE round trip. A role the user does
		// not hold answers NULL, and the NULL is what the WHERE clause must skip.
		var (
			arsitek, kontraktor, notaris, interior, pm, structural, mep *int64
		)

		err := pool.QueryRow(ctx, `
			SELECT (SELECT id FROM arsiteks             WHERE user_id = $1 LIMIT 1),
			       (SELECT id FROM kontraktors          WHERE user_id = $1 LIMIT 1),
			       (SELECT id FROM notaris_profiles     WHERE user_id = $1 LIMIT 1),
			       (SELECT id FROM interior_profiles    WHERE user_id = $1 LIMIT 1),
			       (SELECT id FROM project_managers     WHERE user_id = $1 LIMIT 1),
			       (SELECT id FROM structural_engineers WHERE user_id = $1 LIMIT 1),
			       (SELECT id FROM mep_engineers        WHERE user_id = $1 LIMIT 1)
		`, caller.UserID()).Scan(&arsitek, &kontraktor, &notaris, &interior, &pm, &structural, &mep)
		if err != nil {
			slog.Error("active-projects: profiles", "error", err)
			serverError(w)
			return
		}

		// One placeholder per predicate, built from the profiles that EXIST.
		where := []string{"p.user_id = $1"}
		args := []any{caller.UserID()}

		// A SLICE, not a map: the generated SQL must be the same on every run,
		// or a slow query log becomes unreadable and a prepared-statement cache
		// misses for no reason.
		for _, role := range []struct {
			column  string
			profile *int64
		}{
			{"p.selected_arsitek_id", arsitek},
			{"p.selected_kontraktor_id", kontraktor},
			{"p.selected_notaris_id", notaris},
			{"p.selected_interior_id", interior},
			{"p.pm_id", pm},
			{"p.structural_id", structural},
			{"p.mep_id", mep},
		} {
			if role.profile == nil {
				continue
			}

			args = append(args, *role.profile)
			where = append(where, fmt.Sprintf("%s = $%d", role.column, len(args)))
		}

		// The statuses are the values the ENUM has. The previous list also names
		// `planning`, which is not a member: MySQL ignores it, PostgreSQL would
		// raise `invalid input value for enum project_status`.
		query := `
			SELECT p.id, p.title
			  FROM projects p
			 WHERE p.status IN ('open', 'accepted_arsitek', 'accepted_kontraktor', 'procurement', 'in_progress')
			   AND (` + strings.Join(where, " OR ") + `)
			 ORDER BY p.created_at DESC, p.id DESC
		`

		rows, err := pool.Query(ctx, query, args...)
		if err != nil {
			slog.Error("active-projects: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		list := make([]any, 0, 8)

		for rows.Next() {
			var (
				id    int64
				title string
			)

			if err := rows.Scan(&id, &title); err != nil {
				slog.Error("active-projects: scan", "error", err)
				serverError(w)
				return
			}

			row := jsonwire.NewObject()
			row.Set("id", id)
			row.Set("title", title)

			list = append(list, row)
		}

		if err := rows.Err(); err != nil {
			slog.Error("active-projects: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonwire.NewObject()
		payload.Set("data", list)

		writeJSON(w, http.StatusOK, payload)
	}
}
