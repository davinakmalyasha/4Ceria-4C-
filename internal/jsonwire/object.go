package jsonwire

import "strings"

// Object is a JSON object whose keys keep their insertion order.
//
// WHY NOT A MAP
// -------------
// A response has a readable, deliberate shape: `message` before `data`, a
// resource id before its relations, a summary before its rows. A Go map sorts
// its keys, so two runs can produce the same document with different bytes
// and every diff becomes noise.
//
// Setting a key that already exists keeps its original position: replacing
// `data` must not move it to the end of the response.
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

// MarshalJSON lets an Object nested inside a standard encoder keep its order.
func (o Object) MarshalJSON() ([]byte, error) {
	return Marshal(o)
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
