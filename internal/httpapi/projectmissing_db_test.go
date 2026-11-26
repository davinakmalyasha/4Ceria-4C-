package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Missing rows are a client error, never a 500: loader gates map
// pgx.ErrNoRows to 404 via gateError. This pins the contract on
// representative project-workspace reads — a missing project id must
// answer 404 with the record body, with zero fixtures involved.
func TestProjectMissingRowIs404(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	var uid int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&uid); err != nil {
		t.Skip("no seeded users")
	}
	caller := &roadmapCaller{id: uid, role: "user"}

	handlers := map[string]func(*pgxpool.Pool) http.HandlerFunc{
		"change-orders": ChangeOrdersIndexHandler,
		"daily-logs":    DailyLogsIndexHandler,
		"comments":      ProjectCommentsIndexHandler,
		"warranty":      WarrantyClaimsIndexHandler,
		"activity":      ActivityHandler,
		"milestones":    MilestonesHandler,
	}
	for name, make := range handlers {
		req := h1JSONRequest(t, http.MethodGet, "/api/x/999999999", "")
		h1AllPathKeys(req, "999999999")
		req = req.WithContext(withCaller(req.Context(), *caller))
		rec := httptest.NewRecorder()
		make(pool)(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s missing project = %d, want 404 %s", name, rec.Code, rec.Body.String())
		}
		// Two legitimate 404 shapes: the gateError contract
		// ("Record not found.") and pre-existing explicit checks
		// ("No query results for model ...").
		body := rec.Body.String()
		if !strings.Contains(body, "not found.") && !strings.Contains(body, "No query results") {
			t.Fatalf("%s missing project body = %s, want a not-found message", name, body)
		}
	}
}
