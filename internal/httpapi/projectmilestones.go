package httpapi

import (
	"context"
	"github.com/jackc/pgx/v5"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT MILESTONES — GET /api/projects/{project}/milestones.
//
// The technical work plan: every non-placeholder milestone newest... in
// id order, with the professional trees (appends stripped, exactly as
// the resource does), the linked payment stage, and the change orders.
// Owner, assigned PM, hired professional or active sub-professional;
// anyone else reads the files-403.
//
// Two read-path writes live here. The auto-heal flips legacy
// administrative placeholder milestones (NULL type, em-dash titles) to
// sub_professional — unconditionally, which converges to the same rows
// the cached hourly heal produces. The gallery URLs inside content are
// resolved to absolute storage URLs, host of the request.

// MilestonesHandler serves `GET /api/projects/{project}/milestones`.
func MilestonesHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		raw := r.PathValue("project")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, raw)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		if _, _, err := projectRowByID(ctx, pool, projectID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("milestones: project", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("milestones: parties", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("milestones: subject", "error", err)
			serverError(w)
			return
		}

		allowed := isParticipant(parties, subject)
		if !allowed {
			var activeSub bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2 AND status::text = 'active')`,
				projectID, caller.UserID()).Scan(&activeSub); err != nil {
				slog.Error("milestones: subpro", "error", err)
				serverError(w)
				return
			}
			allowed = activeSub
		}

		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized. You must be assigned to this project to view files.")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_milestones SET type = 'sub_professional' WHERE project_id = $1 AND type IS NULL AND
			(title LIKE '% — MEP' OR title LIKE '% — STRUCTURAL' OR title LIKE '% — INTERIOR' OR title LIKE '% — mep' OR title LIKE '% — structural' OR title LIKE '% — interior')`,
			projectID); err != nil {
			slog.Error("milestones: heal", "error", err)
			serverError(w)
			return
		}

		query := `SELECT id, project_id, arsitek_id, kontraktor_id, notaris_id, interior_id, pm_id, structural_id, mep_id, title, type, content::text, description, review_note, review_status, image, sort_order, start_date, due_date, is_completed, approval_status, revision_notes, phase_context, lead_pro_verified_at, pm_verified_at, progress_attachment, created_at, updated_at
			FROM project_milestones WHERE project_id = $1 AND (type IS NULL OR type <> 'sub_professional')`
		args := []any{projectID}

		// has() is presence, not non-emptiness: ?phase_context= filters
		// to the empty phase (nothing), it does not lift the filter.
		if values, hasParam := r.URL.Query()["phase_context"]; hasParam && len(values) > 0 {
			query += ` AND phase_context = $2`
			args = append(args, values[0])
		}
		query += ` ORDER BY id`

		rows, err := pool.Query(ctx, query, args...)
		if err != nil {
			slog.Error("milestones: list", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			entry, err := scanMilestone(ctx, pool, rows)
			if err != nil {
				slog.Error("milestones: scan", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("milestones: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)

		writeJSON(w, http.StatusOK, payload)
	}
}

// milestoneRow is a scanned milestone with its column names.
type milestoneRow struct {
	fields []string
	values []any
	byName map[string]any
}

// scanMilestoneRow reads one milestone row with its columns.
func scanMilestoneRow(rows pgx.Rows, width int) (milestoneRow, error) {
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return milestoneRow{}, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	return milestoneRow{fields: fields, values: values, byName: byName}, nil
}

// scanMilestone renders one milestone: full columns with the casts, the
// bare professional trees (appends stripped), the gallery URLs resolved,
// the linked payment stage, and the change orders.
func scanMilestone(ctx context.Context, pool *pgxpool.Pool, rows pgx.Rows) (*jsonphp.Object, error) {
	row, err := scanMilestoneRow(rows, 27)
	if err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	for _, column := range row.fields {
		value := row.byName[column]
		switch column {
		case "sort_order":
			entry.Set(column, intOrNilBid(row.byName, column))
		case "is_completed":
			entry.Set(column, boolOrFalse(value))
		case "content":
			entry.Set(column, milestoneContentBytes(ctx, value))
		case "start_date", "due_date":
			// The date cast still serializes as full ISO Carbon
			// (verified via tinker), not Y-m-d.
			entry.Set(column, projectTimeValue(value))
		case "lead_pro_verified_at", "pm_verified_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	for _, relation := range []struct {
		key   string
		table string
		fk    string
	}{
		{"arsitek", "arsiteks", "arsitek_id"},
		{"kontraktor", "kontraktors", "kontraktor_id"},
		{"notaris", "notaris_profiles", "notaris_id"},
		{"interior", "interior_profiles", "interior_id"},
		{"pm", "project_managers", "pm_id"},
	} {
		profile, err := milestoneProfile(ctx, pool, relation.table, row.byName[relation.fk])
		if err != nil {
			return nil, err
		}
		entry.Set(relation.key, profile)
	}

	termin, err := milestoneTermin(ctx, pool, row.byName["id"])
	if err != nil {
		return nil, err
	}
	entry.Set("linked_termin", termin)

	changeOrders, err := milestoneChangeOrders(ctx, pool, row.byName["id"])
	if err != nil {
		return nil, err
	}
	entry.Set("change_orders", changeOrders)

	return entry, nil
}

// milestoneProfile renders a related professional with appends stripped
// and the owner user without phones — or null when unlinked.
func milestoneProfile(ctx context.Context, pool *pgxpool.Pool, table string, profileID any) (any, error) {
	id := intPtrOf(profileID)
	if id == nil || *id == 0 {
		return nil, nil
	}

	rows, err := pool.Query(ctx, `SELECT * FROM `+table+` WHERE id = $1`, *id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, nil
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	decimalCols := map[string]bool{"rate_harga": true}
	intCols := map[string]bool{"reliability_score": true}

	block := jsonphp.NewObject()
	for _, column := range fields {
		value := byName[column]
		switch {
		case decimalCols[column]:
			block.Set(column, projectDecimalValue(value))
		case intCols[column]:
			block.Set(column, projectIntValue(value))
		case column == "created_at" || column == "updated_at" || strings.HasSuffix(column, "_at"):
			block.Set(column, projectTimeValue(value))
		default:
			block.Set(column, projectRawValue(value))
		}
	}

	var userID int64
	if uid, ok := byName["user_id"].(int64); ok {
		userID = uid
	}
	user, err := fullProfileUser(ctx, pool, userID, false)
	if err != nil {
		return nil, err
	}
	block.Set("user", user)

	return block, nil
}

// milestoneContentBytes adapts a scanned content value to the shared
// gallery-resolving renderer.
func milestoneContentBytes(ctx context.Context, value any) any {
	switch typed := value.(type) {
	case []byte:
		return milestoneContent(ctx, typed)
	case string:
		return milestoneContent(ctx, []byte(typed))
	default:
		return jsonOrNil(value)
	}
}

// milestoneTermin renders the linked payment stage without further
// nesting, or null when unlinked.
func milestoneTermin(ctx context.Context, pool *pgxpool.Pool, milestoneID any) (any, error) {
	id := intPtrOf(milestoneID)
	if id == nil || *id == 0 {
		return nil, nil
	}

	rows, err := pool.Query(ctx, `SELECT id, project_id, role_type, recipient_id, label, percentage::text, amount::text, retention_amount::text, retention_released_at, retention_released_amount::text, net_amount::text, trigger_description, status::text, payment_proof_path, verification_notes, milestone_id, change_order_id, paid_at, notes, retention_notes, created_at, updated_at, refunded_amount::text
		FROM project_payment_termins WHERE milestone_id = $1 ORDER BY id LIMIT 1`, *id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, nil
	}

	entry, err := scanLinkedTermin(rows)
	if err != nil {
		return nil, err
	}

	return entry, rows.Err()
}

// scanLinkedTermin renders a linked payment stage: the same columns as
// the termin list, but with no milestone key of its own.
func scanLinkedTermin(rows pgxRows) (*jsonphp.Object, error) {
	var id, projectID, recipientID, milestoneID, changeOrderID *int64
	var roleType, label, percentage, amount, retention, retentionReleased, net, trigger, status, proofPath, verificationNotes, notes, retentionNotes, refunded *string
	var paidAt, createdAt, updatedAt any
	var retentionReleasedAt any

	if err := rows.Scan(&id, &projectID, &roleType, &recipientID, &label, &percentage, &amount, &retention, &retentionReleasedAt, &retentionReleased, &net, &trigger, &status, &proofPath, &verificationNotes, &milestoneID, &changeOrderID, &paidAt, &notes, &retentionNotes, &createdAt, &updatedAt, &refunded); err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	entry.Set("id", nullableInt64(id))
	entry.Set("project_id", nullableInt64(projectID))
	entry.Set("role_type", nullableString(roleType))
	entry.Set("recipient_id", nullableInt64(recipientID))
	entry.Set("label", nullableString(label))
	entry.Set("percentage", nullableString(percentage))
	entry.Set("amount", nullableString(amount))
	entry.Set("retention_amount", nullableString(retention))
	entry.Set("retention_released_at", projectTimeValue(retentionReleasedAt))
	entry.Set("retention_released_amount", nullableString(retentionReleased))
	entry.Set("net_amount", nullableString(net))
	entry.Set("trigger_description", nullableString(trigger))
	entry.Set("status", nullableString(status))
	entry.Set("payment_proof_path", nullableString(proofPath))
	entry.Set("verification_notes", nullableString(verificationNotes))
	entry.Set("milestone_id", nullableInt64(milestoneID))
	entry.Set("change_order_id", nullableInt64(changeOrderID))
	entry.Set("paid_at", projectTimeValue(paidAt))
	entry.Set("notes", nullableString(notes))
	entry.Set("retention_notes", nullableString(retentionNotes))
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("updated_at", projectTimeValue(updatedAt))
	entry.Set("refunded_amount", nullableString(refunded))
	return entry, nil
}

// milestoneChangeOrders renders the milestone's change orders in id order.
func milestoneChangeOrders(ctx context.Context, pool *pgxpool.Pool, milestoneID any) (any, error) {
	id := intPtrOf(milestoneID)
	if id == nil || *id == 0 {
		return make([]any, 0), nil
	}

	rows, err := pool.Query(ctx, `SELECT id, project_id, requested_by, role_type, title, description, cost_impact::text, time_impact_days, status::text, pm_notes, owner_notes, approved_at, created_at, updated_at, milestone_id
		FROM project_change_orders WHERE milestone_id = $1 ORDER BY id`, *id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var rowID, projectID, requestedBy, timeImpact, milestoneRef *int64
		var roleType, title, description, costImpact, status, pmNotes, ownerNotes *string
		var approvedAt any
		var createdAt, updatedAt any

		if err := rows.Scan(&rowID, &projectID, &requestedBy, &roleType, &title, &description, &costImpact, &timeImpact, &status, &pmNotes, &ownerNotes, &approvedAt, &createdAt, &updatedAt, &milestoneRef); err != nil {
			return nil, err
		}

		entry := jsonphp.NewObject()
		entry.Set("id", nullableInt64(rowID))
		entry.Set("project_id", nullableInt64(projectID))
		entry.Set("requested_by", nullableInt64(requestedBy))
		entry.Set("role_type", nullableString(roleType))
		entry.Set("title", nullableString(title))
		entry.Set("description", nullableString(description))
		entry.Set("cost_impact", nullableString(costImpact))
		entry.Set("time_impact_days", nullableInt64(timeImpact))
		entry.Set("status", nullableString(status))
		entry.Set("pm_notes", nullableString(pmNotes))
		entry.Set("owner_notes", nullableString(ownerNotes))
		entry.Set("approved_at", projectTimeValue(approvedAt))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		entry.Set("milestone_id", nullableInt64(milestoneRef))
		out = append(out, entry)
	}

	return out, rows.Err()
}
