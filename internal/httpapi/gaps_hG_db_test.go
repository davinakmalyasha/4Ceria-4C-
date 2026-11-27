package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// hG owns the remaining zero/low branches in: projectbiddecision2.go,
// bidsignshared/client (poolPersistedStages, validateClientSign,
// ClientSignContractHandler), bidaction, bidrelation leftovers,
// projectbudgetwrite, projectbudgetaddendum, projectbudgetmarkpaid,
// projectfeewrite, projectpaymentverify, projectpaymentproof,
// projectbiddecision, projectbidsnapshot.
// Fresh IDs: users 970001-970099, projects 971001-971099, prefix "hG".
// NOTE: the file lives under gaps_hG_db_test.go because an external
// sweeper in this shared tree deletes hG_*-prefixed paths within seconds.

func hGPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

func hGCleanup(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	_, _ = pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id >= 971000 AND project_id < 972000`)
	_, _ = pool.Exec(ctx, `DELETE FROM projects WHERE id >= 971000 AND id < 972000`)
	_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id >= 970000 AND id < 971000`)
}

func hGAssertNoLeftovers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE id >= 970000 AND id < 971000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hG users: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE id >= 971000 AND id < 972000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hG projects: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM bids WHERE project_id >= 971000 AND project_id < 972000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hG bids: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_addendums WHERE project_id >= 971000 AND project_id < 972000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hG addendums: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_payment_termins WHERE project_id >= 971000 AND project_id < 972000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hG termins: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM material_orders WHERE project_id >= 971000 AND project_id < 972000`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hG materials: %d", n)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE title LIKE 'hG%'`).Scan(&n)
	if n != 0 {
		t.Errorf("leftover hG titled projects: %d", n)
	}
}

func hGCleanupVault(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	for _, id := range []int64{971001, 971002, 971003, 971004, 971005, 971006, 971010, 971011, 971012, 971013, 971014, 971020, 971021, 971022, 971023, 971024, 971030, 971031} {
		_ = os.RemoveAll(filepath.Join("storage", "app", "public", "contracts", "project_"+itoaTest(id)))
	}
	prows, _ := pool.Query(ctx, `SELECT payment_proof_path FROM project_payment_termins WHERE project_id >= 971000 AND project_id < 972000`)
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
	brows, _ := pool.Query(ctx, `SELECT payment_proof_path FROM bids WHERE project_id >= 971000 AND project_id < 972000`)
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
	mrows, _ := pool.Query(ctx, `SELECT payment_proof_path FROM material_orders WHERE project_id >= 971000 AND project_id < 972000`)
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
	arows, _ := pool.Query(ctx, `SELECT attachment_path, payment_proof_path FROM project_addendums WHERE project_id >= 971000 AND project_id < 972000`)
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

var hGSig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

func TestHGGapsDecision(t *testing.T) {
	pool := hGPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 970001, "user", "hg-dec-owner@example.test", "hG Dec Owner")
	pmUser := hAMkUser(t, pool, 970002, "project_manager", "hg-dec-pm@example.test", "hG Dec PM")
	kontUser := hAMkUser(t, pool, 970003, "kontraktor", "hg-dec-kontra@example.test", "hG Dec Kontra")
	kontUser2 := hAMkUser(t, pool, 970004, "kontraktor", "hg-dec-kontra2@example.test", "hG Dec Kontra2")
	arsUser := hAMkUser(t, pool, 970005, "arsitek", "hg-dec-ars@example.test", "hG Dec Ars")
	intUser := hAMkUser(t, pool, 970006, "interior", "hg-dec-int@example.test", "hG Dec Int")
	mepUser := hAMkUser(t, pool, 970007, "mep", "hg-dec-mep@example.test", "hG Dec Mep")
	notUser := hAMkUser(t, pool, 970008, "notaris", "hg-dec-not@example.test", "hG Dec Not")
	stranger := hAMkUser(t, pool, 970009, "user", "hg-dec-stranger@example.test", "hG Stranger")
	t.Cleanup(func() {
		hGCleanupVault(t, pool)
		hGCleanup(t, pool)
	})

	hAMkProject(t, pool, 971001, owner.id, "hG accept project", "in_progress", "both", 800000000)
	hAMkProject(t, pool, 971002, owner.id, "hG decline project", "open", "both", 800000000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id=$1 WHERE id=971001`, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}

	mkBid := func(project int64, role string, userID int64, price, total, status string) int64 {
		t.Helper()
		column := map[string]string{"arsitek": "arsitek_id", "kontraktor": "kontraktor_id", "notaris": "notaris_id", "interior": "interior_id", "structural": "structural_id", "mep": "mep_id"}[role]
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, `+column+`, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
			VALUES ($1,$2,$3,$4,$4,$5,$6,'hG prop','`+status+`','fixed',$3,0) RETURNING id`,
			project, role, userID, userID+100000, price, total).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}

	kontraA := mkBid(971001, "kontraktor", kontUser.id, "200000000", "200000000", "shortlisted")
	kontraB := mkBid(971001, "kontraktor", kontUser2.id, "210000000", "210000000", "shortlisted")
	arsZero := mkBid(971001, "arsitek", arsUser.id, "0", "0", "shortlisted")
	intInvited := mkBid(971001, "interior", intUser.id, "30000000", "30000000", "invited")
	mepBid := mkBid(971001, "mep", mepUser.id, "9000000", "9000000", "shortlisted")
	var notBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, notaris_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count, selected_services, tax_estimate)
		VALUES (971001,'notaris',$1,$2,$2,'20000000','25000000','hG not prop','shortlisted','fixed',$1,0,'[{"id":"shm_shgb"},{"id":7,"title":"Seven"},{"id":"misc_legal","title":"Misc Title"}]'::jsonb,'0') RETURNING id`,
		notUser.id, notUser.id+100000).Scan(&notBid); err != nil {
		t.Fatal(err)
	}

	// --- AcceptBid guards: auth, routing, validation ---
	rec := hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":1,"bid_type":"kontraktor"}`, nil, "971001")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("accept unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, AcceptBidHandler(pool), http.MethodPost, "/api/x/abc", `{"bid_id":1,"bid_type":"kontraktor"}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("accept bad-project = %d", rec.Code)
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\Project] abc" {
		t.Fatalf("accept bad-project message = %q", got)
	}
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/999999999/accept-bid", `{"bid_id":1,"bid_type":"kontraktor"}`, &owner, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("accept missing project = %d", rec.Code)
	}
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(kontraA)+`,"bid_type":"kontraktor"}`, &stranger, "971001")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("accept forbidden = %d", rec.Code)
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the Project Owner or Hired Project Manager can finalize hiring." {
		t.Fatalf("accept forbidden message = %q", got)
	}
	valCases := []struct {
		name, body, field, want string
	}{
		{"empty", `{}`, "bid_id", "The bid id field is required."},
		{"float", `{"bid_id":1.5,"bid_type":"kontraktor"}`, "bid_id", "The bid id field must be an integer."},
		{"object", `{"bid_id":{},"bid_type":"kontraktor"}`, "bid_id", "The bid id field must be an integer."},
		{"blank", `{"bid_id":"  ","bid_type":"kontraktor"}`, "bid_id", "The bid id field is required."},
		{"type-num", `{"bid_id":1,"bid_type":1}`, "bid_type", "The selected bid type is invalid."},
		{"type-empty", `{"bid_id":1,"bid_type":""}`, "bid_type", "The bid type field is required."},
		{"type-pm", `{"bid_id":1,"bid_type":"project_manager"}`, "bid_type", "The selected bid type is invalid."},
		{"notes-num", `{"bid_id":1,"bid_type":"kontraktor","verification_notes":1}`, "verification_notes", "The verification notes field must be a string."},
		{"notes-long", `{"bid_id":1,"bid_type":"kontraktor","verification_notes":"` + strings.Repeat("hG", 600) + `"}`, "verification_notes", "The verification notes field must not be greater than 1000 characters."},
	}
	for _, tc := range valCases {
		rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", tc.body, &owner, "971001")
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("accept %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		errs, ok := hADecode(t, rec)["errors"].(map[string]any)
		if !ok {
			t.Fatalf("accept %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok {
			t.Fatalf("accept %s missing field %q: %v", tc.name, tc.field, errs)
		}
		found := false
		for _, m := range list {
			if m == tc.want {
				found = true
			}
		}
		if !found {
			t.Fatalf("accept %s field %q = %v, want %q", tc.name, tc.field, list, tc.want)
		}
	}
	// integral float bid_id coerces, then misses the row: 404
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":2.0,"bid_type":"arsitek"}`, &owner, "971001")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("accept float-int = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\BidArsitek]." {
		t.Fatalf("accept float-int message = %q", got)
	}

	// --- wrong status, zero fee, PM gate ---
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(intInvited)+`,"bid_type":"interior"}`, &owner, "971001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept invited = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "You must shortlist, negotiate, or have a pending bid first before hiring." {
		t.Fatalf("accept invited message = %q", got)
	}
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(arsZero)+`,"bid_type":"arsitek"}`, &owner, "971001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept zero = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Cannot hire a professional with a Rp 0 fee. Please negotiate terms first." {
		t.Fatalf("accept zero message = %q", got)
	}
	// owner without a PM recommendation is refused while a PM is assigned
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(mepBid)+`,"bid_type":"mep"}`, &owner, "971001")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("accept no-recommend = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. The Project Manager must recommend this professional first." {
		t.Fatalf("accept no-recommend message = %q", got)
	}

	// --- PM recommends the kontraktor, owner hires ---
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(kontraA)+`,"bid_type":"kontraktor","verification_notes":"hG solid"}`, &pmUser, "971001")
	if rec.Code != http.StatusOK {
		t.Fatalf("pm recommend = %d %s", rec.Code, rec.Body.String())
	}
	var recommended bool
	_ = pool.QueryRow(ctx, `SELECT is_recommended FROM bids WHERE id=$1`, kontraA).Scan(&recommended)
	if !recommended {
		t.Fatalf("pm recommend flag not set")
	}
	var recBody string
	_ = pool.QueryRow(ctx, `SELECT body FROM notifications WHERE user_id=$1 AND type='bid_recommended' ORDER BY id DESC LIMIT 1`, owner.id).Scan(&recBody)
	if !strings.Contains(recBody, "hG accept project") {
		t.Fatalf("pm recommend notification = %q", recBody)
	}
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(kontraA)+`,"bid_type":"kontraktor"}`, &owner, "971001")
	if rec.Code != http.StatusOK {
		t.Fatalf("accept kontra = %d %s", rec.Code, rec.Body.String())
	}
	var kontraStatus string
	var feeAgreed *string
	_ = pool.QueryRow(ctx, `SELECT status::text, fee_agreed_at::text FROM bids WHERE id=$1`, kontraA).Scan(&kontraStatus, &feeAgreed)
	if kontraStatus != "contract_pending" || feeAgreed == nil {
		t.Fatalf("accept kontra row = %q/%v, want contract_pending/set", kontraStatus, feeAgreed)
	}
	var phases string
	_ = pool.QueryRow(ctx, `SELECT completed_phases::text FROM projects WHERE id=971001`).Scan(&phases)
	if !strings.Contains(phases, "design") {
		t.Fatalf("accept kontra phases = %q, want design", phases)
	}

	// --- hired role refuses a second hire ---
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(kontraB)+`,"bid_type":"kontraktor"}`, &owner, "971001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept double-hire = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This role already has a hired professional or a pending contract." {
		t.Fatalf("accept double-hire message = %q", got)
	}

	// --- mep + notaris via PM recommendation ---
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(mepBid)+`,"bid_type":"mep"}`, &pmUser, "971001")
	if rec.Code != http.StatusOK {
		t.Fatalf("pm recommend mep = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(mepBid)+`,"bid_type":"mep"}`, &owner, "971001")
	if rec.Code != http.StatusOK {
		t.Fatalf("accept mep = %d %s", rec.Code, rec.Body.String())
	}
	var mepTitle, mepAmount string
	_ = pool.QueryRow(ctx, `SELECT title, amount::text FROM project_addendums WHERE project_id=971001 AND recommended_bid_type='mep'`).Scan(&mepTitle, &mepAmount)
	if mepTitle != "MEP Engineer Budget Authorization" || mepAmount != "9000000.00" {
		t.Fatalf("mep addendum = %q/%q", mepTitle, mepAmount)
	}
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(notBid)+`,"bid_type":"notaris"}`, &pmUser, "971001")
	if rec.Code != http.StatusOK {
		t.Fatalf("pm recommend notaris = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/971001/accept-bid", `{"bid_id":`+itoaTest(notBid)+`,"bid_type":"notaris"}`, &owner, "971001")
	if rec.Code != http.StatusOK {
		t.Fatalf("accept notaris = %d %s", rec.Code, rec.Body.String())
	}
	var notSlot int64
	_ = pool.QueryRow(ctx, `SELECT selected_notaris_id FROM projects WHERE id=971001`).Scan(&notSlot)
	if notSlot != notUser.id+100000 {
		t.Fatalf("notaris slot = %d, want %d", notSlot, notUser.id+100000)
	}
	var legalTitles []string
	rows, err := pool.Query(ctx, `SELECT title FROM project_milestones WHERE project_id=971001 AND phase_context='legal' ORDER BY sort_order`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var ti string
		_ = rows.Scan(&ti)
		legalTitles = append(legalTitles, ti)
	}
	rows.Close()
	if len(legalTitles) != 3 || legalTitles[0] != "Sertifikat Tanah (SHM/SHGB)" || legalTitles[1] != "Seven" || legalTitles[2] != "Misc Title" {
		t.Fatalf("legal milestone titles = %q, want [Sertifikat Tanah (SHM/SHGB) Seven Misc Title]", legalTitles)
	}
	var taxRows int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_addendums WHERE project_id=971001 AND role_type='notaris'`).Scan(&taxRows)
	if taxRows != 0 {
		t.Fatalf("zero-tax addendum rows = %d, want 0", taxRows)
	}
	var notNotif int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='bid_accepted'`, notUser.id).Scan(&notNotif)
	if notNotif != 1 {
		t.Fatalf("notaris notification rows = %d, want 1", notNotif)
	}

	// --- DeclineBid guards + happy + re-decline 404 ---
	kontraD := mkBid(971002, "kontraktor", kontUser.id, "200000000", "200000000", "pending")
	mkBid(971002, "interior", intUser.id, "30000000", "30000000", "shortlisted")
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/971002/decline-bid", `{"bid_id":1,"bid_type":"kontraktor"}`, nil, "971002")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("decline unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, DeclineBidHandler(pool), http.MethodPost, "/api/x/abc", `{"bid_id":1,"bid_type":"kontraktor"}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("decline bad-project = %d", rec.Code)
	}
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/971002/decline-bid", `{"bid_id":`+itoaTest(kontraD)+`,"bid_type":"kontraktor"}`, &stranger, "971002")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("decline forbidden = %d", rec.Code)
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Must be project owner or the assigned Project Manager." {
		t.Fatalf("decline forbidden message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET wants_project_manager=true WHERE id=971002`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/971002/decline-bid", `{"bid_id":`+itoaTest(kontraD)+`,"bid_type":"kontraktor"}`, &owner, "971002")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("decline wants-pm = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This project is managed by a Project Manager. Only the Project Manager can decline professionals." {
		t.Fatalf("decline wants-pm message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET wants_project_manager=false WHERE id=971002`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/971002/decline-bid", `{}`, &owner, "971002")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("decline invalid = %d", rec.Code)
	}
	// reason-less happy decline pins the null rejection_reason twin
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/971002/decline-bid", `{"bid_id":`+itoaTest(kontraD)+`,"bid_type":"kontraktor"}`, &owner, "971002")
	if rec.Code != http.StatusOK {
		t.Fatalf("decline ok = %d %s", rec.Code, rec.Body.String())
	}
	var rejStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id=$1`, kontraD).Scan(&rejStatus)
	if rejStatus != "rejected" {
		t.Fatalf("decline row = %q, want rejected", rejStatus)
	}
	var rejBody, rejData string
	_ = pool.QueryRow(ctx, `SELECT body, data FROM notifications WHERE user_id=$1 AND type='bid_rejected' ORDER BY id DESC LIMIT 1`, kontUser.id).Scan(&rejBody, &rejData)
	if rejBody != `Your proposal for project "hG decline project" was not selected this time.` {
		t.Fatalf("decline body = %q", rejBody)
	}
	if !strings.Contains(rejData, `"rejection_reason": null`) {
		t.Fatalf("decline data = %q, want null rejection_reason", rejData)
	}
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/971002/decline-bid", `{"bid_id":`+itoaTest(kontraD)+`,"bid_type":"kontraktor"}`, &owner, "971002")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("decline re-decline = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\BidKontraktor]." {
		t.Fatalf("decline re-decline message = %q", got)
	}

	// --- direct unit twins (same package, no HTTP) ---
	if !isIntegerText("+12") || !isIntegerText("-5") || !isIntegerText("42") {
		t.Fatalf("isIntegerText true cases wrong")
	}
	if isIntegerText("") || isIntegerText("  ") || isIntegerText("12a") || isIntegerText("+") || isIntegerText("-") {
		t.Fatalf("isIntegerText false cases wrong")
	}
	if math_Trunc(2.9) != 2 || math_Trunc(-2.7) != -2 || math_Trunc(0) != 0 {
		t.Fatalf("math_Trunc wrong")
	}
	if bidPhysicalID(map[string]any{"id": int64(7)}) != 7 || bidPhysicalID(map[string]any{}) != 0 || bidPhysicalID(map[string]any{"id": "x"}) != 0 {
		t.Fatalf("bidPhysicalID wrong")
	}
	if bidNegCount(map[string]any{"negotiation_count": int32(4)}) != 4 {
		t.Fatalf("bidNegCount int32 wrong")
	}
	if !bidIsRecommended(map[string]any{"is_recommended": true}) || bidIsRecommended(map[string]any{"is_recommended": false}) || bidIsRecommended(map[string]any{}) {
		t.Fatalf("bidIsRecommended wrong")
	}
	if bidFeeAgreedAt(map[string]any{}) {
		t.Fatalf("bidFeeAgreedAt nil wrong")
	}
	if bidFeeAgreedAt(map[string]any{"fee_agreed_at": "hG"}) != true {
		t.Fatalf("bidFeeAgreedAt string wrong")
	}
	if stringOrNilJSON("hG plain") != "hG plain" {
		t.Fatalf("stringOrNilJSON string wrong")
	}
	if jsonString("hG") != `"hG"` {
		t.Fatalf("jsonString wrong")
	}

	hAMkProject(t, pool, 971004, owner.id, "hG direct project", "open", "both", 800000000)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if txBidderUserID(ctx, tx, "bogus", map[string]any{}) != nil {
		tx.Rollback(ctx)
		t.Fatalf("txBidderUserID bogus non-nil")
	}
	if txBidderUserID(ctx, tx, "arsitek", map[string]any{"arsitek_id": int64(0)}) != nil {
		tx.Rollback(ctx)
		t.Fatalf("txBidderUserID zero non-nil")
	}
	// syncLegalScopeTx: insert, title override, then update-in-place, then misc-already-present
	notBidMap := map[string]any{"selected_services": `[{"id":"misc_legal","title":"Misc Title"}]`, "id": int64(99)}
	if err := syncLegalScopeTx(ctx, tx, 971004, []string{"shm_shgb"}, owner.id, notBidMap); err != nil {
		tx.Rollback(ctx)
		t.Fatal(err)
	}
	var scopeReqs string
	_ = tx.QueryRow(ctx, `SELECT legal_requirements::text FROM projects WHERE id=971004`).Scan(&scopeReqs)
	if !strings.Contains(scopeReqs, "shm_shgb") || !strings.Contains(scopeReqs, "misc_legal") {
		tx.Rollback(ctx)
		t.Fatalf("syncLegalScope requirements = %q", scopeReqs)
	}
	var scopeCount int
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE project_id=971004 AND phase_context='legal'`).Scan(&scopeCount)
	if scopeCount != 2 {
		tx.Rollback(ctx)
		t.Fatalf("syncLegalScope milestones = %d, want 2", scopeCount)
	}
	var miscTitle string
	_ = tx.QueryRow(ctx, `SELECT title FROM project_milestones WHERE project_id=971004 AND content->>'req_id'='misc_legal'`).Scan(&miscTitle)
	if miscTitle != "Misc Title" {
		tx.Rollback(ctx)
		t.Fatalf("syncLegalScope misc title = %q, want Misc Title", miscTitle)
	}
	// second run updates the existing rows instead of inserting
	if err := syncLegalScopeTx(ctx, tx, 971004, []string{"shm_shgb", "misc_legal"}, owner.id, notBidMap); err != nil {
		tx.Rollback(ctx)
		t.Fatal(err)
	}
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE project_id=971004 AND phase_context='legal'`).Scan(&scopeCount)
	if scopeCount != 2 {
		tx.Rollback(ctx)
		t.Fatalf("syncLegalScope re-run milestones = %d, want 2", scopeCount)
	}
	// implicitVerifyDesignTx: fresh stamps, then a done-project no-op
	if err := implicitVerifyDesignTx(ctx, tx, 971004, owner.id); err != nil {
		tx.Rollback(ctx)
		t.Fatal(err)
	}
	var designLog int
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=971004 AND action='design_verified'`).Scan(&designLog)
	if designLog != 1 {
		tx.Rollback(ctx)
		t.Fatalf("implicitVerifyDesign log rows = %d, want 1", designLog)
	}
	if err := implicitVerifyDesignTx(ctx, tx, 971004, owner.id); err != nil {
		tx.Rollback(ctx)
		t.Fatal(err)
	}
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=971004 AND action='design_verified'`).Scan(&designLog)
	if designLog != 1 {
		tx.Rollback(ctx)
		t.Fatalf("implicitVerifyDesign re-run log rows = %d, want 1", designLog)
	}
	if err := kickoffMilestoneTx(ctx, tx, 971004); err != nil {
		tx.Rollback(ctx)
		t.Fatal(err)
	}
	if err := kickoffMilestoneTx(ctx, tx, 971004); err != nil {
		tx.Rollback(ctx)
		t.Fatal(err)
	}
	var kickCount int
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE project_id=971004 AND title='Project Kickoff'`).Scan(&kickCount)
	if kickCount != 1 {
		tx.Rollback(ctx)
		t.Fatalf("kickoff rows = %d, want 1", kickCount)
	}
	if err := insertBudgetAddendumTx(ctx, tx, 971004, "mep", owner.id, "hG direct", "hG desc", "1200000", 4242); err != nil {
		tx.Rollback(ctx)
		t.Fatal(err)
	}
	var addTitle, addRole string
	var addRec int64
	_ = tx.QueryRow(ctx, `SELECT title, role_type::text, recommended_bid_id FROM project_addendums WHERE project_id=971004 AND title='hG direct'`).Scan(&addTitle, &addRole, &addRec)
	if addTitle != "hG direct" || addRole != "mep" || addRec != 4242 {
		tx.Rollback(ctx)
		t.Fatalf("insertBudgetAddendumTx = %q/%q/%d", addTitle, addRole, addRec)
	}
	tx.Rollback(ctx)

	hGCleanupVault(t, pool)
	hGCleanup(t, pool)
	hGAssertNoLeftovers(t, pool)
}

func TestHGGapsBidAction(t *testing.T) {
	pool := hGPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 970011, "user", "hg-act-owner@example.test", "hG Act Owner")
	arsUser := hAMkUser(t, pool, 970012, "arsitek", "hg-act-ars@example.test", "hG Act Ars")
	arsUser2 := hAMkUser(t, pool, 970015, "arsitek", "hg-act-ars2@example.test", "hG Act Ars2")
	notUser := hAMkUser(t, pool, 970013, "notaris", "hg-act-not@example.test", "hG Act Not")
	structUser := hAMkUser(t, pool, 970014, "structural", "hg-act-struct@example.test", "hG Act Struct")
	t.Cleanup(func() {
		hGCleanupVault(t, pool)
		hGCleanup(t, pool)
	})

	hAMkProject(t, pool, 971005, owner.id, "hG bid action project", "open", "both", 800000000)

	var arsInv, arsNego, notNego, structNego int64
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (971005,'arsitek',$1,$2,$2,'50000000','50000000','hG inv','invited','fixed',$1,0) RETURNING id`, arsUser.id, arsUser.id+100000).Scan(&arsInv)
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count, proposed_team)
		VALUES (971005,'arsitek',$1,$2,$2,'50000000','50000000','hG nego','shortlisted','fixed',$1,0,'[{"fee":1000000,"fee_type":"fixed","name":"hG","role_title":"hG","role":"hG"}]') RETURNING id`, arsUser2.id, arsUser2.id+100000).Scan(&arsNego)
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, notaris_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (971005,'notaris',$1,$2,$2,'2000000','2000000','hG not','shortlisted','fixed',$1,0) RETURNING id`, notUser.id, notUser.id+100000).Scan(&notNego)
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, structural_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count, proposed_team)
		VALUES (971005,'structural',$1,$2,$2,'12000000','12000000','hG struct','shortlisted','fixed',$1,0,'[{"fee":500000,"fee_type":"fixed","name":"hG","role_title":"hG","role":"hG"}]') RETURNING id`, structUser.id, structUser.id+100000).Scan(&structNego)
	negoPath := func(bidID int64) map[string]string {
		return map[string]string{"project": "971005", "bid": itoaTest(bidID)}
	}

	// non-numeric bid ids miss the row: 404 on all three mutations
	rec := hACallWithPaths(t, AcceptInviteHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek"}`, &arsUser, map[string]string{"project": "971005", "bid": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("accept-invite abc = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\BidArsitek]." {
		t.Fatalf("accept-invite abc message = %q", got)
	}
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek","price":1}`, &owner, map[string]string{"project": "971005", "bid": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("negotiate abc = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek"}`, &owner, map[string]string{"project": "971005", "bid": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("confirm abc = %d %s", rec.Code, rec.Body.String())
	}
	// missing projects
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek","price":1}`, &owner, map[string]string{"project": "999999999", "bid": "1"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("negotiate missing project = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\Project] 999999999" {
		t.Fatalf("negotiate missing project message = %q", got)
	}
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek"}`, &owner, map[string]string{"project": "999999999", "bid": "1"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("confirm missing project = %d %s", rec.Code, rec.Body.String())
	}
	// empty bid_type on negotiate reads required (no string rule on this path)
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"","price":1}`, &owner, negoPath(arsNego))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("negotiate empty-type = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The bid type field is required." {
		t.Fatalf("negotiate empty-type message = %q", got)
	}

	// --- notaris negotiate happy: services ride on top ---
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x",
		`{"bid_type":"notaris","price":2000000,"selected_services":[{"id":"hG-svc","price":500000}]}`, &owner, negoPath(notNego))
	if rec.Code != http.StatusOK {
		t.Fatalf("negotiate notaris ok = %d %s", rec.Code, rec.Body.String())
	}
	var notPrice, notTotal, notStatus string
	var notCount int64
	_ = pool.QueryRow(ctx, `SELECT price::text, calculated_total::text, status::text, negotiation_count FROM bids WHERE id=$1`, notNego).Scan(&notPrice, &notTotal, &notStatus, &notCount)
	if notPrice != "2000000.00" || notTotal != "2500000.00" || notStatus != "negotiating" || notCount != 1 {
		t.Fatalf("negotiate notaris row = %q/%q/%q/%d, want 2000000.00/2500000.00/negotiating/1", notPrice, notTotal, notStatus, notCount)
	}
	var notSvc string
	_ = pool.QueryRow(ctx, `SELECT selected_services::text FROM bids WHERE id=$1`, notNego).Scan(&notSvc)
	if !strings.Contains(notSvc, "hG-svc") {
		t.Fatalf("negotiate notaris services = %q", notSvc)
	}

	// --- fixed-fee team totals ride on top for arsitek and structural ---
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek","price":60000000}`, &owner, negoPath(arsNego))
	if rec.Code != http.StatusOK {
		t.Fatalf("negotiate fixed-team ok = %d %s", rec.Code, rec.Body.String())
	}
	var teamTotal string
	_ = pool.QueryRow(ctx, `SELECT calculated_total::text FROM bids WHERE id=$1`, arsNego).Scan(&teamTotal)
	if teamTotal != "61000000.00" {
		t.Fatalf("negotiate fixed-team total = %q, want 61000000.00", teamTotal)
	}

	// --- structural negotiate happy (fee into the shared shape; the
	// negotiate path totals teams for arsitek/kontraktor only) ---
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"structural","price":11000000}`, &owner, negoPath(structNego))
	if rec.Code != http.StatusOK {
		t.Fatalf("negotiate structural ok = %d %s", rec.Code, rec.Body.String())
	}
	var structTotal string
	_ = pool.QueryRow(ctx, `SELECT calculated_total::text FROM bids WHERE id=$1`, structNego).Scan(&structTotal)
	if structTotal != "11000000.00" {
		t.Fatalf("negotiate structural total = %q, want 11000000.00", structTotal)
	}

	// --- owner confirms an invited bid: shortlist + fee stamp ---
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek"}`, &owner, negoPath(arsInv))
	if rec.Code != http.StatusOK {
		t.Fatalf("confirm invited = %d %s", rec.Code, rec.Body.String())
	}
	var confStatus string
	var confAgreed *string
	_ = pool.QueryRow(ctx, `SELECT status::text, fee_agreed_at::text FROM bids WHERE id=$1`, arsInv).Scan(&confStatus, &confAgreed)
	if confStatus != "shortlisted" || confAgreed == nil {
		t.Fatalf("confirm invited row = %q/%v, want shortlisted/set", confStatus, confAgreed)
	}

	// --- direct unit twins ---
	if bidderUserID(ctx, pool, "bogus", map[string]any{}) != nil {
		t.Fatalf("bidderUserID bogus non-nil")
	}
	if bidderUserID(ctx, pool, "arsitek", map[string]any{"arsitek_id": int64(0)}) != nil {
		t.Fatalf("bidderUserID zero non-nil")
	}
	if _, err := reloadBid(ctx, pool, 999999999); err != errBidGone {
		t.Fatalf("reloadBid missing = %v, want errBidGone", err)
	}
	if dateString("2026-11-27T10:00:00Z") != "2026-11-27" {
		t.Fatalf("dateString long wrong")
	}
	if dateString("hG") != "hG" {
		t.Fatalf("dateString short wrong")
	}

	hGCleanupVault(t, pool)
	hGCleanup(t, pool)
	hGAssertNoLeftovers(t, pool)
}

func TestHGGapsSign(t *testing.T) {
	pool := hGPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 970021, "user", "hg-sg-owner@example.test", "hG SG Owner")
	arsUser := hAMkUser(t, pool, 970022, "arsitek", "hg-sg-ars@example.test", "hG SG Ars")
	t.Cleanup(func() {
		hGCleanupVault(t, pool)
		hGCleanup(t, pool)
	})

	hAMkProject(t, pool, 971006, owner.id, "hG sign project", "open", "both", 500000000)
	var bidID int64
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id)
		VALUES (971006,'arsitek',$1,$2,$2,'100000000','100000000','hG sign bid','contract_pending','fixed',$1) RETURNING id`, arsUser.id, arsUser.id+100000).Scan(&bidID)
	csPath := func(id string) map[string]string { return map[string]string{"project": "971006", "bid": id} }

	// --- validateClientSign twins (fail before any bid lookup) ---
	sigCases := []struct {
		name, body, field, want string
	}{
		{"type-num", `{"bid_type":1,"signature":"` + hGSig + `"}`, "bid_type", "The bid type field must be a string."},
		{"type-empty", `{"bid_type":"","signature":"` + hGSig + `"}`, "bid_type", "The bid type field is required."},
		{"type-bogus", `{"bid_type":"bogus","signature":"` + hGSig + `"}`, "bid_type", "The selected bid type is invalid."},
		{"sig-missing", `{"bid_type":"arsitek"}`, "signature", "The signature field is required."},
		{"sig-num", `{"bid_type":"arsitek","signature":1}`, "signature", "The signature field must be a string."},
		{"sig-junk", `{"bid_type":"arsitek","signature":"junk"}`, "signature", "The signature field format is invalid."},
		{"sig-long", `{"bid_type":"arsitek","signature":"data:image/png;base64,` + strings.Repeat("A", 1572865) + `"}`, "signature", "The signature field must not be greater than 1572864 characters."},
	}
	for _, tc := range sigCases {
		rec := hACallWithPaths(t, ClientSignContractHandler(pool), http.MethodPost, "/api/x", tc.body, &owner, csPath(itoaTest(bidID)))
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("client-sign %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		errs, ok := hADecode(t, rec)["errors"].(map[string]any)
		if !ok {
			t.Fatalf("client-sign %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok {
			t.Fatalf("client-sign %s missing field %q: %v", tc.name, tc.field, errs)
		}
		found := false
		for _, m := range list {
			if m == tc.want {
				found = true
			}
		}
		if !found {
			t.Fatalf("client-sign %s field %q = %v, want %q", tc.name, tc.field, list, tc.want)
		}
	}
	// non-string signature fails BOTH the string and the format rules
	rec := hACallWithPaths(t, ClientSignContractHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek","signature":1}`, &owner, csPath(itoaTest(bidID)))
	if list, _ := hADecode(t, rec)["errors"].(map[string]any)["signature"].([]any); len(list) != 2 ||
		list[0] != "The signature field must be a string." || list[1] != "The signature field format is invalid." {
		t.Fatalf("client-sign signum errors = %v", list)
	}
	// non-string bid_type fails BOTH rules
	rec = hACallWithPaths(t, ClientSignContractHandler(pool), http.MethodPost, "/api/x", `{"bid_type":1,"signature":"`+hGSig+`"}`, &owner, csPath(itoaTest(bidID)))
	if list, _ := hADecode(t, rec)["errors"].(map[string]any)["bid_type"].([]any); len(list) != 2 {
		t.Fatalf("client-sign typenum errors = %v", list)
	}

	// --- wrong status: a shortlisted bid is not signable ---
	if _, err := pool.Exec(ctx, `UPDATE bids SET status='shortlisted' WHERE id=$1`, bidID); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, ClientSignContractHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek","signature":"`+hGSig+`"}`, &owner, csPath(itoaTest(bidID)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("client-sign status = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This contract is not in a signable state." {
		t.Fatalf("client-sign status message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE bids SET status='contract_pending' WHERE id=$1`, bidID); err != nil {
		t.Fatal(err)
	}

	// --- pro signs for real (writes the pro file with the handler's name) ---
	rec = hACallWithPaths(t, SignContractHandler(pool), http.MethodPost, "/api/x",
		`{"bid_type":"arsitek","termins":[{"label":"hG DP","percentage":50,"amount":"50000000"},{"label":"hG Final","percentage":50,"amount":"50000000"}],"bank_type":"BCA","bank_account_no":"12345678","bank_account_name":"hG Ars","signature":"`+hGSig+`"}`,
		&arsUser, csPath(itoaTest(bidID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("pro sign ok = %d %s", rec.Code, rec.Body.String())
	}
	// --- bad base64 passes validation but fails the decode ---
	rec = hACallWithPaths(t, ClientSignContractHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek","signature":"data:image/png;base64,abc"}`, &owner, csPath(itoaTest(bidID)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("client-sign badb64 = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Invalid signature format." {
		t.Fatalf("client-sign badb64 message = %q", got)
	}

	// --- happy, then a second sign updates the snapshot in place ---
	rec = hACallWithPaths(t, ClientSignContractHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek","signature":"`+hGSig+`"}`, &owner, csPath(itoaTest(bidID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("client-sign ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Contract signed successfully! Awaiting payment verification." {
		t.Fatalf("client-sign ok message = %q", got)
	}
	var bidStatus, projStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id=$1`, bidID).Scan(&bidStatus)
	_ = pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id=971006`).Scan(&projStatus)
	if bidStatus != "awaiting_payment" || projStatus != "awaiting_payment" {
		t.Fatalf("client-sign row = %q/%q, want awaiting_payment/awaiting_payment", bidStatus, projStatus)
	}
	var spkCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_documents WHERE project_id=971006 AND category='spk'`).Scan(&spkCount)
	if spkCount != 1 {
		t.Fatalf("client-sign snapshot docs = %d, want 1", spkCount)
	}
	var spkFile, spkStatus string
	_ = pool.QueryRow(ctx, `SELECT file_name, status::text FROM project_documents WHERE project_id=971006 AND category='spk'`).Scan(&spkFile, &spkStatus)
	if spkFile != "SPK_arsitek_971006.json" || spkStatus != "verified" {
		t.Fatalf("client-sign snapshot doc = %q/%q", spkFile, spkStatus)
	}
	// awaiting_payment is still signable: the second sign reuses the doc row
	rec = hACallWithPaths(t, ClientSignContractHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek","signature":"`+hGSig+`"}`, &owner, csPath(itoaTest(bidID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("client-sign second = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_documents WHERE project_id=971006 AND category='spk'`).Scan(&spkCount)
	if spkCount != 1 {
		t.Fatalf("client-sign second docs = %d, want 1", spkCount)
	}

	// --- plan incomplete: wipe the pro-signed stages, the file stays ---
	if _, err := pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=971006`); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, ClientSignContractHandler(pool), http.MethodPost, "/api/x", `{"bid_type":"arsitek","signature":"`+hGSig+`"}`, &owner, csPath(itoaTest(bidID)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("client-sign noplan = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "no payment schedule exists for this role" {
		t.Fatalf("client-sign noplan message = %q", got)
	}

	if stringOrNilText(nil) != "" || stringOrNilText(strPtr("hG")) != "hG" {
		t.Fatalf("stringOrNilText wrong")
	}

	hGCleanupVault(t, pool)
	hGCleanup(t, pool)
	hGAssertNoLeftovers(t, pool)
}

func TestHGGapsBudget(t *testing.T) {
	pool := hGPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 970031, "user", "hg-bt-owner@example.test", "hG BT Owner")
	pmUser := hAMkUser(t, pool, 970032, "project_manager", "hg-bt-pm@example.test", "hG BT PM")
	arsUser := hAMkUser(t, pool, 970033, "arsitek", "hg-bt-ars@example.test", "hG BT Ars")
	t.Cleanup(func() {
		hGCleanupVault(t, pool)
		hGCleanup(t, pool)
	})

	hAMkProject(t, pool, 971010, owner.id, "hG budget project", "open", "both", 800000000)
	hAMkProject(t, pool, 971011, owner.id, "hG poor project", "open", "both", 100000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1, pm_id=$2 WHERE id=971010`, arsUser.id+100000, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}

	// --- transaction validation twins (single bad field each) ---
	txnCases := []struct {
		name, body, field, want string
	}{
		{"type-num", `{"transaction_type":1,"amount":"100","title":"hG"}`, "transaction_type", "The selected transaction type is invalid."},
		{"type-empty", `{"transaction_type":"","amount":"100","title":"hG"}`, "transaction_type", "The transaction type field is required."},
		{"amount-neg", `{"transaction_type":"deposit","amount":"-5","title":"hG"}`, "amount", "The amount field must be at least 1."},
		{"amount-max", `{"transaction_type":"deposit","amount":"100000000000000","title":"hG"}`, "amount", "The amount field must not be greater than 99999999999999."},
		{"title-num", `{"transaction_type":"deposit","amount":"100","title":1}`, "title", "The title field must be a string."},
		{"title-long", `{"transaction_type":"deposit","amount":"100","title":"` + strings.Repeat("hG", 200) + `"}`, "title", "The title field must not be greater than 255 characters."},
	}
	for _, tc := range txnCases {
		rec := hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/971010/budget/transactions", tc.body, &owner, "971010")
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("txn %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		dec := hADecode(t, rec)
		if dec["message"] != "Validation error" {
			t.Fatalf("txn %s envelope = %q", tc.name, dec["message"])
		}
		errs, ok := dec["errors"].(map[string]any)
		if !ok {
			t.Fatalf("txn %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok || len(list) != 1 || list[0] != tc.want {
			t.Fatalf("txn %s field %q = %v, want [%q]", tc.name, tc.field, list, tc.want)
		}
	}
	// --- happy deposit pins the fresh-ceiling literal ---
	rec := hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/971010/budget/transactions", `{"transaction_type":"deposit","amount":"2000000","title":"hG chest"}`, &owner, "971010")
	if rec.Code != http.StatusOK {
		t.Fatalf("txn deposit = %d %s", rec.Code, rec.Body.String())
	}
	dec := hADecode(t, rec)
	if dec["message"] != "Transaction recorded successfully" || dec["budget"] != "802000000.00" {
		t.Fatalf("txn deposit answer = %v", dec)
	}
	txnBody, _ := dec["transaction"].(map[string]any)
	if txnBody["amount"] != "2000000.00" || txnBody["title"] != "hG chest" || txnBody["transaction_type"] != "deposit" {
		t.Fatalf("txn deposit row = %v", txnBody)
	}
	var ledgerMinor int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions WHERE project_id=971010 AND transaction_type='deposit' AND title='hG chest'`).Scan(&ledgerMinor)
	if ledgerMinor != 200000000 {
		t.Fatalf("txn deposit ledger minor = %d, want 200000000", ledgerMinor)
	}

	// --- direct twins ---
	if txnTitle(map[string]any{"title": 1}) != "" || txnTitle(map[string]any{"title": " hG x "}) != "hG x" {
		t.Fatalf("txnTitle wrong")
	}
	if _, err := loadLedgerRow(ctx, pool, 971010, "deposit", "hG no such title"); err != errLedgerGone {
		t.Fatalf("loadLedgerRow missing = %v, want errLedgerGone", err)
	}
	pmProfile := pmUser.id + 100000
	outsider := &projectViewer{id: 999999999, profiles: map[string]int64{}}
	ownerViewer := &projectViewer{id: owner.id, profiles: map[string]int64{}, role: "user"}
	pmViewer := &projectViewer{id: pmUser.id, profiles: map[string]int64{"project_manager": pmProfile}, role: "project_manager"}
	if sandboxGate(nil, owner.id, nil) || sandboxGate(outsider, owner.id, nil) {
		t.Fatalf("sandboxGate outsider true")
	}
	if !sandboxGate(ownerViewer, owner.id, &pmProfile) || !sandboxGate(pmViewer, owner.id, &pmProfile) {
		t.Fatalf("sandboxGate insider false")
	}

	// --- sandbox validation twins ---
	sbCases := []struct {
		name, body, field, want string
	}{
		{"title-num", `{"title":1,"estimated_amount":"100"}`, "title", "The title field must be a string."},
		{"amount-alpha", `{"title":"hG","estimated_amount":"abc"}`, "estimated_amount", "The estimated amount field must be a number."},
		{"amount-zero", `{"title":"hG","estimated_amount":"0"}`, "estimated_amount", "The estimated amount field must be at least 1."},
		{"title-long", `{"title":"` + strings.Repeat("hG", 200) + `","estimated_amount":"100"}`, "title", "The title field must not be greater than 255 characters."},
	}
	for _, tc := range sbCases {
		rec := hACall(t, AddSandboxHandler(pool), http.MethodPost, "/api/projects/971010/budget/sandbox", tc.body, &owner, "971010")
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("sandbox %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		errs, ok := hADecode(t, rec)["errors"].(map[string]any)
		if !ok {
			t.Fatalf("sandbox %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok || len(list) != 1 || list[0] != tc.want {
			t.Fatalf("sandbox %s field %q = %v, want [%q]", tc.name, tc.field, list, tc.want)
		}
	}
}

func TestHGGapsAddendum(t *testing.T) {
	pool := hGPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 970041, "user", "hg-ad-owner@example.test", "hG AD Owner")
	pmUser := hAMkUser(t, pool, 970042, "project_manager", "hg-ad-pm@example.test", "hG AD PM")
	arsUser := hAMkUser(t, pool, 970043, "arsitek", "hg-ad-ars@example.test", "hG AD Ars")
	t.Cleanup(func() {
		hGCleanupVault(t, pool)
		hGCleanup(t, pool)
	})

	hAMkProject(t, pool, 971012, owner.id, "hG addendum project", "open", "both", 800000000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1, pm_id=$2 WHERE id=971012`, arsUser.id+100000, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}

	// --- create validation twins ---
	createCases := []struct {
		name, body, field, want string
	}{
		{"desc-num", `{"title":"hG","amount":"100","description":1}`, "description", "The description field must be a string."},
		{"amount-zero", `{"title":"hG","amount":"0"}`, "amount", "The amount field must be at least 1."},
		{"amount-neg", `{"title":"hG","amount":"-3"}`, "amount", "The amount field must be at least 1."},
		{"amount-alpha", `{"title":"hG","amount":"abc"}`, "amount", "The amount field must be a number."},
		{"title-long", `{"title":"` + strings.Repeat("hG", 200) + `","amount":"100"}`, "title", "The title field must not be greater than 255 characters."},
		{"team-alpha", `{"title":"hG","amount":"100","team_member_id":"abc"}`, "team_member_id", "The selected team member id is invalid."},
	}
	for _, tc := range createCases {
		rec := hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/971012/budget/addendums", tc.body, &arsUser, "971012")
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("addendum %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		errs, ok := hADecode(t, rec)["errors"].(map[string]any)
		if !ok {
			t.Fatalf("addendum %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok || len(list) != 1 || list[0] != tc.want {
			t.Fatalf("addendum %s field %q = %v, want [%q]", tc.name, tc.field, list, tc.want)
		}
	}
	// non-string type fails BOTH the string and the in rules
	rec := hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/971012/budget/addendums", `{"title":"hG","amount":"100","type":1}`, &arsUser, "971012")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum typenum = %d %s", rec.Code, rec.Body.String())
	}
	if list, _ := hADecode(t, rec)["errors"].(map[string]any)["type"].([]any); len(list) != 2 ||
		list[0] != "The type field must be a string." || list[1] != "The selected type is invalid." {
		t.Fatalf("addendum typenum errors = %v", list)
	}
	// multipart twin: wrong extension fails the mimes rule
	rec = hAMultipartCall(t, CreateAddendumHandler(pool), "/api/projects/971012/budget/addendums",
		map[string]string{"title": "hG file", "amount": "1500000"}, "attachment", "hG-note.txt", []byte("hG"), &arsUser, map[string]string{"project": "971012"})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum txtext = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The attachment field must be a file of type: jpg, jpeg, png, webp, pdf." {
		t.Fatalf("addendum txtext message = %q", got)
	}
	// direct oversize twin (10 MiB cap)
	failures := &errorBag{}
	validateAddendumCreate(ctx, pool, map[string]any{"title": "hG", "amount": "100"}, map[string]*uploadedFile{"attachment": {filename: "hG-big.pdf", ext: "pdf", size: 10485761}}, failures)
	if failures.empty() {
		t.Fatalf("addendum oversize passed")
	}
	if list := failures.bag["attachment"]; len(list) != 1 || list[0] != "The attachment field must not be greater than 10240 kilobytes." {
		t.Fatalf("addendum oversize errors = %v", failures.bag)
	}

	// --- happy create with empty-string optionals (absent branches) ---
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/971012/budget/addendums",
		`{"title":"hG extra","amount":"1500000","assigned_user_id":"","specialist_type":""}`, &arsUser, "971012")
	if rec.Code != http.StatusOK {
		t.Fatalf("addendum create = %d %s", rec.Code, rec.Body.String())
	}
	var addID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_addendums WHERE project_id=971012 AND title='hG extra'`).Scan(&addID)
	if addID == 0 {
		t.Fatalf("addendum row missing")
	}

	// --- PM authorises: actor label flips to Project Manager, owner notified ---
	hpath := func(id string) map[string]string { return map[string]string{"project": "971012", "id": id} }
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"approved_unpaid"}`, &pmUser, hpath(itoaTest(addID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("pm approve = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Budget authorized successfully. Awaiting payment from the Project Owner." {
		t.Fatalf("pm approve message = %q", got)
	}
	var pmTitle, pmBody string
	_ = pool.QueryRow(ctx, `SELECT title, body FROM notifications WHERE user_id=$1 AND type='budget_approved' ORDER BY id DESC LIMIT 1`, owner.id).Scan(&pmTitle, &pmBody)
	if pmTitle != "Budget Authorized by Project Manager" || !strings.Contains(pmBody, "hG extra") {
		t.Fatalf("pm approve notification = %q/%q", pmTitle, pmBody)
	}
	var logDetails string
	_ = pool.QueryRow(ctx, `SELECT details FROM project_activity_logs WHERE project_id=971012 AND action='budget_authorized' ORDER BY id DESC LIMIT 1`).Scan(&logDetails)
	if !strings.Contains(logDetails, "Project Manager authorized budget") {
		t.Fatalf("pm approve log = %q", logDetails)
	}

	// --- proposer counters with a revised amount (no counter fields) ---
	var addN int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (971012,'arsitek',$1,'hG nego','900000','pending_approval',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, arsUser.id).Scan(&addN); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"negotiating","counter_offer_amount":"850000","negotiation_note":"hG high"}`, &owner, hpath(itoaTest(addN)))
	if rec.Code != http.StatusOK {
		t.Fatalf("owner negotiate = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"negotiating","amount":"820000"}`, &arsUser, hpath(itoaTest(addN)))
	if rec.Code != http.StatusOK {
		t.Fatalf("pro counter = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Negotiation request sent." {
		t.Fatalf("pro counter message = %q", got)
	}
	var revAmount, revStatus, revCounter string
	_ = pool.QueryRow(ctx, `SELECT amount::text, status::text, counter_offer_amount::text FROM project_addendums WHERE id=$1`, addN).Scan(&revAmount, &revStatus, &revCounter)
	if revAmount != "820000.00" || revStatus != "negotiating" || revCounter != "850000.00" {
		t.Fatalf("pro counter row = %q/%q/%q, want 820000.00/negotiating/850000.00", revAmount, revStatus, revCounter)
	}
	var revBody string
	_ = pool.QueryRow(ctx, `SELECT body FROM notifications WHERE type='budget_negotiation' AND body LIKE '%hG nego%' ORDER BY id DESC LIMIT 1`).Scan(&revBody)
	if !strings.Contains(revBody, "revised their fee") || !strings.Contains(revBody, "820.000") {
		t.Fatalf("pro counter notification = %q", revBody)
	}

	// --- status validation twins ---
	for _, tc := range []struct {
		name, body, field, want string
	}{
		{"status-num", `{"status":1}`, "status", "The selected status is invalid."},
		{"amount-alpha", `{"status":"negotiating","amount":"abc"}`, "amount", "The amount field must be a number."},
		{"amount-neg", `{"status":"negotiating","amount":"-1"}`, "amount", "The amount field must be at least 0."},
		{"counter-alpha", `{"status":"negotiating","counter_offer_amount":"xyz"}`, "counter_offer_amount", "The counter offer amount field must be a number."},
		{"counter-neg", `{"status":"negotiating","counter_offer_amount":"-2"}`, "counter_offer_amount", "The counter offer amount field must be at least 0."},
		{"note-num", `{"status":"negotiating","negotiation_note":1}`, "negotiation_note", "The negotiation note field must be a string."},
	} {
		rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", tc.body, &owner, hpath(itoaTest(addN)))
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("handle %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		errs, ok := hADecode(t, rec)["errors"].(map[string]any)
		if !ok {
			t.Fatalf("handle %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok || len(list) != 1 || list[0] != tc.want {
			t.Fatalf("handle %s field %q = %v, want [%q]", tc.name, tc.field, list, tc.want)
		}
	}

	if id, ok := addendumExistsID("7.0"); !ok || id != 7 {
		t.Fatalf("addendumExistsID float-string = %d %v", id, ok)
	}
	if id, ok := addendumExistsID(int64(9)); !ok || id != 9 {
		t.Fatalf("addendumExistsID int64 = %d %v", id, ok)
	}

	hGCleanupVault(t, pool)
	hGCleanup(t, pool)
	hGAssertNoLeftovers(t, pool)
}

func TestHGGapsMarkPaid(t *testing.T) {
	pool := hGPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 970051, "user", "hg-mp-owner@example.test", "hG MP Owner")
	arsUser := hAMkUser(t, pool, 970052, "arsitek", "hg-mp-ars@example.test", "hG MP Ars")
	kontUser := hAMkUser(t, pool, 970053, "kontraktor", "hg-mp-kontra@example.test", "hG MP Kontra")
	mepUser := hAMkUser(t, pool, 970054, "mep", "hg-mp-mep@example.test", "hG MP Mep")
	intUser := hAMkUser(t, pool, 970055, "interior", "hg-mp-int@example.test", "hG MP Int")
	pmUser := hAMkUser(t, pool, 970056, "project_manager", "hg-mp-pm@example.test", "hG MP PM")
	t.Cleanup(func() {
		hGCleanupVault(t, pool)
		hGCleanup(t, pool)
	})

	hAMkProject(t, pool, 971013, owner.id, "hG markpaid project", "open", "both", 800000000)
	hAMkProject(t, pool, 971014, owner.id, "hG markpaid pm project", "open", "both", 800000000)

	mkBid := func(project int64, role string, userID int64, price, total, status string) int64 {
		t.Helper()
		column := map[string]string{"arsitek": "arsitek_id", "kontraktor": "kontraktor_id", "mep": "mep_id", "project_manager": "pm_id"}[role]
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, `+column+`, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
			VALUES ($1,$2,$3,$4,$4,$5,$6,'hG prop','`+status+`','fixed',$3,0) RETURNING id`,
			project, role, userID, userID+100000, price, total).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}

	// --- validation twins ---
	valCases := []struct {
		name, body, field, want string
	}{
		{"type-num", `{"type":1,"id":1}`, "type", "The selected type is invalid."},
		{"type-empty", `{"type":"","id":1}`, "type", "The type field is required."},
		{"id-false", `{"type":"termin","id":false}`, "id", "The id field must be an integer."},
		{"id-floatstr", `{"type":"termin","id":"12.0"}`, "id", "The id field must be an integer."},
	}
	for _, tc := range valCases {
		rec := hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", tc.body, &owner, "971013")
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("markpaid %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		errs, ok := hADecode(t, rec)["errors"].(map[string]any)
		if !ok {
			t.Fatalf("markpaid %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok || len(list) != 1 || list[0] != tc.want {
			t.Fatalf("markpaid %s field %q = %v, want [%q]", tc.name, tc.field, list, tc.want)
		}
	}
	// bool true coerces to 1, then misses the row: the 500 generic, never a 404
	rec := hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"termin","id":true}`, &owner, "971013")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("markpaid bool-id = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Failed to process payment tracking." {
		t.Fatalf("markpaid bool-id message = %q", got)
	}
	// missing rows answer the 500 generic on every branch
	for _, tc := range []struct{ typ, id string }{
		{"termin", "999999999"}, {"addendum", "999999999"}, {"bid_kontraktor", "999999999"},
	} {
		rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"`+tc.typ+`","id":`+tc.id+`}`, &owner, "971013")
		if rec.Code != http.StatusInternalServerError {
			t.Fatalf("markpaid missing %s = %d %s", tc.typ, rec.Code, rec.Body.String())
		}
		if got := hADecode(t, rec)["message"]; got != "Failed to process payment tracking." {
			t.Fatalf("markpaid missing %s message = %q", tc.typ, got)
		}
	}

	// --- kontraktor happy pins the per-role ledger title ---
	kontraBid := mkBid(971013, "kontraktor", kontUser.id, "30000000", "30000000", "shortlisted")
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"bid_kontraktor","id":`+itoaTest(kontraBid)+`}`, &owner, "971013")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid kontra = %d %s", rec.Code, rec.Body.String())
	}
	var kontraTitle string
	var kontraMinor int64
	_ = pool.QueryRow(ctx, `SELECT MAX(title), COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions WHERE project_id=971013 AND transaction_type='payment' AND reference_id=$1`, kontraBid).Scan(&kontraTitle, &kontraMinor)
	if kontraTitle != "Paid Contractor Base Fee" || kontraMinor != 3000000000 {
		t.Fatalf("markpaid kontra ledger = %q/%d", kontraTitle, kontraMinor)
	}

	// --- calculated_total NULL falls back to price ---
	var priceOnly int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (971013,'arsitek',$1,$2,$2,'40000000',NULL,'hG priceonly','shortlisted','fixed',$1,0) RETURNING id`, arsUser.id, arsUser.id+100000).Scan(&priceOnly); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"bid_arsitek","id":`+itoaTest(priceOnly)+`}`, &owner, "971013")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid priceonly = %d %s", rec.Code, rec.Body.String())
	}
	var priceMinor int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions WHERE project_id=971013 AND transaction_type='payment' AND reference_id=$1`, priceOnly).Scan(&priceMinor)
	if priceMinor != 4000000000 {
		t.Fatalf("markpaid priceonly ledger minor = %d, want 4000000000", priceMinor)
	}

	// --- legacy id binds the ledger reference ---
	var legacyBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, mep_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count, legacy_id)
		VALUES (971013,'mep',$1,$2,$2,'9000000','9000000','hG legacy','shortlisted','fixed',$1,0,975001) RETURNING id`, mepUser.id, mepUser.id+100000).Scan(&legacyBid); err != nil {
		t.Fatal(err)
	}
	_ = legacyBid
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"bid_mep","id":975001}`, &owner, "971013")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid legacy = %d %s", rec.Code, rec.Body.String())
	}
	var legacyRef int64
	var mepSlot *int64
	_ = pool.QueryRow(ctx, `SELECT reference_id FROM project_budget_transactions WHERE project_id=971013 AND transaction_type='payment' AND title='Paid MEP Engineer Resource'`).Scan(&legacyRef)
	_ = pool.QueryRow(ctx, `SELECT mep_id FROM projects WHERE id=971013`).Scan(&mepSlot)
	if legacyRef != 975001 {
		t.Fatalf("markpaid legacy reference = %d, want 975001", legacyRef)
	}
	if mepSlot == nil || *mepSlot != mepUser.id+100000 {
		t.Fatalf("markpaid mep slot = %v, want %d", mepSlot, mepUser.id+100000)
	}

	// --- PM slot already filled: the fill is skipped, the payment sails ---
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id=$1 WHERE id=971014`, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}
	pmBid := mkBid(971014, "project_manager", pmUser.id, "25000000", "25000000", "shortlisted")
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971014/budget/mark-paid", `{"type":"bid_project_manager","id":`+itoaTest(pmBid)+`}`, &owner, "971014")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid pm-filled = %d %s", rec.Code, rec.Body.String())
	}
	var pmSlot int64
	_ = pool.QueryRow(ctx, `SELECT pm_id FROM projects WHERE id=971014`).Scan(&pmSlot)
	if pmSlot != pmUser.id+100000 {
		t.Fatalf("markpaid pm slot = %d, want %d", pmSlot, pmUser.id+100000)
	}

	// --- addendum double-paid twin ---
	var addA int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (971013,'arsitek',$1,'hG double','2000000','approved_unpaid',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, arsUser.id).Scan(&addA); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addA)+`}`, &owner, "971013")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid addendum = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addA)+`}`, &owner, "971013")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid double-add = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment has already been marked as paid." {
		t.Fatalf("markpaid double-add message = %q", got)
	}

	// --- refunded addendum trips the settlement guard ---
	var addR int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (971013,'arsitek',$1,'hG refunded','1000000','refunded',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, arsUser.id).Scan(&addR); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addR)+`}`, &owner, "971013")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid refunded-add = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment was refunded through dispute arbitration and cannot be charged again. Open a new dispute if the refund itself is disputed." {
		t.Fatalf("markpaid refunded-add message = %q", got)
	}

	// --- specialist assignment without any assignee is a plain pay ---
	var addN int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, type, status, created_at, updated_at)
		VALUES (971013,'arsitek',$1,'hG noassignee','700000','specialist_assignment','approved_unpaid',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, owner.id).Scan(&addN); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addN)+`}`, &owner, "971013")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid noassignee = %d %s", rec.Code, rec.Body.String())
	}
	var subRows int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_sub_professionals WHERE project_id=971013`).Scan(&subRows)
	if subRows != 0 {
		t.Fatalf("markpaid noassignee sub rows = %d, want 0", subRows)
	}

	// --- interior specialist slot ---
	var addI int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, type, assigned_user_id, specialist_type, status, created_at, updated_at)
		VALUES (971013,'arsitek',$1,'hG int spec','3000000','specialist_assignment',$2,'interior','approved_unpaid',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, owner.id, intUser.id).Scan(&addI); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971013/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addI)+`}`, &owner, "971013")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid interior-spec = %d %s", rec.Code, rec.Body.String())
	}
	var intSlot *int64
	_ = pool.QueryRow(ctx, `SELECT selected_interior_id FROM projects WHERE id=971013`).Scan(&intSlot)
	if intSlot == nil || *intSlot != intUser.id+100000 {
		t.Fatalf("markpaid interior slot = %v, want %d", intSlot, intUser.id+100000)
	}

	// --- recommended mep settles with its own ledger row ---
	var mepBid2 int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, mep_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (971014,'mep',$1,$2,$2,'11000000','11000000','hG mep2','shortlisted','fixed',$1,0) RETURNING id`, mepUser.id, mepUser.id+100000).Scan(&mepBid2); err != nil {
		t.Fatal(err)
	}
	var addM int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, type, status, recommended_bid_id, recommended_bid_type, created_at, updated_at)
		VALUES (971014,'arsitek',$1,'hG rec mep','1000000','extra_fee','approved_unpaid',$2,'mep',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, owner.id, mepBid2).Scan(&addM); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971014/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addM)+`}`, &owner, "971014")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid rec-mep = %d %s", rec.Code, rec.Body.String())
	}
	var recTitle string
	var recMinor int64
	_ = pool.QueryRow(ctx, `SELECT MAX(title), COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions WHERE project_id=971014 AND transaction_type='payment' AND reference_id=$1`, mepBid2).Scan(&recTitle, &recMinor)
	if recTitle != "Paid MEP Engineer Fee (via specialist addendum)" || recMinor != 1100000000 {
		t.Fatalf("markpaid rec-mep ledger = %q/%d", recTitle, recMinor)
	}

	// --- unknown recommended type is a no-op pay; missing bid is too ---
	for _, tc := range []struct {
		name, bidType string
		bidID         int64
	}{
		{"unknown-type", "arsitek", 0},
		{"missing-bid", "structural", 999999999},
	} {
		var addX int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, type, status, recommended_bid_id, recommended_bid_type, created_at, updated_at)
			VALUES (971014,'arsitek',$1,'hG rec `+tc.name+`','500000','extra_fee','approved_unpaid',$2,'`+tc.bidType+`',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, owner.id, tc.bidID).Scan(&addX); err != nil {
			t.Fatal(err)
		}
		rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/971014/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addX)+`}`, &owner, "971014")
		if rec.Code != http.StatusOK {
			t.Fatalf("markpaid %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		var st string
		_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addX).Scan(&st)
		if st != "paid" {
			t.Fatalf("markpaid %s status = %q, want paid", tc.name, st)
		}
	}

	if markPaidBidRole("bid_interior") != "interior" || markPaidBidRole("bid_notaris") != "notaris" || markPaidBidRole("bid_structural") != "structural" || markPaidBidRole("nope") != "" {
		t.Fatalf("markPaidBidRole wrong")
	}
	if (markPaidError{status: 422, message: "hG"}).Error() == "" || (errMarkPaidGoneT{}).Error() == "" {
		t.Fatalf("markpaid error strings empty")
	}
}

func TestHGGapsFee(t *testing.T) {
	pool := hGPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 970061, "user", "hg-fee-owner@example.test", "hG Fee Owner")
	arsUser := hAMkUser(t, pool, 970062, "arsitek", "hg-fee-ars@example.test", "hG Fee Ars")
	notUser := hAMkUser(t, pool, 970063, "notaris", "hg-fee-not@example.test", "hG Fee Not")
	structUser := hAMkUser(t, pool, 970064, "structural", "hg-fee-struct@example.test", "hG Fee Struct")
	t.Cleanup(func() {
		hGCleanupVault(t, pool)
		hGCleanup(t, pool)
	})

	hAMkProject(t, pool, 971020, owner.id, "hG fee project", "open", "both", 800000000)

	var arsBid, notBid, structBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (971020,'arsitek',$1,$2,$2,'50000000','50000000','hG ars','shortlisted','fixed',$1,0) RETURNING id`, arsUser.id, arsUser.id+100000).Scan(&arsBid); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, notaris_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (971020,'notaris',$1,$2,$2,'1000000','1000000','hG not','shortlisted','fixed',$1,0) RETURNING id`, notUser.id, notUser.id+100000).Scan(&notBid); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, structural_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (971020,'structural',$1,$2,$2,'12000000','12000000','hG struct','shortlisted','fixed',$1,0) RETURNING id`, structUser.id, structUser.id+100000).Scan(&structBid); err != nil {
		t.Fatal(err)
	}

	// --- dimensions merge: length x width writes the category keys ---
	rec := hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/971020/propose-fee",
		`{"bid_id":`+itoaTest(arsBid)+`,"bid_type":"arsitek","price":60000000,"project_length":10,"project_width":20,"proposed_termins":[{"percentage":100,"trigger_description":"hG all"}]}`, &owner, "971020")
	if rec.Code != http.StatusOK {
		t.Fatalf("propose dims = %d %s", rec.Code, rec.Body.String())
	}
	var dimsRaw string
	_ = pool.QueryRow(ctx, `SELECT project_dimensions::text FROM projects WHERE id=971020`).Scan(&dimsRaw)
	var dims map[string]any
	if err := json.Unmarshal([]byte(dimsRaw), &dims); err != nil {
		t.Fatal(err)
	}
	if dims["building_length"] != float64(10) || dims["building_width"] != float64(20) || dims["building_size"] != float64(200) {
		t.Fatalf("propose dims = %v, want 10/20/200", dims)
	}

	// --- notaris propose with services + milestones ---
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/971020/propose-fee",
		`{"bid_id":`+itoaTest(notBid)+`,"bid_type":"notaris","price":2000000,"selected_services":[{"id":"hG-svc","price":500000}],"proposed_milestones":[{"title":"hG ms","description":"hG work"}],"proposed_termins":[{"percentage":100,"trigger_description":"hG all"}]}`, &owner, "971020")
	if rec.Code != http.StatusOK {
		t.Fatalf("propose notaris = %d %s", rec.Code, rec.Body.String())
	}
	var notSvc, notMs, notTotal string
	_ = pool.QueryRow(ctx, `SELECT selected_services::text, proposed_milestones::text, calculated_total::text FROM bids WHERE id=$1`, notBid).Scan(&notSvc, &notMs, &notTotal)
	if !strings.Contains(notSvc, "hG-svc") || !strings.Contains(notMs, "hG ms") {
		t.Fatalf("propose notaris cols = %q/%q", notSvc, notMs)
	}
	if notTotal != "2500000.00" {
		t.Fatalf("propose notaris total = %q, want 2500000.00", notTotal)
	}

	// --- structural propose with a team (role owns proposed_team) ---
	rec = hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/971020/propose-fee",
		`{"bid_id":`+itoaTest(structBid)+`,"bid_type":"structural","price":12000000,"proposed_team":[{"name":"hG","role_title":"hG","role":"hG","fee":500000,"fee_type":"fixed"}],"proposed_termins":[{"percentage":100,"trigger_description":"hG all"}]}`, &owner, "971020")
	if rec.Code != http.StatusOK {
		t.Fatalf("propose structural = %d %s", rec.Code, rec.Body.String())
	}
	var structTeam, structTotal string
	_ = pool.QueryRow(ctx, `SELECT proposed_team::text, calculated_total::text FROM bids WHERE id=$1`, structBid).Scan(&structTeam, &structTotal)
	if !strings.Contains(structTeam, "hG") {
		t.Fatalf("propose structural team = %q", structTeam)
	}
	if structTotal != "12500000.00" {
		t.Fatalf("propose structural total = %q, want 12500000.00", structTotal)
	}

	// --- direct helper twins ---
	if jsonScalarText(json.Number("12")) != "12" {
		t.Fatalf("jsonScalarText number wrong")
	}
	if decimalTextOrNil("") != "0.00" {
		t.Fatalf("decimalTextOrNil empty wrong")
	}
	if nullableTextValue("") != nil || nullableTextValue("hG") != "hG" {
		t.Fatalf("nullableTextValue wrong")
	}
	if numberFormat("-1500000") != "-1.500.000" {
		t.Fatalf("numberFormat negative wrong")
	}

	hGCleanupVault(t, pool)
	hGCleanup(t, pool)
	hGAssertNoLeftovers(t, pool)
}

func TestHGGapsProof(t *testing.T) {
	pool := hGPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 970071, "user", "hg-pf-owner@example.test", "hG PF Owner")
	arsUser := hAMkUser(t, pool, 970072, "arsitek", "hg-pf-ars@example.test", "hG PF Ars")
	stranger := hAMkUser(t, pool, 970073, "user", "hg-pf-stranger@example.test", "hG PF Stranger")
	suppUser := hAMkUser(t, pool, 970074, "supplier", "hg-pf-supp@example.test", "hG PF Supp")
	t.Cleanup(func() {
		hGCleanupVault(t, pool)
		hGCleanup(t, pool)
	})

	hAMkProject(t, pool, 971021, owner.id, "hG proof project", "in_progress", "both", 800000000)

	var suppID int64
	if err := pool.QueryRow(ctx, `INSERT INTO suppliers (user_id, store_name, verification_status) VALUES ($1,'hG store','verified') RETURNING id`, suppUser.id).Scan(&suppID); err != nil {
		t.Fatal(err)
	}
	var bidArs int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count, legacy_id)
		VALUES (971021,'arsitek',$1,$2,$2,'75000000','75000000','hG pf ars','shortlisted','fixed',$1,0,976001) RETURNING id`,
		arsUser.id, arsUser.id+100000).Scan(&bidArs); err != nil {
		t.Fatal(err)
	}
	var termA int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (971021,'hG first','50','10000000','500000','9500000','pending','arsitek',$1) RETURNING id`, arsUser.id).Scan(&termA); err != nil {
		t.Fatal(err)
	}
	var matID int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, project_id, status, total_price, shipping_cost, whatsapp_order_id)
		VALUES ($1,$2,971021,'pending','400000','50000','hG-wo-1') RETURNING id`, owner.id, suppID).Scan(&matID); err != nil {
		t.Fatal(err)
	}
	upKV := func(typ, id string) map[string]string {
		return map[string]string{"project": "971021", "type": typ, "id": id}
	}

	// --- routing + validation guards ---
	rec := hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, nil, upKV("termin", itoaTest(termA)))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("proof unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, UploadProofHandler(pool), http.MethodPost, "/api/x/abc", `{}`, &owner, map[string]string{"project": "abc", "type": "termin", "id": "1"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof bad-project = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, UploadProofHandler(pool), http.MethodPost, "/api/x", `{}`, &owner, map[string]string{"project": "999999999", "type": "termin", "id": "1"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof missing project = %d %s", rec.Code, rec.Body.String())
	}
	// no file at all
	rec = hACallWithPaths(t, UploadProofHandler(pool), http.MethodPost, "/api/x", `{}`, &owner, upKV("termin", itoaTest(termA)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof nofile = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The proof field is required." {
		t.Fatalf("proof nofile message = %q", got)
	}
	// non-file value fails BOTH the file and the mimes rules
	rec = hACallWithPaths(t, UploadProofHandler(pool), http.MethodPost, "/api/x", `{"proof":"hG-not-a-file"}`, &owner, upKV("termin", itoaTest(termA)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof nonfile = %d %s", rec.Code, rec.Body.String())
	}
	if list, _ := hADecode(t, rec)["errors"].(map[string]any)["proof"].([]any); len(list) != 2 ||
		list[0] != "The proof field must be a file." || list[1] != "The proof field must be a file of type: jpeg, png, jpg, pdf." {
		t.Fatalf("proof nonfile errors = %v", list)
	}
	// bad extension
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG-note.txt", []byte("hG"), &owner, upKV("termin", itoaTest(termA)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof badext = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The proof field must be a file of type: jpeg, png, jpg, pdf." {
		t.Fatalf("proof badext message = %q", got)
	}
	// oversize (5 MiB cap)
	big := make([]byte, 6*1024*1024)
	for i := range big {
		big[i] = 'A'
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG-big.pdf", big, &owner, upKV("termin", itoaTest(termA)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof big = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The proof field must not be greater than 5120 kilobytes." {
		t.Fatalf("proof big message = %q", got)
	}
	// outsider past the gate
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &stranger, upKV("termin", itoaTest(termA)))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("proof forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the Project Owner or assigned Project Manager can upload payment proofs." {
		t.Fatalf("proof forbidden message = %q", got)
	}

	// --- frozen twin (material has no ordering guard) ---
	var freezeID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES (971021,$1,'payment','hG freeze','desc','open') RETURNING id`, owner.id).Scan(&freezeID); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("material", itoaTest(matID)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof frozen = %d %s", rec.Code, rec.Body.String())
	}
	wantFrozen := "Payments are frozen: dispute #" + itoaTest(freezeID) + ` ("hG freeze") is open on this project. An admin must resolve it first.`
	if got := hADecode(t, rec)["message"]; got != wantFrozen {
		t.Fatalf("proof frozen message = %q, want %q", got, wantFrozen)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=971021`); err != nil {
		t.Fatal(err)
	}

	// --- ordering guard: a later stage waits on the earlier one ---
	var termB int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (971021,'hG second','50','10000000','500000','9500000','pending','arsitek',$1) RETURNING id`, arsUser.id).Scan(&termB); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("termin", itoaTest(termB)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof order = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Please complete the previous payment milestones (e.g. Down Payment) before paying for this one." {
		t.Fatalf("proof order message = %q", got)
	}
	var termBStatus string
	var termBProof *string
	_ = pool.QueryRow(ctx, `SELECT status::text, payment_proof_path FROM project_payment_termins WHERE id=$1`, termB).Scan(&termBStatus, &termBProof)
	if termBStatus != "pending" || termBProof != nil {
		t.Fatalf("proof order rollback = %q/%v, want pending/nil", termBStatus, termBProof)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE id=$1`, termB); err != nil {
		t.Fatal(err)
	}

	// --- missing rows: 404, never the 500 generic ---
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("termin", "999999999"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof missing termin = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Payment record not found." {
		t.Fatalf("proof missing termin message = %q", got)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("arsitek_bid", "999999999"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("proof missing bid = %d %s", rec.Code, rec.Body.String())
	}
	// bad payment type: 400
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("bogus", "1"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("proof badtype = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Invalid payment type: bogus" {
		t.Fatalf("proof badtype message = %q", got)
	}

	// --- happy termin upload, then a replacement drops the old file ---
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("termin", itoaTest(termA)))
	if rec.Code != http.StatusOK {
		t.Fatalf("proof termin ok = %d %s", rec.Code, rec.Body.String())
	}
	var pathA, statusA string
	_ = pool.QueryRow(ctx, `SELECT payment_proof_path, status::text FROM project_payment_termins WHERE id=$1`, termA).Scan(&pathA, &statusA)
	if statusA != "verifying" || pathA == "" {
		t.Fatalf("proof termin row = %q/%q, want verifying/set", statusA, pathA)
	}
	if full, err := safeStorageJoin(vaultBaseDir(), pathA); err != nil || !fileExists(full) {
		t.Fatalf("proof termin file missing: %q/%v", pathA, err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("termin", itoaTest(termA)))
	if rec.Code != http.StatusOK {
		t.Fatalf("proof termin replace = %d %s", rec.Code, rec.Body.String())
	}
	var pathA2 string
	_ = pool.QueryRow(ctx, `SELECT payment_proof_path FROM project_payment_termins WHERE id=$1`, termA).Scan(&pathA2)
	if old, err := safeStorageJoin(vaultBaseDir(), pathA); err == nil {
		if _, serr := os.Stat(old); !os.IsNotExist(serr) && pathA2 == pathA {
			t.Fatalf("proof replace kept the old file %q", pathA)
		}
	}

	// --- settled twins: void termin, refunded material, paid bid ---
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (971021,'hG void','50','1000000','50000','950000','void','arsitek',$1)`, arsUser.id); err != nil {
		t.Fatal(err)
	}
	var termVoid int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_payment_termins WHERE project_id=971021 AND label='hG void'`).Scan(&termVoid)
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("termin", itoaTest(termVoid)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof void = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment stage was voided (contract terminated or re-signed) and is no longer payable." {
		t.Fatalf("proof void message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE material_orders SET status='refunded' WHERE id=$1`, matID); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("material", itoaTest(matID)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof refunded = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment was refunded through dispute arbitration and cannot be re-charged." {
		t.Fatalf("proof refunded message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE bids SET payment_status='paid' WHERE id=$1`, bidArs); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, upKV("arsitek_bid", "976001"))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("proof bid-paid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment is already marked as paid and cannot be modified." {
		t.Fatalf("proof bid-paid message = %q", got)
	}

	if proofTypeFromPath("/api/projects/1/payments/termin/2/upload-proof") != "termin" {
		t.Fatalf("proofTypeFromPath wrong")
	}
	if proofTypeFromPath("/api/projects/1/nothing-here") != "" {
		t.Fatalf("proofTypeFromPath fallback wrong")
	}
	if proofIDFromPath("/api/projects/1/payments/termin/2/upload-proof") != "2" {
		t.Fatalf("proofIDFromPath wrong")
	}

	_ = stranger
	hGCleanupVault(t, pool)
	hGCleanup(t, pool)
	hGAssertNoLeftovers(t, pool)
}

func TestHGGapsVerify(t *testing.T) {
	pool := hGPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 970081, "user", "hg-vf-owner@example.test", "hG Verify Owner")
	arsUser := hAMkUser(t, pool, 970082, "arsitek", "hg-vf-ars@example.test", "hG Verify Ars")
	structUser := hAMkUser(t, pool, 970083, "structural", "hg-vf-struct@example.test", "hG Verify Struct")
	suppUser := hAMkUser(t, pool, 970084, "supplier", "hg-vf-supp@example.test", "hG Verify Supp")
	stranger := hAMkUser(t, pool, 970085, "user", "hg-vf-stranger@example.test", "hG Verify Stranger")
	t.Cleanup(func() {
		hGCleanupVault(t, pool)
		hGCleanup(t, pool)
	})

	hAMkProject(t, pool, 971022, owner.id, "hG verify project", "open", "both", 800000000)
	hAMkProject(t, pool, 971023, owner.id, "hG verify poor project", "open", "both", 100000)
	// the arsitek is hired, so the hired-pro gate opens for addendums
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1 WHERE id IN (971022,971023)`, arsUser.id+100000); err != nil {
		t.Fatal(err)
	}

	var suppID int64
	if err := pool.QueryRow(ctx, `INSERT INTO suppliers (user_id, store_name, verification_status) VALUES ($1,'hG vstore','verified') RETURNING id`, suppUser.id).Scan(&suppID); err != nil {
		t.Fatal(err)
	}
	var bidArs int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, payment_status, fee_type, offered_by_id, negotiation_count, legacy_id)
		VALUES (971022,'arsitek',$1,$2,$2,'75000000','75000000','hG vf ars','shortlisted','pending','fixed',$1,0,976011) RETURNING id`,
		arsUser.id, arsUser.id+100000).Scan(&bidArs); err != nil {
		t.Fatal(err)
	}
	mkTermin := func(label, status string, recipient int64) int64 {
		t.Helper()
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
			VALUES (971022,$1,'50','10000000','500000','9500000','`+status+`','arsitek',$2) RETURNING id`, label, recipient).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	mkAddendum := func(title, status string, author int64) int64 {
		t.Helper()
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
			VALUES (971022,'arsitek',$1,'`+title+`','800000','`+status+`',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, author).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	matSeq := 0
	mkMaterial := func(status string) int64 {
		t.Helper()
		matSeq++
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, project_id, status, total_price, shipping_cost, whatsapp_order_id)
			VALUES ($1,$2,971022,'`+status+`','400000','50000','hG-vwo-`+itoaTest(int64(matSeq))+`') RETURNING id`, owner.id, suppID).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	vpath := func(project, typ, id string) map[string]string {
		return map[string]string{"project": project, "type": typ, "id": id}
	}
	dropTermin := func(id int64) {
		t.Helper()
		if _, err := pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE id=$1`, id); err != nil {
			t.Fatal(err)
		}
	}

	// --- routing + validation guards ---
	rec := hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, nil, vpath("971022", "termin", "1"))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("verify unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x/abc", `{"action":"accept"}`, &arsUser, map[string]string{"project": "abc", "type": "termin", "id": "1"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify bad-project = %d", rec.Code)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("999999999", "termin", "1"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify missing project = %d", rec.Code)
	}
	valCases := []struct {
		name, body, field, want string
	}{
		{"empty", `{}`, "action", "The action field is required."},
		{"blank", `{"action":""}`, "action", "The action field is required."},
		{"nonstr", `{"action":1}`, "action", "The action field must be a string."},
		{"bogus", `{"action":"maybe"}`, "action", "The action must be either accept or reject."},
		{"notes-num", `{"action":"accept","notes":1}`, "notes", "The notes field must be a string."},
	}
	for _, tc := range valCases {
		rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", tc.body, &arsUser, vpath("971022", "termin", "1"))
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("verify %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		errs, ok := hADecode(t, rec)["errors"].(map[string]any)
		if !ok {
			t.Fatalf("verify %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok || len(list) < 1 || list[0] != tc.want {
			t.Fatalf("verify %s field %q = %v, want first %q", tc.name, tc.field, list, tc.want)
		}
	}
	// notes over the limit
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"reject","notes":"`+strings.Repeat("hG", 600)+`"}`, &arsUser, vpath("971022", "termin", "1"))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify notes-long = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The notes field must not be greater than 1000 characters." {
		t.Fatalf("verify notes-long message = %q", got)
	}
	// non-string action fails BOTH rules
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":1}`, &arsUser, vpath("971022", "termin", "1"))
	if list, _ := hADecode(t, rec)["errors"].(map[string]any)["action"].([]any); len(list) != 2 ||
		list[0] != "The action field must be a string." || list[1] != "The action must be either accept or reject." {
		t.Fatalf("verify actionnum errors = %v", list)
	}
	// bad type, bad id, missing row
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "bogus", "1"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("verify badtype = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Invalid payment type: bogus" {
		t.Fatalf("verify badtype message = %q", got)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "termin", "abc"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify badid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Payment record not found." {
		t.Fatalf("verify badid message = %q", got)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "termin", "999999999"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify missing = %d %s", rec.Code, rec.Body.String())
	}

	// --- frozen twin ---
	termFrozen := mkTermin("hG frozen", "pending", arsUser.id)
	var freezeID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES (971022,$1,'payment','hG vfreeze','desc','open') RETURNING id`, owner.id).Scan(&freezeID); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "termin", itoaTest(termFrozen)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify frozen = %d %s", rec.Code, rec.Body.String())
	}
	wantFrozen := "Payments are frozen: dispute #" + itoaTest(freezeID) + ` ("hG vfreeze") is open on this project. An admin must resolve it first.`
	if got := hADecode(t, rec)["message"]; got != wantFrozen {
		t.Fatalf("verify frozen message = %q, want %q", got, wantFrozen)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=971022`); err != nil {
		t.Fatal(err)
	}

	// --- gate: a stranger cannot verify the recipient's termin ---
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971022", "type": "termin", "id": itoaTest(termFrozen)})
	if rec.Code != http.StatusOK {
		t.Fatalf("frozen-term proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &stranger, vpath("971022", "termin", itoaTest(termFrozen)))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("verify gate = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. You do not have permission to verify this payment." {
		t.Fatalf("verify gate message = %q", got)
	}

	// --- negative fixtures are single-use: removed right after ---
	termNoProof := mkTermin("hG noproof", "verifying", arsUser.id)
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "termin", itoaTest(termNoProof)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify noproof = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No transfer proof on file. The payer must upload a payment proof before this payment can be verified." {
		t.Fatalf("verify noproof message = %q", got)
	}
	dropTermin(termNoProof)
	termWrong := mkTermin("hG wrong", "accepted", arsUser.id)
	if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET payment_proof_path='hG/fake.pdf' WHERE id=$1`, termWrong); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "termin", itoaTest(termWrong)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify wrongstatus = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment is not awaiting verification. Expected status 'verifying' (proof uploaded by the payer), found 'accepted'." {
		t.Fatalf("verify wrongstatus message = %q", got)
	}
	dropTermin(termWrong)
	termPaid := mkTermin("hG paid", "paid", arsUser.id)
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "termin", itoaTest(termPaid)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify settled = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment is already marked as paid and cannot be modified." {
		t.Fatalf("verify settled message = %q", got)
	}
	dropTermin(termPaid)

	// --- reject twins: termin, addendum, material ---
	termRej := mkTermin("hG T rej", "pending", arsUser.id)
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971022", "type": "termin", "id": itoaTest(termRej)})
	if rec.Code != http.StatusOK {
		t.Fatalf("rej-term proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"reject","notes":"hG why"}`, &arsUser, vpath("971022", "termin", itoaTest(termRej)))
	if rec.Code != http.StatusOK {
		t.Fatalf("rej-term = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Payment proof rejected. The owner will be notified." {
		t.Fatalf("rej-term message = %q", got)
	}
	var rejStatus, rejNotes string
	_ = pool.QueryRow(ctx, `SELECT status::text, verification_notes FROM project_payment_termins WHERE id=$1`, termRej).Scan(&rejStatus, &rejNotes)
	if rejStatus != "pending" || rejNotes != "hG why" {
		t.Fatalf("rej-term row = %q/%q, want pending/hG why", rejStatus, rejNotes)
	}
	var rejBody, rejData string
	_ = pool.QueryRow(ctx, `SELECT body, data FROM notifications WHERE user_id=$1 AND type='payment_rejected' ORDER BY id DESC LIMIT 1`, owner.id).Scan(&rejBody, &rejData)
	if rejBody != `The professional has rejected your payment proof for "hG T rej". Reason: hG why` {
		t.Fatalf("rej-term body = %q", rejBody)
	}
	wantData := `{"notes": "hG why", "payment_id": ` + itoaTest(termRej) + `, "project_id": 971022, "payment_type": "termin"}`
	if rejData != wantData {
		t.Fatalf("rej-term data = %q, want %q", rejData, wantData)
	}
	dropTermin(termRej)

	addRej := mkAddendum("hG A rej", "approved_unpaid", arsUser.id)
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971022", "type": "addendum", "id": itoaTest(addRej)})
	if rec.Code != http.StatusOK {
		t.Fatalf("rej-add proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"reject","notes":"hG nope"}`, &arsUser, vpath("971022", "addendum", itoaTest(addRej)))
	if rec.Code != http.StatusOK {
		t.Fatalf("rej-add = %d %s", rec.Code, rec.Body.String())
	}
	var addRejStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addRej).Scan(&addRejStatus)
	if addRejStatus != "approved_unpaid" {
		t.Fatalf("rej-add row = %q, want approved_unpaid", addRejStatus)
	}

	matRej := mkMaterial("pending")
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971022", "type": "material", "id": itoaTest(matRej)})
	if rec.Code != http.StatusOK {
		t.Fatalf("rej-mat proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"reject","notes":"hG damaged"}`, &suppUser, vpath("971022", "material", itoaTest(matRej)))
	if rec.Code != http.StatusOK {
		t.Fatalf("rej-mat = %d %s", rec.Code, rec.Body.String())
	}
	var matRejStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id=$1`, matRej).Scan(&matRejStatus)
	if matRejStatus != "pending" {
		t.Fatalf("rej-mat row = %q, want pending", matRejStatus)
	}

	// --- accept twins: termin (retention net), addendum (gross), bid, material ---
	termAcc := mkTermin("hG T acc", "pending", arsUser.id)
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971022", "type": "termin", "id": itoaTest(termAcc)})
	if rec.Code != http.StatusOK {
		t.Fatalf("acc-term proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "termin", itoaTest(termAcc)))
	if rec.Code != http.StatusOK {
		t.Fatalf("acc-term = %d %s", rec.Code, rec.Body.String())
	}
	dec := hADecode(t, rec)
	if dec["status"] != "success" || dec["message"] != "Payment verified successfully." {
		t.Fatalf("acc-term answer = %v", dec)
	}
	var accTStatus string
	var accTMinor int64
	var accTTitle string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, termAcc).Scan(&accTStatus)
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0), MAX(title) FROM project_budget_transactions WHERE project_id=971022 AND transaction_type='payment' AND reference_id=$1`, termAcc).Scan(&accTMinor, &accTTitle)
	if accTStatus != "paid" || accTMinor != 950000000 || accTTitle != "Payment: hG T acc (arsitek)" {
		t.Fatalf("acc-term = %q/%d/%q, want paid/950000000/Payment: hG T acc (arsitek)", accTStatus, accTMinor, accTTitle)
	}

	addAcc := mkAddendum("hG A acc", "approved_unpaid", arsUser.id)
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971022", "type": "addendum", "id": itoaTest(addAcc)})
	if rec.Code != http.StatusOK {
		t.Fatalf("acc-add proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "addendum", itoaTest(addAcc)))
	if rec.Code != http.StatusOK {
		t.Fatalf("acc-add = %d %s", rec.Code, rec.Body.String())
	}
	var accAMinor int64
	var accATitle string
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0), MAX(title) FROM project_budget_transactions WHERE project_id=971022 AND transaction_type='payment' AND reference_id=$1`, addAcc).Scan(&accAMinor, &accATitle)
	if accAMinor != 80000000 || accATitle != "Payment: hG A acc" {
		t.Fatalf("acc-add ledger = %d/%q, want 80000000/Payment: hG A acc", accAMinor, accATitle)
	}

	matAcc := mkMaterial("pending")
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971022", "type": "material", "id": itoaTest(matAcc)})
	if rec.Code != http.StatusOK {
		t.Fatalf("acc-mat proof = %d %s", rec.Code, rec.Body.String())
	}
	// a stamp already holding a value advances on accept
	if _, err := pool.Exec(ctx, `UPDATE material_orders SET paid_at=date_trunc('second',now()) WHERE id=$1`, matAcc); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &suppUser, vpath("971022", "material", itoaTest(matAcc)))
	if rec.Code != http.StatusOK {
		t.Fatalf("acc-mat = %d %s", rec.Code, rec.Body.String())
	}
	var accMStatus string
	var accMMinor int64
	var accMTitle string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id=$1`, matAcc).Scan(&accMStatus)
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0), MAX(title) FROM project_budget_transactions WHERE project_id=971022 AND transaction_type='payment' AND reference_id=$1`, matAcc).Scan(&accMMinor, &accMTitle)
	if accMStatus != "paid" || accMMinor != 45000000 || accMTitle != "Payment: Material Procurement" {
		t.Fatalf("acc-mat = %q/%d/%q, want paid/45000000/Payment: Material Procurement", accMStatus, accMMinor, accMTitle)
	}

	// bid accept flips to paid/active, books the fee, moves the project
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971022", "type": "arsitek_bid", "id": "976011"})
	if rec.Code != http.StatusOK {
		t.Fatalf("acc-bid proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971022", "arsitek_bid", "976011"))
	if rec.Code != http.StatusOK {
		t.Fatalf("acc-bid = %d %s", rec.Code, rec.Body.String())
	}
	var bidPay, bidStatus string
	_ = pool.QueryRow(ctx, `SELECT payment_status::text, status::text FROM bids WHERE id=$1`, bidArs).Scan(&bidPay, &bidStatus)
	if bidPay != "paid" || bidStatus != "active" {
		t.Fatalf("acc-bid row = %q/%q, want paid/active", bidPay, bidStatus)
	}
	var bidMinor int64
	var bidTitle, projStatus string
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0), MAX(title) FROM project_budget_transactions WHERE project_id=971022 AND transaction_type='payment' AND reference_id=976011`).Scan(&bidMinor, &bidTitle)
	_ = pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id=971022`).Scan(&projStatus)
	if bidMinor != 7500000000 || bidTitle != "Professional Fee: hG Verify Ars" || projStatus != "accepted_arsitek" {
		t.Fatalf("acc-bid = %d/%q/%q, want 7500000000/Professional Fee: hG Verify Ars/accepted_arsitek", bidMinor, bidTitle, projStatus)
	}

	// --- specialist was-accepted twin: existing record updates + slot ---
	var specSub int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_sub_professionals (project_id, sub_role, user_id, parent_role, assigned_by, status, rate, accepted_at, created_at, updated_at)
		VALUES (971022,'structural',$1,'arsitek',$2,'active','500000',date_trunc('second',now()),date_trunc('second',now()),date_trunc('second',now())) RETURNING id`,
		structUser.id, owner.id).Scan(&specSub); err != nil {
		t.Fatal(err)
	}
	var specAdd int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, type, assigned_user_id, specialist_type, status, created_at, updated_at)
		VALUES (971022,'arsitek',$1,'hG spec was','1200000','specialist_assignment',$2,'structural','approved_unpaid',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, owner.id, structUser.id).Scan(&specAdd); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971022", "type": "addendum", "id": itoaTest(specAdd)})
	if rec.Code != http.StatusOK {
		t.Fatalf("specwas proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &structUser, vpath("971022", "addendum", itoaTest(specAdd)))
	if rec.Code != http.StatusOK {
		t.Fatalf("specwas = %d %s", rec.Code, rec.Body.String())
	}
	var subStatus string
	var structSlot *int64
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_sub_professionals WHERE id=$1`, specSub).Scan(&subStatus)
	_ = pool.QueryRow(ctx, `SELECT structural_id FROM projects WHERE id=971022`).Scan(&structSlot)
	if subStatus != "active" || structSlot == nil || *structSlot != structUser.id+100000 {
		t.Fatalf("specwas = %q/%v, want active/%d", subStatus, structSlot, structUser.id+100000)
	}

	// --- insufficient twin on the poor project ---
	var poorAdd int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (971023,'arsitek',$1,'hG poor','800000','approved_unpaid',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, arsUser.id).Scan(&poorAdd); err != nil {
		t.Fatal(err)
	}
	rec = hAMultipartCall(t, UploadProofHandler(pool), "/api/x", nil, "proof", "hG.pdf", hDProofPDF, &owner, map[string]string{"project": "971023", "type": "addendum", "id": itoaTest(poorAdd)})
	if rec.Code != http.StatusOK {
		t.Fatalf("poor proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyProofHandler(pool), http.MethodPost, "/api/x", `{"action":"accept"}`, &arsUser, vpath("971023", "addendum", itoaTest(poorAdd)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("poor verify = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Project budget is insufficient for this payment (800,000). Available: 100,000. Please increase the project budget first." {
		t.Fatalf("poor verify message = %q", got)
	}
	var poorStatus string
	var poorLedger int
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, poorAdd).Scan(&poorStatus)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=971023 AND transaction_type='payment'`).Scan(&poorLedger)
	if poorStatus != "verifying" || poorLedger != 0 {
		t.Fatalf("poor rollback = %q/%d, want verifying/0", poorStatus, poorLedger)
	}

	// --- direct twins ---
	if verifyLabel(&verifyTarget{label: strPtr("hG L")}) != "hG L" || verifyLabel(&verifyTarget{title: strPtr("hG T")}) != "hG T" {
		t.Fatalf("verifyLabel direct wrong")
	}
	if verifyNotifyLabel(&verifyTarget{label: strPtr("hG L")}, "termin") != "hG L" {
		t.Fatalf("verifyNotifyLabel label wrong")
	}
	if verifyNotifyLabel(&verifyTarget{}, "pm_bid") != "Pm bid" {
		t.Fatalf("verifyNotifyLabel fallback wrong")
	}
	if verifyAmountMinor(&verifyTarget{table: "project_addendums", amount: strPtr("800000")}) != 80000000 {
		t.Fatalf("verifyAmountMinor addendum wrong")
	}
	if verifyAmountMinor(&verifyTarget{table: "material_orders", total: strPtr("400000"), shipping: strPtr("50000")}) != 45000000 {
		t.Fatalf("verifyAmountMinor material wrong")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if verifyHiredUserID(ctx, tx, 971022, "arsitek") == nil {
		tx.Rollback(ctx)
		t.Fatalf("verifyHiredUserID hired nil")
	}
	if verifyProjectOf(ctx, tx, &verifyTarget{table: "project_payment_termins", physID: termAcc}) != 971022 {
		tx.Rollback(ctx)
		t.Fatalf("verifyProjectOf termin wrong")
	}
	if verifyProjectOf(ctx, tx, &verifyTarget{table: "project_addendums", physID: addAcc}) != 971022 {
		tx.Rollback(ctx)
		t.Fatalf("verifyProjectOf addendum wrong")
	}
	if verifyProjectOf(ctx, tx, &verifyTarget{table: "material_orders", physID: matAcc}) != 971022 {
		tx.Rollback(ctx)
		t.Fatalf("verifyProjectOf material wrong")
	}
	if verifyProjectOf(ctx, tx, &verifyTarget{table: "bids", physID: bidArs}) != 971022 {
		tx.Rollback(ctx)
		t.Fatalf("verifyProjectOf bids wrong")
	}
	tx.Rollback(ctx)

	_ = stranger
	_ = bidArs
	hGCleanupVault(t, pool)
	hGCleanup(t, pool)
	hGAssertNoLeftovers(t, pool)
}
