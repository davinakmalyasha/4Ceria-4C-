package httpapi

// hB single reads/writes: public brief, subspecialties, my-bids,
// hire history, delivery jobs, verification documents, house Q&A,
// room deletion and the generic upload endpoint.

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

func TestHBSingleReads(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()

	// Subspecialties catalog (seeded) — public.
	rec := hBCall(t, ContractorSubspecialtiesHandler(pool), http.MethodGet, "/x", "", nil, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("subspecialties = %d %s", rec.Code, rec.Body.String())
	}

	// Public brief: unknown token 404s with the controller's sentence.
	req := httptest.NewRequest(http.MethodGet, "/api/brief/hB-nope", nil)
	req.SetPathValue("token", "hB-nope")
	recorder := httptest.NewRecorder()
	PublicBriefHandler(pool)(recorder, req)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("brief missing = %d, want 404", recorder.Code)
	}
	// Mint a real token, then read the brief unauthenticated.
	rec = hBCall(t, GenerateShareTokenHandler(pool), http.MethodPost, "/x", "", &fx.owner, hBProjectPath(fx.projectID))
	token := hBDecode(t, rec)["share_token"].(string)
	if _, err := pool.Exec(ctx, `INSERT INTO project_comments (project_id, user_id, message, created_at, updated_at)
		VALUES ($1, $2, 'hB brief q', now(), now())`, fx.projectID, fx.kontraktor.id); err != nil {
		t.Fatalf("brief comment: %v", err)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/brief/"+token, nil)
	req.SetPathValue("token", token)
	recorder = httptest.NewRecorder()
	PublicBriefHandler(pool)(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("brief = %d %s", recorder.Code, recorder.Body.String())
	}

	// My bids: arsitek with a bid lists it; a plain user gets [].
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, status)
		VALUES ($1, 'arsitek', $2, $3, $3, 'pending')`, fx.projectID, fx.arsitek.id, hBArsitekProfileID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	rec = hBCall(t, MyBidsHandler(pool), http.MethodGet, "/x", "", &fx.arsitek, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("my-bids = %d %s", rec.Code, rec.Body.String())
	}
	if got := len(hBDecode(t, rec)["data"].([]any)); got != 1 {
		t.Fatalf("my-bids len = %d %s", got, rec.Body.String())
	}
	rec = hBCall(t, MyBidsHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusOK || rec.Body.String() != `{"data":[]}` {
		t.Fatalf("my-bids outsider = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, MyBidsHandler(pool), http.MethodGet, "/x", "", nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("my-bids anon = %d, want 401", rec.Code)
	}

	// Hire history: the owner sees the hired arsitek row.
	rec = hBCall(t, HireHistoryHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("hire-history = %d %s", rec.Code, rec.Body.String())
	}
	if got := len(hBDecode(t, rec)["data"].([]any)); got < 1 {
		t.Fatalf("hire-history empty: %s", rec.Body.String())
	}
}

func TestHBDeliveryJobs(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()

	// Supplier with no profile row: the PHP fatal becomes a 500.
	lone := roadmapCaller{id: fx.stranger.id, role: "supplier"}
	rec := hBCall(t, SupplierDeliveryJobsHandler(pool), http.MethodGet, "/x", "", &lone, nil)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("delivery-jobs profile-less = %d, want 500 %s", rec.Code, rec.Body.String())
	}
	// Non-supplier: 403. Anonymous: 401.
	rec = hBCall(t, SupplierDeliveryJobsHandler(pool), http.MethodGet, "/x", "", &fx.owner, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("delivery-jobs owner = %d, want 403", rec.Code)
	}
	// Real job for the hB supplier.
	var quoteID int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_quotes (user_id, supplier_id, items, delivery_address, total_amount)
		VALUES ($1, (SELECT id FROM suppliers WHERE user_id = $1), '[]', 'hB addr', 50000) RETURNING id`,
		fx.supplier.id).Scan(&quoteID); err != nil {
		t.Fatalf("quote: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO delivery_jobs (quote_id, status, agreed_fee) VALUES ($1, 'pending', 10000)`, quoteID); err != nil {
		t.Fatalf("job: %v", err)
	}
	rec = hBCall(t, SupplierDeliveryJobsHandler(pool), http.MethodGet, "/x", "", &fx.supplier, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("delivery-jobs = %d %s", rec.Code, rec.Body.String())
	}
	if got := len(hBDecode(t, rec)["data"].([]any)); got != 1 {
		t.Fatalf("delivery-jobs len = %d %s", got, rec.Body.String())
	}
}

func TestHBVerificationDocument(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()

	dir := t.TempDir()
	t.Setenv("PUBLIC_STORAGE_ROOT", dir)
	rel := "vault/hB-doc.pdf"
	full, err := safeStorageJoin(dir, rel)
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(full, []byte("%PDF-1.4 hB\n%%EOF\n"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE arsiteks SET file_portofolio = $1 WHERE id = $2`, rel, hBArsitekProfileID); err != nil {
		t.Fatalf("doc path: %v", err)
	}

	call := func(caller *roadmapCaller, kind, field, id string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.SetPathValue("type", kind)
		req.SetPathValue("field", field)
		req.SetPathValue("id", id)
		if caller != nil {
			req = req.WithContext(withCaller(req.Context(), *caller))
		}
		rec := httptest.NewRecorder()
		VerificationDocumentHandler(pool)(rec, req)
		return rec
	}
	// Happy: the owner reads their own document.
	if rec := call(&fx.arsitek, "arsitek", "file_portofolio", int64String(hBArsitekProfileID)); rec.Code != http.StatusOK {
		t.Fatalf("verify doc = %d %s", rec.Code, rec.Body.String())
	}
	// Another user is refused; bad type/field are 400; bad id 404.
	if rec := call(&fx.stranger, "arsitek", "file_portofolio", int64String(hBArsitekProfileID)); rec.Code != http.StatusForbidden {
		t.Fatalf("verify doc stranger = %d, want 403", rec.Code)
	}
	if rec := call(&fx.arsitek, "wizard", "file_portofolio", int64String(hBArsitekProfileID)); rec.Code != http.StatusBadRequest {
		t.Fatalf("verify bad type = %d, want 400", rec.Code)
	}
	if rec := call(&fx.arsitek, "arsitek", "password", int64String(hBArsitekProfileID)); rec.Code != http.StatusBadRequest {
		t.Fatalf("verify bad field = %d, want 400", rec.Code)
	}
	if rec := call(&fx.arsitek, "arsitek", "file_portofolio", "abc"); rec.Code != http.StatusNotFound {
		t.Fatalf("verify bad id = %d, want 404", rec.Code)
	}
	// The kontraktor owner has no document filed: 404.
	if rec := call(&fx.kontraktor, "kontraktor", "file_portofolio", int64String(hBKontraktorProfileID)); rec.Code != http.StatusNotFound {
		t.Fatalf("verify no document = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	if rec := call(nil, "arsitek", "file_portofolio", int64String(hBArsitekProfileID)); rec.Code != http.StatusUnauthorized {
		t.Fatalf("verify anon = %d, want 401", rec.Code)
	}
}

func TestHBHouseAnswerAndRoom(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	ctx := context.Background()

	var houseID int64
	if err := pool.QueryRow(ctx, `INSERT INTO house (name, id_user) VALUES ('hB House', $1) RETURNING id`, fx.owner.id).Scan(&houseID); err != nil {
		t.Fatalf("house: %v", err)
	}
	var questionID int64
	if err := pool.QueryRow(ctx, `INSERT INTO house_questions (house_id, user_id, question) VALUES ($1, $2, 'hB q?') RETURNING id`,
		houseID, fx.stranger.id).Scan(&questionID); err != nil {
		t.Fatalf("question: %v", err)
	}
	qp := map[string]string{"question": int64String(questionID)}

	// Only the listing owner (or admin) may answer.
	rec := hBCall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{"answer":"hB yes"}`, &fx.stranger, qp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("answer stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, qp)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("answer empty = %d, want 422", rec.Code)
	}
	rec = hBCall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{"answer":"hB yes"}`, &fx.owner, qp)
	if rec.Code != http.StatusCreated {
		t.Fatalf("answer = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, StoreHouseAnswerHandler(pool), http.MethodPost, "/x", `{"answer":"hB"}`, &fx.owner,
		map[string]string{"question": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("answer missing q = %d, want 404", rec.Code)
	}

	// Rooms: forbidden for non-owners, happy for the owner.
	var roomID int64
	if err := pool.QueryRow(ctx, `INSERT INTO rooms (name, id_house) VALUES ('hB Room', $1) RETURNING id`, houseID).Scan(&roomID); err != nil {
		t.Fatalf("room: %v", err)
	}
	rp := map[string]string{"room": int64String(roomID)}
	rec = hBCall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.stranger, rp)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("room stranger = %d, want 403", rec.Code)
	}
	rec = hBCall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("room delete = %d %s", rec.Code, rec.Body.String())
	}
	rec = hBCall(t, DestroyRoomHandler(pool), http.MethodDelete, "/x", "", &fx.owner, rp)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("room delete again = %d, want 404", rec.Code)
	}
}

func hBMultipart(t *testing.T, fields map[string]string, fileField, filename string, data []byte) (*strings.Reader, string) {
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

func TestHBUploadHandler(t *testing.T) {
	pool := hBPool(t)
	fx := hBSetup(t, pool)
	_ = fx

	dir := t.TempDir()
	t.Setenv("PUBLIC_STORAGE_ROOT", dir)

	jpg := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01}

	call := func(fields map[string]string, fileField, filename string, data []byte) *httptest.ResponseRecorder {
		reader, ctype := hBMultipart(t, fields, fileField, filename, data)
		req := httptest.NewRequest(http.MethodPost, "/api/upload", reader)
		req.Header.Set("Content-Type", ctype)
		rec := httptest.NewRecorder()
		UploadHandler(pool)(rec, req)
		return rec
	}

	// Happy jpg into an unknown folder falls back to project_assets.
	rec := call(map[string]string{"folder": "hB-nope"}, "file", "hB.jpg", jpg)
	if rec.Code != http.StatusOK {
		t.Fatalf("upload = %d %s", rec.Code, rec.Body.String())
	}
	var stored string
	if err := func() error {
		var out map[string]any
		if e := json.Unmarshal(rec.Body.Bytes(), &out); e != nil {
			return e
		}
		stored, _ = out["path"].(string)
		return nil
	}(); err != nil {
		t.Fatalf("upload decode: %v", err)
	}
	if !strings.HasPrefix(stored, "project_assets/") {
		t.Fatalf("upload path = %q", stored)
	}
	// The bytes really landed; remove them (zero leftovers includes disk).
	if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(stored))); err != nil {
		t.Fatalf("uploaded file missing: %v", err)
	}
	_ = os.Remove(filepath.Join(dir, filepath.FromSlash(stored)))

	// Missing file, wrong mime; an unknown folder falls back to
	// project_assets, while a non-string folder is a 422.
	if rec := call(nil, "", "", nil); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("upload empty = %d, want 422", rec.Code)
	}
	if rec := call(nil, "file", "hB.txt", []byte("hB text")); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("upload txt = %d, want 422", rec.Code)
	}
	big := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 11<<20)...)
	if rec := call(nil, "file", "hB.jpg", big); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("upload oversize = %d, want 422", rec.Code)
	}
	if rec := call(map[string]string{"folder": "hB-nope"}, "file", "hB.jpg", jpg); rec.Code != http.StatusOK {
		t.Fatalf("upload unknown folder = %d, want fallback 200 %s", rec.Code, rec.Body.String())
	}
	rec2 := hBCall(t, UploadHandler(pool), http.MethodPost, "/api/upload", `{"folder":123}`, &fx.owner, nil)
	if rec2.Code != http.StatusUnprocessableEntity {
		t.Fatalf("upload bad folder = %d, want 422 %s", rec2.Code, rec2.Body.String())
	}
}
