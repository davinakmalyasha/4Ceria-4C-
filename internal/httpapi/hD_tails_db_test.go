package httpapi

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestHDTails(t *testing.T) {
	pool := hDPool(t)
	ctx := context.Background()

	owner := hAMkUser(t, pool, 940071, "user", "hd-tl-owner@example.test", "hD TL Owner")
	t.Cleanup(func() {
		hDCleanupVault(t, pool)
		hDCleanup(t, pool)
	})

	hAMkProject(t, pool, 941071, owner.id, "hD tails project", "open", "both", 800000000)

	// --- validateFeeProposal twins: 422 before any bid exists ---
	feeCases := []struct {
		name  string
		body  string
		field string
		want  string
	}{
		{"bid-missing", `{"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}]}`, "bid_id", "The bid id field is required."},
		{"bid-float", `{"bid_id":1.5,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}]}`, "bid_id", "The bid id field must be an integer."},
		{"type-bad", `{"bid_id":1,"bid_type":"bogus","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}]}`, "bid_type", "The selected bid type is invalid."},
		{"price-missing", `{"bid_id":1,"bid_type":"arsitek","proposed_termins":[{"percentage":100,"trigger_description":"hD"}]}`, "price", "The price field is required."},
		{"price-alpha", `{"bid_id":1,"bid_type":"arsitek","price":"abc","proposed_termins":[{"percentage":100,"trigger_description":"hD"}]}`, "price", "The price field must be a number."},
		{"feetype-bad", `{"bid_id":1,"bid_type":"arsitek","price":100,"fee_type":"bogus","proposed_termins":[{"percentage":100,"trigger_description":"hD"}]}`, "fee_type", "The selected fee type is invalid."},
		{"note-num", `{"bid_id":1,"bid_type":"arsitek","price":100,"note":1,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}]}`, "note", "The note field must be a string."},
		{"termins-alpha", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":{}}`, "proposed_termins", "The proposed termins field must be an array."},
		{"termin-item", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[1]}`, "proposed_termins.0", "The proposed_termins.0 field must be an object."},
		{"termin-pct", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":"abc","trigger_description":"hD"}]}`, "proposed_termins.0.percentage", "The proposed_termins.0.percentage field must be a number."},
		{"termin-pct-range", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":101,"trigger_description":"hD"}]}`, "proposed_termins.0.percentage", "The proposed_termins.0.percentage field must be between 0 and 100."},
		{"termin-trig", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100}]}`, "proposed_termins.0.trigger_description", "The proposed_termins.0.trigger_description field is required."},
		{"termin-ms", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD","milestone_index":"abc"}]}`, "proposed_termins.0.milestone_index", "The proposed_termins.0.milestone_index field must be an integer."},
		{"ms-alpha", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_milestones":{}}`, "proposed_milestones", "The proposed milestones field must be an array."},
		{"ms-item", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_milestones":[1]}`, "proposed_milestones.0", "The proposed_milestones.0 field must be an object."},
		{"ms-title", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_milestones":[{}]}`, "proposed_milestones.0.title", "The proposed_milestones.0.title field is required."},
		{"ms-desc", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_milestones":[{"title":"hD","description":1}]}`, "proposed_milestones.0.description", "The proposed_milestones.0.description field must be a string."},
		{"svc-alpha", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"selected_services":{}}`, "selected_services", "The selected services field must be an array."},
		{"team-alpha", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_team":{}}`, "proposed_team", "The proposed team field must be an array."},
		{"team-item", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_team":[1]}`, "proposed_team.0", "The proposed_team.0 field must be an object."},
		{"team-name", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_team":[{}]}`, "proposed_team.0.name", "The proposed_team.0.name field is required."},
		{"team-fee", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_team":[{"name":"hD","role_title":"hD","role":"hD"}]}`, "proposed_team.0.fee", "The proposed_team.0.fee field is required."},
		{"team-feetype", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_team":[{"name":"hD","role_title":"hD","role":"hD","fee":100,"fee_type":"bogus"}]}`, "proposed_team.0.fee_type", "The selected proposed_team.0.fee_type is invalid."},
		{"team-member", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"proposed_team":[{"name":"hD","role_title":"hD","role":"hD","fee":100,"fee_type":"fixed","team_member_id":"abc"}]}`, "proposed_team.0.team_member_id", "The proposed_team.0.team_member_id field must be an integer."},
		{"length-alpha", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"project_length":"abc"}`, "project_length", "The project_length field must be a number."},
		{"width-neg", `{"bid_id":1,"bid_type":"arsitek","price":100,"proposed_termins":[{"percentage":100,"trigger_description":"hD"}],"project_width":-1}`, "project_width", "The project_width field must be at least 0."},
	}
	for _, tc := range feeCases {
		rec := hACall(t, ProposeFeeHandler(pool), http.MethodPost, "/api/projects/941071/propose-fee", tc.body, &owner, "941071")
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("fee %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		errs, ok := hADecode(t, rec)["errors"].(map[string]any)
		if !ok {
			t.Fatalf("fee %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok {
			t.Fatalf("fee %s missing field %q: %v", tc.name, tc.field, errs)
		}
		found := false
		for _, m := range list {
			if m == tc.want {
				found = true
			}
		}
		if !found {
			t.Fatalf("fee %s field %q = %v, want %q", tc.name, tc.field, list, tc.want)
		}
	}

	// --- validateDecisionFields twins via AcceptBid ---
	decCases := []struct {
		name  string
		body  string
		field string
		want  string
	}{
		{"bid-missing", `{"bid_type":"arsitek"}`, "bid_id", "The bid id field is required."},
		{"bid-float", `{"bid_id":1.5,"bid_type":"arsitek"}`, "bid_id", "The bid id field must be an integer."},
		{"bid-alpha", `{"bid_id":"abc","bid_type":"arsitek"}`, "bid_id", "The bid id field must be an integer."},
		{"type-missing", `{"bid_id":1}`, "bid_type", "The bid type field is required."},
		{"type-num", `{"bid_id":1,"bid_type":1}`, "bid_type", "The selected bid type is invalid."},
		{"type-pm", `{"bid_id":1,"bid_type":"project_manager"}`, "bid_type", "The selected bid type is invalid."},
		{"notes-num", `{"bid_id":1,"bid_type":"arsitek","verification_notes":1}`, "verification_notes", "The verification notes field must be a string."},
		{"notes-long", `{"bid_id":1,"bid_type":"arsitek","verification_notes":"` + strings.Repeat("hD", 600) + `"}`, "verification_notes", "The verification notes field must not be greater than 1000 characters."},
	}
	for _, tc := range decCases {
		rec := hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/941071/accept-bid", tc.body, &owner, "941071")
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("dec %s = %d %s", tc.name, rec.Code, rec.Body.String())
		}
		errs, ok := hADecode(t, rec)["errors"].(map[string]any)
		if !ok {
			t.Fatalf("dec %s has no errors", tc.name)
		}
		list, ok := errs[tc.field].([]any)
		if !ok {
			t.Fatalf("dec %s missing field %q: %v", tc.name, tc.field, errs)
		}
		found := false
		for _, m := range list {
			if m == tc.want {
				found = true
			}
		}
		if !found {
			t.Fatalf("dec %s field %q = %v, want %q", tc.name, tc.field, list, tc.want)
		}
	}
	// bool bid_id coerces through validation, then misses the row: 404
	rec := hACall(t, AcceptBidHandler(pool), http.MethodPost, "/api/projects/941071/accept-bid", `{"bid_id":true,"bid_type":"arsitek"}`, &owner, "941071")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("dec bool = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "No query results for model [App\\Models\\BidArsitek]." {
		t.Fatalf("dec bool message = %q", got)
	}

	// --- addendumIDFromPath fallback via a real handle call ---
	var addF int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, status, created_at, updated_at)
		VALUES (941071,'arsitek',$1,'hD fallback','100000','rejected',date_trunc('second',now()),date_trunc('second',now())) RETURNING id`, owner.id).Scan(&addF); err != nil {
		t.Fatal(err)
	}
	rec = hDRawCall(t, HandleAddendumHandler(pool), http.MethodPut, "/api/projects/941071/budget/addendums/"+itoaTest(addF),
		`{"status":"approved_unpaid"}`, &owner, map[string]string{"project": "941071"})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("handle fallback = %d %s", rec.Code, rec.Body.String())
	}
	if got := hADecode(t, rec)["message"]; got != "This item has already been processed or is not in a negotiable state." {
		t.Fatalf("handle fallback message = %q", got)
	}

	// --- pure tails ---
	for role, want := range map[string]string{"interior": "Interior Designer", "project_manager": "Project Manager", "structural": "Structural Engineer", "mep": "MEP Engineer", "notaris": "Notary", "kontraktor": "Contractor"} {
		if got := contractBidderName(nil, role); got != want {
			t.Fatalf("contractBidderName nil %q = %q, want %q", role, got, want)
		}
	}
	for typ, role := range map[string]string{"arsitek_bid": "arsitek", "kontraktor_bid": "kontraktor", "notaris_bid": "notaris", "interior_bid": "interior", "pm_bid": "project_manager", "structural_bid": "structural", "mep_bid": "mep"} {
		got, table, ok := proofBidRole(typ)
		if !ok || got != role || table == "" {
			t.Fatalf("proofBidRole %q = %q/%q/%v", typ, got, table, ok)
		}
	}
	if _, _, ok := proofBidRole("bogus"); ok {
		t.Fatalf("proofBidRole bogus ok")
	}
	if tinyInt(nil) != nil || tinyInt(true) != 1 || tinyInt(false) != 0 || tinyInt(int64(3)) != int64(3) || tinyInt(int32(3)) != int64(3) || tinyInt(3) != int64(3) {
		t.Fatalf("tinyInt wrong")
	}
	if got := tinyInt("hD"); got != "hD" {
		t.Fatalf("tinyInt default = %v", got)
	}
	if wallTime(nil) != nil {
		t.Fatalf("wallTime nil wrong")
	}
	if got := wallTime(time.Date(2026, 11, 27, 10, 0, 0, 0, time.UTC)); got != "2026-11-27 10:00:00" {
		t.Fatalf("wallTime time = %v", got)
	}
	if got := wallTime("hD-wall"); got != "hD-wall" {
		t.Fatalf("wallTime string = %v", got)
	}
	for column, want := range map[string]string{"arsitek_id": "arsitek_id", "kontraktor_id": "kontraktor_id", "notaris_id": "notaris_id", "interior_id": "interior_id", "pm_id": "pm_id", "structural_id": "structural_id", "mep_id": "mep_id", "bogus": "arsitek_id"} {
		if got := columnToMilestoneFK(column); got != want {
			t.Fatalf("columnToMilestoneFK %q = %q, want %q", column, got, want)
		}
	}
	if (bidGoneError{}).Error() == "" {
		t.Fatalf("bidGoneError empty")
	}
	if errLedgerGone.Error() == "" {
		t.Fatalf("errLedgerGone empty")
	}
	if nullableStringValue(nil) != nil {
		t.Fatalf("nullableStringValue nil wrong")
	}
	if got := nullableStringValue(strPtr("hD")); got != "hD" {
		t.Fatalf("nullableStringValue = %v", got)
	}
	if jsonTextOrNil(nil) != nil {
		t.Fatalf("jsonTextOrNil nil wrong")
	}
	if got := jsonTextOrNil("hD"); got != `"hD"` {
		t.Fatalf("jsonTextOrNil = %v", got)
	}

	_ = ctx
	hDCleanupVault(t, pool)
	hDCleanup(t, pool)
	hDAssertNoLeftovers(t, pool)
}
