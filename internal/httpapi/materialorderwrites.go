package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MATERIAL ORDER WRITES — the fulfilment status machine and the payment
// confirmation.
//
// update:
//   - buyer: completed (from delivered) or cancelled (from pending/awaiting);
//   - supplier: any status except `paid`, or `paid` ONLY with a proof (which
//     delegates to verify-payment so exactly one ledger row can exist);
//   - `delivered` increments `quantity_on_site` on requirements that belong
//     to THIS order's project (the scoped lookup blocks cross-project
//     stock inflation);
//   - paid/processing/ready/shipping/delivered/completed claim the stock
//     flag and decrement; cancelled restores it.
//
// verify-payment runs the escrow ledger behind the dispute freeze, then
// decrements stock and tells the buyer.

// orderRequirementColumns is the `project_requirements` table order.
var orderRequirementColumns = []string{
	"id", "project_id", "name", "bom_type", "quantity_required", "estimated_unit_cost",
	"quantity_on_site", "quantity_used", "quantity_procured_externally", "external_cost",
	"unit", "quality_level", "image_path", "notes", "purpose", "category",
	"created_at", "updated_at", "user_id", "folder_id",
}

// orderRequirementObject renders the loaded `requirement` relation WITHOUT its
// own `user` (the order endpoint never eager-loads it).
func orderRequirementObject(ctx context.Context, pool *pgxpool.Pool, requirementID int64) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(orderRequirementColumns, ", ")+`
		FROM project_requirements WHERE id = $1`, requirementID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, errLedgerGone
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	entry := jsonphp.NewObject()
	for _, column := range orderRequirementColumns {
		value := byName[column]
		switch column {
		case "quantity_required", "estimated_unit_cost", "quantity_on_site",
			"quantity_used", "quantity_procured_externally", "external_cost":
			entry.Set(column, projectDecimalValue(value))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	entry.Set("image_url", requirementImageURL(ctx, byName["image_path"]))
	return entry, rows.Err()
}

// orderItemsWithRequirement renders `items.material` + `items.requirement`.
func orderItemsWithRequirement(ctx context.Context, pool *pgxpool.Pool, orderID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, order_id, material_id, quantity,
		price_at_order::text, created_at, updated_at, requirement_id
		FROM material_order_items WHERE order_id = $1 ORDER BY id`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var (
			itemID, order, materialID int64
			quantity                  int64
			price                     string
			createdAt, updatedAt      any
			requirementID             *int64
		)
		if err := rows.Scan(&itemID, &order, &materialID, &quantity, &price,
			&createdAt, &updatedAt, &requirementID); err != nil {
			return nil, err
		}
		item := jsonphp.NewObject()
		item.Set("id", itemID)
		item.Set("order_id", order)
		item.Set("material_id", materialID)
		item.Set("quantity", quantity)
		item.Set("price_at_order", price)
		item.Set("created_at", projectTimeValue(createdAt))
		item.Set("updated_at", projectTimeValue(updatedAt))
		item.Set("requirement_id", nullableInt64(requirementID))

		material, err := materialModelObject(ctx, pool, materialID)
		if err != nil {
			if isNoRows(err) {
				item.Set("material", nil)
			} else {
				return nil, err
			}
		} else {
			item.Set("material", material)
		}

		if requirementID != nil {
			requirement, err := orderRequirementObject(ctx, pool, *requirementID)
			if err == nil {
				item.Set("requirement", requirement)
			} else {
				item.Set("requirement", nil)
			}
		} else {
			item.Set("requirement", nil)
		}

		out = append(out, item)
	}
	return out, rows.Err()
}

// claimOrderStock flips the atomic flag. target=true claims the decrement;
// target=false claims the restore. Returns false when another caller already
// moved it (Eloquent's `update()` also stamps updated_at).
func claimOrderStock(ctx context.Context, pool *pgxpool.Pool, orderID int64, target bool) (bool, error) {
	tag, err := pool.Exec(ctx, `UPDATE material_orders SET is_stock_decremented = $2,
		updated_at = date_trunc('second', now()) WHERE id = $1 AND is_stock_decremented = $3`,
		orderID, target, !target)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// moveOrderStock decrements (or restores) every item's material stock.
func moveOrderStock(ctx context.Context, pool *pgxpool.Pool, orderID int64, restore bool) (bool, error) {
	var claimed bool
	var claimErr error
	if restore {
		claimed, claimErr = claimOrderStock(ctx, pool, orderID, false)
	} else {
		claimed, claimErr = claimOrderStock(ctx, pool, orderID, true)
	}
	if claimErr != nil || !claimed {
		return claimed, claimErr
	}

	delta := "-"
	if restore {
		delta = "+"
	}
	rows, err := pool.Query(ctx, `SELECT material_id, quantity FROM material_order_items WHERE order_id = $1`, orderID)
	if err != nil {
		return claimed, err
	}
	defer rows.Close()
	type line struct {
		materialID int64
		quantity   int64
	}
	lines := make([]line, 0)
	for rows.Next() {
		var item line
		if err := rows.Scan(&item.materialID, &item.quantity); err != nil {
			return claimed, err
		}
		lines = append(lines, item)
	}
	if err := rows.Err(); err != nil {
		return claimed, err
	}

	for _, item := range lines {
		if _, err := pool.Exec(ctx, `UPDATE materials SET stock = stock `+delta+` $2,
			updated_at = date_trunc('second', now()) WHERE id = $1`, item.materialID, item.quantity); err != nil {
			return claimed, err
		}
	}
	return claimed, nil
}

// verifyOrderPayment is the shared body of `verify-payment` and update's
// `paid` delegation.
func verifyOrderPayment(ctx context.Context, w http.ResponseWriter, pool *pgxpool.Pool, viewer *projectViewer, orderID int64) {
	byName, found, err := materialOrderRow(ctx, pool, orderID)
	if err != nil {
		slog.Error("order verify: load", "error", err)
		serverError(w)
		return
	}
	if !found {
		modelNotFound(w, `App\Models\MaterialOrder`, strconv.FormatInt(orderID, 10))
		return
	}

	var supplierID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM suppliers WHERE user_id = $1`, viewer.id).Scan(&supplierID); err != nil {
		supplierID = 0
	}
	if viewer.role != "supplier" || supplierID == 0 || intPtrDeref(byName["supplier_id"]) != supplierID {
		message(w, http.StatusForbidden, "Only the seller of this order can verify its payment.")
		return
	}

	proof, _ := byName["payment_proof_path"].(string)
	if proof == "" {
		message(w, http.StatusUnprocessableEntity, "No payment proof has been uploaded yet.")
		return
	}

	status := stringOf(byName["status"])
	switch status {
	case "paid", "shipping", "delivered", "completed", "refunded", "cancelled":
		if status == "refunded" {
			message(w, http.StatusUnprocessableEntity, "This order was refunded, so its payment cannot be verified again.")
		} else {
			message(w, http.StatusUnprocessableEntity, "This order is already marked as paid.")
		}
		return
	}

	projectID := intPtrDeref(byName["project_id"])
	// INVARIANT: material_orders.total_price is shipping-INCLUSIVE. The quote
	// approve writes total_price = total_amount(goods) + shipping and stores
	// shipping separately for display (materialquotelifecycle.go approve).
	// The ledger must therefore move exactly total_price — adding
	// shipping_cost again would charge shipping twice. This matches the quote
	// mark-paid path, which moves total_amount + shipping_cost on a row whose
	// total_amount is goods-only.
	amountMinor := mustMinorValue(stringOf(byName["total_price"]))

	if projectID != 0 {
		var openID int64
		var openTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes
			WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).
			Scan(&openID, &openTitle); err == nil {
			message(w, http.StatusUnprocessableEntity,
				"Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		if amountMinor > 0 {
			var registryID int64
			if err := pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types
				WHERE fqcn = 'App\Models\MaterialOrder' LIMIT 1`).Scan(&registryID); err != nil {
				slog.Error("order verify: registry", "error", err)
				serverError(w)
				return
			}

			tx, err := pool.Begin(ctx)
			if err != nil {
				slog.Error("order verify: begin", "error", err)
				serverError(w)
				return
			}
			written, available, err := recordPaymentMinor(ctx, tx, projectID, amountMinor,
				"Payment: Material Order #"+strconv.FormatInt(orderID, 10),
				`App\Models\MaterialOrder`, orderID, registryID, viewer.id, viewer.role)
			if err != nil {
				if fe, ok := asFrozen(err); ok {
					tx.Rollback(ctx)
					message(w, http.StatusUnprocessableEntity, fe.Error())
					return
				}
				tx.Rollback(ctx)
				slog.Error("order verify: ledger", "error", err)
				serverError(w)
				return
			}
			if !written {
				tx.Rollback(ctx)
				message(w, http.StatusUnprocessableEntity,
					"Project budget is insufficient for this material payment. Available: Rp "+
						formatIDAmount(available)+".")
				return
			}
			if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
				tx.Rollback(ctx)
				slog.Error("order verify: touch", "error", err)
				serverError(w)
				return
			}
			if err := tx.Commit(ctx); err != nil {
				slog.Error("order verify: commit", "error", err)
				serverError(w)
				return
			}
		}
	}

	if _, err := pool.Exec(ctx, `UPDATE material_orders SET status = 'paid',
		paid_at = date_trunc('second', now()), updated_at = date_trunc('second', now())
		WHERE id = $1`, orderID); err != nil {
		slog.Error("order verify: paid", "error", err)
		serverError(w)
		return
	}

	claimed, err := moveOrderStock(ctx, pool, orderID, false)
	if err != nil {
		slog.Error("order verify: stock", "error", err)
		serverError(w)
		return
	}

	buyerID := intPtrDeref(byName["user_id"])
	if buyerID != viewer.id {
		data := `{"material_order_id": ` + strconv.FormatInt(orderID, 10) + `}`
		if err := insertNotificationPool(ctx, pool, buyerID, "payment_verified",
			"Material Payment Verified",
			"Your payment for order #"+strconv.FormatInt(orderID, 10)+" has been verified. Processing will begin shortly.",
			data); err != nil {
			slog.Warn("order verify: notify", "error", err)
		}
	}

	fresh, _, err := materialOrderRow(ctx, pool, orderID)
	if err != nil {
		slog.Error("order verify: reload", "error", err)
		serverError(w)
		return
	}
	entry := materialOrderObject(fresh)
	// The answer serializes the ROUTE-BOUND model: decrementStock claims the
	// flag through a query builder, so the in-memory attribute still holds the
	// value read at binding time.
	staleFlag := int64(0)
	if flag, ok := byName["is_stock_decremented"].(bool); ok && flag {
		staleFlag = 1
	}
	entry.Set("is_stock_decremented", staleFlag)
	// decrementStock iterates the items ONLY when the atomic claim succeeds;
	// an order whose stock was already claimed serializes without them.
	if claimed {
		if err := materialOrderRelations(ctx, pool, entry, fresh, []string{"items"}); err != nil {
			slog.Error("order verify: items", "error", err)
			serverError(w)
			return
		}
	}

	payload := jsonphp.NewObject()
	payload.Set("success", true)
	payload.Set("message", "Payment verified.")
	payload.Set("data", entry)
	writeJSON(w, http.StatusOK, payload)
}

// VerifyOrderPaymentHandler serves
// `POST /api/material-orders/{material_order}/verify-payment`.
func VerifyOrderPaymentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, raw, ok := materialOrderIDFromPath(r)
		if !ok {
			modelNotFound(w, `App\Models\MaterialOrder`, raw)
			return
		}
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		viewer, err := loadViewer(r.Context(), pool, caller)
		if err != nil {
			slog.Error("order verify: viewer", "error", err)
			serverError(w)
			return
		}
		verifyOrderPayment(r.Context(), w, pool, viewer, orderID)
	}
}

// validateOrderStatus enforces status required|in:… .
func validateOrderStatus(fields map[string]any, failures *errorBag) string {
	raw, present := fields["status"]
	if !present || raw == nil {
		failures.add("status", "The status field is required.")
		return ""
	}
	text, ok := raw.(string)
	if !ok {
		failures.add("status", "The selected status is invalid.")
		return ""
	}
	for _, allowed := range []string{
		"pending", "processing", "ready_for_pickup", "awaiting_payment", "paid",
		"shipping", "delivered", "completed", "cancelled",
	} {
		if text == allowed {
			return text
		}
	}
	failures.add("status", "The selected status is invalid.")
	return ""
}

// supplierOrderTransitions is the supplier-side state machine for material
// orders. The previous gate authorized ANY supplier transition - including
// pending -> delivered with no payment, no proof and no escrow movement.
// Every edge below is an explicit, fulfilment-ordered step; paid is reachable
// only through the verify-payment path (proof required, ledger + freeze enforced).
var supplierOrderTransitions = map[string][]string{
	"pending":          {"processing", "cancelled"},
	"awaiting_payment": {"processing", "cancelled"},
	"processing":       {"ready_for_pickup", "shipping", "cancelled"},
	"ready_for_pickup": {"shipping", "delivered"},
	"shipping":         {"delivered"},
	"paid":             {"processing", "shipping"},
}

// supplierOrderTransitionAllowed reports whether a supplier may move an order
// from oldStatus to newStatus. Pure so it is unit-testable without a database.
func supplierOrderTransitionAllowed(oldStatus, newStatus string) bool {
	for _, next := range supplierOrderTransitions[oldStatus] {
		if next == newStatus {
			return true
		}
	}
	return false
}

// UpdateMaterialOrderHandler serves `PUT /api/material-orders/{material_order}`.
func UpdateMaterialOrderHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orderID, raw, ok := materialOrderIDFromPath(r)
		if !ok {
			modelNotFound(w, `App\Models\MaterialOrder`, raw)
			return
		}
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("order update: viewer", "error", err)
			serverError(w)
			return
		}
		byName, found, err := materialOrderRow(ctx, pool, orderID)
		if err != nil {
			slog.Error("order update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialOrder`, raw)
			return
		}

		var supplierID int64
		if viewer.role == "supplier" {
			_ = pool.QueryRow(ctx, `SELECT id FROM suppliers WHERE user_id = $1`, viewer.id).Scan(&supplierID)
		}
		isSupplier := viewer.role == "supplier" && supplierID != 0 && intPtrDeref(byName["supplier_id"]) == supplierID
		isBuyer := intPtrDeref(byName["user_id"]) == viewer.id

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		newStatus := validateOrderStatus(formFields, failures)
		notes, notesSet := validateOrderNotes(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		oldStatus := stringOf(byName["status"])
		proof, _ := byName["payment_proof_path"].(string)

		authorized := false
		switch {
		case isBuyer && newStatus == "completed" && oldStatus == "delivered":
			authorized = true
		case isBuyer && newStatus == "cancelled" && (oldStatus == "pending" || oldStatus == "awaiting_payment"):
			authorized = true
		case isSupplier && newStatus == "paid" && proof != "":
			authorized = true
		case isSupplier && supplierOrderTransitionAllowed(oldStatus, newStatus):
			authorized = true
		}
		if !authorized {
			message(w, http.StatusForbidden, "Unauthorized to update this status")
			return
		}

		if newStatus == "paid" && oldStatus != "paid" {
			if proof == "" {
				message(w, http.StatusUnprocessableEntity, "A payment proof is required to mark this order paid.")
				return
			}
			verifyOrderPayment(ctx, w, pool, viewer, orderID)
			return
		}

		sets := []string{"status = $2", "updated_at = date_trunc('second', now())"}
		args := []any{orderID, newStatus}
		if notesSet {
			args = append(args, notes)
			sets = append(sets, "notes = $"+strconv.Itoa(len(args)))
		}

		// The first arrival in a stage stamps its own timestamp.
		stamp := map[string]string{
			"paid":             "paid_at",
			"ready_for_pickup": "ready_for_pickup_at",
			"shipping":         "shipped_at",
			"delivered":        "delivered_at",
			"completed":        "completed_at",
		}
		if column, ok := stamp[newStatus]; ok {
			if existing, _ := byName[column].(string); existing == "" {
				if value, present := byName[column]; !present || value == nil {
					sets = append(sets, column+" = date_trunc('second', now())")
				}
			}
		}

		// delivery_documentation lands on the PUBLIC disk.
		var documentationPath string
		if r.MultipartForm != nil {
			if headers := r.MultipartForm.File["delivery_documentation"]; len(headers) > 0 {
				file, err := readGalleryFile(headers[0])
				if err == nil {
					switch file.ext {
					case "jpg", "jpeg", "png", "webp":
						stored, err := storeVaultFile("delivery_docs", file.filename, file.data)
						if err == nil {
							documentationPath = stored
							args = append(args, stored)
							sets = append(sets, "delivery_documentation_path = $"+strconv.Itoa(len(args)))
						}
					}
				}
			}
		}
		_ = documentationPath

		if _, err := pool.Exec(ctx, `UPDATE material_orders SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("order update: exec", "error", err)
			serverError(w)
			return
		}

		// Site inventory: `delivered` adds to the requirement of THIS project.
		if newStatus == "delivered" && oldStatus != "delivered" {
			projectID := intPtrDeref(byName["project_id"])
			rows, err := pool.Query(ctx, `SELECT requirement_id, quantity FROM material_order_items
				WHERE order_id = $1 AND requirement_id IS NOT NULL`, orderID)
			if err == nil {
				type syncLine struct {
					requirementID int64
					quantity      int64
				}
				lines := make([]syncLine, 0)
				for rows.Next() {
					var item syncLine
					if err := rows.Scan(&item.requirementID, &item.quantity); err == nil {
						lines = append(lines, item)
					}
				}
				rows.Close()
				for _, item := range lines {
					_, _ = pool.Exec(ctx, `UPDATE project_requirements
						SET quantity_on_site = quantity_on_site + $3,
							updated_at = date_trunc('second', now())
						WHERE id = $1 AND project_id = $2`,
						item.requirementID, projectID, item.quantity)
				}
			}
		}

		stockClaimed := false
		switch newStatus {
		case "paid", "processing", "ready_for_pickup", "shipping", "delivered", "completed":
			claimed, err := moveOrderStock(ctx, pool, orderID, false)
			if err != nil {
				slog.Error("order update: stock", "error", err)
				serverError(w)
				return
			}
			stockClaimed = claimed
		case "cancelled":
			claimed, err := moveOrderStock(ctx, pool, orderID, true)
			if err != nil {
				slog.Error("order update: restore stock", "error", err)
				serverError(w)
				return
			}
			stockClaimed = claimed
		}

		fresh, _, err := materialOrderRow(ctx, pool, orderID)
		if err != nil {
			slog.Error("order update: reload", "error", err)
			serverError(w)
			return
		}
		entry := materialOrderObject(fresh)
		// The route-bound model keeps its stale stock flag.
		staleFlag := int64(0)
		if flag, ok := byName["is_stock_decremented"].(bool); ok && flag {
			staleFlag = 1
		}
		entry.Set("is_stock_decremented", staleFlag)

		items, err := orderItemsWithRequirement(ctx, pool, orderID)
		if err != nil {
			slog.Error("order update: items", "error", err)
			serverError(w)
			return
		}

		// Stock movements iterate `` BEFORE the controller's
		// load(), so the relation keeps that earlier position when it is
		// re-loaded: items first, then supplier/user/project. Statuses that
		// touch no stock leave items last.
		// The DELIVERED inventory sweep reads `` before any
		// stock claim; otherwise only a SUCCESSFUL claim loads them.
		itemsFirst := stockClaimed || (newStatus == "delivered" && oldStatus != "delivered")
		if itemsFirst {
			entry.Set("items", items)
		}
		if err := materialOrderRelations(ctx, pool, entry, fresh,
			[]string{"supplier", "user", "project"}); err != nil {
			slog.Error("order update: base relations", "error", err)
			serverError(w)
			return
		}
		if !itemsFirst {
			entry.Set("items", items)
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Order updated successfully.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateOrderNotes enforces notes nullable|string.
func validateOrderNotes(fields map[string]any, failures *errorBag) (string, bool) {
	if raw, present := fields["notes"]; present {
		if raw == nil {
			return "", true
		}
		text, ok := raw.(string)
		if !ok {
			failures.add("notes", "The notes field must be a string.")
			return "", true
		}
		return text, true
	}
	return "", false
}

// ConfirmOrderReceiptHandler serves
// `POST /api/material-orders/{material_order}/confirm-receipt`.
//
// The buyer acknowledges delivery: `delivered` → `completed`. Only the buyer
// (order user) or the project owner may confirm; any other state is 422.
// Idempotent: an already-`completed` order succeeds without rewriting.
func ConfirmOrderReceiptHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("material_order")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
			// /confirm-receipt suffix: step one segment back.
			if raw == "confirm-receipt" {
				trimmed := strings.TrimSuffix(strings.Trim(r.URL.Path, "/"), "/confirm-receipt")
				raw = lastPathSegment(trimmed)
			}
		}
		orderID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\MaterialOrder`, raw)
			return
		}

		var userID, projectID *int64
		var status string
		if err := pool.QueryRow(ctx, `SELECT user_id, project_id, status::text FROM material_orders WHERE id = $1`, orderID).Scan(&userID, &projectID, &status); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\MaterialOrder`, raw)
				return
			}
			slog.Error("order confirm: load", "error", err)
			serverError(w)
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("order confirm: viewer", "error", err)
			serverError(w)
			return
		}

		allowed := false
		if userID != nil && *userID == viewer.id {
			allowed = true
		}
		if !allowed && projectID != nil {
			var ownerID int64
			if err := pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, *projectID).Scan(&ownerID); err == nil && ownerID == viewer.id {
				allowed = true
			}
		}
		if !allowed && caller.IsAdmin() {
			allowed = true
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized. Only the buyer or project owner can confirm receipt.")
			return
		}

		if status == "completed" {
			payload := jsonphp.NewObject()
			payload.Set("message", "Receipt already confirmed.")
			writeJSON(w, http.StatusOK, payload)
			return
		}
		if status != "delivered" {
			message(w, http.StatusUnprocessableEntity, "Only a delivered order can be confirmed. Current status: "+status+".")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE material_orders SET status = 'completed', updated_at = date_trunc('second', now()) WHERE id = $1`, orderID); err != nil {
			slog.Error("order confirm: update", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Receipt confirmed. Order completed.")
		writeJSON(w, http.StatusOK, payload)
	}
}
