package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PAYMENT PROOF UPLOAD — POST
// /api/projects/{project}/payments/{type}/{id}/upload-proof.
//
// The owner or the assigned PM attaches a transfer receipt to a payable
// (termin, addendum, material order, or any of the seven bid types). The
// write refuses while a dispute is open, refuses a termin blocked behind
// an earlier unpaid stage, and never regresses a settled payment — the
// paid/refunded/void guard reads the state BEFORE the flip, because
// after it the old state is gone. The file lands on the vault receipts
// layout (replacing any previous proof) and the row flips to verifying.
//
// Two envelopes: FormRequest validation failures answer the standard
// 422 bag, but every service throw answers {status:"error",message}
// with the exception's own code — 400 for a bad type, 403 past the
// gate, 404 for a missing row, 422 for the business guards.

// UploadProofHandler serves
// `POST /api/projects/{project}/payments/{type}/{id}/upload-proof`.
func UploadProofHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		rawProject := r.PathValue("project")
		if rawProject == "" {
			rawProject = projectPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(rawProject, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		paymentType := r.PathValue("type")
		if paymentType == "" {
			paymentType = proofTypeFromPath(r.URL.Path)
		}

		rawID := r.PathValue("id")
		if rawID == "" {
			rawReq := proofIDFromPath(r.URL.Path)
			rawID = rawReq
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("proof: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("proof: project", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)

		formFields, formFiles, err := requestFields(r)
		if err != nil {
			failures := &errorBag{}
			failures.add("proof", "The proof field is required.")
			failures.write(w)
			return
		}

		failures := &errorBag{}
		upload := validateProofFile(formFields, formFiles, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var pmID int64
		if id, ok := projectColumnsByName(fields, values)["pm_id"].(int64); ok {
			pmID = id
		}
		isOwner := viewer.id == ownerID
		isPM := viewer.role == "project_manager" && pmID != 0 && viewer.profiles["project_manager"] == pmID
		if !isOwner && !isPM {
			proofError(w, http.StatusForbidden, "Unauthorized. Only the Project Owner or assigned Project Manager can upload payment proofs.")
			return
		}

		var openID int64
		var openTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
			proofError(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("proof: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		contents, err := readUploadedFile(r, "proof")
		if err != nil {
			slog.Error("proof: read", "error", err)
			serverError(w)
			return
		}
		upload.data = contents

		stored, data, err := storePaymentProof(ctx, tx, pool, projectID, paymentType, rawID, viewer, upload, contents)
		if err != nil {
			if proofErr, ok := err.(proofErrorValue); ok {
				proofError(w, proofErr.status, proofErr.message)
				return
			}
			slog.Error("proof: store", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("proof: commit", "error", err)
			serverError(w)
			return
		}

		_ = stored

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("message", "Proof of transfer uploaded successfully.")
		payload.Set("data", data)

		writeJSON(w, http.StatusOK, payload)
	}
}

// proofError answers the service envelope: {status:"error",message}
// with the exception's own code — never the standard error shape.
func proofError(w http.ResponseWriter, status int, msg string) {
	payload := jsonphp.NewObject()
	payload.Set("status", "error")
	payload.Set("message", msg)

	writeJSON(w, status, payload)
}

// proofErrorValue carries a service throw through the transaction.
type proofErrorValue struct {
	status  int
	message string
}

func (proofErrorValue) Error() string { return "payment proof rejected" }

// proofTypeFromPath reads the segment after "payments".
func proofTypeFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := 0; i+1 < len(parts); i++ {
		if parts[i] == "payments" {
			return parts[i+1]
		}
	}
	return ""
}

// proofIDFromPath reads the segment before a trailing "upload-proof".
func proofIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] == "upload-proof" && i > 0 {
			return parts[i-1]
		}
	}
	return lastPathSegment(path)
}

// validateProofFile enforces required|file|mimes:jpeg,png,jpg,pdf|max:5120.
// A non-file value fails BOTH the file and the mimes rules, in that
// order; size is checked last. The max rule mirrors the application
// cap (5 MB): the local 2M php.ini pre-empts it with "failed to
// upload", which is environment, not application, and stays out of the
// gate (see the lesson).
func validateProofFile(fields map[string]any, files map[string]*uploadedFile, failures *errorBag) *uploadedFile {
	raw, fieldPresent := fields["proof"]
	file, filePresent := files["proof"]

	if !filePresent && (!fieldPresent || raw == nil) {
		failures.add("proof", "The proof field is required.")
		return nil
	}

	if !filePresent {
		failures.add("proof", "The proof field must be a file.")
		failures.add("proof", "The proof field must be a file of type: jpeg, png, jpg, pdf.")
		return nil
	}

	allowed := map[string]bool{"jpeg": true, "png": true, "jpg": true, "pdf": true}
	if !allowed[strings.ToLower(file.ext)] {
		failures.add("proof", "The proof field must be a file of type: jpeg, png, jpg, pdf.")
		return nil
	}

	if file.size > 5120*1024 {
		failures.add("proof", "The proof field must not be greater than 5120 kilobytes.")
		return nil
	}

	return file
}

// storePaymentProof runs the upload inside the caller's transaction and
// renders the 200 data. A proofErrorValue carries the oracle's own
// 4xx message and status.
func storePaymentProof(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID int64, paymentType, rawID string, viewer *projectViewer, upload *uploadedFile, contents []byte) (string, *jsonphp.Object, error) {
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil {
		return "", nil, proofErrorValue{status: 404, message: "Payment record not found."}
	}

	role, table, isBid := proofBidRole(paymentType)
	if !isBid {
		switch paymentType {
		case "termin", "addendum", "material":
		default:
			return "", nil, proofErrorValue{status: 400, message: "Invalid payment type: " + paymentType}
		}
	}

	switch {
	case paymentType == "termin":
		return storeTerminProof(ctx, tx, pool, projectID, id, viewer, upload.filename, contents)
	case paymentType == "addendum":
		return storeAddendumProof(ctx, tx, pool, projectID, id, viewer, upload.filename, contents)
	case paymentType == "material":
		return storeMaterialProof(ctx, tx, pool, projectID, id, viewer, upload.filename, contents)
	default:
		return storeBidProof(ctx, tx, pool, projectID, role, table, id, viewer, upload.filename, contents)
	}
}

// proofBidRole maps a *_bid payment type to its bid role and profile
// table. pm_bid is the project_manager role under its legacy name.
func proofBidRole(paymentType string) (role, table string, ok bool) {
	switch paymentType {
	case "arsitek_bid":
		return "arsitek", "arsiteks", true
	case "kontraktor_bid":
		return "kontraktor", "kontraktors", true
	case "notaris_bid":
		return "notaris", "notaris_profiles", true
	case "interior_bid":
		return "interior", "interior_profiles", true
	case "pm_bid":
		return "project_manager", "project_managers", true
	case "structural_bid":
		return "structural", "structural_engineers", true
	case "mep_bid":
		return "mep", "mep_engineers", true
	default:
		return "", "", false
	}
}

// proofSettled rejects an already-settled payment with the oracle's
// per-state sentence. `current` is the settlement state
// (payment_status when set, else status); `lifecycle` is the row's
// own status column.
func proofSettled(current *string, lifecycle *string) *proofErrorValue {
	state := ""
	if current != nil {
		state = *current
	}

	switch state {
	case "paid":
		return &proofErrorValue{status: 422, message: "This payment is already marked as paid and cannot be modified."}
	case "refunded":
		return &proofErrorValue{status: 422, message: "This payment was refunded through dispute arbitration and cannot be re-charged."}
	case "void":
		return &proofErrorValue{status: 422, message: "This payment stage was voided (contract terminated or re-signed) and is no longer payable."}
	}

	if lifecycle != nil {
		switch *lifecycle {
		case "terminated", "resigned", "void", "cancelled":
			return &proofErrorValue{status: 422, message: "This payment is no longer payable — the related contract was " + *lifecycle + "."}
		}
	}

	return nil
}

// removeVaultFile deletes a vault-relative file when it exists.
func removeVaultFile(rel string) error {
	full := vaultFullPath(rel)
	if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// vaultFullPath resolves a vault-relative path on local disk.
func vaultFullPath(rel string) string {
	return filepath.Join(vaultBaseDir(), filepath.FromSlash(rel))
}

// storeProofFile writes the receipt and drops the previous one when it
// still exists on the vault.
func storeProofFile(filename string, contents []byte, oldPath *string) (string, error) {
	stored, err := storeVaultFile("receipts", filename, contents)
	if err != nil {
		return "", err
	}

	if oldPath != nil && *oldPath != "" && *oldPath != stored {
		_ = removeVaultFile(*oldPath)
	}

	return stored, nil
}

// terminSubProfessional mirrors the oracle's carve-out: a milestone of
// type sub_professional, or any role outside the five core licensed
// ones, skips the previous-stage ordering check.
func terminSubProfessional(ctx context.Context, tx pgx.Tx, milestoneID *int64, role string) (bool, error) {
	switch role {
	case "arsitek", "kontraktor", "notaris", "interior", "project_manager":
	default:
		return true, nil
	}

	if milestoneID == nil || *milestoneID == 0 {
		return false, nil
	}

	var milestoneType *string
	if err := tx.QueryRow(ctx, `SELECT type FROM project_milestones WHERE id = $1`, *milestoneID).Scan(&milestoneType); err != nil {
		return false, err
	}

	return milestoneType != nil && *milestoneType == "sub_professional", nil
}

// terminUnpaidPrevious mirrors the oracle's ordering guard: an earlier
// stage of the same project and role that is neither paid nor
// verifying blocks the upload — with the percentage-0 change-order
// carve-out that only looks at earlier-or-equal milestones.
func terminUnpaidPrevious(ctx context.Context, tx pgx.Tx, projectID int64, role string, terminID int64, percentage string, milestoneID *int64) (bool, error) {
	if percentage == "0" || percentage == "0.00" {
		if milestoneID != nil && *milestoneID != 0 {
			var blocked bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_payment_termins WHERE project_id = $1 AND role_type = $2 AND id < $3 AND status::text NOT IN ('paid','verifying') AND (milestone_id <= $4 OR milestone_id IS NULL))`,
				projectID, role, terminID, *milestoneID).Scan(&blocked); err != nil {
				return false, err
			}
			return blocked, nil
		}
		return false, nil
	}

	var blocked bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_payment_termins WHERE project_id = $1 AND role_type = $2 AND id < $3 AND status::text NOT IN ('paid','verifying'))`,
		projectID, role, terminID).Scan(&blocked); err != nil {
		return false, err
	}
	return blocked, nil
}

// storeTerminProof uploads a receipt for a payment termin.
func storeTerminProof(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID, terminID int64, viewer *projectViewer, filename string, contents []byte) (string, *jsonphp.Object, error) {
	_ = pool
	_ = viewer

	rows, err := tx.Query(ctx, `SELECT `+terminsColumns+` FROM project_payment_termins WHERE id = $1 AND project_id = $2 FOR UPDATE`, terminID, projectID)
	if err != nil {
		return "", nil, err
	}
	byName, err := scanLockedRow(rows)
	if err != nil {
		return "", nil, err
	}

	role, _ := byName["role_type"].(string)

	sub, err := terminSubProfessional(ctx, tx, intPtrOf(byName["milestone_id"]), role)
	if err != nil {
		return "", nil, err
	}
	if !sub {
		percentage := ""
		if text, ok := decimalOrNilBid(byName, "percentage").(string); ok {
			percentage = text
		}
		blocked, err := terminUnpaidPrevious(ctx, tx, projectID, role, terminID, percentage, intPtrOf(byName["milestone_id"]))
		if err != nil {
			return "", nil, err
		}
		if blocked {
			return "", nil, proofErrorValue{status: 422, message: "Please complete the previous payment milestones (e.g. Down Payment) before paying for this one."}
		}
	}

	// settlementState: payment_status when set, else status. Termins
	// carry no payment_status, so both reads land on status.
	var current *string
	if s, ok := byName["status"].(string); ok {
		dup := s
		current = &dup
	}
	if settled := proofSettled(current, current); settled != nil {
		return "", nil, *settled
	}

	var oldPath *string
	if s, ok := byName["payment_proof_path"].(string); ok && s != "" {
		dup := s
		oldPath = &dup
	}

	stored, err := storeProofFile(filename, contents, oldPath)
	if err != nil {
		return "", nil, err
	}

	if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET payment_proof_path = $2, status = 'verifying', updated_at = date_trunc('second', now()) WHERE id = $1`, terminID, stored); err != nil {
		return "", nil, err
	}

	entry, err := reloadTerminTx(ctx, tx, pool, terminID)
	if err != nil {
		return "", nil, err
	}

	return stored, entry, nil
}

// storeAddendumProof uploads a receipt for a budget addendum.
func storeAddendumProof(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID, addendumID int64, viewer *projectViewer, filename string, contents []byte) (string, *jsonphp.Object, error) {
	_ = pool
	_ = viewer

	rows, err := tx.Query(ctx, `SELECT `+addendumsColumns+` FROM project_addendums WHERE id = $1 AND project_id = $2 FOR UPDATE`, addendumID, projectID)
	if err != nil {
		return "", nil, err
	}
	byName, err := scanLockedRow(rows)
	if err != nil {
		return "", nil, err
	}

	var current *string
	if s, ok := byName["status"].(string); ok {
		dup := s
		current = &dup
	}
	if settled := proofSettled(current, current); settled != nil {
		return "", nil, *settled
	}

	var oldPath *string
	if s, ok := byName["payment_proof_path"].(string); ok && s != "" {
		dup := s
		oldPath = &dup
	}

	stored, err := storeProofFile(filename, contents, oldPath)
	if err != nil {
		return "", nil, err
	}

	if _, err := tx.Exec(ctx, `UPDATE project_addendums SET payment_proof_path = $2, status = 'verifying', updated_at = date_trunc('second', now()) WHERE id = $1`, addendumID, stored); err != nil {
		return "", nil, err
	}

	entry, err := reloadAddendumTx(ctx, tx, addendumID)
	if err != nil {
		return "", nil, err
	}

	return stored, entry, nil
}

// storeMaterialProof uploads a receipt for a material order.
func storeMaterialProof(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID, orderID int64, viewer *projectViewer, filename string, contents []byte) (string, *jsonphp.Object, error) {
	_ = pool
	_ = viewer

	rows, err := tx.Query(ctx, `SELECT `+materialOrdersColumns+` FROM material_orders WHERE id = $1 AND project_id = $2 FOR UPDATE`, orderID, projectID)
	if err != nil {
		return "", nil, err
	}
	byName, err := scanLockedRow(rows)
	if err != nil {
		return "", nil, err
	}

	var current *string
	if s, ok := byName["status"].(string); ok {
		dup := s
		current = &dup
	}
	if settled := proofSettled(current, current); settled != nil {
		return "", nil, *settled
	}

	var oldPath *string
	if s, ok := byName["payment_proof_path"].(string); ok && s != "" {
		dup := s
		oldPath = &dup
	}

	stored, err := storeProofFile(filename, contents, oldPath)
	if err != nil {
		return "", nil, err
	}

	if _, err := tx.Exec(ctx, `UPDATE material_orders SET payment_proof_path = $2, status = 'verifying', updated_at = date_trunc('second', now()) WHERE id = $1`, orderID, stored); err != nil {
		return "", nil, err
	}

	entry, err := reloadMaterialTx(ctx, tx, orderID)
	if err != nil {
		return "", nil, err
	}

	return stored, entry, nil
}

// storeBidProof uploads a receipt for one of the seven bid types.
func storeBidProof(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID int64, role, table string, legacyID int64, viewer *projectViewer, filename string, contents []byte) (string, *jsonphp.Object, error) {
	_ = viewer
	_ = table

	var physicalID int64
	if err := tx.QueryRow(ctx, `SELECT id FROM bids WHERE legacy_id = $1 AND role::text = $2 AND project_id = $3`, legacyID, role, projectID).Scan(&physicalID); err != nil {
		return "", nil, proofErrorValue{status: 404, message: "Payment record not found."}
	}

	var paymentStatus, status, proofPath *string
	if err := tx.QueryRow(ctx, `SELECT payment_status::text, status::text, payment_proof_path FROM bids WHERE id = $1 FOR UPDATE`, physicalID).Scan(&paymentStatus, &status, &proofPath); err != nil {
		return "", nil, err
	}

	// Eloquent isset(): a null payment_status falls through to status.
	var current *string
	if paymentStatus != nil {
		current = paymentStatus
	} else {
		current = status
	}
	if settled := proofSettled(current, status); settled != nil {
		return "", nil, *settled
	}

	stored, err := storeProofFile(filename, contents, proofPath)
	if err != nil {
		return "", nil, err
	}

	if paymentStatus != nil {
		if _, err := tx.Exec(ctx, `UPDATE bids SET payment_proof_path = $2, payment_status = 'verifying', updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID, stored); err != nil {
			return "", nil, err
		}
	} else {
		if _, err := tx.Exec(ctx, `UPDATE bids SET payment_proof_path = $2, status = 'verifying', updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID, stored); err != nil {
			return "", nil, err
		}
	}

	refreshed, err := reloadBidTx(ctx, tx, pool, physicalID, role)
	if err != nil {
		return "", nil, err
	}

	return stored, refreshed, nil
}

// scanLockedRow reads one FOR UPDATE row into a name map, reporting a
// missing row as a 404 proof error.
func scanLockedRow(rows pgx.Rows) (map[string]any, error) {
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, proofErrorValue{status: 404, message: "Payment record not found."}
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	return byName, nil
}

// reloadTerminTx re-reads one termin with its milestone inside the
// caller's transaction.
func reloadTerminTx(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, terminID int64) (*jsonphp.Object, error) {
	rows, err := tx.Query(ctx, `SELECT id, project_id, role_type, recipient_id, label, percentage::text, amount::text, retention_amount::text, retention_released_at, retention_released_amount::text, net_amount::text, trigger_description, status::text, payment_proof_path, verification_notes, milestone_id, change_order_id, paid_at, notes, retention_notes, created_at, updated_at, refunded_amount::text, milestone_id
		FROM project_payment_termins WHERE id = $1`, terminID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, proofErrorValue{status: 404, message: "Payment record not found."}
	}

	entry, err := scanTerminRow(ctx, pool, rows)
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return entry, nil
}

// reloadAddendumTx re-reads one addendum inside the caller's transaction.
func reloadAddendumTx(ctx context.Context, tx pgx.Tx, addendumID int64) (*jsonphp.Object, error) {
	rows, err := tx.Query(ctx, `SELECT id, project_id, type, role_type, user_id, team_member_id, specialist_type, title, description, negotiation_note, attachment_path, amount::text, counter_offer_amount::text, recommended_bid_id, recommended_bid_type::text, status::text, payment_proof_path, verification_notes, paid_at, created_at, updated_at, procurement_request_id, assigned_user_id, refunded_amount::text
		FROM project_addendums WHERE id = $1`, addendumID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, proofErrorValue{status: 404, message: "Payment record not found."}
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	entry := jsonphp.NewObject()
	for _, column := range fields {
		value := byName[column]
		switch column {
		case "amount", "counter_offer_amount", "refunded_amount":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "paid_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	return entry, nil
}

// reloadMaterialTx re-reads one material order inside the caller's
// transaction.
func reloadMaterialTx(ctx context.Context, tx pgx.Tx, orderID int64) (*jsonphp.Object, error) {
	rows, err := tx.Query(ctx, `SELECT id, user_id, supplier_id, project_id, status, verification_notes, total_price::text, shipping_cost::text, whatsapp_order_id, payment_proof_path, notes, paid_at, shipped_at, delivered_at, completed_at, created_at, updated_at, refunded_amount::text, delivery_method, ready_for_pickup_at, latitude, longitude, delivery_address, address_detail, delivery_documentation_path, is_stock_decremented, total_weight::text
		FROM material_orders WHERE id = $1`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, proofErrorValue{status: 404, message: "Payment record not found."}
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	entry := jsonphp.NewObject()
	for _, column := range fields {
		value := byName[column]
		switch column {
		case "total_price", "shipping_cost", "refunded_amount", "total_weight":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "paid_at", "shipped_at", "delivered_at", "completed_at", "created_at", "updated_at", "ready_for_pickup_at":
			entry.Set(column, projectTimeValue(value))
		case "is_stock_decremented":
			// MySQL tinyint(1) serializes as 0/1, not false/true.
			entry.Set(column, tinyInt(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	return entry, nil
}

// tinyInt renders a boolean-ish column the way MySQL tinyint(1) reads.
func tinyInt(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case bool:
		if typed {
			return 1
		}
		return 0
	case int64:
		return typed
	case int32:
		return int64(typed)
	case int:
		return int64(typed)
	default:
		return projectRawValue(value)
	}
}

// reloadBidTx re-reads one bid with its professional block inside the
// caller's transaction.
func reloadBidTx(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, physicalID int64, role string) (*jsonphp.Object, error) {
	rows, err := tx.Query(ctx, `SELECT `+bidsColumns+` FROM bids WHERE id = $1`, physicalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, proofErrorValue{status: 404, message: "Payment record not found."}
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	entry := rawBidObject(role, fields, values)

	if key, table, profile, ok := bidRelationKey(role, bidMap(fields, values)); ok {
		block, err := budgetProfileBlock(ctx, pool, table, profile, role)
		if err != nil {
			return nil, err
		}
		entry.Set(key, block)
	}

	return entry, nil
}
