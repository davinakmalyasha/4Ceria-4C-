package httpapi

// hL scheduler + push leftovers: DB-down branches via closed pools,
// quiet-hour and preference twins, rate-bucket janitor, and fan-out
// against a stub push endpoint (201 keeps, 410 deletes, 400 keeps).

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestHLSchedulerDBDown(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	logger := hQDiscardLogger()

	// runWithLock cannot acquire on a closed pool: the job never runs.
	closed := testPool(t)
	closed.Close()
	ran := false
	runWithLock(ctx, closed, logger, int64(4197), "hL-test", func(context.Context) error {
		ran = true
		return nil
	})
	if ran {
		t.Fatalf("hL contended job ran on closed pool")
	}

	// DB-down sweepers take their skip branches and stay best-effort.
	if err := EscalateOverdueSnags(ctx, closed, logger); err != nil {
		t.Fatalf("hL escalate closed = %v, want nil", err)
	}
	if err := PruneExpired(ctx, closed, logger); err != nil {
		t.Fatalf("hL prune closed = %v, want nil", err)
	}
	if err := AutoCompleteOrders(ctx, closed, logger); err == nil {
		t.Fatalf("hL autocomplete closed ok, want error")
	}
	if err := SendPendingPushes(ctx, closed, logger); err == nil {
		t.Fatalf("hL sweep closed ok, want error")
	}
	// fanout cannot query on a closed pool: silent return, no subscriptions
	// touched, process stays up.
	var before int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM push_subscriptions`).Scan(&before)
	fanoutPushPool(closed, 1030091, 1, "chat_message", "hL", "hL", "/dashboard")
	var after int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM push_subscriptions`).Scan(&after)
	if before != after {
		t.Fatalf("hL fanout closed changed subs %d -> %d", before, after)
	}
}

func TestHLShouldPushTwins(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	u := hQMkUser(t, ctx, pool, "pushl", "user")
	defer hQCleanupUser(ctx, pool, u)
	defer pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1`, u)

	chat := "chat_message"
	// Enabled type row without quiet hours passes (the return-true leg).
	if _, err := pool.Exec(ctx, `INSERT INTO notification_preferences (user_id, type, channel, enabled) VALUES ($1,$2,'webpush',true)`, u, chat); err != nil {
		t.Fatalf("seed pref: %v", err)
	}
	if !shouldPushForPool(ctx, pool, u, chat) {
		t.Fatalf("hL enabled type row refused")
	}
	pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1`, u)
	// Enabled default row without quiet hours passes too.
	if _, err := pool.Exec(ctx, `INSERT INTO notification_preferences (user_id, type, channel, enabled) VALUES ($1,NULL,'webpush',true)`, u); err != nil {
		t.Fatalf("seed default pref: %v", err)
	}
	if !shouldPushForPool(ctx, pool, u, chat) {
		t.Fatalf("hL enabled default row refused")
	}
	pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1`, u)

	// Unparsable and out-of-range quiet bounds fail open.
	badStart, badEnd := "25:00:00", "00:00:00"
	if inQuietHours(&badStart, &badEnd) {
		t.Fatalf("hL quiet hour 25 refused to fail open")
	}
	badMin := "12:70:00"
	if inQuietHours(&badMin, &badEnd) {
		t.Fatalf("hL quiet minute 70 refused to fail open")
	}
	goodStart, goodEnd := "00:00:00", "23:59:59"
	if !inQuietHours(&goodStart, &goodEnd) {
		t.Fatalf("hL full-day quiet not quiet")
	}

	// The hourly janitor drops stale buckets and lets the owner back in.
	stale := int64(1030091)
	pushRateMu.Lock()
	pushLastSent[stale] = time.Now().Add(-2 * time.Hour)
	pushRateMu.Unlock()
	fresh := int64(1030092)
	if !pushRateAllowed(fresh) {
		t.Fatalf("hL fresh rate bucket refused")
	}
	pushRateMu.Lock()
	_, stillThere := pushLastSent[stale]
	pushRateMu.Unlock()
	if stillThere {
		t.Fatalf("hL stale rate bucket not swept")
	}
	pushRateMu.Lock()
	delete(pushLastSent, fresh)
	pushRateMu.Unlock()

	// Empty host is an invalid endpoint (the url.Parse error twin).
	if got := pushEndpointProblem("https://"); got != "Invalid push endpoint." {
		t.Fatalf("hL empty host = %q", got)
	}
}

// hLVapidKeys mints a real P-256 VAPID pair plus encryption keys so the
// stub endpoint sees a fully-formed WebPush POST.
func hLVapidKeys(t *testing.T) (pub, priv, p256dh, auth string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("vapid key: %v", err)
	}
	d := key.D.Bytes()
	padded := make([]byte, 32)
	copy(padded[32-len(d):], d)
	pub = base64.RawURLEncoding.EncodeToString(elliptic.Marshal(elliptic.P256(), key.X, key.Y))
	priv = base64.RawURLEncoding.EncodeToString(padded)

	enc, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("p256dh key: %v", err)
	}
	p256dh = base64.RawURLEncoding.EncodeToString(elliptic.Marshal(elliptic.P256(), enc.X, enc.Y))
	authBytes := make([]byte, 16)
	if _, err := rand.Read(authBytes); err != nil {
		t.Fatalf("auth: %v", err)
	}
	auth = base64.RawURLEncoding.EncodeToString(authBytes)
	return pub, priv, p256dh, auth
}

func hLPushStub() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/hL-gone":
			w.WriteHeader(http.StatusGone)
		case "/hL-bad":
			w.WriteHeader(http.StatusBadRequest)
		default:
			w.WriteHeader(http.StatusCreated)
		}
	}))
}

func hLSeedSub(t *testing.T, ctx context.Context, pool *pgxpool.Pool, userID int64, endpoint, p256dh, auth string) {
	t.Helper()
	if _, err := pool.Exec(ctx, `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, content_encoding, created_at, updated_at)
		VALUES ($1,$2,$3,$4,'aesgcm',now(),now())`, userID, endpoint, p256dh, auth); err != nil {
		t.Fatalf("seed sub: %v", err)
	}
}

func hLSubCount(t *testing.T, ctx context.Context, pool *pgxpool.Pool, userID int64, endpoint string) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`, userID, endpoint).Scan(&n); err != nil {
		t.Fatalf("sub count: %v", err)
	}
	return n
}

func TestHLFanoutStubStatuses(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	pub, priv, p256dh, auth := hLVapidKeys(t)
	t.Setenv("VAPID_PUBLIC_KEY", pub)
	t.Setenv("VAPID_PRIVATE_KEY", priv)

	stub := hLPushStub()
	defer stub.Close()

	// 201: delivered, subscription kept.
	epOK := stub.URL + "/hL-ok-1030001"
	hLSeedSub(t, ctx, pool, fx.pm.id, epOK, p256dh, auth)
	fanoutPushPool(pool, fx.pm.id, 1030001, "chat_message", "hL", "hL body", "/dashboard")
	if n := hLSubCount(t, ctx, pool, fx.pm.id, epOK); n != 1 {
		t.Fatalf("hL 201 sub left = %d, want 1", n)
	}

	// 410: dead subscription, row deleted (post-state literal 0).
	epGone := stub.URL + "/hL-gone"
	hLSeedSub(t, ctx, pool, fx.arsitek.id, epGone, p256dh, auth)
	fanoutPushPool(pool, fx.arsitek.id, 1030002, "chat_message", "hL", "hL body", "/dashboard")
	if n := hLSubCount(t, ctx, pool, fx.arsitek.id, epGone); n != 0 {
		t.Fatalf("hL 410 sub left = %d, want 0", n)
	}

	// 400: permanent refusal, subscription kept for the user to renew.
	epBad := stub.URL + "/hL-bad"
	hLSeedSub(t, ctx, pool, fx.kontraktor.id, epBad, p256dh, auth)
	fanoutPushPool(pool, fx.kontraktor.id, 1030003, "chat_message", "hL", "hL body", "/dashboard")
	if n := hLSubCount(t, ctx, pool, fx.kontraktor.id, epBad); n != 1 {
		t.Fatalf("hL 400 sub left = %d, want 1", n)
	}
}

func TestHLSweepMarksAndCleans(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	pub, priv, p256dh, auth := hLVapidKeys(t)
	t.Setenv("VAPID_PUBLIC_KEY", pub)
	t.Setenv("VAPID_PRIVATE_KEY", priv)

	stub := hLPushStub()
	defer stub.Close()

	// A dead subscription plus a fresh notification: the sweep marks the
	// row AND drops the 410 subscription in one pass.
	epGone := stub.URL + "/hL-gone"
	hLSeedSub(t, ctx, pool, fx.supplier.id, epGone, p256dh, auth)
	var nid int64
	if err := pool.QueryRow(ctx, `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'chat_message','hL Sweep','hL body','{"project_id":1032001}'::json) RETURNING id`, fx.supplier.id).Scan(&nid); err != nil {
		t.Fatalf("seed notif: %v", err)
	}
	marked := false
	for i := 0; i < 10 && !marked; i++ {
		if err := SendPendingPushes(ctx, pool, hQDiscardLogger()); err != nil {
			t.Fatalf("sweep: %v", err)
		}
		var sent bool
		if err := pool.QueryRow(ctx, `SELECT push_sent_at IS NOT NULL FROM notifications WHERE id=$1`, nid).Scan(&sent); err != nil {
			t.Fatalf("sweep check: %v", err)
		}
		marked = sent
	}
	if !marked {
		t.Fatalf("hL sweep never marked row %d", nid)
	}
	if n := hLSubCount(t, ctx, pool, fx.supplier.id, epGone); n != 0 {
		t.Fatalf("hL sweep 410 sub left = %d, want 0", n)
	}
	// URL for a chat notification is the chat tab (post-state literal).
	var data string
	_ = pool.QueryRow(ctx, `SELECT data::text FROM notifications WHERE id=$1`, nid).Scan(&data)
	if got := notificationPushURL("chat_message", data); got != "/dashboard?tab=chat" {
		t.Fatalf("hL push url = %q", got)
	}
}
