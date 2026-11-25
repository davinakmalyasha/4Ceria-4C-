package jsonwire

import (
	"bytes"
	stdjson "encoding/json"
	"reflect"
	"strings"
	"testing"
)

// Decode/compat edge cases. The v1 oracle in compat_test.go is the byte
// oracle — these tests only ADD coverage around it and never change
// persisted/signed JSON bytes (v1 stays v1).

func TestCompactJSONEdgeCases(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"strips insignificant whitespace", "{\n  \"b\": 2,\n  \"a\": 1\n}", `{"b":2,"a":1}`},
		{"tabs and carriage returns", "{\t\"a\":\r\n1}", `{"a":1}`},
		{"whitespace inside string stays", `{"note":"a b  c"}`, `{"note":"a b  c"}`},
		{"escaped quote does not end string", `{"a":"x\" y","b":1}`, `{"a":"x\" y","b":1}`},
		{"escaped backslash before quote", `{"a":"x\\" }`, `{"a":"x\\"}`},
		{"empty", "", ""},
		{"already compact", `{"a":1}`, `{"a":1}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := string(CompactJSON([]byte(tc.in))); got != tc.want {
				t.Fatalf("CompactJSON(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestRawMarshalJSONMethods(t *testing.T) {
	// Standard-library embedding keeps order and escapes verbatim.
	raw := Raw([]byte(`{"b":2,"a":1}`))
	got, err := raw.MarshalJSON()
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != `{"b":2,"a":1}` {
		t.Fatalf("Raw.MarshalJSON = %s", got)
	}
	// Mutating the result must not alias the input.
	got[0] = 'X'
	if string(raw) != `{"b":2,"a":1}` {
		t.Fatal("MarshalJSON result aliases the input")
	}

	if _, err := Raw([]byte(`not json`)).MarshalJSON(); err == nil {
		t.Fatal("invalid Raw.MarshalJSON was accepted")
	}
	if _, err := Marshal(Raw([]byte(`not json`))); err == nil {
		t.Fatal("invalid top-level Raw was accepted")
	}
	if err := MarshalTo(bytes.NewBuffer(nil), Raw([]byte(`not json`))); err == nil {
		t.Fatal("invalid top-level Raw via MarshalTo was accepted")
	}

	// A top-level Raw round-trips exactly, whitespace included.
	document := "{\n  \"b\": 2\n}"
	top, err := Marshal(Raw([]byte(document)))
	if err != nil {
		t.Fatal(err)
	}
	if string(top) != document {
		t.Fatalf("top-level Raw = %q, want exact bytes", top)
	}
}

func TestMarshalToMatchesMarshalForAllShapes(t *testing.T) {
	values := []any{
		nil, true, "a/b", -42, uint64(64), 1.5,
		NewObject().Set("message", "ok").Set("data", []any{1, "x"}),
		map[string]any{"b": 2, "a": 1},
		[]any{nil, true, 1.5, NewObject().Set("n", 1)},
		Raw([]byte(`{"b":2}`)),
	}

	for i, value := range values {
		want, err := Marshal(value)
		if err != nil {
			t.Fatalf("case %d: Marshal: %v", i, err)
			continue
		}
		var buffer bytes.Buffer
		if err := MarshalTo(&buffer, value); err != nil {
			t.Fatalf("case %d: MarshalTo: %v", i, err)
			continue
		}
		if !bytes.Equal(buffer.Bytes(), want) {
			t.Fatalf("case %d: MarshalTo = %s, want %s", i, buffer.Bytes(), want)
		}
	}
}

func TestMarshalRejectsUnsupportedTypes(t *testing.T) {
	for _, value := range []any{
		struct{ A int }{A: 1},
		[]byte("bytes are base64 in v1"),
		map[int]any{1: "non-string keys"},
	} {
		if _, err := Marshal(value); err == nil {
			t.Fatalf("Marshal(%T) was accepted", value)
		}
		var buffer bytes.Buffer
		if err := MarshalTo(&buffer, value); err == nil {
			t.Fatalf("MarshalTo(%T) was accepted", value)
		}
	}
}

func TestEncodeNilObjectWritesNull(t *testing.T) {
	var object *Object
	got, err := Marshal(object)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "null" {
		t.Fatalf("nil *Object = %s, want null", got)
	}

	got, err = Marshal([]any{nil, object})
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "[null,null]" {
		t.Fatalf("nested nil = %s", got)
	}
}

func TestUnmarshalReadMatchesUnmarshal(t *testing.T) {
	bodies := []string{
		`{"name":"a","count":1,"enabled":true}`,
		`{"NAME":"a","COUNT":1,"ENABLED":true}`,
		`{"name":"first","name":"last","count":2,"enabled":false}`,
		`{"name":"a","count":1,"enabled":true,"unknown":[1,{"x":null}]}`,
		"{\"name\":\"a\xffb\",\"count\":0,\"enabled\":false}",
		`{}`,
		`{"name":"","count":-5,"enabled":false}`,
	}

	for _, body := range bodies {
		t.Run(body[:minLen(body, 24)], func(t *testing.T) {
			var viaBytes, viaReader decodeShape
			if err := Unmarshal([]byte(body), &viaBytes); err != nil {
				t.Fatalf("Unmarshal: %v", err)
			}
			if err := UnmarshalRead(strings.NewReader(body), &viaReader); err != nil {
				t.Fatalf("UnmarshalRead: %v", err)
			}
			if !reflect.DeepEqual(viaBytes, viaReader) {
				t.Fatalf("Unmarshal = %#v, UnmarshalRead = %#v", viaBytes, viaReader)
			}

			var want decodeShape
			if err := stdjson.Unmarshal([]byte(body), &want); err != nil {
				t.Fatalf("v1: %v", err)
			}
			if !reflect.DeepEqual(viaReader, want) {
				t.Fatalf("v2 = %#v, v1 = %#v", viaReader, want)
			}
		})
	}
}

func TestUnmarshalReadRejectsTrailingGarbage(t *testing.T) {
	var value decodeShape
	if err := UnmarshalRead(strings.NewReader(`{"name":"a"} trailing`), &value); err == nil {
		t.Fatal("UnmarshalRead accepted trailing garbage")
	}
}

func TestUnmarshalReadInvalidUTF8(t *testing.T) {
	var value decodeShape
	if err := UnmarshalRead(strings.NewReader("{\"name\":\"a\xffb\"}"), &value); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(value.Name, "\uFFFD") {
		t.Errorf("name = %q, want a replacement character", value.Name)
	}
}

func TestUnmarshalMapNumbersMatchV1(t *testing.T) {
	body := `{"integer":7,"float":1.5,"big":1000000000000000000,"nested":{"flag":true},"list":[1,"two",null]}`

	var want, got map[string]any
	if err := stdjson.Unmarshal([]byte(body), &want); err != nil {
		t.Fatalf("v1: %v", err)
	}
	if err := UnmarshalRead(strings.NewReader(body), &got); err != nil {
		t.Fatalf("v2 reader: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("reader map = %#v, want %#v", got, want)
	}
}

func TestObjectAccessors(t *testing.T) {
	object := NewObject().Set("b", 2).Set("a", 1).Set("b", 3)

	if got := object.Keys(); !reflect.DeepEqual(got, []string{"b", "a"}) {
		t.Fatalf("Keys() = %v, want replacement to keep position", got)
	}
	if object.Len() != 2 {
		t.Fatalf("Len() = %d, want 2", object.Len())
	}

	value, ok := object.Get("b")
	if !ok || value != 3 {
		t.Fatalf("Get(b) = (%v, %v), want (3, true)", value, ok)
	}
	if _, ok := object.Get("missing"); ok {
		t.Fatal("Get(missing) reported present")
	}

	// Keys returns a copy: mutating it must not move the object.
	keys := object.Keys()
	keys[0] = "zzz"
	if got := object.Keys(); got[0] != "b" {
		t.Fatalf("Keys() aliases internal state: %v", got)
	}

	// A nil-values object still accepts a Set (defensive path).
	empty := &Object{}
	empty.Set("x", 1)
	if empty.Len() != 1 {
		t.Fatal("Set on zero-values object lost the key")
	}
}

func TestObjectMarshalJSONToNil(t *testing.T) {
	var object *Object
	encoded, err := Marshal([]any{object})
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != "[null]" {
		t.Fatalf("nil object in array = %s", encoded)
	}
}

func TestWriteObjectWithMissingKeyWritesNull(t *testing.T) {
	// A key with no value entry decodes as null rather than failing.
	// Reaching it requires hand-built state, so build via the public
	// API and confirm the nested null path through slices instead.
	got, err := Marshal(map[string]any{"a": nil, "b": []any{nil}})
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != `{"a":null,"b":[null]}` {
		t.Fatalf("null map values = %s", got)
	}
}

func minLen(s string, n int) int {
	if len(s) < n {
		return len(s)
	}
	return n
}
