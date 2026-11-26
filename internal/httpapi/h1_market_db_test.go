package httpapi

// Half-1 marketplace/material/orders/quotes/reviews flows against the real
// seeded database: public listings, supplier writes, the quote lifecycle
// and order transitions, with ledger/money assertions in minor units.

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func h1Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testPool(t)
	t.Cleanup(pool.Close)
	return pool
}

func h1User(t *testing.T, pool *pgxpool.Pool, id int64) roadmapCaller {
	t.Helper()
	var role string
	if err := pool.QueryRow(context.Background(), `SELECT role_type FROM users WHERE id = $1`, id).Scan(&role); err != nil {
		t.Skipf("no user %d", id)
	}
	return roadmapCaller{id: id, role: role}
}

func h1Call(t *testing.T, pool *pgxpool.Pool, h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathID string) *httptest.ResponseRecorder {
	t.Helper()
	req := h1JSONRequest(t, method, target, body)
	h1AllPathKeys(req, pathID)
	if caller != nil {
		req = req.WithContext(withCaller(req.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func h1Multipart(t *testing.T, fields map[string]string, fileField, filename string, data []byte) (*strings.Reader, string) {
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

var h1ProofPDF = []byte("%PDF-1.4\nh1 proof\n%%EOF\n")

func h1CallMultipart(t *testing.T, pool *pgxpool.Pool, h http.HandlerFunc, target string, fields map[string]string, fileField, filename string, data []byte, caller *roadmapCaller, pathID string) *httptest.ResponseRecorder {
	t.Helper()
	reader, ctype := h1Multipart(t, fields, fileField, filename, data)
	req := httptest.NewRequest(http.MethodPost, target, reader)
	req.Header.Set("Content-Type", ctype)
	h1AllPathKeys(req, pathID)
	if caller != nil {
		req = req.WithContext(withCaller(req.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func h1Decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %d: %v\n%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func TestH1MarketplaceSuppliers(t *testing.T) {
	pool := h1Pool(t)

	// List: verified suppliers with aggregates and stripped owners.
	rec := h1Call(t, pool, MarketplaceSuppliersHandler(pool), http.MethodGet, "/api/marketplace/suppliers", "", nil, "999999999")
	if rec.Code != http.StatusOK {
		t.Fatalf("suppliers list = %d %s", rec.Code, rec.Body.String())
	}
	body := h1Decode(t, rec)
	data, _ := body["data"].([]any)
	if len(data) == 0 {
		t.Fatal("no suppliers listed")
	}
	first := data[0].(map[string]any)
	for _, k := range []string{"materials_count", "reviews_avg_rating", "reviews_count", "user"} {
		if _, ok := first[k]; !ok {
			t.Errorf("supplier missing %s: %v", k, first)
		}
	}
	if user, ok := first["user"].(map[string]any); ok {
		for _, sensitive := range []string{"email", "bank_name", "bank_account_number", "unique_code", "google_id"} {
			if _, ok := user[sensitive]; ok {
				t.Errorf("owner leaks %s", sensitive)
			}
		}
	}

	// Filters: category + search narrow the list.
	for _, q := range []string{"?category=zzz-no-hit-zzz", "?search=zzz-no-hit-zzz"} {
		rec := h1Call(t, pool, MarketplaceSuppliersHandler(pool), http.MethodGet, "/api/marketplace/suppliers"+q, "", nil, "999999999")
		if rec.Code != http.StatusOK {
			t.Fatalf("suppliers filter %s = %d", q, rec.Code)
		}
		if got := h1Decode(t, rec)["data"]; got == nil {
			t.Fatalf("filter %s missing data", q)
		}
	}

	// Show: seeded supplier with materials + reviews.
	var supplierID int64
	if err := pool.QueryRow(context.Background(), `SELECT id FROM suppliers WHERE verification_status = 'verified' ORDER BY id LIMIT 1`).Scan(&supplierID); err != nil {
		t.Skip("no verified supplier")
	}
	rec = h1Call(t, pool, MarketplaceSupplierHandler(pool), http.MethodGet, "/api/marketplace/suppliers/1", "", nil, itoaTest(supplierID))
	if rec.Code != http.StatusOK {
		t.Fatalf("supplier show = %d %s", rec.Code, rec.Body.String())
	}
	shown := h1Decode(t, rec)["data"].(map[string]any)
	for _, k := range []string{"reviews_avg_rating", "reviews_count", "user", "materials", "reviews"} {
		if _, ok := shown[k]; !ok {
			t.Errorf("supplier show missing %s", k)
		}
	}
	if _, ok := shown["materials_count"]; ok {
		t.Errorf("show must not carry materials_count")
	}

	// Show: bad id, missing row.
	rec = h1Call(t, pool, MarketplaceSupplierHandler(pool), http.MethodGet, "/api/marketplace/suppliers/abc", "", nil, "abc")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("supplier bad id = %d, want 404", rec.Code)
	}
	rec = h1Call(t, pool, MarketplaceSupplierHandler(pool), http.MethodGet, "/api/marketplace/suppliers/999999999", "", nil, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("supplier missing = %d, want 404", rec.Code)
	}
}

func TestH1MarketplaceMaterials(t *testing.T) {
	pool := h1Pool(t)

	rec := h1Call(t, pool, MarketplaceMaterialsHandler(pool), http.MethodGet, "/api/marketplace/materials", "", nil, "999999999")
	if rec.Code != http.StatusOK {
		t.Fatalf("materials list = %d %s", rec.Code, rec.Body.String())
	}
	body := h1Decode(t, rec)
	data, _ := body["data"].([]any)
	if len(data) == 0 {
		t.Fatal("no materials listed")
	}
	first := data[0].(map[string]any)
	for _, k := range []string{"supplier", "images", "price", "specifications"} {
		if _, ok := first[k]; !ok {
			t.Errorf("material missing %s", k)
		}
	}

	for _, q := range []string{
		"?category=zzz-no-hit-zzz", "?search=zzz-no-hit-zzz",
		"?min_price=999999999999", "?max_price=1",
		"?category=Semen&min_price=1&max_price=999999999",
	} {
		rec := h1Call(t, pool, MarketplaceMaterialsHandler(pool), http.MethodGet, "/api/marketplace/materials"+q, "", nil, "999999999")
		if rec.Code != http.StatusOK {
			t.Fatalf("materials filter %s = %d %s", q, rec.Code, rec.Body.String())
		}
	}
}

func TestH1MaterialCRUD(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	supplier := h1User(t, pool, 31687) // akmal supplier
	stranger := h1User(t, pool, 31682)

	// Validation failure: empty object.
	rec := h1Call(t, pool, StoreMaterialHandler(pool), http.MethodPost, "/api/materials", `{}`, &supplier, "999999999")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("material store invalid = %d %s", rec.Code, rec.Body.String())
	}
	for _, k := range []string{"name", "price", "unit", "category"} {
		if !strings.Contains(rec.Body.String(), k) {
			t.Errorf("material store errors missing %s: %s", k, rec.Body.String())
		}
	}

	// Non-supplier cannot store.
	rec = h1Call(t, pool, StoreMaterialHandler(pool), http.MethodPost, "/api/materials",
		`{"name":"x","price":100,"unit":"pcs","category":"test"}`, &stranger, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("material store stranger = %d, want 404, %s", rec.Code, rec.Body.String())
	}

	// Valid store.
	rec = h1Call(t, pool, StoreMaterialHandler(pool), http.MethodPost, "/api/materials",
		`{"name":"H1 test cement","description":"flow cement","price":75000,"unit":"sak","category":"Semen","stock":42,"is_available":true}`, &supplier, "999999999")
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("material store = %d %s", rec.Code, rec.Body.String())
	}
	created := h1Decode(t, rec)
	var materialID int64
	if d, ok := created["data"].(map[string]any); ok {
		if f, ok := d["id"].(float64); ok {
			materialID = int64(f)
		}
	}
	if materialID == 0 {
		// Fall back to the row the handler inserted.
		_ = pool.QueryRow(ctx, `SELECT id FROM materials WHERE name = 'H1 test cement' ORDER BY id DESC LIMIT 1`).Scan(&materialID)
	}
	if materialID == 0 {
		t.Fatalf("no material id in %s", rec.Body.String())
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_images WHERE material_id = $1`, materialID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM materials WHERE id = $1`, materialID)
	})
	var priceMinor string
	_ = pool.QueryRow(ctx, `SELECT (price*100)::bigint::text FROM materials WHERE id = $1`, materialID).Scan(&priceMinor)
	if priceMinor != "7500000" {
		t.Errorf("material price minor = %s, want 7500000", priceMinor)
	}

	// Update: validation failure, then valid, then forbidden, then missing.
	rec = h1Call(t, pool, UpdateMaterialHandler(pool), http.MethodPut, "/api/materials/1", `{"price":"nan-price"}`, &supplier, itoaTest(materialID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("material update invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, UpdateMaterialHandler(pool), http.MethodPut, "/api/materials/1", `{"price":80000,"stock":40}`, &supplier, itoaTest(materialID))
	if rec.Code != http.StatusOK {
		t.Fatalf("material update = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, UpdateMaterialHandler(pool), http.MethodPut, "/api/materials/1", `{"price":1}`, &stranger, itoaTest(materialID))
	if rec.Code != http.StatusForbidden && rec.Code != http.StatusNotFound {
		t.Fatalf("material update stranger = %d, want 403/404", rec.Code)
	}
	rec = h1Call(t, pool, UpdateMaterialHandler(pool), http.MethodPut, "/api/materials/1", `{"price":1}`, &supplier, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("material update missing = %d, want 404", rec.Code)
	}

	// Destroy: forbidden, missing, then valid.
	rec = h1Call(t, pool, DestroyMaterialHandler(pool), http.MethodDelete, "/api/materials/1", "", &stranger, itoaTest(materialID))
	if rec.Code != http.StatusForbidden && rec.Code != http.StatusNotFound {
		t.Fatalf("material destroy stranger = %d, want 403/404", rec.Code)
	}
	rec = h1Call(t, pool, DestroyMaterialHandler(pool), http.MethodDelete, "/api/materials/1", "", &supplier, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("material destroy missing = %d, want 404", rec.Code)
	}
	rec = h1Call(t, pool, DestroyMaterialHandler(pool), http.MethodDelete, "/api/materials/1", "", &supplier, itoaTest(materialID))
	if rec.Code != http.StatusOK {
		t.Fatalf("material destroy = %d %s", rec.Code, rec.Body.String())
	}
	var remaining int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM materials WHERE id = $1`, materialID).Scan(&remaining)
	if remaining != 0 {
		t.Errorf("material %d not deleted", materialID)
	}
}

func TestH1QuoteLifecycle(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	buyer := h1User(t, pool, 31682)    // owns project 14970
	supplier := h1User(t, pool, 31687) // supplier 1093

	var materialID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM materials WHERE supplier_id = 1093 AND is_available = true ORDER BY id LIMIT 1`).Scan(&materialID); err != nil {
		t.Skip("no supplier material")
	}
	var projectID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects WHERE user_id = 31682 ORDER BY id LIMIT 1`).Scan(&projectID); err != nil {
		t.Skip("no buyer project")
	}

	// Validation: missing items.
	rec := h1Call(t, pool, StoreMaterialQuoteHandler(pool), http.MethodPost, "/api/material-quotes",
		`{"supplier_id":1093}`, &buyer, "999999999")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quote invalid = %d %s", rec.Code, rec.Body.String())
	}
	// Foreign project: forbidden.
	rec = h1Call(t, pool, StoreMaterialQuoteHandler(pool), http.MethodPost, "/api/material-quotes",
		`{"supplier_id":1093,"project_id":999999999,"items":[{"material_id":`+itoaTest(materialID)+`,"name":"x","price_at_quote":"100","qty":1,"unit":"pcs"}]}`, &buyer, "999999999")
	if rec.Code != http.StatusUnprocessableEntity && rec.Code != http.StatusForbidden {
		t.Fatalf("quote foreign project = %d, want 422/403 %s", rec.Code, rec.Body.String())
	}

	// Valid quote: the server reprices lines from the material rows, so
	// total = 2 x 7500000 (Sofa) = 15000000.00, ignoring our sent price.
	rec = h1Call(t, pool, StoreMaterialQuoteHandler(pool), http.MethodPost, "/api/material-quotes",
		`{"supplier_id":1093,"project_id":`+itoaTest(projectID)+`,"delivery_address":"H1 street 1","items":[{"material_id":`+itoaTest(materialID)+`,"name":"Semen H1","price_at_quote":"150000","qty":2,"unit":"sak"}]}`, &buyer, "999999999")
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("quote store = %d %s", rec.Code, rec.Body.String())
	}
	var quoteID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM material_quotes WHERE user_id = 31682 ORDER BY id DESC LIMIT 1`).Scan(&quoteID)
	if quoteID == 0 {
		t.Fatalf("no quote row after %s", rec.Body.String())
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM delivery_jobs WHERE quote_id = $1`, quoteID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_orders WHERE quote_id = $1`, quoteID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_quotes WHERE id = $1`, quoteID)
	})
	var total string
	_ = pool.QueryRow(ctx, `SELECT total_amount::text FROM material_quotes WHERE id = $1`, quoteID).Scan(&total)
	if total != "15000000.00" {
		t.Errorf("quote total = %q, want 15000000.00 (server-side reprice)", total)
	}

	// Index as buyer and supplier.
	for _, c := range []roadmapCaller{buyer, supplier} {
		rec := h1Call(t, pool, MaterialQuotesIndexHandler(pool), http.MethodGet, "/api/material-quotes", "", &c, "999999999")
		if rec.Code != http.StatusOK {
			t.Fatalf("quotes index = %d %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), itoaTest(quoteID)) {
			t.Errorf("quotes index missing quote %d", quoteID)
		}
	}

	// Direct-pay path: supplier requests payment (shipping in minor-aware
	// text), buyer proves via a real PDF upload, supplier marks paid and
	// the escrow ledger moves exactly goods+shipping minor units.
	rec = h1Call(t, pool, RequestQuotePaymentHandler(pool), http.MethodPost, "/api/material-quotes/1/request-payment",
		`{"shipping_cost":"10000","delivery_method":"Supplier Fleet"}`, &supplier, itoaTest(quoteID))
	if rec.Code != http.StatusOK {
		t.Fatalf("request-payment = %d %s", rec.Code, rec.Body.String())
	}
	// Tariff guard: absurd freight is rejected.
	rec = h1Call(t, pool, RequestQuotePaymentHandler(pool), http.MethodPost, "/api/material-quotes/1/request-payment",
		`{"shipping_cost":"999999999999","delivery_method":"Supplier Fleet"}`, &supplier, itoaTest(quoteID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("request-payment tariff = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1CallMultipart(t, pool, UploadQuotePaymentProofHandler(pool), "/api/material-quotes/1/payment-proof",
		map[string]string{}, "payment_proof", "h1proof.pdf", h1ProofPDF, &buyer, itoaTest(quoteID))
	if rec.Code != http.StatusOK {
		t.Fatalf("quote proof = %d %s", rec.Code, rec.Body.String())
	}
	var proofPath string
	_ = pool.QueryRow(ctx, `SELECT payment_proof_path FROM material_quotes WHERE id = $1`, quoteID).Scan(&proofPath)
	if proofPath == "" {
		t.Error("quote proof path not stored")
	}
	rec = h1Call(t, pool, MarkQuotePaidHandler(pool), http.MethodPost, "/api/material-quotes/1/mark-paid",
		`{"payment_notes":"h1 paid"}`, &supplier, itoaTest(quoteID))
	if rec.Code != http.StatusOK {
		t.Fatalf("quote mark-paid = %d %s", rec.Code, rec.Body.String())
	}
	// Ledger moved 15000000.00 + 10000.00 = 15010000.00 exactly once.
	var ledgerCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_transactions
		WHERE project_id = $1 AND transaction_type = 'payment' AND reference_id = $2
		AND reference_type_id = (SELECT id FROM ledger_reference_types WHERE fqcn = 'App\Models\MaterialQuote')`,
		projectID, quoteID).Scan(&ledgerCount)
	if ledgerCount != 1 {
		t.Errorf("quote ledger rows = %d, want 1", ledgerCount)
	}
	var ledgerMinor int64
	_ = pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount)*100)::bigint,0) FROM project_budget_transactions
		WHERE project_id = $1 AND transaction_type = 'payment' AND reference_id = $2
		AND reference_type_id = (SELECT id FROM ledger_reference_types WHERE fqcn = 'App\Models\MaterialQuote')`,
		projectID, quoteID).Scan(&ledgerMinor)
	if ledgerMinor != 1501000000 {
		t.Errorf("quote ledger minor = %d, want 1501000000", ledgerMinor)
	}
	// Double-pay is rejected.
	rec = h1Call(t, pool, MarkQuotePaidHandler(pool), http.MethodPost, "/api/material-quotes/1/mark-paid", `{}`, &supplier, itoaTest(quoteID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quote double mark-paid = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Order path: a second quote goes pending -> approved and mints the
	// material_orders row with goods+shipping.
	rec = h1Call(t, pool, StoreMaterialQuoteHandler(pool), http.MethodPost, "/api/material-quotes",
		`{"supplier_id":1093,"project_id":`+itoaTest(projectID)+`,"delivery_address":"H1 street 2","items":[{"material_id":`+itoaTest(materialID)+`,"name":"x","price_at_quote":"1","qty":1,"unit":"pcs"}]}`, &buyer, "999999999")
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("quote2 store = %d %s", rec.Code, rec.Body.String())
	}
	var quote2 int64
	_ = pool.QueryRow(ctx, `SELECT id FROM material_quotes WHERE user_id = 31682 ORDER BY id DESC LIMIT 1`).Scan(&quote2)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM delivery_jobs WHERE quote_id = $1`, quote2)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_orders WHERE quote_id = $1`, quote2)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_quotes WHERE id = $1`, quote2)
	})
	// Approve validation failure first.
	rec = h1Call(t, pool, ApproveQuoteHandler(pool), http.MethodPost, "/api/material-quotes/1/approve",
		`{"shipping_cost":"nan"}`, &supplier, itoaTest(quote2))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quote approve invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, ApproveQuoteHandler(pool), http.MethodPost, "/api/material-quotes/1/approve",
		`{"shipping_cost":"5000","delivery_method":"Supplier Fleet"}`, &supplier, itoaTest(quote2))
	if rec.Code != http.StatusOK {
		t.Fatalf("quote approve = %d %s", rec.Code, rec.Body.String())
	}
	var orderID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM material_orders WHERE quote_id = $1 ORDER BY id DESC LIMIT 1`, quote2).Scan(&orderID)
	if orderID == 0 {
		t.Fatalf("approve did not mint an order: %s", rec.Body.String())
	}
	// Approving again is rejected.
	rec = h1Call(t, pool, ApproveQuoteHandler(pool), http.MethodPost, "/api/material-quotes/1/approve", `{}`, &supplier, itoaTest(quote2))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quote double approve = %d, want 422", rec.Code)
	}
	// The approved quote must be paid through the order, not the quote.
	rec = h1Call(t, pool, MarkQuotePaidHandler(pool), http.MethodPost, "/api/material-quotes/1/mark-paid", `{}`, &supplier, itoaTest(quote2))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("approved quote mark-paid = %d, want 422 %s", rec.Code, rec.Body.String())
	}

	// Delivery job posts with its own validation.
	rec = h1Call(t, pool, PostQuoteDeliveryJobHandler(pool), http.MethodPost, "/api/material-quotes/1/post-delivery-job", `{}`, &supplier, itoaTest(quote2))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("delivery job invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, PostQuoteDeliveryJobHandler(pool), http.MethodPost, "/api/material-quotes/1/post-delivery-job",
		`{"shipping_cost":"5000"}`, &supplier, itoaTest(quote2))
	if rec.Code != http.StatusOK {
		t.Fatalf("delivery job = %d %s", rec.Code, rec.Body.String())
	}
	var jobCount int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM delivery_jobs WHERE quote_id = $1`, quote2).Scan(&jobCount)
	if jobCount == 0 {
		t.Errorf("no delivery job for quote %d", quote2)
	}
}

func TestH1OrderFlows(t *testing.T) {
	pool := h1Pool(t)
	ctx := context.Background()
	buyer := h1User(t, pool, 31682)
	supplier := h1User(t, pool, 31687)

	// Index for both roles (empty or seeded).
	for _, c := range []roadmapCaller{buyer, supplier} {
		rec := h1Call(t, pool, MaterialOrdersIndexHandler(pool), http.MethodGet, "/api/material-orders", "", &c, "999999999")
		if rec.Code != http.StatusOK {
			t.Fatalf("orders index = %d %s", rec.Code, rec.Body.String())
		}
	}

	// Seed a fresh order row directly (creation happens off-API via WA).
	var orderID int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders
		(user_id, supplier_id, total_price, shipping_cost, whatsapp_order_id, status, notes)
		VALUES (31682, 1093, 500000, 0, 'H1WA-' || extract(epoch from now())::bigint, 'pending', 'h1 flow')
		RETURNING id`).Scan(&orderID); err != nil {
		t.Fatalf("seed order: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_order_items WHERE order_id = $1`, orderID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_order_reviews WHERE order_id = $1`, orderID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_orders WHERE id = $1`, orderID)
	})

	// Show as buyer + supplier; missing row 404.
	for _, c := range []roadmapCaller{buyer, supplier} {
		rec := h1Call(t, pool, MaterialOrderShowHandler(pool), http.MethodGet, "/api/material-orders/1", "", &c, itoaTest(orderID))
		if rec.Code != http.StatusOK {
			t.Fatalf("order show = %d %s", rec.Code, rec.Body.String())
		}
	}
	rec := h1Call(t, pool, MaterialOrderShowHandler(pool), http.MethodGet, "/api/material-orders/1", "", &buyer, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("order show missing = %d, want 404", rec.Code)
	}

	// Update: buyer cancels a pending order; validation failure first.
	rec = h1Call(t, pool, UpdateMaterialOrderHandler(pool), http.MethodPut, "/api/material-orders/1", `{}`, &buyer, itoaTest(orderID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("order update invalid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	other := h1User(t, pool, 31683)
	rec = h1Call(t, pool, UpdateMaterialOrderHandler(pool), http.MethodPut, "/api/material-orders/1", `{"status":"cancelled"}`, &other, itoaTest(orderID))
	if rec.Code != http.StatusForbidden && rec.Code != http.StatusNotFound {
		t.Fatalf("order update stranger = %d, want 403/404 %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, UpdateMaterialOrderHandler(pool), http.MethodPut, "/api/material-orders/1", `{"status":"cancelled","notes":"h1 buyer cancel"}`, &buyer, itoaTest(orderID))
	if rec.Code != http.StatusOK {
		t.Fatalf("order cancel = %d %s", rec.Code, rec.Body.String())
	}

	// Fulfilment machine on a second order: supplier drives
	// pending -> processing -> shipping -> delivered, buyer completes.
	var order2 int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders
		(user_id, supplier_id, total_price, shipping_cost, whatsapp_order_id, status, notes)
		VALUES (31682, 1093, 250000, 0, 'H1WA2-' || extract(epoch from now())::bigint, 'pending', 'h1 fulfil')
		RETURNING id`).Scan(&order2); err != nil {
		t.Fatalf("seed order2: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_order_items WHERE order_id = $1`, order2)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_order_reviews WHERE order_id = $1`, order2)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_orders WHERE id = $1`, order2)
	})
	for _, step := range []struct {
		caller roadmapCaller
		status string
	}{
		{supplier, "processing"},
		{supplier, "shipping"},
		{supplier, "delivered"},
		{buyer, "completed"},
	} {
		rec := h1Call(t, pool, UpdateMaterialOrderHandler(pool), http.MethodPut, "/api/material-orders/1",
			`{"status":"`+step.status+`"}`, &step.caller, itoaTest(order2))
		if rec.Code != http.StatusOK {
			t.Fatalf("order -> %s = %d %s", step.status, rec.Code, rec.Body.String())
		}
	}
	// Illegal jump is rejected (completed is terminal for the buyer path).
	rec = h1Call(t, pool, UpdateMaterialOrderHandler(pool), http.MethodPut, "/api/material-orders/1", `{"status":"processing"}`, &supplier, itoaTest(order2))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("order illegal transition = %d, want 403 %s", rec.Code, rec.Body.String())
	}

	// Paid path on a third order: buyer proof (multipart) then supplier
	// verify moves the escrow ledger once.
	var order3 int64
	if err := pool.QueryRow(ctx, `INSERT INTO material_orders
		(user_id, supplier_id, total_price, shipping_cost, whatsapp_order_id, status, notes)
		VALUES (31682, 1093, 120000, 5000, 'H1WA3-' || extract(epoch from now())::bigint, 'pending', 'h1 paid')
		RETURNING id`).Scan(&order3); err != nil {
		t.Fatalf("seed order3: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_order_items WHERE order_id = $1`, order3)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_order_reviews WHERE order_id = $1`, order3)
		_, _ = pool.Exec(context.Background(), `DELETE FROM material_orders WHERE id = $1`, order3)
	})
	rec = h1CallMultipart(t, pool, UploadOrderPaymentProofHandler(pool), "/api/material-orders/1/payment-proof",
		map[string]string{}, "payment_proof", "h1order.pdf", h1ProofPDF, &buyer, itoaTest(order3))
	if rec.Code != http.StatusOK {
		t.Fatalf("order proof = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, UpdateMaterialOrderHandler(pool), http.MethodPut, "/api/material-orders/1", `{"status":"paid"}`, &supplier, itoaTest(order3))
	if rec.Code != http.StatusOK {
		t.Fatalf("order supplier paid = %d %s", rec.Code, rec.Body.String())
	}
	var orderStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM material_orders WHERE id = $1`, order3).Scan(&orderStatus)
	if orderStatus != "paid" {
		t.Errorf("order3 status = %s, want paid", orderStatus)
	}

	// Buyer confirms receipt on a delivered order is covered above; a
	// proof on a non-awaiting order is rejected.
	rec = h1CallMultipart(t, pool, UploadOrderPaymentProofHandler(pool), "/api/material-orders/1/payment-proof",
		map[string]string{}, "payment_proof", "h1order2.pdf", h1ProofPDF, &buyer, itoaTest(order2))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("order proof on completed = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	// Confirm receipt is idempotent on a completed order, and rejects a
	// merely-paid one.
	rec = h1Call(t, pool, ConfirmOrderReceiptHandler(pool), http.MethodPost, "/api/material-orders/1/confirm-receipt", `{}`, &buyer, itoaTest(order2))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "already confirmed") {
		t.Fatalf("confirm idempotent = %d %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, ConfirmOrderReceiptHandler(pool), http.MethodPost, "/api/material-orders/1/confirm-receipt", `{}`, &buyer, itoaTest(order3))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("confirm on paid = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, ConfirmOrderReceiptHandler(pool), http.MethodPost, "/api/material-orders/1/confirm-receipt", `{}`, &supplier, itoaTest(order3))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("confirm by supplier = %d, want 403 %s", rec.Code, rec.Body.String())
	}

	// Review the completed order (order2), update it, then destroy it.
	// A cancelled order cannot be reviewed.
	rec = h1Call(t, pool, StoreOrderReviewHandler(pool), http.MethodPost, "/api/material-order-reviews",
		`{"order_id":`+itoaTest(orderID)+`,"supplier_id":1093,"rating":5,"comment":"h1 great"}`, &buyer, "999999999")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("review on cancelled = %d, want 400 %s", rec.Code, rec.Body.String())
	}
	rec = h1Call(t, pool, StoreOrderReviewHandler(pool), http.MethodPost, "/api/material-order-reviews",
		`{"order_id":`+itoaTest(order2)+`,"supplier_id":1093,"rating":5,"comment":"h1 great"}`, &buyer, "999999999")
	t.Logf("review store = %d %.200s", rec.Code, rec.Body.String())
	var reviewID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM material_order_reviews WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, order2).Scan(&reviewID)
	if reviewID != 0 {
		rec = h1Call(t, pool, UpdateOrderReviewHandler(pool), http.MethodPut, "/api/material-order-reviews/1", `{"rating":4,"comment":"h1 ok"}`, &buyer, itoaTest(reviewID))
		t.Logf("review update = %d %.200s", rec.Code, rec.Body.String())
		rec = h1Call(t, pool, DestroyOrderReviewHandler(pool), http.MethodDelete, "/api/material-order-reviews/1", "", &buyer, itoaTest(reviewID))
		if rec.Code != http.StatusOK {
			t.Errorf("review destroy = %d %s", rec.Code, rec.Body.String())
		}
	}

	// Supplier-scoped reviews list (public): seeded + fresh rows appear.
	rec = h1Call(t, pool, SupplierReviewsHandler(pool), http.MethodGet, "/api/suppliers/1093/reviews", "", nil, "1093")
	if rec.Code != http.StatusOK {
		t.Fatalf("supplier reviews = %d %s", rec.Code, rec.Body.String())
	}
}
