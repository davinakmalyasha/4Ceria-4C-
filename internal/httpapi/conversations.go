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

// CHAT — four routes over `conversations` + `chat_messages`.
//
//   - GET answers the caller's inbox: `{data:[{id, other_user, last_message,
//     unread_count, last_message_at}]}`, newest activity first (NULLs LAST,
//     as MySQL sorts a DESC), capped at 100. `other_user.pic` is the RAW
//     `foto` path (no asset()), resolved one query per ROLE.
//   - POST starts or returns the pair's conversation (`{data: id}`), with
//     min/max normalisation, a self-chat 400 and a staff 403.
//   - GET /{id} is participant-only (403 "Unauthorized"), marks the caller's
//     unread messages read unless a history cursor is supplied, and answers
//     50 messages plus `meta:{oldest_id, has_more}`.
//   - POST /{id}/messages appends a message, bumps `last_message_at`, and
//     notifies the recipient.

// conversationColumns is the `conversations` table order.
var conversationColumns = []string{
	"id", "user_one_id", "user_two_id", "last_message_at", "created_at", "updated_at",
}

// chatMessageColumns is the `chat_messages` table order.
var chatMessageColumns = []string{
	"id", "conversation_id", "sender_id", "content", "image", "is_read",
	"created_at", "updated_at",
}

// chatMessageSelectList casts `is_read` to a boolean-friendly form.
func chatMessageSelectList() string { return strings.Join(chatMessageColumns, ", ") }

// chatMessageImageURL is the `image_url` accessor: a temporary URL where the
// disk supports one, otherwise the public URL (relative `/storage/…` locally).
func chatMessageImageURL(value any) any {
	path, ok := value.(string)
	if !ok || path == "" {
		return nil
	}
	return "/storage/" + path
}

// chatMessageObject renders a hydrated message; `withSender` adds the full
// user payload the endpoints load.
func chatMessageObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any, withSender bool) (*jsonphp.Object, error) {
	entry := jsonphp.NewObject()
	for _, column := range chatMessageColumns {
		switch column {
		case "is_read":
			flag := false
			if value, ok := byName[column].(bool); ok {
				flag = value
			}
			entry.Set(column, flag)
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	entry.Set("image_url", chatMessageImageURL(byName["image"]))
	if withSender {
		sender, err := fullProfileUser(ctx, pool, intPtrDeref(byName["sender_id"]), false)
		if err != nil {
			return nil, err
		}
		entry.Set("sender", sender)
	}
	return entry, nil
}

// chatMessageRow reads one message.
func chatMessageRow(ctx context.Context, pool *pgxpool.Pool, messageID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+chatMessageSelectList()+`
		FROM chat_messages WHERE id = $1`, messageID)
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

// chatAvatarTables is resolveAvatars()' role → table map (note `courier`).
var chatAvatarTables = map[string]string{
	"arsitek": "arsiteks", "kontraktor": "kontraktors", "notaris": "notaris_profiles",
	"interior": "interior_profiles", "project_manager": "project_managers",
	"courier": "courier_profiles", "supplier": "suppliers",
}

// ConversationsIndexHandler serves `GET /api/conversations`.
func ConversationsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(conversationColumns, ", ")+`
			FROM conversations
			WHERE user_one_id = $1 OR user_two_id = $1
			ORDER BY last_message_at DESC NULLS LAST, id ASC
			LIMIT 100`, caller.UserID())
		if err != nil {
			slog.Error("conversations: query", "error", err)
			serverError(w)
			return
		}

		type conversationRow struct {
			byName map[string]any
		}
		loaded := make([]conversationRow, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				slog.Error("conversations: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			loaded = append(loaded, conversationRow{byName})
		}
		rows.Close()

		out := make([]any, 0)
		for _, conversation := range loaded {
			id := intPtrDeref(conversation.byName["id"])
			otherID := intPtrDeref(conversation.byName["user_two_id"])
			if intPtrDeref(conversation.byName["user_two_id"]) == caller.UserID() {
				otherID = intPtrDeref(conversation.byName["user_one_id"])
			}

			var (
				name     string
				username *string
				role     *string
				pic      *string
			)
			if err := pool.QueryRow(ctx, `SELECT name, username, role_type::text, pic
				FROM users WHERE id = $1`, otherID).Scan(&name, &username, &role, &pic); err != nil {
				continue // the controller drops conversations with a missing user
			}

			avatar := pic
			if role != nil {
				if table, known := chatAvatarTables[*role]; known {
					var foto *string
					if err := pool.QueryRow(ctx, `SELECT foto FROM `+table+`
						WHERE user_id = $1 AND foto IS NOT NULL LIMIT 1`, otherID).Scan(&foto); err == nil {
						avatar = foto
					}
				}
			}

			other := jsonphp.NewObject()
			other.Set("id", otherID)
			other.Set("name", name)
			other.Set("username", nullableString(username))
			other.Set("role_type", nullableString(role))
			other.Set("pic", nullableString(avatar))

			var unread int64
			_ = pool.QueryRow(ctx, `SELECT count(*) FROM chat_messages
				WHERE conversation_id = $1 AND sender_id <> $2 AND is_read = false`,
				id, caller.UserID()).Scan(&unread)

			var lastMessage any
			if lastID := func() int64 {
				var value int64
				_ = pool.QueryRow(ctx, `SELECT id FROM chat_messages WHERE conversation_id = $1
					ORDER BY id DESC LIMIT 1`, id).Scan(&value)
				return value
			}(); lastID != 0 {
				if byName, found, err := chatMessageRow(ctx, pool, lastID); err == nil && found {
					lastMessage, _ = chatMessageObject(ctx, pool, byName, false)
				}
			}

			entry := jsonphp.NewObject()
			entry.Set("id", id)
			entry.Set("other_user", other)
			if lastMessage == nil {
				entry.Set("last_message", nil)
			} else {
				entry.Set("last_message", lastMessage)
			}
			entry.Set("unread_count", unread)
			entry.Set("last_message_at", projectTimeValue(conversation.byName["last_message_at"]))
			out = append(out, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreConversationHandler serves `POST /api/conversations`.
func StoreConversationHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
		var targetID int64
		if raw, present := fields["user_id"]; !present || raw == nil {
			failures.add("user_id", "The user id field is required.")
		} else if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if err != nil || !existsID(ctx, pool, "users", parsed) {
				failures.add("user_id", "The selected user id is invalid.")
			} else {
				targetID = parsed
			}
		} else {
			failures.add("user_id", "The selected user id is invalid.")
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		if targetID == caller.UserID() {
			message(w, http.StatusBadRequest, "Cannot chat with yourself.")
			return
		}

		var targetRole string
		if err := pool.QueryRow(ctx, `SELECT role_type::text FROM users WHERE id = $1`, targetID).Scan(&targetRole); err != nil {
			message(w, http.StatusNotFound, "User not found.")
			return
		}
		admin, _ := isAdminUser(ctx, pool, targetID, targetRole)
		if targetRole == "admin" || admin {
			message(w, http.StatusForbidden, "Staff accounts cannot receive direct messages.")
			return
		}

		low := caller.UserID()
		high := targetID
		if low > high {
			low, high = high, low
		}
		var id int64
		err := pool.QueryRow(ctx, `SELECT id FROM conversations
			WHERE (user_one_id = $1 AND user_two_id = $2) OR (user_one_id = $2 AND user_two_id = $1)
			LIMIT 1`, caller.UserID(), targetID).Scan(&id)
		if err != nil {
			if err := pool.QueryRow(ctx, `INSERT INTO conversations
				(user_one_id, user_two_id, created_at, updated_at)
				VALUES ($1, $2, date_trunc('second', now()), date_trunc('second', now()))
				ON CONFLICT DO NOTHING RETURNING id`, low, high).Scan(&id); err != nil {
				// A concurrent insert won the unique pair: fetch it.
				if err := pool.QueryRow(ctx, `SELECT id FROM conversations
					WHERE user_one_id = $1 AND user_two_id = $2`, low, high).Scan(&id); err != nil {
					slog.Error("conversation store: create", "error", err)
					serverError(w)
					return
				}
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("data", id)
		writeJSON(w, http.StatusOK, payload)
	}
}

// ShowConversationHandler serves `GET /api/conversations/{conversation}`.
func ShowConversationHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("conversation")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\Conversation`, raw)
			return
		}

		var userOne, userTwo int64
		if err := pool.QueryRow(ctx, `SELECT user_one_id, user_two_id
			FROM conversations WHERE id = $1`, id).Scan(&userOne, &userTwo); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Conversation`, raw)
				return
			}
			slog.Error("conversation show: load", "error", err)
			serverError(w)
			return
		}
		if userOne != caller.UserID() && userTwo != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		beforeRaw := r.URL.Query().Get("before_id")
		var beforeID int64
		hasBefore := false
		if beforeRaw != "" {
			if parsed, err := strconv.ParseInt(beforeRaw, 10, 64); err == nil {
				beforeID = parsed
				hasBefore = true
			}
		}

		if !hasBefore {
			var unread bool
			_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM chat_messages
				WHERE conversation_id = $1 AND sender_id <> $2 AND is_read = false)`,
				id, caller.UserID()).Scan(&unread)
			if unread {
				_, _ = pool.Exec(ctx, `UPDATE chat_messages SET is_read = true,
					updated_at = date_trunc('second', now())
					WHERE conversation_id = $1 AND sender_id <> $2 AND is_read = false`,
					id, caller.UserID())
			}
		}

		query := `SELECT ` + chatMessageSelectList() + ` FROM chat_messages
			WHERE conversation_id = $1`
		args := []any{id}
		if hasBefore {
			args = append(args, beforeID)
			query += ` AND id < $2`
		}
		// The relation orders created_at ASC, and `latest()` APPENDS a second
		// DESC clause, so the ASC survives; the page is then reversed.
		query += ` ORDER BY created_at ASC, id ASC LIMIT 50`

		rows, err := pool.Query(ctx, query, args...)
		if err != nil {
			slog.Error("conversation show: messages", "error", err)
			serverError(w)
			return
		}
		messages := make([]map[string]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				slog.Error("conversation show: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			messages = append(messages, byName)
		}
		rows.Close()

		out := make([]any, 0, len(messages))
		for index := len(messages) - 1; index >= 0; index-- {
			entry, err := chatMessageObject(ctx, pool, messages[index], true)
			if err != nil {
				slog.Error("conversation show: render", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}

		countQuery := `SELECT count(*) FROM chat_messages WHERE conversation_id = $1`
		countArgs := []any{id}
		if hasBefore {
			countArgs = append(countArgs, beforeID)
			countQuery += ` AND id < $2`
		}
		var total int64
		_ = pool.QueryRow(ctx, countQuery, countArgs...).Scan(&total)

		meta := jsonphp.NewObject()
		if len(out) > 0 {
			// The ORACLE's first() runs AFTER the reverse, so this is the
			// page's NEWEST id, not its oldest.
			meta.Set("oldest_id", intPtrDeref(messages[len(messages)-1]["id"]))
		} else {
			meta.Set("oldest_id", nil)
		}
		meta.Set("has_more", total > 50)

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		payload.Set("meta", meta)
		writeJSON(w, http.StatusOK, payload)
	}
}

// SendMessageHandler serves `POST /api/conversations/{conversation}/messages`.
func SendMessageHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("conversation")
		if raw == "" {
			raw = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/messages"))
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\Conversation`, raw)
			return
		}

		var userOne, userTwo int64
		if err := pool.QueryRow(ctx, `SELECT user_one_id, user_two_id
			FROM conversations WHERE id = $1`, id).Scan(&userOne, &userTwo); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Conversation`, raw)
				return
			}
			slog.Error("message send: load", "error", err)
			serverError(w)
			return
		}
		if userOne != caller.UserID() && userTwo != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
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
		images := requestFilesNamed(r, "image")

		failures := &errorBag{}
		content := ""
		contentSet := false
		if rawContent, present := fields["content"]; present && rawContent != nil {
			if text, ok := rawContent.(string); !ok {
				failures.add("content", "The content field must be a string.")
			} else if len([]rune(text)) > 4000 {
				failures.add("content", "The content field must not be greater than 4000 characters.")
			} else {
				content = text
				contentSet = true
			}
		}
		if len(images) == 0 && !contentSet {
			failures.add("content", "The content field is required when image is not present.")
		}
		var image *galleryUpload
		if len(images) > 0 {
			image = images[0]
			if !image.isImage {
				failures.add("image", "The image field must be an image.")
			}
			switch image.ext {
			case "jpeg", "png", "jpg":
				if image.sizeBytes() > 5120*1024 {
					failures.add("image", "The image field must not be greater than 5120 kilobytes.")
				}
			default:
				failures.add("image", "The image field must be a file of type: jpeg, png, jpg.")
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		var imagePath any
		if image != nil {
			stored, err := storeVaultFile("chat_images", image.filename, image.data)
			if err != nil {
				slog.Error("message send: image", "error", err)
				serverError(w)
				return
			}
			imagePath = stored
		}

		var messageID int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO chat_messages
			(conversation_id, sender_id, content, image, is_read, created_at, updated_at)
			VALUES ($1, $2, $3, $4, false, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			id, caller.UserID(), content, imagePath).Scan(&messageID, &createdAt, &updatedAt); err != nil {
			slog.Error("message send: insert", "error", err)
			message(w, http.StatusInternalServerError, "Failed to send message.")
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE conversations SET last_message_at = date_trunc('second', now()),
			updated_at = date_trunc('second', now()) WHERE id = $1`, id); err != nil {
			slog.Error("message send: touch", "error", err)
			message(w, http.StatusInternalServerError, "Failed to send message.")
			return
		}

		recipient := userTwo
		if userTwo == caller.UserID() {
			recipient = userOne
		}

		var senderName string
		_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, caller.UserID()).Scan(&senderName)
		bodyContent := content
		if !contentSet || bodyContent == "" {
			bodyContent = "(gambar)"
		}
		if runes := []rune(bodyContent); len(runes) > 100 {
			bodyContent = string(runes[:100])
		}
		data, _ := jsonphp.Marshal(func() *jsonphp.Object {
			entry := jsonphp.NewObject()
			entry.Set("conversation_id", id)
			entry.Set("sender_id", caller.UserID())
			entry.Set("sender_name", senderName)
			return entry
		}())
		if err := insertNotificationPool(ctx, pool, recipient, "chat_message", "Pesan Baru",
			senderName+": "+bodyContent, string(data)); err != nil {
			slog.Warn("message send: notify", "error", err)
		}

		created := map[string]any{
			"id": messageID, "conversation_id": id, "sender_id": caller.UserID(),
			"content": content, "image": imagePath, "is_read": false,
			"created_at": createdAt, "updated_at": updatedAt,
		}

		// Created model: payload order, then updated_at, created_at, id, the
		// append, then the sender relation.
		entry := jsonphp.NewObject()
		for _, column := range []string{"conversation_id", "sender_id", "content", "image"} {
			entry.Set(column, projectRawValue(created[column]))
		}
		entry.Set("updated_at", projectTimeValue(updatedAt))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("id", messageID)
		entry.Set("image_url", chatMessageImageURL(imagePath))
		sender, err := fullProfileUser(ctx, pool, caller.UserID(), false)
		if err != nil {
			slog.Error("message send: sender", "error", err)
			serverError(w)
			return
		}
		entry.Set("sender", sender)

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}
