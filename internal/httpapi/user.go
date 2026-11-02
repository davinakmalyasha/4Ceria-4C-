package httpapi

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE USER SERIALISER AND THE /me SURFACE.
//
// `GET /api/me` returns `UserResource`, and `PUT /api/me` and
// `POST /api/me/professional` return it nested under `user`. The serialiser is
// therefore shared, and it is the artefact batch 1a exists to build: every S0
// endpoint that shows a user reuses it.
//
// WHAT IS REPRODUCED EXACTLY
// --------------------------
//   - The NINETEEN keys, in order. `email` and the three `bank_*` fields carry
//     values only for the owner or an admin; for anyone else they are null.
//   - `whenLoaded` OMITS the key. A relation that was not loaded is absent, not
//     null — `team_members` and `roles` differ between endpoints and roles, and
//     the object must say which.
//   - `pic` is rewritten through `asset('storage/'.$pic)`: an ABSOLUTE URL from
//     the application's base, not the stored path. `APP_URL` names the base;
//     it must match the Laravel application's, or every user with a picture
//     differs. The seed users have none, which is why the default is only the
//     repository's own `.env` value.
//   - Profile appends are COMPUTED, not stored: `average_rating` is the ratings
//     mean rounded to one decimal (0.0 with no ratings), `review_count` the
//     count, `lokasi`/`no_telp` the kontraktor's `alamat`/`no_telepon`,
//     `is_verified` the notaris check, `photo_url` the team member's rule.
//   - `decimal:2` casts encode as STRINGS with two decimals ("0.00"); plain
//     numerics encode as the stored text ("75000.00"); `float` casts encode as
//     numbers; datetimes encode as Carbon's `toJSON` (see `carbon`).
//   - A role list entry carries its `pivot` as {model_type, model_id, role_id}
//     — in THAT order, which is the order Eloquent emits, not the table's.

func assetBase() string {
	if base := os.Getenv("APP_URL"); base != "" {
		return strings.TrimRight(base, "/")
	}

	return "http://localhost:9000"
}

func assetStorage(path string) string {
	return assetBase() + "/storage/" + strings.TrimPrefix(path, "/")
}

// userRow is the user columns the resource reads.
type userRow struct {
	ID                int64
	Name              string
	Email             string
	Username          *string
	Role              string
	Pic               *string
	BankName          *string
	BankAccountNumber *string
	BankAccountName   *string
}

// loadUser fetches the resource's user columns.
func loadUser(ctx context.Context, pool *pgxpool.Pool, userID int64) (userRow, error) {
	var row userRow

	err := pool.QueryRow(ctx, `
		SELECT id, name, email, username, role_type::text, pic,
		       bank_name, bank_account_number, bank_account_name
		  FROM users
		 WHERE id = $1
	`, userID).Scan(
		&row.ID, &row.Name, &row.Email, &row.Username, &row.Role,
		&row.Pic, &row.BankName, &row.BankAccountNumber, &row.BankAccountName,
	)

	return row, err
}

func strOrNil(value *string) any {
	if value == nil || *value == "" {
		return nil
	}

	return *value
}

// jsonVal converts a pgx-scanned value to the JSON shape Eloquent produces.
//
// Numerics are selected as `::text` by the queries below, so they arrive as
// strings and stay strings — which is what Eloquent does with a decimal column
// (PDO hands it a string, and only an explicit cast changes that). `float` and
// `integer` casts arrive as float64/int and stay numbers.
func jsonVal(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		return typed
	case bool:
		return typed
	case int64:
		return typed
	case int32:
		return int64(typed)
	case int16:
		return int64(typed)
	case float64:
		return typed
	case float32:
		return float64(typed)
	case time.Time:
		return carbon(&typed)
	case []byte:
		return jsonphp.Raw(typed)
	case []any:
		// pgx decodes a jsonb array into native values for an `any` target.
		return typed
	case []string:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, item)
		}
		return items
	case map[string]any:
		return typed
	case pgtype.Numeric:
		return numericText(typed)
	default:
		return fmt.Sprintf("%v", typed)
	}
}

// numericText renders a PostgreSQL numeric exactly as Eloquent would.
//
// PDO hands a decimal column to PHP as a STRING, and `decimal:2` casts keep two
// decimals — so "0.00", never 0. A plain numeric keeps the stored text. Either
// way the value never passes through a float.
//
// The zero exception: pgx decodes an exact-zero numeric with Exp 0, dropping
// the scale PostgreSQL stores — so 0.00 arrives as {Int 0, Exp 0} and the
// digit walk below would emit "0". Eloquent, reading MySQL's decimal string,
// emits "0.00". Every decimal on the user surface is scale 2 (the supplier
// geo columns are scale 7, but an exactly-zero coordinate never reaches a
// byte-compared response), so zero renders "0.00".
func numericText(value pgtype.Numeric) any {
	if !value.Valid {
		return nil
	}

	if value.NaN {
		return nil
	}

	if value.Int == nil || value.Int.Sign() == 0 {
		return "0.00"
	}

	digits := value.Int.String()
	negative := strings.HasPrefix(digits, "-")
	digits = strings.TrimPrefix(digits, "-")

	sign := ""
	if negative {
		sign = "-"
	}

	if value.Exp >= 0 {
		return sign + digits + strings.Repeat("0", int(value.Exp))
	}

	point := len(digits) + int(value.Exp)

	var whole, fraction string

	if point > 0 {
		whole = digits[:point]
		fraction = digits[point:]
	} else {
		whole = "0"
		fraction = strings.Repeat("0", -point) + digits
	}

	return sign + whole + "." + fraction
}

// encodeRow builds an ordered object from parallel column names and values.
func encodeRow(columns []string, values []any) *jsonphp.Object {
	row := jsonphp.NewObject()

	for i, column := range columns {
		row.Set(column, jsonVal(values[i]))
	}

	return row
}

// queryRows runs a query and encodes every row with encodeRow.
func queryRows(ctx context.Context, pool *pgxpool.Pool, query string, columns []string, args ...any) ([]any, error) {
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0, 8)

	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}

		list = append(list, encodeRow(columns, values))
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}

// profileAverages returns (average_rating, review_count) for a profile.
func profileAverages(ctx context.Context, pool *pgxpool.Pool, table, fk string, id int64) (float64, int64, error) {
	var (
		average *float64
		count   int64
	)

	err := pool.QueryRow(ctx, fmt.Sprintf(
		`SELECT round(avg(rating)::numeric, 1), count(*) FROM %s WHERE %s = $1`,
		table, fk,
	), id).Scan(&average, &count)
	if err != nil {
		return 0, 0, err
	}

	if average == nil {
		return 0, count, nil
	}

	return *average, count, nil
}

// ratingTables names the (table, foreign key) holding a profile's ratings.
var ratingTables = map[string][2]string{
	"arsiteks":          {"arsitek_ratings", "arsitek_id"},
	"kontraktors":       {"kontraktor_ratings", "kontraktor_id"},
	"notaris_profiles":  {"notaris_ratings", "notaris_id"},
	"interior_profiles": {"interior_ratings", "interior_id"},
	"project_managers":  {"p_m_ratings", "pm_id"},
}

// encodeProfile encodes one profile row: every column in table order, then the
// appends the model declares.
func encodeProfile(ctx context.Context, pool *pgxpool.Pool, table string, columns []string, values []any) (*jsonphp.Object, error) {
	row := encodeRow(columns, values)

	byName := map[string]any{}
	for i, column := range columns {
		byName[column] = values[i]
	}

	id, _ := byName["id"].(int64)

	// The ratings mean, for the five profiles that declare the appends.
	if rating, ok := ratingTables[table]; ok && id != 0 {
		average, count, err := profileAverages(ctx, pool, rating[0], rating[1], id)
		if err != nil {
			return nil, err
		}

		row.Set("average_rating", average)
		row.Set("review_count", count)
	}

	switch table {
	case "kontraktors":
		// The appends are aliases, not columns: `lokasi` IS `alamat`.
		row.Set("lokasi", jsonVal(byName["alamat"]))
		row.Set("no_telp", jsonVal(byName["no_telepon"]))
	case "notaris_profiles":
		verified := false
		if status, _ := byName["verification_status"].(string); status == "verified" {
			verified = true
		}

		row.Set("is_verified", verified)
	}

	return row, nil
}

// loadProfile fetches one profile row by user id, or (false, nil) when absent.
func loadProfile(ctx context.Context, pool *pgxpool.Pool, table, columns string, userID int64) (bool, *jsonphp.Object, error) {
	rows, err := pool.Query(ctx, fmt.Sprintf(
		`SELECT %s FROM %s WHERE user_id = $1 LIMIT 1`, columns, table,
	), userID)
	if err != nil {
		return false, nil, err
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	names := make([]string, len(fields))

	for i, field := range fields {
		names[i] = string(field.Name)
	}

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return false, nil, err
		}

		return false, nil, nil
	}

	values, err := rows.Values()
	if err != nil {
		return false, nil, err
	}

	row, err := encodeProfile(ctx, pool, table, names, values)
	if err != nil {
		return false, nil, err
	}

	return true, row, rows.Err()
}

// userResource builds the nineteen-key object.
//
// `relations` names the relations the CALLER loaded — exactly the list the
// controller passed to `load()`. A name absent from the list is absent from
// the object.
func userResource(
	ctx context.Context,
	pool *pgxpool.Pool,
	user userRow,
	viewerID int64,
	viewerIsAdmin bool,
	relations []string,
) (*jsonphp.Object, error) {
	private := viewerID == user.ID || viewerIsAdmin

	wanted := map[string]bool{}
	for _, name := range relations {
		wanted[name] = true
	}

	// `notaris_profile.services` is a NESTED load: it implies the profile key
	// itself, exactly as `whenLoaded('notaris_profile')` is satisfied by
	// loading `notaris_profile.services`.
	if wanted["notaris_profile.services"] {
		wanted["notaris_profile"] = true
	}

	resource := jsonphp.NewObject()
	resource.Set("id", user.ID)
	resource.Set("name", user.Name)
	resource.Set("email", ternary(private, user.Email, nil))
	resource.Set("username", strOrNil(user.Username))
	resource.Set("role_type", user.Role)

	if user.Pic != nil && *user.Pic != "" {
		resource.Set("pic", assetStorage(*user.Pic))
	} else {
		resource.Set("pic", nil)
	}

	resource.Set("bank_name", ternary(private, strOrNil(user.BankName), nil))
	resource.Set("bank_account_number", ternary(private, strOrNil(user.BankAccountNumber), nil))
	resource.Set("bank_account_name", ternary(private, strOrNil(user.BankAccountName), nil))

	setRelation := func(name string, loaded bool, value any) {
		if !wanted[name] {
			return
		}

		if !loaded {
			resource.Set(name, nil)
			return
		}

		resource.Set(name, value)
	}

	if wanted["phoneNumber"] {
		phones, err := queryRows(ctx, pool, `
			SELECT id, contact, id_user, id_contact FROM phone_user
			 WHERE id_user = $1 ORDER BY id
		`, []string{"id", "contact", "id_user", "id_contact"}, user.ID)
		if err != nil {
			return nil, err
		}

		// The KEY is `phone_number`; the RELATION is `phoneNumber`.
		resource.Set("phone_number", phones)
	}

	profiles := []struct {
		relation string
		table    string
		columns  string
	}{
		{"arsitek", "arsiteks", "*"},
		{"kontraktor", "kontraktors", "*"},
		{"notaris_profile", "notaris_profiles", "*"},
		{"interior_profile", "interior_profiles", "*"},
		{"project_manager", "project_managers", "*"},
		{"structural_engineer", "structural_engineers", "*"},
		{"mep_engineer", "mep_engineers", "*"},
		{"supplier", "suppliers", "*"},
	}

	for _, profile := range profiles {
		if !wanted[profile.relation] {
			continue
		}

		loaded, row, err := loadProfile(ctx, pool, profile.table, profile.columns, user.ID)
		if err != nil {
			return nil, err
		}

		setRelation(profile.relation, loaded, row)
	}

	if wanted["notaris_profile.services"] {
		// The nested eager load: services of the (possibly absent) profile.
		if _, ok := resource.Get("notaris_profile"); ok {
			services, err := queryRows(ctx, pool, `
				SELECT ns.id, ns.notaris_id, ns.title, ns.price::text, ns.description,
				       ns.created_at, ns.updated_at
				  FROM notaris_services ns
				  JOIN notaris_profiles np ON np.id = ns.notaris_id
				 WHERE np.user_id = $1
				 ORDER BY ns.id
			`, []string{"id", "notaris_id", "title", "price", "description", "created_at", "updated_at"}, user.ID)
			if err != nil {
				return nil, err
			}

			profile, _ := resource.Get("notaris_profile")

			if profileObject, ok := profile.(*jsonphp.Object); ok {
				profileObject.Set("services", services)
			}
		}
	}

	if wanted["team_members"] || wanted["teamMembers"] {
		members, err := queryRows(ctx, pool, `
			SELECT id, owner_user_id, owner_role::text, name, photo_path, role_title,
			       bio, skills, phone, email, status::text, created_at, updated_at
			  FROM team_members
			 WHERE owner_user_id = $1
			 ORDER BY id
		`, []string{"id", "owner_user_id", "owner_role", "name", "photo_path", "role_title", "bio", "skills", "phone", "email", "status", "created_at", "updated_at"}, user.ID)
		if err != nil {
			return nil, err
		}

		// `photo_url` is appended per row: absolute http passes through,
		// anything else is served from /storage.
		for _, member := range members {
			row, ok := member.(*jsonphp.Object)
			if !ok {
				continue
			}

			photo, _ := row.Get("photo_path")

			if path, _ := photo.(string); path != "" {
				if strings.HasPrefix(path, "http") {
					row.Set("photo_url", path)
				} else {
					row.Set("photo_url", "/storage/"+strings.TrimPrefix(path, "/"))
				}
			} else {
				row.Set("photo_url", nil)
			}
		}

		setRelation("team_members", true, members)
	}

	if wanted["roles"] {
		roles, err := queryRows(ctx, pool, `
			SELECT r.id, r.name, r.guard_name, r.created_at, r.updated_at
			  FROM roles r
			  JOIN model_has_roles m ON m.role_id = r.id
			 WHERE m.model_id = $1 AND m.model_type = 'App\Models\User'
			 ORDER BY r.id
		`, []string{"id", "name", "guard_name", "created_at", "updated_at"}, user.ID)
		if err != nil {
			return nil, err
		}

		// The pivot rides along, AFTER the attributes, in Eloquent's order.
		for _, role := range roles {
			row, ok := role.(*jsonphp.Object)
			if !ok {
				continue
			}

			pivot := jsonphp.NewObject()
			pivot.Set("model_type", `App\Models\User`)
			pivot.Set("model_id", user.ID)

			roleID, _ := row.Get("id")
			pivot.Set("role_id", roleID)

			row.Set("pivot", pivot)
		}

		resource.Set("roles", roles)
	}

	return resource, nil
}

func ternary(condition bool, whenTrue, whenFalse any) any {
	if condition {
		return whenTrue
	}

	return whenFalse
}

// showRelations is ProfileController@show's load list.
func showRelations(role string) []string {
	relations := []string{
		"phoneNumber", "arsitek", "kontraktor",
		"notaris_profile.services", "interior_profile", "project_manager",
		"structural_engineer", "mep_engineer", "supplier",
		"roles",
	}

	if role == "arsitek" || role == "kontraktor" {
		relations = append(relations, "team_members")
	}

	return relations
}

// MeHandler serves `GET /api/me`.
func MeHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())

		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		user, err := loadUser(r.Context(), pool, caller.UserID())
		if err != nil {
			slog.Error("me: user", "error", err)
			serverError(w)
			return
		}

		resource, err := userResource(r.Context(), pool, user, caller.UserID(), caller.IsAdmin(), showRelations(user.Role))
		if err != nil {
			slog.Error("me: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", resource)

		writeJSON(w, http.StatusOK, payload)
	}
}
