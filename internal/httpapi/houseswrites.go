package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// HOUSE WRITES — create, update, delete, add a room, and the Q&A pair.
//
// The oracle fixes several behaviours that the port must copy exactly:
//   - `lat`/`lng` are REQUEST fields folded into `coordinate`; they are not
//     columns, so they must never reach the insert/update (the oracle threw
//     MassAssignmentException on every create before this was fixed).
//   - the created/updated answer is built from a REFRESHED row: DB defaults
//     (`views`) and the stored decimal/varchar shapes appear, and only the
//     relations the controller loaded (`housePic`, `room`) are present —
//     NO `owner` on these endpoints (unlike list/show).
//   - `price` has every '.' stripped before storage (the legacy client sends
//     thousands separators); `coordinate` is "<lat>, <lng>" string
//     concatenation.
//   - store answers 201 (Laravel's ResourceResponse sees `wasRecentlyCreated`),
//     update and room-store answer 200.

// houseAttrName renders Laravel's attribute label: top-level keys become
// spaces; nested paths keep their raw form.
func houseAttrName(key string) string {
	if strings.Contains(key, ".") {
		return key
	}
	return strings.ReplaceAll(key, "_", " ")
}

// houseField validates one top-level field. It returns the raw text of a
// numeric value (or the string itself).
func houseField(fields map[string]any, key string, required bool, strMax int, numeric bool,
	min *float64, maxDigits int, failures *errorBag) (string, bool) {
	attr := houseAttrName(key)
	raw, present := fields[key]

	if !present || raw == nil || (func() bool {
		text, ok := raw.(string)
		return ok && strings.TrimSpace(text) == ""
	}()) {
		if required {
			failures.add(key, "The "+attr+" field is required.")
		}
		return "", false
	}

	if numeric {
		text, ok := numericTextOf(raw)
		if !ok || !isNumericText(text) {
			failures.add(key, "The "+attr+" field must be a number.")
			return "", false
		}
		if maxDigits > 0 {
			digits := 0
			for _, char := range text {
				if char >= '0' && char <= '9' {
					digits++
				}
			}
			if digits > maxDigits {
				failures.add(key, "The "+attr+" field must not have more than "+strconv.Itoa(maxDigits)+" digits.")
			}
		}
		if min != nil {
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil && parsed < *min {
				failures.add(key, "The "+attr+" field must be at least "+jsonphp.FormatFloat(*min, 64)+".")
			}
		}
		return strings.TrimSpace(text), true
	}

	text, ok := raw.(string)
	if !ok {
		failures.add(key, "The "+attr+" field must be a string.")
		return "", false
	}
	if strMax > 0 && len([]rune(text)) > strMax {
		failures.add(key, "The "+attr+" field must not be greater than "+strconv.Itoa(strMax)+" characters.")
	}
	return text, true
}

// houseMin returns a pointer to a float (helper for the rule table).
func houseMin(value float64) *float64 { return &value }

// houseImageFailures applies image|mimes:jpeg,png,jpg|max:2048 for one file.
func houseImageFailures(upload *galleryUpload, key string, failures *errorBag) {
	attr := houseAttrName(key)
	if !upload.isImage {
		failures.add(key, "The "+attr+" field must be an image.")
	}
	switch upload.ext {
	case "jpeg", "png", "jpg":
		if upload.sizeBytes() > 2048*1024 {
			failures.add(key, "The "+attr+" field must not be greater than 2048 kilobytes.")
		}
	default:
		failures.add(key, "The "+attr+" field must be a file of type: jpeg, png, jpg.")
	}
}

// houseRoomInput is one validated room.
type houseRoomInput struct {
	id     *int64
	name   string
	typ    string
	width  string
	length string
	desc   string
	pics   []*galleryUpload
}

// houseStoreInput is the validated create payload.
type houseStoreInput struct {
	name, price, houseDesc           string
	width, length, ba, br, floors    string
	street, kelurahan, kecamatan     string
	kabKota, province, postalCode    string
	lat, lng                         string
	rooms                            []houseRoomInput
	housePics                        []*galleryUpload
}

// validateStoreHouse mirrors StoreHouseRequest.
func validateStoreHouse(r *http.Request, fields map[string]any, failures *errorBag) houseStoreInput {
	var in houseStoreInput

	in.name, _ = houseField(fields, "name", true, 255, false, nil, 0, failures)
	in.price, _ = houseField(fields, "price", true, 0, true, houseMin(0), 0, failures)
	in.houseDesc, _ = houseField(fields, "house_desc", true, 0, false, nil, 0, failures)
	in.width, _ = houseField(fields, "width", true, 0, true, houseMin(0), 4, failures)
	in.length, _ = houseField(fields, "length", true, 0, true, houseMin(0), 4, failures)
	in.ba, _ = houseField(fields, "ba", true, 0, true, houseMin(0), 2, failures)
	in.br, _ = houseField(fields, "br", true, 0, true, houseMin(0), 2, failures)
	in.floors, _ = houseField(fields, "floors", true, 0, true, houseMin(1), 2, failures)
	in.street, _ = houseField(fields, "street_name", true, 255, false, nil, 0, failures)
	in.kelurahan, _ = houseField(fields, "kelurahan", true, 255, false, nil, 0, failures)
	in.kecamatan, _ = houseField(fields, "kecamatan", true, 255, false, nil, 0, failures)
	in.kabKota, _ = houseField(fields, "kab_kota", true, 255, false, nil, 0, failures)
	in.province, _ = houseField(fields, "province", true, 255, false, nil, 0, failures)
	in.postalCode, _ = houseField(fields, "postal_code", true, 0, true, nil, 0, failures)
	in.lat, _ = houseField(fields, "lat", true, 0, true, nil, 0, failures)
	in.lng, _ = houseField(fields, "lng", true, 0, true, nil, 0, failures)

	in.housePics = requestFilesNamed(r, "house_pic")
	for index, upload := range in.housePics {
		houseImageFailures(upload, "house_pic."+strconv.Itoa(index), failures)
	}

	in.rooms = collectRoomInputs(r, fields, failures, false)
	return in
}

var roomBracketKey = regexp.MustCompile(`^rooms\[(\d+)\]\[([a-z_]+)\]$`)

// collectRoomInputs reads rooms from a JSON array or from multipart bracket
// keys, validating each line. `update` switches on the UpdateHouseRequest
// rules (optional id, required_with for the rest).
func collectRoomInputs(r *http.Request, fields map[string]any, failures *errorBag, update bool) []houseRoomInput {
	rooms := make([]map[string]any, 0)
	if raw, present := fields["rooms"]; present && raw != nil {
		if list, ok := raw.([]any); ok {
			for _, item := range list {
				if object, ok := item.(map[string]any); ok {
					rooms = append(rooms, object)
				} else {
					rooms = append(rooms, map[string]any{})
				}
			}
		} else {
			failures.add("rooms", "The rooms field must be an array.")
			return nil
		}
	} else {
		grouped := map[int]map[string]any{}
		indexes := make([]int, 0)
		for key, value := range fields {
			match := roomBracketKey.FindStringSubmatch(key)
			if match == nil {
				continue
			}
			index, _ := strconv.Atoi(match[1])
			if _, seen := grouped[index]; !seen {
				grouped[index] = map[string]any{}
				indexes = append(indexes, index)
			}
			grouped[index][match[2]] = value
		}
		for i := 0; i < len(indexes); i++ {
			for j := i + 1; j < len(indexes); j++ {
				if indexes[j] < indexes[i] {
					indexes[i], indexes[j] = indexes[j], indexes[i]
				}
			}
		}
		for _, index := range indexes {
			rooms = append(rooms, grouped[index])
		}
	}

	out := make([]houseRoomInput, 0, len(rooms))
	for index, room := range rooms {
		prefix := "rooms." + strconv.Itoa(index)
		var in houseRoomInput

		if update {
			if raw, present := room["id"]; present && raw != nil {
				if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
					parsed, _ := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
					in.id = &parsed
				} else {
					failures.add(prefix+".id", "The selected "+prefix+".id is invalid.")
				}
			}
		}

		nameKey := prefix + ".name"
		if raw, present := room["name"]; !present || raw == nil || raw == "" {
			if update {
				failures.add(nameKey, "The "+nameKey+" field is required when rooms is present.")
			} else {
				failures.add(nameKey, "The "+nameKey+" field is required.")
			}
		} else if text, ok := raw.(string); !ok {
			failures.add(nameKey, "The "+nameKey+" field must be a string.")
		} else if len([]rune(text)) > 255 {
			failures.add(nameKey, "The "+nameKey+" field must not be greater than 255 characters.")
		} else {
			in.name = text
		}

		typeKey := prefix + ".type"
		if raw, present := room["type"]; !present || raw == nil || raw == "" {
			if update {
				failures.add(typeKey, "The "+typeKey+" field is required when rooms is present.")
			} else {
				failures.add(typeKey, "The "+typeKey+" field is required.")
			}
		} else if text, ok := raw.(string); !ok {
			failures.add(typeKey, "The "+typeKey+" field must be a string.")
		} else if text != "room" && text != "bedroom" && text != "bathroom" && text != "others" {
			failures.add(typeKey, "The selected "+typeKey+" is invalid.")
		} else {
			in.typ = text
		}

		for _, pair := range []struct {
			key  string
			dest *string
		}{
			{"width", &in.width},
			{"length", &in.length},
		} {
			field := prefix + "." + pair.key
			if raw, present := room[pair.key]; !present || raw == nil || raw == "" {
				if update {
					failures.add(field, "The "+field+" field is required when rooms is present.")
				} else {
					failures.add(field, "The "+field+" field is required.")
				}
				continue
			}
			text, ok := numericTextOf(room[pair.key])
			if !ok || !isNumericText(text) {
				failures.add(field, "The "+field+" field must be a number.")
				continue
			}
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil && parsed < 0 {
				failures.add(field, "The "+field+" field must be at least 0.")
			}
			*pair.dest = strings.TrimSpace(text)
		}

		if raw, present := room["desc"]; present && raw != nil {
			text, ok := raw.(string)
			if !ok {
				failures.add(prefix+".desc", "The "+prefix+".desc field must be a string.")
			} else {
				in.desc = text
			}
		}

		in.pics = roomUploads(r, index)
		for picIndex, upload := range in.pics {
			houseImageFailures(upload, prefix+".pics."+strconv.Itoa(picIndex), failures)
		}

		out = append(out, in)
	}
	return out
}

// roomUploads reads `rooms[i][pics][]` from the multipart form.
func roomUploads(r *http.Request, index int) []*galleryUpload {
	if r.MultipartForm == nil || r.MultipartForm.File == nil {
		return nil
	}
	base := "rooms[" + strconv.Itoa(index) + "][pics]"
	out := make([]*galleryUpload, 0)
	for _, key := range []string{base + "[]", base} {
		for _, header := range r.MultipartForm.File[key] {
			if upload, err := readGalleryFile(header); err == nil {
				out = append(out, upload)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return out
}

// houseIdList reads an id array from JSON or `name[]` bracket keys.
func houseIdList(fields map[string]any, name string) []int64 {
	out := make([]int64, 0)
	if raw, present := fields[name]; present && raw != nil {
		if list, ok := raw.([]any); ok {
			for _, item := range list {
				if text, ok := numericTextOf(item); ok && isIntegerText(text) {
					if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
						out = append(out, parsed)
					}
				}
			}
		}
	}
	for key, value := range fields {
		if !strings.HasPrefix(key, name+"[") {
			continue
		}
		if text, ok := numericTextOf(value); ok && isIntegerText(text) {
			if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
				out = append(out, parsed)
			}
		}
	}
	return out
}

// ensureProvince is Provinces::firstOrCreate(['name' => $name]).
func ensureProvince(ctx context.Context, pool *pgxpool.Pool, name string) (int64, error) {
	var id int64
	if err := pool.QueryRow(ctx, `SELECT id FROM provinces WHERE name = $1 LIMIT 1`, name).Scan(&id); err == nil {
		return id, nil
	}
	if err := pool.QueryRow(ctx, `INSERT INTO provinces (name) VALUES ($1) RETURNING id`, name).Scan(&id); err != nil {
		return 0, err
	}
	return id, nil
}

// ensureRegion is Regions::firstOrCreate(['name' => …, 'id_province' => …]).
func ensureRegion(ctx context.Context, pool *pgxpool.Pool, name string, provinceID int64) error {
	var id int64
	if err := pool.QueryRow(ctx, `SELECT id FROM regions WHERE name = $1 AND id_province = $2 LIMIT 1`,
		name, provinceID).Scan(&id); err == nil {
		return nil
	}
	_, err := pool.Exec(ctx, `INSERT INTO regions (name, id_province) VALUES ($1, $2)`, name, provinceID)
	return err
}

// houseFailure500 is the controller's catch-all answer.
func houseFailure500(w http.ResponseWriter) {
	message(w, http.StatusInternalServerError, "Gagal menyimpan properti. Silakan coba lagi.")
}

// houseWriteGate enforces ownership for update/destroy/rooms.
func houseWriteGate(w http.ResponseWriter, idUser, callerID int64) bool {
	if idUser != callerID {
		message(w, http.StatusForbidden, "Unauthorized action. You do not own this house.")
		return false
	}
	return true
}

// insertHousePics stores uploads and writes `house_pic` rows.
func insertHousePics(ctx context.Context, pool *pgxpool.Pool, uploads []*galleryUpload,
	folder string, houseID int64) error {
	for _, upload := range uploads {
		stored, err := storeVaultFile(folder, upload.filename, upload.data)
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, `INSERT INTO house_pic
			(file_name, dir, size, id_house, created_at, updated_at)
			VALUES ($1, $2, $3, $4, date_trunc('second', now()), date_trunc('second', now()))`,
			upload.filename, stored, strconv.Itoa(len(upload.data)), houseID); err != nil {
			return err
		}
	}
	return nil
}

// insertRoomPics stores room uploads and writes `rooms_pic` rows.
func insertRoomPics(ctx context.Context, pool *pgxpool.Pool, uploads []*galleryUpload,
	folder string, roomID int64) error {
	for _, upload := range uploads {
		stored, err := storeVaultFile(folder, upload.filename, upload.data)
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, `INSERT INTO rooms_pic
			(file_name, dir, size, id_room, created_at, updated_at)
			VALUES ($1, $2, $3, $4, date_trunc('second', now()), date_trunc('second', now()))`,
			upload.filename, stored, strconv.Itoa(len(upload.data)), roomID); err != nil {
			return err
		}
	}
	return nil
}

// StoreHouseHandler serves `POST /api/houses`.
func StoreHouseHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
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
		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}

		failures := &errorBag{}
		input := validateStoreHouse(r, fields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		// Provinces::firstOrCreate / Regions::firstOrCreate.
		if input.kabKota == "Jakarta" {
			if err := ensureRegion(ctx, pool, "Jakarta", 1); err != nil {
				slog.Error("house store: region jakarta", "error", err)
				houseFailure500(w)
				return
			}
		} else {
			provinceID, err := ensureProvince(ctx, pool, input.province)
			if err != nil {
				slog.Error("house store: province", "error", err)
				houseFailure500(w)
				return
			}
			if err := ensureRegion(ctx, pool, input.kabKota, provinceID); err != nil {
				slog.Error("house store: region", "error", err)
				houseFailure500(w)
				return
			}
		}

		price := strings.ReplaceAll(input.price, ".", "")
		coordinate := input.lat + ", " + input.lng

		var houseID int64
		if err := pool.QueryRow(ctx, `INSERT INTO house
			(name, price, house_desc, width, length, br, ba, floors, coordinate,
			 street_name, kelurahan, kecamatan, kab_kota, province, postal_code,
			 id_user, created_at, updated_at)
			VALUES ($1, $2::numeric, $3, $4, $5, $6, $7, $8, $9,
			 $10, $11, $12, $13, $14, $15, $16,
			 date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`,
			input.name, price, input.houseDesc, input.width, input.length, input.br, input.ba,
			input.floors, coordinate, input.street, input.kelurahan, input.kecamatan,
			input.kabKota, input.province, input.postalCode, caller.UserID()).Scan(&houseID); err != nil {
			slog.Error("house store: insert", "error", err)
			houseFailure500(w)
			return
		}

		userFolder := "uploads/house/house_" + strconv.FormatInt(caller.UserID(), 10)
		if err := insertHousePics(ctx, pool, input.housePics, userFolder, houseID); err != nil {
			slog.Error("house store: pics", "error", err)
			houseFailure500(w)
			return
		}

		for _, room := range input.rooms {
			var roomID int64
			if err := pool.QueryRow(ctx, `INSERT INTO rooms
				(name, type, width, length, "desc", id_house, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, date_trunc('second', now()), date_trunc('second', now()))
				RETURNING id`,
				room.name, room.typ, room.width, room.length, room.desc, houseID).Scan(&roomID); err != nil {
				slog.Error("house store: room", "error", err)
				houseFailure500(w)
				return
			}
			if len(room.pics) > 0 {
				folder := "uploads/house/house_" + strconv.FormatInt(houseID, 10) +
					"/rooms/room_" + strconv.FormatInt(roomID, 10)
				if err := insertRoomPics(ctx, pool, room.pics, folder, roomID); err != nil {
					slog.Error("house store: room pics", "error", err)
					houseFailure500(w)
					return
				}
			}
		}

		rows, values, err := houseRow(ctx, pool, houseID)
		if err != nil {
			slog.Error("house store: reload", "error", err)
			houseFailure500(w)
			return
		}
		row, err := houseResourceWithOwner(ctx, pool, rows, values, caller.UserID(), caller.IsAdmin(), false)
		if err != nil {
			slog.Error("house store: resource", "error", err)
			houseFailure500(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", row)
		writeJSON(w, http.StatusCreated, payload)
	}
}

// UpdateHouseHandler serves `PUT/PATCH /api/houses/{house}`.
func UpdateHouseHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("house")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		houseID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\House`, raw)
			return
		}

		rows, values, err := houseRow(ctx, pool, houseID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\House`, raw)
				return
			}
			slog.Error("house update: load", "error", err)
			serverError(w)
			return
		}
		current := houseValuesByName(rows, values)
		if !houseWriteGate(w, intOf(current["id_user"]).(int64), caller.UserID()) {
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
		updates := map[string]string{}
		for _, rule := range []struct {
			key       string
			column    string
			strMax    int
			numeric   bool
			min       *float64
			maxDigits int
		}{
			{"name", "name", 255, false, nil, 0},
			{"price", "price", 0, true, houseMin(0), 0},
			{"house_desc", "house_desc", 0, false, nil, 0},
			{"width", "width", 0, true, houseMin(0), 4},
			{"length", "length", 0, true, houseMin(0), 4},
			{"ba", "ba", 0, true, houseMin(0), 2},
			{"br", "br", 0, true, houseMin(0), 2},
			{"floors", "floors", 0, true, houseMin(1), 2},
			{"street_name", "street_name", 255, false, nil, 0},
			{"kelurahan", "kelurahan", 255, false, nil, 0},
			{"kecamatan", "kecamatan", 255, false, nil, 0},
			{"kab_kota", "kab_kota", 255, false, nil, 0},
			{"province", "province", 255, false, nil, 0},
			{"postal_code", "postal_code", 0, true, nil, 0},
		} {
			if _, present := fields[rule.key]; !present {
				continue
			}
			if value, ok := houseField(fields, rule.key, false, rule.strMax, rule.numeric, rule.min, rule.maxDigits, failures); ok {
				if rule.key == "price" {
					value = strings.ReplaceAll(value, ".", "")
				}
				updates[rule.column] = value
			}
		}

		latText, latPresent := "", false
		lngText, lngPresent := "", false
		if _, present := fields["lat"]; present {
			latText, latPresent = houseField(fields, "lat", false, 0, true, nil, 0, failures)
		}
		if _, present := fields["lng"]; present {
			lngText, lngPresent = houseField(fields, "lng", false, 0, true, nil, 0, failures)
		}

		rooms := collectRoomInputs(r, fields, failures, true)
		housePics := requestFilesNamed(r, "house_pics")
		for index, upload := range housePics {
			houseImageFailures(upload, "house_pics."+strconv.Itoa(index), failures)
		}
		deletedHousePics := houseIdList(fields, "deleted_house_pics")
		deletedRoomPics := houseIdList(fields, "deleted_room_pics")
		if !failures.empty() {
			failures.write(w)
			return
		}

		if latPresent && lngPresent {
			updates["coordinate"] = latText + ", " + lngText
		}

		// A FIXED column order: a map iteration would attach the price cast to
		// whichever column happened to come last.
		sets := make([]string, 0, len(updates)+2)
		args := []any{houseID}
		for _, column := range []string{
			"name", "price", "house_desc", "width", "length", "ba", "br", "floors",
			"street_name", "kelurahan", "kecamatan", "kab_kota", "province", "postal_code",
			"coordinate",
		} {
			value, present := updates[column]
			if !present {
				continue
			}
			args = append(args, value)
			placeholder := "$" + strconv.Itoa(len(args))
			if column == "price" {
				placeholder += "::numeric"
			}
			sets = append(sets, column+" = "+placeholder)
		}
		sets = append(sets, "updated_at = date_trunc('second', now())")
		if _, err := pool.Exec(ctx, `UPDATE house SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("house update: exec", "error", err)
			houseFailure500(w)
			return
		}

		for _, room := range rooms {
			if room.id != nil {
				var existing int64
				if err := pool.QueryRow(ctx, `SELECT id FROM rooms WHERE id = $1 AND id_house = $2`,
					*room.id, houseID).Scan(&existing); err == nil {
					if _, err := pool.Exec(ctx, `UPDATE rooms SET name = $2, type = $3, width = $4,
						length = $5, "desc" = $6, updated_at = date_trunc('second', now())
						WHERE id = $1`, existing, room.name, room.typ, room.width, room.length, room.desc); err != nil {
						slog.Error("house update: room", "error", err)
						houseFailure500(w)
						return
					}
					if len(room.pics) > 0 {
						folder := "uploads/house/house_" + strconv.FormatInt(houseID, 10) +
							"/rooms/room_" + strconv.FormatInt(existing, 10)
						if err := insertRoomPics(ctx, pool, room.pics, folder, existing); err != nil {
							slog.Error("house update: room pics", "error", err)
							houseFailure500(w)
							return
						}
					}
					continue
				}
			}
			var roomID int64
			if err := pool.QueryRow(ctx, `INSERT INTO rooms
				(name, type, width, length, "desc", id_house, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, date_trunc('second', now()), date_trunc('second', now()))
				RETURNING id`,
				room.name, room.typ, room.width, room.length, room.desc, houseID).Scan(&roomID); err != nil {
				slog.Error("house update: new room", "error", err)
				houseFailure500(w)
				return
			}
			if len(room.pics) > 0 {
				folder := "uploads/house/house_" + strconv.FormatInt(houseID, 10) +
					"/rooms/room_" + strconv.FormatInt(roomID, 10)
				if err := insertRoomPics(ctx, pool, room.pics, folder, roomID); err != nil {
					slog.Error("house update: new room pics", "error", err)
					houseFailure500(w)
					return
				}
			}
		}

		for _, picID := range deletedHousePics {
			var dir *string
			if err := pool.QueryRow(ctx, `SELECT dir FROM house_pic WHERE id = $1 AND id_house = $2`,
				picID, houseID).Scan(&dir); err == nil {
				if dir != nil {
					_ = removeVaultFile(*dir)
				}
				_, _ = pool.Exec(ctx, `DELETE FROM house_pic WHERE id = $1 AND id_house = $2`, picID, houseID)
			}
		}

		for _, picID := range deletedRoomPics {
			var dir *string
			if err := pool.QueryRow(ctx, `SELECT p.dir FROM rooms_pic p
				JOIN rooms r ON r.id = p.id_room WHERE p.id = $1 AND r.id_house = $2`,
				picID, houseID).Scan(&dir); err == nil {
				if dir != nil {
					_ = removeVaultFile(*dir)
				}
				_, _ = pool.Exec(ctx, `DELETE FROM rooms_pic WHERE id = $1`, picID)
			}
		}

		houseFolder := "uploads/house/house_" + strconv.FormatInt(houseID, 10)
		if err := insertHousePics(ctx, pool, housePics, houseFolder, houseID); err != nil {
			slog.Error("house update: garden", "error", err)
			houseFailure500(w)
			return
		}

		rows, values, err = houseRow(ctx, pool, houseID)
		if err != nil {
			slog.Error("house update: reload", "error", err)
			houseFailure500(w)
			return
		}
		row, err := houseResourceWithOwner(ctx, pool, rows, values, caller.UserID(), caller.IsAdmin(), false)
		if err != nil {
			slog.Error("house update: resource", "error", err)
			houseFailure500(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", row)
		writeJSON(w, http.StatusOK, payload)
	}
}

// houseValuesByName indexes a house row.
func houseValuesByName(fields []string, values []any) map[string]any {
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}
	return byName
}

// DestroyHouseHandler serves `DELETE /api/houses/{house}`.
func DestroyHouseHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("house")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		houseID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\House`, raw)
			return
		}

		rows, values, err := houseRow(ctx, pool, houseID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\House`, raw)
				return
			}
			slog.Error("house destroy: load", "error", err)
			serverError(w)
			return
		}
		current := houseValuesByName(rows, values)
		if !houseWriteGate(w, intOf(current["id_user"]).(int64), caller.UserID()) {
			return
		}

		// rooms, house_pic and rooms_pic all cascade from `house`.
		if _, err := pool.Exec(ctx, `DELETE FROM house WHERE id = $1`, houseID); err != nil {
			slog.Error("house destroy: delete", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "House deleted successfully")
	}
}

// StoreRoomHandler serves `POST /api/houses/{house}/rooms`.
func StoreRoomHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("house")
		if raw == "" {
			raw = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/rooms"))
		}
		houseID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\House`, raw)
			return
		}

		rows, values, err := houseRow(ctx, pool, houseID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\House`, raw)
				return
			}
			slog.Error("room store: load", "error", err)
			serverError(w)
			return
		}
		current := houseValuesByName(rows, values)
		if !houseWriteGate(w, intOf(current["id_user"]).(int64), caller.UserID()) {
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
		name, _ := houseField(fields, "name", true, 255, false, nil, 0, failures)

		roomType := ""
		if rawType, present := fields["type"]; !present || rawType == nil {
			failures.add("type", "The type field is required.")
		} else if text, ok := rawType.(string); !ok {
			failures.add("type", "The type field must be a string.")
		} else if text != "room" && text != "bedroom" && text != "bathroom" && text != "others" {
			failures.add("type", "The selected type is invalid.")
		} else {
			roomType = text
		}

		width, _ := houseField(fields, "width", true, 0, true, houseMin(0), 0, failures)
		length, _ := houseField(fields, "length", true, 0, true, houseMin(0), 0, failures)

		desc := ""
		if rawDesc, present := fields["desc"]; !present || rawDesc == nil {
			failures.add("desc", "The desc field is required.")
		} else if text, ok := rawDesc.(string); !ok {
			failures.add("desc", "The desc field must be a string.")
		} else {
			desc = text
		}

		pics := requestFilesNamed(r, "room_pic")
		for index, upload := range pics {
			houseImageFailures(upload, "room_pic."+strconv.Itoa(index), failures)
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		var roomID int64
		if err := pool.QueryRow(ctx, `INSERT INTO rooms
			(name, type, width, length, "desc", id_house, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`, name, roomType, width, length, desc, houseID).Scan(&roomID); err != nil {
			slog.Error("room store: insert", "error", err)
			serverError(w)
			return
		}

		if len(pics) > 0 {
			folder := "uploads/house/house_" + strconv.FormatInt(houseID, 10) +
				"/rooms/room_" + strconv.FormatInt(roomID, 10)
			if err := insertRoomPics(ctx, pool, pics, folder, roomID); err != nil {
				slog.Error("room store: pics", "error", err)
				serverError(w)
				return
			}
		}

		rows, values, err = houseRow(ctx, pool, houseID)
		if err != nil {
			slog.Error("room store: reload", "error", err)
			serverError(w)
			return
		}
		row, err := houseResourceWithOwner(ctx, pool, rows, values, caller.UserID(), caller.IsAdmin(), false)
		if err != nil {
			slog.Error("room store: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Room added successfully")
		payload.Set("house", row)
		writeJSON(w, http.StatusOK, payload)
	}
}

// houseQuestionUser renders `new UserResource($user)` with no relations
// loaded: the bare eight keys.
func houseQuestionUser(ctx context.Context, pool *pgxpool.Pool, userID, viewerID int64, viewerIsAdmin bool) (any, error) {
	user, err := loadUser(ctx, pool, userID)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return userResource(ctx, pool, user, viewerID, viewerIsAdmin, nil)
}

// HouseQuestionsHandler serves `GET /api/houses/{house}/questions`.
//
// Public: anonymous visitors see the questions with the asker's email
// masked (UserResource only exposes it to the account owner or an admin).
func HouseQuestionsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		raw := r.PathValue("house")
		if raw == "" {
			raw = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/questions"))
		}
		houseID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\House`, raw)
			return
		}
		ctx := r.Context()

		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM house WHERE id = $1)`, houseID).Scan(&exists); err != nil {
			slog.Error("questions: house", "error", err)
			serverError(w)
			return
		}
		if !exists {
			modelNotFound(w, `App\Models\House`, raw)
			return
		}

		caller, _ := CallerFrom(ctx)
		var viewerID int64
		viewerIsAdmin := false
		if caller != nil {
			viewerID = caller.UserID()
			viewerIsAdmin = caller.IsAdmin()
		}

		rows, err := pool.Query(ctx, `SELECT id, question, user_id, created_at
			FROM house_questions WHERE house_id = $1
			ORDER BY created_at DESC, id ASC`, houseID)
		if err != nil {
			slog.Error("questions: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		list := make([]any, 0)
		for rows.Next() {
			var (
				id, userID int64
				question   string
				createdAt  any
			)
			if err := rows.Scan(&id, &question, &userID, &createdAt); err != nil {
				slog.Error("questions: scan", "error", err)
				serverError(w)
				return
			}

			answerRows, err := pool.Query(ctx, `SELECT id, answer, user_id, created_at
				FROM house_answers WHERE question_id = $1 ORDER BY id`, id)
			if err != nil {
				slog.Error("questions: answers", "error", err)
				serverError(w)
				return
			}
			answers := make([]any, 0)
			for answerRows.Next() {
				var (
					answerID, answerUser int64
					answer               string
					answerCreated        any
				)
				if err := answerRows.Scan(&answerID, &answer, &answerUser, &answerCreated); err != nil {
					answerRows.Close()
					slog.Error("questions: answer scan", "error", err)
					serverError(w)
					return
				}
				user, err := houseQuestionUser(ctx, pool, answerUser, viewerID, viewerIsAdmin)
				if err != nil {
					answerRows.Close()
					slog.Error("questions: answer user", "error", err)
					serverError(w)
					return
				}
				entry := jsonphp.NewObject()
				entry.Set("id", answerID)
				entry.Set("answer", answer)
				entry.Set("user", user)
				entry.Set("created_at", projectTimeValue(answerCreated))
				answers = append(answers, entry)
			}
			answerRows.Close()

			user, err := houseQuestionUser(ctx, pool, userID, viewerID, viewerIsAdmin)
			if err != nil {
				slog.Error("questions: user", "error", err)
				serverError(w)
				return
			}
			entry := jsonphp.NewObject()
			entry.Set("id", id)
			entry.Set("question", question)
			entry.Set("user", user)
			entry.Set("created_at", projectTimeValue(createdAt))
			entry.Set("answers", answers)
			list = append(list, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("questions: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", list)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreHouseQuestionHandler serves `POST /api/houses/{house}/questions`.
func StoreHouseQuestionHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		raw := r.PathValue("house")
		if raw == "" {
			raw = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/questions"))
		}
		houseID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\House`, raw)
			return
		}
		ctx := r.Context()

		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM house WHERE id = $1)`, houseID).Scan(&exists); err != nil {
			slog.Error("question store: house", "error", err)
			serverError(w)
			return
		}
		if !exists {
			modelNotFound(w, `App\Models\House`, raw)
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		question, _ := houseField(fields, "question", true, 1000, false, nil, 0, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var questionID int64
		var createdAt any
		if err := pool.QueryRow(ctx, `INSERT INTO house_questions
			(house_id, user_id, question, created_at, updated_at)
			VALUES ($1, $2, $3, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at`, houseID, caller.UserID(), question).Scan(&questionID, &createdAt); err != nil {
			slog.Error("question store: insert", "error", err)
			serverError(w)
			return
		}

		user, err := houseQuestionUser(ctx, pool, caller.UserID(), caller.UserID(), caller.IsAdmin())
		if err != nil {
			slog.Error("question store: user", "error", err)
			serverError(w)
			return
		}

		entry := jsonphp.NewObject()
		entry.Set("id", questionID)
		entry.Set("question", question)
		entry.Set("user", user)
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("answers", []any{})

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusCreated, payload)
	}
}
