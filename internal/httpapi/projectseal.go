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

// SEAL DESIGN — the architect hands the package to the PM and owner.
//
// `POST /api/projects/{project}/seal-design` is the hired architect's
// action (Hire::matches, so a profiled-null architect cannot pass). It
// refuses while a required structural engineer is unhired, and while a
// hired structural/MEP/interior specialist has not uploaded their
// deliverables (their document category must exist). On success it
// stamps `design_handover_submitted_at`, clears the notes, logs
// `design_handover_submitted`, notifies the owner and the PM
// (`verification_required`), and answers the FULL resource.
//
// THE FULL LOAD is the widest project read in the port: every hired and
// bid relation with phones and ratings, documents with their uploader,
// comments, addendums, requirements, the termins with milestones, images
// and all seven counts. `fullSealLoad` carries it.

// fullSealLoad is loadFullProject() from ProjectPhaseController.
func fullSealLoad() projectLoad {
	return projectLoad{
		images:          true,
		milestones:      true,
		documents:       true,
		comments:        true,
		ownerPhone:      false,
		hiredPros:       true,
		engineers:       []string{"structural_engineer", "mep_engineer", "interior_engineer"},
		engineerPhones:  true,
		engineerRatings: true,
		pmBlock:         true,
		budgetSummary:   true,
		paymentTermins:  true,
		addendums:       true,
		requirements:    true,
		viewerBidRoles:  []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager", "structural", "mep"},
		unscopedBids:    true,
		countRoles:      bidCountRoles,
	}
}

// SealDesignHandler serves
// `POST /api/projects/{project}/seal-design`.
func SealDesignHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		rawProject := r.PathValue("project")
		if rawProject == "" {
			rawProject = projectPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(rawProject, 10, 64)
		if err != nil {
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
			slog.Error("seal-design: viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("seal-design: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("seal-design: parties", "error", err)
			serverError(w)
			return
		}

		if !authz.Matches(parties, subject, identity.RoleArsitek) {
			message(w, http.StatusForbidden, "Unauthorized. Only the hired architect can seal the design.")
			return
		}

		var requiresStructural bool
		var structuralID, mepID, interiorID *int64
		if err := pool.QueryRow(ctx, `SELECT COALESCE(requires_structural, false), structural_id, mep_id, selected_interior_id
			FROM projects WHERE id = $1`, projectID).Scan(&requiresStructural, &structuralID, &mepID, &interiorID); err != nil {
			slog.Error("seal-design: project", "error", err)
			serverError(w)
			return
		}

		if requiresStructural && (structuralID == nil || *structuralID == 0) {
			message(w, http.StatusUnprocessableEntity, "A Structural Engineer is legally required but has not been hired yet.")
			return
		}

		type gate struct {
			hired    *int64
			category string
			message  string
		}
		gates := []gate{
			{structuralID, "structural_calc", "Structural Engineer must upload their deliverables before you can request PM approval."},
			{mepID, "mep_layout", "MEP Engineer must upload their deliverables before you can request PM approval."},
			{interiorID, "interior_design", "Interior Designer must upload their deliverables before you can request PM approval."},
		}
		for _, g := range gates {
			if g.hired == nil || *g.hired == 0 {
				continue
			}
			var has bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_documents WHERE project_id = $1 AND category = $2)`,
				projectID, g.category).Scan(&has); err != nil {
				slog.Error("seal-design: docs", "error", err)
				serverError(w)
				return
			}
			if !has {
				message(w, http.StatusUnprocessableEntity, g.message)
				return
			}
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("seal-design: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET design_handover_submitted_at = date_trunc('second', now()),
			design_handover_notes = NULL, updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("seal-design: update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "design_handover_submitted",
			"Architect submitted design package for PM verification."); err != nil {
			slog.Error("seal-design: log", "error", err)
			serverError(w)
			return
		}

		if err := notifyReviewers(ctx, tx, projectID, "Design Handover",
			"The Architect has submitted the design package for your verification."); err != nil {
			slog.Error("seal-design: notify", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("seal-design: commit", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("seal-design: reload", "error", err)
			serverError(w)
			return
		}

		entry, err := projectResource(ctx, pool, fields, values, viewer, fullSealLoad(), nil)
		if err != nil {
			slog.Error("seal-design: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// notifyReviewers mirrors the controller helper: the owner and the
// assigned PM's USER id each get a verification_required notification.
func notifyReviewers(ctx context.Context, tx pgx.Tx, projectID int64, title, body string) error {
	var ownerID int64
	var pmProfile *int64
	if err := tx.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &pmProfile); err != nil {
		return err
	}

	reviewers := []int64{ownerID}
	if pmProfile != nil && *pmProfile != 0 {
		// `projects.pm_id` holds the PM's PROFILE id; a reviewer is a USER.
		var pmUser *int64
		_ = tx.QueryRow(ctx, `SELECT user_id FROM project_managers WHERE id = $1`, *pmProfile).Scan(&pmUser)
		if pmUser != nil && *pmUser != 0 && *pmUser != ownerID {
			reviewers = append(reviewers, *pmUser)
		}
	}

	for _, userID := range reviewers {
		if err := insertNotification(ctx, tx, userID, "verification_required", title, body,
			`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
			return err
		}
	}

	return nil
}
