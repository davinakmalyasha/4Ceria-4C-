// Command moneydiff computes the money value object's answers over the
// differential corpus.
//
// It is the Go half of the cross-engine check: the PHP half is
// `tools/money/compute-php.php`, and `tools/money/compare.mjs` diffs the two.
//
// WHY A DIFFERENTIAL AND NOT A SHARED TEST SUITE
// ----------------------------------------------
// A shared test suite proves each implementation agrees with the EXPECTATION.
// A differential proves the two implementations agree with EACH OTHER, which is
// the actual question when one of them is a port of the other.
//
// It also catches the case a shared suite cannot: a rule that is wrong in BOTH
// implementations still passes a shared suite, and only the oracle — the PHP
// application, which is what the Go port replaces — can be the reference.
//
// USAGE
//
//	go run ./cmd/moneydiff --corpus=tools/money/corpus.json --out=.tmp/money-go.json
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
)

type caseInput struct {
	Op         string  `json:"op"`
	Amount     string  `json:"amount"`
	Percentage string  `json:"percentage"`
	Parts      int     `json:"parts"`
	Weights    []int64 `json:"weights"`
	Factor     float64 `json:"factor"`
}

type result struct {
	Op       string   `json:"op"`
	Amount   string   `json:"amount"`
	Decimal  string   `json:"decimal"`
	Error    string   `json:"error,omitempty"`
	Parts    []string `json:"parts,omitempty"`
	Factor   float64  `json:"factor,omitempty"`
	Original string   `json:"original,omitempty"`
}

func main() {
	corpusPath := flag.String("corpus", "tools/money/corpus.json", "the corpus to compute over")
	outPath := flag.String("out", ".tmp/money-go.json", "where to write the results")
	flag.Parse()

	raw, err := os.ReadFile(*corpusPath)
	if err != nil {
		fail("could not read the corpus: %v", err)
	}

	var document struct {
		Cases []caseInput `json:"cases"`
	}

	if err := json.Unmarshal(raw, &document); err != nil {
		fail("could not parse the corpus: %v", err)
	}

	results := make([]result, 0, len(document.Cases))

	for _, input := range document.Cases {
		results = append(results, compute(input))
	}

	encoded, err := json.MarshalIndent(map[string]any{
		"engine": "go",
		"cases":  results,
	}, "", "  ")
	if err != nil {
		fail("could not encode the results: %v", err)
	}

	if err := os.MkdirAll(dirOf(*outPath), 0o755); err != nil {
		fail("could not create the output directory: %v", err)
	}

	if err := os.WriteFile(*outPath, append(encoded, '\n'), 0o644); err != nil {
		fail("could not write the results: %v", err)
	}

	fmt.Printf("computed %d cases -> %s\n", len(results), *outPath)
}

func compute(input caseInput) result {
	out := result{Op: input.Op, Amount: input.Amount}

	amount, err := money.Of(input.Amount, money.DefaultCurrency)
	if err != nil {
		out.Error = err.Error()
		return out
	}

	out.Decimal = amount.Decimal()

	switch input.Op {
	case "percentage":
		value, err := amount.Percentage(input.Percentage)
		if err != nil {
			out.Error = err.Error()
			return out
		}
		out.Decimal = value.Decimal()
		out.Original = amount.Decimal()

	case "split":
		parts, err := amount.Split(input.Parts)
		if err != nil {
			out.Error = err.Error()
			return out
		}
		out.Original = amount.Decimal()
		for _, part := range parts {
			out.Parts = append(out.Parts, part.Decimal())
		}

	case "allocate":
		parts, err := amount.Allocate(input.Weights)
		if err != nil {
			out.Error = err.Error()
			return out
		}
		out.Original = amount.Decimal()
		for _, part := range parts {
			out.Parts = append(out.Parts, part.Decimal())
		}

	case "multiply":
		out.Original = amount.Decimal()
		out.Factor = input.Factor

		product, err := amount.MultiplyBy(input.Factor)
		if err != nil {
			out.Error = err.Error()
			return out
		}

		out.Decimal = product.Decimal()

	default:
		out.Error = "unknown operation: " + input.Op
	}

	return out
}

func dirOf(path string) string {
	if index := strings.LastIndexAny(path, `/\`); index > 0 {
		return path[:index]
	}
	return "."
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "moneydiff: "+format+"\n", args...)
	os.Exit(1)
}
