// Package jsonwire encodes the API's JSON wire format.
//
// WHY THIS PACKAGE EXISTS
// -----------------------
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
//     keys; Raw writes the stored document as a JSON value.
//
// The encoder is intentionally small: nil, bool, string, the signed and
// unsigned integer types, float32/float64, Object, Raw, []any, []string and
// map[string]any. A type it does not understand is an error, not a silent
// `{}` — a response that loses a field is worse than a failed request.
//
// WHY JSON V2, AND WHY THESE OPTIONS
// ----------------------------------
// The engine is encoding/json/v2 and jsontext. v2 is faster and streams, but
// its defaults are not the API's defaults. Each option below is deliberate:
//
//   - AllowInvalidUTF8: v1 replaces invalid bytes with U+FFFD; v2 rejects
//     them. The API has always accepted stored text; rejecting it would turn
//     a readable row into a 500.
//   - AllowDuplicateNames: a PostgreSQL `json` column can hold duplicate
//     names, and a v1 decoder never rejected them. Raw must stay writable.
//   - EscapeForJS: v1 escapes U+2028/U+2029 even with HTML escaping off. v2
//     leaves them literal unless asked.
//   - EscapeForHTML(false): the API emits `<`, `>` and `&` literally.
//   - PreserveRawStrings: keeps the escapes in a stored fragment (`\/`,
//     `\u00e9`) instead of normalising them while writing it.
//
// Floats and integers are written from their own text, not through v2's
// ECMA-262 float formatter: money-adjacent values in this API have always
// used the shortest `'f'` spelling.
package jsonwire

import (
	"encoding/json/jsontext"
	jsonv2 "encoding/json/v2"
	"fmt"
	"io"
	"sort"
	"strconv"
)

// wireOptions is the compatibility envelope around the v2 engine.
var wireOptions = []jsonv2.Options{
	jsontext.AllowDuplicateNames(true),
	jsontext.AllowInvalidUTF8(true),
	jsontext.EscapeForHTML(false),
	jsontext.EscapeForJS(true),
	jsontext.PreserveRawStrings(true),
}

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

// Raw is a pre-encoded JSON document, written as one JSON value.
//
// The caller is responsible for its validity; Marshal checks it and returns
// an error otherwise. Key order inside Raw is preserved exactly as stored.
// A v2 encoder reformats insignificant whitespace outside strings while
// embedding a raw value; the meaning is unchanged, and the API already
// compacts database fragments before they reach this package.
type Raw []byte

// MarshalJSON lets a Raw value be embedded by a standard encoder.
func (r Raw) MarshalJSON() ([]byte, error) {
	if !validRaw(r) {
		return nil, fmt.Errorf("jsonwire: Raw value is not valid JSON")
	}
	return append([]byte(nil), r...), nil
}

// MarshalJSONTo writes a Raw value through a v2 encoder.
func (r Raw) MarshalJSONTo(enc *jsontext.Encoder) error {
	if !validRaw(r) {
		return fmt.Errorf("jsonwire: Raw value is not valid JSON")
	}
	return enc.WriteValue(jsontext.Value(r))
}

// document is the top-level value handed to v2. MarshalerTo receives the
// v2 encoder directly, so the strict encoder below controls every value.
// jsonv2.Marshal/MarshalWrite do not append a top-level newline.
type document struct {
	value any
}

func (d document) MarshalJSONTo(enc *jsontext.Encoder) error {
	return encodeTo(enc, d.value)
}

// decodeOptions is the request-side compatibility envelope. v1 matched field
// names case-insensitively, accepted duplicate names (last one wins) and
// replaced invalid UTF-8 with U+FFFD; these options reproduce all three.
var decodeOptions = []jsonv2.Options{
	jsontext.AllowDuplicateNames(true),
	jsontext.AllowInvalidUTF8(true),
	jsonv2.MatchCaseInsensitiveNames(true),
}

// Unmarshal decodes a request body with v1-compatible semantics. It is the
// candidate for the few typed/AI decoders; large map payloads still benchmark
// better on v1, so callers opt in rather than the package replacing v1
// globally.
func Unmarshal(data []byte, out any) error {
	return jsonv2.Unmarshal(data, out, decodeOptions...)
}

// UnmarshalRead is the streaming form used by request bodies. It keeps the
// same v1-compatible envelope as Unmarshal.
func UnmarshalRead(r io.Reader, out any) error {
	return jsonv2.UnmarshalRead(r, out, decodeOptions...)
}

// Marshal encodes a value in the API wire format.
func Marshal(value any) ([]byte, error) {
	// A top-level Raw is already a complete JSON document. Returning it
	// unchanged keeps exact-byte storage fragments exact.
	if raw, ok := value.(Raw); ok {
		if !validRaw(raw) {
			return nil, fmt.Errorf("jsonwire: Raw value is not valid JSON")
		}
		return append([]byte(nil), raw...), nil
	}
	return jsonv2.Marshal(document{value}, wireOptions...)
}

// MarshalTo streams a value into w. It is the same encoder and the same
// bytes as Marshal, without the intermediate full-body []byte.
func MarshalTo(w io.Writer, value any) error {
	if raw, ok := value.(Raw); ok {
		if !validRaw(raw) {
			return fmt.Errorf("jsonwire: Raw value is not valid JSON")
		}
		_, err := w.Write(raw)
		return err
	}
	return jsonv2.MarshalWrite(w, document{value}, wireOptions...)
}

func validRaw(raw []byte) bool {
	return jsontext.Value(raw).IsValid(
		jsontext.AllowDuplicateNames(true),
		jsontext.AllowInvalidUTF8(true),
	)
}

// encodeTo is the strict encoder. Every supported type is stated here, so a
// handler cannot accidentally serialize a struct, a []byte (base64) or a
// time.Time with v2's default representation.
func encodeTo(enc *jsontext.Encoder, value any) error {
	if raw, ok := value.(Raw); ok {
		return enc.WriteValue(jsontext.Value(raw))
	}

	switch v := value.(type) {
	case nil:
		return enc.WriteToken(jsontext.Null)

	case bool:
		if v {
			return enc.WriteToken(jsontext.True)
		}
		return enc.WriteToken(jsontext.False)

	case string:
		return enc.WriteToken(jsontext.String(v))

	case int:
		return enc.WriteToken(jsontext.Int(int64(v)))
	case int8:
		return enc.WriteToken(jsontext.Int(int64(v)))
	case int16:
		return enc.WriteToken(jsontext.Int(int64(v)))
	case int32:
		return enc.WriteToken(jsontext.Int(int64(v)))
	case int64:
		return enc.WriteToken(jsontext.Int(v))

	case uint:
		return enc.WriteToken(jsontext.Uint(uint64(v)))
	case uint8:
		return enc.WriteToken(jsontext.Uint(uint64(v)))
	case uint16:
		return enc.WriteToken(jsontext.Uint(uint64(v)))
	case uint32:
		return enc.WriteToken(jsontext.Uint(uint64(v)))
	case uint64:
		return enc.WriteToken(jsontext.Uint(v))

	case float32:
		return writeFloat(enc, float64(v), 32)
	case float64:
		return writeFloat(enc, v, 64)

	case *Object:
		if v == nil {
			return enc.WriteToken(jsontext.Null)
		}
		return writeObject(enc, v.keys, v.values)

	case Object:
		return writeObject(enc, v.keys, v.values)

	case []any:
		if err := enc.WriteToken(jsontext.BeginArray); err != nil {
			return err
		}
		for _, item := range v {
			if err := encodeTo(enc, item); err != nil {
				return err
			}
		}
		return enc.WriteToken(jsontext.EndArray)

	case []string:
		if err := enc.WriteToken(jsontext.BeginArray); err != nil {
			return err
		}
		for _, item := range v {
			if err := enc.WriteToken(jsontext.String(item)); err != nil {
				return err
			}
		}
		return enc.WriteToken(jsontext.EndArray)

	case map[string]any:
		// A Go map has no order; sorted keys are the only deterministic
		// choice. Prefer Object when the order carries meaning.
		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		return writeObject(enc, keys, v)

	default:
		return fmt.Errorf("jsonwire: cannot encode %T", value)
	}
}

func writeObject(enc *jsontext.Encoder, keys []string, values map[string]any) error {
	if err := enc.WriteToken(jsontext.BeginObject); err != nil {
		return err
	}
	for _, key := range keys {
		if err := enc.WriteToken(jsontext.String(key)); err != nil {
			return err
		}
		if err := encodeTo(enc, values[key]); err != nil {
			return err
		}
	}
	return enc.WriteToken(jsontext.EndObject)
}

// writeFloat keeps the API's number spelling. v2's jsontext.Float follows
// ECMA-262 and may choose an exponent; this API has always used the shortest
// fixed-point form and "0" for NaN/Infinity.
func writeFloat(enc *jsontext.Encoder, value float64, bits int) error {
	return enc.WriteValue(jsontext.Value(FormatFloat(value, bits)))
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
