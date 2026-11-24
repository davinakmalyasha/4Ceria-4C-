package httpapi

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PAYOUT DESTINATIONS, BUDGET SUMMARY, CLIENT HISTORY.

// payoutMayBeVisible reports whether a viewer's list page can contain a
// privileged payout block. The per-project check still decides the value.
func (v *projectViewer) payoutMayBeVisible() bool {
	if v == nil {
		return false
	}
	if v.isAdmin {
		return true
	}
	return v.role == "user" || v.role == "project_manager"
}

// payoutColumnFor / payoutTableFor are the seven hired-role lookups. They are
// package maps because the list batch and the single path must use exactly the
// same role order and tables.
var payoutColumnFor = map[string]string{
	"arsitek":         "selected_arsitek_id",
	"kontraktor":      "selected_kontraktor_id",
	"notaris":         "selected_notaris_id",
	"interior":        "selected_interior_id",
	"structural":      "structural_id",
	"mep":             "mep_id",
	"project_manager": "pm_id",
}

var payoutTableFor = map[string]string{
	"arsitek":         "arsiteks",
	"kontraktor":      "kontraktors",
	"notaris":         "notaris_profiles",
	"interior":        "interior_profiles",
	"structural":      "structural_engineers",
	"mep":             "mep_engineers",
	"project_manager": "project_managers",
}

type payoutUser struct {
	id            int64
	name          string
	bankName      *string
	bankAccountNo *string
	bankAccountNm *string
}

// payoutDestinationObject is shared by the per-project and batched paths so
// their bytes cannot drift.
func payoutDestinationObject(role string, user *payoutUser) *jsonwire.Object {
	entry := jsonwire.NewObject()
	entry.Set("role", role)
	entry.Set("label", bidRoleLabels[role])

	if user == nil {
		entry.Set("user_id", nil)
		entry.Set("name", nil)
		entry.Set("bank_name", nil)
		entry.Set("bank_account_number", nil)
		entry.Set("bank_account_name", nil)
		entry.Set("complete", false)
		return entry
	}

	complete := user.bankName != nil && *user.bankName != "" &&
		user.bankAccountNo != nil && *user.bankAccountNo != "" &&
		user.bankAccountNm != nil && *user.bankAccountNm != ""

	entry.Set("user_id", user.id)
	entry.Set("name", user.name)
	entry.Set("bank_name", nullableString(user.bankName))
	entry.Set("bank_account_number", nullableString(user.bankAccountNo))
	entry.Set("bank_account_name", nullableString(user.bankAccountNm))
	entry.Set("complete", complete)
	return entry
}

// payoutUserByID reads the bank fields the destination block exposes. The
// profile user serializer hides these on purpose; this is the privileged read.
func payoutUserByID(ctx context.Context, pool *pgxpool.Pool, userID int64) (*payoutUser, error) {
	if userID == 0 {
		return nil, nil
	}
	var user payoutUser
	err := pool.QueryRow(ctx, `SELECT id, name, bank_name, bank_account_number, bank_account_name
		FROM users WHERE id = $1`, userID).
		Scan(&user.id, &user.name, &user.bankName, &user.bankAccountNo, &user.bankAccountNm)
	if isNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// projectPayoutDestinations renders who to pay per hired role. Only the
// owner, the assigned PM or an admin sees it; everyone else gets null.
func projectPayoutDestinations(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64, byName map[string]any, privileged bool) (any, error) {
	if !privileged {
		return nil, nil
	}

	destinations := jsonwire.NewObject()
	emitted := false

	for _, role := range bidRoleOrder {
		raw, ok := byName[payoutColumnFor[role]]
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
		_ = pool.QueryRow(ctx, `SELECT user_id FROM `+payoutTableFor[role]+` WHERE id = $1`, profileID).Scan(&userID)

		var user *payoutUser
		if userID != nil && *userID != 0 {
			var err error
			user, err = payoutUserByID(ctx, pool, *userID)
			if err != nil {
				return nil, err
			}
		}

		destinations.Set(role, payoutDestinationObject(role, user))
		if user != nil {
			emitted = true
		}
	}

	// An empty PHP array encodes as `[]`, not `{}`.
	if !emitted {
		return []any{}, nil
	}

	return destinations, nil
}

// projectPayoutDestinationsBundled serves the privileged payout block from a
// list page's prefetched map. A non-nil empty map means every project on the
// page has no destinations, which is still the empty array.
func projectPayoutDestinationsBundled(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64, byName map[string]any, privileged bool, bundle *listBundle) (any, error) {
	if !privileged {
		return nil, nil
	}
	if bundle != nil && bundle.payouts != nil {
		if value, ok := bundle.payouts[projectID]; ok {
			return value, nil
		}
		return []any{}, nil
	}
	return projectPayoutDestinations(ctx, pool, viewer, projectID, byName, privileged)
}

// projectBudgetSummary mirrors FinancialService::summary: the ceiling,
// the disbursed total (net of refunds), the available remainder, the
// committed-but-unpaid amount, and the exact minor-unit twins.
func projectBudgetSummary(ctx context.Context, pool *pgxpool.Pool, projectID int64, budget any) (any, error) {
	ceilingMinor, _ := parseMinor(orEmptyString(budget))

	// One query, one round trip. The three sums are independent and each is
	// a scalar subquery over an indexed project_id.
	var paidMinor, addendumMinor, terminMinor int64
	if err := pool.QueryRow(ctx, `
		SELECT
			(SELECT COALESCE(trunc(SUM(amount) * 100)::bigint, 0)
			   FROM project_budget_transactions
			  WHERE project_id = $1
			    AND transaction_type::text IN ('payment','refund','platform_fee','retention_release')),
			(SELECT COALESCE(trunc(SUM(amount) * 100)::bigint, 0)
			   FROM project_addendums
			  WHERE project_id = $1
			    AND status::text IN ('approved_unpaid','pending_approval','verifying')),
			(SELECT COALESCE(trunc(SUM(amount) * 100)::bigint, 0)
			   FROM project_payment_termins
			  WHERE project_id = $1
			    AND status::text IN ('locked','pending','invoice_sent'))
	`, projectID).Scan(&paidMinor, &addendumMinor, &terminMinor); err != nil {
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

	summary := jsonwire.NewObject()
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
func (h *clientHistory) object() *jsonwire.Object {
	hireRate := 0.0
	if h.posted > 0 {
		// PHP's round(): halves away from zero, integral results printing
		// bare — `round(100.0)` is `100`, not `100.0`.
		hireRate = math.Round(float64(h.hired) / float64(h.posted) * 100)
	}

	out := jsonwire.NewObject()
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

	// One grouped query answers all four project figures. The old shape ran
	// three count queries plus a separate ledger query, then one user query
	// per owner for the member date.
	type historyRow struct {
		posted int64
		hired  int64
		active int64
		spent  int64
	}
	figures := map[int64]historyRow{}
	rows, err := pool.Query(ctx, `
		SELECT p.user_id,
		       COUNT(*),
		       COUNT(*) FILTER (
		           WHERE p.selected_arsitek_id IS NOT NULL
		              OR p.selected_kontraktor_id IS NOT NULL
		              OR p.selected_notaris_id IS NOT NULL
		              OR p.selected_interior_id IS NOT NULL
		              OR p.pm_id IS NOT NULL
		              OR p.structural_id IS NOT NULL
		              OR p.mep_id IS NOT NULL
		       ),
		       COUNT(*) FILTER (
		           WHERE p.status::text IN
		               ('in_progress','awaiting_payment','accepted_arsitek','accepted_kontraktor','procurement')
		       ),
		       COALESCE((
		           SELECT (SUM(t.amount) * 100)::bigint
		             FROM project_budget_transactions t
		             JOIN projects spent ON spent.id = t.project_id
		            WHERE spent.user_id = p.user_id
		              AND t.transaction_type::text IN ('payment','refund','retention_release')
		       ), 0)
		  FROM projects p
		 WHERE p.user_id = ANY($1)
		 GROUP BY p.user_id`, ids)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var owner int64
		var row historyRow
		if err := rows.Scan(&owner, &row.posted, &row.hired, &row.active, &row.spent); err != nil {
			rows.Close()
			return nil, err
		}
		figures[owner] = row
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	members, err := pool.Query(ctx, `SELECT id, created_at FROM users WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	memberSince := map[int64]time.Time{}
	for members.Next() {
		var id int64
		var createdAt time.Time
		if err := members.Scan(&id, &createdAt); err != nil {
			members.Close()
			return nil, err
		}
		memberSince[id] = createdAt
	}
	if err := members.Err(); err != nil {
		members.Close()
		return nil, err
	}
	members.Close()

	for _, id := range ids {
		history := histories[id]
		row := figures[id]
		history.posted = row.posted
		history.hired = row.hired
		history.active = row.active
		history.totalSpent = float64(row.spent) / 100

		if createdAt, ok := memberSince[id]; ok {
			history.memberM = createdAt.Format("Jan 2006")
			history.hasMember = true
		}
	}

	return histories, nil
}
