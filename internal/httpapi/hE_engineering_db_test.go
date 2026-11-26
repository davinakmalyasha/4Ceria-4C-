package httpapi

// hE engineering gaps: the branches hA left at 33-67% — assigned ids,
// rejected verify, platform_hired authorize, cross-project bindings,
// mep/interior integration, interview auth/matrix, bid-type edges.

import (
	"context"
	"net/http"
	"testing"
)

func TestHEEngineeringGaps(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)
	p2 := hEProjectPath(hEProject2ID)

	// --- unauth / bad-id / missing pins (gateError 404 contract) ---
	rec := hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{"role_type":"structural","description":"hE"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("req-eng unauth = %d, want 401", rec.Code)
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x/abc", `{"role_type":"structural","description":"hE"}`, &fx.arsitek, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("req-eng bad-id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x/999999999", `{"role_type":"structural","description":"hE"}`, &fx.arsitek, map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("req-eng missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// --- validation twins: exact codes and messages ---
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{"role_type":"structural","description":"hE","assigned_user_id":"x"}`, &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The assigned user id field must be an integer.") {
		t.Fatalf("req-eng bad assignee = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{"role_type":"structural","description":"hE","assigned_user_id":999999999}`, &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected assigned user id is invalid.") {
		t.Fatalf("req-eng ghost assignee = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{"role_type":"structural","description":"hE","team_member_id":999999999}`, &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected team member id is invalid.") {
		t.Fatalf("req-eng ghost team = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{"role_type":"structural","description":"hE","team_member_id":"x"}`, &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The team member id field must be an integer.") {
		t.Fatalf("req-eng bad team = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{"role_type":"structural","description":"hE","suggested_fee":-5}`, &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The suggested fee field must be at least 0.") {
		t.Fatalf("req-eng neg fee = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{"role_type":"structural","description":"hE","suggested_fee":"abc"}`, &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The suggested fee field must be a number.") {
		t.Fatalf("req-eng nan fee = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{"role_type":5,"description":"hE"}`, &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected role type is invalid.") {
		t.Fatalf("req-eng non-string role = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{"role_type":"structural","description":5}`, &fx.arsitek, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The description field must be a string.") {
		t.Fatalf("req-eng non-string desc = %d %s", rec.Code, rec.Body.String())
	}

	// --- happy with assignee + team member: post-state literals ---
	var teamID int64
	if err := pool.QueryRow(ctx, `INSERT INTO team_members (owner_user_id, name, role_title) VALUES ($1, 'hE Team', 'Engineer') RETURNING id`,
		hEOwnerID).Scan(&teamID); err != nil {
		t.Fatalf("team: %v", err)
	}
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x",
		`{"role_type":"mep","description":"hE mep need","suggested_fee":"7500000","assigned_user_id":`+int64String(hEOwnerID)+`,"team_member_id":`+int64String(teamID)+`}`,
		&fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("req-eng ok = %d %s", rec.Code, rec.Body.String())
	}
	var addID, assignee, team int64
	var fee string
	if err := pool.QueryRow(ctx, `SELECT id, assigned_user_id, team_member_id, amount::text FROM project_addendums
		WHERE project_id = $1 AND type = 'specialist_request' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&addID, &assignee, &team, &fee); err != nil {
		t.Fatalf("addendum row: %v", err)
	}
	if assignee != hEOwnerID || team != teamID || fee != "7500000.00" {
		t.Fatalf("addendum = %d/%d/%q, want %d/%d/7500000.00", assignee, team, fee, hEOwnerID, teamID)
	}

	// --- verify: rejected path stamps rejected, no project flag ---
	ap := map[string]string{"project": int64String(hEProjectID), "addendum": int64String(addID)}
	rec = hECall(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/x", `{"status":"rejected"}`, &fx.owner, ap)
	if rec.Code != http.StatusOK {
		t.Fatalf("verify reject = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Request rejected" {
		t.Fatalf("verify reject message = %q", got)
	}
	var vStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id = $1`, addID).Scan(&vStatus)
	if vStatus != "rejected" {
		t.Fatalf("verify status = %q, want rejected", vStatus)
	}
	var reqMep bool
	_ = pool.QueryRow(ctx, `SELECT requires_mep FROM projects WHERE id = $1`, hEProjectID).Scan(&reqMep)
	if reqMep {
		t.Fatalf("rejected verify must not flip requires_mep")
	}

	// --- verify: approved WITH assignee -> approved_unpaid + flag ---
	rec = hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x",
		`{"role_type":"structural","description":"hE struct","assigned_user_id":`+int64String(hEOwnerID)+`}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("req-eng struct = %d %s", rec.Code, rec.Body.String())
	}
	var structAdd int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_addendums WHERE project_id = $1 AND role_type = 'structural' AND type = 'specialist_request' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&structAdd)
	sap := map[string]string{"project": int64String(hEProjectID), "addendum": int64String(structAdd)}
	rec = hECall(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/x", `{"status":"bogus"}`, &fx.owner, sap)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify bad status = %d, want 422", rec.Code)
	}
	rec = hECall(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/x", `{"status":"approved"}`, &fx.owner, sap)
	if rec.Code != http.StatusOK {
		t.Fatalf("verify approved = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id = $1`, structAdd).Scan(&vStatus)
	if vStatus != "approved_unpaid" {
		t.Fatalf("verify status = %q, want approved_unpaid", vStatus)
	}
	var reqStruct bool
	_ = pool.QueryRow(ctx, `SELECT requires_structural FROM projects WHERE id = $1`, hEProjectID).Scan(&reqStruct)
	if !reqStruct {
		t.Fatalf("approved verify must flip requires_structural")
	}

	// --- cross-project addendum binding is a 404 ---
	xp := map[string]string{"project": int64String(hEProject2ID), "addendum": int64String(structAdd)}
	rec = hECall(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/x", `{"status":"approved"}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify cross-project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ApproveEngineeringHireHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("hire cross-project = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// --- integration: mep + interior stamps ---
	for _, tc := range []struct{ role, column string }{
		{"mep", "mep_approved_at"},
		{"interior", "interior_completed_at"},
	} {
		rec = hECall(t, ApproveEngineeringIntegrationHandler(pool), http.MethodPost, "/x", `{"role_type":"`+tc.role+`"}`, &fx.owner, p)
		if rec.Code != http.StatusOK {
			t.Fatalf("integration %s = %d %s", tc.role, rec.Code, rec.Body.String())
		}
		var stamped *string
		_ = pool.QueryRow(ctx, `SELECT `+tc.column+`::text FROM projects WHERE id = $1`, hEProjectID).Scan(&stamped)
		if stamped == nil {
			t.Fatalf("integration %s stamp missing", tc.role)
		}
	}

	// --- authorize platform_hired: bid flips to awaiting_payment ---
	var bidID int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, structural_id, price, proposal, status, offered_by_id)
		VALUES ($1, 'structural', $2, $3, $3, 9000000, 'hE platform', 'pending', $2) RETURNING id`,
		hEProjectID, hEStructID, hEStructProfileID).Scan(&bidID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	var platAdd int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, user_id, role_type, type, title, description, amount, status, specialist_type, recommended_bid_id)
		VALUES ($1, $2, 'structural', 'specialist_request', 'hE platform', 'hE', 9000000, 'pending_approval', 'platform_hired', $3) RETURNING id`,
		hEProjectID, hEOwnerID, bidID).Scan(&platAdd); err != nil {
		t.Fatalf("platform addendum: %v", err)
	}
	rec = hECall(t, AuthorizeSpecialistHandler(pool), http.MethodPost, "/x",
		`{"role_type":"structural","addendum_id":`+int64String(platAdd)+`}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("authorize platform = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Specialist hiring authorized. Awaiting payment." {
		t.Fatalf("authorize message = %q", got)
	}
	var bidStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id = $1`, bidID).Scan(&bidStatus)
	if bidStatus != "awaiting_payment" {
		t.Fatalf("platform bid = %q, want awaiting_payment", bidStatus)
	}
	// cross-project authorize is a 404, not a 422
	xa := map[string]string{"project": int64String(hEProjectID)}
	_ = xa
	rec = hECall(t, AuthorizeSpecialistHandler(pool), http.MethodPost, "/x",
		`{"role_type":"structural","addendum_id":`+int64String(platAdd)+`}`, &fx.owner, p2)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("authorize cross-project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// reject-specialist: reason must be a string; happy stamps + note
	rec = hECall(t, RejectSpecialistHandler(pool), http.MethodPost, "/x",
		`{"role_type":"structural","addendum_id":`+int64String(platAdd)+`,"reason":5}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The reason field must be a string.") {
		t.Fatalf("reject-spec bad reason = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RejectSpecialistHandler(pool), http.MethodPost, "/x",
		`{"role_type":"structural","addendum_id":`+int64String(platAdd)+`}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject-spec no reason = %d, want 200 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Specialist hiring rejected." {
		t.Fatalf("reject-spec message = %q", got)
	}
	var noNote *string
	_ = pool.QueryRow(ctx, `SELECT negotiation_note FROM project_addendums WHERE id = $1`, platAdd).Scan(&noNote)
	if noNote != nil {
		t.Fatalf("reject note = %v, want NULL without reason", *noNote)
	}
	rec = hECall(t, RejectSpecialistHandler(pool), http.MethodPost, "/x",
		`{"role_type":"structural","addendum_id":`+int64String(platAdd)+`,"reason":"hE over budget"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject-spec ok = %d %s", rec.Code, rec.Body.String())
	}
	var rejNote *string
	_ = pool.QueryRow(ctx, `SELECT negotiation_note FROM project_addendums WHERE id = $1`, platAdd).Scan(&rejNote)
	if rejNote == nil || *rejNote != "hE over budget" {
		t.Fatalf("reject note = %v, want hE over budget", rejNote)
	}

	// --- reject-engineering-bid: mep happy flips bid + linked addendum ---
	var mepBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, mep_id, price, proposal, status, offered_by_id)
		VALUES ($1, 'mep', $2, $3, $3, 7000000, 'hE mep', 'pending', $2) RETURNING id`,
		hEProjectID, hEMepID, hEMepProfileID).Scan(&mepBid); err != nil {
		t.Fatalf("mep bid: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (project_id, user_id, role_type, type, title, description, amount, status, recommended_bid_id)
		VALUES ($1, $2, 'mep', 'specialist_assignment', 'hE mep rec', 'hE', 7000000, 'pending_approval', $3)`,
		hEProjectID, hEOwnerID, mepBid); err != nil {
		t.Fatalf("mep addendum: %v", err)
	}
	mbp := map[string]string{"project": int64String(hEProjectID), "bidId": int64String(mepBid)}
	rec = hECall(t, RejectEngineeringBidHandler(pool), http.MethodPost, "/x", `{"bid_type":"interior"}`, &fx.arsitek, mbp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reject-bid interior = %d, want 422", rec.Code)
	}
	rec = hECall(t, RejectEngineeringBidHandler(pool), http.MethodPost, "/api/projects/999999999/reject-engineering-bid/"+int64String(mepBid), `{"bid_type":"mep"}`, &fx.arsitek,
		map[string]string{"project": "999999999", "bidId": int64String(mepBid)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("reject-bid missing project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, RejectEngineeringBidHandler(pool), http.MethodPost, "/x", `{"bid_type":"mep"}`, &fx.arsitek, mbp)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject-bid mep = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id = $1`, mepBid).Scan(&bidStatus)
	if bidStatus != "declined" {
		t.Fatalf("mep bid = %q, want declined", bidStatus)
	}
	var linkedAdd string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE project_id = $1 AND recommended_bid_id = $2`, hEProjectID, mepBid).Scan(&linkedAdd)
	if linkedAdd != "rejected" {
		t.Fatalf("linked addendum = %q, want rejected", linkedAdd)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHEEngineeringInterview(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// Seed a structural bid the architect can interview.
	var bidID int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, structural_id, price, proposal, status, offered_by_id)
		VALUES ($1, 'structural', $2, $3, $3, 8000000, 'hE struct', 'pending', $2) RETURNING id`,
		hEProjectID, hEStructID, hEStructProfileID).Scan(&bidID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	var mepBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, mep_id, price, proposal, status, offered_by_id)
		VALUES ($1, 'mep', $2, $3, $3, 6000000, 'hE mep', 'pending', $2) RETURNING id`,
		hEProjectID, hEMepID, hEMepProfileID).Scan(&mepBid); err != nil {
		t.Fatalf("mep bid: %v", err)
	}

	// --- unauth / missing project pins ---
	rec := hECall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/x",
		`{"bid_id":1,"bid_type":"structural","interview_notes":"hE","is_recommended":true}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("interview unauth = %d, want 401", rec.Code)
	}
	rec = hECall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/x/999999999",
		`{"bid_id":1,"bid_type":"structural","interview_notes":"hE","is_recommended":true}`, &fx.arsitek,
		map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("interview missing project = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// --- validation twins ---
	for _, tc := range []struct{ name, body, want string }{
		{"notes-missing", `{"bid_id":` + int64String(bidID) + `,"bid_type":"structural","is_recommended":true}`, "The interview notes field is required."},
		{"notes-number", `{"bid_id":` + int64String(bidID) + `,"bid_type":"structural","interview_notes":5,"is_recommended":true}`, "The interview notes field must be a string."},
		{"bid-missing", `{"bid_type":"structural","interview_notes":"hE","is_recommended":true}`, "The bid id field is required."},
		{"bid-string", `{"bid_id":"x","bid_type":"structural","interview_notes":"hE","is_recommended":true}`, "The bid id field must be an integer."},
		{"type-missing", `{"bid_id":` + int64String(bidID) + `,"interview_notes":"hE","is_recommended":true}`, "The bid type field is required."},
		{"type-bogus", `{"bid_id":` + int64String(bidID) + `,"bid_type":"civil","interview_notes":"hE","is_recommended":true}`, "The selected bid type is invalid."},
		{"rec-missing", `{"bid_id":` + int64String(bidID) + `,"bid_type":"structural","interview_notes":"hE"}`, "The is recommended field is required."},
		{"rec-word", `{"bid_id":` + int64String(bidID) + `,"bid_type":"structural","interview_notes":"hE","is_recommended":"yes"}`, "The is recommended field must be true or false."},
		{"rec-two", `{"bid_id":` + int64String(bidID) + `,"bid_type":"structural","interview_notes":"hE","is_recommended":2}`, "The is recommended field must be true or false."},
	} {
		rec = hECall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/x", tc.body, &fx.arsitek, p)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("interview %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}

	// --- mep happy with numeric 1 (float branch): recommended + owner told ---
	rec = hECall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/x",
		`{"bid_id":`+int64String(mepBid)+`,"bid_type":"mep","interview_notes":"hE sharp","is_recommended":1}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("interview mep = %d %s", rec.Code, rec.Body.String())
	}
	var flag bool
	var st string
	_ = pool.QueryRow(ctx, `SELECT is_recommended, status::text FROM bids WHERE id = $1`, mepBid).Scan(&flag, &st)
	if !flag || st != "recommended" {
		t.Fatalf("mep bid = %v/%q, want true/recommended", flag, st)
	}
	var notifs int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id = $1 AND type = 'specialist_recommendation'`, hEOwnerID).Scan(&notifs)
	if notifs != 1 {
		t.Fatalf("owner notifs = %d, want 1", notifs)
	}

	// --- string "0" is a real false: notes saved, status untouched ---
	rec = hECall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/x",
		`{"bid_id":`+int64String(bidID)+`,"bid_type":"structural","interview_notes":"hE weak","is_recommended":"0"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("interview false = %d %s", rec.Code, rec.Body.String())
	}
	var notes string
	_ = pool.QueryRow(ctx, `SELECT is_recommended, status::text, interview_notes FROM bids WHERE id = $1`, bidID).Scan(&flag, &st, &notes)
	if flag || st != "pending" || notes != "hE weak" {
		t.Fatalf("struct bid = %v/%q/%q, want false/pending/hE weak", flag, st, notes)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func containsStr(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (func() bool {
		for i := 0; i+len(needle) <= len(haystack); i++ {
			if haystack[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	}())
}
