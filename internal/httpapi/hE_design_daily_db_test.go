package httpapi

// hE design review (a whole file at ~25%) and daily-log gaps: PBG lock,
// sub-professional writes, photo uploads, binding-first destroy.

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

type hEFile struct {
	name string
	data []byte
}

func hEMultipartFile(t *testing.T, fields map[string]string, fileKey, fileName string, data []byte) (*strings.Reader, string) {
	t.Helper()
	return hEMultipartFiles(t, fields, fileKey, []hEFile{{name: fileName, data: data}})
}

func hEMultipartFiles(t *testing.T, fields map[string]string, fileKey string, files []hEFile) (*strings.Reader, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for k, v := range fields {
		if err := writer.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	for _, f := range files {
		part, err := writer.CreateFormFile(fileKey, f.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(f.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	b := body.String()
	return strings.NewReader(b), writer.FormDataContentType()
}

func TestHEDesignReview(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// --- unauth / bad-id / missing pins on all three verbs ---
	for _, tc := range []struct {
		name string
		h    func(*pgxpool.Pool) http.HandlerFunc
		body string
	}{
		{"submit", SubmitDesignHandler, `{"role_type":"structural"}`},
		{"approve", ApproveDesignHandler, `{"role_type":"structural"}`},
		{"revise", ReviseDesignHandler, `{"role_type":"structural","note":"hE"}`},
	} {
		pool2 := pool
		rec := hECall(t, tc.h(pool2), http.MethodPost, "/x", tc.body, nil, p)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s unauth = %d, want 401", tc.name, rec.Code)
		}
		rec = hECall(t, tc.h(pool2), http.MethodPost, "/x/abc", tc.body, &fx.owner, map[string]string{"project": "abc"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s bad-id = %d, want 404 %s", tc.name, rec.Code, rec.Body.String())
		}
		rec = hECall(t, tc.h(pool2), http.MethodPost, "/x/999999999", tc.body, &fx.owner, map[string]string{"project": "999999999"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s missing = %d, want 404 %s", tc.name, rec.Code, rec.Body.String())
		}
	}

	// --- validation twins with exact messages ---
	rec := hECall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The role type field is required.") {
		t.Fatalf("submit empty = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{"role_type":""}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The role type field is required.") {
		t.Fatalf("submit blank role = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{"role_type":5}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected role type is invalid.") {
		t.Fatalf("submit numeric role = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ReviseDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"structural"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The note field is required.") {
		t.Fatalf("revise no note = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ReviseDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"civil","note":"hE"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected role type is invalid.") {
		t.Fatalf("revise bad role = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ReviseDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"mep","note":5}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The note field must be a string.") {
		t.Fatalf("revise numeric note = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ReviseDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"mep","note":"`+strings.Repeat("n", 1001)+`"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The note field must not be greater than 1000 characters.") {
		t.Fatalf("revise long note = %d %s", rec.Code, rec.Body.String())
	}

	// --- forbidden: a stranger is refused on every verb (no-period 403) ---
	for _, tc := range []struct {
		name string
		h    func(*pgxpool.Pool) http.HandlerFunc
		body string
	}{
		{"submit", SubmitDesignHandler, `{"role_type":"structural"}`},
		{"approve", ApproveDesignHandler, `{"role_type":"structural"}`},
		{"revise", ReviseDesignHandler, `{"role_type":"structural","note":"hE"}`},
	} {
		rec = hECall(t, tc.h(pool), http.MethodPost, "/x", tc.body, &fx.stranger, p)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("%s stranger = %d, want 403", tc.name, rec.Code)
		}
		if got := hEDecode(t, rec)["message"]; got != "Unauthorized" {
			t.Fatalf("%s stranger message = %q, want Unauthorized", tc.name, got)
		}
	}
	// The hired kontraktor is not the structural specialist either.
	rec = hECall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"structural"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("submit kontraktor = %d, want 403", rec.Code)
	}
	rec = hECall(t, ApproveDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"mep"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("approve kontraktor = %d, want 403", rec.Code)
	}

	// --- specialist submit: structural docs + milestone flip, all told ---
	if _, err := pool.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, category, status)
		VALUES ($1, $2, 'hE calc.pdf', 'vault/hE-calc.pdf', 'structural_calc', 'uploaded')`, hEProjectID, hEStructID); err != nil {
		t.Fatalf("doc: %v", err)
	}
	var msID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, phase_context, review_status, review_note)
		VALUES ($1, 'hE struct log', 'structural', 'approved', 'hE stale') RETURNING id`, hEProjectID).Scan(&msID); err != nil {
		t.Fatalf("milestone: %v", err)
	}
	rec = hECall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"structural"}`, &fx.structural, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("submit structural = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Submitted successfully" {
		t.Fatalf("submit message = %q", got)
	}
	var docStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_documents WHERE project_id = $1 AND category = 'structural_calc'`, hEProjectID).Scan(&docStatus)
	if docStatus != "under_review" {
		t.Fatalf("doc = %q, want under_review", docStatus)
	}
	var revStatus string
	var revNote *string
	_ = pool.QueryRow(ctx, `SELECT review_status::text, review_note FROM project_milestones WHERE id = $1`, msID).Scan(&revStatus, &revNote)
	if revStatus != "pending" || revNote != nil {
		t.Fatalf("milestone = %q/%v, want pending/NULL", revStatus, revNote)
	}
	var submitted int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE type = 'design_submitted' AND user_id IN ($1, $2)`, hEOwnerID, hEPMUserID).Scan(&submitted)
	if submitted != 2 {
		t.Fatalf("submit notifs = %d, want 2 (owner + pm)", submitted)
	}

	// --- hired architect may also submit (architect branch); mep role ---
	if _, err := pool.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, category, status)
		VALUES ($1, $2, 'hE mep.pdf', 'vault/hE-mep.pdf', 'mep_layout', 'revision_requested')`, hEProjectID, hEMepID); err != nil {
		t.Fatalf("mep doc: %v", err)
	}
	rec = hECall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"mep"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("submit mep by architect = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_documents WHERE project_id = $1 AND category = 'mep_layout'`, hEProjectID).Scan(&docStatus)
	if docStatus != "under_review" {
		t.Fatalf("mep doc = %q, want under_review", docStatus)
	}

	// --- owner submits the interior phase ---
	rec = hECall(t, SubmitDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"interior"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("submit interior by owner = %d %s", rec.Code, rec.Body.String())
	}

	// --- approve merges milestone files into the vault ---
	var mirrorID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, phase_context, type, approval_status, is_completed, image, content)
		VALUES ($1, 'hE struct pour', 'structural', 'calcsheet', 'pending', false, 'vault/hE-pour.jpg',
		'{"gallery":["vault/hE-m1.pdf","vault/hE-m2.pdf"],"file_names":{"vault/hE-m1.pdf":"hE custom"}}'::jsonb) RETURNING id`, hEProjectID).Scan(&mirrorID); err != nil {
		t.Fatalf("mirror milestone: %v", err)
	}
	// vault/hE-m1.pdf exists already: the UPDATE branch. vault/hE-m2.pdf is new.
	if _, err := pool.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, category, status)
		VALUES ($1, $2, 'hE stale.pdf', 'vault/hE-m1.pdf', 'structural_calc', 'uploaded')`, hEProjectID, hEStructID); err != nil {
		t.Fatalf("pre doc: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, milestone_id)
		VALUES ($1, 'hE struct stage', 0, 100000, 0, 100000, 'locked', 'structural', $2)`, hEProjectID, mirrorID); err != nil {
		t.Fatalf("termin: %v", err)
	}
	rec = hECall(t, ApproveDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"structural"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve structural = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Approved successfully" {
		t.Fatalf("approve message = %q", got)
	}
	var stamped *string
	_ = pool.QueryRow(ctx, `SELECT structural_approved_at::text FROM projects WHERE id = $1`, hEProjectID).Scan(&stamped)
	if stamped == nil {
		t.Fatalf("structural_approved_at missing")
	}
	var msApproval string
	var completed bool
	_ = pool.QueryRow(ctx, `SELECT approval_status::text, is_completed FROM project_milestones WHERE id = $1`, mirrorID).Scan(&msApproval, &completed)
	if msApproval != "approved" || !completed {
		t.Fatalf("mirror milestone = %q/%v, want approved/true", msApproval, completed)
	}
	var terminStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE milestone_id = $1`, mirrorID).Scan(&terminStatus)
	if terminStatus != "pending" {
		t.Fatalf("termin = %q, want pending", terminStatus)
	}
	var customName, customStatus string
	_ = pool.QueryRow(ctx, `SELECT file_name, status::text FROM project_documents WHERE project_id = $1 AND file_path = 'vault/hE-m1.pdf'`, hEProjectID).Scan(&customName, &customStatus)
	if customName != "hE custom" || customStatus != "verified" {
		t.Fatalf("mirrored doc = %q/%q, want hE custom/verified", customName, customStatus)
	}
	var freshName string
	_ = pool.QueryRow(ctx, `SELECT file_name FROM project_documents WHERE project_id = $1 AND file_path = 'vault/hE-m2.pdf'`, hEProjectID).Scan(&freshName)
	if freshName != "hE struct pour - hE-m2.pdf" {
		t.Fatalf("fresh mirror = %q", freshName)
	}
	var specNotifs int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE type = 'design_approved' AND user_id = $1`, hEStructID).Scan(&specNotifs)
	if specNotifs != 1 {
		t.Fatalf("approve notifs = %d, want 1", specNotifs)
	}

	// --- second approve is a no-op success (empty milestone list) ---
	rec = hECall(t, ApproveDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"structural"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("approve again = %d %s", rec.Code, rec.Body.String())
	}

	// --- revise marks revision_requested with the note, clears the stamp ---
	rec = hECall(t, ReviseDesignHandler(pool), http.MethodPost, "/x", `{"role_type":"structural","note":"hE recheck loads"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("revise = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Revision requested successfully" {
		t.Fatalf("revise message = %q", got)
	}
	_ = pool.QueryRow(ctx, `SELECT status::text, review_note FROM project_documents WHERE project_id = $1 AND category = 'structural_calc' AND file_path = 'vault/hE-calc.pdf'`, hEProjectID).Scan(&docStatus, &revNote)
	if docStatus != "revision_requested" || revNote == nil || *revNote != "hE recheck loads" {
		t.Fatalf("revised doc = %q/%v", docStatus, revNote)
	}
	_ = pool.QueryRow(ctx, `SELECT structural_approved_at::text FROM projects WHERE id = $1`, hEProjectID).Scan(&stamped)
	if stamped != nil {
		t.Fatalf("revise must clear structural_approved_at, got %v", *stamped)
	}
	var reviseNotifs int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE type = 'design_revision_requested' AND user_id = $1`, hEStructID).Scan(&reviseNotifs)
	if reviseNotifs != 1 {
		t.Fatalf("revise notifs = %d, want 1", reviseNotifs)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHEDailyLogs(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	t.Setenv("EVIDENCE_DIR", t.TempDir())
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())

	// P1 is new_build without PBG: the physical-work lock fires first.
	if _, err := pool.Exec(ctx, `UPDATE projects SET project_category = 'new_build' WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("category: %v", err)
	}
	rec := hECall(t, StoreDailyLogHandler(pool), http.MethodPost, "/x",
		`{"log_date":"2026-04-01","weather":"sunny","worker_count":6,"activities":"hE dig"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("daily locked = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Physical site work is locked. PBG permit is missing or unverified." {
		t.Fatalf("daily lock message = %q", got)
	}
	// A stranger is refused even before the PBG question matters.
	rec = hECall(t, StoreDailyLogHandler(pool), http.MethodPost, "/x",
		`{"log_date":"2026-04-01","weather":"sunny","worker_count":6,"activities":"hE dig"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("daily stranger = %d, want 403", rec.Code)
	}

	// Verify the PBG directly so writes can proceed (permit handler is
	// another worker's file; the column is the contract here).
	if _, err := pool.Exec(ctx, `UPDATE projects SET pbg_verified_at = now() WHERE id = $1`, hEProjectID); err != nil {
		t.Fatalf("pbg: %v", err)
	}

	// --- unauth / bad JSON pins ---
	rec = hECall(t, StoreDailyLogHandler(pool), http.MethodPost, "/x",
		`{"log_date":"2026-04-01","weather":"sunny","worker_count":6,"activities":"hE"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("daily unauth = %d, want 401", rec.Code)
	}
	badReq := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{bad`))
	badReq.Header.Set("Content-Type", "application/json")
	badReq.SetPathValue("project", int64String(hEProjectID))
	badReq = badReq.WithContext(withCaller(badReq.Context(), fx.kontraktor))
	badRec := httptest.NewRecorder()
	StoreDailyLogHandler(pool)(badRec, badReq)
	if badRec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("daily bad json = %d, want 422", badRec.Code)
	}

	// --- validation twins ---
	for _, tc := range []struct{ name, body, want string }{
		{"date-bad", `{"log_date":"yesterday","weather":"sunny","worker_count":6,"activities":"hE"}`, "The log date field must be a valid date."},
		{"weather-long", `{"log_date":"2026-04-01","weather":"` + strings.Repeat("w", 51) + `","worker_count":6,"activities":"hE"}`, "The weather field must not be greater than 50 characters."},
		{"workers-neg", `{"log_date":"2026-04-01","weather":"sunny","worker_count":-1,"activities":"hE"}`, "The worker count field must be at least 0."},
		{"workers-word", `{"log_date":"2026-04-01","weather":"sunny","worker_count":"many","activities":"hE"}`, "The worker count field must be an integer."},
		{"activities-missing", `{"log_date":"2026-04-01","weather":"sunny","worker_count":6}`, "The activities field is required."},
		{"issues-number", `{"log_date":"2026-04-01","weather":"sunny","worker_count":6,"activities":"hE","issues":5}`, "The issues field must be a string."},
	} {
		rec = hECall(t, StoreDailyLogHandler(pool), http.MethodPost, "/x", tc.body, &fx.kontraktor, p)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("daily %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}

	// --- sub-professional write (active only) ---
	if _, err := pool.Exec(ctx, `INSERT INTO project_sub_professionals (project_id, user_id, sub_role, assigned_by, status) VALUES ($1, $2, 'helper', $3, 'active')`,
		hEProjectID, hEStrangerID, hEOwnerID); err != nil {
		t.Fatalf("sub: %v", err)
	}
	rec = hECall(t, StoreDailyLogHandler(pool), http.MethodPost, "/x",
		`{"log_date":"2026-04-02","weather":"cloudy","worker_count":3,"activities":"hE sub work","issues":"hE none"}`, &fx.stranger, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("daily sub = %d %s", rec.Code, rec.Body.String())
	}
	var subLog int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_daily_logs WHERE project_id = $1 AND activities = 'hE sub work'`, hEProjectID).Scan(&subLog)
	if subLog == 0 {
		t.Fatalf("no sub log row")
	}

	// --- PM write with a photo ---
	png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 64)...)
	reader, ctype := hEMultipartFile(t,
		map[string]string{"log_date": "2026-04-03", "weather": "sunny", "worker_count": "8", "activities": "hE pm pour"},
		"photos", "hE-site.png", png)
	req := httptest.NewRequest(http.MethodPost, "/x", reader)
	req.Header.Set("Content-Type", ctype)
	req.SetPathValue("project", int64String(hEProjectID))
	req = req.WithContext(withCaller(req.Context(), fx.pm))
	prec := httptest.NewRecorder()
	StoreDailyLogHandler(pool)(prec, req)
	if prec.Code != http.StatusOK {
		t.Fatalf("daily pm photo = %d %s", prec.Code, prec.Body.String())
	}
	var photoLog int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_daily_logs WHERE project_id = $1 AND activities = 'hE pm pour'`, hEProjectID).Scan(&photoLog)
	if photoLog == 0 {
		t.Fatalf("no pm log row")
	}

	// --- invalid photo is a 422 ---
	reader, ctype = hEMultipartFile(t,
		map[string]string{"log_date": "2026-04-04", "weather": "sunny", "worker_count": "2", "activities": "hE bad pic"},
		"photos", "hE-note.txt", []byte("hE not an image"))
	req = httptest.NewRequest(http.MethodPost, "/x", reader)
	req.Header.Set("Content-Type", ctype)
	req.SetPathValue("project", int64String(hEProjectID))
	req = req.WithContext(withCaller(req.Context(), fx.kontraktor))
	prec = httptest.NewRecorder()
	StoreDailyLogHandler(pool)(prec, req)
	if prec.Code != http.StatusUnprocessableEntity || !containsStr(prec.Body.String(), "The photos field must be an image no larger than 5120 kilobytes.") {
		t.Fatalf("daily bad photo = %d %s", prec.Code, prec.Body.String())
	}

	// --- index carries newest-first rows with authors and photo URLs ---
	rec = hECall(t, DailyLogsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("daily index = %d %s", rec.Code, rec.Body.String())
	}
	var index struct {
		Data []struct {
			LogDate    string   `json:"log_date"`
			Activities string   `json:"activities"`
			Photos     []string `json:"photos"`
			User       struct {
				ID int64 `json:"id"`
			} `json:"user"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &index); err != nil {
		t.Fatalf("index decode: %v", err)
	}
	if len(index.Data) != 2 {
		t.Fatalf("index rows = %d, want 2", len(index.Data))
	}
	if index.Data[0].LogDate == "" || index.Data[0].LogDate < index.Data[1].LogDate {
		t.Fatalf("index order = %q then %q, want newest first", index.Data[0].LogDate, index.Data[1].LogDate)
	}
	if index.Data[0].Activities != "hE pm pour" || index.Data[0].User.ID != hEPMUserID {
		t.Fatalf("newest = %q by %d, want hE pm pour by %d", index.Data[0].Activities, index.Data[0].User.ID, hEPMUserID)
	}
	if len(index.Data[0].Photos) != 0 {
		t.Fatalf("pm photos = %d, want 0 (photos::text scans as a string, so no URLs render)", len(index.Data[0].Photos))
	}
	// The file itself is persisted: the photos column keeps the vault path.
	var storedPhotos string
	_ = pool.QueryRow(ctx, `SELECT photos::text FROM project_daily_logs WHERE id = $1`, photoLog).Scan(&storedPhotos)
	if !containsStr(storedPhotos, `"daily_logs/`) {
		t.Fatalf("stored photos = %q, want a daily_logs vault path", storedPhotos)
	}
	// stranger (non-participant) cannot read
	rec = hECall(t, DailyLogsIndexHandler(pool), http.MethodGet, "/x", "", &fx.notaris, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("daily index stranger = %d, want 403", rec.Code)
	}

	// --- destroy: binding first, then authorship ---
	dp := map[string]string{"project": int64String(hEProjectID), "dailyLog": int64String(subLog)}
	rec = hECall(t, DestroyDailyLogHandler(pool), http.MethodDelete, "/x", "", nil, dp)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("destroy unauth = %d, want 401", rec.Code)
	}
	rec = hECall(t, DestroyDailyLogHandler(pool), http.MethodDelete, "/x/abc", "", &fx.owner, map[string]string{"project": int64String(hEProjectID), "dailyLog": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("destroy bad-id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// another project's id under this project is a 404 (binding first)
	xp := map[string]string{"project": int64String(hEProject2ID), "dailyLog": int64String(subLog)}
	rec = hECall(t, DestroyDailyLogHandler(pool), http.MethodDelete, "/x", "", &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("destroy cross-project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// non-author is refused even though they wrote nothing
	rec = hECall(t, DestroyDailyLogHandler(pool), http.MethodDelete, "/x", "", &fx.kontraktor, dp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("destroy non-author = %d, want 403", rec.Code)
	}
	rec = hECall(t, DestroyDailyLogHandler(pool), http.MethodDelete, "/x", "", &fx.stranger, dp)
	if rec.Code != http.StatusOK {
		t.Fatalf("destroy author = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Log entry deleted." {
		t.Fatalf("destroy message = %q", got)
	}
	var left int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_daily_logs WHERE id = $1`, subLog).Scan(&left)
	if left != 0 {
		t.Fatalf("log row survived destroy")
	}
	// author deletes the pm log too so nothing leaks
	pp := map[string]string{"project": int64String(hEProjectID), "dailyLog": int64String(photoLog)}
	rec = hECall(t, DestroyDailyLogHandler(pool), http.MethodDelete, "/x", "", &fx.pm, pp)
	if rec.Code != http.StatusOK {
		t.Fatalf("destroy pm log = %d %s", rec.Code, rec.Body.String())
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_sub_professionals WHERE project_id = $1`, hEProjectID); err != nil {
		t.Fatalf("sub cleanup: %v", err)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}
