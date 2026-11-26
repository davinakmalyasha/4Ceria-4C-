package httpapi

// hF workspace edges: mutual termination, fire/resign settlement,
// sticky notes, share tokens, notification preferences, comments,
// brief reads, house answers, room deletion, upload, requirements,
// procurement, stock, histories, disputes and the admin list edges.

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func hFDisputePaths(projectID, disputeID int64) map[string]string {
	return map[string]string{"project": int64String(projectID), "dispute": int64String(disputeID)}
}

func TestHFMutualTerminationEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()
	p := hFProjectPath(fx.projectID)

	// Anonymous gates first: 401 on every verb.
	if rec := hFCall(t, MutualTerminationIndexHandler(pool), http.MethodGet, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("mt index anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x", `{"reason":"hF"}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("mt initiate anon = %d, want 401", rec.Code)
	}

	// Malformed project: binding 404s on index, initiate, respond, escalate.
	bad := map[string]string{"project": "abc"}
	if rec := hFCall(t, MutualTerminationIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("mt index bad = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\Project] abc` {
		t.Fatalf("mt index bad message = %q", got)
	}
	if rec := hFCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x", `{"reason":"hF"}`, &fx.owner, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("mt initiate bad = %d, want 404", rec.Code)
	}
	tpBad := map[string]string{"project": "abc", "termination": "1"}
	if rec := hFCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x", `{"action":"accept"}`, &fx.owner, tpBad); rec.Code != http.StatusNotFound {
		t.Fatalf("mt respond bad project = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, tpBad); rec.Code != http.StatusNotFound {
		t.Fatalf("mt escalate bad project = %d, want 404", rec.Code)
	}

	// Missing project rows also 404, never 500.
	missing := map[string]string{"project": "999999999"}
	if rec := hFCall(t, MutualTerminationIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, missing); rec.Code != http.StatusNotFound {
		t.Fatalf("mt index missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if rec := hFCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x", `{"reason":"hF"}`, &fx.owner, missing); rec.Code != http.StatusNotFound {
		t.Fatalf("mt initiate missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// A cancelled project refuses initiation with the frozen-workspace sentence.
	if _, err := pool.Exec(ctx, `UPDATE projects SET status = 'cancelled' WHERE id = $1`, fx.project3ID); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	rec := hFCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x", `{"reason":"hF late"}`,
		&fx.owner, hFProjectPath(fx.project3ID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt initiate cancelled = %d, want 422", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "Proyek tidak dalam status aktif untuk dibatalkan." {
		t.Fatalf("mt initiate cancelled message = %q", got)
	}

	// Open a request for the validation twins.
	rec = hFCall(t, InitiateMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"reason":"hF split"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("mt initiate = %d %s", rec.Code, rec.Body.String())
	}
	termID := int64(hFDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	tp := map[string]string{"project": int64String(fx.projectID), "termination": int64String(termID)}

	// Invalid action value and non-string resolution notes: 422 twins.
	rec = hFCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x", `{"action":"maybe"}`, &fx.owner, tp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt bad action = %d, want 422", rec.Code)
	}
	rec = hFCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x",
		`{"action":"reject","resolution_notes":123}`, &fx.owner, tp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt bad notes = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Malformed termination id with a valid project: binding 404.
	rec = hFCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x", `{"action":"accept"}`,
		&fx.owner, map[string]string{"project": int64String(fx.projectID), "termination": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("mt bad termination = %d, want 404", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\Project] `+int64String(fx.projectID) {
		t.Fatalf("mt bad termination message = %q", got)
	}

	// Cross-project termination: the row belongs elsewhere → 404 "Not found.".
	rec = hFCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x", `{"action":"accept"}`,
		&fx.owner, map[string]string{"project": int64String(fx.project2ID), "termination": int64String(termID)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("mt cross-project = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != "Not found." {
		t.Fatalf("mt cross-project message = %q", got)
	}

	// Escalate the pending request directly: status gate 422.
	rec = hFCall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x", `{}`, &fx.kontraktor, tp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("mt escalate pending = %d, want 422", rec.Code)
	}

	// Escalate a missing termination: binding 404.
	rec = hFCall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x", `{}`,
		&fx.kontraktor, map[string]string{"project": int64String(fx.projectID), "termination": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("mt escalate missing = %d, want 404", rec.Code)
	}

	// Anonymous respond/escalate: 401.
	if rec := hFCall(t, RespondMutualTerminationHandler(pool), http.MethodPost, "/x", `{"action":"accept"}`, nil, tp); rec.Code != http.StatusUnauthorized {
		t.Fatalf("mt respond anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, EscalateMutualTerminationHandler(pool), http.MethodPost, "/x", `{}`, nil, tp); rec.Code != http.StatusUnauthorized {
		t.Fatalf("mt escalate anon = %d, want 401", rec.Code)
	}
}

func TestHFTerminationEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()
	p := hFProjectPath(fx.projectID)

	// Anonymous fire/resign: 401.
	if rec := hFCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hF"}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("fire anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x", `{"reason":"hF"}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("resign anon = %d, want 401", rec.Code)
	}

	// Bad project id: 404 twins.
	bad := map[string]string{"project": "abc"}
	if rec := hFCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hF"}`, &fx.owner, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("fire bad project = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x", `{"reason":"hF"}`, &fx.kontraktor, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("resign bad project = %d, want 404", rec.Code)
	}

	// Completed project: both verbs refuse with the frozen sentence.
	if _, err := pool.Exec(ctx, `UPDATE projects SET status = 'completed' WHERE id = $1`, fx.project3ID); err != nil {
		t.Fatalf("complete: %v", err)
	}
	p3 := hFProjectPath(fx.project3ID)
	rec := hFCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hF"}`, &fx.owner, p3)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("fire completed = %d, want 422", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "Cannot terminate contracts on a completed project." {
		t.Fatalf("fire completed message = %q", got)
	}
	rec = hFCall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x", `{"reason":"hF"}`, &fx.kontraktor, p3)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("resign completed = %d, want 422", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "Cannot resign from a completed project." {
		t.Fatalf("resign completed message = %q", got)
	}

	// Invalid role spelling and an overlong reason: 422 twins.
	rec = hFCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"wizard","reason":"hF"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("fire wizard = %d, want 422", rec.Code)
	}
	rec = hFCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"`+strings.Repeat("x", 501)+`"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("fire long reason = %d, want 422", rec.Code)
	}

	// Nobody hired in that role: 422 naming the role.
	rec = hFCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"interior","reason":"hF"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("fire empty role = %d, want 422", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "No professional of type interior is currently hired." {
		t.Fatalf("fire empty role message = %q", got)
	}

	// Not-hired callers cannot resign: supplier and owner (role user).
	p2 := hFProjectPath(fx.project2ID)
	rec = hFCall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x", `{"reason":"hF"}`, &fx.supplier, p2)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("resign supplier = %d, want 403", rec.Code)
	}
	if got := hFDecode(t, rec)["message"]; got != "You are not hired for this role on this project." {
		t.Fatalf("resign supplier message = %q", got)
	}
	rec = hFCall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x", `{"reason":"hF"}`, &fx.owner, p2)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("resign owner = %d, want 403 %s", rec.Code, rec.Body.String())
	}

	// A live bid ties the professional to the settlement: fire marks it
	// terminated and docks reliability 77 − 10.
	if _, err := pool.Exec(ctx, `UPDATE kontraktors SET reliability_score = 77 WHERE id = $1`, hFKontraktorProfileID); err != nil {
		t.Fatalf("set reliability: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, status)
		VALUES ($1, 'kontraktor', $2, $3, $3, 'active')`, fx.projectID, fx.kontraktor.id, hFKontraktorProfileID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_payment_termins
		(project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, created_at, updated_at)
		VALUES ($1, 'hF pending', 50, 400000, 0, 400000, 'pending', 'kontraktor', now(), now())`, fx.projectID); err != nil {
		t.Fatalf("termin: %v", err)
	}
	rec = hFCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"kontraktor","reason":"hF cause"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("fire = %d %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != "Contract for kontraktor terminated successfully. Project is reopened for bidding." {
		t.Fatalf("fire message = %q", got)
	}
	var score int
	var terminStatus, terminNotes string
	var cleared bool
	if err := pool.QueryRow(ctx, `SELECT (SELECT reliability_score FROM kontraktors WHERE id = $2),
		(SELECT status::text FROM project_payment_termins WHERE project_id = $1 AND label = 'hF pending'),
		(SELECT notes FROM project_payment_termins WHERE project_id = $1 AND label = 'hF pending'),
		(SELECT selected_kontraktor_id IS NULL FROM projects WHERE id = $1)`,
		fx.projectID, hFKontraktorProfileID).Scan(&score, &terminStatus, &terminNotes, &cleared); err != nil {
		t.Fatalf("post-fire: %v", err)
	}
	if score != 67 || terminStatus != "void" || cleared != true {
		t.Fatalf("post-fire = score %d termin %s cleared %v, want 67/void/true", score, terminStatus, cleared)
	}
	if terminNotes != "Voided automatically — contract terminated." {
		t.Fatalf("termin notes = %q", terminNotes)
	}

	// The legacy project_manager spelling terminates the PM column.
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id = $2 WHERE id = $1`, fx.project2ID, hFPMProfileID); err != nil {
		t.Fatalf("hire pm: %v", err)
	}
	rec = hFCall(t, TerminateProfessionalHandler(pool), http.MethodPost, "/x",
		`{"role_type":"project_manager","reason":"hF pm out"}`, &fx.owner, p2)
	if rec.Code != http.StatusOK {
		t.Fatalf("fire pm = %d %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != "Contract for pm terminated successfully. Project is reopened for bidding." {
		t.Fatalf("fire pm message = %q", got)
	}
	var pmCleared bool
	if err := pool.QueryRow(ctx, `SELECT pm_id IS NULL FROM projects WHERE id = $1`, fx.project2ID).Scan(&pmCleared); err != nil || !pmCleared {
		t.Fatalf("pm cleared = %v, %v", pmCleared, err)
	}

	// Resign on the second project: reliability 77 − 5.
	if _, err := pool.Exec(ctx, `UPDATE kontraktors SET reliability_score = 77 WHERE id = $1`, hFKontraktorProfileID); err != nil {
		t.Fatalf("set reliability 2: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, status)
		VALUES ($1, 'kontraktor', $2, $3, $3, 'active')`, fx.project2ID, fx.kontraktor.id, hFKontraktorProfileID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	rec = hFCall(t, ResignFromProjectHandler(pool), http.MethodPost, "/x", `{"reason":"hF tired"}`, &fx.kontraktor, p2)
	if rec.Code != http.StatusOK {
		t.Fatalf("resign = %d %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != "Resignation submitted successfully." {
		t.Fatalf("resign message = %q", got)
	}
	if err := pool.QueryRow(ctx, `SELECT reliability_score FROM kontraktors WHERE id = $1`,
		hFKontraktorProfileID).Scan(&score); err != nil || score != 72 {
		t.Fatalf("resign score = %d, %v", score, err)
	}
	var bidStatus string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE project_id = $1 AND role::text = 'kontraktor' ORDER BY id DESC LIMIT 1`,
		fx.project2ID).Scan(&bidStatus); err != nil || bidStatus != "resigned" {
		t.Fatalf("resign bid = %q, %v", bidStatus, err)
	}
}

func TestHFSharingEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	p := hFProjectPath(fx.projectID)

	// Anonymous gates: 401 on sticky index/store/update/delete, share
	// generate/revoke, broadcast and notification reads.
	if rec := hFCall(t, StickyNotesIndexHandler(pool), http.MethodGet, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("sticky index anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x", `{}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("sticky store anon = %d, want 401", rec.Code)
	}
	sp := map[string]string{"project": int64String(fx.projectID), "stickyNote": "1"}
	if rec := hFCall(t, UpdateStickyNoteHandler(pool), http.MethodPut, "/x", `{}`, nil, sp); rec.Code != http.StatusUnauthorized {
		t.Fatalf("sticky update anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, DestroyStickyNoteHandler(pool), http.MethodDelete, "/x", "", nil, sp); rec.Code != http.StatusUnauthorized {
		t.Fatalf("sticky delete anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("share gen anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, RevokeShareTokenHandler(pool), http.MethodDelete, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("share revoke anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("broadcast anon = %d, want 401", rec.Code)
	}

	// Bad project bindings: 404 twins.
	bad := map[string]string{"project": "abc"}
	if rec := hFCall(t, StickyNotesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("sticky index bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("sticky store bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.owner, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("share gen bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, RevokeShareTokenHandler(pool), http.MethodDelete, "/x", "", &fx.owner, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("share revoke bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.owner, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("broadcast bad = %d, want 404", rec.Code)
	}

	// Non-string sticky fields: the 422 twins.
	rec := hFCall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x", `{"phase_context":123}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky phase type = %d, want 422", rec.Code)
	}
	rec = hFCall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x", `{"title":123}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky title type = %d, want 422", rec.Code)
	}
	rec = hFCall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x", `{"content":123}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky content type = %d, want 422", rec.Code)
	}

	// Missing project rows refuse behind the gate: 403, never 500.
	missing := map[string]string{"project": "999999999"}
	if rec := hFCall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.owner, missing); rec.Code != http.StatusForbidden {
		t.Fatalf("share gen missing = %d, want 403", rec.Code)
	}
	if rec := hFCall(t, RevokeShareTokenHandler(pool), http.MethodDelete, "/x", "", &fx.owner, missing); rec.Code != http.StatusForbidden {
		t.Fatalf("share revoke missing = %d, want 403", rec.Code)
	}

	// Assigned PM broadcasts too: the gate admits owner or assigned PM.
	rec = hFCall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.pm, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("broadcast pm = %d %s", rec.Code, rec.Body.String())
	}
	var roles string
	if err := pool.QueryRow(context.Background(), `SELECT published_bidding_roles::text FROM projects WHERE id = $1`,
		fx.projectID).Scan(&roles); err != nil || roles != `["kontraktor"]` {
		t.Fatalf("published = %q, %v", roles, err)
	}

	// Notification preference validation twins.
	if rec := hFCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"inapp","enabled":true,"digest":"hourly"}`, &fx.owner, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs digest = %d, want 422", rec.Code)
	}
	if rec := hFCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"inapp","enabled":"maybe"}`, &fx.owner, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs enabled = %d, want 422", rec.Code)
	}
	long := strings.Repeat("y", 61)
	if rec := hFCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"type":"`+long+`","channel":"inapp","enabled":true}`, &fx.owner, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs type long = %d, want 422", rec.Code)
	}
	if rec := hFCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"inapp","enabled":true,"quiet_hours_end":"99:99"}`, &fx.owner, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs clock = %d, want 422", rec.Code)
	}
	if rec := hFCall(t, DestroyNotificationPreferenceHandler(pool), http.MethodDelete, "/x",
		`{"type":123,"channel":"inapp"}`, &fx.owner, nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs delete type = %d, want 422", rec.Code)
	}

	// Notification read: anonymous and malformed id twins.
	if rec := hFCall(t, MarkNotificationReadHandler(pool), http.MethodPost, "/x", "",
		nil, map[string]string{"notification": "1"}); rec.Code != http.StatusUnauthorized {
		t.Fatalf("read anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, MarkNotificationReadHandler(pool), http.MethodPost, "/x", "",
		&fx.owner, map[string]string{"notification": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("read bad id = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\Notification] abc` {
		t.Fatalf("read bad id message = %q", got)
	}
}

func TestHFCommentsEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	p := hFProjectPath(fx.projectID)

	if rec := hFCall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("comments index anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner,
		map[string]string{"project": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("comments index bad = %d, want 404", rec.Code)
	}

	// Non-integer parent id: the exists-rule 422.
	rec := hFCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hF x","parent_id":"abc"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment parent type = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Overlong message: 422.
	rec = hFCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"`+strings.Repeat("z", 1001)+`"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("comment long = %d, want 422", rec.Code)
	}

	// Binding 404s on update/delete with malformed ids.
	if rec := hFCall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{"message":"hF"}`,
		&fx.owner, map[string]string{"project": int64String(fx.projectID), "comment": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("comment update bad = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\ProjectComment] abc` {
		t.Fatalf("comment update bad message = %q", got)
	}
	if rec := hFCall(t, DestroyCommentHandler(pool), http.MethodDelete, "/x", "",
		&fx.owner, map[string]string{"project": int64String(fx.projectID), "comment": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("comment delete bad = %d, want 404", rec.Code)
	}
	if rec := hFCall(t, DestroyCommentHandler(pool), http.MethodDelete, "/x", "",
		&fx.owner, map[string]string{"project": int64String(fx.projectID), "comment": "999999999"}); rec.Code != http.StatusNotFound {
		t.Fatalf("comment delete missing = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\ProjectComment] 999999999` {
		t.Fatalf("comment delete missing message = %q", got)
	}

	// A populated thread renders authors and the parent subtree.
	rec = hFCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hF top"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment top = %d %s", rec.Code, rec.Body.String())
	}
	topID := int64(hFDecode(t, rec)["data"].([]any)[0].(map[string]any)["id"].(float64))
	rec = hFCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hF reply","parent_id":`+int64String(topID)+`}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("comment reply = %d %s", rec.Code, rec.Body.String())
	}
	rec = hFCall(t, ProjectCommentsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("comments index full = %d %s", rec.Code, rec.Body.String())
	}
	thread := hFDecode(t, rec)["data"].([]any)
	if len(thread) != 2 {
		t.Fatalf("thread len = %d", len(thread))
	}
	first, _ := thread[0].(map[string]any)
	second, _ := thread[1].(map[string]any)
	if first["message"] != "hF top" || first["parent"] != nil {
		t.Fatalf("thread first = %v", first)
	}
	author, _ := first["user"].(map[string]any)
	if author["name"] != "hF Kontraktor" {
		t.Fatalf("thread author = %v", author)
	}
	parent, _ := second["parent"].(map[string]any)
	if parent["message"] != "hF top" {
		t.Fatalf("thread parent = %v", second)
	}
	parentAuthor, _ := parent["user"].(map[string]any)
	if parentAuthor["name"] != "hF Kontraktor" {
		t.Fatalf("thread parent author = %v", parent)
	}
}

func TestHFBriefReads(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()

	// A shareable project with a rab-bearing brief, one milestone, one
	// requirement and a question with a reply.
	if _, err := pool.Exec(ctx, `UPDATE projects SET share_token = 'hF-token-1',
		construction_details = '{"rab":{"total":1},"scope":"hF scope"}', construction_locked_at = now() WHERE id = $1`,
		fx.projectID); err != nil {
		t.Fatalf("token: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (project_id, title, sort_order, created_at, updated_at)
		VALUES ($1, 'hF MS', 1, now(), now())`, fx.projectID); err != nil {
		t.Fatalf("milestone: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, unit, bom_type, quantity_on_site, quantity_used, created_at, updated_at, user_id)
		VALUES ($1, 'hF Bata', 10, 'pcs', 'raw', 4, 1, now(), now(), $2)`,
		fx.projectID, fx.owner.id); err != nil {
		t.Fatalf("requirement: %v", err)
	}
	var topID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_comments (project_id, user_id, message, created_at, updated_at)
		VALUES ($1, $2, 'hF q', now(), now()) RETURNING id`, fx.projectID, fx.stranger.id).Scan(&topID); err != nil {
		t.Fatalf("comment: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_comments (project_id, user_id, message, parent_id, created_at, updated_at)
		VALUES ($1, $2, 'hF a', $3, now(), now())`, fx.projectID, fx.kontraktor.id, topID); err != nil {
		t.Fatalf("reply: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/brief/hF-token-1", nil)
	req.SetPathValue("token", "hF-token-1")
	rec := httptest.NewRecorder()
	PublicBriefHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("brief = %d %s", rec.Code, rec.Body.String())
	}
	body := hFDecode(t, rec)
	details, _ := body["construction_details"].(map[string]any)
	if details["scope"] != "hF scope" {
		t.Fatalf("brief scope = %v", details)
	}
	if _, banned := details["rab"]; banned {
		t.Fatalf("brief leaks rab: %v", details)
	}
	milestones, _ := body["milestones"].([]any)
	if len(milestones) != 1 {
		t.Fatalf("brief milestones = %d", len(milestones))
	}
	requirements, _ := body["requirements"].([]any)
	if len(requirements) != 1 {
		t.Fatalf("brief requirements = %d", len(requirements))
	}
	reqMap, _ := requirements[0].(map[string]any)
	if reqMap["name"] != "hF Bata" {
		t.Fatalf("brief requirement = %v", reqMap)
	}
	comments, _ := body["comments"].([]any)
	if len(comments) != 1 {
		t.Fatalf("brief comments = %d", len(comments))
	}
	top, _ := comments[0].(map[string]any)
	if top["message"] != "hF q" {
		t.Fatalf("brief top message = %v", top)
	}
	replies, _ := top["replies"].([]any)
	if len(replies) != 1 {
		t.Fatalf("brief replies = %d", len(replies))
	}
	reply, _ := replies[0].(map[string]any)
	if reply["message"] != "hF a" {
		t.Fatalf("brief reply message = %v", reply)
	}
	replyUser, _ := reply["user"].(map[string]any)
	if replyUser["name"] != "hF Kontraktor" {
		t.Fatalf("brief reply user = %v", replyUser)
	}
	if body["construction_locked_at"] == nil {
		t.Fatalf("brief locked_at missing: %s", rec.Body.String())
	}
}

func hFMultipart(t *testing.T, fields map[string]string, fileField, filename string, data []byte) (*strings.Reader, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for k, v := range fields {
		if err := writer.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	if fileField != "" {
		part, err := writer.CreateFormFile(fileField, filename)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	b := body.String()
	return strings.NewReader(b), writer.FormDataContentType()
}

func TestHFSinglesEdges(t *testing.T) {
	pool := hFPool(t)
	fx := hFSetup(t, pool)
	ctx := context.Background()

	// House Q&A: anonymous is refused before the question load.
	if rec := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"answer":"hF"}`))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("question", "1")
		rec := httptest.NewRecorder()
		StoreHouseAnswerHandler(pool)(rec, req)
		return rec
	}(); rec.Code != http.StatusUnauthorized {
		t.Fatalf("answer anon = %d, want 401", rec.Code)
	}

	var houseID int64
	if err := pool.QueryRow(ctx, `INSERT INTO house (name, id_user) VALUES ('hF House', $1) RETURNING id`, fx.owner.id).Scan(&houseID); err != nil {
		t.Fatalf("house: %v", err)
	}
	var questionID int64
	if err := pool.QueryRow(ctx, `INSERT INTO house_questions (house_id, user_id, question) VALUES ($1, $2, 'hF q?') RETURNING id`,
		houseID, fx.stranger.id).Scan(&questionID); err != nil {
		t.Fatalf("question: %v", err)
	}
	okQP := map[string]string{"question": int64String(questionID)}

	// An admin answers even though they do not own the listing.
	admin := roadmapCaller{id: fx.admin.id, role: "admin", admin: true}
	rec := hFCall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{"answer":"hF yes"}`, &admin, okQP)
	if rec.Code != http.StatusCreated {
		t.Fatalf("answer admin = %d %s", rec.Code, rec.Body.String())
	}

	// Overlong and non-string answers: 422 twins.
	rec = hFCall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x",
		`{"answer":"`+strings.Repeat("a", 1001)+`"}`, &fx.owner, okQP)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("answer long = %d, want 422", rec.Code)
	}
	rec = hFCall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{"answer":123}`, &fx.owner, okQP)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("answer type = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// Missing question: binding 404.
	rec = hFCall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{"answer":"hF"}`,
		&fx.owner, map[string]string{"question": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("answer missing q = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\HouseQuestion] 999999999` {
		t.Fatalf("answer missing q message = %q", got)
	}

	// Room deletion: anonymous, malformed and missing twins.
	if rec := hFCall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", nil,
		map[string]string{"room": "1"}); rec.Code != http.StatusUnauthorized {
		t.Fatalf("room anon = %d, want 401", rec.Code)
	}
	if rec := hFCall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.owner,
		map[string]string{"room": "abc"}); rec.Code != http.StatusNotFound {
		t.Fatalf("room bad = %d, want 404", rec.Code)
	} else if got := hFDecode(t, rec)["message"]; got != `No query results for model [App\Models\Room] abc` {
		t.Fatalf("room bad message = %q", got)
	}
	if rec := hFCall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.owner,
		map[string]string{"room": "999999999"}); rec.Code != http.StatusNotFound {
		t.Fatalf("room missing = %d, want 404", rec.Code)
	}

	// Happy path removes the picture file from disk: zero leftovers.
	dir := t.TempDir()
	t.Setenv("PUBLIC_STORAGE_ROOT", dir)
	var roomID int64
	if err := pool.QueryRow(ctx, `INSERT INTO rooms (name, id_house) VALUES ('hF Room', $1) RETURNING id`, houseID).Scan(&roomID); err != nil {
		t.Fatalf("room: %v", err)
	}
	rel := "hF_pic/hF-room.jpg"
	full, err := safeStorageJoin(dir, rel)
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(full, []byte{0xFF, 0xD8, 0xFF, 0xD9}, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO rooms_pic (id_room, dir) VALUES ($1, $2)`, roomID, rel); err != nil {
		t.Fatalf("pic row: %v", err)
	}
	rec = hFCall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.owner,
		map[string]string{"room": int64String(roomID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("room delete = %d %s", rec.Code, rec.Body.String())
	}
	if got := hFDecode(t, rec)["message"]; got != "Room deleted successfully" {
		t.Fatalf("room delete message = %q", got)
	}
	if _, err := os.Stat(full); !os.IsNotExist(err) {
		t.Fatalf("room pic left on disk: %v", err)
	}
	var roomsLeft int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM rooms WHERE id_house = $1`, houseID).Scan(&roomsLeft); err != nil || roomsLeft != 0 {
		t.Fatalf("rooms left = %d, %v", roomsLeft, err)
	}

	// Upload: webp and pdf happy paths, design_briefs folder allowlist.
	webp := []byte{0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50}
	reader, ctype := hFMultipart(t, map[string]string{"folder": "design_briefs"}, "file", "hF.webp", webp)
	req := httptest.NewRequest(http.MethodPost, "/api/upload", reader)
	req.Header.Set("Content-Type", ctype)
	upRec := httptest.NewRecorder()
	UploadHandler(pool)(upRec, req)
	if upRec.Code != http.StatusOK {
		t.Fatalf("upload webp = %d %s", upRec.Code, upRec.Body.String())
	}
	var upBody map[string]any
	if err := json.Unmarshal(upRec.Body.Bytes(), &upBody); err != nil {
		t.Fatalf("upload webp decode: %v", err)
	}
	upPath, _ := upBody["path"].(string)
	if !strings.HasPrefix(upPath, "design_briefs/") || !strings.HasSuffix(upPath, ".webp") {
		t.Fatalf("upload webp path = %q", upPath)
	}
	_ = os.Remove(filepath.Join(dir, filepath.FromSlash(upPath)))

	pdf := []byte("%PDF-1.4\nhF\n%%EOF\n")
	reader, ctype = hFMultipart(t, nil, "file", "hF.pdf", pdf)
	req = httptest.NewRequest(http.MethodPost, "/api/upload", reader)
	req.Header.Set("Content-Type", ctype)
	upRec = httptest.NewRecorder()
	UploadHandler(pool)(upRec, req)
	if upRec.Code != http.StatusOK {
		t.Fatalf("upload pdf = %d %s", upRec.Code, upRec.Body.String())
	}
	if err := json.Unmarshal(upRec.Body.Bytes(), &upBody); err != nil {
		t.Fatalf("upload pdf decode: %v", err)
	}
	pdfPath, _ := upBody["path"].(string)
	if !strings.HasPrefix(pdfPath, "project_assets/") || !strings.HasSuffix(pdfPath, ".pdf") {
		t.Fatalf("upload pdf path = %q", pdfPath)
	}
	_ = os.Remove(filepath.Join(dir, filepath.FromSlash(pdfPath)))
}
