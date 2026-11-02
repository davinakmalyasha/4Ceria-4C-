package httpapi

import (
	"context"

	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PARTICIPATION
// ------------
// The project routes guard themselves with "is this caller a participant of
// this project": the owner, or the hired professional for any of the seven
// roles. The legacy spelling is `DisputeService::authorizeParticipant` (and
// behind it `App\Support\Hire`), and the Go spelling is `authz.Matches` —
// the package that already pins the null-safe rule and the profile-id
// spaces. This file is the adapter between the database rows and those
// interfaces: the FIRST production use of the authz package.
//
// A caller who is neither reads 403 with the controller's sentence, not
// with the policy shape: `abort(403, 'Unauthorized. Only project
// participants can view disputes.')` renders `{"message": "..."}`.

// DbSubject is a caller loaded for the participation check.
type DbSubject struct {
	id       identity.UserID
	role     string
	profiles map[identity.Role]identity.ProfileID
}

// UserID is the person.
func (s DbSubject) UserID() identity.UserID { return s.id }

// RoleType is the person's role_type.
func (s DbSubject) RoleType() string { return s.role }

// ProfileIDFor is the person's profile for a role, or nil.
func (s DbSubject) ProfileIDFor(role identity.Role) *identity.ProfileID {
	if s.profiles == nil {
		return nil
	}
	if id, ok := s.profiles[role]; ok && id.Valid() {
		dup := id
		return &dup
	}
	return nil
}

// DbProject is a project's hired-professional columns loaded for the check.
type DbProject struct {
	owner identity.UserID
	hired map[identity.Role]identity.ProfileID
}

// HiredProfileID is the hired profile for a role, or nil.
func (p DbProject) HiredProfileID(role identity.Role) *identity.ProfileID {
	if id, ok := p.hired[role]; ok && id.Valid() {
		dup := id
		return &dup
	}
	return nil
}

// OwnerID is the project's owner.
func (p DbProject) OwnerID() identity.UserID { return p.owner }

// loadSubject reads a user and their seven possible profile ids.
func loadSubject(ctx context.Context, pool *pgxpool.Pool, userID int64) (DbSubject, error) {
	subject := DbSubject{
		id:       identity.UserIDOf(userID),
		profiles: map[identity.Role]identity.ProfileID{},
	}

	if err := pool.QueryRow(ctx,
		`SELECT COALESCE(role_type::text, '') FROM users WHERE id = $1`, userID,
	).Scan(&subject.role); err != nil {
		return subject, err
	}

	for _, role := range identity.Roles() {
		table, ok := identity.ProfileTableFor(role)
		if !ok {
			continue
		}

		var profileID *int64
		if err := pool.QueryRow(ctx,
			`SELECT id FROM `+string(table)+` WHERE user_id = $1 LIMIT 1`, userID,
		).Scan(&profileID); err != nil || profileID == nil || *profileID <= 0 {
			continue
		}

		subject.profiles[role] = identity.ProfileIDOf(*profileID)
	}

	return subject, nil
}

// loadProjectParties reads a project's owner and hired-professional columns.
func loadProjectParties(ctx context.Context, pool *pgxpool.Pool, projectID int64) (DbProject, error) {
	project := DbProject{hired: map[identity.Role]identity.ProfileID{}}

	var (
		ownerID                                int64
		arsitek, kontraktor, notaris, interior *int64
		structural, mep, pm                    *int64
	)
	if err := pool.QueryRow(ctx, `
		SELECT user_id, selected_arsitek_id, selected_kontraktor_id,
		       selected_notaris_id, selected_interior_id,
		       structural_id, mep_id, pm_id
		  FROM projects WHERE id = $1
	`, projectID).Scan(&ownerID, &arsitek, &kontraktor, &notaris, &interior,
		&structural, &mep, &pm); err != nil {
		return project, err
	}

	project.owner = identity.UserIDOf(ownerID)

	byRole := map[identity.Role]*int64{
		identity.RoleArsitek:        arsitek,
		identity.RoleKontraktor:     kontraktor,
		identity.RoleNotaris:        notaris,
		identity.RoleInterior:       interior,
		identity.RoleStructural:     structural,
		identity.RoleMep:            mep,
		identity.RoleProjectManager: pm,
	}

	for role, column := range byRole {
		if column != nil && *column > 0 {
			project.hired[role] = identity.ProfileIDOf(*column)
		}
	}

	return project, nil
}

// isParticipant reports whether the subject owns the project or is hired on
// it in any role — `authorizeParticipant` without the abort.
func isParticipant(project DbProject, subject DbSubject) bool {
	if project.OwnerID() == subject.UserID() && subject.UserID().Valid() {
		return true
	}

	for _, role := range identity.Roles() {
		if authz.Matches(project, subject, role) {
			return true
		}
	}

	return false
}

// isAdminUser reports the service's `isAdmin`: role_type admin or the Spatie
// admin role. The gateway's `requireAdmin` gate only reads role_type; the
// service check reads both, so the handler reads both too.
func isAdminUser(ctx context.Context, pool *pgxpool.Pool, userID int64, role string) (bool, error) {
	if role == "admin" {
		return true, nil
	}

	var count int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM model_has_roles m
		 JOIN roles r ON r.id = m.role_id
		WHERE r.name = 'admin' AND m.model_type = 'App\Models\User' AND m.model_id = $1
	`, userID).Scan(&count); err != nil {
		return false, err
	}

	return count > 0, nil
}
