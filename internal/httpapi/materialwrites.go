package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MATERIALS — the merchant's own catalogue writes.
//
//   - POST validates with a BARE `{errors}` 422 (hand-built validator), stores
//     uploads under `materials`, creates the row, and answers
//     `{status, message, data}` where `data` is the CREATED model in the
//     `only([...])` key order plus `supplier_id`, then images.
//   - PUT is supplier-scoped on the row, updates only present keys, deletes
//     `deleted_image_ids`, and answers the HYDRATED model in table order.
//   - DELETE removes the files and the row; the answer carries no `data`.

// materialOnlyKeys is the controller's store `only()` order.
var materialOnlyKeys = []string{
	"name", "description", "price", "unit", "category", "stock", "specifications",
}

// materialUpdateKeys is the update `only()` order.
var materialUpdateKeys = []string{
	"name", "description", "price", "unit", "category", "stock", "is_available",
	"specifications",
}

// materialValidation is the hand-built validator shared by store and update.
func materialValidation(fields map[string]any, failures *errorBag, update bool) {
	presence := func(key string) bool {
		_, present := fields[key]
		return present
	}
	required := func(key string) bool {
		if !update {
			return true
		}
		return presence(key)
	}

	if required("name") {
		if raw, present := fields["name"]; !present || raw == nil {
			failures.add("name", "The name field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("name", "The name field must be a string.")
		} else if len([]rune(text)) > 255 {
			failures.add("name", "The name field must not be greater than 255 characters.")
		}
	}

	if raw, present := fields["description"]; present && raw != nil {
		if _, ok := raw.(string); !ok {
			failures.add("description", "The description field must be a string.")
		}
	}

	if required("price") {
		if raw, present := fields["price"]; !present || raw == nil {
			failures.add("price", "The price field is required.")
		} else if text, ok := numericTextOf(raw); !ok || !isNumericText(text) {
			failures.add("price", "The price field must be a number.")
		} else if parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil && parsed < 0 {
			failures.add("price", "The price field must be at least 0.")
		}
	}

	if required("unit") {
		if raw, present := fields["unit"]; !present || raw == nil {
			failures.add("unit", "The unit field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("unit", "The unit field must be a string.")
		} else if len([]rune(text)) > 50 {
			failures.add("unit", "The unit field must not be greater than 50 characters.")
		}
	}

	if required("category") {
		if raw, present := fields["category"]; !present || raw == nil {
			failures.add("category", "The category field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("category", "The category field must be a string.")
		} else if len([]rune(text)) > 100 {
			failures.add("category", "The category field must not be greater than 100 characters.")
		}
	}

	if raw, present := fields["stock"]; present {
		if text, ok := numericTextOf(raw); !ok || !isIntegerText(text) {
			failures.add("stock", "The stock field must be an integer.")
		} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil && parsed < 0 {
			failures.add("stock", "The stock field must be at least 0.")
		}
	}

	if update {
		if raw, present := fields["is_available"]; present {
			if _, ok := laravelBoolean(raw); !ok {
				failures.add("is_available", "The is available field must be true or false.")
			}
		}
	}

	if raw, present := fields["specifications"]; present && raw != nil {
		// Laravel's `array` rule is is_array(): a JSON OBJECT passes as an
		// associative array, so both shapes are valid here.
		switch raw.(type) {
		case []any, map[string]any:
		default:
			failures.add("specifications", "The specifications field must be an array.")
		}
	}
}

// materialInputText renders a present value as the text a numeric column gets.
func materialInputText(value any) any {
	if text, ok := numericTextOf(value); ok {
		return strings.TrimSpace(text)
	}
	return projectRawValue(value)
}

// materialUploadFailures applies mimes:jpg,jpeg,png,webp|max:2048.
func materialUploadFailures(upload *galleryUpload, key string, failures *errorBag) {
	switch upload.ext {
	case "jpg", "jpeg", "png", "webp":
		if upload.sizeBytes() > 2048*1024 {
			failures.add(key, "The "+key+" field must not be greater than 2048 kilobytes.")
		}
	default:
		failures.add(key, "The "+key+" field must be a file of type: jpg, jpeg, png, webp.")
	}
}

// StoreMaterialHandler serves `POST /api/merchant/materials`.
func StoreMaterialHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		supplier, found, err := supplierRow(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("material store: supplier", "error", err)
			serverError(w)
			return
		}
		if !found {
			scopedNotFound(w, `App\Models\Supplier`)
			return
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}

		failures := &errorBag{}
		materialValidation(fields, failures, false)
		images := requestFilesNamed(r, "images")
		for index, upload := range images {
			materialUploadFailures(upload, "images."+strconv.Itoa(index), failures)
		}
		if !failures.empty() {
			writeErrorsEnvelopeOnly(w, failures)
			return
		}

		imagesToStore := make([]*galleryUpload, 0, len(images))
		for _, upload := range images {
			imagesToStore = append(imagesToStore, upload)
		}

		// The created model: `only([...])` order, present keys only, then
		// supplier_id, timestamps, id.
		columns := make([]string, 0, len(materialOnlyKeys)+6)
		args := make([]any, 0, len(materialOnlyKeys)+2)
		placeholders := make([]string, 0, len(materialOnlyKeys)+2)
		for _, key := range materialOnlyKeys {
			raw, present := fields[key]
			if !present {
				continue
			}
			columns = append(columns, key)
			if key == "price" {
				args = append(args, materialInputText(raw))
				placeholders = append(placeholders, "$"+strconv.Itoa(len(args))+"::numeric")
				continue
			}
			if key == "specifications" {
				encoded, err := jsonphp.Marshal(raw)
				if err != nil {
					serverError(w)
					return
				}
				args = append(args, string(encoded))
				placeholders = append(placeholders, "$"+strconv.Itoa(len(args))+"::jsonb")
				continue
			}
			args = append(args, raw)
			placeholders = append(placeholders, "$"+strconv.Itoa(len(args)))
		}
		columns = append(columns, "supplier_id", "created_at", "updated_at")
		args = append(args, intPtrDeref(supplier["id"]))
		placeholders = append(placeholders, "$"+strconv.Itoa(len(args)), "date_trunc('second', now())", "date_trunc('second', now())")

		var materialID int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO materials
			(`+strings.Join(columns, ", ")+`)
			VALUES (`+strings.Join(placeholders, ", ")+`)
			RETURNING id, created_at, updated_at`, args...).Scan(&materialID, &createdAt, &updatedAt); err != nil {
			slog.Error("material store: insert", "error", err)
			serverError(w)
			return
		}

		for _, upload := range imagesToStore {
			stored, err := storeVaultFile("materials", upload.filename, upload.data)
			if err != nil {
				slog.Error("material store: image", "error", err)
				serverError(w)
				return
			}
			if _, err := pool.Exec(ctx, `INSERT INTO material_images
				(material_id, image_path, created_at, updated_at)
				VALUES ($1, $2, date_trunc('second', now()), date_trunc('second', now()))`,
				materialID, stored); err != nil {
				slog.Error("material store: image row", "error", err)
				serverError(w)
				return
			}
		}

		entry := jsonphp.NewObject()
		for _, key := range materialOnlyKeys {
			raw, present := fields[key]
			if !present {
				continue
			}
			switch key {
			case "price":
				// The decimal:2 CAST formats the in-memory value to two places.
				if text, ok := numericTextOf(raw); ok {
					if parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil {
						entry.Set(key, strconv.FormatFloat(parsed, 'f', 2, 64))
						break
					}
				}
				entry.Set(key, projectRawValue(raw))
			case "specifications":
				entry.Set(key, orderedJSONColumn(mustMarshalText(raw)))
			default:
				entry.Set(key, projectRawValue(raw))
			}
		}
		entry.Set("supplier_id", intPtrDeref(supplier["id"]))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("id", materialID)

		imagesList, err := materialImages(ctx, pool, materialID)
		if err != nil {
			slog.Error("material store: images", "error", err)
			serverError(w)
			return
		}
		entry.Set("images", imagesList)

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("message", "Material added successfully with multiple images")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// mustMarshalText renders a value as JSON text for orderedJSONColumn.
func mustMarshalText(value any) any {
	encoded, err := jsonphp.Marshal(value)
	if err != nil {
		return nil
	}
	return string(encoded)
}

// materialImages lists a material's image rows.
func materialImages(ctx context.Context, pool *pgxpool.Pool, materialID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, material_id, image_path, created_at, updated_at
		FROM material_images WHERE material_id = $1 ORDER BY id`, materialID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var (
			id, material         int64
			imagePath            *string
			createdAt, updatedAt any
		)
		if err := rows.Scan(&id, &material, &imagePath, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		entry := jsonphp.NewObject()
		entry.Set("id", id)
		entry.Set("material_id", material)
		entry.Set("image_path", nullableString(imagePath))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		out = append(out, entry)
	}
	return out, rows.Err()
}

// UpdateMaterialHandler serves `PUT /api/merchant/materials/{id}`.
func UpdateMaterialHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		supplier, found, err := supplierRow(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("material update: supplier", "error", err)
			serverError(w)
			return
		}
		if !found {
			scopedNotFound(w, `App\Models\Supplier`)
			return
		}

		raw := r.PathValue("id")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		materialID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			scopedNotFound(w, `App\Models\Material`)
			return
		}

		rows, values, err := materialRow(ctx, pool, materialID, intPtrDeref(supplier["id"]))
		if err != nil {
			if isNoRows(err) {
				scopedNotFound(w, `App\Models\Material`)
				return
			}
			slog.Error("material update: load", "error", err)
			serverError(w)
			return
		}
		current := map[string]any{}
		for i, column := range rows {
			current[column] = values[i]
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}

		failures := &errorBag{}
		materialValidation(fields, failures, true)
		images := requestFilesNamed(r, "images")
		for index, upload := range images {
			materialUploadFailures(upload, "images."+strconv.Itoa(index), failures)
		}
		deletedIDs := houseIdList(fields, "deleted_image_ids")
		for index, id := range deletedIDs {
			if !existsID(ctx, pool, "material_images", id) {
				failures.add("deleted_image_ids."+strconv.Itoa(index),
					"The selected deleted_image_ids."+strconv.Itoa(index)+" is invalid.")
			}
		}
		if !failures.empty() {
			writeErrorsEnvelopeOnly(w, failures)
			return
		}

		sets := make([]string, 0, len(materialUpdateKeys)+1)
		args := []any{materialID}
		for _, key := range materialUpdateKeys {
			value, present := fields[key]
			if !present {
				continue
			}
			args = append(args, nil)
			placeholder := "$" + strconv.Itoa(len(args))
			switch key {
			case "price":
				args[len(args)-1] = materialInputText(value)
				placeholder += "::numeric"
			case "specifications":
				args[len(args)-1] = mustMarshalText(value)
				placeholder += "::jsonb"
			case "is_available":
				flag, _ := laravelBoolean(value)
				args[len(args)-1] = flag
			default:
				args[len(args)-1] = projectRawValue(value)
			}
			sets = append(sets, key+" = "+placeholder)
		}
		if len(sets) > 0 {
			sets = append(sets, "updated_at = date_trunc('second', now())")
			if _, err := pool.Exec(ctx, `UPDATE materials SET `+strings.Join(sets, ", ")+
				` WHERE id = $1`, args...); err != nil {
				slog.Error("material update: exec", "error", err)
				serverError(w)
				return
			}
		}

		for _, imageID := range deletedIDs {
			var path *string
			if err := pool.QueryRow(ctx, `SELECT image_path FROM material_images
				WHERE id = $1 AND material_id = $2`, imageID, materialID).Scan(&path); err == nil {
				if path != nil {
					_ = removeVaultFile(*path)
				}
				_, _ = pool.Exec(ctx, `DELETE FROM material_images WHERE id = $1`, imageID)
			}
		}

		for _, upload := range images {
			stored, err := storeVaultFile("materials", upload.filename, upload.data)
			if err != nil {
				slog.Error("material update: image", "error", err)
				serverError(w)
				return
			}
			if _, err := pool.Exec(ctx, `INSERT INTO material_images
				(material_id, image_path, created_at, updated_at)
				VALUES ($1, $2, date_trunc('second', now()), date_trunc('second', now()))`,
				materialID, stored); err != nil {
				slog.Error("material update: image row", "error", err)
				serverError(w)
				return
			}
		}

		freshRows, freshValues, err := materialRow(ctx, pool, materialID, intPtrDeref(supplier["id"]))
		if err != nil {
			slog.Error("material update: reload", "error", err)
			serverError(w)
			return
		}
		fresh := map[string]any{}
		for i, column := range freshRows {
			fresh[column] = freshValues[i]
		}
		entry, err := materialObject(ctx, pool, fresh)
		if err != nil {
			slog.Error("material update: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("message", "Material updated successfully")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// materialRow reads a material scoped to its supplier.
func materialRow(ctx context.Context, pool *pgxpool.Pool, id, supplierID int64) ([]string, []any, error) {
	rows, err := pool.Query(ctx, `SELECT id, supplier_id, name, description, price::text,
		unit, category, stock, is_available, image_path, specifications::text,
		created_at, updated_at FROM materials
		WHERE id = $1 AND supplier_id = $2`, id, supplierID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	fields := fieldNames(rows)
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, nil, err
		}
		return nil, nil, pgx.ErrNoRows
	}
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, nil, err
	}
	return fields, values, rows.Err()
}

// DestroyMaterialHandler serves `DELETE /api/merchant/materials/{id}`.
func DestroyMaterialHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		supplier, found, err := supplierRow(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("material destroy: supplier", "error", err)
			serverError(w)
			return
		}
		if !found {
			scopedNotFound(w, `App\Models\Supplier`)
			return
		}

		raw := r.PathValue("id")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		materialID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			scopedNotFound(w, `App\Models\Material`)
			return
		}

		if _, _, err := materialRow(ctx, pool, materialID, intPtrDeref(supplier["id"])); err != nil {
			if isNoRows(err) {
				scopedNotFound(w, `App\Models\Material`)
				return
			}
			slog.Error("material destroy: load", "error", err)
			serverError(w)
			return
		}

		imageRows, err := materialImages(ctx, pool, materialID)
		if err == nil {
			for _, item := range imageRows {
				if object, ok := item.(*jsonphp.Object); ok {
					if path, present := object.Get("image_path"); present {
						if text, ok := path.(string); ok && text != "" {
							_ = removeVaultFile(text)
						}
					}
				}
			}
		}

		if _, err := pool.Exec(ctx, `DELETE FROM materials WHERE id = $1`, materialID); err != nil {
			slog.Error("material destroy: delete", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("message", "Material and its images deleted successfully")
		writeJSON(w, http.StatusOK, payload)
	}
}
