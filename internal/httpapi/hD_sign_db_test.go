package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestHDSignExtras(t *testing.T) {
	pool := hDPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 940051, "user", "hd-sg-owner@example.test", "hD SG Owner")
	arsUser := hAMkUser(t, pool, 940052, "arsitek", "hd-sg-ars@example.test", "hD SG Ars")
	arsBidder := hAMkUser(t, pool, 940053, "arsitek", "hd-sg-ars2@example.test", "hD SG Ars2")
	intUser := hAMkUser(t, pool, 940054, "interior", "hd-sg-int@example.test", "hD SG Int")
	pmUser := hAMkUser(t, pool, 940055, "project_manager", "hd-sg-pm@example.test", "hD SG PM")
	t.Cleanup(func() {
		hDCleanupVault(t, pool)
		hDCleanup(t, pool)
	})

	hAMkProject(t, pool, 941051, owner.id, "hD sign extras project", "in_progress", "both", 800000000)
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$1, pm_id=$2 WHERE id=941051`, arsUser.id+100000, pmUser.id+100000); err != nil {
		t.Fatal(err)
	}
	// hired-but-not-bidding interior pro, plus a pure bidder arsitek
	var bidOnly int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count)
		VALUES (941051,'arsitek',$1,$2,$2,'50000000','50000000','hD bidder','pending','fixed',$1,0) RETURNING id`,
		arsBidder.id, arsBidder.id+100000).Scan(&bidOnly); err != nil {
		t.Fatal(err)
	}
	_ = bidOnly

	// --- GetProjectBids access twins ---
	rec := hACall(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/projects/941051/bids", "", &pmUser, "941051")
	if rec.Code != http.StatusOK {
		t.Fatalf("bids pm = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/projects/941051/bids", "", &arsUser, "941051")
	if rec.Code != http.StatusOK {
		t.Fatalf("bids hired = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/projects/941051/bids", "", &arsBidder, "941051")
	if rec.Code != http.StatusOK {
		t.Fatalf("bids bidder = %d %s", rec.Code, rec.Body.String())
	}
	rec = hACall(t, GetProjectBidsHandler(pool), http.MethodGet, "/api/projects/941051/bids", "", &intUser, "941051")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("bids non-bidder pro = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "Unauthorized access to project bids." {
		t.Fatalf("bids non-bidder message = %q", got)
	}

	// --- SignContract validation twins (fail before any bid lookup) ---
	sigPath := func(id string) map[string]string { return map[string]string{"project": "941051", "bid": id} }
	base := `{"bid_type":"arsitek","termins":[{"label":"hD DP","percentage":50,"amount":"50000000"}],"bank_type":"BCA","bank_account_no":"12345678","bank_account_name":"hD Ars"}`
	cases := []struct {
		name  string
		body  string
		field string
		want  string
	}{
		{"type-missing", `{"termins":[]}`, "bid_type", "The bid type field is required."},
		{"termins-missing", `{"bid_type":"arsitek"}`, "termins", "The termins field is required."},
		{"termins-object", `{"bid_type":"arsitek","termins":{}}`, "termins", "The termins field must be an array."},
		{"termins-item", `{"bid_type":"arsitek","termins":[1]}`, "termins.0.label", "The termins.0.label field is required."},
		{"pct-high", `{"bid_type":"arsitek","termins":[{"label":"hD","percentage":150,"amount":"1"}]}`, "termins.0.percentage", "The termins.0.percentage field must not be greater than 100."},
		{"amount-neg", `{"bid_type":"arsitek","termins":[{"label":"hD","percentage":50,"amount":-5}]}`, "termins.0.amount", "The termins.0.amount field must be at least 0."},
		{"milestones-object", `{"bid_type":"arsitek","termins":[{"label":"hD","percentage":50,"amount":"1"}],"milestones":{}}`, "milestones", "The milestones field must be an array."},
		{"milestone-item", `{"bid_type":"arsitek","termins":[{"label":"hD","percentage":50,"amount":"1"}],"milestones":[1]}`, "milestones.0.title", "The milestones.0.title field is required."},
		{"signature-format", `{"bid_type":"arsitek","termins":[{"label":"hD","percentage":50,"amount":"1"}],"signature":"junk"}`, "signature", "The signature field format is invalid."},
		{"bank-missing", `{"bid_type":"arsitek","termins":[{"label":"hD","percentage":50,"amount":"1"}]}`, "bank_type", "The bank type field is required."},
		{"bankno-short", `{"bid_type":"arsitek","termins":[{"label":"hD","percentage":50,"amount":"1"}],"bank_type":"BCA","bank_account_no":"12","bank_account_name":"hD Ars"}`, "bank_account_no", "The bank account no field must be at least 5 characters."},
		{"bankname-short", `{"bid_type":"arsitek","termins":[{"label":"hD","percentage":50,"amount":"1"}],"bank_type":"BCA","bank_account_no":"12345678","bank_account_name":"AB"}`, "bank_account_name", "The bank account name field must be at least 3 characters."},
	}
	for _, tc := range cases {
		rec := hACallWithPaths(t, SignContractHandler(pool), http.MethodPost, "/api/x", tc.body, &arsUser, sigPath("1"))
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("sign %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		dec := hADecode(t, rec)
		errs, ok := dec["errors"].(map[string]any)
		if !ok {
			t.Fatalf("sign %s has no errors: %v", tc.name, dec)
		}
		list, ok := errs[tc.field].([]any)
		if !ok {
			t.Fatalf("sign %s missing field %q: %v", tc.name, tc.field, errs)
		}
		found := false
		for _, m := range list {
			if m == tc.want {
				found = true
			}
		}
		if !found {
			t.Fatalf("sign %s field %q = %v, want %q", tc.name, tc.field, list, tc.want)
		}
	}
	// non-string bid_type fails BOTH the string and the in rules
	rec = hACallWithPaths(t, SignContractHandler(pool), http.MethodPost, "/api/x", `{"bid_type":1}`, &arsUser, sigPath("1"))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sign typenum = %d", rec.Code)
	}
	if list, _ := hADecode(t, rec)["errors"].(map[string]any)["bid_type"].([]any); len(list) != 2 ||
		list[0] != "The bid type field must be a string." || list[1] != "The selected bid type is invalid." {
		t.Fatalf("sign typenum errors = %v", list)
	}
	// non-string signature fails BOTH rules
	rec = hACallWithPaths(t, SignContractHandler(pool), http.MethodPost, "/api/x",
		`{"bid_type":"arsitek","termins":[{"label":"hD","percentage":50,"amount":"1"}],"signature":1,"bank_type":"B","bank_account_no":"12345","bank_account_name":"ABC"}`, &arsUser, sigPath("1"))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("sign signum = %d", rec.Code)
	}
	if list, _ := hADecode(t, rec)["errors"].(map[string]any)["signature"].([]any); len(list) != 2 {
		t.Fatalf("sign signum errors = %v", list)
	}
	var _ = base

	// --- pure helpers ---
	for role, want := range map[string]string{"arsitek": "architect", "kontraktor": "contractor", "notaris": "notary", "project_manager": "pm", "bogus": "bogus"} {
		if got := signTargetRole(role); got != want {
			t.Fatalf("signTargetRole %q = %q, want %q", role, got, want)
		}
	}
	for role, want := range map[string]string{"arsitek": "design", "kontraktor": "build", "notaris": "legal", "interior": "interior", "project_manager": "management", "bogus": "bogus"} {
		if got := signPhaseContext(role); got != want {
			t.Fatalf("signPhaseContext %q = %q, want %q", role, got, want)
		}
	}
	if text, ok := numericTextOf(nil); ok || text != "" {
		t.Fatalf("numericTextOf nil = %q %v", text, ok)
	}
	if text, ok := numericTextOf(true); ok || text != "" {
		t.Fatalf("numericTextOf bool = %q %v", text, ok)
	}
	if text, ok := numericTextOf(12); !ok || text != "12" {
		t.Fatalf("numericTextOf int = %q %v", text, ok)
	}
	if text, ok := numericTextOf(int64(34)); !ok || text != "34" {
		t.Fatalf("numericTextOf int64 = %q %v", text, ok)
	}
	if text, ok := numericTextOf(float32(1.5)); !ok || text != "1.5" {
		t.Fatalf("numericTextOf float32 = %q %v", text, ok)
	}
	if text, ok := numericTextOf(" 7 "); !ok || text != "7" {
		t.Fatalf("numericTextOf string = %q %v", text, ok)
	}
	if got := bidArea(`{"building_area": "150"}`); got != 150 {
		t.Fatalf("bidArea = %v, want 150", got)
	}
	if got := bidArea(`{"land_area": "0", "building_size": 200}`); got != 200 {
		t.Fatalf("bidArea skip-zero = %v, want 200", got)
	}
	if got := bidArea(`junk`); got != 1.0 {
		t.Fatalf("bidArea junk = %v, want 1", got)
	}
	if got := bidArea(``); got != 1.0 {
		t.Fatalf("bidArea empty = %v, want 1", got)
	}
	// bidCalculation every branch with hand literals
	if _, _, _, _, total := bidCalculation("fixed", 60000000, 0, 0, "800000000", ""); total != 60000000 {
		t.Fatalf("bidCalculation fixed = %v", total)
	}
	if _, _, _, _, total := bidCalculation("percentage", 10, 0, 0, "800000000", ""); total != 80000000 {
		t.Fatalf("bidCalculation pct = %v", total)
	}
	if _, _, _, _, total := bidCalculation("percentage", 10, 0, 0, "", ""); total != 0 {
		t.Fatalf("bidCalculation pct-empty = %v", total)
	}
	if _, _, _, _, total := bidCalculation("unit", 0, 5000, 200, "800000000", ""); total != 1000000 {
		t.Fatalf("bidCalculation unit = %v", total)
	}
	if _, _, unit, qty, total := bidCalculation("sqm", 2000000, 0, 0, "800000000", `{"building_area": "150"}`); total != 300000000 || qty != 150 || unit != 2000000 {
		t.Fatalf("bidCalculation sqm = %v/%v/%v", total, qty, unit)
	}
	if _, _, _, _, total := bidCalculation("sqm", 2000000, 0, 0, "800000000", ""); total != 2000000 {
		t.Fatalf("bidCalculation sqm-nodims = %v", total)
	}
	if _, _, _, _, total := bidCalculation("hourly", 750000, 0, 0, "800000000", ""); total != 750000 {
		t.Fatalf("bidCalculation hourly = %v", total)
	}
	if _, _, _, _, total := bidCalculation("bogus", 42000000, 0, 0, "800000000", ""); total != 42000000 {
		t.Fatalf("bidCalculation default = %v", total)
	}
	if _, _, _, _, total := bidCalculation("fixed", 0, 0, 0, "800000000", ""); total != 0 {
		t.Fatalf("bidCalculation zero = %v", total)
	}
	// bidDurationRaw role spellings
	if got := bidDurationRaw(int64(4), "notaris"); got != "4" {
		t.Fatalf("bidDurationRaw notaris = %v", got)
	}
	if got := bidDurationRaw(int64(4), "interior"); got != "4" {
		t.Fatalf("bidDurationRaw interior = %v", got)
	}
	if got := bidDurationRaw(int64(4), "arsitek"); got != int64(4) {
		t.Fatalf("bidDurationRaw arsitek = %v", got)
	}
	if bidDurationRaw(nil, "arsitek") != nil {
		t.Fatalf("bidDurationRaw nil wrong")
	}
	// contractBidderName fallbacks
	if got := contractBidderName(nil, "arsitek"); got != "Architect" {
		t.Fatalf("contractBidderName nil ars = %q", got)
	}
	if got := contractBidderName(strPtr("  "), "bogus"); got != "Professional" {
		t.Fatalf("contractBidderName blank = %q", got)
	}
	if got := contractBidderName(strPtr("hD Pro"), "arsitek"); got != "hD Pro" {
		t.Fatalf("contractBidderName name = %q", got)
	}
	// bidRelationKey full matrix
	for role, key := range map[string]string{"arsitek": "arsitek", "kontraktor": "kontraktor", "notaris": "notaris", "interior": "interior", "project_manager": "pm", "structural": "structuralEngineer", "mep": "mepEngineer"} {
		column, _ := bidProfileColumn(role)
		got, _, profile, ok := bidRelationKey(role, map[string]any{column: int64(77)})
		if !ok || got != key || profile != 77 {
			t.Fatalf("bidRelationKey %q = %q/%d/%v", role, got, profile, ok)
		}
	}
	if _, _, _, ok := bidRelationKey("bogus", map[string]any{}); ok {
		t.Fatalf("bidRelationKey bogus ok")
	}
	if _, _, _, ok := bidRelationKey("arsitek", map[string]any{"arsitek_id": int64(0)}); ok {
		t.Fatalf("bidRelationKey zero ok")
	}

	hDCleanupVault(t, pool)
	hDCleanup(t, pool)
	hDAssertNoLeftovers(t, pool)
}
