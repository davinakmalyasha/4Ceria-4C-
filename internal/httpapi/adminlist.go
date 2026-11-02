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

// ADMIN READS — houses, users, projects, the verification queue and its
// history.
//
// Everything here is `Model::with(...)->latest()->paginate(n)` on the
// oracle side, which means:
//   - the paginator envelope is Laravel's raw 13-key body and the page URLs
//     carry ONLY ?page= (none of these controllers call withQueryString());
//   - `latest()` is ORDER BY created_at DESC, and with equal timestamps
//     MySQL serves ids ASCENDING (an index scan), so the port orders
//     `created_at DESC, id ASC` — without the tie-break PostgreSQL's heap
//     order wins and the pages disagree;
//   - `audited_at` in the history is Carbon's `toIso8601String()`, i.e.
//     second precision with a literal `+00:00` offset.

// adminExtraProfileColumns registers the three tables the verification queue
// serializes that the project relations never touch.
func init() {
	profileModelColumns["project_managers"] = []string{
		"id", "user_id", "nama", "no_telp", "rate_harga", "spesialisasi", "deskripsi",
		"lokasi", "pengalaman_tahun", "file_portofolio", "file_sertifikat", "npwp", "siup",
		"pendidikan", "alasan_hire", "verification_status", "rejection_reason", "foto",
		"identity_number", "npwp_number", "siup_number", "entity_type", "company_name",
		"company_license", "reliability_score", "created_at", "updated_at",
	}
	profileModelColumns["suppliers"] = []string{
		"id", "user_id", "store_name", "address", "no_telp", "category", "bio",
		"verification_status", "rejection_reason", "foto", "created_at", "updated_at",
		"detail_location", "latitude", "longitude",
	}
	profileModelColumns["courier_profiles"] = []string{
		"id", "user_id", "vehicle_type", "license_plate", "is_active",
		"created_at", "updated_at", "verification_status", "rejection_reason",
	}
}

// adminProfileIDs runs the pending-with-documents query for one table.
//
// `docsFields` is the controller's `$hasDocs` list; `roleType`, when set,
// joins users for the kontraktor trade branches.
func adminProfileIDs(ctx context.Context, pool *pgxpool.Pool, table string, docsFields []string, roleType string) ([]int64, error) {
	query := `SELECT t.id FROM ` + table + ` t`
	args := []any{}
	where := []string{"t.verification_status = 'pending'"}

	if roleType != "" {
		query += ` JOIN users u ON u.id = t.user_id`
		args = append(args, roleType)
		where = append(where, "u.role_type = $1")
	}

	if len(docsFields) > 0 {
		clauses := make([]string, 0, len(docsFields))
		for _, field := range docsFields {
			clauses = append(clauses, "t."+field+" IS NOT NULL")
		}
		where = append(where, "("+strings.Join(clauses, " OR ")+")")
	}

	query += ` WHERE ` + strings.Join(where, " AND ") + ` ORDER BY t.id`

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// adminProfileList renders one verification-queue collection.
func adminProfileList(ctx context.Context, pool *pgxpool.Pool, table string, docsFields []string, roleType string) ([]any, error) {
	ids, err := adminProfileIDs(ctx, pool, table, docsFields, roleType)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(ids))
	for _, id := range ids {
		block, err := profileModelObject(ctx, pool, table, id, true)
		if err != nil {
			if isNoRows(err) {
				continue
			}
			return nil, err
		}
		out = append(out, block)
	}
	return out, nil
}

// AdminProfessionalsIndexHandler serves `GET /api/admin/professionals`.
func AdminProfessionalsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		profileDocs := []string{"foto", "file_portofolio", "file_sertifikat", "npwp", "siup", "identity_number"}
		supplierDocs := []string{"foto", "address", "bio", "no_telp"}

		type collection struct {
			key        string
			table      string
			docs       []string
			roleType   string
		}
		collections := []collection{
			{"arsiteks", "arsiteks", profileDocs, ""},
			{"kontraktors", "kontraktors", profileDocs, "kontraktor"},
			{"civil_contractors", "kontraktors", profileDocs, "civil"},
			{"mechanical_contractors", "kontraktors", profileDocs, "mechanical"},
			{"electrical_contractors", "kontraktors", profileDocs, "electrical"},
			{"plumbing_contractors", "kontraktors", profileDocs, "plumbing"},
			{"roofing_contractors", "kontraktors", profileDocs, "roofing"},
			{"finishing_contractors", "kontraktors", profileDocs, "finishing"},
			{"project_managers", "project_managers", profileDocs, ""},
			{"structural_engineers", "structural_engineers", profileDocs, ""},
			{"mep_engineers", "mep_engineers", profileDocs, ""},
			{"notaries", "notaris_profiles", profileDocs, ""},
			{"interiors", "interior_profiles", profileDocs, ""},
			{"suppliers", "suppliers", supplierDocs, ""},
			{"logistics", "courier_profiles", nil, ""},
		}

		payload := jsonphp.NewObject()
		for _, item := range collections {
			list, err := adminProfileList(ctx, pool, item.table, item.docs, item.roleType)
			if err != nil {
				slog.Error("admin professionals: list", "table", item.table, "error", err)
				serverError(w)
				return
			}
			payload.Set(item.key, list)
		}

		writeJSON(w, http.StatusOK, payload)
	}
}

// adminHistoryBranch describes one leg of the verification-history union.
type adminHistoryBranch struct {
	table     string
	typeKey   string
	roleLabel string
	nameExpr  string
}

// AdminProfessionalsHistoryHandler serves
// `GET /api/admin/professionals/history`.
func AdminProfessionalsHistoryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		const perPage = 20
		currentPage := pageParam(r)

		branches := []adminHistoryBranch{
			{"arsiteks", "arsitek", "Architect", "COALESCE(t.nama, u.name, 'N/A')"},
			{"project_managers", "project_manager", "Project Manager", "COALESCE(t.nama, u.name, 'N/A')"},
			{"structural_engineers", "structural", "Structural Engineer", "COALESCE(t.nama, u.name, 'N/A')"},
			{"mep_engineers", "mep", "MEP Engineer", "COALESCE(t.nama, u.name, 'N/A')"},
			{"notaris_profiles", "notaris", "Notary", "COALESCE(t.nama, u.name, 'N/A')"},
			{"interior_profiles", "interior", "Interior Designer", "COALESCE(t.nama, u.name, 'N/A')"},
			{"suppliers", "supplier", "Supplier", "COALESCE(t.store_name, u.name, 'N/A')"},
			{"courier_profiles", "logistics", "Logistics / Courier", "COALESCE(u.name, 'N/A')"},
			{"kontraktors", "kontraktor", "Contractor", "COALESCE(t.nama_perusahaan, t.nama, u.name, 'N/A')"},
		}

		legs := make([]string, 0, len(branches))
		for index, branch := range branches {
			typeExpr := `'` + branch.typeKey + `'`
			labelExpr := `'` + branch.roleLabel + `'`
			if branch.table == "kontraktors" {
				// The contractor leg derives BOTH the type and the label
				// from the user's trade role.
				typeExpr = `CASE WHEN u.role_type = 'civil' THEN 'civil'
					WHEN u.role_type = 'mechanical' THEN 'mechanical'
					WHEN u.role_type = 'electrical' THEN 'electrical'
					WHEN u.role_type = 'plumbing' THEN 'plumbing'
					WHEN u.role_type = 'roofing' THEN 'roofing'
					WHEN u.role_type = 'finishing' THEN 'finishing'
					ELSE 'kontraktor' END`
				labelExpr = `CASE WHEN u.role_type = 'civil' THEN 'Civil Contractor'
					WHEN u.role_type = 'mechanical' THEN 'Mechanical Contractor'
					WHEN u.role_type = 'electrical' THEN 'Electrical Contractor'
					WHEN u.role_type = 'plumbing' THEN 'Plumbing Contractor'
					WHEN u.role_type = 'roofing' THEN 'Roofing Contractor'
					WHEN u.role_type = 'finishing' THEN 'Finishing Contractor'
					ELSE 'Contractor' END`
			}

			legs = append(legs, `SELECT `+strconv.Itoa(index)+` AS branch, t.id AS id, `+
				typeExpr+` AS type, `+labelExpr+` AS role_label, `+
				branch.nameExpr+` AS name, u.email AS email, `+
				`t.verification_status::text AS status, t.rejection_reason AS rejection_reason, `+
				`t.updated_at AS audited_at FROM `+branch.table+` t JOIN users u ON u.id = t.user_id `+
				`WHERE t.verification_status IN ('verified', 'rejected')`)
		}

		union := strings.Join(legs, " UNION ALL ")

		var total int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM (`+union+`) AS union_table`).Scan(&total); err != nil {
			slog.Error("admin history: count", "error", err)
			serverError(w)
			return
		}

		offset := (currentPage - 1) * perPage
		rows, err := pool.Query(ctx, `SELECT id, type, role_label, name, email, status,
			rejection_reason, audited_at FROM (`+union+`) AS union_table
			ORDER BY audited_at DESC, branch ASC, id ASC LIMIT `+strconv.Itoa(perPage)+
			` OFFSET `+strconv.Itoa(offset))
		if err != nil {
			slog.Error("admin history: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		items := make([]any, 0, perPage)
		for rows.Next() {
			var (
				id                            int64
				typeKey, roleLabel, name      string
				email                         string
				status                        string
				rejectionReason               *string
				auditedAt                     *time.Time
			)
			if err := rows.Scan(&id, &typeKey, &roleLabel, &name, &email, &status,
				&rejectionReason, &auditedAt); err != nil {
				slog.Error("admin history: scan", "error", err)
				serverError(w)
				return
			}

			entry := jsonphp.NewObject()
			entry.Set("id", id)
			entry.Set("type", typeKey)
			entry.Set("role_label", roleLabel)
			entry.Set("name", name)
			entry.Set("email", email)
			entry.Set("status", status)
			entry.Set("rejection_reason", nullableString(rejectionReason))
			entry.Set("audited_at", iso8601Second(auditedAt))
			items = append(items, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("admin history: rows", "error", err)
			serverError(w)
			return
		}

		writeJSON(w, http.StatusOK, Paginate(total, perPage, currentPage, requestBaseURL(r), "", items))
	}
}

// projectTimePtrValue renders an optional timestamp pointer as Carbon.
func projectTimePtrValue(value *time.Time) any {
	if value == nil {
		return nil
	}
	return projectTimeValue(*value)
}

// iso8601Second mirrors Carbon::parse(...)->toIso8601String().
func iso8601Second(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.UTC().Format("2006-01-02T15:04:05+00:00")
}

// houseModelColumns is the `house` table order.
var houseModelColumns = []string{
	"id", "name", "price", "house_desc", "width", "length", "br", "ba", "floors",
	"coordinate", "street_name", "kelurahan", "kecamatan", "kab_kota", "province",
	"postal_code", "views", "id_user", "is_suspended", "created_at", "updated_at",
}

// AdminHousesHandler serves `GET /api/admin/houses`.
func AdminHousesHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		const perPage = 15
		currentPage := pageParam(r)

		search := r.URL.Query().Get("search")
		where := ""
		args := []any{}
		if search != "" {
			args = append(args, "%"+search+"%")
			where = ` WHERE (t.name LIKE $1 OR EXISTS (
				SELECT 1 FROM users u WHERE u.id = t.id_user AND u.name LIKE $1))`
		}

		var total int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM house t`+where, args...).Scan(&total); err != nil {
			slog.Error("admin houses: count", "error", err)
			serverError(w)
			return
		}

		offset := (currentPage - 1) * perPage
		rows, err := pool.Query(ctx, `SELECT `+strings.Join(houseModelColumns, ", ")+`
			FROM house t`+where+` ORDER BY t.created_at DESC, t.id ASC LIMIT `+strconv.Itoa(perPage)+
			` OFFSET `+strconv.Itoa(offset), args...)
		if err != nil {
			slog.Error("admin houses: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		items := make([]any, 0, perPage)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("admin houses: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}

			entry := jsonphp.NewObject()
			for _, column := range houseModelColumns {
				value := byName[column]
				switch column {
				case "price":
					entry.Set(column, projectDecimalValue(value))
				case "is_suspended":
					// No cast on the model: MySQL's tinyint serializes 0/1.
					suspended := int64(0)
					if flag, ok := value.(bool); ok && flag {
						suspended = 1
					}
					entry.Set(column, suspended)
				case "created_at", "updated_at":
					entry.Set(column, projectTimeValue(value))
				default:
					entry.Set(column, projectRawValue(value))
				}
			}

			owner := intPtrDeref(byName["id_user"])
			if owner != 0 {
				user, err := fullProfileUser(ctx, pool, owner, false)
				if err != nil {
					user = nil
				}
				entry.Set("user", user)
			} else {
				entry.Set("user", nil)
			}

			items = append(items, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("admin houses: rows", "error", err)
			serverError(w)
			return
		}

		writeJSON(w, http.StatusOK, Paginate(total, perPage, currentPage, requestBaseURL(r), "", items))
	}
}

// adminUserRoles renders the Spatie `roles` array for one user.
func adminUserRoles(ctx context.Context, pool *pgxpool.Pool, userID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `
		SELECT r.id, r.name, r.guard_name, r.created_at, r.updated_at, mhr.model_type, mhr.model_id, mhr.role_id
		  FROM roles r
		  JOIN model_has_roles mhr ON mhr.role_id = r.id
		 WHERE mhr.model_type = 'App\Models\User' AND mhr.model_id = $1
		 ORDER BY r.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var (
			id                     int64
			name, guardName        string
			createdAt, updatedAt   *time.Time
			modelType              string
			modelID, roleID        int64
		)
		if err := rows.Scan(&id, &name, &guardName, &createdAt, &updatedAt,
			&modelType, &modelID, &roleID); err != nil {
			return nil, err
		}
		role := jsonphp.NewObject()
		role.Set("id", id)
		role.Set("name", name)
		role.Set("guard_name", guardName)
		role.Set("created_at", projectTimePtrValue(createdAt))
		role.Set("updated_at", projectTimePtrValue(updatedAt))
		pivot := jsonphp.NewObject()
		pivot.Set("model_type", modelType)
		pivot.Set("model_id", modelID)
		pivot.Set("role_id", roleID)
		role.Set("pivot", pivot)
		out = append(out, role)
	}
	return out, rows.Err()
}

// AdminUsersHandler serves `GET /api/admin/users`.
func AdminUsersHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		const perPage = 20
		currentPage := pageParam(r)

		query := r.URL.Query()
		where := make([]string, 0, 2)
		args := []any{}
		if value := query.Get("role"); value != "" {
			args = append(args, value)
			where = append(where, "role_type = $"+strconv.Itoa(len(args)))
		}
		if value := query.Get("status"); value != "" {
			args = append(args, value == "suspended")
			where = append(where, "is_suspended = $"+strconv.Itoa(len(args)))
		}
		clause := ""
		if len(where) > 0 {
			clause = " WHERE " + strings.Join(where, " AND ")
		}

		var total int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM users`+clause, args...).Scan(&total); err != nil {
			slog.Error("admin users: count", "error", err)
			serverError(w)
			return
		}

		offset := (currentPage - 1) * perPage
		rows, err := pool.Query(ctx, `SELECT id FROM users`+clause+
			` ORDER BY created_at DESC, id ASC LIMIT `+strconv.Itoa(perPage)+
			` OFFSET `+strconv.Itoa(offset), args...)
		if err != nil {
			slog.Error("admin users: query", "error", err)
			serverError(w)
			return
		}
		ids := make([]int64, 0, perPage)
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				slog.Error("admin users: scan", "error", err)
				serverError(w)
				return
			}
			ids = append(ids, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			slog.Error("admin users: rows", "error", err)
			serverError(w)
			return
		}

		items := make([]any, 0, len(ids))
		for _, id := range ids {
			block, err := fullProfileUser(ctx, pool, id, false)
			if err != nil {
				slog.Error("admin users: user", "error", err)
				serverError(w)
				return
			}
			roles, err := adminUserRoles(ctx, pool, id)
			if err != nil {
				slog.Error("admin users: roles", "error", err)
				serverError(w)
				return
			}

			if object, ok := block.(*jsonphp.Object); ok {
				object.Set("roles", roles)
				items = append(items, object)
			} else {
				entry := jsonphp.NewObject()
				entry.Set("roles", roles)
				items = append(items, entry)
			}
		}

		writeJSON(w, http.StatusOK, Paginate(total, perPage, currentPage, requestBaseURL(r), "", items))
	}
}

// AdminProjectsHandler serves `GET /api/admin/projects`.
func AdminProjectsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		const perPage = 15
		currentPage := pageParam(r)

		search := r.URL.Query().Get("search")
		where := ""
		args := []any{}
		if search != "" {
			args = append(args, "%"+search+"%")
			where = ` WHERE (t.title LIKE $1 OR EXISTS (
				SELECT 1 FROM users u WHERE u.id = t.user_id AND u.name LIKE $1))`
		}

		var total int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM projects t`+where, args...).Scan(&total); err != nil {
			slog.Error("admin projects: count", "error", err)
			serverError(w)
			return
		}

		offset := (currentPage - 1) * perPage
		rows, err := pool.Query(ctx, `SELECT id FROM projects t`+where+
			` ORDER BY t.created_at DESC, t.id ASC LIMIT `+strconv.Itoa(perPage)+
			` OFFSET `+strconv.Itoa(offset), args...)
		if err != nil {
			slog.Error("admin projects: query", "error", err)
			serverError(w)
			return
		}
		ids := make([]int64, 0, perPage)
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				slog.Error("admin projects: scan", "error", err)
				serverError(w)
				return
			}
			ids = append(ids, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			slog.Error("admin projects: rows", "error", err)
			serverError(w)
			return
		}

		items := make([]any, 0, len(ids))
		for _, id := range ids {
			entry, err := rawProjectModel(ctx, pool, id)
			if err != nil {
				slog.Error("admin projects: project", "error", err)
				serverError(w)
				return
			}

			fields, values, err := projectRowByID(ctx, pool, id)
			if err != nil {
				slog.Error("admin projects: row", "error", err)
				serverError(w)
				return
			}
			project := projectColumnsByName(fields, values)

			ownerID, _ := project["user_id"].(int64)
			owner, err := fullProfileUser(ctx, pool, ownerID, false)
			if err != nil {
				owner = nil
			}
			entry.Set("user", owner)

			for _, relation := range []struct {
				key   string
				table string
				field string
			}{
				{"arsitek", "arsiteks", "selected_arsitek_id"},
				{"kontraktor", "kontraktors", "selected_kontraktor_id"},
			} {
				profileID := intPtrDeref(project[relation.field])
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
					slog.Error("admin projects: relation", "error", err)
					serverError(w)
					return
				}
				entry.Set(relation.key, block)
			}

			items = append(items, entry)
		}

		writeJSON(w, http.StatusOK, Paginate(total, perPage, currentPage, requestBaseURL(r), "", items))
	}
}
