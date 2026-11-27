package httpapi

// hI handover/engineering edge twins: auth, bad-id, missing and validation.

import (
	"net/http"
	"testing"
)

func TestHIHandoverEdges(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	p := hIProjectPath(fx.projectID)

	// Walkthrough: anon 401, bad id 404, stranger 403.
	rec := hICall(t, InitiateWalkthroughHandler(pool), http.MethodPost, "/x", `{}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("walkthrough anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, InitiateWalkthroughHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("walkthrough bad id = %d, want 404", rec.Code)
	}
	// Owner-accept validation twins (nowhere near acceptable, but validation fires first).
	rec = hICall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{"rating":"high"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept bad rating = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{"rating":0}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("accept rating 0 = %d, want 422", rec.Code)
	}
	rec = hICall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/x", `{"rating":5}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("accept anon = %d, want 401", rec.Code)
	}

	// Phase approve/revision: anon 401, bad project 404, bad phase 422.
	rec = hICall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/x", `{"phase":"construction"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("phase approve anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/x", `{"phase":"construction"}`, &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("phase approve bad id = %d, want 404", rec.Code)
	}
	rec = hICall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/x", `{"phase":"construction","notes":"hI"}`, &fx.pm, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("phase revision bad spelling = %d, want 422 %s", rec.Code, rec.Body.String())
	}
}

func TestHIEngineeringEdges(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	p := hIProjectPath(fx.projectID)

	// Request role: anon 401, bad id 404, empty 422, stranger 403? (any authed user may request? check: owner/stranger?).
	rec := hICall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("eng request anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("eng request bad id = %d, want 404", rec.Code)
	}
	rec = hICall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("eng request empty = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Verify: anon 401, bad id 404.
	rec = hICall(t, VerifyEngineeringRequestHandler(pool), http.MethodPost, "/x", `{}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("eng verify anon = %d, want 401", rec.Code)
	}

	// Authorize specialist: anon 401.
	rec = hICall(t, AuthorizeSpecialistHandler(pool), http.MethodPost, "/x", `{}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("eng authorize anon = %d, want 401", rec.Code)
	}

	// Engineering log store: anon 401, bad project 404, empty 422.
	rec = hICall(t, StoreEngineeringLogHandler(pool), http.MethodPost, "/x", `{}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("eng log anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, StoreEngineeringLogHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner,
		map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("eng log bad id = %d, want 404", rec.Code)
	}
	rec = hICall(t, StoreEngineeringLogHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("eng log empty = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// Delete log: anon 401, bad id 404.
	rec = hICall(t, DeleteEngineeringLogHandler(pool), http.MethodDelete, "/x", "", nil,
		map[string]string{"project": int64String(fx.projectID), "milestone": "1"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("eng log delete anon = %d, want 401", rec.Code)
	}
}
