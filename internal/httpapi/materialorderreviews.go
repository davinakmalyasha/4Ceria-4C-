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

// MATERIAL ORDER REVIEWS — the buyer's rating of a received order.
//
//   - POST material-order-reviews: the buyer only, only once, only for an
//     order that ARRIVED (order delivered/completed, or a delivery job in
//     delivered/completed — which also syncs a stale order status). Validation
//     failures answer a BARE {"errors": …} 422 (no `message`).
//   - PUT material-order-reviews/{review}: the author only; `images` replace
//     the old set (old files deleted).
//   - DELETE material-order-reviews/{review}: the author only.
//   - GET suppliers/{supplier}/reviews: an ALLOWLIST resource — rating,
//     comment, images and the two order facts a buyer needs (items + total),
//     never the buyer's address, coordinates, receipts or notes.
//
// Review arrays are `image_paths` / `delivery_image_paths`; the legacy
// single-image column `image_path` also serializes.

// reviewColumns is the `material_order_reviews` table order.
var reviewColumns = []string{
	"id", "user_id", "supplier_id", "order_id", "rating", "comment", "image_path",
	"created_at", "updated_at", "delivery_rating", "delivery_comment",
	"delivery_user_id", "image_paths", "delivery_image_paths",
}

// reviewSelectList reads the array columns as text (key order preserved).
func reviewSelectList() string {
	parts := make([]string, 0, len(reviewColumns))
	for _, column := range reviewColumns {
		switch column {
		case "image_paths", "delivery_image_paths":
			parts = append(parts, column+"::text AS "+column)
		default:
			parts = append(parts, column)
		}
	}
	return strings.Join(parts, ", ")
}

// reviewTableObject renders a hydrated review in table order.
func reviewTableObject(ctx context.Context, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range reviewColumns {
		value := byName[column]
		switch column {
		case "image_paths", "delivery_image_paths":
			if value == nil {
				entry.Set(column, nil)
			} else {
				entry.Set(column, orderedJSONColumn(value))
			}
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		case "rating", "delivery_rating", "delivery_user_id":
			entry.Set(column, projectIntValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// reviewCreatedObject renders Eloquent's CREATED review: the payload order,
// then timestamps and id.
func reviewCreatedObject(byName map[string]any, imagePaths, deliveryPaths []any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("user_id", projectRawValue(byName["user_id"]))
	entry.Set("supplier_id", projectRawValue(byName["supplier_id"]))
	entry.Set("order_id", projectRawValue(byName["order_id"]))
	entry.Set("rating", projectIntValue(byName["rating"]))
	entry.Set("comment", projectRawValue(byName["comment"]))
	entry.Set("delivery_rating", projectIntValue(byName["delivery_rating"]))
	entry.Set("delivery_comment", projectRawValue(byName["delivery_comment"]))
	entry.Set("delivery_user_id", projectIntValue(byName["delivery_user_id"]))
	entry.Set("image_paths", imagePaths)
	entry.Set("delivery_image_paths", deliveryPaths)
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// reviewRow reads one review.
func reviewRow(ctx context.Context, pool *pgxpool.Pool, reviewID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+reviewSelectList()+`
		FROM material_order_reviews WHERE id = $1`, reviewID)
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

// writeErrorsEnvelopeOnly is the review controllers' 422 body: `errors` with
// no `message`.
func writeErrorsEnvelopeOnly(w http.ResponseWriter, failures *errorBag) {
	errors := jsonphp.NewObject()
	for _, field := range failures.fields {
		messages := make([]any, 0, len(failures.bag[field]))
		for _, message := range failures.bag[field] {
			messages = append(messages, message)
		}
		errors.Set(field, messages)
	}
	payload := jsonphp.NewObject()
	payload.Set("errors", errors)
	writeJSON(w, http.StatusUnprocessableEntity, payload)
}

// validateReviewRating enforces rating required|integer|min:1|max:5.
func validateReviewRating(fields map[string]any, key string, required bool, failures *errorBag) (int64, bool) {
	raw, present := fields[key]
	if !present || raw == nil {
		if required {
			failures.add(key, "The "+strings.ReplaceAll(key, "_", " ")+" field is required.")
		}
		return 0, false
	}
	text, ok := numericTextOf(raw)
	if !ok || !isIntegerText(text) {
		failures.add(key, "The "+strings.ReplaceAll(key, "_", " ")+" field must be an integer.")
		return 0, false
	}
	parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
	if err != nil {
		failures.add(key, "The "+strings.ReplaceAll(key, "_", " ")+" field must be an integer.")
		return 0, false
	}
	if parsed < 1 {
		failures.add(key, "The "+strings.ReplaceAll(key, "_", " ")+" field must be at least 1.")
		return 0, false
	}
	if parsed > 5 {
		failures.add(key, "The "+strings.ReplaceAll(key, "_", " ")+" field must not be greater than 5.")
		return 0, false
	}
	return parsed, true
}

// validateReviewComment enforces comment|delivery_comment nullable|string|max:1000.
func validateReviewComment(fields map[string]any, key string, failures *errorBag) (any, bool) {
	raw, present := fields[key]
	if !present || raw == nil {
		return nil, false
	}
	text, ok := raw.(string)
	if !ok {
		failures.add(key, "The "+strings.ReplaceAll(key, "_", " ")+" field must be a string.")
		return nil, false
	}
	if len([]rune(text)) > 1000 {
		failures.add(key, "The "+strings.ReplaceAll(key, "_", " ")+" field must not be greater than 1000 characters.")
		return nil, false
	}
	return text, true
}

// validateReviewImages enforces an upload array: max 3, jpg/jpeg/png/webp,
// max 5120 KB each.
func validateReviewImages(files []*galleryUpload, key string, failures *errorBag) {
	if len(files) > 3 {
		failures.add(key, "The "+strings.ReplaceAll(key, "_", " ")+" field must not have more than 3 items.")
	}
	for i, upload := range files {
		field := key + "." + strconv.Itoa(i)
		switch upload.ext {
		case "jpg", "jpeg", "png", "webp":
		default:
			failures.add(field, "The "+field+" field must be a file of type: jpg, jpeg, png, webp.")
			continue
		}
		if upload.sizeBytes() > 5120*1024 {
			failures.add(field, "The "+field+" field must not be greater than 5120 kilobytes.")
		}
	}
}

// storeReviewImages writes uploads under the public reviews prefix.
func storeReviewImages(files []*galleryUpload, directory string) []any {
	paths := make([]any, 0, len(files))
	for _, upload := range files {
		stored, err := storeVaultFile(directory, upload.filename, upload.data)
		if err == nil {
			paths = append(paths, stored)
		}
	}
	return paths
}

// deliveryJobStatusForOrder reads the order's delivery job status.
func deliveryJobStatusForOrder(ctx context.Context, pool *pgxpool.Pool, orderID int64) *string {
	var status *string
	_ = pool.QueryRow(ctx, `SELECT status FROM delivery_jobs WHERE order_id = $1 LIMIT 1`, orderID).Scan(&status)
	return status
}

// StoreOrderReviewHandler serves `POST /api/material-order-reviews`.
func StoreOrderReviewHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		var orderID int64
		if raw, present := formFields["order_id"]; !present || raw == nil {
			failures.add("order_id", "The order id field is required.")
		} else if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if err != nil || !existsID(ctx, pool, "material_orders", parsed) {
				failures.add("order_id", "The selected order id is invalid.")
			} else {
				orderID = parsed
			}
		} else {
			failures.add("order_id", "The selected order id is invalid.")
		}
		rating, _ := validateReviewRating(formFields, "rating", true, failures)
		comment, commentSet := validateReviewComment(formFields, "comment", failures)
		deliveryRating, deliveryRatingSet := validateReviewRating(formFields, "delivery_rating", false, failures)
		deliveryComment, deliveryCommentSet := validateReviewComment(formFields, "delivery_comment", failures)

		shopImages := requestFilesNamed(r, "shop_images")
		deliveryImages := requestFilesNamed(r, "delivery_images")
		validateReviewImages(shopImages, "shop_images", failures)
		validateReviewImages(deliveryImages, "delivery_images", failures)
		if !failures.empty() {
			writeErrorsEnvelopeOnly(w, failures)
			return
		}

		byName, found, err := materialOrderRow(ctx, pool, orderID)
		if err != nil {
			slog.Error("review store: order", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialOrder`, strconv.FormatInt(orderID, 10))
			return
		}
		if intPtrDeref(byName["user_id"]) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		orderStatus := stringOf(byName["status"])
		jobStatus := deliveryJobStatusForOrder(ctx, pool, orderID)
		deliveryCompleted := jobStatus != nil && (*jobStatus == "delivered" || *jobStatus == "completed")
		arrived := orderStatus == "delivered" || orderStatus == "completed"
		if !arrived && !deliveryCompleted {
			message(w, http.StatusBadRequest, "Only arrived or completed orders can be reviewed.")
			return
		}

		if deliveryCompleted && !arrived {
			if _, err := pool.Exec(ctx, `UPDATE material_orders SET status = 'delivered',
				delivered_at = date_trunc('second', now()), updated_at = date_trunc('second', now())
				WHERE id = $1`, orderID); err != nil {
				slog.Error("review store: sync order", "error", err)
				serverError(w)
				return
			}
		}

		var existingID int64
		if err := pool.QueryRow(ctx, `SELECT id FROM material_order_reviews WHERE order_id = $1 LIMIT 1`,
			orderID).Scan(&existingID); err == nil {
			message(w, http.StatusBadRequest, "You have already reviewed this order.")
			return
		}

		shopPaths := storeReviewImages(shopImages, "reviews/shop")
		deliveryPaths := storeReviewImages(deliveryImages, "reviews/delivery")

		var deliveryUser any
		if jobStatus != nil {
			var logisticsID *int64
			_ = pool.QueryRow(ctx, `SELECT logistics_id FROM delivery_jobs WHERE order_id = $1 LIMIT 1`, orderID).Scan(&logisticsID)
			if logisticsID != nil {
				deliveryUser = *logisticsID
			}
		}

		encodedShop, _ := jsonphp.Marshal(shopPaths)
		encodedDelivery, _ := jsonphp.Marshal(deliveryPaths)

		var commentArg, deliveryCommentArg any
		if commentSet {
			commentArg = comment
		}
		if deliveryCommentSet {
			deliveryCommentArg = deliveryComment
		}
		var deliveryRatingArg any
		if deliveryRatingSet {
			deliveryRatingArg = deliveryRating
		}

		var reviewID int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO material_order_reviews
			(user_id, supplier_id, order_id, rating, comment, delivery_rating, delivery_comment,
			 delivery_user_id, image_paths, delivery_image_paths, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
			 date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			caller.UserID(), intPtrDeref(byName["supplier_id"]), orderID, rating,
			commentArg, deliveryRatingArg, deliveryCommentArg, deliveryUser,
			string(encodedShop), string(encodedDelivery)).Scan(&reviewID, &createdAt, &updatedAt); err != nil {
			slog.Error("review store: insert", "error", err)
			serverError(w)
			return
		}

		created := map[string]any{
			"user_id": caller.UserID(), "supplier_id": intPtrDeref(byName["supplier_id"]),
			"order_id": orderID, "rating": rating, "comment": commentArg,
			"delivery_rating": deliveryRatingArg, "delivery_comment": deliveryCommentArg,
			"delivery_user_id": deliveryUser, "created_at": createdAt,
			"updated_at": updatedAt, "id": reviewID,
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("message", "Thank you for your feedback!")
		payload.Set("data", reviewCreatedObject(created, shopPaths, deliveryPaths))
		writeJSON(w, http.StatusOK, payload)
	}
}

// UpdateOrderReviewHandler serves
// `PUT /api/material-order-reviews/{material_order_review}`.
func UpdateOrderReviewHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawID := r.PathValue("material_order_review")
		reviewID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\MaterialOrderReview`, rawID)
			return
		}
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		byName, found, err := reviewRow(ctx, pool, reviewID)
		if err != nil {
			slog.Error("review update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialOrderReview`, rawID)
			return
		}
		if intPtrDeref(byName["user_id"]) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		failures := &errorBag{}
		rating, _ := validateReviewRating(formFields, "rating", true, failures)
		comment, commentSet := validateReviewComment(formFields, "comment", failures)
		images := requestFilesNamed(r, "images")
		validateReviewImages(images, "images", failures)
		if !failures.empty() {
			writeErrorsEnvelopeOnly(w, failures)
			return
		}

		sets := []string{"rating = $2", "updated_at = date_trunc('second', now())"}
		args := []any{reviewID, rating}
		if commentSet {
			args = append(args, comment)
			sets = append(sets, "comment = $"+strconv.Itoa(len(args)))
		} else {
			sets = append(sets, "comment = NULL")
		}

		if len(images) > 0 {
			// Delete the replaced files first.
			for _, item := range quoteItemsJSON(byName["image_paths"]) {
				if path, ok := item.(string); ok && path != "" {
					_ = removeVaultFile(path)
				}
			}
			paths := storeReviewImages(images, "reviews/materials")
			encoded, _ := jsonphp.Marshal(paths)
			args = append(args, string(encoded))
			sets = append(sets, "image_paths = $"+strconv.Itoa(len(args))+"::jsonb")
		}

		if _, err := pool.Exec(ctx, `UPDATE material_order_reviews SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("review update: exec", "error", err)
			serverError(w)
			return
		}

		fresh, _, err := reviewRow(ctx, pool, reviewID)
		if err != nil {
			slog.Error("review update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("message", "Review updated successfully!")
		payload.Set("data", reviewTableObject(ctx, fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// DestroyOrderReviewHandler serves
// `DELETE /api/material-order-reviews/{material_order_review}`.
func DestroyOrderReviewHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawID := r.PathValue("material_order_review")
		reviewID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\MaterialOrderReview`, rawID)
			return
		}
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		byName, found, err := reviewRow(ctx, pool, reviewID)
		if err != nil {
			slog.Error("review delete: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialOrderReview`, rawID)
			return
		}
		if intPtrDeref(byName["user_id"]) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		for _, item := range quoteItemsJSON(byName["image_paths"]) {
			if path, ok := item.(string); ok && path != "" {
				_ = removeVaultFile(path)
			}
		}

		if _, err := pool.Exec(ctx, `DELETE FROM material_order_reviews WHERE id = $1`, reviewID); err != nil {
			slog.Error("review delete: exec", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("message", "Review deleted successfully.")
		writeJSON(w, http.StatusOK, payload)
	}
}

// SupplierReviewsHandler serves `GET /api/suppliers/{supplier}/reviews`.
func SupplierReviewsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		supplierID, err := strconv.ParseInt(r.PathValue("supplier"), 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Supplier`, r.PathValue("supplier"))
			return
		}
		ctx := r.Context()
		currentPage := pageParam(r)
		const perPage = 10

		where := []string{"supplier_id = $1"}
		args := []any{supplierID}
		if rating := r.URL.Query().Get("rating"); rating != "" {
			args = append(args, rating)
			where = append(where, "rating = $"+strconv.Itoa(len(args)))
		}
		if r.URL.Query().Get("has_images") == "true" {
			where = append(where, "image_paths IS NOT NULL", "image_paths::text <> '[]'")
		}

		order := "created_at DESC, id ASC"
		switch r.URL.Query().Get("sort") {
		case "rating_high":
			order = "rating DESC, id ASC"
		case "rating_low":
			order = "rating ASC, id ASC"
		}

		clause := " WHERE " + strings.Join(where, " AND ")
		var total int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM material_order_reviews`+clause, args...).Scan(&total); err != nil {
			slog.Error("supplier reviews: count", "error", err)
			serverError(w)
			return
		}

		offset := (currentPage - 1) * perPage
		rows, err := pool.Query(ctx, `SELECT `+reviewSelectList()+` FROM material_order_reviews`+clause+
			` ORDER BY `+order+` LIMIT `+strconv.Itoa(perPage)+` OFFSET `+strconv.Itoa(offset), args...)
		if err != nil {
			slog.Error("supplier reviews: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		items := make([]any, 0, perPage)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("supplier reviews: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry, err := supplierReviewEntry(ctx, pool, byName)
			if err != nil {
				slog.Error("supplier reviews: entry", "error", err)
				serverError(w)
				return
			}
			items = append(items, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("supplier reviews: rows", "error", err)
			serverError(w)
			return
		}

		// The nested resource collection serializes its items only; the
		// pagination meta is not part of this endpoint's contract.
		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("data", items)
		writeJSON(w, http.StatusOK, payload)
	}
}

// supplierReviewEntry is the MaterialOrderReviewResource allowlist.
func supplierReviewEntry(ctx context.Context, pool *pgxpool.Pool, byName map[string]any) (*jsonphp.Object, error) {
	entry := jsonphp.NewObject()
	entry.Set("id", projectIntValue(byName["id"]))
	entry.Set("rating", projectIntValue(byName["rating"]))
	entry.Set("comment", projectRawValue(byName["comment"]))
	entry.Set("image_path", projectRawValue(byName["image_path"]))
	if byName["image_paths"] == nil {
		entry.Set("image_paths", nil)
	} else {
		entry.Set("image_paths", orderedJSONColumn(byName["image_paths"]))
	}
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("delivery_rating", projectIntValue(byName["delivery_rating"]))
	entry.Set("delivery_comment", projectRawValue(byName["delivery_comment"]))
	if byName["delivery_image_paths"] == nil {
		entry.Set("delivery_image_paths", nil)
	} else {
		entry.Set("delivery_image_paths", orderedJSONColumn(byName["delivery_image_paths"]))
	}

	userID := intPtrDeref(byName["user_id"])
	reviewer, err := fullProfileUser(ctx, pool, userID, false)
	if err != nil {
		return nil, err
	}
	if object, ok := reviewer.(*jsonphp.Object); ok {
		safe := jsonphp.NewObject()
		if value, present := object.Get("id"); present {
			safe.Set("id", value)
		}
		if value, present := object.Get("name"); present {
			safe.Set("name", value)
		}
		if value, present := object.Get("pic"); present {
			safe.Set("pic", value)
		}
		entry.Set("reviewer", safe)
	} else {
		entry.Set("reviewer", nil)
	}

	orderID := intPtrDeref(byName["order_id"])
	orderBlock := jsonphp.NewObject()
	rows, err := pool.Query(ctx, `SELECT material_id, quantity, price_at_order::text
		FROM material_order_items WHERE order_id = $1 ORDER BY id`, orderID)
	if err != nil {
		return nil, err
	}
	orderItems := make([]any, 0)
	for rows.Next() {
		var materialID, quantity int64
		var price string
		if err := rows.Scan(&materialID, &quantity, &price); err != nil {
			rows.Close()
			return nil, err
		}
		item := jsonphp.NewObject()
		item.Set("material_id", materialID)
		materialName, _ := materialModelObject(ctx, pool, materialID)
		if materialName != nil {
			if name, present := materialName.Get("name"); present {
				item.Set("name", name)
			} else {
				item.Set("name", nil)
			}
		} else {
			item.Set("name", nil)
		}
		item.Set("qty", quantity)
		item.Set("price_at_order", price)
		orderItems = append(orderItems, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	orderBlock.Set("items", orderItems)

	var totalPrice *string
	_ = pool.QueryRow(ctx, `SELECT total_price::text FROM material_orders WHERE id = $1`, orderID).Scan(&totalPrice)
	orderBlock.Set("total_price", nullableString(totalPrice))
	entry.Set("order", orderBlock)

	return entry, nil
}
