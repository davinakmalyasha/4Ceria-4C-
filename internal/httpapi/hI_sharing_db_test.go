package httpapi

// hI sharing leftovers: sticky validation twins, share token, prefs,
// broadcast and notif reads.

import (
	"net/http"
	"strings"
	"testing"
)

func TestHIStickyNotes(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	p := hIProjectPath(fx.projectID)

	// Store with defaults, then a phased one.
	rec := hICall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("sticky store = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x",
		`{"phase_context":"design","title":"hI note","content":"hI c","position_index":3}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("sticky store full = %d %s", rec.Code, rec.Body.String())
	}
	firstID := int64(hIDecode(t, rec)["data"].(map[string]any)["id"].(float64))

	// Index: all, then phase-filtered.
	rec = hICall(t, StickyNotesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if body := hIDecode(t, rec); len(body["data"].([]any)) != 2 {
		t.Fatalf("sticky index = %v", body)
	}
	// Stranger is not a participant.
	rec = hICall(t, StickyNotesIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sticky stranger = %d, want 403", rec.Code)
	}
	// Anon 401, bad project 404, ghost 404.
	rec = hICall(t, StickyNotesIndexHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("sticky anon = %d, want 401", rec.Code)
	}
	rec = hICall(t, StickyNotesIndexHandler(pool), http.MethodGet, "/x", "", &fx.ghost, p)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("sticky ghost = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	// Validation: overlong title.
	long := strings.Repeat("x", 300)
	rec = hICall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x",
		`{"title":"`+long+`"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky long title = %d, want 422", rec.Code)
	}
	// Validation: phase_context too long (100 chars) — uncovered branch.
	longPhase := strings.Repeat("p", 101)
	rec = hICall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x",
		`{"phase_context":"`+longPhase+`"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky long phase = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// Validation: phase_context non-string.
	rec = hICall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x",
		`{"phase_context":123}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky phase num = %d, want 422", rec.Code)
	}
	// Validation: title non-string, content non-string, position non-integer.
	rec = hICall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x",
		`{"title":123}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky title num = %d, want 422", rec.Code)
	}
	rec = hICall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x",
		`{"content":123}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky content num = %d, want 422", rec.Code)
	}
	rec = hICall(t, StoreStickyNoteHandler(pool), http.MethodPost, "/x",
		`{"position_index":"nope"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky position bad = %d, want 422", rec.Code)
	}

	// Update as author; forbidden for a fellow participant; cross-project 404.
	sp := map[string]string{"project": int64String(fx.projectID), "stickyNote": int64String(firstID)}
	rec = hICall(t, UpdateStickyNoteHandler(pool), http.MethodPut, "/x",
		`{"title":"hI edited","position_index":9}`, &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("sticky update = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "hI edited") {
		t.Fatalf("sticky update body = %s", rec.Body.String())
	}
	rec = hICall(t, UpdateStickyNoteHandler(pool), http.MethodPut, "/x",
		`{"title":"hI hijack"}`, &fx.kontraktor, sp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sticky update other = %d, want 403", rec.Code)
	}
	rec = hICall(t, UpdateStickyNoteHandler(pool), http.MethodPut, "/x",
		`{"title":"x","position_index":"nope"}`, &fx.owner, sp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sticky update invalid = %d, want 422", rec.Code)
	}
	// Bad sticky id format → 404.
	rec = hICall(t, UpdateStickyNoteHandler(pool), http.MethodPut, "/x", `{"title":"hI"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "stickyNote": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("sticky bad id = %d, want 404", rec.Code)
	}

	// Delete: forbidden for non-author, then happy, then missing.
	rec = hICall(t, DestroyStickyNoteHandler(pool), http.MethodDelete, "/x", "", &fx.kontraktor, sp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sticky delete other = %d, want 403", rec.Code)
	}
	rec = hICall(t, DestroyStickyNoteHandler(pool), http.MethodDelete, "/x", "", &fx.owner, sp)
	if rec.Code != http.StatusOK {
		t.Fatalf("sticky delete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, DestroyStickyNoteHandler(pool), http.MethodDelete, "/x", "", &fx.owner, sp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("sticky delete again = %d, want 404 %s", rec.Code, rec.Body.String())
	}
}

func TestHIShareToken(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	p := hIProjectPath(fx.projectID)

	rec := hICall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("share gen = %d %s", rec.Code, rec.Body.String())
	}
	first := hIDecode(t, rec)["share_token"].(string)
	if len(first) != 24 {
		t.Fatalf("token len = %d", len(first))
	}
	// Second call returns the same token (no rotation).
	rec = hICall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.owner, p)
	if hIDecode(t, rec)["share_token"].(string) != first {
		t.Fatalf("token rotated: %s", rec.Body.String())
	}
	// Hired kontraktor may generate too; stranger may not.
	rec = hICall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("share kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("share stranger = %d, want 403", rec.Code)
	}
	// Anon 401.
	rec = hICall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("share anon = %d, want 401", rec.Code)
	}

	// Revoke clears the token; a stranger cannot revoke.
	rec = hICall(t, RevokeShareTokenHandler(pool), http.MethodDelete, "/x", "", &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("revoke stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, RevokeShareTokenHandler(pool), http.MethodDelete, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("revoke = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Share link revoked.") {
		t.Fatalf("revoke body = %s", rec.Body.String())
	}
}

func TestHINotificationPrefs(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)

	// Empty index answers the channel catalog with an empty array.
	rec := hICall(t, NotificationPreferencesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prefs index = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, NotificationPreferencesIndexHandler(pool), http.MethodGet, "/x", "", nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("prefs anon = %d, want 401", rec.Code)
	}

	// Create, then update the same row.
	rec = hICall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"inapp","enabled":false,"digest":"daily","quiet_hours_start":"22:00","quiet_hours_end":"07:00"}`, &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prefs upsert = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"type":"hI_custom","channel":"webpush","enabled":true}`, &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prefs typed = %d %s", rec.Code, rec.Body.String())
	}
	// Always-on money/arbitration types are refused.
	rec = hICall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"type":"payment_verified","channel":"inapp","enabled":false}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs always-on = %d, want 422", rec.Code)
	}
	// Email/whatsapp cannot be enabled without a sender.
	rec = hICall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPost, "/x",
		`{"channel":"email","enabled":true}`, &fx.owner, nil)
	_ = rec
	rec = hICall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"email","enabled":true}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs email = %d, want 422", rec.Code)
	}
	// Validation: bad clock, missing channel, bad digest, bad channel.
	rec = hICall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"inapp","enabled":false,"quiet_hours_start":"25:99"}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs bad clock = %d, want 422", rec.Code)
	}
	rec = hICall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"enabled":true}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs missing channel = %d, want 422", rec.Code)
	}
	rec = hICall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"inapp","enabled":true,"digest":"bogus"}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs bad digest = %d, want 422", rec.Code)
	}
	rec = hICall(t, UpdateNotificationPreferenceHandler(pool), http.MethodPut, "/x",
		`{"channel":"bogus","enabled":true}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs bad channel = %d, want 422", rec.Code)
	}

	// Grouped index now carries the rows.
	rec = hICall(t, NotificationPreferencesIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if prefs, _ := hIDecode(t, rec)["preferences"].(map[string]any); len(prefs) == 0 {
		t.Fatalf("prefs grouped empty: %s", rec.Body.String())
	}

	// Delete by query params, then validation.
	rec = hICall(t, DestroyNotificationPreferenceHandler(pool), http.MethodDelete, "/x?type=hI_custom&channel=webpush", "", &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prefs delete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, DestroyNotificationPreferenceHandler(pool), http.MethodDelete, "/x", `{}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prefs delete empty = %d, want 422", rec.Code)
	}
}
