package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT DISPUTES — the user-facing thread (admin routes live in
// disputes.go).
//
//   - GET disputes: participants only, newest first, each with opener
//     {id,name,pic}, resolver {id,name} and the thread (messages ordered by
//     created_at, each with its author's {id,name,pic}).
//   - POST disputes: participants open a dispute; one open dispute per
//     project (409), payments freeze until an admin resolves it.
//   - GET disputes/{dispute}: the same shape, bound to the project (404).
//   - POST disputes/{dispute}/reply: participants, OPEN only; optional
//     evidence on the vault disk; answers the CREATED message with its user.
//
// `payment_type` is a short code (`termin`, `arsitek_bid`, …). PostgreSQL
// stores it as `payment_type_id` in the ledger registry; the responses
// resolve it back to the short code.

// disputeCategories is DisputeService::CATEGORIES.
var disputeCategories = map[string]bool{
	"payment": true, "quality": true, "termination": true, "delay": true, "other": true,
}

// disputePaymentTypes is DisputeService::PAYMENT_TYPES.
var disputePaymentTypes = map[string]bool{
	"termin": true, "addendum": true, "material": true,
	"arsitek_bid": true, "kontraktor_bid": true, "notaris_bid": true, "interior_bid": true,
	"pm_bid": true, "structural_bid": true, "mep_bid": true,
}

// disputeParticipantGate mirrors authorizeParticipant.
func disputeParticipantGate(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter, r *http.Request, projectID int64) (*projectViewer, bool) {
	caller, ok := CallerFrom(r.Context())
	if !ok {
		message(w, http.StatusUnauthorized, "Unauthenticated.")
		return nil, false
	}

	viewer, err := loadViewer(ctx, pool, caller)
	if err != nil {
		slog.Error("dispute: viewer", "error", err)
		serverError(w)
		return nil, false
	}

	subject, err := loadSubject(ctx, pool, caller.UserID())
	if err != nil {
		slog.Error("dispute: subject", "error", err)
		serverError(w)
		return nil, false
	}
	parties, err := loadProjectParties(ctx, pool, projectID)
	if err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\Project`, strconv.FormatInt(projectID, 10))
			return nil, false
		}
		slog.Error("dispute: parties", "error", err)
		serverError(w)
		return nil, false
	}
	if !isParticipant(parties, subject) {
		message(w, http.StatusForbidden, "Unauthorized. Only project participants can view disputes.")
		return nil, false
	}

	return viewer, true
}

// disputeDetail renders one dispute with its relations.
func disputeDetail(ctx context.Context, pool *pgxpool.Pool, disputeID int64) (*jsonphp.Object, error) {
	row, err := readDisputeRow(ctx, pool, disputeID)
	if err != nil {
		return nil, err
	}

	var openerID int64
	var openerName string
	var openerPic *string
	if err := pool.QueryRow(ctx, `SELECT id, name, pic FROM users WHERE id = $1`,
		mustIntValue(row, "opened_by")).Scan(&openerID, &openerName, &openerPic); err != nil {
		return nil, err
	}
	opener := jsonphp.NewObject()
	opener.Set("id", openerID)
	opener.Set("name", openerName)
	opener.Set("pic", nullableString(openerPic))
	row.Set("opener", opener)

	if resolvedBy, ok := row.Get("resolved_by"); ok {
		if id, isInt := resolvedBy.(int64); isInt && id != 0 {
			var name *string
			if err := pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, id).Scan(&name); err == nil {
				resolver := jsonphp.NewObject()
				resolver.Set("id", id)
				resolver.Set("name", nullableString(name))
				row.Set("resolver", resolver)
			} else {
				row.Set("resolver", nil)
			}
		} else {
			row.Set("resolver", nil)
		}
	} else {
		row.Set("resolver", nil)
	}

	messages, err := disputeMessages(ctx, pool, disputeID)
	if err != nil {
		return nil, err
	}
	row.Set("messages", messages)

	return row, nil
}

// disputeMessages reads the thread with its authors.
func disputeMessages(ctx context.Context, pool *pgxpool.Pool, disputeID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `
		SELECT m.id, m.dispute_id, m.user_id, m.body, m.evidence_path,
		       m.evidence_original_name, m.created_at, m.updated_at,
		       u.id, u.name, u.pic
		  FROM dispute_messages m
		  JOIN users u ON u.id = m.user_id
		 WHERE m.dispute_id = $1
		 ORDER BY m.created_at ASC, m.id ASC
	`, disputeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var (
			id, disputeID, userID        int64
			body                         string
			evidencePath, evidenceName   *string
			createdAt, updatedAt         *time.Time
			authorID                     int64
			authorName                   string
			authorPic                    *string
		)
		if err := rows.Scan(&id, &disputeID, &userID, &body, &evidencePath,
			&evidenceName, &createdAt, &updatedAt, &authorID, &authorName, &authorPic); err != nil {
			return nil, err
		}

		messageObject := jsonphp.NewObject()
		messageObject.Set("id", id)
		messageObject.Set("dispute_id", disputeID)
		messageObject.Set("user_id", userID)
		messageObject.Set("body", body)
		messageObject.Set("evidence_path", nullableString(evidencePath))
		messageObject.Set("evidence_original_name", nullableString(evidenceName))
		messageObject.Set("created_at", carbon(createdAt))
		messageObject.Set("updated_at", carbon(updatedAt))

		author := jsonphp.NewObject()
		author.Set("id", authorID)
		author.Set("name", authorName)
		author.Set("pic", nullableString(authorPic))
		messageObject.Set("user", author)

		out = append(out, messageObject)
	}

	return out, rows.Err()
}

// mustIntValue reads an integer attribute from a rendered row.
func mustIntValue(row *jsonphp.Object, key string) int64 {
	if value, ok := row.Get(key); ok {
		if id, isInt := value.(int64); isInt {
			return id
		}
	}
	return 0
}

// ProjectDisputesIndexHandler serves `GET /api/projects/{project}/disputes`.
func ProjectDisputesIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		ctx := r.Context()
		if _, ok := disputeParticipantGate(ctx, pool, w, r, projectID); !ok {
			return
		}

		rows, err := pool.Query(ctx, `SELECT id FROM project_disputes
			WHERE project_id = $1 ORDER BY created_at DESC, id DESC`, projectID)
		if err != nil {
			slog.Error("disputes: query", "error", err)
			serverError(w)
			return
		}
		ids := make([]int64, 0)
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				slog.Error("disputes: scan", "error", err)
				serverError(w)
				return
			}
			ids = append(ids, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			slog.Error("disputes: rows", "error", err)
			serverError(w)
			return
		}

		out := make([]any, 0, len(ids))
		for _, id := range ids {
			entry, err := disputeDetail(ctx, pool, id)
			if err != nil {
				slog.Error("disputes: detail", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// ProjectDisputeShowHandler serves `GET /api/projects/{project}/disputes/{dispute}`.
func ProjectDisputeShowHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		disputeRaw := r.PathValue("dispute")
		disputeID, err := strconv.ParseInt(disputeRaw, 10, 64)
		if err != nil || disputeRaw == "" {
			modelNotFound(w, `App\Models\ProjectDispute`, disputeRaw)
			return
		}

		ctx := r.Context()
		if _, ok := disputeParticipantGate(ctx, pool, w, r, projectID); !ok {
			return
		}

		var disputeProject int64
		if err := pool.QueryRow(ctx, `SELECT project_id FROM project_disputes WHERE id = $1`, disputeID).Scan(&disputeProject); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectDispute`, disputeRaw)
				return
			}
			slog.Error("dispute show: row", "error", err)
			serverError(w)
			return
		}
		if disputeProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		entry, err := disputeDetail(ctx, pool, disputeID)
		if err != nil {
			slog.Error("dispute show: detail", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// disputeStoreInput is the validated opener payload.
type disputeStoreInput struct {
	category       string
	title          string
	description    string
	disputedAmount *string
	paymentType    *string
	paymentID      *int64
}

// ProjectDisputeStoreHandler serves `POST /api/projects/{project}/disputes`.
func ProjectDisputeStoreHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		ctx := r.Context()
		viewer, ok := disputeParticipantGate(ctx, pool, w, r, projectID)
		if !ok {
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		input := validateDisputeStore(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if (input.paymentType == nil) != (input.paymentID == nil) {
			message(w, http.StatusUnprocessableEntity, "payment_type and payment_id must be provided together.")
			return
		}

		var existingID int64
		var existingTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes
			WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&existingID, &existingTitle); err == nil {
			message(w, http.StatusConflict,
				"Project already has open dispute #"+strconv.FormatInt(existingID, 10)+" (\""+existingTitle+"\"). Payments stay frozen until it is resolved.")
			return
		}

		var paymentTypeID *int64
		if input.paymentType != nil {
			bySpelling, _, err := registryIDs(ctx, pool)
			if err != nil {
				slog.Error("dispute store: registry", "error", err)
				serverError(w)
				return
			}
			if id, ok := bySpelling[*input.paymentType]; ok {
				paymentTypeID = &id
			}
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("dispute store: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var disputeID int64
		var createdAt, updatedAt any
		var amount any
		if input.disputedAmount != nil {
			amount = *input.disputedAmount
		}
		if err := tx.QueryRow(ctx, `INSERT INTO project_disputes
			(project_id, opened_by, termination_id, category, title, description,
			 disputed_amount, payment_type_id, payment_id, status, created_at, updated_at)
			VALUES ($1, $2, NULL, $3, $4, $5, $6::numeric, $7, $8, 'open',
			 date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			projectID, viewer.id, input.category, input.title, input.description,
			amount, paymentTypeID, input.paymentID).Scan(&disputeID, &createdAt, &updatedAt); err != nil {
			slog.Error("dispute store: insert", "error", err)
			serverError(w)
			return
		}

		var userName string
		_ = tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, viewer.id).Scan(&userName)

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "dispute_opened",
			"Sengketa \""+input.title+"\" dibuka oleh "+userName+". Pembayaran dibekukan sampai diselesaikan admin."); err != nil {
			slog.Error("dispute store: log", "error", err)
			serverError(w)
			return
		}

		var projectTitle string
		_ = tx.QueryRow(ctx, `SELECT title FROM projects WHERE id = $1`, projectID).Scan(&projectTitle)

		if err := tx.Commit(ctx); err != nil {
			slog.Error("dispute store: commit", "error", err)
			serverError(w)
			return
		}

		disputeBody := "\"" + input.title + "\" was opened on \"" + projectTitle + "\". All project payments are frozen until an admin resolves the dispute."
		insertDisputeNotifications(ctx, pool, projectID, "dispute_opened", "Dispute Opened — Payments Frozen",
			disputeBody, `{"project_id":`+strconv.FormatInt(projectID, 10)+`,"dispute_id":`+strconv.FormatInt(disputeID, 10)+`}`, viewer.id)

		// The CREATED model, in create order.
		entry := jsonphp.NewObject()
		entry.Set("project_id", projectID)
		entry.Set("opened_by", viewer.id)
		entry.Set("termination_id", nil)
		entry.Set("category", input.category)
		entry.Set("title", input.title)
		entry.Set("description", input.description)
		if input.disputedAmount == nil {
			entry.Set("disputed_amount", nil)
		} else {
			entry.Set("disputed_amount", numberFromText(*input.disputedAmount))
		}
		if input.paymentType == nil {
			entry.Set("payment_type", nil)
		} else {
			entry.Set("payment_type", *input.paymentType)
		}
		if input.paymentID == nil {
			entry.Set("payment_id", nil)
		} else {
			entry.Set("payment_id", *input.paymentID)
		}
		entry.Set("status", "open")
		entry.Set("updated_at", projectTimeValue(updatedAt))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("id", disputeID)

		payload := jsonphp.NewObject()
		payload.Set("message", "Dispute opened. All project payments are frozen until an admin resolves it.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusCreated, payload)
	}
}

// numberFromText renders a validated decimal as the float the model's cast
// produces (JSON `2500000`, not `"2500000.00"`).
func numberFromText(text string) any {
	trimmed := strings.TrimSpace(text)
	if !strings.Contains(trimmed, ".") {
		if value, err := strconv.ParseInt(trimmed, 10, 64); err == nil {
			return value
		}
	}
	value, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return nil
	}
	return value
}

// validateDisputeStore enforces the opener rules.
func validateDisputeStore(fields map[string]any, failures *errorBag) disputeStoreInput {
	var input disputeStoreInput

	if raw, present := fields["category"]; !present || raw == nil {
		failures.add("category", "The category field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("category", "The selected category is invalid.")
	} else if !disputeCategories[s] {
		failures.add("category", "The selected category is invalid.")
	} else {
		input.category = s
	}

	if raw, present := fields["title"]; !present || raw == nil {
		failures.add("title", "The title field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("title", "The title field must be a string.")
	} else if s == "" {
		failures.add("title", "The title field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("title", "The title field must not be greater than 255 characters.")
	} else {
		input.title = s
	}

	if raw, present := fields["description"]; !present || raw == nil {
		failures.add("description", "The description field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("description", "The description field must be a string.")
	} else if s == "" {
		failures.add("description", "The description field is required.")
	} else if len([]rune(s)) > 5000 {
		failures.add("description", "The description field must not be greater than 5000 characters.")
	} else {
		input.description = s
	}

	if raw, present := fields["disputed_amount"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isNumericText(text) {
			if parsed, err := strconv.ParseFloat(text, 64); err == nil {
				if parsed < 0 {
					failures.add("disputed_amount", "The disputed amount field must be at least 0.")
				} else if parsed > 999999999999999 {
					failures.add("disputed_amount", "The disputed amount field must not be greater than 999999999999999.")
				} else {
					dup := strings.TrimSpace(text)
					input.disputedAmount = &dup
				}
			}
		} else {
			failures.add("disputed_amount", "The disputed amount field must be a number.")
		}
	}

	if raw, present := fields["payment_type"]; present && raw != nil {
		if s, ok := raw.(string); !ok {
			failures.add("payment_type", "The selected payment type is invalid.")
		} else if !disputePaymentTypes[s] {
			failures.add("payment_type", "The selected payment type is invalid.")
		} else {
			dup := s
			input.paymentType = &dup
		}
	}

	if raw, present := fields["payment_id"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
				if parsed < 1 {
					failures.add("payment_id", "The payment id field must be at least 1.")
				} else {
					input.paymentID = &parsed
				}
			}
		} else {
			failures.add("payment_id", "The payment id field must be an integer.")
		}
	}

	return input
}

// ProjectDisputeReplyHandler serves
// `POST /api/projects/{project}/disputes/{dispute}/reply`.
func ProjectDisputeReplyHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		disputeRaw := r.PathValue("dispute")
		disputeID, err := strconv.ParseInt(disputeRaw, 10, 64)
		if err != nil || disputeRaw == "" {
			modelNotFound(w, `App\Models\ProjectDispute`, disputeRaw)
			return
		}

		ctx := r.Context()
		viewer, ok := disputeParticipantGate(ctx, pool, w, r, projectID)
		if !ok {
			return
		}

		var disputeProject int64
		var disputeStatus, disputeTitle, projectTitle string
		if err := pool.QueryRow(ctx, `SELECT d.project_id, d.status::text, d.title, p.title
			FROM project_disputes d JOIN projects p ON p.id = d.project_id WHERE d.id = $1`,
			disputeID).Scan(&disputeProject, &disputeStatus, &disputeTitle, &projectTitle); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectDispute`, disputeRaw)
				return
			}
			slog.Error("dispute reply: row", "error", err)
			serverError(w)
			return
		}

		if disputeProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		body, evidence := validateDisputeReply(formFields, r, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if disputeStatus != "open" {
			message(w, http.StatusUnprocessableEntity, "This dispute is closed; the thread no longer accepts messages.")
			return
		}

		var evidencePath, evidenceName *string
		if evidence != nil {
			stored, err := storeVaultFile("disputes/"+strconv.FormatInt(disputeID, 10), evidence.filename, evidence.data)
			if err != nil {
				slog.Error("dispute reply: evidence", "error", err)
				serverError(w)
				return
			}
			evidencePath = &stored
			original := truncateRunes(evidence.filename, 255)
			evidenceName = &original
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("dispute reply: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var messageID int64
		var createdAt, updatedAt any
		if err := tx.QueryRow(ctx, `INSERT INTO dispute_messages
			(dispute_id, user_id, body, evidence_path, evidence_original_name, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			disputeID, viewer.id, body, evidencePath, evidenceName).Scan(&messageID, &createdAt, &updatedAt); err != nil {
			slog.Error("dispute reply: insert", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("dispute reply: commit", "error", err)
			serverError(w)
			return
		}

		var userName string
		_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, viewer.id).Scan(&userName)
		insertDisputeNotifications(ctx, pool, projectID, "dispute_reply", "New Dispute Message",
			userName+" replied on dispute \""+disputeTitle+"\" ("+projectTitle+").",
			`{"project_id":`+strconv.FormatInt(projectID, 10)+`,"dispute_id":`+strconv.FormatInt(disputeID, 10)+`}`, viewer.id)

		// The CREATED message with its author.
		entry := jsonphp.NewObject()
		entry.Set("dispute_id", disputeID)
		entry.Set("user_id", viewer.id)
		entry.Set("body", body)
		entry.Set("evidence_path", nullableString(evidencePath))
		entry.Set("evidence_original_name", nullableString(evidenceName))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("id", messageID)

		var authorName string
		var authorPic *string
		_ = pool.QueryRow(ctx, `SELECT name, pic FROM users WHERE id = $1`, viewer.id).Scan(&authorName, &authorPic)
		author := jsonphp.NewObject()
		author.Set("id", viewer.id)
		author.Set("name", authorName)
		author.Set("pic", nullableString(authorPic))
		entry.Set("user", author)

		payload := jsonphp.NewObject()
		payload.Set("message", "Message posted.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusCreated, payload)
	}
}

// validateDisputeReply enforces body required|string|max:5000 and the
// evidence file allowlist.
func validateDisputeReply(fields map[string]any, r *http.Request, failures *errorBag) (string, *galleryUpload) {
	body := ""
	if raw, present := fields["body"]; !present || raw == nil {
		failures.add("body", "The body field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("body", "The body field must be a string.")
	} else if s == "" {
		failures.add("body", "The body field is required.")
	} else if len([]rune(s)) > 5000 {
		failures.add("body", "The body field must not be greater than 5000 characters.")
	} else {
		body = s
	}

	var evidence *galleryUpload
	files := requestFilesNamed(r, "evidence")
	if len(files) > 0 {
		evidence = files[0]
		allowed := map[string]bool{"jpg": true, "jpeg": true, "png": true, "webp": true, "pdf": true}
		if !allowed[evidence.ext] {
			failures.add("evidence", "The evidence field must be a file of type: jpg, jpeg, png, webp, pdf.")
			evidence = nil
		} else if evidence.sizeBytes() > 10240*1024 {
			failures.add("evidence", "The evidence field must not be greater than 10240 kilobytes.")
			evidence = nil
		}
	}

	return body, evidence
}


