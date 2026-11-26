package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHalfPushFanoutDirect(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	var uid int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&uid); err != nil {
		t.Skip("no users")
	}
	if shouldPushForPool(ctx, pool, 0, "dispute_opened") {
		t.Fatalf("user 0 should not push")
	}
	if !shouldPushForPool(ctx, pool, uid, "dispute_opened") {
		t.Fatalf("always-on kind should push")
	}
	if !shouldPushForPool(ctx, pool, 99009999, "some_random_kind") {
		t.Fatalf("unknown user default should push")
	}
	// disabled preference blocks
	_, _ = pool.Exec(ctx, `INSERT INTO notification_preferences (user_id, channel, type, enabled) VALUES ($1,'webpush','half2kind',false) ON CONFLICT DO NOTHING`, uid)
	if shouldPushForPool(ctx, pool, uid, "half2kind") {
		t.Fatalf("disabled pref should not push")
	}
	defer pool.Exec(ctx, `DELETE FROM notification_preferences WHERE user_id=$1 AND type='half2kind'`, uid)
	// quiet hours true branch: whole-day window
	start, end := "00:00:00", "23:59:59"
	if !inQuietHours(&start, &end) {
		t.Fatalf("full-day quiet should hold")
	}
	bad1, bad2 := "bogus", "also-bogus"
	if inQuietHours(&bad1, &bad2) {
		t.Fatalf("unparsable quiet should fail open")
	}
	// rate cap: first ok, second blocked
	pushLastSent = map[int64]time.Time{}
	if !pushRateAllowed(99009991) {
		t.Fatalf("first push should be allowed")
	}
	if pushRateAllowed(99009991) {
		t.Fatalf("second push within 5s should block")
	}
	// fanout with no VAPID keys returns early (covers skip branch)
	fanoutPushPool(pool, uid, 1, "dispute_opened", "T", "B", "/dashboard")
}

func TestHalfReleaseLedger(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	var ownerID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half2RelOwn','half2relown','half2relown@example.test','x','user','H2RL1',NOW(),NOW()) RETURNING id`).Scan(&ownerID); err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, ownerID)
	var projectID int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,'Half2 Release Project','open',1000000) RETURNING id`, ownerID).Scan(&projectID); err != nil {
		t.Fatalf("seed project: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, projectID)
	defer pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, projectID)
	defer pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, ownerID)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, projectID)

	bySpelling, _, err := registryIDs(ctx, pool)
	if err != nil {
		t.Fatalf("registry: %v", err)
	}
	regID := bySpelling[`App\Models\ProjectPaymentTermin`]

	runTx := func(fn func(tx interface {
		QueryRow(ctx context.Context, sql string, args ...any) interface{ Scan(dest ...any) error }
	}) error) error {
		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)
		_ = fn
		return nil
	}
	_ = runTx

	// happy payment write
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	written, avail, err := recordPaymentMinorInner(ctx, tx, projectID, 100000, "Half2 payment", `App\Models\ProjectPaymentTermin`, 99009991, regID, ownerID, "user", true)
	if err != nil || !written {
		tx.Rollback(ctx)
		t.Fatalf("write = %v %v %v", written, avail, err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}
	// paidTotalMinor direct
	tx2, _ := pool.Begin(ctx)
	paid, err := paidTotalMinor(ctx, tx2, projectID)
	tx2.Rollback(ctx)
	if err != nil || paid != 100000 {
		t.Fatalf("paid = %d %v", paid, err)
	}
	// dedupe same ref -> (true, 0, nil)
	tx3, _ := pool.Begin(ctx)
	w2, a2, err := recordPaymentMinorInner(ctx, tx3, projectID, 100000, "Half2 payment", `App\Models\ProjectPaymentTermin`, 99009991, regID, ownerID, "user", true)
	tx3.Rollback(ctx)
	if err != nil || !w2 || a2 != 0 {
		t.Fatalf("dedupe = %v %v %v", w2, a2, err)
	}
	// insufficient -> (false, available, nil)
	tx4, _ := pool.Begin(ctx)
	w3, a3, err := recordPaymentMinorInner(ctx, tx4, projectID, 9999999999, "Too big", `App\Models\ProjectPaymentTermin`, 99009992, regID, ownerID, "user", true)
	tx4.Rollback(ctx)
	if err != nil || w3 {
		t.Fatalf("insufficient = %v %v %v", w3, a3, err)
	}
	// frozen: open dispute blocks with checkFreeze
	if _, err := pool.Exec(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES ($1,$2,'other','Half2 freeze','desc','open')`, projectID, ownerID); err != nil {
		t.Fatalf("seed dispute: %v", err)
	}
	tx5, _ := pool.Begin(ctx)
	_, _, err = recordPaymentMinorInner(ctx, tx5, projectID, 1000, "Frozen attempt", `App\Models\ProjectPaymentTermin`, 99009993, regID, ownerID, "user", true)
	tx5.Rollback(ctx)
	if err == nil {
		t.Fatalf("frozen should err")
	}
	if _, ok := asFrozen(err); !ok {
		t.Fatalf("asFrozen: %v", err)
	}
	// arbitration variant skips freeze -> proceeds (dedupe or write)
	tx6, _ := pool.Begin(ctx)
	_, _, err = recordPaymentMinorArbitration(ctx, tx6, projectID, 1000, "Arb attempt", `App\Models\ProjectPaymentTermin`, 99009994, regID, ownerID, "user")
	tx6.Rollback(ctx)
	if err != nil {
		t.Fatalf("arbitration should skip freeze: %v", err)
	}
	// wrapper recordPaymentMinor also frozen
	tx7, _ := pool.Begin(ctx)
	_, _, err = recordPaymentMinor(ctx, tx7, projectID, 1000, "Wrap frozen", `App\Models\ProjectPaymentTermin`, 99009995, regID, ownerID, "user")
	tx7.Rollback(ctx)
	if err == nil {
		t.Fatalf("wrapper frozen should err")
	}
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, projectID)
	// transitionBidProjectStatus branches
	tx8, _ := pool.Begin(ctx)
	if err := transitionBidProjectStatus(ctx, tx8, projectID, "arsitek_bid"); err != nil {
		tx8.Rollback(ctx)
		t.Fatalf("arsitek accept: %v", err)
	}
	tx8.Rollback(ctx)
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id=$1`, projectID).Scan(&st)
	if st != "open" {
		t.Fatalf("rollback should keep open, got %s", st)
	}
	tx9, _ := pool.Begin(ctx)
	_, _ = tx9.Exec(ctx, `UPDATE projects SET status='accepted_arsitek' WHERE id=$1`, projectID)
	if err := transitionBidProjectStatus(ctx, tx9, projectID, "kontraktor_bid"); err != nil {
		tx9.Rollback(ctx)
		t.Fatalf("kontraktor accept: %v", err)
	}
	tx9.Rollback(ctx)
	tx10, _ := pool.Begin(ctx)
	if err := transitionBidProjectStatus(ctx, tx10, 99009999, "arsitek_bid"); err == nil {
		tx10.Rollback(ctx)
		t.Fatalf("missing project should err")
	} else {
		tx10.Rollback(ctx)
	}
	// checkAndActivateBid no-op (no awaiting bids)
	tx11, _ := pool.Begin(ctx)
	checkAndActivateBid(ctx, tx11, projectID, "Half2 Release Project", "arsitek")
	checkAndActivateBid(ctx, tx11, projectID, "Half2 Release Project", "bogus-role")
	tx11.Rollback(ctx)
	// notifyPaymentVerified writes notifications + outbox
	notifyPaymentVerified(ctx, pool, projectID, "Half2 Release Project", ownerID, ownerID, "arsitek_bid", 99009991, "Termin 1", 100000)
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='payment_verified'`, ownerID).Scan(&n); err != nil || n == 0 {
		t.Fatalf("payment_verified notifications = %d %v", n, err)
	}
}

func TestHalfRequestIDCaps(t *testing.T) {
	// limiter keys: authenticated callers key on user id, anonymous on IP.
	r1 := httptest.NewRequest(http.MethodGet, "/api/arsitek", nil)
	r1.RemoteAddr = "10.1.1.1:1234"
	r2 := httptest.NewRequest(http.MethodGet, "/api/arsitek", nil)
	r2.RemoteAddr = "10.2.2.2:1234"
	if limiterKey(r1) == limiterKey(r2) {
		t.Fatalf("limiter keys should differ per IP")
	}
	if !strings.HasPrefix(limiterKey(r1), "ip:") {
		t.Fatalf("anon limiter key = %q", limiterKey(r1))
	}
	rAuth := httptest.NewRequest(http.MethodGet, "/api/arsitek", nil)
	rAuth = rAuth.WithContext(withCaller(rAuth.Context(), roadmapCaller{id: 424242, role: "user"}))
	if limiterKey(rAuth) != "user:424242" {
		t.Fatalf("authed limiter key = %q", limiterKey(rAuth))
	}
	if clientIP(r1) != "10.1.1.1" {
		t.Fatalf("clientIP = %s", clientIP(r1))
	}
	_ = http.StatusOK
}
