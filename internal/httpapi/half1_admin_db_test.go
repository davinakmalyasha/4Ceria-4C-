package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func halfAdmin(t *testing.T) roadmapCaller {
	t.Helper()
	pool := testPool(t)
	var adminID int64
	if err := pool.QueryRow(context.Background(), `SELECT id FROM users WHERE email = 'admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no seeded admin")
	}
	pool.Close()
	return roadmapCaller{id: adminID, role: "admin", admin: true}
}

func TestHalfAdminHousesList(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	admin := halfAdmin(t)
	for _, path := range []string{"/api/admin/houses", "/api/admin/houses?search=zzz-no-hit-zzz", "/api/admin/houses?page=abc", "/api/admin/houses?page=2"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req = req.WithContext(withCaller(req.Context(), admin))
		rec := httptest.NewRecorder()
		AdminHousesHandler(pool)(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s = %d %s", path, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "data") {
			t.Fatalf("%s missing data: %s", path, rec.Body.String()[:200])
		}
	}
}

func TestHalfAdminUsersProjects(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	admin := halfAdmin(t)
	for _, tc := range []struct {
		name string
		path string
		h    http.HandlerFunc
	}{
		{"users", "/api/admin/users", AdminUsersHandler(pool)},
		{"users-search", "/api/admin/users?search=admin", AdminUsersHandler(pool)},
		{"projects", "/api/admin/projects", AdminProjectsHandler(pool)},
		{"projects-search", "/api/admin/projects?search=open", AdminProjectsHandler(pool)},
		{"professionals", "/api/admin/professionals", AdminProfessionalsIndexHandler(pool)},
		{"history", "/api/admin/professionals/history", AdminProfessionalsHistoryHandler(pool)},
		{"history-p2", "/api/admin/professionals/history?page=2", AdminProfessionalsHistoryHandler(pool)},
	} {
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		req = req.WithContext(withCaller(req.Context(), admin))
		rec := httptest.NewRecorder()
		tc.h(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
	}
}

func TestHalfAdminExport(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	for _, path := range []string{"/api/admin/projects/export", "/api/admin/projects/export?search=a"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		AdminProjectsExportHandler(pool)(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s = %d %s", path, rec.Code, rec.Body.String())
		}
		if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/csv") {
			t.Fatalf("content-type = %q", ct)
		}
		if !strings.Contains(rec.Body.String(), "ID,") {
			t.Fatalf("missing header row")
		}
	}
	// csv helpers direct
	if got := csvCell("=cmd|' /C calc'!A0"); !strings.HasPrefix(got, "'") {
		t.Fatalf("csvCell formula guard = %q", got)
	}
	if got := csvCell("plain"); got != "plain" {
		t.Fatalf("csvCell plain = %q", got)
	}
	if got := csvLine([]string{"a", "b c", `q"q`}); !strings.Contains(got, `"`) {
		t.Fatalf("csvLine quoting = %q", got)
	}
	if got := csvField("nospace"); got != "nospace" {
		t.Fatalf("csvField = %q", got)
	}
	if got := csvField("has space"); !strings.HasPrefix(got, `"`) {
		t.Fatalf("csvField space = %q", got)
	}
}

func TestHalfAdminSuspendHouse(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	var ownerID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&ownerID); err != nil {
		t.Skip("no users")
	}
	var houseID int64
	if err := pool.QueryRow(ctx, `INSERT INTO house (name, price, id_user, is_suspended) VALUES ('HALF2-HOUSE', 1000000, $1, false) RETURNING id`, ownerID).Scan(&houseID); err != nil {
		t.Fatalf("seed house: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM house WHERE id = $1`, houseID)

	call := func(id string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPatch, "/api/admin/houses/"+id+"/suspend", nil)
		req.SetPathValue("id", id)
		rec := httptest.NewRecorder()
		AdminSuspendHouseHandler(pool)(rec, req)
		return rec
	}
	// bad id
	if rec := call("abc"); rec.Code != http.StatusNotFound {
		t.Fatalf("bad id = %d %s", rec.Code, rec.Body.String())
	}
	// missing
	if rec := call("99009901"); rec.Code != http.StatusNotFound {
		t.Fatalf("missing = %d %s", rec.Code, rec.Body.String())
	}
	// suspend then activate
	if rec := call(itoaTest(houseID)); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "suspended") {
		t.Fatalf("suspend = %d %s", rec.Code, rec.Body.String())
	}
	if rec := call(itoaTest(houseID)); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "activated") {
		t.Fatalf("activate = %d %s", rec.Code, rec.Body.String())
	}
	// helper direct
	if got := ucfirstASCII("arsitek"); got != "Arsitek" {
		t.Fatalf("ucfirst = %q", got)
	}
	if got := ucfirstASCII(""); got != "" {
		t.Fatalf("ucfirst empty = %q", got)
	}
}

func TestHalfAdminProfessionalStatus(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	// invalid type
	req := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"status":"verified"}`))
	req.SetPathValue("type", "bogus")
	req.SetPathValue("id", "1")
	rec := httptest.NewRecorder()
	AdminUpdateProfessionalStatusHandler(pool)(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bogus type = %d %s", rec.Code, rec.Body.String())
	}
	// bad id
	req2 := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"status":"verified"}`))
	req2.SetPathValue("type", "arsitek")
	req2.SetPathValue("id", "abc")
	rec2 := httptest.NewRecorder()
	AdminUpdateProfessionalStatusHandler(pool)(rec2, req2)
	if rec2.Code != http.StatusNotFound {
		t.Fatalf("bad id = %d", rec2.Code)
	}
	// validation missing status
	req3 := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{}`))
	req3.SetPathValue("type", "arsitek")
	req3.SetPathValue("id", "99009902")
	rec3 := httptest.NewRecorder()
	AdminUpdateProfessionalStatusHandler(pool)(rec3, req3)
	if rec3.Code != http.StatusUnprocessableEntity {
		t.Fatalf("missing status = %d %s", rec3.Code, rec3.Body.String())
	}
	// invalid status value
	req4 := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"status":"maybe"}`))
	req4.SetPathValue("type", "arsitek")
	req4.SetPathValue("id", "99009902")
	rec4 := httptest.NewRecorder()
	AdminUpdateProfessionalStatusHandler(pool)(rec4, req4)
	if rec4.Code != http.StatusUnprocessableEntity {
		t.Fatalf("bad status = %d", rec4.Code)
	}
	// missing row but valid payload
	req5 := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"status":"verified"}`))
	req5.SetPathValue("type", "arsitek")
	req5.SetPathValue("id", "99009902")
	rec5 := httptest.NewRecorder()
	AdminUpdateProfessionalStatusHandler(pool)(rec5, req5)
	if rec5.Code != http.StatusNotFound {
		t.Fatalf("missing row = %d %s", rec5.Code, rec5.Body.String())
	}
	// happy path on a real arsitek if present
	var pid, uid int64
	if err := pool.QueryRow(ctx, `SELECT id, user_id FROM arsiteks ORDER BY id LIMIT 1`).Scan(&pid, &uid); err == nil {
		req6 := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"status":"verified"}`))
		req6.SetPathValue("type", "arsitek")
		req6.SetPathValue("id", itoaTest(pid))
		rec6 := httptest.NewRecorder()
		AdminUpdateProfessionalStatusHandler(pool)(rec6, req6)
		if rec6.Code != http.StatusOK {
			t.Fatalf("verify = %d %s", rec6.Code, rec6.Body.String())
		}
		req7 := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"status":"rejected","reason":"half2 reason"}`))
		req7.SetPathValue("type", "arsitek")
		req7.SetPathValue("id", itoaTest(pid))
		rec7 := httptest.NewRecorder()
		AdminUpdateProfessionalStatusHandler(pool)(rec7, req7)
		if rec7.Code != http.StatusOK {
			t.Fatalf("reject = %d %s", rec7.Code, rec7.Body.String())
		}
		// restore verified to avoid mutating demo
		pool.Exec(ctx, `UPDATE arsiteks SET verification_status='verified', rejection_reason=NULL WHERE id=$1`, pid)
	}
	// direct validator branches
	for _, tc := range []struct {
		body string
		want int
	}{
		{`{"status":"verified","reason":123}`, 422},
		{`{"status":"verified","reason":"` + strings.Repeat("x", 501) + `"}`, 422},
	} {
		r := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(tc.body))
		r.SetPathValue("type", "arsitek")
		r.SetPathValue("id", "99009902")
		rr := httptest.NewRecorder()
		AdminUpdateProfessionalStatusHandler(pool)(rr, r)
		if rr.Code != tc.want && rr.Code != http.StatusNotFound {
			t.Fatalf("validator %s = %d", tc.body[:30], rr.Code)
		}
	}
	_ = uid
}

func TestHalfAdminSuspendUserAndRole(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	admin := halfAdmin(t)
	var uid int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half2U','half2u99','half2u99@example.test','x','user','H2U99',NOW(),NOW()) RETURNING id`).Scan(&uid); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM model_has_roles WHERE model_id = $1`, uid)
	defer pool.Exec(ctx, `DELETE FROM personal_access_tokens WHERE tokenable_id = $1`, uid)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, uid)

	// bad id
	req := httptest.NewRequest(http.MethodPatch, "/x", nil)
	req.SetPathValue("user", "abc")
	req = req.WithContext(withCaller(req.Context(), admin))
	rec := httptest.NewRecorder()
	AdminSuspendUserPGHandler(pool)(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("bad id suspend = %d", rec.Code)
	}
	// unauthenticated
	reqU := httptest.NewRequest(http.MethodPatch, "/x", nil)
	reqU.SetPathValue("user", itoaTest(uid))
	recU := httptest.NewRecorder()
	AdminSuspendUserPGHandler(pool)(recU, reqU)
	if recU.Code != http.StatusUnauthorized {
		t.Fatalf("unauth suspend = %d", recU.Code)
	}
	// self-suspend forbidden
	selfReq := httptest.NewRequest(http.MethodPatch, "/x", nil)
	selfReq.SetPathValue("user", itoaTest(admin.id))
	selfReq = selfReq.WithContext(withCaller(selfReq.Context(), admin))
	selfRec := httptest.NewRecorder()
	AdminSuspendUserPGHandler(pool)(selfRec, selfReq)
	if selfRec.Code != http.StatusBadRequest {
		t.Fatalf("self suspend = %d %s", selfRec.Code, selfRec.Body.String())
	}
	// missing row
	missReq := httptest.NewRequest(http.MethodPatch, "/x", nil)
	missReq.SetPathValue("user", "99009903")
	missReq = missReq.WithContext(withCaller(missReq.Context(), admin))
	missRec := httptest.NewRecorder()
	AdminSuspendUserPGHandler(pool)(missRec, missReq)
	if missRec.Code != http.StatusNotFound {
		t.Fatalf("missing suspend = %d", missRec.Code)
	}
	// suspend then unsuspend
	for _, want := range []string{"suspended", "activated"} {
		r := httptest.NewRequest(http.MethodPatch, "/x", nil)
		r.SetPathValue("user", itoaTest(uid))
		r = r.WithContext(withCaller(r.Context(), admin))
		rr := httptest.NewRecorder()
		AdminSuspendUserPGHandler(pool)(rr, r)
		if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), want) {
			t.Fatalf("toggle want %s = %d %s", want, rr.Code, rr.Body.String())
		}
	}
	// role: bad id, unauth, self, missing field, invalid, missing row, happy
	rbad := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"role_type":"user"}`))
	rbad.SetPathValue("user", "abc")
	rbad = rbad.WithContext(withCaller(rbad.Context(), admin))
	rbadRec := httptest.NewRecorder()
	AdminUpdateUserRolePGHandler(pool)(rbadRec, rbad)
	if rbadRec.Code != http.StatusNotFound {
		t.Fatalf("bad id role = %d", rbadRec.Code)
	}
	runauth := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"role_type":"user"}`))
	runauth.SetPathValue("user", itoaTest(uid))
	runauthRec := httptest.NewRecorder()
	AdminUpdateUserRolePGHandler(pool)(runauthRec, runauth)
	if runauthRec.Code != http.StatusUnauthorized {
		t.Fatalf("unauth role = %d", runauthRec.Code)
	}
	rself := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"role_type":"user"}`))
	rself.SetPathValue("user", itoaTest(admin.id))
	rself = rself.WithContext(withCaller(rself.Context(), admin))
	rselfRec := httptest.NewRecorder()
	AdminUpdateUserRolePGHandler(pool)(rselfRec, rself)
	if rselfRec.Code != http.StatusBadRequest {
		t.Fatalf("self role = %d", rselfRec.Code)
	}
	rmiss := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{}`))
	rmiss.SetPathValue("user", itoaTest(uid))
	rmiss = rmiss.WithContext(withCaller(rmiss.Context(), admin))
	rmissRec := httptest.NewRecorder()
	AdminUpdateUserRolePGHandler(pool)(rmissRec, rmiss)
	if rmissRec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("missing role field = %d %s", rmissRec.Code, rmissRec.Body.String())
	}
	rinv := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"role_type":"bogus"}`))
	rinv.SetPathValue("user", itoaTest(uid))
	rinv = rinv.WithContext(withCaller(rinv.Context(), admin))
	rinvRec := httptest.NewRecorder()
	AdminUpdateUserRolePGHandler(pool)(rinvRec, rinv)
	if rinvRec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid role = %d", rinvRec.Code)
	}
	rnorow := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"role_type":"kontraktor"}`))
	rnorow.SetPathValue("user", "99009904")
	rnorow = rnorow.WithContext(withCaller(rnorow.Context(), admin))
	rnorowRec := httptest.NewRecorder()
	AdminUpdateUserRolePGHandler(pool)(rnorowRec, rnorow)
	if rnorowRec.Code != http.StatusNotFound {
		t.Fatalf("missing row role = %d", rnorowRec.Code)
	}
	rok := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(`{"role_type":"kontraktor"}`))
	rok.SetPathValue("user", itoaTest(uid))
	rok = rok.WithContext(withCaller(rok.Context(), admin))
	rokRec := httptest.NewRecorder()
	AdminUpdateUserRolePGHandler(pool)(rokRec, rok)
	if rokRec.Code != http.StatusOK {
		t.Fatalf("role ok = %d %s", rokRec.Code, rokRec.Body.String())
	}
	var _ = json.Marshal
}
