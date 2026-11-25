package jsonwire

// Final closure for the two MarshalJSONTo entry points: Raw (jsonwire.go:123)
// and *Object (object.go:65). Drives valid, invalid and nil receivers
// through a v2 encoder. compat_test.go is untouched (v1 byte oracle).

import (
	"bytes"
	"encoding/json/jsontext"
	"strings"
	"testing"
)

func TestFinalRawMarshalJSONToValid(t *testing.T) {
	var buf bytes.Buffer
	enc := jsontext.NewEncoder(&buf)
	raw := Raw([]byte(`{"b":2,"a":1}`))
	if err := raw.MarshalJSONTo(enc); err != nil {
		t.Fatalf("Raw.MarshalJSONTo: %v", err)
	}
	got := strings.TrimSpace(buf.String())
	if got != `{"b":2,"a":1}` {
		t.Fatalf("encoded = %q, want order-preserving document", got)
	}
}

func TestFinalRawMarshalJSONToInvalid(t *testing.T) {
	var buf bytes.Buffer
	enc := jsontext.NewEncoder(&buf)
	if err := Raw([]byte(`not json`)).MarshalJSONTo(enc); err == nil {
		t.Fatal("invalid Raw.MarshalJSONTo was accepted")
	}
	if err := Raw(nil).MarshalJSONTo(enc); err == nil {
		t.Fatal("nil Raw.MarshalJSONTo was accepted")
	}
}

func TestFinalObjectMarshalJSONToOrdered(t *testing.T) {
	var buf bytes.Buffer
	enc := jsontext.NewEncoder(&buf)
	obj := NewObject().Set("message", "ok").Set("data", 1)
	if err := obj.MarshalJSONTo(enc); err != nil {
		t.Fatalf("Object.MarshalJSONTo: %v", err)
	}
	got := strings.TrimSpace(buf.String())
	if got != `{"message":"ok","data":1}` {
		t.Fatalf("encoded = %q, want insertion order", got)
	}
}

func TestFinalObjectMarshalJSONToNil(t *testing.T) {
	var buf bytes.Buffer
	enc := jsontext.NewEncoder(&buf)
	var obj *Object
	if err := obj.MarshalJSONTo(enc); err != nil {
		t.Fatalf("nil Object.MarshalJSONTo: %v", err)
	}
	if got := strings.TrimSpace(buf.String()); got != "null" {
		t.Fatalf("nil object = %q, want null", got)
	}
}

func TestFinalObjectMarshalJSONToUnencodable(t *testing.T) {
	var buf bytes.Buffer
	enc := jsontext.NewEncoder(&buf)
	obj := NewObject().Set("bad", struct{ A int }{A: 1})
	if err := obj.MarshalJSONTo(enc); err == nil {
		t.Fatal("unencodable Object.MarshalJSONTo was accepted")
	}
}
