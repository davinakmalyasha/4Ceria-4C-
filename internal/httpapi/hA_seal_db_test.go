package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestHASeal(t *testing.T) {
	pool := hAPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 910021, "user", "ha-seal-owner@example.test", "hA Seal Owner")
	arsitekUser := hAMkUser(t, pool, 910022, "arsitek", "ha-seal-ars@example.test", "hA Seal Ars")
	kontraktorUser := hAMkUser(t, pool, 910023, "kontraktor", "ha-seal-kontra@example.test", "hA Seal Kontra")
	interiorUser := hAMkUser(t, pool, 910024, "interior", "ha-seal-int@example.test", "hA Seal Int")
	notarisUser := hAMkUser(t, pool, 910025, "notaris", "ha-seal-not@example.test", "hA Seal Not")
	structUser := hAMkUser(t, pool, 910027, "structural", "ha-seal-struct@example.test", "hA Seal Struct")
	stranger := hAMkUser(t, pool, 910026, "user", "ha-seal-stranger@example.test", "hA Seal Stranger")
	t.Cleanup(func() { hACleanupUsers(t, pool) })

	arsitekProfile := arsitekUser.id + 100000
	kontraktorProfile := kontraktorUser.id + 100000
	interiorProfile := interiorUser.id + 100000
	notarisProfile := notarisUser.id + 100000

	hAMkProject(t, pool, 911021, owner.id, "hA seal project", "in_progress", "both", 900000000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1, selected_kontraktor_id=$2, selected_interior_id=$3, selected_notaris_id=$4 WHERE id=911021`,
		arsitekProfile, kontraktorProfile, interiorProfile, notarisProfile); err != nil {
		t.Fatal(err)
	}

	// --- SealDesign guards ---
	rec := hACall(t, SealDesignHandler(pool), http.MethodPost, "/api/projects/911021/seal-design", `{}`, nil, "911021")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("seal-design unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, SealDesignHandler(pool), http.MethodPost, "/api/x/abc", `{}`, &arsitekUser, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("seal-design bad-id = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, SealDesignHandler(pool), http.MethodPost, "/api/projects/999999999/seal-design", `{}`, &arsitekUser, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("seal-design missing = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, SealDesignHandler(pool), http.MethodPost, "/api/projects/911021/seal-design", `{}`, &stranger, "911021")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("seal-design stranger = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the hired architect can seal the design." {
		t.Fatalf("seal-design forbidden message = %q", got)
	}
	// requires_structural gate
	if _, err := pool.Exec(ctx, `UPDATE projects SET requires_structural=true WHERE id=911021`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, SealDesignHandler(pool), http.MethodPost, "/api/projects/911021/seal-design", `{}`, &arsitekUser, "911021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("seal-design requires_structural = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "A Structural Engineer is legally required but has not been hired yet." {
		t.Fatalf("seal-design requires message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET requires_structural=false WHERE id=911021`); err != nil {
		t.Fatal(err)
	}
	// hired-specialist deliverables gate: hire structural with no docs
	if _, err := pool.Exec(ctx, `UPDATE projects SET structural_id=$1 WHERE id=911021`, structUser.id+100000); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, SealDesignHandler(pool), http.MethodPost, "/api/projects/911021/seal-design", `{}`, &arsitekUser, "911021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("seal-design specialist docs = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Structural Engineer must upload their deliverables before you can request PM approval." {
		t.Fatalf("seal-design docs message = %q", got)
	}
	// satisfy with a structural_calc doc, clear structural hire for the happy path
	if _, err := pool.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, category, file_type, status) VALUES (911021,$1,'hA struct.pdf','hA/struct.pdf','structural_calc','pdf','verified')`, owner.id); err != nil {
		t.Fatalf("doc seed: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET structural_id=NULL, mep_id=NULL, selected_interior_id=NULL WHERE id=911021`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, SealDesignHandler(pool), http.MethodPost, "/api/projects/911021/seal-design", `{}`, &arsitekUser, "911021")
	if rec.Code != http.StatusOK {
		t.Fatalf("seal-design ok = %d %s", rec.Code, rec.Body.String())
	}
	var designStamp *string
	_ = pool.QueryRow(ctx, `SELECT design_handover_submitted_at::text FROM projects WHERE id=911021`).Scan(&designStamp)
	if designStamp == nil {
		t.Fatalf("seal-design stamp missing")
	}
	// restore hires for the remaining seals
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_kontraktor_id=$1, selected_interior_id=$2, selected_notaris_id=$3 WHERE id=911021`, kontraktorProfile, interiorProfile, notarisProfile); err != nil {
		t.Fatal(err)
	}

	// --- SealConstruction / Interior / Legal guards + happy ---
	// construction: forbidden for stranger, incomplete blocks, happy when no milestones
	rec = hACall(t, SealConstructionHandler(pool), http.MethodPost, "/api/projects/911021/seal-construction", `{}`, nil, "911021")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("seal-construction unauth = %d", rec.Code)
	}
	rec = hACall(t, SealConstructionHandler(pool), http.MethodPost, "/api/projects/911021/seal-construction", `{}`, &stranger, "911021")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("seal-construction forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the hired contractor can seal construction." {
		t.Fatalf("seal-construction forbidden message = %q", got)
	}
	// incomplete: unapproved construction milestone blocks
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (project_id, title, phase_context, is_completed, approval_status) VALUES (911021,'hA build step','construction',false,'pending')`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, SealConstructionHandler(pool), http.MethodPost, "/api/projects/911021/seal-construction", `{}`, &kontraktorUser, "911021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("seal-construction incomplete = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "All construction milestones must be completed before sealing." {
		t.Fatalf("seal-construction incomplete message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE project_milestones SET is_completed=true, approval_status='approved' WHERE project_id=911021 AND phase_context='construction'`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, SealConstructionHandler(pool), http.MethodPost, "/api/projects/911021/seal-construction", `{}`, &kontraktorUser, "911021")
	if rec.Code != http.StatusOK {
		t.Fatalf("seal-construction ok = %d %s", rec.Code, rec.Body.String())
	}
	var constructionStamp *string
	_ = pool.QueryRow(ctx, `SELECT construction_handover_submitted_at::text FROM projects WHERE id=911021`).Scan(&constructionStamp)
	if constructionStamp == nil {
		t.Fatalf("seal-construction stamp missing")
	}

	// interior: incomplete then happy
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (project_id, title, phase_context, is_completed, approval_status) VALUES (911021,'hA interior step','interior',false,'pending')`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, SealInteriorHandler(pool), http.MethodPost, "/api/projects/911021/seal-interior", `{}`, &interiorUser, "911021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("seal-interior incomplete = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "All interior design milestones must be completed and approved before sealing." {
		t.Fatalf("seal-interior incomplete message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE project_milestones SET is_completed=true, approval_status='approved' WHERE project_id=911021 AND phase_context='interior'`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, SealInteriorHandler(pool), http.MethodPost, "/api/projects/911021/seal-interior", `{}`, &interiorUser, "911021")
	if rec.Code != http.StatusOK {
		t.Fatalf("seal-interior ok = %d %s", rec.Code, rec.Body.String())
	}
	var interiorStamp *string
	_ = pool.QueryRow(ctx, `SELECT interior_handover_submitted_at::text FROM projects WHERE id=911021`).Scan(&interiorStamp)
	if interiorStamp == nil {
		t.Fatalf("seal-interior stamp missing")
	}
	rec = hACall(t, SealInteriorHandler(pool), http.MethodPost, "/api/projects/911021/seal-interior", `{}`, &stranger, "911021")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("seal-interior forbidden = %d", rec.Code)
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the hired interior designer can seal." {
		t.Fatalf("seal-interior forbidden message = %q", got)
	}

	// legal: drafting milestone blocks, then happy
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (project_id, title, phase_context, is_completed, approval_status) VALUES (911021,'hA legal step','legal',false,'drafting')`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, SealLegalHandler(pool), http.MethodPost, "/api/projects/911021/seal-legal", `{}`, &notarisUser, "911021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("seal-legal incomplete = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "All legal milestones must be completed (uploaded) and not pending revisions before submitting for review." {
		t.Fatalf("seal-legal incomplete message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE project_milestones SET is_completed=true, approval_status='approved' WHERE project_id=911021 AND phase_context='legal'`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, SealLegalHandler(pool), http.MethodPost, "/api/projects/911021/seal-legal", `{}`, &notarisUser, "911021")
	if rec.Code != http.StatusOK {
		t.Fatalf("seal-legal ok = %d %s", rec.Code, rec.Body.String())
	}
	var legalStamp *string
	_ = pool.QueryRow(ctx, `SELECT legal_handover_submitted_at::text FROM projects WHERE id=911021`).Scan(&legalStamp)
	if legalStamp == nil {
		t.Fatalf("seal-legal stamp missing")
	}
	// bad-id for one seal
	rec = hACallWithPaths(t, SealLegalHandler(pool), http.MethodPost, "/api/x/abc", `{}`, &notarisUser, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("seal-legal bad-id = %d", rec.Code)
	}

	// --- AuthorizePhase ---
	rec = hACall(t, AuthorizePhaseHandler(pool), http.MethodPost, "/api/projects/911021/authorize-phase", `{"phase":"design","authorize":true}`, nil, "911021")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("authorize unauth = %d", rec.Code)
	}
	rec = hACall(t, AuthorizePhaseHandler(pool), http.MethodPost, "/api/projects/911021/authorize-phase", `{"phase":"design","authorize":true}`, &stranger, "911021")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("authorize forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the Project Owner or PM can authorize phases." {
		t.Fatalf("authorize forbidden message = %q", got)
	}
	rec = hACall(t, AuthorizePhaseHandler(pool), http.MethodPost, "/api/projects/911021/authorize-phase", `{}`, &owner, "911021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("authorize invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, AuthorizePhaseHandler(pool), http.MethodPost, "/api/projects/911021/authorize-phase", `{"phase":"bogus","authorize":true}`, &owner, "911021")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("authorize bad-phase = %d, want 422", rec.Code)
	}
	rec = hACall(t, AuthorizePhaseHandler(pool), http.MethodPost, "/api/projects/911021/authorize-phase", `{"phase":"design","authorize":true}`, &owner, "911021")
	if rec.Code != http.StatusOK {
		t.Fatalf("authorize ok = %d %s", rec.Code, rec.Body.String())
	}
	var designAuth *string
	_ = pool.QueryRow(ctx, `SELECT design_authorized_at::text FROM projects WHERE id=911021`).Scan(&designAuth)
	if designAuth == nil {
		t.Fatalf("authorize design stamp missing")
	}
	rec = hACall(t, AuthorizePhaseHandler(pool), http.MethodPost, "/api/projects/911021/authorize-phase", `{"phase":"build","authorize":false}`, &owner, "911021")
	if rec.Code != http.StatusOK {
		t.Fatalf("authorize revoke = %d %s", rec.Code, rec.Body.String())
	}
	var buildAuth *string
	_ = pool.QueryRow(ctx, `SELECT construction_authorized_at::text FROM projects WHERE id=911021`).Scan(&buildAuth)
	if buildAuth != nil {
		t.Fatalf("authorize revoke stamp = %q, want NULL", *buildAuth)
	}
	rec = hACallWithPaths(t, AuthorizePhaseHandler(pool), http.MethodPost, "/api/x/abc", `{"phase":"design","authorize":true}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("authorize bad-id = %d", rec.Code)
	}

	hACleanupUsers(t, pool)
	hAAssertNoLeftovers(t, pool)
}

// Unreachable: seal/handover/authorize have no mailer/VAPID path. The only
// non-DB side effect is the vault file for signatures (covered in hA_sign).
// Fault-injection-only branches (pool.Begin failure, tx.Commit failure) are
// documented here and not faked.
