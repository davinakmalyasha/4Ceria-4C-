package httpapi

// hJ bid-action coverage: validator twins, bid-id fallback 404s,
// malformed-body 422s, and the negotiate price-rule branches the shared
// suite leaves dark. None of these need fixtures: validation and the
// loader gates fire before any project row is touched.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestHJValidateBidTypeUnits(t *testing.T) {
	// Empty string fails required (never the `in` rule).
	f := &errorBag{}
	if _, ok := validateBidType(map[string]any{"bid_type": ""}, f); ok {
		t.Fatalf("empty ok")
	}
	hJErrBag(t, f, "bid_type", "The bid type field is required.")

	// Unknown string fails `in`.
	f = &errorBag{}
	if _, ok := validateBidType(map[string]any{"bid_type": "hJ-bogus"}, f); ok {
		t.Fatalf("bogus ok")
	}
	hJErrBag(t, f, "bid_type", "The selected bid type is invalid.")

	// Non-string fails both the string and the `in` rule, in order.
	f = &errorBag{}
	if _, ok := validateBidType(map[string]any{"bid_type": 123}, f); ok {
		t.Fatalf("numeric ok")
	}
	if got := f.bag["bid_type"]; len(got) != 2 || got[0] != "The bid type field must be a string." || got[1] != "The selected bid type is invalid." {
		t.Fatalf("numeric errors = %q", got)
	}

	// Known role passes.
	f = &errorBag{}
	role, ok := validateBidType(map[string]any{"bid_type": "arsitek"}, f)
	if !ok || role != "arsitek" || !f.empty() {
		t.Fatalf("arsitek = %q %v", role, ok)
	}
}

func hJErrBag(t *testing.T, f *errorBag, field, wantMsg string) {
	t.Helper()
	items, ok := f.bag[field]
	if !ok || len(items) == 0 {
		t.Fatalf("hJ no errors[%s]", field)
	}
	if items[0] != wantMsg {
		t.Fatalf("hJ errors[%s][0] = %q want %q", field, items[0], wantMsg)
	}
}

func TestHJBidLookupUnits(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	// Known role names its model; unknown roles fall back to Bid.
	rec := httptest.NewRecorder()
	bidNotFound(rec, "arsitek")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("bidnotfound code = %d", rec.Code)
	}
	if got := hJDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\BidArsitek].` {
		t.Fatalf("bidnotfound msg = %q", got)
	}
	rec = httptest.NewRecorder()
	bidNotFound(rec, "hJ-bogus")
	if got := hJDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\Bid].` {
		t.Fatalf("bidnotfound default = %q", got)
	}

	// bidderUserID: unknown role and zero-profile bids resolve to nil
	// without touching the database.
	if got := bidderUserID(ctx, pool, "hJ-bogus", map[string]any{}); got != nil {
		t.Fatalf("bidder bogus = %v", got)
	}
	if got := bidderUserID(ctx, pool, "arsitek", map[string]any{"arsitek_id": int64(0)}); got != nil {
		t.Fatalf("bidder zero = %v", got)
	}

	// bidFloatOf: numeric text parses; the pgtype arm stays hot elsewhere.
	if got := bidFloatOf("12.5"); got != 12.5 {
		t.Fatalf("bidfloat = %v", got)
	}

	// reloadBid on a missing row reports the gone-row error.
	if _, err := reloadBid(ctx, pool, 1999999999); err != errBidGone {
		t.Fatalf("reload gone = %v", err)
	}

	// findBid with an unparseable wire id reports not-found, no error.
	_, _, found, err := findBid(ctx, pool, 1010101, "arsitek", "hJ-9")
	if err != nil || found {
		t.Fatalf("findBid parse = %v %v", found, err)
	}
}

func TestHJBidFallback404(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	ghost := &roadmapCaller{id: 1010096, role: "arsitek"}

	// No bid path value: the handler parses the URL tail, which names no
	// bid, and answers the role-model 404. The project id parses so the
	// project gate passes.
	cases := []struct {
		name string
		h    func(*pgxpool.Pool) http.HandlerFunc
	}{
		{"accept", AcceptInviteHandler},
		{"reject", RejectInviteHandler},
		{"confirm", ConfirmBidFeeHandler},
	}
	for _, tc := range cases {
		rec := hJCall(tc.h(pool), http.MethodPost, "/api/x/hJ-9", `{"bid_type":"arsitek"}`, ghost, map[string]string{"project": "1010101"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s fallback = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		if got := hJDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\BidArsitek].` {
			t.Fatalf("%s fallback msg = %q", tc.name, got)
		}
	}

	// Negotiate resolves the viewer before the bid: use a real project
	// and owner so the lookup itself reports the miss.
	owner := hJMkUser(t, ctx, pool, "negfbown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	pid := hJMkProject(t, ctx, pool, owner, "hJ Negotiate Fallback")
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	rec := hJCall(NegotiateBidFeeHandler(pool), http.MethodPost, "/api/x/hJ-9", `{"bid_type":"arsitek","price":100}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("negotiate fallback = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\BidArsitek].` {
		t.Fatalf("negotiate fallback msg = %q", got)
	}
}

func TestHJBidMalformedBody(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ghost := &roadmapCaller{id: 1010095, role: "arsitek"}

	// An unreadable body carries no fields: invite/negotiate/confirm
	// answer the fixed invalid-data 422 before any database read.
	cases := []struct {
		name string
		h    func(*pgxpool.Pool) http.HandlerFunc
	}{
		{"accept", AcceptInviteHandler},
		{"reject", RejectInviteHandler},
		{"negotiate", NegotiateBidFeeHandler},
		{"confirm", ConfirmBidFeeHandler},
	}
	for _, tc := range cases {
		rec := hJCall(tc.h(pool), http.MethodPost, "/api/x/1010101", "{oops", ghost, map[string]string{"project": "1010101", "bid": "1"})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s malformed = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		if got := hJDecode(t, rec)["message"].(string); got != "The given data was invalid." {
			t.Fatalf("%s malformed msg = %q", tc.name, got)
		}
	}
}

func TestHJNegotiatePriceRules(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ghost := &roadmapCaller{id: 1010094, role: "user"}
	paths := map[string]string{"project": "1010101", "bid": "1"}

	// Non-numeric price on a non-notaris role fails BOTH the number and
	// the greater-than-zero rule, in order.
	rec := hJCall(NegotiateBidFeeHandler(pool), http.MethodPost, "/x", `{"bid_type":"arsitek","price":"abc"}`, ghost, paths)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("price abc = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "price", "The price field must be a number.")
	body := hJDecode(t, rec)
	items := body["errors"].(map[string]any)["price"].([]any)
	if len(items) != 2 || items[1].(string) != "The price field must be greater than 0." {
		t.Fatalf("price abc errors = %v", items)
	}

	// A value big.ParseFloat accepts but strconv rejects fails the same way.
	rec = hJCall(NegotiateBidFeeHandler(pool), http.MethodPost, "/x", `{"bid_type":"arsitek","price":"1e9999"}`, ghost, paths)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("price huge = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "price", "The price field must be a number.")

	// The notaris floor is at-least-zero, and its non-numeric price fails
	// only the number rule.
	rec = hJCall(NegotiateBidFeeHandler(pool), http.MethodPost, "/x", `{"bid_type":"notaris","price":"abc"}`, ghost, paths)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("notaris abc = %d %s", rec.Code, rec.Body.String())
	}
	body = hJDecode(t, rec)
	items = body["errors"].(map[string]any)["price"].([]any)
	if len(items) != 1 || items[0].(string) != "The price field must be a number." {
		t.Fatalf("notaris abc errors = %v", items)
	}
	rec = hJCall(NegotiateBidFeeHandler(pool), http.MethodPost, "/x", `{"bid_type":"notaris","price":-5}`, ghost, paths)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("notaris neg = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "price", "The price field must be at least 0.")

	// Zero and negative prices on other roles fail greater-than-zero.
	rec = hJCall(NegotiateBidFeeHandler(pool), http.MethodPost, "/x", `{"bid_type":"arsitek","price":0}`, ghost, paths)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("price zero = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "price", "The price field must be greater than 0.")

	// selected_services must be an array when present.
	rec = hJCall(NegotiateBidFeeHandler(pool), http.MethodPost, "/x", `{"bid_type":"arsitek","price":100,"selected_services":"hJ-x"}`, ghost, paths)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("services str = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "selected_services", "The selected services field must be an array.")

	// A valid body reaches the viewer gate: the ghost caller is unknown.
	rec = hJCall(NegotiateBidFeeHandler(pool), http.MethodPost, "/x", `{"bid_type":"arsitek","price":100}`, ghost, paths)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("negotiate ghost = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
		t.Fatalf("negotiate ghost msg = %q", got)
	}
}

func TestHJAcceptDeclineGates(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	ghost := &roadmapCaller{id: 1010093, role: "user"}
	real := hJMkUser(t, ctx, pool, "decgate", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, real)
	realCaller := &roadmapCaller{id: real, role: "user"}

	// Ghost caller: viewer gate pins the entity-neutral 404.
	for name, h := range map[string]func(*pgxpool.Pool) http.HandlerFunc{
		"accept":  AcceptBidHandler,
		"decline": DeclineBidHandler,
	} {
		rec := hJCall(h(pool), http.MethodPost, "/x", `{}`, ghost, map[string]string{"project": "1010101"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s ghost = %d %s", name, rec.Code, rec.Body.String())
		}
		if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
			t.Fatalf("%s ghost msg = %q", name, got)
		}
	}

	// Real caller, missing project: the accept gate answers the same 404.
	for name, h := range map[string]func(*pgxpool.Pool) http.HandlerFunc{
		"accept":  AcceptBidHandler,
		"decline": DeclineBidHandler,
	} {
		rec := hJCall(h(pool), http.MethodPost, "/x", `{}`, realCaller, map[string]string{"project": "1999999999"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s gate = %d %s", name, rec.Code, rec.Body.String())
		}
		if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
			t.Fatalf("%s gate msg = %q", name, got)
		}
	}

	// Malformed bodies answer the fixed 422 once the caller passes the gate.
	owner := hJMkUser(t, ctx, pool, "decown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Decide Fields")
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	for name, h := range map[string]func(*pgxpool.Pool) http.HandlerFunc{
		"accept":  AcceptBidHandler,
		"decline": DeclineBidHandler,
	} {
		rec := hJCall(h(pool), http.MethodPost, "/x", "{oops", ownerCaller, map[string]string{"project": itoaTest(pid)})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s malformed = %d %s", name, rec.Code, rec.Body.String())
		}
		if got := hJDecode(t, rec)["message"].(string); got != "The given data was invalid." {
			t.Fatalf("%s malformed msg = %q", name, got)
		}
	}
}
