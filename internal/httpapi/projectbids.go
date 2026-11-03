package httpapi

import (
	"context"
	"strconv"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BID BLOCKS — the seven per-role bid lists, their bidder trees, and the
// accepted-bid summaries.
//
// Reads come from the unified `bids` table (ADR-0014): one row per legacy
// bid, `role` discriminating, the wire id the legacy id for migrated rows.
// `visibleBids()` gates every block: the owner, the assigned PM or an admin
// sees every loaded bid, a professional sees only their own, anyone else
// none. Counts stay public.

// bidRoleOrder is config/bids.php order: the payout and iteration order.
var bidRoleOrder = []string{"arsitek", "kontraktor", "notaris", "interior", "structural", "mep", "project_manager"}

// bidRoleLabels mirrors config/bids.php labels.
var bidRoleLabels = map[string]string{
	"arsitek":         "Architect",
	"kontraktor":      "Contractor",
	"notaris":         "Notary",
	"interior":        "Interior Designer",
	"structural":      "Structural Engineer",
	"mep":             "MEP Engineer",
	"project_manager": "Project Manager",
}

// bidProfileColumn is the unified table's profile column per role.
func bidProfileColumn(role string) (string, bool) {
	switch role {
	case "arsitek":
		return "arsitek_id", true
	case "kontraktor":
		return "kontraktor_id", true
	case "notaris":
		return "notaris_id", true
	case "interior":
		return "interior_id", true
	case "project_manager":
		return "pm_id", true
	case "structural":
		return "structural_id", true
	case "mep":
		return "mep_id", true
	default:
		return "", false
	}
}

// bidProfileTable is the profile table per role.
func bidProfileTable(role string) (string, bool) {
	parsed, err := identity.ParseRole(role)
	if err != nil {
		return "", false
	}

	table, ok := identity.ProfileTableFor(parsed)
	if !ok {
		return "", false
	}

	return string(table), true
}

// bidRegistryKey is the ledger registry type key per role.
func bidRegistryKey(role string) string {
	return "bid." + role
}

// bidWireID is the id the wire names: the legacy id for migrated rows,
// the physical id for rows the new stack created.
func bidWireID(values map[string]any) int64 {
	if legacy, ok := values["legacy_id"].(int64); ok && legacy != 0 {
		return legacy
	}
	if id, ok := values["id"].(int64); ok {
		return id
	}
	return 0
}

// projectBidCounts counts unified bids per role for one project.
func projectBidCounts(ctx context.Context, pool *pgxpool.Pool, projectID int64) (map[string]int64, error) {
	counts := map[string]int64{}

	rows, err := pool.Query(ctx, `SELECT role::text, COUNT(*) FROM bids WHERE project_id = $1 GROUP BY role::text`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var role string
		var count int64
		if err := rows.Scan(&role, &count); err != nil {
			return nil, err
		}
		counts[role] = count
	}

	return counts, rows.Err()
}

// bidRow loads unified bid rows for one role, optionally scoped to one
// profile — the controller's eager-load constraint.
func bidRows(ctx context.Context, pool *pgxpool.Pool, projectID int64, role string, profileID *int64) ([]map[string]any, error) {
	column, ok := bidProfileColumn(role)
	if !ok {
		return nil, nil
	}

	query := `SELECT `+bidsColumns+` FROM bids WHERE project_id = $1 AND role::text = $2`
	args := []any{projectID, role}
	if profileID != nil {
		query += ` AND ` + column + ` = $3`
		args = append(args, *profileID)
	}
	query += ` ORDER BY id`

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := fieldNames(rows)
	var out []map[string]any

	for rows.Next() {
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}

		row := map[string]any{}
		for i, column := range fields {
			row[column] = values[i]
		}
		out = append(out, row)
	}

	return out, rows.Err()
}

// visibleBids filters loaded bid rows to what the viewer may see: every
// row for the owner/PM/admin, only the viewer's own profile rows
// otherwise, nothing for anyone else.
func visibleBids(rows []map[string]any, viewer *projectViewer, privileged bool, role string) []map[string]any {
	if rows == nil {
		return nil
	}

	if privileged {
		return rows
	}

	if viewer == nil || viewer.id == 0 {
		return []map[string]any{}
	}

	own, ok := viewer.profiles[role]
	if !ok || own == 0 {
		return []map[string]any{}
	}

	column, ok := bidProfileColumn(role)
	if !ok {
		return []map[string]any{}
	}

	out := make([]map[string]any, 0)
	for _, row := range rows {
		if profileID(row, column) == own {
			out = append(out, row)
		}
	}

	return out
}

// acceptedBidRow is the first contracted bid: accepted, awaiting_payment,
// active or contract_pending.
func acceptedBidRow(rows []map[string]any) map[string]any {
	for _, row := range rows {
		if status, _ := row["status"].(string); status == "accepted" || status == "awaiting_payment" || status == "active" || status == "contract_pending" {
			return row
		}
	}
	return nil
}

// profileID reads a profile id column from a bid row.
func profileID(row map[string]any, column string) int64 {
	switch typed := row[column].(type) {
	case nil:
		return 0
	case int64:
		return typed
	case int32:
		return int64(typed)
	case int:
		return int64(typed)
	default:
		return 0
	}
}

// projectBidBlocks renders the seven bid lists and the seven accepted
// summaries for the loaded roles, in key order.
// loadViewerBids reads the viewer's own-role bids once; every bid block
// is filtered from these rows, exactly like the controller's scoped
// eager loads.
func loadViewerBids(ctx context.Context, pool *pgxpool.Pool, projectID int64, viewer *projectViewer, spec projectLoad) (map[string][]map[string]any, error) {
	loaded := map[string][]map[string]any{}

	for _, role := range spec.viewerBidRoles {
		var profileID *int64
		if !spec.unscopedBids {
			own, ok := viewer.profiles[role]
			if !ok {
				continue
			}
			profileID = &own
		}

		rows, err := bidRows(ctx, pool, projectID, role, profileID)
		if err != nil {
			return nil, err
		}

		loaded[role] = rows
	}

	return loaded, nil
}

// renderBidLists renders the bids_X lists for the given roles, in order.
func renderBidLists(ctx context.Context, pool *pgxpool.Pool, row *jsonphp.Object, projectID int64, viewer *projectViewer, privileged bool, loaded map[string][]map[string]any, roles []string, bySpelling map[string]int64, withBidder bool, neg *negLogBatch, bb *bidderBatch) error {
	for _, role := range roles {
		rows, ok := loaded[role]
		if !ok {
			continue
		}

		visible := visibleBids(rows, viewer, privileged, role)

		items := make([]any, 0, len(visible))
		for _, bid := range visible {
			entry, err := bidEntry(ctx, pool, role, bid, privileged, bySpelling, withBidder, neg, projectID, bb)
			if err != nil {
				return err
			}

			items = append(items, entry)
		}

		row.Set("bids_"+role, items)
	}

	return nil
}

// renderAcceptedBids renders the accepted-bid summaries in the resource's
// fixed order: pm, notaris, arsitek, kontraktor, interior, structural,
// mep. Each appears exactly where its bids_X relation appears.
func renderAcceptedBids(ctx context.Context, pool *pgxpool.Pool, row *jsonphp.Object, loaded map[string][]map[string]any, viewer *projectViewer, privileged bool) error {
	for _, role := range []string{"project_manager", "notaris", "arsitek", "kontraktor", "interior", "structural", "mep"} {
		rows, ok := loaded[role]
		if !ok {
			continue
		}

		if accepted := acceptedBidRow(visibleBids(rows, viewer, privileged, role)); accepted != nil {
			entry, err := acceptedBidEntry(ctx, pool, role, accepted)
			if err != nil {
				return err
			}
			row.Set("accepted_"+trimRolePrefix(role)+"_bid", entry)
		} else {
			row.Set("accepted_"+trimRolePrefix(role)+"_bid", nil)
		}
	}

	return nil
}

// bidEntry renders one bid row for its role, in key order.
func bidEntry(ctx context.Context, pool *pgxpool.Pool, role string, bid map[string]any, privileged bool, bySpelling map[string]int64, withBidder bool, neg *negLogBatch, projectID int64, bb *bidderBatch) (*jsonphp.Object, error) {
	entry := jsonphp.NewObject()
	entry.Set("id", bidWireID(bid))
	entry.Set("price", decimalOrNilBid(bid, "price"))
	entry.Set("price_max", decimalOrNilBid(bid, "price_max"))

	if role == "project_manager" {
		entry.Set("calculated_total", decimalOrNilBid(bid, "calculated_total"))
		entry.Set("fee_type", stringOrNil(bid["fee_type"]))
		entry.Set("proposal", stringOrNil(bid["proposal"]))
		entry.Set("status", stringOrNil(bid["status"]))
		entry.Set("estimated_duration", bidDuration(bid, role))
		entry.Set("duration_unit", stringOrNil(bid["duration_unit"]))
		entry.Set("scopes", jsonOrNil(bid["scopes"]))
		entry.Set("deliverables", jsonOrNil(bid["deliverables"]))
		entry.Set("pm_id", intOrNilBid(bid, "pm_id"))
		entry.Set("offered_by_id", intOrNilBid(bid, "offered_by_id"))
		entry.Set("negotiation_count", intOrZeroBid(bid, "negotiation_count"))
		entry.Set("fee_agreed_at", timeOrNilBid(bid, "fee_agreed_at"))
		entry.Set("payment_status", stringOrNil(bid["payment_status"]))
		entry.Set("payment_proof_path", projectStorageURL(ctx, stringOrNil(bid["payment_proof_path"])))
		entry.Set("verification_notes", stringOrNil(bid["verification_notes"]))
		entry.Set("proposed_termins", jsonOrNil(bid["proposed_termins"]))
		entry.Set("proposed_milestones", jsonOrNil(bid["proposed_milestones"]))
		entry.Set("pro_signature_url", bidSignatureURL(ctx, "project_manager", bid, false))
		entry.Set("client_signature_url", bidSignatureURL(ctx, "project_manager", bid, true))
		entry.Set("negotiation_logs", bidNegotiationLogsBundled(ctx, pool, role, bid, bySpelling, neg, projectID))

		if column, ok := bidProfileColumn(role); ok {
			if role == "kontraktor" || role == "notaris" || role == "interior" {
				entry.Set(trimRolePrefix(role)+"_id", intOrNilBid(bid, column))
			}
		}
		entry.Set("proposal", stringOrNil(bid["proposal"]))
		entry.Set("attachment_1", projectStorageURL(ctx, stringOrNil(bid["attachment_1"])))
		entry.Set("attachment_2", projectStorageURL(ctx, stringOrNil(bid["attachment_2"])))
		entry.Set("attachment_3", projectStorageURL(ctx, stringOrNil(bid["attachment_3"])))
		entry.Set("created_at", timeOrNilBid(bid, "created_at"))
	} else {
		if role == "notaris" {
			entry.Set("calculated_total", decimalOrNilBid(bid, "calculated_total"))
			entry.Set("fee_type", stringOrNil(bid["fee_type"]))
			entry.Set("tax_estimate", decimalOrNilBid(bid, "tax_estimate"))
			entry.Set("selected_services", jsonOrNil(bid["selected_services"]))
		} else if role != "structural" && role != "mep" {
			// Structural/mep name fee_type/calculated_total AFTER
			// negotiation_logs (see below); every other role names them
			// up front with price.
			entry.Set("calculated_total", decimalOrNilBid(bid, "calculated_total"))
			entry.Set("fee_type", stringOrNil(bid["fee_type"]))
		}

		entry.Set("proposal", stringOrNil(bid["proposal"]))
		entry.Set("status", stringOrNil(bid["status"]))
		entry.Set("estimated_duration", bidDuration(bid, role))
		entry.Set("duration_unit", stringOrNil(bid["duration_unit"]))

		if role == "kontraktor" {
			entry.Set("construction_method", stringOrNil(bid["construction_method"]))
			entry.Set("cost_breakdown", jsonOrNil(bid["cost_breakdown"]))
			entry.Set("workforce_count", intOrNilBid(bid, "workforce_count"))
			entry.Set("equipment_owned", stringOrNil(bid["equipment_owned"]))
			entry.Set("warranty_months", intOrNilBid(bid, "warranty_months"))
			entry.Set("payment_preference", stringOrNil(bid["payment_preference"]))
		}

		if role != "notaris" {
			entry.Set("scopes", jsonOrNil(bid["scopes"]))
			entry.Set("deliverables", jsonOrNil(bid["deliverables"]))
		}
		entry.Set("attachments", bidAttachments(ctx, bid))
		entry.Set("created_at", timeOrNilBid(bid, "created_at"))

		if column, ok := bidProfileColumn(role); ok {
			if role == "project_manager" || role == "structural" || role == "mep" {
				entry.Set(trimRolePrefix(role)+"_id", intOrNilBid(bid, column))
			}
		}

		entry.Set("offered_by_id", intOrNilBid(bid, "offered_by_id"))
		entry.Set("negotiation_count", intOrZeroBid(bid, "negotiation_count"))
		entry.Set("fee_agreed_at", timeOrNilBid(bid, "fee_agreed_at"))
		entry.Set("payment_status", stringOrNil(bid["payment_status"]))
		entry.Set("payment_proof_path", projectStorageURL(ctx, stringOrNil(bid["payment_proof_path"])))
		entry.Set("verification_notes", stringOrNil(bid["verification_notes"]))
		entry.Set("proposed_termins", jsonOrNil(bid["proposed_termins"]))
		entry.Set("proposed_milestones", jsonOrNil(bid["proposed_milestones"]))

		if role == "arsitek" || role == "kontraktor" {
			entry.Set("proposed_team", jsonOrNil(bid["proposed_team"]))
		}

		entry.Set("pro_signature_url", bidSignatureURL(ctx, role, bid, false))
		entry.Set("client_signature_url", bidSignatureURL(ctx, role, bid, true))

		if role == "arsitek" || role == "interior" || role == "notaris" || role == "kontraktor" {
			entry.Set("is_recommended", boolOrFalse(bid["is_recommended"]))
		}

		entry.Set("negotiation_logs", bidNegotiationLogsBundled(ctx, pool, role, bid, bySpelling, neg, projectID))

		if column, ok := bidProfileColumn(role); ok {
			if role == "kontraktor" || role == "notaris" || role == "interior" {
				entry.Set(trimRolePrefix(role)+"_id", intOrNilBid(bid, column))
			}
		}

		if role == "structural" || role == "mep" {
			entry.Set("fee_type", stringOrNil(bid["fee_type"]))
			entry.Set("calculated_total", decimalOrNilBid(bid, "calculated_total"))
			entry.Set("is_recommended", boolOrFalse(bid["is_recommended"]))
			entry.Set("interview_notes", stringOrNil(bid["interview_notes"]))
		}
	}

	if withBidder {
		var bidder any
		var err error
		if bb != nil {
			bidder, err = bidderTreeBatched(ctx, role, bid, privileged, bb)
		} else {
			bidder, err = bidderTree(ctx, pool, role, bid, privileged)
		}
		if err != nil {
			return nil, err
		}
		entry.Set("bidder", bidder)
	} else {
		entry.Set("bidder", nil)
	}

	return entry, nil
}

// intOrZeroBid renders an integer or zero.
func intOrZeroBid(bid map[string]any, key string) any {
	if value := intPtrOf(bid[key]); value != nil {
		return *value
	}
	return 0
}

// timeOrNilBid renders a timestamptz or null.
func timeOrNilBid(bid map[string]any, key string) any {
	if typed, ok := bid[key].(time.Time); ok {
		return carbon(&typed)
	}
	return nil
}

// boolOrFalse renders a boolean, defaulting to false.
func boolOrFalse(value any) any {
	if b, ok := value.(bool); ok {
		return b
	}
	return false
}

// acceptedBidEntry renders the contracted-bid summary per role, in key order.
func acceptedBidEntry(ctx context.Context, pool *pgxpool.Pool, role string, bid map[string]any) (*jsonphp.Object, error) {
	entry := jsonphp.NewObject()

	entry.Set("id", bidWireID(bid))
	entry.Set("price", decimalOrNilBid(bid, "price"))

	switch role {
	case "project_manager":
		entry.Set("proposal", stringOrNil(bid["proposal"]))
		entry.Set("fee_type", stringOrNil(bid["fee_type"]))
		entry.Set("scopes", jsonOrNil(bid["scopes"]))
		entry.Set("deliverables", jsonOrNil(bid["deliverables"]))
		entry.Set("estimated_duration", bidDuration(bid, role))
		entry.Set("duration_unit", stringOrNil(bid["duration_unit"]))
		return entry, nil
	case "notaris":
		entry.Set("fee_type", stringOrNil(bid["fee_type"]))
		entry.Set("calculated_total", decimalOrNilBid(bid, "calculated_total"))
		entry.Set("tax_estimate", decimalOrNilBid(bid, "tax_estimate"))
		entry.Set("selected_services", jsonOrNil(bid["selected_services"]))
		entry.Set("proposal", stringOrNil(bid["proposal"]))
		entry.Set("estimated_duration", bidDuration(bid, role))
		entry.Set("duration_unit", stringOrNil(bid["duration_unit"]))
	case "arsitek", "kontraktor", "interior":
		entry.Set("proposal", stringOrNil(bid["proposal"]))
		entry.Set("scopes", jsonOrNil(bid["scopes"]))
		entry.Set("deliverables", jsonOrNil(bid["deliverables"]))
		if role == "kontraktor" {
			entry.Set("proposed_team", jsonOrNil(bid["proposed_team"]))
		}
		entry.Set("estimated_duration", bidDuration(bid, role))
		entry.Set("duration_unit", stringOrNil(bid["duration_unit"]))
		return entry, nil
	default:
		entry.Set("proposal", stringOrNil(bid["proposal"]))
		entry.Set("estimated_duration", bidDuration(bid, role))
		entry.Set("duration_unit", stringOrNil(bid["duration_unit"]))
		return entry, nil
	}

	if role == "notaris" {
		if notarisID := intPtrOf(bid["notaris_id"]); notarisID != nil {
			notaris, err := acceptedNotaris(ctx, pool, *notarisID)
			if err != nil {
				return nil, err
			}
			entry.Set("notaris", notaris)
		} else {
			entry.Set("notaris", nil)
		}
	}

	return entry, nil
}

// acceptedNotaris renders the notaris slice with its service catalogue.
func acceptedNotaris(ctx context.Context, pool *pgxpool.Pool, notarisID int64) (any, error) {
	var id int64
	var nama *string
	if err := pool.QueryRow(ctx, `SELECT id, nama FROM notaris_profiles WHERE id = $1`, notarisID).Scan(&id, &nama); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	rows, err := pool.Query(ctx, `SELECT id, title, description, price::text FROM notaris_services WHERE notaris_id = $1 ORDER BY id`, notarisID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	services := make([]any, 0)
	for rows.Next() {
		var serviceID int64
		var title, description, price *string
		if err := rows.Scan(&serviceID, &title, &description, &price); err != nil {
			return nil, err
		}
		service := jsonphp.NewObject()
		service.Set("id", serviceID)
		service.Set("title", nullableString(title))
		service.Set("description", nullableString(description))
		service.Set("price", nullableString(price))
		services = append(services, service)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	notaris := jsonphp.NewObject()
	notaris.Set("id", id)
	notaris.Set("nama", nullableString(nama))
	notaris.Set("services", services)

	return notaris, nil
}

// bidDuration mirrors the legacy column types: estimated_duration is a
// varchar on bids_notaris and bids_interior (a string on the wire) and an
// integer everywhere else. The unified table coerced everything to int,
// so the role decides the spelling.
func bidDuration(bid map[string]any, role string) any {
	value := intPtrOf(bid["estimated_duration"])
	if value == nil {
		return nil
	}
	if role == "notaris" || role == "interior" {
		return strconv.FormatInt(*value, 10)
	}
	return *value
}

// trimRolePrefix maps a role to its bid-block id key stem.
func trimRolePrefix(role string) string {
	switch role {
	case "project_manager":
		return "pm"
	default:
		return role
	}
}
