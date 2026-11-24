package httpapi

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Batched admin-project audit columns.
//
// The admin list used to run three queries per project for bids, the open
// dispute and the ledger totals. These grouped queries answer the whole page
// at once and keep the same zero-value behaviour as the per-row versions.

type adminBidCounts struct {
	total   int64
	pending int64
}

func adminBidCountsBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64) (map[int64]adminBidCounts, error) {
	out := map[int64]adminBidCounts{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `
		SELECT project_id,
		       COUNT(*),
		       COALESCE(SUM(CASE WHEN status::text IN
		           ('pending','reviewed','invited','negotiating','shortlisted')
		           THEN 1 ELSE 0 END), 0)
		  FROM bids
		 WHERE project_id = ANY($1)
		 GROUP BY project_id
	`, projectIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var counts adminBidCounts
		if err := rows.Scan(&id, &counts.total, &counts.pending); err != nil {
			return nil, err
		}
		out[id] = counts
	}
	return out, rows.Err()
}

type adminDisputeRow struct {
	id    int64
	title string
}

func adminDisputesBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64) (map[int64]adminDisputeRow, error) {
	out := map[int64]adminDisputeRow{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT ON (project_id) project_id, id, title
		  FROM project_disputes
		 WHERE project_id = ANY($1)
		   AND status::text = 'open'
		 ORDER BY project_id, id
	`, projectIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var projectID int64
		var row adminDisputeRow
		if err := rows.Scan(&projectID, &row.id, &row.title); err != nil {
			return nil, err
		}
		out[projectID] = row
	}
	return out, rows.Err()
}

type adminLedgerRow struct {
	paid     int64
	refunded int64
}

func adminLedgerBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64) (map[int64]adminLedgerRow, error) {
	out := map[int64]adminLedgerRow{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `
		SELECT project_id,
		       COALESCE((SUM(CASE WHEN transaction_type::text IN
		           ('payment','platform_fee','retention_release')
		           THEN amount ELSE 0 END) * 100)::bigint, 0),
		       COALESCE((SUM(CASE WHEN transaction_type::text = 'refund'
		           THEN amount ELSE 0 END) * 100)::bigint, 0)
		  FROM project_budget_transactions
		 WHERE project_id = ANY($1)
		 GROUP BY project_id
	`, projectIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var row adminLedgerRow
		if err := rows.Scan(&id, &row.paid, &row.refunded); err != nil {
			return nil, err
		}
		out[id] = row
	}
	return out, rows.Err()
}
