package httpapi

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestHAPermitWarranty(t *testing.T) {
	pool := hAPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 910001, "user", "ha-owner@example.test", "hA Owner")
	kontraktorUser := hAMkUser(t, pool, 910002, "kontraktor", "ha-kontra@example.test", "hA Kontraktor")
	stranger := hAMkUser(t, pool, 910003, "user", "ha-stranger@example.test", "hA Stranger")
	t.Cleanup(func() { hACleanupUsers(t, pool) })

	hAMkProject(t, pool, 911001, owner.id, "hA permit project", "open", "both", 500000000)
	// fresh project for warranty-without-period case
	hAMkProject(t, pool, 911002, owner.id, "hA warranty cold project", "open", "both", 500000000)

	// --- VerifyPBG / VerifySLF ---
	// unauthenticated
	rec := hACall(t, VerifyPBGHandler(pool), http.MethodPost, "/api/projects/911001/verify-pbg", `{}`, nil, "911001")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("pbg unauth = %d, want 401 %s", rec.Code, rec.Body.String())
	}
	// bad id
	rec = hACallWithPaths(t, VerifyPBGHandler(pool), http.MethodPost, "/api/x/abc", `{}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("pbg bad-id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// missing row
	rec = hACall(t, VerifyPBGHandler(pool), http.MethodPost, "/api/projects/999999999/verify-pbg", `{}`, &owner, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("pbg missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// forbidden (stranger, not owner/PM)
	rec = hACall(t, VerifyPBGHandler(pool), http.MethodPost, "/api/projects/911001/verify-pbg", `{}`, &stranger, "911001")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("pbg forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Only the Project Owner or assigned Project Manager can verify PBG compliance." {
		t.Fatalf("pbg forbidden message = %q", got)
	}
	rec = hACall(t, VerifySLFHandler(pool), http.MethodPost, "/api/projects/911001/verify-slf", `{}`, &stranger, "911001")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("slf forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Only the Project Owner or assigned Project Manager can verify SLF compliance." {
		t.Fatalf("slf forbidden message = %q", got)
	}
	// PBG blocked: brief not approved
	rec = hACall(t, VerifyPBGHandler(pool), http.MethodPost, "/api/projects/911001/verify-pbg", `{}`, &owner, "911001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pbg blocked = %d, want 422 PBG %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Regulatory Block: PBG verification is locked until the Architectural Construction Brief (DED) is approved and locked." {
		t.Fatalf("pbg blocked message = %q", got)
	}
	// approve brief then PBG succeeds
	if _, err := pool.Exec(ctx, `UPDATE projects SET construction_brief_status='approved' WHERE id=911001`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, VerifyPBGHandler(pool), http.MethodPost, "/api/projects/911001/verify-pbg", `{}`, &owner, "911001")
	if rec.Code != http.StatusOK {
		t.Fatalf("pbg ok = %d %s", rec.Code, rec.Body.String())
	}
	var pbgAt *string
	_ = pool.QueryRow(ctx, `SELECT pbg_verified_at::text FROM projects WHERE id=911001`).Scan(&pbgAt)
	if pbgAt == nil {
		t.Errorf("pbg stamp missing")
	}
	// SLF happy path (no pre-gate)
	rec = hACall(t, VerifySLFHandler(pool), http.MethodPost, "/api/projects/911001/verify-slf", `{}`, &owner, "911001")
	if rec.Code != http.StatusOK {
		t.Fatalf("slf ok = %d %s", rec.Code, rec.Body.String())
	}
	// bad-id / missing for SLF
	rec = hACallWithPaths(t, VerifySLFHandler(pool), http.MethodPost, "/api/x/abc", `{}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("slf bad-id = %d, want 404", rec.Code)
	}

	// --- Warranty ---
	// unauth
	rec = hACall(t, WarrantyClaimsIndexHandler(pool), http.MethodGet, "/api/projects/911001/warranty-claims", "", nil, "911001")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("warranty index unauth = %d, want 401", rec.Code)
	}
	// bad id
	rec = hACallWithPaths(t, WarrantyClaimsIndexHandler(pool), http.MethodGet, "/api/x/abc", "", &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("warranty bad-id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// missing row
	rec = hACall(t, WarrantyClaimsIndexHandler(pool), http.MethodGet, "/api/projects/999999999/warranty-claims", "", &owner, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("warranty missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// forbidden (stranger not participant)
	rec = hACall(t, WarrantyClaimsIndexHandler(pool), http.MethodGet, "/api/projects/911001/warranty-claims", "", &stranger, "911001")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("warranty forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	// index happy (empty 200)
	rec = hACall(t, WarrantyClaimsIndexHandler(pool), http.MethodGet, "/api/projects/911001/warranty-claims", "", &owner, "911001")
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty index = %d %s", rec.Code, rec.Body.String())
	}
	// store without warranty period -> 422 not started
	rec = hACall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/api/projects/911002/warranty-claims", `{"title":"hA leak","description":"d"}`, &owner, "911002")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("warranty cold = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The warranty period has not started yet. Claims can be filed after project handover." {
		t.Fatalf("warranty cold message = %q", got)
	}
	// open warranty window on 911001
	if _, err := pool.Exec(ctx, `UPDATE projects SET warranty_end_at = now() + interval '30 days', selected_kontraktor_id=$1 WHERE id=911001`, kontraktorUser.id+100000); err != nil {
		t.Fatal(err)
	}
	// store forbidden (stranger)
	rec = hACall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/api/projects/911001/warranty-claims", `{"title":"hA leak","description":"d"}`, &stranger, "911001")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("warranty store forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	// store validation
	rec = hACall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/api/projects/911001/warranty-claims", `{"title":""}`, &owner, "911001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("warranty store invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// store happy
	rec = hACall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/api/projects/911001/warranty-claims", `{"title":"hA leak","description":"roof hA leak"}`, &owner, "911001")
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty store = %d %s", rec.Code, rec.Body.String())
	}
	var claimID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_warranty_claims WHERE project_id=911001 AND title='hA leak' ORDER BY id DESC LIMIT 1`).Scan(&claimID)
	if claimID == 0 {
		t.Fatalf("no warranty row")
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM project_warranty_claims WHERE id=$1`, claimID)
	})
	// index now carries reporter
	rec = hACall(t, WarrantyClaimsIndexHandler(pool), http.MethodGet, "/api/projects/911001/warranty-claims", "", &owner, "911001")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "hA leak") {
		t.Fatalf("warranty index after = %d %s", rec.Code, rec.Body.String())
	}
	// update: bad-id, missing, wrong-project, forbidden, validation, happy
	rec = hACallWithPaths(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/api/x/abc/status", `{"status":"fixing"}`, &owner, map[string]string{"project": "911001", "claim": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("warranty upd bad-id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/api/projects/911001/warranty-claims/999999999/status", `{"status":"fixing"}`, &owner, map[string]string{"project": "911001", "claim": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("warranty upd missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/api/projects/911002/warranty-claims/x/status", `{"status":"fixing"}`, &owner, map[string]string{"project": "911002", "claim": itoaTest(claimID)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("warranty upd wrong-project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/api/projects/911001/warranty-claims/x/status", `{"status":"fixing"}`, &stranger, map[string]string{"project": "911001", "claim": itoaTest(claimID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("warranty upd forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/api/projects/911001/warranty-claims/x/status", `{"status":"bogus"}`, &owner, map[string]string{"project": "911001", "claim": itoaTest(claimID)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("warranty upd invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// cost_impact positive by non-owner (kontraktor) -> 403 owner-only
	rec = hACallWithPaths(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/api/projects/911001/warranty-claims/x/status", `{"status":"fixing","cost_impact":50000}`, &kontraktorUser, map[string]string{"project": "911001", "claim": itoaTest(claimID)})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("warranty cost forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Only the project owner can set a cost impact." {
		t.Fatalf("warranty cost message = %q", got)
	}
	// owner happy with cost
	rec = hACallWithPaths(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/api/projects/911001/warranty-claims/x/status", `{"status":"fixing","cost_impact":50000}`, &owner, map[string]string{"project": "911001", "claim": itoaTest(claimID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty upd = %d %s", rec.Code, rec.Body.String())
	}
	var cost string
	_ = pool.QueryRow(ctx, `SELECT cost_impact::text FROM project_warranty_claims WHERE id=$1`, claimID).Scan(&cost)
	if cost != "50000.00" {
		t.Errorf("warranty cost = %q, want 50000.00", cost)
	}
	// resolved stamps resolved_at
	rec = hACallWithPaths(t, UpdateWarrantyClaimHandler(pool), http.MethodPut, "/api/projects/911001/warranty-claims/x/status", `{"status":"resolved"}`, &owner, map[string]string{"project": "911001", "claim": itoaTest(claimID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("warranty resolve = %d %s", rec.Code, rec.Body.String())
	}
	// expired window rejects new claims
	if _, err := pool.Exec(ctx, `UPDATE projects SET warranty_end_at = now() - interval '1 day' WHERE id=911001`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/api/projects/911001/warranty-claims", `{"title":"hA late","description":"d"}`, &owner, "911001")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("warranty expired = %d, want 422 ended %s", rec.Code, rec.Body.String())
	}
	if msg, _ := hADecode(t, rec)["message"].(string); len(msg) < 30 || msg[:29] != "The warranty period ended on " {
		t.Fatalf("warranty expired message = %q, want prefix 'The warranty period ended on '", msg)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET warranty_end_at = now() + interval '30 days' WHERE id=911001`); err != nil {
		t.Fatal(err)
	}

	// store unauth
	rec = hACall(t, StoreWarrantyClaimHandler(pool), http.MethodPost, "/api/projects/911001/warranty-claims", `{"title":"hA x","description":"d"}`, nil, "911001")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("warranty store unauth = %d, want 401", rec.Code)
	}

	_, _ = pool.Exec(context.Background(), `DELETE FROM project_warranty_claims WHERE project_id IN (911001,911002)`)
	hACleanupUsers(t, pool)
	hAAssertNoLeftovers(t, pool)
}
