package jsonwire

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

// Closure for encodeTo's float32 branch: 32-bit floats use the same shortest
// fixed-point spelling as 64-bit ones.
func TestCoverMarshalFloat32(t *testing.T) {
	got, err := Marshal(float32(1.5))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "1.5" {
		t.Fatalf("Marshal(float32(1.5)) = %s, want 1.5", got)
	}

	var buffer bytes.Buffer
	if err := MarshalTo(&buffer, float32(-2.25)); err != nil {
		t.Fatal(err)
	}
	if buffer.String() != "-2.25" {
		t.Fatalf("MarshalTo(float32(-2.25)) = %s, want -2.25", buffer.String())
	}
}

// Closure for encodeTo's []any item-error branch: an unencodable element
// fails the whole slice rather than vanishing.
func TestCoverSliceItemError(t *testing.T) {
	value := []any{1, struct{ A int }{A: 1}}

	if _, err := Marshal(value); err == nil {
		t.Fatal("Marshal accepted a slice holding a struct")
	} else if !strings.Contains(err.Error(), "cannot encode") {
		t.Fatalf("slice error = %v, want the cannot-encode sentence", err)
	}

	var buffer bytes.Buffer
	if err := MarshalTo(&buffer, value); err == nil {
		t.Fatal("MarshalTo accepted a slice holding a struct")
	}
}

// nestArrays wraps inner in depth []any layers.
func nestArrays(depth int, inner any) any {
	value := inner
	for i := 0; i < depth; i++ {
		value = []any{value}
	}
	return value
}

// Closure for the three container-open error branches: past the encoder's
// maximum nesting depth the innermost BeginArray/BeginObject is refused and
// the refusal propagates instead of truncating the document.
//
// The stdlib limit (jsontext maxNestingDepth) is 10000: pushes 1..10000
// succeed and push 10001 fails. The typed inners therefore sit under exactly
// 10000 array layers so that THEIR open token is the failing push.
func TestCoverContainerOpenDepthLimit(t *testing.T) {
	const maxDepth = 10000 // encoding/json/jsontext state.go maxNestingDepth.

	for _, tc := range []struct {
		name  string
		value any
	}{
		{"array open", nestArrays(maxDepth+1, nil)},
		{"strings open", nestArrays(maxDepth, []string{"a"})},
		{"object open", nestArrays(maxDepth, map[string]any{"a": 1})},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := Marshal(tc.value); err == nil {
				t.Fatal("Marshal accepted a document past the nesting limit")
			} else if !strings.Contains(err.Error(), "depth") {
				t.Fatalf("depth error = %v, want the max-depth sentence", err)
			}
		})
	}
}

var errCoverWrite = errors.New("cover: writer unavailable")

type failWriter struct{}

func (failWriter) Write([]byte) (int, error) { return 0, errCoverWrite }

// Closure for encodeTo's []string element-error branch: with a payload far
// larger than the encoder's internal buffer, the first mid-stream flush lands
// on an element write, and a broken sink surfaces there rather than producing
// a truncated document.
func TestCoverStringElementWriteError(t *testing.T) {
	// ~1MB of elements dwarfs the encoder's 4KB buffer cap, so the first
	// flush is guaranteed to fire mid-elements rather than at either end.
	elements := make([]string, 10000)
	for i := range elements {
		elements[i] = strings.Repeat("x", 100)
	}

	if err := MarshalTo(failWriter{}, elements); err == nil {
		t.Fatal("MarshalTo with a broken sink succeeded")
	} else if !errors.Is(err, errCoverWrite) && !strings.Contains(err.Error(), "write") {
		t.Fatalf("element error = %v, want the write failure", err)
	}
}

// A broken sink is never silently swallowed: the stream reports the failure.
func TestCoverBrokenSinkPropagates(t *testing.T) {
	for _, value := range []any{
		[]any{1},
		map[string]any{"a": 1},
		NewObject().Set("a", 1),
	} {
		if err := MarshalTo(failWriter{}, value); err == nil {
			t.Fatalf("MarshalTo(%T) with a broken sink succeeded", value)
		}
	}
}

// NOTE (coverage): writeObject's key-write error return is provably
// unreachable and is intentionally left uncovered. The encoder deliberately
// never flushes right after an object name (jsontext avoidFlush: the value
// that follows might be empty and must stay unwriteable), and under this
// package's wire options a key string has no other failure mode — escapes
// are infallible with AllowInvalidUTF8, and namespaces are untracked with
// AllowDuplicateNames. The branch stays as defence in depth.
