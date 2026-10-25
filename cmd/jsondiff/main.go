// Command jsondiff encodes the corpus with the Go `jsonphp` package.
//
// It is the Go half of the JSON encoding differential: the PHP answers are
// the reference, and a Go answer that differs in the BYTES is a response
// body that would have changed.
//
// USAGE
//
//	go run ./cmd/jsondiff --corpus=tools/json/corpus.json --out=.tmp/json-go.json
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
)

// case is one corpus entry.
//
// The corpus describes values in a JSON-safe way — a float that is meant to
// stay a float is written as a float — and the tags keep the types apart
// when the corpus is decoded.
type corpusCase struct {
	Kind string `json:"kind"`

	Value any `json:"value"`

	// The integer case: JSON has one number type, so the corpus says which
	// it means.
	IntValue *int64 `json:"-"`

	Entries [][]any `json:"entries"`
}

type corpus struct {
	Cases []corpusCase `json:"cases"`
}

type answer struct {
	Index   int     `json:"index"`
	Encoded *string `json:"encoded"`
	Failed  bool    `json:"failed"`
}

func main() {
	corpusPath := flag.String("corpus", "tools/json/corpus.json", "the corpus to encode")
	outPath := flag.String("out", ".tmp/json-go.json", "where to write the answers")
	flag.Parse()

	raw, err := os.ReadFile(*corpusPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "::error::could not read the corpus: %v\n", err)
		os.Exit(1)
	}

	// The corpus is decoded with UseNumber so that a float written as 1.0
	// stays a float, and an integer written as 1 stays an integer.
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()

	var parsed corpus

	if err := decoder.Decode(&parsed); err != nil {
		fmt.Fprintf(os.Stderr, "::error::could not parse the corpus: %v\n", err)
		os.Exit(1)
	}

	results := make([]answer, 0, len(parsed.Cases))

	for index, item := range parsed.Cases {
		value, err := valueOf(item)
		if err != nil {
			fmt.Fprintf(os.Stderr, "::error::case %d: %v\n", index, err)
			os.Exit(1)
		}

		encoded, err := jsonphp.Marshal(value)
		if err != nil {
			results = append(results, answer{Index: index, Encoded: nil, Failed: true})
			continue
		}

		text := string(encoded)
		results = append(results, answer{Index: index, Encoded: &text})
	}

	payload, err := json.Marshal(map[string]any{"cases": results})
	if err != nil {
		fmt.Fprintf(os.Stderr, "::error::could not encode the answers: %v\n", err)
		os.Exit(1)
	}

	if dir := filepath.Dir(*outPath); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			fmt.Fprintf(os.Stderr, "::error::could not create %s: %v\n", dir, err)
			os.Exit(1)
		}
	}

	if err := os.WriteFile(*outPath, payload, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "::error::could not write %s: %v\n", *outPath, err)
		os.Exit(1)
	}

	fmt.Printf("wrote %d Go JSON answers to %s\n", len(results), *outPath)
}

// valueOf rebuilds the PHP value a case stands for.
func valueOf(item corpusCase) (any, error) {
	switch item.Kind {
	case "string":
		text, ok := item.Value.(string)
		if !ok {
			return nil, fmt.Errorf("expected a string, got %T", item.Value)
		}
		return text, nil

	case "int":
		number, ok := item.Value.(json.Number)
		if !ok {
			return nil, fmt.Errorf("expected a number, got %T", item.Value)
		}
		parsed, err := number.Int64()
		if err != nil {
			return nil, fmt.Errorf("expected an integer: %w", err)
		}
		return parsed, nil

	case "float":
		number, ok := item.Value.(json.Number)
		if !ok {
			return nil, fmt.Errorf("expected a number, got %T", item.Value)
		}
		parsed, err := number.Float64()
		if err != nil {
			return nil, fmt.Errorf("expected a float: %w", err)
		}
		return parsed, nil

	case "literal":
		return item.Value, nil

	case "array":
		list, ok := item.Value.([]any)
		if !ok {
			return nil, fmt.Errorf("expected an array, got %T", item.Value)
		}

		out := make([]any, 0, len(list))
		for _, element := range list {
			converted, err := convert(element)
			if err != nil {
				return nil, err
			}
			out = append(out, converted)
		}
		return out, nil

	case "object":
		object := jsonphp.NewObject()

		for _, entry := range item.Entries {
			if len(entry) != 2 {
				return nil, fmt.Errorf("an object entry must be [key, value]")
			}

			key, ok := entry[0].(string)
			if !ok {
				return nil, fmt.Errorf("an object key must be a string, got %T", entry[0])
			}

			converted, err := convert(entry[1])
			if err != nil {
				return nil, err
			}

			object.Set(key, converted)
		}

		return object, nil
	}

	return nil, fmt.Errorf("unknown case kind %q", item.Kind)
}

// convert turns a decoded JSON value into the Go value the encoder takes.
//
// The corpus is decoded with UseNumber, so every number arrives as a
// json.Number and the decision between an integer and a float has to be
// made here: a number with a fraction or an exponent is a float, and one
// without is an integer. That is the same rule PHP applies when it decodes
// a JSON number into an int or a float.
func convert(value any) (any, error) {
	switch v := value.(type) {
	case json.Number:
		text := v.String()

		if !hasFractionOrExponent(text) {
			parsed, err := v.Int64()
			if err == nil {
				return parsed, nil
			}
		}

		parsed, err := v.Float64()
		if err != nil {
			return nil, err
		}
		return parsed, nil

	case []any:
		out := make([]any, 0, len(v))
		for _, element := range v {
			converted, err := convert(element)
			if err != nil {
				return nil, err
			}
			out = append(out, converted)
		}
		return out, nil

	case map[string]any:
		// A nested object inside a case is a JSON object, and the corpus
		// does not give it a key order — so the keys are sorted, which is
		// the only deterministic choice for a Go map.
		object := jsonphp.NewObject()

		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		sortStrings(keys)

		for _, key := range keys {
			converted, err := convert(v[key])
			if err != nil {
				return nil, err
			}
			object.Set(key, converted)
		}
		return object, nil

	default:
		return value, nil
	}
}

// hasFractionOrExponent reports whether a JSON number was written as a
// float.
func hasFractionOrExponent(text string) bool {
	for _, r := range text {
		if r == '.' || r == 'e' || r == 'E' {
			return true
		}
	}
	return false
}

// sortStrings sorts in place.
func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}
