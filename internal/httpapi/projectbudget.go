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

// BUDGET DASHBOARD — GET /api/projects/{project}/budget.
//
// The owner's money view: the ceiling, every ledger row, the sandbox plan,
// all addenda with their three user links, the accepted bid per role (with
// the professional tree), and the full termin schedule. Reads only;
// ProjectFinancialService stays the only writer (no new rows here).
//
// Shapes mirror the Eloquent serializations exactly: amounts stay decimal
// strings, datetimes are Carbon, and the key order is the MySQL column
// order — which the PG mirror matches everywhere except
// project_budget_transactions (migration 0015 backfilled the six
// descriptive columns), so the transaction block names its keys
// explicitly instead of following SELECT *.

// BudgetDashboardHandler serves `GET /api/projects/{project}/budget`.
func BudgetDashboardHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("budget: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("budget: project", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)
		pmID := projectIntPtr(values, fields, "pm_id")

		isPM := pmID != nil && *pmID != 0 && viewer.profiles["project_manager"] == *pmID
		if viewer.id != ownerID && !isPM {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		_ = byName
		transactions, err := budgetTransactions(ctx, pool, projectID)
		if err != nil {
			slog.Error("budget: transactions", "error", err)
			serverError(w)
			return
		}

		sandbox, err := budgetSandbox(ctx, pool, projectID)
		if err != nil {
			slog.Error("budget: sandbox", "error", err)
			serverError(w)
			return
		}

		addendums, err := budgetAddendums(ctx, pool, projectID)
		if err != nil {
			slog.Error("budget: addendums", "error", err)
			serverError(w)
			return
		}

		accepted, err := budgetAcceptedBids(ctx, pool, projectID, pmID)
		if err != nil {
			slog.Error("budget: accepted", "error", err)
			serverError(w)
			return
		}

		termins, err := budgetTermins(ctx, pool, projectID)
		if err != nil {
			slog.Error("budget: termins", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("project_budget", projectDecimal(values, fields, "budget"))
		payload.Set("transactions", transactions)
		payload.Set("sandbox_items", sandbox)
		payload.Set("addendums", addendums)
		payload.Set("accepted_bids", accepted)
		payload.Set("payment_termins", termins)

		writeJSON(w, http.StatusOK, payload)
	}
}

// budgetTransactions renders every ledger row in MySQL column order with
// the amount casts applied (decimal strings, Carbon datetimes).
func budgetTransactions(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, transaction_type, amount::text, title, category, type, status, description, reference_model, reference_id, reverses_model, reverses_id, transaction_date, actor_user_id, actor_role, voided_at, voided_duplicate_of_id, voided_original_amount::text, created_at, updated_at
		FROM project_budget_transactions WHERE project_id = $1 ORDER BY transaction_date DESC, id ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var id, projectIDVal, referenceID, reversesID, actorUserID, voidedDuplicate *int64
		var transactionType, amount, title, category, txType, status, description, referenceModel, reversesModel, actorRole, voidedOriginal *string
		var transactionDate, voidedAt, createdAt, updatedAt any

		if err := rows.Scan(&id, &projectIDVal, &transactionType, &amount, &title, &category, &txType, &status, &description, &referenceModel, &referenceID, &reversesModel, &reversesID, &transactionDate, &actorUserID, &actorRole, &voidedAt, &voidedDuplicate, &voidedOriginal, &createdAt, &updatedAt); err != nil {
			return nil, err
		}

		entry := jsonphp.NewObject()
		entry.Set("id", nullableInt64(id))
		entry.Set("project_id", nullableInt64(projectIDVal))
		entry.Set("transaction_type", nullableString(transactionType))
		entry.Set("amount", nullableString(amount))
		entry.Set("title", nullableString(title))
		entry.Set("category", nullableString(category))
		entry.Set("type", nullableString(txType))
		entry.Set("status", nullableString(status))
		entry.Set("description", nullableString(description))
		entry.Set("reference_model", nullableString(referenceModel))
		entry.Set("reference_id", nullableInt64(referenceID))
		entry.Set("reverses_model", nullableString(reversesModel))
		entry.Set("reverses_id", nullableInt64(reversesID))
		entry.Set("transaction_date", projectTimeValue(transactionDate))
		entry.Set("actor_user_id", nullableInt64(actorUserID))
		entry.Set("actor_role", nullableString(actorRole))
		entry.Set("voided_at", projectTimeValue(voidedAt))
		entry.Set("voided_duplicate_of_id", nullableInt64(voidedDuplicate))
		entry.Set("voided_original_amount", nullableString(voidedOriginal))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		out = append(out, entry)
	}

	return out, rows.Err()
}

// budgetSandbox renders the planning rows oldest-first with the casts
// (decimal string, boolean flag).
func budgetSandbox(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, title, estimated_amount::text, is_active, created_at, updated_at
		FROM project_budget_sandbox WHERE project_id = $1 ORDER BY created_at, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var id, projectIDVal *int64
		var title, estimated *string
		var active *bool
		var createdAt, updatedAt any

		if err := rows.Scan(&id, &projectIDVal, &title, &estimated, &active, &createdAt, &updatedAt); err != nil {
			return nil, err
		}

		entry := jsonphp.NewObject()
		entry.Set("id", nullableInt64(id))
		entry.Set("project_id", nullableInt64(projectIDVal))
		entry.Set("title", nullableString(title))
		entry.Set("estimated_amount", nullableString(estimated))
		entry.Set("is_active", active != nil && *active)
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		out = append(out, entry)
	}

	return out, rows.Err()
}

// budgetAddendums renders every addendum with its three user links. A
// missing link renders null under its relation key — the keys are always
// present (user, team_member, assigned_user).
func budgetAddendums(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, type, role_type, user_id, team_member_id, specialist_type, title, description, negotiation_note, attachment_path, amount::text, counter_offer_amount::text, recommended_bid_id, recommended_bid_type::text, status::text, payment_proof_path, verification_notes, paid_at, created_at, updated_at, procurement_request_id, assigned_user_id, refunded_amount::text
		FROM project_addendums WHERE project_id = $1 ORDER BY created_at DESC, id ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var id, projectIDVal, userID, teamMemberID, recommendedBidID, procurementID, assignedUserID *int64
		var addType, roleType, specialistType, title, description, negotiationNote, attachmentPath, amount, counterOffer, recommendedBidType, status, paymentProof, verificationNotes, refunded *string
		var paidAt, createdAt, updatedAt any

		if err := rows.Scan(&id, &projectIDVal, &addType, &roleType, &userID, &teamMemberID, &specialistType, &title, &description, &negotiationNote, &attachmentPath, &amount, &counterOffer, &recommendedBidID, &recommendedBidType, &status, &paymentProof, &verificationNotes, &paidAt, &createdAt, &updatedAt, &procurementID, &assignedUserID, &refunded); err != nil {
			return nil, err
		}

		entry := jsonphp.NewObject()
		entry.Set("id", nullableInt64(id))
		entry.Set("project_id", nullableInt64(projectIDVal))
		entry.Set("type", nullableString(addType))
		entry.Set("role_type", nullableString(roleType))
		entry.Set("user_id", nullableInt64(userID))
		entry.Set("team_member_id", nullableInt64(teamMemberID))
		entry.Set("specialist_type", nullableString(specialistType))
		entry.Set("title", nullableString(title))
		entry.Set("description", nullableString(description))
		entry.Set("negotiation_note", nullableString(negotiationNote))
		entry.Set("attachment_path", nullableString(attachmentPath))
		entry.Set("amount", nullableString(amount))
		entry.Set("counter_offer_amount", nullableString(counterOffer))
		entry.Set("recommended_bid_id", nullableInt64(recommendedBidID))
		entry.Set("recommended_bid_type", nullableString(recommendedBidType))
		entry.Set("status", nullableString(status))
		entry.Set("payment_proof_path", nullableString(paymentProof))
		entry.Set("verification_notes", nullableString(verificationNotes))
		entry.Set("paid_at", projectTimeValue(paidAt))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		entry.Set("procurement_request_id", nullableInt64(procurementID))
		entry.Set("assigned_user_id", nullableInt64(assignedUserID))
		entry.Set("refunded_amount", nullableString(refunded))

		user, err := nullableUser(ctx, pool, userID)
		if err != nil {
			return nil, err
		}
		entry.Set("user", user)

		teamMember, err := nullableTeamMember(ctx, pool, teamMemberID)
		if err != nil {
			return nil, err
		}
		entry.Set("team_member", teamMember)

		assigned, err := nullableUser(ctx, pool, assignedUserID)
		if err != nil {
			return nil, err
		}
		entry.Set("assigned_user", assigned)

		out = append(out, entry)
	}

	return out, rows.Err()
}

// nullableUser renders a user minus $hidden without phones, or null.
func nullableUser(ctx context.Context, pool *pgxpool.Pool, userID *int64) (any, error) {
	if userID == nil || *userID == 0 {
		return nil, nil
	}
	return fullProfileUser(ctx, pool, *userID, false)
}

// nullableTeamMember renders a team member row with its photo_url
// append, or null.
func nullableTeamMember(ctx context.Context, pool *pgxpool.Pool, memberID *int64) (any, error) {
	if memberID == nil || *memberID == 0 {
		return nil, nil
	}

	rows, err := pool.Query(ctx, `SELECT `+teamMembersColumns+` FROM team_members WHERE id = $1`, *memberID)
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

	entry := jsonphp.NewObject()
	for _, column := range fields {
		value := byName[column]
		switch column {
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		case "skills":
			entry.Set(column, jsonOrNil(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	var photoPath *string
	if raw, ok := byName["photo_path"].(string); ok && raw != "" {
		dup := raw
		photoPath = &dup
	}
	if photoPath != nil && (strings.HasPrefix(*photoPath, "http://") || strings.HasPrefix(*photoPath, "https://")) {
		entry.Set("photo_url", *photoPath)
	} else if photoPath != nil {
		entry.Set("photo_url", "/storage/"+*photoPath)
	} else {
		entry.Set("photo_url", nil)
	}

	return entry, nil
}

// budgetAcceptedBids renders the per-role accepted bid (legacy order,
// price restated as a string) with the professional tree, plus the PM
// block. Roles without an accepted bid render null.
func budgetAcceptedBids(ctx context.Context, pool *pgxpool.Pool, projectID int64, pmID *int64) (any, error) {
	accepted := jsonphp.NewObject()

	pmBlock := any(nil)
	if pmID != nil && *pmID != 0 {
		var userName *string
		_ = pool.QueryRow(ctx, `SELECT u.name FROM project_managers p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = $1`, *pmID).Scan(&userName)
		name := "Project Manager"
		if userName != nil && *userName != "" {
			name = *userName
		}

		user := jsonphp.NewObject()
		user.Set("name", name)
		pm := jsonphp.NewObject()
		pm.Set("user", user)

		block := jsonphp.NewObject()
		block.Set("id", *pmID)
		block.Set("pm", pm)
		block.Set("price", nil)
		block.Set("payment_status", nil)
		block.Set("paid_at", nil)

		var calculated, price, paymentStatus *string
		var paidAt any
		if err := pool.QueryRow(ctx, `SELECT calculated_total::text, price::text, payment_status::text, paid_at FROM bids WHERE project_id = $1 AND role::text = 'project_manager' AND status::text IN ('accepted','active','awaiting_payment') ORDER BY id LIMIT 1`,
			projectID).Scan(&calculated, &price, &paymentStatus, &paidAt); err == nil {
			pick := calculated
			if pick == nil {
				pick = price
			}
			block.Set("price", nullableString(pick))
			if paymentStatus == nil {
				block.Set("payment_status", "unpaid")
			} else {
				block.Set("payment_status", *paymentStatus)
			}
			block.Set("paid_at", projectTimeValue(paidAt))
		}

		pmBlock = block
	}
	accepted.Set("project_manager", pmBlock)

	for _, role := range []string{"arsitek", "kontraktor", "notaris", "interior"} {
		rows, err := pool.Query(ctx, `SELECT `+bidsColumns+` FROM bids WHERE project_id = $1 AND role::text = $2 AND status::text = 'accepted' ORDER BY id LIMIT 1`,
			projectID, role)
		if err != nil {
			return nil, err
		}

		var entry any
		if rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			rows.Close()
			if err != nil {
				return nil, err
			}

			bid := rawBidObject(role, fields, values)

			column, _ := bidProfileColumn(role)
			table, _ := bidProfileTable(role)
			profileID := profileID(bidMap(fields, values), column)
			if profileID != 0 {
				block, err := budgetProfileBlock(ctx, pool, table, profileID, role)
				if err != nil {
					return nil, err
				}
				bid.Set(relationKey(role), block)
			}

			entry = bid
		} else {
			rows.Close()
			if err := rows.Err(); err != nil {
				return nil, err
			}
		}

		accepted.Set(role, entry)
	}

	return accepted, nil
}

// relationKey names the nested profile key per bid role.
func relationKey(role string) string {
	switch role {
	case "arsitek":
		return "arsitek"
	case "kontraktor":
		return "kontraktor"
	case "notaris":
		return "notaris"
	case "interior":
		return "interior"
	default:
		return role
	}
}

// budgetProfileBlock renders a professional profile the way the budget
// dashboard nests it: table columns in order, average_rating and
// review_count, the role appends (kontraktor lokasi/no_telp, notaris
// is_verified), then the owner user without phones. fullProfileBlock
// cannot be reused: it appends the user first, which would order any
// role extra after it.
func budgetProfileBlock(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64, role string) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, `SELECT `+profileRowColumns(table)+` FROM `+table+` WHERE id = $1`, profileID)
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

	average, count := profileRating(ctx, pool, table, ratingFK(table), profileID)
	block.Set("average_rating", averageOrZero(average))
	block.Set("review_count", count)

	switch role {
	case "kontraktor":
		block.Set("lokasi", stringOrNil(bidTextOf(byName["alamat"])))
		block.Set("no_telp", stringOrNil(bidTextOf(byName["no_telepon"])))
	case "notaris":
		verification, _ := byName["verification_status"].(string)
		block.Set("is_verified", verification == "verified")
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

// bidTextOf reads an optional text column as a string pointer.
func bidTextOf(value any) *string {
	if s, ok := value.(string); ok {
		dup := s
		return &dup
	}
	return nil
}

// budgetTermins renders the full termin schedule in id order with the
// decimal and datetime casts applied.
func budgetTermins(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, role_type, recipient_id, label, percentage::text, amount::text, retention_amount::text, retention_released_at, retention_released_amount::text, net_amount::text, trigger_description, status::text, payment_proof_path, verification_notes, milestone_id, change_order_id, paid_at, notes, retention_notes, created_at, updated_at, refunded_amount::text
		FROM project_payment_termins WHERE project_id = $1 ORDER BY id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var id, projectIDVal, recipientID, milestoneID, changeOrderID *int64
		var roleType, label, percentage, amount, retention, retentionReleased, net, trigger, status, proofPath, verificationNotes, notes, retentionNotes, refunded *string
		var retentionReleasedAt, paidAt, createdAt, updatedAt any

		if err := rows.Scan(&id, &projectIDVal, &roleType, &recipientID, &label, &percentage, &amount, &retention, &retentionReleasedAt, &retentionReleased, &net, &trigger, &status, &proofPath, &verificationNotes, &milestoneID, &changeOrderID, &paidAt, &notes, &retentionNotes, &createdAt, &updatedAt, &refunded); err != nil {
			return nil, err
		}

		entry := jsonphp.NewObject()
		entry.Set("id", nullableInt64(id))
		entry.Set("project_id", nullableInt64(projectIDVal))
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
		out = append(out, entry)
	}

	return out, rows.Err()
}
