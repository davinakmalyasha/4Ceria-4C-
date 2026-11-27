package httpapi

// hM pure units: direct coverage for reachable helpers with zero DB.
// Every expectation is a hand-written literal; rejection twins pin the
// exact validation sentences so a behavior change fails.

import (
	"context"
	"math"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/ai"
	"github.com/jackc/pgx/v5/pgtype"
)

func hMErr(t *testing.T, f *errorBag, field, want string) {
	t.Helper()
	got, ok := f.bag[field]
	if !ok || len(got) == 0 {
		t.Fatalf("missing errors[%q]: %v", field, f.bag)
	}
	if got[0] != want {
		t.Fatalf("errors[%q][0] = %q, want %q", field, got[0], want)
	}
}

func TestHMValidatePMBidHappy(t *testing.T) {
	f := &errorBag{}
	in := validatePMBid(map[string]any{
		"price":              "1500000.00",
		"proposal":           "hM proposal",
		"estimated_duration": 3,
		"duration_unit":      "months",
		"fee_type":           "percentage",
		"unit_price":         "10.50",
		"quantity":           "3.00",
		"scopes":             `{"hM":1}`,
		"deliverables":       []any{"hM-x"},
	}, f)
	if !f.empty() {
		t.Fatalf("happy errors: %v", f.bag)
	}
	if in.priceText != "1500000.00" {
		t.Fatalf("price = %q", in.priceText)
	}
	if in.proposal != "hM proposal" {
		t.Fatalf("proposal = %q", in.proposal)
	}
	if in.duration != 3 {
		t.Fatalf("duration = %d", in.duration)
	}
	if in.durationUnit != "months" {
		t.Fatalf("unit = %q", in.durationUnit)
	}
	if in.feeType != "percentage" {
		t.Fatalf("fee = %q", in.feeType)
	}
	if in.unitPriceText != "10.50" {
		t.Fatalf("unitPrice = %q", in.unitPriceText)
	}
	if in.quantityText != "3.00" {
		t.Fatalf("quantity = %q", in.quantityText)
	}
	if in.scopesJSON == nil || *in.scopesJSON != `{"hM":1}` {
		t.Fatalf("scopes = %v", in.scopesJSON)
	}
	if in.deliverablesJSON == nil || *in.deliverablesJSON != `["hM-x"]` {
		t.Fatalf("deliverables = %v", in.deliverablesJSON)
	}
}

func TestHMValidatePMBidDefaults(t *testing.T) {
	f := &errorBag{}
	in := validatePMBid(map[string]any{
		"price":    "100.00",
		"proposal": "hM minimal",
	}, f)
	if !f.empty() {
		t.Fatalf("minimal errors: %v", f.bag)
	}
	if in.feeType != "fixed" {
		t.Fatalf("default fee = %q", in.feeType)
	}
	if in.duration != 1 {
		t.Fatalf("default duration = %d", in.duration)
	}
	if in.durationUnit != "weeks" {
		t.Fatalf("default unit = %q", in.durationUnit)
	}
	if in.unitPriceText != "0.00" {
		t.Fatalf("default unitPrice = %q", in.unitPriceText)
	}
	if in.quantityText != "0.00" {
		t.Fatalf("default quantity = %q", in.quantityText)
	}
	if in.scopesJSON != nil || in.deliverablesJSON != nil {
		t.Fatalf("default json must be nil")
	}
}

func TestHMValidatePMBidRejects(t *testing.T) {
	cases := []struct {
		name   string
		fields map[string]any
		field  string
		want   string
	}{
		{"price-missing", map[string]any{"proposal": "hM p"}, "price", "The price field is required."},
		{"price-nil", map[string]any{"price": nil, "proposal": "hM p"}, "price", "The price field is required."},
		{"price-alpha", map[string]any{"price": "hM-bogus", "proposal": "hM p"}, "price", "The price field must be a number."},
		{"price-bool", map[string]any{"price": true, "proposal": "hM p"}, "price", "The price field must be a number."},
		{"price-zero", map[string]any{"price": "0", "proposal": "hM p"}, "price", "The price field must be greater than 0."},
		{"price-neg", map[string]any{"price": "-5", "proposal": "hM p"}, "price", "The price field must be greater than 0."},
		{"proposal-missing", map[string]any{"price": "100.00"}, "proposal", "The proposal field is required."},
		{"proposal-num", map[string]any{"price": "100.00", "proposal": 7}, "proposal", "The proposal field must be a string."},
		{"proposal-empty", map[string]any{"price": "100.00", "proposal": ""}, "proposal", "The proposal field is required."},
		{"duration-bad", map[string]any{"price": "100.00", "proposal": "hM p", "estimated_duration": "2.5"}, "estimated_duration", "The estimated duration field must be an integer."},
		{"feetype-bad", map[string]any{"price": "100.00", "proposal": "hM p", "fee_type": "hM-bogus"}, "fee_type", "The selected fee type is invalid."},
		{"unit-neg", map[string]any{"price": "100.00", "proposal": "hM p", "unit_price": "-1"}, "unit_price", "The unit price field must be at least 0."},
		{"unit-alpha", map[string]any{"price": "100.00", "proposal": "hM p", "unit_price": "hM-bogus"}, "unit_price", "The unit price field must be a number."},
		{"qty-neg", map[string]any{"price": "100.00", "proposal": "hM p", "quantity": "-2"}, "quantity", "The quantity field must be at least 0."},
		{"qty-alpha", map[string]any{"price": "100.00", "proposal": "hM p", "quantity": "hM-bogus"}, "quantity", "The quantity field must be a number."},
	}
	for _, tc := range cases {
		f := &errorBag{}
		validatePMBid(tc.fields, f)
		if f.empty() {
			t.Fatalf("%s: expected error", tc.name)
		}
		hMErr(t, f, tc.field, tc.want)
	}
}

func TestHMValidatePMBidDurationZeroKeepsDefault(t *testing.T) {
	f := &errorBag{}
	in := validatePMBid(map[string]any{
		"price": "100.00", "proposal": "hM p", "estimated_duration": 0,
	}, f)
	if !f.empty() {
		t.Fatalf("zero duration errors: %v", f.bag)
	}
	if in.duration != 1 {
		t.Fatalf("zero duration kept = %d, want 1", in.duration)
	}
}

func TestHMCalculateBid(t *testing.T) {
	got := calculateBid("100.00", "fixed", "5.00", "2.00", "1000.00", nil)
	if got.priceText != "100.00" || got.feeType != "fixed" || got.unitPriceText != "5.00" || got.quantityText != "2.00" || got.totalText != "100.00" {
		t.Fatalf("fixed = %+v", got)
	}
	got = calculateBid("10.00", "percentage", "0.00", "0.00", "1000.00", nil)
	if got.totalText != "100.00" {
		t.Fatalf("percentage total = %q, want 100.00", got.totalText)
	}
	got = calculateBid("10.00", "percentage", "0.00", "0.00", "0", nil)
	if got.totalText != "0.00" {
		t.Fatalf("percentage zero budget = %q, want 0.00", got.totalText)
	}
	got = calculateBid("99.99", "unit", "5.00", "3.00", "1000.00", nil)
	if got.totalText != "15.00" {
		t.Fatalf("unit total = %q, want 15.00", got.totalText)
	}
	got = calculateBid("200.00", "sqm", "0.00", "0.00", "1000.00", nil)
	if got.totalText != "200.00" {
		t.Fatalf("sqm total = %q, want 200.00", got.totalText)
	}
	got = calculateBid("77.00", "hM-bogus", "0.00", "0.00", "1000.00", nil)
	if got.totalText != "77.00" {
		t.Fatalf("default total = %q, want 77.00", got.totalText)
	}
}

func TestHMJsonColumnText(t *testing.T) {
	if jsonColumnText(nil) != nil {
		t.Fatal("nil must be nil")
	}
	if jsonColumnText("") != nil {
		t.Fatal("empty must be nil")
	}
	if jsonColumnText("null") != nil {
		t.Fatal("null must be nil")
	}
	if jsonColumnText("  null  ") != nil {
		t.Fatal("padded null must be nil")
	}
	got := jsonColumnText(`{"hM":1}`)
	if got == nil || *got != `{"hM":1}` {
		t.Fatalf("object = %v", got)
	}
	got = jsonColumnText([]any{"hM-x"})
	if got == nil || *got != `["hM-x"]` {
		t.Fatalf("array = %v", got)
	}
	got = jsonColumnText(map[string]any{"hM": "v"})
	if got == nil || *got != `{"hM":"v"}` {
		t.Fatalf("map = %v", got)
	}
	if got := jsonColumnText([]any{make(chan int)}); got != nil {
		t.Fatalf("unmarshallable array = %v, want nil", got)
	}
	if got := jsonColumnText(map[string]any{"hM": make(chan int)}); got != nil {
		t.Fatalf("unmarshallable map = %v, want nil", got)
	}
	got = jsonColumnText(`{}`)
	if got == nil || *got != `[]` {
		t.Fatalf("empty object php rule = %v", got)
	}
	got = jsonColumnText("hM-bogus-{{")
	if got == nil || *got != `"hM-bogus-{{"` {
		t.Fatalf("invalid json string = %v", got)
	}
	if jsonColumnText(5) != nil {
		t.Fatal("int must be nil")
	}
	if jsonColumnText(true) != nil {
		t.Fatal("bool must be nil")
	}
}

func TestHMPmBidPathID(t *testing.T) {
	if got := pmBidPathID("/api/projects/1/pm-bids/42/shortlist"); got != "42" {
		t.Fatalf("shortlist = %q", got)
	}
	if got := pmBidPathID("/api/projects/1/pm-bids/99"); got != "99" {
		t.Fatalf("bare = %q", got)
	}
	if got := pmBidPathID("/api/projects/1/pm-bids/43/"); got != "43" {
		t.Fatalf("trailing = %q", got)
	}
	if got := pmBidPathID("/api/x/hM-7"); got != "hM-7" {
		t.Fatalf("fallback = %q", got)
	}
	if got := pmBidPathID("/api/projects/1/pm-bids"); got != "pm-bids" {
		t.Fatalf("verb-less fallback = %q, want pm-bids", got)
	}
}

func TestHMPmBidResourceLoad(t *testing.T) {
	with := pmBidResourceLoad(true)
	if !with.images || !with.milestones || with.ownerPhone {
		t.Fatalf("base flags = %+v", with)
	}
	if len(with.viewerBidRoles) != 5 || with.viewerBidRoles[0] != "arsitek" || with.viewerBidRoles[4] != "project_manager" {
		t.Fatalf("viewer roles = %v", with.viewerBidRoles)
	}
	if !with.unscopedBids || len(with.countRoles) != 5 {
		t.Fatalf("counts = %+v", with)
	}
	if !with.hiredPros || len(with.engineers) != 1 || with.engineers[0] != "interior_engineer" {
		t.Fatalf("engineers = %v", with.engineers)
	}
	if !with.pmBlock || !with.paymentTermins || !with.ratings || !with.budgetSummary {
		t.Fatalf("with termins = %+v", with)
	}
	without := pmBidResourceLoad(false)
	if without.paymentTermins {
		t.Fatalf("decline must not load termins: %+v", without)
	}
	if !without.pmBlock || !without.ratings || !without.budgetSummary {
		t.Fatalf("decline base = %+v", without)
	}
}

func TestHMValidateVerify(t *testing.T) {
	f := &errorBag{}
	cost, note, set := validateVerify(map[string]any{}, f)
	if cost != "" || note != "" || set {
		t.Fatalf("empty = %q %q %v", cost, note, set)
	}
	hMErr(t, f, "estimated_cost", "The estimated cost field is required.")

	f = &errorBag{}
	_, _, _ = validateVerify(map[string]any{"estimated_cost": "hM-bogus"}, f)
	hMErr(t, f, "estimated_cost", "The estimated cost field must be a number.")

	f = &errorBag{}
	_, _, _ = validateVerify(map[string]any{"estimated_cost": true}, f)
	hMErr(t, f, "estimated_cost", "The estimated cost field must be a number.")

	f = &errorBag{}
	_, _, _ = validateVerify(map[string]any{"estimated_cost": "-5"}, f)
	hMErr(t, f, "estimated_cost", "The estimated cost field must be at least 0.")

	f = &errorBag{}
	cost, note, set = validateVerify(map[string]any{"estimated_cost": "100.00"}, f)
	if !f.empty() || cost != "100.00" || set || note != "" {
		t.Fatalf("happy no note = %q %q %v %v", cost, note, set, f.bag)
	}

	f = &errorBag{}
	cost, note, set = validateVerify(map[string]any{"estimated_cost": "100.00", "pm_note": "hM note"}, f)
	if !f.empty() || !set || note != "hM note" {
		t.Fatalf("happy note = %q %v %v", note, set, f.bag)
	}

	f = &errorBag{}
	_, note, set = validateVerify(map[string]any{"estimated_cost": "100.00", "pm_note": ""}, f)
	if !f.empty() || !set || note != "" {
		t.Fatalf("empty note sets flag = %q %v %v", note, set, f.bag)
	}

	f = &errorBag{}
	_, _, _ = validateVerify(map[string]any{"estimated_cost": "100.00", "pm_note": 7}, f)
	hMErr(t, f, "pm_note", "The pm note field must be a string.")

	f = &errorBag{}
	_, _, _ = validateVerify(map[string]any{"estimated_cost": "100.00", "pm_note": strings.Repeat("n", 501)}, f)
	hMErr(t, f, "pm_note", "The pm note field must not be greater than 500 characters.")
}

func TestHMValidateRejectNote(t *testing.T) {
	f := &errorBag{}
	if got := validateRejectNote(map[string]any{}, f); got != "" {
		t.Fatalf("missing = %q", got)
	}
	hMErr(t, f, "pm_note", "The pm note field is required.")

	f = &errorBag{}
	if got := validateRejectNote(map[string]any{"pm_note": nil}, f); got != "" {
		t.Fatalf("nil = %q", got)
	}
	hMErr(t, f, "pm_note", "The pm note field is required.")

	f = &errorBag{}
	validateRejectNote(map[string]any{"pm_note": 9}, f)
	hMErr(t, f, "pm_note", "The pm note field must be a string.")

	f = &errorBag{}
	validateRejectNote(map[string]any{"pm_note": strings.Repeat("n", 501)}, f)
	hMErr(t, f, "pm_note", "The pm note field must not be greater than 500 characters.")

	f = &errorBag{}
	validateRejectNote(map[string]any{"pm_note": ""}, f)
	hMErr(t, f, "pm_note", "The pm note field is required.")

	f = &errorBag{}
	if got := validateRejectNote(map[string]any{"pm_note": "hM reject"}, f); !f.empty() || got != "hM reject" {
		t.Fatalf("happy = %q %v", got, f.bag)
	}
}

func TestHMInputQuantity(t *testing.T) {
	row := procurementRow{byName: map[string]any{"quantity_needed": "3.50"}}
	if got := inputQuantity(row); got != "3.50" {
		t.Fatalf("string qty = %q", got)
	}
	row = procurementRow{byName: map[string]any{}}
	if got := inputQuantity(row); got != "" {
		t.Fatalf("missing qty = %q", got)
	}
	row = procurementRow{byName: map[string]any{"quantity_needed": nil}}
	if got := inputQuantity(row); got != "" {
		t.Fatalf("nil qty = %q", got)
	}
	row = procurementRow{byName: map[string]any{"quantity_needed": int64(5)}}
	if got := inputQuantity(row); got != "" {
		t.Fatalf("int qty = %q", got)
	}
}

func TestHMSubObjectCreateOrder(t *testing.T) {
	byName := map[string]any{
		"project_id":  int64(1040011),
		"user_id":     int64(1040012),
		"sub_role":    "hM-role",
		"parent_role": "kontraktor",
		"assigned_by": int64(5),
		"status":      "active",
		"rate":        "100.00",
		"scope_notes": "hM scope",
		"id":          int64(77),
	}
	entry := subObjectCreateOrder(byName)
	if v, _ := entry.Get("project_id"); v != int64(1040011) {
		t.Fatalf("project_id = %v", v)
	}
	if v, _ := entry.Get("user_id"); v != int64(1040012) {
		t.Fatalf("user_id = %v", v)
	}
	if v, _ := entry.Get("sub_role"); v != "hM-role" {
		t.Fatalf("sub_role = %v", v)
	}
	if v, _ := entry.Get("parent_role"); v != "kontraktor" {
		t.Fatalf("parent_role = %v", v)
	}
	if v, _ := entry.Get("assigned_by"); v != int64(5) {
		t.Fatalf("assigned_by = %v", v)
	}
	if v, _ := entry.Get("status"); v != "active" {
		t.Fatalf("status = %v", v)
	}
	if v, _ := entry.Get("rate"); v != "100.00" {
		t.Fatalf("rate = %v", v)
	}
	if v, _ := entry.Get("scope_notes"); v != "hM scope" {
		t.Fatalf("scope = %v", v)
	}
	if v, _ := entry.Get("id"); v != int64(77) {
		t.Fatalf("id = %v", v)
	}
	if v, _ := entry.Get("accepted_at"); v != nil {
		t.Fatalf("accepted_at = %v", v)
	}
	wantKeys := []string{"project_id", "user_id", "sub_role", "parent_role", "assigned_by", "status", "rate", "scope_notes", "accepted_at", "completed_at", "updated_at", "created_at", "id"}
	gotKeys := entry.Keys()
	if len(gotKeys) != len(wantKeys) {
		t.Fatalf("keys = %v", gotKeys)
	}
	for i, k := range wantKeys {
		if gotKeys[i] != k {
			t.Fatalf("key %d = %q, want %q (%v)", i, gotKeys[i], k, gotKeys)
		}
	}
}

func TestHMValidateRecommend(t *testing.T) {
	f := &errorBag{}
	fee, notes := validateRecommend(map[string]any{}, f)
	if fee != "" || notes != "" {
		t.Fatalf("empty = %q %q", fee, notes)
	}
	hMErr(t, f, "suggested_fee", "The suggested fee field is required.")
	if _, ok := f.bag["lead_pro_notes"]; !ok {
		t.Fatalf("missing notes error: %v", f.bag)
	}
	if f.bag["lead_pro_notes"][0] != "The lead pro notes field is required." {
		t.Fatalf("notes msg = %q", f.bag["lead_pro_notes"][0])
	}

	f = &errorBag{}
	validateRecommend(map[string]any{"suggested_fee": "hM-bogus", "lead_pro_notes": "hM n"}, f)
	hMErr(t, f, "suggested_fee", "The suggested fee field must be a number.")

	f = &errorBag{}
	validateRecommend(map[string]any{"suggested_fee": "-1", "lead_pro_notes": "hM n"}, f)
	hMErr(t, f, "suggested_fee", "The suggested fee field must be at least 0.")

	f = &errorBag{}
	validateRecommend(map[string]any{"suggested_fee": "250.00", "lead_pro_notes": 9}, f)
	hMErr(t, f, "lead_pro_notes", "The lead pro notes field must be a string.")

	f = &errorBag{}
	validateRecommend(map[string]any{"suggested_fee": "250.00", "lead_pro_notes": ""}, f)
	hMErr(t, f, "lead_pro_notes", "The lead pro notes field is required.")

	f = &errorBag{}
	validateRecommend(map[string]any{"suggested_fee": "250.00", "lead_pro_notes": strings.Repeat("n", 2001)}, f)
	hMErr(t, f, "lead_pro_notes", "The lead pro notes field must not be greater than 2000 characters.")

	f = &errorBag{}
	fee, notes = validateRecommend(map[string]any{"suggested_fee": "250.00", "lead_pro_notes": "hM notes"}, f)
	if !f.empty() || fee != "250.00" || notes != "hM notes" {
		t.Fatalf("happy = %q %q %v", fee, notes, f.bag)
	}
}

func TestHMHireMatches(t *testing.T) {
	viewer := func(role string, own int64) *projectViewer {
		return &projectViewer{role: role, profiles: map[string]int64{role: own}}
	}
	happy := []struct {
		role   string
		column string
		own    int64
	}{
		{"arsitek", "selected_arsitek_id", 1040011},
		{"kontraktor", "selected_kontraktor_id", 1040012},
		{"notaris", "selected_notaris_id", 1040013},
		{"interior", "selected_interior_id", 1040014},
		{"project_manager", "pm_id", 1040015},
		{"structural", "structural_id", 1040016},
		{"mep", "mep_id", 1040017},
	}
	for _, tc := range happy {
		cols := map[string]any{tc.column: tc.own}
		if !hireMatches(viewer(tc.role, tc.own), cols, tc.role) {
			t.Fatalf("%s happy false", tc.role)
		}
		// Mismatch: selected belongs to someone else.
		colsMiss := map[string]any{tc.column: int64(1099999)}
		if hireMatches(viewer(tc.role, tc.own), colsMiss, tc.role) {
			t.Fatalf("%s mismatch true", tc.role)
		}
		// Missing column reads as zero.
		if hireMatches(viewer(tc.role, tc.own), map[string]any{}, tc.role) {
			t.Fatalf("%s missing true", tc.role)
		}
	}
	if hireMatches(viewer("arsitek", 1), map[string]any{"selected_arsitek_id": int64(1)}, "kontraktor") {
		t.Fatal("role mismatch must be false")
	}
	if hireMatches(viewer("arsitek", 0), map[string]any{"selected_arsitek_id": int64(0)}, "arsitek") {
		t.Fatal("zero profile must be false")
	}
	if hireMatches(&projectViewer{role: "arsitek", profiles: map[string]int64{}}, map[string]any{"selected_arsitek_id": int64(1)}, "arsitek") {
		t.Fatal("missing profile must be false")
	}
	_ = happy
	if hireMatches(viewer("arsitek", 1), map[string]any{"selected_arsitek_id": int64(1)}, "hM-bogus") {
		t.Fatal("unknown role must be false")
	}
}

func TestHMFirmFloatOf(t *testing.T) {
	if got := firmFloatOf(nil); got != 0 {
		t.Fatalf("nil = %v", got)
	}
	if got := firmFloatOf(int32(7)); got != 7 {
		t.Fatalf("int32 = %v", got)
	}
	if got := firmFloatOf("12.50"); got != 12.5 {
		t.Fatalf("string = %v", got)
	}
	if got := firmFloatOf(float64(3.25)); got != 3.25 {
		t.Fatalf("float64 = %v", got)
	}
	if got := firmFloatOf(int64(9)); got != 9 {
		t.Fatalf("int64 = %v", got)
	}
	if got := firmFloatOf(true); got != 0 {
		t.Fatalf("bool = %v", got)
	}
	valid := pgtype.Numeric{Int: big.NewInt(150000), Exp: -2, Valid: true}
	if got := firmFloatOf(valid); got != 1500 {
		t.Fatalf("numeric valid = %v", got)
	}
	if got := firmFloatOf(pgtype.Numeric{Valid: false}); got != 0 {
		t.Fatalf("numeric invalid = %v", got)
	}
	badExp := pgtype.Numeric{Int: big.NewInt(1), Exp: 1000000000, Valid: true}
	if got := firmFloatOf(badExp); got != 0 {
		t.Fatalf("numeric overflow = %v, want 0", got)
	}
}

func TestHMFirmIntOf(t *testing.T) {
	if got := firmIntOf(nil); got != 0 {
		t.Fatalf("nil = %d", got)
	}
	if got := firmIntOf(int64(42)); got != 42 {
		t.Fatalf("int64 = %d", got)
	}
	if got := firmIntOf(int32(7)); got != 7 {
		t.Fatalf("int32 = %d", got)
	}
	if got := firmIntOf(int16(5)); got != 5 {
		t.Fatalf("int16 = %d", got)
	}
	if got := firmIntOf(int(6)); got != 6 {
		t.Fatalf("int = %d", got)
	}
	if got := firmIntOf(float64(9.9)); got != 9 {
		t.Fatalf("float = %d", got)
	}
	if got := firmIntOf(" 42 "); got != 42 {
		t.Fatalf("spaced = %d", got)
	}
	if got := firmIntOf("abc"); got != 0 {
		t.Fatalf("bogus = %d", got)
	}
	if got := firmIntOf(true); got != 0 {
		t.Fatalf("bool = %d", got)
	}
}

func TestHMAiMessageObject(t *testing.T) {
	at := time.Date(2026, 11, 27, 10, 0, 0, 0, time.UTC)
	m := ai.StoredMessage{ID: 1040001, Role: "user", Content: "hM hello", CreatedAt: at}
	entry := aiMessageObject(m)
	if v, _ := entry.Get("id"); v != int64(1040001) {
		t.Fatalf("id = %v", v)
	}
	if v, _ := entry.Get("role"); v != "user" {
		t.Fatalf("role = %v", v)
	}
	if v, _ := entry.Get("content"); v != "hM hello" {
		t.Fatalf("content = %v", v)
	}
	if v, _ := entry.Get("created_at"); v != "2026-11-27T10:00:00.000000Z" {
		t.Fatalf("created_at = %v", v)
	}
}

func TestHMDailyLogPhotoURLs(t *testing.T) {
	t.Setenv("APP_URL", "https://api.example")
	t.Setenv("PUBLIC_ASSET_BASE", "")
	ctx := context.Background()
	if got := dailyLogPhotoURLs(ctx, nil); len(got) != 0 {
		t.Fatalf("nil = %v", got)
	}
	if got := dailyLogPhotoURLs(ctx, "hM-bogus"); len(got) != 0 {
		t.Fatalf("scalar = %v", got)
	}
	if got := dailyLogPhotoURLs(ctx, []any{}); len(got) != 0 {
		t.Fatalf("empty = %v", got)
	}
	got := dailyLogPhotoURLs(ctx, []any{"avatars/hM-1.jpg", "", 123, "https://cdn.example/hM.png"})
	if len(got) != 2 {
		t.Fatalf("mixed len = %d (%v)", len(got), got)
	}
	if got[0] != "https://api.example/storage/avatars/hM-1.jpg" {
		t.Fatalf("resolved = %v", got[0])
	}
	if got[1] != "https://cdn.example/hM.png" {
		t.Fatalf("external = %v", got[1])
	}
}

func TestHMAddendumIDFromPath(t *testing.T) {
	if got := addendumIDFromPath("/api/projects/1/budget/addendums/55/handle"); got != "55" {
		t.Fatalf("handle = %q", got)
	}
	if got := addendumIDFromPath("/api/projects/1/budget/addendums/56"); got != "56" {
		t.Fatalf("bare = %q", got)
	}
	if got := addendumIDFromPath("/api/x/hM-99"); got != "hM-99" {
		t.Fatalf("fallback = %q", got)
	}
	if got := addendumIDFromPath("/api/projects/1/budget/addendums/"); got != "addendums" {
		t.Fatalf("trailing = %q", got)
	}
}

func TestHMNullableHelpers(t *testing.T) {
	if nullableStringValue(nil) != nil {
		t.Fatal("nil must stay nil")
	}
	s := "hM-val"
	if got := nullableStringValue(&s); got != "hM-val" {
		t.Fatalf("value = %v", got)
	}
	if jsonTextOrNil(nil) != nil {
		t.Fatal("nil json must be nil")
	}
	if got := jsonTextOrNil("hM"); got != `"hM"` {
		t.Fatalf("string json = %v", got)
	}
	if got := jsonTextOrNil(map[string]any{"hM": "v"}); got != `{"hM":"v"}` {
		t.Fatalf("map json = %v", got)
	}
	if jsonTextOrNil(math.NaN()) != nil {
		t.Fatal("NaN marshal error must be nil")
	}
}

func TestHMFallbackHelpers(t *testing.T) {
	if got := lastPathSegment("/a/b/c"); got != "c" {
		t.Fatalf("last = %q", got)
	}
	if got := lastPathSegment("/a/b/"); got != "b" {
		t.Fatalf("trailing = %q", got)
	}
	if got := lastPathSegment(""); got != "" {
		t.Fatalf("empty = %q", got)
	}
	if got := lastPathSegment("/"); got != "" {
		t.Fatalf("root = %q", got)
	}
	if got := projectPathSegment("/api/projects/1040001/requirements/55"); got != "1040001" {
		t.Fatalf("project seg = %q", got)
	}
	if got := projectPathSegment("/api/x/hM-tail"); got != "hM-tail" {
		t.Fatalf("project fallback = %q", got)
	}
	if got := subPathID("/api/x/sub-professionals/77"); got != "77" {
		t.Fatalf("sub = %q", got)
	}
	if got := subPathID("/api/x/hM-tail"); got != "hM-tail" {
		t.Fatalf("sub fallback = %q", got)
	}
	fb := "hM-fallback"
	if got := derefString(nil, fb); got != "hM-fallback" {
		t.Fatalf("deref nil = %q", got)
	}
	v := "hM-v"
	if got := derefString(&v, fb); got != "hM-v" {
		t.Fatalf("deref val = %q", got)
	}
	if got := orEmpty(nil); got != "" {
		t.Fatalf("orEmpty nil = %q", got)
	}
	if got := orEmpty(&v); got != "hM-v" {
		t.Fatalf("orEmpty val = %q", got)
	}
	if got := orEmptyString(nil); got != "" {
		t.Fatalf("orEmptyString nil = %q", got)
	}
	if got := orEmptyString("hM-s"); got != "hM-s" {
		t.Fatalf("orEmptyString val = %q", got)
	}
	if got := orEmptyString(7); got != "" {
		t.Fatalf("orEmptyString non-string = %q", got)
	}
	if got := orEmptyStrPtr(nil); got != "0" {
		t.Fatalf("orEmptyStrPtr nil = %q", got)
	}
	if got := orEmptyStrPtr(&v); got != "hM-v" {
		t.Fatalf("orEmptyStrPtr val = %q", got)
	}
}
