package jsonwire

import (
	stdjson "encoding/json"
	"reflect"
	"strings"
	"testing"
)

type decodeShape struct {
	Name    string `json:"name"`
	Count   int    `json:"count"`
	Enabled bool   `json:"enabled"`
}

func TestUnmarshalMatchesV1Semantics(t *testing.T) {
	cases := []string{
		`{"name":"a","count":1,"enabled":true}`,
		`{"NAME":"a","COUNT":1,"ENABLED":true}`,
		`{"name":"first","name":"last","count":2,"enabled":false}`,
		`{"name":"a","count":1,"enabled":true,"unknown":{"nested":1}}`,
		"{\"name\":\"a\xffb\",\"count\":1,\"enabled\":true}",
	}

	for _, body := range cases {
		var want, got decodeShape
		if err := stdjson.Unmarshal([]byte(body), &want); err != nil {
			t.Fatalf("v1 decode %q: %v", body, err)
		}
		if err := Unmarshal([]byte(body), &got); err != nil {
			t.Fatalf("v2 decode %q: %v", body, err)
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("decode %q = %#v, want %#v", body, got, want)
		}
	}
}

func TestUnmarshalMatchesV1MapNumbers(t *testing.T) {
	body := []byte(`{"integer":7,"float":1.5,"nested":{"flag":true},"list":[1,"two"]}`)

	var want, got map[string]any
	if err := stdjson.Unmarshal(body, &want); err != nil {
		t.Fatalf("v1 decode: %v", err)
	}
	if err := Unmarshal(body, &got); err != nil {
		t.Fatalf("v2 decode: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("map decode = %#v, want %#v", got, want)
	}
}

func TestUnmarshalRejectsTrailingGarbage(t *testing.T) {
	var value decodeShape
	if err := Unmarshal([]byte(`{"name":"a"} trailing`), &value); err == nil {
		t.Fatal("v2 accepted trailing garbage")
	}
	if err := stdjson.Unmarshal([]byte(`{"name":"a"} trailing`), &value); err == nil {
		t.Fatal("v1 accepted trailing garbage")
	}
}

func TestUnmarshalInvalidUTF8Replacement(t *testing.T) {
	var value decodeShape
	if err := Unmarshal([]byte("{\"name\":\"a\xffb\"}"), &value); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(value.Name, "\uFFFD") {
		t.Errorf("name = %q, want a replacement character", value.Name)
	}
}
