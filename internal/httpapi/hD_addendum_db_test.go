package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestHDAddendum(t *testing.T) {
	pool := hDPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 940021, "user", "hd-ad-owner@example.test", "hD AD Owner")
	arsUser := hAMkUser(t, pool, 940022, "arsitek", "hd-ad-ars@example.test", "hD AD Ars")
	pmUser := hAMkUser(t, pool, 940023, "project_manager", "hd-ad-pm@example.test", "hD AD PM")
	stranger := hAMkUser(t, pool, 940024, "user", "hd-ad-stranger@example.test", "hD AD Stranger")
	t.Cleanup(func() {
		hDCleanupVault(t, pool)
		hDCleanup(t, pool)
	})

	hAMkProject(t, pool, 941021, owner.id, "hD addendum project", "open", "both", 800000000)
	// hire the arsitek so create passes the Matches gate
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1, pm_id=$2 WHERE id=941021`, arsUser.id+100000, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}

	// --- CreateAddendum guards ---
	rec := hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/941021/budget/addendums", `{"title":"hD","amount":"100"}`, nil, "941021")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("addendum unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, CreateAddendumHandler(pool), http.MethodPost, "/api/x/abc", `{"title":"hD","amount":"100"}`, &arsUser, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("addendum bad-project = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\Project] abc" {
		t.Fatalf("addendum bad-project message = %q", got)
	}
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/999999999/budget/addendums", `{"title":"hD","amount":"100"}`, &arsUser, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("addendum missing project = %d %s", rec.Code, rec.Body.String())
	}
	// stranger is not hired on the project
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/941021/budget/addendums", `{"title":"hD extra","amount":"1500000"}`, &stranger, "941021")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("addendum forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Must be hired professional." {
		t.Fatalf("addendum forbidden message = %q", got)
	}
	// validation: empty body
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/941021/budget/addendums", `{}`, &arsUser, "941021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum invalid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The title field is required. (and 1 more error)" {
		t.Fatalf("addendum invalid message = %q", got)
	}
	// validation twins: bad type, missing team member, missing user, bad specialist
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/941021/budget/addendums",
		`{"title":"hD extra","amount":"1500000","type":"bogus"}`, &arsUser, "941021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum bad-type = %d %s", rec.Code, rec.Body.String())
	}
	dec := hADecode(t, rec)
	if errs, ok := dec["errors"].(map[string]any); !ok {
		t.Fatalf("addendum bad-type has no errors: %v", dec)
	} else if list, ok := errs["type"].([]any); !ok || len(list) != 1 || list[0] != "The selected type is invalid." {
		t.Fatalf("addendum bad-type errors = %v", errs)
	}
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/941021/budget/addendums",
		`{"title":"hD extra","amount":"1500000","team_member_id":999999999}`, &arsUser, "941021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum bad-team = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The selected team member id is invalid." {
		t.Fatalf("addendum bad-team message = %q", got)
	}
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/941021/budget/addendums",
		`{"title":"hD extra","amount":"1500000","assigned_user_id":999999999}`, &arsUser, "941021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum bad-user = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The selected assigned user id is invalid." {
		t.Fatalf("addendum bad-user message = %q", got)
	}
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/941021/budget/addendums",
		`{"title":"hD extra","amount":"1500000","specialist_type":"bogus"}`, &arsUser, "941021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum bad-specialist = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The selected specialist type is invalid." {
		t.Fatalf("addendum bad-specialist message = %q", got)
	}
	// JSON non-file attachment fails BOTH the file and the mimes rules
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/941021/budget/addendums",
		`{"title":"hD extra","amount":"1500000","attachment":"hD-not-a-file"}`, &arsUser, "941021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum attachment = %d %s", rec.Code, rec.Body.String())
	}
	dec = hADecode(t, rec)
	if errs, ok := dec["errors"].(map[string]any); !ok {
		t.Fatalf("addendum attachment has no errors: %v", dec)
	} else if list, ok := errs["attachment"].([]any); !ok || len(list) != 2 ||
		list[0] != "The attachment field must be a file." ||
		list[1] != "The attachment field must be a file of type: jpg, jpeg, png, webp, pdf." {
		t.Fatalf("addendum attachment errors = %v", errs)
	}

	// --- happy create ---
	rec = hACall(t, CreateAddendumHandler(pool), http.MethodPost, "/api/projects/941021/budget/addendums",
		`{"title":"hD extra work","amount":"1500000","description":"hD scope"}`, &arsUser, "941021")
	if rec.Code != http.StatusOK {
		t.Fatalf("addendum create ok = %d %s", rec.Code, rec.Body.String())
	}
	dec = hADecode(t, rec)
	if dec["message"] != "Addendum submitted for client approval." {
		t.Fatalf("addendum create message = %q", dec["message"])
	}
	addBody, _ := dec["addendum"].(map[string]any)
	if addBody["status"] != "pending_approval" || addBody["role_type"] != "arsitek" || addBody["amount"] != "1500000.00" || addBody["title"] != "hD extra work" {
		t.Fatalf("addendum create body = %v", addBody)
	}
	var addID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_addendums WHERE project_id=941021 AND title='hD extra work'`).Scan(&addID)
	if addID == 0 {
		t.Fatalf("addendum row missing")
	}
	var addAmount, addStatus string
	_ = pool.QueryRow(ctx, `SELECT amount::text, status::text FROM project_addendums WHERE id=$1`, addID).Scan(&addAmount, &addStatus)
	if addAmount != "1500000.00" || addStatus != "pending_approval" {
		t.Fatalf("addendum row = %q/%q, want 1500000.00/pending_approval", addAmount, addStatus)
	}

	// --- HandleAddendum guards ---
	hpath := func(id string) map[string]string { return map[string]string{"project": "941021", "id": id} }
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/projects/941021/budget/addendums/1", `{"status":"approved_unpaid"}`, nil, hpath(itoaTest(addID)))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("handle unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x/abc", `{"status":"approved_unpaid"}`, &owner, map[string]string{"project": "abc", "id": "1"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("handle bad-project = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"approved_unpaid"}`, &owner, hpath("abc"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("handle bad-id = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Addendum not found." {
		t.Fatalf("handle bad-id message = %q", got)
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"approved_unpaid"}`, &owner, hpath("999999999"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("handle missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Addendum not found." {
		t.Fatalf("handle missing message = %q", got)
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"approved_unpaid"}`, &stranger, hpath(itoaTest(addID)))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("handle forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the project owner or assigned PM can authorise budget items." {
		t.Fatalf("handle forbidden message = %q", got)
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{}`, &owner, hpath(itoaTest(addID)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("handle invalid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The status field is required." {
		t.Fatalf("handle invalid message = %q", got)
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"negotiating","amount":-5}`, &owner, hpath(itoaTest(addID)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("handle neg-amount = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The amount field must be at least 0." {
		t.Fatalf("handle neg-amount message = %q", got)
	}

	// proposer cannot authorise their own addendum
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"approved_unpaid"}`, &arsUser, hpath(itoaTest(addID)))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("handle proposer-approve = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "A professional may accept or counter a negotiation, but cannot authorise or reject their own addendum. That is the Owner's or PM's decision." {
		t.Fatalf("handle proposer-approve message = %q", got)
	}
	// proposer with no open negotiation
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"accepted_by_pro"}`, &arsUser, hpath(itoaTest(addID)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("handle no-negotiation = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This addendum has no open negotiation to respond to." {
		t.Fatalf("handle no-negotiation message = %q", got)
	}

	// --- owner opens negotiation with a counter ---
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x",
		`{"status":"negotiating","counter_offer_amount":"1400000","negotiation_note":"hD too high"}`, &owner, hpath(itoaTest(addID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("handle negotiate ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Negotiation request sent." {
		t.Fatalf("handle negotiate message = %q", got)
	}
	var negStatus, negCounter, negNote string
	_ = pool.QueryRow(ctx, `SELECT status::text, counter_offer_amount::text, negotiation_note FROM project_addendums WHERE id=$1`, addID).Scan(&negStatus, &negCounter, &negNote)
	if negStatus != "negotiating" || negCounter != "1400000.00" || negNote != "hD too high" {
		t.Fatalf("handle negotiate row = %q/%q/%q, want negotiating/1400000.00/hD too high", negStatus, negCounter, negNote)
	}

	// proposer must not set counter fields
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x",
		`{"status":"negotiating","counter_offer_amount":"1300000"}`, &arsUser, hpath(itoaTest(addID)))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("handle proposer-counter = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Counter-offer amount and note are set by the Owner or PM, not by the proposing professional." {
		t.Fatalf("handle proposer-counter message = %q", got)
	}

	// --- proposer accepts: amount adopts the counter figure ---
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"accepted_by_pro"}`, &arsUser, hpath(itoaTest(addID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("handle accept ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Counter-offer accepted. Awaiting authorisation." {
		t.Fatalf("handle accept message = %q", got)
	}
	var accStatus, accAmount string
	_ = pool.QueryRow(ctx, `SELECT status::text, amount::text FROM project_addendums WHERE id=$1`, addID).Scan(&accStatus, &accAmount)
	if accStatus != "accepted_by_pro" || accAmount != "1400000.00" {
		t.Fatalf("handle accept row = %q/%q, want accepted_by_pro/1400000.00", accStatus, accAmount)
	}

	// --- owner authorises ---
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"approved_unpaid"}`, &owner, hpath(itoaTest(addID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("handle approve ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Budget authorized successfully. Awaiting payment from the Project Owner." {
		t.Fatalf("handle approve message = %q", got)
	}
	var apprStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addID).Scan(&apprStatus)
	if apprStatus != "approved_unpaid" {
		t.Fatalf("handle approve row = %q, want approved_unpaid", apprStatus)
	}
	var apprNotif int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='budget_approved'`, pmUser.id).Scan(&apprNotif)
	if apprNotif == 0 {
		t.Fatalf("handle approve notification missing")
	}

	// amount is binding once an addendum leaves negotiation: from
	// accepted_by_pro a revised amount is refused (it is adopted, not set)
	var addD int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (941021,'arsitek',$1,'hD binding','900000','pending_approval',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, arsUser.id).Scan(&addD); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x",
		`{"status":"negotiating","counter_offer_amount":"850000"}`, &owner, hpath(itoaTest(addD)))
	if rec.Code != http.StatusOK {
		t.Fatalf("handle binding negotiate = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"accepted_by_pro"}`, &arsUser, hpath(itoaTest(addD)))
	if rec.Code != http.StatusOK {
		t.Fatalf("handle binding accept = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"approved_unpaid","amount":"900000"}`, &owner, hpath(itoaTest(addD)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("handle binding = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The agreed amount is binding once an addendum leaves negotiation." {
		t.Fatalf("handle binding message = %q", got)
	}
	// already processed twin: rejected row refuses further moves
	var addR int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (941021,'arsitek',$1,'hD doomed','500000','rejected',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, arsUser.id).Scan(&addR); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"approved_unpaid"}`, &owner, hpath(itoaTest(addR)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("handle processed = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This item has already been processed or is not in a negotiable state." {
		t.Fatalf("handle processed message = %q", got)
	}

	// --- reject twin on a fresh row ---
	var addJ int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (941021,'arsitek',$1,'hD rejected','700000','pending_approval',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, arsUser.id).Scan(&addJ); err != nil {
		t.Fatal(err)
	}
	rec = hACallWithPaths(t, HandleAddendumHandler(pool), http.MethodPut, "/api/x", `{"status":"rejected"}`, &owner, hpath(itoaTest(addJ)))
	if rec.Code != http.StatusOK {
		t.Fatalf("handle reject ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Budget authorization rejected." {
		t.Fatalf("handle reject message = %q", got)
	}
	var rejStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addJ).Scan(&rejStatus)
	if rejStatus != "rejected" {
		t.Fatalf("handle reject row = %q, want rejected", rejStatus)
	}

	// --- pure helpers ---
	if ownerIDOrZero(nil) != 0 || ownerIDOrZero(&owner.id) != owner.id {
		t.Fatalf("ownerIDOrZero wrong")
	}
	if orMinor(nil) != 0 || orMinor(strPtr("1500000")) != 150000000 || orMinor(strPtr("bogus")) != 0 {
		t.Fatalf("orMinor wrong")
	}
	if counterTextPtr("1400000", true) == nil || *counterTextPtr("1400000", true) != "1400000" || counterTextPtr("", false) != nil {
		t.Fatalf("counterTextPtr wrong")
	}
	if counterOrNull("1400000", true) != "1400000" || counterOrNull("", false) != nil {
		t.Fatalf("counterOrNull wrong")
	}
	if noteOrNull("hD", true) != "hD" || noteOrNull("", false) != nil {
		t.Fatalf("noteOrNull wrong")
	}
	if id, ok := addendumExistsID("150"); !ok || id != 150 {
		t.Fatalf("addendumExistsID string = %d %v", id, ok)
	}
	if _, ok := addendumExistsID("15x"); ok {
		t.Fatalf("addendumExistsID junk ok")
	}
	if id, ok := addendumExistsID(float64(7)); !ok || id != 7 {
		t.Fatalf("addendumExistsID float = %d %v", id, ok)
	}
	if _, ok := addendumExistsID(7.5); ok {
		t.Fatalf("addendumExistsID frac ok")
	}
	if id, ok := addendumExistsID(true); !ok || id != 1 {
		t.Fatalf("addendumExistsID true = %d %v", id, ok)
	}
	if _, ok := addendumExistsID(false); ok {
		t.Fatalf("addendumExistsID false ok")
	}
	if id, ok := addendumExistsID(940021); !ok || id != 940021 {
		t.Fatalf("addendumExistsID int = %d %v", id, ok)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if pmUserOf(ctx, tx, nil) != 0 {
		tx.Rollback(ctx)
		t.Fatalf("pmUserOf nil wrong")
	}
	pmProfile := pmUser.id + 100000
	if got := pmUserOf(ctx, tx, &pmProfile); got != pmUser.id {
		tx.Rollback(ctx)
		t.Fatalf("pmUserOf profile = %d, want %d", got, pmUser.id)
	}
	tx.Rollback(ctx)

	_ = pmUser
	hDCleanupVault(t, pool)
	hDCleanup(t, pool)
	hDAssertNoLeftovers(t, pool)
}
