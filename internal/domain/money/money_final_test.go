package money

// Final branch closure: MustOf success path and AllocateNamed error +
// remainder/dust distribution. Integer minor units only; no floats.

import (
	"errors"
	"testing"
)

func TestFinalMustOfValidLiteral(t *testing.T) {
	got := MustOf("100.00", DefaultCurrency)
	if got.Int() != 10000 {
		t.Fatalf("MustOf(100.00) = %d, want 10000", got.Int())
	}
	if got.Currency() != "IDR" {
		t.Fatalf("currency = %q, want IDR", got.Currency())
	}
	// Currency normalises the same way Of does.
	got = MustOf("10.50", " idr ")
	if got.Currency() != "IDR" || got.Int() != 1050 {
		t.Fatalf("normalised MustOf = (%d, %q)", got.Int(), got.Currency())
	}
}

func TestFinalAllocateNamedEmptyWeights(t *testing.T) {
	if _, err := New(100, DefaultCurrency).AllocateNamed(map[string]int64{}); !errors.Is(err, ErrInvalidWeights) {
		t.Fatalf("empty weights = %v, want ErrInvalidWeights", err)
	}
}

func TestFinalAllocateNamedPropagatesAllocateError(t *testing.T) {
	// Zero-sum weights fail inside Allocate.
	if _, err := New(100, DefaultCurrency).AllocateNamed(map[string]int64{"a": 0, "b": 0}); !errors.Is(err, ErrInvalidWeights) {
		t.Fatalf("zero-sum named weights = %v, want ErrInvalidWeights", err)
	}
	// Negative-sum weights fail the same way.
	if _, err := New(100, DefaultCurrency).AllocateNamed(map[string]int64{"a": -1, "b": -2}); !errors.Is(err, ErrInvalidWeights) {
		t.Fatalf("negative-sum named weights = %v, want ErrInvalidWeights", err)
	}
}

func TestFinalAllocateNamedPositiveRemainderLargestFirst(t *testing.T) {
	// 100 minor across {a:2, b:1}: total 3, exact 66 rem 2 / 33 rem 1,
	// leftover +1 goes to the largest remainder (a).
	got, err := New(100, DefaultCurrency).AllocateNamed(map[string]int64{"a": 2, "b": 1})
	if err != nil {
		t.Fatal(err)
	}
	if got["a"].Int() != 67 {
		t.Fatalf("a = %d, want 67 (largest remainder first)", got["a"].Int())
	}
	if got["b"].Int() != 33 {
		t.Fatalf("b = %d, want 33", got["b"].Int())
	}
	var sum int64
	for _, v := range got {
		sum += v.Int()
	}
	if sum != 100 {
		t.Fatalf("named parts sum = %d, want 100", sum)
	}
}

func TestFinalAllocateNamedNegativeRemainderSmallestFirst(t *testing.T) {
	// A refund split: -100 across {a:2, b:1} leaves -1, taken from the
	// smallest remainder first.
	got, err := New(-100, DefaultCurrency).AllocateNamed(map[string]int64{"a": 2, "b": 1})
	if err != nil {
		t.Fatal(err)
	}
	// Exact truncates toward zero: -66 rem -2 / -33 rem -1, leftover -1
	// goes to the smallest remainder (a: -2 < -1).
	if got["a"].Int() != -67 {
		t.Fatalf("a = %d, want -67 (smallest remainder first)", got["a"].Int())
	}
	if got["b"].Int() != -33 {
		t.Fatalf("b = %d, want -33", got["b"].Int())
	}
	var sum int64
	for _, v := range got {
		sum += v.Int()
	}
	if sum != -100 {
		t.Fatalf("named parts sum = %d, want -100", sum)
	}
}

func TestFinalAllocateNamedTieBreaksOnKey(t *testing.T) {
	// Equal remainders break the tie on the sorted key, never on map order.
	got, err := New(100, DefaultCurrency).AllocateNamed(map[string]int64{"b": 1, "a": 1, "c": 1})
	if err != nil {
		t.Fatal(err)
	}
	// 33 each with +1 leftover to the first key ("a").
	if got["a"].Int() != 34 {
		t.Fatalf("a = %d, want 34 (tie-break on key)", got["a"].Int())
	}
	if got["b"].Int() != 33 || got["c"].Int() != 33 {
		t.Fatalf("b/c = %d/%d, want 33/33", got["b"].Int(), got["c"].Int())
	}
}
