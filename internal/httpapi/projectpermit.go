package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PERMIT VERIFICATIONS — PBG and SLF.
//
// Both are the owner's or the assigned PM's decision and answer the
// LEAN ProjectResource: `new ProjectResource($project)` on a model with
// no eager loads, so the body is `{"data": …}` with the 110 base keys
// (attributes, owner, counts, snag/change summaries, budget summary) and
// none of the relation blocks.
//
// PBG has a regulatory pre-gate: the Architectural Construction Brief
// must be approved and locked first, otherwise the verification is
// refused with a 422. SLF has no pre-gate — it stamps the occupancy
// certificate. Each writes its own activity line.

// VerifyPBGHandler serves `POST /api/projects/{project}/verify-pbg`.
func VerifyPBGHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return permitVerification(pool, "pbg")
}

// VerifySLFHandler serves `POST /api/projects/{project}/verify-slf`.
func VerifySLFHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return permitVerification(pool, "slf")
}

// permitVerification is the shared body: gate, optional brief check,
// stamp, activity, lean resource.
func permitVerification(pool *pgxpool.Pool, kind string) http.HandlerFunc {
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
			slog.Error("permit-"+kind+": viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmID *int64
		var briefStatus string
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id, construction_brief_status::text FROM projects WHERE id = $1`, projectID).
			Scan(&ownerID, &pmID, &briefStatus); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("permit-"+kind+": project", "error", err)
			serverError(w)
			return
		}

		isOwner := viewer.id == ownerID
		isPM := viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID)
		if !isOwner && !isPM {
			if kind == "pbg" {
				message(w, http.StatusForbidden, "Only the Project Owner or assigned Project Manager can verify PBG compliance.")
			} else {
				message(w, http.StatusForbidden, "Only the Project Owner or assigned Project Manager can verify SLF compliance.")
			}
			return
		}

		if kind == "pbg" && briefStatus != "approved" {
			message(w, http.StatusUnprocessableEntity, "Regulatory Block: PBG verification is locked until the Architectural Construction Brief (DED) is approved and locked.")
			return
		}

		column, action, details := "pbg_verified_at", "pbg_verified",
			"PBG (Building Permit) verified. The construction phase is now officially unlocked."
		if kind == "slf" {
			column, action, details = "slf_verified_at", "slf_verified",
				"SLF (Certificate of Occupancy) verified. Final completion is authorized."
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("permit-"+kind+": begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET `+column+` = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("permit-"+kind+": update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, action, details); err != nil {
			slog.Error("permit-"+kind+": log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("permit-"+kind+": commit", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("permit-"+kind+": reload", "error", err)
			serverError(w)
			return
		}

		entry, err := projectResource(ctx, pool, fields, values, viewer, projectLoad{budgetSummary: true}, nil, nil)
		if err != nil {
			slog.Error("permit-"+kind+": render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}
