package httpapi

// hL report/store/conversation/comment/push twins: validation envelopes,
// gate rejections and literal post-state on the paths the earlier sweeps
// left uncovered.

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHLReportValidation(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	p := hLProjectPath(fx.projectID)

	bad := map[string]string{"project": "abc"}
	if rec := hLCall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, bad); rec.Code != http.StatusNotFound {
		t.Fatalf("reports bad id = %d", rec.Code)
	}
	if rec := hLCall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", nil, p); rec.Code != http.StatusUnauthorized {
		t.Fatalf("reports anon = %d", rec.Code)
	}
	if rec := hLCall(t, ProjectReportsIndexHandler(pool), http.MethodGet, "/x", "", &fx.stranger, p); rec.Code != http.StatusForbidden {
		t.Fatalf("reports stranger = %d", rec.Code)
	}
	if rec := hLCall(t, StoreReportHandler(pool), http.MethodPost, "/x", `{"summary":"hL"}`, &fx.stranger, p); rec.Code != http.StatusForbidden {
		t.Fatalf("report store stranger = %d", rec.Code)
	}
	// Missing fields use the controller's custom envelope.
	rec := hLCall(t, StoreReportHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report empty = %d", rec.Code)
	}
	if msg := hLDecode(t, rec)["message"].(string); msg != "The given data was invalid." {
		t.Fatalf("report envelope = %q", msg)
	}
	// Progress and health twins.
	for _, tc := range []struct {
		name, body, field, msg string
	}{
		{"progress text", `{"summary":"hL","progress_percentage":"x","budget_health":"on_track"}`, "progress_percentage", "The progress percentage field must be an integer."},
		{"progress low", `{"summary":"hL","progress_percentage":-1,"budget_health":"on_track"}`, "progress_percentage", "The progress percentage field must be at least 0."},
		{"progress high", `{"summary":"hL","progress_percentage":101,"budget_health":"on_track"}`, "progress_percentage", "The progress percentage field must not be greater than 100."},
		{"health bad", `{"summary":"hL","progress_percentage":10,"budget_health":"sick"}`, "budget_health", "The selected budget health is invalid."},
		{"health type", `{"summary":"hL","progress_percentage":10,"budget_health":7}`, "budget_health", "The selected budget health is invalid."},
	} {
		rec := hLCall(t, StoreReportHandler(pool), http.MethodPost, "/x", tc.body, &fx.owner, p)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s = %d, want 422", tc.name, rec.Code)
		}
		errs := hLDecode(t, rec)["errors"].(map[string]any)[tc.field].([]any)
		if len(errs) != 1 || errs[0].(string) != tc.msg {
			t.Fatalf("%s errors = %v", tc.name, errs)
		}
	}
	// Photo with a non-image extension is a 422 with the indexed key.
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("summary", "hL")
	_ = mw.WriteField("progress_percentage", "10")
	_ = mw.WriteField("budget_health", "on_track")
	fw, _ := mw.CreateFormFile("photos", "hL.txt")
	_, _ = fw.Write([]byte("not an image"))
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/x", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	for k, v := range p {
		req.SetPathValue(k, v)
	}
	req = req.WithContext(withCaller(req.Context(), fx.owner))
	mrec := httptest.NewRecorder()
	StoreReportHandler(pool)(mrec, req)
	if mrec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report photo type = %d %s", mrec.Code, mrec.Body.String())
	}
	// Multipart that cannot parse is the invalid envelope.
	broken := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader("--broken"))
	broken.Header.Set("Content-Type", "multipart/form-data; boundary=broken")
	for k, v := range p {
		broken.SetPathValue(k, v)
	}
	broken = broken.WithContext(withCaller(broken.Context(), fx.owner))
	brec := httptest.NewRecorder()
	StoreReportHandler(pool)(brec, broken)
	if brec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("report broken multipart = %d", brec.Code)
	}

	// Happy store as owner with a phase slug; literal post-state.
	rec = hLCall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hL week one","progress_percentage":25,"budget_health":"warning","phase_slug":"design"}`, &fx.owner, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("report store = %d %s", rec.Code, rec.Body.String())
	}
	report := hLDecode(t, rec)["report"].(map[string]any)
	if report["summary"] != "hL week one" || report["progress_percentage"] != float64(25) || report["phase_slug"] != "design" {
		t.Fatalf("report = %v", report)
	}
	rid := int64(report["id"].(float64))
	var dbSummary, dbHealth string
	var dbProgress int
	if err := pool.QueryRow(ctx, `SELECT summary, progress_percentage, budget_health::text FROM project_reports WHERE id=$1`, rid).Scan(&dbSummary, &dbProgress, &dbHealth); err != nil {
		t.Fatalf("report row: %v", err)
	}
	if dbSummary != "hL week one" || dbProgress != 25 || dbHealth != "warning" {
		t.Fatalf("report post-state = %q %d %q", dbSummary, dbProgress, dbHealth)
	}

	// Update forbidden for a stranger; missing report 404; empty update 422.
	rp := map[string]string{"project": int64String(fx.projectID), "report": int64String(rid)}
	if rec := hLCall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"summary":"hL x"}`, &fx.stranger, rp); rec.Code != http.StatusForbidden {
		t.Fatalf("report update stranger = %d", rec.Code)
	}
	if rec := hLCall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"summary":"hL x"}`, &fx.owner,
		map[string]string{"project": int64String(fx.projectID), "report": "19999983"}); rec.Code != http.StatusNotFound {
		t.Fatalf("report update missing = %d", rec.Code)
	}
	// Update happy as creator (owner created it): summary changes.
	rec = hLCall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"summary":"hL week two","progress_percentage":50}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("report update = %d %s", rec.Code, rec.Body.String())
	}
	var updated string
	_ = pool.QueryRow(ctx, `SELECT summary FROM project_reports WHERE id=$1`, rid).Scan(&updated)
	if updated != "hL week two" {
		t.Fatalf("report updated = %q", updated)
	}
	// Delete forbidden for arsitek (participant, not creator/owner); happy
	// for the owner with the exact message.
	if rec := hLCall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.arsitek, rp); rec.Code != http.StatusForbidden {
		t.Fatalf("report delete arsitek = %d %s", rec.Code, rec.Body.String())
	}
	rec = hLCall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Report deleted successfully.") {
		t.Fatalf("report delete = %d %s", rec.Code, rec.Body.String())
	}
	var left int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_reports WHERE id=$1`, rid).Scan(&left)
	if left != 0 {
		t.Fatalf("report left = %d", left)
	}
}

func TestHLStoreProjectTwins(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())

	base := `{"title":"hL Minimal","description":"hL d","budget":7500000,"lokasi":"hL City","project_category":"new_build","deadline":"2027-06-01"}`
	rec := hLCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", base, &fx.stranger, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store minimal = %d %s", rec.Code, rec.Body.String())
	}
	pid := int64(hLDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	defer pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	// Published roles default empty; target_role null (never-memory rule).
	data := hLDecode(t, rec)["data"].(map[string]any)
	if roles, _ := data["published_bidding_roles"].([]any); len(roles) != 0 {
		t.Fatalf("published = %v", roles)
	}
	if data["target_role"] != nil {
		t.Fatalf("target_role = %v, want nil", data["target_role"])
	}
	if data["planning_status"] != nil || data["requires_structural"] != nil {
		t.Fatalf("defaults not nil: %v", data)
	}

	// Budget twins: missing, non-numeric, negative.
	for _, tc := range []struct {
		name, body, msg string
	}{
		{"budget missing", `{"title":"hL","description":"hL","lokasi":"hL","project_category":"new_build","deadline":"2027-01-01"}`, "The budget field is required."},
		{"budget text", `{"title":"hL","description":"hL","budget":"abc","lokasi":"hL","project_category":"new_build","deadline":"2027-01-01"}`, "The budget field must be a number."},
		{"budget negative", `{"title":"hL","description":"hL","budget":-5,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01"}`, "The budget field must be at least 0."},
	} {
		rec := hLCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", tc.body, &fx.stranger, nil)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s = %d, want 422", tc.name, rec.Code)
		}
		if errs := hLDecode(t, rec)["errors"].(map[string]any)["budget"].([]any); errs[0].(string) != tc.msg {
			t.Fatalf("%s errors = %v", tc.name, errs)
		}
	}
	// JSON document twins: dimensions and vendors must decode.
	for _, tc := range []struct {
		name, body, field, msg string
	}{
		{"dimensions", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01","project_dimensions":"{oops"}`, "project_dimensions", "The project dimensions field must be a valid JSON string."},
		{"vendors", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01","external_vendors":"[1,2"}`, "external_vendors", "The external vendors field must be a valid JSON string."},
		{"needed", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01","needed_phases":"{oops"}`, "needed_phases", "The needed phases field must be a string."},
		{"choices", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01","bidding_choices":"{oops"}`, "bidding_choices", "The bidding choices field must be a valid JSON string."},
	} {
		rec := hLCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", tc.body, &fx.stranger, nil)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s = %d, want 422", tc.name, rec.Code)
		}
		if errs := hLDecode(t, rec)["errors"].(map[string]any)[tc.field].([]any); errs[0].(string) != tc.msg {
			t.Fatalf("%s errors = %v", tc.name, errs)
		}
	}
	// Flag twins: non-boolean wants.
	rec = hLCall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01","wants_project_manager":"maybe"}`, &fx.stranger, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("wants flag = %d", rec.Code)
	}
	// jsonDocument direct: non-string invalid, empty string valid-nil.
	if _, ok := jsonDocument(42); ok {
		t.Fatalf("jsonDocument int ok")
	}
	if v, ok := jsonDocument(""); !ok || v != nil {
		t.Fatalf("jsonDocument empty = %v %v", v, ok)
	}
	// Malformed request fields: the handler answers invalid, not 500.
	broken := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader("{oops"))
	broken.Header.Set("Content-Type", "application/json")
	broken = broken.WithContext(withCaller(broken.Context(), fx.stranger))
	brec := httptest.NewRecorder()
	StoreProjectHandler(pool)(brec, broken)
	if brec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store broken = %d", brec.Code)
	}

	// Empty object: every required field fires (literals).
	rec = hLCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", `{}`, &fx.stranger, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store empty = %d", rec.Code)
	}
	for _, tc := range []struct {
		field, msg string
	}{
		{"title", "The title field is required."},
		{"description", "The description field is required."},
		{"budget", "The budget field is required."},
		{"lokasi", "The lokasi field is required."},
		{"project_category", "The project category field is required."},
		{"deadline", "The deadline field is required."},
	} {
		if errs := hLDecode(t, rec)["errors"].(map[string]any)[tc.field].([]any); errs[0].(string) != tc.msg {
			t.Fatalf("empty %s = %v", tc.field, errs)
		}
	}
	// Category / target / deadline / legal-detail twins.
	for _, tc := range []struct {
		name, body, field, msg string
	}{
		{"category type", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":7,"deadline":"2027-01-01"}`, "project_category", "The selected project category is invalid."},
		{"category value", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"castle","deadline":"2027-01-01"}`, "project_category", "The selected project category is invalid."},
		{"target role", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01","target_role":"wizard"}`, "target_role", "The selected target role is invalid."},
		{"deadline type", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":7}`, "deadline", "The deadline field must be a valid date."},
		{"deadline value", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":"not-a-date"}`, "deadline", "The deadline field must be a valid date."},
		{"legal type", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01","legal_detail":7}`, "legal_detail", "The legal detail field must be a string."},
		{"discuss flag", `{"title":"hL","description":"hL","budget":1,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01","wants_to_discuss_later":"maybe"}`, "wants_to_discuss_later", "The wants to discuss later field must be true or false."},
	} {
		rec := hLCall(t, StoreProjectHandler(pool), http.MethodPost, "/x", tc.body, &fx.stranger, nil)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s = %d, want 422", tc.name, rec.Code)
		}
		if errs := hLDecode(t, rec)["errors"].(map[string]any)[tc.field].([]any); errs[0].(string) != tc.msg {
			t.Fatalf("%s errors = %v", tc.name, errs)
		}
	}

	// Optionals happy: phases publish roles, documents decode, vendor
	// without contact is skipped, target role sticks.
	rec = hLCall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hL Full","description":"hL d","budget":9000000,"lokasi":"hL","project_category":"renovation","deadline":"2027-08-01","target_role":"kontraktor","needed_phases":"[\"design\",\"build\"]","project_dimensions":"{\"luas\":100}","bidding_choices":"[\"x\"]","external_vendors":"{\"kontraktor\":{\"company_name\":\"hL Co\"}}","legal_detail":"hL legal","latitude":"-6.2","wants_to_discuss_later":true}`,
		&fx.stranger, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store full = %d %s", rec.Code, rec.Body.String())
	}
	full := hLDecode(t, rec)["data"].(map[string]any)
	roles, _ := full["published_bidding_roles"].([]any)
	// The external kontraktor vendor suppresses the kontraktor publish.
	if len(roles) != 1 || roles[0].(string) != "arsitek" {
		t.Fatalf("published = %v", roles)
	}
	if full["target_role"] != "kontraktor" {
		t.Fatalf("target_role = %v", full["target_role"])
	}
	fullID := int64(full["id"].(float64))
	defer pool.Exec(ctx, `DELETE FROM project_external_vendors WHERE project_id=$1`, fullID)
	defer pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, fullID)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, fullID)
	var vendorCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_external_vendors WHERE project_id=$1`, fullID).Scan(&vendorCount)
	if vendorCount != 0 {
		t.Fatalf("contactless vendor inserted = %d", vendorCount)
	}
	// Without vendors every needed phase publishes its role.
	rec = hLCall(t, StoreProjectHandler(pool), http.MethodPost, "/x",
		`{"title":"hL Bare","description":"hL d","budget":9000000,"lokasi":"hL","project_category":"renovation","deadline":"2027-08-01","needed_phases":"[\"design\",\"build\"]"}`,
		&fx.stranger, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store bare = %d %s", rec.Code, rec.Body.String())
	}
	bare := hLDecode(t, rec)["data"].(map[string]any)
	broles, _ := bare["published_bidding_roles"].([]any)
	if len(broles) != 2 || broles[0].(string) != "arsitek" || broles[1].(string) != "kontraktor" {
		t.Fatalf("bare published = %v", broles)
	}
	bareID := int64(bare["id"].(float64))
	defer pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, bareID)
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, bareID)
}

func TestHLConversationExtras(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)

	var conv int64
	if err := pool.QueryRow(ctx, `INSERT INTO conversations (user_one_id, user_two_id) VALUES ($1,$2) RETURNING id`, fx.owner.id, fx.arsitek.id).Scan(&conv); err != nil {
		t.Fatalf("seed conv: %v", err)
	}
	cs := int64String(conv)

	// per_page over the cap clamps to 100 (meta literal).
	rec := hLCall(t, ConversationsIndexHandler(pool), http.MethodGet, "/api/conversations?per_page=500", "", &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("index cap = %d", rec.Code)
	}
	if meta := hLDecode(t, rec)["meta"].(map[string]any); meta["per_page"].(float64) != 100 {
		t.Fatalf("per_page cap = %v", meta)
	}
	// Garbage page falls back to page 1.
	rec = hLCall(t, ConversationsIndexHandler(pool), http.MethodGet, "/api/conversations?page=zzz", "", &fx.owner, nil)
	if rec.Code != http.StatusOK || hLDecode(t, rec)["meta"].(map[string]any)["current_page"].(float64) != 1 {
		t.Fatalf("bad page = %d %s", rec.Code, rec.Body.String())
	}
	// Self-chat is a 400 with the exact sentence.
	rec = hLCall(t, StoreConversationHandler(pool), http.MethodPost, "/x", `{"user_id":`+int64String(fx.owner.id)+`}`, &fx.owner, nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("self chat = %d", rec.Code)
	} else if !strings.Contains(rec.Body.String(), "Cannot chat with yourself.") {
		t.Fatalf("self chat body = %s", rec.Body.String())
	}
	// Missing user id 422 pin (ghost target).
	rec = hLCall(t, StoreConversationHandler(pool), http.MethodPost, "/x", `{"user_id":19999984}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store ghost = %d", rec.Code)
	}

	// Show without a bound path value falls back to the URL segment.
	req := httptest.NewRequest(http.MethodGet, "/api/conversations/"+cs, nil)
	req = req.WithContext(withCaller(req.Context(), fx.arsitek))
	showRec := httptest.NewRecorder()
	ShowConversationHandler(pool)(showRec, req)
	if showRec.Code != http.StatusOK {
		t.Fatalf("show fallback = %d %s", showRec.Code, showRec.Body.String())
	}
	// Show with a garbage cursor ignores it (no 500).
	req = httptest.NewRequest(http.MethodGet, "/api/conversations/"+cs+"?before_id=zzz", nil)
	req.SetPathValue("conversation", cs)
	req = req.WithContext(withCaller(req.Context(), fx.arsitek))
	curRec := httptest.NewRecorder()
	ShowConversationHandler(pool)(curRec, req)
	if curRec.Code != http.StatusOK {
		t.Fatalf("show bad cursor = %d", curRec.Code)
	}
	// Send without a bound path value resolves the id from the URL tail.
	sreq := httptest.NewRequest(http.MethodPost, "/api/conversations/"+cs+"/messages", strings.NewReader(`{"content":"hL tail"}`))
	sreq.Header.Set("Content-Type", "application/json")
	sreq = sreq.WithContext(withCaller(sreq.Context(), fx.owner))
	srec := httptest.NewRecorder()
	SendMessageHandler(pool)(srec, sreq)
	if srec.Code != http.StatusOK {
		t.Fatalf("send fallback = %d %s", srec.Code, srec.Body.String())
	}
	var tailCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM chat_messages WHERE conversation_id=$1 AND content='hL tail'`, conv).Scan(&tailCount)
	if tailCount != 1 {
		t.Fatalf("tail message = %d", tailCount)
	}
	// Oversize image is a 422 with the exact sentence.
	var big bytes.Buffer
	mw := multipart.NewWriter(&big)
	_ = mw.WriteField("content", "")
	fw, _ := mw.CreateFormFile("image", "hL-big.png")
	_, _ = fw.Write(append([]byte{0x89, 'P', 'N', 'G'}, bytes.Repeat([]byte{1}, 6*1024*1024)...))
	_ = mw.Close()
	breq := httptest.NewRequest(http.MethodPost, "/x", &big)
	breq.Header.Set("Content-Type", mw.FormDataContentType())
	breq.SetPathValue("conversation", cs)
	breq = breq.WithContext(withCaller(breq.Context(), fx.owner))
	brec := httptest.NewRecorder()
	SendMessageHandler(pool)(brec, breq)
	if brec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("send big image = %d", brec.Code)
	} else if !strings.Contains(brec.Body.String(), "The image field must not be greater than 5120 kilobytes.") {
		t.Fatalf("send big body = %s", brec.Body.String()[:300])
	}
	// Broken multipart is the invalid envelope.
	mreq := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader("--broken"))
	mreq.Header.Set("Content-Type", "multipart/form-data; boundary=broken")
	mreq.SetPathValue("conversation", cs)
	mreq = mreq.WithContext(withCaller(mreq.Context(), fx.owner))
	mrec := httptest.NewRecorder()
	SendMessageHandler(pool)(mrec, mreq)
	if mrec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("send broken multipart = %d", mrec.Code)
	}
	// Malformed JSON falls back to an empty field set (the ferr leg),
	// which then fails the content-required rule.
	jreq := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader("{oops"))
	jreq.Header.Set("Content-Type", "application/json")
	jreq.SetPathValue("conversation", cs)
	jreq = jreq.WithContext(withCaller(jreq.Context(), fx.owner))
	jrec := httptest.NewRecorder()
	SendMessageHandler(pool)(jrec, jreq)
	if jrec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("send broken json = %d", jrec.Code)
	} else if !strings.Contains(jrec.Body.String(), "The content field is required when image is not present.") {
		t.Fatalf("send broken json body = %s", jrec.Body.String())
	}
}

func TestHLCommentExtras(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)
	p := hLProjectPath(fx.projectID)

	// Top-level store notifies the owner (post-state literal on inbox).
	rec := hLCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x", `{"message":"hL owner ping"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("store = %d %s", rec.Code, rec.Body.String())
	}
	var notified int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='project_message'`, fx.owner.id).Scan(&notified)
	if notified != 1 {
		t.Fatalf("comment notify owner = %d", notified)
	}
	// Cross-project parent is the 422 binding message (not the exists rule).
	var otherComment int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_comments (project_id, user_id, message) VALUES ($1,$2,'hL other') RETURNING id`, fx.project2ID, fx.owner.id).Scan(&otherComment)
	rec = hLCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x",
		`{"message":"hL x","parent_id":`+int64String(otherComment)+`}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("cross parent = %d", rec.Code)
	} else if !strings.Contains(rec.Body.String(), "Invalid parent comment.") {
		t.Fatalf("cross parent body = %s", rec.Body.String())
	}
	// Non-integer parent is the exists rule.
	rec = hLCall(t, ProjectCommentsStoreHandler(pool), http.MethodPost, "/x", `{"message":"hL x","parent_id":"abc"}`, &fx.owner, p)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("parent text = %d", rec.Code)
	}
	// Update with a non-string message and overlong message are 422 twins.
	var cid int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_comments WHERE project_id=$1 AND message='hL owner ping'`, fx.projectID).Scan(&cid)
	up := map[string]string{"project": int64String(fx.projectID), "comment": int64String(cid)}
	if rec := hLCall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{"message":7}`, &fx.arsitek, up); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update type = %d", rec.Code)
	}
	if rec := hLCall(t, UpdateCommentHandler(pool), http.MethodPut, "/x", `{"message":"`+strings.Repeat("x", 1001)+`"}`, &fx.arsitek, up); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update long = %d", rec.Code)
	}
}

func TestHLSubscribeTwins(t *testing.T) {
	pool := hLPool(t)
	fx := hLSetup(t, pool)

	ep := "https://updates.push.services.mozilla.com/hL-sub-1030001"
	// keys present but not an object: the required twin on keys.p256dh.
	rec := hLCall(t, PushSubscribeHandler(pool), http.MethodPost, "/x",
		`{"endpoint":"`+ep+`","keys":"hL"}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("keys type = %d %s", rec.Code, rec.Body.String())
	}
	// Unrecognized vendor host: 422 with the exact sentence.
	rec = hLCall(t, PushSubscribeHandler(pool), http.MethodPost, "/x",
		`{"endpoint":"https://push.example.test/hL","keys":{"p256dh":"a","auth":"b"}}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "Unrecognized push service endpoint.") {
		t.Fatalf("vendor = %d %s", rec.Code, rec.Body.String())
	}
	// Loopback is an invalid endpoint.
	rec = hLCall(t, PushSubscribeHandler(pool), http.MethodPost, "/x",
		`{"endpoint":"https://127.0.0.1/hL","keys":{"p256dh":"a","auth":"b"}}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "Invalid push endpoint.") {
		t.Fatalf("loopback = %d %s", rec.Code, rec.Body.String())
	}
	// Unsubscribe to an unrecognized host: same sentence, same code.
	rec = hLCall(t, PushUnsubscribeHandler(pool), http.MethodPost, "/x",
		`{"endpoint":"https://push.example.test/hL"}`, &fx.owner, nil)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "Unrecognized push service endpoint.") {
		t.Fatalf("unsub vendor = %d %s", rec.Code, rec.Body.String())
	}
	// Malformed subscribe body falls back to required endpoint.
	broken := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader("{oops"))
	broken.Header.Set("Content-Type", "application/json")
	broken = broken.WithContext(withCaller(broken.Context(), fx.owner))
	brec := httptest.NewRecorder()
	PushSubscribeHandler(pool)(brec, broken)
	if brec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sub broken = %d", brec.Code)
	}
	// Subscribe twice upserts (no duplicate), then unsubscribe removes.
	okBody := `{"endpoint":"` + ep + `","keys":{"p256dh":"hLp","auth":"hLa"}}`
	if rec := hLCall(t, PushSubscribeHandler(pool), http.MethodPost, "/x", okBody, &fx.owner, nil); rec.Code != http.StatusOK {
		t.Fatalf("sub = %d %s", rec.Code, rec.Body.String())
	}
	if rec := hLCall(t, PushSubscribeHandler(pool), http.MethodPost, "/x", okBody, &fx.owner, nil); rec.Code != http.StatusOK {
		t.Fatalf("resub = %d %s", rec.Code, rec.Body.String())
	}
	var n int
	_ = pool.QueryRow(context.Background(), `SELECT count(*) FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`, fx.owner.id, ep).Scan(&n)
	if n != 1 {
		t.Fatalf("sub rows = %d, want 1", n)
	}
	if rec := hLCall(t, PushUnsubscribeHandler(pool), http.MethodPost, "/x", `{"endpoint":"`+ep+`"}`, &fx.owner, nil); rec.Code != http.StatusOK {
		t.Fatalf("unsub = %d %s", rec.Code, rec.Body.String())
	}
}
