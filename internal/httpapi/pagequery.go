package httpapi

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// collectRows reads a result set into its column names and value slices. It
// is used when the connection must be released before per-row enrichment
// starts, or when a page query is batched with its count.
func collectRows(rows pgx.Rows) ([]string, [][]any, error) {
	fields := fieldNames(rows)
	values := make([][]any, 0, 16)
	for rows.Next() {
		row, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, nil, err
		}
		values = append(values, row)
	}
	return fields, values, rows.Err()
}

// queryCountAndRows runs a paginator's count and page queries in ONE network
// round trip. The two statements are independent; the old shape paid two
// round trips for every list page.
//
// The scan callback runs while the batch connection is held. Callers that
// need to make more queries per row should collect plain values first and
// close the batch, rather than nesting a second pool acquisition inside the
// callback.
func queryCountAndRows(
	ctx context.Context,
	pool *pgxpool.Pool,
	countSQL string,
	countArgs []any,
	rowsSQL string,
	rowsArgs []any,
	scanRows func(pgx.Rows) error,
) (int, error) {
	batch := &pgx.Batch{}
	batch.Queue(countSQL, countArgs...)
	batch.Queue(rowsSQL, rowsArgs...)
	results := pool.SendBatch(ctx, batch)

	var total int
	if err := results.QueryRow().Scan(&total); err != nil {
		_ = results.Close()
		return 0, err
	}
	rows, err := results.Query()
	if err != nil {
		_ = results.Close()
		return 0, err
	}
	scanErr := scanRows(rows)
	rows.Close()
	closeErr := results.Close()
	if scanErr != nil {
		return 0, scanErr
	}
	if closeErr != nil {
		return 0, closeErr
	}
	return total, nil
}
