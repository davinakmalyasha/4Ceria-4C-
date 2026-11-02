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

// TEAM MEMBERS — the lightweight, account-less roster a professional keeps.
//
//   - GET answers the caller's ACTIVE rows (ordered created_at DESC) for the
//     seven roles that may manage a team; anyone else gets {"data":[]};
//   - POST is limited to the five professional roles (403 otherwise) and
//     answers 201 with `{"data": member, "message": "Team member added."}`;
//   - PUT/DELETE operate on a row OWNED by the caller (a foreign id is 404).
//
// `photo_url` is an APPEND: `/storage/<path>` (relative — NOT asset()), and
// the model carries it on every serialization, after the attributes.
// `skills` is an `array` cast (JSON).

// teamMemberColumns is the `team_members` table order.
var teamMemberColumns = []string{
	"id", "owner_user_id", "owner_role", "name", "photo_path", "role_title",
	"bio", "skills", "phone", "email", "status", "created_at", "updated_at",
}

// teamMemberSelectList casts the JSON column to text so its key order survives.
func teamMemberSelectList() string {
	parts := make([]string, 0, len(teamMemberColumns))
	for _, column := range teamMemberColumns {
		if column == "skills" {
			parts = append(parts, "skills::text AS skills")
			continue
		}
		parts = append(parts, column)
	}
	return strings.Join(parts, ", ")
}

// teamMemberPhotoURL is the `photo_url` accessor.
func teamMemberPhotoURL(value any) any {
	path, ok := value.(string)
	if !ok || path == "" {
		return nil
	}
	if strings.HasPrefix(path, "http") {
		return path
	}
	return "/storage/" + path
}

// teamMemberSkills renders the array cast.
func teamMemberSkills(value any) any {
	if value == nil {
		return nil
	}
	return orderedJSONColumn(value)
}

// teamMemberObject renders a hydrated row: table order, then the append.
func teamMemberObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range teamMemberColumns {
		switch column {
		case "skills":
			entry.Set(column, teamMemberSkills(byName[column]))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	entry.Set("photo_url", teamMemberPhotoURL(byName["photo_path"]))
	return entry
}

// teamMemberCreatedObject renders Eloquent's CREATED model: payload order,
// then updated_at BEFORE created_at, then id, then the append.
func teamMemberCreatedObject(byName map[string]any, payloadKeys []string) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range payloadKeys {
		switch column {
		case "skills":
			entry.Set(column, teamMemberSkills(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	entry.Set("photo_url", teamMemberPhotoURL(byName["photo_path"]))
	return entry
}

// teamMemberRow reads one row.
func teamMemberRow(ctx context.Context, pool *pgxpool.Pool, memberID, ownerID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+teamMemberSelectList()+`
		FROM team_members WHERE id = $1 AND owner_user_id = $2`, memberID, ownerID)
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

// teamMemberInput is the validated payload.
type teamMemberInput struct {
	name      string
	roleTitle string
	bio       any
	skills    any
	skillsRaw any
	phone     any
	email     any
	photo     *galleryUpload
}

// validateTeamMember applies the store/update rules.
func validateTeamMember(r *http.Request, fields map[string]any, failures *errorBag) teamMemberInput {
	var in teamMemberInput

	in.name, _ = houseField(fields, "name", true, 255, false, nil, 0, failures)
	in.roleTitle, _ = houseField(fields, "role_title", true, 100, false, nil, 0, failures)

	if raw, present := fields["bio"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("bio", "The bio field must be a string.")
		} else if len([]rune(text)) > 1000 {
			failures.add("bio", "The bio field must not be greater than 1000 characters.")
		} else {
			in.bio = text
		}
	}

	if raw, present := fields["skills"]; present {
		if raw == nil {
			in.skills = nil
		} else if list, ok := raw.([]any); !ok {
			failures.add("skills", "The skills field must be an array.")
		} else {
			normalised := make([]any, 0, len(list))
			for index, item := range list {
				key := "skills." + strconv.Itoa(index)
				text, ok := item.(string)
				if !ok {
					failures.add(key, "The "+key+" field must be a string.")
					continue
				}
				if len([]rune(text)) > 50 {
					failures.add(key, "The "+key+" field must not be greater than 50 characters.")
					continue
				}
				normalised = append(normalised, text)
			}
			in.skills = normalised
		}
	}

	if raw, present := fields["phone"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("phone", "The phone field must be a string.")
		} else if len([]rune(text)) > 20 {
			failures.add("phone", "The phone field must not be greater than 20 characters.")
		} else {
			in.phone = text
		}
	}

	if raw, present := fields["email"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("email", "The email field must be a valid email address.")
		} else if len([]rune(text)) > 255 {
			failures.add("email", "The email field must not be greater than 255 characters.")
		} else if !validEmail(text) {
			failures.add("email", "The email field must be a valid email address.")
		} else {
			in.email = text
		}
	}

	photos := requestFilesNamed(r, "photo")
	if len(photos) > 0 {
		in.photo = photos[0]
		houseImageFailures(photos[0], "photo", failures)
		if photos[0].sizeBytes() > 2048*1024 {
			failures.add("photo", "The photo field must not be greater than 2048 kilobytes.")
		}
	}
	return in
}

// teamMemberPayloadKeys is the create() payload order.
var teamMemberPayloadKeys = []string{
	"owner_user_id", "owner_role", "name", "photo_path", "role_title",
	"bio", "skills", "phone", "email",
}

// TeamMembersIndexHandler serves `GET /api/team-members`.
func TeamMembersIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		payload := jsonphp.NewObject()
		allowed := false
		for _, role := range []string{"arsitek", "kontraktor", "structural", "mep",
			"interior", "project_manager", "admin"} {
			if caller.RoleType() == role {
				allowed = true
				break
			}
		}
		if !allowed {
			payload.Set("data", []any{})
			writeJSON(w, http.StatusOK, payload)
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+teamMemberSelectList()+`
			FROM team_members WHERE owner_user_id = $1 AND status = 'active'
			ORDER BY created_at DESC, id ASC`, caller.UserID())
		if err != nil {
			slog.Error("team members: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			names := fieldNames(rows)
			values, err := scanRow(rows, len(names))
			if err != nil {
				slog.Error("team members: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range names {
				byName[column] = values[i]
			}
			out = append(out, teamMemberObject(byName))
		}

		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreTeamMemberHandler serves `POST /api/team-members`.
func StoreTeamMemberHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		allowed := false
		for _, role := range []string{"arsitek", "kontraktor", "structural", "mep", "interior"} {
			if caller.RoleType() == role {
				allowed = true
				break
			}
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized role for team management.")
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
		input := validateTeamMember(r, fields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var photoPath any
		if input.photo != nil {
			stored, err := storeVaultFile("team-members", input.photo.filename, input.photo.data)
			if err != nil {
				slog.Error("team member store: photo", "error", err)
				serverError(w)
				return
			}
			photoPath = stored
		}

		var skillsArg any
		if input.skills != nil {
			encoded, err := jsonphp.Marshal(input.skills)
			if err != nil {
				serverError(w)
				return
			}
			skillsArg = string(encoded)
		}

		var id int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO team_members
			(owner_user_id, owner_role, name, photo_path, role_title, bio, skills,
			 phone, email, status, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'active',
			 date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			caller.UserID(), caller.RoleType(), input.name, photoPath, input.roleTitle,
			input.bio, skillsArg, input.phone, input.email).Scan(&id, &createdAt, &updatedAt); err != nil {
			slog.Error("team member store: insert", "error", err)
			serverError(w)
			return
		}

		created := map[string]any{
			"id": id, "owner_user_id": caller.UserID(), "owner_role": caller.RoleType(),
			"name": input.name, "photo_path": photoPath, "role_title": input.roleTitle,
			"bio": input.bio, "skills": input.skills, "phone": input.phone,
			"email": input.email, "created_at": createdAt, "updated_at": updatedAt,
		}

		payload := jsonphp.NewObject()
		payload.Set("data", teamMemberCreatedObject(created, teamMemberPayloadKeys))
		payload.Set("message", "Team member added.")
		writeJSON(w, http.StatusCreated, payload)
	}
}

// UpdateTeamMemberHandler serves `PUT /api/team-members/{id}`.
func UpdateTeamMemberHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("id")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		memberID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\TeamMember`, raw)
			return
		}

		current, found, err := teamMemberRow(ctx, pool, memberID, caller.UserID())
		if err != nil {
			slog.Error("team member update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\TeamMember`, raw)
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
		input := validateTeamMember(r, fields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		photoPath := current["photo_path"]
		if input.photo != nil {
			if old, ok := photoPath.(string); ok && old != "" {
				_ = removeVaultFile(old)
			}
			stored, err := storeVaultFile("team-members", input.photo.filename, input.photo.data)
			if err != nil {
				slog.Error("team member update: photo", "error", err)
				serverError(w)
				return
			}
			photoPath = stored
		}

		sets := []string{"name = $2", "role_title = $3"}
		args := []any{memberID, input.name, input.roleTitle}
		for _, pair := range []struct {
			column string
			value  any
			set    bool
		}{
			{"bio", input.bio, presentIn(fields, "bio")},
			{"phone", input.phone, presentIn(fields, "phone")},
			{"email", input.email, presentIn(fields, "email")},
		} {
			if !pair.set {
				continue
			}
			args = append(args, pair.value)
			sets = append(sets, pair.column+" = $"+strconv.Itoa(len(args)))
		}
		if presentIn(fields, "skills") {
			var skillsArg any
			if input.skills != nil {
				encoded, err := jsonphp.Marshal(input.skills)
				if err != nil {
					serverError(w)
					return
				}
				skillsArg = string(encoded)
			}
			args = append(args, skillsArg)
			sets = append(sets, "skills = $"+strconv.Itoa(len(args))+"::jsonb")
		}
		if input.photo != nil {
			args = append(args, photoPath)
			sets = append(sets, "photo_path = $"+strconv.Itoa(len(args)))
		}
		sets = append(sets, "updated_at = date_trunc('second', now())")

		if _, err := pool.Exec(ctx, `UPDATE team_members SET `+strings.Join(sets, ", ")+
			` WHERE id = $1`, args...); err != nil {
			slog.Error("team member update: exec", "error", err)
			serverError(w)
			return
		}

		fresh, _, err := teamMemberRow(ctx, pool, memberID, caller.UserID())
		if err != nil {
			slog.Error("team member update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", teamMemberObject(fresh))
		payload.Set("message", "Team member updated.")
		writeJSON(w, http.StatusOK, payload)
	}
}

// presentIn reports whether a form key was supplied (even as null).
func presentIn(fields map[string]any, key string) bool {
	_, present := fields[key]
	return present
}

// DestroyTeamMemberHandler serves `DELETE /api/team-members/{id}`.
func DestroyTeamMemberHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("id")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		memberID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\TeamMember`, raw)
			return
		}

		if _, found, err := teamMemberRow(ctx, pool, memberID, caller.UserID()); err != nil {
			slog.Error("team member destroy: load", "error", err)
			serverError(w)
			return
		} else if !found {
			modelNotFound(w, `App\Models\TeamMember`, raw)
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE team_members SET status = 'inactive',
			updated_at = date_trunc('second', now()) WHERE id = $1`, memberID); err != nil {
			slog.Error("team member destroy: update", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Team member removed.")
	}
}
