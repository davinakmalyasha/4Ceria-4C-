package httpapi

import (
	"strings"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
)

// TestOrderedDecodeRoundTrips pins the geocode re-encoding contract: the
// decoded-then-re-encoded body must equal PHP's
// `json_encode(json_decode($s))` for the same bytes. The fixture carries
// every sharp edge: key order, `\/`, unicode escapes, nesting, a big
// integer, an empty array, and a null.
func TestOrderedDecodeRoundTrips(t *testing.T) {
	upstream := `{"place_id":31190668,"licence":"Data \u00a9 OSM http:\/\/osm.org\/c","lat":"-6.1999142","address":{"city":"Jakarta","x":null},"tags":[],"n":1.5,"ok":true}`

	value, err := decodeOrdered([]byte(upstream))
	if err != nil {
		t.Fatalf("decodeOrdered: %v", err)
	}

	encoded, err := jsonphp.Marshal(value)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// Verified with: php -r 'echo json_encode(json_decode($s));'
	// (PHP re-escapes the © as \u00a9 — and so does jsonphp.)
	want := `{"place_id":31190668,"licence":"Data © OSM http:\/\/osm.org\/c","lat":"-6.1999142","address":{"city":"Jakarta","x":null},"tags":[],"n":1.5,"ok":true}`
	want = strings.Replace(want, "©", "\\u00a9", 1)

	if string(encoded) != want {
		t.Errorf("re-encoded mismatch:\n got: %s\nwant: %s", encoded, want)
	}
}

// TestGeocodeNumberValidation pins the rule interactions the live app
// showed: a non-numeric fails ONLY the numeric rule (between reads the
// string length, which passes), and bounds are inclusive.
func TestGeocodeNumberValidation(t *testing.T) {
	cases := []struct {
		raw, field string
		min, max   float64
		messages   []string
	}{
		{"", "lat", -90, 90, []string{"The lat field is required."}},
		{"x", "lat", -90, 90, []string{"The lat field must be a number."}},
		{" 1", "lat", -90, 90, []string{"The lat field must be a number."}},
		{"200", "lat", -90, 90, []string{"The lat field must be between -90 and 90."}},
		{"-90", "lat", -90, 90, nil},
		{"90", "lat", -90, 90, nil},
		{"1e3", "lng", -180, 180, []string{"The lng field must be between -180 and 180."}},
		{"106.8", "lng", -180, 180, nil},
	}

	for _, item := range cases {
		bag := &errorBag{}
		_, ok := geocodeNumber(item.raw, item.field, item.min, item.max, bag)

		var got []string
		for _, field := range bag.fields {
			got = append(got, bag.bag[field]...)
		}

		if (len(got) == 0) != (len(item.messages) == 0) || (len(got) > 0 && strings.Join(got, "|") != strings.Join(item.messages, "|")) {
			t.Errorf("geocodeNumber(%q) messages = %q, want %q (ok=%v)", item.raw, got, item.messages, ok)
		}
		if (len(item.messages) == 0) != ok {
			t.Errorf("geocodeNumber(%q) ok = %v, want messages %q", item.raw, ok, item.messages)
		}
	}
}

// TestRound4MatchesPHP pins half-away-from-zero to 4 places.
func TestRound4MatchesPHP(t *testing.T) {
	if got := formatCoord(round4(12.3456789)); got != "12.3457" {
		t.Errorf("round4(12.3456789) = %q, want 12.3457", got)
	}
	if got := formatCoord(round4(-6.2)); got != "-6.2" {
		t.Errorf("round4(-6.2) = %q, want -6.2", got)
	}
}
