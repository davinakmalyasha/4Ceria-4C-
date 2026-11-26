package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"
	"strings"
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
	var qStart, qEnd *string
	_ = pool.QueryRow(ctx, `SELECT enabled, quiet_hours_start::text, quiet_hours_end::text FROM notification_preferences WHERE user_id = $1 AND channel = 'webpush' AND type = $2 LIMIT 1`, userID, kind).Scan(&enabled, &qStart, &qEnd)
	if enabled != nil {
		if !*enabled {
			return false
		}
		if inQuietHours(qStart, qEnd) {
			return false
		}
		return true
	}
	var defEnabled *bool
	var dStart, dEnd *string
	_ = pool.QueryRow(ctx, `SELECT enabled, quiet_hours_start::text, quiet_hours_end::text FROM notification_preferences WHERE user_id = $1 AND channel = 'webpush' AND type IS NULL LIMIT 1`, userID).Scan(&defEnabled, &dStart, &dEnd)
	if defEnabled != nil {
		if !*defEnabled {
			return false
		}
		if inQuietHours(dStart, dEnd) {
			return false
		}
		return true
	}
	return true
}

// inQuietHours reports whether the current UTC time falls inside a
// quiet-hours window. Empty bounds mean no quiet hours. Overnight windows
// (start > end, e.g. 22:00-07:00) wrap past midnight. Times come from
// Postgres `time` columns rendered as text (HH:MM:SS); unparsable values
// fail open so a bad preference never silences money notices (ALWAYS_ON
// types bypass this function entirely anyway).
func inQuietHours(start, end *string) bool {
	if start == nil || end == nil || *start == "" || *end == "" {
		return false
	}
	parse := func(s string) (int, bool) {
		var h, m, sec int
		if _, err := fmt.Sscanf(s, "%d:%d:%d", &h, &m, &sec); err != nil {
			return 0, false
		}
		if h < 0 || h > 23 || m < 0 || m > 59 {
			return 0, false
		}
		return h*60 + m, true
	}
	s, ok1 := parse(*start)
	e, ok2 := parse(*end)
	if !ok1 || !ok2 || s == e {
		return false
	}
	now := time.Now().UTC()
	cur := now.Hour()*60 + now.Minute()
	if s < e {
		return cur >= s && cur < e
	}
	return cur >= s || cur < e
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
//
// The payload carries notification_id + url because the service worker
// (`web/public/sw.js`) deep-links on those two fields: `data.url` is opened
// on click and `tag` is `n-<notification_id>` for dedupe. Without them every
// push lands on the generic /dashboard.
func fanoutPushPool(pool *pgxpool.Pool, userID int64, notificationID int64, kind, title, body, url string) {
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
	if url == "" {
		url = "/dashboard"
	}
	payload := `{"title":` + pushJSONString(title) + `,"body":` + pushJSONString(body) + `,"type":` + pushJSONString(kind) +
		`,"notification_id":` + strconv.FormatInt(notificationID, 10) + `,"url":` + pushJSONString(url) + `}`
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
				TTL:             86400,
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

// notificationPushURL mirrors the frontend deep-link map in
// web/components/header/NotificationsDropdown.tsx so a tapped push opens the
// same tab the in-app inbox would. data is the notifications.data JSON
// (usually {"project_id": N, ...}); unknown shapes fall back to /dashboard.
func notificationPushURL(kind, data string) string {
	var parsed map[string]any
	projectID := int64(0)
	if data != "" {
		if err := json.Unmarshal([]byte(data), &parsed); err == nil {
			for _, key := range []string{"project_id", "projectId"} {
				if v, ok := parsed[key]; ok {
					switch n := v.(type) {
					case float64:
						projectID = int64(n)
					case int64:
						projectID = n
					}
				}
			}
		}
	}
	switch kind {
	case "chat_message":
		return "/dashboard?tab=chat"
	case "project_invitation":
		return "/dashboard?tab=my-bids"
	case "order_payment_proof", "order_status":
		return "/dashboard?tab=orders"
	case "quote_payment_proof", "quote_payment_requested", "quote_marked_paid", "quote_approved":
		return "/dashboard?tab=quotes"
	case "courier_accepted", "courier_picked_up", "courier_delivered":
		return "/dashboard?tab=deliveries"
	case "quote_reviewed", "order_reviewed":
		return "/dashboard?tab=orders"
	case "payment_verified":
		return "/dashboard?tab=orders"
	case "verification", "verification_required":
		return "/dashboard?tab=verification"
	case "bid_shortlisted", "bid_recommended", "pm_bid_shortlisted", "bid_accepted", "pm_bid_accepted", "bid_rejected":
		return "/dashboard?tab=my-bids"
	case "consultation_requested", "consultation_responded":
		return "/dashboard?tab=consultations"
	}
	if strings.HasPrefix(kind, "consultation_") {
		return "/dashboard?tab=consultations"
	}
	if projectID > 0 {
		if tab, ok := map[string]string{
			"milestone_updated": "process", "milestone_approved": "process",
			"milestone_approval_needed": "process", "milestone_revision_requested": "process",
			"phase_verified": "process", "schedule_delayed": "process",
			"design_submitted": "process", "design_approved": "process",
			"design_revision_requested": "process", "budget_approved": "budget",
			"budget_negotiation": "budget", "budget_counter_accepted": "budget",
			"budget_rejected": "budget", "budget_approval_needed": "budget",
			"procurement_rejected": "budget", "addendum_approved": "budget",
			"addendum_rejected": "budget", "change_order": "budget",
			"sub_professional_invite": "engineering", "sub_professional_activated": "engineering",
			"sub_professional_declined": "engineering", "warranty_claim": "overview",
			"professional_resigned": "activity", "dispute_opened": "overview",
			"dispute_reply": "overview", "dispute_resolved": "overview",
			"bid_received": "interviews", "pm_bid_received": "interviews",
			"pm_hire_initiated": "interviews",
		}[kind]; ok {
			return "/projects/" + strconv.FormatInt(projectID, 10) + "/" + tab
		}
		return "/projects/" + strconv.FormatInt(projectID, 10)
	}
	return "/dashboard"
}

// SendPendingPushes delivers web push for notifications whose creating
// transaction has committed and which have not been pushed yet. Running from
// the sweeper rather than from inside the handler is what prevents a push for
// a bid or payment that then rolls back.
func SendPendingPushes(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	rows, err := pool.Query(ctx, `
		SELECT id, user_id, type, title, body, COALESCE(data::text, '{}')
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
		data   string
	}

	var batch []pending
	for rows.Next() {
		var item pending
		if err := rows.Scan(&item.id, &item.userID, &item.kind, &item.title, &item.body, &item.data); err != nil {
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
			fanoutPushPool(pool, item.userID, item.id, item.kind, item.title, item.body, notificationPushURL(item.kind, item.data))
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
