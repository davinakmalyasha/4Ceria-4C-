package jsonphp

import "strings"

// Object is a JSON object whose keys keep their INSERTION order.
//
// WHY NOT A MAP
// -------------
// PHP's `json_encode` emits an array's keys in insertion order. Go's
// `json.Marshal` on a `map[string]any` emits them SORTED.
//
// Two bodies with the same keys in a different order are the same JSON and
// different bytes, and the rewrite's contract is about bytes. So the type
// that carries a response body is this one, not a map.
//
// The legacy API is full of bodies whose key order is part of the contract:
// every `response()->json(['message' => ..., 'data' => ...])` puts `message`
// first, and the SPA reads the body as an object so it does not care — but
// the golden files compare bytes, and the bytes are what a client sees.
//
// Setting a key that already exists does NOT move it to the end, because
// PHP's `$a['x'] = 1` on an existing key does not either.
type Object struct {
	keys   []string
	values map[string]any
}

// NewObject returns an empty ordered object.
func NewObject() *Object {
	return &Object{values: map[string]any{}}
}

// Set adds or replaces a key.
//
// The key keeps its original position when it is replaced.
func (o *Object) Set(key string, value any) *Object {
	if o.values == nil {
		o.values = map[string]any{}
	}

	if _, exists := o.values[key]; !exists {
		o.keys = append(o.keys, key)
	}

	o.values[key] = value

	return o
}

// Get returns a value and whether it is present.
func (o *Object) Get(key string) (any, bool) {
	value, ok := o.values[key]
	return value, ok
}

// Keys returns the keys in order.
func (o *Object) Keys() []string {
	return append([]string(nil), o.keys...)
}

// Len returns the number of keys.
func (o *Object) Len() int {
	return len(o.keys)
}

// encode writes the object.
func (o Object) encode(out *strings.Builder) error {
	out.WriteByte('{')

	for i, key := range o.keys {
		if i > 0 {
			out.WriteByte(',')
		}

		EncodeString(out, key)
		out.WriteByte(':')

		if err := encode(out, o.values[key]); err != nil {
			return err
		}
	}

	out.WriteByte('}')

	return nil
}
