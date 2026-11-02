package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/domain/terminplan"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PAYMENT TERMIN WRITES — update, delete, link and unlink.
//
// Every one of them first proves the termin belongs to the project in the
// URL. That binding check is NOT optional: `{termin}` is bound globally, so
// without it `/projects/1/payment-termins/9` would edit project 2's stage.
//
// Updates and links freeze while a dispute is open, and an update may not
// move an amount or percentage on a stage already verifying/paid.

// terminProject is the raw termin row the guards read.
type terminProject struct {
	id          int64
	projectID   int64
	roleType    string
	recipientID *int64
	label       string
	percentage  *string
	amount      *string
	status      string
	milestoneID *int64
}

// loadTerminProject reads one termin, unscoped by project.
func loadTerminProject(ctx context.Context, pool *pgxpool.Pool, terminID int64) (terminProject, error) {
	var row terminProject
	var recipient, milestone *int64
	var roleType, label, percentage, amount, status *string

	err := pool.QueryRow(ctx, `SELECT id, project_id, role_type::text, recipient_id, label,
		percentage::text, amount::text, status::text, milestone_id
		FROM project_payment_termins WHERE id = $1`, terminID).Scan(
		&row.id, &row.projectID, &roleType, &recipient, &label,
		&percentage, &amount, &status, &milestone)
	if err != nil {
		return row, err
	}

	row.roleType = stringOrNilText(roleType)
	row.recipientID = recipient
	row.label = stringOrNilText(label)
	row.percentage = percentage
	row.amount = amount
	row.status = stringOrNilText(status)
	row.milestoneID = milestone
	return row, nil
}

// terminSubRouteIDs reads `{project}` and `{termin}` from the path.
func terminSubRouteIDs(r *http.Request) (int64, int64, string, string) {
	rawProject := r.PathValue("project")
	if rawProject == "" {
		rawProject = projectIDFromPath(r.URL.Path)
	}
	projectID, projectErr := strconv.ParseInt(rawProject, 10, 64)

	rawTermin := r.PathValue("termin")
	if rawTermin == "" {
		path := strings.TrimSuffix(r.URL.Path, "/link-milestone")
		path = strings.TrimSuffix(path, "/unlink-milestone")
		rawTermin = lastPathSegment(path)
	}
	terminID, terminErr := strconv.ParseInt(rawTermin, 10, 64)

	if projectErr != nil || terminErr != nil {
		return 0, 0, rawProject, rawTermin
	}
	return projectID, terminID, rawProject, rawTermin
}

// projectIDFromPath picks the `projects/{id}` segment.
func projectIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, part := range parts {
		if part == "projects" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

// terminColumnsQuery is the 24-column projection scanTerminColumns reads.
const terminColumnsQuery = `SELECT id, project_id, role_type, recipient_id, label, percentage::text, amount::text, retention_amount::text, retention_released_at, retention_released_amount::text, net_amount::text, trigger_description, status::text, payment_proof_path, verification_notes, milestone_id, change_order_id, paid_at, notes, retention_notes, created_at, updated_at, refunded_amount::text, milestone_id
	FROM project_payment_termins WHERE id = $1`

// terminResponse renders a termin in table order, optionally with the
// milestone relation (the route-bound model in `link` never loaded it).
func terminResponse(ctx context.Context, pool *pgxpool.Pool, terminID int64, withMilestone bool) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, terminColumnsQuery, terminID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}

	if withMilestone {
		return scanTerminRow(ctx, pool, rows)
	}
	entry, _, err := scanTerminColumns(rows)
	return entry, err
}

// terminProjectGate answers the binding check: the termin must belong to
// this project. Returns false after writing the 404.
func terminProjectGate(w http.ResponseWriter, termin terminProject, projectID int64) bool {
	if termin.projectID != projectID {
		message(w, http.StatusNotFound, "Not found.")
		return false
	}
	return true
}

// terminFreezeGate writes the standard dispute-freeze 422, or false when
// no dispute is open.
func terminFreezeGate(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter, projectID int64) bool {
	var openID int64
	var openTitle string
	if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes
		WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
		message(w, http.StatusUnprocessableEntity,
			"Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
		return true
	}
	return false
}

// UpdatePaymentTerminHandler serves
// `PUT /api/projects/{project}/payment-termins/{termin}`.
func UpdatePaymentTerminHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		projectID, terminID, rawProject, rawTermin := terminSubRouteIDs(r)
		if projectID == 0 {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		termin, err := loadTerminProject(ctx, pool, terminID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectPaymentTermin`, rawTermin)
				return
			}
			slog.Error("termin-update: load", "error", err)
			serverError(w)
			return
		}
		if !terminProjectGate(w, termin, projectID) {
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("termin-update: viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmID *int64
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`,
			projectID).Scan(&ownerID, &pmID); err != nil {
			slog.Error("termin-update: project", "error", err)
			serverError(w)
			return
		}

		isAuthor := termin.recipientID != nil && *termin.recipientID == viewer.id
		isOwner := ownerID == viewer.id
		isPM := verifyAssignedPM(viewer, pmID)
		if !isAuthor && !isOwner && !isPM {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		if terminFreezeGate(ctx, pool, w, projectID) {
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		updates, failures := validateTerminUpdate(ctx, pool, projectID, fields)
		if !failures.empty() {
			failures.write(w)
			return
		}

		// Drift guard: only a stage already verifying/paid is protected, and
		// only the two money fields are compared.
		if termin.status == "verifying" || termin.status == "paid" {
			storedAmount, _ := money.FromColumn(derefString(termin.amount, "0"), "IDR")
			storedPercentage := parseFloatOrZero(termin.percentage)
			if updates.amount != nil {
				newAmount, err := money.FromColumn(*updates.amount, "IDR")
				if err == nil {
					diff := newAmount.Int() - storedAmount.Int()
					if diff < 0 {
						diff = -diff
					}
					if diff > 0 {
						message(w, http.StatusUnprocessableEntity,
							"Payment stage \""+termin.label+"\" is already "+termin.status+" and its amount can no longer be changed.")
						return
					}
				}
			}
			if updates.percentage != nil {
				if diff := *updates.percentage - storedPercentage; diff > terminplan.PercentageTolerance || diff < -terminplan.PercentageTolerance {
					message(w, http.StatusUnprocessableEntity,
						"Payment stage \""+termin.label+"\" is already "+termin.status+" and its percentage can no longer be changed.")
					return
				}
			}
		}

		if updates.amount != nil {
			if err := assertTerminContractValue(ctx, pool, projectID, termin.roleType, *updates.amount, terminID); err != nil {
				message(w, http.StatusUnprocessableEntity, err.Error())
				return
			}
		}

		sets := make([]string, 0, 9)
		args := make([]any, 0, 10)
		add := func(column string, value any) {
			args = append(args, value)
			sets = append(sets, column+" = $"+strconv.Itoa(len(args)))
		}
		if updates.label != nil {
			add("label", *updates.label)
		}
		if updates.percentageText != nil {
			add("percentage", *updates.percentageText)
		}
		if updates.amount != nil {
			add("amount", *updates.amount)
		}
		if updates.triggerSet {
			add("trigger_description", updates.trigger)
		}
		if updates.status != nil {
			add("status", *updates.status)
		}
		if updates.milestoneSet {
			add("milestone_id", updates.milestoneID)
		}
		if updates.notesSet {
			add("notes", updates.notes)
		}
		args = append(args, terminID)
		sets = append(sets, "updated_at = date_trunc('second', now())")

		if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET `+strings.Join(sets, ", ")+
			` WHERE id = $`+strconv.Itoa(len(args)), args...); err != nil {
			slog.Error("termin-update: write", "error", err)
			serverError(w)
			return
		}

		entry, err := terminResponse(ctx, pool, terminID, true)
		if err != nil {
			slog.Error("termin-update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// terminUpdate is the validated patch. A nil pointer means "not present";
// the Set flags distinguish absent from explicit null.
type terminUpdate struct {
	label          *string
	percentage     *float64
	percentageText *string
	amount         *string
	trigger        any
	triggerSet     bool
	status         *string
	milestoneID    any
	milestoneSet   bool
	notes          any
	notesSet       bool
}

// validateTerminUpdate enforces the update rules in declaration order.
func validateTerminUpdate(ctx context.Context, pool *pgxpool.Pool, projectID int64,
	fields map[string]any) (terminUpdate, *errorBag) {
	var updates terminUpdate
	failures := &errorBag{}

	if raw, present := fields["label"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("label", "The label field must be a string.")
		} else if len([]rune(text)) > 255 {
			failures.add("label", "The label field must not be greater than 255 characters.")
		} else {
			updates.label = &text
		}
	}

	if raw, present := fields["percentage"]; present && raw != nil {
		text, numeric := numericTextOf(raw)
		if !numeric || !isNumericText(text) {
			failures.add("percentage", "The percentage field must be a number.")
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add("percentage", "The percentage field must be a number.")
		} else {
			if parsed < 0 {
				failures.add("percentage", "The percentage field must be at least 0.")
			}
			if parsed > 100 {
				failures.add("percentage", "The percentage field must not be greater than 100.")
			}
			updates.percentage = &parsed
			updates.percentageText = &text
		}
	}

	if raw, present := fields["amount"]; present && raw != nil {
		text, numeric := numericTextOf(raw)
		if !numeric || !isIntegerText(text) {
			failures.add("amount", "The amount field must be an integer.")
		} else if parsed, err := strconv.ParseInt(text, 10, 64); err != nil {
			failures.add("amount", "The amount field must be an integer.")
		} else if parsed < 0 {
			failures.add("amount", "The amount field must be at least 0.")
		} else if parsed > 99999999999999 {
			failures.add("amount", "The amount field must not be greater than 99999999999999.")
		} else {
			updates.amount = &text
		}
	}

	if raw, present := fields["trigger_description"]; present {
		updates.triggerSet = true
		if raw == nil {
			updates.trigger = nil
		} else if text, ok := raw.(string); !ok {
			failures.add("trigger_description", "The trigger description field must be a string.")
		} else if len([]rune(text)) > 255 {
			failures.add("trigger_description", "The trigger description field must not be greater than 255 characters.")
		} else {
			updates.trigger = text
		}
	}

	if raw, present := fields["status"]; present && raw != nil {
		text, ok := raw.(string)
		if !ok {
			failures.add("status", "The status field must be a string.")
		} else if text != "locked" && text != "pending" && text != "invoice_sent" {
			failures.add("status", "The selected status is invalid.")
		} else {
			updates.status = &text
		}
	}

	if raw, present := fields["milestone_id"]; present {
		updates.milestoneSet = true
		if raw == nil || (func() bool {
			text, ok := raw.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			updates.milestoneID = nil
		} else if text, ok := numericTextOf(raw); !ok {
			failures.add("milestone_id", "The selected work phase does not belong to this project.")
		} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
			failures.add("milestone_id", "The selected work phase does not belong to this project.")
		} else if !milestoneInProject(ctx, pool, projectID, parsed) {
			failures.add("milestone_id", "The selected work phase does not belong to this project.")
		} else {
			updates.milestoneID = parsed
		}
	}

	if raw, present := fields["notes"]; present {
		updates.notesSet = true
		if raw == nil {
			updates.notes = nil
		} else if text, ok := raw.(string); !ok {
			failures.add("notes", "The notes field must be a string.")
		} else if len([]rune(text)) > 1000 {
			failures.add("notes", "The notes field must not be greater than 1000 characters.")
		} else {
			updates.notes = text
		}
	}

	return updates, failures
}

// assertTerminContractValue is TerminPlanService::assertWithinContractValue.
func assertTerminContractValue(ctx context.Context, pool *pgxpool.Pool, projectID int64,
	role, amountText string, excludeID int64) error {
	contract, err := signContractValue(ctx, pool, projectID, role)
	if err != nil || contract == nil || contract.Int() <= 0 {
		return err
	}

	var planned *string
	if err := pool.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0)::text
		FROM project_payment_termins WHERE project_id = $1 AND role_type = $2
		  AND status::text <> 'void' AND id <> $3`, projectID, role, excludeID).Scan(&planned); err != nil {
		return err
	}

	base := "0"
	if planned != nil {
		base = *planned
	}
	plannedMoney, err := money.FromColumn(base, "IDR")
	if err != nil {
		return err
	}
	amount, err := money.FromColumn(amountText, "IDR")
	if err != nil {
		return err
	}
	combined, err := plannedMoney.Add(amount)
	if err != nil {
		return err
	}

	return terminplan.AssertTotalWithinContractValue(contract, combined)
}

// derefString returns the value or a fallback.
func derefString(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}

// parseFloatOrZero reads a decimal text as a float.
func parseFloatOrZero(value *string) float64 {
	if value == nil {
		return 0
	}
	parsed, err := strconv.ParseFloat(strings.TrimSpace(*value), 64)
	if err != nil {
		return 0
	}
	return parsed
}

// DeletePaymentTerminHandler serves
// `DELETE /api/projects/{project}/payment-termins/{termin}`.
func DeletePaymentTerminHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		projectID, terminID, rawProject, rawTermin := terminSubRouteIDs(r)
		if projectID == 0 {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		termin, err := loadTerminProject(ctx, pool, terminID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectPaymentTermin`, rawTermin)
				return
			}
			slog.Error("termin-delete: load", "error", err)
			serverError(w)
			return
		}
		if !terminProjectGate(w, termin, projectID) {
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("termin-delete: viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmID *int64
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`,
			projectID).Scan(&ownerID, &pmID); err != nil {
			slog.Error("termin-delete: project", "error", err)
			serverError(w)
			return
		}

		isOwner := ownerID == viewer.id
		isPM := verifyAssignedPM(viewer, pmID)
		if !isOwner && !isPM {
			isHiredForRole := viewer.role == "kontraktor" && termin.roleType == "kontraktor"
			if isHiredForRole {
				columns, err := projectHireColumns(ctx, pool, projectID)
				if err != nil {
					slog.Error("termin-delete: columns", "error", err)
					serverError(w)
					return
				}
				isHiredForRole = hireMatches(viewer, columns, "kontraktor")
			}
			if !isHiredForRole {
				message(w, http.StatusForbidden, "Unauthorized. You can only delete your own role payment terms.")
				return
			}
		}

		if termin.status == "verifying" || termin.status == "paid" {
			message(w, http.StatusUnprocessableEntity,
				"Cannot delete a payment term with an ongoing or completed payment.")
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE id = $1`, terminID); err != nil {
			slog.Error("termin-delete: write", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Deleted")
	}
}

// projectHireColumns reads a project's selected_* columns for hireMatches.
func projectHireColumns(ctx context.Context, pool *pgxpool.Pool, projectID int64) (map[string]any, error) {
	rows, err := pool.Query(ctx, `SELECT selected_arsitek_id, selected_kontraktor_id,
		selected_notaris_id, selected_interior_id, pm_id, structural_id, mep_id
		FROM projects WHERE id = $1`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}
	var arsitek, kontraktor, notaris, interior, pm, structural, mep *int64
	if err := rows.Scan(&arsitek, &kontraktor, &notaris, &interior, &pm, &structural, &mep); err != nil {
		return nil, err
	}
	return map[string]any{
		"selected_arsitek_id":    arsitek,
		"selected_kontraktor_id": kontraktor,
		"selected_notaris_id":    notaris,
		"selected_interior_id":   interior,
		"pm_id":                  pm,
		"structural_id":          structural,
		"mep_id":                 mep,
	}, nil
}

// LinkTerminMilestoneHandler serves
// `POST /api/projects/{project}/payment-termins/{termin}/link-milestone`.
func LinkTerminMilestoneHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		projectID, terminID, rawProject, rawTermin := terminSubRouteIDs(r)
		if projectID == 0 {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		termin, err := loadTerminProject(ctx, pool, terminID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectPaymentTermin`, rawTermin)
				return
			}
			slog.Error("termin-link: load", "error", err)
			serverError(w)
			return
		}
		if !terminProjectGate(w, termin, projectID) {
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("termin-link: viewer", "error", err)
			serverError(w)
			return
		}
		var pmID *int64
		if err := pool.QueryRow(ctx, `SELECT pm_id FROM projects WHERE id = $1`, projectID).Scan(&pmID); err != nil {
			slog.Error("termin-link: project", "error", err)
			serverError(w)
			return
		}

		isRecipient := termin.recipientID != nil && *termin.recipientID == viewer.id
		if !isRecipient && !verifyAssignedPM(viewer, pmID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		if terminFreezeGate(ctx, pool, w, projectID) {
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		var milestoneID int64
		if raw, present := fields["milestone_id"]; !present || raw == nil || (func() bool {
			text, ok := raw.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			failures.add("milestone_id", "The milestone id field is required.")
		} else if text, ok := numericTextOf(raw); !ok {
			failures.add("milestone_id", "The selected work phase does not belong to this project.")
		} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
			failures.add("milestone_id", "The selected work phase does not belong to this project.")
		} else if !milestoneInProject(ctx, pool, projectID, parsed) {
			failures.add("milestone_id", "The selected work phase does not belong to this project.")
		} else {
			milestoneID = parsed
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		var linked bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_payment_termins
			WHERE milestone_id = $1 AND role_type = $2 AND id <> $3)`,
			milestoneID, termin.roleType, terminID).Scan(&linked); err != nil {
			slog.Error("termin-link: linked", "error", err)
			serverError(w)
			return
		}
		if linked {
			message(w, http.StatusUnprocessableEntity, "This work phase is already linked to another payment.")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET milestone_id = $2,
			updated_at = date_trunc('second', now()) WHERE id = $1`, terminID, milestoneID); err != nil {
			slog.Error("termin-link: write", "error", err)
			serverError(w)
			return
		}

		entry, err := terminResponse(ctx, pool, terminID, false)
		if err != nil {
			slog.Error("termin-link: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Payment linked successfully.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// UnlinkTerminMilestoneHandler serves
// `POST /api/projects/{project}/payment-termins/{termin}/unlink-milestone`.
func UnlinkTerminMilestoneHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		projectID, terminID, rawProject, rawTermin := terminSubRouteIDs(r)
		if projectID == 0 {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		termin, err := loadTerminProject(ctx, pool, terminID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectPaymentTermin`, rawTermin)
				return
			}
			slog.Error("termin-unlink: load", "error", err)
			serverError(w)
			return
		}
		if !terminProjectGate(w, termin, projectID) {
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("termin-unlink: viewer", "error", err)
			serverError(w)
			return
		}
		var pmID *int64
		if err := pool.QueryRow(ctx, `SELECT pm_id FROM projects WHERE id = $1`, projectID).Scan(&pmID); err != nil {
			slog.Error("termin-unlink: project", "error", err)
			serverError(w)
			return
		}

		isRecipient := termin.recipientID != nil && *termin.recipientID == viewer.id
		if !isRecipient && !verifyAssignedPM(viewer, pmID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		if terminFreezeGate(ctx, pool, w, projectID) {
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET milestone_id = NULL,
			updated_at = date_trunc('second', now()) WHERE id = $1`, terminID); err != nil {
			slog.Error("termin-unlink: write", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Payment unlinked.")
	}
}

// milestoneInProject checks the MilestoneBelongsToProject rule.
func milestoneInProject(ctx context.Context, pool *pgxpool.Pool, projectID, milestoneID int64) bool {
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_milestones
		WHERE id = $1 AND project_id = $2)`, milestoneID, projectID).Scan(&exists); err != nil {
		return false
	}
	return exists
}
