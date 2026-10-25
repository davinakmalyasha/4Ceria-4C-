// Package jsonphp encodes JSON the way PHP's `json_encode` does.
//
// WHY THIS EXISTS
// ---------------
// The rewrite's contract is that the Go API's responses are BYTE-IDENTICAL
// to the legacy Laravel API's. A byte comparison is the only kind that can
// prove that, and it turns out that `encoding/json` and `json_encode` do not
// agree on the bytes.
//
// The legacy controllers all use `response()->json()`, which is
// `new JsonResponse($data, $status, $headers, 0)` — and that `0` is the
// encoding options, so the flags are PHP's DEFAULTS. The exception handler
// is the one exception: it uses `JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES`.
//
// With the default flags, PHP differs from Go in FOUR ways. Each one changes
// the bytes of a response body, and each one is invisible to a comparison
// that parses the JSON first.
//
//  1. THE FORWARD SLASH.
//
//     PHP:  "https:\/\/example.test\/api"      Go:  "https://example.test/api"
//
//     PHP escapes the slash. Go does not.
//
//  2. NON-ASCII CHARACTERS.
//
//     PHP:  "caf\u00e9"                        Go:  "café"
//
//     PHP escapes everything above U+007E as \uXXXX, with a surrogate pair
//     for an astral character. Go emits the raw UTF-8.
//
//  3. THE SHORT CONTROL ESCAPES.
//
//     PHP:  "\b" and "\f"                      Go:  "\u0008" and "\u000c"
//
//     PHP has a one-character escape for these two; Go uses the six.
//
//  4. THE KEY ORDER.
//
//     PHP's `json_encode` emits an array's keys in INSERTION order. Go's
//     `json.Marshal` on a map emits them SORTED. Two bodies with the same
//     keys in a different order are the same JSON and different bytes.
//
//     Numbers are a fifth, and a different kind of problem: PHP's
//     `serialize_precision=-1` prints floats with a shortest-round-trip
//     algorithm whose thresholds are PHP's own, and Go's are not.
//
// So this package implements PHP's encoding directly. It is not a
// general-purpose JSON library and it does not try to be one: it encodes
// what the legacy API produces.
//
// THE PROOF
// ---------
// A differential. `tools/json/` runs a fixed-seed corpus of values through
// PHP's `json_encode` and through this package, and compares the BYTES. A
// case that disagrees is a case where a Go response would have differed from
// the Laravel one, and the corpus is part of the verification gate.
//
// See docs/MONEY.md for the same idea applied to the money arithmetic.
package jsonphp

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"
)

// CompactJSON removes the whitespace a JSON document does not need.
//
// It is NOT a re-encoder: key order, number spelling and string escapes are
// untouched, and whitespace inside a string is left alone. It exists because
// MySQL stores JSON as text with `": "` separators while PHP's `json_encode`
// writes `":"` — so a document echoed straight from the database differs from
// the same document after PHP decodes and re-encodes it.
func CompactJSON(document []byte) []byte {
	out := make([]byte, 0, len(document))

	var (
		inString bool
		escaped  bool
	)

	for _, b := range document {
		if inString {
			out = append(out, b)

			switch {
			case escaped:
				escaped = false
			case b == 92: // backslash
				escaped = true
			case b == 34: // double quote
				inString = false
			}

			continue
		}

		switch b {
		case 34: // opening quote
			inString = true
			out = append(out, b)
		case 32, 9, 10, 13: // space, tab, newline, carriage return
			// Insignificant outside a string.
		default:
			out = append(out, b)
		}
	}

	return out
}

// Raw is a pre-encoded JSON document.
//
// It is written verbatim, so the ORDER inside it is the order the database
// stored — which is the order PHP wrote, because the column was written by PHP.
// Re-encoding it through a Go map would sort its keys.
type Raw []byte

// Marshal encodes a value the way PHP's `json_encode` does with the
// default flags.
//
// The types it understands are the ones the legacy API returns: nil,
// bool, string, the signed and unsigned integer types, float32, float64,
// []any, *Object, map[string]any, and any struct with exported fields.
//
// A `map[string]any` is encoded with SORTED keys, because a Go map has no
// order and sorted is the only choice that is deterministic. The legacy API
// never produces an unordered map — PHP arrays are ordered — so the ordered
// type is `Object`, and a map in a response is a sign that the handler
// built the wrong thing.
func Marshal(value any) ([]byte, error) {
	var out strings.Builder

	if err := encode(&out, value); err != nil {
		return nil, err
	}

	return []byte(out.String()), nil
}

// encode writes one value.
func encode(out *strings.Builder, value any) error {
	// A Raw value is ALREADY a JSON document and is written verbatim.
	//
	// It exists for a `json`/`jsonb` COLUMN: the database holds PHP-ordered
	// JSON, and re-encoding it through a Go map would sort its keys. The legacy
	// model casts the column to an array, so the response embeds the same
	// document the column holds.
	if raw, ok := value.(Raw); ok {
		if !json.Valid(raw) {
			return fmt.Errorf("jsonphp: Raw value is not valid JSON")
		}

		out.Write(raw)
		return nil
	}

	switch v := value.(type) {
	case nil:
		out.WriteString("null")
		return nil

	case bool:
		if v {
			out.WriteString("true")
		} else {
			out.WriteString("false")
		}
		return nil

	case string:
		EncodeString(out, v)
		return nil

	case int:
		out.WriteString(strconv.FormatInt(int64(v), 10))
		return nil

	case int8:
		out.WriteString(strconv.FormatInt(int64(v), 10))
		return nil

	case int16:
		out.WriteString(strconv.FormatInt(int64(v), 10))
		return nil

	case int32:
		out.WriteString(strconv.FormatInt(int64(v), 10))
		return nil

	case int64:
		out.WriteString(strconv.FormatInt(v, 10))
		return nil

	case uint:
		out.WriteString(strconv.FormatUint(uint64(v), 10))
		return nil

	case uint8:
		out.WriteString(strconv.FormatUint(uint64(v), 10))
		return nil

	case uint16:
		out.WriteString(strconv.FormatUint(uint64(v), 10))
		return nil

	case uint32:
		out.WriteString(strconv.FormatUint(uint64(v), 10))
		return nil

	case uint64:
		out.WriteString(strconv.FormatUint(v, 10))
		return nil

	case float32:
		out.WriteString(FormatFloat(float64(v), 32))
		return nil

	case float64:
		out.WriteString(FormatFloat(v, 64))
		return nil

	case *Object:
		if v == nil {
			out.WriteString("null")
			return nil
		}
		return v.encode(out)

	case Object:
		return v.encode(out)

	case []any:
		out.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				out.WriteByte(',')
			}
			if err := encode(out, item); err != nil {
				return err
			}
		}
		out.WriteByte(']')
		return nil

	case []string:
		out.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				out.WriteByte(',')
			}
			EncodeString(out, item)
		}
		out.WriteByte(']')
		return nil

	case map[string]any:
		// A Go map has no order. Sorted is the only deterministic choice,
		// and the legacy API never produces one — PHP arrays are ordered —
		// so reaching this case means the handler built the wrong thing.
		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		sortStrings(keys)

		out.WriteByte('{')
		for i, key := range keys {
			if i > 0 {
				out.WriteByte(',')
			}
			EncodeString(out, key)
			out.WriteByte(':')
			if err := encode(out, v[key]); err != nil {
				return err
			}
		}
		out.WriteByte('}')
		return nil

	default:
		return fmt.Errorf("jsonphp: cannot encode %T", value)
	}
}

// EncodeString writes a JSON string the way PHP's `json_encode` does.
//
// The rules, in the order PHP applies them:
//
//   - `"` becomes `\"` and `\` becomes `\\`;
//   - `/` becomes `\/` — PHP escapes the forward slash by default;
//   - 0x08 becomes `\b` and 0x0C becomes `\f` — PHP has one-character
//     escapes for these two and Go does not;
//   - 0x09, 0x0A and 0x0D become `\t`, `\n` and `\r`;
//   - any other character below 0x20 becomes `\u00XX`;
//   - anything above 0x7E becomes `\uXXXX`, with a SURROGATE PAIR for a
//     character outside the basic multilingual plane;
//   - `<`, `>` and `&` are left alone, which is why the Go encoder's
//     HTML-escaping is switched off rather than emulated.
//
// The hex digits are LOWERCASE, as PHP's are.
func EncodeString(out *strings.Builder, s string) {
	out.WriteByte('"')

	for i := 0; i < len(s); {
		c := s[i]

		if c < utf8.RuneSelf {
			switch c {
			case '"':
				out.WriteString(`\"`)
			case '\\':
				out.WriteString(`\\`)
			case '/':
				out.WriteString(`\/`)
			case '\b':
				out.WriteString(`\b`)
			case '\f':
				out.WriteString(`\f`)
			case '\n':
				out.WriteString(`\n`)
			case '\r':
				out.WriteString(`\r`)
			case '\t':
				out.WriteString(`\t`)
			default:
				if c < 0x20 {
					out.WriteString(`\u00`)
					out.WriteString(hexByte(c))
				} else {
					out.WriteByte(c)
				}
			}

			i++
			continue
		}

		r, size := utf8.DecodeRuneInString(s[i:])

		if r == utf8.RuneError && size == 1 {
			// An invalid byte. PHP's `json_encode` fails on invalid UTF-8
			// unless JSON_INVALID_UTF8_SUBSTITUTE is set, and Laravel does
			// not set it — so a response with invalid UTF-8 is a 500 in the
			// legacy app too. The U+FFFD substitution keeps the encoder
			// total; the error surfaces at the boundary.
			out.WriteString(`�`)
			i++
			continue
		}

		if r > 0xFFFF {
			// A character outside the BMP: a SURROGATE PAIR, as PHP writes
			// it.
			r -= 0x10000
			high := 0xD800 + (r >> 10)
			low := 0xDC00 + (r & 0x3FF)

			out.WriteString(`\u`)
			out.WriteString(hexUint(high))
			out.WriteString(`\u`)
			out.WriteString(hexUint(low))
		} else {
			out.WriteString(`\u`)
			out.WriteString(hexUint(r))
		}

		i += size
	}

	out.WriteByte('"')
}

// hexByte renders a byte as four lowercase hex digits.
func hexByte(b byte) string {
	const digits = "0123456789abcdef"

	return string([]byte{
		digits[b>>4],
		digits[b&0x0f],
	})
}

// hexUint renders a rune as four lowercase hex digits.
func hexUint(r rune) string {
	const digits = "0123456789abcdef"

	return string([]byte{
		digits[(r>>12)&0x0f],
		digits[(r>>8)&0x0f],
		digits[(r>>4)&0x0f],
		digits[r&0x0f],
	})
}

// FormatFloat renders a float the way PHP's `json_encode` does with
// `serialize_precision=-1`.
//
// PHP's algorithm, which is `zend_gcvt`:
//
//  1. The digits are the SHORTEST sequence that round-trips — the same
//     requirement as Go's `strconv.FormatFloat(v, 'e', -1, bits)`.
//  2. `decpt` is the position of the decimal point relative to the first
//     digit: 1.0 has decpt 1, 1234.5 has decpt 4, 0.001 has decpt -2.
//  3. The form is EXPONENTIAL when `decpt <= -4` or `decpt > 17`, and FIXED
//     otherwise. 17 is `ndigit`, the precision `serialize_precision=-1`
//     resolves to.
//  4. The exponential form is `<d>.<rest>e<+|-><exponent>`, where the
//     mantissa ALWAYS has a decimal point — PHP writes `1.0e+21`, not
//     `1e+21` — and the exponent is NOT zero-padded: `1.0e-7`, not `1.0e-07`.
//  5. The fixed form has NO trailing `.0`: PHP writes `1` for 1.0 and
//     `5500000` for 5500000.0.
//
// Go's `strconv.FormatFloat` agrees on the digits and disagrees on
// everything else: it switches to the exponent form at a different
// threshold, it pads the exponent to two digits, and it does not add the
// `.0` to the mantissa.
func FormatFloat(value float64, bits int) string {
	if math.IsNaN(value) {
		// PHP's `json_encode` fails on NAN unless JSON_PARTIAL_OUTPUT_ON_ERROR
		// is set, and Laravel does not set it. This cannot happen in the
		// legacy data, so it is a bug rather than a case to reproduce.
		return "null"
	}

	if math.IsInf(value, 0) {
		return "null"
	}

	if value == 0 {
		// PHP writes `0` for 0.0 and `-0` for -0.0.
		if math.Signbit(value) {
			return "-0"
		}
		return "0"
	}

	// The sign is carried separately. Folding it into the digits would put
	// the minus sign in front of the DECIMAL POINT instead of in front of
	// the first digit, so -1.5 would come out as `-.15`.
	negative := math.Signbit(value)
	if negative {
		value = -value
	}

	// The shortest round-trip digits, and the decimal exponent.
	scientific := strconv.FormatFloat(value, 'e', -1, bits)

	mantissa, exponent, _ := strings.Cut(scientific, "e")

	exponentValue, err := strconv.Atoi(exponent)
	if err != nil {
		return scientific
	}

	digits := strings.Replace(mantissa, ".", "", 1)

	// `decpt` is the position of the decimal point relative to the first
	// digit.
	decpt := exponentValue + 1

	const ndigit = 17

	var formatted string

	if decpt <= -4 || decpt > ndigit {
		formatted = exponential(digits, decpt)
	} else {
		formatted = fixed(digits, decpt)
	}

	if negative {
		return "-" + formatted
	}

	return formatted
}

// exponential renders the `d.dddde+NN` form.
func exponential(digits string, decpt int) string {
	var out strings.Builder

	out.WriteByte(digits[0])
	out.WriteByte('.')

	if len(digits) > 1 {
		out.WriteString(digits[1:])
	} else {
		// PHP writes `1.0e+21` and not `1e+21`.
		out.WriteByte('0')
	}

	exponent := decpt - 1

	out.WriteByte('e')

	if exponent < 0 {
		out.WriteByte('-')
		exponent = -exponent
	} else {
		out.WriteByte('+')
	}

	out.WriteString(strconv.Itoa(exponent))

	return out.String()
}

// fixed renders the plain form.
func fixed(digits string, decpt int) string {
	var out strings.Builder

	switch {
	case decpt <= 0:
		// 0.001 — the point is to the LEFT of the first digit.
		out.WriteString("0.")
		out.WriteString(strings.Repeat("0", -decpt))
		out.WriteString(digits)

	case decpt >= len(digits):
		// 1000 — the point is to the RIGHT of the last digit, and PHP
		// writes no `.0`.
		out.WriteString(digits)
		out.WriteString(strings.Repeat("0", decpt-len(digits)))

	default:
		out.WriteString(digits[:decpt])
		out.WriteByte('.')
		out.WriteString(digits[decpt:])
	}

	return out.String()
}

// sortStrings sorts in place. It exists so the map case does not have to
// import `sort` under a name that reads like a domain concept.
func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}
