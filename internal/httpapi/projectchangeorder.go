package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CHANGE ORDERS AND TIMELINE EXTENSIONS — the two proposal machines.
//
// Change orders: participants propose a cost/time delta; the assigned PM
// reviews it (`proposed → pm_reviewed` or `rejected`); the OWNER decides
// (`proposed|pm_reviewed → owner_approved|rejected`), and an approval
// with a positive cost mints EXACTLY ONE payment stage (the unique
// `change_order_id` index is the backstop) after checking the escrow can
// still cover it. The list merges change orders with the four billable
// addendum states into one timeline, newest first, with `co-`/`add-`
// prefixed ids.
//
// Extensions: participants request extra days; the PM reviews, the owner
// approves — an approval pushes `projects.deadline` by the requested days
// and records the new date.

// changeOrderColumns is the table order.
var changeOrderColumns = []string{
	"id", "project_id", "requested_by", "role_type", "title", "description",
	"cost_impact", "time_impact_days", "status", "pm_notes", "owner_notes",
	"approved_at", "created_at", "updated_at", "milestone_id",
}

// extensionColumns is the table order.
var extensionColumns = []string{
	"id", "project_id", "requester_id", "reason", "description", "days_requested",
	"status", "original_deadline", "new_deadline_date", "pm_notes", "owner_notes",
	"created_at", "updated_at",
}

// changeOrderObject renders a change order in table order.
func changeOrderObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range changeOrderColumns {
		value := byName[column]
		switch column {
		case "cost_impact":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "approved_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// extensionObject renders an extension in table order.
func extensionObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range extensionColumns {
		value := byName[column]
		switch column {
		case "original_deadline", "new_deadline_date":
			entry.Set(column, mysqlDate(value))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// changeOrderCreatedObject renders Eloquent\u0027s CREATED change order.
func changeOrderCreatedObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("requested_by", projectRawValue(byName["requested_by"]))
	entry.Set("role_type", projectRawValue(byName["role_type"]))
	entry.Set("milestone_id", projectRawValue(byName["milestone_id"]))
	entry.Set("title", projectRawValue(byName["title"]))
	entry.Set("description", projectRawValue(byName["description"]))
	entry.Set("cost_impact", decimalOrNilBid(byName, "cost_impact"))
	entry.Set("time_impact_days", projectRawValue(byName["time_impact_days"]))
	entry.Set("status", projectRawValue(byName["status"]))
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// loadChangeOrder reads one change order bound to the project.
func loadChangeOrder(ctx context.Context, q rowQuerier, projectID, id int64) (map[string]any, bool, error) {
	rows, err := q.(interface {
		Query(context.Context, string, ...any) (pgx.Rows, error)
	}).Query(ctx, `SELECT `+joinColumns(changeOrderColumns)+` FROM project_change_orders WHERE id = $1 AND project_id = $2`, id, projectID)
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

// joinColumns renders a select list.
func joinColumns(columns []string) string {
	out := ""
	for i, c := range columns {
		if i > 0 {
			out += ", "
		}
		if c == "cost_impact" {
			out += c + "::text"
			continue
		}
		out += c
	}
	return out
}

// ChangeOrdersIndexHandler serves
// `GET /api/projects/{project}/change-orders`.
func ChangeOrdersIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
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
			slog.Error("co-index: viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("co-index: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("co-index: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
		_ = viewer

		type item struct {
			obj  *jsonphp.Object
			sort time.Time
		}
		items := make([]item, 0)

		coRows, err := pool.Query(ctx, `SELECT id, title, description, cost_impact::text, status::text, milestone_id, created_at,
			requested_by, (SELECT name FROM users WHERE id = requested_by), (SELECT role_type::text FROM users WHERE id = requested_by)
			FROM project_change_orders WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			slog.Error("co-index: co", "error", err)
			serverError(w)
			return
		}
		for coRows.Next() {
			var id int64
			var title, description, cost, status *string
			var milestoneID *int64
			var createdAt any
			var requesterID *int64
			var requesterName, requesterRole *string
			if err := coRows.Scan(&id, &title, &description, &cost, &status, &milestoneID, &createdAt,
				&requesterID, &requesterName, &requesterRole); err != nil {
				coRows.Close()
				slog.Error("co-index: scan", "error", err)
				serverError(w)
				return
			}
			mapped := "proposed"
			if status != nil {
				switch *status {
				case "owner_approved":
					mapped = "owner_approved"
				case "rejected":
					mapped = "rejected"
				}
			}
			obj := jsonphp.NewObject()
			obj.Set("id", "co-"+strconv.FormatInt(id, 10))
			obj.Set("type", "change_order")
			obj.Set("title", nullableString(title))
			obj.Set("description", nullableString(description))
			obj.Set("cost_impact", nullableString(cost))
			obj.Set("status", mapped)
			if requesterID != nil {
				requester := jsonphp.NewObject()
				requester.Set("id", *requesterID)
				requester.Set("name", nullableString(requesterName))
				requester.Set("role_type", nullableString(requesterRole))
				obj.Set("requester", requester)
			} else {
				obj.Set("requester", nil)
			}
			obj.Set("milestone_id", nullableInt64(milestoneID))
			obj.Set("created_at", projectTimeValue(createdAt))
			items = append(items, item{obj, timeOf(createdAt)})
		}
		coRows.Close()
		if err := coRows.Err(); err != nil {
			slog.Error("co-index: co rows", "error", err)
			serverError(w)
			return
		}

		addRows, err := pool.Query(ctx, `SELECT id, title, description, amount::text, status::text, created_at,
			user_id, (SELECT name FROM users WHERE id = user_id), (SELECT role_type::text FROM users WHERE id = user_id)
			FROM project_addendums WHERE project_id = $1 AND status::text IN ('approved_unpaid','paid','negotiating','accepted_by_pro') ORDER BY id`, projectID)
		if err != nil {
			slog.Error("co-index: add", "error", err)
			serverError(w)
			return
		}
		for addRows.Next() {
			var id int64
			var title, description, amount, status *string
			var createdAt any
			var userID *int64
			var name, role *string
			if err := addRows.Scan(&id, &title, &description, &amount, &status, &createdAt, &userID, &name, &role); err != nil {
				addRows.Close()
				slog.Error("co-index: add scan", "error", err)
				serverError(w)
				return
			}
			mapped := "proposed"
			if status != nil && (*status == "paid" || *status == "approved_unpaid") {
				mapped = "owner_approved"
			}
			obj := jsonphp.NewObject()
			obj.Set("id", "add-"+strconv.FormatInt(id, 10))
			obj.Set("type", "addendum")
			obj.Set("title", nullableString(title))
			obj.Set("description", nullableString(description))
			obj.Set("cost_impact", nullableString(amount))
			obj.Set("status", mapped)
			if userID != nil {
				requester := jsonphp.NewObject()
				requester.Set("id", *userID)
				requester.Set("name", nullableString(name))
				requester.Set("role_type", nullableString(role))
				obj.Set("requester", requester)
			} else {
				obj.Set("requester", nil)
			}
			obj.Set("milestone_id", nil)
			obj.Set("created_at", projectTimeValue(createdAt))
			items = append(items, item{obj, timeOf(createdAt)})
		}
		addRows.Close()

		sort.SliceStable(items, func(i, j int) bool { return items[i].sort.After(items[j].sort) })

		out := make([]any, 0, len(items))
		for _, it := range items {
			out = append(out, it.obj)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// timeOf coerces a scanned timestamp into a time.
func timeOf(value any) time.Time {
	switch typed := value.(type) {
	case time.Time:
		return typed
	case *time.Time:
		if typed != nil {
			return *typed
		}
	case string:
		if parsed, err := time.Parse("2006-01-02 15:04:05", typed); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

// StoreChangeOrderHandler serves
// `POST /api/projects/{project}/change-orders`.
func StoreChangeOrderHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
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
			slog.Error("co-store: viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("co-store: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("co-store: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized. Only project participants can submit change orders.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		input := validateChangeOrder(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if input.milestoneID != nil {
			var owns bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_milestones WHERE id = $1 AND project_id = $2)`,
				*input.milestoneID, projectID).Scan(&owns); err != nil || !owns {
				message(w, http.StatusNotFound, "Not found.")
				return
			}
		}

		var openID int64
		var openTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
			message(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		var orderID int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_change_orders
			(project_id, requested_by, role_type, milestone_id, title, description, cost_impact, time_impact_days, status, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8, 'proposed', date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`,
			projectID, viewer.id, viewer.role, input.milestoneID, input.title, input.description, input.costText, input.timeImpact).Scan(&orderID); err != nil {
			slog.Error("co-store: insert", "error", err)
			serverError(w)
			return
		}

		byName, _, err := loadChangeOrder(ctx, pool, projectID, orderID)
		if err != nil {
			slog.Error("co-store: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Change order submitted.")
		payload.Set("data", changeOrderCreatedObject(byName))
		writeJSON(w, http.StatusCreated, payload)
	}
}

// changeOrderInput is the validated proposal.
type changeOrderInput struct {
	title       string
	description string
	costText    string
	timeImpact  int64
	milestoneID *int64
}

// validateChangeOrder enforces the store rules in declaration order.
func validateChangeOrder(fields map[string]any, failures *errorBag) changeOrderInput {
	var input changeOrderInput

	if raw, present := fields["title"]; !present || raw == nil {
		failures.add("title", "The title field is required.")
	} else if s, isStr := raw.(string); !isStr {
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
	} else if s, isStr := raw.(string); !isStr {
		failures.add("description", "The description field must be a string.")
	} else if s == "" {
		failures.add("description", "The description field is required.")
	} else if len([]rune(s)) > 2000 {
		failures.add("description", "The description field must not be greater than 2000 characters.")
	} else {
		input.description = s
	}

	if raw, present := fields["cost_impact"]; !present || raw == nil {
		failures.add("cost_impact", "The cost impact field is required.")
	} else if text, ok := numericTextOf(raw); !ok || text == "" || !isNumericText(text) {
		failures.add("cost_impact", "The cost impact field must be a number.")
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("cost_impact", "The cost impact field must be a number.")
	} else if parsed < 0 {
		failures.add("cost_impact", "The cost impact field must be at least 0.")
	} else if parsed > 99999999999999 {
		failures.add("cost_impact", "The cost impact field must not be greater than 99999999999999.")
	} else {
		input.costText = text
	}

	if raw, present := fields["time_impact_days"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && text != "" {
			if !isIntegerText(text) {
				failures.add("time_impact_days", "The time impact days field must be an integer.")
			} else if parsed, err := strconv.ParseInt(stringsTrim(text), 10, 64); err != nil {
				failures.add("time_impact_days", "The time impact days field must be an integer.")
			} else if parsed < 0 {
				failures.add("time_impact_days", "The time impact days field must be at least 0.")
			} else if parsed > 3650 {
				failures.add("time_impact_days", "The time impact days field must not be greater than 3650.")
			} else {
				input.timeImpact = parsed
			}
		}
	}

	if raw, present := fields["milestone_id"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			if parsed, err := strconv.ParseInt(stringsTrim(text), 10, 64); err == nil {
				input.milestoneID = &parsed
			}
		} else {
			failures.add("milestone_id", "The selected milestone id is invalid.")
		}
	}

	return input
}

// stringsTrim trims a numeric text.
func stringsTrim(text string) string {
	out := text
	for len(out) > 0 && (out[0] == ' ' || out[0] == '\t') {
		out = out[1:]
	}
	for len(out) > 0 && (out[len(out)-1] == ' ' || out[len(out)-1] == '\t') {
		out = out[:len(out)-1]
	}
	return out
}

// ChangeOrderDecisionHandler serves pm-review and owner-decide.
func ChangeOrderDecisionHandler(pool *pgxpool.Pool, verb string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("changeOrder")
		if rawID == "" {
			rawID = lastPathSegment(stringsTrimSuffix(r.URL.Path, "/"+verb))
		}
		orderID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectChangeOrder`, rawID)
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
			slog.Error("co-"+verb+": viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmProfile *int64
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &pmProfile); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			serverError(w)
			return
		}

		byName, found, err := loadChangeOrder(ctx, pool, projectID, orderID)
		if err != nil || !found {
			message(w, http.StatusNotFound, "Not found.")
			return
		}
		status, _ := byName["status"].(string)

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}

		if verb == "pm-review" {
			if viewer.role != "project_manager" || !verifyAssignedPM(viewer, pmProfile) {
				message(w, http.StatusForbidden, "Only the assigned PM can review change orders.")
				return
			}
			if status != "proposed" {
				message(w, http.StatusUnprocessableEntity, "This change order has already been reviewed (status: "+status+").")
				return
			}
			notes, action := validateCOReview(formFields, failures)
			if !failures.empty() {
				failures.write(w)
				return
			}
			newStatus := "rejected"
			if action == "approve" {
				newStatus = "pm_reviewed"
			}
			if _, err := pool.Exec(ctx, `UPDATE project_change_orders SET pm_notes = $2, status = $3,
				updated_at = date_trunc('second', now()) WHERE id = $1`, orderID, notes, newStatus); err != nil {
				slog.Error("co-pm: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if viewer.id != ownerID {
				message(w, http.StatusForbidden, "Only the project Owner can approve change orders.")
				return
			}
			action, ownerNotes := validateCOOwner(formFields, failures)
			if !failures.empty() {
				failures.write(w)
				return
			}
			if status != "proposed" && status != "pm_reviewed" {
				message(w, http.StatusUnprocessableEntity, "This change order has already been decided (status: "+status+").")
				return
			}
			var openID int64
			var openTitle string
			if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
				message(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
				return
			}

			if action == "approve" {
				costText, _ := byName["cost_impact"].(string)
				costMinor := mustMinor(costText)
				roleType, _ := byName["role_type"].(string)
				if roleType == "" {
					roleType = "kontraktor"
				}
				milestoneID := intPtrOf(byName["milestone_id"])
				title, _ := byName["title"].(string)

				tx, err := pool.Begin(ctx)
				if err != nil {
					slog.Error("co-owner: begin", "error", err)
					serverError(w)
					return
				}
				defer tx.Rollback(ctx)

				status := "locked"
				if milestoneID != nil {
					var approval *string
					_ = tx.QueryRow(ctx, `SELECT approval_status::text FROM project_milestones WHERE id = $1`, *milestoneID).Scan(&approval)
					if approval != nil && *approval == "approved" {
						status = "pending"
					}
				}

				if costMinor > 0 {
					var budgetText string
					if err := tx.QueryRow(ctx, `SELECT budget::text FROM projects WHERE id = $1 FOR UPDATE`, projectID).Scan(&budgetText); err != nil {
						slog.Error("co-owner: budget", "error", err)
						serverError(w)
						return
					}
					paid, err := paidTotalMinor(ctx, tx, projectID)
					if err != nil {
						slog.Error("co-owner: paid", "error", err)
						serverError(w)
						return
					}
					available := mustMinor(budgetText) - paid
					if costMinor > available+1 {
						message(w, http.StatusUnprocessableEntity, "This change order costs Rp "+formatIDAmount(costMinor)+" but only Rp "+formatIDAmount(available)+" of escrow remains. Increase the project budget before approving.")
						return
					}

					if _, err := tx.Exec(ctx, `INSERT INTO project_payment_termins
						(project_id, label, percentage, amount, retention_amount, net_amount, trigger_description, notes,
						 status, role_type, milestone_id, change_order_id, created_at, updated_at)
						VALUES ($1, $2, 0, $3::numeric, 0, $3::numeric, $4, $5, $6::payment_termin_status, $7, $8, $9,
						 date_trunc('second', now()), date_trunc('second', now()))`,
						projectID, "Change Order: "+title, formatMinor(costMinor),
						"Completion of Change Order: "+title,
						"Auto-generated from approved Change Order #"+strconv.FormatInt(orderID, 10),
						status, roleType, milestoneID, orderID); err != nil {
						slog.Error("co-owner: termin", "error", err)
						message(w, http.StatusUnprocessableEntity, "A payment stage already exists for this change order.")
						return
					}
				}

				if _, err := tx.Exec(ctx, `UPDATE project_change_orders SET owner_notes = $2, status = 'owner_approved',
					approved_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`,
					orderID, ownerNotes); err != nil {
					slog.Error("co-owner: update", "error", err)
					serverError(w)
					return
				}

				if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
					slog.Error("co-owner: touch", "error", err)
					serverError(w)
					return
				}

				if err := tx.Commit(ctx); err != nil {
					slog.Error("co-owner: commit", "error", err)
					serverError(w)
					return
				}
			} else {
				if _, err := pool.Exec(ctx, `UPDATE project_change_orders SET owner_notes = $2, status = 'rejected',
					updated_at = date_trunc('second', now()) WHERE id = $1`, orderID, ownerNotes); err != nil {
					slog.Error("co-owner: reject", "error", err)
					serverError(w)
					return
				}
			}
		}

		fresh, _, err := loadChangeOrder(ctx, pool, projectID, orderID)
		if err != nil {
			slog.Error("co-"+verb+": reload", "error", err)
			serverError(w)
			return
		}

		msg := "Change order reviewed."
		if verb != "pm-review" {
			msg = "Change order decided."
		}
		payload := jsonphp.NewObject()
		payload.Set("message", msg)
		payload.Set("data", changeOrderObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateCOReview enforces pm_notes required|string|max:2000 and
// action required|in:approve,reject.
func validateCOReview(fields map[string]any, failures *errorBag) (notes, action string) {
	raw, present := fields["pm_notes"]
	if !present || raw == nil {
		failures.add("pm_notes", "The pm notes field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("pm_notes", "The pm notes field must be a string.")
	} else if s == "" {
		failures.add("pm_notes", "The pm notes field is required.")
	} else if len([]rune(s)) > 2000 {
		failures.add("pm_notes", "The pm notes field must not be greater than 2000 characters.")
	} else {
		notes = s
	}

	action = validateAction(fields, failures)
	return notes, action
}

// validateCOOwner enforces action required|in:approve,reject and
// owner_notes nullable|string|max:2000.
func validateCOOwner(fields map[string]any, failures *errorBag) (action string, notes any) {
	action = validateAction(fields, failures)

	if raw, present := fields["owner_notes"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("owner_notes", "The owner notes field must be a string.")
		} else if len([]rune(s)) > 2000 {
			failures.add("owner_notes", "The owner notes field must not be greater than 2000 characters.")
		} else if s != "" {
			notes = s
		}
	}
	return action, notes
}

// validateAction enforces action required|in:approve,reject.
func validateAction(fields map[string]any, failures *errorBag) string {
	raw, present := fields["action"]
	if !present || raw == nil {
		failures.add("action", "The action field is required.")
		return ""
	}
	s, isStr := raw.(string)
	if !isStr {
		failures.add("action", "The selected action is invalid.")
		return ""
	}
	if s == "" {
		failures.add("action", "The action field is required.")
		return ""
	}
	if s != "approve" && s != "reject" {
		failures.add("action", "The selected action is invalid.")
		return ""
	}
	return s
}

// stringsTrimSuffix removes a suffix when present.
func stringsTrimSuffix(text, suffix string) string {
	if len(text) >= len(suffix) && text[len(text)-len(suffix):] == suffix {
		return text[:len(text)-len(suffix)]
	}
	return text
}
