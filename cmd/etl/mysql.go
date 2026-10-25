package main

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

// mysqlConn is the SOURCE side.
//
// It is `database/sql` rather than the driver's native connection because the
// only thing this side does is stream rows: `QueryContext` plus raw `[]byte`
// scans, which is exactly what the driver's default (no `parseTime`, no
// `sql.RawBytes` copy) gives.
type mysqlConn struct {
	db *sql.DB
}

func openSQL(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		_ = db.Close()

		return nil, err
	}

	return db, nil
}

func (m *mysqlConn) Close() error {
	return m.db.Close()
}

// columns reads the table's column order from information_schema rather than
// `SELECT *`, so the order is explicit and stable.
func (m *mysqlConn) columns(ctx context.Context, table string) ([]string, error) {
	rows, err := m.db.QueryContext(ctx, `
		SELECT COLUMN_NAME
		  FROM information_schema.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
		 ORDER BY ORDINAL_POSITION
	`, table)
	if err != nil {
		return nil, fmt.Errorf("reading MySQL columns: %w", err)
	}
	defer rows.Close()

	var columns []string

	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}

		columns = append(columns, name)
	}

	return columns, rows.Err()
}

// listMySQLTables is the set this database actually has, so a target table with
// no source is reported rather than attempted.
func listMySQLTables(ctx context.Context, source *mysqlConn) (map[string]bool, error) {
	rows, err := source.db.QueryContext(ctx, `
		SELECT TABLE_NAME
		  FROM information_schema.TABLES
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
	`)
	if err != nil {
		return nil, fmt.Errorf("reading MySQL tables: %w", err)
	}
	defer rows.Close()

	tables := map[string]bool{}

	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}

		tables[name] = true
	}

	return tables, rows.Err()
}
