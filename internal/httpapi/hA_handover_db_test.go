package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestHAHandover(t *testing.T) {
	pool := hAPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 910011, "user", "ha-ho-owner@example.test", "hA HO Owner")
	pmUser := hAMkUser(t, pool, 910012, "project_manager", "ha-ho-pm@example.test", "hA HO PM")
	kontraktorUser := hAMkUser(t, pool, 910013, "kontraktor", "ha-ho-kontra@example.test", "hA HO Kontra")
	stranger := hAMkUser(t, pool, 910014, "user", "ha-ho-stranger@example.test", "hA HO Stranger")
	t.Cleanup(func() { hACleanupUsers(t, pool) })

	pmProfile := pmUser.id + 100000
	kontraktorProfile := kontraktorUser.id + 100000
	hAMkProject(t, pool, 911011, owner.id, "hA handover project", "in_progress", "both", 800000000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id=$1, selected_kontraktor_id=$2, needed_phases='["design","construction"]'::jsonb, completed_phases='["design"]'::jsonb WHERE id=911011`, pmProfile, kontraktorProfile); err != nil {
		t.Fatal(err)
	}

	// --- InitiateWalkthrough ---
	rec := hACall(t, InitiateWalkthroughHandler(pool), http.MethodPost, "/api/projects/911011/initiate-walkthrough", `{}`, nil, "911011")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("walkthrough unauth = %d, want 401", rec.Code)
	}
	rec = hACallWithPaths(t, InitiateWalkthroughHandler(pool), http.MethodPost, "/api/x/abc", `{}`, &pmUser, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("walkthrough bad-id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, InitiateWalkthroughHandler(pool), http.MethodPost, "/api/projects/999999999/initiate-walkthrough", `{}`, &pmUser, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("walkthrough missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// forbidden: owner is not PM
	rec = hACall(t, InitiateWalkthroughHandler(pool), http.MethodPost, "/api/projects/911011/initiate-walkthrough", `{}`, &owner, "911011")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("walkthrough owner forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Only the assigned PM can initiate the final walkthrough." {
		t.Fatalf("walkthrough forbidden message = %q", got)
	}
	rec = hACall(t, InitiateWalkthroughHandler(pool), http.MethodPost, "/api/projects/911011/initiate-walkthrough", `{}`, &stranger, "911011")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("walkthrough stranger forbidden = %d, want 403", rec.Code)
	}
	// happy: assigned PM
	rec = hACall(t, InitiateWalkthroughHandler(pool), http.MethodPost, "/api/projects/911011/initiate-walkthrough", `{}`, &pmUser, "911011")
	if rec.Code != http.StatusOK {
		t.Fatalf("walkthrough ok = %d %s", rec.Code, rec.Body.String())
	}
	var st, walkStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text, walkthrough_status::text FROM projects WHERE id=911011`).Scan(&st, &walkStatus)
	if st != "completed_build" || walkStatus != "in_progress" {
		t.Fatalf("walkthrough row = %q/%q, want completed_build/in_progress", st, walkStatus)
	}

	// --- PhaseHandoverApprove ---
	rec = hACall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/api/projects/911011/handover/approve", `{"phase":"construction"}`, nil, "911011")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("handover approve unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/api/x/abc", `{"phase":"construction"}`, &pmUser, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("handover approve bad-id = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/api/projects/911011/handover/approve", `{"phase":"construction"}`, &owner, "911011")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("handover approve owner forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the assigned PM can approve handovers." {
		t.Fatalf("handover approve forbidden message = %q", got)
	}
	rec = hACall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/api/projects/911011/handover/approve", `{}`, &pmUser, "911011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("handover approve invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/api/projects/911011/handover/approve", `{"phase":"bogus"}`, &pmUser, "911011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("handover approve bad-phase = %d, want 422", rec.Code)
	}
	// happy: PM approves construction
	rec = hACall(t, PhaseHandoverApproveHandler(pool), http.MethodPost, "/api/projects/911011/handover/approve", `{"phase":"construction"}`, &pmUser, "911011")
	if rec.Code != http.StatusOK {
		t.Fatalf("handover approve ok = %d %s", rec.Code, rec.Body.String())
	}
	// approve appends construction to completed_phases (hand literal sorted JSON)
	var completed string
	_ = pool.QueryRow(ctx, `SELECT completed_phases::text FROM projects WHERE id=911011`).Scan(&completed)
	if completed != `["construction", "design"]` && completed != `["design", "construction"]` {
		t.Fatalf("completed_phases = %q, want [design construction]", completed)
	}

	// --- PhaseHandoverRevision ---
	rec = hACall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/api/projects/911011/handover/reject", `{"phase":"build","notes":"hA fix"}`, nil, "911011")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("handover reject unauth = %d", rec.Code)
	}
	rec = hACall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/api/projects/911011/handover/reject", `{"phase":"build","notes":"hA fix"}`, &owner, "911011")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("handover reject owner forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized." {
		t.Fatalf("handover reject forbidden message = %q", got)
	}
	rec = hACall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/api/projects/911011/handover/reject", `{}`, &pmUser, "911011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("handover reject invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// seed a handover stamp so reject clears it
	if _, err := pool.Exec(ctx, `UPDATE projects SET construction_handover_submitted_at = now() WHERE id=911011`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, PhaseHandoverRevisionHandler(pool), http.MethodPost, "/api/projects/911011/handover/reject", `{"phase":"build","notes":"hA fix paint"}`, &pmUser, "911011")
	if rec.Code != http.StatusOK {
		t.Fatalf("handover reject ok = %d %s", rec.Code, rec.Body.String())
	}
	var clearedStamp *string
	var handoverNotes *string
	_ = pool.QueryRow(ctx, `SELECT construction_handover_submitted_at::text, construction_handover_notes FROM projects WHERE id=911011`).Scan(&clearedStamp, &handoverNotes)
	if clearedStamp != nil || handoverNotes == nil || *handoverNotes != "hA fix paint" {
		t.Fatalf("handover reject row = %v/%v, want NULL/hA fix paint", clearedStamp, handoverNotes)
	}

	// --- OwnerAccept ---
	// unauth / bad-id / missing
	rec = hACall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/api/projects/911011/owner-accept", `{}`, nil, "911011")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("owner-accept unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/api/x/abc", `{}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("owner-accept bad-id = %d %s", rec.Code, rec.Body.String())
	}
	// forbidden: PM cannot accept
	rec = hACall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/api/projects/911011/owner-accept", `{}`, &pmUser, "911011")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("owner-accept pm forbidden = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Only the project Owner can accept the building." {
		t.Fatalf("owner-accept forbidden message = %q", got)
	}
	// validation: bad rating
	rec = hACall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/api/projects/911011/owner-accept", `{"rating":99}`, &owner, "911011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("owner-accept invalid rating = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// blocked by open snag
	if _, err := pool.Exec(ctx, `INSERT INTO project_snag_items (project_id, title, status, reported_by) VALUES (911011,'hA snag','open',$1)`, owner.id); err != nil {
		t.Fatalf("snag seed: %v", err)
	}
	rec = hACall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/api/projects/911011/owner-accept", `{}`, &owner, "911011")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("owner-accept snag blocked = %d, want 422 snag %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Cannot accept project with unaccepted snag items." {
		t.Fatalf("owner-accept snag message = %q", got)
	}
	if _, err := pool.Exec(ctx, `UPDATE project_snag_items SET status='accepted' WHERE project_id=911011`); err != nil {
		t.Fatal(err)
	}
	// blocked by finalize: needs completed==needed and SLF for new_build
	rec = hACall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/api/projects/911011/owner-accept", `{}`, &owner, "911011")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("owner-accept finalize blocked = %d, want 500 %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Failed to finalize project. Check SLF and Phase requirements." {
		t.Fatalf("owner-accept finalize message = %q", got)
	}
	// make finalize pass: completed=needed, SLF stamped, no selected architect needed for rating-less path
	if _, err := pool.Exec(ctx, `UPDATE projects SET needed_phases='["construction"]'::jsonb, completed_phases='["construction"]'::jsonb, slf_verified_at=now(), project_category='renovation' WHERE id=911011`); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, OwnerAcceptProjectHandler(pool), http.MethodPost, "/api/projects/911011/owner-accept", `{"rating":5,"review":"hA great handover"}`, &owner, "911011")
	if rec.Code != http.StatusOK {
		t.Fatalf("owner-accept ok = %d %s", rec.Code, rec.Body.String())
	}
	var finalStatus, walkFinal string
	var warrantyDays *int
	_ = pool.QueryRow(ctx, `SELECT status::text, walkthrough_status::text, (warranty_end_at::date - warranty_start_at::date) FROM projects WHERE id=911011`).Scan(&finalStatus, &walkFinal, &warrantyDays)
	if finalStatus != "completed" || walkFinal != "completed" {
		t.Fatalf("owner-accept row = %q/%q, want completed/completed", finalStatus, walkFinal)
	}
	if warrantyDays == nil || *warrantyDays != 180 {
		t.Fatalf("warranty window = %v, want 180 days", warrantyDays)
	}

	_, _ = pool.Exec(context.Background(), `DELETE FROM project_snag_items WHERE project_id=911011`)
	hACleanupUsers(t, pool)
	hAAssertNoLeftovers(t, pool)
}
