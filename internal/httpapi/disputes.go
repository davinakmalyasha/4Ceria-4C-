package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminDisputesHandler serves `GET /api/admin/disputes`.
//
// THE FIRST PAGINATED ENDPOINT. It introduces the one shape the previous
// handlers did not have: Laravel's `LengthAwarePaginator` — thirteen keys in
// a fixed order, with the `UrlWindow` links. The paginator itself lives in
// `paginator.go` (verified against `artisan tinker`); this handler is the
// query and the row.
//
// The controller is:
//
//	ProjectDispute::with(['project:id,title,status,budget',
//	  'opener:id,name,pic', 'resolver:id,name'])
//	  ->orderByRaw("FIELD(status,'open','resolved','dismissed','withdrawn')")
//	  ->orderByDesc('created_at')
//	  ->paginate(20)
//
// plus `?status=` narrowing to one of the four values, plus `open_count`
// for the nav badge.
//
// THE POSTGRES SPELLINGS:
//
//   - `FIELD(...)` does not exist. `array_position(ARRAY[...]::text[],
//     status::text)` returns the same 1..4 ordering.
//   - `disputed_amount` is cast to float by the model, so it encodes as a
//     JSON number (`5000000`, not `"5000000.00"`).
//   - `budget` is a decimal with NO cast, so it encodes as the string
//     PostgreSQL formats (`"500000000.00"`).
//   - `payment_type` in MySQL is the free text the opener wrote. PostgreSQL
//     stores the registry id instead, and the response resolves it back to
//     the legacy short code through the same alias table the validator
//     reads (migration 0011 backfilled the three missing aliases).
func AdminDisputesHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		filtered := status == "open" || status == "resolved" || status == "dismissed" || status == "withdrawn"

		currentPage := pageParam(r)
		const perPage = 20

		var total int
		if filtered {
			if err := pool.QueryRow(r.Context(),
				`SELECT count(*) FROM project_disputes WHERE status::text = $1`, status,
			).Scan(&total); err != nil {
				slog.Error("admin disputes: count", "error", err)
				serverError(w)
				return
			}
		} else {
			if err := pool.QueryRow(r.Context(),
				`SELECT count(*) FROM project_disputes`,
			).Scan(&total); err != nil {
				slog.Error("admin disputes: count", "error", err)
				serverError(w)
				return
			}
		}

		var openCount int
		if err := pool.QueryRow(r.Context(),
			`SELECT count(*) FROM project_disputes WHERE status::text = 'open'`,
		).Scan(&openCount); err != nil {
			slog.Error("admin disputes: open count", "error", err)
			serverError(w)
			return
		}

		offset := (currentPage - 1) * perPage

		listSQL := `
			SELECT d.id, d.project_id, d.opened_by, d.termination_id, d.resolved_by,
			       d.category, d.title, d.description, d.status::text,
			       d.disputed_amount::float8, d.payment_id,
			       d.resolution::text, d.resolution_notes, d.resolved_at,
			       d.created_at, d.updated_at,
			       p.id, p.title, p.status::text, p.budget::text,
			       o.id, o.name, o.pic,
			       s.id, s.name, rt.type_key
			  FROM project_disputes d
			  JOIN projects p ON p.id = d.project_id
			  JOIN users o ON o.id = d.opened_by
			  LEFT JOIN users s ON s.id = d.resolved_by
			  LEFT JOIN ledger_reference_types rt ON rt.id = d.payment_type_id
		`

		var args []any
		if filtered {
			listSQL += ` WHERE d.status::text = $1`
			args = append(args, status)
		}

		listSQL += ` ORDER BY array_position(ARRAY['open','resolved','dismissed','withdrawn']::text[], d.status::text), d.created_at DESC`
		listSQL += ` LIMIT 20 OFFSET ` + strconv.Itoa(offset)

		pgRows, err := pool.Query(r.Context(), listSQL, args...)
		if err != nil {
			slog.Error("admin disputes: query", "error", err)
			serverError(w)
			return
		}
		defer pgRows.Close()

		items := make([]any, 0, perPage)

		for pgRows.Next() {
			var (
				id, projectID, openedBy          int64
				terminationID, resolvedBy        *int64
				category, title, description     string
				disputeStatus                    string
				disputedAmount                   *float64
				paymentID                        *int64
				resolution                       *string
				resolutionNotes                  *string
				resolvedAt, createdAt, updatedAt *time.Time
			)
			var (
				projID                int64
				projTitle, projStatus string
				projBudget            string
				openerID              int64
				openerName            string
				openerPic             *string
				resolverID            *int64
				resolverName          *string
				refTypeKey            *string
			)

			if err := pgRows.Scan(
				&id, &projectID, &openedBy, &terminationID, &resolvedBy,
				&category, &title, &description, &disputeStatus,
				&disputedAmount, &paymentID,
				&resolution, &resolutionNotes, &resolvedAt,
				&createdAt, &updatedAt,
				&projID, &projTitle, &projStatus, &projBudget,
				&openerID, &openerName, &openerPic,
				&resolverID, &resolverName, &refTypeKey,
			); err != nil {
				slog.Error("admin disputes: scan", "error", err)
				serverError(w)
				return
			}

			row := disputeRow(id, projectID, openedBy, terminationID, resolvedBy,
				category, title, description, disputeStatus, disputedAmount,
				paymentShortCode(refTypeKey), paymentID,
				resolution, resolutionNotes, resolvedAt, createdAt, updatedAt)

			project := jsonphp.NewObject()
			project.Set("id", projID)
			project.Set("title", projTitle)
			project.Set("status", projStatus)
			project.Set("budget", projBudget)
			row.Set("project", project)

			opener := jsonphp.NewObject()
			opener.Set("id", openerID)
			opener.Set("name", openerName)
			opener.Set("pic", nullableString(openerPic))
			row.Set("opener", opener)

			if resolverID == nil {
				row.Set("resolver", nil)
			} else {
				resolver := jsonphp.NewObject()
				resolver.Set("id", *resolverID)
				resolver.Set("name", nullableString(resolverName))
				row.Set("resolver", resolver)
			}

			items = append(items, row)
		}

		if err := pgRows.Err(); err != nil {
			slog.Error("admin disputes: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		// The controller never calls `appends()` or `withQueryString()`, so
		// the page URLs carry ONLY `?page=` — the `?status=` filter is read
		// for the query but dropped from the URLs. Verified live: with
		// `?status=open` Laravel still answers `?page=1` bare.
		payload.Set("data", Paginate(total, perPage, currentPage, requestBaseURL(r), "", items))
		payload.Set("open_count", openCount)

		writeJSON(w, http.StatusOK, payload)
	}
}

// pageParam reads `?page=` the way Laravel does: a positive integer, or 1
// for anything missing, zero, negative or non-numeric.
func pageParam(r *http.Request) int {
	raw := r.URL.Query().Get("page")
	if raw == "" {
		return 1
	}

	page, err := strconv.Atoi(raw)
	if err != nil || page < 1 {
		return 1
	}

	return page
}

// requestBaseURL is the caller's scheme://host/path — the value Laravel's
// paginator builds its URLs from. The host is the caller's (shadow-lib
// normalises the two origins before comparing); the scheme honours the
// forwarded proto so a proxied request keeps `https`.
func requestBaseURL(r *http.Request) string {
	return forwardedProto(r) + "://" + r.Host + r.URL.Path
}

func nullableInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableFloat64(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

// AdminDisputeShowHandler serves `GET /api/admin/disputes/{dispute}`.
//
// The controller loads the dispute with its project (with `pm_id` and
// `user_id` this time — the index omits them), its opener, its resolver and
// its messages ordered by `created_at`, oldest first, each with its author:
//
//	$dispute->load([
//	    'project:id,title,status,budget,pm_id,user_id',
//	    'opener:id,name,pic',
//	    'resolver:id,name',
//	    'messages' => fn ($q) => $q->orderBy('created_at')->with('user:id,name,pic'),
//	]);
//	return response()->json(['data' => $dispute]);
//
// A missing id answers 404 with Laravel's model-not-found body,
// `{"message":"No query results for model [App\\Models\\ProjectDispute] <id>"}`.
// The id segment binds by primary key; a non-numeric segment 404s the same
// way with the raw value in the message.
func AdminDisputeShowHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.PathValue("dispute")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}

		var disputeID int64
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			disputeID = parsed
		} else {
			modelNotFound(w, `App\Models\ProjectDispute`, raw)
			return
		}

		var (
			id, projectID, openedBy          int64
			terminationID, resolvedBy        *int64
			category, title, description     string
			disputeStatus                    string
			disputedAmount                   *float64
			paymentID                        *int64
			resolution                       *string
			resolutionNotes                  *string
			resolvedAt, createdAt, updatedAt *time.Time
		)
		var (
			projID                int64
			projTitle, projStatus string
			projBudget            string
			projPmID, projUserID  *int64
			openerID              int64
			openerName            string
			openerPic             *string
			resolverID            *int64
			resolverName          *string
			refTypeKey            *string
		)

		err := pool.QueryRow(r.Context(), `
			SELECT d.id, d.project_id, d.opened_by, d.termination_id, d.resolved_by,
			       d.category, d.title, d.description, d.status::text,
			       d.disputed_amount::float8, d.payment_id,
			       d.resolution::text, d.resolution_notes, d.resolved_at,
			       d.created_at, d.updated_at,
			       p.id, p.title, p.status::text, p.budget::text, p.pm_id, p.user_id,
			       o.id, o.name, o.pic,
			       s.id, s.name, rt.type_key
			  FROM project_disputes d
			  JOIN projects p ON p.id = d.project_id
			  JOIN users o ON o.id = d.opened_by
			  LEFT JOIN users s ON s.id = d.resolved_by
			  LEFT JOIN ledger_reference_types rt ON rt.id = d.payment_type_id
			 WHERE d.id = $1
		`, disputeID).Scan(
			&id, &projectID, &openedBy, &terminationID, &resolvedBy,
			&category, &title, &description, &disputeStatus,
			&disputedAmount, &paymentID,
			&resolution, &resolutionNotes, &resolvedAt,
			&createdAt, &updatedAt,
			&projID, &projTitle, &projStatus, &projBudget, &projPmID, &projUserID,
			&openerID, &openerName, &openerPic,
			&resolverID, &resolverName, &refTypeKey,
		)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectDispute`, raw)
				return
			}
			slog.Error("admin dispute show: query", "error", err)
			serverError(w)
			return
		}

		row := disputeRow(id, projectID, openedBy, terminationID, resolvedBy,
			category, title, description, disputeStatus, disputedAmount,
			paymentShortCode(refTypeKey), paymentID,
			resolution, resolutionNotes, resolvedAt, createdAt, updatedAt)

		project := jsonphp.NewObject()
		project.Set("id", projID)
		project.Set("title", projTitle)
		project.Set("status", projStatus)
		project.Set("budget", projBudget)
		project.Set("pm_id", nullableInt64(projPmID))
		project.Set("user_id", nullableInt64(projUserID))
		row.Set("project", project)

		opener := jsonphp.NewObject()
		opener.Set("id", openerID)
		opener.Set("name", openerName)
		opener.Set("pic", nullableString(openerPic))
		row.Set("opener", opener)

		if resolverID == nil {
			row.Set("resolver", nil)
		} else {
			resolver := jsonphp.NewObject()
			resolver.Set("id", *resolverID)
			resolver.Set("name", nullableString(resolverName))
			row.Set("resolver", resolver)
		}

		msgRows, err := pool.Query(r.Context(), `
			SELECT m.id, m.dispute_id, m.user_id, m.body,
			       m.evidence_path, m.evidence_original_name,
			       m.created_at, m.updated_at,
			       u.id, u.name, u.pic
			  FROM dispute_messages m
			  JOIN users u ON u.id = m.user_id
			 WHERE m.dispute_id = $1
			 ORDER BY m.created_at ASC, m.id ASC
		`, disputeID)
		if err != nil {
			slog.Error("admin dispute show: messages", "error", err)
			serverError(w)
			return
		}
		defer msgRows.Close()

		messages := make([]any, 0)
		for msgRows.Next() {
			var (
				mID, mDisputeID, mUserID int64
				mBody                    string
				mEvidencePath            *string
				mEvidenceName            *string
				mCreatedAt, mUpdatedAt   *time.Time
				uID                      int64
				uName                    string
				uPic                     *string
			)
			if err := msgRows.Scan(&mID, &mDisputeID, &mUserID, &mBody,
				&mEvidencePath, &mEvidenceName, &mCreatedAt, &mUpdatedAt,
				&uID, &uName, &uPic); err != nil {
				slog.Error("admin dispute show: message scan", "error", err)
				serverError(w)
				return
			}

			msg := jsonphp.NewObject()
			msg.Set("id", mID)
			msg.Set("dispute_id", mDisputeID)
			msg.Set("user_id", mUserID)
			msg.Set("body", mBody)
			msg.Set("evidence_path", nullableString(mEvidencePath))
			msg.Set("evidence_original_name", nullableString(mEvidenceName))
			msg.Set("created_at", carbon(mCreatedAt))
			msg.Set("updated_at", carbon(mUpdatedAt))

			author := jsonphp.NewObject()
			author.Set("id", uID)
			author.Set("name", uName)
			author.Set("pic", nullableString(uPic))
			msg.Set("user", author)

			messages = append(messages, msg)
		}
		if err := msgRows.Err(); err != nil {
			slog.Error("admin dispute show: message rows", "error", err)
			serverError(w)
			return
		}

		row.Set("messages", messages)

		payload := jsonphp.NewObject()
		payload.Set("data", row)

		writeJSON(w, http.StatusOK, payload)
	}
}

// disputeRow builds the seventeen base keys of a dispute, in the table's
// column order — the shape the index and the show share.
//
// paymentType is the legacy short code (`termin`, `arsitek_bid`, …)
// resolved from the dispute's `payment_type_id` via the registry. The
// legacy application stores the raw text the opener wrote; PostgreSQL
// stores the registry id, and the short code is what the two spellings
// share (migration 0011 backfilled the three missing aliases). A dispute
// with no link reads null on both stacks.
func disputeRow(id, projectID, openedBy int64, terminationID, resolvedBy *int64,
	category, title, description, disputeStatus string, disputedAmount *float64,
	paymentType *string, paymentID *int64, resolution, resolutionNotes *string,
	resolvedAt, createdAt, updatedAt *time.Time) *jsonphp.Object {
	row := jsonphp.NewObject()
	row.Set("id", id)
	row.Set("project_id", projectID)
	row.Set("opened_by", openedBy)
	row.Set("termination_id", nullableInt64(terminationID))
	row.Set("resolved_by", nullableInt64(resolvedBy))
	row.Set("category", category)
	row.Set("title", title)
	row.Set("description", description)
	row.Set("status", disputeStatus)
	row.Set("disputed_amount", nullableFloat64(disputedAmount))
	row.Set("payment_type", nullableString(paymentType))
	row.Set("payment_id", nullableInt64(paymentID))
	row.Set("resolution", nullableString(resolution))
	row.Set("resolution_notes", nullableString(resolutionNotes))
	row.Set("resolved_at", carbon(resolvedAt))
	row.Set("created_at", carbon(createdAt))
	row.Set("updated_at", carbon(updatedAt))

	return row
}

// isNoRows reports a missing row, the 404 — not the 500 — path.
func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

// evidenceMimes and evidenceMaxKB mirror DisputeService::EVIDENCE_MIMES and
// ::EVIDENCE_MAX_KB. The messages come from Laravel's validator verbatim —
// verified live against the legacy app.
var evidenceMimes = []string{"jpg", "jpeg", "png", "webp", "pdf"}

const evidenceMaxKB = 10240

// AdminDisputeReplyHandler serves `POST /api/admin/disputes/{dispute}/reply`.
//
// The controller validates (`body` required|string|max:5000, `evidence`
// nullable|file|mimes:jpg,jpeg,png,webp,pdf|max:10240), refuses a closed
// thread, stores an optional evidence file on the vault disk under
// `disputes/{id}/{random}`, writes the message row, fans notifications out
// to every participant and admin except the sender, and answers 201 with
// the message and its author:
//
//	$message = $this->disputes->reply($dispute, $request->user(),
//	    $data['body'], $request->file('evidence'));
//	return response()->json([
//	    'message' => 'Message posted.',
//	    'data' => $message->load('user:id,name,pic'),
//	], 201);
//
// WHAT IS DETERMINISTIC AND WHAT IS NOT
// -------------------------------------
// Without an evidence file every byte is determined by the row: the shadow
// compares that path. With a file, Laravel stores under a RANDOM name
// (`Str::random(40)`), so two stacks can never emit the same
// `evidence_path` — the same reason avatar/KYC uploads are validated but
// their file bytes are not compared. The file path is still fully
// functional: the row records where the bytes went, and the evidence
// endpoint serves them back from the same layout.
func AdminDisputeReplyHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.PathValue("dispute")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}

		var disputeID int64
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			disputeID = parsed
		} else {
			modelNotFound(w, `App\Models\ProjectDispute`, raw)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		fields, files, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}

		// `body` is required|string|max:5000, validated in rule order.
		// An empty string fails `required`: Laravel's
		// ConvertEmptyStringsToNull turns "" into null first. A present
		// non-string fails `string` (verified live with `{"body": 123}`).
		bodyText, bodyOK := bodyString(fields["body"])
		switch {
		case !bodyPresent(fields["body"]):
			failures.add("body", "The body field is required.")
		case !bodyOK:
			failures.add("body", "The body field must be a string.")
		case len([]rune(bodyText)) > 5000:
			failures.add("body", "The body field must not be greater than 5000 characters.")
		}

		// `evidence` is nullable|file|mimes|max:10240. A text part by that
		// name is not a file; an absent one is null and passes.
		evidence := files["evidence"]
		if evidence == nil {
			if text, present := fields["evidence"]; present && strings.TrimSpace(stringOf(text)) != "" {
				failures.add("evidence", "The evidence field must be a file.")
			}
		} else {
			validateFile("evidence", evidence, false, evidenceMimes, evidenceMaxKB, failures)
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		// The dispute, its status gate, and the names the notification
		// carries. `canAccess` always passes for an admin — the route's own
		// gate established that — so only existence and openness are read.
		var (
			disputeStatus string
			disputeTitle  string
			projectID     int64
			projectTitle  string
		)
		if err := pool.QueryRow(r.Context(), `
			SELECT d.status::text, d.title, d.project_id, p.title
			  FROM project_disputes d
			  JOIN projects p ON p.id = d.project_id
			 WHERE d.id = $1
		`, disputeID).Scan(&disputeStatus, &disputeTitle, &projectID, &projectTitle); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectDispute`, raw)
				return
			}
			slog.Error("admin dispute reply: dispute", "error", err)
			serverError(w)
			return
		}

		if disputeStatus != "open" {
			message(w, http.StatusUnprocessableEntity, "This dispute is closed; the thread no longer accepts messages.")
			return
		}

		var senderName string
		if err := pool.QueryRow(r.Context(),
			`SELECT name FROM users WHERE id = $1`, caller.UserID(),
		).Scan(&senderName); err != nil {
			slog.Error("admin dispute reply: sender", "error", err)
			serverError(w)
			return
		}

		var senderPic *string
		if err := pool.QueryRow(r.Context(),
			`SELECT pic FROM users WHERE id = $1`, caller.UserID(),
		).Scan(&senderPic); err != nil {
			slog.Error("admin dispute reply: sender pic", "error", err)
			serverError(w)
			return
		}

		var evidencePath, evidenceName *string
		if evidence != nil {
			stored, original, err := storeEvidence(r, disputeID, evidence)
			if err != nil {
				slog.Error("admin dispute reply: store evidence", "error", err)
				serverError(w)
				return
			}
			evidencePath, evidenceName = &stored, &original
		}

		var (
			messageID                      int64
			messageCreated, messageUpdated *time.Time
		)
		if err := pool.QueryRow(r.Context(), `
			INSERT INTO dispute_messages (dispute_id, user_id, body, evidence_path, evidence_original_name, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at
		`, disputeID, caller.UserID(), bodyText, evidencePath, evidenceName,
		).Scan(&messageID, &messageCreated, &messageUpdated); err != nil {
			slog.Error("admin dispute reply: insert message", "error", err)
			serverError(w)
			return
		}

		// The fan-out must not fail the 201: Laravel wraps it in a
		// try/catch that logs and continues.
		title := "New Dispute Message"
		body := senderName + " replied on dispute \"" + disputeTitle + "\" (" + projectTitle + ")."
		data := `{"project_id":` + strconv.FormatInt(projectID, 10) +
			`,"dispute_id":` + strconv.FormatInt(disputeID, 10) + `}`
		insertDisputeNotifications(r.Context(), pool, projectID, "dispute_reply", title, body, data, caller.UserID())

		msg := jsonphp.NewObject()
		msg.Set("dispute_id", disputeID)
		msg.Set("user_id", caller.UserID())
		msg.Set("body", bodyText)
		msg.Set("evidence_path", nullableString(evidencePath))
		msg.Set("evidence_original_name", nullableString(evidenceName))
		msg.Set("updated_at", carbon(messageUpdated))
		msg.Set("created_at", carbon(messageCreated))
		msg.Set("id", messageID)

		author := jsonphp.NewObject()
		author.Set("id", caller.UserID())
		author.Set("name", senderName)
		author.Set("pic", nullableString(senderPic))
		msg.Set("user", author)

		payload := jsonphp.NewObject()
		payload.Set("message", "Message posted.")
		payload.Set("data", msg)

		writeJSON(w, http.StatusCreated, payload)
	}
}

// bodyPresent reports whether `body` was sent at all: absent and null read
// as missing (Laravel's ConvertEmptyStringsToNull runs before validation),
// and so does the empty string.
func bodyPresent(raw any) bool {
	if raw == nil {
		return false
	}
	if s, ok := raw.(string); ok && s == "" {
		return false
	}
	return true
}

// bodyString reads `body` as text. The second result is false for a present
// non-string (a number, boolean or object) — which fails the `string` rule.
func bodyString(raw any) (string, bool) {
	if s, ok := raw.(string); ok {
		return s, true
	}
	return "", false
}

// stringOf renders a field for the blank check.
func stringOf(value any) string {
	if value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	return "present"
}

// storeEvidence persists an evidence upload under the vault layout
// `disputes/{id}/{random}.{ext}` and returns the relative path plus the
// truncated original name.
//
// The directory honours EVIDENCE_DIR and defaults to the local vault mirror
// (`storage/app/public`, matching the local VAULT_DISK=public): the relative
// path is what the row records, so a later S3-backed store keeps the rows
// valid. The name is 40 hex chars, the shape of Laravel's `Str::random(40)`
// hash names — the VALUE is random either way, so the two stacks can never
// emit the same bytes for a file upload, and the shadow only covers the
// file-less path.
func storeEvidence(r *http.Request, disputeID int64, evidence *uploadedFile) (string, string, error) {
	base := os.Getenv("EVIDENCE_DIR")
	if base == "" {
		base = filepath.Join("storage", "app", "public")
	}

	var random [20]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", "", err
	}

	rel := "disputes/" + strconv.FormatInt(disputeID, 10) + "/" + hex.EncodeToString(random[:]) + "." + evidence.ext

	if err := os.MkdirAll(filepath.Join(base, "disputes", strconv.FormatInt(disputeID, 10)), 0o755); err != nil {
		return "", "", err
	}

	src, err := r.MultipartForm.File["evidence"][0].Open()
	if err != nil {
		return "", "", err
	}
	defer src.Close()

	dst, err := os.OpenFile(filepath.Join(base, filepath.FromSlash(rel)), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", "", err
	}

	return rel, truncateRunes(evidence.filename, 255), nil
}

// truncateRunes is PHP's `mb_substr($name, 0, 255)`.
func truncateRunes(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}

// notifyDisputeRecipients fans one `dispute_reply` notification out to every
// participant and every admin except the sender — DisputeService::
// notifyRecipients line for line:
//
//   - the owner, the raw `pm_id`, every hired professional's user, every
//     active sub-professional's user, every admin (by `role_type` or the
//     Spatie `admin` role), unique, minus the sender;
//   - `{"project_id":X,"dispute_id":Y}` in PHP's insertion order (the MySQL
//     golden shows the keys sorted only because the JSON column sorts them);
//   - best-effort: any failure is logged and the 201 stands.
func notifyDisputeRecipients(ctx context.Context, pool *pgxpool.Pool, projectID, disputeID int64,
	projectTitle, disputeTitle, senderName string, senderID int64) {
	title := "New Dispute Message"
	body := senderName + " replied on dispute \"" + disputeTitle + "\" (" + projectTitle + ")."
	data := `{"project_id":` + strconv.FormatInt(projectID, 10) +
		`,"dispute_id":` + strconv.FormatInt(disputeID, 10) + `}`

	insertDisputeNotifications(ctx, pool, projectID, "dispute_reply", title, body, data, senderID)
}

// disputeRecipientIDs collects the notify set: owner, raw pm_id, hired
// professionals' users, active sub-professionals' users and admins — unique,
// sorted, minus the sender. See notifyDisputeRecipients for why `pm_id` is
// used raw (a reproduced quirk, not a fix).
func disputeRecipientIDs(ctx context.Context, pool *pgxpool.Pool, projectID, senderID int64) []int64 {
	recipients := map[int64]bool{}

	var ownerID int64
	var pmID *int64
	var arsitekID, kontraktorID, notarisID, interiorID, structuralID, mepID *int64

	if err := pool.QueryRow(ctx, `
		SELECT user_id, pm_id, selected_arsitek_id, selected_kontraktor_id,
		       selected_notaris_id, selected_interior_id, structural_id, mep_id
		  FROM projects WHERE id = $1
	`, projectID).Scan(&ownerID, &pmID, &arsitekID, &kontraktorID, &notarisID,
		&interiorID, &structuralID, &mepID); err != nil {
		slog.Error("admin dispute notify: project", "error", err)
		return nil
	}

	recipients[ownerID] = true
	if pmID != nil && *pmID != 0 {
		// `pm_id` holds a PROFILE id; the recipient is that PM progress' USER.
		var pmUser *int64
		if err := pool.QueryRow(ctx, `SELECT user_id FROM project_managers WHERE id = $1`, *pmID).Scan(&pmUser); err == nil && pmUser != nil && *pmUser != 0 {
			recipients[*pmUser] = true
		}
	}

	lookups := []struct {
		table string
		id    *int64
	}{
		{"arsiteks", arsitekID},
		{"kontraktors", kontraktorID},
		{"notaris_profiles", notarisID},
		{"interior_profiles", interiorID},
		{"structural_engineers", structuralID},
		{"mep_engineers", mepID},
	}
	for _, lookup := range lookups {
		if lookup.id == nil || *lookup.id == 0 {
			continue
		}
		var uid *int64
		if err := pool.QueryRow(ctx,
			`SELECT user_id FROM `+lookup.table+` WHERE id = $1`, *lookup.id,
		).Scan(&uid); err != nil || uid == nil || *uid == 0 {
			continue
		}
		recipients[*uid] = true
	}

	subRows, err := pool.Query(ctx, `
		SELECT user_id FROM project_sub_professionals
		 WHERE project_id = $1 AND status::text = 'active'
	`, projectID)
	if err == nil {
		for subRows.Next() {
			var uid *int64
			if err := subRows.Scan(&uid); err == nil && uid != nil && *uid != 0 {
				recipients[*uid] = true
			}
		}
		subRows.Close()
	}

	adminRows, err := pool.Query(ctx, `
		SELECT u.id FROM users u
		 WHERE u.role_type::text = 'admin'
		UNION
		SELECT m.model_id FROM model_has_roles m
		 JOIN roles r ON r.id = m.role_id
		WHERE r.name = 'admin' AND m.model_type = 'App\Models\User'
	`)
	if err == nil {
		for adminRows.Next() {
			var uid int64
			if err := adminRows.Scan(&uid); err == nil {
				recipients[uid] = true
			}
		}
		adminRows.Close()
	}

	delete(recipients, senderID)
	if len(recipients) == 0 {
		return nil
	}

	ids := make([]int64, 0, len(recipients))
	for uid := range recipients {
		ids = append(ids, uid)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	return ids
}

// insertDisputeNotifications writes one row per recipient. A failure stops
// the loop — mirroring the legacy try/catch, which exits the fan-out on the
// first throw — and the caller's 2xx stands either way.
func insertDisputeNotifications(ctx context.Context, pool *pgxpool.Pool, projectID int64,
	kind, title, body, data string, senderID int64) {
	for _, uid := range disputeRecipientIDs(ctx, pool, projectID, senderID) {
		if _, err := pool.Exec(ctx, `
			INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, date_trunc('second', now()), date_trunc('second', now()))
		`, uid, kind, title, body, data); err != nil {
			slog.Error("admin dispute notify: insert", "user", uid, "error", err)
			return
		}
	}
}

// modelNotFound answers Laravel's route-model-binding 404 verbatim.
func modelNotFound(w http.ResponseWriter, model, id string) {
	message(w, http.StatusNotFound, "No query results for model ["+model+"] "+id)
}

// scopedNotFound is a SCOPED firstOrFail: no ids reach the exception, so
// Laravel appends a PERIOD instead of the id.
func scopedNotFound(w http.ResponseWriter, model string) {
	message(w, http.StatusNotFound, "No query results for model ["+model+"].")
}

// adminActions are DisputeService::ADMIN_ACTIONS, the only values the `in:`
// rule accepts.
var adminActions = []string{"dismiss", "release_payment", "record_refund", "terminate_project", "custom"}

// actMessages are the controller's per-action 200 messages.
var actMessages = map[string]string{
	"dismiss":           "Dispute dismissed. Payments are unfrozen.",
	"release_payment":   "Payment released and recorded. Dispute closed.",
	"record_refund":     "Refund recorded in the ledger. Dispute closed.",
	"terminate_project": "Project force-terminated. Dispute closed.",
	"custom":            "Dispute closed with custom resolution.",
}

// AdminDisputeActHandler serves `POST /api/admin/disputes/{dispute}/act`.
//
// The controller validates (`action` required|in:…, `notes`
// nullable|string|max:5000, `amount` nullable|numeric|min:0.01|max:…),
// refuses a non-admin and a closed thread, then runs
// `DisputeService::adminAction` in a transaction: close the dispute, log the
// arbitration, touch the project and notify — plus, for `release_payment`
// and `record_refund`, move money.
//
// WHAT IS PORTED AND WHAT IS NOT
// ------------------------------
// `dismiss`, `custom` and `terminate_project` move no money: they are ported
// line for line and verified live byte-identical. `record_refund` runs the
// full ledger-reversal block on exact minor units (see money.go), and
// `release_payment` runs the full verify-accept path (see release.go) —
// both verified live on termin and material payments. Bid-linked paths of
// either action answer missing-row 404/422 on the un-ETL'd unified `bids`
// table until the bid fold lands: honest given the data, and the same
// answer as a deleted row.
func AdminDisputeActHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.PathValue("dispute")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}

		var disputeID int64
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			disputeID = parsed
		} else {
			modelNotFound(w, `App\Models\ProjectDispute`, raw)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		fields, _, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}

		action, actionPresent := actionString(fields["action"])
		if !actionPresent {
			failures.add("action", "The action field is required.")
		} else if !slicesContains(adminActions, action) {
			failures.add("action", "The selected action is invalid.")
		}

		notes, notesPresent := nullableText(fields["notes"])
		if notesPresent {
			if s, isStr := fields["notes"].(string); !isStr {
				failures.add("notes", "The notes field must be a string.")
			} else if len([]rune(s)) > 5000 {
				failures.add("notes", "The notes field must not be greater than 5000 characters.")
			} else {
				notes = &s
			}
		}

		amountSent := amountPresent(fields["amount"])
		var amountMinor int64
		if amountSent {
			minor, ok := parseMinor(amountString(fields["amount"]))
			if !ok {
				failures.add("amount", "The amount field must be a number.")
			} else if minor < 1 {
				failures.add("amount", "The amount field must be at least 0.01.")
			} else if minor > 99999999999999900 {
				failures.add("amount", "The amount field must not be greater than 999999999999999.")
			} else {
				amountMinor = minor
			}
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		var (
			disputeStatus string
			disputeTitle  string
			projectID     int64
			projectTitle  string
			paymentTypeID *int64
			paymentID     *int64
			disputedText  *string
		)
		if err := pool.QueryRow(r.Context(), `
			SELECT d.status::text, d.title, d.project_id, p.title,
			       d.payment_type_id, d.payment_id, d.disputed_amount::text
			  FROM project_disputes d
			  JOIN projects p ON p.id = d.project_id
			 WHERE d.id = $1
		`, disputeID).Scan(&disputeStatus, &disputeTitle, &projectID, &projectTitle,
			&paymentTypeID, &paymentID, &disputedText); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectDispute`, raw)
				return
			}
			slog.Error("admin dispute act: dispute", "error", err)
			serverError(w)
			return
		}

		if disputeStatus != "open" {
			message(w, http.StatusUnprocessableEntity, "This dispute is already closed.")
			return
		}

		if action == "custom" && (notes == nil || *notes == "") {
			message(w, http.StatusUnprocessableEntity, "Resolution notes are required for a custom resolution.")
			return
		}

		releaseMode := action == "release_payment"
		refundMode := action == "record_refund"

		if refundMode && (!amountSent || amountMinor <= 0) {
			message(w, http.StatusUnprocessableEntity, "A positive refund amount is required.")
			return
		}

		var senderName string
		if err := pool.QueryRow(r.Context(),
			`SELECT name FROM users WHERE id = $1`, caller.UserID(),
		).Scan(&senderName); err != nil {
			slog.Error("admin dispute act: sender", "error", err)
			serverError(w)
			return
		}

		var senderRole string
		if err := pool.QueryRow(r.Context(),
			`SELECT COALESCE(role_type::text, '') FROM users WHERE id = $1`, caller.UserID(),
		).Scan(&senderRole); err != nil {
			slog.Error("admin dispute act: sender role", "error", err)
			serverError(w)
			return
		}

		newStatus := "resolved"
		if action == "dismiss" {
			newStatus = "dismissed"
		}

		logDetails := map[string]string{
			"dismiss":           "Sengketa \"" + disputeTitle + "\" ditolak/di-dismiss oleh " + senderName + ". Pembayaran dicabut pembekuannya.",
			"release_payment":   "Sengketa \"" + disputeTitle + "\" diselesaikan: pembayaran terkait DISETUJUI oleh " + senderName + ".",
			"terminate_project": "Sengketa \"" + disputeTitle + "\" diselesaikan: proyek DIHENTIKAN oleh " + senderName + ".",
			"custom":            "Sengketa \"" + disputeTitle + "\" diselesaikan (custom) oleh " + senderName + ".",
		}[action]

		tx, err := pool.Begin(r.Context())
		if err != nil {
			slog.Error("admin dispute act: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(r.Context())

		if action == "terminate_project" {
			if _, err := tx.Exec(r.Context(),
				`UPDATE projects SET status = 'cancelled' WHERE id = $1`, projectID); err != nil {
				slog.Error("admin dispute act: terminate", "error", err)
				serverError(w)
				return
			}
		}

		if refundMode {
			var bySpelling map[string]int64
			bySpelling, _, err = registryIDs(r.Context(), pool)
			if err != nil {
				slog.Error("admin dispute act: registry", "error", err)
				serverError(w)
				return
			}

			if paymentTypeID == nil || paymentID == nil {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity, "Link the disputed payment before recording a refund. Without it the platform cannot tell which payment is being returned.")
				return
			}

			short, linked := disputePaymentShort(r.Context(), tx, paymentTypeID)
			if !linked || paymentID == nil {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity, "Link the disputed payment before recording a refund. Without it the platform cannot tell which payment is being returned.")
				return
			}

			if _, known := paymentFQCNs[short]; !known {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity, "The linked payment no longer exists on this project.")
				return
			}

			target, err := resolvePaymentTarget(r.Context(), tx, bySpelling, short, *paymentID, projectID)
			if err != nil {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity, "The linked payment no longer exists on this project.")
				return
			}

			paidGross, refundedGross, err := ledgerSums(r.Context(), tx, projectID, target.RegistryID, target.RefID)
			if err != nil {
				slog.Error("admin dispute act: ledger sums", "error", err)
				serverError(w)
				return
			}

			if paidGross <= 0 {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity, "That payment was never disbursed, so there is nothing to refund.")
				return
			}

			refundable := paidGross - refundedGross
			if refundable < 0 {
				refundable = 0
			}

			if amountMinor > refundable {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity,
					"Refund exceeds what is still refundable on this payment. Paid: Rp "+
						formatMinor(paidGross)+", already refunded: Rp "+
						formatMinor(refundedGross)+", refundable: Rp "+
						formatMinor(refundable)+".")
				return
			}

			if disputedText != nil {
				if disputedMinor, ok := parseMinor(*disputedText); ok && amountMinor > disputedMinor {
					_ = tx.Rollback(r.Context())
					message(w, http.StatusUnprocessableEntity,
						"Refund ("+formatMinor(amountMinor)+") exceeds the disputed amount recorded on this dispute ("+
							formatMinor(disputedMinor)+").")
					return
				}
			}

			disputeRefID, ok := bySpelling[`App\Models\ProjectDispute`]
			if !ok {
				slog.Error("admin dispute act: dispute registry", "error", "missing")
				serverError(w)
				return
			}

			if _, err := tx.Exec(r.Context(), `
				INSERT INTO project_budget_transactions
					(project_id, transaction_type, amount, title,
					 reference_type_id, reference_id,
					 reverses_type_id, reverses_id,
					 transaction_date, actor_user_id, actor_role)
				VALUES ($1, 'refund', $2, $3, $4, $5, $6, $7, date_trunc('second', now()), $8, $9)
			`, projectID, formatMinor(-amountMinor), refundTitle(disputeID, target.Label),
				disputeRefID, disputeID, target.RegistryID, target.RefID,
				caller.UserID(), senderRole); err != nil {
				slog.Error("admin dispute act: reversal", "error", err)
				serverError(w)
				return
			}

			newRefunded := refundedGross + amountMinor

			if newRefunded >= paidGross && target.PaymentState == "paid" {
				if _, err := tx.Exec(r.Context(),
					`UPDATE `+target.Table+` SET refunded_amount = $2, `+target.MirrorStatusColumn+` = 'refunded' WHERE id = $1`,
					target.ID, formatMinor(newRefunded)); err != nil {
					slog.Error("admin dispute act: mirror flip", "error", err)
					serverError(w)
					return
				}
			} else if _, err := tx.Exec(r.Context(),
				`UPDATE `+target.Table+` SET refunded_amount = $2 WHERE id = $1`,
				target.ID, formatMinor(newRefunded)); err != nil {
				slog.Error("admin dispute act: mirror", "error", err)
				serverError(w)
				return
			}

			logDetails = "Sengketa \"" + disputeTitle + "\" diselesaikan: refund Rp " +
				formatMinor(amountMinor) + " dicatat oleh " + senderName + "."
		}

		var released *paymentTarget
		var releaseAmount int64
		if releaseMode {
			short, linked := disputePaymentShort(r.Context(), tx, paymentTypeID)
			if !linked || paymentID == nil {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity, "This dispute has no linked payment to release. Use dismiss, refund, terminate, or custom.")
				return
			}

			bySpelling, _, err := registryIDs(r.Context(), pool)
			if err != nil {
				slog.Error("admin dispute act: registry", "error", err)
				serverError(w)
				return
			}

			target, err := resolvePaymentTarget(r.Context(), tx, bySpelling, short, *paymentID, projectID)
			if err != nil {
				_ = tx.Rollback(r.Context())
				if _, ok := err.(*errPaymentInvalid); ok {
					message(w, http.StatusBadRequest, "Invalid payment type: "+short+".")
					return
				}
				message(w, http.StatusNotFound, "Payment record not found.")
				return
			}

			settled := target.PaymentState
			if settled == "" {
				settled = target.Status
			}

			if settled == "paid" {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity, "This payment is already marked as paid and cannot be modified.")
				return
			}

			if settled == "refunded" {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity, "This payment was refunded through dispute arbitration and cannot be re-charged.")
				return
			}

			switch target.Status {
			case "terminated", "resigned", "void", "cancelled":
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity,
					"This payment is no longer payable — the related contract was "+target.Status+".")
				return
			}

			written, available, err := recordPaymentMinorArbitration(r.Context(), tx, projectID,
				target.NetMinor, target.Title, target.FQCN, target.RefID, target.RegistryID,
				caller.UserID(), senderRole)
			if err != nil {
				slog.Error("admin dispute act: record payment", "error", err)
				serverError(w)
				return
			}

			if !written {
				_ = tx.Rollback(r.Context())
				message(w, http.StatusUnprocessableEntity,
					"Project budget is insufficient for this payment ("+formatIntCommas(target.NetMinor)+"). Available: "+
						formatIntCommas(available)+". Please increase the project budget first.")
				return
			}

			if _, isBid := bidShortSet()[target.Short]; isBid {
				markPaid := `UPDATE bids SET payment_status = 'paid', status = 'active', verification_notes = NULL`
				if target.TouchPaidAt {
					markPaid += `, paid_at = date_trunc('second', now())`
				}
				markPaid += ` WHERE id = $1`
				if _, err := tx.Exec(r.Context(), markPaid, target.ID); err != nil {
					slog.Error("admin dispute act: mark bid paid", "error", err)
					serverError(w)
					return
				}

				if err := transitionBidProjectStatus(r.Context(), tx, projectID, target.Short); err != nil {
					slog.Error("admin dispute act: transition", "error", err)
					serverError(w)
					return
				}
			} else {
				markPaid := `UPDATE ` + target.Table + ` SET status = 'paid', verification_notes = NULL`
				if target.TouchPaidAt {
					markPaid += `, paid_at = date_trunc('second', now())`
				}
				markPaid += ` WHERE id = $1`
				if _, err := tx.Exec(r.Context(), markPaid, target.ID); err != nil {
					slog.Error("admin dispute act: mark paid", "error", err)
					serverError(w)
					return
				}
			}

			if target.Short == "termin" {
				checkAndActivateBid(r.Context(), tx, projectID, projectTitle, target.RoleType)
			}

			released, releaseAmount = target, target.NetMinor
		}

		if _, err := tx.Exec(r.Context(), `
			UPDATE project_disputes
			   SET status = $2, resolution = $3, resolution_notes = $4,
			       resolved_by = $5, resolved_at = date_trunc('second', now()), updated_at = date_trunc('second', now())
			 WHERE id = $1
		`, disputeID, newStatus, action, notes, caller.UserID()); err != nil {
			slog.Error("admin dispute act: close", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(r.Context(), `
			INSERT INTO project_activity_logs (project_id, user_id, action, details, created_at, updated_at)
			VALUES ($1, $2, 'dispute_resolved', $3, date_trunc('second', now()), date_trunc('second', now()))
		`, projectID, caller.UserID(), logDetails); err != nil {
			slog.Error("admin dispute act: log", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(r.Context(),
			`UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("admin dispute act: touch", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			slog.Error("admin dispute act: commit", "error", err)
			serverError(w)
			return
		}

		title := "Dispute Resolved"
		notifyBody := "Dispute \"" + disputeTitle + "\" on \"" + projectTitle + "\" was closed (" + action + "). Payments are unfrozen."
		notifyData := `{"project_id":` + strconv.FormatInt(projectID, 10) +
			`,"dispute_id":` + strconv.FormatInt(disputeID, 10) + `}`
		insertDisputeNotifications(r.Context(), pool, projectID, "dispute_resolved", title, notifyBody, notifyData, caller.UserID())

		if released != nil {
			var ownerID int64
			if err := pool.QueryRow(r.Context(),
				`SELECT user_id FROM projects WHERE id = $1`, projectID,
			).Scan(&ownerID); err != nil {
				slog.Error("admin dispute act: owner", "error", err)
			} else {
				notifyPaymentVerified(r.Context(), pool, projectID, projectTitle,
					ownerID, caller.UserID(), released.Short, released.RefID, released.Label, releaseAmount)
			}
		}

		fresh, err := readDisputeRow(r.Context(), pool, disputeID)
		if err != nil {
			slog.Error("admin dispute act: fresh", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", actMessages[action])
		payload.Set("data", fresh)

		writeJSON(w, http.StatusOK, payload)
	}
}

// paymentShortCode maps a registry type_key back to the legacy short code
// the API exposes (`termin`, `arsitek_bid`, …). Unknown or absent keys read
// null, like a dispute with no linked payment.
func paymentShortCode(typeKey *string) *string {
	if typeKey == nil {
		return nil
	}
	if short, ok := registryShortCodes[*typeKey]; ok {
		dup := short
		return &dup
	}
	return nil
}

// readDisputeRow re-reads the seventeen base keys — the controller's
// `$dispute->fresh()`, without relations.
func readDisputeRow(ctx context.Context, pool *pgxpool.Pool, disputeID int64) (*jsonphp.Object, error) {
	var (
		id, projectID, openedBy          int64
		terminationID, resolvedBy        *int64
		category, title, description     string
		disputeStatus                    string
		disputedAmount                   *float64
		paymentID                        *int64
		refTypeKey                       *string
		resolution                       *string
		resolutionNotes                  *string
		resolvedAt, createdAt, updatedAt *time.Time
	)
	if err := pool.QueryRow(ctx, `
		SELECT d.id, d.project_id, d.opened_by, d.termination_id, d.resolved_by,
		       d.category, d.title, d.description, d.status::text,
		       d.disputed_amount::float8, d.payment_id,
		       d.resolution::text, d.resolution_notes, d.resolved_at,
		       d.created_at, d.updated_at,
		       rt.type_key
		  FROM project_disputes d
		  LEFT JOIN ledger_reference_types rt ON rt.id = d.payment_type_id
		 WHERE d.id = $1
	`, disputeID).Scan(
		&id, &projectID, &openedBy, &terminationID, &resolvedBy,
		&category, &title, &description, &disputeStatus,
		&disputedAmount, &paymentID,
		&resolution, &resolutionNotes, &resolvedAt,
		&createdAt, &updatedAt, &refTypeKey,
	); err != nil {
		return nil, err
	}

	return disputeRow(id, projectID, openedBy, terminationID, resolvedBy,
		category, title, description, disputeStatus, disputedAmount,
		paymentShortCode(refTypeKey), paymentID,
		resolution, resolutionNotes, resolvedAt, createdAt, updatedAt), nil
}

// actionString reads `action`: absent, null and "" are missing (the
// ConvertEmptyStringsToNull rule); anything else is validated by `in:`.
func actionString(raw any) (string, bool) {
	if raw == nil {
		return "", false
	}
	if s, ok := raw.(string); ok {
		if s == "" {
			return "", false
		}
		return s, true
	}
	return stringOf(raw), true
}

// nullableText reads a nullable text field: absent, null and "" are null.
func nullableText(raw any) (*string, bool) {
	if raw == nil {
		return nil, false
	}
	if s, ok := raw.(string); ok {
		if s == "" {
			return nil, false
		}
		return &s, true
	}
	return nil, true
}

// amountPresent reports whether `amount` was sent: absent, null and "" are
// null (nullable).
func amountPresent(raw any) bool {
	if raw == nil {
		return false
	}
	if s, ok := raw.(string); ok && s == "" {
		return false
	}
	return true
}

// amountString renders `amount` to its canonical decimal text: JSON numbers
// via the shortest round-trip, strings verbatim. parseMinor decides whether
// it is numeric.
func amountString(raw any) string {
	switch typed := raw.(type) {
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 32)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case string:
		return typed
	default:
		return ""
	}
}

// slicesContains reports membership — the `in:` rule.
func slicesContains(haystack []string, needle string) bool {
	for _, item := range haystack {
		if item == needle {
			return true
		}
	}
	return false
}

// evidenceBaseDir is the vault mirror the handler reads: EVIDENCE_DIR, or
// the local `storage/app/public` that matches the local VAULT_DISK=public.
func evidenceBaseDir() string {
	if base := os.Getenv("EVIDENCE_DIR"); base != "" {
		return base
	}
	return filepath.Join("storage", "app", "public")
}

// evidenceContentType mirrors the service's match: pdf, webp, jpg/jpeg,
// everything else octet-stream.
func evidenceContentType(extension string) string {
	switch strings.ToLower(extension) {
	case "pdf":
		return "application/pdf"
	case "webp":
		return "image/webp"
	case "jpg", "jpeg":
		return "image/jpeg"
	default:
		return "application/octet-stream"
	}
}

// AdminDisputeEvidenceHandler serves
// `GET /api/admin/disputes/{dispute}/messages/{message}/evidence`.
//
// The endpoint answers a JSON body with the file's URL, not the bytes:
// locally the vault disk is the public disk, so the URL is the public
// one Laravel's `Vault::url` falls back to; in production it is the
// 15-minute presigned S3 URL. Either way the URL carries a signature and
// an expiry, so two stacks never emit the same bytes here — the shape is
// the contract (`{"url": ...}`), and the 404s are byte-identical:
//
//   - missing dispute/message → the route-model-binding 404;
//   - a message from another dispute → 404 `{"message":"Not found."}`;
//   - a message with no attachment → 404 `{"message":"This message has no
//     evidence attachment."}`;
//   - a row whose file is gone → 404 `{"message":"Evidence file not found."}`.
func AdminDisputeEvidenceHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serveEvidence(w, r, pool, "", "")
	}
}

// ProjectDisputeEvidenceHandler serves
// `GET /api/projects/{project}/disputes/{dispute}/messages/{message}/evidence`.
//
// Same file logic as the admin endpoint, behind the participant gate:
// a caller who owns nothing and is hired nowhere reads 403 with the
// controller's sentence.
func ProjectDisputeEvidenceHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serveEvidence(w, r, pool, r.PathValue("project"), "project")
	}
}

// serveEvidence is the shared file logic. When projectRaw is "", the admin
// route runs (no project binding, no participant gate); otherwise the
// project route binds `{project}` and enforces participation.
//
// THE ORDER IS THE CONTRACT. Laravel binds route models before the
// controller runs, so a missing id 404s before any gate: project, then
// dispute, then message, then the participant check, then the mismatch
// checks. Verified live: a non-participant asking for a missing dispute
// reads the model 404, not the 403.
func serveEvidence(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, projectRaw, _ string) {
	caller, ok := CallerFrom(r.Context())
	if !ok {
		message(w, http.StatusUnauthorized, "Unauthenticated.")
		return
	}

	if projectRaw == "" {
		projectRaw = r.PathValue("project")
	}

	var projectID int64
	if projectRaw != "" {
		parsed, err := strconv.ParseInt(orLastSegment(projectRaw, r.URL.Path), 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, projectRaw)
			return
		}
		projectID = parsed

		if _, err := loadProjectParties(r.Context(), pool, projectID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, projectRaw)
				return
			}
			slog.Error("dispute evidence: project", "error", err)
			serverError(w)
			return
		}
	}

	disputeRaw := r.PathValue("dispute")
	if disputeRaw == "" {
		disputeRaw = lastPathSegment(r.URL.Path)
	}
	disputeID, err := strconv.ParseInt(disputeRaw, 10, 64)
	if err != nil {
		modelNotFound(w, `App\Models\ProjectDispute`, disputeRaw)
		return
	}

	messageRaw := r.PathValue("message")
	messageID, err := strconv.ParseInt(messageRaw, 10, 64)
	if err != nil || messageRaw == "" {
		modelNotFound(w, `App\Models\DisputeMessage`, messageRaw)
		return
	}

	var (
		disputeProjectID int64
		messageDisputeID int64
		evidencePath     *string
		evidenceName     *string
	)
	if err := pool.QueryRow(r.Context(),
		`SELECT project_id FROM project_disputes WHERE id = $1`, disputeID,
	).Scan(&disputeProjectID); err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\ProjectDispute`, disputeRaw)
			return
		}
		slog.Error("dispute evidence: dispute", "error", err)
		serverError(w)
		return
	}

	if err := pool.QueryRow(r.Context(), `
		SELECT dispute_id, evidence_path, evidence_original_name
		  FROM dispute_messages WHERE id = $1
	`, messageID).Scan(&messageDisputeID, &evidencePath, &evidenceName); err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\DisputeMessage`, messageRaw)
			return
		}
		slog.Error("dispute evidence: message", "error", err)
		serverError(w)
		return
	}

	if projectRaw != "" {
		subject, err := loadSubject(r.Context(), pool, caller.UserID())
		if err != nil {
			slog.Error("dispute evidence: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(r.Context(), pool, projectID)
		if err != nil {
			slog.Error("dispute evidence: parties", "error", err)
			serverError(w)
			return
		}

		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized. Only project participants can view disputes.")
			return
		}

		if disputeProjectID != projectID || messageDisputeID != disputeID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}
	} else if messageDisputeID != disputeID {
		message(w, http.StatusNotFound, "Not found.")
		return
	}

	if evidencePath == nil || *evidencePath == "" {
		message(w, http.StatusNotFound, "This message has no evidence attachment.")
		return
	}

	if _, err := os.Stat(filepath.Join(evidenceBaseDir(), filepath.FromSlash(*evidencePath))); err != nil {
		message(w, http.StatusNotFound, "Evidence file not found.")
		return
	}

	_ = evidenceName
	_ = evidenceContentType

	url := forwardedProto(r) + "://" + r.Host + "/storage/" + *evidencePath

	payload := jsonphp.NewObject()
	payload.Set("url", url)

	writeJSON(w, http.StatusOK, payload)
}

// orLastSegment prefers the mux capture and falls back to the URL tail.
func orLastSegment(captured, path string) string {
	if captured != "" {
		return captured
	}
	return lastPathSegment(path)
}

// ProjectDisputeWithdrawHandler serves
// `POST /api/projects/{project}/disputes/{dispute}/withdraw`.
//
// The opener (or an admin) closes their own open thread: the dispute flips
// to `withdrawn`, an activity row records the Indonesian line, the project
// is touched, `dispute_resolved`/`Dispute Withdrawn` notifications fan out,
// and the fresh row answers 200 with `{"message":"Dispute withdrawn.
// Payments are unfrozen."}`.
//
// Errors: missing project/dispute → model 404s; a dispute from another
// project → 404 `Not found.`; a non-participant → 403; a participant who is
// neither opener nor admin → 403 `Only the dispute opener can withdraw it.';
// a closed thread → 422 `This dispute is already closed.'
func ProjectDisputeWithdrawHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		projectRaw := orLastSegment(r.PathValue("project"), r.URL.Path)
		projectID, err := strconv.ParseInt(projectRaw, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, projectRaw)
			return
		}

		disputeRaw := r.PathValue("dispute")
		disputeID, err := strconv.ParseInt(disputeRaw, 10, 64)
		if err != nil || disputeRaw == "" {
			modelNotFound(w, `App\Models\ProjectDispute`, disputeRaw)
			return
		}

		subject, err := loadSubject(r.Context(), pool, caller.UserID())
		if err != nil {
			slog.Error("dispute withdraw: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(r.Context(), pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, projectRaw)
				return
			}
			slog.Error("dispute withdraw: project", "error", err)
			serverError(w)
			return
		}

		var (
			openedBy       int64
			disputeProject int64
			disputeStatus  string
			disputeTitle   string
			projectTitle   string
		)
		if err := pool.QueryRow(r.Context(), `
			SELECT d.opened_by, d.project_id, d.status::text, d.title, p.title
			  FROM project_disputes d
			  JOIN projects p ON p.id = d.project_id
			 WHERE d.id = $1
		`, disputeID).Scan(&openedBy, &disputeProject, &disputeStatus, &disputeTitle, &projectTitle); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectDispute`, disputeRaw)
				return
			}
			slog.Error("dispute withdraw: dispute", "error", err)
			serverError(w)
			return
		}

		// Bindings before gates: a missing dispute 404s even for a caller
		// who would read 403 on it.
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized. Only project participants can view disputes.")
			return
		}

		if disputeProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		admin, err := isAdminUser(r.Context(), pool, caller.UserID(), subject.RoleType())
		if err != nil {
			slog.Error("dispute withdraw: admin check", "error", err)
			serverError(w)
			return
		}

		if openedBy != caller.UserID() && !admin {
			message(w, http.StatusForbidden, "Only the dispute opener can withdraw it.")
			return
		}

		if disputeStatus != "open" {
			message(w, http.StatusUnprocessableEntity, "This dispute is already closed.")
			return
		}

		var senderName string
		if err := pool.QueryRow(r.Context(),
			`SELECT name FROM users WHERE id = $1`, caller.UserID(),
		).Scan(&senderName); err != nil {
			slog.Error("dispute withdraw: sender", "error", err)
			serverError(w)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			slog.Error("dispute withdraw: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(r.Context())

		if _, err := tx.Exec(r.Context(), `
			UPDATE project_disputes
			   SET status = 'withdrawn', resolution = 'withdrawn',
			       resolution_notes = 'Withdrawn by the opener.',
			       resolved_by = $2, resolved_at = date_trunc('second', now()), updated_at = date_trunc('second', now())
			 WHERE id = $1
		`, disputeID, caller.UserID()); err != nil {
			slog.Error("dispute withdraw: close", "error", err)
			serverError(w)
			return
		}

		details := "Sengketa \"" + disputeTitle + "\" ditarik oleh " + senderName + ". Pembayaran dicabut pembekuannya."
		if _, err := tx.Exec(r.Context(), `
			INSERT INTO project_activity_logs (project_id, user_id, action, details, created_at, updated_at)
			VALUES ($1, $2, 'dispute_withdrawn', $3, date_trunc('second', now()), date_trunc('second', now()))
		`, projectID, caller.UserID(), details); err != nil {
			slog.Error("dispute withdraw: log", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(r.Context(),
			`UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("dispute withdraw: touch", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			slog.Error("dispute withdraw: commit", "error", err)
			serverError(w)
			return
		}

		notifyBody := "Dispute \"" + disputeTitle + "\" was withdrawn. Payments are unfrozen."
		notifyData := `{"project_id":` + strconv.FormatInt(projectID, 10) +
			`,"dispute_id":` + strconv.FormatInt(disputeID, 10) + `}`
		insertDisputeNotifications(r.Context(), pool, projectID, "dispute_resolved", "Dispute Withdrawn", notifyBody, notifyData, caller.UserID())

		fresh, err := readDisputeRow(r.Context(), pool, disputeID)
		if err != nil {
			slog.Error("dispute withdraw: fresh", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Dispute withdrawn. Payments are unfrozen.")
		payload.Set("data", fresh)

		writeJSON(w, http.StatusOK, payload)
	}
}

// lastPathSegment is the fallback id when the mux did not capture one.
func lastPathSegment(path string) string {
	trimmed := path
	for len(trimmed) > 0 && trimmed[len(trimmed)-1] == '/' {
		trimmed = trimmed[:len(trimmed)-1]
	}
	for i := len(trimmed) - 1; i >= 0; i-- {
		if trimmed[i] == '/' {
			return trimmed[i+1:]
		}
	}
	return trimmed
}
