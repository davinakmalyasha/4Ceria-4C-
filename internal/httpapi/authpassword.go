package httpapi

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"golang.org/x/crypto/bcrypt"
)

// THE PASSWORD RESET SURFACE.
//
// `POST /api/forgot-password` and `POST /api/reset-password` are the last
// two S0 writes, and they introduce the one primitive the port did not have
// yet: OUTBOUND MAIL. Everything else about them is already-solved machinery
// (validation bags, bcrypt, MySQL writes, the PG re-sync for reads).
//
// THE TOKEN IS AN HMAC, NOT A SECRET
// ----------------------------------
// `Password::broker()->createToken()` returns
// `hash_hmac('sha256', Str::random(40), APP_KEY)` — 64 lowercase hex chars,
// keyed by the RAW `APP_KEY` value (including a `base64:` prefix when one
// is present). The stored row holds `Hash::make($token)` (bcrypt) and is
// verified with `Hash::check`. A Go-minted token verifies in Laravel and
// vice versa, because both sides compute the same HMAC over 40 alphabet
// chars with the same key — which is why the alphabet matters and why this
// file does not invent its own.
//
// Expiry is 60 minutes from `created_at` (`expire => 60`, seconds inside
// the broker). The lookup is by email with `=` — MySQL's ci collation
// decides case, identically on both stacks.
//
// THE MAILER
// ----------
// Production sends through Resend (`MAIL_MAILER=resend`); locally the log
// driver is configured and mail never leaves the box. The Go Mailer mirrors
// that split: `RESEND_API_KEY` set means a real HTTPS send whose failure is
// a 500 (`Gagal mengirim email. Silakan coba lagi nanti.`), unset means
// log-and-succeed. The message content (Indonesian body, reset URL with
// the email query) is identical either way; only the transport differs.

// resetTokenExpiry is the broker's `expire => 60`, in minutes.
const resetTokenExpiryMinutes = 60

// Mailer sends password mail, or logs it when no key is configured.
type Mailer struct {
	apiKey   string
	fromAddr string
	fromName string
	client   *http.Client
}

// NewMailer reads the environment. A missing key is the log driver.
func NewMailer() *Mailer {
	fromAddr := os.Getenv("MAIL_FROM_ADDRESS")
	if fromAddr == "" {
		fromAddr = "noreply@4ceria.com"
	}
	fromName := os.Getenv("MAIL_FROM_NAME")
	if fromName == "" {
		fromName = "4C Platform"
	}
	return &Mailer{
		apiKey:   os.Getenv("RESEND_API_KEY"),
		fromAddr: fromAddr,
		fromName: fromName,
		client:   &http.Client{Timeout: 15 * time.Second},
	}
}

// sendReset delivers the notification's content. It mirrors
// `ResetPasswordNotification`: same subject, same lines, same action URL.
func (m *Mailer) sendReset(ctx context.Context, toEmail, token string) error {
	url := resetLink(token, toEmail)

	subject := "Reset Password Notification - 4Ceria"
	lines := []string{
		"Hello!",
		"You are receiving this email because we received a password reset request for your account.",
		"Your reset token: " + token,
		"This password reset link will expire in 60 minutes.",
		"If you did not request a password reset, no further action is required.",
	}

	if m.apiKey == "" {
		slog.Info("reset mail (log driver)", "to", toEmail, "subject", subject, "url", url, "lines", len(lines))
		return nil
	}

	var html strings.Builder
	html.WriteString("<p>Hello!</p>")
	for _, line := range lines[1:] {
		html.WriteString("<p>" + line + "</p>")
	}
	html.WriteString(`<p><a href="` + url + `">Reset Password</a></p>`)

	payload, err := json.Marshal(map[string]any{
		"from":    m.fromName + " <" + m.fromAddr + ">",
		"to":      []string{toEmail},
		"subject": subject,
		"html":    html.String(),
		"text":    "Hello!\n" + strings.Join(lines[1:], "\n") + "\nReset Password: " + url,
	})
	if err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+m.apiKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := m.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("resend answered HTTP %d", response.StatusCode)
	}

	return nil
}

// resetLink is the notification's action URL: `{APP_URL}/reset-password/{token}?email={address}`.
func resetLink(token, email string) string {
	return assetBase() + "/reset-password/" + token + "?email=" + url.QueryEscape(email)
}

// mintResetToken is `createNewToken` + `getPayload`: an HMAC of 40 random
// alphabet chars keyed by the raw APP_KEY, bcrypt-stored by the caller.
func mintResetToken() (plain string, err error) {
	entropy, err := randomTokenString(40)
	if err != nil {
		return "", err
	}

	key := os.Getenv("APP_KEY")
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(entropy))

	return hex.EncodeToString(mac.Sum(nil)), nil
}

// ForgotPasswordHandler serves `POST /api/forgot-password`.
//
// No `exists:` rule: an identical 200 answers whether or not the account
// exists, because a difference would be an account enumeration oracle.
func ForgotPasswordHandler(mysqlDB *sql.DB, mail *Mailer) http.HandlerFunc {
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
		if err := mysqlDB.QueryRowContext(r.Context(),
			`SELECT id FROM users WHERE email = ? LIMIT 1`, email,
		).Scan(&userID); err != nil && err != sql.ErrNoRows {
			slog.Error("forgot: lookup", "error", err)
			serverError(w)
			return
		} else if err == nil {
			if _, err := mysqlDB.ExecContext(r.Context(),
				`DELETE FROM password_reset_tokens WHERE email = ?`, email); err != nil {
				slog.Error("forgot: clear", "error", err)
				serverError(w)
				return
			}

			plain, err := mintResetToken()
			if err != nil {
				slog.Error("forgot: token", "error", err)
				serverError(w)
				return
			}

			hashed, err := bcryptHash(plain)
			if err != nil {
				slog.Error("forgot: hash", "error", err)
				serverError(w)
				return
			}

			if _, err := mysqlDB.ExecContext(r.Context(),
				`INSERT INTO password_reset_tokens (email, token, created_at) VALUES (?, ?, NOW())`,
				email, string(hashed)); err != nil {
				slog.Error("forgot: store", "error", err)
				serverError(w)
				return
			}

			if err := mail.sendReset(r.Context(), email, plain); err != nil {
				slog.Error("forgot: mail", "error", err)
				message(w, http.StatusInternalServerError, "Gagal mengirim email. Silakan coba lagi nanti.")
				return
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Kode reset telah dikirim ke email Anda.")

		writeJSON(w, http.StatusOK, payload)
	}
}

// ResetPasswordHandler serves `POST /api/reset-password`.
//
// The broker order is getUser → exists → callback → delete token. The
// callback sets the bcrypt password, revokes every Sanctum token (a stolen
// session cannot survive the reset) and the broker deletes the reset row.
func ResetPasswordHandler(mysqlDB *sql.DB) http.HandlerFunc {
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
			// `confirmed`: the confirmation must be present and identical.
			// PHP compares with `!==`, so a type mismatch fails even when
			// the values print the same.
			rawConfirm, hasConfirm := fields["password_confirmation"]
			if !hasConfirm || !confirmedMatches(fields["password"], rawConfirm) {
				failures.add("password", "The password field confirmation does not match.")
			}
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		var userID int64
		if err := mysqlDB.QueryRowContext(r.Context(),
			`SELECT id FROM users WHERE email = ? LIMIT 1`, email,
		).Scan(&userID); err != nil {
			if err == sql.ErrNoRows {
				message(w, http.StatusUnprocessableEntity, "We can't find a user with that email address.")
				return
			}
			slog.Error("reset: lookup", "error", err)
			serverError(w)
			return
		}

		var storedHash string
		var createdAt time.Time
		if err := mysqlDB.QueryRowContext(r.Context(),
			`SELECT token, created_at FROM password_reset_tokens WHERE email = ? LIMIT 1`, email,
		).Scan(&storedHash, &createdAt); err != nil {
			if err == sql.ErrNoRows {
				message(w, http.StatusUnprocessableEntity, "This password reset token is invalid.")
				return
			}
			slog.Error("reset: token row", "error", err)
			serverError(w)
			return
		}

		if time.Since(createdAt) > resetTokenExpiryMinutes*time.Minute {
			message(w, http.StatusUnprocessableEntity, "This password reset token is invalid.")
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(token)); err != nil {
			message(w, http.StatusUnprocessableEntity, "This password reset token is invalid.")
			return
		}

		hashed, err := bcryptHash(password)
		if err != nil {
			slog.Error("reset: hash", "error", err)
			serverError(w)
			return
		}

		tx, err := mysqlDB.BeginTx(r.Context(), nil)
		if err != nil {
			slog.Error("reset: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback()

		if _, err := tx.ExecContext(r.Context(),
			`UPDATE users SET password = ? WHERE id = ?`, string(hashed), userID); err != nil {
			slog.Error("reset: password", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.ExecContext(r.Context(),
			`DELETE FROM personal_access_tokens WHERE tokenable_id = ?`, userID); err != nil {
			slog.Error("reset: revoke", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.ExecContext(r.Context(),
			`DELETE FROM password_reset_tokens WHERE email = ?`, email); err != nil {
			slog.Error("reset: consume", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(); err != nil {
			slog.Error("reset: commit", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Your password has been reset successfully.")

		writeJSON(w, http.StatusOK, payload)
	}
}
