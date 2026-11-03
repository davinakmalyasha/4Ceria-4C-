package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ROADMAP B8/B2/B7/B11 — saved searches, finance ledger, analytics, export.
// Minimal perfect implementations over existing tables; no new wire shapes
// beyond the documented ones.

type ledgerLine struct {
	id, typ, amount, title, date string
}

// SavedSearchesIndexHandler serves `GET /api/saved-searches`.
func SavedSearchesIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		rows, err := pool.Query(r.Context(), `SELECT id, name, params, alert_enabled, created_at, updated_at FROM saved_searches WHERE user_id = $1 ORDER BY id`, caller.UserID())
		if err != nil {
			slog.Error("saved-searches: list", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()
		items := make([]any, 0)
		for rows.Next() {
			var id int64
			var name string
			var params []byte
			var alert bool
			var created, updated any
			if err := rows.Scan(&id, &name, &params, &alert, &created, &updated); err != nil {
				continue
			}
			e := jsonphp.NewObject()
			e.Set("id", id)
			e.Set("name", name)
			e.Set("params", decodeJSONValue(string(params)))
			e.Set("alert_enabled", alert)
			e.Set("created_at", projectTimeValue(created))
			e.Set("updated_at", projectTimeValue(updated))
			items = append(items, e)
		}
		payload := jsonphp.NewObject()
		payload.Set("data", items)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreSavedSearchHandler serves `POST /api/saved-searches`.
func StoreSavedSearchHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		fields, _, err := requestFields(r)
		if err != nil {
			fields = map[string]any{}
		}
		name, _ := fields["name"].(string)
		if len([]rune(name)) > 255 {
			failures := &errorBag{}
			failures.add("name", "The name field must not be greater than 255 characters.")
			failures.write(w)
			return
		}
		paramsJSON := "{}"
		if raw, present := fields["params"]; present && raw != nil {
			if enc, merr := json.Marshal(raw); merr == nil {
				paramsJSON = string(enc)
			}
		}
		alert := false
		if raw, present := fields["alert_enabled"]; present && raw != nil {
			if b, ok := parseLaravelBoolean(raw); ok {
				alert = b
			}
		}
		var id int64
		if err := pool.QueryRow(r.Context(), `INSERT INTO saved_searches (user_id, name, params, alert_enabled, created_at, updated_at) VALUES ($1,$2,$3::jsonb,$4, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`, caller.UserID(), name, paramsJSON, alert).Scan(&id); err != nil {
			slog.Error("saved-searches: insert", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("message", "Search saved.")
		payload.Set("id", id)
		writeJSON(w, http.StatusOK, payload)
	}
}

// DestroySavedSearchHandler serves `DELETE /api/saved-searches/{id}`.
func DestroySavedSearchHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		raw := r.PathValue("id")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\SavedSearch`, raw)
			return
		}
		ct, err := pool.Exec(r.Context(), `DELETE FROM saved_searches WHERE id = $1 AND user_id = $2`, id, caller.UserID())
		if err != nil {
			slog.Error("saved-searches: delete", "error", err)
			serverError(w)
			return
		}
		if ct.RowsAffected() == 0 {
			modelNotFound(w, `App\Models\SavedSearch`, raw)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("message", "Saved search deleted.")
		writeJSON(w, http.StatusOK, payload)
	}
}

// FinanceLedgerHandler serves `GET /api/projects/{project}/finance-ledger`.
// The unified money view (B2): ceiling, summary + every ledger row.
func FinanceLedgerHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
		isPM := false
		if pmID != nil && *pmID != 0 {
			if own, ok := viewer.profiles["project_manager"]; ok && own == *pmID {
				isPM = true
			}
		}
		if viewer.id != ownerID && !isPM && !viewer.isAdmin {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
		budget, _ := byName["budget"].(string)
		summary, err := projectBudgetSummary(ctx, pool, projectID, budget)
		if err != nil {
			serverError(w)
			return
		}
		rows, err := pool.Query(ctx, `SELECT id, project_id, transaction_type, amount::text, title, category, type, status, description, reference_model, reference_id, reverses_model, reverses_id, transaction_date, actor_user_id, actor_role, voided_at, voided_duplicate_of_id, voided_original_amount::text, created_at, updated_at FROM project_budget_transactions WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			serverError(w)
			return
		}
		defer rows.Close()
		items := make([]any, 0)
		lfields := fieldNames(rows)
		for rows.Next() {
			vals, err := scanRow(rows, len(lfields))
			if err != nil {
				continue
			}
			items = append(items, renderLedgerRow(lfields, vals))
		}
		payload := jsonphp.NewObject()
		payload.Set("summary", summary)
		payload.Set("transactions", items)
		writeJSON(w, http.StatusOK, payload)
	}
}

// AnalyticsHandler serves `GET /api/me/analytics` (B7).
func AnalyticsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			serverError(w)
			return
		}
		ownerIDs := map[int64]bool{viewer.id: true}
		histories, err := clientHistories(ctx, pool, ownerIDs)
		if err != nil {
			serverError(w)
			return
		}
		h := histories[viewer.id]
		var posted, hired, active int64
		var spent float64
		if h != nil {
			posted, hired, active, spent = h.posted, h.hired, h.active, h.totalSpent
		}
		var bidCount int64
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM bids WHERE bidder_user_id = $1`, viewer.id).Scan(&bidCount)
		var savedCount int64
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM saved_searches WHERE user_id = $1`, viewer.id).Scan(&savedCount)
		out := jsonphp.NewObject()
		out.Set("projects_posted", posted)
		out.Set("projects_hired", hired)
		out.Set("active_projects", active)
		out.Set("total_spent", spent)
		out.Set("bids_placed", bidCount)
		out.Set("saved_searches", savedCount)
		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// ExportReportHandler serves `GET /api/projects/{project}/reports/export?format=csv|pdf` (B11).
func ExportReportHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
		if viewer.id != ownerID && !viewer.isAdmin {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
		format := strings.ToLower(r.URL.Query().Get("format"))
		if format == "" {
			format = "csv"
		}
		if format != "csv" && format != "pdf" {
			message(w, http.StatusUnprocessableEntity, "Format must be csv or pdf.")
			return
		}
		rows, err := pool.Query(ctx, `SELECT id, transaction_type::text, amount::text, title, transaction_date FROM project_budget_transactions WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			serverError(w)
			return
		}
		defer rows.Close()
		var lines []ledgerLine
		for rows.Next() {
			var l ledgerLine
			var dt any
			if err := rows.Scan(&l.id, &l.typ, &l.amount, &l.title, &dt); err != nil {
				continue
			}
			l.date = quoteCSV(formatTime(dt))
			lines = append(lines, l)
		}
		if format == "csv" {
			var b strings.Builder
			b.WriteString("id,type,amount,title,date\n")
			for _, l := range lines {
				b.WriteString(quoteCSV(l.id) + "," + quoteCSV(l.typ) + "," + quoteCSV(l.amount) + "," + quoteCSV(l.title) + "," + l.date + "\n")
			}
			w.Header().Set("Content-Type", "text/csv; charset=UTF-8")
			w.Header().Set("Content-Disposition", `attachment; filename="budget-statement-`+strconv.FormatInt(projectID, 10)+`.csv"`)
			w.Header().Set("Cache-Control", "no-cache, private")
			_, _ = w.Write([]byte("\xef\xbb\xbf" + b.String()))
			return
		}
		// Minimal PDF: single-page text ledger (valid PDF, no external dep).
		pdf := buildSimplePDF("Budget statement — project "+strconv.FormatInt(projectID, 10), lines)
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", `attachment; filename="budget-statement-`+strconv.FormatInt(projectID, 10)+`.pdf"`)
		w.Header().Set("Cache-Control", "no-cache, private")
		_, _ = w.Write(pdf)
	}
}

func quoteCSV(s string) string {
	if strings.ContainsAny(s, ",\"\n\r ") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

func formatTime(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func buildSimplePDF(title string, lines []ledgerLine) []byte {
	// Hand-rolled single-page PDF (Helvetica, no dep). Good enough for a
	// statement export; a design-grade report can replace this writer.
	var content strings.Builder
	content.WriteString("BT /F1 14 Tf 50 780 Td (" + pdfEscape(title) + ") Tj ET\n")
	y := 750
	content.WriteString("BT /F1 10 Tf ")
	for _, l := range lines {
		if y < 50 {
			break
		}
		text := l.id + " " + l.typ + " " + l.amount + " " + l.title
		if len(text) > 100 {
			text = text[:100]
		}
		content.WriteString("50 " + strconv.Itoa(y) + " Td (" + pdfEscape(text) + ") Tj ")
		y -= 14
		// Reset position trick: absolute Td each line needs ET/BT split; keep simple.
		content.WriteString("ET BT /F1 10 Tf ")
	}
	content.WriteString("ET")
	body := content.String()
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
		"<< /Length " + strconv.Itoa(len(body)) + " >>\nstream\n" + body + "\nendstream",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}
	var out strings.Builder
	out.WriteString("%PDF-1.4\n")
	offsets := []int{}
	for i, o := range objs {
		offsets = append(offsets, out.Len())
		out.WriteString(strconv.Itoa(i+1) + " 0 obj\n" + o + "\nendobj\n")
	}
	xref := out.Len()
	out.WriteString("xref\n0 " + strconv.Itoa(len(objs)+1) + "\n0000000000 65535 f \n")
	for _, off := range offsets {
		out.WriteString(pad10(off) + " 00000 n \n")
	}
	out.WriteString("trailer\n<< /Size " + strconv.Itoa(len(objs)+1) + " /Root 1 0 R >>\nstartxref\n" + strconv.Itoa(xref) + "\n%%EOF")
	return []byte(out.String())
}

func pdfEscape(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "(", "\\(")
	s = strings.ReplaceAll(s, ")", "\\)")
	var b strings.Builder
	for _, r := range s {
		if r < 32 || r > 126 {
			b.WriteString("?")
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func pad10(n int) string {
	s := strconv.Itoa(n)
	for len(s) < 10 {
		s = "0" + s
	}
	return s
}
