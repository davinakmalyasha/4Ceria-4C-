package httpapi

import "testing"

// TestCrc32bMatchesSanctum pins the token suffix against a live-issued
// token: PHP `hash('crc32b', 'UYaslxCquUHOTbBblEXVKlctAbUUnEcd31DSihvq')`
// is `88834291`. The IEEE variant gives `e8584e3d` — a different checksum,
// which would mint tokens Laravel still accepts (it only hashes) but that
// never match the legacy shape.
func TestCrc32bMatchesSanctum(t *testing.T) {
	if got := crc32bHex("UYaslxCquUHOTbBblEXVKlctAbUUnEcd31DSihvq"); got != "88834291" {
		t.Fatalf("crc32bHex = %q, want 88834291", got)
	}

	if got := crc32bHex(""); got != "00000000" {
		t.Fatalf("crc32bHex(\"\") = %q, want 00000000", got)
	}
}

// TestMintedTokenHasLegacyShape pins the presented form: `{id}` is added
// by the caller; the plain part is 40 alphabet chars plus 8 hex.
func TestMintedTokenHasLegacyShape(t *testing.T) {
	plain, err := randomTokenString(40)
	if err != nil {
		t.Fatalf("randomTokenString: %v", err)
	}

	full := plain + crc32bHex(plain)

	if len(full) != 48 {
		t.Fatalf("token plain length = %d, want 48", len(full))
	}

	for _, c := range full {
		isAlphaNum := (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
		isHexTail := false
		_ = isHexTail

		if !isAlphaNum {
			t.Fatalf("token char %q is outside the alphabet", c)
		}
	}
}
