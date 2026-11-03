package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MAIL OUTBOX — queued receipt/digest mails.
//
// The request path must never block on SMTP: handlers `enqueueMail` (one
// INSERT, same tx as the payment when available) and the scheduler's
// `SendQueuedMail` delivers via Resend when `RESEND_API_KEY` is set, else
// logs-and-marks-sent (same log-driver posture as the password mailer).
// Failures are recorded in `mail_outbox.error` and retried on the next tick.

func enqueueMailTx(ctx context.Context, tx pgx.Tx, toEmail, subject, html, text string) error {
	_, err := tx.Exec(ctx, `INSERT INTO mail_outbox (to_email, subject, html, text_body) VALUES ($1,$2,$3,$4)`, toEmail, subject, html, text)
	return err
}

func enqueueMailPool(ctx context.Context, pool *pgxpool.Pool, toEmail, subject, html, text string) error {
	_, err := pool.Exec(ctx, `INSERT INTO mail_outbox (to_email, subject, html, text_body) VALUES ($1,$2,$3,$4)`, toEmail, subject, html, text)
	return err
}

// SendQueuedMail delivers up to 25 unsent mails. Best-effort, logged.
func SendQueuedMail(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	type job struct {
		id      int64
		to      string
		subject string
		html    string
		text    string
	}
	rows, err := pool.Query(ctx, `SELECT id, to_email, subject, html, text_body FROM mail_outbox WHERE sent_at IS NULL ORDER BY id LIMIT 25`)
	if err != nil {
		// Table may not exist on old baselines: skip, do not fail the tick.
		if logger != nil {
			logger.Info("scheduler: mail outbox skipped", "error", err.Error())
		}
		return nil
	}
	defer rows.Close()
	var jobs []job
	for rows.Next() {
		var j job
		if err := rows.Scan(&j.id, &j.to, &j.subject, &j.html, &j.text); err != nil {
			continue
		}
		jobs = append(jobs, j)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	apiKey := os.Getenv("RESEND_API_KEY")
	fromAddr := os.Getenv("MAIL_FROM_ADDRESS")
	if fromAddr == "" {
		fromAddr = "no-reply@4ceria.test"
	}
	fromName := os.Getenv("MAIL_FROM_NAME")
	if fromName == "" {
		fromName = "4Ceria"
	}
	client := &http.Client{Timeout: 15 * time.Second}

	for _, j := range jobs {
		if apiKey == "" {
			if logger != nil {
				logger.Info("mail: log driver", "to", j.to, "subject", j.subject)
			}
			_, _ = pool.Exec(ctx, `UPDATE mail_outbox SET sent_at = date_trunc('second', now()) WHERE id = $1`, j.id)
			continue
		}
		payload, _ := json.Marshal(map[string]any{
			"from":    fromName + " <" + fromAddr + ">",
			"to":      []string{j.to},
			"subject": j.subject,
			"html":    j.html,
			"text":    j.text,
		})
		req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			_, _ = pool.Exec(ctx, `UPDATE mail_outbox SET error = $2 WHERE id = $1`, j.id, err.Error())
			continue
		}
		resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			_, _ = pool.Exec(ctx, `UPDATE mail_outbox SET error = $2 WHERE id = $1`, j.id, "resend status "+resp.Status)
			continue
		}
		_, _ = pool.Exec(ctx, `UPDATE mail_outbox SET sent_at = date_trunc('second', now()), error = NULL WHERE id = $1`, j.id)
	}
	return nil
}

func mailHTML(title string, lines []string) string {
	var b strings.Builder
	b.WriteString("<p>" + title + "</p>")
	for _, l := range lines {
		b.WriteString("<p>" + l + "</p>")
	}
	return b.String()
}
