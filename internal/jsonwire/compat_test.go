package jsonwire

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// v1OracleMarshal is the pre-v2 encoder, kept in this test file as the
// compatibility oracle. It is deliberately the exact implementation the API
// shipped with: JSON's standard encoder per string, insertion-ordered
// objects, sorted maps, verbatim Raw.
//
// The v2 implementation must produce the same bytes for every case in the
// corpus except the documented Raw-whitespace case (v2 compacts whitespace
// outside strings; the JSON meaning is unchanged).
func v1OracleMarshal(value any) ([]byte, error) {
	var out strings.Builder
	if err := v1OracleEncode(&out, value); err != nil {
		return nil, err
	}
	return []byte(out.String()), nil
}

func v1OracleEncode(out *strings.Builder, value any) error {
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
	case bool:
		if v {
			out.WriteString("true")
		} else {
			out.WriteString("false")
		}
	case string:
		v1OracleEncodeString(out, v)
	case int:
		out.WriteString(strconv.FormatInt(int64(v), 10))
	case int8:
		out.WriteString(strconv.FormatInt(int64(v), 10))
	case int16:
		out.WriteString(strconv.FormatInt(int64(v), 10))
	case int32:
		out.WriteString(strconv.FormatInt(int64(v), 10))
	case int64:
		out.WriteString(strconv.FormatInt(v, 10))
	case uint:
		out.WriteString(strconv.FormatUint(uint64(v), 10))
	case uint8:
		out.WriteString(strconv.FormatUint(uint64(v), 10))
	case uint16:
		out.WriteString(strconv.FormatUint(uint64(v), 10))
	case uint32:
		out.WriteString(strconv.FormatUint(uint64(v), 10))
	case uint64:
		out.WriteString(strconv.FormatUint(v, 10))
	case float32:
		out.WriteString(FormatFloat(float64(v), 32))
	case float64:
		out.WriteString(FormatFloat(v, 64))
	case *Object:
		if v == nil {
			out.WriteString("null")
			return nil
		}
		return v.v1OracleEncode(out)
	case Object:
		return v.v1OracleEncode(out)
	case []any:
		out.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				out.WriteByte(',')
			}
			if err := v1OracleEncode(out, item); err != nil {
				return err
			}
		}
		out.WriteByte(']')
	case []string:
		out.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				out.WriteByte(',')
			}
			v1OracleEncodeString(out, item)
		}
		out.WriteByte(']')
	case map[string]any:
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
			v1OracleEncodeString(out, key)
			out.WriteByte(':')
			if err := v1OracleEncode(out, v[key]); err != nil {
				return err
			}
		}
		out.WriteByte('}')
	default:
		return fmt.Errorf("jsonwire: cannot encode %T", value)
	}
	return nil
}

func (o Object) v1OracleEncode(out *strings.Builder) error {
	out.WriteByte('{')
	for i, key := range o.keys {
		if i > 0 {
			out.WriteByte(',')
		}
		v1OracleEncodeString(out, key)
		out.WriteByte(':')
		if err := v1OracleEncode(out, o.values[key]); err != nil {
			return err
		}
	}
	out.WriteByte('}')
	return nil
}

func v1OracleEncodeString(out *strings.Builder, value string) {
	var buffer strings.Builder
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		out.WriteString(`""`)
		return
	}
	out.WriteString(strings.TrimSuffix(buffer.String(), "\n"))
}

func compatCorpus() []struct {
	name  string
	value any
} {
	object := NewObject().
		Set("message", "ok").
		Set("data", NewObject().Set("b", 2).Set("a", 1)).
		Set("list", []any{1, "two", nil, true}).
		Set("empty", []any{})
	replaced := NewObject().Set("a", 1).Set("b", 2).Set("a", 3)

	return []struct {
		name  string
		value any
	}{
		{"nil", nil},
		{"true", true},
		{"false", false},
		{"empty string", ""},
		{"ascii", "hello world"},
		{"quotes", `he said "hi"`},
		{"backslash", `a\b`},
		{"slash", "https://example.test/api/houses"},
		{"controls", "\x00\x01\b\f\n\r\t\x1f\x7f"},
		{"utf8", "café 测试 👍"},
		{"line separators", "\u2028\u2029"},
		{"html", "<b>&x</b>"},
		{"invalid utf8", "x\xffy"},
		{"int", -42},
		{"int8", int8(-8)},
		{"int16", int16(-16)},
		{"int32", int32(-32)},
		{"int64", int64(-64)},
		{"uint", uint(42)},
		{"uint8", uint8(8)},
		{"uint16", uint16(16)},
		{"uint32", uint32(32)},
		{"uint64", uint64(64)},
		{"zero float", 0.0},
		{"negative zero", math.Copysign(0, -1)},
		{"one third", 1.0 / 3.0},
		{"large float", 1e21},
		{"small float", 1e-7},
		{"nan", math.NaN()},
		{"positive infinity", math.Inf(1)},
		{"negative infinity", math.Inf(-1)},
		{"object", object},
		{"replaced key keeps position", replaced},
		{"nil object", (*Object)(nil)},
		{"array", []any{nil, true, 1.5, "x", []any{}}},
		{"string array", []string{"a", "b/c", "é"}},
		{"map", map[string]any{"b": 2, "a": 1, "c": []any{true}}},
		{"raw", Raw([]byte(`{"b":2,"a":1}`))},
		{"raw escaped", Raw([]byte(`{"note":"a\/b","name":"caf\u00e9"}`))},
		{"deep", NewObject().Set("a", NewObject().Set("b", NewObject().Set("c", []any{1, 2, 3})))},
	}
}

func TestMarshalMatchesV1Oracle(t *testing.T) {
	for _, item := range compatCorpus() {
		t.Run(item.name, func(t *testing.T) {
			want, v1Err := v1OracleMarshal(item.value)
			got, err := Marshal(item.value)
			if (err != nil) != (v1Err != nil) {
				t.Fatalf("error mismatch: got %v, v1 %v", err, v1Err)
			}
			if err != nil {
				return
			}
			if string(got) != string(want) {
				t.Errorf("Marshal(%s)\n  got  %s\n  want %s", item.name, got, want)
			}
		})
	}
}

func TestMarshalToMatchesMarshal(t *testing.T) {
	for _, item := range compatCorpus() {
		t.Run(item.name, func(t *testing.T) {
			want, err := Marshal(item.value)
			if err != nil {
				t.Fatalf("Marshal: %v", err)
			}
			var buffer bytes.Buffer
			if err := MarshalTo(&buffer, item.value); err != nil {
				t.Fatalf("MarshalTo: %v", err)
			}
			if !bytes.Equal(buffer.Bytes(), want) {
				t.Errorf("MarshalTo differs\n  got  %s\n  want %s", buffer.Bytes(), want)
			}
		})
	}
}

func TestRawWhitespaceSemantics(t *testing.T) {
	// A top-level Raw is returned exactly: it is already a complete
	// document, so the compatibility contract is byte-for-byte.
	document := "{\n  \"b\": 2,\n  \"a\": 1\n}"
	got, err := Marshal(Raw([]byte(document)))
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	if string(got) != document {
		t.Errorf("top-level Raw\n  got  %q\n  want %q", got, document)
	}

	// Embedded in an object, v2 reformats insignificant whitespace while
	// writing the raw value. The meaning is identical; the API already
	// compacts database JSON before embedding it.
	nested := NewObject().Set("raw", Raw([]byte(document)))
	got, err = Marshal(nested)
	if err != nil {
		t.Fatalf("Marshal nested: %v", err)
	}
	if want := `{"raw":{"b":2,"a":1}}`; string(got) != want {
		t.Errorf("nested Raw\n  got  %s\n  want %s", got, want)
	}
}

func FuzzMarshalMatchesV1Oracle(f *testing.F) {
	for _, seed := range []string{"", "a/b", "<b>&x</b>", "café", "\x00\x1f", "\u2028", "x\xffy"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, input string) {
		want, v1Err := v1OracleMarshal(input)
		got, err := Marshal(input)
		if (err != nil) != (v1Err != nil) {
			t.Fatalf("error mismatch: got %v, v1 %v", err, v1Err)
		}
		if err == nil && string(got) != string(want) {
			t.Fatalf("Marshal(%q)\n  got  %s\n  want %s", input, got, want)
		}
	})
}
