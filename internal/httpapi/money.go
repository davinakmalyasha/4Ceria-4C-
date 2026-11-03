package httpapi

import (
	"context"
	"math/big"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func trimSpaces(s string) string {
	s = strings.ReplaceAll(s, "\u00a0", "")
	s = strings.ReplaceAll(s, "\u202f", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, " ", "")
	return strings.TrimSpace(s)
}

func bigParseFloat(s string) (*big.Float, int, error) {
	return big.ParseFloat(trimSpaces(s), 10, 256, big.ToZero)
}

func bigNewFloat(v float64) *big.Float {
	return big.NewFloat(v)
}

func fInt(f *big.Float) int64 {
	iv, _ := f.Int64()
	return iv
}

// THE MONEY SUBSTRATE
// -------------------
// `record_refund` (and later `release_payment`) needs three things the
// handlers did not have yet:
//
//  1. turn a dispute's legacy `payment_type` short code (`termin`,
//     `arsitek_bid`, …) into the `ledger_reference_types` row the PG ledger
//     keys on (migration 0011 backfilled the three missing aliases);
//  2. resolve the linked payment row and lock it (`FOR UPDATE`, mirroring
//     `lockForUpdate()`), reading its label, status and refunded mirror;
//  3. sum the ledger in MINOR units — integers, never floats — exactly the
//     way `paidAgainst`/`refundedAgainst` do.
//
// All amounts here are int64 minor units (sen). Parsing mirrors
// `Money::normaliseDecimal` at scale 2: canonical digits, truncate (never
// round) beyond two places, no thousands separators. Formatting mirrors
// `toDecimal()`: `10000000.00`, `-500.25`.

// parseMinor reads a canonical decimal into minor units.
//
// It accepts what `Money::of` accepts — an optional sign, digits, an
// optional fraction — and truncates the fraction to two places rather than
// rounding, because rounding a value the ledger reconciles against a bank is
// how money is invented.
func parseMinor(raw string) (int64, bool) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 0, false
	}

	// Strip what `normaliseDecimal` strips (NBSP, narrow NBSP, _, space).
	s = strings.ReplaceAll(s, "\u00a0", "")
	s = strings.ReplaceAll(s, "\u202f", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, " ", "")

	negative := false
	if strings.HasPrefix(s, "+") {
		s = s[1:]
	} else if strings.HasPrefix(s, "-") {
		negative = true
		s = s[1:]
	}

	whole, frac, _ := strings.Cut(s, ".")

	if whole == "" || !isDigits(whole) {
		return 0, false
	}
	if strings.Contains(frac, ".") || (frac != "" && !isDigits(frac)) {
		return 0, false
	}

	// Truncate, never round.
	if len(frac) > 2 {
		frac = frac[:2]
	}
	for len(frac) < 2 {
		frac += "0"
	}

	var minor int64
	for _, digit := range whole + frac {
		minor = minor*10 + int64(digit-'0')
		if minor > 9_000_000_000_000_000_000 {
			return 0, false
		}
	}

	if negative {
		minor = -minor
	}

	return minor, true
}

// formatMinor renders minor units the way `toDecimal()` does.
func formatMinor(minor int64) string {
	negative := minor < 0
	if negative {
		minor = -minor
	}

	whole, frac := minor/100, minor%100

	digits := ""
	if frac < 10 {
		digits = "0"
	}
	digits += formatInt(frac)

	out := formatInt(whole) + "." + digits

	if negative {
		return "-" + out
	}

	return out
}

// numericMinor parses any `numeric` text (plain decimals, exponents) into
// minor units, truncating past 2 decimals. It is the exact replacement for
// `strconv.ParseFloat` range gates: floats cannot represent sen past 2^53,
// while this stays integer. Returns ok=false when the text is not numeric.
func numericMinor(raw string) (int64, bool) {
	s := raw
	// Fast path: plain decimals (what parseMinor accepts).
	if minor, ok := parseMinor(s); ok {
		return minor, true
	}
	// Slow path: exponents / other numeric spellings isNumericText accepts.
	// Use big.Float then truncate toward zero at 2 decimals.
	s = trimSpaces(s)
	if s == "" {
		return 0, false
	}
	// big.ParseFloat with 256 bits is exact for the magnitudes we gate
	// (<=1e14); truncation, never rounding.
	f, _, err := bigParseFloat(s)
	if err != nil {
		return 0, false
	}
	// f * 100, truncated toward zero.
	f.Mul(f, bigNewFloat(100))
	// Truncate toward zero: Int() truncates.
	iv := fInt(f)
	// Overflow guard: same bound as parseMinor.
	if iv > 9_000_000_000_000_000_000 || iv < -9_000_000_000_000_000_000 {
		return 0, false
	}
	return iv, true
}

// itoa renders a non-negative integer.
func formatInt(value int64) string {
	if value == 0 {
		return "0"
	}

	var digits []byte
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}

	return string(digits)
}

// registryIDs loads `ledger_reference_types` into two maps: every spelling
// (type_key, FQCN, alias) to id, and type_key to id.
func registryIDs(ctx context.Context, pool *pgxpool.Pool) (bySpelling map[string]int64, byKey map[string]int64, err error) {
	bySpelling = map[string]int64{}
	byKey = map[string]int64{}

	rows, err := pool.Query(ctx, `SELECT id, type_key, fqcn, legacy_aliases FROM ledger_reference_types`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var key, fqcn string
		var aliases []string
		if err := rows.Scan(&id, &key, &fqcn, &aliases); err != nil {
			return nil, nil, err
		}
		byKey[key] = id
		bySpelling[key] = id
		bySpelling[fqcn] = id
		for _, alias := range aliases {
			bySpelling[alias] = id
		}
	}

	return bySpelling, byKey, rows.Err()
}

// paymentFQCNs maps the dispute short code to the payment model's FQCN — the
// inverse of the registry, for the `reverses_model` the legacy code wrote as
// a class name. The FQCN is what `paidAgainst`/`refundedAgainst` filter on,
// so the spelling here decides which ledger rows count.
var paymentFQCNs = map[string]string{
	"termin":         `App\Models\ProjectPaymentTermin`,
	"addendum":       `App\Models\ProjectAddendum`,
	"material":       `App\Models\MaterialOrder`,
	"arsitek_bid":    `App\Models\BidArsitek`,
	"kontraktor_bid": `App\Models\BidKontraktor`,
	"notaris_bid":    `App\Models\BidNotaris`,
	"interior_bid":   `App\Models\BidInterior`,
	"pm_bid":         `App\Models\BidProjectManager`,
	"structural_bid": `App\Models\BidStructural`,
	"mep_bid":        `App\Models\BidMep`,
}

// registryShortCodes maps a registry type_key back to the dispute short
// code — for disputes whose link is stored as `payment_type_id`.
var registryShortCodes = map[string]string{
	"payment_termin":      "termin",
	"addendum":            "addendum",
	"material_order":      "material",
	"bid.arsitek":         "arsitek_bid",
	"bid.kontraktor":      "kontraktor_bid",
	"bid.notaris":         "notaris_bid",
	"bid.interior":        "interior_bid",
	"bid.project_manager": "pm_bid",
	"bid.structural":      "structural_bid",
	"bid.mep":             "mep_bid",
}

// paymentTarget is a linked payment row, locked for the arbitration.
type paymentTarget struct {
	// Short is the dispute short code (`termin`, `arsitek_bid`, …).
	Short string
	// ID is the payment row's id.
	ID int64
	// RefID is the id the ledger and the API name: the legacy id for
	// migrated rows (what every existing reference holds), the physical
	// id for rows the new stack created.
	RefID int64
	// Table is the PG table holding the row.
	Table string
	// FQCN is the payment model's class, for the ledger filters.
	FQCN string
	// RegistryID is the payment's `ledger_reference_types` id.
	RegistryID int64
	// Label is the human name for the ledger title.
	Label string
	// Title is the ledger title for a payment (`Payment: …`).
	Title string
	// Status is the row's lifecycle status.
	Status string
	// PaymentState is the settlement state (`payment_status ?? status`).
	PaymentState string
	// RoleType selects the termin recipient rule and bid activation.
	RoleType string
	// GrossMinor/NetMinor are the contracted and payable amounts.
	GrossMinor int64
	NetMinor   int64
	// RefundedMinor mirrors the row's refunded accumulator.
	RefundedMinor int64
	// TouchPaidAt mirrors `isset($model->paid_at)`: a stamp already
	// holding a value advances, a NULL stays NULL.
	TouchPaidAt bool
	// MirrorStatusColumn is the column a full refund flips to `refunded`:
	// `status`, except bids which flip `payment_status`.
	MirrorStatusColumn string
}

// errPaymentNotFound reports a link that resolves nowhere.
type errPaymentNotFound struct{ short, id string }

func (e *errPaymentNotFound) Error() string { return "payment not found: " + e.short + " #" + e.id }

// resolvePaymentTarget reads and locks the linked payment row.
//
// `termin`, `addendum`, `material` and the seven bid types all resolve —
// bids by (role, legacy id), preferring the legacy match because every
// existing reference still names it (migration 0013). An unknown short or
// a missing row reads as not found, and the caller answers the service's
// sentence (`The linked payment no longer exists…`, or the 404/400 pair
// on the release path).
func resolvePaymentTarget(ctx context.Context, tx pgx.Tx, bySpelling map[string]int64, short string, paymentID, projectID int64) (*paymentTarget, error) {
	fqcn, ok := paymentFQCNs[short]
	if !ok {
		return nil, &errPaymentNotFound{short, formatInt(paymentID)}
	}

	registryID, ok := bySpelling[fqcn]
	if !ok {
		return nil, &errPaymentNotFound{short, formatInt(paymentID)}
	}

	target := &paymentTarget{Short: short, ID: paymentID, RefID: paymentID, FQCN: fqcn, RegistryID: registryID}

	switch short {
	case "termin":
		target.Table = "project_payment_termins"
		target.MirrorStatusColumn = "status"
		var label, roleType, status string
		var amount, net, retention *string
		var paidAt *string
		var refunded *string
		if err := tx.QueryRow(ctx, `
			SELECT label, role_type::text, status::text,
			       amount::text, net_amount::text, retention_amount::text,
			       paid_at::text, refunded_amount::text
			  FROM project_payment_termins WHERE id = $1 AND project_id = $2
			   FOR UPDATE
		`, paymentID, projectID).Scan(&label, &roleType, &status, &amount, &net, &retention, &paidAt, &refunded); err != nil {
			return nil, &errPaymentNotFound{short, formatInt(paymentID)}
		}
		target.Label, target.Status, target.PaymentState = label, status, status
		target.RoleType = roleType
		target.Title = "Payment: " + label + " (" + roleType + ")"
		target.TouchPaidAt = paidAt != nil
		if gross, ok := parseMinor(orEmpty(amount)); ok {
			target.GrossMinor = gross
		}
		target.NetMinor = terminNetMinor(amount, net, retention)
		if refunded != nil {
			if minor, ok := parseMinor(*refunded); ok {
				target.RefundedMinor = minor
			}
		}
	case "addendum":
		target.Table = "project_addendums"
		target.MirrorStatusColumn = "status"
		var title *string
		var status *string
		var amount *string
		var paidAt *string
		var refunded *string
		if err := tx.QueryRow(ctx, `
			SELECT title, status::text, amount::text, paid_at::text, refunded_amount::text
			  FROM project_addendums WHERE id = $1 AND project_id = $2
			   FOR UPDATE
		`, paymentID, projectID).Scan(&title, &status, &amount, &paidAt, &refunded); err != nil {
			return nil, &errPaymentNotFound{short, formatInt(paymentID)}
		}
		if title != nil && *title != "" {
			target.Label = *title
		} else {
			target.Label = "#" + formatInt(paymentID)
		}
		target.Title = "Payment: " + target.Label
		if status != nil {
			target.Status, target.PaymentState = *status, *status
		}
		target.TouchPaidAt = paidAt != nil
		if gross, ok := parseMinor(orEmpty(amount)); ok {
			target.GrossMinor, target.NetMinor = gross, gross
		}
		if refunded != nil {
			if minor, ok := parseMinor(*refunded); ok {
				target.RefundedMinor = minor
			}
		}
	case "material":
		target.Table = "material_orders"
		target.MirrorStatusColumn = "status"
		var status *string
		var total, shipping *string
		var paidAt *string
		var refunded *string
		if err := tx.QueryRow(ctx, `
			SELECT status::text, total_price::text, shipping_cost::text, paid_at::text, refunded_amount::text
			  FROM material_orders WHERE id = $1 AND project_id = $2
			   FOR UPDATE
		`, paymentID, projectID).Scan(&status, &total, &shipping, &paidAt, &refunded); err != nil {
			return nil, &errPaymentNotFound{short, formatInt(paymentID)}
		}
		// MaterialOrder has no label/title/store_name column on either
		// engine, so the label falls through to `#id` on both.
		target.Label = "#" + formatInt(paymentID)
		target.Title = "Payment: Material Procurement"
		if status != nil {
			target.Status, target.PaymentState = *status, *status
		}
		target.TouchPaidAt = paidAt != nil
		gross, _ := parseMinor(orEmpty(total))
		ship, _ := parseMinor(orEmpty(shipping))
		target.GrossMinor, target.NetMinor = gross+ship, gross+ship
		if refunded != nil {
			if minor, ok := parseMinor(*refunded); ok {
				target.RefundedMinor = minor
			}
		}
	default:
		// The seven bid types resolve by (role, legacy id) — or by real
		// id for new-stack rows, preferring the legacy match because
		// every existing reference still names it.
		if _, known := bidShortSet()[short]; !known {
			return nil, &errPaymentNotFound{short, formatInt(paymentID)}
		}

		target.Table = "bids"
		target.MirrorStatusColumn = "payment_status"
		var legacyID *int64
		var status, paymentStatus *string
		var calculated, price, refunded *string
		var bidderUserID, bidderProfileID int64
		if err := tx.QueryRow(ctx, `
			SELECT id, legacy_id, status::text, payment_status::text,
			       calculated_total::text, price::text, refunded_amount::text,
			       bidder_user_id, bidder_profile_id
			  FROM bids
			 WHERE role::text = $1 AND (id = $2 OR legacy_id = $2) AND project_id = $3
			 ORDER BY CASE WHEN legacy_id = $2 THEN 0 ELSE 1 END, id
			 LIMIT 1
			 FOR UPDATE
		`, shortRole(short), paymentID, projectID).Scan(
			&target.ID, &legacyID, &status, &paymentStatus, &calculated, &price,
			&refunded, &bidderUserID, &bidderProfileID,
		); err != nil {
			return nil, &errPaymentNotFound{short, formatInt(paymentID)}
		}
		if status != nil {
			target.Status = *status
		}
		if paymentStatus != nil && *paymentStatus != "" {
			target.PaymentState = *paymentStatus
		} else {
			target.PaymentState = target.Status
		}
		// Bids stamp unconditionally (`$model->paid_at = now()` with no
		// isset gate — unlike the termin/addendum/material path).
		target.TouchPaidAt = true
		if minor, ok := parseMinor(orEmpty(calculated)); ok && minor > 0 {
			target.GrossMinor, target.NetMinor = minor, minor
		} else if minor, ok := parseMinor(orEmpty(price)); ok {
			target.GrossMinor, target.NetMinor = minor, minor
		}
		if legacyID != nil {
			target.RefID = *legacyID
		}
		if refunded != nil {
			if minor, ok := parseMinor(*refunded); ok {
				target.RefundedMinor = minor
			}
		}
		label := "#" + formatInt(paymentID)
		if name := bidderDisplayName(ctx, tx, short, bidderProfileID, bidderUserID); name != "" {
			label = name
		}
		target.Label, target.Title = label, "Professional Fee: "+label
	}

	return target, nil
}

// bidShortSet is the seven bid short codes.
func bidShortSet() map[string]bool {
	return map[string]bool{
		"arsitek_bid": true, "kontraktor_bid": true, "notaris_bid": true,
		"interior_bid": true, "pm_bid": true, "structural_bid": true, "mep_bid": true,
	}
}

// shortRole maps a bid short code to the unified `role` value.
func shortRole(short string) string {
	switch short {
	case "arsitek_bid":
		return "arsitek"
	case "kontraktor_bid":
		return "kontraktor"
	case "notaris_bid":
		return "notaris"
	case "interior_bid":
		return "interior"
	case "pm_bid":
		return "project_manager"
	case "structural_bid":
		return "structural"
	case "mep_bid":
		return "mep"
	default:
		return short
	}
}

// bidderDisplayName mirrors `getBidderName`: the profile's nama, else the
// user's name, else "" (the caller falls back to `#id`, exactly like
// `paymentLabel` does).
func bidderDisplayName(ctx context.Context, tx pgx.Tx, short string, profileID, userID int64) string {
	role, err := identity.ParseRole(shortRole(short))
	if err != nil {
		return ""
	}

	table, ok := identity.ProfileTableFor(role)
	if !ok {
		return ""
	}

	var nama *string
	_ = tx.QueryRow(ctx,
		`SELECT nama FROM `+string(table)+` WHERE id = $1`, profileID,
	).Scan(&nama)

	if nama != nil && *nama != "" {
		return *nama
	}

	var userName string
	if err := tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, userID).Scan(&userName); err == nil && userName != "" {
		return userName
	}

	return ""
}

// ledgerSums returns the GROSS paid and GROSS refunded against a payment, in
// minor units — `paidAgainst`/`refundedAgainst`, which the pre-2026-09-29
// code netted together and double-counted every prior reversal with.
// Refund rows carry a negative amount, so the sign is flipped here, once.
func ledgerSums(ctx context.Context, tx pgx.Tx, projectID, paymentRegistryID, paymentID int64) (paidMinor, refundedMinor int64, err error) {
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE((SUM(amount) * 100)::bigint, 0)
		  FROM project_budget_transactions
		 WHERE project_id = $1
		   AND reference_type_id = $2 AND reference_id = $3
		   AND transaction_type = 'payment'
	`, projectID, paymentRegistryID, paymentID).Scan(&paidMinor); err != nil {
		return 0, 0, err
	}

	var refundedNegative int64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE((SUM(amount) * 100)::bigint, 0)
		  FROM project_budget_transactions
		 WHERE project_id = $1
		   AND reverses_type_id = $2 AND reverses_id = $3
		   AND transaction_type = 'refund'
	`, projectID, paymentRegistryID, paymentID).Scan(&refundedNegative); err != nil {
		return 0, 0, err
	}

	if refundedNegative < 0 {
		refundedNegative = -refundedNegative
	}

	return paidMinor, refundedNegative, nil
}

// disputePaymentShort turns a dispute's `payment_type_id` into the string
// the service matches on. A missing link reads ("", false); a registry key
// with no legacy short code reads back the key itself — mirroring a
// dispute whose free-text `payment_type` names something the match does
// not know, which `getModel` answers with 400 `Invalid payment type`.
func disputePaymentShort(ctx context.Context, tx pgx.Tx, paymentTypeID *int64) (string, bool) {
	if paymentTypeID == nil {
		return "", false
	}

	var typeKey string
	if err := tx.QueryRow(ctx,
		`SELECT type_key FROM ledger_reference_types WHERE id = $1`, *paymentTypeID,
	).Scan(&typeKey); err != nil {
		return "", false
	}

	if short, ok := registryShortCodes[typeKey]; ok {
		return short, true
	}

	return typeKey, true
}
func refundTitle(disputeID int64, label string) string {
	return "Dispute #" + formatInt(disputeID) + " refund: " + label
}
