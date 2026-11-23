package httpapi

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// THE PASSWORD RESET SURFACE.
//
// `POST /api/forgot-password` and `POST /api/reset-password` are the last
// two S0 writes, and they introduce the one primitive this service did not have
// yet: OUTBOUND MAIL. Everything else about them is already-solved machinery
// (validation bags, bcrypt, PostgreSQL writes).
//
// THE TOKEN IS AN HMAC, NOT A SECRET
// ----------------------------------
// `Password::broker()->createToken()` returns
// `hash_hmac('sha256', Str::random(40), APP_KEY)` — 64 lowercase hex chars,
// keyed by the RAW `APP_KEY` value (including a `base64:` prefix when one
// is present). The stored row holds `Hash::make($token)` (bcrypt) and is
// verified with `Hash::check`. A Go-minted token verifies in the original API and
// vice versa, because both sides compute the same HMAC over 40 alphabet
// chars with the same key — which is why the alphabet matters and why this
// file does not invent its own.
//
// Expiry is 60 minutes from `created_at`. The email lookup is case-insensitive
// (`citext`), so an address cannot be registered under two casings.
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
		slog.Info("reset mail (log driver)", "to", toEmail, "subject", subject)
		return nil
	}

	var htmlBody strings.Builder
	htmlBody.WriteString("<p>Hello!</p>")
	for _, line := range lines[1:] {
		htmlBody.WriteString("<p>" + html.EscapeString(line) + "</p>")
	}
	htmlBody.WriteString(`<p><a href="` + html.EscapeString(url) + `">Reset Password</a></p>`)

	payload, err := json.Marshal(map[string]any{
		"from":    m.fromName + " <" + m.fromAddr + ">",
		"to":      []string{toEmail},
		"subject": subject,
		"html":    htmlBody.String(),
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

// resetLink is the notification's action URL. It points at the web app, not
// the API: the reset screen is a Next route.
func resetLink(token, email string) string {
	return frontendBase() + "/reset-password/" + token + "?email=" + url.QueryEscape(email)
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
