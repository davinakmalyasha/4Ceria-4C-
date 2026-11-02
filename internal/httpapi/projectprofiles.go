package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SHARED SMALL BUILDERS for the project resource.

// stringOrNil renders text or null.
func stringOrNil(value any) any {
	if value == nil {
		return nil
	}
	if s, ok := value.(string); ok {
		return s
	}
	return jsonVal(value)
}

// intPtrOf reads an integer-ish value, including pointers.
func intPtrOf(value any) *int64 {
	switch typed := value.(type) {
	case nil:
		return nil
	case *int64:
		if typed == nil {
			return nil
		}
		dup := *typed
		return &dup
	case *int:
		if typed == nil {
			return nil
		}
		dup := int64(*typed)
		return &dup
	case *int32:
		if typed == nil {
			return nil
		}
		dup := int64(*typed)
		return &dup
	case int64:
		dup := typed
		return &dup
	case int32:
		dup := int64(typed)
		return &dup
	case int:
		dup := int64(typed)
		return &dup
	default:
		return nil
	}
}

// intOrNilBid renders an integer column or null.
func intOrNilBid(bid map[string]any, key string) any {
	return nullableInt64(intPtrOf(bid[key]))
}

// decimalOrNilBid renders a decimal column exactly (string) or null.
func decimalOrNilBid(bid map[string]any, key string) any {
	value, ok := bid[key]
	if !ok || value == nil {
		return nil
	}
	if s, ok := value.(string); ok {
		return s
	}
	return jsonVal(value)
}

// jsonOrNil decodes a json/jsonb column value, preserving null.
func jsonOrNil(value any) any {
	if value == nil {
		return nil
	}
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return nil
		}
		return decodeJSONValue(typed)
	case []byte:
		if len(typed) == 0 {
			return nil
		}
		return decodeJSONValue(string(typed))
	case []any:
		if typed == nil {
			return nil
		}
		return typed
	case map[string]any:
		if len(typed) == 0 {
			return []any{}
		}
		return typed
	default:
		return jsonVal(value)
	}
}

// decodeJSONValue decodes text, returning null for JSON null.
func decodeJSONValue(text string) any {
	var decoded any
	if err := json.Unmarshal([]byte(text), &decoded); err != nil {
		return text
	}
	// PHP's `json_decode('{}', true)` is `[]`, which re-encodes as `[]` —
	// never `{}`.
	if asMap, ok := decoded.(map[string]any); ok && len(asMap) == 0 {
		return []any{}
	}
	return decoded
}

// bidAttachments resolves the three attachments, dropping nulls and
// empties exactly like `array_filter` does here (all values are URLs).
func bidAttachments(ctx context.Context, bid map[string]any) []any {
	out := make([]any, 0, 3)
	for _, key := range []string{"attachment_1", "attachment_2", "attachment_3"} {
		if resolved := projectStorageURL(ctx, stringOrNil(bid[key])); resolved != nil {
			out = append(out, resolved)
		}
	}
	return out
}

// bidNegotiationLogs lists a bid's negotiation logs with authors. The
// logs key on the legacy (registry type, legacy id) pair — the same
// reference the ledger and disputes still name.
func bidNegotiationLogs(ctx context.Context, pool *pgxpool.Pool, role string, bid map[string]any, bySpelling map[string]int64) []any {
	list := make([]any, 0)

	registryID, ok := bySpelling[bidRegistryKey(role)]
	if !ok {
		return list
	}

	rows, err := pool.Query(ctx, `
		SELECT l.user_id, l.round_number, l.note, l.changes_detected, l.created_at, u.name
		  FROM bid_negotiation_logs l
		  JOIN users u ON u.id = l.user_id
		 WHERE l.bid_type_id = $1 AND l.bid_id = $2
		 ORDER BY l.id
	`, registryID, bidRefID(bid))
	if err != nil {
		return list
	}
	defer rows.Close()

	for rows.Next() {
		var userID int64
		var round int
		var note *string
		var changes any
		var createdAt *time.Time
		var userName string
		if err := rows.Scan(&userID, &round, &note, &changes, &createdAt, &userName); err != nil {
			return list
		}

		entry := jsonphp.NewObject()
		entry.Set("user_name", userName)
		entry.Set("round_number", round)
		entry.Set("note", nullableString(note))
		entry.Set("changes", jsonOrNil(changes))
		entry.Set("created_at", carbon(createdAt))
		list = append(list, entry)
	}

	return list
}

// bidRefID is the id negotiation logs name: the legacy id for migrated
// rows, the physical id otherwise.
func bidRefID(bid map[string]any) int64 {
	if legacy, ok := bid["legacy_id"].(int64); ok && legacy != 0 {
		return legacy
	}
	if id, ok := bid["id"].(int64); ok {
		return id
	}
	return 0
}

// projectStorageURL mirrors resolveStorageUrl: empty stays null, S3 and
// /storage/ prefixes collapse to a relative path, external URLs pass
// through, and everything else renders through the public asset URL —
// which is what `Vault::url` falls back to locally when no disk can
// presign.
func projectStorageURL(ctx context.Context, value any) any {
	if value == nil {
		return nil
	}

	path, ok := value.(string)
	if !ok || path == "" {
		return nil
	}

	const s3Prefix = "https://t3.storageapi.dev/fourc-storage-fneicjrzkq3/"
	if strings.HasPrefix(path, s3Prefix) {
		path = strings.TrimPrefix(path, s3Prefix)
	} else if strings.Contains(path, "/storage/") {
		parts := strings.Split(path, "/storage/")
		path = parts[len(parts)-1]
	} else if isExternalURL(path) {
		return path
	}

	return assetBaseOf(ctx) + "/storage/" + strings.TrimPrefix(path, "/")
}

// isExternalURL reports an absolute http(s) URL.
func isExternalURL(path string) bool {
	return strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://")
}

// bidSignatureURL mirrors resolveSignatureUrl: gated by status, HMACed
// with the application key, expiring never (the timestamp is part of the
// signed payload, not a TTL).
func bidSignatureURL(ctx context.Context, roleType string, bid map[string]any, isClient bool) any {
	status, _ := bid["status"].(string)
	if status == "" {
		return nil
	}

	if isClient {
		if status != "awaiting_payment" && status != "accepted" {
			return nil
		}
	} else {
		if status != "contract_pending" && status != "awaiting_payment" && status != "accepted" {
			return nil
		}
	}

	var timestamp int64
	if created, ok := bid["created_at"].(time.Time); ok {
		timestamp = created.Unix()
	} else {
		timestamp = time.Now().Unix()
	}

	suffix := ""
	clientPath := ""
	if isClient {
		suffix = "_client"
		clientPath = "/client"
	}

	mac := hmac.New(sha256.New, []byte(os.Getenv("APP_KEY")))
	_, _ = mac.Write([]byte(roleType + "_" + strconv.FormatInt(bidWireID(bid), 10) + "_" + strconv.FormatInt(timestamp, 10) + suffix))

	return assetBaseOf(ctx) + "/api/contract-signatures/" + roleType + "/" + strconv.FormatInt(bidWireID(bid), 10) + "/" + strconv.FormatInt(timestamp, 10) + clientPath + "?token=" + hex.EncodeToString(mac.Sum(nil))
}

// profileRating reads a profile's average and count. Roles without a
// ratings table read null — which is what production serves, where the
// missing attribute is null rather than an error.
func profileRating(ctx context.Context, pool *pgxpool.Pool, table, fk string, profileID int64) (any, any) {
	ratingTable, ok := map[string][2]string{
		"arsiteks":          {"arsitek_ratings", "arsitek_id"},
		"kontraktors":       {"kontraktor_ratings", "kontraktor_id"},
		"notaris_profiles":  {"notaris_ratings", "notaris_id"},
		"interior_profiles": {"interior_ratings", "interior_id"},
		"project_managers":  {"p_m_ratings", "pm_id"},
	}[table]
	if !ok || profileID == 0 {
		return nil, nil
	}

	var average *float64
	var count int64
	if err := pool.QueryRow(ctx, `SELECT AVG(rating)::float8, COUNT(*) FROM `+ratingTable[0]+` WHERE `+ratingTable[1]+` = $1`,
		profileID).Scan(&average, &count); err != nil {
		return nil, nil
	}

	var avg any
	if average == nil {
		avg = 0
	} else {
		avg = *average
	}

	return avg, count
}

// bidderTree builds the per-role bidder block: the profile, its user
// with the first phone contact, and ratings. Email is gated by pii;
// the phone contact is not.
func bidderTree(ctx context.Context, pool *pgxpool.Pool, role string, bid map[string]any, privileged bool) (any, error) {
	column, ok := bidProfileColumn(role)
	if !ok {
		return nil, nil
	}

	profileID := profileID(bid, column)
	if profileID == 0 {
		return nil, nil
	}

	table, ok := bidProfileTable(role)
	if !ok {
		return nil, nil
	}

	profile, err := profileRowByID(ctx, pool, table, profileID)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	userID, _ := profile["user_id"].(int64)
	user, err := userMini(ctx, pool, userID)
	if err != nil {
		return nil, err
	}

	average, count := profileRating(ctx, pool, table, column, profileID)
	phones := userPhones(ctx, pool, userID)
	phone := firstPhone(phones)

	nameOf := func(key string) any {
		if value, ok := profile[key].(string); ok && value != "" {
			return value
		}
		return nil
	}
	userName := ""
	if user != nil {
		userName, _ = user["name"].(string)
	}

	tree := jsonphp.NewObject()
	tree.Set("id", profileID)

	switch role {
	case "arsitek", "interior":
		tree.Set("name", coalesceString(nameOf("nama"), userName))
		tree.Set("phone", coalesceString(nameOf("no_telp"), phone))
		if role == "arsitek" {
			tree.Set("spesialisasi", stringOrNil(profile["spesialisasi"]))
			tree.Set("specialization", stringOrNil(profile["spesialisasi"]))
			tree.Set("experience_years", intOrProfile(profile["pengalaman_tahun"]))
			tree.Set("pengalaman_tahun", intOrProfile(profile["pengalaman_tahun"]))
			tree.Set("rate", decimalProfile(profile["rate_harga"]))
			tree.Set("rate_harga", decimalProfile(profile["rate_harga"]))
			tree.Set("location", stringOrNil(profile["lokasi"]))
			tree.Set("lokasi", stringOrNil(profile["lokasi"]))
		} else {
			tree.Set("location", stringOrNil(profile["lokasi"]))
			tree.Set("lokasi", stringOrNil(profile["lokasi"]))
		}
		tree.Set("average_rating", averageOrZero(average))
		tree.Set("review_count", count)
		tree.Set("foto", projectStorageURL(ctx, stringOrNil(profile["foto"])))
		if role == "arsitek" {
			tree.Set("deskripsi", stringOrNil(profile["deskripsi"]))
			tree.Set("pendidikan", stringOrNil(profile["pendidikan"]))
		} else {
			tree.Set("spesialisasi", stringOrNil(profile["spesialisasi"]))
			tree.Set("rate_harga", decimalProfile(profile["rate_harga"]))
			tree.Set("pengalaman_tahun", intOrProfile(profile["pengalaman_tahun"]))
			tree.Set("deskripsi", stringOrNil(profile["deskripsi"]))
			tree.Set("pendidikan", stringOrNil(profile["pendidikan"]))
		}
		tree.Set("file_portofolio", projectStorageURL(ctx, projectPII(stringOrNil(profile["file_portofolio"]), privileged)))
		tree.Set("file_sertifikat", projectStorageURL(ctx, projectPII(stringOrNil(profile["file_sertifikat"]), privileged)))
	case "kontraktor":
		tree.Set("name", coalesceString(nameOf("nama"), userName))
		tree.Set("phone", coalesceString(nameOf("no_telepon"), phone))
		tree.Set("location", stringOrNil(profile["alamat"]))
		tree.Set("alamat", stringOrNil(profile["alamat"]))
		tree.Set("lokasi", stringOrNil(profile["alamat"]))
		tree.Set("average_rating", averageOrZero(average))
		tree.Set("review_count", count)
		tree.Set("foto", projectStorageURL(ctx, stringOrNil(profile["foto"])))
		tree.Set("spesialisasi", stringOrNil(profile["spesialisasi"]))
		tree.Set("rate_harga", decimalProfile(profile["rate_harga"]))
		tree.Set("pengalaman", stringOrNil(profile["pengalaman"]))
		tree.Set("deskripsi", stringOrNil(profile["alasan_hire"]))
		tree.Set("pendidikan", stringOrNil(profile["pendidikan"]))
		tree.Set("file_portofolio", projectStorageURL(ctx, projectPII(stringOrNil(profile["file_portofolio"]), privileged)))
		tree.Set("file_sertifikat", projectStorageURL(ctx, projectPII(stringOrNil(profile["file_sertifikat"]), privileged)))
	case "notaris":
		tree.Set("name", coalesceString(nameOf("nama"), userName))
		tree.Set("phone", coalesceString(nameOf("no_telp"), phone))
		tree.Set("specialization", stringOrNil(profile["spesialisasi"]))
		tree.Set("location", stringOrNil(profile["lokasi"]))
		tree.Set("average_rating", averageOrZero(average))
		tree.Set("review_count", count)
		tree.Set("foto", projectStorageURL(ctx, stringOrNil(profile["foto"])))
	case "project_manager":
		tree.Set("name", coalesceString(nameOf("nama"), userName, "Unknown PM"))
		tree.Set("verification_status", stringOrNil(profile["verification_status"]))
		tree.Set("pengalaman_tahun", intOrProfile(profile["pengalaman_tahun"]))
		tree.Set("deskripsi", stringOrNil(profile["deskripsi"]))
		tree.Set("spesialisasi", stringOrNil(profile["spesialisasi"]))
		tree.Set("lokasi", stringOrNil(profile["lokasi"]))
		tree.Set("rate_harga", decimalProfile(profile["rate_harga"]))
		tree.Set("alasan_hire", stringOrNil(profile["alasan_hire"]))
		tree.Set("pendidikan", stringOrNil(profile["pendidikan"]))
		tree.Set("foto", projectStorageURL(ctx, stringOrNil(profile["foto"])))
		tree.Set("file_portofolio", projectPII(stringOrNil(profile["file_portofolio"]), privileged))
		tree.Set("file_sertifikat", projectPII(stringOrNil(profile["file_sertifikat"]), privileged))
		tree.Set("entity_type", stringOrNil(profile["entity_type"]))
		tree.Set("company_name", stringOrNil(profile["company_name"]))
		tree.Set("company_license", projectPII(stringOrNil(profile["company_license"]), privileged))
		tree.Set("identity_number", projectPII(stringOrNil(profile["identity_number"]), privileged))
		tree.Set("npwp_number", projectPII(stringOrNil(profile["npwp_number"]), privileged))
		tree.Set("siup_number", projectPII(stringOrNil(profile["siup_number"]), privileged))
	case "structural", "mep":
		tree.Set("name", coalesceString(nameOf("nama"), userName))
		tree.Set("phone", coalesceString(nameOf("no_telp"), phone))
		tree.Set("specialization", stringOrNil(profile["spesialisasi"]))
		tree.Set("experience_years", intOrProfile(profile["pengalaman_tahun"]))
		tree.Set("rate", decimalProfile(profile["rate_harga"]))
		tree.Set("location", stringOrNil(profile["lokasi"]))
		tree.Set("deskripsi", stringOrNil(profile["deskripsi"]))
		tree.Set("alasan_hire", stringOrNil(profile["alasan_hire"]))
		tree.Set("pendidikan", stringOrNil(profile["pendidikan"]))
		tree.Set("foto", projectStorageURL(ctx, stringOrNil(profile["foto"])))
		tree.Set("file_portofolio", projectStorageURL(ctx, projectPII(stringOrNil(profile["file_portofolio"]), privileged)))
		tree.Set("file_sertifikat", projectStorageURL(ctx, projectPII(stringOrNil(profile["file_sertifikat"]), privileged)))
		tree.Set("verification_status", stringOrNil(profile["verification_status"]))
		tree.Set("entity_type", stringOrNil(profile["entity_type"]))
		tree.Set("company_name", stringOrNil(profile["company_name"]))
		tree.Set("company_license", projectPII(stringOrNil(profile["company_license"]), privileged))
		tree.Set("identity_number", projectPII(stringOrNil(profile["identity_number"]), privileged))
		tree.Set("npwp_number", projectPII(stringOrNil(profile["npwp_number"]), privileged))
		tree.Set("siup_number", projectPII(stringOrNil(profile["siup_number"]), privileged))
	}

	if role == "project_manager" {
		u := jsonphp.NewObject()
		if user != nil {
			u.Set("id", user["id"])
			u.Set("name", user["name"])
			u.Set("email", projectPII(user["email"], privileged))
			u.Set("phone_number", coalesceString(nameOf("no_telp"), phone))
			u.Set("pic", projectStorageURL(ctx, user["pic"]))
			tree.Set("user", u)
		} else {
			tree.Set("user", nil)
		}
		tree.Set("phone", coalesceString(nameOf("no_telp"), phone))
	} else {
		u := jsonphp.NewObject()
		if user != nil {
			u.Set("id", user["id"])
			u.Set("name", user["name"])
			u.Set("email", projectPII(user["email"], privileged))
			u.Set("pic", projectStorageURL(ctx, user["pic"]))
			tree.Set("user", u)
		} else {
			tree.Set("user", nil)
		}
	}

	return tree, nil
}

// averageOrZero renders a profile average the way the append does:
// .round(1), which prints bare for integral values.
func averageOrZero(average any) any {
	if average == nil {
		return 0
	}
	return average
}

// coalesceString returns the first non-empty string.
func coalesceString(values ...any) any {
	for _, value := range values {
		if s, ok := value.(string); ok && s != "" {
			return s
		}
	}
	return nil
}

// intOrProfile renders a profile integer or nil.
func intOrProfile(value any) any {
	if value == nil {
		return nil
	}
	switch typed := value.(type) {
	case int64:
		return typed
	case int32:
		return int64(typed)
	case int:
		return int64(typed)
	default:
		return nil
	}
}

// decimalProfile renders a profile decimal exactly or nil.
func decimalProfile(value any) any {
	if value == nil {
		return nil
	}
	if s, ok := value.(string); ok {
		return s
	}
	return jsonVal(value)
}

// userMini reads a user's id, name, email and pic.
func userMini(ctx context.Context, pool *pgxpool.Pool, userID int64) (map[string]any, error) {
	if userID == 0 {
		return nil, nil
	}

	var id int64
	var name string
	var email, pic *string
	if err := pool.QueryRow(ctx, `SELECT id, name, email, pic FROM users WHERE id = $1`, userID).Scan(&id, &name, &email, &pic); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	return map[string]any{"id": id, "name": name, "email": nullableString(email), "pic": nullableString(pic)}, nil
}

// userPhones lists a user's phone contacts in order.
func userPhones(ctx context.Context, pool *pgxpool.Pool, userID int64) []string {
	rows, err := pool.Query(ctx, `SELECT contact FROM phone_user WHERE id_user = $1 ORDER BY id`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var contact *string
		if err := rows.Scan(&contact); err != nil || contact == nil {
			continue
		}
		out = append(out, *contact)
	}

	return out
}

// firstPhone is the first contact or nil.
func firstPhone(contacts []string) any {
	if len(contacts) == 0 {
		return nil
	}
	return contacts[0]
}

// profileRowByID reads one profile row by id.
func profileRowByID(ctx context.Context, pool *pgxpool.Pool, table string, id int64) (map[string]any, error) {
	rows, err := pool.Query(ctx, `SELECT * FROM `+table+` WHERE id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := fieldNames(rows)
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, pgx.ErrNoRows
	}

	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}

	row := map[string]any{}
	for i, column := range fields {
		row[column] = values[i]
	}

	return row, rows.Err()
}

// projectRowByID reads one project row.
func projectRowByID(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]string, []any, error) {
	rows, err := pool.Query(ctx, `SELECT * FROM projects WHERE id = $1`, projectID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	fields := fieldNames(rows)
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, nil, err
		}
		return nil, nil, pgx.ErrNoRows
	}

	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, nil, err
	}

	return fields, values, rows.Err()
}
