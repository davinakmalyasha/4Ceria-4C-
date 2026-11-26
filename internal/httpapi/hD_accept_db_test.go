package httpapi

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestHDAcceptExtras(t *testing.T) {
	pool := hDPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 940061, "user", "hd-ac-owner@example.test", "hD AC Owner")
	structUser := hAMkUser(t, pool, 940062, "structural", "hd-ac-struct@example.test", "hD AC Struct")
	mepUser := hAMkUser(t, pool, 940063, "mep", "hd-ac-mep@example.test", "hD AC Mep")
	notUser := hAMkUser(t, pool, 940064, "notaris", "hd-ac-not@example.test", "hD AC Not")
	intUser := hAMkUser(t, pool, 940065, "interior", "hd-ac-int@example.test", "hD AC Int")
	kontUser := hAMkUser(t, pool, 940066, "kontraktor", "hd-ac-kontra@example.test", "hD AC Kontra")
	kontUser2 := hAMkUser(t, pool, 940067, "kontraktor", "hd-ac-kontra2@example.test", "hD AC Kontra2")
	arsUser := hAMkUser(t, pool, 940068, "arsitek", "hd-ac-ars@example.test", "hD AC Ars")
	t.Cleanup(func() {
		hDCleanupVault(t, pool)
		hDCleanup(t, pool)
	})

	hAMkProject(t, pool, 941061, owner.id, "hD accept extras project", "in_progress", "both", 800000000)
	hAMkProject(t, pool, 941062, owner.id, "hD negotiate extras project", "open", "both", 800000000)

	bid := func(project int64, role string, userID int64, price, total, status string) int64 {
		t.Helper()
		column := map[string]string{"arsitek": "arsitek_id", "kontraktor": "kontraktor_id", "notaris": "notaris_id", "interior": "interior_id", "structural": "structural_id", "mep": "mep_id"}[role]
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, `+column+`, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
			VALUES ($1,$2,$3,$4,$4,$5,$6,'hD prop','`+status+`','fixed',$3,0) RETURNING id`,
			project, role, userID, userID+100000, price, total).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}

	kontraBid := bid(941061, "kontraktor", kontUser.id, "200000000", "200000000", "shortlisted")
	structBid := bid(941061, "structural", structUser.id, "12000000", "12000000", "shortlisted")
	mepBid := bid(941061, "mep", mepUser.id, "9000000", "9000000", "shortlisted")
	intBid := bid(941061, "interior", intUser.id, "30000000", "30000000", "shortlisted")
	var notBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, notaris_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count, selected_services, tax_estimate)
		VALUES (941061,'notaris',$1,$2,$2,'20000000','25000000','hD not prop','shortlisted','fixed',$1,0,'[{"id":"shm_shgb","title":"Sertifikat"}]'::jsonb,'5000000') RETURNING id`,
		notUser.id, notUser.id+100000).Scan(&notBid); err != nil {
		t.Fatal(err)
	}
	kontraBid2 := bid(941061, "kontraktor", kontUser2.id, "210000000", "210000000", "pending")

	accept := func(bidID int64, role string) *struct{ code int } {
		t.Helper()
		rec := hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/941061/accept-bid",
			`{"bid_id":`+itoaTest(bidID)+`,"bid_type":"`+role+`"}`, &owner, "941061")
		if rec.Code != http.StatusOK {
			t.Fatalf("accept %s = %d %s", role, rec.Code, rec.Body.String())
		}
		return &struct{ code int }{rec.Code}
	}

	// --- decline with reason pins the notification twin ---
	// (runs before any accept: accepting rejects the role's other bids)
	rec := hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/941061/decline-bid",
		`{"bid_id":`+itoaTest(kontraBid2)+`,"bid_type":"kontraktor","reason":"hD reason"}`, &owner, "941061")
	if rec.Code != http.StatusOK {
		t.Fatalf("decline reason = %d %s", rec.Code, rec.Body.String())
	}
	var rejBody string
	var rejData string
	_ = pool.QueryRow(ctx, `SELECT body, data FROM notifications WHERE user_id=$1 AND type='bid_rejected' ORDER BY id DESC LIMIT 1`, kontUser2.id).Scan(&rejBody, &rejData)
	if !strings.Contains(rejBody, "Reason: hD reason") || !strings.Contains(rejData, `"rejection_reason": "hD reason"`) {
		t.Fatalf("decline reason note = %q / %q", rejBody, rejData)
	}

	// --- kontraktor first: implicit design verify + kickoff milestone ---
	accept(kontraBid, "kontraktor")
	var designAt, lockAt, doneAt *string
	var phases string
	_ = pool.QueryRow(ctx, `SELECT owner_design_approved_at::text, design_locked_at::text, design_completed_at::text, completed_phases::text FROM projects WHERE id=941061`).Scan(&designAt, &lockAt, &doneAt, &phases)
	if designAt == nil || lockAt == nil || doneAt == nil || !strings.Contains(phases, "design") {
		t.Fatalf("design verify = %v/%v/%v/%q", designAt, lockAt, doneAt, phases)
	}
	var designLog int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=941061 AND action='design_verified'`).Scan(&designLog)
	if designLog != 1 {
		t.Fatalf("design log rows = %d, want 1", designLog)
	}
	var kickCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE project_id=941061 AND title='Project Kickoff'`).Scan(&kickCount)
	if kickCount != 1 {
		t.Fatalf("kickoff rows = %d, want 1", kickCount)
	}
	var kontraStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id=$1`, kontraBid).Scan(&kontraStatus)
	if kontraStatus != "contract_pending" {
		t.Fatalf("kontraktor status = %q", kontraStatus)
	}

	// --- structural: no project slot write, budget addendum instead ---
	accept(structBid, "structural")
	var slotStruct *int64
	_ = pool.QueryRow(ctx, `SELECT structural_id FROM projects WHERE id=941061`).Scan(&slotStruct)
	if slotStruct != nil {
		t.Fatalf("structural slot written = %d, want NULL", *slotStruct)
	}
	var stTitle, stAmount, stStatus, stType string
	var stRec int64
	_ = pool.QueryRow(ctx, `SELECT title, amount::text, status::text, role_type::text, recommended_bid_id FROM project_addendums WHERE project_id=941061 AND recommended_bid_type='structural'`).Scan(&stTitle, &stAmount, &stStatus, &stType, &stRec)
	if stTitle != "Structural Engineer Budget Authorization" || stAmount != "12000000.00" || stStatus != "pending_approval" || stType != "structural" || stRec != structBid {
		t.Fatalf("structural addendum = %q/%q/%q/%q/%d", stTitle, stAmount, stStatus, stType, stRec)
	}

	// --- mep twin ---
	accept(mepBid, "mep")
	var mepTitle, mepAmount string
	_ = pool.QueryRow(ctx, `SELECT title, amount::text FROM project_addendums WHERE project_id=941061 AND recommended_bid_type='mep'`).Scan(&mepTitle, &mepAmount)
	if mepTitle != "MEP Engineer Budget Authorization" || mepAmount != "9000000.00" {
		t.Fatalf("mep addendum = %q/%q", mepTitle, mepAmount)
	}

	// --- interior: bidder notification + slot ---
	accept(intBid, "interior")
	var intSlot int64
	_ = pool.QueryRow(ctx, `SELECT selected_interior_id FROM projects WHERE id=941061`).Scan(&intSlot)
	if intSlot != intUser.id+100000 {
		t.Fatalf("interior slot = %d, want %d", intSlot, intUser.id+100000)
	}
	var intNotif int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='bid_accepted'`, intUser.id).Scan(&intNotif)
	if intNotif != 1 {
		t.Fatalf("interior notification rows = %d, want 1", intNotif)
	}

	// --- notaris: legal scope + tax addendum + notification ---
	accept(notBid, "notaris")
	var legalReqs string
	_ = pool.QueryRow(ctx, `SELECT legal_requirements::text FROM projects WHERE id=941061`).Scan(&legalReqs)
	if !strings.Contains(legalReqs, "shm_shgb") || !strings.Contains(legalReqs, "misc_legal") {
		t.Fatalf("legal requirements = %q", legalReqs)
	}
	var legalMs int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_milestones WHERE project_id=941061 AND phase_context='legal' AND notaris_id=$1 AND approval_status='drafting'`, notUser.id+100000).Scan(&legalMs)
	if legalMs != 2 {
		t.Fatalf("legal milestones = %d, want 2", legalMs)
	}
	var taxTitle, taxAmount, taxStatus string
	var taxRec int64
	_ = pool.QueryRow(ctx, `SELECT title, amount::text, status::text, recommended_bid_id FROM project_addendums WHERE project_id=941061 AND role_type='notaris'`).Scan(&taxTitle, &taxAmount, &taxStatus, &taxRec)
	if taxTitle != "Legal Tax Estimate Confirmation" || taxAmount != "5000000.00" || taxStatus != "pending_approval" || taxRec != notBid {
		t.Fatalf("tax addendum = %q/%q/%q/%d", taxTitle, taxAmount, taxStatus, taxRec)
	}
	var notSlot int64
	_ = pool.QueryRow(ctx, `SELECT selected_notaris_id FROM projects WHERE id=941061`).Scan(&notSlot)
	if notSlot != notUser.id+100000 {
		t.Fatalf("notaris slot = %d, want %d", notSlot, notUser.id+100000)
	}

	// --- negotiate extras on 941062 ---
	_ = bid(941062, "notaris", notUser.id, "1000000", "1000000", "shortlisted")
	_ = bid(941062, "arsitek", arsUser.id, "50000000", "50000000", "shortlisted")
	negoPath := func(bidID int64) map[string]string {
		return map[string]string{"project": "941062", "bid": itoaTest(bidID)}
	}
	var notBid2 int64
	_ = pool.QueryRow(ctx, `SELECT id FROM bids WHERE project_id=941062 AND role='notaris'`).Scan(&notBid2)
	// notaris price 0 passes the price rule but totals zero
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x",
		`{"bid_type":"notaris","price":0}`, &owner, negoPath(notBid2))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("negotiate notaris zero = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Proposed fee must be greater than zero." {
		t.Fatalf("negotiate notaris zero message = %q", got)
	}
	var arsBid2 int64
	_ = pool.QueryRow(ctx, `SELECT id FROM bids WHERE project_id=941062 AND role='arsitek'`).Scan(&arsBid2)
	// arsitek price 0 fails the min rule
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x",
		`{"bid_type":"arsitek","price":0}`, &owner, negoPath(arsBid2))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("negotiate ars zero = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The price field must be greater than 0." {
		t.Fatalf("negotiate ars zero message = %q", got)
	}
	// non-string bid_type fails only the in rule on negotiate
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x",
		`{"bid_type":1,"price":100}`, &owner, negoPath(arsBid2))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("negotiate typenum = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The selected bid type is invalid." {
		t.Fatalf("negotiate typenum message = %q", got)
	}
	// proposed_team percentage totals ride on top
	if _, err := pool.Exec(ctx, `UPDATE bids SET proposed_team='[{"fee":10,"fee_type":"percentage","name":"hD","role_title":"hD","role":"hD"}]'::jsonb, offered_by_id=$2 WHERE id=$1`, arsBid2, arsUser.id); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x",
		`{"bid_type":"arsitek","price":60000000}`, &owner, negoPath(arsBid2))
	if rec.Code != http.StatusOK {
		t.Fatalf("negotiate team ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Fee proposal submitted (1/5)." {
		t.Fatalf("negotiate team message = %q", got)
	}
	var teamTotal string
	var teamCount int64
	_ = pool.QueryRow(ctx, `SELECT calculated_total::text, negotiation_count FROM bids WHERE id=$1`, arsBid2).Scan(&teamTotal, &teamCount)
	if teamTotal != "66000000.00" || teamCount != 1 {
		t.Fatalf("negotiate team row = %q/%d, want 66000000.00/1", teamTotal, teamCount)
	}
	// owner confirms the pro's latest counter: shortlists + stamps
	if _, err := pool.Exec(ctx, `UPDATE bids SET status='negotiating', offered_by_id=$2, negotiation_count=2 WHERE id=$1`, arsBid2, arsUser.id); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/x",
		`{"bid_type":"arsitek"}`, &owner, negoPath(arsBid2))
	if rec.Code != http.StatusOK {
		t.Fatalf("confirm owner = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Fee agreement confirmed." {
		t.Fatalf("confirm owner message = %q", got)
	}
	var confStatus string
	var confAgreed *string
	_ = pool.QueryRow(ctx, `SELECT status::text, fee_agreed_at::text FROM bids WHERE id=$1`, arsBid2).Scan(&confStatus, &confAgreed)
	if confStatus != "shortlisted" || confAgreed == nil {
		t.Fatalf("confirm owner row = %q/%v, want shortlisted/set", confStatus, confAgreed)
	}
	// non-string bid_type fails BOTH rules on confirm/invite paths
	rec = hACallWithPaths(t, AcceptInviteHandler(pool), http.MethodPost, "/api/x", `{"bid_type":1}`, &arsUser, negoPath(arsBid2))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invite typenum = %d", rec.Code)
	}
	if list, _ := hADecode(t, rec)["errors"].(map[string]any)["bid_type"].([]any); len(list) != 2 ||
		list[0] != "The bid type field must be a string." || list[1] != "The selected bid type is invalid." {
		t.Fatalf("invite typenum errors = %v", list)
	}

	// --- dead-code unit twins (no callers, pinned directly) ---
	if bidOfferedBy(map[string]any{"offered_by_id": int64(7)}) != 7 {
		t.Fatalf("bidOfferedBy int64 wrong")
	}
	if bidOfferedBy(map[string]any{"offered_by_id": int32(7)}) != 7 {
		t.Fatalf("bidOfferedBy int32 wrong")
	}
	if bidOfferedBy(map[string]any{"offered_by_id": 7}) != 7 {
		t.Fatalf("bidOfferedBy int wrong")
	}
	if bidOfferedBy(map[string]any{}) != 0 {
		t.Fatalf("bidOfferedBy missing wrong")
	}
	if bidNegCount(map[string]any{"negotiation_count": int64(3)}) != 3 {
		t.Fatalf("bidNegCount int64 wrong")
	}
	if bidNegCount(map[string]any{"negotiation_count": int(3)}) != 3 {
		t.Fatalf("bidNegCount int wrong")
	}
	if bidNegCount(map[string]any{}) != 0 {
		t.Fatalf("bidNegCount missing wrong")
	}
	if legalLabel("shm_shgb") != "Sertifikat Tanah (SHM/SHGB)" {
		t.Fatalf("legalLabel known = %q", legalLabel("shm_shgb"))
	}
	if legalLabel("foo_bar") != "Foo Bar" {
		t.Fatalf("legalLabel unknown = %q", legalLabel("foo_bar"))
	}
	if ucfirst("kontraktor") != "Kontraktor" || ucfirst("") != "" {
		t.Fatalf("ucfirst wrong")
	}
	if stringOrNilJSON(map[string]any{"a": 1}) != `{"a":1}` {
		t.Fatalf("stringOrNilJSON = %q", stringOrNilJSON(map[string]any{"a": 1}))
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	profile := arsUser.id + 100000
	if got := decisisonBidderUserID(ctx, tx, "arsitek", map[string]any{"arsitek_id": profile}); got == nil || *got != arsUser.id {
		tx.Rollback(ctx)
		t.Fatalf("decisisonBidderUserID = %v, want %d", got, arsUser.id)
	}
	if decisisonBidderUserID(ctx, tx, "bogus", map[string]any{}) != nil {
		tx.Rollback(ctx)
		t.Fatalf("decisisonBidderUserID bogus non-nil")
	}
	if decisisonBidderUserID(ctx, tx, "arsitek", map[string]any{"arsitek_id": int64(0)}) != nil {
		tx.Rollback(ctx)
		t.Fatalf("decisisonBidderUserID zero non-nil")
	}
	if got := txLeadUserID(ctx, tx, "arsiteks", &profile); got == nil || *got != arsUser.id {
		tx.Rollback(ctx)
		t.Fatalf("txLeadUserID = %v, want %d", got, arsUser.id)
	}
	if txLeadUserID(ctx, tx, "arsiteks", nil) != nil {
		tx.Rollback(ctx)
		t.Fatalf("txLeadUserID nil non-nil")
	}
	zero := int64(0)
	if txLeadUserID(ctx, tx, "arsiteks", &zero) != nil {
		tx.Rollback(ctx)
		t.Fatalf("txLeadUserID zero non-nil")
	}
	missing := int64(999999999)
	if txLeadUserID(ctx, tx, "arsiteks", &missing) != nil {
		tx.Rollback(ctx)
		t.Fatalf("txLeadUserID missing non-nil")
	}
	tx.Rollback(ctx)

	hDCleanupVault(t, pool)
	hDCleanup(t, pool)
	hDAssertNoLeftovers(t, pool)
}
