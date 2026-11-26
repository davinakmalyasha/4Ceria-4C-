package authz

import (
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
)

// Closure for CanAccess's last branch: a non-owner whose role_type parses to
// no known role is refused rather than matched against a zero role.
func TestCanAccessRefusesAnUnparseableRole(t *testing.T) {
	project := testProject{owner: 1, hired: map[identity.Role]identity.ProfileID{
		identity.RoleArsitek: 42,
	}}

	// role_type "bogus" is not in the registry, so ParseRole fails.
	impostor := testSubject{userID: 99, roleType: "bogus", profiles: map[identity.Role]identity.ProfileID{}}
	if CanAccess(project, impostor) {
		t.Fatal("a subject with an unknown role_type could access the project")
	}

	// A nil project is refused even for a well-formed subject.
	hired := subjectWith(identity.RoleArsitek, 42)
	if CanAccess(nil, hired) {
		t.Fatal("a nil project was accessible")
	}
}
