// Package authz answers one question once:
//
//	"Is this user the hired professional for this role on this project?"
//
// A null comparison is the trap. If the project has no architect and the user
// has no architect profile, a comparison of two nullable ids can read as a
// match. That is not a theoretical bug: it is how a user with a role label but
// no profile row could reach another project's payment stages, dispute thread,
// evidence files, document vault, phase sealing, BOM writes, warranty closure
// and termination.
//
// The rule requires ALL FOUR of:
//
//  1. the user's role is the role being asked about;
//  2. the user has a PROFILE for that role;
//  3. the project's column for that role is not null;
//  4. the two PROFILE ids match.
//
// Drop step 2 or 3 and the comparison silently succeeds on nulls.
//
// THE ID SPACES
// -------------
// The project's column holds a PROFILE id, and the user's profile is a
// PROFILE id, so the comparison is between two `identity.ProfileID` values.
// A `identity.UserID` does not compare with a `identity.ProfileID` at all —
// which is how the id-space confusion that produced B1, B2 and B5 becomes a
// COMPILE ERROR rather than a runtime surprise.
package authz

import (
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
)

// Subject is the person asking.
//
// It is an INTERFACE rather than a concrete user struct: the rule needs one
// thing from a user — the profile for a role — and the storage layer is not
// the rule's business. That also makes the rule testable without a database.
type Subject interface {
	// UserID is the person.
	UserID() identity.UserID
	// RoleType is the person's role_type, e.g. "arsitek".
	RoleType() string
	// ProfileIDFor is the id of the person's profile for a role, or nil when
	// they have none.
	ProfileIDFor(role identity.Role) *identity.ProfileID
}

// Project is the thing being asked about.
//
// Only the project's hired-professional column matters, and only for ONE
// role at a time, so the interface takes the role rather than exposing every
// column.
type Project interface {
	// HiredProfileID is the profile id of the hired professional for a role,
	// or nil when nobody is hired for it.
	HiredProfileID(role identity.Role) *identity.ProfileID
	// OwnerID is the project's owner.
	OwnerID() identity.UserID
}

// Matches reports whether the subject is the hired professional for the role
// on the project.
//
// It is FALSE whenever EITHER side is absent. That is the entire point.
func Matches(project Project, subject Subject, role identity.Role) bool {
	if subject == nil || project == nil {
		return false
	}

	// 1. The subject must actually hold the role they are claiming.
	if subject.RoleType() != role.String() {
		return false
	}

	// 2. The subject must have a profile for it.
	profileID := subject.ProfileIDFor(role)
	if profileID == nil {
		return false
	}

	// 3. The project must actually have that professional.
	hiredID := project.HiredProfileID(role)
	if hiredID == nil {
		return false
	}

	// 4. And they must be the same person.
	return *hiredID == *profileID
}

// IsAssignedPm reports whether the subject is the project's ASSIGNED project
// manager.
//
// It is the same rule as Matches, stated for the role that has its own
// column, so a caller does not have to know that `pm_id` is one of the seven.
func IsAssignedPm(project Project, subject Subject) bool {
	return Matches(project, subject, identity.RoleProjectManager)
}

// CanAccess reports whether the subject may see the project at all: they are
// the owner, or they are the hired professional.
func CanAccess(project Project, subject Subject) bool {
	if project == nil || subject == nil {
		return false
	}

	if project.OwnerID() == subject.UserID() {
		return true
	}

	role, err := identity.ParseRole(subject.RoleType())
	if err != nil {
		return false
	}

	return Matches(project, subject, role)
}

// IsOwnerOrAssignedPm reports whether the subject may act with the OWNER's or
// the PM's authority — and nobody else's.
//
// For lifecycle actions that are the client's or the PM's decision, not any
// participant's. The security audit found a family of these (specialist
// hiring, engineering approvals, phase sealing, warranty closure) gated on
// mere participation, which let every hired professional and every active
// sub-professional drive them.
func IsOwnerOrAssignedPm(project Project, subject Subject) bool {
	if project == nil || subject == nil {
		return false
	}

	if project.OwnerID() == subject.UserID() {
		return true
	}

	return IsAssignedPm(project, subject)
}
