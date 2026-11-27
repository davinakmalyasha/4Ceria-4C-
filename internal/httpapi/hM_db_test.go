package httpapi

// hM DB branches: tiny fixtures on the real seeded DB only.
// Fresh IDs from 1040001, hM labels, DELETE what we create, zero leftovers.
// All expectations are hand-written literals. Skip-gated when DATABASE_URL
// is absent, matching the established idiom.

import (
	"context"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

var hMSeq int64 = 1040000

func hMNextID() int64 { return atomic.AddInt64(&hMSeq, 1) }

func hMMkUser(t *testing.T, ctx context.Context, pool *pgxpool.Pool, tag string) int64 {
	t.Helper()
	id := hMNextID()
	email := strings.ToLower("hm-" + tag + "-" + itoaTest(id) + "@example.test")
	uname := strings.ToLower("hm-" + tag + "-" + itoaTest(id))
	code := "hM" + itoaTest(id%100000 + 10000)[1:]
	var got int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (id, name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ($1,$2,$3,$4,'x',$5,$6,NOW(),NOW()) RETURNING id`,
		id, "hM "+tag, uname, email, "user", code).Scan(&got); err != nil {
		t.Fatalf("hM seed user %s: %v", tag, err)
	}
	return got
}

func hMMkProject(t *testing.T, ctx context.Context, pool *pgxpool.Pool, ownerID int64, title string) int64 {
	t.Helper()
	id := hMNextID()
	var pid int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (id, user_id, title, status, budget) VALUES ($1,$2,$3,'open',10000000) RETURNING id`, id, ownerID, title).Scan(&pid); err != nil {
		t.Fatalf("hM seed project: %v", err)
	}
	return pid
}

func hMAssertNoLeftovers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id >= 1040001`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hM users: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE id >= 1040001`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hM projects: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE title LIKE 'hM%'`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hM titled projects: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM bids WHERE project_id >= 1040001`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hM bids: %d", n)
	}
}

func TestHMScheduleReportCounts(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	owner := hMMkUser(t, ctx, pool, "sched")
	pid := hMMkProject(t, ctx, pool, owner, "hM Schedule Project")
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM project_reports WHERE project_id=$1`, pid)
		_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
		hMAssertNoLeftovers(t, pool)
	})

	// Empty project: no rows, no error.
	empty, err := scheduleReportCounts(ctx, pool, pid)
	if err != nil {
		t.Fatalf("empty: %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("empty = %v, want {}", empty)
	}

	// Two hM-design, one hM-build, one NULL slug (must not appear).
	for _, slug := range []any{"hM-design", "hM-design", "hM-build", nil} {
		if _, err := pool.Exec(ctx, `INSERT INTO project_reports (project_id, created_by, phase_slug, summary, progress_percentage) VALUES ($1,$2,$3,'hM report',10)`, pid, owner, slug); err != nil {
			t.Fatalf("insert report: %v", err)
		}
	}
	got, err := scheduleReportCounts(ctx, pool, pid)
	if err != nil {
		t.Fatalf("counts: %v", err)
	}
	if got["hM-design"] != 2 {
		t.Fatalf("hM-design = %d, want 2 (%v)", got["hM-design"], got)
	}
	if got["hM-build"] != 1 {
		t.Fatalf("hM-build = %d, want 1 (%v)", got["hM-build"], got)
	}
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2 (%v)", len(got), got)
	}

	// Closed pool: query error arm.
	dsn := os.Getenv("DATABASE_URL")
	bad, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("second pool: %v", err)
	}
	bad.Close()
	if _, err := scheduleReportCounts(ctx, bad, pid); err == nil {
		t.Fatal("closed pool must error")
	}
}

func TestHMResolvePaymentTargetExotic(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	owner := hMMkUser(t, ctx, pool, "paytgt")
	pid := hMMkProject(t, ctx, pool, owner, "hM Payment Target")
	var profileID int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hM Arsitek Nama','verified') RETURNING id`, owner).Scan(&profileID); err != nil {
		t.Fatalf("profile: %v", err)
	}
	var terminID, addendumID, bidID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, role_type, label, percentage, amount, retention_amount, net_amount, status) VALUES ($1,'kontraktor','hM termin',100,100000,0,100000,'pending') RETURNING id`, pid).Scan(&terminID); err != nil {
		t.Fatalf("termin: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status) VALUES ($1,'arsitek',$2,'hM addendum',50000,'pending_approval') RETURNING id`, pid, owner).Scan(&addendumID); err != nil {
		t.Fatalf("addendum: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, status, payment_status) VALUES ($1,'arsitek',$2,$3,$3,80000,80000,'pending','unpaid') RETURNING id`, pid, owner, profileID).Scan(&bidID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
		_, _ = pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, pid)
		_, _ = pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id=$1`, pid)
		_, _ = pool.Exec(ctx, `DELETE FROM project_reports WHERE project_id=$1`, pid)
		_, _ = pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, profileID)
		_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
		hMAssertNoLeftovers(t, pool)
	})

	bySpelling, _, err := registryIDs(ctx, pool)
	if err != nil {
		t.Fatalf("registry: %v", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)

	// Unknown short: literal message pin.
	if _, err := resolvePaymentTarget(ctx, tx, bySpelling, "hM-bogus", 7, pid); err == nil {
		t.Fatal("bogus short must fail")
	} else if err.Error() != "payment not found: hM-bogus #7" {
		t.Fatalf("bogus err = %q", err.Error())
	}
	// Known short with no registry entry: empty map.
	if _, err := resolvePaymentTarget(ctx, tx, map[string]int64{}, "termin", 7, pid); err == nil {
		t.Fatal("missing registry must fail")
	} else if err.Error() != "payment not found: termin #7" {
		t.Fatalf("registry err = %q", err.Error())
	}
	// Missing rows for every family.
	for _, tc := range []struct {
		short string
		id    int64
	}{
		{"termin", 1099999}, {"addendum", 1099999}, {"material", 1099999}, {"arsitek_bid", 1099999},
	} {
		if _, err := resolvePaymentTarget(ctx, tx, bySpelling, tc.short, tc.id, pid); err == nil {
			t.Fatalf("%s missing must fail", tc.short)
		} else if !strings.Contains(err.Error(), "payment not found: "+tc.short+" #1099999") {
			t.Fatalf("%s err = %q", tc.short, err.Error())
		}
	}

	// Happy termin.
	tgt, err := resolvePaymentTarget(ctx, tx, bySpelling, "termin", terminID, pid)
	if err != nil {
		t.Fatalf("termin happy: %v", err)
	}
	if tgt.Short != "termin" || tgt.Table != "project_payment_termins" || tgt.Label != "hM termin" {
		t.Fatalf("termin tgt = %+v", tgt)
	}
	if tgt.Title != "Payment: hM termin (kontraktor)" {
		t.Fatalf("termin title = %q", tgt.Title)
	}
	if tgt.GrossMinor != 10000000 || tgt.NetMinor != 10000000 {
		t.Fatalf("termin money = %d %d", tgt.GrossMinor, tgt.NetMinor)
	}
	if tgt.TouchPaidAt {
		t.Fatal("termin TouchPaidAt must be false (paid_at NULL)")
	}

	// Happy addendum.
	tgt, err = resolvePaymentTarget(ctx, tx, bySpelling, "addendum", addendumID, pid)
	if err != nil {
		t.Fatalf("addendum happy: %v", err)
	}
	if tgt.Table != "project_addendums" || tgt.Label != "hM addendum" || tgt.Title != "Payment: hM addendum" {
		t.Fatalf("addendum tgt = %+v", tgt)
	}
	if tgt.GrossMinor != 5000000 || tgt.NetMinor != 5000000 {
		t.Fatalf("addendum money = %d %d", tgt.GrossMinor, tgt.NetMinor)
	}

	// Happy bid via previous-id path with profile nama label.
	tgt, err = resolvePaymentTarget(ctx, tx, bySpelling, "arsitek_bid", bidID, pid)
	if err != nil {
		t.Fatalf("bid happy: %v", err)
	}
	if tgt.Table != "bids" || tgt.MirrorStatusColumn != "payment_status" {
		t.Fatalf("bid tgt = %+v", tgt)
	}
	if tgt.Label != "hM Arsitek Nama" {
		t.Fatalf("bid label = %q", tgt.Label)
	}
	if tgt.Title != "Professional Fee: hM Arsitek Nama" {
		t.Fatalf("bid title = %q", tgt.Title)
	}
	if tgt.GrossMinor != 8000000 || tgt.NetMinor != 8000000 {
		t.Fatalf("bid money = %d %d", tgt.GrossMinor, tgt.NetMinor)
	}
	if !tgt.TouchPaidAt {
		t.Fatal("bid TouchPaidAt must be true (unconditional stamp)")
	}
	if err := tx.Rollback(ctx); err != nil {
		_ = err
	}
}

func TestHMBidderDisplayName(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	owner := hMMkUser(t, ctx, pool, "disp")
	var profileID int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hM Arsitek Nama','verified') RETURNING id`, owner).Scan(&profileID); err != nil {
		t.Fatalf("profile: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, profileID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
		hMAssertNoLeftovers(t, pool)
	})

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)

	if got := bidderDisplayName(ctx, tx, "hM-bogus", 1, owner); got != "" {
		t.Fatalf("bogus short = %q, want empty", got)
	}
	if got := bidderDisplayName(ctx, tx, "arsitek_bid", profileID, owner); got != "hM Arsitek Nama" {
		t.Fatalf("nama = %q, want hM Arsitek Nama", got)
	}
	// Missing profile falls back to the user name "hM disp".
	if got := bidderDisplayName(ctx, tx, "arsitek_bid", 1099999, owner); !strings.HasPrefix(got, "hM ") {
		t.Fatalf("user fallback = %q, want hM prefix", got)
	}
	if got := bidderDisplayName(ctx, tx, "arsitek_bid", 1099999, 1099999); got != "" {
		t.Fatalf("both missing = %q, want empty", got)
	}
	_ = tx.Rollback(ctx)
}
