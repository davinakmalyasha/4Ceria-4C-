package httpapi

// hQ firm-member leftovers: cancel/remove/respond/request-join happy paths
// with row literals, search/sort/invite branches, roster list rendering.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hQCallFirm(pool *pgxpool.Pool, h func(*pgxpool.Pool) http.HandlerFunc, method, path, pathKey, pathVal string, caller *roadmapCaller, body string) *httptest.ResponseRecorder {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	if pathKey != "" {
		r.SetPathValue(pathKey, pathVal)
	}
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	h(pool)(rec, r)
	return rec
}

func hQSeedFirmPair(t *testing.T, ctx context.Context, pool *pgxpool.Pool, ownerRole string) (owner, member int64) {
	t.Helper()
	owner = hQMkUser(t, ctx, pool, "firmown", ownerRole)
	member = hQMkUser(t, ctx, pool, "firmmem", "structural")
	return owner, member
}

func hQCleanupFirmPair(ctx context.Context, pool *pgxpool.Pool, owner, member int64) {
	pool.Exec(ctx, `DELETE FROM firm_members WHERE firm_owner_id=$1 OR member_user_id=$1`, owner)
	pool.Exec(ctx, `DELETE FROM firm_members WHERE firm_owner_id=$1 OR member_user_id=$1`, member)
	hQCleanupUser(ctx, pool, member)
	hQCleanupUser(ctx, pool, owner)
}

func TestHQFirmCancelRemove(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner, member := hQSeedFirmPair(t, ctx, pool, "arsitek")
	defer hQCleanupFirmPair(ctx, pool, owner, member)
	plain := hQMkUser(t, ctx, pool, "firmplain", "user")
	defer hQCleanupUser(ctx, pool, plain)
	ownerCaller := &roadmapCaller{id: owner, role: "arsitek"}
	memberCaller := &roadmapCaller{id: member, role: "structural"}
	plainCaller := &roadmapCaller{id: plain, role: "user"}

	invite := func() int64 {
		rec := hQCallFirm(pool, FirmMembersInviteHandler, http.MethodPost, "/x", "", "", ownerCaller, `{"member_user_id":`+itoaTest(member)+`,"roles_in_firm":["structural"]}`)
		if rec.Code != http.StatusCreated {
			t.Fatalf("setup invite = %d %s", rec.Code, rec.Body.String())
		}
		var id int64
		_ = pool.QueryRow(ctx, `SELECT id FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2 AND status='invited'`, owner, member).Scan(&id)
		return id
	}

	// Unauth twins
	if rec := hQCallFirm(pool, FirmMembersCancelHandler, http.MethodPost, "/x", "firmMember", "1", nil, ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("cancel unauth = %d", rec.Code)
	}
	if rec := hQCallFirm(pool, FirmMembersRemoveHandler, http.MethodDelete, "/x", "firmMember", "1", nil, ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("remove unauth = %d", rec.Code)
	}
	// Bad ids — model literals
	rec := hQCallFirm(pool, FirmMembersCancelHandler, http.MethodPost, "/x", "firmMember", "hQ-bad", ownerCaller, "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cancel bad = %d", rec.Code)
	}
	if got := hQDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\FirmMember] hQ-bad` {
		t.Fatalf("cancel bad msg = %q", got)
	}
	rec = hQCallFirm(pool, FirmMembersRemoveHandler, http.MethodDelete, "/x", "firmMember", "hQ-bad", ownerCaller, "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("remove bad = %d", rec.Code)
	}
	// Missing rows — 404 pins
	if rec := hQCallFirm(pool, FirmMembersCancelHandler, http.MethodPost, "/x", "firmMember", "99009999", ownerCaller, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("cancel missing = %d", rec.Code)
	}
	if rec := hQCallFirm(pool, FirmMembersRemoveHandler, http.MethodDelete, "/x", "firmMember", "99009999", ownerCaller, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("remove missing = %d", rec.Code)
	}

	fm := invite()
	// Non-owner — exact 403
	rec = hQCallFirm(pool, FirmMembersCancelHandler, http.MethodPost, "/x", "firmMember", itoaTest(fm), memberCaller, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("cancel non-owner = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Unauthorized." {
		t.Fatalf("cancel non-owner msg = %q", got)
	}
	rec = hQCallFirm(pool, FirmMembersRemoveHandler, http.MethodDelete, "/x", "firmMember", itoaTest(fm), plainCaller, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("remove non-owner = %d", rec.Code)
	}
	// Remove on invited (non-active) — exact 400
	rec = hQCallFirm(pool, FirmMembersRemoveHandler, http.MethodDelete, "/x", "firmMember", itoaTest(fm), ownerCaller, "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("remove invited = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Only active members can be removed." {
		t.Fatalf("remove invited msg = %q", got)
	}
	// Cancel happy — exact message + row gone (literal count 0)
	rec = hQCallFirm(pool, FirmMembersCancelHandler, http.MethodPost, "/x", "firmMember", itoaTest(fm), ownerCaller, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("cancel happy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Invitation cancelled successfully." {
		t.Fatalf("cancel msg = %q", got)
	}
	var gone int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM firm_members WHERE id=$1`, fm).Scan(&gone)
	if gone != 0 {
		t.Fatalf("cancel row left = %d", gone)
	}

	// Accept then cancel-on-active — exact 400
	fm2 := invite()
	rec = hQCallFirm(pool, FirmMembersRespondHandler, http.MethodPost, "/x", "firmMember", itoaTest(fm2), memberCaller, `{"action":"accept"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("accept = %d %s", rec.Code, rec.Body.String())
	}
	rec = hQCallFirm(pool, FirmMembersCancelHandler, http.MethodPost, "/x", "firmMember", itoaTest(fm2), ownerCaller, "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("cancel active = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Only pending invitations can be cancelled." {
		t.Fatalf("cancel active msg = %q", got)
	}
	// Remove happy — exact message + status literal
	rec = hQCallFirm(pool, FirmMembersRemoveHandler, http.MethodDelete, "/x", "firmMember", itoaTest(fm2), ownerCaller, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("remove happy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Member offboarded successfully." {
		t.Fatalf("remove msg = %q", got)
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM firm_members WHERE id=$1`, fm2).Scan(&st)
	if st != "removed" {
		t.Fatalf("remove row = %q want removed", st)
	}
}

func TestHQFirmRespondJoin(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner, member := hQSeedFirmPair(t, ctx, pool, "arsitek")
	defer hQCleanupFirmPair(ctx, pool, owner, member)
	ownerCaller := &roadmapCaller{id: owner, role: "arsitek"}
	memberCaller := &roadmapCaller{id: member, role: "structural"}

	respond := func(caller *roadmapCaller, id, body string) *httptest.ResponseRecorder {
		return hQCallFirm(pool, FirmMembersRespondHandler, http.MethodPost, "/x", "firmMember", id, caller, body)
	}
	// Invalid action — exact message
	var fm int64
	_ = pool.QueryRow(ctx, `INSERT INTO firm_members (firm_owner_id, member_user_id, role_in_firm, status) VALUES ($1,$2,'structural','invited') RETURNING id`, owner, member).Scan(&fm)
	rec := respond(memberCaller, itoaTest(fm), `{"action":"maybe"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("respond action = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "action", "The selected action is invalid.")

	// Decline by member — exact message + row literal
	rec = respond(memberCaller, itoaTest(fm), `{"action":"decline"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("decline member = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Invitation declined." {
		t.Fatalf("decline member msg = %q", got)
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM firm_members WHERE id=$1`, fm).Scan(&st)
	if st != "removed" {
		t.Fatalf("decline row = %q", st)
	}

	// Request-join flow: member requests, owner accepts — exact messages
	pool.Exec(ctx, `DELETE FROM firm_members WHERE id=$1`, fm)
	joinBody := `{"firm_owner_id":` + itoaTest(owner) + `,"role_in_firm":"structural"}`
	rec = hQCallFirm(pool, FirmMembersRequestJoinHandler, http.MethodPost, "/x", "", "", memberCaller, joinBody)
	if rec.Code != http.StatusCreated {
		t.Fatalf("request-join = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Join request sent successfully." {
		t.Fatalf("request-join msg = %q", got)
	}
	var rqID int64
	var rqStatus, rqRole string
	_ = pool.QueryRow(ctx, `SELECT id, status::text, role_in_firm FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2`, owner, member).Scan(&rqID, &rqStatus, &rqRole)
	if rqStatus != "requested" || rqRole != "structural" {
		t.Fatalf("request-join row = %q %q", rqStatus, rqRole)
	}
	// Conflict twin — exact 409
	rec = hQCallFirm(pool, FirmMembersRequestJoinHandler, http.MethodPost, "/x", "", "", memberCaller, joinBody)
	if rec.Code != http.StatusConflict {
		t.Fatalf("request-join dup = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "You already have a pending connection with this firm." {
		t.Fatalf("request-join dup msg = %q", got)
	}
	// Owner accepts the request — exact message
	rec = respond(ownerCaller, itoaTest(rqID), `{"action":"accept"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("accept owner = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Join request accepted." {
		t.Fatalf("accept owner msg = %q", got)
	}
	// Fresh request then owner declines — exact message
	pool.Exec(ctx, `DELETE FROM firm_members WHERE id=$1`, rqID)
	rec = hQCallFirm(pool, FirmMembersRequestJoinHandler, http.MethodPost, "/x", "", "", memberCaller, joinBody)
	if rec.Code != http.StatusCreated {
		t.Fatalf("request-join 2 = %d", rec.Code)
	}
	var rq2 int64
	_ = pool.QueryRow(ctx, `SELECT id FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2`, owner, member).Scan(&rq2)
	rec = respond(ownerCaller, itoaTest(rq2), `{"action":"decline"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("decline owner = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Join request declined." {
		t.Fatalf("decline owner msg = %q", got)
	}
	// Request-join validation twins — exact messages
	rec = hQCallFirm(pool, FirmMembersRequestJoinHandler, http.MethodPost, "/x", "", "", memberCaller, `{}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("request-join missing = %d", rec.Code)
	}
	hCErrors(t, rec, "firm_owner_id", "The firm owner id field is required.")
	rec = hQCallFirm(pool, FirmMembersRequestJoinHandler, http.MethodPost, "/x", "", "", memberCaller, `{"firm_owner_id":99009999,"role_in_firm":"structural"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("request-join bad owner = %d", rec.Code)
	}
	hCErrors(t, rec, "firm_owner_id", "The selected firm owner id is invalid.")
	rec = hQCallFirm(pool, FirmMembersRequestJoinHandler, http.MethodPost, "/x", "", "", memberCaller, `{"firm_owner_id":`+itoaTest(owner)+`,"role_in_firm":"`+strings.Repeat("r", 51)+`"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("request-join long role = %d", rec.Code)
	}
	hCErrors(t, rec, "role_in_firm", "The role in firm field must not be greater than 50 characters.")
	rec = hQCallFirm(pool, FirmMembersRequestJoinHandler, http.MethodPost, "/x", "", "", memberCaller, `{"firm_owner_id":`+itoaTest(owner)+`,"role_in_firm":7}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("request-join role type = %d", rec.Code)
	}
	hCErrors(t, rec, "role_in_firm", "The role in firm field must be a string.")
	// Unauth twin
	if rec := hQCallFirm(pool, FirmMembersRequestJoinHandler, http.MethodPost, "/x", "", "", nil, joinBody); rec.Code != http.StatusUnauthorized {
		t.Fatalf("request-join unauth = %d", rec.Code)
	}
}

func TestHQFirmSearchInviteBranches(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	kontra, mem := hQSeedFirmPair(t, ctx, pool, "kontraktor")
	defer hQCleanupFirmPair(ctx, pool, kontra, mem)
	kontraCaller := &roadmapCaller{id: kontra, role: "kontraktor"}

	// Search: query must be a string — exact message
	rec := hQCallFirm(pool, FirmMembersSearchHandler, http.MethodPost, "/x", "", "", kontraCaller, `{"query":7}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("search type = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "query", "The query field must be a string.")
	// Search z-a sort happy (kontraktor roles from subspecialties)
	rec = hQCallFirm(pool, FirmMembersSearchHandler, http.MethodPost, "/x", "", "", kontraCaller, `{"query":"`+strings.Repeat("a", 50)+`","sort":"z-a"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("search za = %d %s", rec.Code, rec.Body.String())
	}
	// Kontraktor invite happy with seeded subspecialty role
	var slug string
	if err := pool.QueryRow(ctx, `SELECT slug FROM contractor_subspecialties ORDER BY id LIMIT 1`).Scan(&slug); err != nil {
		t.Skip("no subspecialties")
	}
	inviteBody := `{"member_user_id":` + itoaTest(mem) + `,"roles_in_firm":["` + slug + `"]}`
	rec = hQCallFirm(pool, FirmMembersInviteHandler, http.MethodPost, "/x", "", "", kontraCaller, inviteBody)
	if rec.Code != http.StatusCreated {
		t.Fatalf("kontraktor invite = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); !strings.HasPrefix(got, "Invitations sent to ") {
		t.Fatalf("kontraktor invite msg = %q", got)
	}
	var gotRole string
	_ = pool.QueryRow(ctx, `SELECT role_in_firm FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2`, kontra, mem).Scan(&gotRole)
	if gotRole != slug {
		t.Fatalf("kontraktor invite row = %q want %q", gotRole, slug)
	}
	// Invalid role for kontraktor — exact indexed message
	rec = hQCallFirm(pool, FirmMembersInviteHandler, http.MethodPost, "/x", "", "", kontraCaller, `{"member_user_id":`+itoaTest(mem)+`,"roles_in_firm":["hQ-bogus"]}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invite bad role = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "roles_in_firm.0", "The selected roles_in_firm.0 is invalid.")
	// Non-string role — exact message
	rec = hQCallFirm(pool, FirmMembersInviteHandler, http.MethodPost, "/x", "", "", kontraCaller, `{"member_user_id":`+itoaTest(mem)+`,"roles_in_firm":[7]}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invite role type = %d", rec.Code)
	}
	hCErrors(t, rec, "roles_in_firm.0", "The roles_in_firm.0 field must be a string.")
	// Too-long role — exact message
	rec = hQCallFirm(pool, FirmMembersInviteHandler, http.MethodPost, "/x", "", "", kontraCaller, `{"member_user_id":`+itoaTest(mem)+`,"roles_in_firm":["`+strings.Repeat("r", 51)+`"]}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invite role long = %d", rec.Code)
	}
	hCErrors(t, rec, "roles_in_firm.0", "The roles_in_firm.0 field must not be greater than 50 characters.")
	// Missing member — exact message
	rec = hQCallFirm(pool, FirmMembersInviteHandler, http.MethodPost, "/x", "", "", kontraCaller, `{"roles_in_firm":["`+slug+`"]}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invite missing member = %d", rec.Code)
	}
	hCErrors(t, rec, "member_user_id", "The member user id field is required.")
	// Unknown member — exact message
	rec = hQCallFirm(pool, FirmMembersInviteHandler, http.MethodPost, "/x", "", "", kontraCaller, `{"member_user_id":99009999,"roles_in_firm":["`+slug+`"]}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invite unknown member = %d", rec.Code)
	}
	hCErrors(t, rec, "member_user_id", "The selected member user id is invalid.")
}

func TestHQFirmRosterLists(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner, member := hQSeedFirmPair(t, ctx, pool, "arsitek")
	defer hQCleanupFirmPair(ctx, pool, owner, member)
	plain := hQMkUser(t, ctx, pool, "firmplain2", "user")
	defer hQCleanupUser(ctx, pool, plain)
	ownerCaller := &roadmapCaller{id: owner, role: "arsitek"}
	memberCaller := &roadmapCaller{id: member, role: "arsitek"}

	// Roster matching keys on the member professional role: the hired slot
	// below is the arsitek column, so the member rows as an arsitek.
	if _, err := pool.Exec(ctx, `UPDATE users SET role_type='arsitek' WHERE id=$1`, member); err != nil {
		t.Fatalf("member role: %v", err)
	}
	plainCaller := &roadmapCaller{id: plain, role: "user"}

	// Member profile + portfolio + hired project for roster rendering
	var memProf int64
	_ = pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status, no_telp, rate_harga, pengalaman_tahun, deskripsi, lokasi) VALUES ($1,'hQ Mem','verified','081','150000','4','hQ desc','hQ lok') RETURNING id`, member).Scan(&memProf)
	if _, err := pool.Exec(ctx, `INSERT INTO professional_portfolios (user_id, role_type, title, description) VALUES ($1,'structural','hQ Port','hQ port desc')`, member); err != nil {
		t.Fatalf("portfolio: %v", err)
	}
	var ownerProj int64
	_ = pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget, selected_arsitek_id) VALUES ($1,'hQ Roster Project','open',10000000,$2) RETURNING id`, owner, memProf).Scan(&ownerProj)
	pool.Exec(ctx, `DELETE FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2`, owner, member)
	if _, err := pool.Exec(ctx, `INSERT INTO firm_members (firm_owner_id, member_user_id, role_in_firm, status) VALUES ($1,$2,'structural','invited')`, owner, member); err != nil {
		t.Fatalf("invite row: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, ownerProj)
	defer pool.Exec(ctx, `DELETE FROM professional_portfolios WHERE user_id=$1`, member)
	pool.Exec(ctx, `UPDATE users SET firm_is_hiring=true WHERE id=$1`, owner)
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, memProf)

	// invitations: member sees the pending row with firm_owner card
	rec := hQCallFirm(pool, FirmMembersInvitationsHandler, http.MethodGet, "/x", "", "", memberCaller, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("invitations = %d %s", rec.Code, rec.Body.String())
	}
	inv := hQDecode(t, rec)["data"].([]any)
	if len(inv) != 1 {
		t.Fatalf("invitations len = %v", hQDecode(t, rec))
	}
	invOwner := inv[0].(map[string]any)["firm_owner"].(map[string]any)
	if int64(invOwner["id"].(float64)) != owner {
		t.Fatalf("invitations owner = %v", invOwner)
	}
	// my-firms empty for invited; accept then my-firms has the row
	rec = hQCallFirm(pool, FirmMembersMyFirmsHandler, http.MethodGet, "/x", "", "", memberCaller, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("myfirms empty = %d", rec.Code)
	}
	if len(hQDecode(t, rec)["data"].([]any)) != 0 {
		t.Fatalf("myfirms want empty")
	}
	pool.Exec(ctx, `UPDATE firm_members SET status='active', accepted_at=NOW() WHERE firm_owner_id=$1 AND member_user_id=$2`, owner, member)
	rec = hQCallFirm(pool, FirmMembersMyFirmsHandler, http.MethodGet, "/x", "", "", memberCaller, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("myfirms = %d", rec.Code)
	}
	if len(hQDecode(t, rec)["data"].([]any)) != 1 {
		t.Fatalf("myfirms len")
	}
	// roster: owner sees the active member with rendered profile block
	rec = hQCallFirm(pool, FirmMembersRosterHandler, http.MethodGet, "/x", "", "", ownerCaller, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("roster = %d %s", rec.Code, rec.Body.String())
	}
	ros := hQDecode(t, rec)["data"].([]any)
	if len(ros) != 1 {
		t.Fatalf("roster len = %d", len(ros))
	}
	rm := ros[0].(map[string]any)["member"].(map[string]any)
	if rm["name"].(string) == "" || rm["no_telp"] == nil {
		t.Fatalf("roster member = %v", rm)
	}
	if _, ok := rm["portfolios"]; !ok {
		t.Fatalf("roster portfolios missing")
	}
	projs := ros[0].(map[string]any)["active_projects"].([]any)
	if len(projs) != 1 || projs[0].(string) != "hQ Roster Project" {
		t.Fatalf("roster projects = %v", projs)
	}
	// roster for non-firm role — data [] literal
	rec = hQCallFirm(pool, FirmMembersRosterHandler, http.MethodGet, "/x", "", "", plainCaller, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"data":[]`) {
		t.Fatalf("roster plain = %d %s", rec.Code, rec.Body.String())
	}
	// browse owners: long query 422; search + default branches 200
	rec = hQCallFirm(pool, FirmMembersBrowseOwnersHandler, http.MethodGet, "/x?query="+strings.Repeat("q", 51), "", "", memberCaller, "")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("browse long = %d", rec.Code)
	}
	hCErrors(t, rec, "query", "The query field must not be greater than 50 characters.")
	for _, q := range []string{"/x?query=firmown", "/x"} {
		rec = hQCallFirm(pool, FirmMembersBrowseOwnersHandler, http.MethodGet, q, "", "", memberCaller, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("browse %s = %d %s", q, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "currentUserMembershipStatus") {
			t.Fatalf("browse %s shape = %s", q, rec.Body.String())
		}
	}
	// suggestions happy for kontraktor-less owner: 200 envelope
	rec = hQCallFirm(pool, FirmMembersSuggestionsHandler, http.MethodGet, "/x?x=1", "", "", ownerCaller, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "data") {
		t.Fatalf("suggest = %d %s", rec.Code, rec.Body.String())
	}
}

func TestHQFirmPureHelpers(t *testing.T) {
	if got := firmTargetRoles("kontraktor"); len(got) == 0 || got[0] != "civil" {
		t.Fatalf("kontraktor roles = %v", got)
	}
	if firmTargetRoles("bogus") != nil {
		t.Fatalf("bogus roles")
	}
	if got := firmAssetURL(context.Background(), "http://x.test/a.png"); got != "http://x.test/a.png" {
		t.Fatalf("asset http = %v", got)
	}
	if firmAssetURL(context.Background(), nil) != nil {
		t.Fatalf("asset nil")
	}
	if got := firmAssetURL(context.Background(), "avatars/hQ.png"); got == nil || !strings.HasSuffix(got.(string), "/storage/avatars/hQ.png") {
		t.Fatalf("asset storage = %v", got)
	}
	// respond via raw URL fallback (no PathValue): exercises firmMemberIDFromPath trim branch
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner, member := hQSeedFirmPair(t, ctx, pool, "arsitek")
	defer hQCleanupFirmPair(ctx, pool, owner, member)
	ownerCaller := &roadmapCaller{id: owner, role: "arsitek"}
	memberCaller := &roadmapCaller{id: member, role: "structural"}
	var fm int64
	_ = pool.QueryRow(ctx, `INSERT INTO firm_members (firm_owner_id, member_user_id, role_in_firm, status) VALUES ($1,$2,'structural','invited') RETURNING id`, owner, member).Scan(&fm)
	r := httptest.NewRequest(http.MethodPost, "/api/firm-members/"+itoaTest(fm)+"/respond", strings.NewReader(`{"action":"accept"}`))
	r = r.WithContext(withCaller(r.Context(), *memberCaller))
	_ = ownerCaller
	rec := httptest.NewRecorder()
	FirmMembersRespondHandler(pool)(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("respond fallback = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "You have joined the firm." {
		t.Fatalf("respond fallback msg = %q", got)
	}
	_ = pool
}

func hQDecode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	return hCDecode(t, rec)
}
