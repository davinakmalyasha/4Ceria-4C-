package httpapi

// hJ budget/addendum/fee gates: loader-gate 404s, missing-project 404s,
// malformed-body 422s, the transaction 1e3-500 pin, plus the pure
// validator units (status arms, id fallbacks, no-role settlement).

import (
	"context"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestHJMarkPaidGates(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	ghost := &roadmapCaller{id: 1010092, role: "user"}

	rec := hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{}`, ghost, map[string]string{"project": "1010101"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("markpaid ghost = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
		t.Fatalf("markpaid ghost msg = %q", got)
	}

	real := hJMkUser(t, ctx, pool, "mpgate", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, real)
	realCaller := &roadmapCaller{id: real, role: "user"}
	rec = hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{}`, realCaller, map[string]string{"project": "1999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("markpaid missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "No query results for model [App\\Models\\Project] 1999999999" {
		t.Fatalf("markpaid missing msg = %q", got)
	}

	owner := hJMkUser(t, ctx, pool, "mpfieldsown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ MarkPaid Fields")
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	rec = hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", "{oops", ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid malformed = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "type", "The type field is required.")
}

func TestHJAddTransactionGates(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	ghost := &roadmapCaller{id: 1010091, role: "user"}

	rec := hJCall(AddTransactionHandler(pool), http.MethodPost, "/x", `{}`, ghost, map[string]string{"project": "1010101"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("txn ghost = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
		t.Fatalf("txn ghost msg = %q", got)
	}

	real := hJMkUser(t, ctx, pool, "txngate", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, real)
	realCaller := &roadmapCaller{id: real, role: "user"}
	rec = hJCall(AddTransactionHandler(pool), http.MethodPost, "/x", `{}`, realCaller, map[string]string{"project": "1999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("txn missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "No query results for model [App\\Models\\Project] 1999999999" {
		t.Fatalf("txn missing msg = %q", got)
	}

	owner := hJMkUser(t, ctx, pool, "txnfieldsown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Txn Fields")
	defer func() {
		pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	rec = hJCall(AddTransactionHandler(pool), http.MethodPost, "/x", "{oops", ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("txn malformed = %d %s", rec.Code, rec.Body.String())
	}
	body := hJDecode(t, rec)
	if got := body["message"].(string); got != "Validation error" {
		t.Fatalf("txn malformed msg = %q", got)
	}
	hJErr(t, rec, "transaction_type", "The transaction type field is required.")

	// 1e3 is numeric for the validator but not for the ledger parser:
	// the handler answers its fixed 500.
	rec = hJCall(AddTransactionHandler(pool), http.MethodPost, "/x", `{"transaction_type":"deposit","amount":"1e3","title":"hJ"}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("txn 1e3 = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Server Error" {
		t.Fatalf("txn 1e3 msg = %q", got)
	}
}

func TestHJCreateAddendumFields(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "addfieldsown", "user")
	arsiUser := hJMkUser(t, ctx, pool, "addfieldsarsi", "arsitek")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, arsiUser)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	var arsiProf int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hJ Arsi','verified') RETURNING id`, arsiUser).Scan(&arsiProf); err != nil {
		t.Fatalf("profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM arsiteks WHERE id=$1`, arsiProf)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Addendum Fields")
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$2 WHERE id=$1`, pid, arsiProf); err != nil {
		t.Fatalf("hire: %v", err)
	}
	arsiCaller := &roadmapCaller{id: arsiUser, role: "arsitek"}

	// The hired professional passes the gate; the empty body then fails
	// validation with the title rule first.
	rec := hJCall(CreateAddendumHandler(pool), http.MethodPost, "/x", "{oops", arsiCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("addendum malformed = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "title", "The title field is required.")
}

func TestHJProposeFeeFields(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	ghost := &roadmapCaller{id: 1010090, role: "user"}
	owner := hJMkUser(t, ctx, pool, "proposefieldsown", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Propose Fields")
	defer pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)

	// The caller only needs presence here; the project load passes and
	// the empty body fails on bid_id first.
	rec := hJCall(ProposeFeeHandler(pool), http.MethodPost, "/x", "{oops", ghost, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("propose malformed = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "bid_id", "The bid id field is required.")
}

func TestHJClientSignGates(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ghost := &roadmapCaller{id: 1010089, role: "user"}
	sig := `{"bid_type":"arsitek","signature":"data:image/png;base64,aGVsbG8="}`

	// Unreadable body: the fixed invalid-data 422, no database read past
	// the project parse.
	rec := hJCall(ClientSignContractHandler(pool), http.MethodPost, "/x", "{oops", ghost, map[string]string{"project": "1010101", "bid": "1"})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sign malformed = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "The given data was invalid." {
		t.Fatalf("sign malformed msg = %q", got)
	}

	// No bid path value: the URL tail supplies the wire id and the
	// lookup reports the role-model 404.
	rec = hJCall(ClientSignContractHandler(pool), http.MethodPost, "/api/x/hJ-9", sig, ghost, map[string]string{"project": "1010101"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("sign fallback = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != `No query results for model [App\Models\BidArsitek].` {
		t.Fatalf("sign fallback msg = %q", got)
	}
}

func TestHJSandboxGates(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	ghost := &roadmapCaller{id: 1010088, role: "user"}
	real := hJMkUser(t, ctx, pool, "sandboxgate", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, real)
	realCaller := &roadmapCaller{id: real, role: "user"}
	paths := map[string]string{"project": "1010101"}

	handlers := map[string]func(*pgxpool.Pool) http.HandlerFunc{
		"add":    AddSandboxHandler,
		"toggle": ToggleSandboxHandler,
		"update": UpdateSandboxHandler,
		"delete": DeleteSandboxHandler,
	}
	for name, h := range handlers {
		// Ghost caller: the viewer gate pins the entity-neutral 404.
		rec := hJCall(h(pool), http.MethodPost, "/x", `{}`, ghost, paths)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("sandbox %s ghost = %d %s", name, rec.Code, rec.Body.String())
		}
		if got := hJDecode(t, rec)["message"].(string); got != "Record not found." {
			t.Fatalf("sandbox %s ghost msg = %q", name, got)
		}
		// Real caller, missing project: the route-model 404.
		rec = hJCall(h(pool), http.MethodPost, "/x", `{}`, realCaller, map[string]string{"project": "1999999999"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("sandbox %s missing = %d %s", name, rec.Code, rec.Body.String())
		}
		if got := hJDecode(t, rec)["message"].(string); got != "No query results for model [App\\Models\\Project] 1999999999" {
			t.Fatalf("sandbox %s missing msg = %q", name, got)
		}
	}
}

func TestHJValidatorUnits(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	// validateAddendumStatus arms: empty/invalid status, non-numeric and
	// overflowing amounts, negative counters.
	f := &errorBag{}
	if _, _, _, _, _, _, _ = validateAddendumStatus(map[string]any{"status": ""}, f); f.bag["status"][0] != "The status field is required." {
		t.Fatalf("status empty = %v", f.bag)
	}
	f = &errorBag{}
	if _, _, _, _, _, _, _ = validateAddendumStatus(map[string]any{"status": "hJ-bogus"}, f); f.bag["status"][0] != "The selected status is invalid." {
		t.Fatalf("status bogus = %v", f.bag)
	}
	f = &errorBag{}
	if _, _, _, _, _, _, _ = validateAddendumStatus(map[string]any{"status": "approved_unpaid", "amount": true}, f); f.bag["amount"][0] != "The amount field must be a number." {
		t.Fatalf("amount bool = %v", f.bag)
	}
	f = &errorBag{}
	if _, _, _, _, _, _, _ = validateAddendumStatus(map[string]any{"status": "approved_unpaid", "amount": "1e9999"}, f); f.bag["amount"][0] != "The amount field must be a number." {
		t.Fatalf("amount huge = %v", f.bag)
	}
	f = &errorBag{}
	if _, _, _, _, _, _, _ = validateAddendumStatus(map[string]any{"status": "approved_unpaid", "counter_offer_amount": -1.0}, f); f.bag["counter_offer_amount"][0] != "The counter offer amount field must be at least 0." {
		t.Fatalf("counter neg = %v", f.bag)
	}

	// ID fallbacks read the URL tail.
	if got := addendumIDFromPath("/api/x/7"); got != "7" {
		t.Fatalf("addendumID = %q", got)
	}
	if got := sandboxIDFromPath("/api/x/8"); got != "8" {
		t.Fatalf("sandboxID = %q", got)
	}

	// Unknown settlement types resolve to unfound without any read.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)
	if state, found, err := markPaidSettlement(ctx, tx, "hJ-bogus", 1, 1); err != nil || found || state != "" {
		t.Fatalf("settlement bogus = %q %v %v", state, found, err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	// The no-PM scan reads zero without any read.
	tx2, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin2: %v", err)
	}
	defer tx2.Rollback(ctx)
	if got := pmUserOf(ctx, tx2, nil); got != 0 {
		t.Fatalf("pmUserOf nil = %d", got)
	}
	if err := tx2.Rollback(ctx); err != nil {
		t.Fatalf("rollback2: %v", err)
	}
}
