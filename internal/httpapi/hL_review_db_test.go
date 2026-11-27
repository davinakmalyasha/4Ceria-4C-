package httpapi

// hL brief review flow, lock-phase validation twins and project-store
// gallery/attachment branches.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHLReviewFlow(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	p := hLProjectPath(fx.projectID)
	p2 := hLProjectPath(fx.project2ID)

	// Non-owner is refused before validation.
	if rec := hLCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"arsitek"}`, &fx.stranger, p); rec.Code != http.StatusForbidden {
		t.Fatalf("review stranger = %d", rec.Code)
	}
	// Validation twins: rating and target legs.
	for _, tc := range []struct {
		name, body, field, msg string
	}{
		{"rating missing", `{"target_role":"arsitek"}`, "rating", "The rating field is required."},
		{"rating low", `{"rating":0,"target_role":"arsitek"}`, "rating", "The rating field must be at least 1."},
		{"rating high", `{"rating":6,"target_role":"arsitek"}`, "rating", "The rating field must not be greater than 5."},
		{"rating text", `{"rating":"x","target_role":"arsitek"}`, "rating", "The rating field must be an integer."},
		{"comment type", `{"rating":5,"target_role":"arsitek","comment":7}`, "comment", "The comment field must be a string."},
		{"target missing", `{"rating":5}`, "target_role", "The target role field is required."},
		{"target bad", `{"rating":5,"target_role":"wizard"}`, "target_role", "The selected target role is invalid."},
	} {
		rec := hLCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", tc.body, &fx.owner, p)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s = %d, want 422", tc.name, rec.Code)
		}
		if errs := hLDecode(t, rec)["errors"].(map[string]any)[tc.field].([]any); errs[0].(string) != tc.msg {
			t.Fatalf("%s errors = %v", tc.name, errs)
		}
	}
	// No assignment for the pm role: the 422 pin.
	if rec := hLCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"pm"}`, &fx.owner, p); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("review no-bid = %d", rec.Code)
	} else if !strings.Contains(rec.Body.String(), "No professional assignment found for role: pm") {
		t.Fatalf("review no-bid body = %s", rec.Body.String())
	}
	// In-progress project with an active bid: too early to review.
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, status)
		VALUES ($1,'kontraktor',$2,$3,$3,'accepted')`, fx.project2ID, fx.stranger.id, hLKontraktorProfileID); err != nil {
		t.Fatalf("seed bid2: %v", err)
	}
	if rec := hLCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"kontraktor"}`, &fx.owner, p2); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("review early = %d", rec.Code)
	} else if !strings.Contains(rec.Body.String(), "You can only leave a review once the project is completed") {
		t.Fatalf("review early body = %s", rec.Body.String())
	}

	// Completed project with an accepted arsitek bid: create then update.
	if _, err := pool.Exec(ctx, `UPDATE projects SET status='completed' WHERE id=$1`, fx.projectID); err != nil {
		t.Fatalf("complete: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, status)
		VALUES ($1,'arsitek',$2,$3,$3,'accepted')`, fx.projectID, fx.stranger.id, hLArsitekProfileID); err != nil {
		t.Fatalf("seed bid: %v", err)
	}
	rec := hLCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":5,"target_role":"arsitek","comment":"hL superb"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("review create = %d %s", rec.Code, rec.Body.String())
	}
	if msg := hLDecode(t, rec)["message"].(string); msg != "Thank you for your feedback!" {
		t.Fatalf("review msg = %q", msg)
	}
	var rating int
	var comment string
	_ = pool.QueryRow(ctx, `SELECT rating, komentar FROM arsitek_ratings WHERE project_id=$1 AND reviewer_id=$2`, fx.projectID, fx.owner.id).Scan(&rating, &comment)
	if rating != 5 || comment != "hL superb" {
		t.Fatalf("review row = %d %q", rating, comment)
	}
	// Second review updates the same row (updateOrCreate twin).
	rec = hLCall(t, ReviewProjectHandler(pool), http.MethodPost, "/x", `{"rating":4,"target_role":"arsitek"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("review update = %d %s", rec.Code, rec.Body.String())
	}
	var count int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM arsitek_ratings WHERE project_id=$1 AND reviewer_id=$2`, fx.projectID, fx.owner.id).Scan(&count)
	if count != 1 {
		t.Fatalf("review rows = %d, want 1", count)
	}
	_ = pool.QueryRow(ctx, `SELECT rating FROM arsitek_ratings WHERE project_id=$1 AND reviewer_id=$2`, fx.projectID, fx.owner.id).Scan(&rating)
	if rating != 4 {
		t.Fatalf("review updated rating = %d", rating)
	}
	// The reviewed professional is notified.
	var nTitle string
	_ = pool.QueryRow(ctx, `SELECT title FROM notifications WHERE user_id=$1 AND type='new_review' ORDER BY id DESC LIMIT 1`, fx.arsitek.id).Scan(&nTitle)
	if nTitle != "New Review Received" {
		t.Fatalf("review notify = %q", nTitle)
	}
}

func TestHLLockPhaseTwins(t *testing.T) {
	pool := hLPool(t)
	fx := hLSetup(t, pool)
	p := hLProjectPath(fx.projectID)

	if rec := hLCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":7}`, &fx.arsitek, p); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("phase type = %d", rec.Code)
	} else if !strings.Contains(rec.Body.String(), "The selected phase is invalid.") {
		t.Fatalf("phase type body = %s", rec.Body.String())
	}
	if rec := hLCall(t, LockPhaseBriefHandler(pool), http.MethodPost, "/x", `{"phase":"wizard"}`, &fx.arsitek, p); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("phase value = %d", rec.Code)
	}
}

func TestHLStoreProjectFiles(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	dir := t.TempDir()
	t.Setenv("PUBLIC_STORAGE_ROOT", dir)

	build := func(extraImages int, attach bool) (*bytes.Buffer, string) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		for k, v := range map[string]string{
			"title": "hL Files", "description": "hL f", "budget": "500000",
			"lokasi": "hL", "project_category": "maintenance", "deadline": "2027-03-01",
		} {
			_ = mw.WriteField(k, v)
		}
		png := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, bytes.Repeat([]byte{0}, 64)...)
		for i := 0; i < extraImages; i++ {
			fw, _ := mw.CreateFormFile("images", "hL-pic.png")
			_, _ = fw.Write(png)
		}
		if attach {
			fw, _ := mw.CreateFormFile("attachment", "hL.pdf")
			_, _ = fw.Write([]byte("%PDF-1.4\nhL\n%%EOF\n"))
		}
		_ = mw.Close()
		return &buf, mw.FormDataContentType()
	}
	post := func(buf *bytes.Buffer, ct string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/x", buf)
		req.Header.Set("Content-Type", ct)
		req = req.WithContext(withCaller(req.Context(), fx.owner))
		rec := httptest.NewRecorder()
		StoreProjectHandler(pool)(rec, req)
		return rec
	}

	// Four images breach the three-file cap.
	buf, ct := build(4, false)
	if rec := post(buf, ct); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("four images = %d", rec.Code)
	} else if !strings.Contains(rec.Body.String(), "The images field must not have more than 3 items.") {
		t.Fatalf("four images body = %s", rec.Body.String()[:300])
	}
	// Attachment plus one image stores both (201 with image rows).
	buf, ct = build(1, true)
	rec := post(buf, ct)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store files = %d %s", rec.Code, rec.Body.String())
	}
	pid := int64(hLDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	defer pool.Exec(ctx, `DELETE FROM project_images WHERE project_id=$1`, pid)
	defer pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	var imgCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_images WHERE project_id=$1`, pid).Scan(&imgCount)
	if imgCount != 1 {
		t.Fatalf("images = %d, want 1", imgCount)
	}
	var attachPath string
	_ = pool.QueryRow(ctx, `SELECT COALESCE(attachment,'') FROM projects WHERE id=$1`, pid).Scan(&attachPath)
	if !strings.HasPrefix(attachPath, "project_attachments/") {
		t.Fatalf("attachment = %q", attachPath)
	}
	// The images[] spelling reads the same files (fallback leg).
	var buf2 bytes.Buffer
	mw2 := multipart.NewWriter(&buf2)
	_ = mw2.WriteField("title", "hL Bracket")
	_ = mw2.WriteField("description", "hL b")
	_ = mw2.WriteField("budget", "600000")
	_ = mw2.WriteField("lokasi", "hL")
	_ = mw2.WriteField("project_category", "maintenance")
	_ = mw2.WriteField("deadline", "2027-04-01")
	fw2, _ := mw2.CreateFormFile("images[]", "hL-b.png")
	_, _ = fw2.Write(append([]byte{0x89, 'P', 'N', 'G'}, bytes.Repeat([]byte{0}, 64)...))
	_ = mw2.Close()
	breq := httptest.NewRequest(http.MethodPost, "/x", &buf2)
	breq.Header.Set("Content-Type", mw2.FormDataContentType())
	breq = breq.WithContext(withCaller(breq.Context(), fx.owner))
	brec := httptest.NewRecorder()
	StoreProjectHandler(pool)(brec, breq)
	if brec.Code != http.StatusCreated {
		t.Fatalf("store bracket images = %d %s", brec.Code, brec.Body.String())
	}
	bpid := int64(hLDecode(t, brec)["data"].(map[string]any)["id"].(float64))
	defer pool.Exec(ctx, `DELETE FROM project_images WHERE project_id=$1`, bpid)
	defer pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, bpid)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, bpid)
	var bimg int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_images WHERE project_id=$1`, bpid).Scan(&bimg)
	if bimg != 1 {
		t.Fatalf("bracket images = %d, want 1", bimg)
	}
}

func TestHLActivityGhost(t *testing.T) {
	pool := hLPool(t)
	fx := hLSetup(t, pool)
	p := hLProjectPath(fx.projectID)

	// Ghost caller takes the viewer-gate 404 pin (never a 500).
	rec := hLCall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.ghost, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("activity ghost = %d %s", rec.Code, rec.Body.String())
	}
	// Bad project id is the model-binding 404.
	rec = hLCall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("activity bad id = %d", rec.Code)
	}
}
