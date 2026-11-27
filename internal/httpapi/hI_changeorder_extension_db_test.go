package httpapi

// hI change orders + extensions leftovers.

import (
	"context"
	"net/http"
	"testing"
)

func hIChangePaths(projectID, orderID int64) map[string]string {
	return map[string]string{"project": int64String(projectID), "changeOrder": int64String(orderID)}
}

func TestHIChangeOrders(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	var milestoneID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, created_at, updated_at)
		VALUES ($1, 'hI MS', now(), now()) RETURNING id`, fx.projectID).Scan(&milestoneID); err != nil {
		t.Fatalf("milestone: %v", err)
	}

	store := `{"title":"hI CO","description":"hI extra","cost_impact":250000,"time_impact_days":3,"milestone_id":` + int64String(milestoneID) + `}`
	rec := hICall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", store, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("co store = %d %s", rec.Code, rec.Body.String())
	}
	coID := int64(hIDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rec = hICall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", store, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("co stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", `{"title":""}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("co empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", "", &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("co empty2 = %d, want 422", rec.Code)
	}
	rec = hICall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", `{"title":"hI","description":"hI","cost_impact":1}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("co anon = %d, want 401", rec.Code)
	}

	// Index merges change orders with billable addendums.
	rec = hICall(t, ChangeOrdersIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if body := hIDecode(t, rec); len(body["data"].([]any)) != 1 {
		t.Fatalf("co index = %v", body)
	}
	rec = hICall(t, ChangeOrdersIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("co index stranger = %d, want 403", rec.Code)
	}

	cop := hIChangePaths(fx.projectID, coID)
	// PM review: forbidden for non-PM, validation, then approve.
	rec = hICall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"action":"approve","pm_notes":"hI ok"}`, &fx.owner, cop)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("pm-review owner = %d, want 403", rec.Code)
	}
	rec = hICall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{}`, &fx.pm, cop)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pm-review empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"action":"approve","pm_notes":"hI ok"}`, &fx.pm, cop)
	if rec.Code != http.StatusOK {
		t.Fatalf("pm-review = %d %s", rec.Code, rec.Body.String())
	}

	// Owner decide: forbidden for non-owner, then approve mints termin.
	rec = hICall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.kontraktor, cop)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("owner-decide kontraktor = %d, want 403", rec.Code)
	}
	rec = hICall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve","owner_notes":"hI go"}`, &fx.owner, cop)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner-decide = %d %s", rec.Code, rec.Body.String())
	}
	var terminAmount string
	if err := pool.QueryRow(ctx, `SELECT amount::text FROM project_payment_termins WHERE change_order_id = $1`,
		coID).Scan(&terminAmount); err != nil || terminAmount != "250000.00" {
		t.Fatalf("termin = %q, %v", terminAmount, err)
	}
	// Bad change-order id → 404.
	rec = hICall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "changeOrder": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("co bad id = %d, want 404", rec.Code)
	}
	// Missing → 404.
	rec = hICall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "changeOrder": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("co missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
}

func TestHIExtensions(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	rec := hICall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI rain","description":"hI wet","days_requested":7}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext store = %d %s", rec.Code, rec.Body.String())
	}
	extID := int64(hIDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rec = hICall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI x"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("ext stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, StoreExtensionHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("ext empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI","days_requested":7}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext minimal = %d %s", rec.Code, rec.Body.String())
	}
	// Validation twins.
	rec = hICall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":123,"days_requested":7}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("ext reason num = %d, want 422", rec.Code)
	}
	rec = hICall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hI","days_requested":0}`, &fx.kontraktor, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("ext days zero = %d, want 422", rec.Code)
	}

	rec = hICall(t, ExtensionsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if body := hIDecode(t, rec); len(body["data"].([]any)) < 1 {
		t.Fatalf("ext index = %v", body)
	}

	ep := map[string]string{"project": int64String(fx.projectID), "extension": int64String(extID)}
	// PM review by non-PM refused; validation; then approve.
	rec = hICall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"status":"pm_reviewed"}`, &fx.owner, ep)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("ext pm-review owner = %d, want 403", rec.Code)
	}
	rec = hICall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{}`, &fx.pm, ep)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("ext pm-review empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/pm-review",
		`{"status":"pm_reviewed","pm_notes":"hI ok"}`, &fx.pm, ep)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext pm-review = %d %s", rec.Code, rec.Body.String())
	}
	// Owner decide: non-owner refused; approve pushes deadline.
	rec = hICall(t, ExtensionDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"status":"approved"}`, &fx.kontraktor, ep)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("ext owner-decide kontraktor = %d, want 403", rec.Code)
	}
	var beforeDeadline *string
	_ = pool.QueryRow(ctx, `SELECT deadline::text FROM projects WHERE id = $1`, fx.projectID).Scan(&beforeDeadline)
	rec = hICall(t, ExtensionDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"status":"approved","owner_notes":"hI go"}`, &fx.owner, ep)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext owner-decide = %d %s", rec.Code, rec.Body.String())
	}
	var deadline string
	if err := pool.QueryRow(ctx, `SELECT deadline::text FROM projects WHERE id = $1`, fx.projectID).Scan(&deadline); err != nil {
		t.Fatalf("deadline: %v", err)
	}
	if beforeDeadline != nil && deadline <= *beforeDeadline {
		t.Fatalf("deadline not pushed: %s was %s", deadline, *beforeDeadline)
	}
}
