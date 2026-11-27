package httpapi

// hJ sign validators: the empty-signature required arm and the unknown
// role relation key — pure units, no database.

import (
	"testing"
)

func TestHJSignValidateUnits(t *testing.T) {
	f := &errorBag{}
	if _, _, ok := validateClientSign(map[string]any{"bid_type": "arsitek", "signature": ""}, f); ok {
		t.Fatalf("empty sig ok")
	}
	hJErrBag(t, f, "signature", "The signature field is required.")

	f = &errorBag{}
	bidType, sig, ok := validateClientSign(map[string]any{"bid_type": "mep", "signature": "data:image/png;base64,aGVsbG8="}, f)
	if !ok || bidType != "mep" || sig == "" || !f.empty() {
		t.Fatalf("valid sign = %q %v %v", bidType, ok, f.bag)
	}

	if key, table, profile, ok := bidRelationKey("hJ-bogus", map[string]any{}); ok || key != "" || table != "" || profile != 0 {
		t.Fatalf("relation bogus = %q %q %d %v", key, table, profile, ok)
	}
	if key, table, profile, ok := bidRelationKey("arsitek", map[string]any{"arsitek_id": int64(0)}); ok || key != "" || table != "" || profile != 0 {
		t.Fatalf("relation zero = %q %q %d %v", key, table, profile, ok)
	}
	if key, table, profile, ok := bidRelationKey("mep", map[string]any{"mep_id": int64(9)}); !ok || key != "mepEngineer" || table != "mep_engineers" || profile != 9 {
		t.Fatalf("relation mep = %q %q %d %v", key, table, profile, ok)
	}
}
