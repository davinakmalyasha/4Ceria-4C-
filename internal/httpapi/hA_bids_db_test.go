package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestHABids(t *testing.T) {
	pool := hAPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 910051, "user", "ha-bid-owner@example.test", "hA Bid Owner")
	arsitekUser := hAMkUser(t, pool, 910052, "arsitek", "ha-bid-ars@example.test", "hA Bid Ars")
	kontraktorUser := hAMkUser(t, pool, 910053, "kontraktor", "ha-bid-kontra@example.test", "hA Bid Kontra")
	notarisUser := hAMkUser(t, pool, 910054, "notaris", "ha-bid-not@example.test", "hA Bid Not")
	interiorUser := hAMkUser(t, pool, 910055, "interior", "ha-bid-int@example.test", "hA Bid Int")
	pmUser := hAMkUser(t, pool, 910056, "project_manager", "ha-bid-pm@example.test", "hA Bid PM")
	stranger := hAMkUser(t, pool, 910057, "user", "ha-bid-stranger@example.test", "hA Bid Stranger")
	unverifiedUser := hAMkUser(t, pool, 910058, "arsitek", "ha-bid-unver@example.test", "hA Bid Unver")
	t.Cleanup(func() { hACleanupUsers(t, pool) })
	// make unverified profile pending
	if _, err := pool.Exec(ctx, `UPDATE arsiteks SET verification_status='pending' WHERE user_id=910058`); err != nil {
		t.Fatal(err)
	}

	hAMkProject(t, pool, 911051, owner.id, "hA bid project", "open", "both", 850000000)
	hAMkProject(t, pool, 911052, owner.id, "hA bid project closed", "completed", "both", 850000000)
	hAMkProject(t, pool, 911053, owner.id, "hA bid project arsitek-only", "open", "arsitek", 850000000)

	// --- GetProjectBids ---
	rec := hACall(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/projects/911051/bids", "", nil, "911051")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bids unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/x/abc", "", &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("bids bad-id = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/projects/999999999/bids", "", &owner, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("bids missing = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/projects/911051/bids", "", &stranger, "911051")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("bids forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized access to project bids." {
		t.Fatalf("bids forbidden message = %q", got)
	}
	rec = hACall(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/projects/911051/bids", "", &owner, "911051")
	if rec.Code != http.StatusOK {
		t.Fatalf("bids owner = %d %s", rec.Code, rec.Body.String())
	}

	// --- SubmitProjectBid ---
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":1000000,"proposal":"hA"}`, nil, "911051")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("submit unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/x/abc", `{"price":1,"proposal":"hA"}`, &arsitekUser, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("submit bad-id = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/999999999/bids", `{"price":1,"proposal":"hA"}`, &arsitekUser, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("submit missing = %d %s", rec.Code, rec.Body.String())
	}
	// non-professional
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":1000000,"proposal":"hA prop"}`, &owner, "911051")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("submit non-pro = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Only verified professionals can submit bids." {
		t.Fatalf("submit non-pro message = %q", got)
	}
	// unverified
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":1000000,"proposal":"hA prop"}`, &unverifiedUser, "911051")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("submit unverified = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Your professional profile is still awaiting verification, so you cannot bid yet. We will notify you once it is approved." {
		t.Fatalf("submit unverified message = %q", got)
	}
	// closed status
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911052/bids", `{"price":1000000,"proposal":"hA prop"}`, &arsitekUser, "911052")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("submit closed = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This project is no longer accepting bids." {
		t.Fatalf("submit closed message = %q", got)
	}
	// target mismatch
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911053/bids", `{"price":1000000,"proposal":"hA prop"}`, &kontraktorUser, "911053")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("submit target = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This project is not seeking a kontraktor." {
		t.Fatalf("submit target message = %q", got)
	}
	// validation: empty
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{}`, &arsitekUser, "911051")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("submit invalid = %d %s", rec.Code, rec.Body.String())
	}
	// validation: zero price for arsitek
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":0,"proposal":"hA prop"}`, &arsitekUser, "911051")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("submit zero price = %d %s", rec.Code, rec.Body.String())
	}
	// notaris zero fee -> grandTotal 0 -> 422 Proposed fee
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":0,"proposal":"hA notaris zero"}`, &notarisUser, "911051")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("submit zero total = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Proposed fee must be greater than zero." {
		t.Fatalf("submit zero total message = %q", got)
	}
	// happy arsitek
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":50000000,"proposal":"hA arsitek proposal","estimated_duration":4,"duration_unit":"weeks"}`, &arsitekUser, "911051")
	if rec.Code != http.StatusOK {
		t.Fatalf("submit arsitek = %d %s", rec.Code, rec.Body.String())
	}
	var arsBid int64
	_ = pool.QueryRow(ctx, `SELECT id FROM bids WHERE project_id=911051 AND role='arsitek' ORDER BY id DESC LIMIT 1`).Scan(&arsBid)
	if arsBid == 0 {
		t.Fatalf("no arsitek bid")
	}
	// happy writes exact minor-unit literals: price 50000000.00, total 50000000.00, pending
	var arsPrice, arsTotal, arsStatus string
	_ = pool.QueryRow(ctx, `SELECT price::text, calculated_total::text, status::text FROM bids WHERE id=$1`, arsBid).Scan(&arsPrice, &arsTotal, &arsStatus)
	if arsPrice != "50000000.00" || arsTotal != "50000000.00" || arsStatus != "pending" {
		t.Fatalf("arsitek bid = %q/%q/%q, want 50000000.00/50000000.00/pending", arsPrice, arsTotal, arsStatus)
	}
	// duplicate
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":60000000,"proposal":"hA dup"}`, &arsitekUser, "911051")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("submit dup = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "You have already submitted a bid for this project." {
		t.Fatalf("submit dup message = %q", got)
	}
	// owner can now read bids (bidder can too)
	rec = hACall(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/projects/911051/bids", "", &arsitekUser, "911051")
	if rec.Code != http.StatusOK {
		t.Fatalf("bids bidder = %d %s", rec.Code, rec.Body.String())
	}
	// happy kontraktor + interior + pm for later accept tests
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":200000000,"proposal":"hA kontra proposal"}`, &kontraktorUser, "911051")
	if rec.Code != http.StatusOK {
		t.Fatalf("submit kontra = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":30000000,"proposal":"hA interior proposal"}`, &interiorUser, "911051")
	if rec.Code != http.StatusOK {
		t.Fatalf("submit interior = %d %s", rec.Code, rec.Body.String())
	}
	// PM submit (uses same endpoint? PM has own SubmitPMBid but also generic? test generic PM)
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911051/bids", `{"price":25000000,"proposal":"hA pm proposal"}`, &pmUser, "911051")
	if rec.Code != http.StatusOK {
		t.Fatalf("submit pm = %d %s", rec.Code, rec.Body.String())
	}
	// vacancy: hire arsitek then resubmit fails differently (already submitted covers, so test vacancy on fresh project)
	hAMkProject(t, pool, 911054, owner.id, "hA bid vacancy project", "open", "both", 850000000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1 WHERE id=911054`, arsitekUser.id+100000); err != nil {
		t.Fatal(err)
	}
	// need a different arsitek to hit vacancy (same user would hit duplicate first? Actually duplicate check is per profile; vacancy check is before duplicate, so same user hits vacancy first)
	rec = hACall(t, SubmitProjectBidHandler(pool), http.MethodPost, "/api/projects/911054/bids", `{"price":50000000,"proposal":"hA vacancy"}`, &arsitekUser, "911054")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("submit vacancy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "An architect has already been hired for this project." {
		t.Fatalf("submit vacancy message = %q", got)
	}

	// --- AcceptBid / DeclineBid ---
	// unauth
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911051/accept-bid", `{"bid_id":1,"bid_type":"arsitek"}`, nil, "911051")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("accept unauth = %d", rec.Code)
	}
	// bad project
	rec = hACallWithPaths(t, AcceptBidHandler(pool), http.MethodPost, "/api/x/abc", `{"bid_id":1,"bid_type":"arsitek"}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("accept bad-id = %d", rec.Code)
	}
	// forbidden (stranger)
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911051/accept-bid", `{"bid_id":`+itoaTest(arsBid)+`,"bid_type":"arsitek"}`, &stranger, "911051")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("accept forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the Project Owner or Hired Project Manager can finalize hiring." {
		t.Fatalf("accept forbidden message = %q", got)
	}
	// validation
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911051/accept-bid", `{}`, &owner, "911051")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept invalid = %d %s", rec.Code, rec.Body.String())
	}
	// missing bid
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911051/accept-bid", `{"bid_id":999999999,"bid_type":"arsitek"}`, &owner, "911051")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("accept missing bid = %d %s", rec.Code, rec.Body.String())
	}
	// zero-fee bid cannot be hired
	var zeroBid int64
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, offered_by_id)
		VALUES (911053,'arsitek',$1,$2,$2,'0','0','hA zero','pending',$1) RETURNING id`, arsitekUser.id, arsitekUser.id+100000).Scan(&zeroBid)
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911053/accept-bid", `{"bid_id":`+itoaTest(zeroBid)+`,"bid_type":"arsitek"}`, &owner, "911053")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept zero fee = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Cannot hire a professional with a Rp 0 fee. Please negotiate terms first." {
		t.Fatalf("accept zero message = %q", got)
	}
	// wrong status (rejected)
	if _, err := pool.Exec(ctx, `UPDATE bids SET status='rejected' WHERE id=$1`, zeroBid); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911053/accept-bid", `{"bid_id":`+itoaTest(zeroBid)+`,"bid_type":"arsitek"}`, &owner, "911053")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept bad status = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "You must shortlist, negotiate, or have a pending bid first before hiring." {
		t.Fatalf("accept status message = %q", got)
	}
	// happy accept arsitek on 911051
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911051/accept-bid", `{"bid_id":`+itoaTest(arsBid)+`,"bid_type":"arsitek"}`, &owner, "911051")
	if rec.Code != http.StatusOK {
		t.Fatalf("accept ok = %d %s", rec.Code, rec.Body.String())
	}
	// happy hires the profile: selected_arsitek_id = 1010052 (910052+100000 hand literal), bid contract_pending
	var hiredArs int64
	var arsBidStatus string
	_ = pool.QueryRow(ctx, `SELECT selected_arsitek_id FROM projects WHERE id=911051`).Scan(&hiredArs)
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id=$1`, arsBid).Scan(&arsBidStatus)
	if hiredArs != 1010052 || arsBidStatus != "contract_pending" {
		t.Fatalf("accept hire = profile %d status %q, want 1010052/contract_pending", hiredArs, arsBidStatus)
	}
	// already hired -> 422
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911051/accept-bid", `{"bid_id":`+itoaTest(arsBid)+`,"bid_type":"arsitek"}`, &owner, "911051")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept hired = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This role already has a hired professional or a pending contract." {
		t.Fatalf("accept hired message = %q", got)
	}
	// decline: forbidden, validation, missing, happy
	var kontraBid int64
	_ = pool.QueryRow(ctx, `SELECT id FROM bids WHERE project_id=911051 AND role='kontraktor' ORDER BY id DESC LIMIT 1`).Scan(&kontraBid)
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/911051/decline-bid", `{"bid_id":`+itoaTest(kontraBid)+`,"bid_type":"kontraktor"}`, &stranger, "911051")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("decline forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Must be project owner or the assigned Project Manager." {
		t.Fatalf("decline forbidden message = %q", got)
	}
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/911051/decline-bid", `{}`, &owner, "911051")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("decline invalid = %d", rec.Code)
	}
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/911051/decline-bid", `{"bid_id":999999999,"bid_type":"kontraktor"}`, &owner, "911051")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("decline missing = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, DeclineBidHandler(pool), http.MethodPost, "/api/projects/911051/decline-bid", `{"bid_id":`+itoaTest(kontraBid)+`,"bid_type":"kontraktor"}`, &owner, "911051")
	if rec.Code != http.StatusOK {
		t.Fatalf("decline ok = %d %s", rec.Code, rec.Body.String())
	}
	var kontraStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id=$1`, kontraBid).Scan(&kontraStatus)
	if kontraStatus != "rejected" {
		t.Fatalf("decline status = %q, want rejected", kontraStatus)
	}
	// PM recommend branch: project with PM, PM accepts -> recommend (not hire)
	hAMkProject(t, pool, 911055, owner.id, "hA bid pm-recommend project", "open", "both", 850000000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id=$1 WHERE id=911055`, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}
	var recBid int64
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, interior_id, price, calculated_total, proposal, status, offered_by_id)
		VALUES (911055,'interior',$1,$2,$2,'40000000','40000000','hA rec','pending',$1) RETURNING id`, interiorUser.id, interiorUser.id+100000).Scan(&recBid)
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911055/accept-bid", `{"bid_id":`+itoaTest(recBid)+`,"bid_type":"interior"}`, &pmUser, "911055")
	if rec.Code != http.StatusOK {
		t.Fatalf("accept pm-recommend = %d %s", rec.Code, rec.Body.String())
	}
	var recFlag bool
	_ = pool.QueryRow(ctx, `SELECT is_recommended FROM bids WHERE id=$1`, recBid).Scan(&recFlag)
	if !recFlag {
		t.Fatalf("pm recommend flag = false, want true")
	}
	// owner now blocked until recommended? Actually after recommend, is_recommended=true, owner can hire. Test owner hire after recommend.
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911055/accept-bid", `{"bid_id":`+itoaTest(recBid)+`,"bid_type":"interior"}`, &owner, "911055")
	if rec.Code != http.StatusOK {
		t.Fatalf("accept owner after recommend = %d %s", rec.Code, rec.Body.String())
	}
	// owner blocked when PM set but not recommended: fresh bid
	var recBid2 int64
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, offered_by_id)
		VALUES (911055,'arsitek',$1,$2,$2,'50000000','50000000','hA rec2','pending',$1) RETURNING id`, arsitekUser.id, arsitekUser.id+100000).Scan(&recBid2)
	rec = hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/911055/accept-bid", `{"bid_id":`+itoaTest(recBid2)+`,"bid_type":"arsitek"}`, &owner, "911055")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("accept owner w/o recommend = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. The Project Manager must recommend this professional first." {
		t.Fatalf("accept no-recommend message = %q", got)
	}

	hACleanupUsers(t, pool)
	hAAssertNoLeftovers(t, pool)
}
