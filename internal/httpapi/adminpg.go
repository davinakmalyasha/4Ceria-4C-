package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PG ADMIN IDENTITY — all-PostgreSQL local mode.
//
// Mirrors AdminSuspendUserHandler / AdminUpdateUserRoleHandler without MySQL
// and without re-sync: PostgreSQL is the owner store, so the write and the
// read see the same row in one pool.

// AdminSuspendUserPGHandler serves `PATCH /api/admin/users/{user}/suspend` on PG.
func AdminSuspendUserPGHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawID := r.PathValue("user")
		userID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\User`, rawID)
			return
		}
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		if caller.UserID() == userID {
			message(w, http.StatusBadRequest, "You cannot suspend your own account.")
			return
		}
		ctx := r.Context()
		var suspended bool
		if err := pool.QueryRow(ctx, `SELECT COALESCE(is_suspended,false) FROM users WHERE id = $1`, userID).Scan(&suspended); err != nil {
			modelNotFound(w, `App\Models\User`, rawID)
			return
		}
		next := !suspended
		if _, err := pool.Exec(ctx, `UPDATE users SET is_suspended = $1, updated_at = NOW() WHERE id = $2`, next, userID); err != nil {
			slog.Error("admin suspend-pg: update", "error", err)
			serverError(w)
			return
		}
		if next {
			if _, err := pool.Exec(ctx, `DELETE FROM personal_access_tokens WHERE tokenable_type = $1 AND tokenable_id = $2`, `App\Models\User`, userID); err != nil {
				slog.Error("admin suspend-pg: revoke tokens", "error", err)
				serverError(w)
				return
			}
		}
		user, err := adminUserResponse(ctx, pool, userID)
		if err != nil {
			slog.Error("admin suspend-pg: render", "error", err)
			serverError(w)
			return
		}
		text := "User account activated successfully."
		if next {
			text = "User account suspended successfully. All active sessions were revoked."
		}
		payload := jsonphp.NewObject()
		payload.Set("message", text)
		payload.Set("user", user)
		writeJSON(w, http.StatusOK, payload)
	}
}

// AdminUpdateUserRolePGHandler serves `PATCH /api/admin/users/{user}/role` on PG.
func AdminUpdateUserRolePGHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawID := r.PathValue("user")
		userID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\User`, rawID)
			return
		}
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		if caller.UserID() == userID {
			message(w, http.StatusBadRequest, "You cannot change your own role.")
			return
		}
		ctx := r.Context()
		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		roleType := validateAdminRoleType(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}
		var exists int
		if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE id = $1`, userID).Scan(&exists); err != nil {
			serverError(w)
			return
		}
		if exists == 0 {
			modelNotFound(w, `App\Models\User`, rawID)
			return
		}
		var roleID int64
		if err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = $1 AND guard_name = 'web' LIMIT 1`, roleType).Scan(&roleID); err != nil {
			if err := pool.QueryRow(ctx, `INSERT INTO roles (name, guard_name, created_at, updated_at) VALUES ($1,'web',NOW(),NOW()) RETURNING id`, roleType).Scan(&roleID); err != nil {
				slog.Error("admin role-pg: create role", "error", err)
				serverError(w)
				return
			}
		}
		if _, err := pool.Exec(ctx, `DELETE FROM model_has_roles WHERE model_type = $1 AND model_id = $2`, `App\Models\User`, userID); err != nil {
			serverError(w)
			return
		}
		if _, err := pool.Exec(ctx, `INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, roleID, `App\Models\User`, userID); err != nil {
			serverError(w)
			return
		}
		if _, err := pool.Exec(ctx, `UPDATE users SET role_type = $1, updated_at = NOW() WHERE id = $2`, roleType, userID); err != nil {
			serverError(w)
			return
		}
		user, err := adminUserResponse(ctx, pool, userID)
		if err != nil {
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("message", "User role updated successfully.")
		payload.Set("user", user)
		writeJSON(w, http.StatusOK, payload)
	}
}
