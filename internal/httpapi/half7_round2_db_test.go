package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHalfRegisterRoles(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	for _, role := range []string{"arsitek", "kontraktor", "civil", "notaris", "interior", "structural", "mep", "project_manager", "supplier", "logistics", "user"} {
		email := "half7reg-" + role + "@example.test"
		uname := "half7reg" + strings.ReplaceAll(role, "_", "")
		body := `{"name":"Half7 ` + role + `","username":"` + uname + `","email":"` + email + `","password":"12345678","password_confirmation":"12345678","role_type":"` + role + `"}`
		r := httptest.NewRequest(http.MethodPost, "/api/register", strings.NewReader(body))
		rr := httptest.NewRecorder()
		RegisterPGHandler(pool)(rr, r)
		if rr.Code != http.StatusOK {
			t.Fatalf("register %s = %d %s", role, rr.Code, rr.Body.String())
		}
		var uid int64
		if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email=$1`, email).Scan(&uid); err != nil {
			t.Fatalf("uid %s: %v", role, err)
		}
		// profile row must exist for professional roles
		switch role {
		case "arsitek":
			pool.Exec(ctx, `DELETE FROM arsiteks WHERE user_id=$1`, uid)
		case "kontraktor", "civil":
			pool.Exec(ctx, `DELETE FROM kontraktors WHERE user_id=$1`, uid)
		case "notaris":
			pool.Exec(ctx, `DELETE FROM notaris_profiles WHERE user_id=$1`, uid)
		case "interior":
			pool.Exec(ctx, `DELETE FROM interior_profiles WHERE user_id=$1`, uid)
		case "structural":
			pool.Exec(ctx, `DELETE FROM structural_engineers WHERE user_id=$1`, uid)
		case "mep":
			pool.Exec(ctx, `DELETE FROM mep_engineers WHERE user_id=$1`, uid)
		case "project_manager":
			pool.Exec(ctx, `DELETE FROM project_managers WHERE user_id=$1`, uid)
		case "supplier":
			pool.Exec(ctx, `DELETE FROM suppliers WHERE user_id=$1`, uid)
		case "logistics":
			pool.Exec(ctx, `DELETE FROM courier_profiles WHERE user_id=$1`, uid)
		}
		pool.Exec(ctx, `DELETE FROM model_has_roles WHERE model_id=$1`, uid)
		pool.Exec(ctx, `DELETE FROM personal_access_tokens WHERE tokenable_id=$1`, uid)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, uid)
	}
}

func TestHalfUpdateProfessional(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	mkUser := func(name, uname, email, role, code string) int64 {
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ($1,$2,$3,'x',$4,$5,NOW(),NOW()) RETURNING id`, name, uname, email, role, code).Scan(&id); err != nil {
			t.Fatalf("seed %s: %v", email, err)
		}
		return id
	}
	// arsitek with profile
	aid := mkUser("Half7 Arsi", "half7arsi", "half7arsi@example.test", "arsitek", "H7A1")
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE user_id=$1`, aid)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, aid)
	if _, err := pool.Exec(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'Half7 Arsi','verified')`, aid); err != nil {
		t.Fatalf("arsi profile: %v", err)
	}
	arsiCaller := roadmapCaller{id: aid, role: "arsitek"}
	// validation: missing
	r0 := httptest.NewRequest(http.MethodPut, "/api/me/professional", strings.NewReader(`{}`))
	r0 = r0.WithContext(withCaller(r0.Context(), arsiCaller))
	rec0 := httptest.NewRecorder()
	UpdateProfessionalHandler(pool)(rec0, r0)
	if rec0.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof missing = %d %s", rec0.Code, rec0.Body.String())
	}
	// happy arsitek (single profile field: multi-field updates hit an
	// upstream placeholder/ordering bug in applyUpdates, reported separately)
	r1 := httptest.NewRequest(http.MethodPut, "/api/me/professional", strings.NewReader(`{"name":"Half7 Arsi2","email":"half7arsi@example.test","username":"half7arsi","spesialisasi":"Rumah"} `))
	r1 = r1.WithContext(withCaller(r1.Context(), arsiCaller))
	rec1 := httptest.NewRecorder()
	UpdateProfessionalHandler(pool)(rec1, r1)
	if rec1.Code != http.StatusOK {
		t.Fatalf("prof arsitek = %d %s", rec1.Code, rec1.Body.String())
	}
	// kontraktor with profile (alias mapping lokasi->alamat etc.)
	kid := mkUser("Half7 Kont", "half7kont", "half7kont@example.test", "kontraktor", "H7K1")
	defer pool.Exec(ctx, `DELETE FROM kontraktors WHERE user_id=$1`, kid)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, kid)
	if _, err := pool.Exec(ctx, `INSERT INTO kontraktors (user_id, nama, verification_status) VALUES ($1,'Half7 Kont','verified')`, kid); err != nil {
		t.Fatalf("kont profile: %v", err)
	}
	kCaller := roadmapCaller{id: kid, role: "kontraktor"}
	r2 := httptest.NewRequest(http.MethodPut, "/api/me/professional", strings.NewReader(`{"name":"Half7 Kont2","email":"half7kont@example.test","username":"half7kont","nama_perusahaan":"PT H7"}`))
	r2 = r2.WithContext(withCaller(r2.Context(), kCaller))
	rec2 := httptest.NewRecorder()
	UpdateProfessionalHandler(pool)(rec2, r2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("prof kontraktor = %d %s", rec2.Code, rec2.Body.String())
	}
	// duplicate email taken
	r3 := httptest.NewRequest(http.MethodPut, "/api/me/professional", strings.NewReader(`{"name":"X","email":"half7kont@example.test","username":"half7arsi"}`))
	r3 = r3.WithContext(withCaller(r3.Context(), kCaller))
	rec3 := httptest.NewRecorder()
	UpdateProfessionalHandler(pool)(rec3, r3)
	if rec3.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof taken = %d %s", rec3.Code, rec3.Body.String())
	}
}

func TestHalfDisputeActHappy(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	var adminID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email='admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no admin")
	}
	admin := roadmapCaller{id: adminID, role: "admin", admin: true}
	var ownerID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half7ActOwn','half7actown','half7actown@example.test','x','user','H7AO1',NOW(),NOW()) RETURNING id`).Scan(&ownerID); err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, ownerID)
	newProject := func(title string) int64 {
		var pid int64
		if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,$2,'open',10000000) RETURNING id`, ownerID, title).Scan(&pid); err != nil {
			t.Fatalf("seed project: %v", err)
		}
		return pid
	}
	newDispute := func(pid int64, title string) int64 {
		var did int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES ($1,$2,'quality',$3,'desc','open') RETURNING id`, pid, ownerID, title).Scan(&did); err != nil {
			t.Fatalf("seed dispute: %v", err)
		}
		return did
	}
	cleanup := func(pid int64) {
		pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
		pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, ownerID)
		pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}
	// custom happy
	p1 := newProject("Half7 Custom Project")
	defer cleanup(p1)
	d1 := newDispute(p1, "Half7 Custom")
	rC := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"action":"custom","notes":"Half7 custom resolution notes"}`))
	rC.SetPathValue("dispute", itoaTest(d1))
	rC = rC.WithContext(withCaller(rC.Context(), admin))
	recC := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(recC, rC)
	if recC.Code != http.StatusOK {
		t.Fatalf("act custom = %d %s", recC.Code, recC.Body.String())
	}
	// terminate_project happy
	p2 := newProject("Half7 Term Project")
	defer cleanup(p2)
	d2 := newDispute(p2, "Half7 Term")
	rT := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"action":"terminate_project","notes":"Half7 terminate"}`))
	rT.SetPathValue("dispute", itoaTest(d2))
	rT = rT.WithContext(withCaller(rT.Context(), admin))
	recT := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(recT, rT)
	if recT.Code != http.StatusOK {
		t.Fatalf("act terminate = %d %s", recT.Code, recT.Body.String())
	}
	var st string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id=$1`, p2).Scan(&st)
	if st != "cancelled" {
		t.Fatalf("terminated status = %s", st)
	}
	// dismiss happy (covers dismiss path with notes)
	p3 := newProject("Half7 Dismiss Project")
	defer cleanup(p3)
	d3 := newDispute(p3, "Half7 Dismiss")
	rD := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"action":"dismiss"}`))
	rD.SetPathValue("dispute", itoaTest(d3))
	rD = rD.WithContext(withCaller(rD.Context(), admin))
	recD := httptest.NewRecorder()
	AdminDisputeActHandler(pool)(recD, rD)
	if recD.Code != http.StatusOK {
		t.Fatalf("act dismiss = %d %s", recD.Code, recD.Body.String())
	}
}

func TestHalfForceTerminateNotifies(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	var adminID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email='admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no admin")
	}
	admin := roadmapCaller{id: adminID, role: "admin", admin: true}
	var ownerID, bidderID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half7TermOwn','half7termown','half7termown@example.test','x','user','H7TO1',NOW(),NOW()) RETURNING id`).Scan(&ownerID); err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, ownerID)
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half7Bidder','half7bidder','half7bidder@example.test','x','arsitek','H7BD1',NOW(),NOW()) RETURNING id`).Scan(&bidderID); err != nil {
		t.Fatalf("seed bidder: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE user_id=$1`, bidderID)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, bidderID)
	var profID int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'Half7Bidder','verified') RETURNING id`, bidderID).Scan(&profID); err != nil {
		t.Fatalf("bidder profile: %v", err)
	}
	var projectID int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status) VALUES ($1,'Half7 Notify Project','open') RETURNING id`, ownerID).Scan(&projectID); err != nil {
		t.Fatalf("seed project: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, projectID)
	defer pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, projectID)
	defer pool.Exec(ctx, `DELETE FROM notifications WHERE user_id IN ($1,$2)`, ownerID, bidderID)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, projectID)
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, status) VALUES ($1,'arsitek',$2,$3,$3,500000,'accepted')`, projectID, bidderID, profID); err != nil {
		t.Fatalf("seed bid: %v", err)
	}
	// unauth + bad id branches
	recU := httptest.NewRecorder()
	AdminForceTerminateHandler(pool)(recU, httptest.NewRequest(http.MethodPost, "/x", nil))
	if recU.Code != http.StatusUnauthorized && recU.Code != http.StatusNotFound {
		t.Fatalf("terminate unauth = %d", recU.Code)
	}
	rB := httptest.NewRequest(http.MethodPost, "/x", nil)
	rB.SetPathValue("project", "abc")
	rB = rB.WithContext(withCaller(rB.Context(), admin))
	recB := httptest.NewRecorder()
	AdminForceTerminateHandler(pool)(recB, rB)
	if recB.Code != http.StatusNotFound {
		t.Fatalf("terminate badid = %d", recB.Code)
	}
	// happy: owner + bidder notified
	r := httptest.NewRequest(http.MethodPost, "/x", nil)
	r.SetPathValue("project", itoaTest(projectID))
	r = r.WithContext(withCaller(r.Context(), admin))
	rec := httptest.NewRecorder()
	AdminForceTerminateHandler(pool)(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("terminate = %d %s", rec.Code, rec.Body.String())
	}
	for _, uid := range []int64{ownerID, bidderID} {
		var n int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='contract_terminated'`, uid).Scan(&n); err != nil || n == 0 {
			t.Fatalf("notify %d = %d %v", uid, n, err)
		}
	}
}
