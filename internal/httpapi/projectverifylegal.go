package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// VERIFY LEGAL — the owner or PM locks the legal phase.
//
// `POST /api/projects/{project}/verify-legal` is `LifecycleService::
// verifyPhase($project, 'legal')` as the controller calls it:
//
//   - legal columns: owner_legal_approved_at, legal_locked_at,
//     legal_completed_at stamped; legal_handover_submitted_at and its
//     notes cleared (the handover is consumed by the verification);
//   - `completed_phases` grows by `legal` (never duplicated);
//   - activity `legal_verified`, "PM/Owner formally verified and approved
//     the Legal Phase.";
//   - `triggerPaymentForPhase`: the FIRST locked notaris termin flips to
//     `pending`, with a `payment_unblocked` activity line naming its label;
//   - the hired notary is told (`phase_verified`, "Phase Approved!").
//
// The answer is the full resource. The handover must exist first.

// VerifyLegalHandler serves `POST /api/projects/{project}/verify-legal`.
func VerifyLegalHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("verify-legal: viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmID *int64
		var submitted *string
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id, legal_handover_submitted_at::text FROM projects WHERE id = $1`, projectID).
			Scan(&ownerID, &pmID, &submitted); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("verify-legal: project", "error", err)
			serverError(w)
			return
		}

		isOwner := viewer.id == ownerID
		isPM := viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID)
		if !isOwner && !isPM {
			message(w, http.StatusForbidden, "Only the Project Owner or PM can verify the legal phase.")
			return
		}

		if submitted == nil {
			message(w, http.StatusUnprocessableEntity, "Legal handover has not been submitted for verification yet.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("verify-legal: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET
			owner_legal_approved_at = date_trunc('second', now()),
			legal_locked_at = date_trunc('second', now()),
			legal_completed_at = date_trunc('second', now()),
			legal_handover_submitted_at = NULL,
			legal_handover_notes = NULL,
			completed_phases = CASE
				WHEN COALESCE(completed_phases, '[]'::jsonb) @> '["legal"]'::jsonb THEN COALESCE(completed_phases, '[]'::jsonb)
				ELSE COALESCE(completed_phases, '[]'::jsonb) || '["legal"]'::jsonb
			END,
			updated_at = date_trunc('second', now())
			WHERE id = $1`, projectID); err != nil {
			slog.Error("verify-legal: update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "legal_verified",
			"PM/Owner formally verified and approved the Legal Phase."); err != nil {
			slog.Error("verify-legal: log", "error", err)
			serverError(w)
			return
		}

		// triggerPaymentForPhase('legal'): unblock the FIRST locked notaris stage.
		var terminID int64
		var terminLabel string
		if err := tx.QueryRow(ctx, `SELECT id, COALESCE(label, '')
			FROM project_payment_termins
			WHERE project_id = $1 AND role_type = 'notaris' AND status::text = 'locked'
			ORDER BY id LIMIT 1`, projectID).Scan(&terminID, &terminLabel); err == nil {
			if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET status = 'pending', updated_at = date_trunc('second', now()) WHERE id = $1`, terminID); err != nil {
				slog.Error("verify-legal: termin", "error", err)
				serverError(w)
				return
			}
			if err := insertActivityLog(ctx, tx, projectID, viewer.id, "payment_unblocked",
				"Payment Termin \""+terminLabel+"\" automatically unblocked after phase verification."); err != nil {
				slog.Error("verify-legal: unblock log", "error", err)
				serverError(w)
				return
			}
		}

		if err := notifyPhaseProfessional(ctx, tx, projectID, "legal"); err != nil {
			slog.Error("verify-legal: notify", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("verify-legal: commit", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("verify-legal: reload", "error", err)
			serverError(w)
			return
		}

		entry, err := projectResource(ctx, pool, fields, values, viewer, fullSealLoad(), nil)
		if err != nil {
			slog.Error("verify-legal: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// notifyPhaseProfessional mirrors notifyProfessionalsOfVerification: the
// hired professional for the phase hears "Phase Approved!".
func notifyPhaseProfessional(ctx context.Context, tx pgx.Tx, projectID int64, phase string) error {
	column, table := "", ""
	switch phase {
	case "design":
		column, table = "selected_arsitek_id", "arsiteks"
	case "construction":
		column, table = "selected_kontraktor_id", "kontraktors"
	case "interior":
		column, table = "selected_interior_id", "interior_profiles"
	case "legal":
		column, table = "selected_notaris_id", "notaris_profiles"
	default:
		return nil
	}

	var profileID *int64
	var title string
	if err := tx.QueryRow(ctx, `SELECT `+column+`, title FROM projects WHERE id = $1`, projectID).Scan(&profileID, &title); err != nil {
		return err
	}
	if profileID == nil || *profileID == 0 {
		return nil
	}

	var userID *int64
	if err := tx.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, *profileID).Scan(&userID); err != nil || userID == nil || *userID == 0 {
		return nil
	}

	return insertNotification(ctx, tx, *userID, "phase_verified", "Phase Approved!",
		"The "+ucfirst(phase)+" phase of project \""+title+"\" has been officially verified and locked.",
		`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`)
}
