package httpapi

// hB sharing surface: sticky notes, share tokens, notification
// preferences, notification reads and phase broadcast.

import (
	"context"
	"net/http"
	"testing"
)

func TestHBStickyNotes(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	// Store with defaults, then a phased one.
	rec := hBCall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("sticky store = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x",
		`{"phase_context":"design","title":"hB note","content":"hB c","position_index":3}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("sticky store full = %d %s", rec.Code, rec.Body.String())
	}
	firstID := int64(hBDecode(t, rec)["data"].(map[string]any)["id"].(float64))

	// Index: all, then phase-filtered.
	rec = hBCall(t, StickyNotesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if body := hBDecode(t, rec); len(body["data"].([]any)) != 2 {
		t.Fatalf("sticky index = %v", body)
	}
	rec = hBCall(t, StickyNotesIndexHandler(pool), http.MethodGet, "/x?phase_context=design", "", &fx.owner, p)
	if body := hBDecode(t, rec); len(body["data"].([]any)) != 1 {
		t.Fatalf("sticky filtered = %v", body)
	}
	// Stranger is not a participant.
	rec = hBCall(t, StickyNotesIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sticky stranger = %d, want 403", rec.Code)
	}
	// Validation: overlong title.
	long := make([]byte, 300)
	for i := range long {
		long[i] = 'x'
	}
	rec = hBCall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x",
		`{"title":"`+string(long)+`"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky long title = %d, want 422", rec.Code)
	}

	// Update as author; forbidden for a fellow participant; cross-project 404.
	sp := map[string]string{"project": int64String(fx.projectID), "stickyNote": int64String(firstID)}
	rec = hBCall(t, UpdateStickyNoteHandler(pool), http.MethodPut, "/x",
		`{"title":"hB edited","position_index":9}`, &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("sticky update = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UpdateStickyNoteHandler(pool), http.MethodPut, "/x",
		`{"title":"hB hijack"}`, &fx.kontraktor, sp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sticky update other = %d, want 403", rec.Code)
	}
	rec = hBCall(t, UpdateStickyNoteHandler(pool), http.MethodPut, "/x",
		`{"title":"x","position_index":"nope"}`, &fx.owner, sp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky update invalid = %d, want 422", rec.Code)
	}
	var otherNote int64
	if err := pool.QueryRow(ctx, `INSERT INTO sticky_notes (project_id, user_id, created_at, updated_at)
		VALUES ($1, $2, now(), now()) RETURNING id`, fx.project2ID, fx.owner.id).Scan(&otherNote); err != nil {
		t.Fatalf("other note: %v", err)
	}
	xp := map[string]string{"project": int64String(fx.projectID), "stickyNote": int64String(otherNote)}
	rec = hBCall(t, UpdateStickyNoteHandler(pool), http.MethodPut, "/x", `{"title":"hB"}`, &fx.owner, xp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("sticky update cross = %d, want 404", rec.Code)
	}

	// Delete: forbidden for non-author, then happy, then missing.
	rec = hBCall(t, DestroyStickyNoteHandler(pool), http.MethodDelete, "/x", "", &fx.kontraktor, sp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sticky delete other = %d, want 403", rec.Code)
	}
	rec = hBCall(t, DestroyStickyNoteHandler(pool), http.MethodDelete, "/x", "", &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("sticky delete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, DestroyStickyNoteHandler(pool), http.MethodDelete, "/x", "", &fx.owner, sp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("sticky delete again = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, DestroyStickyNoteHandler(pool), http.MethodDelete, "/x", "", &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "stickyNote": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("sticky delete bad id = %d, want 404", rec.Code)
	}
}

func TestHBShareToken(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	rec := hBCall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("share gen = %d %s", rec.Code, rec.Body.String())
	}
	first := hBDecode(t, rec)["share_token"].(string)
	if len(first) != 24 {
		t.Fatalf("token len = %d", len(first))
	}
	// Second call returns the same token (no rotation).
	rec = hBCall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if hBDecode(t, rec)["share_token"].(string) != first {
		t.Fatalf("token rotated: %s", rec.Body.String())
	}
	// Hired kontraktor may generate too; stranger may not.
	rec = hBCall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("share kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("share stranger = %d, want 403", rec.Code)
	}
	var stored *string
	if err := pool.QueryRow(ctx, `SELECT share_token FROM projects WHERE id = $1`, fx.projectID).Scan(&stored); err != nil {
		t.Fatalf("token read: %v", err)
	}

	// Revoke clears the token; a stranger cannot revoke.
	rec = hBCall(t, RevokeShareTokenHandler(pool), http.MethodDelete, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("revoke stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, RevokeShareTokenHandler(pool), http.MethodDelete, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("revoke = %d %s", rec.Code, rec.Body.String())
	}
	if err := pool.QueryRow(ctx, `SELECT share_token FROM projects WHERE id = $1`, fx.projectID).Scan(&stored); err != nil {
		t.Fatalf("token reread: %v", err)
	}
	if stored != nil {
		t.Fatalf("token not cleared: %v", *stored)
	}
}

func TestHBNotificationPreferences(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)

	// Empty index answers the channel catalog with an empty array.
	rec := hBCall(t, NotificationPreferencesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prefs index = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, NotificationPreferencesIndexHandler(pool), http.MethodGet, "/x", "", nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("prefs anon = %d, want 401", rec.Code)
	}

	// Create, then update the same row (inserted vs updated render).
	rec = hBCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"inapp","enabled":false,"digest":"daily","quiet_hours_start":"22:00","quiet_hours_end":"07:00"}`, &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prefs upsert = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"type":"hB_custom","channel":"webpush","enabled":true}`, &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prefs typed = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"type":"hB_custom","channel":"webpush","enabled":false}`, &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prefs re-upsert = %d %s", rec.Code, rec.Body.String())
	}
	// Always-on money/arbitration types are refused.
	rec = hBCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"type":"payment_verified","channel":"inapp","enabled":false}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs always-on = %d, want 422", rec.Code)
	}
	// Email/whatsapp cannot be enabled without a sender.
	rec = hBCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"email","enabled":true}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs email = %d, want 422", rec.Code)
	}
	// Validation: overlong title, bad clock, bad digest.
	rec = hBCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"inapp","enabled":false,"quiet_hours_start":"25:99"}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs bad clock = %d, want 422", rec.Code)
	}
	rec = hBCall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"enabled":true}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs missing channel = %d, want 422", rec.Code)
	}

	// Grouped index now carries the rows.
	rec = hBCall(t, NotificationPreferencesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if prefs, _ := hBDecode(t, rec)["preferences"].(map[string]any); len(prefs) == 0 {
		t.Fatalf("prefs grouped empty: %s", rec.Body.String())
	}

	// Delete by query params, then validation.
	rec = hBCall(t, DestroyNotificationPreferenceHandler(pool), http.MethodDelete, "/x?type=hB_custom&channel=webpush", "", &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prefs delete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, DestroyNotificationPreferenceHandler(pool), http.MethodDelete, "/x", `{}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs delete empty = %d, want 422", rec.Code)
	}
}

func TestHBNotificationReadsAndBroadcast(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()
	p := hBProjectPath(fx.projectID)

	var notifID int64
	if err := pool.QueryRow(ctx, `INSERT INTO notifications (user_id, type, title, body, created_at, updated_at)
		VALUES ($1, 'hB_test', 'hB', 'hB body', now(), now()) RETURNING id`, fx.owner.id).Scan(&notifID); err != nil {
		t.Fatalf("notif: %v", err)
	}
	np := map[string]string{"notification": int64String(notifID)}
	// Another user's notification is forbidden.
	rec := hBCall(t, MarkNotificationReadHandler(pool), http.MethodPost, "/x", "", &fx.stranger, np)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("read other = %d, want 403", rec.Code)
	}
	rec = hBCall(t, MarkNotificationReadHandler(pool), http.MethodPost, "/x", "", &fx.owner, np)
	if rec.Code != http.StatusOK {
		t.Fatalf("read = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, MarkNotificationReadHandler(pool), http.MethodPost, "/x", "", &fx.owner,
		map[string]string{"notification": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("read missing = %d, want 404", rec.Code)
	}
	rec = hBCall(t, MarkAllNotificationsReadHandler(pool), http.MethodPost, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("read all = %d %s", rec.Code, rec.Body.String())
	}

	// Broadcast appends the role once.
	rec = hBCall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("broadcast = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("broadcast again = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"wizard"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("broadcast bad role = %d, want 422", rec.Code)
	}
	rec = hBCall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("broadcast stranger = %d, want 403", rec.Code)
	}
}
