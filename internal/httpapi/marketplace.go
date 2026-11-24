package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
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

// marketplaceUserColumns is the owner projection. Email, unique_code and the
// bank fields are selected so the hidden-field set is applied in one place.
const marketplaceUserColumns = `id,name,email,username,unique_code,email_verified_at,pic,firm_name,firm_slogan,firm_banner_path,firm_description,firm_is_hiring,firm_needed_roles,"Deskripsi",bank_name,bank_account_number,bank_account_name,created_at,updated_at,role_type,is_suspended`

func marketplaceUserObject(fields []string, values []any) *jsonwire.Object {
	user := jsonwire.NewObject()
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
	return user
}

// marketplaceUser renders the owner payload with the sensitive set removed.
func marketplaceUser(ctx context.Context, pool *pgxpool.Pool, userID int64) (any, error) {
	rows, err := pool.Query(ctx, `SELECT `+marketplaceUserColumns+` FROM users WHERE id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	return marketplaceUserObject(fields, values), rows.Err()
}

// marketplaceUsersBatch loads a page of owner payloads in one query.
func marketplaceUsersBatch(ctx context.Context, pool *pgxpool.Pool, ids []int64) (map[int64]any, error) {
	out := map[int64]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT `+marketplaceUserColumns+` FROM users WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	fields := fieldNames(rows)
	for rows.Next() {
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		out[projectInt(values, fields, "id")] = marketplaceUserObject(fields, values)
	}
	return out, rows.Err()
}

// reviewAggregates returns (avg-as-text, count) for a supplier's reviews.
func reviewAggregates(ctx context.Context, pool *pgxpool.Pool, supplierID int64) (*string, int64) {
	var average *string
	var count int64
	_ = pool.QueryRow(ctx, `SELECT round(avg(rating), 4)::text, count(*)
		FROM material_order_reviews WHERE supplier_id = $1`, supplierID).Scan(&average, &count)
	return average, count
}

// marketplaceSupplierBundle carries one page's supplier aggregates.
type marketplaceSupplierBundle struct {
	materialsCount map[int64]int64
	reviewAvg      map[int64]string
	reviewCount    map[int64]int64
	users          map[int64]any
}

// buildMarketplaceSupplierBundle loads the three per-supplier relations of a
// page once: available material count, review aggregate and owner.
func buildMarketplaceSupplierBundle(ctx context.Context, pool *pgxpool.Pool, suppliers []map[string]any) (*marketplaceSupplierBundle, error) {
	bundle := &marketplaceSupplierBundle{
		materialsCount: map[int64]int64{},
		reviewAvg:      map[int64]string{},
		reviewCount:    map[int64]int64{},
		users:          map[int64]any{},
	}
	if len(suppliers) == 0 {
		return bundle, nil
	}

	ids := make([]int64, 0, len(suppliers))
	userSeen := map[int64]bool{}
	userIDs := make([]int64, 0, len(suppliers))
	for _, supplier := range suppliers {
		id := intPtrDeref(supplier["id"])
		if id != 0 {
			ids = append(ids, id)
		}
		userID := intPtrDeref(supplier["user_id"])
		if userID != 0 && !userSeen[userID] {
			userSeen[userID] = true
			userIDs = append(userIDs, userID)
		}
	}

	materials, err := pool.Query(ctx, `SELECT supplier_id, count(*) FROM materials
		WHERE supplier_id = ANY($1) AND is_available = true
		GROUP BY supplier_id`, ids)
	if err != nil {
		return nil, err
	}
	for materials.Next() {
		var id, count int64
		if err := materials.Scan(&id, &count); err != nil {
			materials.Close()
			return nil, err
		}
		bundle.materialsCount[id] = count
	}
	if err := materials.Err(); err != nil {
		materials.Close()
		return nil, err
	}
	materials.Close()

	reviews, err := pool.Query(ctx, `SELECT supplier_id, round(avg(rating), 4)::text, count(*)
		FROM material_order_reviews WHERE supplier_id = ANY($1)
		GROUP BY supplier_id`, ids)
	if err != nil {
		return nil, err
	}
	for reviews.Next() {
		var id int64
		var average *string
		var count int64
		if err := reviews.Scan(&id, &average, &count); err != nil {
			reviews.Close()
			return nil, err
		}
		if average != nil {
			bundle.reviewAvg[id] = *average
		}
		bundle.reviewCount[id] = count
	}
	if err := reviews.Err(); err != nil {
		reviews.Close()
		return nil, err
	}
	reviews.Close()

	users, err := marketplaceUsersBatch(ctx, pool, userIDs)
	if err != nil {
		return nil, err
	}
	bundle.users = users

	return bundle, nil
}

// marketplaceSupplierObject renders a supplier plus the requested counts. The
// per-row path is kept for the detail endpoint; the list passes a bundle.
func marketplaceSupplierObject(ctx context.Context, pool *pgxpool.Pool,
	byName map[string]any, countKeys []string, bundle *marketplaceSupplierBundle) (*jsonwire.Object, error) {
	entry := supplierObject(byName)
	supplierID := intPtrDeref(byName["id"])

	var (
		reviewLoaded bool
		reviewAvg    *string
		reviewCount  int64
	)
	loadReviews := func() {
		if reviewLoaded {
			return
		}
		reviewAvg, reviewCount = reviewAggregates(ctx, pool, supplierID)
		reviewLoaded = true
	}

	for _, key := range countKeys {
		switch key {
		case "materials_count":
			if bundle != nil {
				entry.Set(key, bundle.materialsCount[supplierID])
				continue
			}
			var count int64
			_ = pool.QueryRow(ctx, `SELECT count(*) FROM materials
				WHERE supplier_id = $1 AND is_available = true`, supplierID).Scan(&count)
			entry.Set(key, count)
		case "reviews_avg_rating":
			if bundle != nil {
				if average, ok := bundle.reviewAvg[supplierID]; ok {
					entry.Set(key, average)
				} else {
					entry.Set(key, nil)
				}
				continue
			}
			loadReviews()
			if reviewAvg == nil {
				entry.Set(key, nil)
			} else {
				entry.Set(key, *reviewAvg)
			}
		case "reviews_count":
			if bundle != nil {
				entry.Set(key, bundle.reviewCount[supplierID])
				continue
			}
			loadReviews()
			entry.Set(key, reviewCount)
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
		fields, values, err := collectRows(rows)
		rows.Close()
		if err != nil {
			slog.Error("marketplace suppliers: scan", "error", err)
			serverError(w)
			return
		}

		loaded := make([]map[string]any, 0, len(values))
		for _, row := range values {
			byName := make(map[string]any, len(fields))
			for i, column := range fields {
				byName[column] = row[i]
			}
			loaded = append(loaded, byName)
		}

		bundle, err := buildMarketplaceSupplierBundle(ctx, pool, loaded)
		if err != nil {
			slog.Error("marketplace suppliers: bundle", "error", err)
			serverError(w)
			return
		}

		out := make([]any, 0, len(loaded))
		for _, byName := range loaded {
			entry, err := marketplaceSupplierObject(ctx, pool, byName,
				[]string{"materials_count", "reviews_avg_rating", "reviews_count"}, bundle)
			if err != nil {
				slog.Error("marketplace suppliers: render", "error", err)
				serverError(w)
				return
			}
			entry.Set("user", bundle.users[intPtrDeref(byName["user_id"])])
			out = append(out, entry)
		}

		payload := jsonwire.NewObject()
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
			[]string{"reviews_avg_rating", "reviews_count"}, nil)
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

		payload := jsonwire.NewObject()
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
		entry := jsonwire.NewObject()
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
// marketplaceMaterialBundle carries one page's supplier, owner and image
// relations for the public material listing.
type marketplaceMaterialBundle struct {
	suppliers map[int64]*jsonwire.Object
	images    map[int64][]any
}

func materialImagesBatch(ctx context.Context, pool *pgxpool.Pool, ids []int64) (map[int64][]any, error) {
	out := map[int64][]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT id, material_id, image_path, created_at, updated_at
		FROM material_images WHERE material_id = ANY($1) ORDER BY material_id, id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id, materialID int64
		var imagePath *string
		var createdAt, updatedAt any
		if err := rows.Scan(&id, &materialID, &imagePath, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		entry := jsonwire.NewObject()
		entry.Set("id", id)
		entry.Set("material_id", materialID)
		entry.Set("image_path", nullableString(imagePath))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		out[materialID] = append(out[materialID], entry)
	}
	return out, rows.Err()
}

func buildMarketplaceMaterialBundle(ctx context.Context, pool *pgxpool.Pool, rows []map[string]any) (*marketplaceMaterialBundle, error) {
	bundle := &marketplaceMaterialBundle{
		suppliers: map[int64]*jsonwire.Object{},
		images:    map[int64][]any{},
	}
	if len(rows) == 0 {
		return bundle, nil
	}

	materialIDs := make([]int64, 0, len(rows))
	supplierSet := map[int64]bool{}
	supplierIDs := make([]int64, 0, len(rows))
	for _, row := range rows {
		if id := intPtrDeref(row["id"]); id != 0 {
			materialIDs = append(materialIDs, id)
		}
		if id := intPtrDeref(row["supplier_id"]); id != 0 && !supplierSet[id] {
			supplierSet[id] = true
			supplierIDs = append(supplierIDs, id)
		}
	}

	supplierUser := map[int64]int64{}
	userIDs := make([]int64, 0, len(supplierIDs))
	if len(supplierIDs) > 0 {
		rows, err := pool.Query(ctx, `SELECT `+strings.Join(supplierColumns, ", ")+`
			FROM suppliers WHERE id = ANY($1)`, supplierIDs)
		if err != nil {
			return nil, err
		}
		fields := fieldNames(rows)
		for rows.Next() {
			values, err := scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				return nil, err
			}
			byName := make(map[string]any, len(fields))
			for i, column := range fields {
				byName[column] = values[i]
			}
			id := projectInt(values, fields, "id")
			bundle.suppliers[id] = supplierObject(byName)
			userID := projectInt(values, fields, "user_id")
			if userID != 0 {
				supplierUser[id] = userID
				userIDs = append(userIDs, userID)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	users, err := marketplaceUsersBatch(ctx, pool, userIDs)
	if err != nil {
		return nil, err
	}
	for id, supplier := range bundle.suppliers {
		supplier.Set("user", users[supplierUser[id]])
	}

	images, err := materialImagesBatch(ctx, pool, materialIDs)
	if err != nil {
		return nil, err
	}
	bundle.images = images

	return bundle, nil
}

func marketplaceMaterialRowObject(row map[string]any) *jsonwire.Object {
	entry := jsonwire.NewObject()
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
	return entry
}

func marketplaceMaterialEntryBundled(ctx context.Context, pool *pgxpool.Pool, row map[string]any, bundle *marketplaceMaterialBundle) (*jsonwire.Object, error) {
	entry := marketplaceMaterialRowObject(row)
	supplierID := intPtrDeref(row["supplier_id"])

	if bundle != nil {
		entry.Set("supplier", bundle.suppliers[supplierID])
		images := bundle.images[intPtrDeref(row["id"])]
		if images == nil {
			images = []any{}
		}
		entry.Set("images", images)
		return entry, nil
	}

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

func marketplaceMaterialEntry(ctx context.Context, pool *pgxpool.Pool, row map[string]any) (*jsonwire.Object, error) {
	return marketplaceMaterialEntryBundled(ctx, pool, row, nil)
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
		fields, values, err := collectRows(rows)
		rows.Close()
		if err != nil {
			slog.Error("marketplace materials: scan", "error", err)
			serverError(w)
			return
		}

		loaded := make([]map[string]any, 0, len(values))
		for _, row := range values {
			byName := make(map[string]any, len(fields))
			for i, column := range fields {
				byName[column] = row[i]
			}
			loaded = append(loaded, byName)
		}

		bundle, err := buildMarketplaceMaterialBundle(ctx, pool, loaded)
		if err != nil {
			slog.Error("marketplace materials: bundle", "error", err)
			serverError(w)
			return
		}

		out := make([]any, 0, len(loaded))
		for _, row := range loaded {
			entry, err := marketplaceMaterialEntryBundled(ctx, pool, row, bundle)
			if err != nil {
				slog.Error("marketplace materials: render", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}

		payload := jsonwire.NewObject()
		payload.Set("status", "success")
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}
