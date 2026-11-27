package httpapi

// hL admin list/export/action twins: filter legs, trade-role branches,
// pending queue payloads, terminate flows and status transitions.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func hLAdmin(t *testing.T) roadmapCaller {
	t.Helper()
	pool := testPool(t)
	var adminID int64
	if err := pool.QueryRow(context.Background(), `SELECT id FROM users WHERE email = 'admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no seeded admin")
	}
	pool.Close()
	return roadmapCaller{id: adminID, role: "admin", admin: true}
}

func hLAdminGet(t *testing.T, h http.HandlerFunc, target string, admin *roadmapCaller) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	if admin != nil {
		req = req.WithContext(withCaller(req.Context(), *admin))
	}
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestHLAdminLists(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	admin := hLAdmin(t)

	// Pending queue: arsitek with a doc, civil kontraktor, supplier with
	// an address, and a doc-less logistics profile.
	_ = fx.projectID
	if _, err := pool.Exec(ctx, `UPDATE arsiteks SET verification_status='pending', foto='hL-doc.jpg' WHERE id=$1`, hLArsitekProfileID); err != nil {
		t.Fatalf("pending arsitek: %v", err)
	}
	var civilID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (id, name, email, password, role_type) VALUES (1030008,'hL Civil','hl-civil@example.test','hL-secret','civil'::role_type) RETURNING id`).Scan(&civilID); err != nil {
		t.Fatalf("civil user: %v", err)
	}
	var civilProfile int64
	if err := pool.QueryRow(ctx, `INSERT INTO kontraktors (user_id, nama, verification_status, foto) VALUES ($1,'hL Civil','pending','hL-c.jpg') RETURNING id`, civilID).Scan(&civilProfile); err != nil {
		t.Fatalf("civil profile: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE suppliers SET address='hL Addr' WHERE id=$1`, hLSupplierProfileID); err != nil {
		t.Fatalf("supplier docs: %v", err)
	}
	var logiID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (id, name, email, password, role_type) VALUES (1030009,'hL Logi','hl-logi@example.test','hL-secret','logistics'::role_type) RETURNING id`).Scan(&logiID); err != nil {
		t.Fatalf("logi user: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO courier_profiles (user_id, verification_status, vehicle_type, license_plate) VALUES ($1,'pending','hL Motor','hL 1030')`, logiID); err != nil {
		t.Fatalf("courier profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM kontraktors WHERE id=$1`, civilProfile)
	defer pool.Exec(ctx, `DELETE FROM courier_profiles WHERE user_id=$1`, logiID)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id IN (1030008,1030009)`)

	rec := hLAdminGet(t, AdminProfessionalsIndexHandler(pool), "/api/admin/professionals", &admin)
	if rec.Code != http.StatusOK {
		t.Fatalf("professionals = %d %s", rec.Code, rec.Body.String())
	}
	body := hLDecode(t, rec)
	// The queue carries the seed rows too: match MY rows by content.
	hasUser := func(list []any, email string) bool {
		for _, item := range list {
			if user, _ := item.(map[string]any)["user"].(map[string]any); user["email"] == email {
				return true
			}
		}
		return false
	}
	if list, _ := body["arsiteks"].([]any); !hasUser(list, "hl-arsitek@example.test") {
		t.Fatalf("arsiteks queue missing hL: %v", list)
	}
	if list, _ := body["civil_contractors"].([]any); len(list) != 1 || !hasUser(list, "hl-civil@example.test") {
		t.Fatalf("civil queue = %v", list)
	}
	if list, _ := body["suppliers"].([]any); !hasUser(list, "hl-supplier@example.test") {
		t.Fatalf("supplier queue missing hL: %v", list)
	}
	// Logistics has no docs gate: the seed pending courier plus mine.
	if list, _ := body["logistics"].([]any); len(list) != 2 || !hasUser(list, "hl-logi@example.test") {
		t.Fatalf("logistics queue = %v", list)
	}

	// History carries the union, including the civil CASE legs (the seed
	// civil row proves the branch). Flip my civil profile to verified so
	// it enters the history, then page through for it.
	if _, err := pool.Exec(ctx, `UPDATE kontraktors SET verification_status='verified' WHERE id=$1`, civilProfile); err != nil {
		t.Fatalf("verify civil: %v", err)
	}
	rec = hLAdminGet(t, AdminProfessionalsHistoryHandler(pool), "/api/admin/professionals/history", &admin)
	if rec.Code != http.StatusOK {
		t.Fatalf("history = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Civil Contractor") {
		t.Fatalf("history missing civil label: %s", rec.Body.String()[:400])
	}
	found := strings.Contains(rec.Body.String(), "hL Civil")
	for page := 2; page <= 10 && !found; page++ {
		recN := hLAdminGet(t, AdminProfessionalsHistoryHandler(pool), "/api/admin/professionals/history?page="+itoaTest(int64(page)), &admin)
		if recN.Code != http.StatusOK {
			t.Fatalf("history p%d = %d", page, recN.Code)
		}
		found = strings.Contains(recN.Body.String(), "hL Civil")
		data := hLDecode(t, recN)["data"].([]any)
		if len(data) == 0 {
			break
		}
	}
	if !found {
		t.Fatalf("history missing hL civil in 10 pages")
	}

	// Users filters: role + status + search compose (AND), and roleless
	// rows render roles:[] (never null).
	rec = hLAdminGet(t, AdminUsersHandler(pool), "/api/admin/users?role=user&status=active&search=hl-owner", &admin)
	if rec.Code != http.StatusOK {
		t.Fatalf("users filtered = %d %s", rec.Code, rec.Body.String())
	}
	ubody := hLDecode(t, rec)
	if ubody["total"].(float64) != 1 {
		t.Fatalf("users filtered total = %v", ubody["total"])
	}
	items := ubody["data"].([]any)
	if items[0].(map[string]any)["email"] != "hl-owner@example.test" {
		t.Fatalf("users filtered item = %v", items[0])
	}
	if roles, _ := items[0].(map[string]any)["roles"].([]any); len(roles) != 0 {
		t.Fatalf("hL roles = %v, want []", roles)
	}
	rec = hLAdminGet(t, AdminUsersHandler(pool), "/api/admin/users?status=suspended&search=hl-owner", &admin)
	if rec.Code != http.StatusOK || hLDecode(t, rec)["total"].(float64) != 0 {
		t.Fatalf("users suspended = %d %s", rec.Code, rec.Body.String())
	}

	// Projects search leg with populated hires (batch paths).
	rec = hLAdminGet(t, AdminProjectsHandler(pool), "/api/admin/projects?search=hL+Tower", &admin)
	if rec.Code != http.StatusOK {
		t.Fatalf("projects search = %d %s", rec.Code, rec.Body.String())
	}
	if hLDecode(t, rec)["total"].(float64) != 1 {
		t.Fatalf("projects search total = %s", rec.Body.String()[:300])
	}
	// No-hit search takes the empty-ids path.
	rec = hLAdminGet(t, AdminProjectsHandler(pool), "/api/admin/projects?search=zzz-no-hit-zzz", &admin)
	if rec.Code != http.StatusOK || hLDecode(t, rec)["total"].(float64) != 0 {
		t.Fatalf("projects nohit = %d %s", rec.Code, rec.Body.String())
	}

	// Export streams CSV with the search applied.
	req := httptest.NewRequest(http.MethodGet, "/api/admin/projects/export?search=hL+Tower", nil)
	req = req.WithContext(withCaller(req.Context(), admin))
	rec = httptest.NewRecorder()
	AdminProjectsExportHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("export = %d %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "text/csv") {
		t.Fatalf("export ct = %q", ct)
	}
	if !strings.Contains(rec.Body.String(), "hL Tower") {
		t.Fatalf("export missing project")
	}

	// Pure time twins.
	if projectTimePtrValue(nil) != nil || iso8601Second(nil) != nil {
		t.Fatalf("nil time twins")
	}
	if got := ucfirstASCII(""); got != "" {
		t.Fatalf("ucfirst empty = %q", got)
	}
	if got := ucfirstASCII("arsitek"); got != "Arsitek" {
		t.Fatalf("ucfirst = %q", got)
	}
}

func TestHLAdminTerminate(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	admin := hLAdmin(t)
	call := func(projectID, body string, caller *roadmapCaller) *httptest.ResponseRecorder {
		return hLCall(t, AdminForceTerminateHandler(pool), http.MethodPost, "/x", body, caller,
			map[string]string{"project": projectID})
	}

	// Anonymous 401, missing project 404 pins.
	if rec := call("1032002", "", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("terminate anon = %d", rec.Code)
	}
	if rec := call("19999981", "", &admin); rec.Code != http.StatusNotFound {
		t.Fatalf("terminate missing = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(call("abc", "", &admin).Body.String(), "No query results for model") {
		t.Fatalf("terminate bad id body")
	}

	// Already terminal: 422 with the exact sentence (literal cancelled).
	if _, err := pool.Exec(ctx, `UPDATE projects SET status='cancelled' WHERE id=$1`, fx.project2ID); err != nil {
		t.Fatalf("cancel project2: %v", err)
	}
	rec := call("1032002", "", &admin)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("terminate terminal = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Project is already cancelled.") {
		t.Fatalf("terminate terminal body = %s", rec.Body.String())
	}

	// Bidder on an active contract hears about the termination.
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, status)
		VALUES ($1,'kontraktor',$2,$3,$3,'accepted')`, fx.projectID, fx.stranger.id, hLKontraktorProfileID); err != nil {
		t.Fatalf("seed bid: %v", err)
	}
	pool.Exec(ctx, `UPDATE projects SET status='in_progress' WHERE id=$1`, fx.projectID)
	rec = call("1032001", "", &admin)
	if rec.Code != http.StatusOK {
		t.Fatalf("terminate = %d %s", rec.Code, rec.Body.String())
	}
	var status string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM projects WHERE id=$1`, fx.projectID).Scan(&status)
	if status != "cancelled" {
		t.Fatalf("terminate status = %q", status)
	}
	var logCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_activity_logs WHERE project_id=$1 AND action='admin_force_terminate'`, fx.projectID).Scan(&logCount)
	if logCount != 1 {
		t.Fatalf("terminate log = %d", logCount)
	}
	// Owner (not the admin caller) is notified; the bidder too.
	for _, uid := range []int64{fx.owner.id, fx.stranger.id} {
		var n int
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='contract_terminated'`, uid).Scan(&n)
		if n != 1 {
			t.Fatalf("terminate notify %d = %d", uid, n)
		}
	}
	if !strings.Contains(rec.Body.String(), "Project forced terminated by Administrator.") {
		t.Fatalf("terminate body = %s", rec.Body.String()[:200])
	}
}

func TestHLAdminSuspendHouse(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	admin := hLAdmin(t)

	var hid int64
	if err := pool.QueryRow(ctx, `INSERT INTO house (name, id_user, is_suspended) VALUES ('hL House',$1,false) RETURNING id`, fx.owner.id).Scan(&hid); err != nil {
		t.Fatalf("seed house: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM house WHERE id=$1`, hid)
	path := map[string]string{"id": int64String(hid)}

	rec := hLCall(t, AdminSuspendHouseHandler(pool), http.MethodPatch, "/x", "", &admin, path)
	if rec.Code != http.StatusOK {
		t.Fatalf("suspend = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Listing suspended successfully.") {
		t.Fatalf("suspend body = %s", rec.Body.String())
	}
	var suspended bool
	_ = pool.QueryRow(ctx, `SELECT is_suspended FROM house WHERE id=$1`, hid).Scan(&suspended)
	if !suspended {
		t.Fatalf("house not suspended")
	}
	// Suspended rows list with is_suspended:1 (the bool leg).
	if rec := hLAdminGet(t, AdminHousesHandler(pool), "/api/admin/houses?search=hL+House", &admin); rec.Code != http.StatusOK {
		t.Fatalf("houses = %d", rec.Code)
	} else if !strings.Contains(rec.Body.String(), `"is_suspended":1`) {
		t.Fatalf("houses suspended flag: %s", rec.Body.String()[:500])
	}
	// Toggle back off (the activate message leg).
	rec = hLCall(t, AdminSuspendHouseHandler(pool), http.MethodPatch, "/x", "", &admin, path)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Listing activated successfully.") {
		t.Fatalf("activate = %d %s", rec.Code, rec.Body.String())
	}
	// Bad id 404 pin.
	if rec := hLCall(t, AdminSuspendHouseHandler(pool), http.MethodPatch, "/x", "", &admin, map[string]string{"id": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("house bad id = %d", rec.Code)
	}
}

func TestHLAdminProfessionalStatus(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	admin := hLAdmin(t)
	call := func(typ, id, body string) *httptest.ResponseRecorder {
		return hLCall(t, AdminUpdateProfessionalStatusHandler(pool), http.MethodPatch, "/x", body, &admin,
			map[string]string{"type": typ, "id": id})
	}

	// Unknown type 400, bad id 404 pins.
	if rec := call("wizard", "1", `{"status":"verified"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("status type = %d", rec.Code)
	} else if !strings.Contains(rec.Body.String(), "Invalid professional type") {
		t.Fatalf("status type body = %s", rec.Body.String())
	}
	if rec := call("arsitek", "abc", `{"status":"verified"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("status bad id = %d", rec.Code)
	}
	// Reason must be a string; rejected without reason takes the default note.
	if rec := call("arsitek", int64String(hLArsitekProfileID), `{"status":"verified","reason":7}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status reason type = %d %s", rec.Code, rec.Body.String())
	} else if !strings.Contains(rec.Body.String(), "The reason field must be a string.") {
		t.Fatalf("status reason body = %s", rec.Body.String())
	}
	// Missing profile 404.
	if rec := call("arsitek", "19999982", `{"status":"verified"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("status missing = %d", rec.Code)
	}

	// Verify the pending arsitek (approved notification, reason null).
	if _, err := pool.Exec(ctx, `UPDATE arsiteks SET verification_status='pending' WHERE id=$1`, hLArsitekProfileID); err != nil {
		t.Fatalf("pending: %v", err)
	}
	rec := call("arsitek", int64String(hLArsitekProfileID), `{"status":"verified"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("verify = %d %s", rec.Code, rec.Body.String())
	}
	var status string
	_ = pool.QueryRow(ctx, `SELECT verification_status::text FROM arsiteks WHERE id=$1`, hLArsitekProfileID).Scan(&status)
	if status != "verified" {
		t.Fatalf("verify status = %q", status)
	}

	// Reject a pending kontraktor with a reason (rejected branches with
	// an explicit note, reason echoed in the data payload).
	var rejProfile int64
	if err := pool.QueryRow(ctx, `INSERT INTO kontraktors (user_id, nama, verification_status) VALUES ($1,'hL Reject','pending') RETURNING id`, fx.stranger.id).Scan(&rejProfile); err != nil {
		t.Fatalf("seed reject profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM kontraktors WHERE id=$1`, rejProfile)
	rec = call("civil", int64String(rejProfile), `{"status":"rejected","reason":"hL incomplete docs"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("reject = %d %s", rec.Code, rec.Body.String())
	}
	var rejStatus, rejReason string
	_ = pool.QueryRow(ctx, `SELECT verification_status::text, COALESCE(rejection_reason,'') FROM kontraktors WHERE id=$1`, rejProfile).Scan(&rejStatus, &rejReason)
	if rejStatus != "rejected" || rejReason != "hL incomplete docs" {
		t.Fatalf("reject row = %q %q", rejStatus, rejReason)
	}
	var nBody string
	_ = pool.QueryRow(ctx, `SELECT body FROM notifications WHERE user_id=$1 AND type='verification' ORDER BY id DESC LIMIT 1`, fx.stranger.id).Scan(&nBody)
	if !strings.Contains(nBody, "hL incomplete docs") {
		t.Fatalf("reject notify = %q", nBody)
	}
}
