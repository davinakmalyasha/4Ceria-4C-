package jsonwire

import "testing"

func TestMarshalString(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"the forward slash is not escaped", "a/b", `"a/b"`},
		{"a url", "https://example.test/api", `"https://example.test/api"`},
		{"html characters are not escaped", "<b>&x</b>", `"<b>&x</b>"`},
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
		{"accented characters stay UTF-8", "café", `"café"`},
		{"chinese characters stay UTF-8", "测试", `"测试"`},
		{"the emoji stays UTF-8", "👍", `"👍"`},
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
		{1, "1"},
		{100, "100"},
		{5500000, "5500000"},
		{0, "0"},
		{0.1, "0.1"},
		{1.5, "1.5"},
		{123456.789, "123456.789"},
		{1.0 / 3.0, "0.3333333333333333"},
		{1e21, "1000000000000000000000"},
	}

	for _, item := range cases {
		got := FormatFloat(item.in, 64)
		if got != item.want {
			t.Errorf("FormatFloat(%v)\n  got  %s\n  want %s", item.in, got, item.want)
		}
	}
}

func TestObjectKeepsInsertionOrder(t *testing.T) {
	object := NewObject()
	object.Set("message", "ok")
	object.Set("data", "x")
	object.Set("errors", "y")
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
	want := `{"message":"a/b","data":{"nested":"é","n":1.5}}`
	if string(got) != want {
		t.Errorf("Marshal(object)\n  got  %s\n  want %s", got, want)
	}
}

func TestRawIsWrittenVerbatim(t *testing.T) {
	got, err := Marshal(Raw([]byte(`{"b":2,"a":1}`)))
	if err != nil {
		t.Fatalf("Marshal Raw: %v", err)
	}
	if string(got) != `{"b":2,"a":1}` {
		t.Errorf("Raw order changed: %s", got)
	}
	if _, err := Marshal(Raw([]byte(`not json`))); err == nil {
		t.Error("invalid Raw must fail")
	}
}

func TestObjectNestedMarshalJSON(t *testing.T) {
	// An Object inside a standard encoder must still keep its order.
	object := NewObject().Set("b", 2).Set("a", 1)
	got, err := object.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}
	if string(got) != `{"b":2,"a":1}` {
		t.Errorf("got %s", got)
	}
}
