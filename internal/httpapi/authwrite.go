package httpapi

import (
	"crypto/rand"
	"hash/crc32"
	"net/mail"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// THE IDENTITY HELPERS.
//
// Login, register, logout, forgot-password and reset-password are
// PostgreSQL-native (`authpg.go`, Sanctum semantics preserved).
// This file holds the shared primitives they are built from:
// token randomness, the `$2y$` bcrypt spelling, email validation,
// JSON-scalar helpers and the CRC suffix for token display.

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

// itoaString renders an int64 without importing anything new.

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

// registerRoles is the `in:` list, in the controller's order. Kept in one
// place so register validation and directory scoping cannot drift apart.
var registerRoles = []string{
	"user", "arsitek", "kontraktor", "notaris", "interior", "structural",
	"mep", "project_manager", "supplier", "logistics", "civil", "mechanical",
	"electrical", "plumbing", "roofing", "finishing",
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
