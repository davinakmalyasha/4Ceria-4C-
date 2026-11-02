package httpapi

import (
	"net/url"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
)

// THE PAGINATOR
// -------------
// Seven endpoints return Laravel's raw `LengthAwarePaginator`, and five more
// return its `PaginatedResourceResponse` sibling. The shape is the contract:
// thirteen keys in a fixed order, a `links` window, and URLs built from the
// CALLER's request — not from configuration.
//
// The key order is part of the bytes (PHP arrays preserve insertion order,
// and `response()->json()` writes that order), so the object is built with
// `jsonphp.Object` — a Go map would sort the keys and the body would differ
// even though every value was right.
//
// Verified against the live application (`artisan tinker`):
//
//	empty: from/to/next/prev null, one link (page 1, active), last_page 1
//	ellipsis: {"url":null,"label":"...","active":false} — three dots, and NO
//	  `page` key at all (the source omits it; a null would be different bytes)
//	prev/next: always carry `page` (possibly null), labels "&laquo; Previous"
//	  and "Next &raquo;" with the entities UNESCAPED (Laravel does not
//	  entity-encode them inside JSON)
//	query: preserved in request order, page LAST, RFC 3986 (`a%20b`, not `a+b`)
//	last_page: max(ceil(total/perPage), 1); invalid current page reads as 1
//
// The window is `UrlWindow` with `onEachSide = 3` (the framework default,
// never changed by the application).

// Paginate builds the `LengthAwarePaginator` body.
//
//   - total is the full count, before slicing.
//   - perPage is the page size.
//   - currentPage is the requested page; anything invalid reads as 1.
//   - basePath is the caller's scheme://host/path (no query).
//   - rawQuery is the caller's raw query string (no leading `?`); the `page`
//     parameter is replaced, everything else is preserved in order.
//   - items are the current slice, already encoded.
func Paginate(total, perPage, currentPage int, basePath, rawQuery string, items []any) *jsonphp.Object {
	if perPage <= 0 {
		perPage = 15
	}

	lastPage := total / perPage
	if total%perPage != 0 {
		lastPage++
	}
	if lastPage < 1 {
		lastPage = 1
	}

	if currentPage < 1 {
		currentPage = 1
	}

	if items == nil {
		items = []any{}
	}

	var from, to any
	if len(items) > 0 {
		from = (currentPage-1)*perPage + 1
		to = (currentPage-1)*perPage + len(items)
	}

	pageURL := func(page int) any {
		return buildPageURL(basePath, rawQuery, page)
	}

	var firstPageURL, lastPageURL, nextPageURL, prevPageURL any
	firstPageURL = pageURL(1)
	lastPageURL = pageURL(lastPage)

	if currentPage < lastPage {
		nextPageURL = pageURL(currentPage + 1)
	}
	if currentPage > 1 {
		prevPageURL = pageURL(currentPage - 1)
	}

	body := jsonphp.NewObject()
	body.Set("current_page", currentPage)
	body.Set("data", items)
	body.Set("first_page_url", firstPageURL)
	body.Set("from", from)
	body.Set("last_page", lastPage)
	body.Set("last_page_url", lastPageURL)
	body.Set("links", pageLinks(currentPage, lastPage, basePath, rawQuery))
	body.Set("next_page_url", nextPageURL)
	body.Set("path", basePath)
	body.Set("per_page", perPage)
	body.Set("prev_page_url", prevPageURL)
	body.Set("to", to)
	body.Set("total", total)

	return body
}

// pageLinks builds the `[previous] + window + [next]` list.
func pageLinks(currentPage, lastPage int, basePath, rawQuery string) []any {
	links := []any{link(prevURL(currentPage, basePath, rawQuery), "&laquo; Previous", prevPage(currentPage), false, true)}

	for _, page := range windowPages(currentPage, lastPage) {
		if page == 0 {
			// The ellipsis: three dots, no `page` key. `link` with
			// withPage=false omits it, which is what the source does.
			links = append(links, link(nil, "...", 0, false, false))
			continue
		}

		links = append(links, link(buildPageURL(basePath, rawQuery, page), strconv.Itoa(page), page, page == currentPage, true))
	}

	links = append(links, link(nextURL(currentPage, lastPage, basePath, rawQuery), "Next &raquo;", nextPage(currentPage, lastPage), false, true))

	return links
}

// link builds one entry. withPage=false omits the `page` key (the ellipsis).
func link(target any, label string, page int, active, withPage bool) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("url", target)
	entry.Set("label", label)

	if withPage {
		if target == nil && (label == "&laquo; Previous" || label == "Next &raquo;") {
			// A disabled arrow still carries `page: null` — unlike the
			// ellipsis, which carries no `page` key at all.
			if (label == "&laquo; Previous" && page <= 0) || (label == "Next &raquo;" && page <= 0) {
				entry.Set("page", nil)
			} else {
				entry.Set("page", page)
			}
		} else {
			entry.Set("page", page)
		}
	}

	entry.Set("active", active)

	return entry
}

func prevPage(current int) int {
	if current > 1 {
		return current - 1
	}
	return 0
}

func nextPage(current, last int) int {
	if current < last {
		return current + 1
	}
	return 0
}

func prevURL(current int, basePath, rawQuery string) any {
	if current <= 1 {
		return nil
	}
	return buildPageURL(basePath, rawQuery, current-1)
}

func nextURL(current, last int, basePath, rawQuery string) any {
	if current >= last {
		return nil
	}
	return buildPageURL(basePath, rawQuery, current+1)
}

// windowPages returns the page numbers of the window, with 0 marking an
// ellipsis. It is `UrlWindow` with `onEachSide = 3`, ported literally.
func windowPages(current, last int) []int {
	const onEachSide = 3

	if last < onEachSide*2+8 {
		return sequence(1, last)
	}

	window := onEachSide + 4

	if current <= window {
		out := sequence(1, window+onEachSide)
		out = append(out, 0)
		out = append(out, last-1, last)
		return out
	}

	if current > last-window {
		out := sequence(1, 2)
		out = append(out, 0)
		out = append(out, sequence(last-(window+onEachSide-1), last)...)
		return out
	}

	out := sequence(1, 2)
	out = append(out, 0)
	out = append(out, sequence(current-onEachSide, current+onEachSide)...)
	out = append(out, 0)
	out = append(out, last-1, last)

	return out
}

func sequence(from, to int) []int {
	out := make([]int, 0, to-from+1)
	for i := from; i <= to; i++ {
		out = append(out, i)
	}
	return out
}

// buildPageURL is `$paginator->url($page)`: the caller path, the caller query
// in order with `page` replaced (page LAST), RFC 3986 encoded.
func buildPageURL(basePath, rawQuery string, page int) string {
	if page <= 0 {
		page = 1
	}

	kept := [][2]string{}

	if rawQuery != "" {
		for _, part := range strings.Split(rawQuery, "&") {
			if part == "" {
				continue
			}

			key, value, _ := strings.Cut(part, "=")

			decodedKey, err := url.QueryUnescape(key)
			if err != nil {
				decodedKey = key
			}

			if decodedKey == "page" {
				continue
			}

			decodedValue := ""
			if value != "" {
				if decoded, err := url.QueryUnescape(value); err == nil {
					decodedValue = decoded
				} else {
					decodedValue = value
				}
			}

			kept = append(kept, [2]string{decodedKey, decodedValue})
		}
	}

	kept = append(kept, [2]string{"page", strconv.Itoa(page)})

	parts := make([]string, 0, len(kept))
	for _, pair := range kept {
		parts = append(parts, phpEscape(pair[0])+"="+phpEscape(pair[1]))
	}

	separator := "?"
	if strings.Contains(basePath, "?") {
		separator = "&"
	}

	return basePath + separator + strings.Join(parts, "&")
}

// phpEscape is PHP's `rawurlencode` (RFC 3986): Go's `QueryEscape` with the
// space as `%20` rather than `+`. Everything else the two agree on for the
// characters a query key or value can hold.
func phpEscape(s string) string {
	return strings.ReplaceAll(url.QueryEscape(s), "+", "%20")
}
