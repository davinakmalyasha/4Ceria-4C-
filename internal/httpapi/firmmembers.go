package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// FIRM MEMBERS — the account-linked professional roster.
//
// Shapes are Eloquent models over `firm_members` (datetime casts), with a
// `member` relation whose selected columns are `id,name,unique_code,role_type,pic`
// and whose profile relations are ALL loaded (null when absent). `pic` is
// rewritten to `asset('storage/'+pic)` unless it is already an absolute URL.
//
// Gate notes: `search` and `invite` are FormRequests whose `authorize()`
// refuses non-arsitek/kontraktor with Laravel's generic 403, BEFORE any
// validation. `roster` answers `{"data":[]}` for other roles instead.

// firmMemberColumns is the `firm_members` table order.
var firmMemberColumns = []string{
	"id", "firm_owner_id", "member_user_id", "role_in_firm", "status",
	"invited_at", "accepted_at", "requested_at", "created_at", "updated_at",
}

// firmMemberObject renders a firm_members row in table order.
func firmMemberObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range firmMemberColumns {
		switch column {
		case "invited_at", "accepted_at", "requested_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	return entry
}

// firmMemberCreatedObject renders Eloquent's CREATED model: the payload
// keys in the order they were passed to create(), then updated_at BEFORE
// created_at (Eloquent stamps updated first), then the id. Columns that were
// never set (e.g. accepted_at on an invite) are ABSENT, not null.
func firmMemberCreatedObject(byName map[string]any, payloadKeys []string) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range payloadKeys {
		switch column {
		case "invited_at", "accepted_at", "requested_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// firmMemberRow reads one firm_members row.
func firmMemberRow(ctx context.Context, pool *pgxpool.Pool, id int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(firmMemberColumns, ", ")+`
		FROM firm_members WHERE id = $1`, id)
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

// firmMemberIDFromPath reads the {firmMember} segment.
func firmMemberIDFromPath(r *http.Request, suffix string) (int64, string, bool) {
	raw := r.PathValue("firmMember")
	if raw == "" {
		trimmed := r.URL.Path
		if suffix != "" {
			trimmed = strings.TrimSuffix(trimmed, "/"+suffix)
		}
		raw = lastPathSegment(trimmed)
	}
	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || raw == "" {
		return 0, raw, false
	}
	return parsed, raw, true
}

// firmTargetRoles is getTargetRoles().
func firmTargetRoles(role string) []string {
	switch role {
	case "arsitek":
		return []string{"structural", "mep", "interior"}
	case "kontraktor":
		return []string{"civil", "mechanical", "electrical", "plumbing", "roofing", "finishing"}
	}
	return nil
}

// firmAssetURL rewrites a stored path to its public URL, leaving absolute
// URLs (and nulls) alone.
func firmAssetURL(ctx context.Context, value any) any {
	text, ok := value.(string)
	if !ok || text == "" {
		return nil
	}
	if strings.HasPrefix(text, "http") {
		return text
	}
	return assetBaseOf(ctx) + "/storage/" + text
}

// firmUserCard renders the selected user columns of search/suggestions.
func firmUserCard(ctx context.Context, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("id", projectRawValue(byName["id"]))
	entry.Set("name", projectRawValue(byName["name"]))
	// `unique_code` is in User:: (PII): Eloquent drops it.
	entry.Set("role_type", projectRawValue(byName["role_type"]))
	entry.Set("pic", firmAssetURL(ctx, byName["pic"]))
	return entry
}

// firmMembersAuthorize is the FormRequest's authorize(): only firm owners may
// search and invite.
func firmMembersAuthorize(w http.ResponseWriter, viewer *projectViewer) bool {
	if viewer.role != "arsitek" && viewer.role != "kontraktor" {
		message(w, http.StatusForbidden, "This action is unauthorized.")
		return false
	}
	return true
}

// FirmMembersSearchHandler serves `POST /api/firm-members/search`.
func FirmMembersSearchHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("firm search: viewer", "error", err)
			serverError(w)
			return
		}
		if !firmMembersAuthorize(w, viewer) {
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		query := ""
		if raw, present := fields["query"]; !present || raw == nil {
			failures.add("query", "The query field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("query", "The query field must be a string.")
		} else if len([]rune(text)) < 2 {
			failures.add("query", "The query field must be at least 2 characters.")
		} else if len([]rune(text)) > 50 {
			failures.add("query", "The query field must not be greater than 50 characters.")
		} else {
			query = text
		}
		direction := "ASC"
		if raw, present := fields["sort"]; present && raw != nil {
			text, ok := raw.(string)
			if !ok || (text != "a-z" && text != "z-a") {
				failures.add("sort", "The selected sort is invalid.")
			} else if text == "z-a" {
				direction = "DESC"
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		roles := firmTargetRoles(viewer.role)
		rows, err := pool.Query(ctx, `
			SELECT id, name, unique_code, role_type::text, pic
			  FROM users
			 WHERE role_type::text = ANY($1)
			   AND id <> $2
			   AND (unique_code = $3 OR name ILIKE $4)
			 ORDER BY name `+direction+`, id ASC
			 LIMIT 20`,
			roles, viewer.id, strings.ToUpper(query), "%"+query+"%")
		if err != nil {
			slog.Error("firm search: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			names := fieldNames(rows)
			values, err := scanRow(rows, len(names))
			if err != nil {
				slog.Error("firm search: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range names {
				byName[column] = values[i]
			}
			out = append(out, firmUserCard(ctx, byName))
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// FirmMembersSuggestionsHandler serves `GET /api/firm-members/suggestions`.
func FirmMembersSuggestionsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("firm suggestions: viewer", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		if viewer.role != "arsitek" && viewer.role != "kontraktor" {
			payload.Set("data", []any{})
			writeJSON(w, http.StatusOK, payload)
			return
		}

		roles := firmTargetRoles(viewer.role)
		rows, err := pool.Query(ctx, `
			SELECT id, name, unique_code, role_type::text, pic
			  FROM users
			 WHERE role_type::text = ANY($1)
			   AND id <> $2
			   AND id NOT IN (
			       SELECT member_user_id FROM firm_members
			        WHERE firm_owner_id = $2
			          AND status IN ('invited', 'active', 'requested'))
			 ORDER BY created_at DESC, id ASC
			 LIMIT 10`, roles, viewer.id)
		if err != nil {
			slog.Error("firm suggestions: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			names := fieldNames(rows)
			values, err := scanRow(rows, len(names))
			if err != nil {
				slog.Error("firm suggestions: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range names {
				byName[column] = values[i]
			}
			out = append(out, firmUserCard(ctx, byName))
		}

		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// firmInviteRoles is the role allow-list for an invite.
func firmInviteRoles(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer) []string {
	if viewer.role == "arsitek" {
		return []string{"structural", "mep", "interior"}
	}
	rows, err := pool.Query(ctx, `SELECT slug FROM contractor_subspecialties ORDER BY id`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err == nil {
			out = append(out, slug)
		}
	}
	return out
}

// FirmMembersInviteHandler serves `POST /api/firm-members/invite`.
func FirmMembersInviteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("firm invite: viewer", "error", err)
			serverError(w)
			return
		}
		if !firmMembersAuthorize(w, viewer) {
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		var memberID int64
		if raw, present := fields["member_user_id"]; !present || raw == nil {
			failures.add("member_user_id", "The member user id field is required.")
		} else if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if err != nil || !existsID(ctx, pool, "users", parsed) {
				failures.add("member_user_id", "The selected member user id is invalid.")
			} else {
				memberID = parsed
			}
		} else {
			failures.add("member_user_id", "The selected member user id is invalid.")
		}

		validRoles := firmInviteRoles(ctx, pool, viewer)
		roles := make([]string, 0)
		if raw, present := fields["roles_in_firm"]; !present || raw == nil {
			failures.add("roles_in_firm", "The roles in firm field is required.")
		} else if list, ok := raw.([]any); !ok {
			failures.add("roles_in_firm", "The roles in firm field must be an array.")
		} else {
			if len(list) < 1 {
				failures.add("roles_in_firm", "The roles in firm field must have at least 1 items.")
			}
			for index, item := range list {
				key := "roles_in_firm." + strconv.Itoa(index)
				text, ok := item.(string)
				if !ok {
					failures.add(key, "The "+key+" field must be a string.")
					continue
				}
				if len([]rune(text)) > 50 {
					failures.add(key, "The "+key+" field must not be greater than 50 characters.")
					continue
				}
				valid := false
				for _, candidate := range validRoles {
					if candidate == text {
						valid = true
						break
					}
				}
				if !valid {
					failures.add(key, "The selected "+key+" is invalid.")
					continue
				}
				roles = append(roles, text)
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		created := make([]map[string]any, 0)
		for _, role := range roles {
			var existing int64
			err := pool.QueryRow(ctx, `SELECT id FROM firm_members
				WHERE firm_owner_id = $1 AND member_user_id = $2 AND role_in_firm = $3
				  AND status IN ('invited', 'active', 'requested') LIMIT 1`,
				viewer.id, memberID, role).Scan(&existing)
			if err == nil {
				continue
			}
			var newID int64
			if err := pool.QueryRow(ctx, `INSERT INTO firm_members
				(firm_owner_id, member_user_id, role_in_firm, status, invited_at, created_at, updated_at)
				VALUES ($1, $2, $3, 'invited', date_trunc('second', now()),
				 date_trunc('second', now()), date_trunc('second', now()))
				RETURNING id`, viewer.id, memberID, role).Scan(&newID); err != nil {
				slog.Error("firm invite: insert", "error", err)
				serverError(w)
				return
			}
			row, _, err := firmMemberRow(ctx, pool, newID)
			if err != nil {
				slog.Error("firm invite: reload", "error", err)
				serverError(w)
				return
			}
			created = append(created, row)
		}

		if len(created) == 0 {
			message(w, http.StatusConflict, "This professional already holds the selected role(s) in your firm.")
			return
		}

		var memberName string
		if err := pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, memberID).Scan(&memberName); err != nil {
			memberName = ""
		}

		items := make([]any, 0, len(created))
		for index, row := range created {
			entry := firmMemberCreatedObject(row, []string{
				"firm_owner_id", "member_user_id", "role_in_firm", "status", "invited_at",
			})
			if index == 0 {
				member := jsonphp.NewObject()
				var name string
				var id int64
				_ = pool.QueryRow(ctx, `SELECT id, name FROM users WHERE id = $1`, memberID).Scan(&id, &name)
				member.Set("id", id)
				member.Set("name", name)
				entry.Set("member", member)
			}
			items = append(items, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Invitations sent to "+memberName)
		payload.Set("data", items)
		writeJSON(w, http.StatusCreated, payload)
	}
}

// firmResponderGate answers "is the caller the owner or the member?".
func firmResponderGate(w http.ResponseWriter, byName map[string]any, callerID int64) (bool, bool) {
	isOwner := intPtrDeref(byName["firm_owner_id"]) == callerID
	isMember := intPtrDeref(byName["member_user_id"]) == callerID
	if !isOwner && !isMember {
		message(w, http.StatusForbidden, "Unauthorized.")
		return false, false
	}
	return isOwner, true
}

// FirmMembersRespondHandler serves
// `POST /api/firm-members/{firmMember}/respond`.
func FirmMembersRespondHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		id, raw, ok := firmMemberIDFromPath(r, "respond")
		if !ok {
			modelNotFound(w, `App\Models\FirmMember`, raw)
			return
		}
		byName, found, err := firmMemberRow(ctx, pool, id)
		if err != nil {
			slog.Error("firm respond: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\FirmMember`, raw)
			return
		}
		isOwner, allowed := firmResponderGate(w, byName, caller.UserID())
		if !allowed {
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		action := ""
		if rawAction, present := fields["action"]; !present || rawAction == nil {
			failures.add("action", "The action field is required.")
		} else if text, ok := rawAction.(string); !ok || (text != "accept" && text != "decline") {
			failures.add("action", "The selected action is invalid.")
		} else {
			action = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		if action == "accept" {
			if _, err := pool.Exec(ctx, `UPDATE firm_members SET status = 'active',
				accepted_at = date_trunc('second', now()), updated_at = date_trunc('second', now())
				WHERE id = $1`, id); err != nil {
				slog.Error("firm respond: accept", "error", err)
				serverError(w)
				return
			}
		} else {
			if _, err := pool.Exec(ctx, `UPDATE firm_members SET status = 'removed',
				updated_at = date_trunc('second', now()) WHERE id = $1`, id); err != nil {
				slog.Error("firm respond: decline", "error", err)
				serverError(w)
				return
			}
		}

		fresh, _, err := firmMemberRow(ctx, pool, id)
		if err != nil {
			slog.Error("firm respond: reload", "error", err)
			serverError(w)
			return
		}

		text := ""
		switch {
		case action == "accept" && isOwner:
			text = "Join request accepted."
		case action == "accept":
			text = "You have joined the firm."
		case isOwner:
			text = "Join request declined."
		default:
			text = "Invitation declined."
		}

		payload := jsonphp.NewObject()
		payload.Set("message", text)
		payload.Set("data", firmMemberObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// FirmMembersRequestJoinHandler serves `POST /api/firm-members/request-join`.
func FirmMembersRequestJoinHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}
		var ownerID int64
		if raw, present := fields["firm_owner_id"]; !present || raw == nil {
			failures.add("firm_owner_id", "The firm owner id field is required.")
		} else if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if err != nil || !existsID(ctx, pool, "users", parsed) {
				failures.add("firm_owner_id", "The selected firm owner id is invalid.")
			} else {
				ownerID = parsed
			}
		} else {
			failures.add("firm_owner_id", "The selected firm owner id is invalid.")
		}
		role := ""
		if raw, present := fields["role_in_firm"]; !present || raw == nil {
			failures.add("role_in_firm", "The role in firm field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("role_in_firm", "The role in firm field must be a string.")
		} else if len([]rune(text)) > 50 {
			failures.add("role_in_firm", "The role in firm field must not be greater than 50 characters.")
		} else {
			role = text
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		var existing int64
		if err := pool.QueryRow(ctx, `SELECT id FROM firm_members
			WHERE firm_owner_id = $1 AND member_user_id = $2
			  AND status IN ('invited', 'active', 'requested') LIMIT 1`,
			ownerID, caller.UserID()).Scan(&existing); err == nil {
			message(w, http.StatusConflict, "You already have a pending connection with this firm.")
			return
		}

		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO firm_members
			(firm_owner_id, member_user_id, role_in_firm, status, requested_at, created_at, updated_at)
			VALUES ($1, $2, $3, 'requested', date_trunc('second', now()),
			 date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`, ownerID, caller.UserID(), role).Scan(&id); err != nil {
			slog.Error("firm request-join: insert", "error", err)
			serverError(w)
			return
		}
		row, _, err := firmMemberRow(ctx, pool, id)
		if err != nil {
			slog.Error("firm request-join: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Join request sent successfully.")
		payload.Set("data", firmMemberCreatedObject(row, []string{
			"firm_owner_id", "member_user_id", "role_in_firm", "status", "requested_at",
		}))
		writeJSON(w, http.StatusCreated, payload)
	}
}

// firmOwnerCard renders the selected owner columns plus `no_telp`, then the
// loaded `arsitek`/`kontraktor` relations (with THEIR appends). Eloquent
// snake-cases relation keys, so the key on the member row is `firm_owner`.
func firmOwnerCard(ctx context.Context, pool *pgxpool.Pool, ownerID int64) (any, error) {
	var (
		id    int64
		name  string
		role  string
		pic   *string
		phone *string
	)
	if err := pool.QueryRow(ctx, `SELECT id, name, role_type::text, pic FROM users WHERE id = $1`,
		ownerID).Scan(&id, &name, &role, &pic); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	_ = pool.QueryRow(ctx, `SELECT COALESCE(a.no_telp, k.no_telepon)
		FROM users u
		LEFT JOIN arsiteks a ON a.user_id = u.id
		LEFT JOIN kontraktors k ON k.user_id = u.id
		WHERE u.id = $1`, ownerID).Scan(&phone)

	entry := jsonphp.NewObject()
	entry.Set("id", id)
	entry.Set("name", name)
	entry.Set("role_type", role)
	entry.Set("pic", firmAssetURL(ctx, pic))
	entry.Set("no_telp", nullableString(phone))

	profileID, profilePhone, found, err := firmNarrowProfile(ctx, pool, "arsiteks", "no_telp", ownerID)
	if err != nil {
		return nil, err
	}
	if found {
		average, count := profileRatingValue(ctx, pool, "arsiteks", profileID)
		block := jsonphp.NewObject()
		block.Set("id", profileID)
		block.Set("user_id", ownerID)
		block.Set("no_telp", nullableString(profilePhone))
		block.Set("average_rating", average)
		block.Set("review_count", count)
		entry.Set("arsitek", block)
	} else {
		entry.Set("arsitek", nil)
	}

	var kontraktorID int64
	var kontraktorPhone, kontraktorAlamat *string
	kerr := pool.QueryRow(ctx, `SELECT id, no_telepon, alamat FROM kontraktors WHERE user_id = $1 LIMIT 1`,
		ownerID).Scan(&kontraktorID, &kontraktorPhone, &kontraktorAlamat)
	if kerr == nil {
		average, count := profileRatingValue(ctx, pool, "kontraktors", kontraktorID)
		block := jsonphp.NewObject()
		// The legacy model appends `lokasi` (its accessor reads `alamat`) and
		// `no_telp` (its accessor reads `no_telepon`), so the raw `alamat`
		// column is in the payload too, in select-then-append order.
		block.Set("id", kontraktorID)
		block.Set("user_id", ownerID)
		block.Set("no_telepon", nullableString(kontraktorPhone))
		block.Set("alamat", nullableString(kontraktorAlamat))
		block.Set("average_rating", average)
		block.Set("review_count", count)
		block.Set("lokasi", nullableString(kontraktorAlamat))
		block.Set("no_telp", nullableString(kontraktorPhone))
		entry.Set("kontraktor", block)
	} else if isNoRows(kerr) {
		entry.Set("kontraktor", nil)
	} else {
		return nil, kerr
	}
	return entry, nil
}

// firmNarrowProfile reads the id and phone column of one profile relation.
func firmNarrowProfile(ctx context.Context, pool *pgxpool.Pool, table, phoneColumn string, userID int64) (int64, *string, bool, error) {
	var id int64
	var phone *string
	err := pool.QueryRow(ctx, `SELECT id, `+phoneColumn+` FROM `+table+` WHERE user_id = $1 LIMIT 1`,
		userID).Scan(&id, &phone)
	if err != nil {
		if isNoRows(err) {
			return 0, nil, false, nil
		}
		return 0, nil, false, err
	}
	return id, phone, true, nil
}

// firmMembershipList renders invitations or my-firms.
func firmMembershipList(ctx context.Context, pool *pgxpool.Pool, memberID int64, status string, orderColumn string) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(firmMemberColumns, ", ")+`
		  FROM firm_members
		 WHERE member_user_id = $1 AND status = $2
		 ORDER BY `+orderColumn+` DESC, id ASC`, memberID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		names := fieldNames(rows)
		values, err := scanRow(rows, len(names))
		if err != nil {
			return nil, err
		}
		byName := map[string]any{}
		for i, column := range names {
			byName[column] = values[i]
		}
		entry := firmMemberObject(byName)
		owner, err := firmOwnerCard(ctx, pool, intPtrDeref(byName["firm_owner_id"]))
		if err != nil {
			return nil, err
		}
		// Eloquent snake-cases relation keys.
		entry.Set("firm_owner", owner)
		out = append(out, entry)
	}
	return out, rows.Err()
}

// FirmMembersInvitationsHandler serves `GET /api/firm-members/invitations`.
func FirmMembersInvitationsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		out, err := firmMembershipList(ctx, pool, caller.UserID(), "invited", "invited_at")
		if err != nil {
			slog.Error("firm invitations: list", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// FirmMembersMyFirmsHandler serves `GET /api/firm-members/my-firms`.
func FirmMembersMyFirmsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		out, err := firmMembershipList(ctx, pool, caller.UserID(), "active", "accepted_at")
		if err != nil {
			slog.Error("firm my-firms: list", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// FirmMembersRosterHandler serves `GET /api/firm-members/roster`.
func FirmMembersRosterHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("firm roster: viewer", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		if viewer.role != "arsitek" && viewer.role != "kontraktor" {
			payload.Set("data", []any{})
			writeJSON(w, http.StatusOK, payload)
			return
		}
		out, err := firmRoster(ctx, pool, viewer.id)
		if err != nil {
			slog.Error("firm roster: list", "error", err)
			serverError(w)
			return
		}
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// FirmMembersCancelHandler serves
// `POST /api/firm-members/{firmMember}/cancel`.
func FirmMembersCancelHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		id, raw, ok := firmMemberIDFromPath(r, "cancel")
		if !ok {
			modelNotFound(w, `App\Models\FirmMember`, raw)
			return
		}
		byName, found, err := firmMemberRow(ctx, pool, id)
		if err != nil {
			slog.Error("firm cancel: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\FirmMember`, raw)
			return
		}
		if intPtrDeref(byName["firm_owner_id"]) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
		if stringOf(byName["status"]) != "invited" {
			message(w, http.StatusBadRequest, "Only pending invitations can be cancelled.")
			return
		}
		if _, err := pool.Exec(ctx, `DELETE FROM firm_members WHERE id = $1`, id); err != nil {
			slog.Error("firm cancel: delete", "error", err)
			serverError(w)
			return
		}
		message(w, http.StatusOK, "Invitation cancelled successfully.")
	}
}

// FirmMembersRemoveHandler serves `DELETE /api/firm-members/{firmMember}`.
func FirmMembersRemoveHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		id, raw, ok := firmMemberIDFromPath(r, "")
		if !ok {
			modelNotFound(w, `App\Models\FirmMember`, raw)
			return
		}
		byName, found, err := firmMemberRow(ctx, pool, id)
		if err != nil {
			slog.Error("firm remove: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\FirmMember`, raw)
			return
		}
		if intPtrDeref(byName["firm_owner_id"]) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}
		if stringOf(byName["status"]) != "active" {
			message(w, http.StatusBadRequest, "Only active members can be removed.")
			return
		}
		if _, err := pool.Exec(ctx, `UPDATE firm_members SET status = 'removed',
			updated_at = date_trunc('second', now()) WHERE id = $1`, id); err != nil {
			slog.Error("firm remove: update", "error", err)
			serverError(w)
			return
		}
		fresh, _, err := firmMemberRow(ctx, pool, id)
		if err != nil {
			slog.Error("firm remove: reload", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("message", "Member offboarded successfully.")
		payload.Set("data", firmMemberObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// FirmMembersBrowseOwnersHandler serves `GET /api/firm-members/browse-owners`.
func FirmMembersBrowseOwnersHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		queryText := r.URL.Query().Get("query")
		if len([]rune(queryText)) > 50 {
			failures := &errorBag{}
			failures.add("query", "The query field must not be greater than 50 characters.")
			failures.write(w)
			return
		}

		where := `role_type::text IN ('arsitek', 'kontraktor') AND id <> $1`
		args := []any{caller.UserID()}
		if len([]rune(queryText)) >= 2 {
			args = append(args, strings.ToUpper(strings.TrimLeft(queryText, "#")), "%"+queryText+"%")
			where += ` AND (unique_code = $2 OR name ILIKE $3)`
		} else {
			where += ` AND firm_is_hiring = true`
		}

		rows, err := pool.Query(ctx, `
			SELECT id, name, role_type::text, pic, firm_name, firm_slogan,
			       firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles::text
			  FROM users
			 WHERE `+where+`
			 ORDER BY id ASC
			 LIMIT 20`, args...)
		if err != nil {
			slog.Error("firm browse: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			var (
				id                                    int64
				name, role                            string
				pic, banner                           *string
				firmName, firmSlogan, firmDescription *string
				firmHiring                            bool
				needed                                *string
			)
			if err := rows.Scan(&id, &name, &role, &pic, &firmName, &firmSlogan,
				&banner, &firmDescription, &firmHiring, &needed); err != nil {
				slog.Error("firm browse: scan", "error", err)
				serverError(w)
				return
			}
			entry := jsonphp.NewObject()
			entry.Set("id", id)
			entry.Set("name", name)
			entry.Set("role_type", role)
			entry.Set("pic", firmAssetURL(ctx, pic))
			entry.Set("firm_name", nullableString(firmName))
			entry.Set("firm_slogan", nullableString(firmSlogan))
			entry.Set("firm_banner_path", nullableString(banner))
			entry.Set("firm_description", nullableString(firmDescription))
			entry.Set("firm_is_hiring", firmHiring)
			if needed == nil {
				entry.Set("firm_needed_roles", nil)
			} else {
				entry.Set("firm_needed_roles", orderedJSONColumn(*needed))
			}
			entry.Set("firm_banner_url", firmAssetURL(ctx, banner))

			var membership *string
			_ = pool.QueryRow(ctx, `SELECT status FROM firm_members
				WHERE firm_owner_id = $1 AND member_user_id = $2 LIMIT 1`, id, caller.UserID()).Scan(&membership)
			entry.Set("currentUserMembershipStatus", nullableString(membership))
			out = append(out, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}
