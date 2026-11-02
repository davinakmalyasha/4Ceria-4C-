package httpapi

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
)

// ErrUnauthenticated is returned when a token is missing, malformed, unknown or
// expired. The router turns it into the legacy 401 shape.
var ErrUnauthenticated = errors.New("unauthenticated")

// Session is a resolved caller.
type Session struct {
	ID       int64
	Role     string
	IsAdmin_ bool
}

func (s Session) UserID() int64 { return s.ID }

func (s Session) RoleType() string { return s.Role }

func (s Session) IsAdmin() bool { return s.IsAdmin_ }

// Sanctum authenticates a request the way Laravel Sanctum does.
//
// THE TOKEN IS NEVER STORED IN PLAIN TEXT. A Sanctum token is presented as
// `{id}|{plain}`, and the database holds `sha256(plain)` — so the lookup hashes
// what arrived and compares hashes. Getting that wrong (looking up the plain
// value) would simply never match, which is the safe way to be wrong.
//
// It reads the MySQL `personal_access_tokens` table the legacy application
// writes — the same table, not a copy. ADR-0018 keeps `users` and tokens
// MySQL-owned for the entire transition, so the Go service authenticates
// against MySQL read-only: a token minted by either application is valid in
// both the instant it is written, with no ETL lag in between.
type Sanctum struct {
	db *sql.DB
}

// NewSanctum builds the authenticator over the MySQL owner store.
func NewSanctum(db *sql.DB) *Sanctum {
	return &Sanctum{db: db}
}

// Authenticate resolves the caller from the request's bearer token.
//
// A request with NO token returns (nil, nil): that is "anonymous", not an
// error, and the gates decide what it means.
func (s *Sanctum) Authenticate(r *http.Request) (Caller, error) {
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

	var (
		userID    int64
		role      string
		suspended int64
	)

	err := s.db.QueryRowContext(r.Context(), `
		SELECT t.tokenable_id,
		       COALESCE(u.role_type, ''),
		       COALESCE(u.is_suspended, 0)
		  FROM personal_access_tokens t
		  JOIN users u ON u.id = t.tokenable_id
		 WHERE t.id = ?
		   AND t.token = ?
		   AND (t.expires_at IS NULL OR t.expires_at > NOW())
	`, id, hex.EncodeToString(sum[:])).Scan(&userID, &role, &suspended)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUnauthenticated
	}

	if err != nil {
		return nil, err
	}

	if suspended != 0 {
		return nil, ErrUnauthenticated
	}

	return Session{ID: userID, Role: role, IsAdmin_: role == "admin"}, nil
}

// bearerToken reads `Authorization: Bearer <token>`.
func bearerToken(header string) (string, bool) {
	const prefix = "Bearer "

	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return "", false
	}

	return strings.TrimSpace(header[len(prefix):]), true
}

// StaticAuthenticator answers from a fixed caller.
//
// It exists for the golden-file tests and for a deployment that has not yet
// pointed the gateway at the database — it is NOT a bypass: with no caller
// configured it answers "anonymous", which the gates reject.
type StaticAuthenticator struct {
	Caller Caller
}

func (s StaticAuthenticator) Authenticate(*http.Request) (Caller, error) {
	return s.Caller, nil
}
