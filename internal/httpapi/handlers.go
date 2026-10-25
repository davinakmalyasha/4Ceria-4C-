package httpapi

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE FIRST PORTED ENDPOINT: `GET /api/admin/stats`.
//
// WHY THIS ONE FIRST
// ------------------
// It is small (219 bytes), it is TIER 1 (admin), and every number it returns is
// an aggregate — so it exercises the whole path the rest of the port needs:
// the auth gate reading Sanctum's token, a query against PostgreSQL, and a body
// encoded to PHP's exact bytes.
//
// THE KEY ORDER IS PART OF THE CONTRACT. PHP arrays preserve insertion order
// and `response()->json()` writes that order, so the object is built with
// `jsonphp.Object` rather than a Go map — a map would sort the keys and the
// body would differ even though every value was right.
//
// THE NUMBERS ARE `int`, NOT `float`. `total_users` is `User::count()`: PHP's
// count is an integer and encodes as `34`, while a Go `float64` would encode as
// `34` only by luck (`jsonphp` writes a float with a decimal point when it has
// one, and `34` from a float is `34` — but `34.0` is not, and the difference is
// invisible until it is not).
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

		err := pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&stats.users)
		if err != nil {
			slog.Error("stats: users", "error", err)
			serverError(w)
			return
		}

		if err := pool.QueryRow(ctx, `SELECT count(*) FROM house`).Scan(&stats.houses); err != nil {
			slog.Error("stats: houses", "error", err)
			serverError(w)
			return
		}

		if err := pool.QueryRow(ctx, `SELECT count(*) FROM projects`).Scan(&stats.projects); err != nil {
			slog.Error("stats: projects", "error", err)
			serverError(w)
			return
		}

		// The eight professional tables, exactly as the controller sums them.
		err = pool.QueryRow(ctx, `
			SELECT (SELECT count(*) FROM arsiteks             WHERE verification_status = 'pending')
			     + (SELECT count(*) FROM kontraktors          WHERE verification_status = 'pending')
			     + (SELECT count(*) FROM project_managers     WHERE verification_status = 'pending')
			     + (SELECT count(*) FROM structural_engineers WHERE verification_status = 'pending')
			     + (SELECT count(*) FROM mep_engineers        WHERE verification_status = 'pending')
			     + (SELECT count(*) FROM suppliers            WHERE verification_status = 'pending')
			     + (SELECT count(*) FROM interior_profiles    WHERE verification_status = 'pending')
			     + (SELECT count(*) FROM notaris_profiles     WHERE verification_status = 'pending')
		`).Scan(&stats.pendingVerification)
		if err != nil {
			slog.Error("stats: verifications", "error", err)
			serverError(w)
			return
		}

		// "Active operations" = anything not in a terminal state.
		//
		// THE LEGACY FILTER NAMES A THIRD VALUE, AND IT DOES NOT EXIST.
		// `ProjectController` writes `whereNotIn('status', ['completed',
		// 'cancelled', 'terminated'])`, but `projects.status` is an ENUM whose
		// members are {open, accepted_arsitek, accepted_kontraktor,
		// awaiting_payment, in_progress, termination_pending, legal,
		// procurement, completed_build, completed, cancelled} — there is no
		// `terminated`.
		//
		// MySQL coerces the unknown literal and ignores it, so the legacy query
		// has always meant "not completed and not cancelled". PostgreSQL REJECTS
		// the literal outright (`invalid input value for enum project_status`),
		// which is how the port found it: the same filter, ported literally,
		// stops answering at all.
		//
		// The filter is written with the values the ENUM has, so the two
		// engines return the same rows.
		err = pool.QueryRow(ctx, `
			SELECT count(*) FROM projects
			 WHERE status NOT IN ('completed', 'cancelled')
		`).Scan(&stats.activeProjects)
		if err != nil {
			slog.Error("stats: active", "error", err)
			serverError(w)
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT COALESCE(role_type::text, 'user') AS role, count(*)
			  FROM users
			 GROUP BY role_type
		`)
		if err != nil {
			slog.Error("stats: roles", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		stats.roles = map[string]int{}

		for rows.Next() {
			var (
				role  string
				total int
			)

			if err := rows.Scan(&role, &total); err != nil {
				serverError(w)
				return
			}

			stats.roles[role] = total
		}

		if err := rows.Err(); err != nil {
			serverError(w)
			return
		}

		body := jsonphp.NewObject()
		body.Set("total_users", stats.users)
		body.Set("total_houses", stats.houses)
		body.Set("total_projects", stats.projects)
		body.Set("pending_verifications", stats.pendingVerification)
		body.Set("active_projects", stats.activeProjects)

		distribution := jsonphp.NewObject()

		// The controller's order, with the keys the UI reads. A role absent
		// from the data is `0`, not missing: PHP's `(int) $roles->get(...)`.
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

// serverError is the 500 the legacy application returns with `APP_DEBUG=false`.
//
// The CAUSE is logged, with the query's own message, and never returned.
//
// The MESSAGE IS FIXED and carries no detail: an internal error must not leak a
// query, a path or a stack to the caller.
func serverError(w http.ResponseWriter) {
	message(w, http.StatusInternalServerError, "Server Error")
}

// NotificationsHandler serves `GET /api/notifications`.
//
// IT IS THE SECOND PORTED ENDPOINT, and it is here because of what it adds to
// the first: a ROW LIST rather than aggregates, a `jsonb` column that must be
// embedded as a document (not as a string), and the timestamp format Eloquent
// writes — `2006-01-02T15:04:05.000000Z`, which is Carbon's `toJSON()`.
//
// The controller is `Notification::where('user_id', Auth::id())->latest()->limit(20)`,
// where `latest()` is `created_at DESC`. The model has no `$hidden`, so every
// column appears, in the table's order.
func NotificationsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())

		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		rows, err := pool.Query(r.Context(), `
			SELECT id, user_id, type, title, body, data::text, read_at, created_at, updated_at
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

			row := jsonphp.NewObject()
			row.Set("id", id)
			row.Set("user_id", userID)
			row.Set("type", kind)
			row.Set("title", title)
			row.Set("body", body)

			// A `json` column cast to `array` by the model: the response embeds
			// the DOCUMENT, not a string containing one.
			//
			// Compacted, because MySQL stores `{"a": 1}` and PHP writes
			// `{"a":1}` — the decode/re-encode the legacy does on the way out.
			row.Set("data", jsonphp.Raw(jsonphp.CompactJSON(data)))

			row.Set("read_at", carbon(readAt))
			row.Set("created_at", carbon(createdAt))
			row.Set("updated_at", carbon(updatedAt))

			list = append(list, row)
		}

		if err := rows.Err(); err != nil {
			slog.Error("notifications: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", list)

		writeJSON(w, http.StatusOK, payload)
	}
}

// carbon renders a timestamp the way Eloquent's date cast does.
//
// `toJSON()` is ISO 8601 in UTC with SIX fractional digits and a `Z` — not
// Go's `time.RFC3339Nano`, which trims trailing zeros and would render
// `…:05Z` where PHP renders `…:05.000000Z`.
func carbon(value *time.Time) any {
	if value == nil {
		return nil
	}

	return value.UTC().Format("2006-01-02T15:04:05.000000Z")
}

// ActiveProjectsHandler serves `GET /api/user/active-projects`.
//
// IT IS THE THIRD PORTED ENDPOINT, and it is the one that found a live data
// leak in the legacy controller (B32): `orWhere($column, null)` is
// `orWhereNull($column)`, so a user with no profile for a role matched EVERY
// project whose column for that role was empty. An administrator with no
// profiles saw the id and title of projects they neither owned nor worked on.
//
// The port cannot reproduce that and still be a valid replacement, so this
// handler implements the INTENDED filter — a clause is added only for a profile
// the user actually has — and the legacy controller was corrected to match. A
// deliberate divergence is documented; a silent one is a defect.
func ActiveProjectsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		empty := func() {
			payload := jsonphp.NewObject()
			payload.Set("data", []any{})
			writeJSON(w, http.StatusOK, payload)
		}

		// The legacy controller answers `{"data":[]}` for an anonymous caller
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

		// The statuses are the values the ENUM has. The legacy list also names
		// `planning`, which is not a member: MySQL ignores it, PostgreSQL would
		// raise `invalid input value for enum project_status`.
		query := `
			SELECT p.id, p.title
			  FROM projects p
			 WHERE p.status IN ('open', 'accepted_arsitek', 'accepted_kontraktor', 'procurement', 'in_progress')
			   AND (` + strings.Join(where, " OR ") + `)
			 ORDER BY p.created_at DESC
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

			row := jsonphp.NewObject()
			row.Set("id", id)
			row.Set("title", title)

			list = append(list, row)
		}

		if err := rows.Err(); err != nil {
			slog.Error("active-projects: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", list)

		writeJSON(w, http.StatusOK, payload)
	}
}
