package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestHABidAction(t *testing.T) {
	pool := hAPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 910061, "user", "ha-act-owner@example.test", "hA Act Owner")
	arsitekUser := hAMkUser(t, pool, 910062, "arsitek", "ha-act-ars@example.test", "hA Act Ars")
	kontraktorUser := hAMkUser(t, pool, 910063, "kontraktor", "ha-act-kontra@example.test", "hA Act Kontra")
	arsitekUser2 := hAMkUser(t, pool, 910065, "arsitek", "ha-act-ars2@example.test", "hA Act Ars2")
	stranger := hAMkUser(t, pool, 910064, "user", "ha-act-stranger@example.test", "hA Act Stranger")
	t.Cleanup(func() { hACleanupUsers(t, pool) })

	hAMkProject(t, pool, 911061, owner.id, "hA bid action project", "open", "both", 850000000)

	// invited bids for accept/reject invite
	var invArs, invKontra int64
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, proposal, status, offered_by_id)
		VALUES (911061,'arsitek',$1,$2,$2,'55000000','hA inv ars','invited',$1) RETURNING id`, arsitekUser.id, arsitekUser.id+100000).Scan(&invArs)
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, price, proposal, status, offered_by_id)
		VALUES (911061,'kontraktor',$1,$2,$2,'210000000','hA inv kontra','invited',$1) RETURNING id`, kontraktorUser.id, kontraktorUser.id+100000).Scan(&invKontra)

	// AcceptInvite: unauth, bad project, validation, missing, forbidden, not-active, happy
	rec := hACallWithPaths(t, AcceptInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/accept-invite", `{"bid_type":"arsitek"}`, nil, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("accept-invite unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, AcceptInviteHandler(pool), http.MethodPost, "/api/x/abc/accept-invite", `{"bid_type":"arsitek"}`, &arsitekUser, map[string]string{"project": "abc", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("accept-invite bad-project = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, AcceptInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/accept-invite", `{}`, &arsitekUser, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept-invite invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, AcceptInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/999999999/accept-invite", `{"bid_type":"arsitek"}`, &arsitekUser, map[string]string{"project": "911061", "bid": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("accept-invite missing = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, AcceptInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/accept-invite", `{"bid_type":"arsitek"}`, &stranger, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("accept-invite forbidden = %d %s", rec.Code, rec.Body.String())
	}
	// not-active: use a pending bid from a second arsitek (unique is per bidder)
	var pendBid int64
	_ = pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, proposal, status, offered_by_id)
		VALUES (911061,'arsitek',$1,$2,$2,'56000000','hA pend','pending',$1) RETURNING id`, arsitekUser2.id, arsitekUser2.id+100000).Scan(&pendBid)
	rec = hACallWithPaths(t, AcceptInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/accept-invite", `{"bid_type":"arsitek"}`, &arsitekUser2, map[string]string{"project": "911061", "bid": itoaTest(pendBid)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept-invite not-active = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This invitation is no longer active." {
		t.Fatalf("accept-invite not-active message = %q", got)
	}
	rec = hACallWithPaths(t, AcceptInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/accept-invite", `{"bid_type":"arsitek"}`, &arsitekUser, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusOK {
		t.Fatalf("accept-invite ok = %d %s", rec.Code, rec.Body.String())
	}
	var invStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id=$1`, invArs).Scan(&invStatus)
	if invStatus != "shortlisted" {
		t.Fatalf("accept-invite status = %q, want shortlisted", invStatus)
	}

	// RejectInvite: validation, missing, forbidden, happy
	rec = hACallWithPaths(t, RejectInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/reject-invite", `{}`, &kontraktorUser, map[string]string{"project": "911061", "bid": itoaTest(invKontra)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reject-invite invalid = %d", rec.Code)
	}
	rec = hACallWithPaths(t, RejectInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/999999999/reject-invite", `{"bid_type":"kontraktor"}`, &kontraktorUser, map[string]string{"project": "911061", "bid": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("reject-invite missing = %d", rec.Code)
	}
	rec = hACallWithPaths(t, RejectInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/reject-invite", `{"bid_type":"kontraktor"}`, &stranger, map[string]string{"project": "911061", "bid": itoaTest(invKontra)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("reject-invite forbidden = %d", rec.Code)
	}
	rec = hACallWithPaths(t, RejectInviteHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/reject-invite", `{"bid_type":"kontraktor"}`, &kontraktorUser, map[string]string{"project": "911061", "bid": itoaTest(invKontra)})
	if rec.Code != http.StatusOK {
		t.Fatalf("reject-invite ok = %d %s", rec.Code, rec.Body.String())
	}
	var rejStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id=$1`, invKontra).Scan(&rejStatus)
	if rejStatus != "rejected" {
		t.Fatalf("reject-invite status = %q, want rejected", rejStatus)
	}

	// Negotiate: need a live bid (use invArs now shortlisted)
	// unauth, bad project, validation, missing, forbidden, already-offered, limit, zero-total, happy
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/negotiate", `{"bid_type":"arsitek","price":60000000}`, nil, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("negotiate unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x/abc/negotiate", `{"bid_type":"arsitek","price":1}`, &owner, map[string]string{"project": "abc", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("negotiate bad-project = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/negotiate", `{}`, &owner, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("negotiate invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/negotiate", `{"bid_type":"bogus","price":1}`, &owner, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("negotiate bad-type = %d", rec.Code)
	}
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/999999999/negotiate", `{"bid_type":"arsitek","price":60000000}`, &owner, map[string]string{"project": "911061", "bid": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("negotiate missing = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/negotiate", `{"bid_type":"arsitek","price":60000000}`, &stranger, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("negotiate forbidden = %d %s", rec.Code, rec.Body.String())
	}
	// selected_services must be array
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/negotiate", `{"bid_type":"arsitek","price":60000000,"selected_services":"nope"}`, &owner, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("negotiate services = %d %s", rec.Code, rec.Body.String())
	}
	// happy: owner counters (bid offered_by is arsitek, so owner can counter)
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/negotiate", `{"bid_type":"arsitek","price":60000000}`, &owner, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusOK {
		t.Fatalf("negotiate ok = %d %s", rec.Code, rec.Body.String())
	}
	// happy writes exact literals: price 60000000.00, total 60000000.00, negotiating, count 1
	var negPrice, negTotal, negStatus string
	var negCount int64
	var negOffered int64
	_ = pool.QueryRow(ctx, `SELECT price::text, calculated_total::text, status::text, negotiation_count, offered_by_id FROM bids WHERE id=$1`, invArs).Scan(&negPrice, &negTotal, &negStatus, &negCount, &negOffered)
	if negPrice != "60000000.00" || negTotal != "60000000.00" || negStatus != "negotiating" || negCount != 1 || negOffered != owner.id {
		t.Fatalf("negotiate row = %q/%q/%q/%d/%d, want 60000000.00/60000000.00/negotiating/1/%d", negPrice, negTotal, negStatus, negCount, negOffered, owner.id)
	}
	// already offered: owner just offered, owner counters again -> 422
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/negotiate", `{"bid_type":"arsitek","price":61000000}`, &owner, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("negotiate already-offered = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "You have already made an offer. Please wait for the other party to respond." {
		t.Fatalf("negotiate already message = %q", got)
	}
	// limit: set negotiation_count=5
	if _, err := pool.Exec(ctx, `UPDATE bids SET negotiation_count=5 WHERE id=$1`, invArs); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, NegotiateBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/negotiate", `{"bid_type":"arsitek","price":62000000}`, &arsitekUser, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("negotiate limit = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Negotiation limit reached (max 5 rounds). You can no longer counter-offer, but you can accept the current proposal (\"Agree on Fee\") or decline the bid." {
		t.Fatalf("negotiate limit message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE bids SET negotiation_count=1 WHERE id=$1`, invArs); err != nil {
		t.Fatal(err)
	}

	// Confirm: unauth, bad project, validation, missing, own-proposal, forbidden, happy
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/confirm-fee", `{"bid_type":"arsitek"}`, nil, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("confirm unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/x/abc/confirm-fee", `{"bid_type":"arsitek"}`, &owner, map[string]string{"project": "abc", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("confirm bad-project = %d", rec.Code)
	}
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/confirm-fee", `{}`, &owner, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("confirm invalid = %d", rec.Code)
	}
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/999999999/confirm-fee", `{"bid_type":"arsitek"}`, &owner, map[string]string{"project": "911061", "bid": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("confirm missing = %d", rec.Code)
	}
	// own proposal: last offer was owner, so owner confirming own -> 422
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/confirm-fee", `{"bid_type":"arsitek"}`, &owner, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("confirm own = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "You cannot confirm your own proposal. Wait for the other party." {
		t.Fatalf("confirm own message = %q", got)
	}
	// forbidden stranger
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/confirm-fee", `{"bid_type":"arsitek"}`, &stranger, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("confirm forbidden = %d %s", rec.Code, rec.Body.String())
	}
	// happy: arsitek confirms owner's counter (status negotiating -> shortlisted)
	if _, err := pool.Exec(ctx, `UPDATE bids SET status='negotiating' WHERE id=$1`, invArs); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, ConfirmBidFeeHandler(pool), http.MethodPost, "/api/projects/911061/bids/1/confirm-fee", `{"bid_type":"arsitek"}`, &arsitekUser, map[string]string{"project": "911061", "bid": itoaTest(invArs)})
	if rec.Code != http.StatusOK {
		t.Fatalf("confirm ok = %d %s", rec.Code, rec.Body.String())
	}
	var confStatus string
	var confAgreed *string
	_ = pool.QueryRow(ctx, `SELECT status::text, fee_agreed_at::text FROM bids WHERE id=$1`, invArs).Scan(&confStatus, &confAgreed)
	// pro confirms owner's counter: fee_agreed stamps, status stays negotiating (shortlist only on owner/PM confirm)
	if confStatus != "negotiating" || confAgreed == nil {
		t.Fatalf("confirm row = %q/%v, want negotiating/non-nil fee_agreed", confStatus, confAgreed)
	}

	hACleanupUsers(t, pool)
	hAAssertNoLeftovers(t, pool)
}
