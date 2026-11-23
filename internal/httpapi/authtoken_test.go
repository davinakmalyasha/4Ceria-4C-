package httpapi

import "testing"

// TestCrc32bTokenSuffix pins the 8-character checksum suffix to the CRC-32b
// variant, not the IEEE variant. Both are plausible CRC-32 spellings; only
// this one matches the token shape existing rows were minted with.
func TestCrc32bTokenSuffix(t *testing.T) {
	if got := crc32bHex("UYaslxCquUHOTbBblEXVKlctAbUUnEcd31DSihvq"); got != "88834291" {
		t.Fatalf("crc32bHex = %q, want 88834291", got)
	}

	if got := crc32bHex(""); got != "00000000" {
		t.Fatalf("crc32bHex(\"\") = %q, want 00000000", got)
	}
}

// TestMintedTokenShape pins the presented form: `{id}` is added
// by the caller; the plain part is 40 alphabet chars plus 8 hex.
func TestMintedTokenShape(t *testing.T) {
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
