package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

type roadmapCaller struct {
	id    int64
	role  string
	admin bool
}

func (c roadmapCaller) UserID() int64   { return c.id }
func (c roadmapCaller) RoleType() string { return c.role }
func (c roadmapCaller) IsAdmin() bool   { return c.admin }

func roadmapPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL absent")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Skip("no database")
	}
	if err := pool.Ping(context.Background()); err != nil {
		t.Skip("database unreachable")
	}
	return pool
}

func roadmapProject(t *testing.T, pool *pgxpool.Pool) (projectID, ownerID int64) {
	t.Helper()
	if err := pool.QueryRow(context.Background(), `SELECT id, user_id FROM projects ORDER BY id LIMIT 1`).Scan(&projectID, &ownerID); err != nil {
		t.Skip("no projects seeded")
	}
	return projectID, ownerID
}

func TestSavedSearchesCRUD(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	caller := roadmapCaller{id: 999001, role: "user"}
	// Use a real user id if present for FK.
	var uid int64
	if err := pool.QueryRow(context.Background(), `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&uid); err == nil {
		caller.id = uid
	}
	// Create.
	body := strings.NewReader(`{"name":"test view","params":{"q":"jakarta"},"alert_enabled":true}`)
	req := httptest.NewRequest(http.MethodPost, "/api/saved-searches", body)
	req = req.WithContext(withCaller(req.Context(), caller))
	rec := httptest.NewRecorder()
	StoreSavedSearchHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("store status = %d, body %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID int64 `json:"id"`
	}
	_ = created
	// Response is {message,id} via jsonphp — decode loosely.
	var raw map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode store: %v", err)
	}
	idFloat, _ := raw["id"].(float64)
	id := int64(idFloat)
	if id == 0 {
		t.Fatalf("no id in store response: %s", rec.Body.String())
	}
	// Index contains it.
	req2 := httptest.NewRequest(http.MethodGet, "/api/saved-searches", nil)
	req2 = req2.WithContext(withCaller(req2.Context(), caller))
	rec2 := httptest.NewRecorder()
	SavedSearchesIndexHandler(pool)(rec2, req2)
	if rec2.Code != http.StatusOK || !strings.Contains(rec2.Body.String(), "test view") {
		t.Fatalf("index missing saved search: %d %s", rec2.Code, rec2.Body.String())
	}
	// Delete.
	req3 := httptest.NewRequest(http.MethodDelete, "/api/saved-searches/1", nil)
	req3.SetPathValue("id", itoaTest(id))
	req3 = req3.WithContext(withCaller(req3.Context(), caller))
	rec3 := httptest.NewRecorder()
	DestroySavedSearchHandler(pool)(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Fatalf("delete status = %d, body %s", rec3.Code, rec3.Body.String())
	}
}

func itoaTest(v int64) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := v < 0
	if neg {
		v = -v
	}
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func TestFinanceLedgerHandler(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	projectID, ownerID := roadmapProject(t, pool)
	caller := roadmapCaller{id: ownerID, role: "user"}
	req := httptest.NewRequest(http.MethodGet, "/api/projects/1/finance-ledger", nil)
	req.SetPathValue("project", itoaTest(projectID))
	req = req.WithContext(withCaller(req.Context(), caller))
	rec := httptest.NewRecorder()
	FinanceLedgerHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("ledger status = %d, body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "summary") || !strings.Contains(rec.Body.String(), "transactions") {
		t.Fatalf("ledger missing keys: %s", rec.Body.String()[:200])
	}
}

func TestAnalyticsHandler(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	var uid int64
	if err := pool.QueryRow(context.Background(), `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&uid); err != nil {
		t.Skip("no users")
	}
	caller := roadmapCaller{id: uid, role: "user"}
	req := httptest.NewRequest(http.MethodGet, "/api/me/analytics", nil)
	req = req.WithContext(withCaller(req.Context(), caller))
	rec := httptest.NewRecorder()
	AnalyticsHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("analytics status = %d, body %s", rec.Code, rec.Body.String())
	}
	for _, k := range []string{"projects_posted", "bids_placed", "saved_searches"} {
		if !strings.Contains(rec.Body.String(), k) {
			t.Fatalf("analytics missing %s: %s", k, rec.Body.String()[:200])
		}
	}
}

func TestExportReportCSVAndPDF(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	projectID, ownerID := roadmapProject(t, pool)
	caller := roadmapCaller{id: ownerID, role: "user", admin: true}
	for _, format := range []string{"csv", "pdf"} {
		req := httptest.NewRequest(http.MethodGet, "/api/projects/1/reports/export?format="+format, nil)
		req.SetPathValue("project", itoaTest(projectID))
		req = req.WithContext(withCaller(req.Context(), caller))
		rec := httptest.NewRecorder()
		ExportReportHandler(pool)(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("export %s status = %d, body %s", format, rec.Code, rec.Body.String())
		}
		ct := rec.Header().Get("Content-Type")
		if format == "csv" && !strings.Contains(ct, "text/csv") {
			t.Fatalf("csv content-type = %q", ct)
		}
		if format == "pdf" && !strings.Contains(ct, "application/pdf") {
			t.Fatalf("pdf content-type = %q", ct)
		}
		if rec.Body.Len() < 20 {
			t.Fatalf("export %s body too short", format)
		}
		if format == "pdf" && !strings.HasPrefix(rec.Body.String(), "%PDF") {
			t.Fatalf("pdf missing header")
		}
	}
}

// Live sends need credentials the repo does not ship. Documented, not faked:
// VAPID_PRIVATE_KEY (push), S3_* (presign), RESEND_API_KEY (mail).
func TestLiveSendsNeedCredentials(t *testing.T) {
	missing := []string{}
	if os.Getenv("VAPID_PRIVATE_KEY") == "" {
		missing = append(missing, "VAPID_PRIVATE_KEY (push)")
	}
	if os.Getenv("S3_ACCESS_KEY") == "" {
		missing = append(missing, "S3_ACCESS_KEY (presigned PUT/GET)")
	}
	if os.Getenv("RESEND_API_KEY") == "" {
		missing = append(missing, "RESEND_API_KEY (mail)")
	}
	if len(missing) > 0 {
		t.Skip("live sends need credentials not present in this environment: " + strings.Join(missing, ", "))
	}
}
