package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CONTRACT TERMINATION — the owner fires a professional, or the professional
// resigns.
//
// Both paths share the same settlement: mark the live bid, notify the other
// side, move the reliability score, delete the departing role's incomplete
// milestones, VOID every unpaid payment stage (leaving `verifying` stages for
// arbitration), clear the project's selected_* column and reopen an
// in-progress project for bidding.
//
// Two vocabularies meet here: users/termins spell the PM `project_manager`;
// bids/project columns spell it `pm`. `terminationRole` translates once.

// terminationRole is one role's column/table mapping.
type terminationRole struct {
	short         string // pm, arsitek, …
	termin        string // project_manager, arsitek, … (bids + payment stages)
	projectColumn string
	milestoneCol  string
	profileTable  string
}

var terminationRoles = map[string]terminationRole{
	"arsitek":    {"arsitek", "arsitek", "selected_arsitek_id", "arsitek_id", "arsiteks"},
	"kontraktor": {"kontraktor", "kontraktor", "selected_kontraktor_id", "kontraktor_id", "kontraktors"},
	"interior":   {"interior", "interior", "selected_interior_id", "interior_id", "interior_profiles"},
	"notaris":    {"notaris", "notaris", "selected_notaris_id", "notaris_id", "notaris_profiles"},
	"pm":         {"pm", "project_manager", "pm_id", "pm_id", "project_managers"},
	"structural": {"structural", "structural", "structural_id", "structural_id", "structural_engineers"},
	"mep":        {"mep", "mep", "mep_id", "mep_id", "mep_engineers"},
}

// terminationRoleFor normalises the two spellings to the short token.
func terminationRoleFor(raw string) (terminationRole, bool) {
	if raw == "project_manager" {
		raw = "pm"
	}
	role, ok := terminationRoles[raw]
	return role, ok
}

// terminationBid marks the live bid and returns its profile id, or nil.
func terminationBid(ctx context.Context, tx pgx.Tx, projectID int64,
	role terminationRole, status string) (*int64, error) {
	rows, err := tx.Query(ctx, `SELECT * FROM bids WHERE project_id = $1 AND role::text = $2
		AND status::text IN ('accepted','awaiting_payment','contract_pending','active')
		ORDER BY created_at DESC, id DESC LIMIT 1`, projectID, role.termin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	byName := projectColumnsByName(fields, values)
	profileID := intPtrOf(byName[bidProfileColumnForRole(role.termin)])

	// Update by the physical row id; the wire id may be a legacy id.
	physical := intPtrOf(byName["id"])
	if physical == nil {
		return nil, rows.Err()
	}
	// Close the cursor BEFORE writing on the same transaction: pgx refuses a
	// command on a connection with an open result set ('conn busy').
	rows.Close()
	if _, err := tx.Exec(ctx, `UPDATE bids SET status = $2,
		updated_at = date_trunc('second', now()) WHERE id = $1`, *physical, status); err != nil {
		return nil, err
	}
	return profileID, nil
}

// terminationProfile reads the hired profile's user and reliability score.
func terminationProfile(ctx context.Context, tx pgx.Tx, role terminationRole,
	profileID *int64) (*int64, *int, error) {
	if profileID == nil {
		return nil, nil, nil
	}
	var userID *int64
	var reliability *int
	err := tx.QueryRow(ctx, `SELECT user_id, reliability_score FROM `+role.profileTable+`
		WHERE id = $1`, *profileID).Scan(&userID, &reliability)
	if err != nil {
		if isNoRows(err) {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	return userID, reliability, nil
}

// settleTerminationStages voids every unpaid stage for the role and logs the
// settlement. `verifying` stages are left for dispute arbitration.
func settleTerminationStages(ctx context.Context, tx pgx.Tx, projectID, actorID int64,
	roleType, reason string) error {
	var inFlight int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM project_payment_termins
		WHERE project_id = $1 AND role_type::text = $2 AND status::text = 'verifying'`,
		projectID, roleType).Scan(&inFlight); err != nil {
		return err
	}

	tag, err := tx.Exec(ctx, `UPDATE project_payment_termins SET status = 'void',
		notes = $3, updated_at = date_trunc('second', now())
		WHERE project_id = $1 AND role_type::text = $2
		  AND status::text IN ('locked','pending','invoice_sent')`,
		projectID, roleType, "Voided automatically — contract "+reason+".")
	if err != nil {
		return err
	}
	voided := tag.RowsAffected()

	if voided > 0 || inFlight > 0 {
		details := "Payment settlement for " + roleType + " (" + reason + "): " +
			strconv.FormatInt(voided, 10) + " stage(s) voided"
		if inFlight > 0 {
			details += ", " + strconv.Itoa(inFlight) + " stage(s) left in flight (verifying) for dispute arbitration"
		}
		details += "."
		if err := insertActivityLog(ctx, tx, projectID, actorID, "payment_stages_settled", details); err != nil {
			return err
		}
	}
	return nil
}

// clearTerminationRole removes the role's incomplete milestones and the
// project's selected column.
func clearTerminationRole(ctx context.Context, tx pgx.Tx, projectID int64,
	role terminationRole, profileID *int64) error {
	if profileID != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM project_milestones
			WHERE project_id = $1 AND `+role.milestoneCol+` = $2 AND is_completed = false`,
			projectID, *profileID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE projects SET `+role.projectColumn+` = NULL,
		updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
		return err
	}
	return nil
}

// reopenIfInProgress flips an in-progress project back to open.
func reopenIfInProgress(ctx context.Context, tx pgx.Tx, projectID int64, status string) error {
	if status != "in_progress" {
		return nil
	}
	_, err := tx.Exec(ctx, `UPDATE projects SET status = 'open',
		updated_at = date_trunc('second', now()) WHERE id = $1`, projectID)
	return err
}

// TerminateProfessionalHandler serves `POST /api/projects/{project}/terminate`.
func TerminateProfessionalHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("terminate: project", "error", err)
			serverError(w)
			return
		}
		ownerID := projectInt(values, fields, "user_id")
		if ownerID != caller.UserID() {
			message(w, http.StatusForbidden, "Only the project owner can terminate contracts.")
			return
		}

		projectStatus := stringOf(projectText(values, fields, "status"))
		if projectStatus == "completed" || projectStatus == "cancelled" {
			message(w, http.StatusUnprocessableEntity, "Cannot terminate contracts on a "+projectStatus+" project.")
			return
		}

		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}
		failures := &errorBag{}

		rawRole := ""
		if raw, present := body["role_type"]; !present || raw == nil {
			failures.add("role_type", "The role type field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("role_type", "The selected role type is invalid.")
		} else if _, ok := terminationRoleFor(text); !ok {
			failures.add("role_type", "The selected role type is invalid.")
		} else {
			rawRole = text
		}

		reason := ""
		if raw, present := body["reason"]; !present || raw == nil || (func() bool {
			text, ok := raw.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			failures.add("reason", "The reason field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("reason", "The reason field must be a string.")
		} else if len([]rune(text)) > 500 {
			failures.add("reason", "The reason field must not be greater than 500 characters.")
		} else {
			reason = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		role, _ := terminationRoleFor(rawRole)
		profileID := projectIntPtr(values, fields, role.projectColumn)
		if profileID == nil || *profileID == 0 {
			message(w, http.StatusUnprocessableEntity, "No professional of type "+role.short+" is currently hired.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("terminate: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "professional_fired",
			"Owner terminated contract for "+role.short+". Reason: "+reason); err != nil {
			slog.Error("terminate: activity", "error", err)
			serverError(w)
			return
		}

		bidProfile, err := terminationBid(ctx, tx, projectID, role, "terminated")
		if err != nil {
			slog.Error("terminate: bid", "error", err)
			serverError(w)
			return
		}

		if bidProfile != nil {
			userID, reliability, err := terminationProfile(ctx, tx, role, bidProfile)
			if err != nil {
				slog.Error("terminate: profile", "error", err)
				serverError(w)
				return
			}
			if userID != nil && *userID != 0 {
				title := stringOf(projectText(values, fields, "title"))
				body := "Your contract for \"" + title + "\" was terminated by the owner. Reason: " + reason
				data := `{"project_id":` + strconv.FormatInt(projectID, 10) + `}`
				if _, err := tx.Exec(ctx, `INSERT INTO notifications
					(user_id, type, title, body, data, created_at, updated_at)
					VALUES ($1, 'contract_terminated', 'Contract Terminated', $2, $3::jsonb,
					 date_trunc('second', now()), date_trunc('second', now()))`,
					*userID, body, data); err != nil {
					slog.Warn("terminate: notify", "error", err)
				}
			}
			score := 100
			if reliability != nil {
				score = *reliability
			}
			score -= 10
			if score < 0 {
				score = 0
			}
			if _, err := tx.Exec(ctx, `UPDATE `+role.profileTable+` SET reliability_score = $2,
				updated_at = date_trunc('second', now()) WHERE id = $1`, *bidProfile, score); err != nil {
				slog.Warn("terminate: reliability", "error", err)
			}
		}

		if err := clearTerminationRole(ctx, tx, projectID, role, profileID); err != nil {
			slog.Error("terminate: clear", "error", err)
			serverError(w)
			return
		}

		if err := settleTerminationStages(ctx, tx, projectID, caller.UserID(), role.termin, "terminated"); err != nil {
			slog.Error("terminate: settle", "error", err)
			serverError(w)
			return
		}

		if err := reopenIfInProgress(ctx, tx, projectID, projectStatus); err != nil {
			slog.Error("terminate: reopen", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("terminate: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Contract for "+role.short+" terminated successfully. Project is reopened for bidding.")
	}
}

// ResignFromProjectHandler serves `POST /api/projects/{project}/resign`.
func ResignFromProjectHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("resign: project", "error", err)
			serverError(w)
			return
		}

		projectStatus := stringOf(projectText(values, fields, "status"))
		if projectStatus == "completed" || projectStatus == "cancelled" {
			message(w, http.StatusUnprocessableEntity, "Cannot resign from a "+projectStatus+" project.")
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("resign: viewer", "error", err)
			serverError(w)
			return
		}
		role, ok := terminationRoleFor(viewer.role)
		if !ok {
			message(w, http.StatusForbidden, "You are not hired for this role on this project.")
			return
		}

		columns := map[string]any{}
		for _, candidate := range terminationRoles {
			columns[candidate.projectColumn] = projectIntPtr(values, fields, candidate.projectColumn)
		}
		if !hireMatches(viewer, columns, role.termin) {
			message(w, http.StatusForbidden, "You are not hired for this role on this project.")
			return
		}

		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}
		failures := &errorBag{}
		reason := ""
		if raw, present := body["reason"]; !present || raw == nil || (func() bool {
			text, ok := raw.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			failures.add("reason", "The reason field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("reason", "The reason field must be a string.")
		} else if len([]rune(text)) > 500 {
			failures.add("reason", "The reason field must not be greater than 500 characters.")
		} else {
			reason = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		profileID := projectIntPtr(values, fields, role.projectColumn)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("resign: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "professional_resigned",
			"Professional ("+role.short+") resigned from the project. Reason: "+reason); err != nil {
			slog.Error("resign: activity", "error", err)
			serverError(w)
			return
		}

		ownerID := projectInt(values, fields, "user_id")
		if ownerID != 0 {
			title := stringOf(projectText(values, fields, "title"))
			body := "The " + role.short + " for your project \"" + title + "\" has resigned. Reason: " + reason
			data := `{"project_id":` + strconv.FormatInt(projectID, 10) + `}`
			if _, err := tx.Exec(ctx, `INSERT INTO notifications
				(user_id, type, title, body, data, created_at, updated_at)
				VALUES ($1, 'professional_resigned', 'Professional Resigned', $2, $3::jsonb,
				 date_trunc('second', now()), date_trunc('second', now()))`,
				ownerID, body, data); err != nil {
				slog.Warn("resign: notify", "error", err)
			}
		}

		if _, err := terminationBid(ctx, tx, projectID, role, "resigned"); err != nil {
			slog.Error("resign: bid", "error", err)
			serverError(w)
			return
		}

		if profileID != nil {
			_, reliability, err := terminationProfile(ctx, tx, role, profileID)
			if err != nil {
				slog.Error("resign: profile", "error", err)
				serverError(w)
				return
			}
			score := 100
			if reliability != nil {
				score = *reliability
			}
			score -= 5
			if score < 0 {
				score = 0
			}
			if _, err := tx.Exec(ctx, `UPDATE `+role.profileTable+` SET reliability_score = $2,
				updated_at = date_trunc('second', now()) WHERE id = $1`, *profileID, score); err != nil {
				slog.Warn("resign: reliability", "error", err)
			}
		}

		if err := clearTerminationRole(ctx, tx, projectID, role, profileID); err != nil {
			slog.Error("resign: clear", "error", err)
			serverError(w)
			return
		}

		if err := settleTerminationStages(ctx, tx, projectID, caller.UserID(), role.termin, "resigned"); err != nil {
			slog.Error("resign: settle", "error", err)
			serverError(w)
			return
		}

		if err := reopenIfInProgress(ctx, tx, projectID, projectStatus); err != nil {
			slog.Error("resign: reopen", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("resign: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Resignation submitted successfully.")
	}
}
