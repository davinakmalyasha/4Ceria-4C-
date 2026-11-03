package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT HANDOVER — the last two verbs of the lifecycle.
//
//   - initiate-walkthrough: the assigned PM (role AND hire) flips the
//     project to `completed_build`, stamps final_walkthrough_at and sets
//     walkthrough_status to in_progress.
//   - owner-accept: the OWNER only. Refuses while any snag is not
//     `accepted`, then runs finalizeProject: new builds need a verified
//     SLF, needed_phases must equal completed_phases (both sorted), and
//     the project is completed with the warranty window (180 days by
//     default). An optional rating is stored against the hired architect.
//
// The accept answer is the LEAN resource plus exactly two trailing keys:
// `review_arsitek` (the first arsitek_ratings row for the PROJECT) and
// `project_manager` — nothing else is loaded.

// handoverWarrantyDays is config('escrow.warranty_days').
const handoverWarrantyDays = 180

// InitiateWalkthroughHandler serves
// `POST /api/projects/{project}/initiate-walkthrough`.
func InitiateWalkthroughHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("walkthrough: viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("walkthrough: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("walkthrough: parties", "error", err)
			serverError(w)
			return
		}

		// `isHiredProfessional` is Hire::matches for the user's own role, so a
		// PM must be the project's assigned PM.
		if viewer.role != "project_manager" || !authzMatchesRole(parties, subject, "project_manager") {
			message(w, http.StatusForbidden, "Only the assigned PM can initiate the final walkthrough.")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE projects SET status = 'completed_build',
			final_walkthrough_at = date_trunc('second', now()), walkthrough_status = 'in_progress',
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("walkthrough: update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "walkthrough_initiated",
			"PM initiated the final project walkthrough."); err != nil {
			slog.Error("walkthrough: log", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Final walkthrough initiated.")
	}
}

// OwnerAcceptProjectHandler serves `POST /api/projects/{project}/owner-accept`.
func OwnerAcceptProjectHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("owner-accept: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("owner-accept: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(fields, values)
		ownerID, _ := project["user_id"].(int64)
		if viewer.id != ownerID {
			message(w, http.StatusForbidden, "Only the project Owner can accept the building.")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		rating, review, ratingSet := validateOwnerAccept(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("owner-accept: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var unresolved int64
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM project_snag_items WHERE project_id = $1 AND status::text <> 'accepted'`,
			projectID).Scan(&unresolved); err != nil {
			slog.Error("owner-accept: snags", "error", err)
			serverError(w)
			return
		}
		if unresolved > 0 {
			message(w, http.StatusUnprocessableEntity, "Cannot accept project with unaccepted snag items.")
			return
		}

		if !handoverFinalize(ctx, tx, projectID, project, viewer.id) {
			message(w, http.StatusInternalServerError, "Failed to finalize project. Check SLF and Phase requirements.")
			return
		}

		if ratingSet {
			if arsitekID, ok := project["selected_arsitek_id"].(int64); ok && arsitekID != 0 {
				if _, err := tx.Exec(ctx, `INSERT INTO arsitek_ratings
					(project_id, reviewer_id, arsitek_id, rating, komentar, created_at, updated_at)
					VALUES ($1, $2, $3, $4, $5, date_trunc('second', now()), date_trunc('second', now()))`,
					projectID, viewer.id, arsitekID, rating, review); err != nil {
					slog.Error("owner-accept: rating", "error", err)
					serverError(w)
					return
				}
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("owner-accept: commit", "error", err)
			serverError(w)
			return
		}

		freshFields, freshValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("owner-accept: reload", "error", err)
			serverError(w)
			return
		}

		entry, err := projectResource(ctx, pool, freshFields, freshValues, viewer, projectLoad{
			budgetSummary: true,
			countRoles:    bidCountRoles,
		}, nil, nil)
		if err != nil {
			slog.Error("owner-accept: render", "error", err)
			serverError(w)
			return
		}

		// The two trailing keys the controller's own load adds.
		reviewRow, err := projectArchitectReview(ctx, pool, projectID)
		if err != nil {
			slog.Error("owner-accept: review", "error", err)
			serverError(w)
			return
		}
		entry.Set("review_arsitek", reviewRow)

		var pmID *int64
		if id, ok := projectColumnsByName(freshFields, freshValues)["pm_id"].(int64); ok {
			pmID = &id
		}
		if pmID != nil {
			block, err := projectManagerBlock(ctx, pool, *pmID)
			if err != nil {
				slog.Error("owner-accept: pm", "error", err)
				serverError(w)
				return
			}
			entry.Set("project_manager", block)
		} else {
			entry.Set("project_manager", nil)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateOwnerAccept enforces rating nullable|integer|min:1|max:5 and
// review nullable|string|max:1000.
func validateOwnerAccept(fields map[string]any, failures *errorBag) (int64, any, bool) {
	var rating int64
	set := false
	if raw, present := fields["rating"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
				if parsed < 1 {
					failures.add("rating", "The rating field must be at least 1.")
				} else if parsed > 5 {
					failures.add("rating", "The rating field must not be greater than 5.")
				} else {
					rating = parsed
					set = true
				}
			}
		} else {
			failures.add("rating", "The rating field must be an integer.")
		}
	}

	var review any
	if raw, present := fields["review"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("review", "The review field must be a string.")
		} else if len([]rune(s)) > 1000 {
			failures.add("review", "The review field must not be greater than 1000 characters.")
		} else if s != "" {
			review = s
		}
	}

	return rating, review, set
}

// handoverFinalize mirrors finalizeProject inside the caller's transaction.
func handoverFinalize(ctx context.Context, tx pgx.Tx, projectID int64, project map[string]any, actorID int64) bool {
	category, _ := project["project_category"].(string)
	slf, _ := project["slf_verified_at"]
	if category == "new_build" && slf == nil {
		return false
	}

	needed := sortedPhaseList(project["needed_phases"])
	completed := sortedPhaseList(project["completed_phases"])
	if len(needed) != len(completed) {
		return false
	}
	for i := range needed {
		if needed[i] != completed[i] {
			return false
		}
	}

	if _, err := tx.Exec(ctx, `UPDATE projects SET status = 'completed',
		completed_at = date_trunc('second', now()),
		owner_accepted_at = date_trunc('second', now()),
		walkthrough_status = 'completed',
		warranty_start_at = date_trunc('second', now()),
		warranty_end_at = date_trunc('second', now()) + make_interval(days => $2),
		updated_at = date_trunc('second', now()) WHERE id = $1`,
		projectID, handoverWarrantyDays); err != nil {
		return false
	}

	if err := insertActivityLog(ctx, tx, projectID, actorID, "project_finalized",
		"Project officially completed and handed over."); err != nil {
		return false
	}

	return true
}

// sortedPhaseList normalizes a JSON phase array for the strict comparison.
func sortedPhaseList(value any) []string {
	out := []string{}
	if list, ok := value.([]any); ok {
		for _, item := range list {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
	} else if list, ok := value.([]string); ok {
		out = append(out, list...)
	}
	sort.Strings(out)
	return out
}

// projectArchitectReview reads the project's FIRST architect rating.
func projectArchitectReview(ctx context.Context, pool *pgxpool.Pool, projectID int64) (any, error) {
	var rating int
	var comment *string
	var createdAt *time.Time
	err := pool.QueryRow(ctx, `SELECT rating, komentar, created_at FROM arsitek_ratings
		WHERE project_id = $1 ORDER BY id LIMIT 1`, projectID).Scan(&rating, &comment, &createdAt)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	review := jsonphp.NewObject()
	review.Set("rating", rating)
	review.Set("comment", nullableString(comment))
	review.Set("created_at", carbon(createdAt))
	return review, nil
}
