package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// directoryColumns is the explicit list-path column set per profile table
// (no `SELECT *`). Same rows as `SELECT *`, schema-change safe.
func directoryColumns(table string) string {
	switch table {
	case "arsiteks":
		return `id,user_id,nama,no_telp,rate_harga,spesialisasi,deskripsi,lokasi,pengalaman_tahun,file_portofolio,file_sertifikat,npwp,siup,pendidikan,alasan_hire,verification_status,rejection_reason,foto,identity_number,npwp_number,siup_number,entity_type,company_name,company_license,reliability_score,created_at,updated_at`
	case "kontraktors":
		return `id,user_id,nama,no_telepon,alamat,jenis,nama_perusahaan,npwp,siup,pengalaman,spesialisasi,subspecialties,rate_harga,pendidikan,alasan_hire,verification_status,rejection_reason,foto,file_portofolio,file_sertifikat,identity_number,npwp_number,siup_number,entity_type,company_name,company_license,reliability_score,created_at,updated_at`
	case "notaris_profiles":
		return `id,user_id,nama,no_telp,foto,file_portofolio,identity_number,npwp_number,siup_number,entity_type,company_name,company_license,reliability_score,nomor_sk,wilayah_kerja,spesialisasi,deskripsi,lokasi,pengalaman_tahun,rate_harga,file_sertifikat,npwp,siup,verification_status,rejection_reason,created_at,updated_at`
	case "interior_profiles":
		return `id,user_id,nama,no_telp,foto,identity_number,npwp_number,siup_number,entity_type,company_name,company_license,reliability_score,file_portofolio,file_sertifikat,npwp,siup,spesialisasi,deskripsi,lokasi,pengalaman_tahun,rate_harga,verification_status,rejection_reason,created_at,updated_at`
	case "structural_engineers":
		return `id,user_id,nama,no_telp,rate_harga,reliability_score,spesialisasi,deskripsi,lokasi,pengalaman_tahun,file_portofolio,file_sertifikat,npwp,siup,pendidikan,alasan_hire,verification_status,rejection_reason,foto,identity_number,npwp_number,siup_number,entity_type,company_name,company_license,created_at,updated_at`
	case "mep_engineers":
		return `id,user_id,nama,no_telp,rate_harga,reliability_score,spesialisasi,deskripsi,lokasi,pengalaman_tahun,file_portofolio,file_sertifikat,npwp,siup,pendidikan,alasan_hire,verification_status,rejection_reason,foto,identity_number,npwp_number,siup_number,entity_type,company_name,company_license,created_at,updated_at`
	case "project_managers":
		return `id,user_id,nama,no_telp,rate_harga,spesialisasi,deskripsi,lokasi,pengalaman_tahun,file_portofolio,file_sertifikat,npwp,siup,pendidikan,alasan_hire,verification_status,rejection_reason,foto,identity_number,npwp_number,siup_number,entity_type,company_name,company_license,reliability_score,created_at,updated_at`
	default:
		return `*`
	}
}

// directorySearchColumns is the per-table text search list.
//
// The search ORs the same four concepts (name/company/specialty/
// location), but the columns differ per table: kontraktors has no
// `lokasi` (its address column is `alamat`), and referencing a missing
// column turns every search into a 500. Keep this beside
// directoryColumns: same tables, text columns only.
func directorySearchColumns(table string) []string {
	if table == "kontraktors" {
		return []string{"nama", "company_name", "spesialisasi", "alamat"}
	}

	return []string{"nama", "company_name", "spesialisasi", "lokasi"}
}

// THE PUBLIC DIRECTORIES.
//
// `GET /api/arsitek`, `/kontraktor`, `/interior`, `/notaris`,
// `/project-manager`, `/structural-engineers`, `/mep-engineers` are
// UNAUTHENTICATED by design: anyone may browse who is available. Two
// invariants hold on all seven (see PublicProfessionalController):
//
//  1. VERIFIED ONLY — `verification_status = 'verified'`.
//  2. NO projects, NO teamMembers — the leak that created
//     `PublicProfessionalResource`. A `projects_count` number is
//     published instead.
//
// The envelope is `PaginatedResourceResponse`, not the raw paginator:
// `{data, links: {first,last,prev,next}, meta: {current_page, from,
// last_page, links, path, per_page, to, total}}` — where `meta.links` is
// the full `UrlWindow` list and top-level `links` is the four-way summary.
//
// Pagination: `?per_page=` defaults 24, clamped to [1,100]; `?page=`
// invalid reads as 1. The controller never calls `appends()`, so page URLs
// are bare `?page=`. the original API caches the page for 600s; Go answers fresh —
// the same bytes on stable data, and fresher the moment something changes.
//
// THE ROW SHAPE (`PublicProfessionalResource::toArray`)
// ------------------------------------------------------
// Thirty keys in a fixed order, with NULLS OMITTED (`array_filter` drops
// only null: `false`, `0` and `""` stay). The practical consequences, all
// verified against the golden files rather than assumed:
//
//   - `average_rating`/`review_count`/`reviews_count` are computed appends,
//     not columns, and `attribute()` reads raw columns only — so they are
//     ALWAYS absent, and no rating query runs at all.
//   - `kontraktor.spesisalisasis` is eager-loaded but never serialized.
//   - `nama_perusahaan`/`company_name` fall back to each other in both
//     directions; both missing means both absent.
//   - `foto` is the stored value verbatim (an absolute URL passes through;
//     there is no `asset()` rewrite here, unlike `UserResource.pic`).
//   - `is_verified` is `verification_status === 'verified'` — always true
//     given the filter, but computed, not hardcoded.
//   - `user` is `{id, name, pic, phoneNumber: [{contact, id_contact}]}` —
//     id_contact included even when null, and `phoneNumber: []` when the
//     user has none. The user's email, banks and team members never appear.
//   - `services` (notaris only) items are `{id, nama, deskripsi}` with nulls
//     KEPT — and `nama` is always null, because the services table names
//     the column `title`.
func DirectoryHandler(pool *pgxpool.Pool, table, base string, withServices bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		perPage := pageSize(r, 24, 100)
		currentPage := pageParam(r)

		offset := (currentPage - 1) * perPage

		// Explicit columns (no `SELECT *`): same rows, schema-change safe.
		cols := directoryColumns(table)
		search := strings.TrimSpace(r.URL.Query().Get("search"))
		where := ` WHERE verification_status = 'verified'`
		var args []any
		if search != "" {
			terms := make([]string, 0, len(directorySearchColumns(table)))
			for _, column := range directorySearchColumns(table) {
				terms = append(terms, column+` ILIKE $1`)
			}
			where += ` AND (` + strings.Join(terms, " OR ") + `)`
			args = append(args, "%"+search+"%")
		}
		countSQL := `SELECT COUNT(*) FROM ` + table + where
		rowsSQL := `SELECT ` + cols + ` FROM ` + table + where +
			` ORDER BY id LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)
		rowsArgs := append(append([]any{}, args...), perPage, offset)

		var fields []string
		var page [][]any
		total, err := queryCountAndRows(r.Context(), pool, countSQL, args, rowsSQL, rowsArgs, func(rows pgx.Rows) error {
			var collectErr error
			fields, page, collectErr = collectRows(rows)
			return collectErr
		})
		if err != nil {
			slog.Error("directory: page", "table", table, "error", err)
			serverError(w)
			return
		}

		ids := make([]int64, 0, len(page))
		userIDs := make([]int64, 0, len(page))
		seenUser := map[int64]bool{}
		for _, values := range page {
			ids = append(ids, projectInt(values, fields, "id"))
			userID := projectInt(values, fields, "user_id")
			if userID != 0 && !seenUser[userID] {
				seenUser[userID] = true
				userIDs = append(userIDs, userID)
			}
		}

		bundle, err := buildDirectoryBundle(r.Context(), pool, table, ids, userIDs, withServices)
		if err != nil {
			slog.Error("directory: batch", "table", table, "error", err)
			serverError(w)
			return
		}

		items := make([]any, 0, len(page))
		for _, values := range page {
			row, err := directoryRow(r.Context(), pool, table, fields, values, withServices, bundle)
			if err != nil {
				slog.Error("directory: row", "table", table, "error", err)
				serverError(w)
				return
			}

			items = append(items, row)
		}

		baseURL := requestBaseURL(r)

		payload := jsonwire.NewObject()
		payload.Set("data", items)
		payload.Set("links", pageLinksSummary(baseURL, "", currentPage, lastPage(total, perPage)))
		payload.Set("meta", directoryMeta(total, perPage, currentPage, basePathOf(baseURL), "", items))

		writeJSONPublic(w, r, http.StatusOK, payload, 60)
	}
}

// directoryBundle carries one page's prefetched relations. Nil keeps the
// per-row path for any other caller.
type directoryBundle struct {
	projectCounts map[int64]int64
	users         map[int64]*jsonwire.Object
	services      map[int64][]any
}

// buildDirectoryBundle loads the three per-row relations of a directory page
// once: project counts, users (plus phones), and notaris services.
func buildDirectoryBundle(ctx context.Context, pool *pgxpool.Pool, table string, ids, userIDs []int64, withServices bool) (*directoryBundle, error) {
	bundle := &directoryBundle{
		projectCounts: map[int64]int64{},
		users:         map[int64]*jsonwire.Object{},
		services:      map[int64][]any{},
	}

	if column, ok := projectColumnForProfile(table); ok && len(ids) > 0 {
		rows, err := pool.Query(ctx, `SELECT `+column+`, count(*) FROM projects
			WHERE `+column+` = ANY($1) GROUP BY `+column, ids)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var profileID, count int64
			if err := rows.Scan(&profileID, &count); err != nil {
				rows.Close()
				return nil, err
			}
			bundle.projectCounts[profileID] = count
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	if len(userIDs) > 0 {
		users, err := directoryUsersBatch(ctx, pool, userIDs)
		if err != nil {
			return nil, err
		}
		bundle.users = users
	}

	if withServices && table == "notaris_profiles" && len(ids) > 0 {
		services, err := directoryServicesBatch(ctx, pool, ids)
		if err != nil {
			return nil, err
		}
		bundle.services = services
	}

	return bundle, nil
}

// directoryUsersBatch loads the minimal public user slice for a page: users
// and their ordered phone rows, two queries instead of two per profile.
func directoryUsersBatch(ctx context.Context, pool *pgxpool.Pool, ids []int64) (map[int64]*jsonwire.Object, error) {
	out := map[int64]*jsonwire.Object{}
	if len(ids) == 0 {
		return out, nil
	}

	rows, err := pool.Query(ctx, `SELECT id, name, pic FROM users WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id int64
		var name string
		var pic *string
		if err := rows.Scan(&id, &name, &pic); err != nil {
			rows.Close()
			return nil, err
		}
		user := jsonwire.NewObject()
		user.Set("id", id)
		user.Set("name", name)
		user.Set("pic", nullableString(pic))
		user.Set("phoneNumber", []any{})
		out[id] = user
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	phones, err := pool.Query(ctx, `SELECT id_user, contact, id_contact FROM phone_user
		WHERE id_user = ANY($1) ORDER BY id_user, id`, ids)
	if err != nil {
		return nil, err
	}
	defer phones.Close()

	for phones.Next() {
		var idUser int64
		var contact, idContact *string
		if err := phones.Scan(&idUser, &contact, &idContact); err != nil {
			return nil, err
		}
		user := out[idUser]
		if user == nil {
			continue
		}
		item := jsonwire.NewObject()
		item.Set("contact", nullableString(contact))
		item.Set("id_contact", nullableString(idContact))
		list, _ := user.Get("phoneNumber")
		existing, _ := list.([]any)
		user.Set("phoneNumber", append(existing, item))
	}
	return out, phones.Err()
}

// directoryServicesBatch loads the notaris services for a page in one query.
func directoryServicesBatch(ctx context.Context, pool *pgxpool.Pool, ids []int64) (map[int64][]any, error) {
	out := map[int64][]any{}
	if len(ids) == 0 {
		return out, nil
	}

	rows, err := pool.Query(ctx, `SELECT notaris_id, id FROM notaris_services
		WHERE notaris_id = ANY($1) ORDER BY notaris_id, id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var notarisID, id int64
		if err := rows.Scan(&notarisID, &id); err != nil {
			return nil, err
		}
		item := jsonwire.NewObject()
		item.Set("id", id)
		item.Set("nama", nil)
		item.Set("deskripsi", nil)
		out[notarisID] = append(out[notarisID], item)
	}
	return out, rows.Err()
}

// directoryRow builds one allowlisted row. Columns are read by presence:
// a table without the column omits the key — which is how seven different
// schemas share one emitter without `isset` explosions.
func directoryRow(ctx context.Context, pool *pgxpool.Pool, table string, fields []string, values []any, withServices bool, bundle *directoryBundle) (*jsonwire.Object, error) {
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	present := func(key string) (any, bool) {
		value, ok := byName[key]
		if !ok || value == nil {
			return nil, false
		}
		return value, true
	}

	intOf := func(key string) (int64, bool) {
		value, ok := byName[key]
		if !ok || value == nil {
			return 0, false
		}
		switch typed := value.(type) {
		case int64:
			return typed, true
		case int32:
			return int64(typed), true
		case int:
			return int64(typed), true
		}
		return 0, false
	}

	row := jsonwire.NewObject()
	setIf := func(key string, value any, ok bool) {
		if ok {
			row.Set(key, value)
		}
	}

	id, _ := intOf("id")
	userID, _ := intOf("user_id")

	row.Set("id", id)
	row.Set("user_id", userID)

	if value, ok := present("nama"); ok {
		row.Set("nama", jsonVal(value))
	}

	companyA, hasA := present("nama_perusahaan")
	companyB, hasB := present("company_name")
	if hasA && !hasB {
		companyB, hasB = companyA, true
	} else if hasB && !hasA {
		companyA, hasA = companyB, true
	}
	setIf("nama_perusahaan", honorValue(companyA), hasA)
	setIf("company_name", honorValue(companyB), hasB)

	for _, key := range []string{"spesialisasi", "lokasi", "deskripsi"} {
		if value, ok := present(key); ok {
			row.Set(key, jsonVal(value))
		}
	}

	if value, ok := intOf("pengalaman_tahun"); ok {
		row.Set("pengalaman_tahun", value)
	}

	if value, ok := present("rate_harga"); ok {
		row.Set("rate_harga", jsonVal(value))
	}
	if value, ok := present("koefisien"); ok {
		row.Set("koefisien", jsonVal(value))
	}

	// A NUMBER, not the projects. `withCount('projects')` counts the rows
	// that name this profile's id, and a count cannot leak a column.
	projectsCount := int64(0)
	if profileID, ok := intOf("id"); ok {
		if bundle != nil {
			projectsCount = bundle.projectCounts[profileID]
		} else if column, ok := projectColumnForProfile(table); ok {
			_ = pool.QueryRow(ctx,
				`SELECT COUNT(*) FROM projects WHERE `+column+` = $1`, profileID,
			).Scan(&projectsCount)
		}
	}
	row.Set("projects_count", projectsCount)
	row.Set("count", projectsCount)

	for _, key := range []string{"no_telp", "phone"} {
		if value, ok := present(key); ok {
			row.Set(key, jsonVal(value))
		}
	}
	if _, ok := present("phone_number"); ok {
		row.Set("phone_number", phoneNumberOf(byName))
	}

	if withServices {
		if bundle != nil {
			services := bundle.services[id]
			if services == nil {
				services = []any{}
			}
			row.Set("services", services)
		} else {
			services, err := directoryServices(ctx, pool, table, id)
			if err != nil {
				return nil, err
			}
			row.Set("services", services)
		}
	}

	if value, ok := present("foto"); ok {
		row.Set("foto", jsonVal(value))
	}
	if value, ok := present("category"); ok {
		row.Set("category", jsonVal(value))
	}

	verified := false
	if status, ok := byName["verification_status"].(string); ok && status == "verified" {
		verified = true
	}
	row.Set("is_verified", verified)

	if userID != 0 {
		if bundle != nil {
			row.Set("user", bundle.users[userID])
		} else {
			user, err := directoryUser(ctx, pool, userID)
			if err != nil {
				return nil, err
			}
			row.Set("user", user)
		}
	}

	return row, nil
}

// honorValue passes a present value through the encoder.
func honorValue(value any) any {
	return jsonVal(value)
}

// phoneNumberOf reads a profile-level phone_number column when the table
// has one — distinct from the user's phoneNumber relation below.
func phoneNumberOf(byName map[string]any) any {
	if value, ok := byName["phone_number"]; ok && value != nil {
		return jsonVal(value)
	}
	return nil
}

// projectColumnForProfile names the projects column holding a table's
// profile id.
func projectColumnForProfile(table string) (string, bool) {
	switch table {
	case "arsiteks":
		return "selected_arsitek_id", true
	case "kontraktors":
		return "selected_kontraktor_id", true
	case "notaris_profiles":
		return "selected_notaris_id", true
	case "interior_profiles":
		return "selected_interior_id", true
	case "project_managers":
		return "pm_id", true
	case "structural_engineers":
		return "structural_id", true
	case "mep_engineers":
		return "mep_id", true
	default:
		return "", false
	}
}

// directoryUser builds the minimal public user slice. No email, no banks,
// no team members — ever.
func directoryUser(ctx context.Context, pool *pgxpool.Pool, userID int64) (*jsonwire.Object, error) {
	var id int64
	var name string
	var pic *string
	if err := pool.QueryRow(ctx,
		`SELECT id, name, pic FROM users WHERE id = $1`, userID,
	).Scan(&id, &name, &pic); err != nil {
		return nil, err
	}

	phones, err := pool.Query(ctx,
		`SELECT contact, id_contact FROM phone_user WHERE id_user = $1 ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer phones.Close()

	list := make([]any, 0)
	for phones.Next() {
		var contact, idContact *string
		if err := phones.Scan(&contact, &idContact); err != nil {
			phones.Close()
			return nil, err
		}
		item := jsonwire.NewObject()
		item.Set("contact", nullableString(contact))
		item.Set("id_contact", nullableString(idContact))
		list = append(list, item)
	}
	if err := phones.Err(); err != nil {
		return nil, err
	}

	user := jsonwire.NewObject()
	user.Set("id", id)
	user.Set("name", name)
	user.Set("pic", nullableString(pic))
	user.Set("phoneNumber", list)

	return user, nil
}

// directoryServices builds the notaris services list. Both text keys are
// ALWAYS null: the resource reads `$s->nama` and `$s->deskripsi`, but the
// table names its columns `title` and `description` — so under
// `shouldBeStrict` those read as missing and the golden pins nulls.
// Replicated exactly: select only what the wire shows.
func directoryServices(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64) ([]any, error) {
	if table != "notaris_profiles" {
		return []any{}, nil
	}

	rows, err := pool.Query(ctx, `
		SELECT id FROM notaris_services WHERE notaris_id = $1 ORDER BY id
	`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		item := jsonwire.NewObject()
		item.Set("id", id)
		item.Set("nama", nil)
		item.Set("deskripsi", nil)
		list = append(list, item)
	}

	return list, rows.Err()
}

// pageLinksSummary is the four-way summary: first, last, prev, next.
func pageLinksSummary(basePath, rawQuery string, currentPage, last int) *jsonwire.Object {
	links := jsonwire.NewObject()

	first := buildPageURL(basePath, rawQuery, 1)
	lastURL := buildPageURL(basePath, rawQuery, last)
	links.Set("first", first)
	links.Set("last", lastURL)

	if currentPage > 1 {
		previous := buildPageURL(basePath, rawQuery, currentPage-1)
		links.Set("prev", previous)
	} else {
		links.Set("prev", nil)
	}

	if currentPage < last {
		next := buildPageURL(basePath, rawQuery, currentPage+1)
		links.Set("next", next)
	} else {
		links.Set("next", nil)
	}

	return links
}

// directoryMeta is the `PaginatedResourceResponse` meta: the paginator's
// keys minus the URLs the top-level `links` already carries.
func directoryMeta(total, perPage, currentPage int, basePath, rawQuery string, items []any) *jsonwire.Object {
	meta := jsonwire.NewObject()
	meta.Set("current_page", currentPage)
	meta.Set("from", pageFrom(total, perPage, currentPage, len(items)))
	meta.Set("last_page", lastPage(total, perPage))
	meta.Set("links", pageLinks(currentPage, lastPage(total, perPage), basePath, rawQuery))
	meta.Set("path", basePath)
	meta.Set("per_page", perPage)
	meta.Set("to", pageTo(total, perPage, currentPage, len(items)))
	meta.Set("total", total)

	return meta
}

// pageSize reads `?per_page=` the way `remember()` does: default,
// coerced to int, clamped to [1, max].
func pageSize(r *http.Request, fallback, max int) int {
	raw := r.URL.Query().Get("per_page")
	if raw == "" {
		return fallback
	}

	size, err := strconv.Atoi(raw)
	if err != nil || size < 1 {
		return fallback
	}

	if size > max {
		return max
	}

	return size
}

// lastPage mirrors `ceil(total/perPage)` floored at 1.
func lastPage(total, perPage int) int {
	if perPage <= 0 {
		perPage = 15
	}
	last := total / perPage
	if total%perPage != 0 {
		last++
	}
	if last < 1 {
		last = 1
	}
	return last
}

// pageFrom mirrors `firstItem()`: null on an empty slice.
func pageFrom(total, perPage, currentPage, count int) any {
	if count == 0 {
		return nil
	}
	return (currentPage-1)*perPage + 1
}

// pageTo mirrors `lastItem()`: null on an empty slice.
func pageTo(total, perPage, currentPage, count int) any {
	if count == 0 {
		return nil
	}
	return (currentPage-1)*perPage + count
}

// basePathOf strips any query the base URL should not carry.
func basePathOf(baseURL string) string {
	for i, c := range baseURL {
		if c == '?' {
			return baseURL[:i]
		}
	}
	return baseURL
}

// fieldNames reads the columns of a pgx result in order.
func fieldNames(rows pgx.Rows) []string {
	descriptions := rows.FieldDescriptions()
	names := make([]string, 0, len(descriptions))
	for _, field := range descriptions {
		names = append(names, string(field.Name))
	}
	return names
}

// scanRow scans one pgx row into neutral values.
func scanRow(rows pgx.Rows, width int) ([]any, error) {
	values := make([]any, width)
	pointers := make([]any, width)
	for i := range values {
		pointers[i] = &values[i]
	}

	if err := rows.Scan(pointers...); err != nil {
		return nil, err
	}

	return values, nil
}
