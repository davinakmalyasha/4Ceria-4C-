package httpapi

import (
	"context"
	"os"
	"path/filepath"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/domain/terminplan"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SHARED SIGNING HELPERS.

// filepathJoin joins path elements with the OS separator.
func filepathJoin(elem ...string) string {
	return filepath.Join(elem...)
}

// filepathFromSlash converts a slash path to the OS separator.
func filepathFromSlash(path string) string {
	return filepath.FromSlash(path)
}

// fileExists reports whether a regular file exists.
func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// poolPersistedStages reads the persisted non-void stages for a role.
func poolPersistedStages(ctx context.Context, pool *pgxpool.Pool, projectID int64, role string) ([]terminplan.Stage, error) {
	rows, err := pool.Query(ctx, `SELECT percentage::text, amount::text FROM project_payment_termins WHERE project_id = $1 AND role_type = $2 AND status::text <> 'void'`,
		projectID, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stages := []terminplan.Stage{}
	for rows.Next() {
		var percentage, amount *string
		if err := rows.Scan(&percentage, &amount); err != nil {
			return nil, err
		}

		stage := terminplan.Stage{}
		if percentage != nil {
			if parsed, err := strconv.ParseFloat(*percentage, 64); err == nil {
				stage.Percentage = parsed
			}
		}
		if amount != nil {
			if parsed, err := money.FromColumn(*amount, "IDR"); err == nil {
				stage.Amount = parsed
			}
		}
		stages = append(stages, stage)
	}

	return stages, rows.Err()
}
