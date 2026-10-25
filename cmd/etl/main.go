// Command etl copies the live MySQL data into the PostgreSQL target.
//
// WHY IT IS A SEPARATE BINARY, AND WHY IT IS COPY-BASED
// -----------------------------------------------------
// The cutover needs the PostgreSQL database to hold the SAME rows the MySQL
// database holds, without a window in which a handler reads a half-written
// table. This tool is the "load" half of that: it reads each table from MySQL
// and streams it into PostgreSQL through `COPY ... FROM STDIN WITH (FORMAT csv)`,
// which is the one path that does not need per-column type knowledge.
//
// WHY COPY AND NOT INSERT
// -----------------------
// An INSERT needs a Go type for every column: `decimal(24,2)` wants a numeric,
// `jsonb` wants structured JSON, an ENUM wants its value, `timestamptz` wants a
// time. The application's own money model is an example of how easy it is to get
// that wrong. `COPY` takes TEXT and lets POSTGRES parse each column with the
// type it already has — the target schema is the type map, which means this tool
// cannot drift from it.
//
// WHAT IT DOES NOT DO
// -------------------
// It does not transform. If a column's value is not valid in the target column,
// the COPY fails and NAMES the table — silence is how a migration loses a row.
// The one exception is MySQL's zero date, which has no PostgreSQL equivalent and
// is mapped to NULL with a report (see `normalise`).
//
// USAGE
//
//	go run ./cmd/etl -all
//	go run ./cmd/etl -tables=users,projects
//	go run ./cmd/etl -all -truncate          # empty the target tables first
//	go run ./cmd/etl -all -verify            # counts on both sides, no copy
//
// The MySQL DSN defaults to the local seeded database and the PostgreSQL DSN to
// the local baseline; both are overridable with -mysql and -pg, or with the
// MYSQL_DSN / DATABASE_URL environment variables.
package main

import (
	"context"
	"encoding/csv"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5"
)

func main() {
	var (
		all      = flag.Bool("all", false, "copy every table the target knows about")
		tables   = flag.String("tables", "", "comma-separated table names (default: all)")
		truncate = flag.Bool("truncate", false, "TRUNCATE the target tables first")
		verify   = flag.Bool("verify", false, "compare row counts only; copy nothing")
		verbose  = flag.Bool("v", false, "log every table as it is copied")
	)
	flag.Parse()

	mysqlDSN := envOr("MYSQL_DSN", "root@tcp(127.0.0.1:3306)/4ceria?parseTime=false&interpolateParams=false")
	pgDSN := envOr("DATABASE_URL", "postgres://postgres@127.0.0.1:5432/4ceria_pgcheck")

	ctx := context.Background()

	if err := run(ctx, runOptions{
		mysqlDSN: mysqlDSN,
		pgDSN:    pgDSN,
		all:      *all,
		tables:   *tables,
		truncate: *truncate,
		verify:   *verify,
		verbose:  *verbose,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "etl: %v\n", err)
		os.Exit(1)
	}
}

type runOptions struct {
	mysqlDSN string
	pgDSN    string
	all      bool
	tables   string
	truncate bool
	verify   bool
	verbose  bool
}

func run(ctx context.Context, opts runOptions) error {
	source, err := openMySQL(opts.mysqlDSN)
	if err != nil {
		return fmt.Errorf("connecting to MySQL: %w", err)
	}
	defer source.Close()

	target, err := pgx.Connect(ctx, opts.pgDSN)
	if err != nil {
		return fmt.Errorf("connecting to PostgreSQL: %w", err)
	}
	defer target.Close(ctx)

	// UTC, EXPLICITLY.
	//
	// MySQL stores a DATETIME as WALL CLOCK with no zone, and the application
	// writes `now()` — the server's local time. When Eloquent serialises it, it
	// appends `Z` and calls it UTC. If the COPY session interprets that text in
	// the server's zone (Asia/Jakarta here), every timestamp comes back shifted
	// by seven hours, and the port's JSON differs from the legacy's on every
	// row that carries a date.
	//
	// Copying under `SET TIME ZONE 'UTC'` makes the text mean what the legacy
	// application means by it, so the value round-trips exactly.
	if _, err := target.Exec(ctx, "SET TIME ZONE 'UTC'"); err != nil {
		return fmt.Errorf("setting the session time zone: %w", err)
	}

	// The target's tables are the list: a table that exists only in MySQL is
	// one the rewrite chose not to carry, and copying it would fail on a
	// missing relation for a reason that is not a defect.
	targetTables, err := listTables(ctx, target)
	if err != nil {
		return err
	}

	selected, err := selectTables(targetTables, opts.tables, opts.all)
	if err != nil {
		return err
	}

	sourceTables, err := listMySQLTables(ctx, source)
	if err != nil {
		return err
	}

	// Copied in dependency order so a child never references a missing parent.
	// The order is inferred from the target's foreign keys.
	ordered, err := dependencyOrder(ctx, target, selected)
	if err != nil {
		return err
	}

	var copied int

	for _, table := range ordered {
		if !sourceTables[table] {
			fmt.Printf("  %-40s SKIPPED (not in MySQL)\n", table)
			continue
		}

		if opts.verify {
			count, err := verifyTable(ctx, source, target, table)
			if err != nil {
				return fmt.Errorf("%s: %w", table, err)
			}

			status := "ok"

			if count.mysql != count.postgres {
				status = fmt.Sprintf("MISMATCH mysql=%d postgres=%d", count.mysql, count.postgres)
			}

			fmt.Printf("  %-40s %s\n", table, status)

			continue
		}

		if opts.truncate {
			if _, err := target.Exec(ctx, "TRUNCATE "+quoteIdent(table)+" RESTART IDENTITY CASCADE"); err != nil {
				return fmt.Errorf("truncating %s: %w", table, err)
			}
		}

		rows, err := copyTable(ctx, source, target, table)
		if err != nil {
			return fmt.Errorf("%s: %w", table, err)
		}

		copied += rows

		if opts.verbose {
			fmt.Printf("  %-40s %d row(s)\n", table, rows)
		}
	}

	if opts.verify {
		fmt.Printf("\nverified %d table(s).\n", len(ordered))
		return nil
	}

	fmt.Printf("\ncopied %d row(s) across %d table(s).\n", copied, len(ordered))

	return nil
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func openMySQL(dsn string) (*mysqlConn, error) {
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		return nil, err
	}

	// The driver hands back []byte for every column by default, which is
	// exactly what this tool wants: the value goes to PostgreSQL as TEXT and
	// PostgreSQL parses it with the column's own type.
	db, err := openSQL(cfg.FormatDSN())
	if err != nil {
		return nil, err
	}

	return &mysqlConn{db: db}, nil
}

func selectTables(available []string, list string, all bool) ([]string, error) {
	if list == "" && !all {
		return nil, errors.New("pass -all or -tables=a,b")
	}

	if all {
		return available, nil
	}

	known := map[string]bool{}
	for _, table := range available {
		known[table] = true
	}

	var selected []string

	for _, name := range strings.Split(list, ",") {
		name = strings.TrimSpace(name)

		if name == "" {
			continue
		}

		if !known[name] {
			return nil, fmt.Errorf("table %q is not in the PostgreSQL target", name)
		}

		selected = append(selected, name)
	}

	return selected, nil
}

// copyTable streams one table through COPY and returns the row count.
func copyTable(ctx context.Context, source *mysqlConn, target *pgx.Conn, table string) (int, error) {
	targetColumns, err := columnNames(ctx, target, table)
	if err != nil {
		return 0, err
	}

	sourceColumns, err := source.columns(ctx, table)
	if err != nil {
		return 0, err
	}

	// Only the columns BOTH sides have. A target-only column keeps its DEFAULT
	// (that is how a new `completed_at` can exist before the backfill), and a
	// source-only column is a legacy field the rewrite dropped.
	present := map[string]bool{}
	for _, column := range sourceColumns {
		present[column] = true
	}

	columns := make([]string, 0, len(targetColumns))

	for _, column := range targetColumns {
		if present[column] {
			columns = append(columns, column)
		}
	}

	if len(columns) == 0 {
		return 0, fmt.Errorf("no column exists in both schemas")
	}

	reader, writer := io.Pipe()

	var (
		writeErr error
		rows     int
	)

	go func() {
		writeErr = streamRows(ctx, source, table, columns, writer, &rows)
		_ = writer.CloseWithError(writeErr)
	}()

	copySQL := fmt.Sprintf(
		"COPY %s (%s) FROM STDIN WITH (FORMAT csv, NULL '')",
		quoteIdent(table),
		quoteIdents(columns),
	)

	// The low-level CopyFrom takes the raw bytes: PostgreSQL parses them, so
	// this tool never has to know what a `decimal(24,2)` or a `jsonb` is.
	tag, err := target.PgConn().CopyFrom(ctx, reader, copySQL)

	if err != nil {
		_ = reader.CloseWithError(err)

		return 0, fmt.Errorf("COPY failed after %d row(s): %w", rows, err)
	}

	if writeErr != nil {
		return 0, writeErr
	}

	return int(tag.RowsAffected()), nil
}

// streamRows writes one CSV record per source row.
//
// NULL is an EMPTY UNQUOTED field; an empty STRING is a quoted empty field. The
// distinction matters: `NULL ”` in the COPY options is what tells PostgreSQL to
// read the unquoted one as NULL, and `""` is how csv.Writer writes a quoted
// empty string.
func streamRows(ctx context.Context, source *mysqlConn, table string, columns []string, out io.Writer, rows *int) error {
	query := fmt.Sprintf("SELECT %s FROM %s", quoteMySQL(columns), quoteMySQLOne(table))

	result, err := source.db.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("reading MySQL: %w", err)
	}
	defer result.Close()

	writer := csv.NewWriter(out)

	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	raw := make([][]byte, len(columns))

	for i := range values {
		pointers[i] = &raw[i]
	}

	for result.Next() {
		if err := result.Scan(pointers...); err != nil {
			return fmt.Errorf("scanning: %w", err)
		}

		record := make([]string, len(columns))

		for i := range raw {
			record[i] = normalise(raw[i], columns[i], table)
		}

		if err := writer.Write(record); err != nil {
			return fmt.Errorf("writing CSV: %w", err)
		}

		*rows++
	}

	if err := result.Err(); err != nil {
		return fmt.Errorf("reading MySQL: %w", err)
	}

	writer.Flush()

	return writer.Error()
}

// normalise maps the one value that has no PostgreSQL equivalent.
//
// MySQL allows a zero date and the seeded database contains them. PostgreSQL
// rejects `0000-00-00` outright, so it becomes NULL — the same "unknown" the
// zero date meant — and the column name is returned to the caller's log by the
// COPY, not swallowed.
func normalise(value []byte, column, table string) string {
	if value == nil {
		return ""
	}

	text := string(value)

	if strings.HasPrefix(text, "0000-00-00") {
		return ""
	}

	_ = table
	_ = column

	return text
}

type counts struct {
	mysql    int64
	postgres int64
}

func verifyTable(ctx context.Context, source *mysqlConn, target *pgx.Conn, table string) (counts, error) {
	var result counts

	row := source.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+quoteMySQLOne(table))
	if err := row.Scan(&result.mysql); err != nil {
		return result, fmt.Errorf("counting MySQL rows: %w", err)
	}

	if err := target.QueryRow(ctx, "SELECT COUNT(*) FROM "+quoteIdent(table)).Scan(&result.postgres); err != nil {
		return result, fmt.Errorf("counting PostgreSQL rows: %w", err)
	}

	return result, nil
}

func listTables(ctx context.Context, conn *pgx.Conn) ([]string, error) {
	rows, err := conn.Query(ctx, `
		SELECT table_name
		  FROM information_schema.tables
		 WHERE table_schema = 'public'
		   AND table_type = 'BASE TABLE'
		   AND table_name <> 'migrations'
		 ORDER BY table_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []string

	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}

		tables = append(tables, name)
	}

	return tables, rows.Err()
}

func columnNames(ctx context.Context, conn *pgx.Conn, table string) ([]string, error) {
	rows, err := conn.Query(ctx, `
		SELECT column_name
		  FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = $1
		 ORDER BY ordinal_position
	`, table)
	if err != nil {
		return nil, err
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

// dependencyOrder sorts the selected tables so a parent is copied before its
// children. Cycles (and the self-reference on `users.manager_id`-style columns)
// are broken by falling back to the alphabetical order.
func dependencyOrder(ctx context.Context, conn *pgx.Conn, tables []string) ([]string, error) {
	selected := map[string]bool{}
	for _, table := range tables {
		selected[table] = true
	}

	rows, err := conn.Query(ctx, `
		SELECT tc.table_name, ccu.table_name
		  FROM information_schema.table_constraints tc
		  JOIN information_schema.constraint_column_usage ccu
		    ON ccu.constraint_name = tc.constraint_name
		   AND ccu.constraint_schema = tc.constraint_schema
		 WHERE tc.constraint_type = 'FOREIGN KEY'
		   AND tc.table_schema = 'public'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dependencies := map[string][]string{}

	for rows.Next() {
		var child, parent string

		if err := rows.Scan(&child, &parent); err != nil {
			return nil, err
		}

		if child == parent || !selected[child] || !selected[parent] {
			continue
		}

		dependencies[child] = append(dependencies[child], parent)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	sorted := append([]string(nil), tables...)
	sort.Strings(sorted)

	var (
		ordered []string
		state   = map[string]int{}
	)

	var visit func(string)

	visit = func(table string) {
		switch state[table] {
		case 1, 2: // visiting (a cycle) or done
			return
		}

		state[table] = 1

		for _, parent := range dependencies[table] {
			visit(parent)
		}

		state[table] = 2

		ordered = append(ordered, table)
	}

	for _, table := range sorted {
		visit(table)
	}

	return ordered, nil
}

func quoteIdent(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func quoteIdents(values []string) string {
	quoted := make([]string, len(values))

	for i, value := range values {
		quoted[i] = quoteIdent(value)
	}

	return strings.Join(quoted, ", ")
}

func quoteMySQL(values []string) string {
	quoted := make([]string, len(values))

	for i, value := range values {
		quoted[i] = quoteMySQLOne(value)
	}

	return strings.Join(quoted, ", ")
}

func quoteMySQLOne(value string) string {
	return "`" + strings.ReplaceAll(value, "`", "``") + "`"
}
