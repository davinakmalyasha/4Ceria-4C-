package httpapi

// hI activity/comments/reports/schedules leftovers: auth gates, ghost
// 404s via gateError, validation twins and literal post-state.

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestHIActivity(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	// Invalid project id format → 404 model binding.
	rec := hICall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("activity bad id = %d, want 404", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "No query results for model") || !strings.Contains(rec.Body.String(), "abc") {
		t.Fatalf("activity bad id body = %s", rec.Body.String())
	}

	// Anonymous → 401.
	rec = hICall(t, ActivityHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("activity anon = %d, want 401", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Unauthenticated.") {
		t.Fatalf("activity anon body = %s", rec.Body.String())
	}

	// Stranger → 403 with the trait sentence.
	rec = hICall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("activity stranger = %d, want 403", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Unauthorized.") {
		t.Fatalf("activity stranger body = %s", rec.Body.String())
	}

	// Ghost caller (no users row) → 404 via gateError, never 500.
	rec = hICall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.ghost, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("activity ghost = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Record not found.") {
		t.Fatalf("activity ghost body = %s", rec.Body.String())
	}

	// Missing project id (valid int, no row) → 404 model binding.
	rec = hICall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("activity missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// Happy: owner reads, empty at first.
	rec = hICall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("activity owner = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"data":[]`) {
		t.Fatalf("activity empty = %s", rec.Body.String())
	}

	// Insert one log row directly, then the index carries it.
	if _, err := pool.Exec(ctx, `INSERT INTO project_activity_logs (project_id, user_id, action, details, created_at, updated_at)
		VALUES ($1, $2, 'hI_action', 'hI details', now(), now())`, fx.projectID, fx.owner.id); err != nil {
		t.Fatalf("activity insert: %v", err)
	}
	rec = hICall(t, ActivityHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("activity with row = %d %s", rec.Code, rec.Body.String())
	}
	body := hIDecode(t, rec)
	data := body["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("activity len = %d %s", len(data), rec.Body.String())
	}
	first := data[0].(map[string]any)
	if first["action"] != "hI_action" {
		t.Fatalf("activity action = %v", first["action"])
	}
	if first["details"] != "hI details" {
		t.Fatalf("activity details = %v", first["details"])
	}
	// Post-state literal.
	var action string
	if err := pool.QueryRow(ctx, `SELECT action FROM project_activity_logs WHERE project_id = $1`, fx.projectID).Scan(&action); err != nil || action != "hI_action" {
		t.Fatalf("activity post-state = %q %v", action, err)
	}
}

func TestHIComments(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	// Index: bad id 404, anon 401, stranger 403, ghost 404.
	rec := hICall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("comments bad id = %d, want 404", rec.Code)
	}
	rec = hICall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("comments anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("comments stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", &fx.ghost, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("comments ghost = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Record not found.") {
		t.Fatalf("comments ghost body = %s", rec.Body.String())
	}

	// Store happy as kontraktor (hired participant).
	rec = hICall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hI hello"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment store = %d %s", rec.Code, rec.Body.String())
	}
	var commentID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM project_comments WHERE project_id = $1 AND message = 'hI hello'`,
		fx.projectID).Scan(&commentID); err != nil {
		t.Fatalf("comment post-state missing: %v", err)
	}
	// Store validation twin: empty message → 422.
	rec = hICall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment empty = %d, want 422", rec.Code)
	}
	// Store non-string message → 422.
	rec = hICall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x", `{"message":123}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment non-string = %d, want 422", rec.Code)
	}
	// Store stranger → 403.
	rec = hICall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x", `{"message":"hI no"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("comment stranger = %d, want 403", rec.Code)
	}
	// Invalid parent id (non-existent) → 422 selected parent id invalid.
	rec = hICall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hI reply","parent_id":999999999}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment bad parent = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Reply happy: parent is the first comment.
	rp := map[string]string{"project": int64String(fx.projectID), "comment": int64String(commentID)}
	_ = rp
	replyPath := map[string]string{"project": int64String(fx.projectID)}
	rec = hICall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hI reply","parent_id":`+int64String(commentID)+`}`, &fx.owner, replyPath)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment reply = %d %s", rec.Code, rec.Body.String())
	}
	var replyCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_comments WHERE parent_id = $1`, commentID).Scan(&replyCount); err != nil || replyCount != 1 {
		t.Fatalf("reply post-state = %d %v", replyCount, err)
	}

	// Index now carries the rows.
	rec = hICall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("comments index = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "hI hello") {
		t.Fatalf("comments index missing: %s", rec.Body.String())
	}

	// Update happy as author.
	up := map[string]string{"project": int64String(fx.projectID), "comment": int64String(commentID)}
	rec = hICall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{"message":"hI edited"}`, &fx.kontraktor, up)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment update = %d %s", rec.Code, rec.Body.String())
	}
	var edited string
	if err := pool.QueryRow(ctx, `SELECT message FROM project_comments WHERE id = $1`, commentID).Scan(&edited); err != nil || edited != "hI edited" {
		t.Fatalf("comment edited post-state = %q %v", edited, err)
	}
	// Update forbidden for non-author participant.
	rec = hICall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{"message":"hI hijack"}`, &fx.owner, up)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("comment update hijack = %d, want 403", rec.Code)
	}
	// Update cross-project → 404 Not found.
	xp := map[string]string{"project": int64String(fx.project2ID), "comment": int64String(commentID)}
	rec = hICall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{"message":"hI x"}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("comment cross = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Not found.") {
		t.Fatalf("comment cross body = %s", rec.Body.String())
	}
	// Update missing → 404 model binding.
	rec = hICall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{"message":"hI x"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "comment": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("comment missing = %d, want 404", rec.Code)
	}
	// Update validation: empty → 422.
	rec = hICall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{"message":""}`, &fx.kontraktor, up)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment update empty = %d, want 422", rec.Code)
	}

	// Delete forbidden for a participant who is neither author nor owner,
	// then happy deletes, then missing 404.
	rec = hICall(t, DestroyCommentHandler(pool), http.MethodDelete, "/x", "", &fx.arsitek, up)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("comment delete hijack = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	// Delete the reply first (as owner, its author).
	var replyID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM project_comments WHERE parent_id = $1 LIMIT 1`, commentID).Scan(&replyID); err != nil {
		t.Fatalf("reply id: %v", err)
	}
	rec = hICall(t, DestroyCommentHandler(pool), http.MethodDelete, "/x", "", &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "comment": int64String(replyID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("reply delete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, DestroyCommentHandler(pool), http.MethodDelete, "/x", "", &fx.kontraktor, up)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment delete = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Comment deleted") {
		t.Fatalf("comment delete body = %s", rec.Body.String())
	}
	rec = hICall(t, DestroyCommentHandler(pool), http.MethodDelete, "/x", "", &fx.kontraktor, up)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("comment delete again = %d, want 404", rec.Code)
	}
	var left int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM project_comments WHERE project_id = $1`, fx.projectID).Scan(&left); err != nil || left != 0 {
		t.Fatalf("comments leftover = %d %v", left, err)
	}
}
