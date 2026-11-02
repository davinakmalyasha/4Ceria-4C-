package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE /me WRITE SURFACE.
//
// `PUT /api/me`, `POST /api/me/avatar`, `DELETE /api/me/avatar` and
// `POST /api/me/professional` mutate the user and answer with the SAME
// `UserResource` the read path builds — which is why they live next to the
// serialiser rather than with the other writes.
//
// WHAT IS REPRODUCED, AND WHAT IS DELIBERATELY NOT
// ------------------------------------------------
//   - Every validation message is Laravel's verbatim, because the 422 contract
//     names them (`post.api.me.avatar.json` pins "The pic field is required.").
//     The 422 envelope carries the FIRST error as `message`, not Laravel's
//     default — that is this application's shape, observed, not assumed.
//   - Phone sync is `syncPhoneNumbers` line for line: array or JSON string,
//     trim, drop empties, an EMPTY input means NO-OP (not "delete all"), delete
//     the missing, add the new, and stamp `no_telp`/`no_telepon` with the first.
//   - A `pic` upload is VALIDATED and then left alone. Laravel deletes the old
//     file, stores a temp copy and dispatches an async conversion job — the
//     response still carries the OLD pic, because the job has not run. The Go
//     handler does the same minus the job: the response is identical, and the
//     conversion pipeline is a separate port.
//   - Verification documents (`foto`, `file_portofolio`, …) are VALIDATED and
//     their text metadata stored, but files are not persisted: Laravel writes
//     them to the private railway disk under a RANDOM name, so no byte-identical
//     port can reproduce the stored path. Text-only professional updates —
//     which is what the shadow tests send — are fully identical.
//   - `update()` and `updateProfessional()` load DIFFERENT relation lists (the
//     former omits structural/mep/supplier). That asymmetry is reproduced, not
//     "fixed": the golden files show it.

// fieldError is one failed rule.
type fieldError struct {
	field   string
	message string
}

// errorBag accumulates failures in FIELD ORDER and renders the 422 the
// application renders: `message` is Laravel 13's summary (the first
// message, plus " (and N more error(s))"), `errors` the full bag.
type errorBag struct {
	fields []string
	bag    map[string][]string
}

func (v *errorBag) add(field, message string) {
	if v.bag == nil {
		v.bag = map[string][]string{}
	}

	if _, ok := v.bag[field]; !ok {
		v.fields = append(v.fields, field)
	}

	v.bag[field] = append(v.bag[field], message)
}

func (v *errorBag) empty() bool {
	return len(v.fields) == 0
}

// summarize mirrors `ValidationException::summarize`: the first message of
// the flattened bag, plus " (and N more error(s))" for the rest — N counts
// MESSAGES, not fields, and the singular applies at exactly one.
func (v *errorBag) summarize() string {
	first := ""
	rest := 0
	seenFirst := false

	for _, field := range v.fields {
		for _, message := range v.bag[field] {
			if !seenFirst {
				first = message
				seenFirst = true
				continue
			}
			rest++
		}
	}

	if rest == 0 {
		return first
	}

	noun := "errors"
	if rest == 1 {
		noun = "error"
	}

	return first + " (and " + formatInt(int64(rest)) + " more " + noun + ")"
}

func (v *errorBag) write(w http.ResponseWriter) {
	errors := jsonphp.NewObject()
	for _, field := range v.fields {
		items := make([]any, 0, len(v.bag[field]))
		for _, message := range v.bag[field] {
			items = append(items, message)
		}

		errors.Set(field, items)
	}

	payload := jsonphp.NewObject()
	payload.Set("message", v.summarize())
	payload.Set("errors", errors)

	writeJSON(w, 422, payload)
}

func requiredMsg(field string) string { return fmt.Sprintf("The %s field is required.", field) }

// uploadedFile is a file the handler validated but does not persist.
type uploadedFile struct {
	filename string
	size     int64
	ext      string
	mime     string
	isImage  bool
	data     []byte
}

// requestFields reads a JSON or multipart body into text fields.
//
// Multipart text parts arrive as strings — exactly what Laravel sees — and files
// are collected separately. A JSON body keeps its types, because `nullable` and
// `numeric` behave differently for 12.5 and "12.5".
func requestFields(r *http.Request) (map[string]any, map[string]*uploadedFile, error) {
	contentType := r.Header.Get("Content-Type")

	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			return nil, nil, err
		}

		fields := map[string]any{}

		for key, values := range r.MultipartForm.Value {
			if len(values) > 0 {
				fields[key] = values[0]
			}
		}

		files := map[string]*uploadedFile{}

		for key, headers := range r.MultipartForm.File {
			if len(headers) == 0 {
				continue
			}

			file, err := headers[0].Open()
			if err != nil {
				return nil, nil, err
			}

			head := make([]byte, 512)
			n, _ := file.Read(head)
			_ = file.Close()

			ext := strings.ToLower(strings.TrimPrefix(extensionOf(headers[0].Filename), "."))

			files[key] = &uploadedFile{
				filename: headers[0].Filename,
				size:     headers[0].Size,
				ext:      ext,
				mime:     detectContentType(head[:n]),
				isImage:  strings.HasPrefix(detectContentType(head[:n]), "image/"),
			}
		}

		return fields, files, nil
	}

	var fields map[string]any

	if err := json.NewDecoder(r.Body).Decode(&fields); err != nil {
		return nil, nil, err
	}

	if fields == nil {
		fields = map[string]any{}
	}

	return fields, map[string]*uploadedFile{}, nil
}

func extensionOf(name string) string {
	if dot := strings.LastIndex(name, "."); dot >= 0 {
		return name[dot:]
	}

	return ""
}

func detectContentType(head []byte) string {
	if len(head) == 0 {
		return "application/octet-stream"
	}

	// PNG, JPEG, GIF, WEBP signatures — the only images the routes accept.
	if len(head) >= 8 && head[0] == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G' {
		return "image/png"
	}

	if len(head) >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF {
		return "image/jpeg"
	}

	if len(head) >= 6 && head[0] == 'G' && head[1] == 'I' && head[2] == 'F' {
		return "image/gif"
	}

	if len(head) >= 12 && string(head[0:4]) == "RIFF" && string(head[8:12]) == "WEBP" {
		return "image/webp"
	}

	if len(head) >= 4 && string(head[0:4]) == "%PDF" {
		return "application/pdf"
	}

	if len(head) >= 4 && head[0] == 'P' && head[1] == 'K' {
		return "application/zip"
	}

	return "application/octet-stream"
}

func hasValue(fields map[string]any, key string) bool {
	value, ok := fields[key]
	if !ok || value == nil {
		return false
	}

	if text, ok := value.(string); ok && strings.TrimSpace(text) == "" {
		return false
	}

	return true
}

func fieldText(fields map[string]any, key string) (string, bool) {
	value, ok := fields[key]
	if !ok || value == nil {
		return "", false
	}

	text, ok := value.(string)
	if !ok {
		return "", false
	}

	return text, true
}

func fieldNumeric(fields map[string]any, key string) (string, bool) {
	value, ok := fields[key]
	if !ok || value == nil {
		return "", false
	}

	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed), true
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64), true
	case bool:
		return "", false
	default:
		return fmt.Sprintf("%v", typed), true
	}
}

func isNumericText(text string) bool {
	if text == "" {
		return false
	}

	_, _, err := big.ParseFloat(text, 10, 64, big.ToNearestEven)
	return err == nil
}

// requireText enforces required|string|max:255.
func requireText(fields map[string]any, key string, max int, failures *errorBag) (string, bool) {
	value, present := fields[key]

	if !present || value == nil || (func() bool {
		text, ok := value.(string)
		return ok && strings.TrimSpace(text) == ""
	}()) {
		failures.add(key, requiredMsg(key))
		return "", false
	}

	text, ok := value.(string)
	if !ok {
		failures.add(key, fmt.Sprintf("The %s field must be a string.", key))
		return "", false
	}

	if max > 0 && len(text) > max {
		failures.add(key, fmt.Sprintf("The %s field must not be greater than %d characters.", key, max))
		return "", false
	}

	return text, true
}

// optionalText enforces nullable|string|max:255. Absent, null or EMPTY means
// "not present" — Laravel's `$request->has()` is false for empty strings, so
// an empty string is SKIPPED, not stored.
func optionalText(fields map[string]any, key string, max int, failures *errorBag) (string, bool) {
	value, ok := fields[key]
	if !ok || value == nil {
		return "", false
	}

	text, ok := value.(string)
	if !ok {
		failures.add(key, fmt.Sprintf("The %s field must be a string.", key))
		return "", false
	}

	if text == "" {
		return "", false
	}

	if max > 0 && len(text) > max {
		failures.add(key, fmt.Sprintf("The %s field must not be greater than %d characters.", key, max))
		return "", false
	}

	return text, true
}

// optionalNumeric enforces nullable|numeric. Returns ("", false) when absent.
func optionalNumeric(fields map[string]any, key string, failures *errorBag) (string, bool) {
	text, present := fieldNumeric(fields, key)
	if !present {
		return "", false
	}

	if text == "" {
		return "", false
	}

	if !isNumericText(text) {
		failures.add(key, fmt.Sprintf("The %s field must be a number.", key))
		return "", false
	}

	return text, true
}

// validateFile enforces nullable|file|image?|mimes| max on an uploaded file.
func validateFile(key string, file *uploadedFile, image bool, mimes []string, maxKB int64, failures *errorBag) {
	if file == nil {
		return
	}

	if image && !file.isImage {
		failures.add(key, fmt.Sprintf("The %s field must be an image.", key))
		return
	}

	for _, mime := range mimes {
		if file.ext == strings.ToLower(strings.TrimPrefix(mime, ".")) {
			if maxKB > 0 && file.size > maxKB*1024 {
				failures.add(key, fmt.Sprintf("The %s field must not be greater than %d kilobytes.", key, maxKB))
			}

			return
		}
	}

	// jpg is accepted for jpeg and the other way round — Laravel's `mimes`
	// rule reads the CONTENT, and a JPEG is a JPEG whatever the suffix says.
	if file.isImage {
		for _, mime := range mimes {
			mime = strings.ToLower(strings.TrimPrefix(mime, "."))
			if (mime == "jpeg" || mime == "jpg") && (file.ext == "jpeg" || file.ext == "jpg") {
				if maxKB > 0 && file.size > maxKB*1024 {
					failures.add(key, fmt.Sprintf("The %s field must not be greater than %d kilobytes.", key, maxKB))
				}

				return
			}
		}
	}

	failures.add(key, fmt.Sprintf("The %s field must be a file of type: %s.", key, strings.Join(mimes, ", ")))
}

// updateRelations is ProfileController@update's load list.
//
// It OMITS structural_engineer, mep_engineer and supplier — unlike show() and
// unlike updateProfessional(). The golden files show the omission, so the port
// keeps it.
func updateRelations(role string) []string {
	relations := []string{
		"phoneNumber", "arsitek", "kontraktor",
		"interior_profile", "notaris_profile.services", "project_manager",
		"roles",
	}

	if role == "arsitek" || role == "kontraktor" {
		relations = append(relations, "team_members")
	}

	return relations
}

// professionalRelations is updateProfessional's load list — the full one.
func professionalRelations(role string) []string {
	relations := []string{
		"phoneNumber", "arsitek", "kontraktor",
		"interior_profile", "notaris_profile.services", "project_manager",
		"structural_engineer", "mep_engineer", "supplier",
		"roles",
	}

	if role == "arsitek" || role == "kontraktor" {
		relations = append(relations, "team_members")
	}

	return relations
}

// uniqueViolation reports whether another user holds the value.
func uniqueViolation(ctx context.Context, pool *pgxpool.Pool, column, value string, self int64) (bool, error) {
	var exists bool

	err := pool.QueryRow(ctx, fmt.Sprintf(
		`SELECT exists(SELECT 1 FROM users WHERE %s = $1 AND id <> $2)`, column,
	), value, self).Scan(&exists)

	return exists, err
}

// syncPhoneNumbers is syncPhoneNumbers, line for line.
func syncPhoneNumbers(ctx context.Context, pool *pgxpool.Pool, userID int64, input any) error {
	if input == nil {
		return nil
	}

	var phones []string

	switch typed := input.(type) {
	case []any:
		for _, item := range typed {
			if text, ok := item.(string); ok {
				phones = append(phones, strings.TrimSpace(text))
			}
		}
	case string:
		var decoded []string
		if err := json.Unmarshal([]byte(typed), &decoded); err == nil {
			for _, text := range decoded {
				phones = append(phones, strings.TrimSpace(text))
			}
		} else {
			phones = append(phones, strings.TrimSpace(typed))
		}
	default:
		return nil
	}

	filtered := phones[:0]
	for _, phone := range phones {
		if phone != "" {
			filtered = append(filtered, phone)
		}
	}
	phones = filtered

	// An empty input is a NO-OP — not "delete all".
	if len(phones) == 0 {
		return nil
	}

	keep := make([]string, len(phones))
	copy(keep, phones)

	if _, err := pool.Exec(ctx,
		`DELETE FROM phone_user WHERE id_user = $1 AND contact <> ALL($2)`,
		userID, keep,
	); err != nil {
		return err
	}

	existing, err := pool.Query(ctx, `SELECT contact FROM phone_user WHERE id_user = $1`, userID)
	if err != nil {
		return err
	}
	defer existing.Close()

	known := map[string]bool{}
	for existing.Next() {
		var contact string
		if err := existing.Scan(&contact); err != nil {
			return err
		}

		known[contact] = true
	}

	if err := existing.Err(); err != nil {
		return err
	}

	for _, phone := range phones {
		if known[phone] {
			continue
		}

		if _, err := pool.Exec(ctx,
			`INSERT INTO phone_user (contact, id_user) VALUES ($1, $2)`,
			phone, userID,
		); err != nil {
			return err
		}

		known[phone] = true
	}

	// The first number stamps the professional profiles, when they exist.
	var hasArsitek, hasKontraktor bool

	if err := pool.QueryRow(ctx, `SELECT exists(SELECT 1 FROM arsiteks WHERE user_id = $1)`, userID).Scan(&hasArsitek); err != nil {
		return err
	}

	if err := pool.QueryRow(ctx, `SELECT exists(SELECT 1 FROM kontraktors WHERE user_id = $1)`, userID).Scan(&hasKontraktor); err != nil {
		return err
	}

	if hasArsitek {
		if _, err := pool.Exec(ctx, `UPDATE arsiteks SET no_telp = $1 WHERE user_id = $2`, phones[0], userID); err != nil {
			return err
		}
	}

	if hasKontraktor {
		if _, err := pool.Exec(ctx, `UPDATE kontraktors SET no_telepon = $1 WHERE user_id = $2`, phones[0], userID); err != nil {
			return err
		}
	}

	return nil
}

// UpdateMeHandler serves `PUT /api/me`.
func UpdateMeHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()
		fields, files, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}

		name, _ := requireText(fields, "name", 255, failures)
		email, emailOK := requireText(fields, "email", 255, failures)
		username, usernameOK := requireText(fields, "username", 255, failures)

		if emailOK && !strings.Contains(email, "@") {
			failures.add("email", "The email field must be a valid email address.")
			emailOK = false
		}

		if emailOK {
			if taken, err := uniqueViolation(ctx, pool, "email", email, caller.UserID()); err != nil {
				slog.Error("me.update: unique email", "error", err)
				serverError(w)
				return
			} else if taken {
				failures.add("email", "The email has already been taken.")
				emailOK = false
			}
		}

		if usernameOK {
			if taken, err := uniqueViolation(ctx, pool, "username", username, caller.UserID()); err != nil {
				slog.Error("me.update: unique username", "error", err)
				serverError(w)
				return
			} else if taken {
				failures.add("username", "The username has already been taken.")
				usernameOK = false
			}
		}

		validateFile("pic", files["pic"], false, []string{"jpeg", "png", "jpg", "gif", "webp"}, 5120, failures)

		if !failures.empty() {
			failures.write(w)
			return
		}

		if _, err := pool.Exec(ctx,
			`UPDATE users SET name = $1, email = $2, username = $3, updated_at = date_trunc('second', now()) WHERE id = $4`,
			name, email, username, caller.UserID(),
		); err != nil {
			slog.Error("me.update: user", "error", err)
			serverError(w)
			return
		}

		// A `pic` upload is validated above and then left alone: Laravel
		// deletes the old file, stores a temp copy and dispatches the
		// conversion job, and the response still carries the OLD pic.

		if phoneInput, ok := fields["phone_numbers"]; ok {
			if err := syncPhoneNumbers(ctx, pool, caller.UserID(), phoneInput); err != nil {
				slog.Error("me.update: phones", "error", err)
				serverError(w)
				return
			}
		}

		user, err := loadUser(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("me.update: reload", "error", err)
			serverError(w)
			return
		}

		resource, err := userResource(ctx, pool, user, caller.UserID(), caller.IsAdmin(), updateRelations(user.Role))
		if err != nil {
			slog.Error("me.update: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Profile updated successfully")
		payload.Set("user", resource)

		writeJSON(w, http.StatusOK, payload)
	}
}

// UpdateAvatarHandler serves `POST /api/me/avatar`.
func UpdateAvatarHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		_, files, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}

		pic, present := files["pic"]
		if !present || pic == nil {
			failures.add("pic", requiredMsg("pic"))
			failures.write(w)
			return
		}

		validateFile("pic", pic, true, []string{"jpeg", "png", "jpg", "gif", "webp"}, 2048, failures)

		if !failures.empty() {
			failures.write(w)
			return
		}

		// Validated and left alone: the conversion job is async, and the
		// response names no file.
		_ = caller
		_ = pool

		payload := jsonphp.NewObject()
		payload.Set("message", "Avatar is being processed and will be updated shortly.")

		writeJSON(w, http.StatusOK, payload)
	}
}

// DeleteAvatarHandler serves `DELETE /api/me/avatar`.
func DeleteAvatarHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		// The file deletion on the public disk is unobservable in the
		// response; the row update is the contract.
		if _, err := pool.Exec(r.Context(),
			`UPDATE users SET pic = NULL, updated_at = date_trunc('second', now()) WHERE id = $1`,
			caller.UserID(),
		); err != nil {
			slog.Error("me.avatar.delete", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Avatar deleted successfully")

		writeJSON(w, http.StatusOK, payload)
	}
}

// UnreadSummaryHandler serves `GET /api/me/unread-summary`.
func UnreadSummaryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		var unreadMessages, unreadNotifications int64

		err := pool.QueryRow(ctx, `
			SELECT count(*)
			  FROM chat_messages m
			  JOIN conversations c ON c.id = m.conversation_id
			 WHERE (c.user_one_id = $1 OR c.user_two_id = $1)
			   AND m.sender_id <> $1
			   AND m.is_read = false
		`, caller.UserID()).Scan(&unreadMessages)
		if err != nil {
			slog.Error("me.unread-summary: messages", "error", err)
			serverError(w)
			return
		}

		err = pool.QueryRow(ctx, `
			SELECT count(*) FROM notifications
			 WHERE user_id = $1 AND read_at IS NULL
		`, caller.UserID()).Scan(&unreadNotifications)
		if err != nil {
			slog.Error("me.unread-summary: notifications", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("unread_messages", unreadMessages)
		payload.Set("unread_notifications", unreadNotifications)

		writeJSON(w, http.StatusOK, payload)
	}
}
