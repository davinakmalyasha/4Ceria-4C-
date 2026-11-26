package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestHDBudgetWrite(t *testing.T) {
	pool := hDPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 940031, "user", "hd-bw-owner@example.test", "hD BW Owner")
	pmUser := hAMkUser(t, pool, 940032, "project_manager", "hd-bw-pm@example.test", "hD BW PM")
	stranger := hAMkUser(t, pool, 940033, "user", "hd-bw-stranger@example.test", "hD BW Stranger")
	t.Cleanup(func() {
		hDCleanupVault(t, pool)
		hDCleanup(t, pool)
	})

	hAMkProject(t, pool, 941031, owner.id, "hD budget project", "open", "both", 800000000)
	hAMkProject(t, pool, 941032, owner.id, "hD budget poor project", "open", "both", 100000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET pm_id=$1 WHERE id=941031`, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}

	// --- AddTransaction guards ---
	rec := hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941031/budget/transactions", `{"transaction_type":"deposit","amount":"100","title":"hD"}`, nil, "941031")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("txn unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, AddTransactionHandler(pool), http.MethodPost, "/api/x/abc", `{"transaction_type":"deposit","amount":"100","title":"hD"}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("txn bad-project = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/999999999/budget/transactions", `{"transaction_type":"deposit","amount":"100","title":"hD"}`, &owner, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("txn missing project = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\Project] 999999999" {
		t.Fatalf("txn missing message = %q", got)
	}
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941031/budget/transactions", `{"transaction_type":"deposit","amount":"100","title":"hD"}`, &stranger, "941031")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("txn forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized. Only the project owner can adjust the total balance." {
		t.Fatalf("txn forbidden message = %q", got)
	}
	// custom envelope twin
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941031/budget/transactions", `{}`, &owner, "941031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("txn invalid = %d %s", rec.Code, rec.Body.String())
	}
	dec := hADecode(t, rec)
	if dec["message"] != "Validation error" {
		t.Fatalf("txn invalid message = %q", dec["message"])
	}
	if errs, ok := dec["errors"].(map[string]any); !ok || errs["transaction_type"] == nil || errs["amount"] == nil || errs["title"] == nil {
		t.Fatalf("txn invalid errors = %v", dec)
	}
	// amount twins: zero, over max, non-numeric
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941031/budget/transactions", `{"transaction_type":"deposit","amount":"0","title":"hD"}`, &owner, "941031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("txn zero = %d %s", rec.Code, rec.Body.String())
	}
	dec = hADecode(t, rec)
	if errs, ok := dec["errors"].(map[string]any); !ok {
		t.Fatalf("txn zero no errors")
	} else if list, ok := errs["amount"].([]any); !ok || len(list) != 1 || list[0] != "The amount field must be at least 1." {
		t.Fatalf("txn zero errors = %v", errs)
	}
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941031/budget/transactions", `{"transaction_type":"deposit","amount":"abc","title":"hD"}`, &owner, "941031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("txn abc = %d %s", rec.Code, rec.Body.String())
	}

	// --- happy deposit then adjustment ---
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941031/budget/transactions", `{"transaction_type":"deposit","amount":"5000000","title":"hD opening"}`, &owner, "941031")
	if rec.Code != http.StatusOK {
		t.Fatalf("txn deposit ok = %d %s", rec.Code, rec.Body.String())
	}
	dec = hADecode(t, rec)
	if dec["message"] != "Transaction recorded successfully" || dec["budget"] != "805000000.00" {
		t.Fatalf("txn deposit answer = %v", dec)
	}
	txnBody, _ := dec["transaction"].(map[string]any)
	if txnBody["amount"] != "5000000.00" || txnBody["title"] != "hD opening" || txnBody["transaction_type"] != "deposit" {
		t.Fatalf("txn deposit row = %v", txnBody)
	}
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941031/budget/transactions", `{"transaction_type":"adjustment_down","amount":"1000000","title":"hD trim"}`, &owner, "941031")
	if rec.Code != http.StatusOK {
		t.Fatalf("txn adjust ok = %d %s", rec.Code, rec.Body.String())
	}
	if dec := hADecode(t, rec); dec["budget"] != "804000000.00" {
		t.Fatalf("txn adjust budget = %v", dec)
	}

	// insufficient twin on the poor project
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941032/budget/transactions", `{"transaction_type":"adjustment_down","amount":"200000","title":"hD greedy"}`, &owner, "941032")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("txn short = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Transaction failed: insufficient escrow to reduce." {
		t.Fatalf("txn short message = %q", got)
	}
	var poorBudget string
	_ = pool.QueryRow(ctx, `SELECT budget::text FROM projects WHERE id=941032`).Scan(&poorBudget)
	if poorBudget != "100000.00" {
		t.Fatalf("txn short budget moved = %q", poorBudget)
	}

	// frozen twin: adjustment blocked, deposit sails through
	var freezeID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES (941031,$1,'payment','hD bw freeze','desc','open') RETURNING id`, owner.id).Scan(&freezeID); err != nil {
		t.Fatal(err)
	}
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941031/budget/transactions", `{"transaction_type":"adjustment_down","amount":"1000","title":"hD frozen"}`, &owner, "941031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("txn frozen = %d %s", rec.Code, rec.Body.String())
	}
	wantFrozen := "Payments are frozen: dispute #" + itoaTest(freezeID) + ` ("hD bw freeze") is open on this project. An admin must resolve it first.`
	if got := hADecode(t, rec)["message"]; got != wantFrozen {
		t.Fatalf("txn frozen message = %q, want %q", got, wantFrozen)
	}
	rec = hACall(t, AddTransactionHandler(pool), http.MethodPost, "/api/projects/941031/budget/transactions", `{"transaction_type":"deposit","amount":"1000","title":"hD war chest"}`, &owner, "941031")
	if rec.Code != http.StatusOK {
		t.Fatalf("txn frozen deposit = %d %s", rec.Code, rec.Body.String())
	}
	if dec := hADecode(t, rec); dec["budget"] != "804001000.00" {
		t.Fatalf("txn frozen deposit budget = %v", dec)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=941031`); err != nil {
		t.Fatal(err)
	}

	// --- sandbox guards ---
	rec = hACall(t, AddSandboxHandler(pool), http.MethodPost, "/api/projects/941031/budget/sandbox", `{"title":"hD","estimated_amount":"100"}`, nil, "941031")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("sandbox unauth = %d", rec.Code)
	}
	rec = hACallWithPaths(t, AddSandboxHandler(pool), http.MethodPost, "/api/x/abc", `{"title":"hD","estimated_amount":"100"}`, &owner, map[string]string{"project": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("sandbox bad-project = %d", rec.Code)
	}
	rec = hACall(t, AddSandboxHandler(pool), http.MethodPost, "/api/projects/999999999/budget/sandbox", `{"title":"hD","estimated_amount":"100"}`, &owner, "999999999")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("sandbox missing project = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\Project] 999999999" {
		t.Fatalf("sandbox missing message = %q", got)
	}
	rec = hACall(t, AddSandboxHandler(pool), http.MethodPost, "/api/projects/941031/budget/sandbox", `{"title":"hD plan","estimated_amount":"250000"}`, &stranger, "941031")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sandbox forbidden = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized" {
		t.Fatalf("sandbox forbidden message = %q", got)
	}
	rec = hACall(t, AddSandboxHandler(pool), http.MethodPost, "/api/projects/941031/budget/sandbox", `{}`, &owner, "941031")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sandbox invalid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "The title field is required. (and 1 more error)" {
		t.Fatalf("sandbox invalid message = %q", got)
	}

	// PM may plan too (owner-or-assigned-PM gate)
	rec = hACall(t, AddSandboxHandler(pool), http.MethodPost, "/api/projects/941031/budget/sandbox", `{"title":"hD pm plan","estimated_amount":"100000"}`, &pmUser, "941031")
	if rec.Code != http.StatusOK {
		t.Fatalf("sandbox pm ok = %d %s", rec.Code, rec.Body.String())
	}
	// happy add answers the row in CREATE order
	rec = hACall(t, AddSandboxHandler(pool), http.MethodPost, "/api/projects/941031/budget/sandbox", `{"title":"hD plan A","estimated_amount":"250000"}`, &owner, "941031")
	if rec.Code != http.StatusOK {
		t.Fatalf("sandbox add ok = %d %s", rec.Code, rec.Body.String())
	}
	itemBody, _ := hADecode(t, rec)["item"].(map[string]any)
	if itemBody["title"] != "hD plan A" || itemBody["is_active"] != true || itemBody["project_id"] != float64(941031) {
		t.Fatalf("sandbox add body = %v", itemBody)
	}
	var itemID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_budget_sandbox WHERE project_id=941031 AND title='hD plan A'`).Scan(&itemID)
	if itemID == 0 {
		t.Fatalf("sandbox row missing")
	}
	var estText string
	var isActive bool
	_ = pool.QueryRow(ctx, `SELECT estimated_amount::text, is_active FROM project_budget_sandbox WHERE id=$1`, itemID).Scan(&estText, &isActive)
	if estText != "250000.00" || !isActive {
		t.Fatalf("sandbox row = %q/%v, want 250000.00/true", estText, isActive)
	}

	sbpath := func(id string) map[string]string { return map[string]string{"project": "941031", "id": id} }
	// toggle guards
	rec = hACallWithPaths(t, ToggleSandboxHandler(pool), http.MethodPut, "/api/x", ``, &stranger, sbpath(itoaTest(itemID)))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("toggle forbidden = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, ToggleSandboxHandler(pool), http.MethodPut, "/api/x", ``, &owner, sbpath("999999999"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("toggle missing = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\ProjectBudgetSandbox] 999999999" {
		t.Fatalf("toggle missing message = %q", got)
	}
	// cross-project twin
	var otherItem int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_budget_sandbox (project_id, title, estimated_amount, is_active, created_at, updated_at)
		VALUES (941032,'hD other','50000',true,date_trunc('second',now()),date_trunc('second',now())) RETURNING id`).Scan(&otherItem)
	rec = hACallWithPaths(t, ToggleSandboxHandler(pool), http.MethodPut, "/api/x", ``, &owner, sbpath(itoaTest(otherItem)))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("toggle cross = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Not found." {
		t.Fatalf("toggle cross message = %q", got)
	}
	// happy toggle flips active twice
	rec = hACallWithPaths(t, ToggleSandboxHandler(pool), http.MethodPut, "/api/x", ``, &owner, sbpath(itoaTest(itemID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("toggle ok = %d %s", rec.Code, rec.Body.String())
	}
	if active, _ := hADecode(t, rec)["item"].(map[string]any)["is_active"].(bool); active {
		t.Fatalf("toggle still active")
	}
	rec = hACallWithPaths(t, ToggleSandboxHandler(pool), http.MethodPut, "/api/x", ``, &owner, sbpath(itoaTest(itemID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("toggle back = %d %s", rec.Code, rec.Body.String())
	}
	if active, _ := hADecode(t, rec)["item"].(map[string]any)["is_active"].(bool); !active {
		t.Fatalf("toggle back not active")
	}

	// update guards + happy
	rec = hACallWithPaths(t, UpdateSandboxHandler(pool), http.MethodPut, "/api/x", `{}`, &owner, sbpath(itoaTest(itemID)))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update invalid = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACallWithPaths(t, UpdateSandboxHandler(pool), http.MethodPut, "/api/x", `{"title":"hD plan B","estimated_amount":"300000"}`, &owner, sbpath(itoaTest(itemID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("update ok = %d %s", rec.Code, rec.Body.String())
	}
	var updTitle, updEst string
	_ = pool.QueryRow(ctx, `SELECT title, estimated_amount::text FROM project_budget_sandbox WHERE id=$1`, itemID).Scan(&updTitle, &updEst)
	if updTitle != "hD plan B" || updEst != "300000.00" {
		t.Fatalf("sandbox update row = %q/%q, want hD plan B/300000.00", updTitle, updEst)
	}

	// delete happy + missing twin
	rec = hACallWithPaths(t, DeleteSandboxHandler(pool), http.MethodDelete, "/api/x", ``, &owner, sbpath(itoaTest(itemID)))
	if rec.Code != http.StatusOK {
		t.Fatalf("delete ok = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Sandbox item deleted successfully" {
		t.Fatalf("delete message = %q", got)
	}
	var gone int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_budget_sandbox WHERE id=$1`, itemID).Scan(&gone)
	if gone != 0 {
		t.Fatalf("sandbox row survives delete")
	}
	rec = hACallWithPaths(t, DeleteSandboxHandler(pool), http.MethodDelete, "/api/x", ``, &owner, sbpath(itoaTest(itemID)))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delete missing = %d %s", rec.Code, rec.Body.String())
	}

	// --- pure helpers ---
	if got := sandboxIDFromPath("/api/projects/941031/budget/sandbox/12"); got != "12" {
		t.Fatalf("sandboxIDFromPath = %q", got)
	}
	if got := sandboxIDFromPath("/api/projects/941031/budget/sandbox/12/update"); got != "12" {
		t.Fatalf("sandboxIDFromPath update = %q", got)
	}

	hDCleanupVault(t, pool)
	hDCleanup(t, pool)
	hDAssertNoLeftovers(t, pool)
}
