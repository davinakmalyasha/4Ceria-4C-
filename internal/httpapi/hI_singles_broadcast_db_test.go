package httpapi

// hI singles writes + broadcast/notif leftovers (delivery-jobs 500 path untouched).

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestHISinglesWrites(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()

	// Delivery jobs: non-supplier 403, anon 401. (Profile-less 500 pinned by hB, untouched.)
	rec := hICall(t, SupplierDeliveryJobsHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("delivery owner = %d, want 403", rec.Code)
	}
	rec = hICall(t, SupplierDeliveryJobsHandler(pool), http.MethodGet, "/x", "", nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("delivery anon = %d, want 401", rec.Code)
	}
	// Real job for the hI supplier.
	var quoteID int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_quotes (user_id, supplier_id, items, delivery_address, total_amount)
		VALUES ($1, (SELECT id FROM suppliers WHERE user_id = $1), '[]', 'hI addr', 50000) RETURNING id`,
		fx.supplier.id).Scan(&quoteID); err != nil {
		t.Fatalf("quote: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO delivery_jobs (quote_id, status, agreed_fee) VALUES ($1, 'pending', 10000)`, quoteID); err != nil {
		t.Fatalf("job: %v", err)
	}
	rec = hICall(t, SupplierDeliveryJobsHandler(pool), http.MethodGet, "/x", "", &fx.supplier, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("delivery = %d %s", rec.Code, rec.Body.String())
	}
	if got := len(hIDecode(t, rec)["data"].([]any)); got != 1 {
		t.Fatalf("delivery len = %d", got)
	}

	// House Q&A + room (mirrors hB happy + twins).
	var houseID int64
	if err := pool.QueryRow(ctx, `INSERT INTO house (name, id_user) VALUES ('hI House', $1) RETURNING id`, fx.owner.id).Scan(&houseID); err != nil {
		t.Fatalf("house: %v", err)
	}
	var questionID int64
	if err := pool.QueryRow(ctx, `INSERT INTO house_questions (house_id, user_id, question) VALUES ($1, $2, 'hI q?') RETURNING id`,
		houseID, fx.stranger.id).Scan(&questionID); err != nil {
		t.Fatalf("question: %v", err)
	}
	qp := map[string]string{"question": int64String(questionID)}
	rec = hICall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{"answer":"hI yes"}`, &fx.stranger, qp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("answer stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, qp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("answer empty = %d, want 422", rec.Code)
	}
	rec = hICall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{"answer":"hI yes"}`, &fx.owner, qp)
	if rec.Code != http.StatusCreated {
		t.Fatalf("answer = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{"answer":"hI"}`, &fx.owner,
		map[string]string{"question": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("answer missing q = %d, want 404", rec.Code)
	}

	var roomID int64
	if err := pool.QueryRow(ctx, `INSERT INTO rooms (name, id_house) VALUES ('hI Room', $1) RETURNING id`, houseID).Scan(&roomID); err != nil {
		t.Fatalf("room: %v", err)
	}
	rp := map[string]string{"room": int64String(roomID)}
	rec = hICall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("room stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("room delete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("room delete again = %d, want 404", rec.Code)
	}
	// Bad room id → 404.
	rec = hICall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.owner,
		map[string]string{"room": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("room bad id = %d, want 404", rec.Code)
	}
}

func TestHIBroadcastNotif(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()
	p := hIProjectPath(fx.projectID)

	// Broadcast appends the role once.
	rec := hICall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("broadcast = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("broadcast again = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"wizard"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("broadcast bad role = %d, want 422", rec.Code)
	}
	rec = hICall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.stranger, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("broadcast stranger = %d, want 403", rec.Code)
	}
	rec = hICall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("broadcast anon = %d, want 401", rec.Code)
	}
	// Missing project → 404.
	rec = hICall(t, BroadcastPhaseHandler(pool), http.MethodPost, "/x", `{"role":"kontraktor"}`, &fx.owner,
		map[string]string{"project": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("broadcast missing project = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// Notification reads.
	var notifID int64
	if err := pool.QueryRow(ctx, `INSERT INTO notifications (user_id, type, title, body, created_at, updated_at)
		VALUES ($1, 'hI_test', 'hI', 'hI body', now(), now()) RETURNING id`, fx.owner.id).Scan(&notifID); err != nil {
		t.Fatalf("notif: %v", err)
	}
	np := map[string]string{"notification": int64String(notifID)}
	rec = hICall(t, MarkNotificationReadHandler(pool), http.MethodPost, "/x", "", &fx.stranger, np)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("read other = %d, want 403", rec.Code)
	}
	rec = hICall(t, MarkNotificationReadHandler(pool), http.MethodPost, "/x", "", &fx.owner, np)
	if rec.Code != http.StatusOK {
		t.Fatalf("read = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Notification marked as read") {
		t.Fatalf("read msg = %s", rec.Body.String())
	}
	rec = hICall(t, MarkNotificationReadHandler(pool), http.MethodPost, "/x", "", &fx.owner,
		map[string]string{"notification": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("read missing = %d, want 404", rec.Code)
	}
	rec = hICall(t, MarkAllNotificationsReadHandler(pool), http.MethodPost, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("read all = %d %s", rec.Code, rec.Body.String())
	}
	rec = hICall(t, MarkAllNotificationsReadHandler(pool), http.MethodPost, "/x", "", nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("read all anon = %d, want 401", rec.Code)
	}
}
