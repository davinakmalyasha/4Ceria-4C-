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

// MUTUAL TERMINATION — the amicable-exit lifecycle.
//
// A participant opens a request, the owner or assigned PM accepts (project
// cancelled) or rejects (project back to in_progress), and a rejected
// request can be escalated into a real dispute, which freezes payments.
//
// `projects.pm_id` is a PROFILE id, so the PM gate is verifyAssignedPM.

// terminationColumns is the `project_terminations` table order.
var terminationColumns = []string{
	"id", "project_id", "initiator_id", "reason", "settlement_terms",
	"status", "resolution_notes", "resolved_by_id", "resolved_at",
	"created_at", "updated_at",
}

// terminationObject renders a row in table order.
func terminationObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range terminationColumns {
		switch column {
		case "resolved_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	return entry
}

// terminationCreatedObject is Eloquent's CREATED model: payload order, then
// `updated_at` before `created_at`, then `id`.
func terminationCreatedObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range []string{"project_id", "initiator_id", "reason", "settlement_terms", "status"} {
		entry.Set(column, projectRawValue(byName[column]))
	}
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// terminationRow loads one termination.
func terminationRow(ctx context.Context, pool *pgxpool.Pool, id int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(terminationColumns, ", ")+`
		FROM project_terminations WHERE id = $1`, id)
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

// terminationSubRouteIDs reads the project id and, when present, the
// termination id. Index/initiate have no termination segment.
func terminationSubRouteIDs(r *http.Request) (int64, int64, string, string) {
	rawProject := r.PathValue("project")
	if rawProject == "" {
		rawProject = projectIDFromPath(r.URL.Path)
	}
	projectID, projectErr := strconv.ParseInt(rawProject, 10, 64)
	if projectErr != nil {
		return 0, 0, rawProject, ""
	}

	rawTermination := r.PathValue("termination")
	if rawTermination == "" {
		path := strings.TrimSuffix(r.URL.Path, "/respond")
		path = strings.TrimSuffix(path, "/escalate")
		candidate := lastPathSegment(path)
		if _, err := strconv.ParseInt(candidate, 10, 64); err == nil {
			rawTermination = candidate
		}
	}

	terminationID := int64(0)
	if rawTermination != "" {
		parsed, err := strconv.ParseInt(rawTermination, 10, 64)
		if err != nil {
			return 0, 0, rawProject, rawTermination
		}
		terminationID = parsed
	}

	return projectID, terminationID, rawProject, rawTermination
}

// terminationParticipant reports owner / assigned PM / hired professional.
func terminationParticipant(ctx context.Context, pool *pgxpool.Pool, projectID, userID int64) (bool, error) {
	subject, err := loadSubject(ctx, pool, userID)
	if err != nil {
		return false, err
	}
	parties, err := loadProjectParties(ctx, pool, projectID)
	if err != nil {
		return false, err
	}
	return isParticipant(parties, subject), nil
}

// MutualTerminationIndexHandler serves
// `GET /api/projects/{project}/mutual-termination`.
func MutualTerminationIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		projectID, _, rawProject, _ := terminationSubRouteIDs(r)
		if projectID == 0 {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`,
			projectID).Scan(&exists); err != nil {
			slog.Error("termination index: project", "error", err)
			serverError(w)
			return
		}
		if !exists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		participant, err := terminationParticipant(ctx, pool, projectID, caller.UserID())
		if err != nil {
			slog.Error("termination index: participant", "error", err)
			serverError(w)
			return
		}
		if !participant {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(terminationColumns, ", ")+`
			FROM project_terminations WHERE project_id = $1
			ORDER BY created_at DESC, id ASC`, projectID)
		if err != nil {
			slog.Error("termination index: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		list := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("termination index: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			list = append(list, terminationObject(byName))
		}

		payload := jsonphp.NewObject()
		payload.Set("data", list)
		writeJSON(w, http.StatusOK, payload)
	}
}

// InitiateMutualTerminationHandler serves
// `POST /api/projects/{project}/mutual-termination/initiate`.
func InitiateMutualTerminationHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		projectID, _, rawProject, _ := terminationSubRouteIDs(r)
		if projectID == 0 {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		var projectStatus string
		var projectTitle string
		if err := pool.QueryRow(ctx, `SELECT status::text, title FROM projects WHERE id = $1`,
			projectID).Scan(&projectStatus, &projectTitle); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("termination initiate: project", "error", err)
			serverError(w)
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}

		reason := ""
		if raw, present := fields["reason"]; !present || raw == nil || (func() bool {
			text, ok := raw.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			failures.add("reason", "The reason field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("reason", "The reason field must be a string.")
		} else if len([]rune(text)) > 1000 {
			failures.add("reason", "The reason field must not be greater than 1000 characters.")
		} else {
			reason = text
		}

		var settlement any
		if raw, present := fields["settlement_terms"]; present && raw != nil {
			if text, ok := raw.(string); !ok {
				failures.add("settlement_terms", "The settlement terms field must be a string.")
			} else if len([]rune(text)) > 1000 {
				failures.add("settlement_terms", "The settlement terms field must not be greater than 1000 characters.")
			} else {
				settlement = text
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		participant, err := terminationParticipant(ctx, pool, projectID, caller.UserID())
		if err != nil {
			slog.Error("termination initiate: participant", "error", err)
			serverError(w)
			return
		}
		if !participant {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
		if projectStatus == "cancelled" || projectStatus == "completed" || projectStatus == "termination_pending" {
			message(w, http.StatusUnprocessableEntity, "Proyek tidak dalam status aktif untuk dibatalkan.")
			return
		}

		var userName string
		_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, caller.UserID()).Scan(&userName)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("termination initiate: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var termID int64
		var createdAt, updatedAt any
		if err := tx.QueryRow(ctx, `INSERT INTO project_terminations
			(project_id, initiator_id, reason, settlement_terms, status, created_at, updated_at)
			VALUES ($1, $2, $3, $4, 'pending', date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			projectID, caller.UserID(), reason, settlement).Scan(&termID, &createdAt, &updatedAt); err != nil {
			slog.Error("termination initiate: insert", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE projects SET status = 'termination_pending',
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("termination initiate: project update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "termination_initiated",
			"Pengajuan pembatalan proyek diajukan oleh "+userName+". Alasan: "+reason); err != nil {
			slog.Error("termination initiate: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("termination initiate: commit", "error", err)
			serverError(w)
			return
		}

		created := map[string]any{
			"id": termID, "project_id": projectID, "initiator_id": caller.UserID(),
			"reason": reason, "settlement_terms": settlement, "status": "pending",
			"created_at": createdAt, "updated_at": updatedAt,
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Pengajuan pembatalan bersama berhasil dibuat. Workspace dibekukan sementara.")
		payload.Set("data", terminationCreatedObject(created))
		writeJSON(w, http.StatusOK, payload)
	}
}

// RespondMutualTerminationHandler serves
// `POST /api/projects/{project}/mutual-termination/{termination}/respond`.
func RespondMutualTerminationHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		projectID, terminationID, rawProject, rawTermination := terminationSubRouteIDs(r)
		if projectID == 0 {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		termination, found, err := terminationRow(ctx, pool, terminationID)
		if err != nil {
			slog.Error("termination respond: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectTermination`, rawTermination)
			return
		}

		if intPtrDeref(termination["project_id"]) != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		action := ""
		if raw, present := fields["action"]; !present || raw == nil {
			failures.add("action", "The action field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("action", "The selected action is invalid.")
		} else if text != "accept" && text != "reject" {
			failures.add("action", "The selected action is invalid.")
		} else {
			action = text
		}

		var resolutionNotes any
		notesSet := false
		if raw, present := fields["resolution_notes"]; present {
			if raw == nil {
				notesSet = false
			} else if text, ok := raw.(string); !ok {
				failures.add("resolution_notes", "The resolution notes field must be a string.")
			} else if len([]rune(text)) > 1000 {
				failures.add("resolution_notes", "The resolution notes field must not be greater than 1000 characters.")
			} else if text != "" {
				resolutionNotes = text
				notesSet = true
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}
		_ = notesSet

		if intPtrDeref(termination["initiator_id"]) == caller.UserID() {
			message(w, http.StatusForbidden, "Anda tidak bisa menanggapi pengajuan yang Anda buat sendiri.")
			return
		}

		var ownerID int64
		var pmID *int64
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`,
			projectID).Scan(&ownerID, &pmID); err != nil {
			slog.Error("termination respond: project", "error", err)
			serverError(w)
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("termination respond: viewer", "error", err)
			serverError(w)
			return
		}
		if ownerID != viewer.id && !verifyAssignedPM(viewer, pmID) {
			message(w, http.StatusForbidden, "Hanya Owner atau Project Manager yang dapat menanggapi pengajuan pembatalan.")
			return
		}

		if stringOf(termination["status"]) != "pending" {
			message(w, http.StatusUnprocessableEntity, "Pengajuan ini sudah diproses.")
			return
		}

		accept := action == "accept"
		resolvedAt := any(nil)
		if accept {
			resolvedAt = "now"
		}
		notes := "Diselesaikan secara kekeluargaan."
		if notesSet {
			notes = resolutionNotes.(string)
		}

		var userName string
		_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, caller.UserID()).Scan(&userName)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("termination respond: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		newStatus := "rejected"
		messageText := "Pengajuan pembatalan ditolak. Proyek kembali aktif."
		projectStatus := "in_progress"
		if accept {
			newStatus = "accepted"
			messageText = "Proyek dibatalkan secara bersama."
			projectStatus = "cancelled"
		}

		if resolvedAt == nil {
			if _, err := tx.Exec(ctx, `UPDATE project_terminations SET status = $2,
				resolved_at = NULL, resolution_notes = $3,
				updated_at = date_trunc('second', now()) WHERE id = $1`,
				terminationID, newStatus, notes); err != nil {
				slog.Error("termination respond: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if _, err := tx.Exec(ctx, `UPDATE project_terminations SET status = $2,
				resolved_at = date_trunc('second', now()), resolution_notes = $3,
				updated_at = date_trunc('second', now()) WHERE id = $1`,
				terminationID, newStatus, notes); err != nil {
				slog.Error("termination respond: update", "error", err)
				serverError(w)
				return
			}
		}

		if _, err := tx.Exec(ctx, `UPDATE projects SET status = $2,
			updated_at = date_trunc('second', now()) WHERE id = $1`,
			projectID, projectStatus); err != nil {
			slog.Error("termination respond: project", "error", err)
			serverError(w)
			return
		}

		verb := "ditolak"
		if accept {
			verb = "disetujui"
		}
		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "termination_responded",
			"Pengajuan pembatalan "+verb+" oleh "+userName+"."); err != nil {
			slog.Error("termination respond: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("termination respond: commit", "error", err)
			serverError(w)
			return
		}

		fresh, _, err := terminationRow(ctx, pool, terminationID)
		if err != nil {
			slog.Error("termination respond: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", messageText)
		payload.Set("data", terminationObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// EscalateMutualTerminationHandler serves
// `POST /api/projects/{project}/mutual-termination/{termination}/escalate`.
func EscalateMutualTerminationHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		projectID, terminationID, rawProject, rawTermination := terminationSubRouteIDs(r)
		if projectID == 0 {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		termination, found, err := terminationRow(ctx, pool, terminationID)
		if err != nil {
			slog.Error("termination escalate: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectTermination`, rawTermination)
			return
		}

		termStatus := stringOf(termination["status"])
		if intPtrDeref(termination["project_id"]) != projectID ||
			(termStatus != "rejected" && termStatus != "escalated") {
			message(w, http.StatusUnprocessableEntity, "Status pengajuan tidak valid untuk dieskalasi.")
			return
		}

		participant, err := terminationParticipant(ctx, pool, projectID, caller.UserID())
		if err != nil {
			slog.Error("termination escalate: participant", "error", err)
			serverError(w)
			return
		}
		if !participant {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		var userName, projectTitle string
		_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, caller.UserID()).Scan(&userName)
		_ = pool.QueryRow(ctx, `SELECT title FROM projects WHERE id = $1`, projectID).Scan(&projectTitle)

		if _, err := pool.Exec(ctx, `UPDATE project_terminations SET status = 'escalated',
			updated_at = date_trunc('second', now()) WHERE id = $1`, terminationID); err != nil {
			slog.Error("termination escalate: update", "error", err)
			serverError(w)
			return
		}

		dispute, created, err := escalateTerminationDispute(ctx, pool, projectID, terminationID,
			caller.UserID(), stringOf(termination["reason"]), projectTitle, userName)
		if err != nil {
			slog.Error("termination escalate: dispute", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLogPool(ctx, pool, projectID, caller.UserID(), "termination_escalated",
			"Perselisihan pembatalan proyek dieskalasi ke admin oleh "+userName+"."); err != nil {
			slog.Error("termination escalate: activity", "error", err)
			serverError(w)
			return
		}

		fresh, _, err := terminationRow(ctx, pool, terminationID)
		if err != nil {
			slog.Error("termination escalate: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Perselisihan berhasil dieskalasi ke Admin Platform. Admin akan melakukan review menyeluruh.")
		payload.Set("data", terminationObject(fresh))
		payload.Set("dispute", dispute)
		_ = created
		writeJSON(w, http.StatusOK, payload)
	}
}

// escalateTerminationDispute is DisputeService::escalateFromTermination:
// return the existing open dispute, or open one attached to the termination.
// The second return reports whether the row was CREATED (create-order wire).
func escalateTerminationDispute(ctx context.Context, pool *pgxpool.Pool, projectID, terminationID, userID int64,
	reason, projectTitle, userName string) (*jsonphp.Object, bool, error) {
	var existingID int64
	err := pool.QueryRow(ctx, `SELECT id FROM project_disputes
		WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&existingID)
	if err == nil {
		row, err := readDisputeRow(ctx, pool, existingID)
		return row, false, err
	}
	if !isNoRows(err) {
		return nil, false, err
	}

	title := "Escalated mutual termination"
	description := "Mutual termination request #" + strconv.FormatInt(terminationID, 10) +
		" was rejected and escalated to platform arbitration.\n\nOriginal reason: " + reason

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)

	var disputeID int64
	var createdAt, updatedAt any
	if err := tx.QueryRow(ctx, `INSERT INTO project_disputes
		(project_id, opened_by, termination_id, category, title, description,
		 disputed_amount, payment_type_id, payment_id, status, created_at, updated_at)
		VALUES ($1, $2, $3, 'termination', $4, $5, NULL, NULL, NULL, 'open',
		 date_trunc('second', now()), date_trunc('second', now()))
		RETURNING id, created_at, updated_at`,
		projectID, userID, terminationID, title, description).Scan(&disputeID, &createdAt, &updatedAt); err != nil {
		return nil, false, err
	}

	if err := insertActivityLog(ctx, tx, projectID, userID, "dispute_opened",
		"Sengketa \""+title+"\" dibuka oleh "+userName+". Pembayaran dibekukan sampai diselesaikan admin."); err != nil {
		return nil, false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}

	body := "\"" + title + "\" was opened on \"" + projectTitle + "\". All project payments are frozen until an admin resolves the dispute."
	insertDisputeNotifications(ctx, pool, projectID, "dispute_opened", "Dispute Opened — Payments Frozen",
		body, `{"project_id":`+strconv.FormatInt(projectID, 10)+`,"dispute_id":`+strconv.FormatInt(disputeID, 10)+`}`, userID)

	entry := jsonphp.NewObject()
	entry.Set("project_id", projectID)
	entry.Set("opened_by", userID)
	entry.Set("termination_id", terminationID)
	entry.Set("category", "termination")
	entry.Set("title", title)
	entry.Set("description", description)
	entry.Set("disputed_amount", nil)
	entry.Set("payment_type", nil)
	entry.Set("payment_id", nil)
	entry.Set("status", "open")
	entry.Set("updated_at", projectTimeValue(updatedAt))
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("id", disputeID)

	return entry, true, nil
}
