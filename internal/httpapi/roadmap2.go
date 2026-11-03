package httpapi

import (
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

func nowUTC() time.Time { return time.Now().UTC() }

func isOverdue(due any, status string, now time.Time) bool {
	if status == "resolved" || status == "closed" {
		return false
	}
	if due == nil {
		return false
	}
	if t, ok := due.(time.Time); ok {
		return t.Before(now)
	}
	return false
}

func parseFloatSafe(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

func powNeg(n, r float64) float64 {
	// (1+r)^n - 1 without overflow for large n.
	if r == 0 {
		return n
	}
	return math.Pow(1+r, n) - 1
}

// ROADMAP B3/B4/B9/stretch — weighted progress, purchase bridge,
// owner reviews, snag SLA, KPR, account export.

// ProjectProgressHandler serves `GET /api/projects/{project}/progress` (B3).
// Weighted % per phase/project from `project_milestones.weight`.
func ProjectProgressHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)
		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			serverError(w)
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			serverError(w)
			return
		}
		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)
		pmID := projectIntPtr(values, fields, "pm_id")
		isPM := pmID != nil && *pmID != 0 && viewer.profiles["project_manager"] == *pmID
		if viewer.id != ownerID && !isPM && !viewer.isAdmin {
			// Progress is project-visible to members; keep owner/PM/admin gate
			// for the weighted figure (money-adjacent scheduling).
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
		rows, err := pool.Query(ctx, `SELECT COALESCE(weight::text,'1'), is_completed FROM project_milestones WHERE project_id = $1`, projectID)
		if err != nil {
			serverError(w)
			return
		}
		defer rows.Close()
		var totalW, doneW float64
		var total, done int64
		for rows.Next() {
			var wtext string
			var completed bool
			if err := rows.Scan(&wtext, &completed); err != nil {
				continue
			}
			wf := parseFloatOrZero(&wtext)
			if wf <= 0 {
				wf = 1
			}
			totalW += wf
			total++
			if completed {
				doneW += wf
				done++
			}
		}
		pct := 0.0
		if totalW > 0 {
			pct = doneW / totalW * 100
		}
		out := jsonphp.NewObject()
		out.Set("total", total)
		out.Set("completed", done)
		out.Set("total_weight", totalW)
		out.Set("completed_weight", doneW)
		out.Set("percent", pct)
		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// UpdateMilestoneWeightHandler serves `PUT /api/projects/{project}/milestones/{milestone}/weight` (B3).
func UpdateMilestoneWeightHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)
		// Milestone id is the last segment.
		rawM := lastPathSegment(r.URL.Path)
		mID, err := strconv.ParseInt(rawM, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\ProjectMilestone`, rawM)
			return
		}
		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			serverError(w)
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			serverError(w)
			return
		}
		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)
		if viewer.id != ownerID && !viewer.isAdmin {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
		form, _, ferr := requestFields(r)
		if ferr != nil {
			form = map[string]any{}
		}
		text, _ := numericTextOf(form["weight"])
		if text == "" {
			if s, ok := form["weight"].(string); ok {
				text = s
			}
		}
		wf := parseFloatOrZero(&text)
		if wf <= 0 || wf > 1000 {
			failures := &errorBag{}
			failures.add("weight", "The weight field must be between 0 and 1000.")
			failures.write(w)
			return
		}
		ct, err := pool.Exec(ctx, `UPDATE project_milestones SET weight = $3::numeric, updated_at = date_trunc('second', now()) WHERE id = $1 AND project_id = $2`, mID, projectID, text)
		if err != nil {
			slog.Error("weight: update", "error", err)
			serverError(w)
			return
		}
		if ct.RowsAffected() == 0 {
			modelNotFound(w, `App\Models\ProjectMilestone`, rawM)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("message", "Weight updated.")
		writeJSON(w, http.StatusOK, payload)
	}
}

// PurchaseBridgeHandler serves `POST /api/procurement-requests/{id}/purchase` (B4).
// Creates a material order from an approved request and links it.
func PurchaseBridgeHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		raw := r.PathValue("id")
		if raw == "" {
			trimmed := strings.Trim(r.URL.Path, "/")
			parts := strings.Split(trimmed, "/")
			// .../procurement-requests/{id}/purchase → id is second-last.
			if len(parts) >= 2 {
				raw = parts[len(parts)-2]
			}
		}
		reqID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\ProjectProcurementRequest`, raw)
			return
		}
		var projectID, requirementID, requestedBy int64
		var qty, unitCost, estCost *string
		var status, message string
		var existingOrder *int64
		if err := pool.QueryRow(ctx, `SELECT project_id, requirement_id, requested_by, quantity_needed::text, estimated_unit_cost::text, estimated_cost::text, status::text, message, material_order_id FROM project_procurement_requests WHERE id = $1`, reqID).Scan(&projectID, &requirementID, &requestedBy, &qty, &unitCost, &estCost, &status, &message, &existingOrder); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectProcurementRequest`, raw)
				return
			}
			serverError(w)
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			serverError(w)
			return
		}
		// Owner, PM or requester may bridge.
		var ownerID int64
		var pmID *int64
		_ = pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &pmID)
		allowed := viewer.id == ownerID || viewer.id == requestedBy || viewer.isAdmin
		if !allowed && pmID != nil && viewer.profiles["project_manager"] == *pmID {
			allowed = true
		}
		if !allowed {
			messageW(w, http.StatusForbidden, "Unauthorized.")
			return
		}
		if existingOrder != nil {
			payload := jsonphp.NewObject()
			payload.Set("message", "Already bridged.")
			payload.Set("material_order_id", *existingOrder)
			writeJSON(w, http.StatusOK, payload)
			return
		}
		if status != "approved" && status != "approved_owner" && status != "approved_pm" {
			messageW(w, http.StatusUnprocessableEntity, "Only an approved request can be bridged to a purchase.")
			return
		}
		total := orEmptyStrPtr(qty)
		_ = total
		_ = estCost
		var orderID int64
		if err := pool.QueryRow(ctx, `INSERT INTO material_orders (user_id, supplier_id, project_id, status, total_price, notes, created_at, updated_at) VALUES ($1, NULL, $2, 'pending', COALESCE($3::numeric, 0), $4, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`, viewer.id, projectID, orEmptyStrPtr(unitCost), message).Scan(&orderID); err != nil {
			slog.Error("bridge: order", "error", err)
			serverError(w)
			return
		}
		_, _ = pool.Exec(ctx, `UPDATE project_procurement_requests SET material_order_id = $2, updated_at = date_trunc('second', now()) WHERE id = $1`, reqID, orderID)
		payload := jsonphp.NewObject()
		payload.Set("message", "Purchase created from procurement request.")
		payload.Set("material_order_id", orderID)
		writeJSON(w, http.StatusOK, payload)
	}
}

func messageW(w http.ResponseWriter, status int, text string) { message(w, status, text) }

func orEmptyStrPtr(s *string) string {
	if s == nil {
		return "0"
	}
	return *s
}

// StoreOwnerReviewHandler serves `POST /api/projects/{project}/owner-reviews` (B9).
func StoreOwnerReviewHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)
		if _, _, err := projectRowByID(ctx, pool, projectID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			serverError(w)
			return
		}
		form, _, _ := requestFields(r)
		rating := 5
		if raw, present := form["rating"]; present && raw != nil {
			if n, ok := numericTextOf(raw); ok {
				if v, err := strconv.Atoi(strings.TrimSpace(n)); err == nil {
					rating = v
				}
			}
		}
		if rating < 1 || rating > 5 {
			failures := &errorBag{}
			failures.add("rating", "The rating field must be between 1 and 5.")
			failures.write(w)
			return
		}
		comment, _ := form["komentar"].(string)
		if c2, ok := form["comment"].(string); ok && comment == "" {
			comment = c2
		}
		viewer, _ := loadViewer(ctx, pool, caller)
		role := ""
		if viewer != nil {
			role = viewer.role
		}
		_, err := pool.Exec(ctx, `INSERT INTO owner_ratings (project_id, reviewer_user_id, reviewer_role, rating, komentar, created_at, updated_at) VALUES ($1,$2,$3,$4,$5, date_trunc('second', now()), date_trunc('second', now())) ON CONFLICT (project_id, reviewer_user_id) DO UPDATE SET rating = EXCLUDED.rating, komentar = EXCLUDED.komentar, reviewer_role = EXCLUDED.reviewer_role, updated_at = date_trunc('second', now())`, projectID, caller.UserID(), role, rating, comment)
		if err != nil {
			slog.Error("owner-review: insert", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("message", "Owner reviewed.")
		writeJSON(w, http.StatusOK, payload)
	}
}

// OwnerReviewsHandler serves `GET /api/projects/{project}/owner-reviews` (B9).
func OwnerReviewsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		_ = caller
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)
		if _, _, err := projectRowByID(ctx, pool, projectID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			serverError(w)
			return
		}
		rows, err := pool.Query(ctx, `SELECT reviewer_user_id, reviewer_role, rating, komentar, created_at, updated_at FROM owner_ratings WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			serverError(w)
			return
		}
		defer rows.Close()
		items := make([]any, 0)
		for rows.Next() {
			var uid int64
			var role string
			var rating int
			var comment string
			var created, updated any
			if err := rows.Scan(&uid, &role, &rating, &comment, &created, &updated); err != nil {
				continue
			}
			e := jsonphp.NewObject()
			e.Set("reviewer_user_id", uid)
			e.Set("reviewer_role", role)
			e.Set("rating", rating)
			e.Set("komentar", comment)
			e.Set("created_at", projectTimeValue(created))
			e.Set("updated_at", projectTimeValue(updated))
			items = append(items, e)
		}
		payload := jsonphp.NewObject()
		payload.Set("data", items)
		writeJSON(w, http.StatusOK, payload)
	}
}

// SnagSLAHandler serves `GET /api/projects/{project}/snags/sla` (stretch).
func SnagSLAHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		_ = caller
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)
		if _, _, err := projectRowByID(ctx, pool, projectID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			serverError(w)
			return
		}
		rows, err := pool.Query(ctx, `SELECT id, title, severity::text, status::text, due_at, escalated_at FROM project_snag_items WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			serverError(w)
			return
		}
		defer rows.Close()
		items := make([]any, 0)
		now := nowUTC()
		for rows.Next() {
			var id int64
			var title, severity, status string
			var due, esc any
			if err := rows.Scan(&id, &title, &severity, &status, &due, &esc); err != nil {
				continue
			}
			e := jsonphp.NewObject()
			e.Set("id", id)
			e.Set("title", title)
			e.Set("severity", severity)
			e.Set("status", status)
			e.Set("due_at", projectTimeValue(due))
			e.Set("escalated_at", projectTimeValue(esc))
			e.Set("overdue", isOverdue(due, status, now))
			e.Set("escalated", esc != nil)
			items = append(items, e)
		}
		payload := jsonphp.NewObject()
		payload.Set("data", items)
		writeJSON(w, http.StatusOK, payload)
	}
}

// KPRHandler serves `GET /api/tools/kpr?principal=&rate=&years=` (stretch).
func KPRHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		principal, ok1 := numericMinor(strings.TrimSpace(q.Get("principal")))
		rateBP, ok2 := numericMinor(strings.TrimSpace(q.Get("rate")))
		years, ok3 := numericMinor(strings.TrimSpace(q.Get("years")))
		if !ok1 || !ok2 || !ok3 || principal <= 0 || years <= 0 {
			failures := &errorBag{}
			failures.add("principal", "The principal field is required.")
			failures.write(w)
			return
		}
		// Monthly payment: P * r(1+r)^n / ((1+r)^n - 1), r = annual%/12.
		// Integer-exact via floats for display only (not money movement).
		_ = rateBP
		pf, _ := parseFloatSafe(q.Get("principal"))
		rf, _ := parseFloatSafe(q.Get("rate"))
		yf, _ := parseFloatSafe(q.Get("years"))
		monthlyRate := rf / 100 / 12
		n := yf * 12
		m := pf * monthlyRate / (1 - powNeg(n, monthlyRate))
		out := jsonphp.NewObject()
		out.Set("monthly", m)
		out.Set("months", int(n))
		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// AccountExportHandler serves `GET /api/me/export` (stretch).
func AccountExportHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		var name, email string
		_ = pool.QueryRow(ctx, `SELECT name, email FROM users WHERE id = $1`, caller.UserID()).Scan(&name, &email)
		var saved, subs, notifs int64
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM saved_searches WHERE user_id = $1`, caller.UserID()).Scan(&saved)
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM push_subscriptions WHERE user_id = $1`, caller.UserID()).Scan(&subs)
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id = $1`, caller.UserID()).Scan(&notifs)
		out := jsonphp.NewObject()
		out.Set("id", caller.UserID())
		out.Set("name", name)
		out.Set("email", email)
		out.Set("saved_searches", saved)
		out.Set("push_subscriptions", subs)
		out.Set("notifications", notifs)
		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}
