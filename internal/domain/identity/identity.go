// Package identity holds the two ID SPACES of the domain.
//
// WHY THIS EXISTS
// ---------------
// `projects.selected_arsitek_id` holds an `arsiteks.id` — a PROFILE id.
// `projects.user_id` holds a `users.id` — a USER id.
//
// The two spaces OVERLAP: architect profile 42 and user 42 are different rows
// belonging to different people, and there is nothing in the numbers that says
// so. The legacy application had this asymmetry recorded in three places — a
// config key, a model relation and a branch in an authorisation rule — and
// every one of them was a place to compare the wrong two numbers.
//
// `projects.pm_id` was the worst of them: it held a USER id while every other
// `selected_*` column held a PROFILE id, and `bids_project_manager.pm_id`
// held a PROFILE id. So "the project's PM" and "the PM's bid" were two
// different numbers for the same person. The pm_id resolution migration
// (2026-10-21) made the column hold the PROFILE id, and the convention is
// now ONE convention: every `selected_*` column holds a profile id.
//
// THE TYPES ARE THE POINT
// ----------------------
// `UserID` and `ProfileID` are DISTINCT TYPES, so a comparison between them
// does not compile. That is the whole defence: the bug class is not "someone
// forgot to check", it is "the compiler refused".
//
// The values are still plain int64 underneath, so a database scan and a
// foreign key are both trivial.
package identity

import (
	"fmt"
	"strconv"
)

// UserID identifies a row in `users`.
//
// It is a DISTINCT type from ProfileID, and the two are not comparable
// without an explicit conversion — which is the point.
type UserID int64

// ProfileID identifies a row in a PROFILE table: `arsiteks`, `kontraktors`,
// `notaris_profiles`, `interior_profiles`, `project_managers`,
// `structural_engineers`, `mep_engineers`.
//
// It is a DISTINCT type from UserID.
type ProfileID int64

// UserIDOf converts a raw database value into a UserID.
func UserIDOf(value int64) UserID { return UserID(value) }

// ProfileIDOf converts a raw database value into a ProfileID.
func ProfileIDOf(value int64) ProfileID { return ProfileID(value) }

// Int64 is the raw value, for a query parameter or a scan.
func (id UserID) Int64() int64 { return int64(id) }

// Int64 is the raw value.
func (id ProfileID) Int64() int64 { return int64(id) }

// Valid reports whether the id is a real, present row.
func (id UserID) Valid() bool { return id > 0 }

// Valid reports whether the id is a real, present row.
func (id ProfileID) Valid() bool { return id > 0 }

// String is the raw value, for a log line.
func (id UserID) String() string { return strconv.FormatInt(int64(id), 10) }

// String is the raw value, for a log line.
func (id ProfileID) String() string { return strconv.FormatInt(int64(id), 10) }

// MarshalJSON emits the raw number, because the API contract is a number.
func (id UserID) MarshalJSON() ([]byte, error) {
	return []byte(strconv.FormatInt(int64(id), 10)), nil
}

// MarshalJSON emits the raw number, because the API contract is a number.
func (id ProfileID) MarshalJSON() ([]byte, error) {
	return []byte(strconv.FormatInt(int64(id), 10)), nil
}

// ProfileTable is the table a role's profiles live in.
//
// It is the same table the legacy `config/bids.php` named, and the same one
// the PostgreSQL schema uses.
type ProfileTable string

// The seven profile tables.
const (
	TableArsitek          ProfileTable = "arsiteks"
	TableKontraktor       ProfileTable = "kontraktors"
	TableNotarisProfile   ProfileTable = "notaris_profiles"
	TableInteriorProfile  ProfileTable = "interior_profiles"
	TableProjectManager   ProfileTable = "project_managers"
	TableStructuralEngine ProfileTable = "structural_engineers"
	TableMepEngineer      ProfileTable = "mep_engineers"
)

// Profile is a person's professional profile.
//
// The legacy application models this as a `users` row with one of seven
// optional profile relations. The port keeps that shape — a user has AT MOST
// ONE profile per role — and the role is what selects the relation.
type Profile struct {
	// User is the person the profile belongs to.
	User UserID
	// ID is the profile's own id, in the profile's own table.
	ID ProfileID
	// Role is the licensed role the profile grants.
	Role Role
	// Table is where the profile row lives.
	Table ProfileTable
}

// Role is one of the seven licensed professional roles.
//
// It is a string type rather than an int so that a value read out of the
// database can be checked against the registry without a lookup table.
type Role string

// The seven roles, in the order `config/bids.php` declares them.
const (
	RoleArsitek        Role = "arsitek"
	RoleKontraktor     Role = "kontraktor"
	RoleNotaris        Role = "notaris"
	RoleInterior       Role = "interior"
	RoleStructural     Role = "structural"
	RoleMep            Role = "mep"
	RoleProjectManager Role = "project_manager"
)

// Roles is every licensed role, in the registry's order.
//
// The ORDER is not cosmetic: it is the order the legacy `config/bids.php`
// used, and the order the `bids` table's role enum was built from.
func Roles() []Role {
	return []Role{
		RoleArsitek,
		RoleKontraktor,
		RoleNotaris,
		RoleInterior,
		RoleStructural,
		RoleMep,
		RoleProjectManager,
	}
}

// ProfileTableFor is the table a role's profiles live in.
//
// This is the ONE place the role-to-table mapping is stated. The legacy
// application had it in `config/bids.php` AND in the `Hire` class's relation
// map, and the two had to be kept in sync by hand.
func ProfileTableFor(role Role) (ProfileTable, bool) {
	switch role {
	case RoleArsitek:
		return TableArsitek, true
	case RoleKontraktor:
		return TableKontraktor, true
	case RoleNotaris:
		return TableNotarisProfile, true
	case RoleInterior:
		return TableInteriorProfile, true
	case RoleStructural:
		return TableStructuralEngine, true
	case RoleMep:
		return TableMepEngineer, true
	case RoleProjectManager:
		return TableProjectManager, true
	default:
		return "", false
	}
}

// ProjectColumnFor is the column on `projects` that names the hired
// professional for a role.
//
// EVERY one of them holds a PROFILE id, including `pm_id` — the pm_id
// resolution migration of 2026-10-21 made that true, and it is the whole
// reason the registry no longer needs a "which id space is this column in"
// key.
func ProjectColumnFor(role Role) (string, bool) {
	switch role {
	case RoleArsitek:
		return "selected_arsitek_id", true
	case RoleKontraktor:
		return "selected_kontraktor_id", true
	case RoleNotaris:
		return "selected_notaris_id", true
	case RoleInterior:
		return "selected_interior_id", true
	case RoleStructural:
		return "structural_id", true
	case RoleMep:
		return "mep_id", true
	case RoleProjectManager:
		return "pm_id", true
	default:
		return "", false
	}
}

// String is the role's key.
func (r Role) String() string { return string(r) }

// ParseRole reads a role key.
func ParseRole(value string) (Role, error) {
	role := Role(value)

	for _, known := range Roles() {
		if known == role {
			return role, nil
		}
	}

	return "", fmt.Errorf("unknown professional role: %q", value)
}
