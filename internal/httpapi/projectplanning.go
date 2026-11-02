package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE PLANNING MACHINE — draft → proposed → pm_verified → approved.
//
//   - submit-planning: the hired architect proposes, bumping
//     planning_iteration and stamping planning_submitted_at;
//   - verify-planning-pm: the assigned PM accepts the proposal
//     (proposed only), optionally saving audit notes/attachments;
//   - approve-planning: the OWNER approves. With a PM assigned the plan
//     must already be pm_verified; approving a design brief is NOT a
//     payment event (design_payment_verified_at stays untouched — the
//     endpoint that writes it is verify-payment);
//   - reject-planning: the PM (from proposed) or the owner (from
//     pm_verified, or proposed when no PM exists) sends it back to draft,
//     clearing the PM verification stamp and logging the reason.
//   - update-planning-audit: the PM's draft notes/attachments, saveable
//     between verifications.
//
// All five answer the LEAN ProjectResource (`new ProjectResource($project)`
// on an unloaded model), so `projectLoad{budgetSummary: true}` renders
// them. Attachment uploads are validated and stored on the public disk
// under projects/{id}/pm_audits (at most three), exactly like the oracle.

// planningLoad is the lean resource these five verbs answer with.
func planningLoad() projectLoad { return projectLoad{budgetSummary: true} }

// leanProjectResponse renders the lean resource for the caller.
func leanProjectResponse(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter, projectID int64, viewer *projectViewer) {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		slog.Error("planning: reload", "error", err)
		serverError(w)
		return
	}

	entry, err := projectResource(ctx, pool, fields, values, viewer, planningLoad(), nil)
	if err != nil {
		slog.Error("planning: render", "error", err)
		serverError(w)
		return
	}

	payload := jsonphp.NewObject()
	payload.Set("data", entry)
	writeJSON(w, http.StatusOK, payload)
}

// planningContext reads the gate columns.
type planningContext struct {
	ownerID   int64
	pmID      *int64
	status    string
	iteration int64
	notes     *string
	attach    []byte
	title     string
}

func loadPlanningContext(ctx context.Context, pool *pgxpool.Pool, projectID int64) (planningContext, bool, error) {
	var out planningContext
	var attach []byte
	err := pool.QueryRow(ctx, `SELECT user_id, pm_id, planning_status::text, planning_iteration,
		architect_notes, pm_audit_attachments::text, title FROM projects WHERE id = $1`, projectID).
		Scan(&out.ownerID, &out.pmID, &out.status, &out.iteration, &out.notes, &attach, &out.title)
	if err != nil {
		if isNoRows(err) {
			return out, false, nil
		}
		return out, false, err
	}
	out.attach = attach
	return out, true, nil
}

// SubmitPlanningHandler serves
// `POST /api/projects/{project}/submit-planning`.
func SubmitPlanningHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("planning-submit: viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("planning-submit: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("planning-submit: parties", "error", err)
			serverError(w)
			return
		}

		if !authzMatchesRole(parties, subject, "arsitek") {
			message(w, http.StatusForbidden, "Only the assigned architect can propose a design brief.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		var notes any
		if s, ok := formFields["architect_notes"].(string); ok && s != "" {
			notes = s
		}

		if _, err := pool.Exec(ctx, `UPDATE projects SET planning_iteration = planning_iteration + 1,
			planning_status = 'proposed', planning_submitted_at = date_trunc('second', now()),
			architect_notes = $2, updated_at = date_trunc('second', now()) WHERE id = $1`, projectID, notes); err != nil {
			slog.Error("planning-submit: update", "error", err)
			serverError(w)
			return
		}

		leanProjectResponse(ctx, pool, w, projectID, viewer)
	}
}

// ApprovePlanningHandler serves
// `POST /api/projects/{project}/approve-planning`.
func ApprovePlanningHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("planning-approve: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadPlanningContext(ctx, pool, projectID)
		if err != nil {
			slog.Error("planning-approve: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		if viewer.id != project.ownerID {
			message(w, http.StatusForbidden, "Only the project owner can approve the design brief.")
			return
		}

		if project.pmID != nil && *project.pmID != 0 && project.status != "pm_verified" {
			message(w, http.StatusUnprocessableEntity, "The project manager must verify the technical plan before you can approve.")
			return
		}

		if project.status != "proposed" && project.status != "pm_verified" {
			message(w, http.StatusUnprocessableEntity, "No active planning proposal found to approve.")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'approved',
			planning_approved_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("planning-approve: update", "error", err)
			serverError(w)
			return
		}

		leanProjectResponse(ctx, pool, w, projectID, viewer)
	}
}

// VerifyPlanningPMHandler serves
// `POST /api/projects/{project}/verify-planning-pm`.
func VerifyPlanningPMHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("planning-pm: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadPlanningContext(ctx, pool, projectID)
		if err != nil {
			slog.Error("planning-pm: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		if !verifyAssignedPM(viewer, project.pmID) {
			message(w, http.StatusForbidden, "Only the assigned project manager can verify this plan.")
			return
		}

		if project.status != "proposed" {
			message(w, http.StatusUnprocessableEntity, "No active planning proposal found for verification.")
			return
		}

		formFields, formFiles, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
			formFiles = map[string]*uploadedFile{}
		}

		notes, attach, ok := planningAuditUpdate(ctx, pool, w, project, formFields, formFiles)
		if !ok {
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE projects SET planning_status = 'pm_verified',
			planning_pm_verified_at = date_trunc('second', now()), pm_audit_notes = $2,
			pm_audit_attachments = $3::jsonb, updated_at = date_trunc('second', now()) WHERE id = $1`,
			projectID, notes, attach); err != nil {
			slog.Error("planning-pm: update", "error", err)
			serverError(w)
			return
		}

		leanProjectResponse(ctx, pool, w, projectID, viewer)
	}
}

// UpdatePlanningAuditHandler serves
// `POST /api/projects/{project}/update-planning-audit`.
func UpdatePlanningAuditHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("planning-audit: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadPlanningContext(ctx, pool, projectID)
		if err != nil {
			slog.Error("planning-audit: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		if !verifyAssignedPM(viewer, project.pmID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		formFields, formFiles, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
			formFiles = map[string]*uploadedFile{}
		}

		notes, attach, ok := planningAuditUpdate(ctx, pool, w, project, formFields, formFiles)
		if !ok {
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE projects SET pm_audit_notes = $2,
			pm_audit_attachments = $3::jsonb, updated_at = date_trunc('second', now()) WHERE id = $1`,
			projectID, notes, attach); err != nil {
			slog.Error("planning-audit: update", "error", err)
			serverError(w)
			return
		}

		leanProjectResponse(ctx, pool, w, projectID, viewer)
	}
}

// rejectPlanningHandler serves `POST /api/projects/{project}/reject-planning`.
func RejectPlanningHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("planning-reject: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadPlanningContext(ctx, pool, projectID)
		if err != nil {
			slog.Error("planning-reject: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		isPM := verifyAssignedPM(viewer, project.pmID)
		isOwner := viewer.id == project.ownerID
		if !isPM && !isOwner {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		if isPM && project.status != "proposed" {
			message(w, http.StatusUnprocessableEntity, "No active proposal to reject.")
			return
		}
		if isOwner && project.status != "pm_verified" {
			valid := "proposed"
			if project.pmID != nil && *project.pmID != 0 {
				valid = "pm_verified"
			}
			if project.status != valid {
				message(w, http.StatusUnprocessableEntity, "No active proposal to reject.")
				return
			}
		}

		notes := project.notes
		attachJSON := string(project.attach)
		if isPM {
			formFields, formFiles, ferr := requestFields(r)
			if ferr != nil {
				formFields = map[string]any{}
				formFiles = map[string]*uploadedFile{}
			}
			var ok bool
			notes, attachJSON, ok = planningAuditUpdate(ctx, pool, w, project, formFields, formFiles)
			if !ok {
				return
			}
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("planning-reject: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET planning_status = 'draft',
			planning_pm_verified_at = NULL, pm_audit_notes = $2, pm_audit_attachments = $3::jsonb,
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID, notes, attachJSON); err != nil {
			slog.Error("planning-reject: update", "error", err)
			serverError(w)
			return
		}

		reason := "No reason provided"
		if notes != nil && *notes != "" {
			reason = *notes
		}
		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "planning_rejected",
			"Planning rejected by "+viewer.role+". Reason: "+reason); err != nil {
			slog.Error("planning-reject: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("planning-reject: commit", "error", err)
			serverError(w)
			return
		}

		leanProjectResponse(ctx, pool, w, projectID, viewer)
	}
}

// planningAuditUpdate applies the PM's optional notes and attachments.
// It returns the notes to persist (nil keeps the stored value) and the
// JSON array of attachment paths.
func planningAuditUpdate(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter, project planningContext, fields map[string]any, files map[string]*uploadedFile) (*string, string, bool) {
	notes := project.notes
	if raw, present := fields["pm_audit_notes"]; present && raw != nil {
		if s, isStr := raw.(string); isStr {
			dup := s
			notes = &dup
		}
	}

	existing := decodeJSONArray(project.attach)

	if file, ok := files["attachments[]"]; ok && file != nil {
		_ = file
	}
	if file, ok := files["attachments"]; ok && file != nil && len(existing) < 3 {
		contents, err := readUploadedFileByName(files, "attachments")
		if err != nil {
			slog.Error("planning: read attachment", "error", err)
			serverError(w)
			return notes, "", false
		}
		stored, err := storeVaultFile("projects/"+strconv.FormatInt(project.ownerID, 10)+"/pm_audits", file.filename, contents)
		if err != nil {
			slog.Error("planning: store attachment", "error", err)
			serverError(w)
			return notes, "", false
		}
		existing = append(existing, stored)
	}

	encoded, err := jsonphp.Marshal(existing)
	if err != nil {
		slog.Error("planning: encode attachments", "error", err)
		serverError(w)
		return notes, "", false
	}

	return notes, string(encoded), true
}

// decodeJSONArray reads a jsonb array into strings.
func decodeJSONArray(raw []byte) []any {
	if len(raw) == 0 {
		return []any{}
	}
	decoded := decodeJSONValue(string(raw))
	if list, ok := decoded.([]any); ok {
		return list
	}
	return []any{}
}

// readUploadedFileByName reads a stored multipart file's bytes.
func readUploadedFileByName(files map[string]*uploadedFile, name string) ([]byte, error) {
	return files[name].data, nil
}

// authzMatchesRole is the local spelling of Hire::matches for a role.
func authzMatchesRole(project DbProject, subject DbSubject, role string) bool {
	parsed, err := identity.ParseRole(role)
	if err != nil {
		return false
	}
	return authz.Matches(project, subject, parsed)
}

// pgxTx is a thin alias so helper signatures read like the service.
type pgxTx = pgx.Tx
