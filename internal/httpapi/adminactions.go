package httpapi

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ADMIN WRITES — suspend/activate a user or a listing, change a role, and
// approve or reject a professional.
//
// Identity (users, personal_access_tokens and the Spatie tables) is
// MySQL-owned, so the two user verbs write MySQL and re-sync the mirror
// before rendering; everything else writes PostgreSQL like the rest of the
// port.
//
// Three subtle behaviours are load-bearing:
//   - suspending REVOKES every personal access token, otherwise a suspended
//     account keeps working with the bearer token it already holds;
//   - a house/listing response renders `is_suspended` as the BOOLEAN the
//     oracle just assigned (the raw model has no cast, so a RELOAD would
//     render MySQL's tinyint 1 instead);
//   - the professional answer is the profile model with its appends and the
//     eager-loaded `user`.

// adminRoleTypes is the controller's role_type allowlist, in order.
var adminRoleTypes = []string{
	"user", "arsitek", "kontraktor", "admin", "notaris", "interior", "structural",
	"mep", "project_manager", "supplier", "logistics", "civil", "mechanical",
	"electrical", "plumbing", "roofing", "finishing",
}

// adminProfessionalTables maps the verification `type` path segment to its
// profile table — the same map the controller uses.
var adminProfessionalTables = map[string]string{
	"arsitek": "arsiteks", "kontraktor": "kontraktors",
	"civil": "kontraktors", "mechanical": "kontraktors",
	"electrical": "kontraktors", "plumbing": "kontraktors",
	"roofing": "kontraktors", "finishing": "kontraktors",
	"project_manager": "project_managers", "structural": "structural_engineers",
	"mep": "mep_engineers", "notaris": "notaris_profiles",
	"interior": "interior_profiles", "supplier": "suppliers",
	"logistics": "courier_profiles",
}

// adminUserResponse reads the user from PostgreSQL (already re-synced) and
// appends the Spatie roles, exactly like `$user->load('roles')`.
func adminUserResponse(ctx context.Context, pool *pgxpool.Pool, userID int64) (*jsonphp.Object, error) {
	block, err := fullProfileUser(ctx, pool, userID, false)
	if err != nil {
		return nil, err
	}
	roles, err := adminUserRoles(ctx, pool, userID)
	if err != nil {
		return nil, err
	}
	if object, ok := block.(*jsonphp.Object); ok {
		object.Set("roles", roles)
		return object, nil
	}
	entry := jsonphp.NewObject()
	entry.Set("roles", roles)
	return entry, nil
}

// AdminSuspendUserHandler serves
// `PATCH /api/admin/users/{user}/suspend`.
func AdminSuspendUserHandler(mysqlDB, mysqlWall *sql.DB, pool *pgxpool.Pool) http.HandlerFunc {
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
		if err := mysqlDB.QueryRowContext(ctx,
			`SELECT is_suspended FROM users WHERE id = ?`, userID).Scan(&suspended); err != nil {
			if err == sql.ErrNoRows {
				modelNotFound(w, `App\Models\User`, rawID)
				return
			}
			slog.Error("admin suspend: load", "error", err)
			serverError(w)
			return
		}

		next := !suspended
		if _, err := mysqlDB.ExecContext(ctx,
			`UPDATE users SET is_suspended = ?, updated_at = NOW() WHERE id = ?`, next, userID); err != nil {
			slog.Error("admin suspend: update", "error", err)
			serverError(w)
			return
		}

		if next {
			// SECURITY: without this the account keeps working with the
			// bearer token it already holds.
			if _, err := mysqlDB.ExecContext(ctx,
				`DELETE FROM personal_access_tokens
				  WHERE tokenable_type = ? AND tokenable_id = ?`, `App\Models\User`, userID); err != nil {
				slog.Error("admin suspend: revoke tokens", "error", err)
				serverError(w)
				return
			}
		}

		if err := syncAuthUserToPG(ctx, mysqlDB, mysqlWall, pool, userID); err != nil {
			slog.Error("admin suspend: resync", "error", err)
			serverError(w)
			return
		}

		user, err := adminUserResponse(ctx, pool, userID)
		if err != nil {
			slog.Error("admin suspend: render", "error", err)
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

// AdminUpdateUserRoleHandler serves `PATCH /api/admin/users/{user}/role`.
func AdminUpdateUserRoleHandler(mysqlDB, mysqlWall *sql.DB, pool *pgxpool.Pool) http.HandlerFunc {
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
		if err := mysqlDB.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM users WHERE id = ?`, userID).Scan(&exists); err != nil {
			slog.Error("admin role: load", "error", err)
			serverError(w)
			return
		}
		if exists == 0 {
			modelNotFound(w, `App\Models\User`, rawID)
			return
		}

		// Spatie's syncRoles([name]): find or create the role, replace the
		// user's assignments, then write role_type.
		var roleID int64
		err = mysqlDB.QueryRowContext(ctx,
			`SELECT id FROM roles WHERE name = ? AND guard_name = 'web' LIMIT 1`, roleType).Scan(&roleID)
		if err == sql.ErrNoRows {
			result, insertErr := mysqlDB.ExecContext(ctx,
				`INSERT INTO roles (name, guard_name, created_at, updated_at) VALUES (?, 'web', NOW(), NOW())`,
				roleType)
			if insertErr != nil {
				slog.Error("admin role: create role", "error", insertErr)
				serverError(w)
				return
			}
			roleID, _ = result.LastInsertId()
		} else if err != nil {
			slog.Error("admin role: find role", "error", err)
			serverError(w)
			return
		}

		if _, err := mysqlDB.ExecContext(ctx,
			`DELETE FROM model_has_roles WHERE model_type = ? AND model_id = ?`, `App\Models\User`, userID); err != nil {
			slog.Error("admin role: clear", "error", err)
			serverError(w)
			return
		}
		if _, err := mysqlDB.ExecContext(ctx,
			`INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (?, ?, ?)`,
			roleID, `App\Models\User`, userID); err != nil {
			slog.Error("admin role: assign", "error", err)
			serverError(w)
			return
		}
		if _, err := mysqlDB.ExecContext(ctx,
			`UPDATE users SET role_type = ?, updated_at = NOW() WHERE id = ?`, roleType, userID); err != nil {
			slog.Error("admin role: user", "error", err)
			serverError(w)
			return
		}

		if err := syncAuthUserToPG(ctx, mysqlDB, mysqlWall, pool, userID); err != nil {
			slog.Error("admin role: resync", "error", err)
			serverError(w)
			return
		}

		user, err := adminUserResponse(ctx, pool, userID)
		if err != nil {
			slog.Error("admin role: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "User role updated successfully.")
		payload.Set("user", user)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateAdminRoleType enforces role_type required|in:… .
func validateAdminRoleType(fields map[string]any, failures *errorBag) string {
	raw, present := fields["role_type"]
	if !present || raw == nil {
		failures.add("role_type", "The role type field is required.")
		return ""
	}
	text, ok := raw.(string)
	if !ok {
		failures.add("role_type", "The selected role type is invalid.")
		return ""
	}
	for _, allowed := range adminRoleTypes {
		if allowed == text {
			return text
		}
	}
	failures.add("role_type", "The selected role type is invalid.")
	return ""
}

// houseResponseObject renders a house row plus its owner. `suspended` is the
// value the request JUST assigned, so it renders as a boolean (the oracle's
// in-memory attribute) rather than the raw tinyint a reload would produce.
func houseResponseObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any, suspended bool) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range houseModelColumns {
		value := byName[column]
		switch column {
		case "price":
			entry.Set(column, projectDecimalValue(value))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		case "is_suspended":
			entry.Set(column, suspended)
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	owner := intPtrDeref(byName["id_user"])
	if owner != 0 {
		user, err := fullProfileUser(ctx, pool, owner, false)
		if err != nil {
			user = nil
		}
		entry.Set("user", user)
	} else {
		entry.Set("user", nil)
	}
	return entry
}

// AdminSuspendHouseHandler serves `PATCH /api/admin/houses/{id}/suspend`.
func AdminSuspendHouseHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawID := r.PathValue("id")
		houseID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\House`, rawID)
			return
		}
		ctx := r.Context()

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(houseModelColumns, ", ")+`
			FROM house WHERE id = $1`, houseID)
		if err != nil {
			slog.Error("admin house suspend: load", "error", err)
			serverError(w)
			return
		}
		fields := []string{}
		values := []any{}
		if rows.Next() {
			fields = fieldNames(rows)
			values, err = scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				slog.Error("admin house suspend: scan", "error", err)
				serverError(w)
				return
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			slog.Error("admin house suspend: rows", "error", err)
			serverError(w)
			return
		}
		if len(values) == 0 {
			modelNotFound(w, `App\Models\House`, rawID)
			return
		}

		byName := map[string]any{}
		for i, column := range fields {
			byName[column] = values[i]
		}

		current := false
		if flag, ok := byName["is_suspended"].(bool); ok {
			current = flag
		} else if number, ok := byName["is_suspended"].(int64); ok {
			current = number != 0
		}
		next := !current

		if _, err := pool.Exec(ctx, `UPDATE house SET is_suspended = $2,
			updated_at = date_trunc('second', now()) WHERE id = $1`, houseID, next); err != nil {
			slog.Error("admin house suspend: update", "error", err)
			serverError(w)
			return
		}
		byName["is_suspended"] = next

		text := "Listing activated successfully."
		if next {
			text = "Listing suspended successfully."
		}
		payload := jsonphp.NewObject()
		payload.Set("message", text)
		payload.Set("house", houseResponseObject(ctx, pool, byName, next))
		writeJSON(w, http.StatusOK, payload)
	}
}

// AdminUpdateProfessionalStatusHandler serves
// `PATCH /api/admin/professionals/{type}/{id}/status`.
func AdminUpdateProfessionalStatusHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		typeKey := r.PathValue("type")
		rawID := r.PathValue("id")
		profileID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\User`, rawID)
			return
		}
		table, known := adminProfessionalTables[typeKey]
		if !known {
			message(w, http.StatusBadRequest, "Invalid professional type")
			return
		}
		ctx := r.Context()

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		status, reason, reasonSet := validateProfessionalStatus(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		columns, ok := profileModelColumns[table]
		if !ok {
			columns = []string{"*"}
		}
		rows, err := pool.Query(ctx, `SELECT `+strings.Join(columns, ", ")+`
			FROM `+table+` WHERE id = $1`, profileID)
		if err != nil {
			slog.Error("admin professional: load", "error", err)
			serverError(w)
			return
		}
		fields := []string{}
		values := []any{}
		if rows.Next() {
			fields = fieldNames(rows)
			values, err = scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				slog.Error("admin professional: scan", "error", err)
				serverError(w)
				return
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			slog.Error("admin professional: rows", "error", err)
			serverError(w)
			return
		}
		if len(values) == 0 {
			modelNotFound(w, `App\Models\Professional`, rawID)
			return
		}

		byName := map[string]any{}
		for i, column := range fields {
			byName[column] = values[i]
		}

		var rejection any
		if status == "rejected" && reasonSet {
			rejection = reason
		}
		if _, err := pool.Exec(ctx, `UPDATE `+table+` SET verification_status = $2,
			rejection_reason = $3, updated_at = date_trunc('second', now()) WHERE id = $1`,
			profileID, status, rejection); err != nil {
			slog.Error("admin professional: update", "error", err)
			serverError(w)
			return
		}

		// The dashboard notification (best-effort: the oracle swallows its
		// errors too).
		userID := intPtrDeref(byName["user_id"])
		if userID != 0 {
			label := ucfirstASCII(typeKey)
			title := "Account Verification Approved"
			body := "Your request to join as a " + label + " has been approved! You can now access professional features."
			if status == "rejected" {
				title = "Account Verification Rejected"
				note := "No specific reason provided."
				if reasonSet && reason != "" {
					note = reason
				}
				body = "Your request to join as a " + label + " has been rejected. Reason: " + note
			}

			data := jsonphp.NewObject()
			data.Set("status", status)
			data.Set("professional_type", typeKey)
			if status == "rejected" && reasonSet {
				data.Set("reason", reason)
			} else {
				data.Set("reason", nil)
			}
			encoded, err := jsonphp.Marshal(data)
			if err == nil {
				if err := insertNotificationPool(ctx, pool, userID, "verification", title, body, string(encoded)); err != nil {
					slog.Warn("admin professional: notification", "error", err)
				}
			}
		}

		block, err := profileModelObject(ctx, pool, table, profileID, true)
		if err != nil {
			slog.Error("admin professional: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Professional status updated to "+status)
		payload.Set("professional", block)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateProfessionalStatus enforces status required|in:verified,rejected
// and reason nullable|string|max:500.
func validateProfessionalStatus(fields map[string]any, failures *errorBag) (string, string, bool) {
	status := ""
	if raw, present := fields["status"]; !present || raw == nil {
		failures.add("status", "The status field is required.")
	} else if text, ok := raw.(string); !ok {
		failures.add("status", "The selected status is invalid.")
	} else if text != "verified" && text != "rejected" {
		failures.add("status", "The selected status is invalid.")
	} else {
		status = text
	}

	reason := ""
	reasonSet := false
	if raw, present := fields["reason"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("reason", "The reason field must be a string.")
		} else if len([]rune(text)) > 500 {
			failures.add("reason", "The reason field must not be greater than 500 characters.")
		} else if text != "" {
			reason = text
			reasonSet = true
		}
	}

	return status, reason, reasonSet
}

// ucfirstASCII upper-cases the first byte, like PHP's ucfirst().
func ucfirstASCII(value string) string {
	if value == "" {
		return value
	}
	head := strings.ToUpper(value[:1])
	return head + value[1:]
}
