package jsonphp

import (
	"fmt"
	"testing"
)

// The expectations below are PHP's OWN output, captured from
// `json_encode($value)` with the default flags — the flags Laravel's
// `response()->json()` uses.
//
// The full differential over a 2 000-case corpus lives in `tools/json/` and
// runs in CI; these are the cases that are worth reading, because each one
// is a rule rather than a value.

// phpEscape is the six characters PHP writes for a character above U+007E.
//
// It is a FUNCTION rather than a literal because a literal `\u00e9` in a
// source file is a trap: it reads as the character it escapes, and the
// difference between the escape and the character is the whole point.
func phpEscape(r rune) string {
	return fmt.Sprintf(`\u%04x`, r)
}

// phpSurrogatePair is the twelve characters PHP writes for a character
// outside the basic multilingual plane.
func phpSurrogatePair(r rune) string {
	r -= 0x10000

	return phpEscape(0xD800+(r>>10)) + phpEscape(0xDC00+(r&0x3FF))
}

func TestEncodeString(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"the forward slash is escaped", "a/b", `"a\/b"`},
		{"a url", "https://example.test/api", `"https:\/\/example.test\/api"`},
		{"the html characters are not", "<b>&x</b>", `"<b>&x<\/b>"`},
		{"the double quote", `he said "hi"`, `"he said \"hi\""`},
		{"the backslash", `a\b`, `"a\\b"`},
		{"the backspace has a short escape", "\b", `"\b"`},
		{"the form feed has a short escape", "\f", `"\f"`},
		{"the newline", "\n", `"\n"`},
		{"the carriage return", "\r", `"\r"`},
		{"the tab", "\t", `"\t"`},
		{"the vertical tab has no short escape", "\v", `"\u000b"`},
		{"the null byte", "\x00", `"\u0000"`},
		{"the last control character", "\x1f", `"\u001f"`},
		{"the delete character is not escaped", "\x7f", "\"\x7f\""},
		{"the accented characters are escaped", "café", `"caf` + phpEscape(0xe9) + `"`},
		{"the chinese characters are escaped", "测试", `"` + phpEscape(0x6d4b) + phpEscape(0x8bd5) + `"`},
		{"the emoji is a surrogate pair", "👍", `"` + phpSurrogatePair(0x1F44D) + `"`},
		{"the empty string", "", `""`},
	}

	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			got, err := Marshal(item.in)
			if err != nil {
				t.Fatalf("Marshal(%q) failed: %v", item.in, err)
			}

			if string(got) != item.want {
				t.Errorf("Marshal(%q)\n  got  %s\n  want %s", item.in, got, item.want)
			}
		})
	}
}

func TestFormatFloat(t *testing.T) {
	cases := []struct {
		in   float64
		want string
	}{
		// The plain form has no trailing `.0`.
		{1, "1"},
		{100, "100"},
		{5500000, "5500000"},
		{0, "0"},
		{0.1, "0.1"},
		{1.5, "1.5"},
		{123456.789, "123456.789"},
		{1.0 / 3.0, "0.3333333333333333"},

		// `decpt <= -4` is the exponential threshold.
		{0.0001, "0.0001"},
		{0.00001, "1.0e-5"},
		{1.5e-5, "1.5e-5"},
		{1e-7, "1.0e-7"},

		// `decpt > 17` is the other one.
		{1e15, "1000000000000000"},
		{1e16, "10000000000000000"},
		{1e17, "1.0e+17"},
		{1e20, "1.0e+20"},
		{1e21, "1.0e+21"},
		{1.2345678901234568e17, "1.2345678901234568e+17"},
		{1.2345678901234568e20, "1.2345678901234568e+20"},
		{1.7976931348623157e308, "1.7976931348623157e+308"},
		{5e-324, "5.0e-324"},

		// The negative zero.
		{negZero(), "-0"},
	}

	for _, item := range cases {
		got := FormatFloat(item.in, 64)
		if got != item.want {
			t.Errorf("FormatFloat(%v)\n  got  %s\n  want %s", item.in, got, item.want)
		}
	}
}

// negZero returns a negative zero.
func negZero() float64 {
	zero := 0.0
	return -zero
}

func TestObjectKeepsInsertionOrder(t *testing.T) {
	object := NewObject()
	object.Set("message", "ok")
	object.Set("data", "x")
	object.Set("errors", "y")

	// Replacing a key must NOT move it to the end, because PHP's
	// `$array['key'] = $value` does not either.
	object.Set("message", "still first")

	got, err := Marshal(object)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	want := `{"message":"still first","data":"x","errors":"y"}`

	if string(got) != want {
		t.Errorf("Marshal(object)\n  got  %s\n  want %s", got, want)
	}
}

func TestEncodeNested(t *testing.T) {
	object := NewObject()
	object.Set("message", "a/b")
	object.Set("data", NewObject().Set("nested", "é").Set("n", 1.5))

	got, err := Marshal(object)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	want := `{"message":"a\/b","data":{"nested":"` + phpEscape(0xe9) + `","n":1.5}}`

	if string(got) != want {
		t.Errorf("Marshal(object)\n  got  %s\n  want %s", got, want)
	}
}
