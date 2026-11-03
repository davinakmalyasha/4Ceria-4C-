package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"net/http"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// PG IDENTITY — all-PostgreSQL local mode.
//
// The gateway authenticates against PostgreSQL directly (same Sanctum
// semantics, same bcrypt `$2y$`, same 2-day expiry). No re-sync, no ETL
// window, no second pool. MySQL remains only as the one-time seed source
// (`db/mysql/` + `cmd/etl`) and the frozen `--db` parity oracle.

type SanctumPG struct {
	pool *pgxpool.Pool
}

func NewSanctumPG(pool *pgxpool.Pool) *SanctumPG {
	return &SanctumPG{pool: pool}
}

func (s *SanctumPG) Authenticate(r *http.Request) (Caller, error) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return nil, nil
	}
	token, ok := bearerToken(header)
	if !ok {
		return nil, ErrUnauthenticated
	}
	id, plain, ok := strings.Cut(token, "|")
	if !ok || id == "" || plain == "" {
		return nil, ErrUnauthenticated
	}
	sum := sha256.Sum256([]byte(plain))
	var userID int64
	var role string
	var suspended int64
	// Token id is numeric; compare hash hex (citext in PG).
	err := s.pool.QueryRow(r.Context(), `
		SELECT t.tokenable_id, COALESCE(u.role_type::text, ''), COALESCE(u.is_suspended::int, 0)
		  FROM personal_access_tokens t
		  JOIN users u ON u.id = t.tokenable_id
		 WHERE t.id::text = $1
		   AND t.token = $2
		   AND (t.expires_at IS NULL OR t.expires_at > NOW())
	`, id, hex.EncodeToString(sum[:])).Scan(&userID, &role, &suspended)
	if err != nil {
		return nil, ErrUnauthenticated
	}
	if suspended != 0 {
		return nil, ErrUnauthenticated
	}
	return Session{ID: userID, Role: role, IsAdmin_: role == "admin"}, nil
}

func mintSanctumTokenPG(ctx context.Context, pool *pgxpool.Pool, userID int64) (string, error) {
	entropy, err := randomTokenString(40)
	if err != nil {
		return "", err
	}
	plain := entropy + crc32bHex(entropy)
	sum := sha256.Sum256([]byte(plain))
	const morphClass = `App\Models\User`
	var id int64
	if err := pool.QueryRow(ctx, `
		INSERT INTO personal_access_tokens
		    (tokenable_type, tokenable_id, name, token, abilities,
		     last_used_at, expires_at, created_at, updated_at)
		VALUES ($1, $2, 'auth_token', $3, '["*"]',
		        NULL, NOW() + INTERVAL '2880 minutes', NOW(), NOW())
		RETURNING id
	`, morphClass, userID, hex.EncodeToString(sum[:])).Scan(&id); err != nil {
		return "", err
	}
	return joinToken(id, plain), nil
}

func joinToken(id int64, plain string) string {
	return formatInt(id) + "|" + plain
}

// LoginPGHandler serves `POST /api/login` against PostgreSQL.
func LoginPGHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
		var id int64
		var name, hash, role string
		var suspended int64
		if err := pool.QueryRow(r.Context(), `
			SELECT id, name, password, COALESCE(role_type::text, 'user'), COALESCE(is_suspended::int, 0)
			  FROM users WHERE email = $1 LIMIT 1
		`, email).Scan(&id, &name, &hash, &role, &suspended); err != nil {
			message(w, http.StatusUnauthorized, "Invalid login credentials")
			return
		}
		// bcrypt `$2y$` → `$2a$` for x/crypto (verifies identically).
		check := hash
		if strings.HasPrefix(check, "$2y$") {
			check = "$2a$" + check[4:]
		}
		if err := bcrypt.CompareHashAndPassword([]byte(check), []byte(password)); err != nil {
			message(w, http.StatusUnauthorized, "Invalid login credentials")
			return
		}
		if suspended != 0 {
			message(w, http.StatusForbidden, "Your account has been suspended by the administrator.")
			return
		}
		token, err := mintSanctumTokenPG(r.Context(), pool, id)
		if err != nil {
			slog.Error("login-pg: token", "error", err)
			serverError(w)
			return
		}
		user, err := loadUser(r.Context(), pool, id)
		if err != nil {
			slog.Error("login-pg: user", "error", err)
			serverError(w)
			return
		}
		isAdmin := role == "admin"
		if !isAdmin {
			admin, err := isAdminUser(r.Context(), pool, id, role)
			if err != nil {
				serverError(w)
				return
			}
			isAdmin = admin
		}
		resource, err := userResource(r.Context(), pool, user, id, isAdmin, showRelations(user.Role))
		if err != nil {
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

// LogoutPGHandler serves `POST /api/logout` against PostgreSQL.
func LogoutPGHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		header := r.Header.Get("Authorization")
		token, ok := bearerToken(header)
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		id, plain, ok := strings.Cut(token, "|")
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		_ = caller
		sum := sha256.Sum256([]byte(plain))
		_, _ = pool.Exec(r.Context(), `DELETE FROM personal_access_tokens WHERE id::text = $1 AND token = $2`, id, hex.EncodeToString(sum[:]))
		payload := jsonphp.NewObject()
		payload.Set("message", "Logged out.")
		writeJSON(w, http.StatusOK, payload)
	}
}

func valueTakenPG(ctx context.Context, pool *pgxpool.Pool, column, value string) bool {
	if column != "username" && column != "email" {
		return false
	}
	var count int
	col := `username`
	if column == "email" {
		col = `email`
	}
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE `+col+` = $1`, value).Scan(&count); err != nil {
		return false
	}
	return count > 0
}

func generateUniqueCodePG(ctx context.Context, pool *pgxpool.Pool) (string, error) {
	for range 100 {
		code, err := randomTokenString(6)
		if err != nil {
			return "", err
		}
		raw := make([]byte, 6)
		for i := range raw {
			raw[i] = uniqueCodeAlphabet[int(code[i])%len(uniqueCodeAlphabet)]
		}
		code = string(raw)
		var count int
		if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE unique_code = $1`, code).Scan(&count); err != nil {
			return "", err
		}
		if count == 0 {
			return code, nil
		}
	}
	return "", context.DeadlineExceeded
}

func createRoleProfilePG(ctx context.Context, tx pgx.Tx, role string, userID int64, name string) error {
	switch role {
	case "arsitek":
		_, err := tx.Exec(ctx, `INSERT INTO arsiteks (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at) VALUES ($1,$2,0,0,'pending',NOW(),NOW())`, userID, name)
		return err
	case "kontraktor":
		_, err := tx.Exec(ctx, `INSERT INTO kontraktors (user_id, nama, verification_status, created_at, updated_at) VALUES ($1,$2,'pending',NOW(),NOW())`, userID, name)
		return err
	case "notaris":
		_, err := tx.Exec(ctx, `INSERT INTO notaris_profiles (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at) VALUES ($1,$2,0,0,'pending',NOW(),NOW())`, userID, name)
		return err
	case "interior":
		_, err := tx.Exec(ctx, `INSERT INTO interior_profiles (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at) VALUES ($1,$2,0,0,'pending',NOW(),NOW())`, userID, name)
		return err
	case "structural":
		_, err := tx.Exec(ctx, `INSERT INTO structural_engineers (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at) VALUES ($1,$2,0,0,'pending',NOW(),NOW())`, userID, name)
		return err
	case "mep":
		_, err := tx.Exec(ctx, `INSERT INTO mep_engineers (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at) VALUES ($1,$2,0,0,'pending',NOW(),NOW())`, userID, name)
		return err
	case "project_manager":
		_, err := tx.Exec(ctx, `INSERT INTO project_managers (user_id, nama, rate_harga, pengalaman_tahun, verification_status, created_at, updated_at) VALUES ($1,$2,0,0,'pending',NOW(),NOW())`, userID, name)
		return err
	case "supplier":
		_, err := tx.Exec(ctx, `INSERT INTO suppliers (user_id, store_name, verification_status, created_at, updated_at) VALUES ($1,$2,'pending',NOW(),NOW())`, userID, name+"'s Store")
		return err
	case "logistics":
		_, err := tx.Exec(ctx, `INSERT INTO courier_profiles (user_id, vehicle_type, license_plate, is_active, created_at, updated_at) VALUES ($1,'Not Specified','Not Specified',true,NOW(),NOW())`, userID)
		return err
	case "civil", "mechanical", "electrical", "plumbing", "roofing", "finishing":
		_, err := tx.Exec(ctx, `INSERT INTO kontraktors (user_id, nama, jenis, verification_status, created_at, updated_at) VALUES ($1,$2,'Sub-Contractor','pending',NOW(),NOW())`, userID, name)
		return err
	default:
		return nil
	}
}

// RegisterPGHandler serves `POST /api/register` against PostgreSQL.
func RegisterPGHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
		} else if valueTakenPG(r.Context(), pool, "username", username) {
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
		} else if valueTakenPG(r.Context(), pool, "email", email) {
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
			serverError(w)
			return
		}
		uniqueCode, err := generateUniqueCodePG(r.Context(), pool)
		if err != nil {
			serverError(w)
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			serverError(w)
			return
		}
		defer tx.Rollback(r.Context())
		var userID int64
		if err := tx.QueryRow(r.Context(), `
			INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id
		`, name, username, strings.ToLower(email), string(hashed), role, uniqueCode).Scan(&userID); err != nil {
			slog.Error("register-pg: user", "error", err)
			serverError(w)
			return
		}
		if err := createRoleProfilePG(r.Context(), tx, role, userID, name); err != nil {
			slog.Error("register-pg: profile", "error", err)
			serverError(w)
			return
		}
		var spatieRoleID int64
		if err := tx.QueryRow(r.Context(), `SELECT id FROM roles WHERE name = $1 AND guard_name = 'web' LIMIT 1`, role).Scan(&spatieRoleID); err != nil {
			if err := tx.QueryRow(r.Context(), `INSERT INTO roles (name, guard_name, created_at, updated_at) VALUES ($1,'web',NOW(),NOW()) RETURNING id`, role).Scan(&spatieRoleID); err != nil {
				slog.Error("register-pg: role", "error", err)
				serverError(w)
				return
			}
		}
		if _, err := tx.Exec(r.Context(), `INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES ($1,'App\Models\User',$2) ON CONFLICT DO NOTHING`, spatieRoleID, userID); err != nil {
			slog.Error("register-pg: pivot", "error", err)
			serverError(w)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			serverError(w)
			return
		}
		token, err := mintSanctumTokenPG(r.Context(), pool, userID)
		if err != nil {
			serverError(w)
			return
		}
		user, err := loadUser(r.Context(), pool, userID)
		if err != nil {
			serverError(w)
			return
		}
		resource, err := userResource(r.Context(), pool, user, userID, role == "admin", showRelations(role))
		if err != nil {
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

// ForgotPasswordPGHandler serves `POST /api/forgot-password` against PostgreSQL.
//
// No `exists:` rule: an identical 200 answers whether or not the account
// exists, because a difference would be an account enumeration oracle.
func ForgotPasswordPGHandler(pool *pgxpool.Pool, mail *Mailer) http.HandlerFunc {
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
		if !failures.empty() {
			failures.write(w)
			return
		}
		var userID int64
		if err := pool.QueryRow(r.Context(), `SELECT id FROM users WHERE email = $1 LIMIT 1`, email).Scan(&userID); err == nil {
			_, _ = pool.Exec(r.Context(), `DELETE FROM password_reset_tokens WHERE email = $1`, email)
			plain, err := mintResetToken()
			if err == nil {
				hashed, err := bcryptHash(plain)
				if err == nil {
					_, _ = pool.Exec(r.Context(), `INSERT INTO password_reset_tokens (email, token, created_at) VALUES ($1,$2,NOW())`, email, string(hashed))
					_ = mail.sendReset(r.Context(), email, plain)
				}
			}
		}
		payload := jsonphp.NewObject()
		payload.Set("message", "Kode reset telah dikirim ke email Anda.")
		writeJSON(w, http.StatusOK, payload)
	}
}

// ResetPasswordPGHandler serves `POST /api/reset-password` against PostgreSQL.
func ResetPasswordPGHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fields, _, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		failures := &errorBag{}
		token, tokenPresent := stringField(fields, "token")
		if !tokenPresent {
			failures.add("token", "The token field is required.")
		} else if _, isStr := fields["token"].(string); !isStr {
			failures.add("token", "The token field must be a string.")
		}
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
		} else if len([]rune(password)) < 8 {
			failures.add("password", "The password field must be at least 8 characters.")
		}
		if passwordPresent {
			rawConfirm, hasConfirm := fields["password_confirmation"]
			if !hasConfirm || !confirmedMatches(password, rawConfirm) {
				failures.add("password", "The password confirmation does not match.")
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}
		var storedHash string
		var createdAt any
		if err := pool.QueryRow(r.Context(), `SELECT token, created_at FROM password_reset_tokens WHERE email = $1`, email).Scan(&storedHash, &createdAt); err != nil {
			failures.add("email", "The selected email is invalid.")
			failures.write(w)
			return
		}
		chk := storedHash
		if strings.HasPrefix(chk, "$2y$") {
			chk = "$2a$" + chk[4:]
		}
		if err := bcrypt.CompareHashAndPassword([]byte(chk), []byte(token)); err != nil {
			failures.add("email", "The selected email is invalid.")
			failures.write(w)
			return
		}
		hashed, err := bcryptHash(password)
		if err != nil {
			serverError(w)
			return
		}
		if _, err := pool.Exec(r.Context(), `UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2`, string(hashed), email); err != nil {
			serverError(w)
			return
		}
		_, _ = pool.Exec(r.Context(), `DELETE FROM password_reset_tokens WHERE email = $1`, email)
		_, _ = pool.Exec(r.Context(), `DELETE FROM personal_access_tokens WHERE tokenable_id = (SELECT id FROM users WHERE email = $1)`, email)
		payload := jsonphp.NewObject()
		payload.Set("message", "Password reset successfully.")
		writeJSON(w, http.StatusOK, payload)
	}
}
