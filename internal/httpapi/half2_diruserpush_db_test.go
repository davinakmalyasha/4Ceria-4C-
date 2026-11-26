package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestHalfDirectory(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	tables := []struct {
		table string
		base  string
		svc   bool
	}{
		{"arsiteks", "/api/arsitek", false},
		{"kontraktors", "/api/kontraktor", false},
		{"notaris_profiles", "/api/notaris", true},
		{"interior_profiles", "/api/interior", false},
		{"project_managers", "/api/project-manager", false},
		{"structural_engineers", "/api/structural-engineers", false},
		{"mep_engineers", "/api/mep-engineers", false},
	}
	for _, tc := range tables {
		paths := []string{tc.base, tc.base + "?per_page=2&page=1", tc.base + "?per_page=200&page=abc", tc.base + "?page=9999"}
		// kontraktors has no `lokasi` (fixed: searches `alamat` instead),
		// so its search path must stay green like every other table.
		paths = append(paths, tc.base+"?search=a")
		for _, path := range paths {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			rec := httptest.NewRecorder()
			DirectoryHandler(pool, tc.table, tc.base, tc.svc)(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("%s %s = %d %s", tc.table, path, rec.Code, rec.Body.String())
			}
			if !strings.Contains(rec.Body.String(), "data") || !strings.Contains(rec.Body.String(), "meta") {
				t.Fatalf("%s %s missing envelope", tc.table, path)
			}
		}
	}
	// direct helpers for uncovered branches
	if _, ok := projectColumnForProfile("bogus"); ok {
		t.Fatalf("bogus profile column ok")
	}
	if phoneNumberOf(map[string]any{"phone_number": "081"}) == nil {
		t.Fatalf("phoneNumberOf nil")
	}
	if phoneNumberOf(map[string]any{}) != nil {
		t.Fatalf("phoneNumberOf empty")
	}
	// directoryUser + directoryServices error/empty paths
	ctx := context.Background()
	if _, err := directoryUser(ctx, pool, 99009999); err == nil {
		t.Fatalf("directoryUser missing should err")
	}
	svc, err := directoryServices(ctx, pool, "notaris_profiles", 99009999)
	if err != nil || len(svc) != 0 {
		t.Fatalf("directoryServices empty = %v %v", svc, err)
	}
	svc2, err := directoryServices(ctx, pool, "arsiteks", 1)
	if err != nil || len(svc2) != 0 {
		t.Fatalf("directoryServices non-notaris = %v %v", svc2, err)
	}
	// bundle with empty ids
	if _, err := buildDirectoryBundle(ctx, pool, "arsiteks", nil, nil, false); err != nil {
		t.Fatalf("empty bundle: %v", err)
	}
	if m, err := directoryServicesBatch(ctx, pool, nil); err != nil || len(m) != 0 {
		t.Fatalf("empty services batch")
	}
	if m, err := directoryUsersBatch(ctx, pool, nil); err != nil || len(m) != 0 {
		t.Fatalf("empty users batch")
	}
	// row with bundle nil (per-row fallback path)
	var pid int64
	if err := pool.QueryRow(ctx, `SELECT id FROM arsiteks WHERE verification_status='verified' ORDER BY id LIMIT 1`).Scan(&pid); err == nil {
		fields := []string{"id", "user_id", "nama"}
		var id, uid int64
		var nama *string
		_ = pool.QueryRow(ctx, `SELECT id, user_id, nama FROM arsiteks WHERE id=$1`, pid).Scan(&id, &uid, &nama)
		_, _ = directoryRow(ctx, pool, "arsiteks", fields, []any{id, uid, nama}, false, nil)
	}
	// pagination helpers
	if lastPage(0, 24) != 1 {
		t.Fatalf("lastPage empty")
	}
	if pageFrom(0, 24, 1, 0) != nil || pageTo(0, 24, 1, 0) != nil {
		t.Fatalf("page from/to empty")
	}
	if basePathOf("http://x/api/arsitek?page=2") != "http://x/api/arsitek" {
		t.Fatalf("basePathOf")
	}
}

func TestHalfUserSurface(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	var uid int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&uid); err != nil {
		t.Skip("no users")
	}
	caller := roadmapCaller{id: uid, role: "user"}
	// Me unauth
	rec0 := httptest.NewRecorder()
	MeHandler(pool)(rec0, httptest.NewRequest(http.MethodGet, "/api/me", nil))
	if rec0.Code != http.StatusUnauthorized {
		t.Fatalf("me unauth = %d", rec0.Code)
	}
	// Me ok
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req = req.WithContext(withCaller(req.Context(), caller))
	rec := httptest.NewRecorder()
	MeHandler(pool)(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "email") {
		t.Fatalf("me = %d %s", rec.Code, rec.Body.String())
	}
	// Notifications unauth + ok
	recN0 := httptest.NewRecorder()
	NotificationsHandler(pool)(recN0, httptest.NewRequest(http.MethodGet, "/api/notifications", nil))
	if recN0.Code != http.StatusUnauthorized {
		t.Fatalf("notif unauth = %d", recN0.Code)
	}
	reqN := httptest.NewRequest(http.MethodGet, "/api/notifications", nil)
	reqN = reqN.WithContext(withCaller(reqN.Context(), caller))
	recN := httptest.NewRecorder()
	NotificationsHandler(pool)(recN, reqN)
	if recN.Code != http.StatusOK {
		t.Fatalf("notif = %d %s", recN.Code, recN.Body.String())
	}
	// ActiveProjects anon + authed + user with no profile
	recA0 := httptest.NewRecorder()
	ActiveProjectsHandler(pool)(recA0, httptest.NewRequest(http.MethodGet, "/api/user/active-projects", nil))
	if recA0.Code != http.StatusOK || !strings.Contains(recA0.Body.String(), "data") {
		t.Fatalf("active anon = %d %s", recA0.Code, recA0.Body.String())
	}
	reqA := httptest.NewRequest(http.MethodGet, "/api/user/active-projects", nil)
	reqA = reqA.WithContext(withCaller(reqA.Context(), caller))
	recA := httptest.NewRecorder()
	ActiveProjectsHandler(pool)(recA, reqA)
	if recA.Code != http.StatusOK {
		t.Fatalf("active = %d %s", recA.Code, recA.Body.String())
	}
	// UpdateMe branches — use a fresh user so the seeded demo row is never mutated.
	var meUID int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('Half2Me','half2me99','half2me99@example.test','x','user','H2ME99',NOW(),NOW()) RETURNING id`).Scan(&meUID); err != nil {
		t.Fatalf("seed me user: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user = $1`, meUID)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, meUID)
	meCaller := roadmapCaller{id: meUID, role: "user"}
	for _, tc := range []struct {
		name string
		body string
		code int
	}{
		{"unauth", `{}`, 401},
		{"missing", `{}`, 422},
		{"bademail", `{"name":"N","email":"bad","username":"u-half2a"}`, 422},
		{"uppercase", `{"name":"N","email":"UP@EXAMPLE.TEST","username":"u-half2b"}`, 422},
		{"ok", `{"name":"Half2 Me","email":"half2me99@example.test","username":"half2me99"}`, 200},
		{"bank-too-long", `{"name":"Half2 Me","email":"half2me99@example.test","username":"half2me99","bank_name":"` + strings.Repeat("x", 256) + `"}`, 422},
	} {
		var r *http.Request
		if tc.name == "unauth" {
			r = httptest.NewRequest(http.MethodPut, "/api/me", strings.NewReader(tc.body))
			rr := httptest.NewRecorder()
			UpdateMeHandler(pool)(rr, r)
			if rr.Code != tc.code {
				t.Fatalf("updateme %s = %d want %d (%s)", tc.name, rr.Code, tc.code, rr.Body.String())
			}
			continue
		}
		r = httptest.NewRequest(http.MethodPut, "/api/me", strings.NewReader(tc.body))
		r = r.WithContext(withCaller(r.Context(), meCaller))
		rr := httptest.NewRecorder()
		UpdateMeHandler(pool)(rr, r)
		if rr.Code != tc.code {
			t.Fatalf("updateme %s = %d want %d (%s)", tc.name, rr.Code, tc.code, rr.Body.String()[:min(400, len(rr.Body.String()))])
		}
	}
	// UnreadSummary + Avatar
	reqU := httptest.NewRequest(http.MethodGet, "/api/unread-summary", nil)
	reqU = reqU.WithContext(withCaller(reqU.Context(), caller))
	recU := httptest.NewRecorder()
	UnreadSummaryHandler(pool)(recU, reqU)
	if recU.Code != http.StatusOK {
		t.Fatalf("unread = %d %s", recU.Code, recU.Body.String())
	}
	recU0 := httptest.NewRecorder()
	UnreadSummaryHandler(pool)(recU0, httptest.NewRequest(http.MethodGet, "/api/unread-summary", nil))
	if recU0.Code != http.StatusUnauthorized {
		t.Fatalf("unread unauth = %d", recU0.Code)
	}
	reqAv := httptest.NewRequest(http.MethodPost, "/api/me/avatar", nil)
	reqAv = reqAv.WithContext(withCaller(reqAv.Context(), caller))
	recAv := httptest.NewRecorder()
	UpdateAvatarHandler(pool)(recAv, reqAv)
	if recAv.Code != http.StatusUnprocessableEntity && recAv.Code != http.StatusOK {
		t.Fatalf("avatar = %d %s", recAv.Code, recAv.Body.String())
	}
	recAv0 := httptest.NewRecorder()
	UpdateAvatarHandler(pool)(recAv0, httptest.NewRequest(http.MethodPost, "/api/me/avatar", nil))
	if recAv0.Code != http.StatusUnauthorized {
		t.Fatalf("avatar unauth = %d", recAv0.Code)
	}
	reqDel := httptest.NewRequest(http.MethodDelete, "/api/me/avatar", nil)
	reqDel = reqDel.WithContext(withCaller(reqDel.Context(), caller))
	recDel := httptest.NewRecorder()
	DeleteAvatarHandler(pool)(recDel, reqDel)
	if recDel.Code != http.StatusOK && recDel.Code != http.StatusNotFound {
		t.Fatalf("delete avatar = %d %s", recDel.Code, recDel.Body.String())
	}
	// UpdateProfessional unauth + validation + happy (role-dependent; just hit validation)
	reqP0 := httptest.NewRequest(http.MethodPut, "/api/me/professional", strings.NewReader(`{}`))
	recP0 := httptest.NewRecorder()
	UpdateProfessionalHandler(pool)(recP0, reqP0)
	if recP0.Code != http.StatusUnauthorized {
		t.Fatalf("prof unauth = %d", recP0.Code)
	}
	reqP1 := httptest.NewRequest(http.MethodPut, "/api/me/professional", strings.NewReader(`{}`))
	reqP1 = reqP1.WithContext(withCaller(reqP1.Context(), caller))
	recP1 := httptest.NewRecorder()
	UpdateProfessionalHandler(pool)(recP1, reqP1)
	if recP1.Code != http.StatusUnprocessableEntity && recP1.Code != http.StatusOK {
		t.Fatalf("prof empty = %d %s", recP1.Code, recP1.Body.String())
	}
}

func TestHalfPushSubscriptions(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	// public key both branches
	os.Unsetenv("VAPID_PUBLIC_KEY")
	rec0 := httptest.NewRecorder()
	PushPublicKeyHandler()(rec0, httptest.NewRequest(http.MethodGet, "/api/push/public-key", nil))
	if rec0.Code != http.StatusNotImplemented {
		t.Fatalf("nokey = %d", rec0.Code)
	}
	os.Setenv("VAPID_PUBLIC_KEY", "half2-test-key")
	defer os.Unsetenv("VAPID_PUBLIC_KEY")
	rec1 := httptest.NewRecorder()
	PushPublicKeyHandler()(rec1, httptest.NewRequest(http.MethodGet, "/api/push/public-key", nil))
	if rec1.Code != http.StatusOK || !strings.Contains(rec1.Body.String(), "half2-test-key") {
		t.Fatalf("key = %d %s", rec1.Code, rec1.Body.String())
	}
	var uid int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&uid); err != nil {
		t.Skip("no users")
	}
	caller := roadmapCaller{id: uid, role: "user"}
	ep := "https://fcm.googleapis.com/fake-half2-" + strings.ReplaceAll(t.Name(), "/", "-")
	body := `{"endpoint":"` + ep + `","keys":{"p256dh":"p256dh-half2","auth":"auth-half2"}}`
	// unauth
	recU := httptest.NewRecorder()
	PushSubscribeHandler(pool)(recU, httptest.NewRequest(http.MethodPost, "/api/push/subscribe", strings.NewReader(body)))
	if recU.Code != http.StatusUnauthorized {
		t.Fatalf("sub unauth = %d", recU.Code)
	}
	// validation branches
	for _, tc := range []struct {
		name string
		body string
		code int
	}{
		{"missing", `{}`, 422},
		{"badurl", `{"endpoint":"not a url","keys":{"p256dh":"a","auth":"b"}}`, 422},
		{"http", `{"endpoint":"http://fcm.googleapis.com/x","keys":{"p256dh":"a","auth":"b"}}`, 422},
		{"loopback", `{"endpoint":"https://127.0.0.1/x","keys":{"p256dh":"a","auth":"b"}}`, 422},
		{"unknown-host", `{"endpoint":"https://evil.example.test/x","keys":{"p256dh":"a","auth":"b"}}`, 422},
		{"missing-keys", `{"endpoint":"` + ep + `"}`, 422},
		{"ok", body, 200},
	} {
		r := httptest.NewRequest(http.MethodPost, "/api/push/subscribe", strings.NewReader(tc.body))
		r = r.WithContext(withCaller(r.Context(), caller))
		rr := httptest.NewRecorder()
		PushSubscribeHandler(pool)(rr, r)
		if rr.Code != tc.code {
			t.Fatalf("sub %s = %d want %d (%s)", tc.name, rr.Code, tc.code, rr.Body.String())
		}
	}
	// unsubscribe branches
	rU := httptest.NewRequest(http.MethodPost, "/api/push/unsubscribe", strings.NewReader(`{}`))
	rU = rU.WithContext(withCaller(rU.Context(), caller))
	rrU := httptest.NewRecorder()
	PushUnsubscribeHandler(pool)(rrU, rU)
	if rrU.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unsub missing = %d", rrU.Code)
	}
	rU2 := httptest.NewRequest(http.MethodPost, "/api/push/unsubscribe", strings.NewReader(`{"endpoint":"https://127.0.0.1/x"}`))
	rU2 = rU2.WithContext(withCaller(rU2.Context(), caller))
	rrU2 := httptest.NewRecorder()
	PushUnsubscribeHandler(pool)(rrU2, rU2)
	if rrU2.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unsub loopback = %d", rrU2.Code)
	}
	rU3 := httptest.NewRequest(http.MethodPost, "/api/push/unsubscribe", strings.NewReader(`{"endpoint":"`+ep+`"}`))
	rU3 = rU3.WithContext(withCaller(rU3.Context(), caller))
	rrU3 := httptest.NewRecorder()
	PushUnsubscribeHandler(pool)(rrU3, rU3)
	if rrU3.Code != http.StatusOK {
		t.Fatalf("unsub ok = %d %s", rrU3.Code, rrU3.Body.String())
	}
	recUU := httptest.NewRecorder()
	PushUnsubscribeHandler(pool)(recUU, httptest.NewRequest(http.MethodPost, "/api/push/unsubscribe", strings.NewReader(`{"endpoint":"`+ep+`"}`)))
	if recUU.Code != http.StatusUnauthorized {
		t.Fatalf("unsub unauth = %d", recUU.Code)
	}
	// helpers direct
	if isIPLiteral("1.2.3.4") != true || isIPLiteral("example.com") != false {
		t.Fatalf("isIPLiteral")
	}
	if got := pushEndpointProblem("::not-url::"); got == "" {
		t.Fatalf("endpoint problem empty")
	}
	pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, ep)
	// push fanout helpers
	if inQuietHours(nil, nil) {
		t.Fatalf("quiet nil")
	}
	yes := "00:00:00"
	_ = yes
	if pushJSONString("a\"b") == "" {
		t.Fatalf("pushJSONString")
	}
	if pushMailFrom() == "" {
		t.Fatalf("pushMailFrom empty")
	}
	if notificationPushURL("x", "y") == "" {
		t.Fatalf("pushURL empty")
	}
	// Regression: the sweep used COALESCE(data,'') which PostgreSQL
	// rejects for a json column (invalid input syntax), so ANY unpushed
	// notification with NULL data failed the whole run. The query now
	// reads COALESCE(data::text, '{}'): NULL data sweeps clean.
	var nullID, jsonID int64
	if err := pool.QueryRow(ctx, `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'half2-null','Null data','Body',NULL) RETURNING id`, uid).Scan(&nullID); err != nil {
		t.Fatalf("insert null-data notification: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'half2-json','JSON data','Body','{"a":1}'::json) RETURNING id`, uid).Scan(&jsonID); err != nil {
		t.Fatalf("insert json-data notification: %v", err)
	}
	os.Unsetenv("VAPID_PUBLIC_KEY")
	os.Unsetenv("VAPID_PRIVATE_KEY")
	discard := slog.New(slog.NewTextHandler(io.Discard, nil))
	if err := SendPendingPushes(ctx, pool, discard); err != nil {
		t.Fatalf("SendPendingPushes with NULL data = %v (json-coalesce regression)", err)
	}
	for _, id := range []int64{nullID, jsonID} {
		var sent bool
		if err := pool.QueryRow(ctx, `SELECT push_sent_at IS NOT NULL FROM notifications WHERE id = $1`, id).Scan(&sent); err != nil || !sent {
			t.Fatalf("notification %d push_sent_at marked = %v, err = %v", id, sent, err)
		}
	}
	pool.Exec(ctx, `DELETE FROM notifications WHERE id = ANY($1)`, []int64{nullID, jsonID})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
