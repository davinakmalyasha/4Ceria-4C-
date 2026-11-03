package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func ctxBG() context.Context { return context.Background() }

func TestProjectProgressHandler(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	projectID, ownerID := roadmapProject(t, pool)
	caller := roadmapCaller{id: ownerID, role: "user", admin: true}
	req := httptest.NewRequest(http.MethodGet, "/api/projects/1/progress", nil)
	req.SetPathValue("project", itoaTest(projectID))
	req = req.WithContext(withCaller(req.Context(), caller))
	rec := httptest.NewRecorder()
	ProjectProgressHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("progress status = %d, %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "percent") {
		t.Fatalf("progress missing percent: %s", rec.Body.String()[:200])
	}
}

func TestOwnerReviewsRoundTrip(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	projectID, _ := roadmapProject(t, pool)
	var uid int64
	if err := pool.QueryRow(ctxBG(), `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&uid); err != nil {
		t.Skip("no users")
	}
	caller := roadmapCaller{id: uid, role: "kontraktor"}
	body := strings.NewReader(`{"rating":5,"komentar":"great owner"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/projects/1/owner-reviews", body)
	req.SetPathValue("project", itoaTest(projectID))
	req = req.WithContext(withCaller(req.Context(), caller))
	rec := httptest.NewRecorder()
	StoreOwnerReviewHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("store owner review = %d, %s", rec.Code, rec.Body.String())
	}
	req2 := httptest.NewRequest(http.MethodGet, "/api/projects/1/owner-reviews", nil)
	req2.SetPathValue("project", itoaTest(projectID))
	req2 = req2.WithContext(withCaller(req2.Context(), caller))
	rec2 := httptest.NewRecorder()
	OwnerReviewsHandler(pool)(rec2, req2)
	if rec2.Code != http.StatusOK || !strings.Contains(rec2.Body.String(), "great owner") {
		t.Fatalf("owner reviews missing: %d %s", rec2.Code, rec2.Body.String())
	}
}

func TestSnagSLAAndKPRAndExport(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	projectID, ownerID := roadmapProject(t, pool)
	caller := roadmapCaller{id: ownerID, role: "user", admin: true}
	req := httptest.NewRequest(http.MethodGet, "/api/projects/1/snags/sla", nil)
	req.SetPathValue("project", itoaTest(projectID))
	req = req.WithContext(withCaller(req.Context(), caller))
	rec := httptest.NewRecorder()
	SnagSLAHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("sla status = %d, %s", rec.Code, rec.Body.String())
	}
	req2 := httptest.NewRequest(http.MethodGet, "/api/tools/kpr?principal=500000000&rate=7.5&years=20", nil)
	req2 = req2.WithContext(withCaller(req2.Context(), caller))
	rec2 := httptest.NewRecorder()
	KPRHandler(pool)(rec2, req2)
	if rec2.Code != http.StatusOK || !strings.Contains(rec2.Body.String(), "monthly") {
		t.Fatalf("kpr missing: %d %s", rec2.Code, rec2.Body.String())
	}
	req3 := httptest.NewRequest(http.MethodGet, "/api/me/export", nil)
	req3 = req3.WithContext(withCaller(req3.Context(), caller))
	rec3 := httptest.NewRecorder()
	AccountExportHandler(pool)(rec3, req3)
	if rec3.Code != http.StatusOK || !strings.Contains(rec3.Body.String(), "saved_searches") {
		t.Fatalf("export missing: %d %s", rec3.Code, rec3.Body.String())
	}
}
