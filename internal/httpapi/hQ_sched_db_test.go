package httpapi

// hQ push/scheduler/storage/participation/directory leftovers: preference
// branches, rate-limit and URL tables, sweeper happy paths, signed serve,
// safe-join edges, participation adapters and directory batch rendering.

import (
	"context"
	"crypto/tls"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func hQDiscardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestHQPushPreferences(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	u := hQMkUser(t, ctx, pool, "pushpref", "user")
	defer hQCleanupUser(ctx, pool, u)

	if shouldPushForPool(ctx, pool, 0, "dispute_opened") {
		t.Fatalf("push zero user")
	}
	// Always-on kinds bypass preferences entirely (literals)
	if !shouldPushForPool(ctx, pool, u, "dispute_opened") {
		t.Fatalf("push always-on")
	}
	// Default: no rows at all pushes
	if !shouldPushForPool(ctx, pool, u, "chat_message") {
		t.Fatalf("push default")
	}
	mkPref := func(typ *string, enabled bool, start, end *string) {
		if _, err := pool.Exec(ctx, `INSERT INTO notification_preferences (user_id, type, channel, enabled, quiet_hours_start, quiet_hours_end) VALUES ($1,$2,'webpush',$3,$4::time,$5::time)`, u, typ, enabled, start, end); err != nil {
			t.Fatalf("seed pref: %v", err)
		}
	}
	defer pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1`, u)
	off := false
	on := true
	_ = on
	fullStart, fullEnd := "00:00:00", "23:59:59"
	// Disabled type row silences that type only
	chat := "chat_message"
	mkPref(&chat, false, nil, nil)
	if shouldPushForPool(ctx, pool, u, "chat_message") {
		t.Fatalf("push disabled type")
	}
	// Always-on still fires despite the (different-type) disabled row
	if !shouldPushForPool(ctx, pool, u, "dispute_reply") {
		t.Fatalf("push always-on despite prefs")
	}
	pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1`, u)
	// Quiet hours covering the whole day silence the type
	mkPref(&chat, true, &fullStart, &fullEnd)
	if shouldPushForPool(ctx, pool, u, "chat_message") {
		t.Fatalf("push quiet type")
	}
	pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1`, u)
	// Default row disabled silences everything not always-on
	mkPref(nil, false, nil, nil)
	if shouldPushForPool(ctx, pool, u, "chat_message") {
		t.Fatalf("push default disabled")
	}
	if !shouldPushForPool(ctx, pool, u, "payment_verified") {
		t.Fatalf("push always-on despite default off")
	}
	// Default row with full-day quiet hours silences
	pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1`, u)
	mkPref(nil, true, &fullStart, &fullEnd)
	if shouldPushForPool(ctx, pool, u, "chat_message") {
		t.Fatalf("push default quiet")
	}
	pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1`, u)
	_ = off

	// inQuietHours branches — literals
	if inQuietHours(nil, nil) {
		t.Fatalf("quiet nil")
	}
	if !inQuietHours(&fullStart, &fullEnd) {
		t.Fatalf("quiet full day")
	}
	same := "12:00:00"
	if inQuietHours(&same, &same) {
		t.Fatalf("quiet equal")
	}
	bad := "xx"
	if inQuietHours(&bad, &fullEnd) {
		t.Fatalf("quiet bad")
	}
	// Overnight wrap computed around now: guaranteed inside
	now := time.Now().UTC()
	s := now.Add(-time.Minute).Format("15:04:05")
	e := now.Add(-2 * time.Minute).Format("15:04:05")
	if !inQuietHours(&s, &e) {
		t.Fatalf("quiet wrap now")
	}

	// Rate cap: first passes, immediate second refused (literals)
	rid := int64(989001)
	// fresh bucket regardless of other tests
	if !pushRateAllowed(rid) {
		t.Fatalf("push rate first")
	}
	if pushRateAllowed(rid) {
		t.Fatalf("push rate second")
	}

	// fanout with no VAPID keys returns silently (no network)
	os.Unsetenv("VAPID_PUBLIC_KEY")
	os.Unsetenv("VAPID_PRIVATE_KEY")
	fanoutPushPool(pool, u, 1, "chat_message", "hQ", "hQ", "/dashboard")
	// VAPID keys set but no subscriptions: query runs, nothing sent
	t.Setenv("VAPID_PUBLIC_KEY", "hQ-pub")
	t.Setenv("VAPID_PRIVATE_KEY", "hQ-priv")
	fanoutPushPool(pool, u, 1, "chat_message", "hQ", "hQ", "/dashboard")

	// Sweep honors a disabled preference but still marks the row
	var nid int64
	if err := pool.QueryRow(ctx, `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'chat_message','hQ Sweep','hQ body','{"project_id":1}'::json) RETURNING id`, u).Scan(&nid); err != nil {
		t.Fatalf("seed notif: %v", err)
	}
	mkPref(&chat, false, nil, nil)
	// Drain: the sweep takes the oldest 25 unpushed rows per run and
	// other tests leave unpushed rows behind, so ours may sit deep in
	// the queue. Loop until ours is marked (bounded: 10 runs cover 250
	// queued rows). Any sweep error fails here — NULL data must sweep.
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
		t.Fatalf("sweep marker: row %d not swept in 10 runs", nid)
	}
	pool.Exec(ctx, `DELETE FROM notifications WHERE id=$1`, nid)
	pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1`, u)

	// pushJSONString escapes — literals
	if got := pushJSONString("a\"b\\c\nd\re\tf\x01g"); got != `"a\"b\\c\nd\re\tf g"` {
		t.Fatalf("pushJSONString = %q", got)
	}
	// pushMailFrom branches
	os.Unsetenv("MAIL_FROM_ADDRESS")
	if pushMailFrom() != "no-reply@4ceria.test" {
		t.Fatalf("pushMailFrom default")
	}
	t.Setenv("MAIL_FROM_ADDRESS", "hQ@example.test")
	if pushMailFrom() != "hQ@example.test" {
		t.Fatalf("pushMailFrom env")
	}

	// notificationPushURL table — literals
	urlCases := map[string]string{
		"chat_message":            "/dashboard?tab=chat",
		"project_invitation":      "/dashboard?tab=my-bids",
		"order_status":            "/dashboard?tab=orders",
		"quote_marked_paid":       "/dashboard?tab=quotes",
		"courier_delivered":       "/dashboard?tab=deliveries",
		"order_reviewed":          "/dashboard?tab=orders",
		"payment_verified":        "/dashboard?tab=orders",
		"verification_required":   "/dashboard?tab=verification",
		"bid_accepted":            "/dashboard?tab=my-bids",
		"consultation_responded":  "/dashboard?tab=consultations",
		"consultation_custom_xyz": "/dashboard?tab=consultations",
	}
	for kind, want := range urlCases {
		if got := notificationPushURL(kind, ""); got != want {
			t.Fatalf("pushURL %s = %q want %q", kind, got, want)
		}
	}
	if got := notificationPushURL("milestone_updated", `{"project_id": 7}`); got != "/projects/7/process" {
		t.Fatalf("pushURL milestone = %q", got)
	}
	if got := notificationPushURL("budget_approved", `{"projectId": 9}`); got != "/projects/9/budget" {
		t.Fatalf("pushURL budget = %q", got)
	}
	if got := notificationPushURL("dispute_reply", `{"project_id": 11}`); got != "/projects/11/overview" {
		t.Fatalf("pushURL dispute = %q", got)
	}
	if got := notificationPushURL("hQ_unknown", `{"project_id": 13}`); got != "/projects/13" {
		t.Fatalf("pushURL unknown = %q", got)
	}
	if got := notificationPushURL("hQ_unknown", ""); got != "/dashboard" {
		t.Fatalf("pushURL fallback = %q", got)
	}
}

func TestHQPushSubscribeExtra(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	u := hQMkUser(t, ctx, pool, "pushsub", "user")
	defer hQCleanupUser(ctx, pool, u)
	caller := &roadmapCaller{id: u, role: "user"}
	defer pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE user_id=$1`, u)

	sub := func(body string, headers map[string]string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
		for k, v := range headers {
			r.Header.Set(k, v)
		}
		r = r.WithContext(withCaller(r.Context(), *caller))
		rec := httptest.NewRecorder()
		PushSubscribeHandler(pool)(rec, r)
		return rec
	}
	ep := "https://fcm.googleapis.com/hQ-" + itoaTest(u)
	base := `{"endpoint":"` + ep + `","keys":{"p256dh":"hQp","auth":"hQa"}}`
	// Malformed JSON: fields fall back, required twins fire
	r := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{oops`))
	r = r.WithContext(withCaller(r.Context(), *caller))
	rec := httptest.NewRecorder()
	PushSubscribeHandler(pool)(rec, r)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub malformed = %d", rec.Code)
	}
	hCErrors(t, rec, "endpoint", "The endpoint field is required.")
	// Endpoint must be a string / short URL / valid URL
	if rec := sub(`{"endpoint":7,"keys":{"p256dh":"a","auth":"b"}}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub ep type = %d", rec.Code)
	} else {
		hCErrors(t, rec, "endpoint", "The endpoint field must be a string.")
	}
	if rec := sub(`{"endpoint":"https://`+strings.Repeat("e", 500)+`.example.test/x","keys":{"p256dh":"a","auth":"b"}}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub ep long = %d", rec.Code)
	} else {
		hCErrors(t, rec, "endpoint", "The endpoint field must not be greater than 500 characters.")
	}
	if rec := sub(`{"endpoint":"::","keys":{"p256dh":"a","auth":"b"}}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub ep url = %d %s", rec.Code, rec.Body.String())
	} else {
		hCErrors(t, rec, "endpoint", "The endpoint field must be a valid URL.")
	}
	// Trusted-host refusals with exact bodies
	if rec := sub(`{"endpoint":"https://[2001:db8::2]/x","keys":{"p256dh":"a","auth":"b"}}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub ipv6 = %d", rec.Code)
	} else if got := hCDecode(t, rec)["message"].(string); got != "Invalid push endpoint." {
		t.Fatalf("sub ipv6 msg = %q", got)
	}
	if rec := sub(`{"endpoint":"https://1.2.3.x/y","keys":{"p256dh":"a","auth":"b"}}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub badip = %d", rec.Code)
	} else if got := hCDecode(t, rec)["message"].(string); got != "Unrecognized push service endpoint." {
		t.Fatalf("sub badip msg = %q", got)
	}
	if rec := sub(`{"endpoint":"https://updates.push.services.mozilla.com/hQ","keys":{"p256dh":"a","auth":"b"}}`, nil); rec.Code != http.StatusOK {
		t.Fatalf("sub mozilla = %d %s", rec.Code, rec.Body.String())
	}
	// Key branches — exact messages
	if rec := sub(`{"endpoint":"`+ep+`"}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub nokeys = %d", rec.Code)
	} else {
		hCErrors(t, rec, "keys.p256dh", "The keys.p256dh field is required.")
	}
	if rec := sub(`{"endpoint":"`+ep+`","keys":{"p256dh":7,"auth":"b"}}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub key type = %d", rec.Code)
	} else {
		hCErrors(t, rec, "keys.p256dh", "The keys.p256dh field must be a string.")
	}
	if rec := sub(`{"endpoint":"`+ep+`","keys":{"p256dh":"`+strings.Repeat("p", 256)+`","auth":"b"}}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub key long = %d", rec.Code)
	} else {
		hCErrors(t, rec, "keys.p256dh", "The keys.p256dh field must not be greater than 255 characters.")
	}
	// contentEncoding branches
	if rec := sub(`{"endpoint":"`+ep+`","keys":{"p256dh":"a","auth":"b"},"contentEncoding":7}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub enc type = %d", rec.Code)
	} else {
		hCErrors(t, rec, "contentEncoding", "The contentEncoding field must be a string.")
	}
	if rec := sub(`{"endpoint":"`+ep+`","keys":{"p256dh":"a","auth":"b"},"contentEncoding":"`+strings.Repeat("c", 21)+`"}`, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub enc long = %d", rec.Code)
	} else {
		hCErrors(t, rec, "contentEncoding", "The contentEncoding field must not be greater than 20 characters.")
	}
	// Happy with custom encoding + long user agent (truncated to 500)
	longUA := strings.Repeat("U", 600)
	if rec := sub(`{"endpoint":"`+ep+`","keys":{"p256dh":"hQp","auth":"hQa"},"contentEncoding":"aes128gcm"}`, map[string]string{"User-Agent": longUA}); rec.Code != http.StatusOK {
		t.Fatalf("sub happy = %d %s", rec.Code, rec.Body.String())
	} else if got := hCDecode(t, rec)["message"].(string); got != "Push subscription saved" {
		t.Fatalf("sub msg = %q", got)
	}
	var enc, ua string
	_ = pool.QueryRow(ctx, `SELECT content_encoding, user_agent FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`, u, ep).Scan(&enc, &ua)
	if enc != "aes128gcm" || len([]rune(ua)) != 500 {
		t.Fatalf("sub row = %q len=%d", enc, len([]rune(ua)))
	}
	// Unsubscribe happy removes the row (literal count 0)
	_ = base
	ures := func(body string) *httptest.ResponseRecorder {
		rr := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
		rr = rr.WithContext(withCaller(rr.Context(), *caller))
		rec := httptest.NewRecorder()
		PushUnsubscribeHandler(pool)(rec, rr)
		return rec
	}
	if rec := ures(`{"endpoint":"` + ep + `"}`); rec.Code != http.StatusOK {
		t.Fatalf("unsub happy = %d %s", rec.Code, rec.Body.String())
	} else if got := hCDecode(t, rec)["message"].(string); got != "Push subscription removed" {
		t.Fatalf("unsub msg = %q", got)
	}
	var left int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`, u, ep).Scan(&left)
	if left != 0 {
		t.Fatalf("unsub left = %d", left)
	}
	// Unsubscribe malformed JSON — required twin
	rm := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{oops`))
	rm = rm.WithContext(withCaller(rm.Context(), *caller))
	recm := httptest.NewRecorder()
	PushUnsubscribeHandler(pool)(recm, rm)
	if recm.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unsub malformed = %d", recm.Code)
	}
	hCErrors(t, recm, "endpoint", "The endpoint field is required.")
	// Direct pure branches
	if isIPLiteral("1.2.3.4") != true || isIPLiteral("1.2.3") != false || isIPLiteral("example.com") != false {
		t.Fatalf("isIPLiteral")
	}
	if got := pushEndpointProblem("http://[::1"); got != "Invalid push endpoint." {
		t.Fatalf("endpoint parse err = %q", got)
	}
}

func TestHQSchedulerSweep(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	logger := hQDiscardLogger()
	owner := hQMkUser(t, ctx, pool, "schedown", "user")
	defer hQCleanupUser(ctx, pool, owner)
	suppUser := hQMkUser(t, ctx, pool, "schedsup", "supplier")
	defer hQCleanupUser(ctx, pool, suppUser)
	var supp int64
	if err := pool.QueryRow(ctx, `INSERT INTO suppliers (user_id, store_name) VALUES ($1,'hQ Store') RETURNING id`, suppUser).Scan(&supp); err != nil {
		t.Fatalf("supplier: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM suppliers WHERE id=$1`, supp)

	// Auto-complete: delivered order older than 3 days flips; fresh stays
	var oldID, freshID, cancID int64
	_ = pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, status, total_price, whatsapp_order_id, updated_at) VALUES ($1,$2,'delivered',50000,'hQ-old',now()-interval '4 days') RETURNING id`, owner, supp).Scan(&oldID)
	_ = pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, status, total_price, whatsapp_order_id) VALUES ($1,$2,'delivered',50000,'hQ-fresh') RETURNING id`, owner, supp).Scan(&freshID)
	_ = pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, status, total_price, whatsapp_order_id) VALUES ($1,$2,'cancelled',50000,'hQ-canc') RETURNING id`, owner, supp).Scan(&cancID)
	defer pool.Exec(ctx, `DELETE FROM material_orders WHERE id IN ($1,$2,$3)`, oldID, freshID, cancID)
	if err := AutoCompleteOrders(ctx, pool, logger); err != nil {
		t.Fatalf("autocomplete: %v", err)
	}
	var oldSt, freshSt, cancSt string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id=$1`, oldID).Scan(&oldSt)
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id=$1`, freshID).Scan(&freshSt)
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id=$1`, cancID).Scan(&cancSt)
	if oldSt != "completed" || freshSt != "delivered" || cancSt != "cancelled" {
		t.Fatalf("autocomplete rows = %q %q %q", oldSt, freshSt, cancSt)
	}

	// Snag escalation: overdue open item stamps; resolved keeps null
	pid := hQMkProject(t, ctx, pool, owner, "hQ Snag Project")
	defer hQCleanupDisputeProject(ctx, pool, pid, owner)
	var snagOpen, snagDone int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_snag_items (project_id, title, reported_by, due_at) VALUES ($1,'hQ overdue',$2,now()-interval '1 day') RETURNING id`, pid, owner).Scan(&snagOpen)
	_ = pool.QueryRow(ctx, `INSERT INTO project_snag_items (project_id, title, reported_by, status, due_at) VALUES ($1,'hQ done',$2,'resolved',now()-interval '1 day') RETURNING id`, pid, owner).Scan(&snagDone)
	defer pool.Exec(ctx, `DELETE FROM project_snag_items WHERE id IN ($1,$2)`, snagOpen, snagDone)
	if err := EscalateOverdueSnags(ctx, pool, logger); err != nil {
		t.Fatalf("escalate: %v", err)
	}
	var escOpen bool
	var escDone *string
	_ = pool.QueryRow(ctx, `SELECT escalated_at IS NOT NULL FROM project_snag_items WHERE id=$1`, snagOpen).Scan(&escOpen)
	_ = pool.QueryRow(ctx, `SELECT escalated_at::text FROM project_snag_items WHERE id=$1`, snagDone).Scan(&escDone)
	if !escOpen || escDone != nil {
		t.Fatalf("escalate rows = %v %v", escOpen, escDone)
	}

	// Prune: old notification, expired token and stale limiter row go;
	// fresh rows stay
	var oldNotif int64
	_ = pool.QueryRow(ctx, `INSERT INTO notifications (user_id, type, title, body, created_at) VALUES ($1,'hQ-old','hQ Old','hQ',now()-interval '100 days') RETURNING id`, owner).Scan(&oldNotif)
	var freshNotif int64
	_ = pool.QueryRow(ctx, `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'hQ-new','hQ New','hQ') RETURNING id`, owner).Scan(&freshNotif)
	var tokID int64
	_ = pool.QueryRow(ctx, `INSERT INTO personal_access_tokens (tokenable_type, tokenable_id, name, token, expires_at) VALUES ('App\Models\User',$1,'hQ','hQ-token-old',now()-interval '1 day') RETURNING id`, owner).Scan(&tokID)
	if _, err := pool.Exec(ctx, `INSERT INTO rate_limit_hits (key, hit_at) VALUES ('hQ-old-key',now()-interval '2 hours')`); err != nil {
		t.Fatalf("limiter seed: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO rate_limit_hits (key, hit_at) VALUES ('hQ-new-key',now())`); err != nil {
		t.Fatalf("limiter fresh: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM notifications WHERE id IN ($1,$2)`, oldNotif, freshNotif)
	defer pool.Exec(ctx, `DELETE FROM personal_access_tokens WHERE tokenable_id=$1 AND name='hQ'`, owner)
	defer pool.Exec(ctx, `DELETE FROM rate_limit_hits WHERE key IN ('hQ-old-key','hQ-new-key')`)
	if err := PruneExpired(ctx, pool, logger); err != nil {
		t.Fatalf("prune: %v", err)
	}
	var nOld, nFresh, tOld, lOld, lFresh int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE id=$1`, oldNotif).Scan(&nOld)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE id=$1`, freshNotif).Scan(&nFresh)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM personal_access_tokens WHERE id=$1`, tokID).Scan(&tOld)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM rate_limit_hits WHERE key='hQ-old-key'`).Scan(&lOld)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM rate_limit_hits WHERE key='hQ-new-key'`).Scan(&lFresh)
	if nOld != 0 || nFresh != 1 || tOld != 0 || lOld != 0 || lFresh != 1 {
		t.Fatalf("prune rows = notif %d/%d token %d limit %d/%d", nOld, nFresh, tOld, lOld, lFresh)
	}

	// runWithLock contention: held lock means the job never runs
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	var locked bool
	_ = conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, int64(4199)).Scan(&locked)
	if !locked {
		conn.Release()
		t.Fatalf("lock not held")
	}
	ran := false
	runWithLock(ctx, pool, logger, int64(4199), "hQ-test", func(context.Context) error {
		ran = true
		return nil
	})
	_, _ = conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, int64(4199))
	conn.Release()
	if ran {
		t.Fatalf("contended job ran")
	}
	// Free lock: job runs and a failing job is only logged
	ran = false
	runWithLock(ctx, pool, logger, int64(4199), "hQ-test", func(context.Context) error {
		ran = true
		return nil
	})
	if !ran {
		t.Fatalf("free job did not run")
	}
	runWithLock(ctx, pool, logger, int64(4199), "hQ-test", func(context.Context) error {
		return context.DeadlineExceeded
	})
	// StartScheduler with a cancelled context returns without running jobs
	cancelCtx, cancel := context.WithCancel(context.Background())
	cancel()
	StartScheduler(cancelCtx, pool, nil)
}

func TestHQStorageServe(t *testing.T) {
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())
	t.Setenv("EVIDENCE_DIR", t.TempDir())
	t.Setenv("APP_KEY", "hQ-test-key")

	// Public file serves with public cache headers (literals)
	pubRel := "avatars/hQ-face.png"
	pubFull, err := safeStorageJoin(os.Getenv("PUBLIC_STORAGE_ROOT"), pubRel)
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if err := os.MkdirAll(pubFull[:len(pubFull)-len("hQ-face.png")], 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	want := []byte("\x89PNG hQ face")
	if err := os.WriteFile(pubFull, want, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	callStorage := func(rel, rawQuery string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/storage/"+rel+rawQuery, nil)
		r.SetPathValue("path", rel)
		rec := httptest.NewRecorder()
		(&Router{}).storage(rec, r)
		return rec
	}
	rec := callStorage(pubRel, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("public serve = %d", rec.Code)
	}
	if rec.Body.String() != string(want) {
		t.Fatalf("public bytes")
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=3600" {
		t.Fatalf("public cache = %q", cc)
	}
	// Missing file — 404 pin (public + private fallback both miss)
	if rec := callStorage("avatars/hQ-gone.png", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing = %d", rec.Code)
	}
	// Public prefix with traversal: auth skipped, join fails — 404 pin
	if rec := callStorage("avatars/../../escape.png", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("escape = %d", rec.Code)
	}
	// Private path without signature and without gates — 401 pin
	if rec := callStorage("disputes/1/hQ.pdf", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("private nosig = %d", rec.Code)
	}
	// Private path WITH a valid signature serves without auth
	privRel := "disputes/1/hQ-signed.pdf"
	privFull, err := safeStorageJoin(os.Getenv("EVIDENCE_DIR"), privRel)
	if err != nil {
		t.Fatalf("join priv: %v", err)
	}
	if err := os.MkdirAll(privFull[:len(privFull)-len("hQ-signed.pdf")], 0o755); err != nil {
		t.Fatalf("mkdir priv: %v", err)
	}
	privWant := []byte("%PDF hQ signed")
	if err := os.WriteFile(privFull, privWant, 0o644); err != nil {
		t.Fatalf("write priv: %v", err)
	}
	signed := storageSignedURL(privRel)
	parts := strings.SplitN(signed, "?", 2)
	if len(parts) != 2 || !strings.HasPrefix(parts[0], "/storage/disputes/1/hQ-signed.pdf") {
		t.Fatalf("signed url = %q", signed)
	}
	rec = callStorage(privRel, "?"+parts[1])
	if rec.Code != http.StatusOK {
		t.Fatalf("signed serve = %d %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != string(privWant) {
		t.Fatalf("signed bytes")
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=3600" {
		t.Fatalf("signed cache = %q", cc)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, "attachment;") {
		if cd != "" {
			t.Fatalf("signed disposition = %q", cd)
		}
	}
	// Bad signature — 401 pin
	if rec := callStorage(privRel, "?expires=9999999999&sig=bad"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad sig = %d", rec.Code)
	}
	// Expired signature — 401 pin
	if rec := callStorage(privRel, "?expires=1&sig="+signStorageURL(privRel, 1)); rec.Code != http.StatusUnauthorized {
		t.Fatalf("expired sig = %d", rec.Code)
	}

	// resolveStorageURL branches — literals
	if got := resolveStorageURL(context.Background(), ""); got != nil {
		t.Fatalf("resolve empty = %v", got)
	}
	if got := resolveStorageURL(context.Background(), "https://example.com/x.png"); got != "https://example.com/x.png" {
		t.Fatalf("resolve external = %v", got)
	}
	s3pref := "https://t3.storageapi.dev/fourc-storage-fneicjrzkq3/disputes/1/hQ.pdf"
	if got, _ := resolveStorageURL(context.Background(), s3pref).(string); !strings.HasPrefix(got, "/storage/disputes/1/hQ.pdf?") {
		t.Fatalf("resolve s3prefix = %v", got)
	}
	// requestOrigin branches
	r := httptest.NewRequest(http.MethodGet, "http://hQ.test/x", nil)
	if requestOrigin(r) != "http://hQ.test" {
		t.Fatalf("origin http = %q", requestOrigin(r))
	}
	rTLS := httptest.NewRequest(http.MethodGet, "http://hQ.test/x", nil)
	rTLS.TLS = &tls.ConnectionState{}
	if requestOrigin(rTLS) != "https://hQ.test" {
		t.Fatalf("origin tls = %q", requestOrigin(rTLS))
	}
	rFwd := httptest.NewRequest(http.MethodGet, "http://hQ.test/x", nil)
	rFwd.Header.Set("X-Forwarded-Proto", "https")
	if requestOrigin(rFwd) != "https://hQ.test" {
		t.Fatalf("origin fwd = %q", requestOrigin(rFwd))
	}
	// safeStorageJoin backslash form stays inside root (literals)
	if _, err := safeStorageJoin(t.TempDir(), "a\\b\\c.png"); err != nil {
		t.Fatalf("backslash join: %v", err)
	}
}

type hQStaticAuth struct {
	caller Caller
}

func (a hQStaticAuth) Authenticate(r *http.Request) (Caller, error) {
	return a.caller, nil
}

func TestHQParticipationDirectory(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	// ProfileIDFor on a zero subject — nil branch
	var zero DbSubject
	if zero.ProfileIDFor("arsitek") != nil {
		t.Fatalf("zero profile")
	}
	// Spatie-only admin reads admin without role_type
	sp := hQMkUser(t, ctx, pool, "spatiead", "user")
	defer hQCleanupUser(ctx, pool, sp)
	var roleID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM roles WHERE name='admin'`).Scan(&roleID)
	if roleID == 0 {
		t.Skip("no admin role")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES ($1,'App\Models\User',$2)`, roleID, sp); err != nil {
		t.Fatalf("spatie grant: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM model_has_roles WHERE role_id=$1 AND model_id=$2`, roleID, sp)
	subj, err := loadSubject(ctx, pool, sp)
	if err != nil {
		t.Fatalf("loadSubject: %v", err)
	}
	if !subj.IsAdmin() {
		t.Fatalf("spatie admin not admin")
	}
	isAdmin, err := isAdminUser(ctx, pool, sp, "user")
	if err != nil || !isAdmin {
		t.Fatalf("isAdminUser spatie = %v %v", isAdmin, err)
	}

	// pm_id holding a USER id resolves through the profile (wire compat)
	pmUser := hQMkUser(t, ctx, pool, "pmwire", "project_manager")
	defer hQCleanupUser(ctx, pool, pmUser)
	var pmProf int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_managers (user_id, nama, verification_status) VALUES ($1,'hQ PM','verified') RETURNING id`, pmUser).Scan(&pmProf)
	defer pool.Exec(ctx, `DELETE FROM project_managers WHERE id=$1`, pmProf)
	owner := hQMkUser(t, ctx, pool, "pmown", "user")
	defer hQCleanupUser(ctx, pool, owner)
	pid := hQMkProject(t, ctx, pool, owner, "hQ PM Project")
	defer hQCleanupDisputeProject(ctx, pool, pid, owner)
	// pm_id holds the profile id (FK-enforced): hired lookup is direct
	pool.Exec(ctx, `UPDATE projects SET pm_id=$2 WHERE id=$1`, pid, pmProf)
	parties, err := loadProjectParties(ctx, pool, pid)
	if err != nil {
		t.Fatalf("parties: %v", err)
	}
	if got := parties.HiredProfileID("project_manager"); got == nil || int64(*got) != pmProf {
		t.Fatalf("pm resolve = %v want %d", got, pmProf)
	}

	// Directory batch rendering: phones on the user, services on notaris
	npUser := hQMkUser(t, ctx, pool, "dirnot", "notaris")
	defer hQCleanupUser(ctx, pool, npUser)
	var npProf int64
	_ = pool.QueryRow(ctx, `INSERT INTO notaris_profiles (user_id, nama, verification_status) VALUES ($1,'hQ Notaris','verified') RETURNING id`, npUser).Scan(&npProf)
	defer pool.Exec(ctx, `DELETE FROM notaris_profiles WHERE id=$1`, npProf)
	var npSvc int64
	_ = pool.QueryRow(ctx, `INSERT INTO notaris_services (notaris_id, title, price) VALUES ($1,'hQ Svc',1000) RETURNING id`, npProf).Scan(&npSvc)
	defer pool.Exec(ctx, `DELETE FROM notaris_services WHERE id=$1`, npSvc)
	if _, err := pool.Exec(ctx, `INSERT INTO phone_user (contact, id_contact, id_user) VALUES ('+62877',NULL,$1)`, npUser); err != nil {
		t.Fatalf("phone: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user=$1`, npUser)
	rec := httptest.NewRecorder()
	DirectoryHandler(pool, "notaris_profiles", "/api/notaris", true)(rec, httptest.NewRequest(http.MethodGet, "/api/notaris?search=hQ+Notaris", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("directory notaris = %d %s", rec.Code, rec.Body.String())
	}
	nbody := hQDecode(t, rec)
	items := nbody["data"].([]any)
	if len(items) != 1 {
		t.Fatalf("directory items = %d", len(items))
	}
	svcs, ok := items[0].(map[string]any)["services"].([]any)
	if !ok || len(svcs) != 1 {
		t.Fatalf("directory services = %v", items[0])
	}
	user, ok := items[0].(map[string]any)["user"].(map[string]any)
	if !ok {
		t.Fatalf("directory user missing")
	}
	phones, ok := user["phoneNumber"].([]any)
	if !ok || len(phones) != 1 || phones[0].(map[string]any)["contact"].(string) != "+62877" {
		t.Fatalf("directory phones = %v", user["phoneNumber"])
	}
	// directoryUser direct with phones
	du, err := directoryUser(ctx, pool, npUser)
	if err != nil {
		t.Fatalf("directoryUser: %v", err)
	}
	if list, _ := du.Get("phoneNumber"); len(list.([]any)) != 1 {
		t.Fatalf("directoryUser phones")
	}
	// directoryServices direct with rows
	ds, err := directoryServices(ctx, pool, "notaris_profiles", npProf)
	if err != nil || len(ds) != 1 {
		t.Fatalf("directoryServices = %v %v", ds, err)
	}
	// per_page=0 falls back to the default (literals: same envelope)
	rec = httptest.NewRecorder()
	DirectoryHandler(pool, "arsiteks", "/api/arsitek", false)(rec, httptest.NewRequest(http.MethodGet, "/api/arsitek?per_page=0", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("directory perpage0 = %d", rec.Code)
	}
	if meta := hQDecode(t, rec)["meta"].(map[string]any); meta["per_page"].(float64) != 24 {
		t.Fatalf("directory perpage0 meta = %v", meta)
	}
	// lastPage guard branch
	if lastPage(0, 0) != 1 {
		t.Fatalf("lastPage zero")
	}
}
