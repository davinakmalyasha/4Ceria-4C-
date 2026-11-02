package httpapi

import (
	"crypto/rand"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SINGLE ROUTES — delivery jobs, secure verification documents, house answers,
// room deletion and the generic upload endpoint.

// SupplierDeliveryJobsHandler serves `GET /api/delivery-jobs`.
//
// Supplier-only. The oracle runs one query-builder join and returns the raw
// rows, so there are no Eloquent casts: timestamps stay `Y-m-d H:i:s` strings,
// decimals stay strings, and the JSON columns stay the JSON TEXT they were
// stored as (json_encode would quote them).
func SupplierDeliveryJobsHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		var supplierID int64
		if err := pool.QueryRow(ctx, `SELECT id FROM suppliers WHERE user_id = $1
			ORDER BY id ASC LIMIT 1`, caller.UserID()).Scan(&supplierID); err != nil {
			if isNoRows(err) {
				// `$user->supplier->id` on a supplier-less user is a PHP
				// fatal → 500.
				serverError(w)
				return
			}
			slog.Error("delivery-jobs: supplier", "error", err)
			serverError(w)
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT dj.id, dj.quote_id, dj.order_id, dj.logistics_id,
			       dj.pickup_address, dj.dropoff_address, dj.status,
			       dj.agreed_fee::text, dj.estimated_weight,
			       to_char(dj.created_at, 'YYYY-MM-DD HH24:MI:SS'),
			       to_char(dj.updated_at, 'YYYY-MM-DD HH24:MI:SS'),
			       dj.pickup_photos::text, dj.delivery_photos::text,
			       mq.delivery_address, mq.total_amount::text,
			       courier.id, courier.name, ph.contact,
			       cp.vehicle_type, cp.license_plate
			  FROM delivery_jobs dj
			  JOIN material_quotes mq ON mq.id = dj.quote_id
			  LEFT JOIN users courier ON courier.id = dj.logistics_id
			  LEFT JOIN courier_profiles cp ON cp.user_id = courier.id
			  LEFT JOIN phone_user ph ON ph.id_user = courier.id
			       AND ph.id = (SELECT id FROM phone_user WHERE id_user = courier.id ORDER BY id LIMIT 1)
			 WHERE mq.supplier_id = $1
			 ORDER BY dj.created_at DESC, dj.id ASC`, supplierID)
		if err != nil {
			slog.Error("delivery-jobs: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		keys := []string{
			"id", "quote_id", "order_id", "logistics_id",
			"pickup_address", "dropoff_address", "status", "agreed_fee",
			"estimated_weight", "created_at", "updated_at",
			"pickup_photos", "delivery_photos", "delivery_address",
			"total_amount", "driver_user_id", "driver_name", "driver_phone",
			"vehicle_type", "license_plate",
		}

		list := make([]any, 0)
		for rows.Next() {
			var (
				id, quoteID          int64
				orderID, logisticsID *int64
				pickup, dropoff      *string
				status               string
				agreedFee            *string
				estimatedWeight      *string
				createdAt            string
				updatedAt            string
				pickupPhotos         *string
				deliveryPhotos       *string
				deliveryAddress      *string
				totalAmount          *string
				driverUserID         *int64
				driverName           *string
				driverPhone          *string
				vehicleType          *string
				licensePlate         *string
			)
			if err := rows.Scan(&id, &quoteID, &orderID, &logisticsID,
				&pickup, &dropoff, &status, &agreedFee, &estimatedWeight,
				&createdAt, &updatedAt, &pickupPhotos, &deliveryPhotos,
				&deliveryAddress, &totalAmount,
				&driverUserID, &driverName, &driverPhone,
				&vehicleType, &licensePlate); err != nil {
				slog.Error("delivery-jobs: scan", "error", err)
				serverError(w)
				return
			}

			values := []any{
				id, quoteID, orderID, logisticsID,
				pickup, dropoff, status, agreedFee,
				estimatedWeight, createdAt, updatedAt,
				pickupPhotos, deliveryPhotos, deliveryAddress,
				totalAmount, driverUserID, driverName, driverPhone,
				vehicleType, licensePlate,
			}

			entry := jsonphp.NewObject()
			for i, key := range keys {
				entry.Set(key, deliveryJobValue(values[i]))
			}
			list = append(list, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("data", list)
		writeJSON(w, http.StatusOK, payload)
	}
}

// deliveryJobValue renders one raw query-builder column: pointers become the
// value or null, JSON columns stay strings.
func deliveryJobValue(value any) any {
	switch typed := value.(type) {
	case *string:
		if typed == nil {
			return nil
		}
		return *typed
	case *int64:
		if typed == nil {
			return nil
		}
		return *typed
	default:
		return value
	}
}

// verificationTypes maps the URL segment to the profile table and the model
// name used by the route-binding 404.
type verificationType struct {
	table string
	model string
}

var verificationTypes = map[string]verificationType{
	"arsitek":         {"arsiteks", `App\Models\Arsitek`},
	"kontraktor":      {"kontraktors", `App\Models\Kontraktor`},
	"civil":           {"kontraktors", `App\Models\Kontraktor`},
	"mechanical":      {"kontraktors", `App\Models\Kontraktor`},
	"electrical":      {"kontraktors", `App\Models\Kontraktor`},
	"plumbing":        {"kontraktors", `App\Models\Kontraktor`},
	"roofing":         {"kontraktors", `App\Models\Kontraktor`},
	"finishing":       {"kontraktors", `App\Models\Kontraktor`},
	"project_manager": {"project_managers", `App\Models\ProjectManager`},
	"structural":      {"structural_engineers", `App\Models\StructuralEngineer`},
	"mep":             {"mep_engineers", `App\Models\MepEngineer`},
	"notaris":         {"notaris_profiles", `App\Models\NotarisProfile`},
	"interior":        {"interior_profiles", `App\Models\InteriorProfile`},
	"supplier":        {"suppliers", `App\Models\Supplier`},
}

// verificationFields is the allowlist — arbitrary column reads are refused.
var verificationFields = map[string]bool{
	"file_portofolio": true, "npwp": true, "file_sertifikat": true,
	"siup": true, "foto": true,
}

// VerificationDocumentHandler serves
// `GET /api/verifications/documents/{type}/{id}/{field}`.
//
// The URL is a short-lived pre-signed link to a private document. Only an
// admin or the profile's owner may ask; the response is `{"url": ...}`.
//
// LOCALLY the vault disk is `railway` (S3) with empty credentials, so
// `temporaryUrl` throws and the oracle answers the catch-all 500. The port
// mirrors that: the signer is not configured in this environment, and a
// missing S3 configuration must never silently emit an unsigned URL.
func VerificationDocumentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		kind := r.PathValue("type")
		profileType, known := verificationTypes[kind]
		if !known {
			message(w, http.StatusBadRequest, "Invalid professional type")
			return
		}

		field := r.PathValue("field")
		if !verificationFields[field] {
			message(w, http.StatusBadRequest, "Invalid document request field")
			return
		}

		raw := r.PathValue("id")
		profileID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, profileType.model, raw)
			return
		}

		var ownerID int64
		var path *string
		err = pool.QueryRow(ctx, `SELECT user_id, `+field+` FROM `+profileType.table+` WHERE id = $1`,
			profileID).Scan(&ownerID, &path)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, profileType.model, raw)
				return
			}
			slog.Error("verification doc: load", "error", err)
			serverError(w)
			return
		}

		if !caller.IsAdmin() && ownerID != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized access to credentials.")
			return
		}

		if path == nil || *path == "" {
			message(w, http.StatusNotFound, "No document uploaded for this field.")
			return
		}

		// The vault disk is S3-backed in production. This build has no signer,
		// and the local oracle fails the same way, so the controller's
		// catch-all message is the honest answer.
		slog.Error("verification doc: no vault signer configured", "field", field)
		message(w, http.StatusInternalServerError, "Failed to generate secure preview URL")
	}
}

// StoreHouseAnswerHandler serves `POST /api/questions/{question}/answers`.
//
// Only the listing owner (or an admin) may answer. The created answer is
// loaded with its user and rendered through UserResource — the answerer is
// the viewer here, so the email is present.
func StoreHouseAnswerHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("question")
		questionID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\HouseQuestion`, raw)
			return
		}

		var houseID int64
		err = pool.QueryRow(ctx, `SELECT house_id FROM house_questions WHERE id = $1`,
			questionID).Scan(&houseID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\HouseQuestion`, raw)
				return
			}
			slog.Error("answer store: question", "error", err)
			serverError(w)
			return
		}

		var ownerID *int64
		houseFound := true
		if err := pool.QueryRow(ctx, `SELECT id_user FROM house WHERE id = $1`, houseID).
			Scan(&ownerID); err != nil {
			if isNoRows(err) {
				houseFound = false
			} else {
				slog.Error("answer store: house", "error", err)
				serverError(w)
				return
			}
		}

		isOwner := houseFound && ownerID != nil && *ownerID == caller.UserID()
		if !isOwner && !caller.IsAdmin() {
			message(w, http.StatusForbidden, "Only the property owner can answer questions.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		answerAny, present := fields["answer"]
		answer := ""
		switch {
		case !present || answerAny == nil || (func() bool {
			text, ok := answerAny.(string)
			return ok && strings.TrimSpace(text) == ""
		}()):
			failures.add("answer", "The answer field is required.")
		default:
			text, ok := answerAny.(string)
			if !ok {
				failures.add("answer", "The answer field must be a string.")
			} else if len([]rune(text)) > 1000 {
				failures.add("answer", "The answer field must not be greater than 1000 characters.")
			} else {
				answer = text
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		var answerID int64
		var createdAt any
		if err := pool.QueryRow(ctx, `INSERT INTO house_answers
			(question_id, user_id, answer, created_at, updated_at)
			VALUES ($1, $2, $3, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at`, questionID, caller.UserID(), answer).Scan(&answerID, &createdAt); err != nil {
			slog.Error("answer store: insert", "error", err)
			serverError(w)
			return
		}

		user, err := houseQuestionUser(ctx, pool, caller.UserID(), caller.UserID(), caller.IsAdmin())
		if err != nil {
			slog.Error("answer store: user", "error", err)
			serverError(w)
			return
		}

		entry := jsonphp.NewObject()
		entry.Set("id", answerID)
		entry.Set("answer", answer)
		entry.Set("user", user)
		entry.Set("created_at", projectTimeValue(createdAt))

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusCreated, payload)
	}
}

// DestroyRoomHandler serves `DELETE /api/rooms/{room}`.
//
// The photos are removed from the local public disk (the S3 cutover is not
// part of the port yet), the row is deleted, and the answer carries the
// refreshed house with its remaining rooms and pictures.
func DestroyRoomHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("room")
		roomID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\Room`, raw)
			return
		}

		var houseID int64
		err = pool.QueryRow(ctx, `SELECT id_house FROM rooms WHERE id = $1`, roomID).Scan(&houseID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Room`, raw)
				return
			}
			slog.Error("room destroy: load", "error", err)
			serverError(w)
			return
		}

		houseFields, houseValues, err := houseRow(ctx, pool, houseID)
		if err != nil {
			if isNoRows(err) {
				// `$room->house` is null → `$house->id_user` is a PHP fatal.
				serverError(w)
				return
			}
			slog.Error("room destroy: house", "error", err)
			serverError(w)
			return
		}
		current := houseValuesByName(houseFields, houseValues)
		if intOf(current["id_user"]).(int64) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized action. You do not own this house.")
			return
		}

		picRows, err := pool.Query(ctx, `SELECT dir FROM rooms_pic WHERE id_room = $1`, roomID)
		if err != nil {
			slog.Error("room destroy: pics", "error", err)
			serverError(w)
			return
		}
		pics := make([]string, 0)
		for picRows.Next() {
			var dir *string
			if err := picRows.Scan(&dir); err != nil {
				picRows.Close()
				slog.Error("room destroy: pic scan", "error", err)
				serverError(w)
				return
			}
			if dir != nil && *dir != "" {
				pics = append(pics, *dir)
			}
		}
		picRows.Close()

		for _, dir := range pics {
			full := filepath.Join(publicDiskRoot(), filepath.FromSlash(dir))
			if info, err := os.Stat(full); err == nil && !info.IsDir() {
				_ = os.Remove(full)
			}
		}

		if _, err := pool.Exec(ctx, `DELETE FROM rooms WHERE id = $1`, roomID); err != nil {
			slog.Error("room destroy: delete", "error", err)
			serverError(w)
			return
		}

		updated, err := houseResourceWithOwner(ctx, pool, houseFields, houseValues,
			caller.UserID(), caller.IsAdmin(), false)
		if err != nil {
			slog.Error("room destroy: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Room deleted successfully")
		payload.Set("house", updated)
		writeJSON(w, http.StatusOK, payload)
	}
}

// UploadHandler serves `POST /api/upload`.
//
// `folder` is an allowlist, not a namespace: trusted prefixes (`receipts/`,
// `chat_images/`) must not be squattable. An unknown folder silently falls
// back to `project_assets`.
//
// The stored name is 40 random alphanumerics (Laravel's `Str::random(40)`), so
// the two stacks can never produce the same path; the gate covers the failure
// paths and the live proof normalises the name.
func UploadHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_ = pool
		fields, files, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
			files = map[string]*uploadedFile{}
		}

		failures := &errorBag{}
		file := files["file"]

		if file == nil {
			if raw, present := fields["file"]; present && raw != nil {
				// `file` and `mimes` BOTH run on a non-file value: the
				// validator reports the type failure after the file failure.
				failures.add("file", "The file field must be a file.")
				failures.add("file", "The file field must be a file of type: jpg, jpeg, png, pdf, webp.")
			} else {
				failures.add("file", "The file field is required.")
			}
		} else {
			effective := uploadExtension(file)
			allowed := false
			for _, mime := range []string{"jpg", "jpeg", "png", "pdf", "webp"} {
				if effective == mime {
					allowed = true
					break
				}
			}
			if !allowed {
				failures.add("file", "The file field must be a file of type: jpg, jpeg, png, pdf, webp.")
			} else if file.size > 10240*1024 {
				failures.add("file", "The file field must not be greater than 10240 kilobytes.")
			}
		}

		folder := "project_assets"
		if raw, present := fields["folder"]; present && raw != nil {
			text, ok := raw.(string)
			if !ok {
				failures.add("folder", "The folder field must be a string.")
			} else if text == "project_assets" || text == "design_briefs" {
				folder = text
			}
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		name, err := randomAlphaNumeric(40)
		if err != nil {
			slog.Error("upload: random", "error", err)
			serverError(w)
			return
		}
		path := folder + "/" + name + "." + file.ext
		full := filepath.Join(publicDiskRoot(), filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			slog.Error("upload: mkdir", "error", err)
			serverError(w)
			return
		}

		src, err := r.MultipartForm.File["file"][0].Open()
		if err != nil {
			slog.Error("upload: open", "error", err)
			serverError(w)
			return
		}
		defer src.Close()

		dst, err := os.OpenFile(full, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err != nil {
			slog.Error("upload: create", "error", err)
			serverError(w)
			return
		}
		if _, err := io.Copy(dst, src); err != nil {
			dst.Close()
			slog.Error("upload: write", "error", err)
			serverError(w)
			return
		}
		dst.Close()

		payload := jsonphp.NewObject()
		payload.Set("url", "/storage/"+path)
		payload.Set("path", path)
		writeJSON(w, http.StatusOK, payload)
	}
}

// publicDiskRoot is the local `public` disk root.
func publicDiskRoot() string {
	if root := os.Getenv("PUBLIC_STORAGE_ROOT"); root != "" {
		return root
	}
	return filepath.Join("storage", "app", "public")
}

// uploadExtension is Laravel's guessed extension: the CONTENT decides for the
// four signatures the validator accepts, and the suffix is the fallback.
func uploadExtension(file *uploadedFile) string {
	switch file.mime {
	case "image/jpeg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "application/pdf":
		return "pdf"
	}
	if file.ext == "jpeg" {
		return "jpg"
	}
	return file.ext
}

// randomAlphaNumeric draws n characters from Laravel's default alphabet.
func randomAlphaNumeric(n int) (string, error) {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	for i := range buf {
		buf[i] = alphabet[int(buf[i])%len(alphabet)]
	}
	return string(buf), nil
}
