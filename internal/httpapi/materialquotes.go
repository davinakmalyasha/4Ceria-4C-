package httpapi

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MATERIAL QUOTES — the buyer's request-for-quote and its lifecycle.
//
//   - GET material-quotes: quotes the caller SENT, plus (for a supplier) the
//     quotes addressed to their store; newest first, capped at 100, each with
//     supplier / project / user.
//   - POST material-quotes: validates the nested item list, sums the total in
//     EXACT minor units (Money, never float accumulation), refuses a project
//     link the caller neither owns nor works on as an active sub-professional,
//     and answers 201 with the CREATED model plus supplier/project.
//
// The remaining verbs (request-payment, payment-proof, mark-paid, approve,
// post-delivery-job) touch the escrow ledger and are still proxied.

// materialQuoteColumns is the table order.
var materialQuoteColumns = []string{
	"id", "user_id", "supplier_id", "project_id", "items", "delivery_address",
	"total_amount", "status", "note", "created_at", "updated_at", "shipping_cost",
	"delivery_method", "latitude", "longitude", "address_detail", "total_weight",
	"payment_proof_path", "paid_at", "payment_verified_by", "payment_verified_at",
	"payment_notes",
}

// supplierModelColumns is the `suppliers` table order.
var supplierModelColumns = []string{
	"id", "user_id", "store_name", "address", "no_telp", "category", "bio",
	"verification_status", "rejection_reason", "foto", "created_at", "updated_at",
	"detail_location", "latitude", "longitude",
}

// supplierRelationObject renders the Supplier model (casts only — no appends).
func supplierRelationObject(ctx context.Context, pool *pgxpool.Pool, supplierID int64) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(supplierModelColumns, ", ")+`
		FROM suppliers WHERE id = $1`, supplierID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, errLedgerGone
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	for i, column := range fields {
		switch column {
		case "latitude", "longitude":
			entry.Set(column, numericFloatValue(values[i]))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(values[i]))
		default:
			entry.Set(column, projectRawValue(values[i]))
		}
	}
	return entry, rows.Err()
}

// materialQuoteObject renders a quote in table order. `items` is the stored
// JSON read as TEXT so its key order survives; the created response passes
// the client's own ordered array instead.
func materialQuoteObject(ctx context.Context, pool *pgxpool.Pool, byName map[string]any, createdItems any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range materialQuoteColumns {
		value := byName[column]
		switch column {
		case "items":
			if createdItems != nil {
				entry.Set(column, createdItems)
			} else {
				entry.Set(column, orderedJSONColumn(value))
			}
		case "total_amount", "shipping_cost", "total_weight":
			entry.Set(column, projectDecimalValue(value))
		case "latitude", "longitude":
			entry.Set(column, numericFloatValue(value))
		case "paid_at", "payment_verified_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		case "payment_verified_by":
			entry.Set(column, projectIntValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}
	return entry
}

// orderedJSONColumn parses a selected `::text` JSON column preserving order.
func orderedJSONColumn(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		if typed == "" || typed == "null" {
			return nil
		}
		return decodeOrderedJSON(typed)
	case []byte:
		if len(typed) == 0 {
			return nil
		}
		return decodeOrderedJSON(string(typed))
	default:
		return jsonVal(value)
	}
}

// materialQuoteRelations attaches supplier/project/user in the endpoint's
// load order.
func materialQuoteRelations(ctx context.Context, pool *pgxpool.Pool, entry *jsonphp.Object, byName map[string]any, relations []string) error {
	for _, relation := range relations {
		switch relation {
		case "supplier":
			supplierID := intPtrDeref(byName["supplier_id"])
			if supplierID == 0 {
				entry.Set("supplier", nil)
				continue
			}
			block, err := supplierRelationObject(ctx, pool, supplierID)
			if err != nil {
				if isNoRows(err) {
					entry.Set("supplier", nil)
					continue
				}
				return err
			}
			entry.Set("supplier", block)
		case "project":
			projectID := intPtrDeref(byName["project_id"])
			if projectID == 0 {
				entry.Set("project", nil)
				continue
			}
			block, err := rawProjectModel(ctx, pool, projectID)
			if err != nil {
				if isNoRows(err) {
					entry.Set("project", nil)
					continue
				}
				return err
			}
			entry.Set("project", block)
		case "user":
			userID := intPtrDeref(byName["user_id"])
			if userID == 0 {
				entry.Set("user", nil)
				continue
			}
			user, err := fullProfileUser(ctx, pool, userID, false)
			if err != nil {
				return err
			}
			entry.Set("user", user)
		}
	}
	return nil
}

// quoteSelectList renders the SELECT list with the money columns as TEXT so
// every consumer sees the decimal string Laravel's decimal cast produces.
func quoteSelectList() string {
	parts := make([]string, 0, len(materialQuoteColumns))
	for _, column := range materialQuoteColumns {
		switch column {
		case "items":
			parts = append(parts, "items::text AS items")
		case "total_amount", "shipping_cost", "total_weight":
			parts = append(parts, column+"::text AS "+column)
		case "latitude", "longitude":
			parts = append(parts, column+"::float8 AS "+column)
		default:
			parts = append(parts, column)
		}
	}
	return strings.Join(parts, ", ")
}

// loadMaterialQuoteRow reads one quote (items as text).
func loadMaterialQuoteRow(ctx context.Context, pool *pgxpool.Pool, quoteID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+quoteSelectList()+`
		FROM material_quotes WHERE id = $1`, quoteID)
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

// MaterialQuotesIndexHandler serves `GET /api/material-quotes`.
func MaterialQuotesIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("quotes: viewer", "error", err)
			serverError(w)
			return
		}

		query := `SELECT ` + quoteSelectList() + `
			FROM material_quotes`
		args := []any{}
		if viewer.role == "supplier" {
			// `suppliers` is NOT one of the bid roles loadViewer indexes, so
			// the profile id is read here.
			var supplierID int64
			if err := pool.QueryRow(ctx, `SELECT id FROM suppliers WHERE user_id = $1`, viewer.id).Scan(&supplierID); err == nil && supplierID != 0 {
				args = append(args, supplierID, viewer.id)
				query += ` WHERE supplier_id = $1 OR user_id = $2`
			} else {
				args = append(args, viewer.id)
				query += ` WHERE user_id = $1`
			}
		} else {
			args = append(args, viewer.id)
			query += ` WHERE user_id = $1`
		}
		query += ` ORDER BY created_at DESC, id ASC LIMIT 100`

		rows, err := pool.Query(ctx, query, args...)
		if err != nil {
			slog.Error("quotes: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("quotes: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry := materialQuoteObject(ctx, pool, byName, nil)
			if err := materialQuoteRelations(ctx, pool, entry, byName, []string{"supplier", "project", "user"}); err != nil {
				slog.Error("quotes: relations", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("quotes: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// quoteItem is one validated line.
type quoteItem struct {
	materialID    int64
	name          string
	priceAtQuote  string
	qty           int64
	unit          string
	requirementID *int64
}

// StoreMaterialQuoteHandler serves `POST /api/material-quotes`.
func StoreMaterialQuoteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		// The created response must echo `items` in the CLIENT'S key order
		// (PHP keeps the validated array as-is). Decode the JSON body once
		// with the order-preserving parser before requestFields consumes it.
		var orderedItems any
		if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			body, err := io.ReadAll(r.Body)
			if err == nil {
				r.Body = io.NopCloser(bytes.NewReader(body))
				if root, ok := decodeOrderedJSON(string(body)).(*jsonphp.Object); ok {
					if items, present := root.Get("items"); present {
						orderedItems = items
					}
				}
			}
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		input := validateMaterialQuote(ctx, pool, formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		// Money is accumulated as EXACT integer minor units.
		total := money.Zero("IDR")
		for _, item := range input.items {
			line, err := money.FromColumn(item.priceAtQuote, "IDR")
			if err != nil {
				slog.Error("quotes: price", "error", err)
				serverError(w)
				return
			}
			line, err = line.MultiplyBy(float64(item.qty))
			if err != nil {
				slog.Error("quotes: multiply", "error", err)
				serverError(w)
				return
			}
			total, err = total.Add(line)
			if err != nil {
				slog.Error("quotes: add", "error", err)
				serverError(w)
				return
			}
		}

		// L6: a quote may only link to a project the requester owns or works
		// on as an ACTIVE sub-professional.
		if input.projectID != nil {
			var owns bool
			_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1 AND user_id = $2)`,
				*input.projectID, caller.UserID()).Scan(&owns)
			if !owns {
				var subPro bool
				_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals
					WHERE project_id = $1 AND user_id = $2 AND status::text = 'active')`,
					*input.projectID, caller.UserID()).Scan(&subPro)
				if !subPro {
					payload := jsonphp.NewObject()
					payload.Set("success", false)
					payload.Set("message", "You can only request quotes for your own projects.")
					writeJSON(w, http.StatusForbidden, payload)
					return
				}
			}
		}

		// Store exactly what the client sent (PHP keeps the validated array
		// unchanged, including each value's JSON type); fall back to the
		// canonical line shape for form-encoded bodies.
		var itemsToStore any = input.itemsJSON
		if orderedItems != nil {
			itemsToStore = orderedItems
		}
		encodedItems, err := jsonphp.Marshal(itemsToStore)
		if err != nil {
			serverError(w)
			return
		}

		var projectArg any
		if input.projectID != nil {
			projectArg = *input.projectID
		}

		var quoteID int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO material_quotes
			(user_id, supplier_id, project_id, items, delivery_address, total_amount,
			 status, note, created_at, updated_at, shipping_cost, delivery_method,
			 latitude, longitude, address_detail, total_weight)
			VALUES ($1, $2, $3, $4::jsonb, $5, $6::numeric, 'pending', $7,
			 date_trunc('second', now()), date_trunc('second', now()), 0, $8,
			 $9::numeric, $10::numeric, $11, NULL)
			RETURNING id, created_at, updated_at`,
			caller.UserID(), input.supplierID, projectArg, string(encodedItems),
			input.deliveryAddress, total.Decimal(), input.note,
			input.deliveryMethod, numericArg(input.latitude), numericArg(input.longitude),
			input.addressDetail).Scan(&quoteID, &createdAt, &updatedAt); err != nil {
			slog.Error("quotes: insert", "error", err)
			serverError(w)
			return
		}

		// The CREATED model: payload order, timestamps, id, then the two
		// eager-loaded relations.
		byName := map[string]any{
			"id": quoteID, "user_id": caller.UserID(), "supplier_id": input.supplierID,
			"project_id": projectArg, "items": string(encodedItems),
			"delivery_address": input.deliveryAddress, "total_amount": total.Decimal(),
			"status": "pending", "note": input.note, "created_at": createdAt,
			"updated_at": updatedAt, "shipping_cost": "0.00",
			"delivery_method": input.deliveryMethod, "latitude": input.latitude,
			"longitude": input.longitude, "address_detail": input.addressDetail,
			"total_weight": nil, "payment_proof_path": nil, "paid_at": nil,
			"payment_verified_by": nil, "payment_verified_at": nil, "payment_notes": nil,
		}

		// Build in CREATE order rather than table order.
		entry := jsonphp.NewObject()
		entry.Set("user_id", caller.UserID())
		entry.Set("supplier_id", input.supplierID)
		entry.Set("project_id", projectArg)
		if orderedItems != nil {
			entry.Set("items", orderedItems)
		} else {
			entry.Set("items", input.itemsJSON)
		}
		entry.Set("delivery_address", input.deliveryAddress)
		entry.Set("address_detail", input.addressDetail)
		entry.Set("delivery_method", input.deliveryMethod)
		entry.Set("total_amount", total.Decimal())
		entry.Set("status", "pending")
		entry.Set("note", input.note)
		entry.Set("latitude", input.latitude)
		entry.Set("longitude", input.longitude)
		entry.Set("updated_at", projectTimeValue(updatedAt))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("id", quoteID)

		if err := materialQuoteRelations(ctx, pool, entry, byName, []string{"supplier", "project"}); err != nil {
			slog.Error("quotes: store relations", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Quote request recorded successfully.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusCreated, payload)
	}
}

// materialQuoteInput is the validated payload.
type materialQuoteInput struct {
	supplierID      int64
	projectID       *int64
	items           []quoteItem
	itemsJSON       []any
	deliveryAddress string
	addressDetail   any
	note            any
	latitude        any
	longitude       any
	deliveryMethod  string
}

// validateMaterialQuote mirrors the controller's nested rules, in the order
// Laravel expands wildcard rules (per FIELD across items).
func validateMaterialQuote(ctx context.Context, pool *pgxpool.Pool, fields map[string]any, failures *errorBag) materialQuoteInput {
	var input materialQuoteInput
	input.deliveryMethod = "Supplier Fleet"

	// supplier_id: required|exists:suppliers,id
	if raw, present := fields["supplier_id"]; !present || raw == nil {
		failures.add("supplier_id", "The supplier id field is required.")
	} else if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
		parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
		if err == nil && existsID(ctx, pool, "suppliers", parsed) {
			input.supplierID = parsed
		} else {
			failures.add("supplier_id", "The selected supplier id is invalid.")
		}
	} else {
		failures.add("supplier_id", "The selected supplier id is invalid.")
	}

	// project_id: nullable|exists:projects,id
	if raw, present := fields["project_id"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if err == nil && existsID(ctx, pool, "projects", parsed) {
				input.projectID = &parsed
			} else {
				failures.add("project_id", "The selected project id is invalid.")
			}
		} else {
			failures.add("project_id", "The selected project id is invalid.")
		}
	}

	// items: required|array
	rawItems, present := fields["items"]
	if !present || rawItems == nil {
		failures.add("items", "The items field is required.")
		rawItems = nil
	}
	itemMaps := make([]map[string]any, 0)
	if rawItems != nil {
		list, isList := rawItems.([]any)
		if !isList {
			failures.add("items", "The items field must be an array.")
			list = nil
		}
		for index, item := range list {
			if object, ok := item.(map[string]any); ok {
				itemMaps = append(itemMaps, object)
			} else {
				failures.add("items."+strconv.Itoa(index), "The items."+strconv.Itoa(index)+" field must be an array.")
				itemMaps = append(itemMaps, map[string]any{})
			}
		}
	}

	input.itemsJSON = make([]any, 0, len(itemMaps))

	// Nested rules, grouped per FIELD exactly as Laravel expands them.
	type nestedRule struct {
		field string
		check func(prefix string, index int, value any) bool
	}
	nested := []nestedRule{
		{"material_id", func(prefix string, index int, value any) bool {
			if value == nil {
				failures.add(prefix, "The "+prefix+" field is required.")
				return false
			}
			text, ok := numericTextOf(value)
			if !ok || !isIntegerText(text) {
				failures.add(prefix, "The selected "+prefix+" is invalid.")
				return false
			}
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if err != nil || !existsID(ctx, pool, "materials", parsed) {
				failures.add(prefix, "The selected "+prefix+" is invalid.")
				return false
			}
			return true
		}},
		{"name", func(prefix string, index int, value any) bool {
			if value == nil {
				failures.add(prefix, "The "+prefix+" field is required.")
				return false
			}
			if _, ok := value.(string); !ok {
				failures.add(prefix, "The "+prefix+" field must be a string.")
				return false
			}
			return true
		}},
		{"price_at_quote", func(prefix string, index int, value any) bool {
			if value == nil {
				failures.add(prefix, "The "+prefix+" field is required.")
				return false
			}
			if text, ok := numericTextOf(value); !ok || !isNumericText(text) {
				failures.add(prefix, "The "+prefix+" field must be a number.")
				return false
			}
			return true
		}},
		{"qty", func(prefix string, index int, value any) bool {
			if value == nil {
				failures.add(prefix, "The "+prefix+" field is required.")
				return false
			}
			text, ok := numericTextOf(value)
			if !ok || !isNumericText(text) {
				failures.add(prefix, "The "+prefix+" field must be a number.")
				return false
			}
			parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
			if err != nil || parsed < 1 {
				failures.add(prefix, "The "+prefix+" field must be at least 1.")
				return false
			}
			return true
		}},
		{"unit", func(prefix string, index int, value any) bool {
			if value == nil {
				failures.add(prefix, "The "+prefix+" field is required.")
				return false
			}
			if _, ok := value.(string); !ok {
				failures.add(prefix, "The "+prefix+" field must be a string.")
				return false
			}
			return true
		}},
		{"requirement_id", func(prefix string, index int, value any) bool {
			if value == nil {
				return false // nullable
			}
			text, ok := numericTextOf(value)
			if !ok || !isIntegerText(text) {
				failures.add(prefix, "The selected "+prefix+" is invalid.")
				return false
			}
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if err != nil || !existsID(ctx, pool, "project_requirements", parsed) {
				failures.add(prefix, "The selected "+prefix+" is invalid.")
				return false
			}
			return true
		}},
	}

	for _, rule := range nested {
		for index, item := range itemMaps {
			prefix := "items." + strconv.Itoa(index) + "." + rule.field
			rule.check(prefix, index, item[rule.field])
		}
	}

	// Assemble the validated items (only when every line passed its rules).
	if len(itemMaps) > 0 && failures.empty() {
		for _, item := range itemMaps {
			priceText, _ := numericTextOf(item["price_at_quote"])
			qtyText, _ := numericTextOf(item["qty"])
			qtyFloat, _ := strconv.ParseFloat(strings.TrimSpace(qtyText), 64)
			line := quoteItem{
				name:         item["name"].(string),
				priceAtQuote: strings.TrimSpace(priceText),
				qty:          int64(qtyFloat),
				unit:         item["unit"].(string),
			}
			if id, ok := numericTextOf(item["material_id"]); ok {
				line.materialID, _ = strconv.ParseInt(strings.TrimSpace(id), 10, 64)
			}
			if raw, present := item["requirement_id"]; present && raw != nil {
				if id, ok := numericTextOf(raw); ok {
					parsed, _ := strconv.ParseInt(strings.TrimSpace(id), 10, 64)
					line.requirementID = &parsed
				}
			}
			input.items = append(input.items, line)
		}

		// The JSON the database stores: the validated line shape.
		for _, item := range input.items {
			line := jsonphp.NewObject()
			line.Set("material_id", item.materialID)
			line.Set("name", item.name)
			line.Set("price_at_quote", item.priceAtQuote)
			line.Set("qty", item.qty)
			line.Set("unit", item.unit)
			if item.requirementID != nil {
				line.Set("requirement_id", *item.requirementID)
			}
			input.itemsJSON = append(input.itemsJSON, line)
		}
	}

	// delivery_address: required|string
	if raw, present := fields["delivery_address"]; !present || raw == nil {
		failures.add("delivery_address", "The delivery address field is required.")
	} else if text, ok := raw.(string); !ok {
		failures.add("delivery_address", "The delivery address field must be a string.")
	} else {
		input.deliveryAddress = text
	}

	// address_detail / note: nullable|string
	for _, pair := range []struct {
		key  string
		dest *any
	}{
		{"address_detail", &input.addressDetail},
		{"note", &input.note},
	} {
		if raw, present := fields[pair.key]; present && raw != nil {
			if text, ok := raw.(string); ok {
				*pair.dest = text
			} else {
				failures.add(pair.key, "The "+strings.ReplaceAll(pair.key, "_", " ")+" field must be a string.")
			}
		}
	}

	// latitude / longitude / delivery_method.
	for _, pair := range []struct {
		key  string
		dest *any
	}{
		{"latitude", &input.latitude},
		{"longitude", &input.longitude},
	} {
		if raw, present := fields[pair.key]; present && raw != nil {
			if text, ok := numericTextOf(raw); ok && isNumericText(text) {
				parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
				if err == nil {
					*pair.dest = parsed
				}
			} else {
				failures.add(pair.key, "The "+pair.key+" field must be a number.")
			}
		}
	}

	if raw, present := fields["delivery_method"]; present && raw != nil {
		if text, ok := raw.(string); ok {
			input.deliveryMethod = text
		} else {
			failures.add("delivery_method", "The delivery method field must be a string.")
		}
	}

	return input
}

// numericFloatValue renders a PostgreSQL numeric column as a JSON float.
func numericFloatValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err != nil {
			return nil
		}
		return parsed
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int64:
		return float64(typed)
	case int32:
		return float64(typed)
	}

	// pgx hands numeric columns back as pgtype.Numeric.
	if numeric, ok := value.(pgtype.Numeric); ok {
		converted, err := numeric.Float64Value()
		if err == nil && converted.Valid {
			return converted.Float64
		}
	}
	return nil
}

// numericArg renders a float as decimal text for a numeric column.
func numericArg(value any) any {
	if number, ok := value.(float64); ok {
		return strconv.FormatFloat(number, 'f', -1, 64)
	}
	return value
}

// existsID reports whether `table.id` exists.
func existsID(ctx context.Context, pool *pgxpool.Pool, table string, id int64) bool {
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM `+table+` WHERE id = $1)`, id).Scan(&exists); err != nil {
		return false
	}
	return exists
}
