package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestHDMarkPaid(t *testing.T) {
	pool := hDPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 940011, "user", "hd-mp-owner@example.test", "hD MP Owner")
	arsUser := hAMkUser(t, pool, 940012, "arsitek", "hd-mp-ars@example.test", "hD MP Ars")
	pmUser := hAMkUser(t, pool, 940013, "project_manager", "hd-mp-pm@example.test", "hD MP PM")
	structUser := hAMkUser(t, pool, 940014, "structural", "hd-mp-struct@example.test", "hD MP Struct")
	arsUser2 := hAMkUser(t, pool, 940016, "arsitek", "hd-mp-ars2@example.test", "hD MP Ars2")
	stranger := hAMkUser(t, pool, 940015, "user", "hd-mp-stranger@example.test", "hD MP Stranger")
	t.Cleanup(func() {
		hDCleanupVault(t, pool)
		hDCleanup(t, pool)
	})

	hAMkProject(t, pool, 941011, owner.id, "hD markpaid project", "open", "both", 800000000)
	hAMkProject(t, pool, 941012, owner.id, "hD markpaid poor project", "open", "both", 100000)
	hAMkProject(t, pool, 941013, owner.id, "hD markpaid pm project", "open", "both", 800000000)

	var arsBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (941011,'arsitek',$1,$2,$2,'60000000','60000000','hD ars prop','shortlisted','fixed',$1,0) RETURNING id`,
		arsUser.id, arsUser.id+100000).Scan(&arsBid); err != nil {
		t.Fatal(err)
	}
	var refundBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, payment_status, fee_type, offered_by_id, negotiation_count)
		VALUES (941011,'arsitek',$1,$2,$2,'60000000','60000000','hD refund prop','shortlisted','refunded','fixed',$1,0) RETURNING id`,
		arsUser2.id, arsUser2.id+100000).Scan(&refundBid); err != nil {
		t.Fatal(err)
	}
	var terminID, voidTermin, lockTermin int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (941011,'hD DP','50','10000000','500000','9500000','pending','arsitek',$1) RETURNING id`, arsUser.id).Scan(&terminID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (941011,'hD void','100','1000000','50000','950000','void','arsitek',$1) RETURNING id`, arsUser.id).Scan(&voidTermin); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (941011,'hD lock','100','1000000','50000','950000','locked','arsitek',$1) RETURNING id`, arsUser.id).Scan(&lockTermin); err != nil {
		t.Fatal(err)
	}
	var poorTermin int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id)
		VALUES (941012,'hD big','100','50000000','2500000','47500000','pending','arsitek',$1) RETURNING id`, arsUser.id).Scan(&poorTermin); err != nil {
		t.Fatal(err)
	}

	// --- guards ---
	rec := hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"bid_arsitek","id":1}`, nil, "941011")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("markpaid unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, MarkPaidHandler(pool), http.MethodPost, "/api/x/abc", `{"type":"bid_arsitek","id":1}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("markpaid bad-project = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\Project] abc" {
		t.Fatalf("markpaid bad-project message = %q", got)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/999999999/budget/mark-paid", `{"type":"bid_arsitek","id":1}`, &owner, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("markpaid missing project = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"bid_arsitek","id":`+itoaTest(arsBid)+`}`, &stranger, "941011")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("markpaid forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the project owner can confirm payments." {
		t.Fatalf("markpaid forbidden message = %q", got)
	}
	// validation: empty body names both fields
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{}`, &owner, "941011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid invalid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The type field is required. (and 1 more error)" {
		t.Fatalf("markpaid invalid message = %q", got)
	}
	// validation: bad type + bad id twins
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"bogus","id":"abc"}`, &owner, "941011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid bad-type = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"termin","id":1.5}`, &owner, "941011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid frac-id = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The id field must be an integer." {
		t.Fatalf("markpaid frac-id message = %q", got)
	}

	// frozen twin: open dispute blocks before any write
	var freezeID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES (941011,$1,'payment','hD freeze','desc','open') RETURNING id`, owner.id).Scan(&freezeID); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"bid_arsitek","id":`+itoaTest(arsBid)+`}`, &owner, "941011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid frozen = %d %s", rec.Code, rec.Body.String())
	}
	wantFrozen := "Payments are frozen: dispute #" + itoaTest(freezeID) + ` ("hD freeze") is open on this project. An admin must resolve it first.`
	if got := hADecode(t, rec)["message"]; got != wantFrozen {
		t.Fatalf("markpaid frozen message = %q, want %q", got, wantFrozen)
	}
	var frozenLedger int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=941011 AND transaction_type='payment'`).Scan(&frozenLedger)
	if frozenLedger != 0 {
		t.Fatalf("frozen ledger rows = %d, want 0", frozenLedger)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=941011`); err != nil {
		t.Fatal(err)
	}

	// refund guard twin
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"bid_arsitek","id":`+itoaTest(refundBid)+`}`, &owner, "941011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid refund = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment was refunded through dispute arbitration and cannot be charged again. Open a new dispute if the refund itself is disputed." {
		t.Fatalf("markpaid refund message = %q", got)
	}

	// missing row twin: the reference 500 generic, never a 404
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"bid_arsitek","id":999999999}`, &owner, "941011")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("markpaid missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Failed to process payment tracking." {
		t.Fatalf("markpaid missing message = %q", got)
	}

	// --- happy: bid ---
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"bid_arsitek","id":`+itoaTest(arsBid)+`}`, &owner, "941011")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid bid ok = %d %s", rec.Code, rec.Body.String())
	}
	dec := hADecode(t, rec)
	if dec["message"] != "Successfully marked as paid and deducted from budget." || dec["budget"] != "800000000.00" {
		t.Fatalf("markpaid bid answer = %v", dec)
	}
	var bidPayStatus, bidPaidAt string
	_ = pool.QueryRow(ctx, `SELECT payment_status::text, paid_at::text FROM bids WHERE id=$1`, arsBid).Scan(&bidPayStatus, &bidPaidAt)
	if bidPayStatus != "paid" || bidPaidAt == "" {
		t.Fatalf("markpaid bid row = %q/%q, want paid/set", bidPayStatus, bidPaidAt)
	}
	var bidLedgerMinor int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions WHERE project_id=941011 AND transaction_type='payment' AND reference_id=$1`, arsBid).Scan(&bidLedgerMinor)
	if bidLedgerMinor != 6000000000 {
		t.Fatalf("markpaid bid ledger minor = %d, want 6000000000", bidLedgerMinor)
	}
	var bidLedgerTitle string
	_ = pool.QueryRow(ctx, `SELECT title FROM project_budget_transactions WHERE project_id=941011 AND transaction_type='payment' AND reference_id=$1`, arsBid).Scan(&bidLedgerTitle)
	if bidLedgerTitle != "Paid Architect Base Fee" {
		t.Fatalf("markpaid bid ledger title = %q", bidLedgerTitle)
	}
	var actCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=941011 AND action='payment_released'`).Scan(&actCount)
	if actCount == 0 {
		t.Fatalf("markpaid bid activity missing")
	}
	var notifCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='payment_verified'`, arsUser.id).Scan(&notifCount)
	if notifCount == 0 {
		t.Fatalf("markpaid bid notification missing")
	}
	// double-paid twin
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"bid_arsitek","id":`+itoaTest(arsBid)+`}`, &owner, "941011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid double = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This payment has already been marked as paid." {
		t.Fatalf("markpaid double message = %q", got)
	}

	// --- happy: termin (books the retention NET) ---
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"termin","id":`+itoaTest(terminID)+`}`, &owner, "941011")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid termin ok = %d %s", rec.Code, rec.Body.String())
	}
	var termStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, terminID).Scan(&termStatus)
	if termStatus != "paid" {
		t.Fatalf("markpaid termin status = %q, want paid", termStatus)
	}
	var termLedgerMinor int64
	var termLedgerTitle string
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0), MAX(title) FROM project_budget_transactions WHERE project_id=941011 AND transaction_type='payment' AND reference_id=$1`, terminID).Scan(&termLedgerMinor, &termLedgerTitle)
	if termLedgerMinor != 950000000 || termLedgerTitle != "Paid Architect Termin: hD DP" {
		t.Fatalf("markpaid termin ledger = %d/%q, want 950000000/Paid Architect Termin: hD DP", termLedgerMinor, termLedgerTitle)
	}
	// void + locked twins
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"termin","id":`+itoaTest(voidTermin)+`}`, &owner, "941011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid void = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This termin is void and cannot be marked as paid." {
		t.Fatalf("markpaid void message = %q", got)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"termin","id":`+itoaTest(lockTermin)+`}`, &owner, "941011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid locked = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This termin is still locked. It must be unlocked to pending/invoice before it can be marked as paid." {
		t.Fatalf("markpaid locked message = %q", got)
	}

	// insufficient twin: poor project keeps the termin pending, zero rows
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941012/budget/mark-paid", `{"type":"termin","id":`+itoaTest(poorTermin)+`}`, &owner, "941012")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid short = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Insufficient project budget to record this payment." {
		t.Fatalf("markpaid short message = %q", got)
	}
	var poorStatus string
	var poorLedger int
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE id=$1`, poorTermin).Scan(&poorStatus)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions WHERE project_id=941012 AND transaction_type='payment'`).Scan(&poorLedger)
	if poorStatus != "pending" || poorLedger != 0 {
		t.Fatalf("markpaid short rollback = %q/%d, want pending/0", poorStatus, poorLedger)
	}

	// --- happy: PM slot fills from the paid PM bid ---
	var pmBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, pm_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (941013,'project_manager',$1,$2,$2,'25000000','25000000','hD pm prop','shortlisted','fixed',$1,0) RETURNING id`,
		pmUser.id, pmUser.id+100000).Scan(&pmBid); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941013/budget/mark-paid", `{"type":"bid_project_manager","id":`+itoaTest(pmBid)+`}`, &owner, "941013")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid pm ok = %d %s", rec.Code, rec.Body.String())
	}
	var projPM int64
	_ = pool.QueryRow(ctx, `SELECT pm_id FROM projects WHERE id=941013`).Scan(&projPM)
	if projPM != pmUser.id+100000 {
		t.Fatalf("markpaid pm slot = %d, want %d", projPM, pmUser.id+100000)
	}
	var pmLedgerMinor int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions WHERE project_id=941013 AND transaction_type='payment' AND reference_id=$1`, pmBid).Scan(&pmLedgerMinor)
	if pmLedgerMinor != 2500000000 {
		t.Fatalf("markpaid pm ledger minor = %d, want 2500000000", pmLedgerMinor)
	}

	// --- happy: structural slot ---
	var structBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, structural_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (941011,'structural',$1,$2,$2,'12000000','12000000','hD struct prop','shortlisted','fixed',$1,0) RETURNING id`,
		structUser.id, structUser.id+100000).Scan(&structBid); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"bid_structural","id":`+itoaTest(structBid)+`}`, &owner, "941011")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid struct ok = %d %s", rec.Code, rec.Body.String())
	}
	var projStruct *int64
	_ = pool.QueryRow(ctx, `SELECT structural_id FROM projects WHERE id=941011`).Scan(&projStruct)
	if projStruct == nil || *projStruct != structUser.id+100000 {
		t.Fatalf("markpaid struct slot = %v, want %d", projStruct, structUser.id+100000)
	}

	// --- happy: plain addendum ---
	var addA int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (941011,'arsitek',$1,'hD extra A','2000000','approved_unpaid',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, arsUser.id).Scan(&addA); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addA)+`}`, &owner, "941011")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid addendum ok = %d %s", rec.Code, rec.Body.String())
	}
	var addStatus string
	var addLedgerMinor int64
	var addLedgerTitle string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addA).Scan(&addStatus)
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0), MAX(title) FROM project_budget_transactions WHERE project_id=941011 AND transaction_type='payment' AND reference_id=$1`, addA).Scan(&addLedgerMinor, &addLedgerTitle)
	if addStatus != "paid" || addLedgerMinor != 200000000 || addLedgerTitle != "Paid Addendum: hD extra A" {
		t.Fatalf("markpaid addendum = %q/%d/%q, want paid/200000000/Paid Addendum: hD extra A", addStatus, addLedgerMinor, addLedgerTitle)
	}

	// --- happy: specialist addendum activates the sub-professional + slot ---
	var addB int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, type, assigned_user_id, specialist_type, status, created_at, updated_at)
		VALUES (941011,'arsitek',$1,'hD spec B','3000000','specialist_assignment',$2,'structural','approved_unpaid',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, owner.id, structUser.id).Scan(&addB); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941011/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addB)+`}`, &owner, "941011")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid specialist ok = %d %s", rec.Code, rec.Body.String())
	}
	var subStatus string
	var subUser *int64
	_ = pool.QueryRow(ctx, `SELECT status::text, user_id FROM project_sub_professionals WHERE project_id=941011 AND sub_role='structural'`).Scan(&subStatus, &subUser)
	if subStatus != "active" || subUser == nil || *subUser != structUser.id {
		t.Fatalf("markpaid sub row = %q/%v, want active/%d", subStatus, subUser, structUser.id)
	}

	// --- happy: recommended structural bid settles with its own ledger row ---
	var structBid2 int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, structural_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (941013,'structural',$1,$2,$2,'12000000','12000000','hD struct2 prop','shortlisted','fixed',$1,0) RETURNING id`,
		structUser.id, structUser.id+100000).Scan(&structBid2); err != nil {
		t.Fatal(err)
	}
	var addC int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, type, status, recommended_bid_id, recommended_bid_type, created_at, updated_at)
		VALUES (941013,'arsitek',$1,'hD rec C','1000000','extra_fee','approved_unpaid',$2,'structural',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, owner.id, structBid2).Scan(&addC); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, MarkPaidHandler(pool), http.MethodPost, "/api/projects/941013/budget/mark-paid", `{"type":"addendum","id":`+itoaTest(addC)+`}`, &owner, "941013")
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid recommended ok = %d %s", rec.Code, rec.Body.String())
	}
	var recBidPay string
	_ = pool.QueryRow(ctx, `SELECT payment_status::text FROM bids WHERE id=$1`, structBid2).Scan(&recBidPay)
	if recBidPay != "paid" {
		t.Fatalf("markpaid recommended bid = %q, want paid", recBidPay)
	}
	var recLedgerMinor int64
	var recLedgerTitle string
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0), MAX(title) FROM project_budget_transactions WHERE project_id=941013 AND transaction_type='payment' AND reference_id=$1`, structBid2).Scan(&recLedgerMinor, &recLedgerTitle)
	if recLedgerMinor != 1200000000 || recLedgerTitle != "Paid Structural Engineer Fee (via specialist addendum)" {
		t.Fatalf("markpaid recommended ledger = %d/%q", recLedgerMinor, recLedgerTitle)
	}

	// --- pure helpers ---
	if markPaidBidRole("bid_arsitek") != "arsitek" || markPaidBidRole("bid_mep") != "mep" || markPaidBidRole("bid_project_manager") != "project_manager" || markPaidBidRole("bogus") != "" {
		t.Fatalf("markPaidBidRole wrong")
	}
	if (markPaidError{status: 422, message: "x"}).Error() == "" {
		t.Fatalf("markPaidError empty")
	}

	hDCleanupVault(t, pool)
	hDCleanup(t, pool)
	hDAssertNoLeftovers(t, pool)
}
