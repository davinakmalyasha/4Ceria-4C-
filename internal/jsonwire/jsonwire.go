// Package jsonwire encodes the API's JSON wire format.
//
// WHY NOT encoding/json DIRECTLY
// ------------------------------
// Two shapes in this API cannot be produced by a plain `map[string]any`
// without losing information:
//
//  1. KEY ORDER. Responses are assembled in a deliberate order (`message`
//     before `data`, resource fields before nested relations). A Go map
//     sorts its keys, so equal documents would come out with different bytes
//     and diff review would be noise. Object keeps insertion order.
//
//  2. PRE-ENCODED FRAGMENTS. A `json`/`jsonb` column already holds a JSON
//     document. Decoding it into a map and re-encoding would reorder its
//     keys; Raw writes the stored document verbatim.
//
// Everything else follows the standard JSON encoding rules: UTF-8 is emitted
// as UTF-8, `/` is not escaped, and only the characters JSON requires are
// escaped. There is no database-specific or framework-specific behaviour
// left in this package.
//
// The encoder is intentionally small: nil, bool, string, the signed and
// unsigned integer types, float32/float64, Object, Raw, []any, []string and
// map[string]any. A type it does not understand is an error, not a silent
// `{}` — a response that loses a field is worse than a failed request.
package jsonwire

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// CompactJSON removes whitespace that a JSON document does not need.
//
// It is NOT a re-encoder: key order, number spelling and string escapes are
// untouched, and whitespace inside a string is left alone. It exists because
// PostgreSQL may return a `json` value with insignificant whitespace, while
// the API's stored fragments are compact.
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

// Raw is a pre-encoded JSON document, written verbatim.
//
// The caller is responsible for its validity when it comes from a database
// column with a JSON type; Marshal checks it and returns an error otherwise.
// Key order inside Raw is preserved exactly as stored.
type Raw []byte

// Marshal encodes a value in the API wire format.
func Marshal(value any) ([]byte, error) {
	var out strings.Builder
	if err := encode(&out, value); err != nil {
		return nil, err
	}
	return []byte(out.String()), nil
}

// encode writes one value.
func encode(out *strings.Builder, value any) error {
	if raw, ok := value.(Raw); ok {
		if !json.Valid(raw) {
			return fmt.Errorf("jsonwire: Raw value is not valid JSON")
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
		// A Go map has no order; sorted keys are the only deterministic
		// choice. Prefer Object when the order carries meaning.
		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		sort.Strings(keys)

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
		return fmt.Errorf("jsonwire: cannot encode %T", value)
	}
}

// EncodeString writes one JSON string using the standard rules: quotes and
// backslashes are escaped, control characters use their short or \u00XX
// forms, and valid UTF-8 is emitted as UTF-8.
func EncodeString(out *strings.Builder, value string) {
	var buffer strings.Builder
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		// Encoding a string cannot fail; keep the function total.
		out.WriteString(`""`)
		return
	}
	out.WriteString(strings.TrimSuffix(buffer.String(), "\n"))
}

// FormatFloat renders a finite float with the shortest representation that
// round-trips. NaN and infinities are not JSON numbers; this API returns "0"
// rather than emitting an invalid document.
func FormatFloat(value float64, _ int) string {
	if value != value || value > 1.7976931348623157e308 || value < -1.7976931348623157e308 {
		return "0"
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}
