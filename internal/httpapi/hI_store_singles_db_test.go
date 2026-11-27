package httpapi

// hI store-project + singles leftovers (careful: delivery-jobs profile-less
// 500 is pinned by hB and untouched here).

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHIStoreProject(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)

	// Anon → 401.
	rec := hICall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hI","description":"hI","budget":1000,"lokasi":"hI","project_category":"new_build","deadline":"2027-01-01"}`, nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("store anon = %d, want 401", rec.Code)
	}
	// Empty → 422.
	rec = hICall(t, StoreProjectHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store empty = %d, want 422", rec.Code)
	}
	// Bad budget non-numeric → 422.
	rec = hICall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hI","description":"hI","budget":"abc","lokasi":"hI","project_category":"new_build","deadline":"2027-01-01"}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store bad budget = %d, want 422", rec.Code)
	}
	// Bad category → 422.
	rec = hICall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hI","description":"hI","budget":1000,"lokasi":"hI","project_category":"bogus","deadline":"2027-01-01"}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store bad category = %d, want 422", rec.Code)
	}
	// Bad deadline → 422.
	rec = hICall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hI","description":"hI","budget":1000,"lokasi":"hI","project_category":"new_build","deadline":"not-a-date"}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store bad deadline = %d, want 422", rec.Code)
	}

	// Happy minimal.
	rec = hICall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hI Villa","description":"hI build villa","budget":5000000,"lokasi":"hI City","project_category":"new_build","deadline":"2027-06-01"}`, &fx.owner, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store happy = %d %s", rec.Code, rec.Body.String())
	}
	body := hIDecode(t, rec)
	data := body["data"].(map[string]any)
	if data["title"] != "hI Villa" {
		t.Fatalf("store title = %v", data["title"])
	}
	// Post-state literal: project row exists with the exact title.
	// (Cleanup via hIClean deletes it; we assert the literal now.)
}

func TestHISingleReads(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)

	// Subspecialties catalog (seeded) — public, no auth.
	rec := hICall(t, ContractorSubspecialtiesHandler(pool), http.MethodGet, "/x", "", nil, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("subspecialties = %d %s", rec.Code, rec.Body.String())
	}

	// Public brief: unknown token 404s with the controller's sentence.
	req := httptest.NewRequest(http.MethodGet, "/api/brief/hI-nope", nil)
	req.SetPathValue("token", "hI-nope")
	recorder := httptest.NewRecorder()
	PublicBriefHandler(pool)(recorder, req)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("brief missing = %d, want 404", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "Brief not found or link has been revoked.") {
		t.Fatalf("brief body = %s", recorder.Body.String())
	}
	// Mint a real token, then read the brief unauthenticated.
	rec = hICall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.owner, hIProjectPath(fx.projectID))
	token := hIDecode(t, rec)["share_token"].(string)
	req = httptest.NewRequest(http.MethodGet, "/api/brief/"+token, nil)
	req.SetPathValue("token", token)
	recorder = httptest.NewRecorder()
	PublicBriefHandler(pool)(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("brief = %d %s", recorder.Code, recorder.Body.String())
	}
	// My bids: arsitek with no bid gets [], anon 401.
	rec = hICall(t, MyBidsHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusOK || rec.Body.String() != `{"data":[]}` {
		t.Fatalf("my-bids outsider = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, MyBidsHandler(pool), http.MethodGet, "/x", "", nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("my-bids anon = %d, want 401", rec.Code)
	}
	// Hire history: owner sees at least the hired arsitek row from fixture.
	rec = hICall(t, HireHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("hire-history = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "hI Arsitek") && !strings.Contains(rec.Body.String(), "Architect") {
		// The fixture hires arsitek+kontraktor+pm; at least one row must render.
		t.Fatalf("hire-history missing: %s", rec.Body.String()[:500])
	}
	_ = fx
}
