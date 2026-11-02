package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// STICKY NOTES — the per-user workspace board.
//
//   - GET sticky-notes: participant-only. Only the CALLER'S notes, ordered by
//     position_index, optionally filtered by `phase_context`.
//   - POST sticky-notes: participant-only; a note filled with defaults
//     (title/content "", position 0). Answers the CREATED model: the payload
//     keys first, then the relation-stamped project_id.
//   - PUT/DELETE sticky-notes/{stickyNote}: the row's project must match the
//     path project (plain 404 "Not found") and only the author may touch it
//     (403 "Unauthorized"); update answers the model, delete a message.
//
// SHARE TOKENS — a contractor-or-owner shareable brief link.
//
// POST generates a 24-hex-character token once and answers
// {share_token, share_url} where share_url is the request origin + /brief/token.
// DELETE clears it.

// stickyNoteColumns is the table order.
var stickyNoteColumns = []string{
	"id", "project_id", "user_id", "phase_context", "title", "content",
	"position_index", "created_at", "updated_at",
}

// stickyNoteApproved returns the row in table order.
func stickyNoteObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range stickyNoteColumns {
		value := byName[column]
		switch column {
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectValueOrDefault(value))
		}
	}
	return entry
}

// projectValueOrDefault keeps strings, ints, booleans and nulls intact.
func projectValueOrDefault(value any) any {
	return projectRawValue(value)
}

// stickyNoteCreatedObject renders Eloquent's CREATED sticky note.
func stickyNoteCreatedObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range []string{"user_id", "phase_context", "title", "content", "position_index", "project_id"} {
		entry.Set(column, projectRawValue(byName[column]))
	}
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// stickyNoteRow reads one note.
func stickyNoteRow(ctx context.Context, pool *pgxpool.Pool, noteID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(stickyNoteColumns, ", ")+`
		FROM sticky_notes WHERE id = $1`, noteID)
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

// StickyNotesIndexHandler serves `GET /api/projects/{project}/sticky-notes`.
func StickyNotesIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		ctx := r.Context()
		if _, ok := commentGate(ctx, pool, w, r, projectID); !ok {
			return
		}
		caller, _ := CallerFrom(ctx)

		query := `SELECT ` + strings.Join(stickyNoteColumns, ", ") + `
			FROM sticky_notes WHERE project_id = $1 AND user_id = $2`
		args := []any{projectID, caller.UserID()}
		if phase := r.URL.Query().Get("phase_context"); phase != "" {
			args = append(args, phase)
			query += ` AND phase_context = $3`
		}
		query += ` ORDER BY position_index`

		rows, err := pool.Query(ctx, query, args...)
		if err != nil {
			slog.Error("sticky index: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("sticky index: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			out = append(out, stickyNoteObject(byName))
		}
		if err := rows.Err(); err != nil {
			slog.Error("sticky index: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreStickyNoteHandler serves `POST /api/projects/{project}/sticky-notes`.
func StoreStickyNoteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		ctx := r.Context()
		if _, ok := commentGate(ctx, pool, w, r, projectID); !ok {
			return
		}
		caller, _ := CallerFrom(ctx)

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		input := validateStickyNote(formFields, false, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var noteID int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO sticky_notes
			(project_id, user_id, phase_context, title, content, position_index, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			projectID, caller.UserID(), input.phaseContext, input.title, input.content, input.positionIndex).
			Scan(&noteID, &createdAt, &updatedAt); err != nil {
			slog.Error("sticky store: insert", "error", err)
			serverError(w)
			return
		}

		byName := map[string]any{
			"id": noteID, "project_id": projectID, "user_id": caller.UserID(),
			"phase_context": input.phaseContext, "title": input.title,
			"content": input.content, "position_index": input.positionIndex,
			"created_at": createdAt, "updated_at": updatedAt,
		}

		payload := jsonphp.NewObject()
		payload.Set("data", stickyNoteCreatedObject(byName))
		writeJSON(w, http.StatusOK, payload)
	}
}

// stickyNoteInput is the validated payload.
type stickyNoteInput struct {
	phaseContext  any
	title         string
	content       string
	positionIndex int64
}

// validateStickyNote applies the store (phase_context allowed) or update
// (title/content/position only) rules.
func validateStickyNote(fields map[string]any, update bool, failures *errorBag) stickyNoteInput {
	input := stickyNoteInput{}

	if raw, present := fields["phase_context"]; present && raw != nil && !update {
		if s, ok := raw.(string); ok {
			if len([]rune(s)) > 100 {
				failures.add("phase_context", "The phase context field must not be greater than 100 characters.")
			} else {
				input.phaseContext = s
			}
		} else {
			failures.add("phase_context", "The phase context field must be a string.")
		}
	}

	if raw, present := fields["title"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("title", "The title field must be a string.")
		} else if len([]rune(s)) > 255 {
			failures.add("title", "The title field must not be greater than 255 characters.")
		} else {
			input.title = s
		}
	}

	if raw, present := fields["content"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("content", "The content field must be a string.")
		} else {
			input.content = s
		}
	}

	if raw, present := fields["position_index"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
				input.positionIndex = parsed
			}
		} else {
			failures.add("position_index", "The position index field must be an integer.")
		}
	}

	return input
}

// UpdateStickyNoteHandler serves `PUT /api/projects/{project}/sticky-notes/{stickyNote}`.
func UpdateStickyNoteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		rawID := r.PathValue("stickyNote")
		noteID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\StickyNote`, rawID)
			return
		}
		ctx := r.Context()
		caller, ok := CallerFrom(ctx)
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		byName, found, err := stickyNoteRow(ctx, pool, noteID)
		if err != nil {
			slog.Error("sticky update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\StickyNote`, rawID)
			return
		}
		if intPtrDeref(byName["project_id"]) != projectID {
			message(w, http.StatusNotFound, "Not found")
			return
		}
		if intPtrDeref(byName["user_id"]) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		input := validateStickyNote(formFields, true, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		sets := []string{"updated_at = date_trunc('second', now())"}
		args := []any{noteID}
		if _, present := formFields["title"]; present {
			args = append(args, input.title)
			sets = append(sets, "title = $"+strconv.Itoa(len(args)))
		}
		if _, present := formFields["content"]; present {
			args = append(args, input.content)
			sets = append(sets, "content = $"+strconv.Itoa(len(args)))
		}
		if _, present := formFields["position_index"]; present {
			args = append(args, input.positionIndex)
			sets = append(sets, "position_index = $"+strconv.Itoa(len(args)))
		}

		if _, err := pool.Exec(ctx, `UPDATE sticky_notes SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("sticky update: exec", "error", err)
			serverError(w)
			return
		}

		fresh, _, err := stickyNoteRow(ctx, pool, noteID)
		if err != nil {
			slog.Error("sticky update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", stickyNoteObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// DestroyStickyNoteHandler serves
// `DELETE /api/projects/{project}/sticky-notes/{stickyNote}`.
func DestroyStickyNoteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		rawID := r.PathValue("stickyNote")
		noteID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\StickyNote`, rawID)
			return
		}
		ctx := r.Context()
		caller, ok := CallerFrom(ctx)
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		byName, found, err := stickyNoteRow(ctx, pool, noteID)
		if err != nil {
			slog.Error("sticky delete: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\StickyNote`, rawID)
			return
		}
		if intPtrDeref(byName["project_id"]) != projectID {
			message(w, http.StatusNotFound, "Not found")
			return
		}
		if intPtrDeref(byName["user_id"]) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM sticky_notes WHERE id = $1`, noteID); err != nil {
			slog.Error("sticky delete: exec", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Deleted successfully")
	}
}

// shareTokenGate admits the owner or the hired contractor.
func shareTokenGate(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64) bool {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		return false
	}
	project := projectColumnsByName(fields, values)
	if ownerID, _ := project["user_id"].(int64); ownerID == viewer.id {
		return true
	}
	if viewer.role != "kontraktor" {
		return false
	}
	selected, _ := project["selected_kontraktor_id"].(int64)
	own, ok := viewer.profiles["kontraktor"]
	return ok && selected != 0 && own == selected
}

// GenerateShareTokenHandler serves `POST /api/projects/{project}/share-token`.
func GenerateShareTokenHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		ctx := r.Context()
		caller, ok := CallerFrom(ctx)
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("share-token: viewer", "error", err)
			serverError(w)
			return
		}
		if !shareTokenGate(ctx, pool, viewer, projectID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		var token *string
		if err := pool.QueryRow(ctx, `SELECT share_token FROM projects WHERE id = $1`, projectID).Scan(&token); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("share-token: read", "error", err)
			serverError(w)
			return
		}
		if token == nil || *token == "" {
			var raw [12]byte
			if _, err := rand.Read(raw[:]); err != nil {
				slog.Error("share-token: random", "error", err)
				serverError(w)
				return
			}
			generated := hex.EncodeToString(raw[:])
			if _, err := pool.Exec(ctx, `UPDATE projects SET share_token = $2,
				updated_at = date_trunc('second', now()) WHERE id = $1`, projectID, generated); err != nil {
				slog.Error("share-token: write", "error", err)
				serverError(w)
				return
			}
			token = &generated
		}

		payload := jsonphp.NewObject()
		payload.Set("share_token", *token)
		payload.Set("share_url", assetBaseOf(ctx)+"/brief/"+*token)
		writeJSON(w, http.StatusOK, payload)
	}
}

// RevokeShareTokenHandler serves `DELETE /api/projects/{project}/share-token`.
func RevokeShareTokenHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		ctx := r.Context()
		caller, ok := CallerFrom(ctx)
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("share-revoke: viewer", "error", err)
			serverError(w)
			return
		}
		if !shareTokenGate(ctx, pool, viewer, projectID) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE projects SET share_token = NULL,
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("share-revoke: write", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Share link revoked.")
	}
}


// NOTIFICATION PREFERENCES — per-user, per-channel toggles.
//
// GET answers {preferences, always_on, channels}; `preferences` groups rows
// by TYPE (`*` for the null blanket row) and then by channel, each with
// {enabled, digest, quiet_hours_start, quiet_hours_end} where the quiet hours
// render as H:i.
//
// PUT upserts one (user, type, channel) row. A type in ALWAYS_ON (money and
// arbitration) is refused with a 422 naming the type; the answer is
// {message, data} with the raw model.
//
// DELETE removes the matching row (type present → that type, absent → the
// blanket null row) and answers a message.

// notificationPreferenceChannels is CHANNELS, in order.
var notificationPreferenceChannels = []string{"inapp", "webpush", "email", "whatsapp"}

// notificationPreferenceAlwaysOn is ALWAYS_ON, in order.
var notificationPreferenceAlwaysOn = []string{
	"dispute_opened", "dispute_reply", "dispute_resolved",
	"payment_verified", "payment_rejected", "payment_disputed",
	"project_invitation", "bid_accepted", "pm_hire_initiated",
	"contract_terminated", "professional_resigned",
	"warranty_claim", "snag_overdue",
}

// notificationPreferenceObject renders a preference row in table order.
func notificationPreferenceObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range []string{
		"id", "user_id", "type", "channel", "enabled",
		"quiet_hours_start", "quiet_hours_end", "digest", "created_at", "updated_at",
	} {
		value := byName[column]
		switch column {
		case "enabled":
			boolean := false
			if typed, ok := value.(bool); ok {
				boolean = typed
			}
			entry.Set(column, boolean)
		case "quiet_hours_start", "quiet_hours_end":
			entry.Set(column, preferenceClock(value))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// preferenceClock renders a datetime cast with format('H:i'), or null.
func preferenceClock(value any) any {
	if value == nil {
		return nil
	}
	if typed, ok := value.(time.Time); ok {
		return typed.UTC().Format("15:04")
	}
	if text, ok := value.(string); ok {
		text = strings.TrimSpace(text)
		if len(text) >= 16 {
			return text[11:16]
		}
		if len(text) == 5 {
			return text
		}
	}
	return nil
}

// notificationPreferenceCreatedObject renders Eloquent's CREATED preference:
// updateOrCreate fills the match attributes first (user_id, type, channel),
// then the values (enabled, digest, quiet hours), and save stamps updated_at
// BEFORE created_at.
func notificationPreferenceCreatedObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range []string{
		"user_id", "type", "channel", "enabled", "digest",
		"quiet_hours_start", "quiet_hours_end",
	} {
		value := byName[column]
		switch column {
		case "enabled":
			boolean := false
			if typed, ok := value.(bool); ok {
				boolean = typed
			}
			entry.Set(column, boolean)
		case "quiet_hours_start", "quiet_hours_end":
			entry.Set(column, preferenceClock(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}
// NotificationPreferencesIndexHandler serves `GET /api/notification-preferences`.
func NotificationPreferencesIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		rows, err := pool.Query(ctx, `SELECT id, user_id, type, channel, enabled,
			to_char(quiet_hours_start, 'HH24:MI') AS quiet_hours_start,
			to_char(quiet_hours_end, 'HH24:MI') AS quiet_hours_end,
			digest, created_at, updated_at
			FROM notification_preferences WHERE user_id = $1
			ORDER BY type ASC NULLS FIRST`, caller.UserID())
		if err != nil {
			slog.Error("prefs: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		grouped := jsonphp.NewObject()
		preferenceCount := 0
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("prefs: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}

			preferenceCount++
			typeKey, _ := byName["type"].(string)
			if byName["type"] == nil || typeKey == "" {
				typeKey = "*"
			}
			channel, _ := byName["channel"].(string)

			bucket, present := grouped.Get(typeKey)
			var bucketObject *jsonphp.Object
			if present {
				bucketObject, _ = bucket.(*jsonphp.Object)
			}
			if bucketObject == nil {
				bucketObject = jsonphp.NewObject()
				grouped.Set(typeKey, bucketObject)
			}

			entry := jsonphp.NewObject()
			enabled := false
			if typed, ok := byName["enabled"].(bool); ok {
				enabled = typed
			}
			entry.Set("enabled", enabled)
			entry.Set("digest", projectRawValue(byName["digest"]))
			entry.Set("quiet_hours_start", preferenceClock(byName["quiet_hours_start"]))
			entry.Set("quiet_hours_end", preferenceClock(byName["quiet_hours_end"]))
			bucketObject.Set(channel, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("prefs: rows", "error", err)
			serverError(w)
			return
		}

		alwaysOn := make([]any, 0, len(notificationPreferenceAlwaysOn))
		for _, kind := range notificationPreferenceAlwaysOn {
			alwaysOn = append(alwaysOn, kind)
		}
		channels := make([]any, 0, len(notificationPreferenceChannels))
		for _, channel := range notificationPreferenceChannels {
			channels = append(channels, channel)
		}

		payload := jsonphp.NewObject()
		var preferences any = grouped
		if preferenceCount == 0 {
			// PHP's empty array encodes as [], not {}.
			preferences = []any{}
		}
		payload.Set("preferences", preferences)
		payload.Set("always_on", alwaysOn)
		payload.Set("channels", channels)
		writeJSON(w, http.StatusOK, payload)
	}
}

// UpdateNotificationPreferenceHandler serves
// `PUT /api/notification-preferences`.
func UpdateNotificationPreferenceHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		kind, channel, enabled, digest, quietStart, quietEnd, typeSet := validatePreference(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if typeSet && isAlwaysOnType(kind) {
			message(w, http.StatusUnprocessableEntity,
				"Notifications of type '"+kind+"' cover money movement or arbitration and cannot be disabled.")
			return
		}

		var noteType any
		if typeSet {
			noteType = kind
		}

		// updateOrCreate on (user_id, type, channel).
		var preferenceID int64
		inserted := false
		err := pool.QueryRow(ctx, `SELECT id FROM notification_preferences
			WHERE user_id = $1 AND channel = $2 AND type IS NOT DISTINCT FROM $3`,
			caller.UserID(), channel, noteType).Scan(&preferenceID)
		if err == nil {
			if _, err := pool.Exec(ctx, `UPDATE notification_preferences SET enabled = $2, digest = $3,
				quiet_hours_start = $4::time, quiet_hours_end = $5::time, updated_at = date_trunc('second', now())
				WHERE id = $1`, preferenceID, enabled, digest, quietStart, quietEnd); err != nil {
				slog.Error("prefs: update", "error", err)
				serverError(w)
				return
			}
		} else {
			inserted = true
			if err := pool.QueryRow(ctx, `INSERT INTO notification_preferences
				(user_id, type, channel, enabled, digest, quiet_hours_start, quiet_hours_end, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6::time, $7::time, date_trunc('second', now()), date_trunc('second', now()))
				RETURNING id`,
				caller.UserID(), noteType, channel, enabled, digest, quietStart, quietEnd).Scan(&preferenceID); err != nil {
				slog.Error("prefs: insert", "error", err)
				serverError(w)
				return
			}
		}

		var byName map[string]any
		{
			rows, err := pool.Query(ctx, `SELECT id, user_id, type, channel, enabled,
				to_char(quiet_hours_start, 'HH24:MI') AS quiet_hours_start,
				to_char(quiet_hours_end, 'HH24:MI') AS quiet_hours_end,
				digest, created_at, updated_at
				FROM notification_preferences WHERE id = $1`, preferenceID)
			if err != nil {
				slog.Error("prefs: reload", "error", err)
				serverError(w)
				return
			}
			defer rows.Close()
			if rows.Next() {
				fields := fieldNames(rows)
				values, err := scanRow(rows, len(fields))
				if err != nil {
					slog.Error("prefs: reload scan", "error", err)
					serverError(w)
					return
				}
				byName = map[string]any{}
				for i, column := range fields {
					byName[column] = values[i]
				}
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Notification preference saved.")
		if byName == nil {
			payload.Set("data", nil)
		} else if inserted {
			payload.Set("data", notificationPreferenceCreatedObject(byName))
		} else {
			payload.Set("data", notificationPreferenceObject(byName))
		}
		writeJSON(w, http.StatusOK, payload)
	}
}

// isAlwaysOnType reports membership in ALWAYS_ON.
func isAlwaysOnType(kind string) bool {
	for _, always := range notificationPreferenceAlwaysOn {
		if always == kind {
			return true
		}
	}
	return false
}

// validatePreference enforces the update rules.
func validatePreference(fields map[string]any, failures *errorBag) (string, string, bool, string, any, any, bool) {
	kind := ""
	typeSet := false
	if raw, present := fields["type"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("type", "The type field must be a string.")
		} else if len([]rune(s)) > 60 {
			failures.add("type", "The type field must not be greater than 60 characters.")
		} else if s != "" {
			kind = s
			typeSet = true
		}
	}

	channel := ""
	if raw, present := fields["channel"]; !present || raw == nil {
		failures.add("channel", "The channel field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("channel", "The selected channel is invalid.")
	} else {
		valid := false
		for _, candidate := range notificationPreferenceChannels {
			if candidate == s {
				valid = true
				break
			}
		}
		if !valid {
			failures.add("channel", "The selected channel is invalid.")
		} else {
			channel = s
		}
	}

	enabled := false
	if raw, present := fields["enabled"]; !present || raw == nil {
		failures.add("enabled", "The enabled field is required.")
	} else if parsed, ok := laravelBoolean(raw); ok {
		enabled = parsed
	} else {
		failures.add("enabled", "The enabled field must be true or false.")
	}

	digest := "none"
	if raw, present := fields["digest"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("digest", "The selected digest is invalid.")
		} else if s != "none" && s != "daily" && s != "weekly" {
			failures.add("digest", "The selected digest is invalid.")
		} else {
			digest = s
		}
	}

	var quietStart, quietEnd any
	for _, pair := range []struct {
		key  string
		dest *any
	}{
		{"quiet_hours_start", &quietStart},
		{"quiet_hours_end", &quietEnd},
	} {
		if raw, present := fields[pair.key]; present && raw != nil {
			if s, ok := raw.(string); !ok {
				failures.add(pair.key, "The "+strings.ReplaceAll(pair.key, "_", " ")+" field must match the format H:i.")
			} else if !validClock(s) {
				failures.add(pair.key, "The "+strings.ReplaceAll(pair.key, "_", " ")+" field must match the format H:i.")
			} else {
				*pair.dest = s
			}
		}
	}

	return kind, channel, enabled, digest, quietStart, quietEnd, typeSet
}

// validClock reports H:i (00:00–23:59).
func validClock(text string) bool {
	if len(text) != 5 || text[2] != ':' {
		return false
	}
	hours, err := strconv.Atoi(text[:2])
	if err != nil || hours < 0 || hours > 23 {
		return false
	}
	minutes, err := strconv.Atoi(text[3:])
	if err != nil || minutes < 0 || minutes > 59 {
		return false
	}
	return true
}

// DestroyNotificationPreferenceHandler serves
// `DELETE /api/notification-preferences`.
func DestroyNotificationPreferenceHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		// DELETE bodies may arrive as query parameters.
		for _, key := range []string{"type", "channel"} {
			if _, present := formFields[key]; !present {
				if value := r.URL.Query().Get(key); value != "" {
					formFields[key] = value
				}
			}
		}

		failures := &errorBag{}
		kind, channel, _, _, _, _, typeSet := validatePreferenceDelete(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var noteType any
		if typeSet {
			noteType = kind
		}
		if _, err := pool.Exec(ctx, `DELETE FROM notification_preferences
			WHERE user_id = $1 AND channel = $2 AND type IS NOT DISTINCT FROM $3`,
			caller.UserID(), channel, noteType); err != nil {
			slog.Error("prefs: delete", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Preference reset to default.")
	}
}

// validatePreferenceDelete enforces type nullable|string|max:60 and
// channel required|in:CHANNELS.
func validatePreferenceDelete(fields map[string]any, failures *errorBag) (string, string, bool, string, any, any, bool) {
	kind := ""
	typeSet := false
	if raw, present := fields["type"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("type", "The type field must be a string.")
		} else if len([]rune(s)) > 60 {
			failures.add("type", "The type field must not be greater than 60 characters.")
		} else if s != "" {
			kind = s
			typeSet = true
		}
	}

	channel := ""
	if raw, present := fields["channel"]; !present || raw == nil {
		failures.add("channel", "The channel field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("channel", "The selected channel is invalid.")
	} else {
		valid := false
		for _, candidate := range notificationPreferenceChannels {
			if candidate == s {
				valid = true
				break
			}
		}
		if !valid {
			failures.add("channel", "The selected channel is invalid.")
		} else {
			channel = s
		}
	}

	return kind, channel, false, "", nil, nil, typeSet
}

// MarkNotificationReadHandler serves
// `POST /api/notifications/{notification}/read`.
func MarkNotificationReadHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawID := r.PathValue("notification")
		if rawID == "" {
			rawID = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/read"))
		}
		notificationID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Notification`, rawID)
			return
		}
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		var ownerID int64
		if err := pool.QueryRow(ctx, `SELECT user_id FROM notifications WHERE id = $1`, notificationID).Scan(&ownerID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Notification`, rawID)
				return
			}
			slog.Error("notif read: load", "error", err)
			serverError(w)
			return
		}
		if ownerID != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE notifications SET read_at = date_trunc('second', now()),
			updated_at = date_trunc('second', now()) WHERE id = $1`, notificationID); err != nil {
			slog.Error("notif read: update", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Notification marked as read")
	}
}

// MarkAllNotificationsReadHandler serves `POST /api/notifications/read-all`.
func MarkAllNotificationsReadHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		if _, err := pool.Exec(ctx, `UPDATE notifications SET read_at = date_trunc('second', now()),
			updated_at = date_trunc('second', now()) WHERE user_id = $1 AND read_at IS NULL`,
			caller.UserID()); err != nil {
			slog.Error("notif read-all: update", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "All notifications marked as read")
	}
}

// BroadcastPhaseHandler serves `POST /api/projects/{project}/broadcast-phase`.
//
// Owner or assigned PM publishes a bidding role. The role is APPENDED to
// `published_bidding_roles` when absent (a no-op otherwise), the activity
// line is written, and the answer is the PLAIN resource — no relations
// loaded, so every whenLoaded block is absent.
func BroadcastPhaseHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		ctx := r.Context()
		caller, ok := CallerFrom(ctx)
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("broadcast: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("broadcast: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(fields, values)
		ownerID, _ := project["user_id"].(int64)
		var pmProfile *int64
		if id, ok := project["pm_id"].(int64); ok {
			pmProfile = &id
		}
		if viewer.id != ownerID && !verifyAssignedPM(viewer, pmProfile) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		role := validateBroadcastRole(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		rawList := jsonList(project["published_bidding_roles"])
		present := false
		for _, item := range rawList {
			if text, ok := item.(string); ok && text == role {
				present = true
				break
			}
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("broadcast: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if !present {
			rawList = append(rawList, role)
			encoded, err := jsonphp.Marshal(rawList)
			if err != nil {
				serverError(w)
				return
			}
			if _, err := tx.Exec(ctx, `UPDATE projects SET published_bidding_roles = $2::jsonb,
				updated_at = date_trunc('second', now()) WHERE id = $1`, projectID, string(encoded)); err != nil {
				slog.Error("broadcast: update", "error", err)
				serverError(w)
				return
			}
			if err := insertActivityLog(ctx, tx, projectID, viewer.id, "phase_broadcast",
				"Bidding for "+role+" phase was manually broadcasted to the 4C Board."); err != nil {
				slog.Error("broadcast: log", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("broadcast: commit", "error", err)
			serverError(w)
			return
		}

		freshFields, freshValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("broadcast: reload", "error", err)
			serverError(w)
			return
		}
		// Every project-nested route carries budget_summary (the resource's
		// when() checks ('project')).
		entry, err := projectResource(ctx, pool, freshFields, freshValues, viewer, projectLoad{budgetSummary: true}, nil)
		if err != nil {
			slog.Error("broadcast: render", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateBroadcastRole enforces role required|in:six roles.
func validateBroadcastRole(fields map[string]any, failures *errorBag) string {
	raw, present := fields["role"]
	if !present || raw == nil {
		failures.add("role", "The role field is required.")
		return ""
	}
	text, ok := raw.(string)
	if !ok {
		failures.add("role", "The selected role is invalid.")
		return ""
	}
	switch text {
	case "arsitek", "kontraktor", "notaris", "interior", "structural", "mep":
		return text
	}
	failures.add("role", "The selected role is invalid.")
	return ""
}
