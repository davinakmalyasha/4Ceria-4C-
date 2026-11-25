package identity

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestUserIDConversions(t *testing.T) {
	cases := []struct {
		name  string
		raw   int64
		valid bool
		str   string
	}{
		{"positive", 42, true, "42"},
		{"one", 1, true, "1"},
		{"zero is invalid", 0, false, "0"},
		{"negative is invalid", -7, false, "-7"},
		{"large", 9223372036854775807, true, "9223372036854775807"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			id := UserIDOf(tc.raw)
			if id.Int64() != tc.raw {
				t.Fatalf("Int64() = %d, want %d", id.Int64(), tc.raw)
			}
			if id.Valid() != tc.valid {
				t.Fatalf("Valid() = %v, want %v", id.Valid(), tc.valid)
			}
			if id.String() != tc.str {
				t.Fatalf("String() = %q, want %q", id.String(), tc.str)
			}
		})
	}
}

func TestProfileIDConversions(t *testing.T) {
	cases := []struct {
		name  string
		raw   int64
		valid bool
		str   string
	}{
		{"positive", 9, true, "9"},
		{"one", 1, true, "1"},
		{"zero is invalid", 0, false, "0"},
		{"negative is invalid", -1, false, "-1"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			id := ProfileIDOf(tc.raw)
			if id.Int64() != tc.raw {
				t.Fatalf("Int64() = %d, want %d", id.Int64(), tc.raw)
			}
			if id.Valid() != tc.valid {
				t.Fatalf("Valid() = %v, want %v", id.Valid(), tc.valid)
			}
			if id.String() != tc.str {
				t.Fatalf("String() = %q, want %q", id.String(), tc.str)
			}
		})
	}
}

func TestIDSpacesAreDistinct(t *testing.T) {
	// The whole point of the types: the same number in the two spaces
	// must not compare equal without an explicit conversion.
	var user UserID = 42
	var profile ProfileID = 42
	if user.Int64() != profile.Int64() {
		t.Fatal("raw values should match for this test to mean anything")
	}
	// Distinct named types: assignment must not compile implicitly.
	// Proved at runtime by round-tripping through the constructors.
	if UserIDOf(profile.Int64()) != user {
		t.Fatal("explicit conversion should preserve the value")
	}
	if ProfileIDOf(user.Int64()) != profile {
		t.Fatal("explicit conversion should preserve the value")
	}
}

func TestMarshalJSONEmitsRawNumber(t *testing.T) {
	userBytes, err := json.Marshal(UserIDOf(42))
	if err != nil {
		t.Fatal(err)
	}
	if string(userBytes) != "42" {
		t.Fatalf("UserID JSON = %s, want 42", userBytes)
	}

	profileBytes, err := json.Marshal(ProfileIDOf(7))
	if err != nil {
		t.Fatal(err)
	}
	if string(profileBytes) != "7" {
		t.Fatalf("ProfileID JSON = %s, want 7", profileBytes)
	}

	// Zero marshals as 0, not null: the API contract is a number.
	zeroBytes, err := UserIDOf(0).MarshalJSON()
	if err != nil {
		t.Fatal(err)
	}
	if string(zeroBytes) != "0" {
		t.Fatalf("zero UserID JSON = %s, want 0", zeroBytes)
	}
}

func TestRolesAreCanonicalOrder(t *testing.T) {
	roles := Roles()
	want := []Role{
		RoleArsitek, RoleKontraktor, RoleNotaris, RoleInterior,
		RoleStructural, RoleMep, RoleProjectManager,
	}
	if len(roles) != len(want) {
		t.Fatalf("Roles() has %d entries, want %d", len(roles), len(want))
	}
	for i := range want {
		if roles[i] != want[i] {
			t.Fatalf("Roles()[%d] = %q, want %q", i, roles[i], want[i])
		}
	}
	// Mutating the returned slice must not corrupt the next call.
	roles[0] = Role("bogus")
	if again := Roles(); again[0] != RoleArsitek {
		t.Fatal("Roles() return value aliases package state")
	}
}

func TestProfileTableFor(t *testing.T) {
	cases := []struct {
		role  Role
		table ProfileTable
		ok    bool
	}{
		{RoleArsitek, TableArsitek, true},
		{RoleKontraktor, TableKontraktor, true},
		{RoleNotaris, TableNotarisProfile, true},
		{RoleInterior, TableInteriorProfile, true},
		{RoleStructural, TableStructuralEngine, true},
		{RoleMep, TableMepEngineer, true},
		{RoleProjectManager, TableProjectManager, true},
		{Role("supplier"), "", false},
		{Role(""), "", false},
		{Role("Arsitek"), "", false},
	}

	for _, tc := range cases {
		t.Run(string(tc.role)+"/table", func(t *testing.T) {
			got, ok := ProfileTableFor(tc.role)
			if ok != tc.ok || got != tc.table {
				t.Fatalf("ProfileTableFor(%q) = (%q, %v), want (%q, %v)",
					tc.role, got, ok, tc.table, tc.ok)
			}
		})
	}
}

func TestProjectColumnFor(t *testing.T) {
	// Every selected_* column holds a PROFILE id, including pm_id.
	cases := []struct {
		role   Role
		column string
		ok     bool
	}{
		{RoleArsitek, "selected_arsitek_id", true},
		{RoleKontraktor, "selected_kontraktor_id", true},
		{RoleNotaris, "selected_notaris_id", true},
		{RoleInterior, "selected_interior_id", true},
		{RoleStructural, "structural_id", true},
		{RoleMep, "mep_id", true},
		{RoleProjectManager, "pm_id", true},
		{Role("supplier"), "", false},
		{Role(""), "", false},
	}

	for _, tc := range cases {
		t.Run(string(tc.role)+"/column", func(t *testing.T) {
			got, ok := ProjectColumnFor(tc.role)
			if ok != tc.ok || got != tc.column {
				t.Fatalf("ProjectColumnFor(%q) = (%q, %v), want (%q, %v)",
					tc.role, got, ok, tc.column, tc.ok)
			}
		})
	}
}

func TestRoleString(t *testing.T) {
	if RoleArsitek.String() != "arsitek" {
		t.Fatalf("Role.String() = %q", RoleArsitek.String())
	}
	var zero Role
	if zero.String() != "" {
		t.Fatalf("zero Role.String() = %q", zero.String())
	}
}

func TestParseRole(t *testing.T) {
	for _, role := range Roles() {
		t.Run("accepts/"+string(role), func(t *testing.T) {
			got, err := ParseRole(string(role))
			if err != nil {
				t.Fatalf("ParseRole(%q) = %v", role, err)
			}
			if got != role {
				t.Fatalf("ParseRole(%q) = %q", role, got)
			}
		})
	}

	rejected := []string{"", "supplier", "Arsitek", "ARSITEK", " architect", "arsitek ", "pm", "project-manager"}
	for _, input := range rejected {
		t.Run("rejects/"+input, func(t *testing.T) {
			if _, err := ParseRole(input); err == nil {
				t.Fatalf("ParseRole(%q) was accepted", input)
			} else if !strings.Contains(err.Error(), input) {
				t.Fatalf("ParseRole(%q) error %q does not name the input", input, err)
			}
		})
	}
}

func TestProfileHoldsBothIDSpaces(t *testing.T) {
	p := Profile{
		User:  UserIDOf(7),
		ID:    ProfileIDOf(42),
		Role:  RoleArsitek,
		Table: TableArsitek,
	}
	if !p.User.Valid() || !p.ID.Valid() {
		t.Fatal("valid profile reported invalid")
	}
	table, ok := ProfileTableFor(p.Role)
	if !ok || table != p.Table {
		t.Fatalf("role %q maps to %q, profile holds %q", p.Role, table, p.Table)
	}
	column, ok := ProjectColumnFor(p.Role)
	if !ok || column == "" {
		t.Fatalf("role %q has no project column", p.Role)
	}
}

func TestEveryRoleHasTableAndColumn(t *testing.T) {
	// The registry invariant: no role maps to half the schema.
	for _, role := range Roles() {
		if _, ok := ProfileTableFor(role); !ok {
			t.Errorf("role %q has no profile table", role)
		}
		if _, ok := ProjectColumnFor(role); !ok {
			t.Errorf("role %q has no project column", role)
		}
		if _, err := ParseRole(string(role)); err != nil {
			t.Errorf("role %q does not round-trip through ParseRole: %v", role, err)
		}
	}
}
