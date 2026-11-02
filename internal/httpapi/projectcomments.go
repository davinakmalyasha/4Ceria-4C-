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

// PROJECT COMMENTS — the workspace Q&A thread.
//
//   - GET comments: participant-only; every comment with its author and its
//     parent (and that parent's author). Author objects are SANITIZED: the
//     controller hides email / email_verified_at (plus the fields User
//     already hides) before serializing.
//   - POST comments: participant-only; `parent_id` must be a comment OF THIS
//     PROJECT (422 "Invalid parent comment." otherwise); the parent's author
//     is notified, or the owner when it is a top-level message; the answer is
//     a ONE-ELEMENT array holding the created comment.
//   - PUT comments/{comment}: binding 404, author only, answers the row with
//     its new message and NO relations.
//   - DELETE comments/{comment}: binding 404, author or project owner.

// commentColumns is the table order.
var commentColumns = []string{
	"id", "project_id", "user_id", "parent_id", "message", "created_at", "updated_at",
}

// commentSensitiveUserKeys mirrors the controller's makeHidden list.
var commentSensitiveUserKeys = map[string]bool{
	"email": true, "email_verified_at": true, "google_id": true,
	"two_factor_secret": true, "two_factor_recovery_codes": true,
	"bank_name": true, "bank_account_number": true, "bank_account_name": true,
	"unique_code": true,
}

// commentUserBlock renders the sanitized author.
func commentUserBlock(ctx context.Context, pool *pgxpool.Pool, userID int64) any {
	user, err := fullProfileUser(ctx, pool, userID, false)
	if err != nil || user == nil {
		return nil
	}
	object, ok := user.(*jsonphp.Object)
	if !ok {
		return user
	}
	clean := jsonphp.NewObject()
	for _, key := range object.Keys() {
		if commentSensitiveUserKeys[key] {
			continue
		}
		value, _ := object.Get(key)
		clean.Set(key, value)
	}
	return clean
}

// commentRow reads one comment.
func commentRow(ctx context.Context, pool *pgxpool.Pool, commentID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(commentColumns, ", ")+`
		FROM project_comments WHERE id = $1`, commentID)
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

// commentObject renders a comment in table order.
func commentObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range commentColumns {
		value := byName[column]
		switch column {
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// commentFull adds the sanitized author and the parent subtree.
func commentFull(ctx context.Context, pool *pgxpool.Pool, byName map[string]any) (*jsonphp.Object, error) {
	entry := commentObject(byName)
	if err := commentRelations(ctx, pool, entry, byName, false); err != nil {
		return nil, err
	}
	return entry, nil
}

// commentCreatedObject renders Eloquent\u0027s CREATED comment: the payload order
// (user_id, message, parent_id), then the relation-stamped project_id, the
// timestamps and id, then the loaded user/parent.
func commentCreatedObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any) (*jsonphp.Object, error) {
	entry := jsonphp.NewObject()
	entry.Set("user_id", projectRawValue(byName["user_id"]))
	entry.Set("message", projectRawValue(byName["message"]))
	entry.Set("parent_id", projectRawValue(byName["parent_id"]))
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	parentFirst := intPtrDeref(byName["parent_id"]) != 0
	if err := commentRelations(ctx, pool, entry, byName, parentFirst); err != nil {
		return nil, err
	}
	return entry, nil
}

// commentRelations attaches the sanitized author and the parent subtree.
func commentRelations(ctx context.Context, pool *pgxpool.Pool, entry *jsonphp.Object, byName map[string]any, parentFirst bool) error {
	author := intPtrDeref(byName["user_id"])
	if !parentFirst {
		if author != 0 {
			entry.Set("user", commentUserBlock(ctx, pool, author))
		} else {
			entry.Set("user", nil)
		}
	}

	parentID := intPtrDeref(byName["parent_id"])
	if parentID != 0 {
		parent, found, err := commentRow(ctx, pool, parentID)
		if err != nil {
			return err
		}
		if found {
			parentObject := commentObject(parent)
			parentAuthor := intPtrDeref(parent["user_id"])
			if parentAuthor != 0 {
				parentObject.Set("user", commentUserBlock(ctx, pool, parentAuthor))
			} else {
				parentObject.Set("user", nil)
			}
			entry.Set("parent", parentObject)
		} else {
			entry.Set("parent", nil)
		}
	} else {
		entry.Set("parent", nil)
	}

	if parentFirst {
		if author != 0 {
			entry.Set("user", commentUserBlock(ctx, pool, author))
		} else {
			entry.Set("user", nil)
		}
	}
	return nil
}

// commentGate mirrors authorizeProjectAccess with the controller's message.
func commentGate(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter, r *http.Request, projectID int64) (*projectViewer, bool) {
	caller, ok := CallerFrom(r.Context())
	if !ok {
		message(w, http.StatusUnauthorized, "Unauthenticated.")
		return nil, false
	}
	viewer, err := loadViewer(ctx, pool, caller)
	if err != nil {
		slog.Error("comment: viewer", "error", err)
		serverError(w)
		return nil, false
	}
	subject, err := loadSubject(ctx, pool, caller.UserID())
	if err != nil {
		slog.Error("comment: subject", "error", err)
		serverError(w)
		return nil, false
	}
	parties, err := loadProjectParties(ctx, pool, projectID)
	if err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\Project`, strconv.FormatInt(projectID, 10))
			return nil, false
		}
		slog.Error("comment: parties", "error", err)
		serverError(w)
		return nil, false
	}
	if !isParticipant(parties, subject) {
		message(w, http.StatusForbidden, "Unauthorized.")
		return nil, false
	}
	return viewer, true
}

// ProjectCommentsIndexHandler serves `GET /api/projects/{project}/comments`.
func ProjectCommentsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(commentColumns, ", ")+`
			FROM project_comments WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			slog.Error("comments: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("comments: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry, err := commentFull(ctx, pool, byName)
			if err != nil {
				slog.Error("comments: full", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("comments: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// ProjectCommentsStoreHandler serves `POST /api/projects/{project}/comments`.
func ProjectCommentsStoreHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		ctx := r.Context()
		viewer, ok := commentGate(ctx, pool, w, r, projectID)
		if !ok {
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		text, parentID := validateComment(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if parentID != nil {
			var exists bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_comments WHERE id = $1)`, *parentID).Scan(&exists); err != nil {
				slog.Error("comment store: parent exists", "error", err)
				serverError(w)
				return
			}
			if !exists {
				failures.add("parent_id", "The selected parent id is invalid.")
				failures.write(w)
				return
			}
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_comments WHERE id = $1 AND project_id = $2)`,
				*parentID, projectID).Scan(&exists); err != nil {
				slog.Error("comment store: parent", "error", err)
				serverError(w)
				return
			}
			if !exists {
				message(w, http.StatusUnprocessableEntity, "Invalid parent comment.")
				return
			}
		}

		var commentID int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_comments
			(project_id, user_id, message, parent_id, created_at, updated_at)
			VALUES ($1, $2, $3, $4, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`, projectID, viewer.id, text, parentID).Scan(&commentID); err != nil {
			slog.Error("comment store: insert", "error", err)
			serverError(w)
			return
		}

		var projectTitle string
		var ownerID int64
		_ = pool.QueryRow(ctx, `SELECT title, user_id FROM projects WHERE id = $1`, projectID).Scan(&projectTitle, &ownerID)

		// The parent's author hears about a reply; the owner hears about a
		// top-level message. Never the sender.
		target := int64(0)
		if parentID != nil {
			var parentAuthor *int64
			_ = pool.QueryRow(ctx, `SELECT user_id FROM project_comments WHERE id = $1`, *parentID).Scan(&parentAuthor)
			if parentAuthor != nil && *parentAuthor != viewer.id {
				target = *parentAuthor
			}
		} else if ownerID != viewer.id {
			target = ownerID
		}

		if target != 0 {
			var senderName string
			_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, viewer.id).Scan(&senderName)
			body := senderName + " posted a message on project \"" + projectTitle + "\"."
			if err := insertNotificationPool(ctx, pool, target, "project_message", "New Project Q&A Message", body,
				`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
				slog.Error("comment store: notify", "error", err)
			}
		}

		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "comment_posted", "Posted a comment"); err != nil {
			slog.Error("comment store: log", "error", err)
		}

		byName, found, err := commentRow(ctx, pool, commentID)
		if err != nil || !found {
			slog.Error("comment store: reload", "error", err)
			serverError(w)
			return
		}
		entry, err := commentCreatedObject(ctx, pool, byName)
		if err != nil {
			slog.Error("comment store: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", []any{entry})
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateCommentMessage is the update rule: message required|string|max:1000.
func validateCommentMessage(fields map[string]any, failures *errorBag) string {
	text := ""
	if raw, present := fields["message"]; !present || raw == nil {
		failures.add("message", "The message field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("message", "The message field must be a string.")
	} else if s == "" {
		failures.add("message", "The message field is required.")
	} else if len([]rune(s)) > 1000 {
		failures.add("message", "The message field must not be greater than 1000 characters.")
	} else {
		text = s
	}
	return text
}

// validateComment enforces message required|string|max:1000 and a nullable
// existing parent id.
func validateComment(fields map[string]any, failures *errorBag) (string, *int64) {
	text := ""
	if raw, present := fields["message"]; !present || raw == nil {
		failures.add("message", "The message field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("message", "The message field must be a string.")
	} else if s == "" {
		failures.add("message", "The message field is required.")
	} else if len([]rune(s)) > 1000 {
		failures.add("message", "The message field must not be greater than 1000 characters.")
	} else {
		text = s
	}

	var parentID *int64
	if raw, present := fields["parent_id"]; present && raw != nil {
		if textValue, ok := numericTextOf(raw); ok && isIntegerText(textValue) {
			if parsed, err := strconv.ParseInt(strings.TrimSpace(textValue), 10, 64); err == nil {
				// Existence is checked by the caller: the `exists` rule is
				// GLOBAL, the project binding has its own 422.
				parentID = &parsed
			}
		} else {
			failures.add("parent_id", "The selected parent id is invalid.")
		}
	}

	return text, parentID
}


// UpdateCommentHandler serves `PUT /api/projects/{project}/comments/{comment}`.
func UpdateCommentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		rawID := r.PathValue("comment")
		commentID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\ProjectComment`, rawID)
			return
		}

		ctx := r.Context()
		viewer, ok := commentGate(ctx, pool, w, r, projectID)
		if !ok {
			return
		}

		byName, found, err := commentRow(ctx, pool, commentID)
		if err != nil {
			slog.Error("comment update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectComment`, rawID)
			return
		}
		if rowProject, _ := byName["project_id"].(int64); rowProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}
		if author := intPtrDeref(byName["user_id"]); author != viewer.id {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		text := validateCommentMessage(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_comments SET message = $2,
			updated_at = date_trunc('second', now()) WHERE id = $1`, commentID, text); err != nil {
			slog.Error("comment update: exec", "error", err)
			serverError(w)
			return
		}

		fresh, _, err := commentRow(ctx, pool, commentID)
		if err != nil {
			slog.Error("comment update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", commentObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// DestroyCommentHandler serves
// `DELETE /api/projects/{project}/comments/{comment}`.
func DestroyCommentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}
		rawID := r.PathValue("comment")
		commentID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\ProjectComment`, rawID)
			return
		}

		ctx := r.Context()
		viewer, ok := commentGate(ctx, pool, w, r, projectID)
		if !ok {
			return
		}

		byName, found, err := commentRow(ctx, pool, commentID)
		if err != nil {
			slog.Error("comment delete: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectComment`, rawID)
			return
		}
		if rowProject, _ := byName["project_id"].(int64); rowProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			serverError(w)
			return
		}
		ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)
		author := intPtrDeref(byName["user_id"])
		if author != viewer.id && ownerID != viewer.id {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM project_comments WHERE id = $1`, commentID); err != nil {
			slog.Error("comment delete: exec", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Comment deleted")
	}
}
