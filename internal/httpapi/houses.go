package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE HOUSES SURFACE.
//
// `GET /api/houses` lists with filters (search, city, price band, bedrooms,
// bathrooms, min area), sorting and per-user scoping; `GET
// /api/houses/{house}` shows one. Both answer `HouseResource`, whose shape
// is the contract:
//
//   - `price` is the decimal string ("1200000000.00"); width/length are the
//     stored TEXT as-is; br/ba/floors/views are numbers.
//   - `housePic` is every `house_pic` row (all columns, Carbon dates);
//     `roomList` every `rooms` row with its `pics` as [{id, dir}].
//   - `owner` is `{id, name, email?, phones[], role_type}`: email only for
//     the owner or an admin, `phones` (contact strings) for any signed-in
//     caller, `[]` for a guest. Never bank details.
//   - The envelope is `PaginatedResourceResponse`: data, four-way links,
//     eight-key meta — the same builders the directories use.
//
// MySQL-isms the port preserves deliberately: the six `LIKE` filters are
// case-insensitive (ILIKE), the `city` equality folds case (a ci `=`), and
// `width`/`length` coerce like MySQL (leading number or 0) because the
// columns are TEXT.

// houseColumns is the SELECT list, in the resource's read order.
var houseColumns = []string{
	"id", "name", "price", "house_desc", "width", "length", "floors",
	"br", "ba", "street_name", "kelurahan", "kecamatan", "kab_kota",
	"province", "postal_code", "coordinate", "id_user", "views",
	"created_at", "updated_at",
}

// HousesHandler serves `GET /api/houses`.
func HousesHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()

		caller, _ := CallerFrom(r.Context())
		var callerID int64
		if caller != nil {
			callerID = caller.UserID()
		}

		conditions := []string{"h.is_suspended = false"}
		args := []any{}
		add := func(condition string, value any) {
			args = append(args, value)
			conditions = append(conditions, condition+" $"+strconv.Itoa(len(args)))
		}

		// `?mine=true` scopes to the caller and skips the cache. In practice
		// this never scopes: these routes carry no `auth:sanctum`
		// middleware, so Laravel's `Auth::check()` (default `web` guard)
		// is always false here and the bearer token is ignored — the
		// oracle answers everybody's rows to everybody. The branch stays
		// so a future middleware change behaves like the controller.
		if parseBoolean(query.Get("mine")) && caller != nil {
			add("h.id_user =", callerID)
		}

		if search := query.Get("search"); search != "" {
			like := "%" + search + "%"
			args = append(args, like, like, like, like, like, like)
			n := len(args) - 5
			conditions = append(conditions,
				"(h.name ILIKE $"+strconv.Itoa(n)+
					" OR h.house_desc ILIKE $"+strconv.Itoa(n+1)+
					" OR h.kecamatan ILIKE $"+strconv.Itoa(n+2)+
					" OR h.kelurahan ILIKE $"+strconv.Itoa(n+3)+
					" OR h.kab_kota ILIKE $"+strconv.Itoa(n+4)+
					" OR h.street_name ILIKE $"+strconv.Itoa(n+5)+")")
		}

		if city := query.Get("city"); city != "" {
			args = append(args, strings.ToLower(city))
			conditions = append(conditions, "lower(h.kab_kota) = $"+strconv.Itoa(len(args)))
		}

		if raw := query.Get("price_min"); raw != "" {
			add("h.price >=", phpFloat(raw))
		}
		if raw := query.Get("price_max"); raw != "" {
			add("h.price <=", phpFloat(raw))
		}
		if raw := query.Get("bedrooms"); raw != "" && isPHPNumeric(raw) {
			add("h.br >=", mustInt(raw))
		}
		if raw := query.Get("bathrooms"); raw != "" && isPHPNumeric(raw) {
			add("h.ba >=", mustInt(raw))
		}
		if raw := query.Get("min_area"); raw != "" && isPHPNumeric(raw) {
			// TEXT dimensions coerce like MySQL: the leading number, or 0.
			// The regex guard keeps garbage from ever reaching ::float8,
			// which would raise where MySQL merely reads 0.
			area := `(CASE WHEN h.width ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN h.width::double precision ELSE 0 END)` +
				` * (CASE WHEN h.length ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN h.length::double precision ELSE 0 END)`
			add("("+area+") >=", phpFloat(raw))
		}

		order := "h.created_at DESC"
		switch query.Get("sort") {
		case "price_asc":
			order = "h.price ASC"
		case "price_desc":
			order = "h.price DESC"
		}

		perPage := pageSize(r, 12, 50)
		currentPage := pageParam(r)
		where := " WHERE " + strings.Join(conditions, " AND ")

		var total int
		if err := pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM house h`+where, args...,
		).Scan(&total); err != nil {
			slog.Error("houses: count", "error", err)
			serverError(w)
			return
		}

		offset := (currentPage - 1) * perPage
		limitArgs := append(append([]any{}, args...), perPage, offset)
		rows, err := pool.Query(r.Context(), `
			SELECT `+houseSelect()+` FROM house h`+where+`
			 ORDER BY `+order+` LIMIT $`+strconv.Itoa(len(args)+1)+` OFFSET $`+strconv.Itoa(len(args)+2),
			limitArgs...,
		)
		if err != nil {
			slog.Error("houses: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		fields := fieldNames(rows)
		items := make([]any, 0, perPage)

		for rows.Next() {
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("houses: scan", "error", err)
				serverError(w)
				return
			}

			row, err := houseResource(r.Context(), pool, fields, values, callerID, caller != nil && caller.IsAdmin())
			if err != nil {
				slog.Error("houses: row", "error", err)
				serverError(w)
				return
			}

			items = append(items, row)
		}
		if err := rows.Err(); err != nil {
			slog.Error("houses: rows", "error", err)
			serverError(w)
			return
		}

		baseURL := requestBaseURL(r)

		payload := jsonphp.NewObject()
		payload.Set("data", items)
		payload.Set("links", pageLinksSummary(baseURL, "", currentPage, lastPage(total, perPage)))
		payload.Set("meta", directoryMeta(total, perPage, currentPage, basePathOf(baseURL), "", items))

		writeJSONPublic(w, r, http.StatusOK, payload, 60)
	}
}

// HouseHandler serves `GET /api/houses/{house}`.
//
// A view is counted once per viewer per house per six hours: bots otherwise
// write on the hottest public page on every request. The response carries
// the incremented count.
func HouseHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.PathValue("house")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}

		houseID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\House`, raw)
			return
		}

		caller, _ := CallerFrom(r.Context())
		var callerID int64
		viewerIsAdmin := false
		viewerKey := viewerIP(r)
		if caller != nil {
			callerID = caller.UserID()
			viewerIsAdmin = caller.IsAdmin()
			viewerKey = "user:" + strconv.FormatInt(callerID, 10)
		}

		throttleKey := "house_view:" + strconv.FormatInt(houseID, 10) + ":" + viewerKey
		if viewThrottle.allow(throttleKey, 6*time.Hour) {
			if _, err := pool.Exec(r.Context(),
				`UPDATE house SET views = views + 1, updated_at = date_trunc('second', now()) WHERE id = $1`, houseID,
			); err != nil {
				slog.Error("houses: view", "error", err)
				serverError(w)
				return
			}
		}

		fields, values, err := houseRow(r.Context(), pool, houseID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\House`, raw)
				return
			}
			slog.Error("houses: show", "error", err)
			serverError(w)
			return
		}

		row, err := houseResource(r.Context(), pool, fields, values, callerID, viewerIsAdmin)
		if err != nil {
			slog.Error("houses: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", row)

		writeJSON(w, http.StatusOK, payload)
	}
}

// houseRow reads one house with the list columns.
func houseRow(ctx context.Context, pool *pgxpool.Pool, houseID int64) ([]string, []any, error) {
	rows, err := pool.Query(ctx, `SELECT `+houseSelect()+` FROM house h WHERE h.id = $1`, houseID)
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

// houseResource builds the `HouseResource` object with the owner loaded —
// the list and show endpoints.
func houseResource(ctx context.Context, pool *pgxpool.Pool, fields []string, values []any, viewerID int64, viewerIsAdmin bool) (*jsonphp.Object, error) {
	return houseResourceWithOwner(ctx, pool, fields, values, viewerID, viewerIsAdmin, true)
}

// houseResourceWithOwner builds the `HouseResource` object: fixed keys, in
// order, with `whenLoaded` semantics. `owner` appears ONLY when the
// controller loaded `user` — store/update/room-store load just
// `housePic` and `room`.
func houseResourceWithOwner(ctx context.Context, pool *pgxpool.Pool, fields []string, values []any, viewerID int64, viewerIsAdmin, withOwner bool) (*jsonphp.Object, error) {
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	id, _ := byName["id"].(int64)
	ownerID, _ := byName["id_user"].(int64)

	row := jsonphp.NewObject()
	row.Set("id", id)
	setIfPresent(row, "name", byName["name"])
	setIfPresent(row, "price", decimalText(byName["price"]))
	setIfPresent(row, "description", byName["house_desc"])

	dimensions := jsonphp.NewObject()
	dimensions.Set("width", textOf(byName["width"]))
	dimensions.Set("length", textOf(byName["length"]))
	dimensions.Set("floors", intOf(byName["floors"]))
	row.Set("dimensions", dimensions)

	rooms := jsonphp.NewObject()
	rooms.Set("bedrooms", intOf(byName["br"]))
	rooms.Set("bathrooms", intOf(byName["ba"]))
	row.Set("rooms", rooms)

	address := jsonphp.NewObject()
	address.Set("street", textOf(byName["street_name"]))
	address.Set("kelurahan", textOf(byName["kelurahan"]))
	address.Set("kecamatan", textOf(byName["kecamatan"]))
	address.Set("city", textOf(byName["kab_kota"]))
	address.Set("province", textOf(byName["province"]))
	address.Set("postal_code", textOf(byName["postal_code"]))
	address.Set("coordinates", textOf(byName["coordinate"]))
	row.Set("address", address)

	row.Set("coordinate", textOf(byName["coordinate"]))
	row.Set("user_id", ownerID)
	row.Set("views", intOf(byName["views"]))
	row.Set("created_at", carbonTime(byName["created_at"]))
	row.Set("updated_at", carbonTime(byName["updated_at"]))

	pics, err := housePics(ctx, pool, id)
	if err != nil {
		return nil, err
	}
	row.Set("housePic", pics)

	if withOwner {
		owner, err := houseOwner(ctx, pool, ownerID, viewerID, viewerIsAdmin)
		if err != nil {
			return nil, err
		}
		if owner != nil {
			row.Set("owner", owner)
		}
	}

	roomList, err := houseRooms(ctx, pool, id)
	if err != nil {
		return nil, err
	}
	row.Set("roomList", roomList)

	return row, nil
}

// setIfPresent sets a raw value unless it is nil — the `attribute()`
// presence rule. Empty strings stay: only null is filtered.
func setIfPresent(row *jsonphp.Object, key string, value any) {
	if value == nil {
		return
	}
	row.Set(key, jsonVal(value))
}

// textOf renders a nullable text column or null.
func textOf(value any) any {
	if value == nil {
		return nil
	}
	if s, ok := value.(string); ok {
		return s
	}
	return jsonVal(value)
}

// intOf renders a nullable integer column or 0.
func intOf(value any) any {
	switch typed := value.(type) {
	case nil:
		return int64(0)
	case int64:
		return typed
	case int32:
		return int64(typed)
	case int:
		return int64(typed)
	default:
		return int64(0)
	}
}

// decimalText renders a decimal column exactly as Eloquent does: the
// stored text with its scale ("1200000000.00", never a float).
func decimalText(value any) any {
	if value == nil {
		return nil
	}
	if text, ok := value.(string); ok {
		return text
	}
	return jsonVal(value)
}

// carbonTime renders a timestamp the way Eloquent's date cast does.
func carbonTime(value any) any {
	if value == nil {
		return nil
	}
	if typed, ok := value.(time.Time); ok {
		return carbon(&typed)
	}
	return jsonVal(value)
}

// housePics lists a house's pictures: every column, Carbon dates.
func housePics(ctx context.Context, pool *pgxpool.Pool, houseID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, file_name, dir, size, id_house, created_at, updated_at
		  FROM house_pic WHERE id_house = $1 ORDER BY id
	`, houseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		var id, house int64
		var fileName, dir, size *string
		var createdAt, updatedAt *time.Time
		if err := rows.Scan(&id, &fileName, &dir, &size, &house, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item := jsonphp.NewObject()
		item.Set("id", id)
		item.Set("file_name", nullableString(fileName))
		item.Set("dir", nullableString(dir))
		item.Set("size", nullableString(size))
		item.Set("id_house", house)
		item.Set("created_at", carbon(createdAt))
		item.Set("updated_at", carbon(updatedAt))
		list = append(list, item)
	}

	return list, rows.Err()
}

// houseOwner builds the minimal public slice of the listing owner:
// id, name, email for the owner or an admin, contact strings for any
// signed-in caller, always the role.
//
// In practice the viewer is always a guest here (see the `mine` note
// above): email is null and phones are []. The branches stay so the
// shape matches the resource for every viewer.
func houseOwner(ctx context.Context, pool *pgxpool.Pool, ownerID, viewerID int64, viewerIsAdmin bool) (*jsonphp.Object, error) {
	var id int64
	var name, role string
	var email *string
	if err := pool.QueryRow(ctx,
		`SELECT id, name, email, COALESCE(role_type::text, '') FROM users WHERE id = $1`, ownerID,
	).Scan(&id, &name, &email, &role); err != nil {
		return nil, err
	}

	owner := jsonphp.NewObject()
	owner.Set("id", id)
	owner.Set("name", name)

	if (viewerID != 0 && viewerID == id) || viewerIsAdmin {
		owner.Set("email", nullableString(email))
	} else {
		owner.Set("email", nil)
	}

	phones := make([]any, 0)
	if viewerID != 0 {
		rows, err := pool.Query(ctx,
			`SELECT contact FROM phone_user WHERE id_user = $1 ORDER BY id`, id)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var contact *string
			if err := rows.Scan(&contact); err != nil {
				rows.Close()
				return nil, err
			}
			phones = append(phones, nullableString(contact))
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	owner.Set("phones", phones)
	owner.Set("role_type", role)

	return owner, nil
}

// houseRooms lists a house's rooms with their picture stubs.
func houseRooms(ctx context.Context, pool *pgxpool.Pool, houseID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, name, type, width, length, "desc"
		  FROM rooms WHERE id_house = $1 ORDER BY id
	`, houseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		var id int64
		var name, roomType, width, length, desc *string
		if err := rows.Scan(&id, &name, &roomType, &width, &length, &desc); err != nil {
			return nil, err
		}

		pics, err := roomPics(ctx, pool, id)
		if err != nil {
			return nil, err
		}

		room := jsonphp.NewObject()
		room.Set("id", id)
		room.Set("name", nullableString(name))
		room.Set("type", nullableString(roomType))
		room.Set("width", nullableString(width))
		room.Set("length", nullableString(length))
		room.Set("description", nullableString(desc))
		room.Set("pics", pics)
		list = append(list, room)
	}

	return list, rows.Err()
}

// roomPics lists a room's picture stubs: id and dir only — the resource
// names exactly these two keys.
func roomPics(ctx context.Context, pool *pgxpool.Pool, roomID int64) ([]any, error) {
	rows, err := pool.Query(ctx,
		`SELECT id, dir FROM rooms_pic WHERE id_room = $1 ORDER BY id`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		var id int64
		var dir *string
		if err := rows.Scan(&id, &dir); err != nil {
			return nil, err
		}
		item := jsonphp.NewObject()
		item.Set("id", id)
		item.Set("dir", nullableString(dir))
		list = append(list, item)
	}

	return list, rows.Err()
}

// houseSelect lists the house columns qualified for the list query.
func houseSelect() string {
	qualified := make([]string, 0, len(houseColumns))
	for _, column := range houseColumns {
		qualified = append(qualified, "h."+column)
	}
	return strings.Join(qualified, ", ")
}

// houseNumberRe matches MySQL's leading-number coercion: an optional sign,
// digits with an optional fraction. `12abc` reads 12; `abc` reads nothing.
var houseNumberRe = regexp.MustCompile(`^[+-]?[0-9]*\.?[0-9]+`)

// parseBoolean mirrors `$request->boolean()`: 1/true/on/yes, case-insensitive.
func parseBoolean(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "on", "yes":
		return true
	default:
		return false
	}
}

// phpFloat mirrors `(float)` on request input: a leading numeric prefix,
// or 0 when there is none.
func phpFloat(raw string) float64 {
	trimmed := strings.TrimSpace(raw)
	match := houseNumberRe.FindString(trimmed)
	if match == "" {
		return 0
	}
	value, err := strconv.ParseFloat(match, 64)
	if err != nil {
		return 0
	}
	return value
}

// isPHPNumeric mirrors `is_numeric()` for request input: optional sign,
// digits with an optional fraction, optional exponent — no hex, no
// thousands separators, surrounding whitespace tolerated.
var phpNumericRe = regexp.MustCompile(`^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$`)

// isPHPNumeric mirrors `is_numeric()` for request input: optional sign,
// digits with an optional fraction, optional exponent — no hex, no
// thousands separators, and no surrounding whitespace (PHP's check has
// none either; the casts trim, the check does not).
func isPHPNumeric(raw string) bool {
	return phpNumericRe.MatchString(raw)
}

// mustInt mirrors `(int)` on input already known numeric.
func mustInt(raw string) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(raw), 64)
		return int(parsed)
	}
	return value
}

// viewThrottle remembers one view per viewer per house for six hours, so
// the hottest public page does not write on every hit (bots included).
// A process-local map: a second replica may count the same viewer once
// more, which is a counter, not money.
var viewThrottle = newViewGate()

// viewerIP identifies the viewer the way Laravel's $request->ip() does:
// the first forwarded address when present, else the peer host without
// its ephemeral port. The port MUST NOT be part of the key: every HTTP
// client opens a fresh ephemeral port per connection, so including it
// would make the six-hour throttle never throttle.
func viewerIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		if first, _, _ := strings.Cut(forwarded, ","); first != "" {
			return strings.TrimSpace(first)
		}
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i != -1 {
		host = host[:i]
	}
	return strings.Trim(host, "[]")
}

// viewGate is a TTL set with lazy expiry.
type viewGate struct {
	sync.Mutex
	hits map[string]time.Time
}

func newViewGate() *viewGate {
	return &viewGate{hits: map[string]time.Time{}}
}

// allow reports whether the key may act, recording it for the window.
func (v *viewGate) allow(key string, window time.Duration) bool {
	now := time.Now()

	v.Lock()
	defer v.Unlock()

	if at, ok := v.hits[key]; ok && now.Sub(at) < window {
		return false
	}

	v.hits[key] = now

	for stored, at := range v.hits {
		if now.Sub(at) > window {
			delete(v.hits, stored)
		}
	}

	return true
}
