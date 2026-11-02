package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TECHNICAL DESIGN REVIEW — submit, approve and revise a specialist's
// deliverables.
//
//   - submit-design: the specialist themselves (the structural/MEP/interior
//     engineer, the lead architect by Hire::matches, or the owner) moves
//     their documents from uploaded/revision_requested to under_review and
//     resets the phase's milestone review notes;
//   - approve-design: ONLY the owner or the assigned PM (it is the payment
//     trigger — it verifies the documents, approves the phase's milestones,
//     unlocks their payment stages and mirrors milestone files into the
//     document vault);
//   - revise-design: owner/PM only, marking the documents revision_requested
//     with the note, clearing the phase's approval stamp.
//
// All three answer a bare `{"message":…}` and gate on the caller's
// relationship to the project, so their failure paths are deterministic.

// designCategory maps the role to its document category.
func designCategory(role string) string {
	switch role {
	case "structural":
		return "structural_calc"
	case "mep":
		return "mep_layout"
	default:
		return "interior_design"
	}
}

// designApprovalColumn maps the role to the project stamp it writes.
func designApprovalColumn(role string) string {
	switch role {
	case "structural":
		return "structural_approved_at"
	case "mep":
		return "mep_approved_at"
	default:
		return "owner_interior_approved_at"
	}
}

// designSpecialistUser resolves the phase's specialist user.
func designSpecialistUser(ctx context.Context, q rowQuerier, projectID int64, role string) int64 {
	var profileID *int64
	column := "structural_id"
	switch role {
	case "structural":
		column = "structural_id"
	case "mep":
		column = "mep_id"
	default:
		column = "selected_interior_id"
	}
	if err := q.QueryRow(ctx, `SELECT `+column+` FROM projects WHERE id = $1`, projectID).Scan(&profileID); err != nil || profileID == nil || *profileID == 0 {
		return 0
	}
	table := "structural_engineers"
	switch role {
	case "structural":
		table = "structural_engineers"
	case "mep":
		table = "mep_engineers"
	default:
		table = "interior_profiles"
	}
	var userID *int64
	if err := q.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, *profileID).Scan(&userID); err != nil || userID == nil {
		return 0
	}
	return *userID
}

// rowQuerier is the read surface the pool and a transaction share.
type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// designSpecialistAuthorized mirrors checkAuth(..., 'specialist').
func designSpecialistAuthorized(ctx context.Context, q rowQuerier, viewer *projectViewer, ownerID int64, projectID int64, subject DbSubject, parties DbProject, role string) bool {
	if viewer.id == ownerID {
		return true
	}
	if specialist := designSpecialistUser(ctx, q, projectID, role); specialist != 0 && specialist == viewer.id {
		return true
	}
	if viewer.role == "arsitek" {
		if parsed, err := identity.ParseRole("arsitek"); err == nil && authz.Matches(parties, subject, parsed) {
			return true
		}
	}
	return false
}

// SubmitDesignHandler serves
// `POST /api/projects/{project}/documents/submit-design`.
func SubmitDesignHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
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
			slog.Error("submit-design: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadPlanningContext(ctx, pool, projectID)
		if err != nil {
			slog.Error("submit-design: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		role := validateDesignRole(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("submit-design: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("submit-design: parties", "error", err)
			serverError(w)
			return
		}

		if !designSpecialistAuthorized(ctx, pool, viewer, project.ownerID, projectID, subject, parties, role) {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("submit-design: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		category := designCategory(role)
		if _, err := tx.Exec(ctx, `UPDATE project_documents SET status = 'under_review', review_note = NULL,
			updated_at = date_trunc('second', now()) WHERE project_id = $1 AND category = $2 AND status::text IN ('uploaded','revision_requested')`,
			projectID, category); err != nil {
			slog.Error("submit-design: docs", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE project_milestones SET review_note = NULL, review_status = 'pending',
			updated_at = date_trunc('second', now()) WHERE project_id = $1 AND phase_context = $2`, projectID, role); err != nil {
			slog.Error("submit-design: milestones", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "design_submitted",
			"Submitted "+ucfirst(role)+" Design"); err != nil {
			slog.Error("submit-design: log", "error", err)
			serverError(w)
			return
		}

		body := viewerName(ctx, tx, viewer.id) + " has submitted the " + strings.ToUpper(role) + " design for review."
		pmUser := pmProfileUserID(ctx, tx, project.pmID)
		if pmUser != 0 {
			if err := insertNotification(ctx, tx, pmUser, "design_submitted", "Technical Design Submitted", body,
				`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
				slog.Error("submit-design: notify pm", "error", err)
				serverError(w)
				return
			}
		}
		if project.ownerID != viewer.id {
			if err := insertNotification(ctx, tx, project.ownerID, "design_submitted", "Technical Design Submitted", body,
				`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
				slog.Error("submit-design: notify owner", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("submit-design: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Submitted successfully")
	}
}

// ApproveDesignHandler serves
// `POST /api/projects/{project}/documents/approve-design`.
func ApproveDesignHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
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
			slog.Error("approve-design: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadPlanningContext(ctx, pool, projectID)
		if err != nil {
			slog.Error("approve-design: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		role := validateDesignRole(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		isOwner := viewer.id == project.ownerID
		isPM := verifyAssignedPM(viewer, project.pmID)
		if !isOwner && !isPM {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("approve-design: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		category := designCategory(role)
		if _, err := tx.Exec(ctx, `UPDATE project_documents SET status = 'verified', reviewed_at = date_trunc('second', now()),
			updated_at = date_trunc('second', now()) WHERE project_id = $1 AND category = $2`, projectID, category); err != nil {
			slog.Error("approve-design: docs", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE projects SET `+designApprovalColumn(role)+` = date_trunc('second', now()),
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("approve-design: project", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "design_approved",
			"Approved "+ucfirst(role)+" Design"); err != nil {
			slog.Error("approve-design: log", "error", err)
			serverError(w)
			return
		}

		if err := approveDesignMilestones(ctx, tx, pool, projectID, viewer.id, role); err != nil {
			slog.Error("approve-design: milestones", "error", err)
			serverError(w)
			return
		}

		target := designSpecialistUser(ctx, tx, projectID, role)
		if target != 0 {
			body := "Your " + strings.ToUpper(role) + " design has been approved and integrated into the project."
			if err := insertNotification(ctx, tx, target, "design_approved", "Technical Design Integrated", body,
				`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
				slog.Error("approve-design: notify", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("approve-design: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Approved successfully")
	}
}

// approveDesignMilestones approves the phase's logs, unlocks their payment
// stages, mirrors their files into the vault documents and logs both.
func approveDesignMilestones(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID, actorID int64, role string) error {
	rows, err := tx.Query(ctx, `SELECT id, title, type, phase_context, image, content::text
		FROM project_milestones WHERE project_id = $1 AND phase_context = $2 AND approval_status::text <> 'approved' ORDER BY id`,
		projectID, role)
	if err != nil {
		return err
	}

	type milestone struct {
		id      int64
		title   string
		mtype   *string
		phase   *string
		image   *string
		content []byte
	}
	list := make([]milestone, 0)
	for rows.Next() {
		var m milestone
		if err := rows.Scan(&m.id, &m.title, &m.mtype, &m.phase, &m.image, &m.content); err != nil {
			rows.Close()
			return err
		}
		list = append(list, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(list) == 0 {
		return nil
	}

	ids := make([]int64, 0, len(list))
	for _, m := range list {
		ids = append(ids, m.id)
	}

	if _, err := tx.Exec(ctx, `UPDATE project_milestones SET is_completed = true, approval_status = 'approved',
		pm_verified_at = date_trunc('second', now()), updated_at = date_trunc('second', now())
		WHERE project_id = $1 AND id = ANY($2)`, projectID, ids); err != nil {
		return err
	}

	// Unlock the linked payment stages and log each pairing.
	terminRows, err := tx.Query(ctx, `SELECT id, COALESCE(label,''), milestone_id FROM project_payment_termins
		WHERE milestone_id = ANY($1) AND status::text IN ('locked','pending') ORDER BY id`, ids)
	if err != nil {
		return err
	}
	type termin struct {
		id          int64
		label       string
		milestoneID int64
	}
	termins := make([]termin, 0)
	for terminRows.Next() {
		var t termin
		if err := terminRows.Scan(&t.id, &t.label, &t.milestoneID); err != nil {
			terminRows.Close()
			return err
		}
		termins = append(termins, t)
	}
	terminRows.Close()
	if err := terminRows.Err(); err != nil {
		return err
	}

	if len(termins) > 0 {
		tids := make([]int64, 0, len(termins))
		for _, t := range termins {
			tids = append(tids, t.id)
		}
		if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET status = 'pending',
			updated_at = date_trunc('second', now()) WHERE id = ANY($1)`, tids); err != nil {
			return err
		}

		for _, m := range list {
			for _, t := range termins {
				if t.milestoneID != m.id {
					continue
				}
				if err := insertActivityLog(ctx, tx, projectID, actorID, "payment_triggered",
					"Progress Verified: '"+m.title+"' via Design Integration Approval. Payment Termin '"+t.label+"' is now unlocked and awaiting owner approval."); err != nil {
					return err
				}
			}
		}
	}

	// Mirror milestone files into the vault documents as verified rows.
	for _, m := range list {
		files := milestoneFiles(m.image, m.content)
		if len(files) == 0 {
			continue
		}
		fileNames := milestoneFileNames(m.content)
		milestoneCategory := "milestone_attachment"
		if m.phase != nil && *m.phase == "design" {
			milestoneCategory = "blueprint"
		} else if m.mtype != nil && *m.mtype != "" {
			milestoneCategory = *m.mtype
		}

		for _, filePath := range files {
			var exists bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_documents WHERE project_id = $1 AND file_path = $2)`,
				projectID, filePath).Scan(&exists); err != nil {
				return err
			}

			fileName := m.title + " - " + path.Base(filePath)
			if custom, ok := fileNames[filePath]; ok && custom != "" {
				fileName = custom
			}
			ext := strings.TrimPrefix(path.Ext(filePath), ".")
			if exists {
				if _, err := tx.Exec(ctx, `UPDATE project_documents SET uploader_id = $3, file_name = $4, file_type = $5,
					category = $6, status = 'verified', version_label = $7, target_role = $8,
					updated_at = date_trunc('second', now()) WHERE project_id = $1 AND file_path = $2`,
					projectID, filePath, actorID, fileName, ext, milestoneCategory, m.title, role); err != nil {
					return err
				}
				continue
			}
			if _, err := tx.Exec(ctx, `INSERT INTO project_documents
				(project_id, uploader_id, file_name, file_path, file_type, category, status, version_label, target_role, version, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, 'verified', $7, $8, 1, date_trunc('second', now()), date_trunc('second', now()))`,
				projectID, actorID, fileName, filePath, ext, milestoneCategory, m.title, role); err != nil {
				return err
			}
		}
	}

	for _, m := range list {
		if err := insertActivityLog(ctx, tx, projectID, actorID, "milestone_approved",
			"Technical Log '"+m.title+"' automatically verified on Design Integration Approval."); err != nil {
			return err
		}
	}

	return nil
}

// milestoneFiles lists a milestone's image plus its gallery entries.
func milestoneFiles(image *string, content []byte) []string {
	out := make([]string, 0)
	if image != nil && *image != "" {
		out = append(out, *image)
	}
	if len(content) == 0 {
		return uniqueStrings(out)
	}
	decoded := decodeJSONValue(string(content))
	obj, ok := decoded.(map[string]any)
	if !ok {
		return uniqueStrings(out)
	}
	gallery, ok := obj["gallery"].([]any)
	if !ok {
		return uniqueStrings(out)
	}
	for _, item := range gallery {
		if s, ok := item.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return uniqueStrings(out)
}

// milestoneFileNames reads content.file_names, a path → label map.
func milestoneFileNames(content []byte) map[string]string {
	out := map[string]string{}
	if len(content) == 0 {
		return out
	}
	decoded := decodeJSONValue(string(content))
	obj, ok := decoded.(map[string]any)
	if !ok {
		return out
	}
	names, ok := obj["file_names"].(map[string]any)
	if !ok {
		return out
	}
	for k, v := range names {
		if s, ok := v.(string); ok {
			out[k] = s
		}
	}
	return out
}

// uniqueStrings de-duplicates while keeping first-seen order.
func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, v := range values {
		if seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

// ReviseDesignHandler serves
// `POST /api/projects/{project}/documents/revise-design`.
func ReviseDesignHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
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
			slog.Error("revise-design: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadPlanningContext(ctx, pool, projectID)
		if err != nil {
			slog.Error("revise-design: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		role, note := validateDesignRevision(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		isOwner := viewer.id == project.ownerID
		isPM := verifyAssignedPM(viewer, project.pmID)
		if !isOwner && !isPM {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("revise-design: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		category := designCategory(role)
		if _, err := tx.Exec(ctx, `UPDATE project_documents SET status = 'revision_requested', review_note = $3,
			reviewed_at = date_trunc('second', now()), updated_at = date_trunc('second', now())
			WHERE project_id = $1 AND category = $2`, projectID, category, note); err != nil {
			slog.Error("revise-design: docs", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE projects SET `+designApprovalColumn(role)+` = NULL,
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("revise-design: project", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "design_revision_requested",
			"Revision Requested: "+note); err != nil {
			slog.Error("revise-design: log", "error", err)
			serverError(w)
			return
		}

		target := designSpecialistUser(ctx, tx, projectID, role)
		if target != 0 {
			body := "A revision has been requested for your " + strings.ToUpper(role) + " design: " + note
			if err := insertNotification(ctx, tx, target, "design_revision_requested", "Revision Requested for Design", body,
				`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
				slog.Error("revise-design: notify", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("revise-design: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Revision requested successfully")
	}
}

// validateDesignRole enforces role_type required|in:structural,mep,interior.
func validateDesignRole(fields map[string]any, failures *errorBag) string {
	raw, present := fields["role_type"]
	if !present || raw == nil {
		failures.add("role_type", "The role type field is required.")
		return ""
	}
	s, isStr := raw.(string)
	if !isStr {
		failures.add("role_type", "The selected role type is invalid.")
		return ""
	}
	if s == "" {
		failures.add("role_type", "The role type field is required.")
		return ""
	}
	if s != "structural" && s != "mep" && s != "interior" {
		failures.add("role_type", "The selected role type is invalid.")
		return ""
	}
	return s
}

// validateDesignRevision adds note required|string|max:1000.
func validateDesignRevision(fields map[string]any, failures *errorBag) (string, string) {
	role := validateDesignRole(fields, failures)

	raw, present := fields["note"]
	if !present || raw == nil {
		failures.add("note", "The note field is required.")
		return role, ""
	}
	s, isStr := raw.(string)
	if !isStr {
		failures.add("note", "The note field must be a string.")
		return role, ""
	}
	if s == "" {
		failures.add("note", "The note field is required.")
		return role, ""
	}
	if len([]rune(s)) > 1000 {
		failures.add("note", "The note field must not be greater than 1000 characters.")
		return role, ""
	}
	return role, s
}

// viewerName reads the caller's display name inside a transaction.
func viewerName(ctx context.Context, tx pgx.Tx, userID int64) string {
	var name string
	_ = tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, userID).Scan(&name)
	return name
}

// pmProfileUserID resolves the assigned PM's user id from the PROFILE id.
func pmProfileUserID(ctx context.Context, q rowQuerier, pmProfile *int64) int64 {
	if pmProfile == nil || *pmProfile == 0 {
		return 0
	}
	var userID *int64
	if err := q.QueryRow(ctx, `SELECT user_id FROM project_managers WHERE id = $1`, *pmProfile).Scan(&userID); err != nil || userID == nil {
		return 0
	}
	return *userID
}
