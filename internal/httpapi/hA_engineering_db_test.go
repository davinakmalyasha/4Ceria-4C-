package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestHAEngineering(t *testing.T) {
	pool := hAPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 910031, "user", "ha-eng-owner@example.test", "hA Eng Owner")
	arsitekUser := hAMkUser(t, pool, 910032, "arsitek", "ha-eng-ars@example.test", "hA Eng Ars")
	pmUser := hAMkUser(t, pool, 910033, "project_manager", "ha-eng-pm@example.test", "hA Eng PM")
	structUser := hAMkUser(t, pool, 910034, "structural", "ha-eng-struct@example.test", "hA Eng Struct")
	stranger := hAMkUser(t, pool, 910035, "user", "ha-eng-stranger@example.test", "hA Eng Stranger")
	t.Cleanup(func() { hACleanupUsers(t, pool) })

	hAMkProject(t, pool, 911031, owner.id, "hA engineering project", "in_progress", "both", 700000000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1, pm_id=$2 WHERE id=911031`, arsitekUser.id+100000, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}

	// --- RequestEngineeringRole ---
	rec := hACall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/api/projects/911031/request-engineering", `{"role_type":"structural","description":"hA need"}`, nil, "911031")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("req-eng unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/api/x/abc", `{"role_type":"structural","description":"hA"}`, &arsitekUser, map[string]string{"project": "abc"})
	// projectPathID returns 0 for abc; handler checks EXISTS then modelNotFound
	if rec.Code != http.StatusNotFound {
		t.Fatalf("req-eng bad-id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/api/projects/999999999/request-engineering", `{"role_type":"structural","description":"hA"}`, &arsitekUser, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("req-eng missing = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/api/projects/911031/request-engineering", `{"role_type":"structural","description":"hA"}`, &stranger, "911031")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("req-eng forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/api/projects/911031/request-engineering", `{}`, &arsitekUser, "911031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("req-eng invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/api/projects/911031/request-engineering", `{"role_type":"bogus","description":"hA"}`, &arsitekUser, "911031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("req-eng bad-role = %d", rec.Code)
	}
	rec = hACall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/api/projects/911031/request-engineering", `{"role_type":"structural","description":"hA need calc","suggested_fee":"5000000"}`, &arsitekUser, "911031")
	if rec.Code != http.StatusOK {
		t.Fatalf("req-eng ok = %d %s", rec.Code, rec.Body.String())
	}
	var addID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_addendums WHERE project_id=911031 AND type='specialist_request' ORDER BY id DESC LIMIT 1`).Scan(&addID)
	if addID == 0 {
		t.Fatalf("no addendum row")
	}

	// --- VerifyEngineeringRequest ---
	rec = hACallWithPaths(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/api/projects/911031/verify-engineering/x", `{"status":"approved"}`, nil, map[string]string{"project": "911031", "addendum": itoaTest(addID)})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("verify-eng unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/api/projects/911031/verify-engineering/999999999", `{"status":"approved"}`, &owner, map[string]string{"project": "911031", "addendum": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("verify-eng missing addendum = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/api/projects/911031/verify-engineering/x", `{"status":"approved"}`, &stranger, map[string]string{"project": "911031", "addendum": itoaTest(addID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("verify-eng forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/api/projects/911031/verify-engineering/x", `{}`, &owner, map[string]string{"project": "911031", "addendum": itoaTest(addID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("verify-eng invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/api/projects/911031/verify-engineering/x", `{"status":"approved"}`, &owner, map[string]string{"project": "911031", "addendum": itoaTest(addID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("verify-eng ok = %d %s", rec.Code, rec.Body.String())
	}
	// no assignee -> authorized, and the structural flag flips on
	var engStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addID).Scan(&engStatus)
	if engStatus != "authorized" {
		t.Fatalf("verify-eng status = %q, want authorized", engStatus)
	}
	var reqStruct bool
	_ = pool.QueryRow(ctx, `SELECT requires_structural FROM projects WHERE id=911031`).Scan(&reqStruct)
	if !reqStruct {
		t.Fatalf("verify-eng requires_structural = false, want true")
	}

	// --- Approve/RejectEngineeringHire ---
	rec = hACallWithPaths(t, ApproveEngineeringHireHandler(pool), http.MethodPost, "/api/projects/911031/approve-engineering-hire/x", `{}`, nil, map[string]string{"project": "911031", "addendum": itoaTest(addID)})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("hire unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, ApproveEngineeringHireHandler(pool), http.MethodPost, "/api/projects/911031/approve-engineering-hire/x", `{}`, &stranger, map[string]string{"project": "911031", "addendum": itoaTest(addID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("hire forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, ApproveEngineeringHireHandler(pool), http.MethodPost, "/api/projects/911031/approve-engineering-hire/x", `{}`, &owner, map[string]string{"project": "911031", "addendum": itoaTest(addID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("hire approve = %d %s", rec.Code, rec.Body.String())
	}
	var hireStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addID).Scan(&hireStatus)
	if hireStatus != "authorized" {
		t.Fatalf("hire approve status = %q, want authorized", hireStatus)
	}
	rec = hACallWithPaths(t, RejectEngineeringHireHandler(pool), http.MethodPost, "/api/projects/911031/reject-engineering-hire/x", `{}`, &owner, map[string]string{"project": "911031", "addendum": itoaTest(addID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("hire reject = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addID).Scan(&hireStatus)
	if hireStatus != "rejected" {
		t.Fatalf("hire reject status = %q, want rejected", hireStatus)
	}
	rec = hACallWithPaths(t, ApproveEngineeringHireHandler(pool), http.MethodPost, "/api/projects/911031/approve-engineering-hire/999999999", `{}`, &owner, map[string]string{"project": "911031", "addendum": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("hire missing = %d", rec.Code)
	}

	// --- ApproveEngineeringIntegration ---
	rec = hACall(t, ApproveEngineeringIntegrationHandler(pool), http.MethodPost, "/api/projects/911031/approve-engineering", `{"role_type":"structural"}`, nil, "911031")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("integration unauth = %d", rec.Code)
	}
	rec = hACall(t, ApproveEngineeringIntegrationHandler(pool), http.MethodPost, "/api/projects/911031/approve-engineering", `{"role_type":"structural"}`, &stranger, "911031")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("integration forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, ApproveEngineeringIntegrationHandler(pool), http.MethodPost, "/api/projects/911031/approve-engineering", `{}`, &owner, "911031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("integration invalid = %d", rec.Code)
	}
	rec = hACall(t, ApproveEngineeringIntegrationHandler(pool), http.MethodPost, "/api/projects/911031/approve-engineering", `{"role_type":"structural"}`, &owner, "911031")
	if rec.Code != http.StatusOK {
		t.Fatalf("integration ok = %d %s", rec.Code, rec.Body.String())
	}
	var structApproved *string
	_ = pool.QueryRow(ctx, `SELECT structural_approved_at::text FROM projects WHERE id=911031`).Scan(&structApproved)
	if structApproved == nil {
		t.Fatalf("integration structural_approved_at missing")
	}

	// --- AuthorizeSpecialist / RejectSpecialist ---
	rec = hACall(t, AuthorizeSpecialistHandler(pool), http.MethodPost, "/api/projects/911031/authorize-specialist", `{"role_type":"structural","addendum_id":`+itoaTest(addID)+`}`, nil, "911031")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("authz unauth = %d", rec.Code)
	}
	rec = hACall(t, AuthorizeSpecialistHandler(pool), http.MethodPost, "/api/projects/911031/authorize-specialist", `{"role_type":"structural","addendum_id":`+itoaTest(addID)+`}`, &stranger, "911031")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("authz forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, AuthorizeSpecialistHandler(pool), http.MethodPost, "/api/projects/911031/authorize-specialist", `{}`, &owner, "911031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("authz invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, AuthorizeSpecialistHandler(pool), http.MethodPost, "/api/projects/911031/authorize-specialist", `{"role_type":"structural","addendum_id":`+itoaTest(addID)+`}`, &owner, "911031")
	if rec.Code != http.StatusOK {
		t.Fatalf("authz ok = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addID).Scan(&hireStatus)
	if hireStatus != "authorized" {
		t.Fatalf("authz status = %q, want authorized", hireStatus)
	}
	rec = hACall(t, RejectSpecialistHandler(pool), http.MethodPost, "/api/projects/911031/reject-specialist", `{"role_type":"structural","addendum_id":`+itoaTest(addID)+`,"reason":"hA no"}`, &owner, "911031")
	if rec.Code != http.StatusOK {
		t.Fatalf("reject-spec ok = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, RejectSpecialistHandler(pool), http.MethodPost, "/api/projects/911031/reject-specialist", `{"role_type":"structural","addendum_id":`+itoaTest(addID)+`}`, &stranger, "911031")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("reject-spec forbidden = %d", rec.Code)
	}
	rec = hACall(t, RejectSpecialistHandler(pool), http.MethodPost, "/api/projects/911031/reject-specialist", `{"role_type":"structural","addendum_id":999999999}`, &owner, "911031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reject-spec bad addendum = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// --- RejectEngineeringBid ---
	// seed a structural bid from structUser
	structProfile := structUser.id + 100000
	var bidID int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, structural_id, price, proposal, status, offered_by_id)
		VALUES (911031,'structural',$1,$2,$2,'12000000','hA struct bid','pending',$1) RETURNING id`, structUser.id, structProfile).Scan(&bidID); err != nil {
		t.Fatalf("bid seed: %v", err)
	}
	rec = hACallWithPaths(t, RejectEngineeringBidHandler(pool), http.MethodPost, "/api/projects/911031/reject-engineering-bid/"+itoaTest(bidID), `{"bid_type":"structural"}`, nil, map[string]string{"project": "911031", "bidId": itoaTest(bidID)})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("reject-bid unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, RejectEngineeringBidHandler(pool), http.MethodPost, "/api/projects/911031/reject-engineering-bid/"+itoaTest(bidID), `{"bid_type":"structural"}`, &stranger, map[string]string{"project": "911031", "bidId": itoaTest(bidID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("reject-bid forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, RejectEngineeringBidHandler(pool), http.MethodPost, "/api/projects/911031/reject-engineering-bid/"+itoaTest(bidID), `{}`, &arsitekUser, map[string]string{"project": "911031", "bidId": itoaTest(bidID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("reject-bid invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, RejectEngineeringBidHandler(pool), http.MethodPost, "/api/projects/911031/reject-engineering-bid/abc", `{"bid_type":"structural"}`, &arsitekUser, map[string]string{"project": "911031", "bidId": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("reject-bid bad-id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, RejectEngineeringBidHandler(pool), http.MethodPost, "/api/projects/911031/reject-engineering-bid/999999999", `{"bid_type":"structural"}`, &arsitekUser, map[string]string{"project": "911031", "bidId": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("reject-bid missing = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, RejectEngineeringBidHandler(pool), http.MethodPost, "/api/projects/911031/reject-engineering-bid/"+itoaTest(bidID), `{"bid_type":"structural"}`, &arsitekUser, map[string]string{"project": "911031", "bidId": itoaTest(bidID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("reject-bid ok = %d %s", rec.Code, rec.Body.String())
	}
	var rejBidStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id=$1`, bidID).Scan(&rejBidStatus)
	if rejBidStatus != "declined" {
		t.Fatalf("reject-bid status = %q, want declined", rejBidStatus)
	}

	// --- SubmitEngineeringInterview (architect only) ---
	rec = hACall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/api/projects/911031/submit-engineering-interview", `{"bid_id":`+itoaTest(bidID)+`,"bid_type":"structural","interview_notes":"hA good","is_recommended":true}`, &stranger, "911031")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("interview forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/api/projects/911031/submit-engineering-interview", `{}`, &arsitekUser, "911031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("interview invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/api/projects/911031/submit-engineering-interview", `{"bid_id":999999999,"bid_type":"structural","interview_notes":"hA","is_recommended":true}`, &arsitekUser, "911031")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("interview missing bid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/api/projects/911031/submit-engineering-interview", `{"bid_id":`+itoaTest(bidID)+`,"bid_type":"structural","interview_notes":"hA solid calc","is_recommended":true}`, &arsitekUser, "911031")
	if rec.Code != http.StatusOK {
		t.Fatalf("interview ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Interview notes saved and recommendation updated." {
		t.Fatalf("interview message = %q", got)
	}
	var recFlag bool
	var recStatus string
	_ = pool.QueryRow(ctx, `SELECT is_recommended, status::text FROM bids WHERE id=$1`, bidID).Scan(&recFlag, &recStatus)
	if !recFlag || recStatus != "recommended" {
		t.Fatalf("interview row = %v/%q, want true/recommended", recFlag, recStatus)
	}
	// non-recommended path
	rec = hACall(t, SubmitEngineeringInterviewHandler(pool), http.MethodPost, "/api/projects/911031/submit-engineering-interview", `{"bid_id":`+itoaTest(bidID)+`,"bid_type":"structural","interview_notes":"hA meh","is_recommended":false}`, &arsitekUser, "911031")
	if rec.Code != http.StatusOK {
		t.Fatalf("interview not-recommended = %d %s", rec.Code, rec.Body.String())
	}

	// --- Engineering logs ---
	rec = hACall(t, StoreEngineeringLogHandler(pool), http.MethodPost, "/api/projects/911031/engineering-logs", `{"role_type":"structural","title":"hA log","description":"hA work"}`, nil, "911031")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("eng-log unauth = %d", rec.Code)
	}
	rec = hACall(t, StoreEngineeringLogHandler(pool), http.MethodPost, "/api/projects/911031/engineering-logs", `{"role_type":"structural","title":"hA log"}`, &stranger, "911031")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("eng-log forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, StoreEngineeringLogHandler(pool), http.MethodPost, "/api/projects/911031/engineering-logs", `{}`, &arsitekUser, "911031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("eng-log invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, StoreEngineeringLogHandler(pool), http.MethodPost, "/api/projects/911031/engineering-logs", `{"role_type":"structural","title":"hA daily structural","description":"hA poured"}`, &arsitekUser, "911031")
	if rec.Code != http.StatusOK {
		t.Fatalf("eng-log ok = %d %s", rec.Code, rec.Body.String())
	}
	var logID int64
	var logPhase, logApproval string
	_ = pool.QueryRow(ctx, `SELECT id, phase_context::text, approval_status::text FROM project_milestones WHERE project_id=911031 AND title='hA daily structural' ORDER BY id DESC LIMIT 1`).Scan(&logID, &logPhase, &logApproval)
	if logID == 0 || logPhase != "structural" || logApproval != "approved" {
		t.Fatalf("eng log row = %d/%q/%q, want structural/approved", logID, logPhase, logApproval)
	}
	// delete: unauth/forbidden/bad-id/missing/non-manual/paid/happy
	rec = hACallWithPaths(t, DeleteEngineeringLogHandler(pool), http.MethodDelete, "/api/projects/911031/engineering-logs/x", ``, nil, map[string]string{"project": "911031", "milestone": itoaTest(logID)})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("eng-del unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, DeleteEngineeringLogHandler(pool), http.MethodDelete, "/api/projects/911031/engineering-logs/x", ``, &stranger, map[string]string{"project": "911031", "milestone": itoaTest(logID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("eng-del forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, DeleteEngineeringLogHandler(pool), http.MethodDelete, "/api/projects/911031/engineering-logs/abc", ``, &arsitekUser, map[string]string{"project": "911031", "milestone": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("eng-del bad-id = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, DeleteEngineeringLogHandler(pool), http.MethodDelete, "/api/projects/911031/engineering-logs/999999999", ``, &arsitekUser, map[string]string{"project": "911031", "milestone": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("eng-del missing = %d %s", rec.Code, rec.Body.String())
	}
	// non-manual milestone cannot be deleted here
	var plainID int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, phase_context, type, approval_status) VALUES (911031,'hA plain milestone','design','phase','pending') RETURNING id`).Scan(&plainID)
	rec = hACallWithPaths(t, DeleteEngineeringLogHandler(pool), http.MethodDelete, "/api/projects/911031/engineering-logs/x", ``, &arsitekUser, map[string]string{"project": "911031", "milestone": itoaTest(plainID)})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("eng-del non-manual = %d, want 400 %s", rec.Code, rec.Body.String())
	}
	// cross-project 403
	hAMkProject(t, pool, 911032, owner.id, "hA engineering project 2", "in_progress", "both", 100000000)
	rec = hACallWithPaths(t, DeleteEngineeringLogHandler(pool), http.MethodDelete, "/api/projects/911032/engineering-logs/x", ``, &arsitekUser, map[string]string{"project": "911032", "milestone": itoaTest(logID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("eng-del cross-project = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	// happy delete
	rec = hACallWithPaths(t, DeleteEngineeringLogHandler(pool), http.MethodDelete, "/api/projects/911031/engineering-logs/x", ``, &arsitekUser, map[string]string{"project": "911031", "milestone": itoaTest(logID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("eng-del ok = %d %s", rec.Code, rec.Body.String())
	}

	hACleanupUsers(t, pool)
	hAAssertNoLeftovers(t, pool)
}
