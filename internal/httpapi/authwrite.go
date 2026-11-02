package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"hash/crc32"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// THE IDENTITY WRITES.
//
// `POST /api/login`, `POST /api/register` and `POST /api/logout` are the
// first handlers that write to MySQL — and deliberately so. ADR-0018 keeps
// `users`, `personal_access_tokens` and the Spatie tables MySQL-owned for
// the whole transition: each table has exactly one writer-facing store,
// and the ETL derives its direction from ownership. Go writes these tables
// through MySQL directly; PostgreSQL is the read mirror for everything the
// serialiser needs.
//
// Two consequences that are load-bearing, not incidental:
//
//  1. After writing, the handler re-syncs the touched rows into PostgreSQL
//     and serialises from there with the EXISTING `userResource`. No second
//     serialiser, no drift between what login returns and what /me returns.
//  2. Tokens live in MySQL and Sanctum reads MySQL (see auth.go), so a
//     token minted by either stack authenticates on both instantly — no
//     ETL window where a fresh login 401s.

// openMySQL opens the owner store. parseTime delivers timestamps as
// time.Time; the ETL's parseTime=false is its own choice for COPY text.
func openMySQL(dsn string) (*sql.DB, error) {
	return sql.Open("mysql", dsn)
}

// tokenAlphabet is Laravel's `Str::random` alphabet.
const tokenAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

// randomTokenString draws n characters from the token alphabet.
func randomTokenString(n int) (string, error) {
	const alphabet = tokenAlphabet

	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}

	for i := range buf {
		buf[i] = alphabet[int(buf[i])%len(alphabet)]
	}

	return string(buf), nil
}

// uniqueCodeAlphabet is `User::generateUniqueCode`'s unambiguous alphabet.
const uniqueCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// bcryptHash hashes with Laravel's settings: cost 12, `$2y$` prefix.
//
// x/crypto emits `$2a$`, which verifies identically at the C level — but
// Laravel's BcryptHasher rejects anything `password_get_info` does not
// recognise as bcrypt, and PHP only recognises `$2y$`. Hashing with Go and
// checking with Laravel (or the reverse) therefore requires the `$2y$`
// spelling; the remaining 60-char body is format-identical.
func bcryptHash(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return "", err
	}

	out := string(hashed)
	if strings.HasPrefix(out, "$2a$") {
		out = "$2y$" + out[4:]
	}

	return out, nil
}

// mintSanctumToken creates a personal access token the way
// `createToken('auth_token')` does: `{id}|{40 random + crc32b}` presented,
// SHA-256 hex stored, `["*"]` abilities, the configured 2-day expiry.
// The suffix is PHP's `hash('crc32b', $entropy)` — the IEEE CRC despite
// the name (verified against a live token).
func mintSanctumToken(ctx context.Context, db *sql.DB, userID int64) (presented string, err error) {
	entropy, err := randomTokenString(40)
	if err != nil {
		return "", err
	}

	plain := entropy + crc32bHex(entropy)
	sum := sha256.Sum256([]byte(plain))

	// The morph class is bound as a parameter, never inlined: MySQL
	// unescapes backslashes in SQL text, so a literal would compare
	// against `AppModelsUser` and miss every row.
	const morphClass = `App\Models\User`

	result, err := db.ExecContext(ctx, `
		INSERT INTO personal_access_tokens
		    (tokenable_type, tokenable_id, name, token, abilities,
		     last_used_at, expires_at, created_at, updated_at)
		VALUES (?, ?, 'auth_token', ?, '["*"]',
		        NULL, DATE_ADD(NOW(), INTERVAL 2880 MINUTE), NOW(), NOW())
	`, morphClass, userID, hex.EncodeToString(sum[:]))
	if err != nil {
		return "", err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return "", err
	}

	return itoaString(id) + "|" + plain, nil
}

// itoaString renders an int64 without importing anything new.
func itoaString(value int64) string {
	return formatInt(value)
}

// asString coerces a database/sql value to text.
func asString(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case []byte:
		return string(typed)
	default:
		return ""
	}
}

// asInt coerces a database/sql integer-ish value.
func asInt(value any) int64 {
	switch typed := value.(type) {
	case nil:
		return 0
	case int64:
		return typed
	case int32:
		return int64(typed)
	case int:
		return int64(typed)
	case bool:
		if typed {
			return 1
		}
		return 0
	case []byte:
		return parseMinorInt(string(typed))
	case string:
		return parseMinorInt(typed)
	default:
		return 0
	}
}

// parseMinorInt reads a plain integer, for ids and flags.
func parseMinorInt(s string) int64 {
	var negative bool
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "+") {
		s = s[1:]
	} else if strings.HasPrefix(s, "-") {
		negative = true
		s = s[1:]
	}

	var value int64
	for _, digit := range s {
		if digit < '0' || digit > '9' {
			return 0
		}
		value = value*10 + int64(digit-'0')
	}

	if negative {
		return -value
	}
	return value
}

// validEmail mirrors the `email` rule closely enough for wire parity: a
// display name plus an addr-spec with an @. Laravel's egulias validator is
// stricter in exotic corners; the golden contracts pin the common shapes.
func validEmail(value string) bool {
	address, err := mail.ParseAddress(value)
	if err != nil {
		return false
	}

	parts := strings.Split(address.Address, "@")
	return len(parts) == 2 && parts[0] != "" && parts[1] != "" && strings.Contains(parts[1], ".")
}

// LoginHandler serves `POST /api/login`.
//
// `Auth::attempt` is a bcrypt comparison against the stored hash; a miss
// answers 401 `Invalid login credentials`, a suspended account 403 — both
// before any token exists. The response user is the full `UserResource`
// the /me surface returns, with the caller as its own viewer.
func LoginHandler(mysqlDB, mysqlWall *sql.DB, pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fields, _, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}

		email, emailPresent := stringField(fields, "email")
		if !emailPresent {
			failures.add("email", "The email field is required.")
		} else if _, isStr := fields["email"].(string); !isStr {
			failures.add("email", "The email field must be a string.")
		} else if !validEmail(email) {
			failures.add("email", "The email field must be a valid email address.")
		}

		password, passwordPresent := stringField(fields, "password")
		if !passwordPresent {
			failures.add("password", "The password field is required.")
		} else if _, isStr := fields["password"].(string); !isStr {
			failures.add("password", "The password field must be a string.")
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		var (
			id           int64
			name         string
			hash         string
			role         string
			suspendedRaw any
		)
		if err := mysqlDB.QueryRowContext(r.Context(), `
			SELECT id, name, password, COALESCE(role_type, 'user'), is_suspended
			  FROM users WHERE email = ? LIMIT 1
		`, email).Scan(&id, &name, &hash, &role, &suspendedRaw); err != nil {
			if err == sql.ErrNoRows {
				message(w, http.StatusUnauthorized, "Invalid login credentials")
				return
			}
			slog.Error("login: lookup", "error", err)
			serverError(w)
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
			message(w, http.StatusUnauthorized, "Invalid login credentials")
			return
		}

		if asInt(suspendedRaw) != 0 {
			message(w, http.StatusForbidden, "Your account has been suspended by the administrator.")
			return
		}

		token, err := mintSanctumToken(r.Context(), mysqlDB, id)
		if err != nil {
			slog.Error("login: token", "error", err)
			serverError(w)
			return
		}

		if err := syncAuthUserToPG(r.Context(), mysqlDB, mysqlWall, pool, id); err != nil {
			slog.Error("login: sync", "error", err)
			serverError(w)
			return
		}

		user, err := loadUser(r.Context(), pool, id)
		if err != nil {
			slog.Error("login: user", "error", err)
			serverError(w)
			return
		}

		// `Auth::attempt` signs the user in for the request, so the
		// resource sees its own viewer: private fields shown. An admin
		// sees their own the same way.
		isAdmin := role == "admin"
		if !isAdmin {
			admin, err := isAdminUser(r.Context(), pool, id, role)
			if err != nil {
				slog.Error("login: admin", "error", err)
				serverError(w)
				return
			}
			isAdmin = admin
		}

		resource, err := userResource(r.Context(), pool, user, id, isAdmin, showRelations(user.Role))
		if err != nil {
			slog.Error("login: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("access_token", token)
		payload.Set("token_type", "Bearer")
		payload.Set("user", resource)

		writeJSON(w, http.StatusOK, payload)
	}
}

// confirmedMatches mirrors PHP's `!==` for JSON scalars: same type and
// same value, or both absent-or-null.
func confirmedMatches(password, confirmation any) bool {
	if password == nil || confirmation == nil {
		return password == nil && confirmation == nil
	}

	switch typed := password.(type) {
	case string:
		other, ok := confirmation.(string)
		return ok && typed == other
	case float64:
		other, ok := confirmation.(float64)
		return ok && typed == other
	case bool:
		other, ok := confirmation.(bool)
		return ok && typed == other
	default:
		return false
	}
}

// stringField reads a text field: absent, null and "" are missing (the
// ConvertEmptyStringsToNull rule); anything else is returned with its
// presence, and the caller decides the `string` rule.
func stringField(fields map[string]any, key string) (string, bool) {
	raw, present := fields[key]
	if !present || raw == nil {
		return "", false
	}
	if s, ok := raw.(string); ok {
		if s == "" {
			return "", false
		}
		return s, true
	}
	return "", true
}

// LogoutHandler serves `POST /api/logout`.
//
// `currentAccessToken()->delete()` deletes the presenting token row. The
// auth gate already refused anonymous and unknown tokens, so the id parses
// here by construction.
func LogoutHandler(mysqlDB *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		token, ok := bearerToken(r.Header.Get("Authorization"))
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		id, _, ok := strings.Cut(token, "|")
		if !ok || id == "" {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		if _, err := mysqlDB.ExecContext(r.Context(),
			`DELETE FROM personal_access_tokens WHERE id = ? AND tokenable_id = ?`, id, caller.UserID(),
		); err != nil {
			slog.Error("logout: delete", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Logged out successfully")

		writeJSON(w, http.StatusOK, payload)
	}
}

// registerRoles is the `in:` list, in the controller's order.
var registerRoles = []string{
	"user", "arsitek", "kontraktor", "notaris", "interior", "structural",
	"mep", "project_manager", "supplier", "logistics", "civil", "mechanical",
	"electrical", "plumbing", "roofing", "finishing",
}

// RegisterHandler serves `POST /api/register`.
//
// The validation mirrors the controller rule for rule, in rule order. The
// insert mirrors the transaction: user (bcrypt cost 12, lowercase email,
// generated unique_code), the role's pending profile, the Spatie role
// (firstOrCreate by name, web guard) and its pivot. Professional profiles
// are created `pending` — mass-created identities must never appear in the
// public directories before KYC and approval.
func RegisterHandler(mysqlDB, mysqlWall *sql.DB, pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fields, _, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}

		name, namePresent := stringField(fields, "name")
		if !namePresent {
			failures.add("name", "The name field is required.")
		} else if _, isStr := fields["name"].(string); !isStr {
			failures.add("name", "The name field must be a string.")
		} else if len([]rune(name)) > 255 {
			failures.add("name", "The name field must not be greater than 255 characters.")
		}

		username, usernamePresent := stringField(fields, "username")
		if !usernamePresent {
			failures.add("username", "The username field is required.")
		} else if _, isStr := fields["username"].(string); !isStr {
			failures.add("username", "The username field must be a string.")
		} else if len([]rune(username)) > 255 {
			failures.add("username", "The username field must not be greater than 255 characters.")
		} else if valueTaken(r.Context(), mysqlDB, "username", username) {
			failures.add("username", "The username has already been taken.")
		}

		email, emailPresent := stringField(fields, "email")
		if !emailPresent {
			failures.add("email", "The email field is required.")
		} else if _, isStr := fields["email"].(string); !isStr {
			failures.add("email", "The email field must be a string.")
		} else if email != strings.ToLower(email) {
			failures.add("email", "The email field must be lowercase.")
		} else if !validEmail(email) {
			failures.add("email", "The email field must be a valid email address.")
		} else if len([]rune(email)) > 255 {
			failures.add("email", "The email field must not be greater than 255 characters.")
		} else if valueTaken(r.Context(), mysqlDB, "email", email) {
			failures.add("email", "The email has already been taken.")
		}

		password, passwordPresent := stringField(fields, "password")
		if !passwordPresent {
			failures.add("password", "The password field is required.")
		} else if _, isStr := fields["password"].(string); !isStr {
			failures.add("password", "The password field must be a string.")
		} else if len([]rune(password)) < 8 {
			failures.add("password", "The password field must be at least 8 characters.")
		}

		role, rolePresent := stringField(fields, "role_type")
		if !rolePresent {
			failures.add("role_type", "The role type field is required.")
		} else if !slicesContains(registerRoles, role) {
			failures.add("role_type", "The selected role type is invalid.")
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		hashed, err := bcryptHash(password)
		if err != nil {
			slog.Error("register: hash", "error", err)
			serverError(w)
			return
		}

		uniqueCode, err := generateUniqueCode(r.Context(), mysqlDB)
		if err != nil {
			slog.Error("register: unique code", "error", err)
			serverError(w)
			return
		}

		tx, err := mysqlDB.BeginTx(r.Context(), nil)
		if err != nil {
			slog.Error("register: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback()

		result, err := tx.ExecContext(r.Context(), `
			INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
		`, name, username, strings.ToLower(email), string(hashed), role, uniqueCode)
		if err != nil {
			slog.Error("register: user", "error", err)
			serverError(w)
			return
		}

		userID, err := result.LastInsertId()
		if err != nil {
			slog.Error("register: user id", "error", err)
			serverError(w)
			return
		}

		if err := createRoleProfile(r.Context(), tx, role, userID, name); err != nil {
			slog.Error("register: profile", "error", err)
			serverError(w)
			return
		}

		var spatieRoleID int64
		if err := tx.QueryRowContext(r.Context(),
			`SELECT id FROM roles WHERE name = ? AND guard_name = 'web' LIMIT 1`, role,
		).Scan(&spatieRoleID); err != nil {
			spatieResult, err := tx.ExecContext(r.Context(),
				`INSERT INTO roles (name, guard_name, created_at, updated_at) VALUES (?, 'web', NOW(), NOW())`, role)
			if err != nil {
				slog.Error("register: role", "error", err)
				serverError(w)
				return
			}
			spatieRoleID, err = spatieResult.LastInsertId()
			if err != nil {
				slog.Error("register: role id", "error", err)
				serverError(w)
				return
			}
		}

		if _, err := tx.ExecContext(r.Context(),
			`INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (?, ?, ?)`,
			spatieRoleID, `App\Models\User`, userID); err != nil {
			slog.Error("register: pivot", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(); err != nil {
			slog.Error("register: commit", "error", err)
			serverError(w)
			return
		}

		token, err := mintSanctumToken(r.Context(), mysqlDB, userID)
		if err != nil {
			slog.Error("register: token", "error", err)
			serverError(w)
			return
		}

		if err := syncAuthUserToPG(r.Context(), mysqlDB, mysqlWall, pool, userID); err != nil {
			slog.Error("register: sync", "error", err)
			serverError(w)
			return
		}

		user, err := loadUser(r.Context(), pool, userID)
		if err != nil {
			slog.Error("register: user", "error", err)
			serverError(w)
			return
		}

		// Registration is anonymous: the resource sees no viewer, exactly
		// as `$request->user()` is null on the legacy side — so even the
		// owner's own email and bank fields read null here. (An already
		// authenticated caller registering someone else likewise views as
		// themselves; the anonymous case is the contract the golden pins
		// only for failures, so keep the common path exact.)
		var viewerID int64
		var viewerAdmin bool
		if caller, ok := CallerFrom(r.Context()); ok {
			viewerID = caller.UserID()
			viewerAdmin = caller.IsAdmin()
		} else {
			viewerID = -1
		}

		resource, err := userResource(r.Context(), pool, user, viewerID, viewerAdmin, showRelations(user.Role))
		if err != nil {
			slog.Error("register: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "User created successfully")
		payload.Set("access_token", token)
		payload.Set("token_type", "Bearer")
		payload.Set("user", resource)

		writeJSON(w, http.StatusCreated, payload)
	}
}

// crc32bHex is PHP's `hash('crc32b', $s)`. Despite the name it is the
// IEEE CRC-32 — verified three ways: the `123456789` check vector is
// `cbf43926` (the IEEE residue), a live token tail matches, and PHP's own
// `crc32` of the same string differs. The Go standard library computes it.
func crc32bHex(s string) string {
	sum := crc32.ChecksumIEEE([]byte(s))

	const digits = "0123456789abcdef"
	out := make([]byte, 8)
	for i := 7; i >= 0; i-- {
		out[i] = digits[sum&0xF]
		sum >>= 4
	}
	return string(out)
}

// valueTaken reports a unique violation the `unique:users` rule would flag.
// The comparison rides the column collation, exactly like Eloquent's
// `where($column, $value)->exists()`.
func valueTaken(ctx context.Context, db *sql.DB, column, value string) bool {
	allowed := map[string]bool{"username": true, "email": true}
	if !allowed[column] {
		return false
	}

	var count int
	if err := db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM users WHERE "+column+" = ? LIMIT 1", value,
	).Scan(&count); err != nil {
		return false
	}

	return count > 0
}

// generateUniqueCode mirrors `User::generateUniqueCode`: six chars from the
// unambiguous alphabet, re-drawn while taken.
func generateUniqueCode(ctx context.Context, db *sql.DB) (string, error) {
	for range 100 {
		code, err := randomTokenString(6)
		if err != nil {
			return "", err
		}

		// The alphabet differs from the token alphabet: unambiguous chars.
		raw := make([]byte, 6)
		for i := range raw {
			raw[i] = uniqueCodeAlphabet[int(code[i])%len(uniqueCodeAlphabet)]
		}
		code = string(raw)

		var count int
		if err := db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM users WHERE unique_code = ? LIMIT 1`, code,
		).Scan(&count); err != nil {
			return "", err
		}

		if count == 0 {
			return code, nil
		}
	}

	return "", sql.ErrNoRows
}

// createRoleProfile mirrors the controller's per-role creates: pending
// professional profiles, the supplier store, the courier row, or the
// sub-contractor kontraktor row for the six trade roles.
func createRoleProfile(ctx context.Context, tx *sql.Tx, role string, userID int64, name string) error {
	switch role {
	case "arsitek":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO arsiteks (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at)
			VALUES (?, ?, 0, 0, 'pending', NOW(), NOW())`, userID, name)
		return err
	case "kontraktor":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO kontraktors (user_id, nama, verification_status, created_at, updated_at)
			VALUES (?, ?, 'pending', NOW(), NOW())`, userID, name)
		return err
	case "notaris":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO notaris_profiles (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at)
			VALUES (?, ?, 0, 0, 'pending', NOW(), NOW())`, userID, name)
		return err
	case "interior":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO interior_profiles (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at)
			VALUES (?, ?, 0, 0, 'pending', NOW(), NOW())`, userID, name)
		return err
	case "structural":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO structural_engineers (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at)
			VALUES (?, ?, 0, 0, 'pending', NOW(), NOW())`, userID, name)
		return err
	case "mep":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO mep_engineers (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at)
			VALUES (?, ?, 0, 0, 'pending', NOW(), NOW())`, userID, name)
		return err
	case "project_manager":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO project_managers (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at)
			VALUES (?, ?, 0, 0, 'pending', NOW(), NOW())`, userID, name)
		return err
	case "supplier":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO suppliers (user_id, store_name, verification_status, created_at, updated_at)
			VALUES (?, ?, 'pending', NOW(), NOW())`, userID, name+"'s Store")
		return err
	case "logistics":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO courier_profiles (user_id, vehicle_type, license_plate, is_active, created_at, updated_at)
			VALUES (?, 'Not Specified', 'Not Specified', 1, NOW(), NOW())`, userID)
		return err
	case "civil", "mechanical", "electrical", "plumbing", "roofing", "finishing":
		_, err := tx.ExecContext(ctx, `
			INSERT INTO kontraktors (user_id, nama, jenis, verification_status, created_at, updated_at)
			VALUES (?, ?, 'Sub-Contractor', 'pending', NOW(), NOW())`, userID, name)
		return err
	default:
		return nil
	}
}

// syncAuthUserToPG re-syncs one identity into the read mirror: the user
// row, every profile row they hold, their phones, their role assignments
// and the roles those reference. It runs after every identity write so the
// response serialiser — which reads PostgreSQL — sees what MySQL just
// committed.
//
// The copy is whole-row with explicit columns (never `SELECT *` across the
// wire): `[]byte` decodes to text the way the ETL's COPY text does, and
// `ON CONFLICT (id)` keeps the mirror idempotent.
func syncAuthUserToPG(ctx context.Context, mysqlDB, mysqlWall *sql.DB, pool *pgxpool.Pool, userID int64) error {
	if err := syncRow(ctx, mysqlWall, pool, "users", "id", userID); err != nil {
		return err
	}

	for _, table := range []string{
		"arsiteks", "kontraktors", "notaris_profiles", "interior_profiles",
		"project_managers", "structural_engineers", "mep_engineers",
		"suppliers", "courier_profiles",
	} {
		ids, err := mysqlIDs(ctx, mysqlWall, "SELECT id FROM "+table+" WHERE user_id = ?", userID)
		if err != nil {
			return err
		}

		for _, id := range ids {
			if err := syncRow(ctx, mysqlWall, pool, table, "id", id); err != nil {
				return err
			}
		}
	}

	if _, err := pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user = $1`, userID); err != nil {
		return err
	}

	phoneIDs, err := mysqlIDs(ctx, mysqlWall, "SELECT id FROM phone_user WHERE id_user = ?", userID)
	if err != nil {
		return err
	}

	for _, id := range phoneIDs {
		if err := syncRow(ctx, mysqlWall, pool, "phone_user", "id", id); err != nil {
			return err
		}
	}

	var spatieRoles []int64
	roleRows, err := mysqlWall.QueryContext(ctx,
		`SELECT role_id FROM model_has_roles WHERE model_type = ? AND model_id = ?`,
		`App\Models\User`, userID)
	if err != nil {
		return err
	}
	defer roleRows.Close()

	for roleRows.Next() {
		var roleID int64
		if err := roleRows.Scan(&roleID); err != nil {
			roleRows.Close()
			return err
		}
		spatieRoles = append(spatieRoles, roleID)
	}
	if err := roleRows.Err(); err != nil {
		return err
	}
	roleRows.Close()

	for _, roleID := range spatieRoles {
		if err := syncRow(ctx, mysqlWall, pool, "roles", "id", roleID); err != nil {
			return err
		}
	}

	if _, err := pool.Exec(ctx,
		`DELETE FROM model_has_roles WHERE model_type = 'App\Models\User' AND model_id = $1`, userID); err != nil {
		return err
	}

	for _, roleID := range spatieRoles {
		if _, err := pool.Exec(ctx,
			`INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES ($1, 'App\Models\User', $2)`,
			roleID, userID); err != nil {
			return err
		}
	}

	return nil
}

// mysqlIDs reads one id column.
func mysqlIDs(ctx context.Context, db *sql.DB, query string, args ...any) ([]int64, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	return ids, rows.Err()
}

// syncRow copies one row MySQL → PostgreSQL across the SHARED columns
// (the ETL's intersection rule, per row instead of per table).
// []byte decodes to text (the ETL's COPY-text semantics); time.Time,
// numbers and booleans pass through.
func syncRow(ctx context.Context, mysqlDB *sql.DB, pool *pgxpool.Pool, table, key string, id int64) error {
	columns, pgTypes, err := sharedColumns(ctx, mysqlDB, pool, table)
	if err != nil {
		return err
	}

	if len(columns) == 0 {
		return nil
	}

	quoted := make([]string, 0, len(columns))
	for _, column := range columns {
		quoted = append(quoted, "`"+column+"`")
	}

	rows, err := mysqlDB.QueryContext(ctx,
		"SELECT "+strings.Join(quoted, ", ")+" FROM "+table+" WHERE "+key+" = ? LIMIT 1", id)
	if err != nil {
		return err
	}
	defer rows.Close()

	if !rows.Next() {
		rows.Close()
		return nil
	}

	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for i := range values {
		pointers[i] = &values[i]
	}

	if err := rows.Scan(pointers...); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	if err := rows.Err(); err != nil {
		return err
	}

	args := make([]any, len(values))
	for i, value := range values {
		if raw, ok := value.([]byte); ok {
			args[i] = string(raw)
			continue
		}
		if pgTypes[columns[i]] == "bool" {
			args[i] = asInt(value) != 0
			continue
		}
		args[i] = value
	}

	placeholders := make([]string, len(columns))
	updates := make([]string, len(columns))
	for i, column := range columns {
		placeholders[i] = "$" + itoaString(int64(i+1))
		updates[i] = `"` + column + `" = EXCLUDED."` + column + `"`
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO `+table+` (`+strings.Join(pgQuote(columns), ", ")+`)
		VALUES (`+strings.Join(placeholders, ", ")+`)
		ON CONFLICT (id) DO UPDATE SET `+strings.Join(updates, ", "), args...)

	return err
}

// sharedColumns is the ETL's intersection rule for one table. It also
// returns the PG udt names for coercion.
func sharedColumns(ctx context.Context, mysqlDB *sql.DB, pool *pgxpool.Pool, table string) ([]string, map[string]string, error) {
	target, types, err := pgColumns(ctx, pool, table)
	if err != nil {
		return nil, nil, err
	}

	rows, err := mysqlDB.QueryContext(ctx, "SHOW COLUMNS FROM "+table)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	present := map[string]bool{}
	for rows.Next() {
		var field sql.NullString
		var skipped [5]sql.NullString
		if err := rows.Scan(&field, &skipped[0], &skipped[1], &skipped[2], &skipped[3], &skipped[4]); err != nil {
			return nil, nil, err
		}
		present[strings.ToLower(field.String)] = true
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	shared := make([]string, 0, len(target))
	for _, column := range target {
		if present[strings.ToLower(column)] {
			shared = append(shared, column)
		}
	}

	return shared, types, nil
}

// pgColumns reads the target's column order plus udt names for coercion
// (a bool column cannot take an integer).
func pgColumns(ctx context.Context, pool *pgxpool.Pool, table string) ([]string, map[string]string, error) {
	rows, err := pool.Query(ctx, `
		SELECT column_name, udt_name FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = $1
		 ORDER BY ordinal_position
	`, table)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var columns []string
	types := map[string]string{}
	for rows.Next() {
		var column, udt string
		if err := rows.Scan(&column, &udt); err != nil {
			return nil, nil, err
		}
		columns = append(columns, column)
		types[column] = udt
	}

	return columns, types, rows.Err()
}

// pgQuote quotes identifiers for PostgreSQL.
func pgQuote(columns []string) []string {
	out := make([]string, 0, len(columns))
	for _, column := range columns {
		out = append(out, `"`+column+`"`)
	}
	return out
}
