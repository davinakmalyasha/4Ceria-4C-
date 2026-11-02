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

// ENGINEERING / SPECIALIST WORKFLOW — nine routes across two controllers.
//
// Two authorization tiers appear here and must not be conflated:
//   - participation (owner, PM or any hired professional) for ASKING for a
//     role, declining your own recommended bid and submitting an interview;
//   - owner-or-assigned-PM for LIFECYCLE decisions: verifying a request,
//     approving/rejecting a hire, authorizing a specialist, approving the
//     integration. A hired specialist must never authorize their own fee.

// addendumPathID reads `{addendum}`.
func addendumPathID(r *http.Request) (int64, string) {
	raw := r.PathValue("addendum")
	if raw == "" {
		raw = lastPathSegment(r.URL.Path)
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, raw
	}
	return id, raw
}

// addendumForProject loads an addendum and enforces the project binding.
// Returns nil after writing the 404.
func addendumForProject(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter,
	projectID, addendumID int64) (*jsonphp.Object, bool) {
	row, err := loadAddendumRow(ctx, pool, addendumID)
	if err != nil {
		if isNoRows(err) || err == errLedgerGone {
			modelNotFound(w, `App\Models\ProjectAddendum`, strconv.FormatInt(addendumID, 10))
			return nil, false
		}
		slog.Error("addendum: load", "error", err)
		serverError(w)
		return nil, false
	}
	projectValue, ok := row.Get("project_id")
	if !ok || intPtrDeref(projectValue) != projectID {
		message(w, http.StatusNotFound, "Not found.")
		return nil, false
	}
	return row, true
}

// addendumCreatedObject renders the CREATED addendum in create() payload
// order, then updated_at, created_at, id.
func addendumCreatedObject(row *jsonphp.Object) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range []string{
		"project_id", "user_id", "role_type", "type", "title", "description",
		"amount", "status", "assigned_user_id", "team_member_id",
	} {
		value, _ := row.Get(column)
		entry.Set(column, value)
	}
	for _, column := range []string{"updated_at", "created_at", "id"} {
		value, _ := row.Get(column)
		entry.Set(column, value)
	}
	return entry
}

// projectOwnerOrPMLoaded is the owner-or-assigned-PM gate with the project
// row already read.
func projectOwnerOrPMLoaded(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, ownerID int64, pmID *int64) bool {
	if viewer == nil {
		return false
	}
	if viewer.id == ownerID {
		return true
	}
	return verifyAssignedPM(viewer, pmID)
}

// projectAuthContext loads the viewer, owner and pm id for one project.
func projectAuthContext(ctx context.Context, pool *pgxpool.Pool, caller Caller,
	projectID int64) (*projectViewer, int64, *int64, error) {
	viewer, err := loadViewer(ctx, pool, caller)
	if err != nil {
		return nil, 0, nil, err
	}
	var ownerID int64
	var pmID *int64
	if err := pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`,
		projectID).Scan(&ownerID, &pmID); err != nil {
		return nil, 0, nil, err
	}
	return viewer, ownerID, pmID, nil
}

// RequestEngineeringRoleHandler serves
// `POST /api/projects/{project}/request-engineering`.
func RequestEngineeringRoleHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`,
			projectID).Scan(&exists); err != nil {
			slog.Error("request-engineering: project", "error", err)
			serverError(w)
			return
		}
		if !exists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("request-engineering: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("request-engineering: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}

		roleType := ""
		if raw, present := fields["role_type"]; !present || raw == nil {
			failures.add("role_type", "The role type field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("role_type", "The selected role type is invalid.")
		} else if text != "structural" && text != "mep" && text != "interior" {
			failures.add("role_type", "The selected role type is invalid.")
		} else {
			roleType = text
		}

		description := ""
		if raw, present := fields["description"]; !present || raw == nil || (func() bool {
			text, ok := raw.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			failures.add("description", "The description field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("description", "The description field must be a string.")
		} else {
			description = text
		}

		var amount string
		if raw, present := fields["suggested_fee"]; present && raw != nil {
			text, numeric := numericTextOf(raw)
			if !numeric || !isNumericText(text) {
				failures.add("suggested_fee", "The suggested fee field must be a number.")
			} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
				failures.add("suggested_fee", "The suggested fee field must be a number.")
			} else if parsed < 0 {
				failures.add("suggested_fee", "The suggested fee field must be at least 0.")
			} else {
				amount = text
			}
		} else {
			amount = "0"
		}

		var assignedUserID *int64
		if raw, present := fields["assigned_user_id"]; present && raw != nil {
			text, ok := numericTextOf(raw)
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if !ok || err != nil {
				failures.add("assigned_user_id", "The assigned user id field must be an integer.")
			} else if !existsID(ctx, pool, "users", parsed) {
				failures.add("assigned_user_id", "The selected assigned user id is invalid.")
			} else {
				assignedUserID = &parsed
			}
		}

		var teamMemberID *int64
		if raw, present := fields["team_member_id"]; present && raw != nil {
			text, ok := numericTextOf(raw)
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if !ok || err != nil {
				failures.add("team_member_id", "The team member id field must be an integer.")
			} else if !existsID(ctx, pool, "team_members", parsed) {
				failures.add("team_member_id", "The selected team member id is invalid.")
			} else {
				teamMemberID = &parsed
			}
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		title := "Request Specialist: " + ucfirstASCII(roleType)
		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("request-engineering: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var addendumID int64
		if err := tx.QueryRow(ctx, `INSERT INTO project_addendums
			(project_id, user_id, role_type, type, title, description, amount, status, assigned_user_id, team_member_id, created_at, updated_at)
			VALUES ($1, $2, $3, 'specialist_request', $4, $5, $6::numeric, 'pending_approval', $7, $8,
			 date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`,
			projectID, caller.UserID(), roleType, title, description, amount,
			assignedUserID, teamMemberID).Scan(&addendumID); err != nil {
			slog.Error("request-engineering: insert", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "specialist_requested",
			"Architect requested specialist coordination for: "+ucfirstASCII(roleType)+". Description: "+description); err != nil {
			slog.Error("request-engineering: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("request-engineering: commit", "error", err)
			serverError(w)
			return
		}

		row, err := loadAddendumRow(ctx, pool, addendumID)
		if err != nil {
			slog.Error("request-engineering: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Specialist coordination request submitted successfully.")
		payload.Set("data", addendumCreatedObject(row))
		writeJSON(w, http.StatusOK, payload)
	}
}

// VerifyEngineeringRequestHandler serves
// `POST /api/projects/{project}/verify-engineering/{addendum}`.
func VerifyEngineeringRequestHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)
		addendumID, rawAddendum := addendumPathID(r)

		var projectExists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`,
			projectID).Scan(&projectExists); err != nil {
			slog.Error("verify-engineering: project", "error", err)
			serverError(w)
			return
		}
		if !projectExists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		addendum, ok := addendumForProject(ctx, pool, w, projectID, addendumID)
		if !ok {
			return
		}
		_ = rawAddendum

		viewer, ownerID, pmID, err := projectAuthContext(ctx, pool, caller, projectID)
		if err != nil {
			slog.Error("verify-engineering: auth", "error", err)
			serverError(w)
			return
		}
		if !projectOwnerOrPMLoaded(ctx, pool, viewer, ownerID, pmID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		status := ""
		if raw, present := fields["status"]; !present || raw == nil {
			failures.add("status", "The status field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("status", "The selected status is invalid.")
		} else if text != "approved" && text != "rejected" {
			failures.add("status", "The selected status is invalid.")
		} else {
			status = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		roleValue, _ := addendum.Get("role_type")
		specialistValue, _ := addendum.Get("specialist_type")
		role := stringOf(roleValue)
		if role == "" {
			role = stringOf(specialistValue)
		}
		assigned, _ := addendum.Get("assigned_user_id")
		teamMember, _ := addendum.Get("team_member_id")

		newStatus := "rejected"
		if status == "approved" {
			if intPtrDeref(assigned) != 0 || intPtrDeref(teamMember) != 0 {
				newStatus = "approved_unpaid"
			} else {
				newStatus = "authorized"
			}
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("verify-engineering: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = $2,
			updated_at = date_trunc('second', now()) WHERE id = $1`, addendumID, newStatus); err != nil {
			slog.Error("verify-engineering: update", "error", err)
			serverError(w)
			return
		}

		if status == "approved" {
			column := ""
			switch role {
			case "structural":
				column = "requires_structural"
			case "mep":
				column = "requires_mep"
			case "interior":
				column = "requires_interior"
			}
			if column != "" {
				if _, err := tx.Exec(ctx, `UPDATE projects SET `+column+` = true,
					updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
					slog.Error("verify-engineering: project flag", "error", err)
					serverError(w)
					return
				}
			}
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "engineering_request_verified",
			"PM "+status+" specialist request for: "+ucfirstASCII(role)); err != nil {
			slog.Error("verify-engineering: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("verify-engineering: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Request "+status)
	}
}

// ApproveEngineeringHireHandler serves
// `POST /api/projects/{project}/approve-engineering-hire/{addendum}`.
func ApproveEngineeringHireHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return engineeringHireDecision(pool, "authorized", "engineering_hire_approved",
		"Owner approved hiring for ", "Hiring approved. Awaiting payment.")
}

// RejectEngineeringHireHandler serves
// `POST /api/projects/{project}/reject-engineering-hire/{addendum}`.
func RejectEngineeringHireHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return engineeringHireDecision(pool, "rejected", "engineering_hire_rejected",
		"Owner rejected hiring for ", "Hiring rejected.")
}

// engineeringHireDecision is the shared approve/reject hire body.
func engineeringHireDecision(pool *pgxpool.Pool, newStatus, action, detailsPrefix, responseMessage string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)
		addendumID, _ := addendumPathID(r)

		var projectExists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`,
			projectID).Scan(&projectExists); err != nil {
			slog.Error("engineering-hire: project", "error", err)
			serverError(w)
			return
		}
		if !projectExists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		addendum, ok := addendumForProject(ctx, pool, w, projectID, addendumID)
		if !ok {
			return
		}

		viewer, ownerID, pmID, err := projectAuthContext(ctx, pool, caller, projectID)
		if err != nil {
			slog.Error("engineering-hire: auth", "error", err)
			serverError(w)
			return
		}
		if !projectOwnerOrPMLoaded(ctx, pool, viewer, ownerID, pmID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		roleValue, _ := addendum.Get("role_type")
		specialistValue, _ := addendum.Get("specialist_type")
		label := stringOf(roleValue)
		if label == "" {
			label = stringOf(specialistValue)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("engineering-hire: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = $2,
			updated_at = date_trunc('second', now()) WHERE id = $1`, addendumID, newStatus); err != nil {
			slog.Error("engineering-hire: update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), action,
			detailsPrefix+label); err != nil {
			slog.Error("engineering-hire: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("engineering-hire: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, responseMessage)
	}
}

// ApproveEngineeringIntegrationHandler serves
// `POST /api/projects/{project}/approve-engineering`.
func ApproveEngineeringIntegrationHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		var projectExists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`,
			projectID).Scan(&projectExists); err != nil {
			slog.Error("approve-engineering: project", "error", err)
			serverError(w)
			return
		}
		if !projectExists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		viewer, ownerID, pmID, err := projectAuthContext(ctx, pool, caller, projectID)
		if err != nil {
			slog.Error("approve-engineering: auth", "error", err)
			serverError(w)
			return
		}
		if !projectOwnerOrPMLoaded(ctx, pool, viewer, ownerID, pmID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		roleType := ""
		if raw, present := fields["role_type"]; !present || raw == nil {
			failures.add("role_type", "The role type field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("role_type", "The selected role type is invalid.")
		} else if text != "structural" && text != "mep" && text != "interior" {
			failures.add("role_type", "The selected role type is invalid.")
		} else {
			roleType = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("approve-engineering: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		column := ""
		switch roleType {
		case "structural":
			column = "structural_approved_at"
		case "mep":
			column = "mep_approved_at"
		case "interior":
			column = "interior_completed_at"
		}
		if _, err := tx.Exec(ctx, `UPDATE projects SET `+column+` = date_trunc('second', now()),
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("approve-engineering: update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "engineering_integrated",
			"Formally approved "+ucfirstASCII(roleType)+" integration."); err != nil {
			slog.Error("approve-engineering: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("approve-engineering: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Integration approved.")
	}
}

// authorizeSpecialistBody validates `role_type` + `addendum_id`.
func authorizeSpecialistBody(ctx context.Context, pool *pgxpool.Pool, fields map[string]any,
	failures *errorBag) (string, int64) {
	roleType := ""
	if raw, present := fields["role_type"]; !present || raw == nil {
		failures.add("role_type", "The role type field is required.")
	} else if text, ok := raw.(string); !ok {
		failures.add("role_type", "The selected role type is invalid.")
	} else if text != "structural" && text != "mep" && text != "interior" {
		failures.add("role_type", "The selected role type is invalid.")
	} else {
		roleType = text
	}

	var addendumID int64
	if raw, present := fields["addendum_id"]; !present || raw == nil {
		failures.add("addendum_id", "The addendum id field is required.")
	} else {
		text, ok := numericTextOf(raw)
		parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
		if !ok || err != nil {
			failures.add("addendum_id", "The addendum id field must be an integer.")
		} else if !existsID(ctx, pool, "project_addendums", parsed) {
			failures.add("addendum_id", "The selected addendum id is invalid.")
		} else {
			addendumID = parsed
		}
	}

	return roleType, addendumID
}

// AuthorizeSpecialistHandler serves
// `POST /api/projects/{project}/authorize-specialist`.
func AuthorizeSpecialistHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		var projectExists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`,
			projectID).Scan(&projectExists); err != nil {
			slog.Error("authorize-specialist: project", "error", err)
			serverError(w)
			return
		}
		if !projectExists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		viewer, ownerID, pmID, err := projectAuthContext(ctx, pool, caller, projectID)
		if err != nil {
			slog.Error("authorize-specialist: auth", "error", err)
			serverError(w)
			return
		}
		if !projectOwnerOrPMLoaded(ctx, pool, viewer, ownerID, pmID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		roleType, addendumID := authorizeSpecialistBody(ctx, pool, fields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		addendum, ok := addendumForProject(ctx, pool, w, projectID, addendumID)
		if !ok {
			return
		}
		_ = addendum

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("authorize-specialist: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = 'authorized',
			updated_at = date_trunc('second', now()) WHERE id = $1`, addendumID); err != nil {
			slog.Error("authorize-specialist: update", "error", err)
			serverError(w)
			return
		}

		var specialistType string
		var recommendedBidID *int64
		_ = tx.QueryRow(ctx, `SELECT COALESCE(specialist_type, ''), recommended_bid_id
			FROM project_addendums WHERE id = $1`, addendumID).Scan(&specialistType, &recommendedBidID)
		if specialistType == "platform_hired" && recommendedBidID != nil {
			role := roleType
			if _, ok := bidProfileColumn(role); ok {
				if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'awaiting_payment',
					updated_at = date_trunc('second', now())
					WHERE project_id = $1 AND role::text = $2
					  AND (id = $3 OR legacy_id = $3)`,
					projectID, role, *recommendedBidID); err != nil {
					slog.Error("authorize-specialist: bid", "error", err)
					serverError(w)
					return
				}
			}
		}

		title := ""
		if titleValue, ok := addendum.Get("title"); ok {
			title = stringOf(titleValue)
		}
		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "specialist_authorized",
			"Authorized hiring of "+ucfirstASCII(roleType)+" specialist: "+title); err != nil {
			slog.Error("authorize-specialist: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("authorize-specialist: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Specialist hiring authorized. Awaiting payment.")
	}
}

// RejectSpecialistHandler serves
// `POST /api/projects/{project}/reject-specialist`.
func RejectSpecialistHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		var projectExists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`,
			projectID).Scan(&projectExists); err != nil {
			slog.Error("reject-specialist: project", "error", err)
			serverError(w)
			return
		}
		if !projectExists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		viewer, ownerID, pmID, err := projectAuthContext(ctx, pool, caller, projectID)
		if err != nil {
			slog.Error("reject-specialist: auth", "error", err)
			serverError(w)
			return
		}
		if !projectOwnerOrPMLoaded(ctx, pool, viewer, ownerID, pmID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		roleType, addendumID := authorizeSpecialistBody(ctx, pool, fields, failures)

		var reason any
		if raw, present := fields["reason"]; present && raw != nil {
			if text, ok := raw.(string); !ok {
				failures.add("reason", "The reason field must be a string.")
			} else {
				reason = text
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		if _, ok := addendumForProject(ctx, pool, w, projectID, addendumID); !ok {
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("reject-specialist: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = 'rejected',
			negotiation_note = $2, updated_at = date_trunc('second', now()) WHERE id = $1`,
			addendumID, reason); err != nil {
			slog.Error("reject-specialist: update", "error", err)
			serverError(w)
			return
		}

		reasonText := "No reason provided"
		if reason != nil {
			reasonText = stringOf(reason)
		}
		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "specialist_rejected",
			"Rejected hiring of "+ucfirstASCII(roleType)+" specialist. Reason: "+reasonText); err != nil {
			slog.Error("reject-specialist: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("reject-specialist: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Specialist hiring rejected.")
	}
}

// engineeringBid loads the bid by WIRE id within the project.
func engineeringBid(ctx context.Context, pool *pgxpool.Pool, projectID int64,
	role string, wireID int64) ([]string, []any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT * FROM bids
		WHERE project_id = $1 AND role::text = $2 AND (id = $3 OR legacy_id = $3)
		ORDER BY CASE WHEN legacy_id = $3 THEN 0 ELSE 1 END, id LIMIT 1`,
		projectID, role, wireID)
	if err != nil {
		return nil, nil, false, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, nil, false, rows.Err()
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, nil, false, err
	}
	return fields, values, true, rows.Err()
}

// RejectEngineeringBidHandler serves
// `POST /api/projects/{project}/reject-engineering-bid/{bidId}`.
func RejectEngineeringBidHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		rawBid := r.PathValue("bidId")
		if rawBid == "" {
			rawBid = lastPathSegment(r.URL.Path)
		}

		var projectExists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`,
			projectID).Scan(&projectExists); err != nil {
			slog.Error("reject-engineering-bid: project", "error", err)
			serverError(w)
			return
		}
		if !projectExists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("reject-engineering-bid: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("reject-engineering-bid: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		bidType := ""
		if raw, present := fields["bid_type"]; !present || raw == nil {
			failures.add("bid_type", "The bid type field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("bid_type", "The selected bid type is invalid.")
		} else if text != "structural" && text != "mep" {
			failures.add("bid_type", "The selected bid type is invalid.")
		} else {
			bidType = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		bidID, err := strconv.ParseInt(rawBid, 10, 64)
		if err != nil {
			message(w, http.StatusNotFound, "Bid not found.")
			return
		}

		bidFields, bidValues, found, err := engineeringBid(ctx, pool, projectID, bidType, bidID)
		if err != nil {
			slog.Error("reject-engineering-bid: bid", "error", err)
			serverError(w)
			return
		}
		if !found {
			message(w, http.StatusNotFound, "Bid not found.")
			return
		}
		bidByName := projectColumnsByName(bidFields, bidValues)
		wireID := bidWireID(bidByName)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("reject-engineering-bid: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'declined',
			updated_at = date_trunc('second', now())
			WHERE project_id = $1 AND role::text = $2 AND (id = $3 OR legacy_id = $3)`,
			projectID, bidType, bidID); err != nil {
			slog.Error("reject-engineering-bid: update", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = 'rejected',
			updated_at = date_trunc('second', now())
			WHERE project_id = $1 AND recommended_bid_id = $2
			  AND type IN ('specialist_request', 'specialist_assignment')`,
			projectID, wireID); err != nil {
			slog.Error("reject-engineering-bid: addendums", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "specialist_rejected",
			"Rejected the recommended "+ucfirstASCII(bidType)+" engineer."); err != nil {
			slog.Error("reject-engineering-bid: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("reject-engineering-bid: commit", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Recommendation rejected.")
	}
}

// SubmitEngineeringInterviewHandler serves
// `POST /api/projects/{project}/submit-engineering-interview`.
func SubmitEngineeringInterviewHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		var ownerID int64
		var projectTitle string
		var selectedArsitek *int64
		if err := pool.QueryRow(ctx, `SELECT user_id, title, selected_arsitek_id
			FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &projectTitle, &selectedArsitek); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("interview: project", "error", err)
			serverError(w)
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("interview: viewer", "error", err)
			serverError(w)
			return
		}
		columns, err := projectHireColumns(ctx, pool, projectID)
		if err != nil {
			slog.Error("interview: columns", "error", err)
			serverError(w)
			return
		}
		isArchitect := selectedArsitek != nil && *selectedArsitek != 0 &&
			viewer.role == "arsitek" && hireMatches(viewer, columns, "arsitek")
		if !isArchitect {
			message(w, http.StatusForbidden, "Unauthorized. Only the Project Architect can interview specialized engineers.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}

		var bidID int64
		if raw, present := fields["bid_id"]; !present || raw == nil {
			failures.add("bid_id", "The bid id field is required.")
		} else {
			text, ok := numericTextOf(raw)
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if !ok || err != nil {
				failures.add("bid_id", "The bid id field must be an integer.")
			} else {
				bidID = parsed
			}
		}

		bidType := ""
		if raw, present := fields["bid_type"]; !present || raw == nil {
			failures.add("bid_type", "The bid type field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("bid_type", "The selected bid type is invalid.")
		} else if text != "structural" && text != "mep" {
			failures.add("bid_type", "The selected bid type is invalid.")
		} else {
			bidType = text
		}

		interviewNotes := ""
		if raw, present := fields["interview_notes"]; !present || raw == nil || (func() bool {
			text, ok := raw.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			failures.add("interview_notes", "The interview notes field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("interview_notes", "The interview notes field must be a string.")
		} else {
			interviewNotes = text
		}

		recommended := false
		recommendedPresent := false
		if raw, present := fields["is_recommended"]; !present || raw == nil {
			failures.add("is_recommended", "The is recommended field is required.")
		} else if value, ok := parseLaravelBoolean(raw); ok {
			recommended = value
			recommendedPresent = true
		} else {
			failures.add("is_recommended", "The is recommended field must be true or false.")
		}
		if !failures.empty() {
			failures.write(w)
			return
		}
		_ = recommendedPresent

		bidFields, bidValues, found, err := engineeringBid(ctx, pool, projectID, bidType, bidID)
		if err != nil {
			slog.Error("interview: bid", "error", err)
			serverError(w)
			return
		}
		if !found {
			scopedNotFound(w, `App\Models\Bid`+strings.ToUpper(bidType[:1])+bidType[1:])
			return
		}
		bidByName := projectColumnsByName(bidFields, bidValues)
		wireID := bidWireID(bidByName)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("interview: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		status := "recommended"
		if recommended {
			if _, err := tx.Exec(ctx, `UPDATE bids SET interview_notes = $2, is_recommended = true,
				status = $3, updated_at = date_trunc('second', now())
				WHERE project_id = $1 AND role::text = $4 AND (id = $5 OR legacy_id = $5)`,
				projectID, interviewNotes, status, bidType, bidID); err != nil {
				slog.Error("interview: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if _, err := tx.Exec(ctx, `UPDATE bids SET interview_notes = $2, is_recommended = false,
				updated_at = date_trunc('second', now())
				WHERE project_id = $1 AND role::text = $3 AND (id = $4 OR legacy_id = $4)`,
				projectID, interviewNotes, bidType, bidID); err != nil {
				slog.Error("interview: update", "error", err)
				serverError(w)
				return
			}
		}

		if recommended && ownerID != 0 {
			body := "Your architect has recommended a " + bidType + " engineer for \"" + projectTitle + "\". Please review and authorize."
			data := `{"bid_id":` + strconv.FormatInt(wireID, 10) + `,"bid_type":"` + bidType +
				`","project_id":` + strconv.FormatInt(projectID, 10) + `}`
			if _, err := tx.Exec(ctx, `INSERT INTO notifications
				(user_id, type, title, body, data, created_at, updated_at)
				VALUES ($1, 'specialist_recommendation', 'Architect Specialist Recommendation', $2, $3::jsonb,
				 date_trunc('second', now()), date_trunc('second', now()))`,
				ownerID, body, data); err != nil {
				slog.Warn("interview: notify", "error", err)
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("interview: commit", "error", err)
			serverError(w)
			return
		}

		freshFields, freshValues, _, err := engineeringBid(ctx, pool, projectID, bidType, bidID)
		if err != nil {
			slog.Error("interview: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Interview notes saved and recommendation updated.")
		payload.Set("data", rawBidObject(bidType, freshFields, freshValues))
		writeJSON(w, http.StatusOK, payload)
	}
}

// parseLaravelBoolean reads a `boolean` rule value.
func parseLaravelBoolean(value any) (bool, bool) {
	switch typed := value.(type) {
	case bool:
		return typed, true
	case float64:
		if typed == 1 {
			return true, true
		}
		if typed == 0 {
			return false, true
		}
		return false, false
	case string:
		switch strings.TrimSpace(typed) {
		case "1":
			return true, true
		case "0":
			return false, true
		}
		return false, false
	default:
		return false, false
	}
}
