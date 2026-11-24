package httpapi

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PUSH FAN-OUT — the Go port of `SendWebPushJob`.
//
// Legacy: `Notification::created` → `shouldPush()` → queued job (3 tries,
// 5s backoff, 1-push-per-5s per-user rate cap). This build fans out from the
// two notification writers (`insertNotification` + `insertNotificationPool`)
// so every existing call site is covered without touching 20+ handlers. The
// send is best-effort and async: VAPID absent → log and keep the in-app row
// (same posture as the mailer); failure → log, never fail the request.
//
// Rate cap: 1 push per 5s per user (in-memory; multi-replica needs Redis,
// same limitation as the HTTP limiter — documented, not hidden).

var pushRateMu sync.Mutex
var pushLastSent = map[int64]time.Time{}

func shouldPushForPool(ctx context.Context, pool *pgxpool.Pool, userID int64, kind string) bool {
	if userID <= 0 {
		return false
	}
	for _, k := range notificationPreferenceAlwaysOn {
		if k == kind {
			return true
		}
	}
	var enabled *bool
	_ = pool.QueryRow(ctx, `SELECT enabled FROM notification_preferences WHERE user_id = $1 AND channel = 'webpush' AND type = $2 LIMIT 1`, userID, kind).Scan(&enabled)
	if enabled != nil {
		return *enabled
	}
	var defEnabled *bool
	_ = pool.QueryRow(ctx, `SELECT enabled FROM notification_preferences WHERE user_id = $1 AND channel = 'webpush' AND type IS NULL LIMIT 1`, userID).Scan(&defEnabled)
	if defEnabled != nil {
		return *defEnabled
	}
	return true
}

func pushRateAllowed(userID int64) bool {
	pushRateMu.Lock()
	defer pushRateMu.Unlock()

	now := time.Now()
	for id, last := range pushLastSent {
		if now.Sub(last) > time.Hour {
			delete(pushLastSent, id)
		}
	}

	if last, ok := pushLastSent[userID]; ok && now.Sub(last) < 5*time.Second {
		return false
	}
	pushLastSent[userID] = now
	return true
}

// fanoutPushPool sends a push for a pool-written notification. Async wrapper
// is the caller's job; this blocks up to ~25s (3 tries x 5s backoff).
func fanoutPushPool(pool *pgxpool.Pool, userID int64, kind, title, body string) {
	if !pushRateAllowed(userID) {
		return
	}
	pub := os.Getenv("VAPID_PUBLIC_KEY")
	priv := os.Getenv("VAPID_PRIVATE_KEY")
	if pub == "" || priv == "" {
		slog.Info("push: skipped (no VAPID keys)", "user", userID, "type", kind)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rows, err := pool.Query(ctx, `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, userID)
	if err != nil {
		slog.Error("push: subscriptions", "error", err)
		return
	}
	defer rows.Close()
	type sub struct {
		endpoint, p256dh, auth string
	}
	var subs []sub
	for rows.Next() {
		var s sub
		if err := rows.Scan(&s.endpoint, &s.p256dh, &s.auth); err != nil {
			continue
		}
		subs = append(subs, s)
	}
	if err := rows.Err(); err != nil {
		slog.Error("push: scan", "error", err)
		return
	}
	if len(subs) == 0 {
		return
	}
	payload := `{"title":` + pushJSONString(title) + `,"body":` + pushJSONString(body) + `,"type":` + pushJSONString(kind) + `}`
	for _, s := range subs {
		subscription := &webpush.Subscription{Endpoint: s.endpoint, Keys: webpush.Keys{P256dh: s.p256dh, Auth: s.auth}}
		var lastErr error
		for attempt := 0; attempt < 3; attempt++ {
			if attempt > 0 {
				time.Sleep(5 * time.Second)
			}
			resp, err := webpush.SendNotification([]byte(payload), subscription, &webpush.Options{
				Subscriber:      "mailto:" + pushMailFrom(),
				VAPIDPublicKey:  pub,
				VAPIDPrivateKey: priv,
				TTL:             30,
			})
			if err != nil {
				lastErr = err
				continue
			}
			if resp == nil {
				lastErr = nil
				break
			}

			status := resp.StatusCode
			_, _ = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()

			switch {
			case status >= 200 && status < 300:
				lastErr = nil
			case status == 404 || status == 410:
				_, _ = pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, userID, s.endpoint)
				lastErr = nil
			case status == 429 || status >= 500:
				lastErr = fmt.Errorf("push endpoint answered HTTP %d", status)
				continue
			default:
				// 400/401/403 and other permanent refusals: retrying cannot
				// help and the subscription is left for the user to renew.
				lastErr = nil
			}
			break
		}
		if lastErr != nil {
			slog.Error("push: send failed", "user", userID, "error", lastErr)
		}
	}
}

func pushJSONString(s string) string {
	out := make([]byte, 0, len(s)+2)
	out = append(out, '"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '"', '\\':
			out = append(out, '\\', c)
		case '\n':
			out = append(out, '\\', 'n')
		case '\r':
			out = append(out, '\\', 'r')
		case '\t':
			out = append(out, '\\', 't')
		default:
			if c < 0x20 {
				out = append(out, ' ')
			} else {
				out = append(out, c)
			}
		}
	}
	out = append(out, '"')
	return string(out)
}

func pushMailFrom() string {
	if v := os.Getenv("MAIL_FROM_ADDRESS"); v != "" {
		return v
	}
	return "no-reply@4ceria.test"
}

// SendPendingPushes delivers web push for notifications whose creating
// transaction has committed and which have not been pushed yet. Running from
// the sweeper rather than from inside the handler is what prevents a push for
// a bid or payment that then rolls back.
func SendPendingPushes(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	rows, err := pool.Query(ctx, `
		SELECT id, user_id, type, title, body
		  FROM notifications
		 WHERE push_sent_at IS NULL
		   AND created_at > now() - interval '15 minutes'
		 ORDER BY id
		 LIMIT 25`)
	if err != nil {
		return err
	}

	type pending struct {
		id     int64
		userID int64
		kind   string
		title  string
		body   string
	}

	var batch []pending
	for rows.Next() {
		var item pending
		if err := rows.Scan(&item.id, &item.userID, &item.kind, &item.title, &item.body); err != nil {
			rows.Close()
			return err
		}
		batch = append(batch, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	start := time.Now()
	for _, item := range batch {
		if shouldPushForPool(ctx, pool, item.userID, item.kind) {
			fanoutPushPool(pool, item.userID, item.kind, item.title, item.body)
		}
		if _, err := pool.Exec(ctx, `UPDATE notifications SET push_sent_at = now() WHERE id = $1`, item.id); err != nil {
			logger.Info("scheduler: push marker failed", "id", item.id, "error", err.Error())
		}
	}

	if len(batch) > 0 {
		logger.Info("scheduler: push sweep", "notifications", len(batch),
			"duration_ms", time.Since(start).Milliseconds())
	}
	return nil
}
