package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DbFreezer is the termination-freeze gate against PostgreSQL.
//
// It mirrors `FreezeWorkspaceIfTerminationPending` exactly: the freeze applies
// only when the route names a project — the segment after `projects` — AND
// that project's status is `termination_pending`, AND the path is not a
// mutual-termination action. Anything else passes, including every route that
// has no project at all (like the entire `/me` surface).
type DbFreezer struct {
	pool *pgxpool.Pool
}

// NewDbFreezer builds the gate over a PostgreSQL pool.
func NewDbFreezer(pool *pgxpool.Pool) *DbFreezer {
	return &DbFreezer{pool: pool}
}

// Frozen reports whether the request's project is frozen for a mutation.
func (f *DbFreezer) Frozen(r *http.Request) (bool, error) {
	segments := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	var projectID string

	for i, segment := range segments {
		if segment == "projects" && i+1 < len(segments) {
			projectID = segments[i+1]
			break
		}
	}

	if projectID == "" {
		return false, nil
	}

	// The mutual-termination respond/escalate actions pass through the freeze.
	if strings.Contains(r.URL.Path, "mutual-termination") {
		return false, nil
	}

	var status string

	err := f.pool.QueryRow(r.Context(),
		`SELECT status::text FROM projects WHERE id = $1`, projectID,
	).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		// An unknown project is the router's business (404), not the gate's.
		return false, nil
	}
	if err != nil {
		return false, err
	}

	return status == "termination_pending", nil
}
