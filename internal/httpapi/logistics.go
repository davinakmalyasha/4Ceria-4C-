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

// LOGISTICS / COURIER JOBS — five endpoints over `delivery_jobs`.
//
// Every one gates on `users.role_type === 'logistics'` and answers
// {"message":"Unauthorized"} (no trailing period) otherwise.
//
// The oracle reads these through the QUERY BUILDER (`DB::table`), not the
// model layer, so the rows are RAW:
//   - timestamps are `Y-m-d H:i:s` strings, not Carbon ISO-8601;
//   - decimal columns are strings ("50000.00"), still strings after `sum()`
//     until the controller's `(float)` cast;
//   - JSON columns are their TEXT ("[\"a.jpg\"]"), never decoded arrays;
//   - `delivery_jobs.logistics_id` stores the COURIER'S USER id, not a
//     `courier_profiles` id (acceptJob writes `$user->id`).

// deliveryJobSelectList renders the raw job columns for a DB::table read.
func deliveryJobSelectList(prefix string) string {
	parts := make([]string, 0, len(deliveryJobColumns))
	for _, column := range deliveryJobColumns {
		switch column {
		case "agreed_fee":
			parts = append(parts, prefix+".agreed_fee::text AS agreed_fee")
		case "created_at", "updated_at":
			parts = append(parts, "to_char("+prefix+"."+column+" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "+column)
		case "pickup_photos", "delivery_photos":
			parts = append(parts, prefix+"."+column+"::text AS "+column)
		default:
			parts = append(parts, prefix+"."+column)
		}
	}
	return strings.Join(parts, ", ")
}

// dbTableTime renders a query-builder timestamp as the raw MySQL text.
func dbTableTime(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case time.Time:
		return typed.UTC().Format("2006-01-02 15:04:05")
	case string:
		return typed
	case []byte:
		return string(typed)
	}
	return nil
}

// dbTableObject renders one raw row in SELECT order. `created_at` and
// `updated_at` are the only columns the query builder treats specially; every
// other value is already text/int because the SELECT list casts it.
func dbTableObject(fields []string, values []any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for i, column := range fields {
		switch column {
		case "created_at", "updated_at":
			entry.Set(column, dbTableTime(values[i]))
		default:
			entry.Set(column, projectRawValue(values[i]))
		}
	}
	return entry
}

// logisticsGate resolves the caller and enforces `role_type === 'logistics'`.
func logisticsGate(ctx context.Context, pool *pgxpool.Pool, w http.ResponseWriter, r *http.Request) (*projectViewer, bool) {
	caller, ok := CallerFrom(ctx)
	if !ok {
		message(w, http.StatusUnauthorized, "Unauthenticated.")
		return nil, false
	}
	viewer, err := loadViewer(ctx, pool, caller)
	if err != nil {
		slog.Error("logistics: viewer", "error", err)
		serverError(w)
		return nil, false
	}
	if viewer.role != "logistics" {
		message(w, http.StatusForbidden, "Unauthorized")
		return nil, false
	}
	return viewer, true
}

// LogisticsAvailableJobsHandler serves `GET /api/logistics/available-jobs`.
//
// Pending jobs joined to their quote, newest first, capped at 50. The row is
// `delivery_jobs.*` followed by four quote columns.
func LogisticsAvailableJobsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		if _, ok := logisticsGate(ctx, pool, w, r); !ok {
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT `+deliveryJobSelectList("dj")+`,
			       mq.delivery_address,
			       mq.total_amount::text AS total_amount,
			       mq.total_weight::text AS total_weight,
			       mq.note
			  FROM delivery_jobs dj
			  JOIN material_quotes mq ON mq.id = dj.quote_id
			 WHERE dj.status = 'pending'
			 ORDER BY dj.created_at DESC, dj.id ASC
			 LIMIT 50`)
		if err != nil {
			slog.Error("logistics available: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("logistics available: scan", "error", err)
				serverError(w)
				return
			}
			out = append(out, dbTableObject(fields, values))
		}
		if err := rows.Err(); err != nil {
			slog.Error("logistics available: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// LogisticsAcceptJobHandler serves `POST /api/logistics/jobs/{id}/accept`.
//
// The status check is part of the atomic UPDATE, so only the FIRST courier's
// claim can succeed; everyone else gets the 404. The quote is moved forward
// only from an earlier stage, never dragged backwards.
func LogisticsAcceptJobHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		viewer, ok := logisticsGate(ctx, pool, w, r)
		if !ok {
			return
		}

		rawID := r.PathValue("id")
		jobID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			message(w, http.StatusNotFound, "Job no longer available or not found.")
			return
		}

		tag, err := pool.Exec(ctx, `UPDATE delivery_jobs
			SET status = 'accepted', logistics_id = $2,
			    updated_at = date_trunc('second', now())
			WHERE id = $1 AND status = 'pending'`, jobID, viewer.id)
		if err != nil {
			slog.Error("logistics accept: claim", "error", err)
			serverError(w)
			return
		}
		if tag.RowsAffected() == 0 {
			message(w, http.StatusNotFound, "Job no longer available or not found.")
			return
		}

		var quoteID *int64
		if err := pool.QueryRow(ctx, `SELECT quote_id FROM delivery_jobs WHERE id = $1`, jobID).
			Scan(&quoteID); err == nil && quoteID != nil {
			if _, err := pool.Exec(ctx, `UPDATE material_quotes SET status = 'awaiting_payment',
				updated_at = date_trunc('second', now())
				WHERE id = $1 AND status IN ('requested', 'pending', 'sent')`, *quoteID); err != nil {
				slog.Warn("logistics accept: quote", "error", err)
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Job accepted successfully.")
		writeJSON(w, http.StatusOK, payload)
	}
}

// LogisticsDashboardStatsHandler serves `GET /api/logistics/dashboard-stats`.
//
// The oracle caches the four counters for 300 s under
// `logistics_stats_{user}`; the port computes them fresh (the Go process
// cannot share Laravel's file cache, and the counters are cheap).
func LogisticsDashboardStatsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		viewer, ok := logisticsGate(ctx, pool, w, r)
		if !ok {
			return
		}

		var available, accepted, completed int64
		var earningsText *string
		if err := pool.QueryRow(ctx, `SELECT
				(SELECT count(*) FROM delivery_jobs WHERE status = 'pending'),
				(SELECT count(*) FROM delivery_jobs WHERE logistics_id = $1 AND status = 'accepted'),
				(SELECT count(*) FROM delivery_jobs WHERE logistics_id = $1 AND status IN ('delivered', 'completed')),
				(SELECT SUM(agreed_fee)::text FROM delivery_jobs WHERE logistics_id = $1 AND status IN ('delivered', 'completed'))`,
			viewer.id).Scan(&available, &accepted, &completed, &earningsText); err != nil {
			slog.Error("logistics stats: counters", "error", err)
			serverError(w)
			return
		}

		earnings := 0.0
		if earningsText != nil {
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(*earningsText), 64); err == nil {
				earnings = parsed
			}
		}

		stats := jsonphp.NewObject()
		stats.Set("available", available)
		stats.Set("accepted", accepted)
		stats.Set("completed", completed)
		stats.Set("totalEarnings", earnings)

		rows, err := pool.Query(ctx, `SELECT `+deliveryJobSelectList("dj")+`
			  FROM delivery_jobs dj
			 WHERE dj.logistics_id = $1 OR dj.status = 'pending'
			 ORDER BY dj.created_at DESC, dj.id ASC
			 LIMIT 5`, viewer.id)
		if err != nil {
			slog.Error("logistics stats: recent", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		recent := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("logistics stats: scan", "error", err)
				serverError(w)
				return
			}
			recent = append(recent, dbTableObject(fields, values))
		}
		if err := rows.Err(); err != nil {
			slog.Error("logistics stats: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("stats", stats)
		payload.Set("recentJobs", recent)
		writeJSON(w, http.StatusOK, payload)
	}
}

// LogisticsMyJobsHandler serves `GET /api/logistics/my-jobs`.
//
// The courier's own jobs with the quote's drop-off facts and the supplier's
// pick-up coordinates, newest update first, capped at 100.
func LogisticsMyJobsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		viewer, ok := logisticsGate(ctx, pool, w, r)
		if !ok {
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT `+deliveryJobSelectList("dj")+`,
			       mq.delivery_address,
			       mq.latitude::text AS dropoff_lat,
			       mq.longitude::text AS dropoff_lng,
			       mq.address_detail AS dropoff_detail,
			       s.latitude::text AS pickup_lat,
			       s.longitude::text AS pickup_lng,
			       s.detail_location AS pickup_detail
			  FROM delivery_jobs dj
			  JOIN material_quotes mq ON mq.id = dj.quote_id
			  JOIN suppliers s ON s.id = mq.supplier_id
			 WHERE dj.logistics_id = $1
			 ORDER BY dj.updated_at DESC, dj.id ASC
			 LIMIT 100`, viewer.id)
		if err != nil {
			slog.Error("logistics my-jobs: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("logistics my-jobs: scan", "error", err)
				serverError(w)
				return
			}
			out = append(out, dbTableObject(fields, values))
		}
		if err := rows.Err(); err != nil {
			slog.Error("logistics my-jobs: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// logisticsNextStatus is the forward-only transition table.
func logisticsNextStatus(current string) []string {
	switch current {
	case "pending":
		return []string{"accepted"}
	case "accepted":
		return []string{"picked_up", "delivered"}
	case "picked_up":
		return []string{"delivered"}
	}
	return nil
}

// LogisticsUpdateStatusHandler serves `POST /api/logistics/jobs/{id}/status`.
//
// Forward-only: pending → accepted → picked_up → delivered. Photos are
// optional (1–3, jpeg/png/jpg/webp, 5 MB each) and land on the PUBLIC disk
// under `deliveries/pickup` or `deliveries/dropoff`; the response echoes the
// stored paths (an empty array when none were sent).
func LogisticsUpdateStatusHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		viewer, ok := logisticsGate(ctx, pool, w, r)
		if !ok {
			return
		}

		rawID := r.PathValue("id")
		jobID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			message(w, http.StatusNotFound, "Job not found or not assigned to you.")
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
		photos := requestFilesNamed(r, "photos")

		failures := &errorBag{}
		newStatus := ""
		if raw, present := formFields["status"]; !present || raw == nil {
			failures.add("status", "The status field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("status", "The selected status is invalid.")
		} else if text != "accepted" && text != "picked_up" && text != "delivered" {
			failures.add("status", "The selected status is invalid.")
		} else {
			newStatus = text
		}
		if len(photos) > 0 {
			if len(photos) > 3 {
				failures.add("photos", "The photos field must not have more than 3 items.")
			}
			for index, upload := range photos {
				field := "photos." + strconv.Itoa(index)
				if !upload.isImage {
					failures.add(field, "The "+field+" field must be an image.")
				}
				switch upload.ext {
				case "jpeg", "png", "jpg", "webp":
				default:
					failures.add(field, "The "+field+" field must be a file of type: jpeg, png, jpg, webp.")
					continue
				}
				if upload.sizeBytes() > 5120*1024 {
					failures.add(field, "The "+field+" field must not be greater than 5120 kilobytes.")
				}
			}
		} else if raw, present := formFields["photos"]; present && raw != nil {
			// A JSON body can carry an array of non-files; `photos.*` then
			// fails the image rule for every entry.
			if list, isList := raw.([]any); isList {
				if len(list) < 1 {
					failures.add("photos", "The photos field must have at least 1 items.")
				}
				if len(list) > 3 {
					failures.add("photos", "The photos field must not have more than 3 items.")
				}
				for index := range list {
					field := "photos." + strconv.Itoa(index)
					failures.add(field, "The "+field+" field must be an image.")
					failures.add(field, "The "+field+" field must be a file of type: jpeg, png, jpg, webp.")
				}
			} else {
				failures.add("photos", "The photos field must be an array.")
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		var currentStatus string
		if err := pool.QueryRow(ctx, `SELECT status FROM delivery_jobs
			WHERE id = $1 AND logistics_id = $2`, jobID, viewer.id).Scan(&currentStatus); err != nil {
			message(w, http.StatusNotFound, "Job not found or not assigned to you.")
			return
		}

		allowed := false
		for _, candidate := range logisticsNextStatus(currentStatus) {
			if candidate == newStatus {
				allowed = true
				break
			}
		}
		if !allowed {
			message(w, http.StatusUnprocessableEntity,
				"Invalid status transition from '"+currentStatus+"' to '"+newStatus+"'.")
			return
		}

		var storedPaths []any
		photoColumn := ""
		if len(photos) > 0 {
			folder := "dropoff"
			photoColumn = "delivery_photos"
			if newStatus == "picked_up" {
				folder = "pickup"
				photoColumn = "pickup_photos"
			}
			for _, upload := range photos {
				stored, err := storeVaultFile("deliveries/"+folder, upload.filename, upload.data)
				if err != nil {
					slog.Error("logistics status: store", "error", err)
					serverError(w)
					return
				}
				storedPaths = append(storedPaths, stored)
			}
		}

		if len(storedPaths) > 0 {
			encoded, err := jsonphp.Marshal(storedPaths)
			if err != nil {
				serverError(w)
				return
			}
			if _, err := pool.Exec(ctx, `UPDATE delivery_jobs SET status = $2,
				`+photoColumn+` = $3::jsonb, updated_at = date_trunc('second', now())
				WHERE id = $1`, jobID, newStatus, string(encoded)); err != nil {
				slog.Error("logistics status: update", "error", err)
				serverError(w)
				return
			}
		} else {
			if _, err := pool.Exec(ctx, `UPDATE delivery_jobs SET status = $2,
				updated_at = date_trunc('second', now()) WHERE id = $1`, jobID, newStatus); err != nil {
				slog.Error("logistics status: update", "error", err)
				serverError(w)
				return
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Job status updated to "+newStatus)
		if storedPaths == nil {
			payload.Set("photos", []any{})
		} else {
			payload.Set("photos", storedPaths)
		}
		writeJSON(w, http.StatusOK, payload)
	}
}
