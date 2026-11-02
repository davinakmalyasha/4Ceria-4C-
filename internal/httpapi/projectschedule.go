package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT SCHEDULES — the six-phase timeline.
//
//   - GET schedules: owner or assigned PM. INITIALIZES any missing phase
//     rows (management, legal, design, build, materials, handover) as
//     `pending`/0 and answers {schedules, delays, unlinked_reports, summary}.
//     Existing rows come back in the DB's phase_slug order (MySQL walks the
//     unique (project_id, phase_slug) index), and newly created rows are
//     APPENDED in canonical phase order — so the first call after creation
//     answers create-order rows, later calls table-order rows.
//   - PUT schedules/{schedule}: owner or PM, project-bound (404 "Phase not
//     found in this project."), and its validation failures answer a BARE
//     {"errors": …} envelope — no `message` key.
//   - POST delays: assigned PM only, shifts the delayed phase and every
//     later phase by N days (preserving the pre-delay baseline once) and
//     notifies the owner and the PM's USER (projects.pm_id is a profile id).

// scheduleColumns is the schedule table order.
var scheduleColumns = []string{
	"id", "project_id", "phase_slug", "target_start_date", "target_end_date",
	"original_target_end_date", "shifted_days", "actual_start_date", "actual_end_date",
	"progress_percentage", "status", "notes", "created_at", "updated_at",
}

// delayColumns is the delay table order.
var delayColumns = []string{
	"id", "project_id", "phase_slug", "days", "reason", "category", "logged_at",
	"created_at", "updated_at",
}

// reportColumns is the report table order.
var reportColumns = []string{
	"id", "project_id", "phase_slug", "created_by", "summary", "progress_percentage",
	"budget_health", "site_photos", "attachments", "published_at", "created_at", "updated_at",
}

// schedulePhases is the canonical phase order.
var schedulePhases = []string{"management", "legal", "design", "build", "materials", "handover"}

// scheduleDateCols are the raw date columns (no casts in the model).
var scheduleDateCols = map[string]bool{
	"target_start_date": true, "target_end_date": true, "original_target_end_date": true,
	"actual_start_date": true, "actual_end_date": true,
}

// scheduleObject renders a loaded schedule in table order.
func scheduleObject(ctx context.Context, byName map[string]any, reportCount *int64) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range scheduleColumns {
		switch {
		case scheduleDateCols[column]:
			entry.Set(column, mysqlDate(byName[column]))
		case column == "created_at" || column == "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	// Only the index attaches the dynamic report_count attribute.
	if reportCount != nil {
		entry.Set("report_count", *reportCount)
	}
	return entry
}

// scheduleCreatedObject renders Eloquent's CREATED schedule.
func scheduleCreatedObject(ctx context.Context, byName map[string]any, reportCount int64) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("phase_slug", projectRawValue(byName["phase_slug"]))
	entry.Set("status", projectRawValue(byName["status"]))
	entry.Set("progress_percentage", projectRawValue(byName["progress_percentage"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	entry.Set("report_count", reportCount)
	return entry
}

// delayObject renders a loaded delay in table order.
func delayObject(ctx context.Context, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range delayColumns {
		switch column {
		case "logged_at":
			entry.Set(column, mysqlDate(byName[column]))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	return entry
}

// reportObject renders a loaded report plus its creator.
func reportObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range reportColumns {
		switch column {
		case "site_photos", "attachments":
			entry.Set(column, eloquentJSONValue(byName[column]))
		case "published_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		case "progress_percentage":
			entry.Set(column, projectIntValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}

	creatorID := intPtrDeref(byName["created_by"])
	if creatorID != 0 {
		creator, err := fullProfileUser(ctx, pool, creatorID, false)
		if err != nil {
			creator = nil
		}
		entry.Set("creator", creator)
	} else {
		entry.Set("creator", nil)
	}
	return entry
}

// scheduleGate admits the owner or the assigned PM.
func scheduleGate(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64) (bool, bool) {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		return false, false
	}
	project := projectColumnsByName(fields, values)
	ownerID, _ := project["user_id"].(int64)
	var pmProfile *int64
	if id, ok := project["pm_id"].(int64); ok {
		pmProfile = &id
	}
	isOwner := viewer.id == ownerID
	isPM := verifyAssignedPM(viewer, pmProfile)
	return isOwner || isPM, true
}

// SchedulesIndexHandler serves `GET /api/projects/{project}/schedules`.
func SchedulesIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("schedules: viewer", "error", err)
			serverError(w)
			return
		}

		allowed, exists := scheduleGate(ctx, pool, viewer, projectID)
		if !exists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		reportCounts, err := scheduleReportCounts(ctx, pool, projectID)
		if err != nil {
			slog.Error("schedules: report counts", "error", err)
			serverError(w)
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(scheduleColumns, ", ")+`
			FROM project_schedules WHERE project_id = $1 ORDER BY phase_slug`, projectID)
		if err != nil {
			slog.Error("schedules: query", "error", err)
			serverError(w)
			return
		}

		existing := map[string]map[string]any{}
		order := make([]string, 0, len(schedulePhases))
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				slog.Error("schedules: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			slug, _ := byName["phase_slug"].(string)
			existing[slug] = byName
			order = append(order, slug)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			slog.Error("schedules: rows", "error", err)
			serverError(w)
			return
		}

		// Initialize the missing phases, appending them in canonical order.
		created := map[string]map[string]any{}
		for _, phase := range schedulePhases {
			if _, ok := existing[phase]; ok {
				continue
			}
			var id int64
			var createdAt, updatedAt any
			if err := pool.QueryRow(ctx, `INSERT INTO project_schedules
				(project_id, phase_slug, status, progress_percentage, created_at, updated_at)
				VALUES ($1, $2, 'pending', 0, date_trunc('second', now()), date_trunc('second', now()))
				RETURNING id, created_at, updated_at`, projectID, phase).Scan(&id, &createdAt, &updatedAt); err != nil {
				slog.Error("schedules: init", "error", err)
				serverError(w)
				return
			}
			created[phase] = map[string]any{
				"id": id, "project_id": projectID, "phase_slug": phase, "status": "pending",
				"progress_percentage": int64(0), "created_at": createdAt, "updated_at": updatedAt,
			}
			order = append(order, phase)
		}

		schedules := make([]any, 0, len(order))
		for _, slug := range order {
			if row, ok := created[slug]; ok {
				schedules = append(schedules, scheduleCreatedObject(ctx, row, reportCounts[slug]))
				continue
			}
			count := reportCounts[slug]
			schedules = append(schedules, scheduleObject(ctx, existing[slug], &count))
		}

		delays, err := loadDelays(ctx, pool, projectID)
		if err != nil {
			slog.Error("schedules: delays", "error", err)
			serverError(w)
			return
		}

		reports, err := loadUnlinkedReports(ctx, pool, projectID)
		if err != nil {
			slog.Error("schedules: reports", "error", err)
			serverError(w)
			return
		}

		summary, err := scheduleSummary(ctx, pool, projectID, order, existing, created)
		if err != nil {
			slog.Error("schedules: summary", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("schedules", schedules)
		payload.Set("delays", delays)
		payload.Set("unlinked_reports", reports)
		payload.Set("summary", summary)
		writeJSON(w, http.StatusOK, payload)
	}
}

// scheduleReportCounts counts reports per phase.
func scheduleReportCounts(ctx context.Context, pool *pgxpool.Pool, projectID int64) (map[string]int64, error) {
	out := map[string]int64{}
	rows, err := pool.Query(ctx, `SELECT phase_slug, count(*) FROM project_reports
		WHERE project_id = $1 AND phase_slug IS NOT NULL GROUP BY phase_slug`, projectID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var slug *string
		var count int64
		if err := rows.Scan(&slug, &count); err != nil {
			return out, err
		}
		if slug != nil {
			out[*slug] = count
		}
	}
	return out, rows.Err()
}

// loadDelays returns the project's delays, newest first.
func loadDelays(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(delayColumns, ", ")+`
		FROM project_delays WHERE project_id = $1 ORDER BY logged_at DESC, id DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		fields := fieldNames(rows)
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		byName := map[string]any{}
		for i, column := range fields {
			byName[column] = values[i]
		}
		out = append(out, delayObject(ctx, byName))
	}
	return out, rows.Err()
}

// loadUnlinkedReports returns reports with no phase, newest first, each
// with its creator.
func loadUnlinkedReports(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(reportColumns, ", ")+`
		FROM project_reports WHERE project_id = $1 AND phase_slug IS NULL
		ORDER BY created_at DESC, id DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		fields := fieldNames(rows)
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		byName := map[string]any{}
		for i, column := range fields {
			byName[column] = values[i]
		}
		out = append(out, reportObject(ctx, pool, byName))
	}
	return out, rows.Err()
}

// scheduleSummary mirrors calculateSummary: milestone-weighted completion.
func scheduleSummary(ctx context.Context, pool *pgxpool.Pool, projectID int64, order []string, existing, created map[string]map[string]any) (*jsonphp.Object, error) {
	done := int64(0)
	completed := int64(0)
	currentPhase := any(nil)

	type counts struct {
		total int64
		done  int64
	}
	milestones := map[string]counts{}
	rows, err := pool.Query(ctx, `SELECT COALESCE(phase_context, ''), count(*),
		sum(CASE WHEN approval_status::text = 'approved' OR is_completed THEN 1 ELSE 0 END)
		FROM project_milestones WHERE project_id = $1 GROUP BY phase_context`, projectID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var phase string
		var total int64
		var approved *int64
		if err := rows.Scan(&phase, &total, &approved); err != nil {
			rows.Close()
			return nil, err
		}
		value := counts{total: total}
		if approved != nil {
			value.done = *approved
		}
		milestones[phase] = value
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	weightedTotal := int64(0)
	weightedDone := int64(0)
	for _, slug := range order {
		row := existing[slug]
		if row == nil {
			row = created[slug]
		}
		status, _ := row["status"].(string)
		if status == "completed" {
			completed++
		}
		if currentPhase == nil {
			if status == "active" {
				currentPhase = slug
			}
		}
		if row["status"] == "completed" {
			done++
		}

		if count, ok := milestones[slug]; ok && count.total > 0 {
			weightedTotal += count.total
			weightedDone += count.done
		} else {
			weightedTotal++
			if status == "completed" {
				weightedDone++
			}
		}
	}

	// current = first active, else first pending (collection order).
	if currentPhase == nil {
		for _, slug := range order {
			row := existing[slug]
			if row == nil {
				row = created[slug]
			}
			if status, _ := row["status"].(string); status == "pending" {
				currentPhase = slug
				break
			}
		}
	}

	completion := any(int64(0))
	if weightedTotal > 0 {
		completion = int64(float64(weightedDone)/float64(weightedTotal)*100 + 0.5)
	}

	var delayCount, delayDays int64
	if err := pool.QueryRow(ctx, `SELECT count(*), COALESCE(sum(days), 0) FROM project_delays WHERE project_id = $1`, projectID).Scan(&delayCount, &delayDays); err != nil {
		return nil, err
	}

	// MySQL hands `sum()` back as a DECIMAL STRING when rows exist, and as the
	// integer 0 when the aggregate is empty — the JSON types differ with it.
	var totalDelay any = int64(0)
	if delayCount > 0 {
		totalDelay = strconv.FormatInt(delayDays, 10)
	}

	summary := jsonphp.NewObject()
	summary.Set("completion_percentage", completion)
	summary.Set("phases_done", completed)
	summary.Set("total_phases", int64(len(order)))
	summary.Set("current_phase", currentPhase)
	summary.Set("total_delay_days", totalDelay)
	return summary, nil
}

// UpdateScheduleHandler serves
// `PUT /api/projects/{project}/schedules/{schedule}`.
func UpdateScheduleHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("schedule")
		if rawID == "" {
			rawID = lastPathSegment(r.URL.Path)
		}
		scheduleID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectSchedule`, rawID)
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
			slog.Error("schedule-update: viewer", "error", err)
			serverError(w)
			return
		}

		allowed, exists := scheduleGate(ctx, pool, viewer, projectID)
		if !exists {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		byName, found, err := loadScheduleRow(ctx, pool, scheduleID)
		if err != nil {
			slog.Error("schedule-update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectSchedule`, rawID)
			return
		}
		if rowProject, _ := byName["project_id"].(int64); rowProject != projectID {
			message(w, http.StatusNotFound, "Phase not found in this project.")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		update := validateScheduleUpdate(formFields, failures)
		if !failures.empty() {
			writeErrorsOnly(w, failures)
			return
		}

		sets := []string{"updated_at = date_trunc('second', now())"}
		args := []any{scheduleID}
		add := func(column string, value any) {
			args = append(args, value)
			sets = append(sets, column+" = $"+strconv.Itoa(len(args)))
		}
		if update.startSet {
			add("target_start_date", update.start)
		}
		if update.endSet {
			add("target_end_date", update.end)
		}
		if update.statusSet {
			add("status", update.status)
		}
		if update.progressSet {
			add("progress_percentage", update.progress)
		}
		if update.notesSet {
			add("notes", update.notes)
		}

		if _, err := pool.Exec(ctx, `UPDATE project_schedules SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("schedule-update: exec", "error", err)
			serverError(w)
			return
		}

		fresh, _, err := loadScheduleRow(ctx, pool, scheduleID)
		if err != nil {
			slog.Error("schedule-update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Phase updated successfully.")
		payload.Set("phase", scheduleObject(ctx, fresh, nil))
		writeJSON(w, http.StatusOK, payload)
	}
}

// scheduleUpdate carries only the fields that were present.
type scheduleUpdate struct {
	start       any
	startSet    bool
	end         any
	endSet      bool
	status      string
	statusSet   bool
	progress    int64
	progressSet bool
	notes       any
	notesSet    bool
}

// validateScheduleUpdate mirrors the controller's Validator rules.
func validateScheduleUpdate(fields map[string]any, failures *errorBag) scheduleUpdate {
	var out scheduleUpdate

	if raw, present := fields["target_start_date"]; present {
		if text, ok := raw.(string); raw == nil || (ok && text == "") {
			out.start = nil
			out.startSet = true
		} else if text, ok := raw.(string); ok && looksLikeDate(text) {
			out.start = text
			out.startSet = true
		} else {
			failures.add("target_start_date", "The target start date field must be a valid date.")
		}
	}

	if raw, present := fields["target_end_date"]; present {
		if text, ok := raw.(string); raw == nil || (ok && text == "") {
			out.end = nil
			out.endSet = true
		} else if text, ok := raw.(string); ok && looksLikeDate(text) {
			startText, _ := fields["target_start_date"].(string)
			if startText != "" && text < startText[:10] {
				failures.add("target_end_date", "The target end date field must be a date after or equal to target start date.")
			} else {
				out.end = text
				out.endSet = true
			}
		} else {
			failures.add("target_end_date", "The target end date field must be a valid date.")
		}
	}

	if raw, present := fields["status"]; present && raw != nil {
		if text, ok := raw.(string); ok {
			switch text {
			case "pending", "active", "completed", "delayed":
				out.status = text
				out.statusSet = true
			default:
				failures.add("status", "The selected status is invalid.")
			}
		} else {
			failures.add("status", "The selected status is invalid.")
		}
	}

	if raw, present := fields["progress_percentage"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
				if parsed < 0 {
					failures.add("progress_percentage", "The progress percentage field must be at least 0.")
				} else if parsed > 100 {
					failures.add("progress_percentage", "The progress percentage field must not be greater than 100.")
				} else {
					out.progress = parsed
					out.progressSet = true
				}
			}
		} else {
			failures.add("progress_percentage", "The progress percentage field must be an integer.")
		}
	}

	if raw, present := fields["notes"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("notes", "The notes field must be a string.")
		} else if len([]rune(text)) > 5000 {
			failures.add("notes", "The notes field must not be greater than 5000 characters.")
		} else {
			out.notes = text
			out.notesSet = true
		}
	}

	return out
}

// LogDelayHandler serves `POST /api/projects/{project}/delays`.
func LogDelayHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("delay: viewer", "error", err)
			serverError(w)
			return
		}

		projectFields, projectValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("delay: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(projectFields, projectValues)
		ownerID, _ := project["user_id"].(int64)
		var pmProfile *int64
		if id, ok := project["pm_id"].(int64); ok {
			pmProfile = &id
		}

		if !verifyAssignedPM(viewer, pmProfile) {
			message(w, http.StatusForbidden, "Only the PM can log delays.")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		input := validateDelay(formFields, failures)
		if !failures.empty() {
			writeErrorsOnly(w, failures)
			return
		}

		// The model has no cast on `logged_at`, so the CREATED response shows
		// the in-memory Carbon (microseconds) even though the column is a DATE.
		loggedAt := time.Now().UTC()
		date := loggedAt.Format("2006-01-02")

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("delay: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var delayID int64
		var createdAt, updatedAt any
		if err := tx.QueryRow(ctx, `INSERT INTO project_delays
			(project_id, phase_slug, days, reason, category, logged_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			projectID, input.phaseSlug, input.days, input.reason, input.category, date).Scan(&delayID, &createdAt, &updatedAt); err != nil {
			slog.Error("delay: insert", "error", err)
			serverError(w)
			return
		}

		startIndex := -1
		for i, phase := range schedulePhases {
			if phase == input.phaseSlug {
				startIndex = i
				break
			}
		}

		if startIndex >= 0 {
			affected := schedulePhases[startIndex:]
			if _, err := tx.Exec(ctx, `UPDATE project_schedules SET
				original_target_end_date = CASE
					WHEN target_end_date IS NOT NULL AND original_target_end_date IS NULL THEN target_end_date
					ELSE original_target_end_date END,
				target_start_date = CASE WHEN target_start_date IS NOT NULL
					THEN target_start_date + $2::int ELSE NULL END,
				target_end_date = CASE WHEN target_end_date IS NOT NULL
					THEN target_end_date + $2::int ELSE NULL END,
				shifted_days = shifted_days + $2,
				updated_at = date_trunc('second', now())
				WHERE project_id = $1 AND phase_slug = ANY($3)`,
				projectID, int(input.days), affected); err != nil {
				slog.Error("delay: shift", "error", err)
				serverError(w)
				return
			}

			pmUser := pmProfileUserID(ctx, tx, pmProfile)
			recipients := []int64{ownerID}
			if pmUser != 0 && pmUser != ownerID {
				recipients = append(recipients, pmUser)
			}
			body := "A " + strconv.FormatInt(input.days, 10) + "-day delay on the " + input.phaseSlug +
				" phase shifted the project timeline. Reason: " + input.reason
			for _, userID := range recipients {
				if err := insertNotification(ctx, tx, userID, "schedule_delayed", "Timeline Updated", body,
					`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
					slog.Error("delay: notify", "error", err)
					serverError(w)
					return
				}
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("delay: commit", "error", err)
			serverError(w)
			return
		}

		delay := jsonphp.NewObject()
		delay.Set("project_id", projectID)
		delay.Set("phase_slug", input.phaseSlug)
		delay.Set("days", input.days)
		delay.Set("reason", input.reason)
		delay.Set("category", input.category)
		delay.Set("logged_at", carbon(&loggedAt))
		delay.Set("updated_at", projectTimeValue(updatedAt))
		delay.Set("created_at", projectTimeValue(createdAt))
		delay.Set("id", delayID)

		payload := jsonphp.NewObject()
		payload.Set("message", "Delay logged and stakeholders notified.")
		payload.Set("delay", delay)
		writeJSON(w, http.StatusOK, payload)
	}
}

// delayInput is the validated delay.
type delayInput struct {
	phaseSlug string
	days      int64
	reason    string
	category  string
}

// validateDelay enforces the controller's rules in declaration order.
func validateDelay(fields map[string]any, failures *errorBag) delayInput {
	var out delayInput

	if raw, present := fields["phase_slug"]; !present || raw == nil {
		failures.add("phase_slug", "The phase slug field is required.")
	} else if text, ok := raw.(string); !ok {
		failures.add("phase_slug", "The phase slug field must be a string.")
	} else if text == "" {
		failures.add("phase_slug", "The phase slug field is required.")
	} else {
		out.phaseSlug = text
	}

	if raw, present := fields["days"]; !present || raw == nil {
		failures.add("days", "The days field is required.")
	} else if text, ok := numericTextOf(raw); !ok || !isIntegerText(text) {
		failures.add("days", "The days field must be an integer.")
	} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
		failures.add("days", "The days field must be an integer.")
	} else if parsed < 1 {
		failures.add("days", "The days field must be at least 1.")
	} else {
		out.days = parsed
	}

	if raw, present := fields["reason"]; !present || raw == nil {
		failures.add("reason", "The reason field is required.")
	} else if text, ok := raw.(string); !ok {
		failures.add("reason", "The reason field must be a string.")
	} else if text == "" {
		failures.add("reason", "The reason field is required.")
	} else {
		out.reason = text
	}

	if raw, present := fields["category"]; !present || raw == nil {
		failures.add("category", "The category field is required.")
	} else if text, ok := raw.(string); !ok {
		failures.add("category", "The category field must be a string.")
	} else if text == "" {
		failures.add("category", "The category field is required.")
	} else {
		out.category = text
	}

	return out
}

// loadScheduleRow reads one schedule by id.
func loadScheduleRow(ctx context.Context, pool *pgxpool.Pool, scheduleID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(scheduleColumns, ", ")+`
		FROM project_schedules WHERE id = $1`, scheduleID)
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

// writeErrorsOnly renders the controller's BARE {"errors": …} 422 envelope.
func writeErrorsOnly(w http.ResponseWriter, failures *errorBag) {
	errors := jsonphp.NewObject()
	for _, field := range failures.fields {
		messages := make([]any, 0, len(failures.bag[field]))
		for _, message := range failures.bag[field] {
			messages = append(messages, message)
		}
		errors.Set(field, messages)
	}
	payload := jsonphp.NewObject()
	payload.Set("errors", errors)
	writeJSON(w, http.StatusUnprocessableEntity, payload)
}
