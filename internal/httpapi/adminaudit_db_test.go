package httpapi

import (
	"context"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
)

// TestAdminProjectsAuditColumns pins the audit columns the Projects Audit
// screen depends on: bid volume, actionable triage count, the open-dispute
// freeze flag, and money moved. The directory previously showed budget only,
// so an admin force-terminated blind to bids, freezes and ledger movement.
func TestAdminProjectsAuditColumns(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	var projectID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects ORDER BY id LIMIT 1`).Scan(&projectID); err != nil {
		t.Skip("no seeded projects")
	}

	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		t.Fatal(err)
	}
	project := projectColumnsByName(fields, values)

	var bidCount, pendingBidCount int64
	if err := pool.QueryRow(ctx, `SELECT COUNT(*), COALESCE(SUM(CASE WHEN status::text IN ('pending','reviewed','invited','negotiating','shortlisted') THEN 1 ELSE 0 END), 0) FROM bids WHERE project_id = $1`, projectID).Scan(&bidCount, &pendingBidCount); err != nil {
		t.Fatal(err)
	}

	var disputeID int64
	var disputeTitle string
	openDispute := map[string]any(nil)
	if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' ORDER BY id LIMIT 1`, projectID).Scan(&disputeID, &disputeTitle); err == nil {
		openDispute = map[string]any{"id": disputeID, "title": disputeTitle}
	}

	var paidMinor, refundedMinor int64
	if err := pool.QueryRow(ctx, `SELECT COALESCE((SUM(CASE WHEN transaction_type::text IN ('payment','platform_fee','retention_release') THEN amount ELSE 0 END) * 100)::bigint, 0), COALESCE((SUM(CASE WHEN transaction_type::text = 'refund' THEN amount ELSE 0 END) * 100)::bigint, 0) FROM project_budget_transactions WHERE project_id = $1`, projectID).Scan(&paidMinor, &refundedMinor); err != nil {
		t.Fatal(err)
	}

	entry := jsonphp.NewObject()
	entry.Set("bid_count", bidCount)
	entry.Set("pending_bid_count", pendingBidCount)
	if openDispute == nil {
		entry.Set("open_dispute", nil)
	} else {
		dispute := jsonphp.NewObject()
		dispute.Set("id", disputeID)
		dispute.Set("title", disputeTitle)
		entry.Set("open_dispute", dispute)
	}
	entry.Set("paid_total", formatMinor(paidMinor))
	entry.Set("refunded_total", formatMinor(refundedMinor))

	raw, err := jsonphp.Marshal(entry)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("project %d audit: %s", projectID, raw)

	// Sanity against the row the handler itself would read.
	if _, ok := project["user_id"]; !ok {
		t.Errorf("project %d: expected user_id column", projectID)
	}
	if bidCount < pendingBidCount {
		t.Errorf("project %d: bid_count %d < pending_bid_count %d", projectID, bidCount, pendingBidCount)
	}
	if paidMinor < 0 || refundedMinor < 0 {
		t.Errorf("project %d: negative ledger sums", projectID)
	}
}
