package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT WRITES — invite, mark-complete and delete.
//
//   - `POST /projects/{project}/invite` lets the owner, the project's
//     hired architect or the assigned PM mint an `invited` bid (price 0,
//     the fixed proposal sentence), log the invite and notify the
//     professional. A professional who already holds a bid on the
//     project is refused with a 422.
//   - `POST /projects/{project}/mark-complete` is owner-only and flips
//     the status to completed behind the completed/cancelled guards,
//     answering the lean ProjectResource.
//   - `DELETE /projects/{project}` is owner-only and refuses while the
//     project has any hired professional, any paid or verifying payment,
//     or any site progress; otherwise it terminates the pending bids
//     (the ENUM has no `cancelled` — this is the historical 1265 bug)
//     and soft-deletes the project.
//
// All three answer the application's bare `{"message":…}` envelope on
// the guard paths; invite and mark-complete add their payload key.

// inviteRoleField maps the request role to its unified-bid profile column.
func inviteRoleField(role string) (string, bool) {
	switch role {
	case "arsitek":
		return "arsitek_id", true
	case "kontraktor":
		return "kontraktor_id", true
	case "notaris":
		return "notaris_id", true
	case "interior":
		return "interior_id", true
	case "project_manager":
		return "pm_id", true
	case "structural":
		return "structural_id", true
	case "mep":
		return "mep_id", true
	}
	return "", false
}

// InviteProfessionalHandler serves
// `POST /api/projects/{project}/invite`.
func InviteProfessionalHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("invite: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("invite: project", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)
		var pmID *int64
		if id, ok := byName["pm_id"].(int64); ok {
			pmID = &id
		}
		var selectedArsitek *int64
		if id, ok := byName["selected_arsitek_id"].(int64); ok {
			selectedArsitek = &id
		}

		isOwner := viewer.id == ownerID
		isArchitect := selectedArsitek != nil && *selectedArsitek != 0 && viewer.role == "arsitek" &&
			viewer.profiles["arsitek"] == *selectedArsitek
		isPM := viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID)

		if !isOwner && !isArchitect && !isPM {
			message(w, http.StatusForbidden, "Unauthorized. Only the owner, assigned architect, or project manager can invite professionals.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		professionalID, roleType := validateInvite(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		roleColumn, ok := inviteRoleField(roleType)
		if !ok {
			failures.add("role_type", "The selected role type is invalid.")
			failures.write(w)
			return
		}

		table, ok := bidProfileTable(roleType)
		if !ok {
			failures.add("role_type", "The selected role type is invalid.")
			failures.write(w)
			return
		}

		var proUserID *int64
		var proNama *string
		if err := pool.QueryRow(ctx, `SELECT user_id, nama FROM `+table+` WHERE id = $1`, professionalID).Scan(&proUserID, &proNama); err != nil {
			message(w, http.StatusUnprocessableEntity, "The invited professional could not be found for this role.")
			return
		}

		var existing int64
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM bids WHERE project_id = $1 AND role::text = $2 AND `+roleColumn+` = $3`,
			projectID, roleType, professionalID).Scan(&existing); err != nil {
			slog.Error("invite: existing", "error", err)
			serverError(w)
			return
		}
		if existing > 0 {
			message(w, http.StatusUnprocessableEntity, "This professional already has a bid or invitation for this project.")
			return
		}

		if proUserID == nil || *proUserID == 0 {
			message(w, http.StatusUnprocessableEntity, "The invited professional could not be found for this role.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("invite: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var bidID int64
		if err := tx.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, `+roleColumn+`, price, proposal, status, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $4, 0, 'You have been invited to join this project by the owner.', 'invited', date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`,
			projectID, roleType, *proUserID, professionalID).Scan(&bidID); err != nil {
			slog.Error("invite: insert", "error", err)
			serverError(w)
			return
		}

		proName := ""
		if proNama != nil && *proNama != "" {
			proName = *proNama
		} else {
			var userName *string
			_ = tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, *proUserID).Scan(&userName)
			if userName != nil {
				proName = *userName
			}
		}
		if proName == "" {
			proName = "Professional #" + strconv.FormatInt(professionalID, 10)
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "professional_invited",
			"Invited "+proName+" ("+roleType+") to bid on project."); err != nil {
			slog.Error("invite: log", "error", err)
			serverError(w)
			return
		}

		var projectTitle string
		_ = tx.QueryRow(ctx, `SELECT title FROM projects WHERE id = $1`, projectID).Scan(&projectTitle)

		data := `{"bid_id": ` + strconv.FormatInt(bidID, 10) +
			`, "role_type": ` + mysqlJSONStr(roleType) +
			`, "project_id": ` + strconv.FormatInt(projectID, 10) + `}`
		if err := insertNotification(ctx, tx, *proUserID, "project_invitation", "New Project Invitation!",
			"You have been invited to participate in the project \""+projectTitle+"\".", data); err != nil {
			slog.Error("invite: notify", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("invite: commit", "error", err)
			serverError(w)
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+bidsColumns+` FROM bids WHERE id = $1`, bidID)
		if err != nil {
			slog.Error("invite: reload", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		if !rows.Next() {
			serverError(w)
			return
		}
		bidFields := fieldNames(rows)
		if _, err := scanRow(rows, len(bidFields)); err != nil {
			slog.Error("invite: scan", "error", err)
			serverError(w)
			return
		}

		var createdAt, updatedAt any
		_ = pool.QueryRow(ctx, `SELECT created_at, updated_at FROM bids WHERE id = $1`, bidID).Scan(&createdAt, &updatedAt)

		// Eloquent answers the CREATED model, not the re-read row: only
		// the attributes the create() sent (plus timestamps and id)
		// appear, in create order. The other columns keep their DB
		// defaults invisibly.
		bid := jsonphp.NewObject()
		bid.Set("project_id", projectID)
		bid.Set(roleColumn, professionalID)
		bid.Set("price", "0.00")
		bid.Set("proposal", "You have been invited to join this project by the owner.")
		bid.Set("status", "invited")
		bid.Set("updated_at", projectTimeValue(updatedAt))
		bid.Set("created_at", projectTimeValue(createdAt))
		bid.Set("id", bidID)

		payload := jsonphp.NewObject()
		payload.Set("message", "Invitation sent successfully.")
		payload.Set("bid", bid)

		writeJSON(w, http.StatusOK, payload)
	}
}

// validateInvite enforces professional_id required|integer and role_type
// required|in:7 (integer text and integral floats pass, like Laravel).
func validateInvite(fields map[string]any, failures *errorBag) (professionalID int64, roleType string) {
	rawID, present := fields["professional_id"]
	if !present || rawID == nil {
		failures.add("professional_id", "The professional id field is required.")
	} else if text, ok := numericTextOf(rawID); !ok {
		failures.add("professional_id", "The professional id field must be an integer.")
	} else if !isIntegerText(text) {
		failures.add("professional_id", "The professional id field must be an integer.")
	} else if parsed, err := strconv.ParseInt(text, 10, 64); err != nil {
		failures.add("professional_id", "The professional id field must be an integer.")
	} else {
		professionalID = parsed
	}

	rawRole, present := fields["role_type"]
	if !present || rawRole == nil {
		failures.add("role_type", "The role type field is required.")
	} else if s, isStr := rawRole.(string); !isStr {
		failures.add("role_type", "The selected role type is invalid.")
	} else if s == "" {
		failures.add("role_type", "The role type field is required.")
	} else if _, ok := inviteRoleField(s); !ok {
		failures.add("role_type", "The selected role type is invalid.")
	} else {
		roleType = s
	}

	return professionalID, roleType
}

// MarkCompleteHandler serves
// `POST /api/projects/{project}/mark-complete`.
func MarkCompleteHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("complete: viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var status string
		if err := pool.QueryRow(ctx, `SELECT user_id, status::text FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &status); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("complete: project", "error", err)
			serverError(w)
			return
		}

		if viewer.id != ownerID {
			message(w, http.StatusForbidden, "Only the project owner can complete the project.")
			return
		}

		if status == "completed" {
			message(w, http.StatusUnprocessableEntity, "Project is already completed.")
			return
		}
		if status == "cancelled" {
			message(w, http.StatusUnprocessableEntity, "Cannot complete a cancelled project.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("complete: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET status = 'completed', completed_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("complete: update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "project_completed",
			"Project marked as complete by owner."); err != nil {
			slog.Error("complete: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("complete: commit", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("complete: reload", "error", err)
			serverError(w)
			return
		}

		entry, err := projectResource(ctx, pool, fields, values, viewer, projectLoad{budgetSummary: true}, nil, nil)
		if err != nil {
			slog.Error("complete: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Project completed successfully.")
		payload.Set("data", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// DestroyProjectHandler serves `DELETE /api/projects/{project}`.
func DestroyProjectHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("destroy: viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var hired int
		if err := pool.QueryRow(ctx, `SELECT user_id,
			CASE WHEN selected_arsitek_id IS NOT NULL OR selected_kontraktor_id IS NOT NULL
			       OR selected_notaris_id IS NOT NULL OR selected_interior_id IS NOT NULL
			       OR pm_id IS NOT NULL OR structural_id IS NOT NULL OR mep_id IS NOT NULL
			     THEN 1 ELSE 0 END
			FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &hired); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("destroy: project", "error", err)
			serverError(w)
			return
		}

		if viewer.id != ownerID {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		if hired != 0 {
			message(w, http.StatusUnprocessableEntity, "Proyek tidak bisa dihapus karena sudah ada profesional yang disewa. Silakan gunakan pengajuan Pembatalan Bersama (Mutual Termination).")
			return
		}

		var financial bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_payment_termins WHERE project_id = $1 AND status::text IN ('paid','verifying'))`, projectID).Scan(&financial); err != nil {
			slog.Error("destroy: financial", "error", err)
			serverError(w)
			return
		}
		if financial {
			message(w, http.StatusUnprocessableEntity, "Proyek tidak bisa dihapus karena terdapat transaksi pembayaran yang sudah diverifikasi atau sedang dalam proses verifikasi bukti transfer.")
			return
		}

		var progress bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_daily_logs WHERE project_id = $1)
			OR EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND status::text = 'active')`, projectID).Scan(&progress); err != nil {
			slog.Error("destroy: progress", "error", err)
			serverError(w)
			return
		}
		if progress {
			message(w, http.StatusUnprocessableEntity, "Proyek tidak bisa dihapus karena progress pembangunan lapangan sudah berjalan.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("destroy: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'terminated', updated_at = date_trunc('second', now())
			WHERE project_id = $1 AND status::text = 'pending'`, projectID); err != nil {
			slog.Error("destroy: bids", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE projects SET deleted_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("destroy: delete", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("destroy: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Proyek berhasil dihapus.")
	}
}
