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

// MATERIAL ORDERS — the supplier-side fulfilment record.
//
//   - GET material-orders: the buyer's own orders, plus (for a supplier
//     account) the orders addressed to their store. Newest first, no limit.
//     Each row carries supplier / user / project / items.material / review /
//     deliveryJob.logistics.phoneNumber.
//   - GET material-orders/{order}: buyer or the order's supplier only (403
//     "Unauthorized"), with supplier / user / project / items.material.
//   - POST material-orders/{order}/payment-proof: the buyer (or the assigned
//     PM) uploads the receipt while the order is pending/awaiting_payment;
//     it lands on the PRIVATE vault and the supplier is told.
//
// update and verify-payment move stock and escrow and are still proxied.

// materialOrderColumns is the table order.
var materialOrderColumns = []string{
	"id", "user_id", "supplier_id", "project_id", "status", "verification_notes",
	"total_price", "shipping_cost", "whatsapp_order_id", "payment_proof_path",
	"notes", "paid_at", "shipped_at", "delivered_at", "completed_at",
	"created_at", "updated_at", "refunded_amount", "delivery_method",
	"ready_for_pickup_at", "latitude", "longitude", "delivery_address",
	"address_detail", "delivery_documentation_path", "is_stock_decremented",
	"total_weight",
}

// materialOrderReviewColumns is the table order.
var materialOrderReviewColumns = []string{
	"id", "user_id", "supplier_id", "order_id", "rating", "comment", "image_path",
	"created_at", "updated_at", "delivery_rating", "delivery_comment",
	"delivery_user_id", "image_paths", "delivery_image_paths",
}

// deliveryJobColumns is the table order.
var deliveryJobColumns = []string{
	"id", "quote_id", "order_id", "logistics_id", "pickup_address",
	"dropoff_address", "status", "agreed_fee", "estimated_weight", "created_at",
	"updated_at", "pickup_photos", "delivery_photos",
}

// materialOrderSelectList casts money/coordinates so every consumer sees the
// decimal strings and JSON floats Laravel's casts produce.
func materialOrderSelectList() string {
	parts := make([]string, 0, len(materialOrderColumns))
	for _, column := range materialOrderColumns {
		switch column {
		case "total_price", "shipping_cost", "refunded_amount", "total_weight":
			parts = append(parts, column+"::text AS "+column)
		case "latitude", "longitude":
			parts = append(parts, column+"::float8 AS "+column)
		default:
			parts = append(parts, column)
		}
	}
	return strings.Join(parts, ", ")
}

// materialOrderObject renders the order in table order.
func materialOrderObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range materialOrderColumns {
		value := byName[column]
		switch column {
		case "total_price", "shipping_cost", "refunded_amount", "total_weight":
			entry.Set(column, projectDecimalValue(value))
		case "latitude", "longitude":
			entry.Set(column, numericFloatValue(value))
		case "paid_at", "shipped_at", "delivered_at", "completed_at",
			"ready_for_pickup_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		case "is_stock_decremented":
			// No cast on the model: MySQL's tinyint serializes 0/1.
			decremented := int64(0)
			if typed, ok := value.(bool); ok && typed {
				decremented = 1
			}
			entry.Set(column, decremented)
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// materialOrderRow reads one order.
func materialOrderRow(ctx context.Context, pool *pgxpool.Pool, orderID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+materialOrderSelectList()+`
		FROM material_orders WHERE id = $1`, orderID)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, false, rows.Err()
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, false, err
	}
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}
	return byName, true, rows.Err()
}

// materialOrderItems renders the item list plus the loaded relations.
func materialOrderItems(ctx context.Context, pool *pgxpool.Pool, orderID int64) ([]any, error) {
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

		out = append(out, item)
	}
	return out, rows.Err()
}

// materialOrderReviewObject renders the review row with its array casts.
func materialOrderReviewObject(ctx context.Context, pool *pgxpool.Pool, orderID int64) (any, error) {
	rows, err := pool.Query(ctx, `SELECT id, user_id, supplier_id, order_id, rating,
		comment, image_path, created_at, updated_at, delivery_rating, delivery_comment,
		delivery_user_id, image_paths::text, delivery_image_paths::text
		FROM material_order_reviews WHERE order_id = $1 LIMIT 1`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, nil
	}
	var (
		id, userID, supplierID, order int64
		rating                        *int64
		comment, imagePath            *string
		createdAt, updatedAt          any
		deliveryRating                *int64
		deliveryComment               *string
		deliveryUserID                *int64
		imagePaths, deliveryPaths     *string
	)
	if err := rows.Scan(&id, &userID, &supplierID, &order, &rating, &comment,
		&imagePath, &createdAt, &updatedAt, &deliveryRating, &deliveryComment,
		&deliveryUserID, &imagePaths, &deliveryPaths); err != nil {
		return nil, err
	}
	entry := jsonphp.NewObject()
	entry.Set("id", id)
	entry.Set("user_id", userID)
	entry.Set("supplier_id", supplierID)
	entry.Set("order_id", order)
	entry.Set("rating", nullableInt64(rating))
	entry.Set("comment", nullableString(comment))
	entry.Set("image_path", nullableString(imagePath))
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("updated_at", projectTimeValue(updatedAt))
	entry.Set("delivery_rating", nullableInt64(deliveryRating))
	entry.Set("delivery_comment", nullableString(deliveryComment))
	entry.Set("delivery_user_id", nullableInt64(deliveryUserID))
	if imagePaths == nil {
		entry.Set("image_paths", nil)
	} else {
		entry.Set("image_paths", orderedJSONColumn(*imagePaths))
	}
	if deliveryPaths == nil {
		entry.Set("delivery_image_paths", nil)
	} else {
		entry.Set("delivery_image_paths", orderedJSONColumn(*deliveryPaths))
	}
	return entry, rows.Err()
}

// materialOrderDeliveryJobObject renders `deliveryJob.logistics.phoneNumber`.
func materialOrderDeliveryJobObject(ctx context.Context, pool *pgxpool.Pool, orderID int64) (any, error) {
	var (
		id, order                     int64
		quoteID, logisticsID          *int64
		pickup, dropoff, jobStatus    *string
		agreedFee                     *string
		estimatedWeight               *string
		createdAt, updatedAt          any
		pickupPhotos, deliveryPhotos  *string
	)
	err := pool.QueryRow(ctx, `SELECT id, quote_id, order_id, logistics_id, pickup_address,
		dropoff_address, status, agreed_fee::text, estimated_weight, created_at, updated_at,
		pickup_photos::text, delivery_photos::text
		FROM delivery_jobs WHERE order_id = $1 OR quote_id IN
			(SELECT quote_id FROM delivery_jobs WHERE order_id = $1) LIMIT 1`, orderID).
		Scan(&id, &quoteID, &order, &logisticsID, &pickup, &dropoff, &jobStatus,
			&agreedFee, &estimatedWeight, &createdAt, &updatedAt, &pickupPhotos, &deliveryPhotos)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	entry := jsonphp.NewObject()
	entry.Set("id", id)
	entry.Set("quote_id", nullableInt64(quoteID))
	entry.Set("order_id", order)
	entry.Set("logistics_id", nullableInt64(logisticsID))
	entry.Set("pickup_address", nullableString(pickup))
	entry.Set("dropoff_address", nullableString(dropoff))
	entry.Set("status", nullableString(jobStatus))
	entry.Set("agreed_fee", nullableString(agreedFee))
	entry.Set("estimated_weight", nullableString(estimatedWeight))
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("updated_at", projectTimeValue(updatedAt))
	if pickupPhotos == nil {
		entry.Set("pickup_photos", nil)
	} else {
		entry.Set("pickup_photos", orderedJSONColumn(*pickupPhotos))
	}
	if deliveryPhotos == nil {
		entry.Set("delivery_photos", nil)
	} else {
		entry.Set("delivery_photos", orderedJSONColumn(*deliveryPhotos))
	}

	if logisticsID != nil && *logisticsID != 0 {
		logistics, err := fullProfileUser(ctx, pool, *logisticsID, true)
		if err != nil {
			return nil, err
		}
		entry.Set("logistics", logistics)
	} else {
		entry.Set("logistics", nil)
	}
	return entry, nil
}

// materialOrderRelations attaches the endpoint's relations in load order.
func materialOrderRelations(ctx context.Context, pool *pgxpool.Pool, entry *jsonphp.Object, byName map[string]any, relations []string) error {
	for _, relation := range relations {
		switch relation {
		case "supplier":
			supplierID := intPtrDeref(byName["supplier_id"])
			if supplierID == 0 {
				entry.Set("supplier", nil)
				continue
			}
			block, err := supplierRelationObject(ctx, pool, supplierID)
			if err != nil {
				if isNoRows(err) {
					entry.Set("supplier", nil)
					continue
				}
				return err
			}
			entry.Set("supplier", block)
		case "user":
			userID := intPtrDeref(byName["user_id"])
			user, err := fullProfileUser(ctx, pool, userID, false)
			if err != nil {
				return err
			}
			entry.Set("user", user)
		case "project":
			projectID := intPtrDeref(byName["project_id"])
			if projectID == 0 {
				entry.Set("project", nil)
				continue
			}
			block, err := rawProjectModel(ctx, pool, projectID)
			if err != nil {
				if isNoRows(err) {
					entry.Set("project", nil)
					continue
				}
				return err
			}
			entry.Set("project", block)
		case "items":
			orderID := intPtrDeref(byName["id"])
			items, err := materialOrderItems(ctx, pool, orderID)
			if err != nil {
				return err
			}
			entry.Set("items", items)
		case "review":
			orderID := intPtrDeref(byName["id"])
			review, err := materialOrderReviewObject(ctx, pool, orderID)
			if err != nil {
				return err
			}
			entry.Set("review", review)
		case "deliveryJob":
			orderID := intPtrDeref(byName["id"])
			job, err := materialOrderDeliveryJobObject(ctx, pool, orderID)
			if err != nil {
				return err
			}
			entry.Set("delivery_job", job)
		}
	}
	return nil
}

// MaterialOrdersIndexHandler serves `GET /api/material-orders`.
func MaterialOrdersIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("orders: viewer", "error", err)
			serverError(w)
			return
		}

		query := `SELECT ` + materialOrderSelectList() + ` FROM material_orders`
		args := []any{viewer.id}
		if viewer.role == "supplier" {
			var supplierID int64
			if err := pool.QueryRow(ctx, `SELECT id FROM suppliers WHERE user_id = $1`, viewer.id).Scan(&supplierID); err == nil && supplierID != 0 {
				args = append(args, supplierID)
				query += ` WHERE user_id = $1 OR supplier_id = $2`
			} else {
				query += ` WHERE user_id = $1`
			}
		} else {
			query += ` WHERE user_id = $1`
		}
		query += ` ORDER BY created_at DESC, id ASC`

		rows, err := pool.Query(ctx, query, args...)
		if err != nil {
			slog.Error("orders: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("orders: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry := materialOrderObject(byName)
			if err := materialOrderRelations(ctx, pool, entry, byName,
				[]string{"supplier", "user", "project", "items", "review", "deliveryJob"}); err != nil {
				slog.Error("orders: relations", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("orders: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// MaterialOrderShowHandler serves `GET /api/material-orders/{material_order}`.
func MaterialOrderShowHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("order show: viewer", "error", err)
			serverError(w)
			return
		}
		byName, found, err := materialOrderRow(ctx, pool, orderID)
		if err != nil {
			slog.Error("order show: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialOrder`, raw)
			return
		}

		isBuyer := intPtrDeref(byName["user_id"]) == viewer.id
		isSupplier := false
		if viewer.role == "supplier" {
			var supplierID int64
			if err := pool.QueryRow(ctx, `SELECT id FROM suppliers WHERE user_id = $1`, viewer.id).Scan(&supplierID); err == nil && supplierID != 0 {
				isSupplier = intPtrDeref(byName["supplier_id"]) == supplierID
			}
		}
		if !isBuyer && !isSupplier {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		entry := materialOrderObject(byName)
		if err := materialOrderRelations(ctx, pool, entry, byName,
			[]string{"supplier", "user", "project", "items"}); err != nil {
			slog.Error("order show: relations", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// materialOrderIDFromPath reads the {material_order} segment.
func materialOrderIDFromPath(r *http.Request) (int64, string, bool) {
	raw := r.PathValue("material_order")
	if raw == "" {
		raw = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/payment-proof"))
	}
	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || raw == "" {
		return 0, raw, false
	}
	return parsed, raw, true
}

// UploadOrderPaymentProofHandler serves
// `POST /api/material-orders/{material_order}/payment-proof`.
func UploadOrderPaymentProofHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("order proof: viewer", "error", err)
			serverError(w)
			return
		}
		byName, found, err := materialOrderRow(ctx, pool, orderID)
		if err != nil {
			slog.Error("order proof: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialOrder`, raw)
			return
		}

		buyerID := intPtrDeref(byName["user_id"])
		isPm := false
		if viewer.role == "project_manager" {
			projectID := intPtrDeref(byName["project_id"])
			if projectID != 0 {
				if fields, values, perr := projectRowByID(ctx, pool, projectID); perr == nil {
					var pmProfile *int64
					if id, ok := projectColumnsByName(fields, values)["pm_id"].(int64); ok {
						pmProfile = &id
					}
					isPm = verifyAssignedPM(viewer, pmProfile)
				}
			}
		}
		if buyerID != viewer.id && !isPm {
			message(w, http.StatusForbidden, "Only the buyer can upload a payment proof.")
			return
		}

		status := stringOf(byName["status"])
		if status != "pending" && status != "awaiting_payment" {
			message(w, http.StatusUnprocessableEntity,
				"This order is not awaiting payment (current: "+status+").")
			return
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		failures := &errorBag{}
		upload := validateQuoteProofFile(r, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		stored, err := storeVaultFile("payment_proofs", upload.filename, upload.data)
		if err != nil {
			slog.Error("order proof: store", "error", err)
			serverError(w)
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE material_orders SET payment_proof_path = $2,
			updated_at = date_trunc('second', now()) WHERE id = $1`, orderID, stored); err != nil {
			slog.Error("order proof: update", "error", err)
			serverError(w)
			return
		}
		byName["payment_proof_path"] = stored

		var supplierUser *int64
		if supplierID := intPtrDeref(byName["supplier_id"]); supplierID != 0 {
			_ = pool.QueryRow(ctx, `SELECT user_id FROM suppliers WHERE id = $1`, supplierID).Scan(&supplierUser)
		}
		if supplierUser != nil {
			data := `{"material_order_id": ` + strconv.FormatInt(orderID, 10) + `}`
			if err := insertNotificationPool(ctx, pool, *supplierUser, "order_payment_proof",
				"Payment Proof Uploaded",
				"The buyer uploaded a payment proof for order #"+strconv.FormatInt(orderID, 10)+". Please verify it to proceed.",
				data); err != nil {
				slog.Warn("order proof: notify", "error", err)
			}
		}

		// The oracle reads `->user_id` for the
		// notification, which leaves that relation loaded on the response.
		entry := materialOrderObject(byName)
		if err := materialOrderRelations(ctx, pool, entry, byName, []string{"supplier"}); err != nil {
			slog.Error("order proof: relations", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Payment proof uploaded. Waiting for supplier verification.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}
