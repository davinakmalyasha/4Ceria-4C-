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

// MARKETPLACE — the public supplier directory and material listing.
//
// Both routes are UNAUTHENTICATED and STRIP identity fields from the owner's
// user payload (`email`, `email_verified_at`, `google_id`, the two-factor
// columns, bank details and `unique_code`).
//
// `GET /marketplace/suppliers` carries materials_count + reviews_avg_rating +
// reviews_count THEN the user; `show` carries only the two review aggregates
// (no materials_count) then user, materials, reviews. The materials listing is
// `latest()` and its same-second ties come back id DESCENDING for this query
// shape (unlike the supplier-scoped merchant listing, which is id ASC).

// marketplaceHiddenUserFields is SENSITIVE_USER_FIELDS plus User::$hidden.
var marketplaceHiddenUserFields = map[string]bool{
	"password": true, "remember_token": true,
	"email": true, "email_verified_at": true, "google_id": true,
	"two_factor_secret": true, "two_factor_recovery_codes": true,
	"bank_name": true, "bank_account_number": true, "bank_account_name": true,
	"unique_code": true,
}

// marketplaceUser renders the owner payload with the sensitive set removed.
func marketplaceUser(ctx context.Context, pool *pgxpool.Pool, userID int64) (any, error) {
	rows, err := pool.Query(ctx, `SELECT id,name,email,username,unique_code,email_verified_at,pic,firm_name,firm_slogan,firm_banner_path,firm_description,firm_is_hiring,firm_needed_roles,"Deskripsi",bank_name,bank_account_number,bank_account_name,created_at,updated_at,role_type,is_suspended FROM users WHERE id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, nil
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}

	user := jsonphp.NewObject()
	for i, column := range fields {
		if marketplaceHiddenUserFields[column] {
			continue
		}
		switch column {
		case "created_at", "updated_at":
			user.Set(column, projectTimeValue(values[i]))
		case "is_suspended":
			flag, _ := values[i].(bool)
			user.Set(column, flag)
		default:
			user.Set(column, projectRawValue(values[i]))
		}
	}
	return user, nil
}

// reviewAggregates returns (avg-as-text, count) for a supplier's reviews.
func reviewAggregates(ctx context.Context, pool *pgxpool.Pool, supplierID int64) (*string, int64) {
	var average *string
	var count int64
	_ = pool.QueryRow(ctx, `SELECT round(avg(rating), 4)::text, count(*)
		FROM material_order_reviews WHERE supplier_id = $1`, supplierID).Scan(&average, &count)
	return average, count
}

// marketplaceSupplierObject renders a supplier plus the requested counts.
func marketplaceSupplierObject(ctx context.Context, pool *pgxpool.Pool,
	byName map[string]any, countKeys []string) (*jsonphp.Object, error) {
	entry := supplierObject(byName)
	supplierID := intPtrDeref(byName["id"])

	for _, key := range countKeys {
		switch key {
		case "materials_count":
			var count int64
			_ = pool.QueryRow(ctx, `SELECT count(*) FROM materials
				WHERE supplier_id = $1 AND is_available = true`, supplierID).Scan(&count)
			entry.Set(key, count)
		case "reviews_avg_rating":
			average, _ := reviewAggregates(ctx, pool, supplierID)
			if average == nil {
				entry.Set(key, nil)
			} else {
				entry.Set(key, *average)
			}
		case "reviews_count":
			_, count := reviewAggregates(ctx, pool, supplierID)
			entry.Set(key, count)
		}
	}
	return entry, nil
}

// MarketplaceSuppliersHandler serves `GET /api/marketplace/suppliers`.
func MarketplaceSuppliersHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		where := []string{"verification_status = 'verified'"}
		args := []any{}
		if category := r.URL.Query().Get("category"); category != "" {
			args = append(args, "%"+category+"%")
			where = append(where, "category ILIKE $"+strconv.Itoa(len(args)))
		}
		if search := r.URL.Query().Get("search"); search != "" {
			args = append(args, "%"+search+"%")
			where = append(where, "store_name ILIKE $"+strconv.Itoa(len(args)))
		}

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(supplierColumns, ", ")+`
			FROM suppliers WHERE `+strings.Join(where, " AND ")+`
			ORDER BY id`, args...)
		if err != nil {
			slog.Error("marketplace suppliers: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("marketplace suppliers: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry, err := marketplaceSupplierObject(ctx, pool, byName,
				[]string{"materials_count", "reviews_avg_rating", "reviews_count"})
			if err != nil {
				slog.Error("marketplace suppliers: render", "error", err)
				serverError(w)
				return
			}
			user, err := marketplaceUser(ctx, pool, intPtrDeref(byName["user_id"]))
			if err != nil {
				slog.Error("marketplace suppliers: user", "error", err)
				serverError(w)
				return
			}
			entry.Set("user", user)
			out = append(out, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// MarketplaceSupplierHandler serves `GET /api/marketplace/suppliers/{id}`.
func MarketplaceSupplierHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		raw := r.PathValue("id")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		supplierID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\Supplier`, raw)
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(supplierColumns, ", ")+`
			FROM suppliers WHERE id = $1`, supplierID)
		if err != nil {
			slog.Error("marketplace supplier: query", "error", err)
			serverError(w)
			return
		}
		fields := []string{}
		values := []any{}
		if rows.Next() {
			fields = fieldNames(rows)
			values, err = scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				slog.Error("marketplace supplier: scan", "error", err)
				serverError(w)
				return
			}
		}
		rows.Close()
		if len(values) == 0 {
			modelNotFound(w, `App\Models\Supplier`, raw)
			return
		}
		byName := map[string]any{}
		for i, column := range fields {
			byName[column] = values[i]
		}

		entry, err := marketplaceSupplierObject(ctx, pool, byName,
			[]string{"reviews_avg_rating", "reviews_count"})
		if err != nil {
			slog.Error("marketplace supplier: render", "error", err)
			serverError(w)
			return
		}

		user, err := marketplaceUser(ctx, pool, intPtrDeref(byName["user_id"]))
		if err != nil {
			slog.Error("marketplace supplier: user", "error", err)
			serverError(w)
			return
		}
		entry.Set("user", user)

		materials, err := marketplaceSupplierMaterials(ctx, pool, supplierID)
		if err != nil {
			slog.Error("marketplace supplier: materials", "error", err)
			serverError(w)
			return
		}
		entry.Set("materials", materials)

		reviews, err := marketplaceSupplierReviews(ctx, pool, supplierID)
		if err != nil {
			slog.Error("marketplace supplier: reviews", "error", err)
			serverError(w)
			return
		}
		entry.Set("reviews", reviews)

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// marketplaceSupplierMaterials lists the supplier's available materials with
// images and the owner card.
func marketplaceSupplierMaterials(ctx context.Context, pool *pgxpool.Pool, supplierID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, supplier_id, name, description, price::text,
		unit, category, stock, is_available, image_path, specifications::text,
		created_at, updated_at
		FROM materials WHERE supplier_id = $1 AND is_available = true
		ORDER BY id`, supplierID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		fields := fieldNames(rows)
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		row := map[string]any{}
		for i, column := range fields {
			row[column] = values[i]
		}
		entry, err := materialObject(ctx, pool, row)
		if err != nil {
			return nil, err
		}
		out = append(out, entry)
	}
	return out, rows.Err()
}

// marketplaceSupplierReviews lists a supplier's reviews with the reviewer card.
func marketplaceSupplierReviews(ctx context.Context, pool *pgxpool.Pool, supplierID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, user_id, supplier_id, order_id, rating, comment,
		image_path, created_at, updated_at, delivery_rating, delivery_comment,
		delivery_user_id, image_paths::text, delivery_image_paths::text
		FROM material_order_reviews WHERE supplier_id = $1 ORDER BY id`, supplierID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var (
			id, userID, supplier, order int64
			rating                      *int64
			comment, imagePath          *string
			createdAt, updatedAt        any
			deliveryRating              *int64
			deliveryComment             *string
			deliveryUserID              *int64
			imagePaths, deliveryPaths   *string
		)
		if err := rows.Scan(&id, &userID, &supplier, &order, &rating, &comment,
			&imagePath, &createdAt, &updatedAt, &deliveryRating, &deliveryComment,
			&deliveryUserID, &imagePaths, &deliveryPaths); err != nil {
			return nil, err
		}
		entry := jsonphp.NewObject()
		entry.Set("id", id)
		entry.Set("user_id", userID)
		entry.Set("supplier_id", supplier)
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
		user, err := marketplaceUser(ctx, pool, userID)
		if err != nil {
			return nil, err
		}
		entry.Set("user", user)
		out = append(out, entry)
	}
	return out, rows.Err()
}

// marketplaceMaterialEntry renders the public material: columns, supplier (with
// its owner), then images.
func marketplaceMaterialEntry(ctx context.Context, pool *pgxpool.Pool, row map[string]any) (*jsonphp.Object, error) {
	entry := jsonphp.NewObject()
	for _, column := range []string{
		"id", "supplier_id", "name", "description", "price", "unit", "category",
		"stock", "is_available", "image_path", "specifications", "created_at", "updated_at",
	} {
		value := row[column]
		switch column {
		case "price":
			entry.Set(column, projectDecimalValue(value))
		case "is_available":
			flag, _ := value.(bool)
			entry.Set(column, flag)
		case "specifications":
			entry.Set(column, orderedJSONColumn(value))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	supplierID := intPtrDeref(row["supplier_id"])
	supplierFields, supplierValues, err := func() ([]string, []any, error) {
		rows, err := pool.Query(ctx, `SELECT `+strings.Join(supplierColumns, ", ")+`
			FROM suppliers WHERE id = $1`, supplierID)
		if err != nil {
			return nil, nil, err
		}
		defer rows.Close()
		if !rows.Next() {
			return nil, nil, nil
		}
		fields := fieldNames(rows)
		values, err := scanRow(rows, len(fields))
		return fields, values, err
	}()
	if err != nil {
		return nil, err
	}
	if supplierFields != nil {
		byName := map[string]any{}
		for i, column := range supplierFields {
			byName[column] = supplierValues[i]
		}
		supplier := supplierObject(byName)
		owner, err := marketplaceUser(ctx, pool, intPtrDeref(byName["user_id"]))
		if err != nil {
			return nil, err
		}
		supplier.Set("user", owner)
		entry.Set("supplier", supplier)
	} else {
		entry.Set("supplier", nil)
	}

	images, err := materialImages(ctx, pool, intPtrDeref(row["id"]))
	if err != nil {
		return nil, err
	}
	entry.Set("images", images)
	return entry, nil
}

// MarketplaceMaterialsHandler serves `GET /api/marketplace/materials`.
func MarketplaceMaterialsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		where := []string{
			"m.is_available = true",
			"EXISTS (SELECT 1 FROM suppliers s WHERE s.id = m.supplier_id AND s.verification_status = 'verified')",
		}
		args := []any{}
		if category := r.URL.Query().Get("category"); category != "" {
			args = append(args, category)
			where = append(where, "m.category = $"+strconv.Itoa(len(args)))
		}
		if search := r.URL.Query().Get("search"); search != "" {
			args = append(args, "%"+search+"%")
			where = append(where, "m.name ILIKE $"+strconv.Itoa(len(args)))
		}
		if minPrice := r.URL.Query().Get("min_price"); minPrice != "" {
			args = append(args, minPrice)
			where = append(where, "m.price >= $"+strconv.Itoa(len(args))+"::numeric")
		}
		if maxPrice := r.URL.Query().Get("max_price"); maxPrice != "" {
			args = append(args, maxPrice)
			where = append(where, "m.price <= $"+strconv.Itoa(len(args))+"::numeric")
		}

		rows, err := pool.Query(ctx, `SELECT m.id, m.supplier_id, m.name, m.description,
			m.price::text, m.unit, m.category, m.stock, m.is_available, m.image_path,
			m.specifications::text, m.created_at, m.updated_at
			FROM materials m WHERE `+strings.Join(where, " AND ")+`
			ORDER BY m.created_at DESC, m.id DESC`, args...)
		if err != nil {
			slog.Error("marketplace materials: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("marketplace materials: scan", "error", err)
				serverError(w)
				return
			}
			row := map[string]any{}
			for i, column := range fields {
				row[column] = values[i]
			}
			entry, err := marketplaceMaterialEntry(ctx, pool, row)
			if err != nil {
				slog.Error("marketplace materials: render", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}
