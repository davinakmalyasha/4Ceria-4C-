package httpapi

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PAYOUT DESTINATIONS, BUDGET SUMMARY, CLIENT HISTORY.

// projectPayoutDestinations renders who to pay per hired role. Only the
// owner, the assigned PM or an admin sees it; everyone else gets null.
func projectPayoutDestinations(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64, byName map[string]any, privileged bool) (any, error) {
	if !privileged {
		return nil, nil
	}

	columnFor := map[string]string{
		"arsitek":         "selected_arsitek_id",
		"kontraktor":      "selected_kontraktor_id",
		"notaris":         "selected_notaris_id",
		"interior":        "selected_interior_id",
		"structural":      "structural_id",
		"mep":             "mep_id",
		"project_manager": "pm_id",
	}
	tableFor := map[string]string{
		"arsitek":         "arsiteks",
		"kontraktor":      "kontraktors",
		"notaris":         "notaris_profiles",
		"interior":        "interior_profiles",
		"structural":      "structural_engineers",
		"mep":             "mep_engineers",
		"project_manager": "project_managers",
	}

	destinations := jsonphp.NewObject()
	emitted := false

	for _, role := range bidRoleOrder {
		raw, ok := byName[columnFor[role]]
		if !ok || raw == nil {
			continue
		}

		var profileID int64
		switch typed := raw.(type) {
		case int64:
			profileID = typed
		case int32:
			profileID = int64(typed)
		case int:
			profileID = int64(typed)
		default:
			continue
		}
		if profileID == 0 {
			continue
		}

		var userID *int64
		_ = pool.QueryRow(ctx, `SELECT user_id FROM `+tableFor[role]+` WHERE id = $1`, profileID).Scan(&userID)

		entry := jsonphp.NewObject()
		entry.Set("role", role)
		entry.Set("label", bidRoleLabels[role])

		if userID == nil || *userID == 0 {
			entry.Set("user_id", nil)
			entry.Set("name", nil)
			entry.Set("bank_name", nil)
			entry.Set("bank_account_number", nil)
			entry.Set("bank_account_name", nil)
			entry.Set("complete", false)
			destinations.Set(role, entry)
			continue
		}

		var id int64
		var name string
		var bankName, accountNo, accountName *string
		if err := pool.QueryRow(ctx, `SELECT id, name, bank_name, bank_account_number, bank_account_name FROM users WHERE id = $1`,
			*userID).Scan(&id, &name, &bankName, &accountNo, &accountName); err != nil {
			if isNoRows(err) {
				entry.Set("user_id", nil)
				entry.Set("name", nil)
				entry.Set("bank_name", nil)
				entry.Set("bank_account_number", nil)
				entry.Set("bank_account_name", nil)
				entry.Set("complete", false)
				destinations.Set(role, entry)
				continue
			}
			return nil, err
		}

		complete := bankName != nil && *bankName != "" && accountNo != nil && *accountNo != "" && accountName != nil && *accountName != ""

		entry.Set("user_id", id)
		entry.Set("name", name)
		entry.Set("bank_name", nullableString(bankName))
		entry.Set("bank_account_number", nullableString(accountNo))
		entry.Set("bank_account_name", nullableString(accountName))
		entry.Set("complete", complete)
		destinations.Set(role, entry)
		emitted = true
	}

	// An empty PHP array encodes as `[]`, not `{}`.
	if !emitted {
		return []any{}, nil
	}

	return destinations, nil
}

// projectBudgetSummary mirrors FinancialService::summary: the ceiling,
// the disbursed total (net of refunds), the available remainder, the
// committed-but-unpaid amount, and the exact minor-unit twins.
func projectBudgetSummary(ctx context.Context, pool *pgxpool.Pool, projectID int64, budget any) (any, error) {
	ceilingMinor, _ := parseMinor(orEmptyString(budget))

	var paidMinor int64
	if err := pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount) * 100)::bigint, 0) FROM project_budget_transactions WHERE project_id = $1 AND transaction_type::text IN ('payment','refund','platform_fee','retention_release')`,
		projectID).Scan(&paidMinor); err != nil {
		return nil, err
	}

	var addendumMinor int64
	if err := pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount) * 100)::bigint, 0) FROM project_addendums WHERE project_id = $1 AND status::text IN ('approved_unpaid','pending_approval','verifying')`,
		projectID).Scan(&addendumMinor); err != nil {
		return nil, err
	}

	var terminMinor int64
	if err := pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount) * 100)::bigint, 0) FROM project_payment_termins WHERE project_id = $1 AND status::text IN ('locked','pending','invoice_sent')`,
		projectID).Scan(&terminMinor); err != nil {
		return nil, err
	}

	committedMinor := addendumMinor + terminMinor
	availableMinor := ceilingMinor - paidMinor

	paidFloat := float64(paidMinor) / 100
	ceilingFloat := float64(ceilingMinor) / 100

	percent := 0.0
	if ceilingMinor > 0 {
		percent = paidFloat / ceilingFloat * 100
	}

	summary := jsonphp.NewObject()
	summary.Set("total", ceilingFloat)
	summary.Set("paid", paidFloat)
	summary.Set("allocated", float64(paidMinor+committedMinor)/100)
	summary.Set("committed", float64(committedMinor)/100)
	summary.Set("remaining", float64(availableMinor)/100)
	summary.Set("available", float64(availableMinor)/100)
	summary.Set("percent_used", percent)
	summary.Set("total_cents", ceilingMinor)
	summary.Set("paid_cents", paidMinor)
	summary.Set("committed_cents", committedMinor)
	summary.Set("available_cents", availableMinor)
	summary.Set("currency", "IDR")
	summary.Set("total_display", formatMinor(ceilingMinor))
	summary.Set("paid_display", formatMinor(paidMinor))
	summary.Set("committed_display", formatMinor(committedMinor))
	summary.Set("available_display", formatMinor(availableMinor))

	return summary, nil
}

// orEmptyString renders a nil decimal as "" (zero minor units).
func orEmptyString(value any) string {
	if value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}

// clientHistory is one owner's batched history block.
type clientHistory struct {
	posted     int64
	hired      int64
	active     int64
	totalSpent float64
	memberM    string
	hasMember  bool
}

// object renders the client_history block in key order.
func (h *clientHistory) object() *jsonphp.Object {
	hireRate := 0.0
	if h.posted > 0 {
		// PHP's round(): halves away from zero, integral results printing
		// bare — `round(100.0)` is `100`, not `100.0`.
		hireRate = math.Round(float64(h.hired) / float64(h.posted) * 100)
	}

	out := jsonphp.NewObject()
	out.Set("projects_posted", h.posted)
	out.Set("projects_hired", h.hired)
	out.Set("hire_rate", hireRate)
	out.Set("active_projects", h.active)
	out.Set("total_spent", h.totalSpent)
	if h.hasMember {
		out.Set("member_since", h.memberM)
	} else {
		out.Set("member_since", nil)
	}

	return out
}

// clientHistories batches the per-owner figures the list and show
// attach: posted/hired/active counts, net disbursed takings, and the
// member-since month.
func clientHistories(ctx context.Context, pool *pgxpool.Pool, ownerIDs map[int64]bool) (map[int64]*clientHistory, error) {
	histories := map[int64]*clientHistory{}
	if len(ownerIDs) == 0 {
		return histories, nil
	}

	ids := make([]int64, 0, len(ownerIDs))
	for id := range ownerIDs {
		if id != 0 {
			ids = append(ids, id)
			histories[id] = &clientHistory{}
		}
	}
	if len(ids) == 0 {
		return histories, nil
	}

	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	posted, err := countByUser(ctx, pool, `SELECT user_id, COUNT(*) FROM projects WHERE user_id = ANY($1) GROUP BY user_id`, ids)
	if err != nil {
		return nil, err
	}

	hired, err := countByUser(ctx, pool, `SELECT user_id, COUNT(*) FROM projects WHERE user_id = ANY($1) AND (selected_arsitek_id IS NOT NULL OR selected_kontraktor_id IS NOT NULL OR selected_notaris_id IS NOT NULL OR selected_interior_id IS NOT NULL OR pm_id IS NOT NULL OR structural_id IS NOT NULL OR mep_id IS NOT NULL) GROUP BY user_id`, ids)
	if err != nil {
		return nil, err
	}

	active, err := countByUser(ctx, pool, `SELECT user_id, COUNT(*) FROM projects WHERE user_id = ANY($1) AND status::text IN ('in_progress','awaiting_payment','accepted_arsitek','accepted_kontraktor','procurement') GROUP BY user_id`, ids)
	if err != nil {
		return nil, err
	}

	spentRows, err := pool.Query(ctx, `SELECT p.user_id, COALESCE((SUM(t.amount) * 100)::bigint, 0) FROM project_budget_transactions t JOIN projects p ON p.id = t.project_id WHERE p.user_id = ANY($1) AND t.transaction_type::text IN ('payment','refund','retention_release') GROUP BY p.user_id`, ids)
	if err != nil {
		return nil, err
	}
	spent := map[int64]int64{}
	for spentRows.Next() {
		var owner int64
		var minor int64
		if err := spentRows.Scan(&owner, &minor); err != nil {
			spentRows.Close()
			return nil, err
		}
		spent[owner] = minor
	}
	spentRows.Close()
	if err := spentRows.Err(); err != nil {
		return nil, err
	}

	for _, id := range ids {
		history := histories[id]
		history.posted = posted[id]
		history.hired = hired[id]
		history.active = active[id]

		if minor, ok := spent[id]; ok {
			history.totalSpent = float64(minor) / 100
		}

		var createdAt *time.Time
		if err := pool.QueryRow(ctx, `SELECT created_at FROM users WHERE id = $1`, id).Scan(&createdAt); err == nil && createdAt != nil {
			history.memberM = createdAt.Format("Jan 2006")
			history.hasMember = true
		}
	}

	return histories, nil
}

// countByUser runs a grouped count keyed by user id.
func countByUser(ctx context.Context, pool *pgxpool.Pool, query string, ids []int64) (map[int64]int64, error) {
	out := map[int64]int64{}

	rows, err := pool.Query(ctx, query, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var owner, count int64
		if err := rows.Scan(&owner, &count); err != nil {
			return nil, err
		}
		out[owner] = count
	}

	return out, rows.Err()
}
