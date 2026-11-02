package main

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"

	"github.com/jackc/pgx/v5"
)

// THE BID FOLD
// ------------
// ADR-0014 folds seven legacy bid tables into one `bids` table with a role
// discriminator. The ETL is where the fold happens: `bids` has no MySQL
// source table, so the generic copier would print SKIPPED and the port
// would serve an empty bid surface forever.
//
// One COPY streams all seven tables in a fixed order. Each row carries its
// role literal, its bidder ids resolved through the profile table
// (`bidder_user_id ← profile.user_id`, `bidder_profile_id ← the legacy
// profile id verbatim), its own profile column set with the other six
// NULL, the universal columns shared by all seven, the role's extras, and
// `legacy_id` — the source row's id, which is what every ledger row and
// dispute still names (migration 0013).
//
// A dangling profile (a bid naming a profile row that no longer exists) is
// a hard error naming the row, not a silent drop: dropping it would lose a
// bid the legacy stack serves, and the unique index would hide the loss.

// bidSource is one legacy table's place in the fold.
type bidSource struct {
	table        string
	role         string
	profileCol   string
	profileTable string
}

// bidFoldSources is the whole legacy bid surface, in COPY order.
var bidFoldSources = []bidSource{
	{"bids_arsitek", "arsitek", "arsitek_id", "arsiteks"},
	{"bids_kontraktor", "kontraktor", "kontraktor_id", "kontraktors"},
	{"bids_notaris", "notaris", "notaris_id", "notaris_profiles"},
	{"bids_interior", "interior", "interior_id", "interior_profiles"},
	{"bids_project_manager", "project_manager", "pm_id", "project_managers"},
	{"bids_structural", "structural", "structural_id", "structural_engineers"},
	{"bids_mep", "mep", "mep_id", "mep_engineers"},
}

// bidTargetColumns is the COPY list: the PG column order plus legacy_id.
//
// `id` is deliberately ABSENT: the seven legacy id spaces overlap
// (notaris 97 and interior 97 are different bids), so preserving them as
// the primary key collides on the first COPY. PostgreSQL allocates fresh
// ids; `legacy_id` carries the source row's id, which is what every
// ledger row and dispute still names.
var bidTargetColumns = []string{
	"project_id", "role", "bidder_user_id", "bidder_profile_id",
	"arsitek_id", "kontraktor_id", "notaris_id", "interior_id", "pm_id", "structural_id", "mep_id",
	"price", "price_max", "negotiation_count", "fee_type", "unit_price", "quantity",
	"calculated_total", "proposal", "status", "is_recommended", "estimated_duration",
	"duration_unit", "attachment_1", "attachment_2", "attachment_3", "payment_status",
	"paid_at", "scopes", "deliverables", "created_at", "updated_at", "offered_by_id",
	"fee_agreed_at", "payment_proof_path", "verification_notes", "proposed_termins",
	"proposed_milestones", "refunded_amount", "proposed_team", "style",
	"construction_method", "cost_breakdown", "workforce_count", "equipment_owned",
	"warranty_months", "payment_preference", "tax_estimate", "fee_percentage",
	"selected_services", "license_number", "experience_years", "technical_notes",
	"interview_notes", "legacy_id",
}

// profileColumns selects the single profile column for a role; the other
// six read NULL.
func profileColumns(want string) []string {
	names := []string{"arsitek_id", "kontraktor_id", "notaris_id", "interior_id", "pm_id", "structural_id", "mep_id"}
	out := make([]string, 0, len(names))
	for _, name := range names {
		if name == want {
			out = append(out, "b."+name)
		} else {
			out = append(out, "NULL")
		}
	}
	return out
}

// foldBids streams all seven legacy bid tables into the unified target.
func foldBids(ctx context.Context, source *mysqlConn, target *pgx.Conn) (int, error) {
	reader, writer := io.Pipe()

	var (
		writeErr error
		rows     int
	)

	go func() {
		writeErr = streamBids(ctx, source, writer, &rows)
		_ = writer.CloseWithError(writeErr)
	}()

	copySQL := fmt.Sprintf(
		"COPY %s (%s) FROM STDIN WITH (FORMAT csv, NULL '')",
		quoteIdent("bids"),
		quoteIdents(bidTargetColumns),
	)

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

// streamBids writes one CSV record per legacy bid row, role by role.
func streamBids(ctx context.Context, source *mysqlConn, out io.Writer, rows *int) error {
	writer := csv.NewWriter(out)

	for _, bid := range bidFoldSources {
		present := map[string]bool{}
		columns, err := source.columns(ctx, bid.table)
		if err != nil {
			return fmt.Errorf("%s: %w", bid.table, err)
		}
		for _, column := range columns {
			present[column] = true
		}

		// An expression per COPY column, in COPY order. `id` is allocated
		// by PostgreSQL (see bidTargetColumns); `legacy_id` trails last.
		exprs := []string{"b.project_id", "'" + bid.role + "'", "prof.user_id", "b." + bid.profileCol}
		exprs = append(exprs, profileColumns(bid.profileCol)...)

		// The universal and role-specific columns: the source column when
		// the table has one, NULL when it does not (notaris has no
		// scopes/deliverables; interior and pm have no proposed_team).
		for _, column := range bidTargetColumns[11 : len(bidTargetColumns)-1] {
			if present[column] {
				exprs = append(exprs, "b."+column)
			} else {
				exprs = append(exprs, "NULL")
			}
		}

		exprs = append(exprs, "b.id")

		query := fmt.Sprintf("SELECT %s FROM %s b LEFT JOIN %s prof ON prof.id = b.%s ORDER BY b.id",
			strings.Join(exprs, ", "),
			quoteMySQLOne(bid.table),
			quoteMySQLOne(bid.profileTable),
			bid.profileCol,
		)

		result, err := source.db.QueryContext(ctx, query)
		if err != nil {
			return fmt.Errorf("%s: reading MySQL: %w", bid.table, err)
		}

		values := make([]any, len(exprs))
		pointers := make([]any, len(exprs))
		raw := make([][]byte, len(exprs))
		for i := range values {
			pointers[i] = &raw[i]
		}

		for result.Next() {
			if err := result.Scan(pointers...); err != nil {
				result.Close()
				return fmt.Errorf("%s: scanning: %w", bid.table, err)
			}

			// A bid naming a profile row that no longer exists would
			// violate bidder_user_id NOT NULL — or worse, silently attach
			// to the wrong person. Fail loudly instead.
			if raw[3] == nil {
				result.Close()
				return fmt.Errorf("%s id %s names %s %s, which does not exist",
					bid.table, string(raw[0]), bid.profileTable, string(raw[4]))
			}

			record := make([]string, len(exprs))
			for i := range raw {
				record[i] = normalise(raw[i], bidTargetColumns[i], "bids")
			}

			if err := writer.Write(record); err != nil {
				result.Close()
				return fmt.Errorf("%s: writing CSV: %w", bid.table, err)
			}

			*rows++
		}

		if err := result.Err(); err != nil {
			result.Close()
			return fmt.Errorf("%s: reading MySQL: %w", bid.table, err)
		}
		result.Close()
	}

	writer.Flush()
	return writer.Error()
}
func verifyBids(ctx context.Context, source *mysqlConn, target *pgx.Conn) (mysqlTotal, postgresTotal int64, err error) {
	for _, bid := range bidFoldSources {
		var count int64
		row := source.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+quoteMySQLOne(bid.table))
		if err := row.Scan(&count); err != nil {
			return 0, 0, fmt.Errorf("%s: counting MySQL rows: %w", bid.table, err)
		}
		mysqlTotal += count
	}

	if err := target.QueryRow(ctx, "SELECT COUNT(*) FROM "+quoteIdent("bids")).Scan(&postgresTotal); err != nil {
		return 0, 0, fmt.Errorf("counting PostgreSQL bids: %w", err)
	}

	return mysqlTotal, postgresTotal, nil
}
