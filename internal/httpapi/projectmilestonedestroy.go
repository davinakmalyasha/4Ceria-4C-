package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MILESTONE DELETE — the only row verb that neither mints money nor
// rewrites content, so it ports on its own.
//
// Order of operations mirrors the controller: the binding is checked
// first (a milestone from another project is the plain `Not found.`),
// then `canModifyMilestone`, then the phase-handover lock (skipped for
// the owner and PM), then the two 400 guards (approved row, paid linked
// stage), then the gallery files are removed from the public disk before
// the row is deleted and `milestone_deleted` is logged.

// canModifyMilestone mirrors the controller helper.
func canModifyMilestone(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64, byName map[string]any) bool {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		return false
	}
	project := projectColumnsByName(fields, values)
	ownerID, _ := project["user_id"].(int64)
	if viewer.id == ownerID {
		return true
	}
	var pmProfile *int64
	if id, ok := project["pm_id"].(int64); ok {
		pmProfile = &id
	}
	if verifyAssignedPM(viewer, pmProfile) {
		return true
	}

	hasStructuralOrMep := intPtrDeref(byName["structural_id"]) != 0 || intPtrDeref(byName["mep_id"]) != 0
	if viewer.role == "arsitek" || viewer.role == "kontraktor" {
		subject, serr := loadSubject(ctx, pool, viewer.id)
		parties, perr := loadProjectParties(ctx, pool, projectID)
		if serr == nil && perr == nil && authzMatchesRole(parties, subject, viewer.role) && hasStructuralOrMep {
			return true
		}
	}

	ownColumns := map[string]string{
		"arsitek_id":    "arsitek",
		"kontraktor_id": "kontraktor",
		"notaris_id":    "notaris",
		"interior_id":   "interior",
		"pm_id":         "project_manager",
		"structural_id": "structural",
		"mep_id":        "mep",
	}
	for column, role := range ownColumns {
		owner := intPtrDeref(byName[column])
		if owner == 0 {
			continue
		}
		if own, ok := viewer.profiles[role]; ok && own == owner {
			return true
		}
	}

	// An ACTIVE sub-professional may modify milestones of their own sub_role.
	var subRole *string
	if err := pool.QueryRow(ctx, `SELECT sub_role FROM project_sub_professionals
		WHERE project_id = $1 AND user_id = $2 AND status::text = 'active' LIMIT 1`,
		projectID, viewer.id).Scan(&subRole); err == nil && subRole != nil {
		if mtype, ok := byName["type"].(string); ok && mtype == *subRole {
			return true
		}
	}

	return false
}

// milestoneHandoverLocked reports the phase's handover-under-review lock.
func milestoneHandoverLocked(byName map[string]any, project map[string]any) (bool, string) {
	phase, _ := byName["phase_context"].(string)
	switch phase {
	case "legal":
		if value, ok := project["legal_handover_submitted_at"]; ok && value != nil {
			return true, "Cannot delete milestones when phase handover is under review."
		}
	case "design":
		if value, ok := project["design_handover_submitted_at"]; ok && value != nil {
			return true, "Cannot delete milestones when phase handover is under review."
		}
	case "build", "construction":
		if value, ok := project["construction_handover_submitted_at"]; ok && value != nil {
			return true, "Cannot delete milestones when phase handover is under review."
		}
	case "interior":
		if value, ok := project["interior_handover_submitted_at"]; ok && value != nil {
			return true, "Cannot delete milestones when phase handover is under review."
		}
	}
	return false, ""
}

// DestroyMilestoneHandler serves
// `DELETE /api/projects/{project}/milestones/{milestone}`.
func DestroyMilestoneHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("milestone")
		if rawID == "" {
			rawID = lastPathSegment(r.URL.Path)
		}
		milestoneID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectMilestone`, rawID)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("milestone-destroy: viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := loadMilestoneRow(ctx, pool, projectID, milestoneID)
		if err != nil {
			slog.Error("milestone-destroy: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		if !canModifyMilestone(ctx, pool, viewer, projectID, byName) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("milestone-destroy: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(fields, values)
		ownerID, _ := project["user_id"].(int64)
		var pmProfile *int64
		if id, ok := project["pm_id"].(int64); ok {
			pmProfile = &id
		}
		isPrivileged := viewer.id == ownerID || verifyAssignedPM(viewer, pmProfile)

		if !isPrivileged {
			if locked, msg := milestoneHandoverLocked(byName, project); locked {
				message(w, http.StatusForbidden, msg)
				return
			}
		}

		if status, _ := byName["approval_status"].(string); status == "approved" {
			message(w, http.StatusBadRequest, "Cannot delete an approved milestone.")
			return
		}

		// `linkedTermin` is a hasOne with no ordering, so the oracle looks at
		// exactly ONE row: the first the database returns (PK order here).
		// A later paid stage on the same milestone does NOT block the delete.
		var linkedStatus *string
		_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE milestone_id = $1 ORDER BY id LIMIT 1`,
			milestoneID).Scan(&linkedStatus)
		if linkedStatus != nil && *linkedStatus == "paid" {
			message(w, http.StatusBadRequest, "Cannot delete a step linked to a PAID payment.")
			return
		}

		for _, file := range milestoneGalleryFiles(byName) {
			_ = removePublicFile(file)
		}

		if _, err := pool.Exec(ctx, `DELETE FROM project_milestones WHERE id = $1`, milestoneID); err != nil {
			slog.Error("milestone-destroy: delete", "error", err)
			serverError(w)
			return
		}

		title, _ := byName["title"].(string)
		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "milestone_deleted",
			"Deleted: "+title); err != nil {
			slog.Error("milestone-destroy: log", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Milestone deleted successfully.")
	}
}

// loadMilestoneRow reads one milestone bound to the project.
func loadMilestoneRow(ctx context.Context, pool *pgxpool.Pool, projectID, milestoneID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+milestonesColumns+` FROM project_milestones WHERE id = $1 AND project_id = $2`, milestoneID, projectID)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, false, rows.Err()
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, false, err
	}
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}
	return byName, true, rows.Err()
}

// milestoneGalleryFiles reads content.gallery's stored paths.
func milestoneGalleryFiles(byName map[string]any) []string {
	raw, ok := byName["content"]
	if !ok || raw == nil {
		return nil
	}
	var text string
	switch typed := raw.(type) {
	case string:
		text = typed
	case []byte:
		text = string(typed)
	default:
		return nil
	}
	if text == "" {
		return nil
	}
	decoded := decodeJSONValue(text)
	obj, ok := decoded.(map[string]any)
	if !ok {
		return nil
	}
	gallery, ok := obj["gallery"].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(gallery))
	for _, item := range gallery {
		if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

// removePublicFile deletes a public-disk file, ignoring misses.
func removePublicFile(rel string) error {
	return removeVaultFile(rel)
}

// jsonMessage is the bare message envelope used by these verbs.
func jsonMessage(w http.ResponseWriter, status int, text string) {
	body := jsonphp.NewObject()
	body.Set("message", text)
	writeJSON(w, status, body)
}
