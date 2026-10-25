package authz

import (
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
)

// The test doubles implement the two interfaces, so the rule can be exercised
// WITHOUT A DATABASE — which the legacy `Hire` class could not be, because it
// reached into Eloquent relations.
//
// That is the point of the interfaces: an authorisation rule that needs a
// database to test is an authorisation rule that gets tested by accident.

type testSubject struct {
	userID   identity.UserID
	roleType string
	profiles map[identity.Role]identity.ProfileID
}

func (s testSubject) UserID() identity.UserID { return s.userID }

func (s testSubject) RoleType() string { return s.roleType }

func (s testSubject) ProfileIDFor(role identity.Role) *identity.ProfileID {
	id, ok := s.profiles[role]
	if !ok {
		return nil
	}
	return &id
}

type testProject struct {
	owner identity.UserID
	hired map[identity.Role]identity.ProfileID
}

func (p testProject) OwnerID() identity.UserID { return p.owner }

func (p testProject) HiredProfileID(role identity.Role) *identity.ProfileID {
	id, ok := p.hired[role]
	if !ok {
		return nil
	}
	return &id
}

func subjectWith(role identity.Role, profileID identity.ProfileID) testSubject {
	subject := testSubject{
		userID:   100,
		roleType: role.String(),
		profiles: map[identity.Role]identity.ProfileID{},
	}

	if profileID > 0 {
		subject.profiles[role] = profileID
	}

	return subject
}

func TestItIsFalseWhenTheSubjectHasNoProfile(t *testing.T) {
	// THE BYPASS.
	//
	// The legacy spellings were:
	//
	//	(int) $project->selected_arsitek_id === (int) $user->arsitek?->id
	//
	// With no architect on the project and no profile on the user, that is
	// `(int)null === (int)null`, which in PHP is TRUE. So a user whose
	// `role_type` was `arsitek` but who had NO `arsiteks` row read as the
	// hired architect of EVERY project that had no architect.
	//
	// The reachable set was: minting a payment stage on a foreign project,
	// reading another project's stages, reading a dispute thread and
	// downloading its EVIDENCE FILES from the private disk, the private
	// document vault, phase sealing, BOM writes, warranty closure, and
	// termination.
	subject := subjectWith(identity.RoleArsitek, 0)
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{}}

	if Matches(project, subject, identity.RoleArsitek) {
		t.Fatal("a user with no profile matched a project with no architect")
	}
}

func TestItIsFalseWhenTheProjectHasNoProfessional(t *testing.T) {
	subject := subjectWith(identity.RoleArsitek, 42)
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{}}

	if Matches(project, subject, identity.RoleArsitek) {
		t.Fatal("a user matched a project with nobody hired")
	}
}

func TestItIsTrueWhenBothSidesNameTheSameProfile(t *testing.T) {
	subject := subjectWith(identity.RoleArsitek, 42)
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{
		identity.RoleArsitek: 42,
	}}

	if !Matches(project, subject, identity.RoleArsitek) {
		t.Fatal("the hired architect did not match")
	}
}

func TestItIsFalseForADifferentProfile(t *testing.T) {
	// Profile ids OVERLAP across tables, and a subject's profile id is
	// compared against the PROJECT's profile id for the same role, so the
	// comparison is only meaningful within one role.
	subject := subjectWith(identity.RoleArsitek, 42)
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{
		identity.RoleArsitek: 43,
	}}

	if Matches(project, subject, identity.RoleArsitek) {
		t.Fatal("a different architect matched")
	}
}

func TestItIsFalseForADifferentRole(t *testing.T) {
	// An architect with a profile must not be able to pass as the project's
	// contractor, even though the project HAS a contractor.
	subject := subjectWith(identity.RoleArsitek, 42)
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{
		identity.RoleKontraktor: 42,
	}}

	if Matches(project, subject, identity.RoleKontraktor) {
		t.Fatal("an architect matched as the contractor")
	}
}

func TestTheAssignedPmIsTheSameRule(t *testing.T) {
	subject := subjectWith(identity.RoleProjectManager, 831)
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{
		identity.RoleProjectManager: 831,
	}}

	if !IsAssignedPm(project, subject) {
		t.Fatal("the assigned PM did not match")
	}

	other := subjectWith(identity.RoleProjectManager, 832)
	if IsAssignedPm(project, other) {
		t.Fatal("a different PM matched")
	}
}

func TestTheOwnerIsNotTheAssignedPm(t *testing.T) {
	// The owner's authority and the PM's authority are DIFFERENT powers, and
	// a rule that conflates them lets the client drive the PM's decisions and
	// the PM drive the client's.
	owner := testSubject{userID: 1, roleType: "user", profiles: map[identity.Role]identity.ProfileID{}}
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{
		identity.RoleProjectManager: 831,
	}}

	if !IsOwnerOrAssignedPm(project, owner) {
		t.Fatal("the owner was not recognised")
	}

	subject := subjectWith(identity.RoleProjectManager, 831)
	if !IsOwnerOrAssignedPm(project, subject) {
		t.Fatal("the assigned PM was not recognised")
	}
}

func TestCanAccessIsTheOwnerOrTheHiredProfessional(t *testing.T) {
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{
		identity.RoleArsitek: 42,
	}}

	owner := testSubject{userID: 1, roleType: "user", profiles: map[identity.Role]identity.ProfileID{}}
	if !CanAccess(project, owner) {
		t.Fatal("the owner could not access the project")
	}

	hired := subjectWith(identity.RoleArsitek, 42)
	if !CanAccess(project, hired) {
		t.Fatal("the hired architect could not access the project")
	}

	stranger := subjectWith(identity.RoleKontraktor, 99)
	if CanAccess(project, stranger) {
		t.Fatal("a stranger could access the project")
	}
}

func TestANilSubjectMatchesNothing(t *testing.T) {
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{
		identity.RoleArsitek: 42,
	}}

	if Matches(project, nil, identity.RoleArsitek) {
		t.Fatal("a nil subject matched")
	}
	if CanAccess(project, nil) {
		t.Fatal("a nil subject could access the project")
	}
	if IsOwnerOrAssignedPm(project, nil) {
		t.Fatal("a nil subject had the owner's authority")
	}
}
