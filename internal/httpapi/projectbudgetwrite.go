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

// BUDGET WRITES — transactions and the sandbox plan.
//
// `POST /api/projects/{project}/budget/transactions` moves the escrow
// ceiling itself (deposit raises it, adjustment_down lowers it) through
// the same deductBudget guard every other money path uses; the row it
// answers is re-read with the latest-id lookup, and `budget` echoes the
// fresh ceiling as a decimal string.
//
// The four sandbox endpoints plan hypothetical spend: create answers the
// row in CREATE order (the freshly-minted model), while toggle and update
// answer it in TABLE order (the re-read row). Validation on the
// transaction endpoint answers a CUSTOM 422 envelope (`Validation
// error`, not the summarized shape); the sandbox endpoints answer the
// standard bag. Auth is owner-only for transactions, owner-or-assigned-PM
// for the sandbox, both with the controller's own sentences rather than
// the middleware shape.

// AddTransactionHandler serves
// `POST /api/projects/{project}/budget/transactions`.
func AddTransactionHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		rawProject := r.PathValue("project")
		if rawProject == "" {
			rawProject = projectPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(rawProject, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("txn: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("txn: project", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)
		if viewer.id != ownerID {
			message(w, http.StatusForbidden, "Unauthorized. Only the project owner can adjust the total balance.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		txnType, amountText := validateTransactionFields(formFields, failures)
		if !failures.empty() {
			writeTransactionValidation(w, failures)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("txn: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var lockedBudget string
		if err := tx.QueryRow(ctx, `SELECT budget::text FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&lockedBudget); err != nil {
			slog.Error("txn: lock", "error", err)
			serverError(w)
			return
		}

		budgetMinor, _ := parseMinor(lockedBudget)
		amountMinor, ok := parseMinor(strings.TrimSpace(amountText))
		if !ok {
			slog.Error("txn: amount", "amount", amountText)
			serverError(w)
			return
		}

		newBudget := budgetMinor
		if txnType == "deposit" {
			newBudget = budgetMinor + amountMinor
		} else {
			paid, err := paidTotalMinor(ctx, tx, projectID)
			if err != nil {
				slog.Error("txn: paid", "error", err)
				serverError(w)
				return
			}
			if budgetMinor-paid < amountMinor {
				message(w, http.StatusUnprocessableEntity, "Transaction failed: insufficient escrow to reduce.")
				return
			}
			newBudget = budgetMinor - amountMinor
		}

		if _, err := tx.Exec(ctx, `UPDATE projects SET budget = $2, updated_at = date_trunc('second', now()) WHERE id = $1`, projectID, formatMinor(newBudget)); err != nil {
			slog.Error("txn: budget", "error", err)
			serverError(w)
			return
		}

		var ledgerID int64
		if err := tx.QueryRow(ctx, `INSERT INTO project_budget_transactions
			(project_id, transaction_type, amount, title, transaction_date, actor_user_id, actor_role, created_at, updated_at)
			VALUES ($1, $2, $3, $4, date_trunc('second', now()), $5, $6, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, txnType, formatMinor(amountMinor), txnTitle(formFields), viewer.id, viewer.role).Scan(&ledgerID); err != nil {
			slog.Error("txn: insert", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("txn: commit", "error", err)
			serverError(w)
			return
		}

		entry, err := loadLedgerRow(ctx, pool, projectID, txnType, txnTitle(formFields))
		if err != nil {
			slog.Error("txn: reload", "error", err)
			serverError(w)
			return
		}

		var freshBudget string
		if err := pool.QueryRow(ctx, `SELECT budget::text FROM projects WHERE id = $1`, projectID).Scan(&freshBudget); err != nil {
			slog.Error("txn: fresh", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Transaction recorded successfully")
		payload.Set("transaction", entry)
		payload.Set("budget", freshBudget)

		writeJSON(w, http.StatusOK, payload)
	}
}

// txnTitle reads the validated title as text.
func txnTitle(fields map[string]any) string {
	if s, ok := fields["title"].(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

// validateTransactionFields enforces transaction_type
// required|in:deposit,adjustment_down, amount
// required|numeric|min:1|max:99999999999999, and title
// required|string|max:255 — in declaration order, with the empty string
// reading as missing.
func validateTransactionFields(fields map[string]any, failures *errorBag) (txnType, amountText string) {
	if raw, present := fields["transaction_type"]; !present || raw == nil {
		failures.add("transaction_type", "The transaction type field is required.")
	} else if s, isStr := raw.(string); isStr && strings.TrimSpace(s) == "" {
		failures.add("transaction_type", "The transaction type field is required.")
	} else if s, isStr := raw.(string); !isStr || (s != "deposit" && s != "adjustment_down") {
		failures.add("transaction_type", "The selected transaction type is invalid.")
	} else {
		txnType = s
	}

	if raw, present := fields["amount"]; !present || raw == nil {
		failures.add("amount", "The amount field is required.")
	} else if s, isStr := raw.(string); isStr && strings.TrimSpace(s) == "" {
		failures.add("amount", "The amount field is required.")
	} else if text, present := numericTextOf(raw); !present || text == "" {
		failures.add("amount", "The amount field must be a number.")
	} else if !isNumericText(text) {
		failures.add("amount", "The amount field must be a number.")
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("amount", "The amount field must be a number.")
	} else if parsed < 1 {
		failures.add("amount", "The amount field must be at least 1.")
	} else if parsed > 99999999999999 {
		failures.add("amount", "The amount field must not be greater than 99999999999999.")
	} else {
		amountText = strings.TrimSpace(text)
	}

	if raw, present := fields["title"]; !present || raw == nil {
		failures.add("title", "The title field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("title", "The title field must be a string.")
	} else if s == "" {
		failures.add("title", "The title field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("title", "The title field must not be greater than 255 characters.")
	}

	return txnType, amountText
}

// writeTransactionValidation answers the transaction endpoint's custom
// 422 envelope: the literal message, not the summarized one.
func writeTransactionValidation(w http.ResponseWriter, failures *errorBag) {
	errors := jsonphp.NewObject()
	for _, field := range failures.fields {
		items := make([]any, 0, len(failures.bag[field]))
		for _, text := range failures.bag[field] {
			items = append(items, text)
		}
		errors.Set(field, items)
	}

	payload := jsonphp.NewObject()
	payload.Set("message", "Validation error")
	payload.Set("errors", errors)

	writeJSON(w, http.StatusUnprocessableEntity, payload)
}

// loadLedgerRow re-reads the latest matching ledger row the way the
// controller's lookup does: same project, null reference, same title and
// type, newest id.
func loadLedgerRow(ctx context.Context, pool *pgxpool.Pool, projectID int64, txnType, title string) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, transaction_type, amount::text, title, category, type, status, description, reference_model, reference_id, reverses_model, reverses_id, transaction_date, actor_user_id, actor_role, voided_at, voided_duplicate_of_id, voided_original_amount::text, created_at, updated_at
		FROM project_budget_transactions
		WHERE project_id = $1 AND reference_id IS NULL AND title = $2 AND transaction_type = $3
		ORDER BY id DESC LIMIT 1`, projectID, title, txnType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, errLedgerGone
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return renderLedgerRow(fields, values), nil
}

// errLedgerGone reports a ledger row the lookup cannot find.
type errLedgerGoneT struct{}

func (errLedgerGoneT) Error() string { return "ledger row not found" }

var errLedgerGone = errLedgerGoneT{}

// renderLedgerRow renders one ledger row in MySQL column order.
func renderLedgerRow(fields []string, values []any) *jsonphp.Object {
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	entry := jsonphp.NewObject()
	for _, column := range fields {
		value := byName[column]
		switch column {
		case "amount", "voided_original_amount":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "transaction_date", "voided_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	return entry
}

// sandboxGate reports whether the caller may plan spend: the owner or
// the assigned PM.
func sandboxGate(viewer *projectViewer, ownerID int64, pmID *int64) bool {
	if viewer == nil || viewer.id == 0 {
		return false
	}
	if viewer.id == ownerID {
		return true
	}
	if pmID != nil && *pmID != 0 {
		if own, ok := viewer.profiles["project_manager"]; ok && own == *pmID {
			return true
		}
	}
	return false
}

// sandboxProject loads the project row for the sandbox gate: owner and
// PM columns, with the 404 when the project is missing.
func sandboxProject(w http.ResponseWriter, ctx context.Context, pool *pgxpool.Pool, rawProject string, projectID int64) (ownerID int64, pmID *int64, ok bool) {
	var owner int64
	var pm *int64
	if err := pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`, projectID).Scan(&owner, &pm); err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return 0, nil, false
		}
		slog.Error("sandbox: project", "error", err)
		serverError(w)
		return 0, nil, false
	}
	return owner, pm, true
}

// validateSandboxFields enforces title required|string|max:255 and
// estimated_amount required|numeric|min:1 in declaration order.
func validateSandboxFields(fields map[string]any, failures *errorBag) (title, amountText string) {
	if raw, present := fields["title"]; !present || raw == nil {
		failures.add("title", "The title field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("title", "The title field must be a string.")
	} else if s == "" {
		failures.add("title", "The title field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("title", "The title field must not be greater than 255 characters.")
	} else {
		title = s
	}

	if raw, present := fields["estimated_amount"]; !present || raw == nil {
		failures.add("estimated_amount", "The estimated amount field is required.")
	} else if s, isStr := raw.(string); isStr && strings.TrimSpace(s) == "" {
		failures.add("estimated_amount", "The estimated amount field is required.")
	} else if text, present := numericTextOf(raw); !present || text == "" {
		failures.add("estimated_amount", "The estimated amount field must be a number.")
	} else if !isNumericText(text) {
		failures.add("estimated_amount", "The estimated amount field must be a number.")
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("estimated_amount", "The estimated amount field must be a number.")
	} else if parsed < 1 {
		failures.add("estimated_amount", "The estimated amount field must be at least 1.")
	} else {
		amountText = strings.TrimSpace(text)
	}

	return title, amountText
}

// sandboxItemByID loads one sandbox row bound to the project: a missing
// row answers the model 404, a row from another project the plain one.
func sandboxItemByID(w http.ResponseWriter, ctx context.Context, pool *pgxpool.Pool, projectID int64, rawID string) (int64, bool) {
	itemID, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil {
		modelNotFound(w, `App\Models\ProjectBudgetSandbox`, rawID)
		return 0, false
	}

	var rowProject int64
	if err := pool.QueryRow(ctx, `SELECT project_id FROM project_budget_sandbox WHERE id = $1`, itemID).Scan(&rowProject); err != nil {
		if isNoRows(err) {
			modelNotFound(w, `App\Models\ProjectBudgetSandbox`, rawID)
			return 0, false
		}
		slog.Error("sandbox: load", "error", err)
		serverError(w)
		return 0, false
	}

	if rowProject != projectID {
		message(w, http.StatusNotFound, "Not found.")
		return 0, false
	}

	return itemID, true
}

// renderSandboxRow renders one sandbox row in table order.
func renderSandboxRow(ctx context.Context, pool *pgxpool.Pool, itemID int64) (*jsonphp.Object, error) {
	var id, projectID *int64
	var title, estimated *string
	var active *bool
	var createdAt, updatedAt any

	if err := pool.QueryRow(ctx, `SELECT id, project_id, title, estimated_amount::text, is_active, created_at, updated_at
		FROM project_budget_sandbox WHERE id = $1`, itemID).Scan(
		&id, &projectID, &title, &estimated, &active, &createdAt, &updatedAt); err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	entry.Set("id", nullableInt64(id))
	entry.Set("project_id", nullableInt64(projectID))
	entry.Set("title", nullableString(title))
	entry.Set("estimated_amount", nullableString(estimated))
	entry.Set("is_active", active != nil && *active)
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("updated_at", projectTimeValue(updatedAt))

	return entry, nil
}

// AddSandboxHandler serves
// `POST /api/projects/{project}/budget/sandbox`.
func AddSandboxHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		rawProject := r.PathValue("project")
		if rawProject == "" {
			rawProject = projectPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(rawProject, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("sandbox: viewer", "error", err)
			serverError(w)
			return
		}

		ownerID, pmID, ok := sandboxProject(w, ctx, pool, rawProject, projectID)
		if !ok {
			return
		}

		if !sandboxGate(viewer, ownerID, pmID) {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		title, amountText := validateSandboxFields(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var itemID int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_budget_sandbox (project_id, title, estimated_amount, is_active, created_at, updated_at)
			VALUES ($1, $2, $3::numeric, true, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, title, amountText).Scan(&itemID); err != nil {
			slog.Error("sandbox: insert", "error", err)
			serverError(w)
			return
		}

		var createdAt, updatedAt any
		var estimated string
		if err := pool.QueryRow(ctx, `SELECT estimated_amount::text, created_at, updated_at FROM project_budget_sandbox WHERE id = $1`, itemID).Scan(&estimated, &createdAt, &updatedAt); err != nil {
			slog.Error("sandbox: reload", "error", err)
			serverError(w)
			return
		}

		// The 201 echoes the create in input order — project first, id
		// last — not the table order.
		created := jsonphp.NewObject()
		created.Set("project_id", projectID)
		created.Set("title", title)
		created.Set("estimated_amount", estimated)
		created.Set("is_active", true)
		created.Set("updated_at", projectTimeValue(updatedAt))
		created.Set("created_at", projectTimeValue(createdAt))
		created.Set("id", itemID)

		payload := jsonphp.NewObject()
		payload.Set("item", created)

		writeJSON(w, http.StatusOK, payload)
	}
}

// ToggleSandboxHandler serves
// `PUT /api/projects/{project}/budget/sandbox/{id}`.
func ToggleSandboxHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		rawProject := r.PathValue("project")
		if rawProject == "" {
			rawProject = projectPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(rawProject, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("id")
		if rawID == "" {
			rawID = sandboxIDFromPath(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("sandbox: viewer", "error", err)
			serverError(w)
			return
		}

		ownerID, pmID, ok := sandboxProject(w, ctx, pool, rawProject, projectID)
		if !ok {
			return
		}

		if !sandboxGate(viewer, ownerID, pmID) {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		itemID, ok := sandboxItemByID(w, ctx, pool, projectID, rawID)
		if !ok {
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_budget_sandbox SET is_active = NOT is_active, updated_at = date_trunc('second', now()) WHERE id = $1`, itemID); err != nil {
			slog.Error("sandbox: toggle", "error", err)
			serverError(w)
			return
		}

		entry, err := renderSandboxRow(ctx, pool, itemID)
		if err != nil {
			slog.Error("sandbox: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("item", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// UpdateSandboxHandler serves
// `PUT /api/projects/{project}/budget/sandbox/{id}/update`.
func UpdateSandboxHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		rawProject := r.PathValue("project")
		if rawProject == "" {
			rawProject = projectPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(rawProject, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("id")
		if rawID == "" {
			rawID = sandboxIDFromPath(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("sandbox: viewer", "error", err)
			serverError(w)
			return
		}

		ownerID, pmID, ok := sandboxProject(w, ctx, pool, rawProject, projectID)
		if !ok {
			return
		}

		if !sandboxGate(viewer, ownerID, pmID) {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		title, amountText := validateSandboxFields(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		itemID, ok := sandboxItemByID(w, ctx, pool, projectID, rawID)
		if !ok {
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE project_budget_sandbox SET title = $2, estimated_amount = $3::numeric, updated_at = date_trunc('second', now()) WHERE id = $1`,
			itemID, title, amountText); err != nil {
			slog.Error("sandbox: update", "error", err)
			serverError(w)
			return
		}

		entry, err := renderSandboxRow(ctx, pool, itemID)
		if err != nil {
			slog.Error("sandbox: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("item", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// DeleteSandboxHandler serves
// `DELETE /api/projects/{project}/budget/sandbox/{id}`.
func DeleteSandboxHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		rawProject := r.PathValue("project")
		if rawProject == "" {
			rawProject = projectPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(rawProject, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("id")
		if rawID == "" {
			rawID = sandboxIDFromPath(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("sandbox: viewer", "error", err)
			serverError(w)
			return
		}

		ownerID, pmID, ok := sandboxProject(w, ctx, pool, rawProject, projectID)
		if !ok {
			return
		}

		if !sandboxGate(viewer, ownerID, pmID) {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		itemID, ok := sandboxItemByID(w, ctx, pool, projectID, rawID)
		if !ok {
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM project_budget_sandbox WHERE id = $1`, itemID); err != nil {
			slog.Error("sandbox: delete", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Sandbox item deleted successfully")

		writeJSON(w, http.StatusOK, payload)
	}
}

// sandboxIDFromPath reads the segment after "sandbox", skipping a
// trailing "update".
func sandboxIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := 0; i < len(parts); i++ {
		if parts[i] == "sandbox" && i+1 < len(parts) {
			if parts[i+1] != "update" {
				return parts[i+1]
			}
		}
	}
	return lastPathSegment(path)
}
