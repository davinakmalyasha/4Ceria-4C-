package httpapi

import (
	"context"
	"log/slog"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
)

// FAVORITES — per-user bookmarks over a morph map.
//
//   - GET answers `{data, items}`: `data` groups the stored ids by morph alias
//     (in first-seen order, ints), `items` resolves them into light cards in a
//     FIXED order (house, the seven professional types, material). An empty
//     account answers `{"data":[],"items":[]}` — PHP's empty array, not `{}`.
//   - POST toggle deletes an existing row (200, favorited:false) or checks the
//     target exists (404 "Item not found.") and creates it (201, favorited:true).
//   - POST merge inserts guest rows with insertOrIgnore and answers the index.
//   - DELETE enforces ownership (403 "Unauthorized." — an abort, so the local
//     answer carries a debug trace).

// favoriteTypes maps morph aliases to their tables, in the controller's order.
var favoriteTypes = map[string]string{
	"house": "house", "arsitek": "arsiteks", "kontraktor": "kontraktors",
	"interior": "interior_profiles", "notaris": "notaris_profiles",
	"project_manager": "project_managers", "structural": "structural_engineers",
	"mep": "mep_engineers", "material": "materials",
}

// favoriteTypeOrder is the validation allow-list order (array_keys(TYPES)).
var favoriteTypeOrder = []string{
	"house", "arsitek", "kontraktor", "interior", "notaris",
	"project_manager", "structural", "mep", "material",
}

// favoriteProTypeOrder is PRO_TYPES.
var favoriteProTypeOrder = []string{
	"arsitek", "kontraktor", "interior", "notaris", "project_manager",
	"structural", "mep",
}

// favoritesGrouped is the stored map: type → ids, first-seen key order.
type favoritesGrouped struct {
	order []string
	ids   map[string][]int64
}

// loadFavorites groups a user's rows by morph alias.
func loadFavorites(ctx context.Context, pool *pgxpool.Pool, userID int64) (*favoritesGrouped, error) {
	// MySQL serves this WHERE through the (user_id, favoritable_type,
	// favoritable_id) unique index, so the rows arrive TYPE-ordered; an
	// `ORDER BY id` would invent a different grouping order.
	rows, err := pool.Query(ctx, `SELECT favoritable_type, favoritable_id
		FROM favorites WHERE user_id = $1 ORDER BY favoritable_type, favoritable_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	grouped := &favoritesGrouped{order: make([]string, 0), ids: map[string][]int64{}}
	for rows.Next() {
		var kind string
		var id int64
		if err := rows.Scan(&kind, &id); err != nil {
			return nil, err
		}
		if _, seen := grouped.ids[kind]; !seen {
			grouped.order = append(grouped.order, kind)
		}
		grouped.ids[kind] = append(grouped.ids[kind], id)
	}
	return grouped, rows.Err()
}

// favoriteTrimJoin mirrors trim(implode($glue, array_filter([...])), $cutset).
func favoriteTrimJoin(parts []*string, glue, cutset string) string {
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == nil {
			continue
		}
		text := *part
		if text == "" || text == "0" {
			continue
		}
		values = append(values, text)
	}
	return strings.Trim(strings.Join(values, glue), cutset)
}

// favoriteCard renders one resolved item.
func favoriteCard(id int64, kind, title string, subtitle any, image any, price any) *jsonphp.Object {
	card := jsonphp.NewObject()
	card.Set("id", id)
	card.Set("type", kind)
	card.Set("title", title)
	card.Set("subtitle", subtitle)
	card.Set("image", image)
	card.Set("price", price)
	return card
}

// favoriteHouseCards resolves `house` ids (with their first picture).
func favoriteHouseCards(ctx context.Context, pool *pgxpool.Pool, ids []int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, name, kab_kota, province, price::text
		FROM house WHERE id = ANY($1) ORDER BY id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cards := make([]any, 0)
	for rows.Next() {
		var (
			id                           int64
			name                         string
			kabKota, province, priceText *string
		)
		if err := rows.Scan(&id, &name, &kabKota, &province, &priceText); err != nil {
			return nil, err
		}
		var cover *string
		_ = pool.QueryRow(ctx, `SELECT dir FROM house_pic WHERE id_house = $1 ORDER BY id LIMIT 1`, id).Scan(&cover)
		var image any
		if cover != nil && *cover != "" {
			image = firmAssetURL(ctx, *cover)
		}
		var price any
		if priceText != nil {
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(*priceText), 64); err == nil {
				price = parsed
			}
		}
		cards = append(cards, favoriteCard(id, "house", name,
			favoriteTrimJoin([]*string{kabKota, province}, ", ", ", "), image, price))
	}
	return cards, rows.Err()
}

// favoriteProfileCards resolves one professional type.
func favoriteProfileCards(ctx context.Context, pool *pgxpool.Pool, kind string, ids []int64) ([]any, error) {
	table := favoriteTypes[kind]
	columns := "id, nama, spesialisasi, lokasi, foto"
	if kind == "kontraktor" {
		columns = "id, nama, nama_perusahaan, spesialisasi, alamat AS lokasi, foto"
	}
	rows, err := pool.Query(ctx, `SELECT `+columns+` FROM `+table+` WHERE id = ANY($1) ORDER BY id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cards := make([]any, 0)
	for rows.Next() {
		var (
			id                         int64
			nama                       *string
			namaPerusahaan             *string
			spesialisasi, lokasi, foto *string
		)
		if kind == "kontraktor" {
			if err := rows.Scan(&id, &nama, &namaPerusahaan, &spesialisasi, &lokasi, &foto); err != nil {
				return nil, err
			}
		} else {
			if err := rows.Scan(&id, &nama, &spesialisasi, &lokasi, &foto); err != nil {
				return nil, err
			}
		}

		title := ""
		if nama != nil {
			title = *nama
		}
		if kind == "kontraktor" {
			title = ""
			if namaPerusahaan != nil && *namaPerusahaan != "" {
				title = *namaPerusahaan
			} else if nama != nil {
				title = *nama
			}
		}

		var subtitle any
		if spesialisasi != nil && *spesialisasi != "" && *spesialisasi != "0" {
			subtitle = *spesialisasi
		} else if lokasi != nil {
			subtitle = *lokasi
		}

		var image any
		if foto != nil && *foto != "" {
			image = firmAssetURL(ctx, *foto)
		}
		cards = append(cards, favoriteCard(id, kind, title, subtitle, image, nil))
	}
	return cards, rows.Err()
}

// favoriteMaterialCards resolves `material` ids.
func favoriteMaterialCards(ctx context.Context, pool *pgxpool.Pool, ids []int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, name, category, unit, image_path, price::text
		FROM materials WHERE id = ANY($1) ORDER BY id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cards := make([]any, 0)
	for rows.Next() {
		var (
			id                                   int64
			name                                 string
			category, unit, imagePath, priceText *string
		)
		if err := rows.Scan(&id, &name, &category, &unit, &imagePath, &priceText); err != nil {
			return nil, err
		}
		var image any
		if imagePath != nil && *imagePath != "" {
			image = firmAssetURL(ctx, *imagePath)
		}
		var price any
		if priceText != nil {
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(*priceText), 64); err == nil {
				price = parsed
			}
		}
		cards = append(cards, favoriteCard(id, "material", name,
			favoriteTrimJoin([]*string{category, unit}, " · ", " · "), image, price))
	}
	return cards, rows.Err()
}

// favoritesPayload builds the index answer for one user.
func favoritesPayload(ctx context.Context, pool *pgxpool.Pool, userID int64) (*jsonphp.Object, error) {
	grouped, err := loadFavorites(ctx, pool, userID)
	if err != nil {
		return nil, err
	}

	data := jsonphp.NewObject()
	items := jsonphp.NewObject()
	for _, kind := range grouped.order {
		ids := grouped.ids[kind]
		list := make([]any, 0, len(ids))
		for _, id := range ids {
			list = append(list, id)
		}
		data.Set(kind, list)
	}

	// `items` follows a FIXED order, not the grouping order.
	for _, kind := range append([]string{"house"}, favoriteProTypeOrder...) {
		ids, present := grouped.ids[kind]
		if !present || len(ids) == 0 {
			continue
		}
		var cards []any
		if kind == "house" {
			cards, err = favoriteHouseCards(ctx, pool, ids)
		} else {
			cards, err = favoriteProfileCards(ctx, pool, kind, ids)
		}
		if err != nil {
			return nil, err
		}
		items.Set(kind, cards)
	}
	if ids, present := grouped.ids["material"]; present && len(ids) > 0 {
		cards, err := favoriteMaterialCards(ctx, pool, ids)
		if err != nil {
			return nil, err
		}
		items.Set("material", cards)
	}

	var dataValue any = data
	var itemsValue any = items
	if len(grouped.order) == 0 {
		// PHP's empty array encodes as [] — both keys.
		dataValue = []any{}
		itemsValue = []any{}
	}

	payload := jsonphp.NewObject()
	payload.Set("data", dataValue)
	payload.Set("items", itemsValue)
	return payload, nil
}

// FavoritesIndexHandler serves `GET /api/favorites`.
func FavoritesIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		payload, err := favoritesPayload(r.Context(), pool, caller.UserID())
		if err != nil {
			slog.Error("favorites: index", "error", err)
			serverError(w)
			return
		}
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateFavoriteType enforces the nine-value allow-list.
func validateFavoriteType(fields map[string]any, key string, failures *errorBag) (string, bool) {
	attr := houseAttrName(key)
	raw, present := fields[key]
	if !present || raw == nil {
		failures.add(key, "The "+attr+" field is required.")
		return "", false
	}
	text, ok := raw.(string)
	if !ok {
		failures.add(key, "The selected "+attr+" is invalid.")
		return "", false
	}
	for _, candidate := range favoriteTypeOrder {
		if candidate == text {
			return text, true
		}
	}
	failures.add(key, "The selected "+attr+" is invalid.")
	return "", false
}

// validatePositiveID enforces required|integer|min:1.
func validatePositiveID(fields map[string]any, key string, failures *errorBag) (int64, bool) {
	attr := houseAttrName(key)
	raw, present := fields[key]
	if !present || raw == nil {
		failures.add(key, "The "+attr+" field is required.")
		return 0, false
	}
	text, ok := numericTextOf(raw)
	if !ok || !isIntegerText(text) {
		failures.add(key, "The "+attr+" field must be an integer.")
		return 0, false
	}
	parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
	if err != nil {
		failures.add(key, "The "+attr+" field must be an integer.")
		return 0, false
	}
	if parsed < 1 {
		failures.add(key, "The "+attr+" field must be at least 1.")
		return 0, false
	}
	return parsed, true
}

// ToggleFavoriteHandler serves `POST /api/favorites/toggle`.
func ToggleFavoriteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		kind, _ := validateFavoriteType(fields, "favoritable_type", failures)
		id, _ := validatePositiveID(fields, "favoritable_id", failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var existing int64
		err := pool.QueryRow(ctx, `SELECT id FROM favorites
			WHERE user_id = $1 AND favoritable_type = $2 AND favoritable_id = $3`,
			caller.UserID(), kind, id).Scan(&existing)
		if err == nil {
			if _, err := pool.Exec(ctx, `DELETE FROM favorites WHERE id = $1`, existing); err != nil {
				slog.Error("favorite toggle: delete", "error", err)
				serverError(w)
				return
			}
			payload := jsonphp.NewObject()
			payload.Set("favorited", false)
			payload.Set("type", kind)
			payload.Set("id", id)
			writeJSON(w, http.StatusOK, payload)
			return
		}

		// Refuse orphan references.
		if !existsID(ctx, pool, favoriteTypes[kind], id) {
			message(w, http.StatusNotFound, "Item not found.")
			return
		}

		if _, err := pool.Exec(ctx, `INSERT INTO favorites
			(user_id, favoritable_type, favoritable_id, created_at, updated_at)
			VALUES ($1, $2, $3, date_trunc('second', now()), date_trunc('second', now()))`,
			caller.UserID(), kind, id); err != nil {
			slog.Error("favorite toggle: insert", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("favorited", true)
		payload.Set("type", kind)
		payload.Set("id", id)
		writeJSON(w, http.StatusCreated, payload)
	}
}

// MergeFavoritesHandler serves `POST /api/favorites/merge`.
func MergeFavoritesHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		items := make([]struct {
			kind string
			id   int64
		}, 0)
		if raw, present := fields["items"]; !present || raw == nil {
			failures.add("items", "The items field is required.")
		} else if list, ok := raw.([]any); !ok {
			failures.add("items", "The items field must be an array.")
		} else {
			if len(list) > 500 {
				failures.add("items", "The items field must not have more than 500 items.")
			}
			for index, item := range list {
				object, ok := item.(map[string]any)
				if !ok {
					object = map[string]any{}
				}
				prefix := "items." + strconv.Itoa(index)
				kind := ""
				if rawKind, present := object["type"]; !present || rawKind == nil {
					failures.add(prefix+".type", "The "+prefix+".type field is required.")
				} else if text, ok := rawKind.(string); !ok {
					failures.add(prefix+".type", "The selected "+prefix+".type is invalid.")
				} else {
					valid := false
					for _, candidate := range favoriteTypeOrder {
						if candidate == text {
							valid = true
							break
						}
					}
					if !valid {
						failures.add(prefix+".type", "The selected "+prefix+".type is invalid.")
					} else {
						kind = text
					}
				}
				id := int64(0)
				if rawID, present := object["id"]; !present || rawID == nil {
					failures.add(prefix+".id", "The "+prefix+".id field is required.")
				} else if text, ok := numericTextOf(rawID); !ok || !isIntegerText(text) {
					failures.add(prefix+".id", "The "+prefix+".id field must be an integer.")
				} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
					failures.add(prefix+".id", "The "+prefix+".id field must be an integer.")
				} else if parsed < 1 {
					failures.add(prefix+".id", "The "+prefix+".id field must be at least 1.")
				} else {
					id = parsed
				}
				items = append(items, struct {
					kind string
					id   int64
				}{kind, id})
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		for _, item := range items {
			if item.kind == "" || item.id == 0 {
				continue
			}
			if _, err := pool.Exec(ctx, `INSERT INTO favorites
				(user_id, favoritable_type, favoritable_id, created_at, updated_at)
				VALUES ($1, $2, $3, date_trunc('second', now()), date_trunc('second', now()))
				ON CONFLICT DO NOTHING`, caller.UserID(), item.kind, item.id); err != nil {
				slog.Error("favorite merge: insert", "error", err)
				serverError(w)
				return
			}
		}

		payload, err := favoritesPayload(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("favorite merge: index", "error", err)
			serverError(w)
			return
		}
		writeJSON(w, http.StatusOK, payload)
	}
}

// DestroyFavoriteHandler serves `DELETE /api/favorites/{favorite}`.
func DestroyFavoriteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("favorite")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\Favorite`, raw)
			return
		}

		var ownerID int64
		if err := pool.QueryRow(ctx, `SELECT user_id FROM favorites WHERE id = $1`, id).Scan(&ownerID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Favorite`, raw)
				return
			}
			slog.Error("favorite destroy: load", "error", err)
			serverError(w)
			return
		}
		if ownerID != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM favorites WHERE id = $1`, id); err != nil {
			slog.Error("favorite destroy: delete", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Removed from favorites.")
	}
}
