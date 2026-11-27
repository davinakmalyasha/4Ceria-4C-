package httpapi

// hH conversation surfaces: store / show / send were at 0% in the with-DB
// coverprofile. Happy paths with hand-written post-state literals plus
// rejection twins with exact codes and messages.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

var hQSeq int64 = 980001

func hQIDs(prefix string) (email, uname, code string) {
	v := atomic.AddInt64(&hQSeq, 1)
	code = "hH" + itoaTest(v%10000 + 1000)[1:]
	if len(code) > 6 {
		code = code[:6]
	}
	email = strings.ToLower(prefix + "-" + code + "@example.test")
	uname = strings.ToLower(prefix + "-" + code)
	return email, uname, code
}

func hQMkUser(t *testing.T, ctx context.Context, pool *pgxpool.Pool, tag, role string) int64 {
	t.Helper()
	email, uname, code := hQIDs("hH-" + tag)
	var id int64
	for i := 0; i < 5; i++ {
		err := pool.QueryRow(ctx, `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ($1,$2,$3,'x',$4,$5,NOW(),NOW()) RETURNING id`, "hH "+tag, uname, email, role, code).Scan(&id)
		if err == nil {
			return id
		}
		email, uname, code = hQIDs("hH-" + tag + "-r")
	}
	t.Fatalf("seed user %s: failed after retries", tag)
	return 0
}

func hQCleanupUser(ctx context.Context, pool *pgxpool.Pool, userID int64) {
	pool.Exec(ctx, `DELETE FROM chat_messages WHERE sender_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM conversations WHERE user_one_id=$1 OR user_two_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM arsiteks WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user=$1`, userID)
	pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
}

func hQMkProject(t *testing.T, ctx context.Context, pool *pgxpool.Pool, ownerID int64, title string) int64 {
	t.Helper()
	var pid int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,$2,'open',10000000) RETURNING id`, ownerID, title).Scan(&pid); err != nil {
		t.Fatalf("seed project: %v", err)
	}
	return pid
}

func hQMkDispute(t *testing.T, ctx context.Context, pool *pgxpool.Pool, projectID, openedBy int64, title string) int64 {
	t.Helper()
	var did int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES ($1,$2,'quality',$3,'hH desc','open') RETURNING id`, projectID, openedBy, title).Scan(&did); err != nil {
		t.Fatalf("seed dispute: %v", err)
	}
	return did
}

func hQCleanupDisputeProject(ctx context.Context, pool *pgxpool.Pool, pid, owner int64) {
	pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, pid)
	pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, owner)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
}

func hQParseID(s string) int64 {
	var v int64
	for _, ch := range s {
		v = v*10 + int64(ch-'0')
	}
	return v
}

func hQCallStore(pool *pgxpool.Pool, caller *roadmapCaller, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/conversations", strings.NewReader(body))
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	StoreConversationHandler(pool)(rec, r)
	return rec
}

func hQCallIndex(pool *pgxpool.Pool, caller *roadmapCaller, path string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	ConversationsIndexHandler(pool)(rec, r)
	return rec
}

func hQCallShow(pool *pgxpool.Pool, caller *roadmapCaller, convID, path string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	r.SetPathValue("conversation", convID)
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	ShowConversationHandler(pool)(rec, r)
	return rec
}

func hQCallSend(pool *pgxpool.Pool, caller *roadmapCaller, convID, ctype string, body *bytes.Buffer) *httptest.ResponseRecorder {
	var r *http.Request
	if body == nil {
		r = httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(ctype))
	} else {
		r = httptest.NewRequest(http.MethodPost, "/x", body)
		r.Header.Set("Content-Type", ctype)
	}
	r.SetPathValue("conversation", convID)
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	SendMessageHandler(pool)(rec, r)
	return rec
}

func TestHQConversationStore(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	a := hQMkUser(t, ctx, pool, "conva", "user")
	defer hQCleanupUser(ctx, pool, a)
	b := hQMkUser(t, ctx, pool, "convb", "user")
	defer hQCleanupUser(ctx, pool, b)
	aCaller := &roadmapCaller{id: a, role: "user"}

	if rec := hQCallStore(pool, nil, `{}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("store unauth = %d", rec.Code)
	}

	rec := hQCallStore(pool, aCaller, `{}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store missing = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "user_id", "The user id field is required.")

	for _, body := range []string{`{"user_id":"abc"}`, `{"user_id":99009999}`, `{"user_id":0}`} {
		rec := hQCallStore(pool, aCaller, body)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("store invalid %s = %d %s", body, rec.Code, rec.Body.String())
		}
		hCErrors(t, rec, "user_id", "The selected user id is invalid.")
	}

	rec = hQCallStore(pool, aCaller, `{"user_id":`+itoaTest(a)+`}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("store self = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Cannot chat with yourself." {
		t.Fatalf("store self msg = %q", got)
	}

	var adminID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email='admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no admin")
	}
	rec = hQCallStore(pool, aCaller, `{"user_id":`+itoaTest(adminID)+`}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("store staff = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Staff accounts cannot receive direct messages." {
		t.Fatalf("store staff msg = %q", got)
	}

	rec = hQCallStore(pool, aCaller, `{"user_id":`+itoaTest(b)+`}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("store happy = %d %s", rec.Code, rec.Body.String())
	}
	first := int64(hCDecode(t, rec)["data"].(float64))
	rec2 := hQCallStore(pool, aCaller, `{"user_id":`+itoaTest(b)+`}`)
	if rec2.Code != http.StatusOK {
		t.Fatalf("store again = %d %s", rec2.Code, rec2.Body.String())
	}
	if second := int64(hCDecode(t, rec2)["data"].(float64)); second != first {
		t.Fatalf("store idempotent = %d want %d", second, first)
	}
	var one, two int64
	low, high := a, b
	if low > high {
		low, high = high, low
	}
	if err := pool.QueryRow(ctx, `SELECT user_one_id, user_two_id FROM conversations WHERE id=$1`, first).Scan(&one, &two); err != nil {
		t.Fatalf("store row: %v", err)
	}
	if one != low || two != high {
		t.Fatalf("store row = %d/%d want %d/%d", one, two, low, high)
	}
}

func TestHQConversationsIndex(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	a := hQMkUser(t, ctx, pool, "convc", "user")
	defer hQCleanupUser(ctx, pool, a)
	b := hQMkUser(t, ctx, pool, "convd", "arsitek")
	defer hQCleanupUser(ctx, pool, b)
	aCaller := &roadmapCaller{id: a, role: "user"}
	bArsiCaller := &roadmapCaller{id: b, role: "arsitek"}

	if rec := hQCallIndex(pool, nil, "/api/conversations"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("index unauth = %d", rec.Code)
	}

	rec := hQCallIndex(pool, aCaller, "/api/conversations")
	if rec.Code != http.StatusOK {
		t.Fatalf("index empty = %d %s", rec.Code, rec.Body.String())
	}
	body := hCDecode(t, rec)
	if meta := body["meta"].(map[string]any); meta["has_more"].(bool) || meta["per_page"].(float64) != 50 || meta["current_page"].(float64) != 1 {
		t.Fatalf("index empty meta = %v", meta)
	}

	bRec := hQCallStore(pool, bArsiCaller, `{"user_id":`+itoaTest(a)+`}`)
	if bRec.Code != http.StatusOK {
		t.Fatalf("store: %d %s", bRec.Code, bRec.Body.String())
	}
	conv := itoaTest(int64(hCDecode(t, bRec)["data"].(float64)))
	var msgID int64
	if err := pool.QueryRow(ctx, `INSERT INTO chat_messages (conversation_id, sender_id, content, is_read, created_at, updated_at) VALUES ($1,$2,'hH inbox hello',false,date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, hQParseID(conv), b).Scan(&msgID); err != nil {
		t.Fatalf("seed message: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE conversations SET last_message_at = now() WHERE id=$1`, hQParseID(conv)); err != nil {
		t.Fatalf("touch: %v", err)
	}

	rec = hQCallIndex(pool, aCaller, "/api/conversations?per_page=1&page=1")
	if rec.Code != http.StatusOK {
		t.Fatalf("index paged = %d %s", rec.Code, rec.Body.String())
	}
	paged := hCDecode(t, rec)
	items := paged["data"].([]any)
	if len(items) != 1 {
		t.Fatalf("index paged len = %d", len(items))
	}
	first := items[0].(map[string]any)
	other := first["other_user"].(map[string]any)
	if int64(other["id"].(float64)) != b || first["unread_count"].(float64) != 1 {
		t.Fatalf("index item = %v", first)
	}
	if lm, ok := first["last_message"].(map[string]any); !ok || lm["content"].(string) != "hH inbox hello" || lm["is_read"].(bool) {
		t.Fatalf("index last_message = %v", first["last_message"])
	}
	if got := first["last_message_at"]; got == nil {
		t.Fatalf("index last_message_at nil")
	}
	c := hQMkUser(t, ctx, pool, "conve", "user")
	defer hQCleanupUser(ctx, pool, c)
	if _, err := pool.Exec(ctx, `INSERT INTO conversations (user_one_id, user_two_id) VALUES ($1,$2)`, c, a); err != nil {
		t.Fatalf("seed reverse: %v", err)
	}
	rec = hQCallIndex(pool, aCaller, "/api/conversations?per_page=100&page=1")
	if rec.Code != http.StatusOK {
		t.Fatalf("index both = %d", rec.Code)
	}
	seen := map[int64]bool{}
	for _, it := range hCDecode(t, rec)["data"].([]any) {
		seen[int64(it.(map[string]any)["other_user"].(map[string]any)["id"].(float64))] = true
	}
	if !seen[b] || !seen[c] {
		t.Fatalf("index others = %v", seen)
	}
	rec = hQCallIndex(pool, aCaller, "/api/conversations?page=99&per_page=50")
	if rec.Code != http.StatusOK {
		t.Fatalf("index far page = %d", rec.Code)
	}
	far := hCDecode(t, rec)
	if len(far["data"].([]any)) != 0 || far["meta"].(map[string]any)["has_more"].(bool) {
		t.Fatalf("index far = %v", far)
	}
	rec = hQCallIndex(pool, aCaller, "/api/conversations?per_page=1&page=1")
	if !hCDecode(t, rec)["meta"].(map[string]any)["has_more"].(bool) {
		t.Fatalf("index has_more want true")
	}
}

func TestHQConversationShow(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	a := hQMkUser(t, ctx, pool, "convf", "user")
	defer hQCleanupUser(ctx, pool, a)
	b := hQMkUser(t, ctx, pool, "convg", "user")
	defer hQCleanupUser(ctx, pool, b)
	out := hQMkUser(t, ctx, pool, "convh", "user")
	defer hQCleanupUser(ctx, pool, out)
	aCaller := &roadmapCaller{id: a, role: "user"}
	outCaller := &roadmapCaller{id: out, role: "user"}

	var conv int64
	if err := pool.QueryRow(ctx, `INSERT INTO conversations (user_one_id, user_two_id) VALUES ($1,$2) RETURNING id`, a, b).Scan(&conv); err != nil {
		t.Fatalf("seed conv: %v", err)
	}
	var m1, m2 int64
	if err := pool.QueryRow(ctx, `INSERT INTO chat_messages (conversation_id, sender_id, content, is_read, created_at, updated_at) VALUES ($1,$2,'hH first',true,date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, conv, a).Scan(&m1); err != nil {
		t.Fatalf("seed m1: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO chat_messages (conversation_id, sender_id, content, is_read, created_at, updated_at) VALUES ($1,$2,'hH second',false,date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, conv, b).Scan(&m2); err != nil {
		t.Fatalf("seed m2: %v", err)
	}
	cs := itoaTest(conv)

	if rec := hQCallShow(pool, nil, cs, "/x"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("show unauth = %d", rec.Code)
	}
	rec := hQCallShow(pool, aCaller, "hH-bad", "/x")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("show bad = %d", rec.Code)
	}
	if got := hCDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\Conversation] hH-bad` {
		t.Fatalf("show bad msg = %q", got)
	}
	if rec := hQCallShow(pool, aCaller, "99009999", "/x"); rec.Code != http.StatusNotFound {
		t.Fatalf("show missing = %d", rec.Code)
	}
	rec = hQCallShow(pool, outCaller, cs, "/x")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("show forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Unauthorized" {
		t.Fatalf("show forbidden msg = %q", got)
	}

	rec = hQCallShow(pool, aCaller, cs, "/x")
	if rec.Code != http.StatusOK {
		t.Fatalf("show happy = %d %s", rec.Code, rec.Body.String())
	}
	shown := hCDecode(t, rec)
	data := shown["data"].([]any)
	if len(data) != 2 {
		t.Fatalf("show len = %d", len(data))
	}
	if data[0].(map[string]any)["content"].(string) != "hH second" || data[1].(map[string]any)["content"].(string) != "hH first" {
		t.Fatalf("show order = %v", data)
	}
	meta := shown["meta"].(map[string]any)
	if int64(meta["oldest_id"].(float64)) != m2 || meta["has_more"].(bool) {
		t.Fatalf("show meta = %v want oldest %d", meta, m2)
	}
	if _, ok := data[0].(map[string]any)["sender"]; !ok {
		t.Fatalf("show sender missing")
	}
	var isRead bool
	if err := pool.QueryRow(ctx, `SELECT is_read FROM chat_messages WHERE id=$1`, m2).Scan(&isRead); err != nil || !isRead {
		t.Fatalf("show mark-read = %v %v", isRead, err)
	}

	var m3 int64
	if err := pool.QueryRow(ctx, `INSERT INTO chat_messages (conversation_id, sender_id, content, is_read, created_at, updated_at) VALUES ($1,$2,'hH third',false,date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, conv, b).Scan(&m3); err != nil {
		t.Fatalf("seed m3: %v", err)
	}
	rec = hQCallShow(pool, aCaller, cs, "/x?before_id="+itoaTest(m2))
	if rec.Code != http.StatusOK {
		t.Fatalf("show cursor = %d %s", rec.Code, rec.Body.String())
	}
	cur := hCDecode(t, rec)
	cdata := cur["data"].([]any)
	if len(cdata) != 1 || cdata[0].(map[string]any)["content"].(string) != "hH first" {
		t.Fatalf("show cursor data = %v", cdata)
	}
	if int64(cur["meta"].(map[string]any)["oldest_id"].(float64)) != m1 {
		t.Fatalf("show cursor meta = %v", cur["meta"])
	}
	var stillUnread bool
	if err := pool.QueryRow(ctx, `SELECT NOT is_read FROM chat_messages WHERE id=$1`, m3).Scan(&stillUnread); err != nil || !stillUnread {
		t.Fatalf("cursor must not mark read: %v %v", stillUnread, err)
	}
	var conv2 int64
	if err := pool.QueryRow(ctx, `INSERT INTO conversations (user_one_id, user_two_id) VALUES ($1,$2) RETURNING id`, a, out).Scan(&conv2); err != nil {
		t.Fatalf("seed conv2: %v", err)
	}
	rec = hQCallShow(pool, aCaller, itoaTest(conv2), "/x")
	if rec.Code != http.StatusOK {
		t.Fatalf("show empty = %d", rec.Code)
	}
	emptyMeta := hCDecode(t, rec)["meta"].(map[string]any)
	if emptyMeta["oldest_id"] != nil || emptyMeta["has_more"].(bool) {
		t.Fatalf("show empty meta = %v", emptyMeta)
	}
}

func TestHQConversationSend(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())
	a := hQMkUser(t, ctx, pool, "convi", "user")
	defer hQCleanupUser(ctx, pool, a)
	b := hQMkUser(t, ctx, pool, "convj", "user")
	defer hQCleanupUser(ctx, pool, b)
	out := hQMkUser(t, ctx, pool, "convk", "user")
	defer hQCleanupUser(ctx, pool, out)
	aCaller := &roadmapCaller{id: a, role: "user"}
	bCaller := &roadmapCaller{id: b, role: "user"}
	outCaller := &roadmapCaller{id: out, role: "user"}

	var conv int64
	if err := pool.QueryRow(ctx, `INSERT INTO conversations (user_one_id, user_two_id) VALUES ($1,$2) RETURNING id`, a, b).Scan(&conv); err != nil {
		t.Fatalf("seed conv: %v", err)
	}
	cs := itoaTest(conv)
	jsonBody := func(s string) (string, *bytes.Buffer) { return "application/json", bytes.NewBufferString(s) }

	ct, buf := jsonBody(`{"content":"x"}`)
	if rec := hQCallSend(pool, nil, cs, ct, buf); rec.Code != http.StatusUnauthorized {
		t.Fatalf("send unauth = %d", rec.Code)
	}
	ct, buf = jsonBody(`{"content":"x"}`)
	if rec := hQCallSend(pool, aCaller, "hH-bad", ct, buf); rec.Code != http.StatusNotFound {
		t.Fatalf("send bad = %d", rec.Code)
	}
	ct, buf = jsonBody(`{"content":"x"}`)
	if rec := hQCallSend(pool, aCaller, "99009999", ct, buf); rec.Code != http.StatusNotFound {
		t.Fatalf("send missing = %d", rec.Code)
	}
	ct, buf = jsonBody(`{"content":"x"}`)
	rec := hQCallSend(pool, outCaller, cs, ct, buf)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("send forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Unauthorized" {
		t.Fatalf("send forbidden msg = %q", got)
	}

	ct, buf = jsonBody(`{}`)
	if rec := hQCallSend(pool, aCaller, cs, ct, buf); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("send empty = %d", rec.Code)
	} else {
		hCErrors(t, rec, "content", "The content field is required when image is not present.")
	}
	ct, buf = jsonBody(`{"content":123}`)
	if rec := hQCallSend(pool, aCaller, cs, ct, buf); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("send type = %d", rec.Code)
	} else {
		hCErrors(t, rec, "content", "The content field must be a string.")
	}
	ct, buf = jsonBody(`{"content":"` + strings.Repeat("x", 4001) + `"}`)
	if rec := hQCallSend(pool, aCaller, cs, ct, buf); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("send long = %d", rec.Code)
	} else {
		hCErrors(t, rec, "content", "The content field must not be greater than 4000 characters.")
	}

	pngHead := append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, bytes.Repeat([]byte{0}, 64)...)
	var mbuf bytes.Buffer
	mw := multipart.NewWriter(&mbuf)
	_ = mw.WriteField("content", "")
	fw, _ := mw.CreateFormFile("image", "hH-note.txt")
	_, _ = fw.Write([]byte("plain text, not an image"))
	_ = mw.Close()
	if rec := hQCallSend(pool, aCaller, cs, mw.FormDataContentType(), &mbuf); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("send txt = %d %s", rec.Code, rec.Body.String())
	} else {
		hCErrors(t, rec, "image", "The image field must be an image.")
	}
	var mbuf2 bytes.Buffer
	mw2 := multipart.NewWriter(&mbuf2)
	_ = mw2.WriteField("content", "hH pic")
	fw2, _ := mw2.CreateFormFile("image", "hH-pic.gif")
	_, _ = fw2.Write(pngHead)
	_ = mw2.Close()
	if rec := hQCallSend(pool, aCaller, cs, mw2.FormDataContentType(), &mbuf2); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("send gif = %d %s", rec.Code, rec.Body.String())
	} else {
		hCErrors(t, rec, "image", "The image field must be a file of type: jpeg, png, jpg.")
	}

	ct, buf = jsonBody(`{"content":"hH hello there"}`)
	rec = hQCallSend(pool, aCaller, cs, ct, buf)
	if rec.Code != http.StatusOK {
		t.Fatalf("send happy = %d %s", rec.Code, rec.Body.String())
	}
	sent := hCDecode(t, rec)["data"].(map[string]any)
	if sent["content"].(string) != "hH hello there" || int64(sent["sender_id"].(float64)) != a || int64(sent["conversation_id"].(float64)) != conv {
		t.Fatalf("send data = %v", sent)
	}
	if sent["image_url"] != nil {
		t.Fatalf("send image_url = %v want nil", sent["image_url"])
	}
	var dbContent string
	var dbSender int64
	var dbRead bool
	if err := pool.QueryRow(ctx, `SELECT content, sender_id, is_read FROM chat_messages WHERE id=$1`, int64(sent["id"].(float64))).Scan(&dbContent, &dbSender, &dbRead); err != nil {
		t.Fatalf("send row: %v", err)
	}
	if dbContent != "hH hello there" || dbSender != a || dbRead {
		t.Fatalf("send row = %q %d %v", dbContent, dbSender, dbRead)
	}
	var touched bool
	_ = pool.QueryRow(ctx, `SELECT last_message_at IS NOT NULL FROM conversations WHERE id=$1`, conv).Scan(&touched)
	if !touched {
		t.Fatalf("send did not bump last_message_at")
	}
	var nTitle, nBody string
	if err := pool.QueryRow(ctx, `SELECT title, body FROM notifications WHERE user_id=$1 AND type='chat_message' ORDER BY id DESC LIMIT 1`, b).Scan(&nTitle, &nBody); err != nil {
		t.Fatalf("send notify: %v", err)
	}
	if nTitle != "Pesan Baru" || !strings.Contains(nBody, "hH hello there") {
		t.Fatalf("send notify = %q %q", nTitle, nBody)
	}

	var mbuf3 bytes.Buffer
	mw3 := multipart.NewWriter(&mbuf3)
	_ = mw3.WriteField("content", "")
	fw3, _ := mw3.CreateFormFile("image", "hH-shot.png")
	_, _ = fw3.Write(append(pngHead, bytes.Repeat([]byte{1}, 128)...))
	_ = mw3.Close()
	rec = hQCallSend(pool, bCaller, cs, mw3.FormDataContentType(), &mbuf3)
	if rec.Code != http.StatusOK {
		t.Fatalf("send image = %d %s", rec.Code, rec.Body.String())
	}
	imgSent := hCDecode(t, rec)["data"].(map[string]any)
	imgURL, _ := imgSent["image_url"].(string)
	if !strings.HasPrefix(imgURL, "/storage/chat_images/") {
		t.Fatalf("send image_url = %q", imgURL)
	}
	var dbImage *string
	_ = pool.QueryRow(ctx, `SELECT image FROM chat_messages WHERE id=$1`, int64(imgSent["id"].(float64))).Scan(&dbImage)
	if dbImage == nil || !strings.HasPrefix(*dbImage, "chat_images/") {
		t.Fatalf("send image row = %v", dbImage)
	}
}
