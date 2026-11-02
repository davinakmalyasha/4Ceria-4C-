package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ADMIN PROJECT EXPORT — a streamed CSV of the projects list.
//
// The oracle's `streamDownload` sends three headers: the default
// `Cache-Control: no-cache, private`, `Content-Type: text/csv; charset=UTF-8`
// and `Content-Disposition: attachment; filename=projects-export-Ymd-His.csv`
// (the stamp is UTC). The body starts with a UTF-8 BOM so Excel reads
// Indonesian names correctly, then a header row and one row per project,
// ordered `created_at DESC, id ASC` (MySQL's tie-break again) and capped at
// 5000 rows.
//
// `csvCell()` prefixes a single quote when a value starts with `=`, `+`, `-`,
// `@`, tab or CR: a project title or owner name is attacker-controlled and a
// spreadsheet would otherwise EXECUTE it in the administrator's session.
//
// fputcsv quoting is reproduced byte-for-byte: a field is wrapped in double
// quotes and its quotes doubled when it contains the delimiter, an enclosure,
// a backslash, a newline, a carriage return, a tab OR A SPACE.

// AdminProjectsExportHandler serves `GET /api/admin/projects/export`.
func AdminProjectsExportHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		search := r.URL.Query().Get("search")
		where := ""
		args := []any{}
		if search != "" {
			args = append(args, "%"+search+"%")
			where = ` WHERE (p.title LIKE $1 OR EXISTS (
				SELECT 1 FROM users u2 WHERE u2.id = p.user_id AND u2.name LIKE $1))`
		}

		rows, err := pool.Query(ctx, `
			SELECT p.id, p.title, p.status::text, p.budget::text, p.created_at, u.name
			  FROM projects p
			  LEFT JOIN users u ON u.id = p.user_id`+where+`
			 ORDER BY p.created_at DESC, p.id ASC
			 LIMIT 5000`, args...)
		if err != nil {
			slog.Error("admin export: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		var builder strings.Builder
		builder.WriteString("\xEF\xBB\xBF")

		header := []string{"ID", "Title", "Owner", "Status", "Budget (IDR)", "Created At"}
		builder.WriteString(phpCSVLine(header))

		for rows.Next() {
			var (
				id      int64
				title   string
				status  string
				budget  *string
				created *time.Time
				owner   *string
			)
			if err := rows.Scan(&id, &title, &status, &budget, &created, &owner); err != nil {
				slog.Error("admin export: scan", "error", err)
				serverError(w)
				return
			}

			ownerName := ""
			if owner != nil {
				ownerName = *owner
			}
			budgetText := ""
			if budget != nil {
				budgetText = *budget
			}
			createdText := ""
			if created != nil {
				createdText = created.UTC().Format("2006-01-02 15:04:05")
			}

			builder.WriteString(phpCSVLine([]string{
				strconv.FormatInt(id, 10),
				csvCell(title),
				csvCell(ownerName),
				status,
				budgetText,
				createdText,
			}))
		}
		if err := rows.Err(); err != nil {
			slog.Error("admin export: rows", "error", err)
			serverError(w)
			return
		}

		w.Header().Set("Cache-Control", "no-cache, private")
		w.Header().Set("Content-Type", "text/csv; charset=UTF-8")
		w.Header().Set("Content-Disposition",
			`attachment; filename=projects-export-`+time.Now().UTC().Format("20060102-150405")+`.csv`)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(builder.String()))
	}
}

// csvCell mirrors AdminDashboardController::csvCell — the spreadsheet
// formula-injection guard.
func csvCell(value string) string {
	if value == "" {
		return ""
	}
	switch value[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + value
	}
	return value
}

// phpCSVLine renders one fputcsv line (comma delimiter, double-quote
// enclosure, LF terminator).
func phpCSVLine(fields []string) string {
	parts := make([]string, 0, len(fields))
	for _, field := range fields {
		parts = append(parts, phpCSVField(field))
	}
	return strings.Join(parts, ",") + "\n"
}

// phpCSVField applies fputcsv's quoting rule.
func phpCSVField(field string) string {
	if strings.ContainsAny(field, ",\"\\\n\r\t ") {
		return `"` + strings.ReplaceAll(field, `"`, `""`) + `"`
	}
	return field
}

// AdminForceTerminateHandler serves
// `POST /api/admin/projects/{project}/force-terminate`.
//
// The project is loaded (with user/arsitek/kontraktor) BEFORE the update —
// the old order committed `status = 'cancelled'` and could still fail while
// eager-loading, which is the worst possible pair: a client sees an error and
// retries a project that is already cancelled.
func AdminForceTerminateHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawID := r.PathValue("project")
		projectID, err := strconv.ParseInt(rawID, 10, 64)
		if err != nil || rawID == "" {
			modelNotFound(w, `App\Models\Project`, rawID)
			return
		}
		ctx := r.Context()

		// Existence + relation ids, read before the mutation.
		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawID)
				return
			}
			slog.Error("admin terminate: load", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(fields, values)

		if _, err := pool.Exec(ctx, `UPDATE projects SET status = 'cancelled',
			updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("admin terminate: update", "error", err)
			serverError(w)
			return
		}

		freshFields, freshValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("admin terminate: reload", "error", err)
			serverError(w)
			return
		}
		entry, err := rawProjectModel(ctx, pool, projectID)
		if err != nil {
			slog.Error("admin terminate: render", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := project["user_id"].(int64)
		owner, err := fullProfileUser(ctx, pool, ownerID, false)
		if err != nil {
			owner = nil
		}
		entry.Set("user", owner)

		fresh := projectColumnsByName(freshFields, freshValues)
		for _, relation := range []struct {
			key   string
			table string
			field string
		}{
			{"arsitek", "arsiteks", "selected_arsitek_id"},
			{"kontraktor", "kontraktors", "selected_kontraktor_id"},
		} {
			profileID := intPtrDeref(fresh[relation.field])
			if profileID == 0 {
				entry.Set(relation.key, nil)
				continue
			}
			block, err := profileModelObject(ctx, pool, relation.table, profileID, false)
			if err != nil {
				if isNoRows(err) {
					entry.Set(relation.key, nil)
					continue
				}
				slog.Error("admin terminate: relation", "error", err)
				serverError(w)
				return
			}
			entry.Set(relation.key, block)
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Project forced terminated by Administrator.")
		payload.Set("project", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}
