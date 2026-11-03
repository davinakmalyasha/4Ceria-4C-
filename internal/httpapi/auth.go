package httpapi

import (
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
