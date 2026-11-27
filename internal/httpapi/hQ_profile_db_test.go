package httpapi

// hQ firm profile + update-profile + quick-assign leftovers: binding twins,
// validation messages, vault uploads, bank/phone writes and the mep
// assignment branches.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hQCallProfile(pool *pgxpool.Pool, ownerID string, usePathValue bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	if usePathValue {
		r.SetPathValue("ownerId", ownerID)
	} else {
		r = httptest.NewRequest(http.MethodGet, "/api/firms/"+ownerID, nil)
	}
	rec := httptest.NewRecorder()
	FirmMembersProfileHandler(pool)(rec, r)
	return rec
}

func TestHQFirmProfile(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	kontra := hQMkUser(t, ctx, pool, "profkontra", "kontraktor")
	defer hQCleanupUser(ctx, pool, kontra)
	plain := hQMkUser(t, ctx, pool, "profplain", "user")
	defer hQCleanupUser(ctx, pool, plain)
	arsi := hQMkUser(t, ctx, pool, "profarsi", "arsitek")
	defer hQCleanupUser(ctx, pool, arsi)
	var arsiProf int64
	_ = pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status, deskripsi) VALUES ($1,'hQ Arsi','verified','hQ studio desc') RETURNING id`, arsi).Scan(&arsiProf)
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, arsiProf)
	var notaProf int64
	_ = pool.QueryRow(ctx, `INSERT INTO notaris_profiles (user_id, nama, verification_status) VALUES ($1,'hQ Not','verified') RETURNING id`, kontra).Scan(&notaProf)
	defer pool.Exec(ctx, `DELETE FROM notaris_services WHERE notaris_id=$1`, notaProf)
	defer pool.Exec(ctx, `DELETE FROM notaris_profiles WHERE id=$1`, notaProf)
	var svcID int64
	_ = pool.QueryRow(ctx, `INSERT INTO notaris_services (notaris_id, title, price) VALUES ($1,'hQ Akta',100000) RETURNING id`, notaProf).Scan(&svcID)
	pool.Exec(ctx, `UPDATE users SET firm_name='hQ Kontraktor', firm_description='hQ builds', firm_is_hiring=true, firm_needed_roles='["civil"]' WHERE id=$1`, kontra)

	// Bad id + non-firm user + missing — exact 404 literal
	if rec := hQCallProfile(pool, "hQ-bad", true); rec.Code != http.StatusNotFound {
		t.Fatalf("profile bad = %d", rec.Code)
	} else if got := hQDecode(t, rec)["message"].(string); got != "Firm not found." {
		t.Fatalf("profile bad msg = %q", got)
	}
	if rec := hQCallProfile(pool, itoaTest(plain), true); rec.Code != http.StatusNotFound {
		t.Fatalf("profile plain = %d", rec.Code)
	}
	if rec := hQCallProfile(pool, "99009999", true); rec.Code != http.StatusNotFound {
		t.Fatalf("profile missing = %d", rec.Code)
	}
	// URL fallback (no PathValue) — same 404
	if rec := hQCallProfile(pool, "hQ-bad", false); rec.Code != http.StatusNotFound {
		t.Fatalf("profile fallback = %d", rec.Code)
	}
	// Kontraktor happy: firm_name wins display, services render with null nama
	rec := hQCallProfile(pool, itoaTest(kontra), true)
	if rec.Code != http.StatusOK {
		t.Fatalf("profile kontra = %d %s", rec.Code, rec.Body.String())
	}
	kbody := hQDecode(t, rec)
	if kbody["firm_name"].(string) != "hQ Kontraktor" {
		t.Fatalf("profile kontra name = %v", kbody["firm_name"])
	}
	if kbody["firm_is_hiring"].(bool) != true {
		t.Fatalf("profile kontra hiring = %v", kbody["firm_is_hiring"])
	}
	if roles, ok := kbody["firm_needed_roles"].([]any); !ok || len(roles) != 1 || roles[0].(string) != "civil" {
		t.Fatalf("profile kontra roles = %v", kbody["firm_needed_roles"])
	}
	stats := kbody["stats"].(map[string]any)
	if stats["active_members_count"].(float64) != 0 {
		t.Fatalf("profile kontra members = %v", stats)
	}
	// Arsitek happy: profile deskripsi fallback, portfolio list, roster list
	rec = hQCallProfile(pool, itoaTest(arsi), true)
	if rec.Code != http.StatusOK {
		t.Fatalf("profile arsi = %d %s", rec.Code, rec.Body.String())
	}
	abody := hQDecode(t, rec)
	if abody["firm_description"].(string) != "hQ studio desc" {
		t.Fatalf("profile arsi desc = %v", abody["firm_description"])
	}
	if abody["firm_name"].(string) != "hH profarsi" {
		t.Fatalf("profile arsi name = %v", abody["firm_name"])
	}
}

func TestHQFirmUpdateProfile(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())
	owner := hQMkUser(t, ctx, pool, "updarsi", "arsitek")
	defer hQCleanupUser(ctx, pool, owner)
	plain := hQMkUser(t, ctx, pool, "updplain", "user")
	defer hQCleanupUser(ctx, pool, plain)
	ownerCaller := &roadmapCaller{id: owner, role: "arsitek"}
	plainCaller := &roadmapCaller{id: plain, role: "user"}
	var prof int64
	_ = pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hQ Upd','verified') RETURNING id`, owner).Scan(&prof)
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, prof)

	call := func(caller *roadmapCaller, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPut, "/x", strings.NewReader(body))
		if caller != nil {
			r = r.WithContext(withCaller(r.Context(), *caller))
		}
		rec := httptest.NewRecorder()
		FirmMembersUpdateProfileHandler(pool)(rec, r)
		return rec
	}
	if rec := call(nil, `{}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("update unauth = %d", rec.Code)
	}
	if rec := call(plainCaller, `{"firm_name":"hQ"}`); rec.Code != http.StatusForbidden {
		t.Fatalf("update forbidden = %d %s", rec.Code, rec.Body.String())
	} else if got := hQDecode(t, rec)["message"].(string); got != "Unauthorized." {
		t.Fatalf("update forbidden msg = %q", got)
	}
	rec := call(ownerCaller, `{"firm_name":7}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update name type = %d", rec.Code)
	}
	hCErrors(t, rec, "firm_name", "The firm name field must be a string.")
	rec = call(ownerCaller, `{"firm_name":"`+strings.Repeat("n", 101)+`"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update name long = %d", rec.Code)
	}
	hCErrors(t, rec, "firm_name", "The firm name field must not be greater than 100 characters.")
	rec = call(ownerCaller, `{"base_rate":"abc"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update rate nan = %d", rec.Code)
	}
	hCErrors(t, rec, "base_rate", "The base rate field must be a number.")
	rec = call(ownerCaller, `{"base_rate":-2}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update rate neg = %d", rec.Code)
	}
	hCErrors(t, rec, "base_rate", "The base rate field must be at least 0.")
	rec = call(ownerCaller, `{"experience_years":"x"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update exp type = %d", rec.Code)
	}
	hCErrors(t, rec, "experience_years", "The experience years field must be an integer.")
	rec = call(ownerCaller, `{"experience_years":-1}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update exp neg = %d", rec.Code)
	}
	hCErrors(t, rec, "experience_years", "The experience years field must be at least 0.")

	// Banner/logo validation: 2 files + wrong mime + oversize
	pngHead := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, bytes.Repeat([]byte{0}, 64)...)
	mkFiles := func(field, name string, data []byte, n int) (string, *bytes.Buffer) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		for i := 0; i < n; i++ {
			fw, _ := mw.CreateFormFile(field, name)
			_, _ = fw.Write(data)
		}
		_ = mw.Close()
		return mw.FormDataContentType(), &buf
	}
	callFiles := func(ctype string, buf *bytes.Buffer) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPut, "/x", buf)
		r.Header.Set("Content-Type", ctype)
		r = r.WithContext(withCaller(r.Context(), *ownerCaller))
		rec := httptest.NewRecorder()
		FirmMembersUpdateProfileHandler(pool)(rec, r)
		return rec
	}
	ct, buf := mkFiles("firm_banner", "hQ1.png", pngHead, 2)
	if rec := callFiles(ct, buf); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("banner 2 = %d %s", rec.Code, rec.Body.String())
	} else {
		hCErrors(t, rec, "firm_banner", "The firm banner field must be a file of type: jpeg, png, jpg, webp.")
	}
	ct, buf = mkFiles("firm_logo", "hQ.txt", []byte("text"), 1)
	if rec := callFiles(ct, buf); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("logo mime = %d %s", rec.Code, rec.Body.String())
	} else {
		hCErrors(t, rec, "firm_logo", "The firm logo field must be an image.")
	}
	big := append(pngHead, bytes.Repeat([]byte{9}, 6<<20)...)
	ct, buf = mkFiles("firm_banner", "hQ-big.png", big, 1)
	if rec := callFiles(ct, buf); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("banner big = %d %s", rec.Code, rec.Body.String())
	} else {
		hCErrors(t, rec, "firm_banner", "The firm banner field must not be greater than 2048 kilobytes.")
	}
	ct, buf = mkFiles("firm_logo", "hQ-big.png", append(pngHead, bytes.Repeat([]byte{9}, 3<<20)...), 1)
	if rec := callFiles(ct, buf); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("logo big = %d %s", rec.Code, rec.Body.String())
	} else {
		hCErrors(t, rec, "firm_logo", "The firm logo field must not be greater than 2048 kilobytes.")
	}

	// Full happy: identity + counters + hiring + roles + phones
	rec = call(ownerCaller, `{"firm_name":"hQ Studio","firm_slogan":"hQ builds","firm_description":"hQ desc","firm_is_hiring":"yes","firm_needed_roles":["mep"],"base_rate":"175000","experience_years":6}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("update happy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Firm squad profile updated successfully." {
		t.Fatalf("update msg = %q", got)
	}
	var fn, slogan, desc string
	var hiring bool
	var roles string
	_ = pool.QueryRow(ctx, `SELECT firm_name, firm_slogan, firm_description, firm_is_hiring, firm_needed_roles::text FROM users WHERE id=$1`, owner).Scan(&fn, &slogan, &desc, &hiring, &roles)
	if fn != "hQ Studio" || slogan != "hQ builds" || desc != "hQ desc" || !hiring || roles != `["mep"]` {
		t.Fatalf("update users = %q %q %q %v %q", fn, slogan, desc, hiring, roles)
	}
	var rate, exp string
	var company string
	_ = pool.QueryRow(ctx, `SELECT rate_harga::text, pengalaman_tahun::text, company_name FROM arsiteks WHERE id=$1`, prof).Scan(&rate, &exp, &company)
	if rate != "175000.00" || exp != "6" || company != "hQ Studio" {
		t.Fatalf("update profile = %q %q %q", rate, exp, company)
	}

	// Vault happy: banner + logo persist under the public root
	var buf2 bytes.Buffer
	mw := multipart.NewWriter(&buf2)
	_ = mw.WriteField("firm_name", "hQ Studio")
	fw, _ := mw.CreateFormFile("firm_banner", "hQ-banner.png")
	_, _ = fw.Write(pngHead)
	fl, _ := mw.CreateFormFile("firm_logo", "hQ-logo.png")
	_, _ = fl.Write(pngHead)
	_ = mw.Close()
	r := httptest.NewRequest(http.MethodPut, "/x", &buf2)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	r = r.WithContext(withCaller(r.Context(), *ownerCaller))
	rec2 := httptest.NewRecorder()
	FirmMembersUpdateProfileHandler(pool)(rec2, r)
	if rec2.Code != http.StatusOK {
		t.Fatalf("update vault = %d %s", rec2.Code, rec2.Body.String())
	}
	var banner, pic string
	_ = pool.QueryRow(ctx, `SELECT firm_banner_path, pic FROM users WHERE id=$1`, owner).Scan(&banner, &pic)
	if !strings.HasPrefix(banner, "firm_banners/") || !strings.HasPrefix(pic, "avatars/") {
		t.Fatalf("update vault rows = %q %q", banner, pic)
	}
}

func TestHQQuickAssignExtra(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	lead := hQMkUser(t, ctx, pool, "qalead", "arsitek")
	defer hQCleanupUser(ctx, pool, lead)
	member := hQMkUser(t, ctx, pool, "qamem", "user")
	defer hQCleanupUser(ctx, pool, member)
	var prof int64
	_ = pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hQ Lead','verified') RETURNING id`, lead).Scan(&prof)
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, prof)
	pid := hQMkProject(t, ctx, pool, lead, "hQ QA Project")
	defer hQCleanupDisputeProject(ctx, pool, pid, lead)
	pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$2 WHERE id=$1`, pid, prof)
	pool.Exec(ctx, `INSERT INTO firm_members (firm_owner_id, member_user_id, role_in_firm, status) VALUES ($1,$2,'mep','active')`, lead, member)
	defer pool.Exec(ctx, `DELETE FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2`, lead, member)
	leadCaller := &roadmapCaller{id: lead, role: "arsitek"}

	call := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
		r = r.WithContext(withCaller(r.Context(), *leadCaller))
		rec := httptest.NewRecorder()
		FirmMembersQuickAssignHandler(pool)(rec, r)
		return rec
	}
	// Malformed JSON: fields fall back to empty, required twins fire
	r := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{oops`))
	r = r.WithContext(withCaller(r.Context(), *leadCaller))
	rec := httptest.NewRecorder()
	FirmMembersQuickAssignHandler(pool)(rec, r)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick malformed = %d", rec.Code)
	}
	hCErrors(t, rec, "member_user_id", "The member user id field is required.")
	// Deleted project id: validation 422, never 500
	var ghostPid int64
	_ = pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,'hQ Ghost','open',10000000) RETURNING id`, lead).Scan(&ghostPid)
	pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, ghostPid)
	rec = call(`{"member_user_id":` + itoaTest(member) + `,"project_id":` + itoaTest(ghostPid) + `,"sub_role":"mep","rate":100}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick ghost project = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "project_id", "The selected project id is invalid.")
	// Description too long — exact message
	rec = call(`{"member_user_id":` + itoaTest(member) + `,"project_id":` + itoaTest(pid) + `,"sub_role":"mep","rate":100,"description":"` + strings.Repeat("d", 501) + `"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick desc long = %d", rec.Code)
	}
	hCErrors(t, rec, "description", "The description field must not be greater than 500 characters.")
	// MEP happy with string rate and default description
	rec = call(`{"member_user_id":` + itoaTest(member) + `,"project_id":` + itoaTest(pid) + `,"sub_role":"mep","rate":"150000"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("quick mep = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "Specialist assignment proposal submitted to project owner." {
		t.Fatalf("quick mep msg = %q", got)
	}
	var aType, aSType, aDesc, aAmt string
	_ = pool.QueryRow(ctx, `SELECT type, specialist_type, description, amount::text FROM project_addendums WHERE project_id=$1 AND assigned_user_id=$2`, pid, member).Scan(&aType, &aSType, &aDesc, &aAmt)
	if aType != "specialist_assignment" || aSType != "mep" || aDesc != "Assigned directly from firm roster." || aAmt != "150000.00" {
		t.Fatalf("quick mep row = %q %q %q %q", aType, aSType, aDesc, aAmt)
	}
	// Duplicate mep proposal — exact 409
	rec = call(`{"member_user_id":` + itoaTest(member) + `,"project_id":` + itoaTest(pid) + `,"sub_role":"mep","rate":100}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("quick mep dup = %d", rec.Code)
	}
	// MEP slot taken — exact 409
	var mepProf int64
	mepUser := hQMkUser(t, ctx, pool, "qamep", "mep")
	defer hQCleanupUser(ctx, pool, mepUser)
	_ = pool.QueryRow(ctx, `INSERT INTO mep_engineers (user_id, nama, verification_status) VALUES ($1,'hQ Mep','verified') RETURNING id`, mepUser).Scan(&mepProf)
	defer pool.Exec(ctx, `DELETE FROM mep_engineers WHERE id=$1`, mepProf)
	pool.Exec(ctx, `UPDATE projects SET mep_id=$2 WHERE id=$1`, pid, mepProf)
	member2 := hQMkUser(t, ctx, pool, "qamem2", "user")
	defer hQCleanupUser(ctx, pool, member2)
	pool.Exec(ctx, `INSERT INTO firm_members (firm_owner_id, member_user_id, role_in_firm, status) VALUES ($1,$2,'mep','active')`, lead, member2)
	defer pool.Exec(ctx, `DELETE FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2`, lead, member2)
	rec = call(`{"member_user_id":` + itoaTest(member2) + `,"project_id":` + itoaTest(pid) + `,"sub_role":"mep","rate":100}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("quick mep taken = %d %s", rec.Code, rec.Body.String())
	}
	if got := hQDecode(t, rec)["message"].(string); got != "MEP Engineer is already assigned to this project." {
		t.Fatalf("quick mep taken msg = %q", got)
	}
	pool.Exec(ctx, `UPDATE projects SET mep_id=NULL WHERE id=$1`, pid)
}
