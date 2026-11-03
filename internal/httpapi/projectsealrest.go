package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE REMAINING SEALS — construction, interior and legal.
//
// Each is the hired professional's handover for their phase, with the
// same skeleton as seal-design: Hire::matches on the role, a phase-
// specific completeness gate, a stamp + notes clear, an activity line,
// the owner/PM notification, and the FULL resource.
//
//   - construction: every milestone with `phase_context = construction`
//     must be completed AND approved;
//   - interior: the same for `interior`;
//   - legal: milestones in `drafting`/`revision` block the seal, but —
//     only when a legal milestone is linked to a payment termin — the
//     check ignores predefined milestones (a non-empty `content->>req_id`
//     with no linked termin), so templated items that carry no money
//     cannot stall the handover.

// sealSpec describes one seal's texts and columns.
type sealSpec struct {
	role        identity.Role
	forbidden   string
	incomplete  string
	phase       string
	stampCol    string
	notesCol    string
	action      string
	details     string
	notifyTitle string
	notifyBody  string
	failMsg     string
}

var sealSpecs = map[string]sealSpec{
	"construction": {
		role:        identity.RoleKontraktor,
		forbidden:   "Unauthorized. Only the hired contractor can seal construction.",
		incomplete:  "All construction milestones must be completed before sealing.",
		phase:       "construction",
		stampCol:    "construction_handover_submitted_at",
		notesCol:    "construction_handover_notes",
		action:      "construction_handover_submitted",
		details:     "Contractor submitted construction handover for PM verification.",
		notifyTitle: "Construction Handover",
		notifyBody:  "The Contractor has submitted the construction handover for your verification.",
		failMsg:     "Failed to submit construction handover.",
	},
	"interior": {
		role:        identity.RoleInterior,
		forbidden:   "Unauthorized. Only the hired interior designer can seal.",
		incomplete:  "All interior design milestones must be completed and approved before sealing.",
		phase:       "interior",
		stampCol:    "interior_handover_submitted_at",
		notesCol:    "interior_handover_notes",
		action:      "interior_handover_submitted",
		details:     "Interior designer submitted handover for PM verification.",
		notifyTitle: "Interior Handover",
		notifyBody:  "The Interior Designer has submitted the interior handover for your verification.",
		failMsg:     "Failed to submit interior handover.",
	},
	"legal": {
		role:        identity.RoleNotaris,
		forbidden:   "Unauthorized. Only the hired notary can seal the legal phase.",
		incomplete:  "All legal milestones must be completed (uploaded) and not pending revisions before submitting for review.",
		phase:       "legal",
		stampCol:    "legal_handover_submitted_at",
		notesCol:    "legal_handover_notes",
		action:      "legal_handover_submitted",
		details:     "Notary submitted legal handover for PM verification.",
		notifyTitle: "Legal Handover",
		notifyBody:  "The Notary has submitted the legal handover for your verification.",
		failMsg:     "Failed to submit legal handover.",
	},
}

// SealConstructionHandler serves `POST /api/projects/{project}/seal-construction`.
func SealConstructionHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return sealPhase(pool, "construction")
}

// SealInteriorHandler serves `POST /api/projects/{project}/seal-interior`.
func SealInteriorHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return sealPhase(pool, "interior")
}

// SealLegalHandler serves `POST /api/projects/{project}/seal-legal`.
func SealLegalHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return sealPhase(pool, "legal")
}

// sealPhase runs one handover seal.
func sealPhase(pool *pgxpool.Pool, key string) http.HandlerFunc {
	spec := sealSpecs[key]

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
			slog.Error("seal-"+key+": viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("seal-"+key+": subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("seal-"+key+": parties", "error", err)
			serverError(w)
			return
		}

		if !authz.Matches(parties, subject, spec.role) {
			message(w, http.StatusForbidden, spec.forbidden)
			return
		}

		incomplete, err := sealIncomplete(ctx, pool, projectID, spec)
		if err != nil {
			slog.Error("seal-"+key+": incomplete", "error", err)
			serverError(w)
			return
		}
		if incomplete {
			message(w, http.StatusUnprocessableEntity, spec.incomplete)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("seal-"+key+": begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET `+spec.stampCol+` = date_trunc('second', now()),
			`+spec.notesCol+` = NULL, updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("seal-"+key+": update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, spec.action, spec.details); err != nil {
			slog.Error("seal-"+key+": log", "error", err)
			serverError(w)
			return
		}

		if err := notifyReviewers(ctx, tx, projectID, spec.notifyTitle, spec.notifyBody); err != nil {
			slog.Error("seal-"+key+": notify", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("seal-"+key+": commit", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("seal-"+key+": reload", "error", err)
			serverError(w)
			return
		}

		entry, err := projectResource(ctx, pool, fields, values, viewer, fullSealLoad(), nil, nil)
		if err != nil {
			slog.Error("seal-"+key+": render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// sealIncomplete runs the phase-specific completeness gate.
func sealIncomplete(ctx context.Context, pool *pgxpool.Pool, projectID int64, spec sealSpec) (bool, error) {
	switch spec.phase {
	case "construction", "interior":
		var blocked bool
		err := pool.QueryRow(ctx, `SELECT EXISTS (
			SELECT 1 FROM project_milestones
			 WHERE project_id = $1 AND phase_context = $2
			   AND (is_completed = false OR approval_status::text <> 'approved'))`,
			projectID, spec.phase).Scan(&blocked)
		return blocked, err
	default:
		// legal: drafting/revision milestones block the seal. When a legal
		// milestone is tied to a payment termin, predefined template items
		// (non-empty content->>req_id with no linked termin) are ignored.
		var hasLinked bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (
			SELECT 1 FROM project_payment_termins t
			  JOIN project_milestones m ON m.id = t.milestone_id
			 WHERE t.project_id = $1 AND t.milestone_id IS NOT NULL AND m.phase_context = 'legal')`,
			projectID).Scan(&hasLinked); err != nil {
			return false, err
		}

		query := `SELECT EXISTS (
			SELECT 1 FROM project_milestones m
			 WHERE m.project_id = $1 AND m.phase_context = 'legal'`
		if hasLinked {
			query += ` AND (COALESCE(m.content->>'req_id', '') = ''
				OR EXISTS (SELECT 1 FROM project_payment_termins t2 WHERE t2.milestone_id = m.id))`
		}
		query += ` AND m.approval_status::text IN ('drafting','revision'))`

		var blocked bool
		if err := pool.QueryRow(ctx, query, projectID).Scan(&blocked); err != nil {
			return false, err
		}
		return blocked, nil
	}
}

// AuthorizePhaseHandler serves
// `POST /api/projects/{project}/authorize-phase`.
func AuthorizePhaseHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("authorize-phase: viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmID *int64
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &pmID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("authorize-phase: project", "error", err)
			serverError(w)
			return
		}

		isOwner := viewer.id == ownerID
		isPM := viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID)
		if !isOwner && !isPM {
			message(w, http.StatusForbidden, "Unauthorized. Only the Project Owner or PM can authorize phases.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		phase, authorized := validateAuthorizePhase(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		column := ""
		switch phase {
		case "design":
			column = "design_authorized_at"
		case "build":
			column = "construction_authorized_at"
		case "materials":
			column = "materials_authorized_at"
		}

		stamp := "NULL"
		if authorized {
			stamp = "date_trunc('second', now())"
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("authorize-phase: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET `+column+` = `+stamp+`, updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("authorize-phase: update", "error", err)
			serverError(w)
			return
		}

		verb := "authorized"
		if !authorized {
			verb = "revoked authorization for"
		}
		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "phase_"+phase+"_authorization",
			"PM "+verb+" the "+phase+" phase."); err != nil {
			slog.Error("authorize-phase: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("authorize-phase: commit", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("authorize-phase: reload", "error", err)
			serverError(w)
			return
		}

		entry, err := projectResource(ctx, pool, fields, values, viewer, fullSealLoad(), nil, nil)
		if err != nil {
			slog.Error("authorize-phase: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Phase authorization updated successfully.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateAuthorizePhase enforces phase required|in:design,build,materials
// and authorize required|boolean.
func validateAuthorizePhase(fields map[string]any, failures *errorBag) (phase string, authorized bool) {
	raw, present := fields["phase"]
	if !present || raw == nil {
		failures.add("phase", "The phase field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("phase", "The selected phase is invalid.")
	} else if s == "" {
		failures.add("phase", "The phase field is required.")
	} else if s != "design" && s != "build" && s != "materials" {
		failures.add("phase", "The selected phase is invalid.")
	} else {
		phase = s
	}

	rawAuth, present := fields["authorize"]
	if !present || rawAuth == nil {
		failures.add("authorize", "The authorize field is required.")
	} else {
		switch typed := rawAuth.(type) {
		case bool:
			authorized = typed
		case float64:
			if typed == 0 {
				authorized = false
			} else if typed == 1 {
				authorized = true
			} else {
				failures.add("authorize", "The authorize field must be true or false.")
			}
		case string:
			switch typed {
			case "1", "true":
				authorized = true
			case "0", "false":
				authorized = false
			default:
				failures.add("authorize", "The authorize field must be true or false.")
			}
		default:
			failures.add("authorize", "The authorize field must be true or false.")
		}
	}

	return phase, authorized
}
