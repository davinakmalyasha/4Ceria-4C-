package httpapi

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// FIRM ROSTER + PROFILE + the two writes that touch other aggregates.

// firmProfileRow reads the profile row that a roster member's fields come
// from: the first non-null of structural → mep → interior → kontraktor →
// arsitek, matching the service's `??` chain.
func firmProfileRow(ctx context.Context, pool *pgxpool.Pool, userID int64) (string, map[string]any, bool) {
	for _, table := range []string{"structural_engineers", "mep_engineers", "interior_profiles", "kontraktors", "arsiteks"} {
		rows, err := pool.Query(ctx, `SELECT * FROM `+table+` WHERE user_id = $1 LIMIT 1`, userID)
		if err != nil {
			continue
		}
		if rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			rows.Close()
			if err != nil {
				continue
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			return table, byName, true
		}
		rows.Close()
	}
	return "", nil, false
}

// firmFloatOf renders a decimal-string or numeric value as a PHP (float) cast.
func firmFloatOf(value any) float64 {
	// pgx hands `numeric` back as pgtype.Numeric and `integer` as int32.
	if parsed, ok := numericFloatValue(value).(float64); ok {
		return parsed
	}
	if typed, ok := value.(int32); ok {
		return float64(typed)
	}
	return 0
}

// firmIntOf renders a numeric value as a PHP (int) cast.
func firmIntOf(value any) int64 {
	switch typed := value.(type) {
	case nil:
		return 0
	case int64:
		return typed
	case int32:
		return int64(typed)
	case int16:
		return int64(typed)
	case int:
		return int64(typed)
	case float64:
		return int64(typed)
	case string:
		parsed, err := strconv.ParseInt(strings.TrimSpace(typed), 10, 64)
		if err != nil {
			return 0
		}
		return parsed
	}
	return 0
}

// firmPortfolios lists a user's portfolio models.
func firmPortfolios(ctx context.Context, pool *pgxpool.Pool, userID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, user_id, role_type, title, description,
		image_path, duration, client_review, created_at, updated_at
		FROM professional_portfolios WHERE user_id = $1
		ORDER BY created_at DESC, id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var (
			id, user                 int64
			role, title, description *string
			imagePath, duration      *string
			clientReview             *string
			createdAt, updatedAt     any
		)
		if err := rows.Scan(&id, &user, &role, &title, &description, &imagePath,
			&duration, &clientReview, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		entry := jsonphp.NewObject()
		entry.Set("id", id)
		entry.Set("user_id", user)
		entry.Set("role_type", nullableString(role))
		entry.Set("title", nullableString(title))
		entry.Set("description", nullableString(description))
		entry.Set("image_path", nullableString(imagePath))
		entry.Set("duration", nullableString(duration))
		entry.Set("client_review", nullableString(clientReview))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("updated_at", projectTimeValue(updatedAt))
		out = append(out, entry)
	}
	return out, rows.Err()
}

// firmRoster is FirmMemberService::getRoster for one owner.
func firmRoster(ctx context.Context, pool *pgxpool.Pool, ownerID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(firmMemberColumns, ", ")+`
		  FROM firm_members
		 WHERE firm_owner_id = $1 AND status IN ('invited', 'active', 'requested')
		 ORDER BY created_at DESC, id ASC`, ownerID)
	if err != nil {
		return nil, err
	}

	members := make([]map[string]any, 0)
	for rows.Next() {
		names := fieldNames(rows)
		values, err := scanRow(rows, len(names))
		if err != nil {
			rows.Close()
			return nil, err
		}
		byName := map[string]any{}
		for i, column := range names {
			byName[column] = values[i]
		}
		members = append(members, byName)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(members) == 0 {
		return []any{}, nil
	}

	memberIDs := make([]int64, 0, len(members))
	for _, member := range members {
		memberIDs = append(memberIDs, intPtrDeref(member["member_user_id"]))
	}

	// Active sub-professional project titles, grouped by member.
	subTitles := map[int64][]string{}
	subRows, err := pool.Query(ctx, `
		SELECT sp.user_id, p.title
		  FROM project_sub_professionals sp
		  JOIN projects p ON p.id = sp.project_id
		 WHERE sp.user_id = ANY($1) AND sp.status::text = 'active'
		 ORDER BY p.id`, memberIDs)
	if err != nil {
		return nil, err
	}
	for subRows.Next() {
		var userID int64
		var title *string
		if err := subRows.Scan(&userID, &title); err != nil {
			subRows.Close()
			return nil, err
		}
		if title != nil {
			subTitles[userID] = append(subTitles[userID], *title)
		}
	}
	subRows.Close()

	// Projects this roster is hired on as the PRIMARY professional.
	type primaryProject struct {
		title                                          string
		structural, mep, interior, kontraktor, arsitek *int64
	}
	primary := make([]primaryProject, 0)
	projectRows, err := pool.Query(ctx, `SELECT title, structural_id, mep_id,
		selected_interior_id, selected_kontraktor_id, selected_arsitek_id
		  FROM projects
		 WHERE status::text NOT IN ('completed', 'cancelled')
		 ORDER BY id`)
	if err != nil {
		return nil, err
	}
	for projectRows.Next() {
		var entry primaryProject
		if err := projectRows.Scan(&entry.title, &entry.structural, &entry.mep,
			&entry.interior, &entry.kontraktor, &entry.arsitek); err != nil {
			projectRows.Close()
			return nil, err
		}
		primary = append(primary, entry)
	}
	projectRows.Close()

	out := make([]any, 0, len(members))
	for _, member := range members {
		memberUserID := intPtrDeref(member["member_user_id"])

		var (
			userID                    int64
			name                      string
			uniqueCode, roleType, pic *string
		)
		err := pool.QueryRow(ctx, `SELECT id, name, unique_code, role_type::text, pic
			FROM users WHERE id = $1`, memberUserID).Scan(&userID, &name, &uniqueCode, &roleType, &pic)
		if err != nil {
			if isNoRows(err) {
				continue
			}
			return nil, err
		}

		_, profile, _ := firmProfileRow(ctx, pool, memberUserID)

		memberEntry := jsonphp.NewObject()
		memberEntry.Set("id", userID)
		memberEntry.Set("name", name)
		memberEntry.Set("role_type", nullableString(roleType))
		memberEntry.Set("pic", firmAssetURL(ctx, pic))
		memberEntry.Set("no_telp", nullableString(firmPhone(profile)))
		memberEntry.Set("verification_status", firmVerification(profile))
		memberEntry.Set("rate_harga", firmFloatOf(profile["rate_harga"]))
		experience := profile["pengalaman_tahun"]
		if experience == nil {
			experience = profile["pengalaman"]
		}
		memberEntry.Set("pengalaman_tahun", firmIntOf(experience))
		memberEntry.Set("deskripsi", firmDeskripsi(profile))
		memberEntry.Set("lokasi", firmLokasi(profile))
		memberEntry.Set("entity_type", firmEntityType(profile))

		for _, relation := range []struct {
			key   string
			table string
		}{
			{"structural_engineer", "structural_engineers"},
			{"mep_engineer", "mep_engineers"},
			{"interior_profile", "interior_profiles"},
			{"kontraktor", "kontraktors"},
			{"arsitek", "arsiteks"},
		} {
			var profileID int64
			if err := pool.QueryRow(ctx, `SELECT id FROM `+relation.table+` WHERE user_id = $1 LIMIT 1`,
				memberUserID).Scan(&profileID); err != nil {
				memberEntry.Set(relation.key, nil)
				continue
			}
			block, err := profileModelObject(ctx, pool, relation.table, profileID, false)
			if err != nil {
				return nil, err
			}
			memberEntry.Set(relation.key, block)
		}

		portfolios, err := firmPortfolios(ctx, pool, memberUserID)
		if err != nil {
			return nil, err
		}
		memberEntry.Set("portfolios", portfolios)

		titles := make([]string, 0)
		seen := map[string]bool{}
		for _, title := range subTitles[memberUserID] {
			if !seen[title] {
				seen[title] = true
				titles = append(titles, title)
			}
		}
		role := ""
		if roleType != nil {
			role = *roleType
		}
		var profileID int64
		if profile != nil {
			profileID = firmIntOf(profile["id"])
		}
		for _, project := range primary {
			var column *int64
			switch role {
			case "structural":
				column = project.structural
			case "mep":
				column = project.mep
			case "interior":
				column = project.interior
			case "kontraktor":
				column = project.kontraktor
			case "arsitek":
				column = project.arsitek
			}
			if column != nil && *column == profileID && !seen[project.title] {
				seen[project.title] = true
				titles = append(titles, project.title)
			}
		}

		entry := firmMemberObject(member)
		entry.Set("active_projects_count", len(titles))
		projectList := make([]any, 0, len(titles))
		for _, title := range titles {
			projectList = append(projectList, title)
		}
		entry.Set("active_projects", projectList)
		entry.Set("member", memberEntry)
		out = append(out, entry)
	}

	return out, nil
}

func firmPhone(profile map[string]any) *string {
	if profile == nil {
		return nil
	}
	if phone, ok := profile["no_telp"].(string); ok && phone != "" {
		return &phone
	}
	if phone, ok := profile["no_telepon"].(string); ok && phone != "" {
		return &phone
	}
	return nil
}

func firmVerification(profile map[string]any) any {
	if profile == nil {
		return "unverified"
	}
	if status, ok := profile["verification_status"].(string); ok && status != "" {
		return status
	}
	return "unverified"
}

func firmDeskripsi(profile map[string]any) any {
	if profile == nil {
		return ""
	}
	if text, ok := profile["deskripsi"].(string); ok {
		return text
	}
	return ""
}

func firmLokasi(profile map[string]any) any {
	if profile == nil {
		return ""
	}
	if text, ok := profile["lokasi"].(string); ok && text != "" {
		return text
	}
	if text, ok := profile["alamat"].(string); ok {
		return text
	}
	return ""
}

func firmEntityType(profile map[string]any) any {
	if profile == nil {
		return "individual"
	}
	if text, ok := profile["entity_type"].(string); ok && text != "" {
		return text
	}
	return "individual"
}

// FirmMembersProfileHandler serves `GET /api/firm-members/profile/{ownerId}`.
func FirmMembersProfileHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		raw := r.PathValue("ownerId")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		ownerID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			message(w, http.StatusNotFound, "Firm not found.")
			return
		}
		ctx := r.Context()

		var (
			id                      int64
			name                    string
			username, pic, roleType *string
			firmName, firmSlogan    *string
			banner, firmDescription *string
			firmHiring              *bool
			needed                  *string
		)
		err = pool.QueryRow(ctx, `SELECT id, name, username, pic, role_type::text,
			firm_name, firm_slogan, firm_banner_path, firm_description,
			firm_is_hiring, firm_needed_roles::text
			FROM users WHERE id = $1 AND role_type::text IN ('arsitek', 'kontraktor')`, ownerID).
			Scan(&id, &name, &username, &pic, &roleType, &firmName, &firmSlogan,
				&banner, &firmDescription, &firmHiring, &needed)
		if err != nil {
			if isNoRows(err) {
				message(w, http.StatusNotFound, "Firm not found.")
				return
			}
			slog.Error("firm profile: owner", "error", err)
			serverError(w)
			return
		}

		profileTable := "kontraktors"
		if roleType != nil && *roleType == "arsitek" {
			profileTable = "arsiteks"
		}
		var profileID int64
		_, profile, _ := firmProfileRow(ctx, pool, ownerID)
		if profile != nil {
			profileID = firmIntOf(profile["id"])
		}

		owner := jsonphp.NewObject()
		owner.Set("id", id)
		owner.Set("name", name)
		owner.Set("username", nullableString(username))
		owner.Set("pic", firmAssetURL(ctx, pic))
		owner.Set("role_type", nullableString(roleType))
		owner.Set("unique_code", nil)

		displayName := ""
		if firmName != nil {
			displayName = *firmName
		} else if profile != nil {
			if company, ok := profile["company_name"].(string); ok && company != "" {
				displayName = company
			} else {
				displayName = name
			}
		} else {
			displayName = name
		}

		description := ""
		if firmDescription != nil {
			description = *firmDescription
		} else if profile != nil {
			if text, ok := profile["deskripsi"].(string); ok {
				description = text
			}
		}

		hiring := false
		if firmHiring != nil {
			hiring = *firmHiring
		}

		stats := jsonphp.NewObject()
		experience := int64(0)
		rate := 0.0
		average := 0.0
		var reviews int64
		if profile != nil {
			value := profile["pengalaman_tahun"]
			if value == nil {
				value = profile["pengalaman"]
			}
			experience = firmIntOf(value)
			rate = firmFloatOf(profile["rate_harga"])
			average, reviews = profileRatingValue(ctx, pool, profileTable, profileID)
		}
		stats.Set("experience_years", experience)
		stats.Set("base_rate", rate)
		stats.Set("average_rating", average)
		stats.Set("review_count", reviews)
		var memberCount int64
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM firm_members
			WHERE firm_owner_id = $1 AND status = 'active'`, ownerID).Scan(&memberCount)
		stats.Set("active_members_count", memberCount)

		roster, err := firmRoster(ctx, pool, ownerID)
		if err != nil {
			slog.Error("firm profile: roster", "error", err)
			serverError(w)
			return
		}
		portfolios, err := firmPortfolios(ctx, pool, ownerID)
		if err != nil {
			slog.Error("firm profile: portfolios", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("owner", owner)
		payload.Set("firm_name", displayName)
		payload.Set("firm_slogan", nullableString(firmSlogan))
		payload.Set("firm_banner_url", firmAssetURL(ctx, banner))
		payload.Set("firm_description", description)
		payload.Set("firm_is_hiring", hiring)
		if needed == nil {
			payload.Set("firm_needed_roles", []any{})
		} else {
			payload.Set("firm_needed_roles", orderedJSONColumn(*needed))
		}
		payload.Set("stats", stats)
		payload.Set("roster", roster)
		payload.Set("portfolios", portfolios)
		writeJSON(w, http.StatusOK, payload)
	}
}

// firmBoolFilter is PHP's filter_var(..., FILTER_VALIDATE_BOOLEAN).
func firmBoolFilter(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		switch strings.ToLower(strings.TrimSpace(typed)) {
		case "1", "true", "on", "yes":
			return true
		}
		return false
	case float64:
		return typed != 0
	case int64:
		return typed != 0
	}
	return false
}

// FirmMembersUpdateProfileHandler serves
// `POST /api/firm-members/update-profile`.
//
// Identity (`users`) is MySQL-owned: the write goes to MySQL and re-syncs the
// mirror. The professional profile (`arsiteks`/`kontraktors`) is written to
// PostgreSQL, which is the read source.
func FirmMembersUpdateProfileHandler(mysqlDB, mysqlWall *sql.DB, pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("firm update: viewer", "error", err)
			serverError(w)
			return
		}
		if viewer.role != "arsitek" && viewer.role != "kontraktor" {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}

		failures := &errorBag{}
		var firmName, firmSlogan, firmDescription *string
		for _, pair := range []struct {
			key  string
			max  int
			dest **string
		}{
			{"firm_name", 100, &firmName},
			{"firm_slogan", 150, &firmSlogan},
			{"firm_description", 1000, &firmDescription},
		} {
			raw, present := fields[pair.key]
			if !present || raw == nil {
				continue
			}
			text, ok := raw.(string)
			if !ok {
				failures.add(pair.key, "The "+houseAttrName(pair.key)+" field must be a string.")
				continue
			}
			if len([]rune(text)) > pair.max {
				failures.add(pair.key, "The "+houseAttrName(pair.key)+" field must not be greater than "+
					strconv.Itoa(pair.max)+" characters.")
				continue
			}
			dup := text
			*pair.dest = &dup
		}

		var baseRate *string
		if raw, present := fields["base_rate"]; present && raw != nil {
			if text, ok := numericTextOf(raw); ok && isNumericText(text) {
				if parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil && parsed < 0 {
					failures.add("base_rate", "The base rate field must be at least 0.")
				} else {
					trimmed := strings.TrimSpace(text)
					baseRate = &trimmed
				}
			} else {
				failures.add("base_rate", "The base rate field must be a number.")
			}
		}
		var experienceYears *int64
		if raw, present := fields["experience_years"]; present && raw != nil {
			text, ok := numericTextOf(raw)
			if !ok || !isIntegerText(text) {
				failures.add("experience_years", "The experience years field must be an integer.")
			} else {
				parsed, _ := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
				if parsed < 0 {
					failures.add("experience_years", "The experience years field must be at least 0.")
				} else {
					experienceYears = &parsed
				}
			}
		}

		banner := requestFilesNamed(r, "firm_banner")
		if len(banner) > 1 {
			failures.add("firm_banner", "The firm banner field must be a file of type: jpeg, png, jpg, webp.")
		}
		if len(banner) == 1 {
			houseImageFailures(banner[0], "firm_banner", failures)
			if banner[0].sizeBytes() > 5120*1024 {
				failures.add("firm_banner", "The firm banner field must not be greater than 5120 kilobytes.")
			}
		}
		logo := requestFilesNamed(r, "firm_logo")
		if len(logo) > 1 {
			failures.add("firm_logo", "The firm logo field must be a file of type: jpeg, png, jpg, webp.")
		}
		if len(logo) == 1 {
			houseImageFailures(logo[0], "firm_logo", failures)
			if logo[0].sizeBytes() > 2048*1024 {
				failures.add("firm_logo", "The firm logo field must not be greater than 2048 kilobytes.")
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		// Build the users UPDATE (MySQL-owned).
		sets := make([]string, 0, 8)
		// Values first; the WHERE id is bound LAST.
		args := make([]any, 0, 8)
		setClause := func(column string, value any) string {
			args = append(args, value)
			return column + " = ?"
		}
		if firmName != nil {
			sets = append(sets, setClause("firm_name", *firmName))
		}
		if firmSlogan != nil {
			sets = append(sets, setClause("firm_slogan", *firmSlogan))
		}
		if firmDescription != nil {
			sets = append(sets, setClause("firm_description", *firmDescription))
		}
		if raw, present := fields["firm_is_hiring"]; present {
			sets = append(sets, setClause("firm_is_hiring", firmBoolFilter(raw)))
		}
		if raw, present := fields["firm_needed_roles"]; present {
			var decoded any
			if text, ok := raw.(string); ok {
				decoded = orderedJSONColumn(text)
				if decoded == nil {
					decoded = []any{}
				}
			} else {
				decoded = raw
			}
			encoded, err := jsonphp.Marshal(decoded)
			if err == nil {
				sets = append(sets, setClause("firm_needed_roles", string(encoded)))
			}
		}

		bannerPath := ""
		if len(banner) == 1 {
			var oldBanner *string
			_ = mysqlDB.QueryRowContext(ctx, `SELECT firm_banner_path FROM users WHERE id = ?`,
				caller.UserID()).Scan(&oldBanner)
			stored, err := storeVaultFile("firm_banners", banner[0].filename, banner[0].data)
			if err != nil {
				slog.Error("firm update: banner", "error", err)
				serverError(w)
				return
			}
			bannerPath = stored
			if oldBanner != nil && *oldBanner != "" {
				_ = removeVaultFile(*oldBanner)
			}
			sets = append(sets, setClause("firm_banner_path", stored))
		}
		if len(logo) == 1 {
			var oldLogo *string
			_ = mysqlDB.QueryRowContext(ctx, `SELECT pic FROM users WHERE id = ?`, caller.UserID()).Scan(&oldLogo)
			stored, err := storeVaultFile("avatars", logo[0].filename, logo[0].data)
			if err != nil {
				slog.Error("firm update: logo", "error", err)
				serverError(w)
				return
			}
			if oldLogo != nil && *oldLogo != "" {
				_ = removeVaultFile(*oldLogo)
			}
			sets = append(sets, setClause("pic", stored))
		}

		sets = append(sets, "updated_at = NOW()")
		args = append(args, caller.UserID())
		if _, err := mysqlDB.ExecContext(ctx, `UPDATE users SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...); err != nil {
			slog.Error("firm update: mysql", "error", err)
			serverError(w)
			return
		}

		if err := syncAuthUserToPG(ctx, mysqlDB, mysqlWall, pool, caller.UserID()); err != nil {
			slog.Error("firm update: resync", "error", err)
			serverError(w)
			return
		}

		// Professional profile counters live in PostgreSQL.
		profileSQL := make([]string, 0, 2)
		profileArgs := []any{caller.UserID()}
		if baseRate != nil {
			profileArgs = append(profileArgs, *baseRate)
			profileSQL = append(profileSQL, "rate_harga = $"+strconv.Itoa(len(profileArgs))+"::numeric")
		}
		if experienceYears != nil {
			profileArgs = append(profileArgs, *experienceYears)
			column := "pengalaman_tahun"
			if viewer.role == "kontraktor" {
				column = "pengalaman"
			}
			profileSQL = append(profileSQL, column+" = $"+strconv.Itoa(len(profileArgs)))
		}
		if len(profileSQL) > 0 {
			table := "arsiteks"
			if viewer.role == "kontraktor" {
				table = "kontraktors"
			}
			if _, err := pool.Exec(ctx, `UPDATE `+table+` SET `+strings.Join(profileSQL, ", ")+
				` WHERE user_id = $1`, profileArgs...); err != nil {
				slog.Error("firm update: profile", "error", err)
				serverError(w)
				return
			}
		}

		if firmName != nil && *firmName != "" {
			for _, table := range []string{"arsiteks", "kontraktors"} {
				_, _ = pool.Exec(ctx, `UPDATE `+table+` SET company_name = $2 WHERE user_id = $1`,
					caller.UserID(), *firmName)
			}
		}

		user, err := fullProfileUser(ctx, pool, caller.UserID(), false)
		if err != nil {
			slog.Error("firm update: render", "error", err)
			serverError(w)
			return
		}

		// The controller TOUCHES the profile relations: the base_rate block
		// reads the caller's own, and the company_name sync reads BOTH. A
		// touched relation serializes on the user payload.
		if object, ok := user.(*jsonphp.Object); ok {
			order := make([]string, 0, 2)
			addRelation := func(name string) {
				for _, existing := range order {
					if existing == name {
						return
					}
				}
				order = append(order, name)
			}
			ownRelation := "arsitek"
			if viewer.role == "kontraktor" {
				ownRelation = "kontraktor"
			}
			if baseRate != nil || experienceYears != nil {
				addRelation(ownRelation)
			}
			if firmName != nil && *firmName != "" {
				addRelation("arsitek")
				addRelation("kontraktor")
			}
			for _, relation := range order {
				table := "arsiteks"
				if relation == "kontraktor" {
					table = "kontraktors"
				}
				var profileID int64
				if err := pool.QueryRow(ctx, `SELECT id FROM `+table+` WHERE user_id = $1 LIMIT 1`,
					caller.UserID()).Scan(&profileID); err == nil {
					if block, berr := profileModelObject(ctx, pool, table, profileID, false); berr == nil {
						object.Set(relation, block)
						continue
					}
				}
				object.Set(relation, nil)
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Firm squad profile updated successfully.")
		payload.Set("user", user)
		_ = bannerPath
		writeJSON(w, http.StatusOK, payload)
	}
}

// hireMatches is Hire::matches for the caller's own role.
func hireMatches(viewer *projectViewer, columns map[string]any, role string) bool {
	if viewer.role != role {
		return false
	}
	column := ""
	switch role {
	case "arsitek":
		column = "selected_arsitek_id"
	case "kontraktor":
		column = "selected_kontraktor_id"
	case "notaris":
		column = "selected_notaris_id"
	case "interior":
		column = "selected_interior_id"
	case "project_manager":
		column = "pm_id"
	case "structural":
		column = "structural_id"
	case "mep":
		column = "mep_id"
	default:
		return false
	}
	own, ok := viewer.profiles[role]
	if !ok || own == 0 {
		return false
	}
	selected := intPtrDeref(columns[column])
	return selected != 0 && selected == own
}

// FirmMembersQuickAssignHandler serves
// `POST /api/firm-members/quick-assign`.
func FirmMembersQuickAssignHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("quick-assign: viewer", "error", err)
			serverError(w)
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		var memberID, projectID int64
		for _, pair := range []struct {
			key  string
			dest *int64
		}{
			{"member_user_id", &memberID},
			{"project_id", &projectID},
		} {
			raw, present := fields[pair.key]
			if !present || raw == nil {
				failures.add(pair.key, "The "+houseAttrName(pair.key)+" field is required.")
				continue
			}
			text, ok := numericTextOf(raw)
			if !ok || !isIntegerText(text) {
				failures.add(pair.key, "The selected "+houseAttrName(pair.key)+" is invalid.")
				continue
			}
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			table := "users"
			if pair.key == "project_id" {
				table = "projects"
			}
			if err != nil || !existsID(ctx, pool, table, parsed) {
				failures.add(pair.key, "The selected "+houseAttrName(pair.key)+" is invalid.")
				continue
			}
			*pair.dest = parsed
		}

		subRole := ""
		if raw, present := fields["sub_role"]; !present || raw == nil {
			failures.add("sub_role", "The sub role field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("sub_role", "The sub role field must be a string.")
		} else if len([]rune(text)) > 50 {
			failures.add("sub_role", "The sub role field must not be greater than 50 characters.")
		} else {
			subRole = text
		}

		rate := ""
		if raw, present := fields["rate"]; !present || raw == nil {
			failures.add("rate", "The rate field is required.")
		} else if text, ok := numericTextOf(raw); ok && isNumericText(text) {
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil && parsed < 0 {
				failures.add("rate", "The rate field must be at least 0.")
			} else {
				rate = strings.TrimSpace(text)
			}
		} else {
			failures.add("rate", "The rate field must be a number.")
		}

		description := ""
		descriptionSet := false
		if raw, present := fields["description"]; present && raw != nil {
			text, ok := raw.(string)
			if !ok {
				failures.add("description", "The description field must be a string.")
			} else if len([]rune(text)) > 500 {
				failures.add("description", "The description field must not be greater than 500 characters.")
			} else {
				description = text
				descriptionSet = true
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		var active int64
		if err := pool.QueryRow(ctx, `SELECT id FROM firm_members
			WHERE firm_owner_id = $1 AND member_user_id = $2 AND role_in_firm = $3
			  AND status = 'active' LIMIT 1`,
			viewer.id, memberID, subRole).Scan(&active); err != nil {
			message(w, http.StatusForbidden, "The selected specialist does not hold this active role in your firm roster.")
			return
		}

		projectFields, projectValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, strconv.FormatInt(projectID, 10))
				return
			}
			slog.Error("quick-assign: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(projectFields, projectValues)

		if !hireMatches(viewer, project, viewer.role) {
			message(w, http.StatusForbidden, "Unauthorized. You must be the hired lead professional on this project.")
			return
		}

		var openID int64
		var openTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes
			WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).
			Scan(&openID, &openTitle); err == nil {
			message(w, http.StatusUnprocessableEntity,
				"Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		var existing int64
		if err := pool.QueryRow(ctx, `SELECT id FROM project_addendums
			WHERE project_id = $1 AND assigned_user_id = $2 AND specialist_type = $3
			  AND status IN ('pending_approval', 'approved') LIMIT 1`,
			projectID, memberID, subRole).Scan(&existing); err == nil {
			message(w, http.StatusConflict, "An assignment proposal for this specialist and capability is already pending or active on this project.")
			return
		}

		if subRole == "structural" && intPtrDeref(project["structural_id"]) != 0 {
			message(w, http.StatusConflict, "Structural Engineer is already assigned to this project.")
			return
		}
		if subRole == "mep" && intPtrDeref(project["mep_id"]) != 0 {
			message(w, http.StatusConflict, "MEP Engineer is already assigned to this project.")
			return
		}

		title := "Specialist Assignment: " + strings.ToUpper(strings.ReplaceAll(subRole, "_", " "))
		descriptionText := "Assigned directly from firm roster."
		if descriptionSet {
			descriptionText = description
		}

		var addendumID int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_addendums
			(project_id, role_type, user_id, title, amount, description, type,
			 assigned_user_id, specialist_type, status, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5::numeric, $6, 'specialist_assignment', $7, $8, 'pending_approval',
			 date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`,
			projectID, viewer.role, viewer.id, title, rate, descriptionText,
			memberID, subRole).Scan(&addendumID); err != nil {
			slog.Error("quick-assign: insert", "error", err)
			serverError(w)
			return
		}

		// The created model echoes the PAYLOAD order, then updated_at BEFORE
		// created_at (Eloquent stamps updated first), with `amount` cast to a
		// decimal string.
		entry := jsonphp.NewObject()
		entry.Set("project_id", projectID)
		entry.Set("role_type", viewer.role)
		entry.Set("user_id", viewer.id)
		entry.Set("title", title)
		if parsed, err := strconv.ParseFloat(rate, 64); err == nil {
			entry.Set("amount", strconv.FormatFloat(parsed, 'f', 2, 64))
		} else {
			entry.Set("amount", rate)
		}
		entry.Set("description", descriptionText)
		entry.Set("type", "specialist_assignment")
		entry.Set("assigned_user_id", memberID)
		entry.Set("specialist_type", subRole)
		entry.Set("status", "pending_approval")
		var updatedAt, createdAt any
		_ = pool.QueryRow(ctx, `SELECT updated_at, created_at FROM project_addendums WHERE id = $1`,
			addendumID).Scan(&updatedAt, &createdAt)
		entry.Set("updated_at", projectTimeValue(updatedAt))
		entry.Set("created_at", projectTimeValue(createdAt))
		entry.Set("id", addendumID)

		payload := jsonphp.NewObject()
		payload.Set("message", "Specialist assignment proposal submitted to project owner.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusCreated, payload)
	}
}
