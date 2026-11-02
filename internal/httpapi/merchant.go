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

// MERCHANT — the supplier's own profile and catalogue.
//
//   - GET /merchant/profile is supplier-only (403 "Unauthorized") and CREATES a
//     blank profile on first read (`"<name>'s Store"`, pending).
//   - PUT /merchant/profile validates with a bare `{errors}` 422 (the controller
//     builds the validator by hand, so there is no `message`), accepts a `foto`
//     upload, and answers `{status, message, data}`.
//   - GET /merchant/materials has NO role gate: it resolves the supplier by
//     user id (404 when absent) and lists that store's materials with images.

// supplierColumns is the `suppliers` table order.
var supplierColumns = []string{
	"id", "user_id", "store_name", "address", "no_telp", "category", "bio",
	"verification_status", "rejection_reason", "foto", "created_at", "updated_at",
	"detail_location", "latitude", "longitude",
}

// supplierObject renders a hydrated Supplier (float coordinates, Carbon dates).
func supplierObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range supplierColumns {
		switch column {
		case "latitude", "longitude":
			entry.Set(column, numericFloatValue(byName[column]))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	return entry
}

// supplierCreatedObject renders Eloquent's CREATED model: payload order,
// then updated_at BEFORE created_at, then id. Unset columns are ABSENT.
func supplierCreatedObject(byName map[string]any, payloadKeys []string) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range payloadKeys {
		entry.Set(column, projectRawValue(byName[column]))
	}
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// supplierRow reads a supplier by user id.
func supplierRow(ctx context.Context, pool *pgxpool.Pool, userID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(supplierColumns, ", ")+`
		FROM suppliers WHERE user_id = $1 LIMIT 1`, userID)
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

// MerchantProfileHandler serves `GET /api/merchant/profile`.
func MerchantProfileHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		if caller.RoleType() != "supplier" {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		byName, found, err := supplierRow(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("merchant profile: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			var name string
			_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, caller.UserID()).Scan(&name)
			storeName := name + "'s Store"
			var id int64
			var createdAt, updatedAt any
			if err := pool.QueryRow(ctx, `INSERT INTO suppliers
				(user_id, store_name, verification_status, created_at, updated_at)
				VALUES ($1, $2, 'pending', date_trunc('second', now()), date_trunc('second', now()))
				RETURNING id, created_at, updated_at`,
				caller.UserID(), storeName).Scan(&id, &createdAt, &updatedAt); err != nil {
				slog.Error("merchant profile: create", "error", err)
				serverError(w)
				return
			}
			// The controller returns the model it just CREATED: payload order,
			// timestamps, id — unset columns absent.
			created := map[string]any{
				"id": id, "user_id": caller.UserID(), "store_name": storeName,
				"verification_status": "pending", "created_at": createdAt, "updated_at": updatedAt,
			}
			payload := jsonphp.NewObject()
			payload.Set("status", "success")
			payload.Set("data", supplierCreatedObject(created, []string{
				"user_id", "store_name", "verification_status",
			}))
			writeJSON(w, http.StatusOK, payload)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("data", supplierObject(byName))
		writeJSON(w, http.StatusOK, payload)
	}
}

// MerchantUpdateProfileHandler serves `PUT /api/merchant/profile`.
func MerchantUpdateProfileHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		if caller.RoleType() != "supplier" {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		current, found, err := supplierRow(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("merchant update: load", "error", err)
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
		updates := map[string]any{}

		storeName := ""
		if raw, present := fields["store_name"]; !present || raw == nil {
			failures.add("store_name", "The store name field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("store_name", "The store name field must be a string.")
		} else if len([]rune(text)) > 255 {
			failures.add("store_name", "The store name field must not be greater than 255 characters.")
		} else {
			storeName = text
			updates["store_name"] = text
		}
		_ = storeName

		for _, key := range []string{"address", "bio", "detail_location"} {
			if raw, present := fields[key]; present && raw != nil {
				if text, ok := raw.(string); !ok {
					failures.add(key, "The "+houseAttrName(key)+" field must be a string.")
				} else {
					updates[key] = text
				}
			}
		}

		for _, pair := range []struct {
			key string
			max int
		}{
			{"no_telp", 20},
			{"category", 255},
		} {
			if raw, present := fields[pair.key]; present && raw != nil {
				if text, ok := raw.(string); !ok {
					failures.add(pair.key, "The "+houseAttrName(pair.key)+" field must be a string.")
				} else if len([]rune(text)) > pair.max {
					failures.add(pair.key, "The "+houseAttrName(pair.key)+" field must not be greater than "+
						strconv.Itoa(pair.max)+" characters.")
				} else {
					updates[pair.key] = text
				}
			}
		}

		for _, key := range []string{"latitude", "longitude"} {
			if raw, present := fields[key]; present && raw != nil {
				if text, ok := numericTextOf(raw); ok && isNumericText(text) {
					updates[key] = strings.TrimSpace(text)
				} else {
					failures.add(key, "The "+key+" field must be a number.")
				}
			}
		}

		fotos := requestFilesNamed(r, "foto")
		if len(fotos) > 0 {
			switch fotos[0].ext {
			case "jpg", "jpeg", "png", "webp":
				if fotos[0].sizeBytes() > 2048*1024 {
					failures.add("foto", "The foto field must not be greater than 2048 kilobytes.")
				}
			default:
				failures.add("foto", "The foto field must be a file of type: jpg, jpeg, png, webp.")
			}
		}
		if !failures.empty() {
			writeErrorsEnvelopeOnly(w, failures)
			return
		}

		if len(fotos) > 0 {
			stored, err := storeVaultFile("suppliers", fotos[0].filename, fotos[0].data)
			if err != nil {
				slog.Error("merchant update: foto", "error", err)
				serverError(w)
				return
			}
			if old, ok := current["foto"].(string); ok && old != "" {
				_ = removeVaultFile(old)
			}
			updates["foto"] = stored
		}

		if len(updates) > 0 {
			sets := make([]string, 0, len(updates)+1)
			args := []any{intPtrDeref(current["id"])}
			for _, column := range []string{
				"store_name", "address", "latitude", "longitude", "no_telp",
				"category", "bio", "detail_location", "foto",
			} {
				value, present := updates[column]
				if !present {
					continue
				}
				args = append(args, value)
				placeholder := "$" + strconv.Itoa(len(args))
				if column == "latitude" || column == "longitude" {
					placeholder += "::numeric"
				}
				sets = append(sets, column+" = "+placeholder)
			}
			sets = append(sets, "updated_at = date_trunc('second', now())")
			if _, err := pool.Exec(ctx, `UPDATE suppliers SET `+strings.Join(sets, ", ")+
				` WHERE id = $1`, args...); err != nil {
				slog.Error("merchant update: exec", "error", err)
				serverError(w)
				return
			}
		}

		fresh, _, err := supplierRow(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("merchant update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("status", "success")
		payload.Set("message", "Profile updated successfully")
		payload.Set("data", supplierObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// materialObject renders a hydrated Material with its images.
func materialObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any) (*jsonphp.Object, error) {
	entry := jsonphp.NewObject()
	for _, column := range []string{
		"id", "supplier_id", "name", "description", "price", "unit", "category",
		"stock", "is_available", "image_path", "specifications", "created_at", "updated_at",
	} {
		value := byName[column]
		switch column {
		case "price":
			entry.Set(column, projectDecimalValue(value))
		case "is_available":
			flag := false
			if typed, ok := value.(bool); ok {
				flag = typed
			}
			entry.Set(column, flag)
		case "specifications":
			entry.Set(column, orderedJSONColumn(value))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	materialID := intPtrDeref(byName["id"])
	rows, err := pool.Query(ctx, `SELECT id, material_id, image_path, created_at, updated_at
		FROM material_images WHERE material_id = $1 ORDER BY id`, materialID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	images := make([]any, 0)
	for rows.Next() {
		var (
			id, material                  int64
			imagePath                     *string
			createdAt, updatedAt          any
		)
		if err := rows.Scan(&id, &material, &imagePath, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		image := jsonphp.NewObject()
		image.Set("id", id)
		image.Set("material_id", material)
		image.Set("image_path", nullableString(imagePath))
		image.Set("created_at", projectTimeValue(createdAt))
		image.Set("updated_at", projectTimeValue(updatedAt))
		images = append(images, image)
	}
	entry.Set("images", images)
	return entry, rows.Err()
}

// MerchantMaterialsHandler serves `GET /api/merchant/materials`.
func MerchantMaterialsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		byName, found, err := supplierRow(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("merchant materials: supplier", "error", err)
			serverError(w)
			return
		}
		if !found {
			scopedNotFound(w, `App\Models\Supplier`)
			return
		}

		where := []string{"supplier_id = $1"}
		args := []any{intPtrDeref(byName["id"])}
		if search := r.URL.Query().Get("search"); search != "" {
			args = append(args, "%"+search+"%")
			where = append(where, "name ILIKE $"+strconv.Itoa(len(args)))
		}
		if category := r.URL.Query().Get("category"); category != "" {
			args = append(args, category)
			where = append(where, "category = $"+strconv.Itoa(len(args)))
		}

		rows, err := pool.Query(ctx, `SELECT id, supplier_id, name, description, price::text,
			unit, category, stock, is_available, image_path, specifications::text,
			created_at, updated_at
			FROM materials WHERE `+strings.Join(where, " AND ")+`
			ORDER BY created_at DESC, id ASC`, args...)
		if err != nil {
			slog.Error("merchant materials: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("merchant materials: scan", "error", err)
				serverError(w)
				return
			}
			row := map[string]any{}
			for i, column := range fields {
				row[column] = values[i]
			}
			entry, err := materialObject(ctx, pool, row)
			if err != nil {
				slog.Error("merchant materials: render", "error", err)
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
