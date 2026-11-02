package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SINGLE READS — the brief share link, the subspecialty lookup, my-bids and
// the hire history.
//
// All four are read-only. The brief is UNAUTHENTICATED and maps comments to
// an explicit safe shape (a raw User would leak the commenter's email), which
// is the only endpoint here that is not a straight model walk.

// PublicBriefHandler serves `GET /api/brief/{token}`.
//
// The share token is the credential, so the project is looked up by
// `share_token` rather than by id, and a missing token answers 404 with the
// controller's own sentence — NOT the route-binding message.
//
// `construction_details` loses its `rab` key on the way out (the client-facing
// brief must never expose the budget breakdown). PostgreSQL's `-` operator
// removes the key and returns the remaining document with jsonb's sorted key
// order — the same order MySQL's JSON column encodes.
func PublicBriefHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		token := r.PathValue("token")

		var (
			projectID  int64
			title      string
			location   *string
			city       *string
			details    *string
			lockedAt   any
		)

		err := pool.QueryRow(ctx, `SELECT id, title, lokasi, city,
			(construction_details - 'rab')::text, construction_locked_at
			FROM projects WHERE share_token = $1 LIMIT 1`, token).Scan(
			&projectID, &title, &location, &city, &details, &lockedAt)
		if err != nil {
			if isNoRows(err) {
				message(w, http.StatusNotFound, "Brief not found or link has been revoked.")
				return
			}
			slog.Error("brief: project", "error", err)
			serverError(w)
			return
		}

		// `$project->construction_details ?? []` — a null column renders as the
		// empty PHP array, which json_encode emits as `[]`.
		detailsValue := any([]any{})
		if details != nil && *details != "" {
			detailsValue = decodeJSONValue(*details)
		}

		milestones, err := briefMilestones(ctx, pool, projectID)
		if err != nil {
			slog.Error("brief: milestones", "error", err)
			serverError(w)
			return
		}

		requirements, err := briefRequirements(ctx, pool, projectID)
		if err != nil {
			slog.Error("brief: requirements", "error", err)
			serverError(w)
			return
		}

		comments, err := briefComments(ctx, pool, projectID)
		if err != nil {
			slog.Error("brief: comments", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("title", title)
		payload.Set("location", nullableString(location))
		payload.Set("city", nullableString(city))
		payload.Set("construction_details", detailsValue)
		payload.Set("construction_locked_at", projectTimeValue(lockedAt))
		payload.Set("milestones", milestones)
		payload.Set("requirements", requirements)
		payload.Set("comments", comments)

		writeJSON(w, http.StatusOK, payload)
	}
}

// briefMilestones lists `$project->milestones()->orderBy('sort_order')->get()`
// — plain models, so the columns in table order with their casts and NO
// relations (the brief does not load them).
func briefMilestones(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT * FROM project_milestones
		WHERE project_id = $1 ORDER BY sort_order ASC, id ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		fields := fieldNames(rows)
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		entry := jsonphp.NewObject()
		for i, column := range fields {
			value := values[i]
			switch column {
			case "sort_order":
				entry.Set(column, intOrNilBid(map[string]any{column: value}, column))
			case "is_completed":
				entry.Set(column, boolOrFalse(value))
			case "content":
				entry.Set(column, jsonOrNil(value))
			case "start_date", "due_date", "lead_pro_verified_at", "pm_verified_at", "created_at", "updated_at":
				entry.Set(column, projectTimeValue(value))
			default:
				entry.Set(column, projectRawValue(value))
			}
		}
		list = append(list, entry)
	}

	return list, rows.Err()
}

// briefRequirements lists `$project->requirements()->orderBy('name')->get()`:
// plain models with the decimal casts and the `image_url` append — no `user`
// and no `folder` relation (the brief loads neither).
func briefRequirements(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT * FROM project_requirements
		WHERE project_id = $1 ORDER BY name ASC, id ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		fields := fieldNames(rows)
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		byName := map[string]any{}
		for i, column := range fields {
			byName[column] = values[i]
		}
		entry := jsonphp.NewObject()
		for _, column := range fields {
			switch {
			case briefRequirementDecimals[column]:
				entry.Set(column, decimalOrNilBid(byName, column))
			case column == "created_at" || column == "updated_at":
				entry.Set(column, projectTimeValue(byName[column]))
			default:
				entry.Set(column, projectRawValue(byName[column]))
			}
		}
		entry.Set("image_url", requirementImageURL(ctx, byName["image_path"]))
		list = append(list, entry)
	}

	return list, rows.Err()
}

// briefRequirementDecimals is ProjectRequirement's decimal:2 cast list.
var briefRequirementDecimals = map[string]bool{
	"quantity_required": true, "estimated_unit_cost": true,
	"quantity_procured_externally": true, "external_cost": true,
	"quantity_on_site": true, "quantity_used": true,
}

// briefComments lists the top-level Q&A with the SAFE shape: only the
// commenter's name, never the User model.
func briefComments(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, user_id, message, created_at
		FROM project_comments WHERE project_id = $1 AND parent_id IS NULL
		ORDER BY created_at ASC, id ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		var (
			id, userID int64
			message    string
			createdAt  any
		)
		if err := rows.Scan(&id, &userID, &message, &createdAt); err != nil {
			return nil, err
		}

		replies, err := briefReplies(ctx, pool, id)
		if err != nil {
			return nil, err
		}

		entry := jsonphp.NewObject()
		entry.Set("id", id)
		entry.Set("message", message)
		entry.Set("created_at", briefISO(createdAt))
		entry.Set("user", briefCommentUser(ctx, pool, userID))
		entry.Set("replies", replies)
		list = append(list, entry)
	}

	return list, rows.Err()
}

// briefReplies lists a comment's direct replies with the same safe shape.
func briefReplies(ctx context.Context, pool *pgxpool.Pool, parentID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, user_id, message, created_at
		FROM project_comments WHERE parent_id = $1 ORDER BY id ASC`, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		var (
			id, userID int64
			message    string
			createdAt  any
		)
		if err := rows.Scan(&id, &userID, &message, &createdAt); err != nil {
			return nil, err
		}
		entry := jsonphp.NewObject()
		entry.Set("id", id)
		entry.Set("message", message)
		entry.Set("created_at", briefISO(createdAt))
		entry.Set("user", briefCommentUser(ctx, pool, userID))
		list = append(list, entry)
	}

	return list, rows.Err()
}

// briefCommentUser is `['name' => $c->user?->name ?? 'User']`.
func briefCommentUser(ctx context.Context, pool *pgxpool.Pool, userID int64) *jsonphp.Object {
	name := "User"
	var found string
	if err := pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, userID).Scan(&found); err == nil {
		name = found
	}
	entry := jsonphp.NewObject()
	entry.Set("name", name)
	return entry
}

// briefISO is Carbon's `toIso8601String()` — the brief's comments use it,
// unlike every other timestamp on this endpoint.
func briefISO(value any) any {
	stamp, ok := value.(time.Time)
	if !ok {
		return nil
	}
	return iso8601Second(&stamp)
}

// ContractorSubspecialtiesHandler serves `GET /api/contractor-subspecialties`.
//
// The oracle caches the list forever, but the payload is the same table read:
// category then label.
func ContractorSubspecialtiesHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		rows, err := pool.Query(ctx, `SELECT * FROM contractor_subspecialties
			ORDER BY category ASC, label ASC`)
		if err != nil {
			slog.Error("subspecialties: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		list := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("subspecialties: scan", "error", err)
				serverError(w)
				return
			}
			entry := jsonphp.NewObject()
			for i, column := range fields {
				if column == "created_at" || column == "updated_at" {
					entry.Set(column, projectTimeValue(values[i]))
				} else {
					entry.Set(column, projectRawValue(values[i]))
				}
			}
			list = append(list, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", list)
		writeJSON(w, http.StatusOK, payload)
	}
}

// myBidRole is one role's profile lookup. Bids live in the unified `bids`
// table, discriminated by role (ADR-0014), so only the profile side differs.
type myBidRole struct {
	profileTable string
	profileID    string // the unified table's profile column
}

var myBidRoles = map[string]myBidRole{
	"arsitek":         {"arsiteks", "arsitek_id"},
	"kontraktor":      {"kontraktors", "kontraktor_id"},
	"notaris":         {"notaris_profiles", "notaris_id"},
	"interior":        {"interior_profiles", "interior_id"},
	"project_manager": {"project_managers", "pm_id"},
	"structural":      {"structural_engineers", "structural_id"},
	"mep":             {"mep_engineers", "mep_id"},
}

// MyBidsHandler serves `GET /api/my-bids`.
//
// The role decides the table; a user whose role has no profile row (or a role
// with no bid table at all) gets `{"data": []}` rather than a 403.
//
// Key order matters: `$bid->toArray()` emits every table column, then the
// LOADED `project` relation, and only then the appended `role_type`. The
// project is replaced by the lightweight `{id,title,status}` card but keeps
// the relation's position.
func MyBidsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		role, known := myBidRoles[caller.RoleType()]
		empty := func() {
			payload := jsonphp.NewObject()
			payload.Set("data", []any{})
			writeJSON(w, http.StatusOK, payload)
		}
		if !known {
			empty()
			return
		}

		var profileID int64
		err := pool.QueryRow(ctx, `SELECT id FROM `+role.profileTable+` WHERE user_id = $1 LIMIT 1`,
			caller.UserID()).Scan(&profileID)
		if err != nil {
			if isNoRows(err) {
				empty()
				return
			}
			slog.Error("my-bids: profile", "error", err)
			serverError(w)
			return
		}

		rows, err := pool.Query(ctx, `SELECT * FROM bids
			WHERE role::text = $1 AND `+role.profileID+` = $2
			ORDER BY created_at DESC, id ASC`, caller.RoleType(), profileID)
		if err != nil {
			slog.Error("my-bids: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		list := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("my-bids: scan", "error", err)
				serverError(w)
				return
			}
			entry := rawBidObject(caller.RoleType(), fields, values)

			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry.Set("project", myBidProject(ctx, pool, intPtrOf(byName["project_id"])))
			entry.Set("role_type", caller.RoleType())
			list = append(list, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", list)
		writeJSON(w, http.StatusOK, payload)
	}
}

// myBidProject is the lightweight project card, or null.
func myBidProject(ctx context.Context, pool *pgxpool.Pool, projectID *int64) any {
	if projectID == nil {
		return nil
	}
	var (
		id     int64
		title  string
		status string
	)
	if err := pool.QueryRow(ctx, `SELECT id, title, status::text FROM projects WHERE id = $1`,
		*projectID).Scan(&id, &title, &status); err != nil {
		return nil
	}
	entry := jsonphp.NewObject()
	entry.Set("id", id)
	entry.Set("title", title)
	entry.Set("status", status)
	return entry
}

// hireRole is one project relation in the hire-history walk.
type hireRole struct {
	relation  string // how the controller spells it
	table     string
	fk        string
	label     string
	phoneCol  string
}

var hireRoles = []hireRole{
	{"arsitek", "arsiteks", "selected_arsitek_id", "Architect", "no_telp"},
	{"kontraktor", "kontraktors", "selected_kontraktor_id", "Contractor", "no_telepon"},
	{"notaris", "notaris_profiles", "selected_notaris_id", "Notary", "no_telp"},
	{"interior", "interior_profiles", "selected_interior_id", "Interior Designer", "no_telp"},
	{"projectManager", "project_managers", "pm_id", "Project Manager", "no_telp"},
	{"structuralEngineer", "structural_engineers", "structural_id", "Structural Engineer", "no_telp"},
	{"mepEngineer", "mep_engineers", "mep_id", "MEP Engineer", "no_telp"},
}

// HireHistoryHandler serves `GET /api/hire-history`.
//
// Every project the caller owns (latest 100), then each role in the
// controller's fixed order. A project may contribute several rows; the same
// professional hired twice appears twice, on purpose.
func HireHistoryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		base := assetBaseOf(ctx)

		rows, err := pool.Query(ctx, `SELECT id, title, `+hireProjectSelect()+`
			FROM projects WHERE user_id = $1 ORDER BY created_at DESC, id ASC LIMIT 100`,
			caller.UserID())
		if err != nil {
			slog.Error("hire-history: projects", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		list := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("hire-history: scan project", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}

			title := stringOf(byName["title"])
			for _, role := range hireRoles {
				profileID := intPtrOf(byName[role.fk])
				if profileID == nil {
					continue
				}
				entry, err := hireEntry(ctx, pool, role, *profileID, title, base)
				if err != nil {
					slog.Error("hire-history: entry", "error", err)
					serverError(w)
					return
				}
				if entry != nil {
					list = append(list, entry)
				}
			}
		}

		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("data", list)
		writeJSON(w, http.StatusOK, payload)
	}
}

// hireProjectSelect lists the seven selected-profile columns.
func hireProjectSelect() string {
	columns := make([]string, 0, len(hireRoles))
	for _, role := range hireRoles {
		columns = append(columns, role.fk)
	}
	return strings.Join(columns, ", ")
}

// hireEntry builds one hired-professional row.
func hireEntry(ctx context.Context, pool *pgxpool.Pool, role hireRole,
	profileID int64, projectTitle, base string) (*jsonphp.Object, error) {
	var (
		userID    *int64
		name      *string
		phone     *string
		foto      *string
		createdAt any
	)

	query := `SELECT user_id, nama, ` + role.phoneCol + `, foto, created_at
		FROM ` + role.table + ` WHERE id = $1`
	err := pool.QueryRow(ctx, query, profileID).Scan(&userID, &name, &phone, &foto, &createdAt)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	if userID == nil {
		return nil, nil
	}

	var userName string
	var userPic *string
	if err := pool.QueryRow(ctx, `SELECT name, pic FROM users WHERE id = $1`, *userID).
		Scan(&userName, &userPic); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	displayName := userName
	if name != nil {
		displayName = *name
	}

	if phone == nil || *phone == "" {
		var contact string
		if err := pool.QueryRow(ctx, `SELECT contact FROM phone_user WHERE id_user = $1
			ORDER BY id ASC LIMIT 1`, *userID).Scan(&contact); err == nil {
			phone = &contact
		}
	}

	var avatar any
	if foto != nil && *foto != "" {
		avatar = base + "/storage/" + strings.TrimPrefix(*foto, "/")
	} else if userPic != nil && *userPic != "" {
		avatar = base + "/storage/" + strings.TrimPrefix(*userPic, "/")
	}

	entry := jsonphp.NewObject()
	entry.Set("id", profileID)
	entry.Set("user_id", *userID)
	entry.Set("name", displayName)
	entry.Set("role", role.label)
	entry.Set("project_title", projectTitle)
	entry.Set("phone", nullableString(phone))
	entry.Set("avatar", avatar)
	entry.Set("hired_at", projectTimeValue(createdAt))
	return entry, nil
}
