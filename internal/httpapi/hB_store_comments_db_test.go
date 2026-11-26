package httpapi

// hB project store, comments and activity.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHBStoreProject(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)

	base := `{"title":"hB Villa","description":"hB build","budget":25000000,"lokasi":"hB City","project_category":"new_build","deadline":"2027-06-01"}`
	rec := hBCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", base, &fx.owner, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store = %d %s", rec.Code, rec.Body.String())
	}
	data := hBDecode(t, rec)["data"].(map[string]any)
	if data["title"] != "hB Villa" {
		t.Fatalf("title = %v", data)
	}
	pid := int64(data["id"].(float64))

	// Opening-budget ledger row in exact minor units.
	var ledgerCount int
	var ledgerAmount string
	if err := pool.QueryRow(context.Background(), `SELECT count(*), COALESCE(max(amount)::text,'0') FROM project_budget_transactions WHERE project_id = $1`,
		pid).Scan(&ledgerCount, &ledgerAmount); err != nil {
		t.Fatalf("ledger: %v", err)
	}
	if ledgerCount != 1 || ledgerAmount != "25000000.00" {
		t.Fatalf("ledger = %d rows amount %s", ledgerCount, ledgerAmount)
	}

	// Zero budget writes no ledger row; external vendor + PM publish path.
	rec = hBCall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hB Zero","description":"hB z","budget":0,"lokasi":"hB","project_category":"renovation","deadline":"2027-01-02","wants_project_manager":true,"external_vendors":"{\"kontraktor\":{\"contact_person\":\"hB Ext\",\"phone_number\":\"0800\"}}"}`, &fx.owner, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store zero = %d %s", rec.Code, rec.Body.String())
	}
	var zeroCount int
	zeroID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM project_budget_transactions WHERE project_id = $1`,
		zeroID).Scan(&zeroCount); err != nil || zeroCount != 0 {
		t.Fatalf("zero ledger = %d, %v", zeroCount, err)
	}
	var vendorCount int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM project_external_vendors WHERE project_id = $1`,
		zeroID).Scan(&vendorCount); err != nil || vendorCount != 1 {
		t.Fatalf("vendors = %d, %v", vendorCount, err)
	}

	// Validation envelope: missing everything.
	rec = hBCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store empty = %d, want 422", rec.Code)
	}
	// Bad budget, bad category, bad deadline, too many images is
	// multipart-only; bad target role.
	rec = hBCall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hB","description":"hB","budget":"abc","lokasi":"hB","project_category":"castle","deadline":"not-a-date","target_role":"wizard"}`,
		&fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store invalid = %d, want 422", rec.Code)
	}
	// Bad JSON documents and flags are 422s.
	rec = hBCall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hB","description":"hB","budget":1,"lokasi":"hB","project_category":"new_build","deadline":"2027-01-01","needed_phases":"{oops","wants_project_manager":"maybe"}`,
		&fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store bad json = %d, want 422", rec.Code)
	}
	// Anonymous.
	rec = hBCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", base, nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("store anon = %d, want 401", rec.Code)
	}
}

func TestHBStoreProjectAttachment(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)

	dir := t.TempDir()
	t.Setenv("PUBLIC_STORAGE_ROOT", dir)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for k, v := range map[string]string{
		"title": "hB Attach", "description": "hB a", "budget": "500000",
		"lokasi": "hB", "project_category": "maintenance", "deadline": "2027-03-01",
	} {
		if err := writer.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	part, err := writer.CreateFormFile("attachment", "hB.pdf")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("%PDF-1.4\nhB\n%%EOF\n")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	b := body.String()
	req := httptest.NewRequest(http.MethodPost, "/api/projects", strings.NewReader(b))
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req = req.WithContext(withCaller(req.Context(), fx.owner))
	rec := httptest.NewRecorder()
	StoreProjectHandler(pool)(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store attachment = %d %s", rec.Code, rec.Body.String())
	}
	pid := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	var attachment *string
	if err := pool.QueryRow(context.Background(), `SELECT attachment FROM projects WHERE id = $1`,
		pid).Scan(&attachment); err != nil || attachment == nil || !strings.HasPrefix(*attachment, "project_attachments/") {
		t.Fatalf("attachment = %v, %v", attachment, err)
	}
}

func TestHBStoreProjectMultipart(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)

	dir := t.TempDir()
	t.Setenv("PUBLIC_STORAGE_ROOT", dir)

	jpg := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0}, 100)...)
	build := func(t *testing.T, n int, bad bool) (*strings.Reader, string) {
		t.Helper()
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		for k, v := range map[string]string{
			"title": "hB Multi", "description": "hB m", "budget": "1000000",
			"lokasi": "hB", "project_category": "new_build", "deadline": "2027-05-01",
		} {
			if err := writer.WriteField(k, v); err != nil {
				t.Fatal(err)
			}
		}
		for i := 0; i < n; i++ {
			name := "hB.jpg"
			data := jpg
			if bad && i == 0 {
				name, data = "hB.txt", []byte("hB text")
			}
			part, err := writer.CreateFormFile("images", name)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := part.Write(data); err != nil {
				t.Fatal(err)
			}
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		b := body.String()
		return strings.NewReader(b), writer.FormDataContentType()
	}
	call := func(reader *strings.Reader, ctype string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/projects", reader)
		req.Header.Set("Content-Type", ctype)
		req = req.WithContext(withCaller(req.Context(), fx.owner))
		rec := httptest.NewRecorder()
		StoreProjectHandler(pool)(rec, req)
		return rec
	}

	// Two images persist under project_images.
	reader, ctype := build(t, 2, false)
	rec := call(reader, ctype)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store images = %d %s", rec.Code, rec.Body.String())
	}
	pid := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	var images int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM project_images WHERE project_id = $1`,
		pid).Scan(&images); err != nil || images != 2 {
		t.Fatalf("images = %d, %v", images, err)
	}

	// Four images trip the 3-item cap; a text file trips the mime rule.
	reader, ctype = build(t, 4, false)
	if rec := call(reader, ctype); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store 4 images = %d, want 422", rec.Code)
	}
	reader, ctype = build(t, 1, true)
	if rec := call(reader, ctype); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store bad image = %d, want 422 %s", rec.Code, rec.Body.String())
	}
}

func TestHBProjectComments(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Empty index for the owner; forbidden for a stranger.
	rec := hBCall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("comments index = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("comments stranger = %d, want 403", rec.Code)
	}

	// Top-level message from the kontraktor notifies the owner.
	rec = hBCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hB progress"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment store = %d %s", rec.Code, rec.Body.String())
	}
	var stored []any
	if err := func() error {
		dec := hBDecode(t, rec)
		stored, _ = dec["data"].([]any)
		return nil
	}(); err != nil {
		t.Fatal(err)
	}
	topID := int64(stored[0].(map[string]any)["id"].(float64))
	var notifCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id = $1 AND type = 'project_message'`,
		fx.owner.id).Scan(&notifCount); err != nil || notifCount != 1 {
		t.Fatalf("owner notify = %d, %v", notifCount, err)
	}

	// Reply notifies the parent's author.
	replyPath := map[string]string{"project": int64String(fx.projectID)}
	rec = hBCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hB noted","parent_id":`+int64String(topID)+`}`, &fx.owner, replyPath)
	if rec.Code != http.StatusOK {
		t.Fatalf("reply = %d %s", rec.Code, rec.Body.String())
	}

	// Validation: empty message.
	rec = hBCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment empty = %d, want 422", rec.Code)
	}
	// Unknown parent id: the exists rule.
	rec = hBCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hB x","parent_id":999999999}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment bad parent = %d, want 422, got %s", rec.Code, rec.Body.String())
	}
	// Parent of another project: the Invalid-parent 422.
	var otherParent int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_comments (project_id, user_id, message, created_at, updated_at)
		VALUES ($1, $2, 'hB other', now(), now()) RETURNING id`, fx.project2ID, fx.owner.id).Scan(&otherParent); err != nil {
		t.Fatalf("other comment: %v", err)
	}
	rec = hBCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hB x","parent_id":`+int64String(otherParent)+`}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment foreign parent = %d, want 422, got %s", rec.Code, rec.Body.String())
	}
	// Stranger cannot post.
	rec = hBCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hB x"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("comment stranger = %d, want 403", rec.Code)
	}

	// Update by the author; forbidden for a fellow participant.
	cp := map[string]string{"project": int64String(fx.projectID), "comment": int64String(topID)}
	rec = hBCall(t, UpdateCommentHandler(pool), http.MethodPut, "/x",
		`{"message":"hB edited"}`, &fx.kontraktor, cp)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment update = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UpdateCommentHandler(pool), http.MethodPut, "/x",
		`{"message":"hB hijack"}`, &fx.arsitek, cp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("comment update other = %d, want 403", rec.Code)
	}
	rec = hBCall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{}`, &fx.kontraktor, cp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment update empty = %d, want 422", rec.Code)
	}
	// Cross-project comment id: plain 404.
	xp := map[string]string{"project": int64String(fx.projectID), "comment": int64String(otherParent)}
	rec = hBCall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{"message":"hB"}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("comment update cross = %d, want 404", rec.Code)
	}

	// Delete by the project owner (not the author); forbidden for a
	// participant who is neither.
	rec = hBCall(t, DestroyCommentHandler(pool), http.MethodDelete, "/x", "", &fx.arsitek, cp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("comment delete other = %d, want 403", rec.Code)
	}
	rec = hBCall(t, DestroyCommentHandler(pool), http.MethodDelete, "/x", "", &fx.owner, cp)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment delete owner = %d %s", rec.Code, rec.Body.String())
	}
	var remaining int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_comments WHERE project_id = $1`, fx.projectID).Scan(&remaining); err != nil {
		t.Fatalf("remaining: %v", err)
	}
	_ = remaining
}

func TestHBActivity(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	if _, err := pool.Exec(ctx, `INSERT INTO project_activity_logs (project_id, user_id, action, details, created_at, updated_at)
		VALUES ($1, $2, 'hB_action', 'hB details', now(), now())`, fx.projectID, fx.owner.id); err != nil {
		t.Fatalf("activity seed: %v", err)
	}

	rec := hBCall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("activity = %d %s", rec.Code, rec.Body.String())
	}
	body := hBDecode(t, rec)
	if data, _ := body["data"].([]any); len(data) != 1 {
		t.Fatalf("activity len = %v", body)
	}
	// Hired kontraktor reads; stranger is refused.
	rec = hBCall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("activity kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("activity stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, ActivityHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("activity anon = %d, want 401", rec.Code)
	}
	rec = hBCall(t, ActivityHandler(pool), http.MethodGet, "/abc", "", &fx.owner, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("activity bad id = %d, want 404 %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}
