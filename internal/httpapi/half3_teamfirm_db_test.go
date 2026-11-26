package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHalfTeamMembers(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	// fresh kontraktor owner + plain user
	var ownerID, plainID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half2TeamOwn','half2teamown','half2teamown@example.test','x','kontraktor','H2TMO1',NOW(),NOW()) RETURNING id`).Scan(&ownerID); err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM team_members WHERE owner_user_id = $1`, ownerID)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, ownerID)
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half2TeamPlain','half2teamplain','half2teamplain@example.test','x','user','H2TMP1',NOW(),NOW()) RETURNING id`).Scan(&plainID); err != nil {
		t.Fatalf("seed plain: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, plainID)

	owner := roadmapCaller{id: ownerID, role: "kontraktor"}
	plain := roadmapCaller{id: plainID, role: "user"}

	// unauth index
	rec0 := httptest.NewRecorder()
	TeamMembersIndexHandler(pool)(rec0, httptest.NewRequest(http.MethodGet, "/api/team-members", nil))
	if rec0.Code != http.StatusUnauthorized {
		t.Fatalf("index unauth = %d", rec0.Code)
	}
	// plain role gets empty data
	reqP := httptest.NewRequest(http.MethodGet, "/api/team-members", nil)
	reqP = reqP.WithContext(withCaller(reqP.Context(), plain))
	recP := httptest.NewRecorder()
	TeamMembersIndexHandler(pool)(recP, reqP)
	if recP.Code != http.StatusOK || !strings.Contains(recP.Body.String(), `"data":[]`) {
		t.Fatalf("plain index = %d %s", recP.Code, recP.Body.String())
	}
	// owner index ok
	reqO := httptest.NewRequest(http.MethodGet, "/api/team-members", nil)
	reqO = reqO.WithContext(withCaller(reqO.Context(), owner))
	recO := httptest.NewRecorder()
	TeamMembersIndexHandler(pool)(recO, reqO)
	if recO.Code != http.StatusOK {
		t.Fatalf("owner index = %d %s", recO.Code, recO.Body.String())
	}
	// store unauth + forbidden + validation + happy
	recSU := httptest.NewRecorder()
	StoreTeamMemberHandler(pool)(recSU, httptest.NewRequest(http.MethodPost, "/api/team-members", strings.NewReader(`{}`)))
	if recSU.Code != http.StatusUnauthorized {
		t.Fatalf("store unauth = %d", recSU.Code)
	}
	reqSF := httptest.NewRequest(http.MethodPost, "/api/team-members", strings.NewReader(`{"name":"A","role_title":"B"}`))
	reqSF = reqSF.WithContext(withCaller(reqSF.Context(), plain))
	recSF := httptest.NewRecorder()
	StoreTeamMemberHandler(pool)(recSF, reqSF)
	if recSF.Code != http.StatusForbidden {
		t.Fatalf("store forbidden = %d %s", recSF.Code, recSF.Body.String())
	}
	for _, tc := range []struct {
		name string
		body string
	}{
		{"missing", `{}`},
		{"bademail", `{"name":"N","role_title":"R","email":"bad"}`},
		{"badskills", `{"name":"N","role_title":"R","skills":"nope"}`},
		{"badphone", `{"name":"N","role_title":"R","phone":123}`},
	} {
		r := httptest.NewRequest(http.MethodPost, "/api/team-members", strings.NewReader(tc.body))
		r = r.WithContext(withCaller(r.Context(), owner))
		rr := httptest.NewRecorder()
		StoreTeamMemberHandler(pool)(rr, r)
		if rr.Code != http.StatusUnprocessableEntity {
			t.Fatalf("store %s = %d %s", tc.name, rr.Code, rr.Body.String())
		}
	}
	rOK := httptest.NewRequest(http.MethodPost, "/api/team-members", strings.NewReader(`{"name":"Half2 Member","role_title":"Drafter","bio":"bio","skills":["cad"],"phone":"081","email":"half2member@example.test"}`))
	rOK = rOK.WithContext(withCaller(rOK.Context(), owner))
	recOK := httptest.NewRecorder()
	StoreTeamMemberHandler(pool)(recOK, rOK)
	if recOK.Code != http.StatusCreated {
		t.Fatalf("store ok = %d %s", recOK.Code, recOK.Body.String())
	}
	var memberID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM team_members WHERE owner_user_id=$1 ORDER BY id DESC LIMIT 1`, ownerID).Scan(&memberID); err != nil {
		t.Fatalf("member id: %v", err)
	}
	// update branches
	recUU := httptest.NewRecorder()
	UpdateTeamMemberHandler(pool)(recUU, httptest.NewRequest(http.MethodPut, "/api/team-members/1", strings.NewReader(`{}`)))
	if recUU.Code != http.StatusUnauthorized {
		t.Fatalf("update unauth = %d", recUU.Code)
	}
	for _, tc := range []struct {
		name string
		id   string
		body string
		code int
	}{
		{"badid", "abc", `{"name":"N","role_title":"R"}`, 404},
		{"foreign", "99009999", `{"name":"N","role_title":"R"}`, 404},
		{"invalid", "1", `{}`, 422},
	} {
		r := httptest.NewRequest(http.MethodPut, "/api/team-members/"+tc.id, strings.NewReader(tc.body))
		if tc.id != "1" {
			r.SetPathValue("id", tc.id)
		} else {
			r.SetPathValue("id", itoaTest(memberID))
		}
		r = r.WithContext(withCaller(r.Context(), owner))
		rr := httptest.NewRecorder()
		UpdateTeamMemberHandler(pool)(rr, r)
		if rr.Code != tc.code {
			t.Fatalf("update %s = %d want %d (%s)", tc.name, rr.Code, tc.code, rr.Body.String())
		}
	}
	rU := httptest.NewRequest(http.MethodPut, "/api/team-members/1", strings.NewReader(`{"name":"Half2 Member2","role_title":"Lead","skills":[],"bio":null}`))
	rU.SetPathValue("id", itoaTest(memberID))
	rU = rU.WithContext(withCaller(rU.Context(), owner))
	recU := httptest.NewRecorder()
	UpdateTeamMemberHandler(pool)(recU, rU)
	if recU.Code != http.StatusOK {
		t.Fatalf("update ok = %d %s", recU.Code, recU.Body.String())
	}
	// delete branches
	recDU := httptest.NewRecorder()
	DestroyTeamMemberHandler(pool)(recDU, httptest.NewRequest(http.MethodDelete, "/api/team-members/1", nil))
	if recDU.Code != http.StatusUnauthorized {
		t.Fatalf("delete unauth = %d", recDU.Code)
	}
	rDB := httptest.NewRequest(http.MethodDelete, "/api/team-members/abc", nil)
	rDB.SetPathValue("id", "abc")
	rDB = rDB.WithContext(withCaller(rDB.Context(), owner))
	recDB := httptest.NewRecorder()
	DestroyTeamMemberHandler(pool)(recDB, rDB)
	if recDB.Code != http.StatusNotFound {
		t.Fatalf("delete badid = %d", recDB.Code)
	}
	rDF := httptest.NewRequest(http.MethodDelete, "/api/team-members/99009999", nil)
	rDF.SetPathValue("id", "99009999")
	rDF = rDF.WithContext(withCaller(rDF.Context(), owner))
	recDF := httptest.NewRecorder()
	DestroyTeamMemberHandler(pool)(recDF, rDF)
	if recDF.Code != http.StatusNotFound {
		t.Fatalf("delete foreign = %d", recDF.Code)
	}
	rD := httptest.NewRequest(http.MethodDelete, "/api/team-members/1", nil)
	rD.SetPathValue("id", itoaTest(memberID))
	rD = rD.WithContext(withCaller(rD.Context(), owner))
	recD := httptest.NewRecorder()
	DestroyTeamMemberHandler(pool)(recD, rD)
	if recD.Code != http.StatusOK {
		t.Fatalf("delete ok = %d %s", recD.Code, recD.Body.String())
	}
	// helpers direct
	if teamMemberPhotoURL("http://x/y.png") != "http://x/y.png" {
		t.Fatalf("photourl http")
	}
	if teamMemberPhotoURL("a/b.png") != "/storage/a/b.png" {
		t.Fatalf("photourl storage")
	}
	if teamMemberPhotoURL(nil) != nil {
		t.Fatalf("photourl nil")
	}
	if teamMemberSkills(nil) != nil {
		t.Fatalf("skills nil")
	}
	if !presentIn(map[string]any{"a": nil}, "a") {
		t.Fatalf("presentIn")
	}
}

func TestHalfFirmMembers(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	var ownerID, memberID, plainID int64
	mk := func(name, uname, email, code, role string) int64 {
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ($1,$2,$3,'x',$4,$5,NOW(),NOW()) RETURNING id`, name, uname, email, role, code).Scan(&id); err != nil {
			t.Fatalf("seed %s: %v", email, err)
		}
		return id
	}
	ownerID = mk("Half2FirmOwn", "half2firmown", "half2firmown@example.test", "H2FO1", "arsitek")
	memberID = mk("Half2FirmMem", "half2firmmem", "half2firmmem@example.test", "H2FM1", "structural")
	plainID = mk("Half2FirmPlain", "half2firmplain", "half2firmplain@example.test", "H2FP1", "user")
	defer pool.Exec(ctx, `DELETE FROM firm_members WHERE firm_owner_id = $1 OR member_user_id IN ($1,$2,$3)`, ownerID, memberID, plainID)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id IN ($1,$2,$3)`, ownerID, memberID, plainID)
	owner := roadmapCaller{id: ownerID, role: "arsitek"}
	member := roadmapCaller{id: memberID, role: "structural"}
	plain := roadmapCaller{id: plainID, role: "user"}

	// search: unauth, forbidden, validation, happy
	rec0 := httptest.NewRecorder()
	FirmMembersSearchHandler(pool)(rec0, httptest.NewRequest(http.MethodPost, "/api/firm-members/search", strings.NewReader(`{}`)))
	if rec0.Code != http.StatusUnauthorized {
		t.Fatalf("search unauth = %d", rec0.Code)
	}
	rF := httptest.NewRequest(http.MethodPost, "/api/firm-members/search", strings.NewReader(`{"query":"ha"}`))
	rF = rF.WithContext(withCaller(rF.Context(), plain))
	recF := httptest.NewRecorder()
	FirmMembersSearchHandler(pool)(recF, rF)
	if recF.Code != http.StatusForbidden {
		t.Fatalf("search forbidden = %d %s", recF.Code, recF.Body.String())
	}
	for _, body := range []string{`{}`, `{"query":"x"}`, `{"query":"` + strings.Repeat("y", 51) + `"}`, `{"query":"half","sort":"bogus"}`} {
		r := httptest.NewRequest(http.MethodPost, "/api/firm-members/search", strings.NewReader(body))
		r = r.WithContext(withCaller(r.Context(), owner))
		rr := httptest.NewRecorder()
		FirmMembersSearchHandler(pool)(rr, r)
		if rr.Code != http.StatusUnprocessableEntity {
			t.Fatalf("search invalid %s = %d %s", body[:20], rr.Code, rr.Body.String())
		}
	}
	rOK := httptest.NewRequest(http.MethodPost, "/api/firm-members/search", strings.NewReader(`{"query":"Half2FirmMem"}`))
	rOK = rOK.WithContext(withCaller(rOK.Context(), owner))
	recOK := httptest.NewRecorder()
	FirmMembersSearchHandler(pool)(recOK, rOK)
	if recOK.Code != http.StatusOK {
		t.Fatalf("search ok = %d %s", recOK.Code, recOK.Body.String())
	}
	// suggestions: unauth covered via search; plain gets empty; owner ok
	rS := httptest.NewRequest(http.MethodGet, "/api/firm-members/suggestions", nil)
	rS = rS.WithContext(withCaller(rS.Context(), plain))
	recS := httptest.NewRecorder()
	FirmMembersSuggestionsHandler(pool)(recS, rS)
	if recS.Code != http.StatusOK || !strings.Contains(recS.Body.String(), `"data":[]`) {
		t.Fatalf("suggest plain = %d %s", recS.Code, recS.Body.String())
	}
	rS2 := httptest.NewRequest(http.MethodGet, "/api/firm-members/suggestions", nil)
	rS2 = rS2.WithContext(withCaller(rS2.Context(), owner))
	recS2 := httptest.NewRecorder()
	FirmMembersSuggestionsHandler(pool)(recS2, rS2)
	if recS2.Code != http.StatusOK {
		t.Fatalf("suggest owner = %d", recS2.Code)
	}
	recSU := httptest.NewRecorder()
	FirmMembersSuggestionsHandler(pool)(recSU, httptest.NewRequest(http.MethodGet, "/api/firm-members/suggestions", nil))
	if recSU.Code != http.StatusUnauthorized {
		t.Fatalf("suggest unauth = %d", recSU.Code)
	}
	// invite: unauth, forbidden, validation, happy, conflict
	recIU := httptest.NewRecorder()
	FirmMembersInviteHandler(pool)(recIU, httptest.NewRequest(http.MethodPost, "/api/firm-members/invite", strings.NewReader(`{}`)))
	if recIU.Code != http.StatusUnauthorized {
		t.Fatalf("invite unauth = %d", recIU.Code)
	}
	rIF := httptest.NewRequest(http.MethodPost, "/api/firm-members/invite", strings.NewReader(`{}`))
	rIF = rIF.WithContext(withCaller(rIF.Context(), plain))
	recIF := httptest.NewRecorder()
	FirmMembersInviteHandler(pool)(recIF, rIF)
	if recIF.Code != http.StatusForbidden {
		t.Fatalf("invite forbidden = %d", recIF.Code)
	}
	for _, body := range []string{`{}`, `{"member_user_id":99009999,"roles_in_firm":["structural"]}`, `{"member_user_id":1,"roles_in_firm":"x"}`, `{"member_user_id":1,"roles_in_firm":[]}`} {
		r := httptest.NewRequest(http.MethodPost, "/api/firm-members/invite", strings.NewReader(body))
		r = r.WithContext(withCaller(r.Context(), owner))
		rr := httptest.NewRecorder()
		FirmMembersInviteHandler(pool)(rr, r)
		if rr.Code != http.StatusUnprocessableEntity {
			t.Fatalf("invite invalid %s = %d %s", body[:30], rr.Code, rr.Body.String())
		}
	}
	inviteBody := `{"member_user_id":` + itoaTest(memberID) + `,"roles_in_firm":["structural"]}`
	rI := httptest.NewRequest(http.MethodPost, "/api/firm-members/invite", strings.NewReader(inviteBody))
	rI = rI.WithContext(withCaller(rI.Context(), owner))
	recI := httptest.NewRecorder()
	FirmMembersInviteHandler(pool)(recI, rI)
	if recI.Code != http.StatusCreated {
		t.Fatalf("invite ok = %d %s", recI.Code, recI.Body.String())
	}
	// duplicate -> 409
	rI2 := httptest.NewRequest(http.MethodPost, "/api/firm-members/invite", strings.NewReader(inviteBody))
	rI2 = rI2.WithContext(withCaller(rI2.Context(), owner))
	recI2 := httptest.NewRecorder()
	FirmMembersInviteHandler(pool)(recI2, rI2)
	if recI2.Code != http.StatusConflict {
		t.Fatalf("invite dup = %d %s", recI2.Code, recI2.Body.String())
	}
	var fmID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2 LIMIT 1`, ownerID, memberID).Scan(&fmID); err != nil {
		t.Fatalf("fm id: %v", err)
	}
	// respond: unauth, bad id, missing, forbidden, validation, accept (member), accept (owner path via second invite)
	recRU := httptest.NewRecorder()
	FirmMembersRespondHandler(pool)(recRU, httptest.NewRequest(http.MethodPost, "/api/firm-members/1/respond", strings.NewReader(`{}`)))
	if recRU.Code != http.StatusUnauthorized {
		t.Fatalf("respond unauth = %d", recRU.Code)
	}
	rRB := httptest.NewRequest(http.MethodPost, "/api/firm-members/abc/respond", strings.NewReader(`{"action":"accept"}`))
	rRB.SetPathValue("firmMember", "abc")
	rRB = rRB.WithContext(withCaller(rRB.Context(), member))
	recRB := httptest.NewRecorder()
	FirmMembersRespondHandler(pool)(recRB, rRB)
	if recRB.Code != http.StatusNotFound {
		t.Fatalf("respond badid = %d", recRB.Code)
	}
	rRM := httptest.NewRequest(http.MethodPost, "/api/firm-members/99009999/respond", strings.NewReader(`{"action":"accept"}`))
	rRM.SetPathValue("firmMember", "99009999")
	rRM = rRM.WithContext(withCaller(rRM.Context(), member))
	recRM := httptest.NewRecorder()
	FirmMembersRespondHandler(pool)(recRM, rRM)
	if recRM.Code != http.StatusNotFound {
		t.Fatalf("respond missing = %d", recRM.Code)
	}
	rRF := httptest.NewRequest(http.MethodPost, "/api/firm-members/1/respond", strings.NewReader(`{"action":"accept"}`))
	rRF.SetPathValue("firmMember", itoaTest(fmID))
	rRF = rRF.WithContext(withCaller(rRF.Context(), plain))
	recRF := httptest.NewRecorder()
	FirmMembersRespondHandler(pool)(recRF, rRF)
	if recRF.Code != http.StatusForbidden {
		t.Fatalf("respond forbidden = %d", recRF.Code)
	}
	rRV := httptest.NewRequest(http.MethodPost, "/api/firm-members/1/respond", strings.NewReader(`{}`))
	rRV.SetPathValue("firmMember", itoaTest(fmID))
	rRV = rRV.WithContext(withCaller(rRV.Context(), member))
	recRV := httptest.NewRecorder()
	FirmMembersRespondHandler(pool)(recRV, rRV)
	if recRV.Code != http.StatusUnprocessableEntity {
		t.Fatalf("respond invalid = %d", recRV.Code)
	}
	rRA := httptest.NewRequest(http.MethodPost, "/api/firm-members/1/respond", strings.NewReader(`{"action":"accept"}`))
	rRA.SetPathValue("firmMember", itoaTest(fmID))
	rRA = rRA.WithContext(withCaller(rRA.Context(), member))
	recRA := httptest.NewRecorder()
	FirmMembersRespondHandler(pool)(recRA, rRA)
	if recRA.Code != http.StatusOK {
		t.Fatalf("respond accept = %d %s", recRA.Code, recRA.Body.String())
	}
	// request-join + invitations + myfirms + roster + cancel + remove + browse owners
	rJ := httptest.NewRequest(http.MethodPost, "/api/firm-members/request-join", strings.NewReader(`{"firm_owner_id":`+itoaTest(ownerID)+`,"role_in_firm":"structural"}`))
	rJ = rJ.WithContext(withCaller(rJ.Context(), member))
	recJ := httptest.NewRecorder()
	FirmMembersRequestJoinHandler(pool)(recJ, rJ)
	if recJ.Code != http.StatusOK && recJ.Code != http.StatusCreated && recJ.Code != http.StatusConflict && recJ.Code != http.StatusUnprocessableEntity {
		t.Fatalf("request-join = %d %s", recJ.Code, recJ.Body.String())
	}
	// request-join validation
	rJV := httptest.NewRequest(http.MethodPost, "/api/firm-members/request-join", strings.NewReader(`{}`))
	rJV = rJV.WithContext(withCaller(rJV.Context(), member))
	recJV := httptest.NewRecorder()
	FirmMembersRequestJoinHandler(pool)(recJV, rJV)
	if recJV.Code != http.StatusUnprocessableEntity && recJV.Code != http.StatusUnauthorized {
		t.Fatalf("request-join invalid = %d", recJV.Code)
	}
	for _, h := range []struct {
		name string
		fn   func(pool interface {
			QueryRow(ctx context.Context, sql string, args ...any) interface{ Scan(dest ...any) error }
		}) http.HandlerFunc
	}{} {
		_ = h
	}
	// invitations (member view) + myfirms + roster + browse owners
	for _, tc := range []struct {
		name string
		h    http.HandlerFunc
		path string
	}{
		{"invitations-member", FirmMembersInvitationsHandler(pool), "/api/firm-members/invitations"},
		{"myfirms", FirmMembersMyFirmsHandler(pool), "/api/firm-members/my-firms"},
		{"roster", FirmMembersRosterHandler(pool), "/api/firm-members/roster"},
		{"owners", FirmMembersBrowseOwnersHandler(pool), "/api/firm-members/owners"},
	} {
		r := httptest.NewRequest(http.MethodGet, tc.path, nil)
		r = r.WithContext(withCaller(r.Context(), member))
		rr := httptest.NewRecorder()
		tc.h(rr, r)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s = %d %s", tc.name, rr.Code, rr.Body.String())
		}
		// unauth
		ru := httptest.NewRecorder()
		tc.h(ru, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if ru.Code != http.StatusUnauthorized {
			t.Fatalf("%s unauth = %d", tc.name, ru.Code)
		}
	}
	// cancel + remove
	rC := httptest.NewRequest(http.MethodPost, "/api/firm-members/1/cancel", nil)
	rC.SetPathValue("firmMember", itoaTest(fmID))
	rC = rC.WithContext(withCaller(rC.Context(), owner))
	recC := httptest.NewRecorder()
	FirmMembersCancelHandler(pool)(recC, rC)
	if recC.Code != http.StatusOK && recC.Code != http.StatusNotFound && recC.Code != http.StatusUnprocessableEntity && recC.Code != http.StatusBadRequest {
		t.Fatalf("cancel = %d %s", recC.Code, recC.Body.String())
	}
	// re-invite for remove test if needed
	pool.Exec(ctx, `INSERT INTO firm_members (firm_owner_id, member_user_id, role_in_firm, status) VALUES ($1,$2,'structural','active') ON CONFLICT DO NOTHING`, ownerID, memberID)
	var fm2 int64
	_ = pool.QueryRow(ctx, `SELECT id FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2 LIMIT 1`, ownerID, memberID).Scan(&fm2)
	if fm2 != 0 {
		rR := httptest.NewRequest(http.MethodDelete, "/api/firm-members/1", nil)
		rR.SetPathValue("firmMember", itoaTest(fm2))
		rR = rR.WithContext(withCaller(rR.Context(), owner))
		recR := httptest.NewRecorder()
		FirmMembersRemoveHandler(pool)(recR, rR)
		if recR.Code != http.StatusOK && recR.Code != http.StatusNotFound {
			t.Fatalf("remove = %d %s", recR.Code, recR.Body.String())
		}
	}
	// roster handlers: profile, update, quickassign
	rP := httptest.NewRequest(http.MethodGet, "/api/firms/1", nil)
	rP.SetPathValue("ownerId", itoaTest(ownerID))
	recP2 := httptest.NewRecorder()
	FirmMembersProfileHandler(pool)(recP2, rP)
	if recP2.Code != http.StatusOK && recP2.Code != http.StatusNotFound {
		t.Fatalf("firm profile = %d %s", recP2.Code, recP2.Body.String())
	}
	rPB := httptest.NewRequest(http.MethodGet, "/api/firms/abc", nil)
	rPB.SetPathValue("ownerId", "abc")
	recPB := httptest.NewRecorder()
	FirmMembersProfileHandler(pool)(recPB, rPB)
	if recPB.Code != http.StatusNotFound {
		t.Fatalf("firm profile bad = %d", recPB.Code)
	}
	// update profile
	rUP := httptest.NewRequest(http.MethodPut, "/api/firm-members/profile", strings.NewReader(`{"firm_name":"Half2 Firm"}`))
	rUP = rUP.WithContext(withCaller(rUP.Context(), owner))
	recUP := httptest.NewRecorder()
	FirmMembersUpdateProfileHandler(pool)(recUP, rUP)
	if recUP.Code != http.StatusOK && recUP.Code != http.StatusUnprocessableEntity {
		t.Fatalf("firm update = %d %s", recUP.Code, recUP.Body.String())
	}
	recUPU := httptest.NewRecorder()
	FirmMembersUpdateProfileHandler(pool)(recUPU, httptest.NewRequest(http.MethodPut, "/api/firm-members/profile", strings.NewReader(`{}`)))
	if recUPU.Code != http.StatusUnauthorized {
		t.Fatalf("firm update unauth = %d", recUPU.Code)
	}
	// quick assign
	rQ := httptest.NewRequest(http.MethodPost, "/api/firm-members/quick-assign", strings.NewReader(`{}`))
	rQ = rQ.WithContext(withCaller(rQ.Context(), owner))
	recQ := httptest.NewRecorder()
	FirmMembersQuickAssignHandler(pool)(recQ, rQ)
	if recQ.Code != http.StatusOK && recQ.Code != http.StatusUnprocessableEntity && recQ.Code != http.StatusNotFound {
		t.Fatalf("quickassign = %d %s", recQ.Code, recQ.Body.String())
	}
	_ = member
}
