package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SUB-PROFESSIONALS — the specialist roster and its lifecycle.
//
// Nine routes, one row shape:
//   - GET  index        participant-gated roster (`user` and
//                       `assigned_by_user` loaded, removed hidden)
//   - POST assign       owner or the parent role's lead pro; the lead's
//                       own profile decides whether a company hire is
//                       auto-accepted; 201 with the loaded user
//   - POST accept       the invitee only, `invited` only
//   - POST decline      the invitee only; writes `removed` (the ENUM has
//                       no `declined`), clears the matching project slot
//                       and tells the assigner
//   - POST interview    assigner only, status interviewing
//   - POST recommend    assigner only, fee + notes, syncs the specialist
//                       bid to recommended
//   - POST hire         owner/PM/lead contractor; recommended rows are
//                       owner-only; rate takes the suggested fee
//   - POST shortlist    assigner only; mints the interviewing roster row
//                       from the bid's price/proposal
//   - DELETE remove     owner or the row's assigner, status removed
//
// The row renders in table order with decimal strings and Carbon times;
// the roster adds the two trimmed relations behind the row.

// subColumns is the sub-professional table order.
var subColumns = []string{
	"id", "project_id", "user_id", "parent_role", "sub_role", "assigned_by",
	"status", "rate", "scope_notes", "lead_pro_notes", "suggested_fee",
	"accepted_at", "recommended_at", "hired_at", "completed_at",
	"created_at", "updated_at",
}

// subObject renders one roster row.
func subObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range subColumns {
		value := byName[column]
		switch column {
		case "rate", "suggested_fee":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "accepted_at", "recommended_at", "hired_at", "completed_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// loadSub reads one roster row bound to the project.
func loadSub(ctx context.Context, pool subQuerier, projectID, subID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, user_id, parent_role, sub_role, assigned_by,
		status::text, rate::text, scope_notes, lead_pro_notes, suggested_fee::text,
		accepted_at, recommended_at, hired_at, completed_at, created_at, updated_at
		FROM project_sub_professionals WHERE id = $1 AND project_id = $2`, subID, projectID)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, false, err
		}
		return nil, false, nil
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

// subObjectCreateOrder renders the model Eloquent CREATED: the
// updateOrCreate match keys first, then the values it set, then the
// timestamps and id — NOT table order.
func subObjectCreateOrder(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("user_id", projectRawValue(byName["user_id"]))
	entry.Set("sub_role", projectRawValue(byName["sub_role"]))
	entry.Set("parent_role", projectRawValue(byName["parent_role"]))
	entry.Set("assigned_by", projectRawValue(byName["assigned_by"]))
	entry.Set("status", projectRawValue(byName["status"]))
	entry.Set("rate", decimalOrNilBid(byName, "rate"))
	entry.Set("scope_notes", projectRawValue(byName["scope_notes"]))
	entry.Set("accepted_at", projectTimeValue(byName["accepted_at"]))
	entry.Set("completed_at", projectTimeValue(byName["completed_at"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// subQuerier is the read surface both the pool and a transaction satisfy.
type subQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// subUserBlock renders the trimmed user relation.
func subUserBlock(ctx context.Context, pool subQuerier, userID int64) any {
	var id int64
	var name string
	var role *string
	rows, err := pool.Query(ctx, `SELECT id, name, role_type::text FROM users WHERE id = $1`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	if !rows.Next() {
		return nil
	}
	if err := rows.Scan(&id, &name, &role); err != nil {
		return nil
	}
	block := jsonphp.NewObject()
	block.Set("id", userID)
	block.Set("name", name)
	block.Set("role_type", nullableString(role))
	return block
}

// subResult reloads one row with the roster's trimmed relations.
func subResult(ctx context.Context, pool *pgxpool.Pool, projectID, subID int64, withRelations bool) (*jsonphp.Object, error) {
	byName, found, err := loadSub(ctx, pool, projectID, subID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, errLedgerGone
	}

	entry := subObject(byName)
	if withRelations {
		var userID, assignedBy *int64
		if v, ok := byName["user_id"].(int64); ok {
			userID = &v
		}
		if v, ok := byName["assigned_by"].(int64); ok {
			assignedBy = &v
		}
		if userID != nil {
			entry.Set("user", subUserBlock(ctx, pool, *userID))
		}
		assigner := jsonphp.NewObject()
		if assignedBy != nil {
			var name string
			if err := pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, *assignedBy).Scan(&name); err == nil {
				assigner.Set("id", *assignedBy)
				assigner.Set("name", name)
			} else {
				assigner = nil
			}
		} else {
			assigner = nil
		}
		entry.Set("assigned_by_user", assigner)
	}

	return entry, nil
}

// subProjectContext is the shared project read for the roster routes.
type subProjectContext struct {
	ownerID      int64
	pmID         *int64
	selectedArch *int64
	selectedCont *int64
	title        string
}

// loadSubProject reads the gate columns and the title.
func loadSubProject(ctx context.Context, pool *pgxpool.Pool, projectID int64) (subProjectContext, bool, error) {
	var out subProjectContext
	err := pool.QueryRow(ctx, `SELECT user_id, pm_id, selected_arsitek_id, selected_kontraktor_id, title FROM projects WHERE id = $1`, projectID).
		Scan(&out.ownerID, &out.pmID, &out.selectedArch, &out.selectedCont, &out.title)
	if err != nil {
		if isNoRows(err) {
			return out, false, nil
		}
		return out, false, err
	}
	return out, true, nil
}

// canAssign reports whether the caller leads the parent role (or owns).
func canAssign(project subProjectContext, viewer *projectViewer, parentRole string) bool {
	if viewer.id == project.ownerID {
		return true
	}
	switch parentRole {
	case "arsitek":
		return project.selectedArch != nil && *project.selectedArch != 0 && viewer.role == "arsitek" &&
			viewer.profiles["arsitek"] == *project.selectedArch
	case "kontraktor":
		return project.selectedCont != nil && *project.selectedCont != 0 && viewer.role == "kontraktor" &&
			viewer.profiles["kontraktor"] == *project.selectedCont
	}
	return false
}

// subIsCompany reports whether the lead's own profile is a company.
func subIsCompany(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer) bool {
	table, ok := bidProfileTable(viewer.role)
	if !ok || (viewer.role != "arsitek" && viewer.role != "kontraktor") {
		return false
	}
	own, ok := viewer.profiles[viewer.role]
	if !ok || own == 0 {
		return false
	}
	var entity *string
	if err := pool.QueryRow(ctx, `SELECT entity_type FROM `+table+` WHERE id = $1`, own).Scan(&entity); err != nil || entity == nil {
		return false
	}
	return strings.EqualFold(*entity, "company")
}

// SubProfessionalsIndexHandler serves
// `GET /api/projects/{project}/sub-professionals`.
func SubProfessionalsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("sub-index: viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("sub-index: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("sub-index: parties", "error", err)
			serverError(w)
			return
		}

		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT id, project_id, user_id, parent_role, sub_role, assigned_by,
			status::text, rate::text, scope_notes, lead_pro_notes, suggested_fee::text,
			accepted_at, recommended_at, hired_at, completed_at, created_at, updated_at
			FROM project_sub_professionals WHERE project_id = $1 AND status::text <> 'removed' ORDER BY id`, projectID)
		if err != nil {
			slog.Error("sub-index: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("sub-index: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}

			entry := subObject(byName)
			if v, ok := byName["user_id"].(int64); ok {
				entry.Set("user", subUserBlock(ctx, pool, v))
			}
			if v, ok := byName["assigned_by"].(int64); ok {
				block := jsonphp.NewObject()
				var name string
				if err := pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, v).Scan(&name); err == nil {
					block.Set("id", v)
					block.Set("name", name)
					entry.Set("assigned_by_user", block)
				} else {
					entry.Set("assigned_by_user", nil)
				}
			} else {
				entry.Set("assigned_by_user", nil)
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("sub-index: rows", "error", err)
			serverError(w)
			return
		}

		_ = viewer
		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// AssignSubProfessionalHandler serves
// `POST /api/projects/{project}/sub-professionals`.
func AssignSubProfessionalHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("sub-assign: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadSubProject(ctx, pool, projectID)
		if err != nil {
			slog.Error("sub-assign: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		parentHint := ""
		if s, ok := formFields["parent_role"].(string); ok {
			parentHint = s
		}

		if !canAssign(project, viewer, parentHint) {
			message(w, http.StatusForbidden, "Unauthorized to assign sub-professionals.")
			return
		}

		failures := &errorBag{}
		input := validateSubAssign(ctx, pool, formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var existingSub int64
		var existingStatus *string
		if err := pool.QueryRow(ctx, `SELECT id, status::text FROM project_sub_professionals
			WHERE project_id = $1 AND user_id = $2 AND sub_role = $3`, projectID, input.userID, input.subRole).
			Scan(&existingSub, &existingStatus); err != nil && !isNoRows(err) {
			slog.Error("sub-assign: existing", "error", err)
			serverError(w)
			return
		}
		if existingStatus != nil && *existingStatus != "removed" {
			message(w, http.StatusUnprocessableEntity, "This professional is already assigned to this project.")
			return
		}

		company := subIsCompany(ctx, pool, viewer)
		status := "invited"
		if company {
			status = "accepted"
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("sub-assign: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var subID int64
		if existingStatus != nil {
			if err := tx.QueryRow(ctx, `UPDATE project_sub_professionals SET parent_role = $2, assigned_by = $3,
				status = $4, rate = $5::numeric, scope_notes = $6,
				accepted_at = CASE WHEN $7 THEN date_trunc('second', now()) ELSE NULL END,
				completed_at = NULL, updated_at = date_trunc('second', now()) WHERE id = $1 RETURNING id`,
				existingSub, input.parentRole, viewer.id, status, input.rateText, input.scopeNotes, company).Scan(&subID); err != nil {
				slog.Error("sub-assign: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if err := tx.QueryRow(ctx, `INSERT INTO project_sub_professionals
				(project_id, user_id, parent_role, sub_role, assigned_by, status, rate, scope_notes,
				 accepted_at, completed_at, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8,
				 CASE WHEN $9 THEN date_trunc('second', now()) ELSE NULL END, NULL,
				 date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
				projectID, input.userID, input.parentRole, input.subRole, viewer.id, status, input.rateText, input.scopeNotes, company).Scan(&subID); err != nil {
				slog.Error("sub-assign: insert", "error", err)
				serverError(w)
				return
			}
		}

		if company {
			linkSubSlot(ctx, tx, projectID, input.subRole, input.userID)
		}

		if err := insertNotification(ctx, tx, input.userID, "sub_professional_invite", "New Sub-Professional Invitation",
			"You have been invited as a "+input.subRole+" for \""+project.title+"\".",
			`{"project_id": `+strconv.FormatInt(projectID, 10)+`, "sub_professional_id": `+strconv.FormatInt(subID, 10)+`}`); err != nil {
			slog.Error("sub-assign: notify", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("sub-assign: commit", "error", err)
			serverError(w)
			return
		}

		entry, err := subResult(ctx, pool, projectID, subID, true)
		if err != nil {
			slog.Error("sub-assign: reload", "error", err)
			serverError(w)
			return
		}

		// The insert branch answers the CREATED model (create order); the
		// update branch answers the loaded one (table order).
		if existingStatus == nil {
			// Rebuild in create order: the object from subResult is table
			// order, so re-read the raw row and re-render.
			if byName, found, lerr := loadSub(ctx, pool, projectID, subID); lerr == nil && found {
				created := subObjectCreateOrder(byName)
				if v, ok := byName["user_id"].(int64); ok {
					created.Set("user", subUserBlock(ctx, pool, v))
				}
				entry = created
			}
		}
		payload := jsonphp.NewObject()
		payload.Set("message", "Sub-professional invited successfully.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusCreated, payload)
	}
}

// subAssignInput is the validated assignment.
type subAssignInput struct {
	userID     int64
	parentRole string
	subRole    string
	rateText   string
	scopeNotes any
}

// validateSubAssign enforces the assign rules in declaration order.
func validateSubAssign(ctx context.Context, pool *pgxpool.Pool, fields map[string]any, failures *errorBag) subAssignInput {
	var input subAssignInput
	input.rateText = "0"

	if raw, present := fields["user_id"]; !present || raw == nil {
		failures.add("user_id", "The user id field is required.")
	} else if text, ok := numericTextOf(raw); !ok || text == "" {
		failures.add("user_id", "The user id field must be an integer.")
	} else if !isIntegerText(text) {
		failures.add("user_id", "The user id field must be an integer.")
	} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
		failures.add("user_id", "The user id field must be an integer.")
	} else {
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)`, parsed).Scan(&exists); err != nil || !exists {
			failures.add("user_id", "The selected user id is invalid.")
		} else {
			input.userID = parsed
		}
	}

	if raw, present := fields["parent_role"]; !present || raw == nil {
		failures.add("parent_role", "The parent role field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("parent_role", "The selected parent role is invalid.")
	} else if s == "" {
		failures.add("parent_role", "The parent role field is required.")
	} else if s != "arsitek" && s != "kontraktor" {
		failures.add("parent_role", "The selected parent role is invalid.")
	} else {
		input.parentRole = s
	}

	if raw, present := fields["sub_role"]; !present || raw == nil {
		failures.add("sub_role", "The sub role field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("sub_role", "The sub role field must be a string.")
	} else if s == "" {
		failures.add("sub_role", "The sub role field is required.")
	} else if len([]rune(s)) > 50 {
		failures.add("sub_role", "The sub role field must not be greater than 50 characters.")
	} else {
		input.subRole = s
	}

	if raw, present := fields["rate"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && strings.TrimSpace(s) == "" {
			// absent
		} else if text, ok := numericTextOf(raw); !ok || text == "" {
			failures.add("rate", "The rate field must be a number.")
		} else if !isNumericText(text) {
			failures.add("rate", "The rate field must be a number.")
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add("rate", "The rate field must be a number.")
		} else if parsed < 0 {
			failures.add("rate", "The rate field must be at least 0.")
		} else {
			input.rateText = strings.TrimSpace(text)
		}
	}

	if raw, present := fields["scope_notes"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("scope_notes", "The scope notes field must be a string.")
		} else if len([]rune(s)) > 1000 {
			failures.add("scope_notes", "The scope notes field must not be greater than 1000 characters.")
		} else if s != "" {
			input.scopeNotes = s
		}
	}

	return input
}

// linkSubSlot points the project slot at the specialist's profile.
func linkSubSlot(ctx context.Context, tx pgx.Tx, projectID int64, subRole string, userID int64) {
	var column, table string
	switch subRole {
	case "structural":
		column, table = "structural_id", "structural_engineers"
	case "mep":
		column, table = "mep_id", "mep_engineers"
	case "interior":
		column, table = "selected_interior_id", "interior_profiles"
	default:
		return
	}

	var profileID *int64
	_ = tx.QueryRow(ctx, `SELECT id FROM `+table+` WHERE user_id = $1 LIMIT 1`, userID).Scan(&profileID)
	if profileID == nil {
		return
	}
	_, _ = tx.Exec(ctx, `UPDATE projects SET `+column+` = $2, updated_at = date_trunc('second', now()) WHERE id = $1`, projectID, *profileID)
}

// unlinkSubSlot clears the slot only when it still points at this user.
func unlinkSubSlot(ctx context.Context, tx pgx.Tx, projectID int64, subRole string, userID int64) {
	var column, table string
	switch subRole {
	case "structural":
		column, table = "structural_id", "structural_engineers"
	case "mep":
		column, table = "mep_id", "mep_engineers"
	case "interior":
		column, table = "selected_interior_id", "interior_profiles"
	default:
		return
	}

	var profileID *int64
	_ = tx.QueryRow(ctx, `SELECT id FROM `+table+` WHERE user_id = $1 LIMIT 1`, userID).Scan(&profileID)
	if profileID == nil {
		return
	}
	_, _ = tx.Exec(ctx, `UPDATE projects SET `+column+` = NULL, updated_at = date_trunc('second', now()) WHERE id = $1 AND `+column+` = $2`, projectID, *profileID)
}

// SubProfessionalDecisionHandler serves the five row-state verbs:
// accept, decline, interview, recommend and hire.
func SubProfessionalDecisionHandler(pool *pgxpool.Pool, verb string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("id")
		if rawID == "" {
			rawID = subPathID(r.URL.Path)
		}
		subID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectSubProfessional`, rawID)
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
			slog.Error("sub-"+verb+": viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadSubProject(ctx, pool, projectID)
		if err != nil {
			slog.Error("sub-"+verb+": project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		byName, found, err := loadSub(ctx, pool, projectID, subID)
		if err != nil {
			slog.Error("sub-"+verb+": load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectSubProfessional`, rawID)
			return
		}

		targetUserID := intPtrDeref(byName["user_id"])
		assignedBy := intPtrDeref(byName["assigned_by"])
		status := ""
		if s, ok := byName["status"].(string); ok {
			status = s
		}
		subRole := ""
		if s, ok := byName["sub_role"].(string); ok {
			subRole = s
		}
		parentRole := ""
		if s, ok := byName["parent_role"].(string); ok {
			parentRole = s
		}

		var formFields map[string]any

		switch verb {
		case "accept":
			if viewer.id != targetUserID {
				message(w, http.StatusForbidden, "Only the invited professional can accept.")
				return
			}
			if status != "invited" {
				message(w, http.StatusUnprocessableEntity, "This invitation is no longer pending.")
				return
			}
		case "decline":
			if viewer.id != targetUserID {
				message(w, http.StatusForbidden, "Only the invited professional can decline.")
				return
			}
			if status != "invited" && status != "accepted" && status != "interviewing" && status != "recommended" {
				message(w, http.StatusUnprocessableEntity, "Cannot decline this assignment.")
				return
			}
		case "interview":
			if !canAssign(project, viewer, parentRole) {
				message(w, http.StatusForbidden, "Unauthorized.")
				return
			}
		case "recommend":
			if !canAssign(project, viewer, parentRole) {
				message(w, http.StatusForbidden, "Unauthorized.")
				return
			}
			fields, _, ferr := requestFields(r)
			if ferr != nil {
				fields = map[string]any{}
			}
			formFields = fields
		case "hire":
			isOwner := viewer.id == project.ownerID
			isPM := viewer.role == "project_manager" && verifyAssignedPM(viewer, project.pmID)
			isLead := project.selectedCont != nil && *project.selectedCont != 0 && viewer.role == "kontraktor" &&
				viewer.profiles["kontraktor"] == *project.selectedCont
			if !isOwner && !isPM && !isLead {
				message(w, http.StatusForbidden, "Only the Owner, Project Manager, or General Contractor can hire sub-professionals.")
				return
			}
			if status == "recommended" && !isOwner {
				message(w, http.StatusForbidden, "Only the owner can hire recommended specialists.")
				return
			}
			if status != "accepted" && status != "recommended" {
				message(w, http.StatusUnprocessableEntity, "Professional must accept the invitation or be recommended first.")
				return
			}
		}

		var feeText, notesText string
		if verb == "recommend" {
			failures := &errorBag{}
			feeText, notesText = validateRecommend(formFields, failures)
			if !failures.empty() {
				failures.write(w)
				return
			}
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("sub-"+verb+": begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		switch verb {
		case "accept":
			if _, err := tx.Exec(ctx, `UPDATE project_sub_professionals SET status = 'accepted', accepted_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, subID); err != nil {
				slog.Error("sub-accept: update", "error", err)
				serverError(w)
				return
			}
			linkSubSlot(ctx, tx, projectID, subRole, targetUserID)
		case "decline":
			if _, err := tx.Exec(ctx, `UPDATE project_sub_professionals SET status = 'removed', completed_at = NULL, updated_at = date_trunc('second', now()) WHERE id = $1`, subID); err != nil {
				slog.Error("sub-decline: update", "error", err)
				serverError(w)
				return
			}
			unlinkSubSlot(ctx, tx, projectID, subRole, targetUserID)
			if assignedBy != 0 {
				var userName string
				_ = tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, viewer.id).Scan(&userName)
				if err := insertNotification(ctx, tx, assignedBy, "sub_professional_declined", "Specialist Assignment Declined",
					userName+" has declined the invitation to join \""+project.title+"\" as a "+subRole+".",
					`{"project_id": `+strconv.FormatInt(projectID, 10)+`, "sub_professional_id": `+strconv.FormatInt(subID, 10)+`}`); err != nil {
					slog.Error("sub-decline: notify", "error", err)
					serverError(w)
					return
				}
			}
		case "interview":
			if _, err := tx.Exec(ctx, `UPDATE project_sub_professionals SET status = 'interviewing', updated_at = date_trunc('second', now()) WHERE id = $1`, subID); err != nil {
				slog.Error("sub-interview: update", "error", err)
				serverError(w)
				return
			}
		case "recommend":
			if _, err := tx.Exec(ctx, `UPDATE project_sub_professionals SET status = 'recommended', suggested_fee = $2::numeric, lead_pro_notes = $3, recommended_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`,
				subID, feeText, notesText); err != nil {
				slog.Error("sub-recommend: update", "error", err)
				serverError(w)
				return
			}
			if subRole == "structural" || subRole == "mep" {
				// The oracle stores `recommended` here; MySQL keeps these two
				// columns as VARCHAR, and the PG mirror's ENUM grew the value
				// in migration 0017 so the port can write it too.
				if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'recommended', is_recommended = true, updated_at = date_trunc('second', now())
					WHERE project_id = $1 AND role::text = $2 AND bidder_user_id = $3`, projectID, subRole, targetUserID); err != nil {
					slog.Error("sub-recommend: bid", "error", err)
					serverError(w)
					return
				}
			}
		case "hire":
			if _, err := tx.Exec(ctx, `UPDATE project_sub_professionals SET status = 'active', hired_at = date_trunc('second', now()),
				rate = CASE WHEN suggested_fee > 0 THEN suggested_fee ELSE rate END,
				updated_at = date_trunc('second', now()) WHERE id = $1`, subID); err != nil {
				slog.Error("sub-hire: update", "error", err)
				serverError(w)
				return
			}
			linkSubSlot(ctx, tx, projectID, subRole, targetUserID)
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("sub-"+verb+": commit", "error", err)
			serverError(w)
			return
		}

		entry, err := subResult(ctx, pool, projectID, subID, false)
		if err != nil {
			slog.Error("sub-"+verb+": reload", "error", err)
			serverError(w)
			return
		}

		messages := map[string]string{
			"accept":    "Invitation accepted.",
			"decline":   "Assignment declined.",
			"interview": "Status updated to interviewing.",
			"recommend": "Specialist recommended to owner.",
			"hire":      "Professional hired successfully.",
		}

		payload := jsonphp.NewObject()
		payload.Set("message", messages[verb])
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateRecommend enforces suggested_fee required|numeric|min:0 and
// lead_pro_notes required|string|max:2000.
func validateRecommend(fields map[string]any, failures *errorBag) (feeText, notes string) {
	raw, present := fields["suggested_fee"]
	if !present || raw == nil {
		failures.add("suggested_fee", "The suggested fee field is required.")
	} else if text, ok := numericTextOf(raw); !ok || text == "" {
		failures.add("suggested_fee", "The suggested fee field must be a number.")
	} else if !isNumericText(text) {
		failures.add("suggested_fee", "The suggested fee field must be a number.")
	} else if _, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("suggested_fee", "The suggested fee field must be a number.")
	} else if parsed, _ := strconv.ParseFloat(text, 64); parsed < 0 {
		failures.add("suggested_fee", "The suggested fee field must be at least 0.")
	} else {
		feeText = strings.TrimSpace(text)
	}

	rawNotes, present := fields["lead_pro_notes"]
	if !present || rawNotes == nil {
		failures.add("lead_pro_notes", "The lead pro notes field is required.")
	} else if s, isStr := rawNotes.(string); !isStr {
		failures.add("lead_pro_notes", "The lead pro notes field must be a string.")
	} else if s == "" {
		failures.add("lead_pro_notes", "The lead pro notes field is required.")
	} else if len([]rune(s)) > 2000 {
		failures.add("lead_pro_notes", "The lead pro notes field must not be greater than 2000 characters.")
	} else {
		notes = s
	}

	return feeText, notes
}

// RemoveSubProfessionalHandler serves
// `DELETE /api/projects/{project}/sub-professionals/{id}`.
func RemoveSubProfessionalHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("id")
		if rawID == "" {
			rawID = subPathID(r.URL.Path)
		}
		subID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectSubProfessional`, rawID)
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
			slog.Error("sub-remove: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadSubProject(ctx, pool, projectID)
		if err != nil {
			slog.Error("sub-remove: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		byName, found, err := loadSub(ctx, pool, projectID, subID)
		if err != nil {
			slog.Error("sub-remove: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectSubProfessional`, rawID)
			return
		}

		assignedBy := intPtrDeref(byName["assigned_by"])
		if viewer.id != project.ownerID && viewer.id != assignedBy {
			message(w, http.StatusForbidden, "Unauthorized to remove this sub-professional.")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_sub_professionals SET status = 'removed', updated_at = date_trunc('second', now()) WHERE id = $1`, subID); err != nil {
			slog.Error("sub-remove: update", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Sub-professional removed.")
	}
}

// ShortlistSubBidHandler serves
// `POST /api/projects/{project}/sub-professionals/shortlist-bid/{role}/{bidId}`.
func ShortlistSubBidHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		role := r.PathValue("role")
		rawBid := r.PathValue("bidId")
		if role == "" || rawBid == "" {
			parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
			for i, segment := range parts {
				if segment == "shortlist-bid" && i+2 < len(parts) {
					role, rawBid = parts[i+1], parts[i+2]
					break
				}
			}
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("sub-shortlist: viewer", "error", err)
			serverError(w)
			return
		}

		project, found, err := loadSubProject(ctx, pool, projectID)
		if err != nil {
			slog.Error("sub-shortlist: project", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		parent := "kontraktor"
		if role == "structural" || role == "mep" {
			parent = "arsitek"
		}
		if !canAssign(project, viewer, parent) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		bidID, parseErr := strconv.ParseInt(rawBid, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\BidStructural`, rawBid)
			return
		}

		var bidderUser int64
		var price, proposal *string
		err = pool.QueryRow(ctx, `SELECT bidder_user_id, price::text, proposal FROM bids
			WHERE id = $1 AND project_id = $2 AND role::text = $3`, bidID, projectID, role).Scan(&bidderUser, &price, &proposal)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\BidStructural`, rawBid)
				return
			}
			slog.Error("sub-shortlist: bid", "error", err)
			serverError(w)
			return
		}

		priceText := "0"
		if price != nil {
			priceText = *price
		}
		var notes any
		if proposal != nil {
			notes = *proposal
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("sub-shortlist: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var subID int64
		var existing int64
		var existingStatus *string
		if err := tx.QueryRow(ctx, `SELECT id, status::text FROM project_sub_professionals
			WHERE project_id = $1 AND user_id = $2 AND sub_role = $3`, projectID, bidderUser, role).
			Scan(&existing, &existingStatus); err != nil && !isNoRows(err) {
			slog.Error("sub-shortlist: existing", "error", err)
			serverError(w)
			return
		}

		if existingStatus != nil {
			if err := tx.QueryRow(ctx, `UPDATE project_sub_professionals SET parent_role = $2, assigned_by = $3,
				status = 'interviewing', rate = $4::numeric, scope_notes = $5,
				updated_at = date_trunc('second', now()) WHERE id = $1 RETURNING id`,
				existing, parent, viewer.id, priceText, notes).Scan(&subID); err != nil {
				slog.Error("sub-shortlist: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if err := tx.QueryRow(ctx, `INSERT INTO project_sub_professionals
				(project_id, user_id, parent_role, sub_role, assigned_by, status, rate, scope_notes, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, 'interviewing', $6::numeric, $7, date_trunc('second', now()), date_trunc('second', now()))
				RETURNING id`,
				projectID, bidderUser, parent, role, viewer.id, priceText, notes).Scan(&subID); err != nil {
				slog.Error("sub-shortlist: insert", "error", err)
				serverError(w)
				return
			}
		}

		if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'shortlisted', updated_at = date_trunc('second', now()) WHERE id = $1`, bidID); err != nil {
			slog.Error("sub-shortlist: bid update", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("sub-shortlist: commit", "error", err)
			serverError(w)
			return
		}

		entry, err := subResult(ctx, pool, projectID, subID, false)
		if err != nil {
			slog.Error("sub-shortlist: reload", "error", err)
			serverError(w)
			return
		}

		if existingStatus == nil {
			if byName, found, lerr := loadSub(ctx, pool, projectID, subID); lerr == nil && found {
				entry = subObjectCreateOrder(byName)
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Bid shortlisted for interview.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// subRouteProject reads the project id or reports the raw segment.
func subRouteProject(r *http.Request) (int64, string, bool) {
	rawProject := r.PathValue("project")
	if rawProject == "" {
		rawProject = projectPathSegment(r.URL.Path)
	}
	projectID, err := strconv.ParseInt(rawProject, 10, 64)
	if err != nil {
		return 0, rawProject, false
	}
	return projectID, rawProject, true
}

// subPathID reads the segment after "sub-professionals", skipping the
// shortlist tail.
func subPathID(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := 0; i+1 < len(parts); i++ {
		if parts[i] == "sub-professionals" && parts[i+1] != "shortlist-bid" {
			return parts[i+1]
		}
	}
	return lastPathSegment(path)
}
