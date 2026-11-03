package httpapi

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BID DECISIONS — accept-bid and decline-bid.
//
// Both mutate exactly one bid, notify exactly one professional, and answer
// the same ProjectResource the S2 reads build. The reload lists differ per
// endpoint (accept loads paymentTermins + the PM block, decline loads the
// structural/mep bids; neither loads milestones, requirements,
// sub-professionals or engineers), so each has its own load spec.

// acceptLoad is what acceptBid() reloads: images, owner phones, ratings,
// the five main bid relations unscoped, hired pros, the PM block and the
// (always empty live) termin list — with five-role counts and a budget
// summary, but no milestones, requirements, addendums or sub-professionals.
func acceptLoad() projectLoad {
	return projectLoad{
		images:         true,
		ownerPhone:     false,
		viewerBidRoles: []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager"},
		unscopedBids:   true,
		countRoles:     []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager"},
		clientHistory:  false,
		budgetSummary:  true,
		specialists:    false,
		hiredPros:      true,
		engineers:      []string{"interior_engineer"},
		engineerPhones: false,
		pmBlock:        true,
		paymentTermins: true,
		ratings:        true,
		requirements:   false,
		addendums:      false,
	}
}

// declineLoad is what declineBid() reloads: images, owner phones, ratings,
// the six non-PM bid relations unscoped and all seven counts — no PM block,
// no project_manager/bids_project_manager/accepted_pm keys, no termins.
func declineLoad() projectLoad {
	return projectLoad{
		images:         true,
		ownerPhone:     true,
		viewerBidRoles: []string{"arsitek", "kontraktor", "notaris", "interior", "structural", "mep"},
		unscopedBids:   true,
		countRoles:     bidCountRoles,
		clientHistory:  false,
		budgetSummary:  true,
		specialists:    false,
		hiredPros:      true,
		engineers:      []string{"interior_engineer"},
		engineerPhones: false,
		pmBlock:        false,
		paymentTermins: false,
		ratings:        true,
		requirements:   false,
		addendums:      false,
	}
}

// acceptBidTypeRule is `required|in:arsitek,kontraktor,notaris,interior,
// structural,mep` — notably WITHOUT project_manager and WITHOUT string.
var acceptBidTypes = []string{"arsitek", "kontraktor", "notaris", "interior", "structural", "mep"}

// validateDecisionFields validates the shared accept/decline body:
// bid_id required|integer, bid_type required|in:6, verification_notes
// nullable|string|max:1000 (accept only).
func validateDecisionFields(fields map[string]any, withNotes bool, failures *errorBag) (bidID int64, bidType string, notes *string, ok bool) {
	ok = true

	rawID, present := fields["bid_id"]
	if !present || rawID == nil {
		failures.add("bid_id", "The bid id field is required.")
		ok = false
	} else {
		switch typed := rawID.(type) {
		case string:
			if strings.TrimSpace(typed) == "" {
				failures.add("bid_id", "The bid id field is required.")
				ok = false
			} else if !isIntegerText(typed) {
				failures.add("bid_id", "The bid id field must be an integer.")
				ok = false
			} else if parsed, err := strconv.ParseInt(strings.TrimSpace(typed), 10, 64); err != nil {
				failures.add("bid_id", "The bid id field must be an integer.")
				ok = false
			} else {
				bidID = parsed
			}
		case float64:
			if typed != math_Trunc(typed) {
				failures.add("bid_id", "The bid id field must be an integer.")
				ok = false
			} else {
				bidID = int64(typed)
			}
		case bool:
			// Laravel's integer rule lets `true` through (filter_var coerces);
			// the lookup then misses. Mirror the pass, not the error.
			if typed {
				bidID = 1
			} else {
				failures.add("bid_id", "The bid id field is required.")
				ok = false
			}
		default:
			text, _ := fieldNumeric(fields, "bid_id")
			if text == "" {
				failures.add("bid_id", "The bid id field is required.")
				ok = false
			} else if !isIntegerText(text) {
				failures.add("bid_id", "The bid id field must be an integer.")
				ok = false
			} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
				failures.add("bid_id", "The bid id field must be an integer.")
				ok = false
			} else {
				bidID = parsed
			}
		}
	}

	rawType, present := fields["bid_type"]
	if !present || rawType == nil {
		failures.add("bid_type", "The bid type field is required.")
		ok = false
	} else if text, isStr := rawType.(string); !isStr || strings.TrimSpace(text) == "" {
		if isStr {
			failures.add("bid_type", "The bid type field is required.")
		} else {
			failures.add("bid_type", "The selected bid type is invalid.")
		}
		ok = false
	} else {
		known := false
		for _, role := range acceptBidTypes {
			if text == role {
				known = true
				break
			}
		}
		if !known {
			failures.add("bid_type", "The selected bid type is invalid.")
			ok = false
		} else {
			bidType = text
		}
	}

	if withNotes {
		if raw, present := fields["verification_notes"]; present && raw != nil {
			if text, isStr := raw.(string); !isStr {
				failures.add("verification_notes", "The verification notes field must be a string.")
				ok = false
			} else if len(text) > 1000 {
				failures.add("verification_notes", "The verification notes field must not be greater than 1000 characters.")
				ok = false
			} else {
				dup := text
				notes = &dup
			}
		}
	}

	return bidID, bidType, notes, ok
}

// isIntegerText reports an optional-signed digit string.
func isIntegerText(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	if trimmed[0] == '+' || trimmed[0] == '-' {
		trimmed = trimmed[1:]
	}
	if trimmed == "" {
		return false
	}
	for _, c := range trimmed {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// math_Trunc truncates toward zero without importing math for one call.
func math_Trunc(value float64) float64 {
	if value < 0 {
		return float64(int64(value))
	}
	return float64(int64(value))
}

// decisionProject locks the project row for the decision transaction.
func decisionProject(ctx context.Context, tx pgx.Tx, projectID int64) (fields []string, values []any, err error) {
	rows, err := tx.Query(ctx, `SELECT `+projectsRowColumns+` FROM projects WHERE id = $1 FOR UPDATE`, projectID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	fields = fieldNames(rows)
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, nil, err
		}
		return nil, nil, pgx.ErrNoRows
	}

	values, err = scanRow(rows, len(fields))
	if err != nil {
		return nil, nil, err
	}

	return fields, values, rows.Err()
}

// insertActivityLog writes a project_activity_logs row.
func insertActivityLog(ctx context.Context, tx pgx.Tx, projectID, userID int64, action, details string) error {
	_, err := tx.Exec(ctx, `INSERT INTO project_activity_logs (project_id, user_id, action, details, created_at, updated_at) VALUES ($1, $2, $3, $4, date_trunc('second', now()), date_trunc('second', now()))`,
		projectID, userID, action, details)
	return err
}

// insertNotification writes a notifications row. Data is rendered in MySQL
// JSON text form (space after `:` and `,`), because the legacy store is a
// MySQL JSON column and its normalization is the wire shape.
func insertNotification(ctx context.Context, tx pgx.Tx, userID int64, kind, title, body, data string) error {
	_, err := tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, date_trunc('second', now()), date_trunc('second', now()))`,
		userID, kind, title, body, data)
	if err != nil {
		return err
	}
	// Push fan-out (best-effort, async): the in-app row is the contract,
	// the push is the extra. Failures never fail the request.
	if shouldPushForTx(ctx, tx, userID, kind) {
		go fanoutPushTx(userID, kind, title, body)
	}
	return nil
}

// mysqlJSONPair renders `{"project_id": 1, ...}` in MySQL JSON text form.
func mysqlJSONPair(pairs ...string) string {
	return "{" + strings.Join(pairs, ", ") + "}"
}

// mysqlJSONStr renders a JSON string value.
func mysqlJSONStr(value string) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return `""`
	}
	return string(encoded)
}

// decisisonBidderUserID reads the profile's user for the bid's role.
func decisisonBidderUserID(ctx context.Context, tx pgx.Tx, role string, bid map[string]any) *int64 {
	column, ok := bidProfileColumn(role)
	if !ok {
		return nil
	}

	profileID := profileID(bid, column)
	if profileID == 0 {
		return nil
	}

	table, ok := bidProfileTable(role)
	if !ok {
		return nil
	}

	var userID *int64
	if err := tx.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, profileID).Scan(&userID); err != nil {
		return nil
	}

	return userID
}

// bidMoney reads a bid decimal as float64 for the Rp 0 guard.
func bidMoney(value any) float64 {
	return bidFloatOf(value)
}

// ucfirst uppercases the first letter (the PM recommend details line).
func ucfirst(value string) string {
	if value == "" {
		return value
	}
	return strings.ToUpper(value[:1]) + value[1:]
}

// acceptGate reads the project for the pre-validation owner/PM check.
func acceptGate(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64) (ownerID int64, pmID *int64, isPM bool, title string, err error) {
	if err = pool.QueryRow(ctx, `SELECT user_id, pm_id, title FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &pmID, &title); err != nil {
		return 0, nil, false, "", err
	}

	if pmID != nil && *pmID != 0 {
		if own, ok := viewer.profiles["project_manager"]; ok && own == *pmID {
			isPM = true
		}
	}

	return ownerID, pmID, isPM, title, nil
}

// findBidTx loads one unified bid inside a transaction, preferring the
// legacy hit.
func findBidTx(ctx context.Context, tx pgx.Tx, projectID int64, role string, bidID int64) (fields []string, values []any, found bool, err error) {
	rows, err := tx.Query(ctx, `SELECT `+bidsColumns+` FROM bids WHERE project_id = $1 AND role::text = $2 AND (id = $3 OR legacy_id = $3) ORDER BY CASE WHEN legacy_id = $3 THEN 0 ELSE 1 END LIMIT 1`,
		projectID, role, bidID)
	if err != nil {
		return nil, nil, false, err
	}
	defer rows.Close()

	fields = fieldNames(rows)
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, nil, false, err
		}
		return nil, nil, false, nil
	}

	values, err = scanRow(rows, len(fields))
	if err != nil {
		return nil, nil, false, err
	}

	return fields, values, true, rows.Err()
}

// bidMap indexes a row by column.
func bidMap(fields []string, values []any) map[string]any {
	bid := map[string]any{}
	for i, column := range fields {
		bid[column] = values[i]
	}
	return bid
}

// bidPhysicalID reads the physical id for updates.
func bidPhysicalID(bid map[string]any) int64 {
	if id, ok := bid["id"].(int64); ok {
		return id
	}
	return 0
}

// bidOfferedBy reads offered_by_id as int64.
func bidOfferedBy(bid map[string]any) int64 {
	switch typed := bid["offered_by_id"].(type) {
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

// bidNegCount reads negotiation_count as int64.
func bidNegCount(bid map[string]any) int64 {
	switch typed := bid["negotiation_count"].(type) {
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

// bidIsRecommended reads is_recommended.
func bidIsRecommended(bid map[string]any) bool {
	if b, ok := bid["is_recommended"].(bool); ok {
		return b
	}
	return false
}

// bidFeeAgreedAt reports whether fee_agreed_at is set.
func bidFeeAgreedAt(bid map[string]any) bool {
	if bid["fee_agreed_at"] == nil {
		return false
	}
	if typed, ok := bid["fee_agreed_at"].(time.Time); ok {
		return !typed.IsZero()
	}
	return true
}

// txBidderUserID reads the bidder's user inside a transaction.
func txBidderUserID(ctx context.Context, tx pgx.Tx, role string, bid map[string]any) *int64 {
	column, ok := bidProfileColumn(role)
	if !ok {
		return nil
	}

	profileID := profileID(bid, column)
	if profileID == 0 {
		return nil
	}

	table, ok := bidProfileTable(role)
	if !ok {
		return nil
	}

	var userID *int64
	if err := tx.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, profileID).Scan(&userID); err != nil {
		return nil
	}

	return userID
}

// txLeadUserID reads a hired profile's user inside a transaction.
func txLeadUserID(ctx context.Context, tx pgx.Tx, table string, profileID *int64) *int64 {
	if profileID == nil || *profileID == 0 {
		return nil
	}

	var userID *int64
	if err := tx.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, *profileID).Scan(&userID); err != nil {
		return nil
	}

	return userID
}

// addendumLegalLabels mirrors ProjectLegalController::getRequirementLabel.
var addendumLegalLabels = map[string]string{
	"shm_shgb": "Sertifikat Tanah (SHM/SHGB)", "ajb_deed": "Akta Jual Beli (AJB)",
	"buku_tanah": "Buku Tanah (Land Book Copy)", "no_dispute_letter": "Surat Pernyataan Tidak Sengketa",
	"pbb_receipt": "Bukti Lunas PBB", "surat_ukur": "Surat Ukur (Measurement Letter)",
	"ktp_owner": "KTP (Owner Identity Card)", "kartu_keluarga": "Kartu Keluarga (KK)",
	"marriage_cert": "Surat Nikah (Marriage Certificate)", "npwp": "NPWP (Tax ID Number)",
	"surat_kuasa": "Surat Kuasa (Power of Attorney)", "prenuptial": "Perjanjian Kawin (Prenuptial Agreement)",
	"construction_contract": "Akta Perjanjian Pemborongan", "joint_build_agreement": "Perjanjian Bangun Bagi Hasil",
	"ppjb": "PPJB (Preliminary Sale & Purchase Agreement)", "pbg_permit": "PBG (Persetujuan Bangunan Gedung)",
	"slf_certification": "SLF (Sertifikat Laik Fungsi)", "environmental_permit": "SPPL/AMDAL (Environmental Permit)",
	"krk_kkpr": "KRK/KKPR (Zoning Advice)", "bphtb_receipt": "Bukti Bayar BPHTB",
	"pph_receipt": "Bukti Bayar PPh (Income Tax)", "apht_mortgage": "APHT (Akta Pemberian Hak Tanggungan)",
	"credit_agreement": "Perjanjian Kredit (Credit Agreement)", "bast_handover": "BAST (Berita Acara Serah Terima)",
	"lien_waiver": "Lien Waivers", "as_built_drawings": "As-Built Drawings (Record Drawings)",
	"obra_nueva": "Akta Pernyataan Obra Nueva", "misc_legal": "Field Reports (Misc Progress)",
}

// legalLabel resolves a requirement id to its milestone title.
func legalLabel(reqID string) string {
	if label, ok := addendumLegalLabels[reqID]; ok {
		return label
	}

	words := strings.Split(strings.ReplaceAll(reqID, "_", " "), " ")
	for i, word := range words {
		if word != "" {
			words[i] = strings.ToUpper(word[:1]) + word[1:]
		}
	}

	return strings.Join(words, " ")
}
