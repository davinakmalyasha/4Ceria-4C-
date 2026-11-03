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

// PHASE BRIEF LIFECYCLE + KICKOFF + REVIEWS.
//
// Four endpoints return the project resource with a hand-picked load spec,
// and one returns the review row. The approve/revise pair never loads a
// relation, so their `owner` is null — that is `ownerAbsent`, not a bug.

// projectPathID reads the route-bound project id.
func projectPathID(r *http.Request) (int64, string) {
	raw := r.PathValue("project")
	if raw == "" {
		raw = lastPathSegment(r.URL.Path)
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || raw == "" {
		return 0, raw
	}
	return id, raw
}

// projectRowForResource loads a project and its viewer, or writes the 404.
func projectRowForResource(ctx context.Context, pool *pgxpool.Pool,
	caller Caller, projectID int64) ([]string, []any, *projectViewer, error) {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		return nil, nil, nil, err
	}
	viewer, err := loadViewer(ctx, pool, caller)
	if err != nil {
		return nil, nil, nil, err
	}
	return fields, values, viewer, nil
}

// renderProjectAnswer writes `{"data": ProjectResource}`.
func renderProjectAnswer(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter,
	projectID int64, viewer *projectViewer, spec projectLoad) {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		slog.Error("project answer: reload", "error", err)
		serverError(w)
		return
	}

	entry, err := projectResource(ctx, pool, fields, values, viewer, spec, nil, nil)
	if err != nil {
		slog.Error("project answer: render", "error", err)
		serverError(w)
		return
	}

	payload := jsonphp.NewObject()
	payload.Set("data", entry)
	writeJSON(w, http.StatusOK, payload)
}

// projectOwnerOrPM is the owner-or-assigned-PM gate.
func projectOwnerOrPM(viewer *projectViewer, fields []string, values []any) bool {
	if viewer == nil {
		return false
	}
	ownerID := projectInt(values, fields, "user_id")
	if viewer.id == ownerID {
		return true
	}
	return verifyAssignedPM(viewer, projectIntPtr(values, fields, "pm_id"))
}

// approveConstructionBriefHandler serves
// `POST /api/projects/{project}/approve-construction-brief`.
func ApproveConstructionBriefHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, raw := projectPathID(r)

		fields, values, viewer, err := projectRowForResource(ctx, pool, caller, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("approve brief: load", "error", err)
			serverError(w)
			return
		}

		if !projectOwnerOrPM(viewer, fields, values) {
			message(w, http.StatusForbidden, "Only the Project Owner or PM can approve the construction brief.")
			return
		}

		if stringOf(projectText(values, fields, "construction_brief_status")) != "pending_review" {
			message(w, http.StatusUnprocessableEntity, "Brief is not pending review.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("approve brief: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET construction_brief_status = 'approved',
			construction_locked_at = date_trunc('second', now()),
			construction_brief_revision_notes = NULL,
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("approve brief: update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "construction_brief_approved",
			"Construction brief approved and locked. Contractor may proceed once PBG is verified."); err != nil {
			slog.Error("approve brief: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("approve brief: commit", "error", err)
			serverError(w)
			return
		}

		renderProjectAnswer(ctx, pool, w, projectID, viewer, projectLoad{budgetSummary: true})
	}
}

// ReviseConstructionBriefHandler serves
// `POST /api/projects/{project}/revise-construction-brief`.
func ReviseConstructionBriefHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, raw := projectPathID(r)

		fields, values, viewer, err := projectRowForResource(ctx, pool, caller, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("revise brief: load", "error", err)
			serverError(w)
			return
		}

		if !projectOwnerOrPM(viewer, fields, values) {
			message(w, http.StatusForbidden, "Only the Project Owner or PM can request revision.")
			return
		}

		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}
		failures := &errorBag{}
		notesAny, present := body["notes"]
		notes := ""
		switch {
		case !present || notesAny == nil || (func() bool {
			text, ok := notesAny.(string)
			return ok && strings.TrimSpace(text) == ""
		}()):
			failures.add("notes", "The notes field is required.")
		default:
			text, ok := notesAny.(string)
			if !ok {
				failures.add("notes", "The notes field must be a string.")
			} else if len([]rune(text)) > 2000 {
				failures.add("notes", "The notes field must not be greater than 2000 characters.")
			} else {
				notes = text
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("revise brief: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET construction_brief_status = 'revision_requested',
			construction_brief_revision_notes = $2, construction_locked_at = NULL,
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID, notes); err != nil {
			slog.Error("revise brief: update", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "construction_brief_revision",
			"Revision requested: "+notes); err != nil {
			slog.Error("revise brief: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("revise brief: commit", "error", err)
			serverError(w)
			return
		}

		renderProjectAnswer(ctx, pool, w, projectID, viewer, projectLoad{budgetSummary: true})
	}
}

// LockPhaseBriefHandler serves `POST /api/projects/{project}/lock-brief`.
//
// `design` locks the design brief (the assigned architect only); `build`
// SUBMITS the construction brief for review (the assigned contractor only).
func LockPhaseBriefHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, raw := projectPathID(r)

		fields, values, viewer, err := projectRowForResource(ctx, pool, caller, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("lock brief: load", "error", err)
			serverError(w)
			return
		}
		_ = viewer

		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}
		failures := &errorBag{}
		phase := ""
		if phaseAny, present := body["phase"]; !present || phaseAny == nil {
			failures.add("phase", "The phase field is required.")
		} else if text, ok := phaseAny.(string); !ok {
			failures.add("phase", "The selected phase is invalid.")
		} else if text != "design" && text != "build" {
			failures.add("phase", "The selected phase is invalid.")
		} else {
			phase = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		var profileTable string
		var selectedColumn string
		var messageForbidden string
		switch phase {
		case "design":
			profileTable, selectedColumn = "arsiteks", "selected_arsitek_id"
			messageForbidden = "Only the assigned architect can lock the design brief."
		default:
			profileTable, selectedColumn = "kontraktors", "selected_kontraktor_id"
			messageForbidden = "Only the assigned contractor can submit the construction brief."
		}

		var profileID int64
		err = pool.QueryRow(ctx, `SELECT id FROM `+profileTable+` WHERE user_id = $1
			ORDER BY id ASC LIMIT 1`, caller.UserID()).Scan(&profileID)
		selected := projectIntPtr(values, fields, selectedColumn)
		if err != nil || selected == nil || *selected != profileID {
			message(w, http.StatusForbidden, messageForbidden)
			return
		}

		if phase == "design" {
			if projectTime(values, fields, "design_locked_at") == nil {
				if _, err := pool.Exec(ctx, `UPDATE projects SET design_locked_at = date_trunc('second', now()),
					updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
					slog.Error("lock brief: design", "error", err)
					serverError(w)
					return
				}
			}
		} else {
			if projectTime(values, fields, "construction_locked_at") == nil {
				if _, err := pool.Exec(ctx, `UPDATE projects SET construction_brief_status = 'pending_review',
					construction_brief_revision_notes = NULL,
					updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
					slog.Error("lock brief: build", "error", err)
					serverError(w)
					return
				}
			}
		}

		renderProjectAnswer(ctx, pool, w, projectID, viewer, projectLoad{
			images:       true,
			unscopedBids: true,
			// lockPhaseBrief loads the five MAIN bid relations only.
			viewerBidRoles: []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager"},
			ratings:        true,
			pmBlock:        true,
			budgetSummary:  true,
		})
	}
}

// IssueKickoffHandler serves `POST /api/projects/{project}/kickoff`.
func IssueKickoffHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, raw := projectPathID(r)

		fields, values, viewer, err := projectRowForResource(ctx, pool, caller, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("kickoff: load", "error", err)
			serverError(w)
			return
		}

		if !projectOwnerOrPM(viewer, fields, values) {
			message(w, http.StatusForbidden, "Unauthorized. Only Owner or PM can issue Notice to Proceed.")
			return
		}

		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}
		failures := &errorBag{}
		role := ""
		if roleAny, present := body["role"]; !present || roleAny == nil {
			failures.add("role", "The role field is required.")
		} else if text, ok := roleAny.(string); !ok {
			failures.add("role", "The selected role is invalid.")
		} else if text != "arsitek" && text != "kontraktor" {
			failures.add("role", "The selected role is invalid.")
		} else {
			role = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		column := role + "_kickoff_at"
		if projectTime(values, fields, column) != nil {
			message(w, http.StatusUnprocessableEntity, "Notice to Proceed has already been issued for this role.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("kickoff: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE projects SET `+column+` = date_trunc('second', now()),
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("kickoff: update", "error", err)
			serverError(w)
			return
		}

		label := strings.ToUpper(role[:1]) + role[1:]
		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), role+"_kickoff",
			"Notice to Proceed issued for "+label+"."); err != nil {
			slog.Error("kickoff: activity", "error", err)
			serverError(w)
			return
		}

		// Notify the hired professional.
		var table, column2 string
		if role == "arsitek" {
			table, column2 = "arsiteks", "selected_arsitek_id"
		} else {
			table, column2 = "kontraktors", "selected_kontraktor_id"
		}
		_ = table
		var proUserID *int64
		if proProfile := projectIntPtr(values, fields, column2); proProfile != nil {
			proTable := "arsiteks"
			if role == "kontraktor" {
				proTable = "kontraktors"
			}
			_ = tx.QueryRow(ctx, `SELECT user_id FROM `+proTable+` WHERE id = $1`, *proProfile).Scan(&proUserID)
		}
		if proUserID != nil && *proUserID != 0 {
			title := stringOf(projectText(values, fields, "title"))
			data := `{"project_id":` + strconv.FormatInt(projectID, 10) + `,"role":"` + role + `"}`
			body := "You have received the Notice to Proceed for project \"" + title + "\". Your timeline starts now."
			if _, err := tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at)
				VALUES ($1, 'kickoff_issued', 'Notice to Proceed!', $2, $3::jsonb, date_trunc('second', now()), date_trunc('second', now()))`,
				*proUserID, body, data); err != nil {
				slog.Warn("kickoff: notify", "error", err)
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("kickoff: commit", "error", err)
			serverError(w)
			return
		}

		renderProjectAnswer(ctx, pool, w, projectID, viewer, projectLoad{
			images:         true,
			milestones:     true,
			documents:      true,
			comments:       true,
			addendums:      true,
			paymentTermins: true,
			requirements:   true,
			unscopedBids:   true,
			viewerBidRoles: bidRoleOrder,
			countRoles:     bidCountRoles,
			budgetSummary:  true,
			hiredPros:      true,
			engineers:      []string{"structural_engineer", "mep_engineer", "interior_engineer"},
			engineerPhones: true,
			pmBlock:        true,
		})
	}
}

// reviewRole is one review target's table and key columns.
type reviewRole struct {
	table       string
	profileCol  string
	reviewerCol string
}

var reviewRoles = map[string]reviewRole{
	"arsitek":    {"arsitek_ratings", "arsitek_id", "reviewer_id"},
	"kontraktor": {"kontraktor_ratings", "kontraktor_id", "reviewer_id"},
	"interior":   {"interior_ratings", "interior_id", "reviewer_id"},
	"notaris":    {"notaris_ratings", "notaris_id", "reviewer_id"},
	"pm":         {"p_m_ratings", "pm_id", "user_id"},
}

// ReviewProjectHandler serves `POST /api/projects/{project}/review`.
func ReviewProjectHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, raw := projectPathID(r)

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("review: load", "error", err)
			serverError(w)
			return
		}

		if projectInt(values, fields, "user_id") != caller.UserID() {
			message(w, http.StatusForbidden, "Only the project owner can leave a review.")
			return
		}

		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}
		failures := &errorBag{}

		rating := 0
		if ratingAny, present := body["rating"]; !present || ratingAny == nil {
			failures.add("rating", "The rating field is required.")
		} else {
			text, numeric := numericTextOf(ratingAny)
			parsed, err := strconv.Atoi(strings.TrimSpace(text))
			if !numeric || err != nil {
				failures.add("rating", "The rating field must be an integer.")
			} else if parsed < 1 {
				failures.add("rating", "The rating field must be at least 1.")
			} else if parsed > 5 {
				failures.add("rating", "The rating field must not be greater than 5.")
			} else {
				rating = parsed
			}
		}

		var comment any
		if commentAny, present := body["comment"]; present && commentAny != nil {
			text, ok := commentAny.(string)
			if !ok {
				failures.add("comment", "The comment field must be a string.")
			} else if len([]rune(text)) > 500 {
				failures.add("comment", "The comment field must not be greater than 500 characters.")
			} else {
				comment = text
			}
		}

		target := ""
		if targetAny, present := body["target_role"]; !present || targetAny == nil {
			failures.add("target_role", "The target role field is required.")
		} else if text, ok := targetAny.(string); !ok {
			failures.add("target_role", "The selected target role is invalid.")
		} else if _, known := reviewRoles[text]; !known && text != "pm" {
			failures.add("target_role", "The selected target role is invalid.")
		} else {
			target = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		role, known := reviewRoles[target]
		if !known {
			message(w, http.StatusUnprocessableEntity, "Invalid role: "+target)
			return
		}
		bidRole := target
		if target == "pm" {
			bidRole = "project_manager"
		}

		var bidFields []string
		var bidValues []any
		bidRows, err := pool.Query(ctx, `SELECT `+bidsColumns+` FROM bids WHERE project_id = $1 AND role::text = $2
			AND status::text IN ('accepted','active','contract_pending','awaiting_payment','terminated','resigned')
			ORDER BY created_at DESC, id DESC LIMIT 1`, projectID, bidRole)
		if err != nil {
			slog.Error("review: bid", "error", err)
			serverError(w)
			return
		}
		if !bidRows.Next() {
			bidRows.Close()
			message(w, http.StatusUnprocessableEntity, "No professional assignment found for role: "+target)
			return
		}
		bidFields = fieldNames(bidRows)
		bidValues, err = scanRow(bidRows, len(bidFields))
		bidRows.Close()
		if err != nil {
			slog.Error("review: bid scan", "error", err)
			serverError(w)
			return
		}
		bid := projectColumnsByName(bidFields, bidValues)

		bidStatus := stringOf(bid["status"])
		projectStatus := stringOf(projectText(values, fields, "status"))
		if projectStatus != "completed" && bidStatus != "terminated" && bidStatus != "resigned" {
			message(w, http.StatusUnprocessableEntity,
				"You can only leave a review once the project is completed or the professional has left.")
			return
		}

		professionalID := intPtrOf(bid[role.profileCol])
		if professionalID == nil {
			message(w, http.StatusUnprocessableEntity, "No professional assignment found for role: "+target)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("review: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var reviewID int64
		createdReview := false
		var existingID *int64
		err = tx.QueryRow(ctx, `SELECT id FROM `+role.table+`
			WHERE project_id = $1 AND `+role.reviewerCol+` = $2 AND `+role.profileCol+` = $3
			ORDER BY id DESC LIMIT 1`, projectID, caller.UserID(), *professionalID).Scan(&existingID)
		if err != nil && !isNoRows(err) {
			slog.Error("review: lookup", "error", err)
			serverError(w)
			return
		}

		if existingID != nil {
			if _, err := tx.Exec(ctx, `UPDATE `+role.table+` SET rating = $2, komentar = $3,
				updated_at = date_trunc('second', now()) WHERE id = $1`,
				*existingID, rating, comment); err != nil {
				slog.Error("review: update", "error", err)
				serverError(w)
				return
			}
			reviewID = *existingID
		} else {
			if err := tx.QueryRow(ctx, `INSERT INTO `+role.table+`
				(project_id, `+role.reviewerCol+`, `+role.profileCol+`, rating, komentar, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, date_trunc('second', now()), date_trunc('second', now()))
				RETURNING id`, projectID, caller.UserID(), *professionalID, rating, comment).Scan(&reviewID); err != nil {
				slog.Error("review: insert", "error", err)
				serverError(w)
				return
			}
			createdReview = true
		}

		// Notify the reviewed professional.
		var proUserID *int64
		profileTable := map[string]string{
			"arsitek": "arsiteks", "kontraktor": "kontraktors", "interior": "interior_profiles",
			"notaris": "notaris_profiles", "pm": "project_managers",
		}[target]
		if profileTable != "" {
			_ = tx.QueryRow(ctx, `SELECT user_id FROM `+profileTable+` WHERE id = $1`, *professionalID).Scan(&proUserID)
		}
		if proUserID != nil && *proUserID != 0 {
			title := stringOf(projectText(values, fields, "title"))
			data := `{"project_id":` + strconv.FormatInt(projectID, 10) + `,"rating":` + strconv.Itoa(rating) + `}`
			body := "Project Owner of \"" + title + "\" has left you a " + strconv.Itoa(rating) + "-star review."
			if _, err := tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at)
				VALUES ($1, 'new_review', 'New Review Received', $2, $3::jsonb, date_trunc('second', now()), date_trunc('second', now()))`,
				*proUserID, body, data); err != nil {
				slog.Warn("review: notify", "error", err)
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("review: commit", "error", err)
			serverError(w)
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+profileRowColumns(role.table)+` FROM `+role.table+` WHERE id = $1`, reviewID)
		if err != nil {
			slog.Error("review: reload", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()
		reviewFields := fieldNames(rows)
		if !rows.Next() {
			slog.Error("review: missing after insert", "id", reviewID)
			serverError(w)
			return
		}
		reviewValues, err := scanRow(rows, len(reviewFields))
		if err != nil {
			slog.Error("review: scan", "error", err)
			serverError(w)
			return
		}

		data := jsonphp.NewObject()
		byName := map[string]any{}
		for i, column := range reviewFields {
			byName[column] = reviewValues[i]
		}
		if createdReview {
			// `updateOrCreate` on a NEW row builds the model from the insert
			// payload: the key columns in payload order, then `updated_at`
			// BEFORE `created_at`, then `id`.
			for _, column := range []string{"project_id", role.reviewerCol, role.profileCol, "rating", "komentar"} {
				data.Set(column, projectRawValue(byName[column]))
			}
			data.Set("updated_at", projectTimeValue(byName["updated_at"]))
			data.Set("created_at", projectTimeValue(byName["created_at"]))
			data.Set("id", projectRawValue(byName["id"]))
		} else {
			for i, column := range reviewFields {
				switch column {
				case "created_at", "updated_at":
					data.Set(column, projectTimeValue(reviewValues[i]))
				case "rating":
					data.Set(column, intOrNilBid(map[string]any{column: reviewValues[i]}, column))
				default:
					data.Set(column, projectRawValue(reviewValues[i]))
				}
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Thank you for your feedback!")
		payload.Set("data", data)
		writeJSON(w, http.StatusCreated, payload)
	}
}
