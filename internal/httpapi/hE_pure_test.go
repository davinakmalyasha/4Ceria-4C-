package httpapi

// hE pure pins: branch-level behavior of the small helpers behind this
// worker's handlers. No database is involved; each case asserts the exact
// value so a behavior change fails the test.

import (
	"testing"
	"time"
)

func TestHEPureHelpers(t *testing.T) {
	// parseBooleanFlag: bool, float and "1"/"0" spellings only.
	for _, tc := range []struct {
		in    any
		want  bool
		valid bool
	}{
		{true, true, true},
		{false, false, true},
		{float64(1), true, true},
		{float64(0), false, true},
		{float64(2), false, false},
		{"1", true, true},
		{"0", false, true},
		{" 1 ", true, true},
		{"2", false, false},
		{"yes", false, false},
		{1, false, false},
		{nil, false, false},
	} {
		got, ok := parseBooleanFlag(tc.in)
		if got != tc.want || ok != tc.valid {
			t.Fatalf("parseBooleanFlag(%v) = %v/%v, want %v/%v", tc.in, got, ok, tc.want, tc.valid)
		}
	}

	// timeOf: time, pointer, datetime string, garbage, nil.
	anchor := time.Date(2026, 5, 4, 3, 2, 1, 0, time.UTC)
	if got := timeOf(anchor); !got.Equal(anchor) {
		t.Fatalf("timeOf time = %v", got)
	}
	if got := timeOf(&anchor); !got.Equal(anchor) {
		t.Fatalf("timeOf ptr = %v", got)
	}
	var nilTime *time.Time
	if got := timeOf(nilTime); !got.IsZero() {
		t.Fatalf("timeOf nil ptr = %v", got)
	}
	if got := timeOf("2026-01-02 15:04:05"); got.Format("2006-01-02") != "2026-01-02" {
		t.Fatalf("timeOf string = %v", got)
	}
	if got := timeOf("bogus"); !got.IsZero() {
		t.Fatalf("timeOf garbage = %v", got)
	}
	if got := timeOf(nil); !got.IsZero() {
		t.Fatalf("timeOf nil = %v", got)
	}

	// stringsTrimSuffix / stringsTrim.
	if got := stringsTrimSuffix("/x/pm-review", "/pm-review"); got != "/x" {
		t.Fatalf("trimSuffix = %q", got)
	}
	if got := stringsTrimSuffix("/x/other", "/pm-review"); got != "/x/other" {
		t.Fatalf("trimSuffix miss = %q", got)
	}
	if got := stringsTrim("  42\t"); got != "42" {
		t.Fatalf("stringsTrim = %q", got)
	}

	// sortedPhaseList: strings sort, non-strings drop.
	if got := sortedPhaseList([]any{"legal", "design", 5, "build"}); len(got) != 3 || got[0] != "build" || got[1] != "design" || got[2] != "legal" {
		t.Fatalf("sortedPhaseList = %v", got)
	}
	if got := sortedPhaseList("nope"); len(got) != 0 {
		t.Fatalf("sortedPhaseList scalar = %v", got)
	}

	// sortStrings + round-trip through stringSliceToAny.
	list := []string{"legal", "construction", "design"}
	sortStrings(list)
	if list[0] != "construction" || list[1] != "design" || list[2] != "legal" {
		t.Fatalf("sortStrings = %v", list)
	}
	_ = stringSliceToAny(list)

	// uniqueStrings de-duplicates keeping first-seen order.
	if got := uniqueStrings([]string{"a", "b", "a", "c", "b"}); len(got) != 3 || got[0] != "a" || got[1] != "b" || got[2] != "c" {
		t.Fatalf("uniqueStrings = %v", got)
	}

	// milestoneFiles / milestoneFileNames over image + gallery content.
	image := "vault/hE-i.jpg"
	files := milestoneFiles(&image, []byte(`{"gallery":["vault/hE-i.jpg","vault/hE-g.pdf"],"file_names":{"vault/hE-g.pdf":"hE label"}}`))
	if len(files) != 2 || files[0] != "vault/hE-i.jpg" || files[1] != "vault/hE-g.pdf" {
		t.Fatalf("milestoneFiles = %v", files)
	}
	names := milestoneFileNames([]byte(`{"file_names":{"vault/hE-g.pdf":"hE label"}}`))
	if names["vault/hE-g.pdf"] != "hE label" {
		t.Fatalf("milestoneFileNames = %v", names)
	}
	if got := milestoneFileNames([]byte(`{"gallery":[]}`)); len(got) != 0 {
		t.Fatalf("milestoneFileNames missing = %v", got)
	}
	if got := milestoneFiles(nil, nil); len(got) != 0 {
		t.Fatalf("milestoneFiles nil = %v", got)
	}
	if got := milestoneFiles(nil, []byte(`bogus`)); len(got) != 0 {
		t.Fatalf("milestoneFiles bogus = %v", got)
	}

	// validateAction: required, typed, known.
	bag := &errorBag{}
	if got := validateAction(map[string]any{"action": "approve"}, bag); got != "approve" || !bag.empty() {
		t.Fatalf("validateAction approve = %q %v", got, bag)
	}
	bag = &errorBag{}
	if got := validateAction(map[string]any{}, bag); got != "" || bag.empty() {
		t.Fatalf("validateAction missing = %q %v", got, bag)
	}
	bag = &errorBag{}
	if got := validateAction(map[string]any{"action": 5}, bag); got != "" || bag.empty() {
		t.Fatalf("validateAction numeric = %q %v", got, bag)
	}
	bag = &errorBag{}
	if got := validateAction(map[string]any{"action": "maybe"}, bag); got != "" || bag.empty() {
		t.Fatalf("validateAction bogus = %q %v", got, bag)
	}

	// extensionStatus: the owner and PM vocabularies.
	bag = &errorBag{}
	if got := extensionStatus(map[string]any{"status": "approved"}, bag, "approved", "rejected"); got != "approved" {
		t.Fatalf("extensionStatus = %q", got)
	}
	bag = &errorBag{}
	if got := extensionStatus(map[string]any{"status": "pm_reviewed"}, bag, "approved", "rejected"); got != "" || bag.empty() {
		t.Fatalf("extensionStatus wrong vocab = %q", got)
	}
	bag = &errorBag{}
	if got := extensionStatus(map[string]any{"status": ""}, bag, "approved", "rejected"); got != "" || bag.empty() {
		t.Fatalf("extensionStatus blank = %q", got)
	}
	bag = &errorBag{}
	if got := extensionStatus(map[string]any{"status": 5}, bag, "approved", "rejected"); got != "" || bag.empty() {
		t.Fatalf("extensionStatus numeric = %q", got)
	}
}
