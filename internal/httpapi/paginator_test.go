package httpapi

import (
	"strings"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
)

// TestThePaginatorMatchesTheGoldenShape pins the 13 keys in order and the
// single-page window, against `get.api.admin.projects.json`.
func TestThePaginatorMatchesTheGoldenShape(t *testing.T) {
	items := make([]any, 0, 10)
	for i := 0; i < 10; i++ {
		items = append(items, jsonphp.NewObject())
	}

	body := Paginate(10, 15, 1, "http://localhost/api/admin/projects", "", items)
	encoded, err := jsonphp.Marshal(body)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	got := string(encoded)

	// The key order is the contract.
	wantOrder := []string{
		`"current_page"`, `"data"`, `"first_page_url"`, `"from"`,
		`"last_page"`, `"last_page_url"`, `"links"`, `"next_page_url"`,
		`"path"`, `"per_page"`, `"prev_page_url"`, `"to"`, `"total"`,
	}

	at := 0
	for _, key := range wantOrder {
		i := strings.Index(got[at:], key)
		if i < 0 {
			t.Fatalf("the body has no %s: %s", key, got)
		}
		at += i + len(key)
	}

	for _, fragment := range []string{
		`"current_page":1`,
		`"per_page":15`,
		`"total":10`,
		`"last_page":1`,
		`"from":1`,
		`"to":10`,
		`"label":"&laquo; Previous"`,
		`"label":"Next &raquo;"`,
		`"prev_page_url":null`,
		`"next_page_url":null`,
	} {
		if !strings.Contains(got, fragment) {
			t.Errorf("the body has no %s: %s", fragment, got)
		}
	}

	// The slashes are escaped, because PHP's `json_encode` escapes them.
	if !strings.Contains(got, `http:\/\/localhost\/api\/admin\/projects?page=1`) {
		t.Errorf("the page URL is not PHP-escaped: %s", got)
	}
}

// TestTheEmptyPageHasNullFromAndTo pins the empty result, verified live:
// from/to/next/prev null, one active link, last_page 1.
func TestTheEmptyPageHasNullFromAndTo(t *testing.T) {
	body := Paginate(0, 15, 1, "http://localhost/api/x", "", nil)
	encoded, err := jsonphp.Marshal(body)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	got := string(encoded)

	for _, fragment := range []string{
		`"data":[]`,
		`"from":null`,
		`"to":null`,
		`"total":0`,
		`"last_page":1`,
		`"next_page_url":null`,
		`"prev_page_url":null`,
		`{"url":null,"label":"&laquo; Previous","page":null,"active":false}`,
	} {
		if !strings.Contains(got, fragment) {
			t.Errorf("the empty body has no %s: %s", fragment, got)
		}
	}
}

// TestTheEllipsisHasNoPageKey pins the shape `artisan tinker` proved: the
// ellipsis is three dots with url/label/active and NO page key — a null
// would be different bytes.
func TestTheEllipsisHasNoPageKey(t *testing.T) {
	items := make([]any, 0, 15)
	for i := 0; i < 15; i++ {
		items = append(items, jsonphp.NewObject())
	}

	// 300 rows at 15 per page, on page 10: the full slider.
	body := Paginate(300, 15, 10, "http://localhost/api/x", "", items)
	encoded, err := jsonphp.Marshal(body)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	got := string(encoded)

	if !strings.Contains(got, `{"url":null,"label":"...","active":false}`) {
		t.Errorf("the ellipsis is not the bare three-dot entry: %s", got)
	}

	if strings.Contains(got, `"label":"..."`) && strings.Contains(got, `"label":"...","page"`) {
		t.Errorf("the ellipsis carries a page key: %s", got)
	}

	// The window: 1, 2, …, 7..13, …, 19, 20 — exactly what tinker printed.
	for _, label := range []string{`"label":"1"`, `"label":"7"`, `"label":"10"`, `"label":"13"`, `"label":"20"`} {
		if !strings.Contains(got, label) {
			t.Errorf("the full-slider body has no %s: %s", label, got)
		}
	}

	if !strings.Contains(got, `"label":"10","page":10,"active":true`) {
		t.Errorf("page 10 is not the active one: %s", got)
	}
}

// TestTheSmallSliderShowsEveryPage pins the <14-page case: no ellipsis.
func TestTheSmallSliderShowsEveryPage(t *testing.T) {
	items := make([]any, 0, 15)
	for i := 0; i < 15; i++ {
		items = append(items, jsonphp.NewObject())
	}

	body := Paginate(150, 15, 5, "http://localhost/api/x", "", items)
	encoded, err := jsonphp.Marshal(body)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	got := string(encoded)

	if strings.Contains(got, `"label":"..."`) {
		t.Errorf("a 10-page window must not ellide: %s", got)
	}

	for i := 1; i <= 10; i++ {
		if !strings.Contains(got, `"label":"`+itoa(i)+`"`) {
			t.Errorf("the small slider has no page %d: %s", i, got)
		}
	}
}

// TestTheQueryIsPreservedWithPageLast pins the URL rule tinker proved:
// `?q=a%20b&page=1` — the caller query in order, page last, RFC 3986.
func TestTheQueryIsPreservedWithPageLast(t *testing.T) {
	u := buildPageURL("http://localhost/api/x", "q=a+b", 1)

	if u != "http://localhost/api/x?q=a%20b&page=1" {
		t.Errorf("url = %q, want the RFC 3986 form with page last", u)
	}

	u = buildPageURL("http://localhost/api/x", "b=2&a=1&page=9", 3)

	if u != "http://localhost/api/x?b=2&a=1&page=3" {
		t.Errorf("url = %q, want the caller order with page replaced", u)
	}
}

// TestAnInvalidPageReadsAsOne pins `isValidPageNumber`: 0 and negatives are
// page 1, not an empty result.
func TestAnInvalidPageReadsAsOne(t *testing.T) {
	body := Paginate(10, 15, 0, "http://localhost/api/x", "", []any{jsonphp.NewObject()})
	encoded, err := jsonphp.Marshal(body)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	if !strings.Contains(string(encoded), `"current_page":1`) {
		t.Errorf("page 0 did not read as 1: %s", encoded)
	}
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}

	negative := i < 0
	if negative {
		i = -i
	}

	digits := []byte{}
	for i > 0 {
		digits = append([]byte{byte('0' + i%10)}, digits...)
		i /= 10
	}

	if negative {
		digits = append([]byte{'-'}, digits...)
	}

	return string(digits)
}
