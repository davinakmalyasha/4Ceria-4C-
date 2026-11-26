package httpapi

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// hD owns: bid write/decision/sign(client/shared/action/relation/snapshot),
// budget write/addendum/markpaid, fee write, payment verify/proof.
// Fresh IDs: users 940001-940099, projects 941001-941099, titles prefix "hD".

func hDPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

// hDCleanup deletes every hD fixture row. Call deferred right after seeding.
func hDCleanup(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	_, _ = pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id >= 941001 AND project_id < 942000`)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id >= 941001 AND id < 942000`)
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id >= 940001 AND id < 941000`)
}

// hDAssertNoLeftovers fails when any hD fixture row or vault file remains.
func hDAssertNoLeftovers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id >= 940001 AND id < 941000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hD users: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE id >= 941001 AND id < 942000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hD projects: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM bids WHERE project_id >= 941001 AND project_id < 942000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hD bids: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE title LIKE 'hD%'`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hD titled projects: %d", n)
	}
}

// hDCleanupVault removes contract/receipt/addendum vault files for hD projects.
func hDCleanupVault(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	rows, err := pool.Query(ctx, `SELECT DISTINCT project_id FROM project_payment_termins WHERE project_id >= 941001 AND project_id < 942000`)
	if err == nil {
		var ids []int64
		for rows.Next() {
			var id int64
			_ = rows.Scan(&id)
			ids = append(ids, id)
		}
		rows.Close()
		for _, id := range ids {
			_ = os.RemoveAll(filepath.Join("storage", "app", "public", "contracts", "project_"+itoaTest(id)))
		}
	}
	// receipt files (random names): resolve via DB before cascade.
	prows, _ := pool.Query(ctx, `SELECT payment_proof_path FROM project_payment_termins WHERE project_id >= 941001 AND project_id < 942000`)
	if prows != nil {
		for prows.Next() {
			var p *string
			_ = prows.Scan(&p)
			if p != nil && *p != "" {
				if full, err := safeStorageJoin(vaultBaseDir(), *p); err == nil {
					_ = os.Remove(full)
				}
			}
		}
		prows.Close()
	}
	brows, _ := pool.Query(ctx, `SELECT payment_proof_path FROM bids WHERE project_id >= 941001 AND project_id < 942000`)
	if brows != nil {
		for brows.Next() {
			var p *string
			_ = brows.Scan(&p)
			if p != nil && *p != "" {
				if full, err := safeStorageJoin(vaultBaseDir(), *p); err == nil {
					_ = os.Remove(full)
				}
			}
		}
		brows.Close()
	}
	mrows, _ := pool.Query(ctx, `SELECT payment_proof_path FROM material_orders WHERE project_id >= 941001 AND project_id < 942000`)
	if mrows != nil {
		for mrows.Next() {
			var p *string
			_ = mrows.Scan(&p)
			if p != nil && *p != "" {
				if full, err := safeStorageJoin(vaultBaseDir(), *p); err == nil {
					_ = os.Remove(full)
				}
			}
		}
		mrows.Close()
	}
	arows, _ := pool.Query(ctx, `SELECT attachment_path, payment_proof_path FROM project_addendums WHERE project_id >= 941001 AND project_id < 942000`)
	if arows != nil {
		for arows.Next() {
			var a, p *string
			_ = arows.Scan(&a, &p)
			for _, rel := range []*string{a, p} {
				if rel != nil && *rel != "" {
					if full, err := safeStorageJoin(vaultBaseDir(), *rel); err == nil {
						_ = os.Remove(full)
					}
				}
			}
		}
		arows.Close()
	}
}

func TestHDProposeFee(t *testing.T) {
	pool := hDPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 940001, "user", "hd-fee-owner@example.test", "hD Fee Owner")
	arsUser := hAMkUser(t, pool, 940002, "arsitek", "hd-fee-ars@example.test", "hD Fee Ars")
	notUser := hAMkUser(t, pool, 940003, "notaris", "hd-fee-not@example.test", "hD Fee Not")
	pmUser := hAMkUser(t, pool, 940004, "project_manager", "hd-fee-pm@example.test", "hD Fee PM")
	kontUser := hAMkUser(t, pool, 940006, "kontraktor", "hd-fee-kontra@example.test", "hD Fee Kontra")
	stranger := hAMkUser(t, pool, 940005, "user", "hd-fee-stranger@example.test", "hD Stranger")
	t.Cleanup(func() {
		hDCleanupVault(t, pool)
		hDCleanup(t, pool)
	})

	hAMkProject(t, pool, 941001, owner.id, "hD fee project", "open", "both", 800000000)

	// shortlisted arsitek bid, last offer by the pro: owner may counter.
	var arsBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (941001,'arsitek',$1,$2,$2,'50000000','50000000','hD ars prop','shortlisted','fixed',$1,0) RETURNING id`,
		arsUser.id, arsUser.id+100000).Scan(&arsBid); err != nil {
		t.Fatal(err)
	}

	// --- guards ---
	rec := hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee", `{"bid_id":1,"bid_type":"arsitek"}`, nil, "941001")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("propose unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, ProposeFeeHandler(pool), http.MethodPost, "/api/x/abc", `{"bid_id":1,"bid_type":"arsitek"}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("propose bad-project = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\Project] abc" {
		t.Fatalf("propose bad-project message = %q", got)
	}
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/999999999/propose-fee", `{"bid_id":1,"bid_type":"arsitek"}`, &owner, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("propose missing project = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\Project] 999999999" {
		t.Fatalf("propose missing project message = %q", got)
	}
	// validation: empty body
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee", `{}`, &owner, "941001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("propose invalid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got == "" {
		t.Fatalf("propose invalid has no message")
	}
	// missing bid
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee",
		`{"bid_id":999999999,"bid_type":"arsitek","price":1000000,"proposed_termins":[{"percentage":100,"trigger_description":"hD all"}]}`, &owner, "941001")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("propose missing bid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Bid not found." {
		t.Fatalf("propose missing bid message = %q", got)
	}
	// forbidden: stranger is neither owner nor bidder
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee",
		`{"bid_id":`+itoaTest(arsBid)+`,"bid_type":"arsitek","price":60000000,"proposed_termins":[{"percentage":50,"trigger_description":"hD DP"},{"percentage":50,"trigger_description":"hD final"}]}`, &stranger, "941001")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("propose forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. You do not have permission to counter this bid." {
		t.Fatalf("propose forbidden message = %q", got)
	}
	// phase guard: pending bid cannot be countered
	var pendBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (941001,'kontraktor',$1,$2,$2,'200000000','200000000','hD kontra prop','pending','fixed',$1,0) RETURNING id`,
		kontUser.id, kontUser.id+100000).Scan(&pendBid); err != nil {
		t.Fatal(err)
	}
	_ = pendBid
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee",
		`{"bid_id":`+itoaTest(pendBid)+`,"bid_type":"kontraktor","price":190000000,"proposed_termins":[{"percentage":100,"trigger_description":"hD all"}]}`, &owner, "941001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("propose phase = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Proposals can only be made during the shortlisting/negotiation phase." {
		t.Fatalf("propose phase message = %q", got)
	}
	// termins must total exactly 100
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee",
		`{"bid_id":`+itoaTest(arsBid)+`,"bid_type":"arsitek","price":60000000,"proposed_termins":[{"percentage":40,"trigger_description":"hD DP"},{"percentage":50,"trigger_description":"hD final"}]}`, &owner, "941001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("propose pct = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The total percentage of payment termins must equal exactly 100%." {
		t.Fatalf("propose pct message = %q", got)
	}

	// --- happy: owner counters the arsitek bid ---
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee",
		`{"bid_id":`+itoaTest(arsBid)+`,"bid_type":"arsitek","price":60000000,"proposed_termins":[{"percentage":50,"trigger_description":"hD DP"},{"percentage":50,"trigger_description":"hD final"}]}`, &owner, "941001")
	if rec.Code != http.StatusOK {
		t.Fatalf("propose ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Fee and phases proposed successfully" {
		t.Fatalf("propose ok message = %q", got)
	}
	var propPrice, propTotal, propStatus string
	var propOffered, propCount int64
	_ = pool.QueryRow(ctx, `SELECT price::text, calculated_total::text, status::text, offered_by_id, negotiation_count FROM bids WHERE id=$1`, arsBid).Scan(&propPrice, &propTotal, &propStatus, &propOffered, &propCount)
	if propPrice != "60000000.00" || propTotal != "60000000.00" || propStatus != "negotiating" || propOffered != owner.id || propCount != 1 {
		t.Fatalf("propose row = %q/%q/%q/%d/%d, want 60000000.00/60000000.00/negotiating/%d/1", propPrice, propTotal, propStatus, propOffered, propCount, owner.id)
	}
	var logCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM bid_negotiation_logs WHERE bid_id=$1 AND round_number=1`, arsBid).Scan(&logCount)
	if logCount != 1 {
		t.Fatalf("propose log rows = %d, want 1", logCount)
	}

	// --- happy twin: the bidder counters back (isBidOwner branch) ---
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee",
		`{"bid_id":`+itoaTest(arsBid)+`,"bid_type":"arsitek","price":58000000,"note":"hD meet halfway","proposed_termins":[{"percentage":50,"trigger_description":"hD DP"},{"percentage":50,"trigger_description":"hD final"}]}`, &arsUser, "941001")
	if rec.Code != http.StatusOK {
		t.Fatalf("propose bidder ok = %d %s", rec.Code, rec.Body.String())
	}
	var propPrice2, propStatus2 string
	var propOffered2, propCount2 int64
	_ = pool.QueryRow(ctx, `SELECT price::text, status::text, offered_by_id, negotiation_count FROM bids WHERE id=$1`, arsBid).Scan(&propPrice2, &propStatus2, &propOffered2, &propCount2)
	if propPrice2 != "58000000.00" || propStatus2 != "negotiating" || propOffered2 != arsUser.id || propCount2 != 2 {
		t.Fatalf("propose bidder row = %q/%q/%d/%d, want 58000000.00/negotiating/%d/2", propPrice2, propStatus2, propOffered2, propCount2, arsUser.id)
	}

	// --- zero-total twin: notaris price 0 with no services ---
	var notBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, notaris_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (941001,'notaris',$1,$2,$2,'1000000','1000000','hD not prop','shortlisted','fixed',$1,0) RETURNING id`,
		notUser.id, notUser.id+100000).Scan(&notBid); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee",
		`{"bid_id":`+itoaTest(notBid)+`,"bid_type":"notaris","price":0,"proposed_termins":[{"percentage":100,"trigger_description":"hD all"}]}`, &owner, "941001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("propose zero = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Proposed fee must be greater than zero." {
		t.Fatalf("propose zero message = %q", got)
	}

	// --- PM fee_type guard twin ---
	var pmBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, pm_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (941001,'project_manager',$1,$2,$2,'25000000','25000000','hD pm prop','shortlisted','fixed',$1,0) RETURNING id`,
		pmUser.id, pmUser.id+100000).Scan(&pmBid); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941001/propose-fee",
		`{"bid_id":`+itoaTest(pmBid)+`,"bid_type":"project_manager","price":25000000,"fee_type":"hourly","proposed_termins":[{"percentage":100,"trigger_description":"hD all"}]}`, &owner, "941001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("propose pm fee = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Invalid fee structure for Project Managers. Project Managers are only permitted to use Fixed Fee or Percentage structures." {
		t.Fatalf("propose pm fee message = %q", got)
	}

	// --- pure helpers: every feeCalculation branch with hand literals ---
	fixed := feeCalculation("fixed", 60000000, 0, 0, 800000000, map[string]any{})
	if fixed["calculated_total"] != 60000000.0 {
		t.Fatalf("fee fixed = %v, want 60000000", fixed["calculated_total"])
	}
	pct := feeCalculation("percentage", 10, 0, 0, 800000000, map[string]any{})
	if pct["calculated_total"] != 80000000.0 {
		t.Fatalf("fee pct = %v, want 80000000", pct["calculated_total"])
	}
	unit := feeCalculation("unit", 0, 5000, 200, 800000000, map[string]any{})
	if unit["calculated_total"] != 1000000.0 {
		t.Fatalf("fee unit = %v, want 1000000", unit["calculated_total"])
	}
	sqm := feeCalculation("sqm", 2000000, 0, 0, 800000000, map[string]any{"building_area": "150"})
	if sqm["calculated_total"] != 300000000.0 || sqm["quantity"] != 150.0 || sqm["unit_price"] != 2000000.0 {
		t.Fatalf("fee sqm = %v", sqm)
	}
	hourly := feeCalculation("hourly", 750000, 0, 0, 800000000, map[string]any{})
	if hourly["calculated_total"] != 750000.0 {
		t.Fatalf("fee hourly = %v, want 750000", hourly["calculated_total"])
	}
	zero := feeCalculation("fixed", 0, 0, 0, 800000000, map[string]any{})
	if zero["calculated_total"] != 0.0 {
		t.Fatalf("fee zero = %v, want 0", zero["calculated_total"])
	}
	if got := jsonScalarText("hD"); got != "hD" {
		t.Fatalf("jsonScalarText string = %q", got)
	}
	if got := jsonScalarText(float64(12.5)); got != "12.5" {
		t.Fatalf("jsonScalarText float = %q", got)
	}
	if got := jsonScalarText(nil); got != "" {
		t.Fatalf("jsonScalarText nil = %q", got)
	}
	if numberFormat("1500000") != "1.500.000" {
		t.Fatalf("numberFormat = %q, want 1.500.000", numberFormat("1500000"))
	}
	if formatFloatPHP(60000000) != "60000000" {
		t.Fatalf("formatFloatPHP = %q", formatFloatPHP(60000000))
	}
	if !bidLegacyHasColumn("arsitek", "proposed_team") || bidLegacyHasColumn("notaris", "proposed_team") {
		t.Fatalf("bidLegacyHasColumn team wrong")
	}
	if !bidLegacyHasColumn("notaris", "selected_services") || bidLegacyHasColumn("arsitek", "selected_services") {
		t.Fatalf("bidLegacyHasColumn services wrong")
	}
	if roleKey("project_manager") != "project_manager" || roleKey("arsitek") != "arsitek" {
		t.Fatalf("roleKey wrong")
	}

	hDCleanupVault(t, pool)
	hDCleanup(t, pool)
	hDAssertNoLeftovers(t, pool)
}
