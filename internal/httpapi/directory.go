package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
// are bare `?page=`. Laravel caches the page for 600s; Go answers fresh —
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

		var total int
		if err := pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM `+table+` WHERE verification_status = 'verified'`,
		).Scan(&total); err != nil {
			slog.Error("directory: count", "table", table, "error", err)
			serverError(w)
			return
		}

		offset := (currentPage - 1) * perPage

		rows, err := pool.Query(r.Context(), `
			SELECT * FROM `+table+` WHERE verification_status = 'verified'
			 ORDER BY id LIMIT $1 OFFSET $2
		`, perPage, offset)
		if err != nil {
			slog.Error("directory: query", "table", table, "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		fields := fieldNames(rows)
		items := make([]any, 0, perPage)

		for rows.Next() {
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("directory: scan", "table", table, "error", err)
				serverError(w)
				return
			}

			row, err := directoryRow(r.Context(), pool, table, fields, values, withServices)
			if err != nil {
				slog.Error("directory: row", "table", table, "error", err)
				serverError(w)
				return
			}

			items = append(items, row)
		}
		if err := rows.Err(); err != nil {
			slog.Error("directory: rows", "table", table, "error", err)
			serverError(w)
			return
		}

		baseURL := requestBaseURL(r)

		payload := jsonphp.NewObject()
		payload.Set("data", items)
		payload.Set("links", pageLinksSummary(baseURL, "", currentPage, lastPage(total, perPage)))
		payload.Set("meta", directoryMeta(total, perPage, currentPage, basePathOf(baseURL), "", items))

		writeJSON(w, http.StatusOK, payload)
	}
}

// directoryRow builds one allowlisted row. Columns are read by presence:
// a table without the column omits the key — which is how seven different
// schemas share one emitter without `isset` explosions.
func directoryRow(ctx context.Context, pool *pgxpool.Pool, table string, fields []string, values []any, withServices bool) (*jsonphp.Object, error) {
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

	row := jsonphp.NewObject()
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
		if column, ok := projectColumnForProfile(table); ok {
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
		services, err := directoryServices(ctx, pool, table, id)
		if err != nil {
			return nil, err
		}
		row.Set("services", services)
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
		user, err := directoryUser(ctx, pool, userID)
		if err != nil {
			return nil, err
		}
		row.Set("user", user)
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
func directoryUser(ctx context.Context, pool *pgxpool.Pool, userID int64) (*jsonphp.Object, error) {
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
		item := jsonphp.NewObject()
		item.Set("contact", nullableString(contact))
		item.Set("id_contact", nullableString(idContact))
		list = append(list, item)
	}
	if err := phones.Err(); err != nil {
		return nil, err
	}

	user := jsonphp.NewObject()
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
		item := jsonphp.NewObject()
		item.Set("id", id)
		item.Set("nama", nil)
		item.Set("deskripsi", nil)
		list = append(list, item)
	}

	return list, rows.Err()
}

// pageLinksSummary is the four-way summary: first, last, prev, next.
func pageLinksSummary(basePath, rawQuery string, currentPage, last int) *jsonphp.Object {
	links := jsonphp.NewObject()

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
func directoryMeta(total, perPage, currentPage int, basePath, rawQuery string, items []any) *jsonphp.Object {
	meta := jsonphp.NewObject()
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
		return 1
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
