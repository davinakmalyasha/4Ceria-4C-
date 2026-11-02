package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MILESTONE APPROVE — the two-step technical review and the final approval
// that unlocks payment.
//
// The lead architect/contractor who holds a structural or MEP id on the
// row performs the TECHNICAL REVIEW (`pending → reviewed`, stamping
// lead_pro_verified_at) and the owner is told. Final approval needs the
// owner or the assigned PM: it completes the row, moves EVERY linked
// locked/pending stage to `pending` (one `payment_triggered` line each),
// mirrors the gallery into the document vault, logs `milestone_approved`
// and tells the responsible professional.
//
// SERIALIZATION TRAPS:
//   - the answer is the model plus the six profile trees, each a RAW
//     model with its own `$appends` (average_rating/review_count, plus
//     kontraktor's lokasi/no_telp and notaris's is_verified) and `user`;
//   - `content.gallery` is rewritten to absolute URLs by the model's
//     toArray override;
//   - the `project` key appears ONLY when unlockLinkedTermin actually
//     loaded it — that is, when at least one linked stage was unlocked.
//     A milestone with no locked/pending stage answers WITHOUT `project`.

// milestoneApproveColumns is the milestone table order.
var milestoneApproveColumns = []string{
	"id", "project_id", "arsitek_id", "kontraktor_id", "notaris_id", "interior_id",
	"pm_id", "structural_id", "mep_id", "title", "type", "content", "description",
	"review_note", "review_status", "image", "sort_order", "start_date", "due_date",
	"is_completed", "approval_status", "revision_notes", "phase_context",
	"lead_pro_verified_at", "pm_verified_at", "progress_attachment", "created_at", "updated_at",
}

var projectModelColumns = []string{
	"id",
	"user_id",
	"title",
	"description",
	"budget",
	"lokasi",
	"jenis_proyek",
	"owner_id",
	"selected_arsitek_id",
	"selected_kontraktor_id",
	"selected_notaris_id",
	"selected_interior_id",
	"pm_id",
	"structural_id",
	"mep_id",
	"structural_approved_at",
	"mep_approved_at",
	"status",
	"published_bidding_roles",
	"bidding_choices",
	"target_role",
	"needed_phases",
	"completed_phases",
	"wants_project_manager",
	"requires_structural",
	"requires_mep",
	"requires_interior",
	"latitude",
	"longitude",
	"province",
	"city",
	"kecamatan",
	"kelurahan",
	"postal_code",
	"street_name",
	"design_details",
	"design_completed_at",
	"design_authorized_at",
	"materials_authorized_at",
	"design_locked_at",
	"legal_completed_at",
	"pbg_verified_at",
	"slf_verified_at",
	"legal_locked_at",
	"construction_details",
	"construction_completed_at",
	"construction_authorized_at",
	"construction_locked_at",
	"construction_brief_status",
	"construction_brief_revision_notes",
	"interior_details",
	"interior_locked_at",
	"interior_completed_at",
	"planning_status",
	"negotiated_fee",
	"payment_instructions",
	"planning_submitted_at",
	"planning_approved_at",
	"planning_pm_verified_at",
	"design_payment_verified_at",
	"construction_payment_verified_at",
	"interior_payment_verified_at",
	"arsitek_kickoff_at",
	"kontraktor_kickoff_at",
	"pm_audit_notes",
	"pm_audit_attachments",
	"architect_notes",
	"planning_iteration",
	"project_category",
	"project_dimensions",
	"legal_detail",
	"wants_to_discuss_later",
	"legal_requirements",
	"share_token",
	"attachment",
	"deadline",
	"created_at",
	"updated_at",
	"design_handover_submitted_at",
	"construction_handover_submitted_at",
	"interior_handover_submitted_at",
	"design_handover_notes",
	"construction_handover_notes",
	"interior_handover_notes",
	"legal_handover_submitted_at",
	"legal_handover_notes",
	"final_walkthrough_at",
	"walkthrough_status",
	"completed_at",
	"owner_accepted_at",
	"owner_acceptance_notes",
	"owner_design_approved_at",
	"owner_build_approved_at",
	"owner_interior_approved_at",
	"owner_legal_approved_at",
	"warranty_start_at",
	"warranty_end_at",
	"deleted_at",
}

var profileModelColumns = map[string][]string{
	"arsiteks": {
		"id",
		"user_id",
		"nama",
		"no_telp",
		"rate_harga",
		"spesialisasi",
		"deskripsi",
		"lokasi",
		"pengalaman_tahun",
		"file_portofolio",
		"file_sertifikat",
		"npwp",
		"siup",
		"pendidikan",
		"alasan_hire",
		"verification_status",
		"rejection_reason",
		"foto",
		"identity_number",
		"npwp_number",
		"siup_number",
		"entity_type",
		"company_name",
		"company_license",
		"reliability_score",
		"created_at",
		"updated_at",
	},
	"interior_profiles": {
		"id",
		"user_id",
		"nama",
		"no_telp",
		"foto",
		"identity_number",
		"npwp_number",
		"siup_number",
		"entity_type",
		"company_name",
		"company_license",
		"reliability_score",
		"file_portofolio",
		"file_sertifikat",
		"npwp",
		"siup",
		"spesialisasi",
		"deskripsi",
		"lokasi",
		"pengalaman_tahun",
		"rate_harga",
		"verification_status",
		"rejection_reason",
		"created_at",
		"updated_at",
	},
	"kontraktors": {
		"id",
		"user_id",
		"nama",
		"no_telepon",
		"alamat",
		"jenis",
		"nama_perusahaan",
		"npwp",
		"siup",
		"pengalaman",
		"spesialisasi",
		"subspecialties",
		"rate_harga",
		"pendidikan",
		"alasan_hire",
		"verification_status",
		"rejection_reason",
		"foto",
		"file_portofolio",
		"file_sertifikat",
		"identity_number",
		"npwp_number",
		"siup_number",
		"entity_type",
		"company_name",
		"company_license",
		"reliability_score",
		"created_at",
		"updated_at",
	},
	"mep_engineers": {
		"id",
		"user_id",
		"nama",
		"no_telp",
		"rate_harga",
		"reliability_score",
		"spesialisasi",
		"deskripsi",
		"lokasi",
		"pengalaman_tahun",
		"file_portofolio",
		"file_sertifikat",
		"npwp",
		"siup",
		"pendidikan",
		"alasan_hire",
		"verification_status",
		"rejection_reason",
		"foto",
		"identity_number",
		"npwp_number",
		"siup_number",
		"entity_type",
		"company_name",
		"company_license",
		"created_at",
		"updated_at",
	},
	"notaris_profiles": {
		"id",
		"user_id",
		"nama",
		"no_telp",
		"foto",
		"file_portofolio",
		"identity_number",
		"npwp_number",
		"siup_number",
		"entity_type",
		"company_name",
		"company_license",
		"reliability_score",
		"nomor_sk",
		"wilayah_kerja",
		"spesialisasi",
		"deskripsi",
		"lokasi",
		"pengalaman_tahun",
		"rate_harga",
		"file_sertifikat",
		"npwp",
		"siup",
		"verification_status",
		"rejection_reason",
		"created_at",
		"updated_at",
	},
	"structural_engineers": {
		"id",
		"user_id",
		"nama",
		"no_telp",
		"rate_harga",
		"reliability_score",
		"spesialisasi",
		"deskripsi",
		"lokasi",
		"pengalaman_tahun",
		"file_portofolio",
		"file_sertifikat",
		"npwp",
		"siup",
		"pendidikan",
		"alasan_hire",
		"verification_status",
		"rejection_reason",
		"foto",
		"identity_number",
		"npwp_number",
		"siup_number",
		"entity_type",
		"company_name",
		"company_license",
		"created_at",
		"updated_at",
	},
}

// projectModelJSONCols are Project's `array` casts.
var projectModelJSONCols = map[string]bool{
	"needed_phases": true, "completed_phases": true, "design_details": true,
	"construction_details": true, "interior_details": true, "project_dimensions": true,
	"legal_requirements": true, "published_bidding_roles": true, "bidding_choices": true,
	"pm_audit_attachments": true,
}

// projectModelBoolCols are Project's `boolean` casts.
var projectModelBoolCols = map[string]bool{
	"wants_project_manager": true, "requires_structural": true, "requires_mep": true,
	"requires_interior": true, "wants_to_discuss_later": true,
}

// projectModelTimeCols are Project's `datetime` casts (plus the automatic
// timestamps). Uncast `*_at` columns serialize as raw MySQL datetimes.
var projectModelTimeCols = map[string]bool{
	"design_locked_at": true, "construction_locked_at": true, "interior_locked_at": true,
	"planning_submitted_at": true, "planning_approved_at": true, "planning_pm_verified_at": true,
	"design_payment_verified_at": true, "materials_authorized_at": true,
	"legal_completed_at": true, "legal_locked_at": true, "structural_approved_at": true,
	"mep_approved_at": true, "pbg_verified_at": true, "slf_verified_at": true,
	"design_handover_submitted_at": true, "construction_handover_submitted_at": true,
	"interior_handover_submitted_at": true, "legal_handover_submitted_at": true,
	"final_walkthrough_at": true, "owner_accepted_at": true, "owner_design_approved_at": true,
	"owner_build_approved_at": true, "owner_interior_approved_at": true,
	"owner_legal_approved_at": true, "warranty_start_at": true, "warranty_end_at": true,
	"arsitek_kickoff_at": true, "kontraktor_kickoff_at": true,
	"created_at": true, "updated_at": true, "deleted_at": true,
}

// mysqlDateTime renders an uncast timestamp as MySQL hands it to PHP.
func mysqlDateTime(value any) any {
	if value == nil {
		return nil
	}
	if typed, ok := value.(time.Time); ok {
		return typed.UTC().Format("2006-01-02 15:04:05")
	}
	if s, ok := value.(string); ok {
		if len(s) > 19 {
			return s[:19]
		}
		return s
	}
	return jsonVal(value)
}

// rawProjectModel serializes the Project model as Eloquent would with no
// relations loaded: physical column order, casts applied.
func rawProjectModel(ctx context.Context, pool *pgxpool.Pool, projectID int64) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(projectModelColumns, ", ")+` FROM projects WHERE id = $1`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, errLedgerGone
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}

	model := jsonphp.NewObject()
	for i, column := range fields {
		value := values[i]
		switch {
		case projectModelJSONCols[column]:
			model.Set(column, eloquentJSONValue(value))
		case projectModelBoolCols[column]:
			boolean := false
			if typed, ok := value.(bool); ok {
				boolean = typed
			}
			model.Set(column, boolean)
		case column == "latitude" || column == "longitude":
			model.Set(column, projectFloatValue(value))
		case column == "budget" || column == "negotiated_fee":
			model.Set(column, projectDecimalValue(value))
		case column == "planning_iteration":
			model.Set(column, projectIntValue(value))
		case projectModelTimeCols[column]:
			model.Set(column, projectTimeValue(value))
		case column == "deadline":
			model.Set(column, mysqlDate(value))
		case strings.HasSuffix(column, "_at"):
			model.Set(column, mysqlDateTime(value))
		default:
			model.Set(column, projectRawValue(value))
		}
	}
	return model, rows.Err()
}


// decodeOrderedJSON parses JSON while PRESERVING object key order. The
// oracle serializes the stored content array verbatim, so `gallery`
// precedes `file_names` exactly as it was written; a Go map would sort
// the keys and break byte parity.
func decodeOrderedJSON(text string) any {
	decoder := json.NewDecoder(strings.NewReader(text))
	decoder.UseNumber()
	value, err := readOrderedJSON(decoder)
	if err != nil {
		return nil
	}
	return value
}

// readOrderedJSON walks one JSON value from the decoder.
func readOrderedJSON(decoder *json.Decoder) (any, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	delim, ok := token.(json.Delim)
	if !ok {
		if number, isNumber := token.(json.Number); isNumber {
			if parsed, err := number.Int64(); err == nil {
				return parsed, nil
			}
			if parsed, err := number.Float64(); err == nil {
				return parsed, nil
			}
		}
		return token, nil
	}

	switch delim {
	case '{':
		object := jsonphp.NewObject()
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return nil, err
			}
			key, _ := keyToken.(string)
			value, err := readOrderedJSON(decoder)
			if err != nil {
				return nil, err
			}
			object.Set(key, value)
		}
		_, err := decoder.Token()
		return object, err
	case '[':
		list := make([]any, 0)
		for decoder.More() {
			value, err := readOrderedJSON(decoder)
			if err != nil {
				return nil, err
			}
			list = append(list, value)
		}
		_, err := decoder.Token()
		return list, err
	}

	return nil, nil
}
// projectJSONValue renders an Eloquent array cast: null stays null, an
// empty array stays [].
func eloquentJSONValue(value any) any {
	if value == nil {
		return nil
	}
	switch typed := value.(type) {
	case []byte:
		text := string(typed)
		if text == "" || text == "null" {
			return nil
		}
		return decodeOrderedJSON(text)
	case string:
		if typed == "" || typed == "null" {
			return nil
		}
		return decodeOrderedJSON(typed)
	case map[string]any, []any:
		return typed
	default:
		return jsonVal(value)
	}
}

// projectFloatValue renders a float cast.
func projectFloatValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int64:
		return float64(typed)
	case int32:
		return float64(typed)
	default:
		return nil
	}
}

// profileModelObject serializes a professional profile exactly like its
// Eloquent model: columns in table order, then its `$appends`, then `user`.
func profileModelObject(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64, withUser bool) (*jsonphp.Object, error) {
	columns, known := profileModelColumns[table]
	if !known {
		columns = []string{"*"}
	}
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(columns, ", ")+` FROM `+table+` WHERE id = $1`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, errLedgerGone
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}

	byName := map[string]any{}
	block := jsonphp.NewObject()
	for i, column := range fields {
		byName[column] = values[i]
		switch {
		case column == "rate_harga":
			block.Set(column, projectDecimalValue(values[i]))
		case column == "reliability_score":
			block.Set(column, projectIntValue(values[i]))
		case column == "subspecialties":
			block.Set(column, eloquentJSONValue(values[i]))
		case column == "latitude" || column == "longitude":
			block.Set(column, projectFloatValue(values[i]))
		case column == "is_active":
			// CourierProfile has NO casts, so MySQL's tinyint serializes
			// as 1/0 while PostgreSQL stores a boolean.
			active := int64(0)
			if flag, ok := values[i].(bool); ok && flag {
				active = 1
			}
			block.Set(column, active)
		case column == "created_at" || column == "updated_at":
			block.Set(column, projectTimeValue(values[i]))
		default:
			block.Set(column, projectRawValue(values[i]))
		}
	}

	// `$appends`, in declaration order.
	switch table {
	case "arsiteks", "interior_profiles", "project_managers":
		average, count := profileRatingValue(ctx, pool, table, profileID)
		block.Set("average_rating", average)
		block.Set("review_count", count)
	case "kontraktors":
		average, count := profileRatingValue(ctx, pool, table, profileID)
		block.Set("average_rating", average)
		block.Set("review_count", count)
		block.Set("lokasi", projectRawValue(byName["alamat"]))
		block.Set("no_telp", projectRawValue(byName["no_telepon"]))
	case "notaris_profiles":
		average, count := profileRatingValue(ctx, pool, table, profileID)
		block.Set("average_rating", average)
		block.Set("review_count", count)
		verified := false
		if status, ok := byName["verification_status"].(string); ok && status == "verified" {
			verified = true
		}
		block.Set("is_verified", verified)
	}

	if withUser {
		var userID int64
		if id, ok := byName["user_id"].(int64); ok {
			userID = id
		}
		user, err := fullProfileUser(ctx, pool, userID, false)
		if err != nil {
			return nil, err
		}
		block.Set("user", user)
	}

	return block, rows.Err()
}

// profileRatingValue is the accessor pair: average rounded to one decimal
// as a float, review count as an int.
func profileRatingValue(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64) (float64, int64) {
	fk := ratingFK(table)
	if fk == "" {
		return 0, 0
	}
	ratingsTable, _, ok := ratingTable(table)
	if !ok {
		return 0, 0
	}
	var average *float64
	var count int64
	_ = pool.QueryRow(ctx, `SELECT AVG(rating)::float8, COUNT(*) FROM `+ratingsTable+` WHERE `+fk+` = $1`, profileID).
		Scan(&average, &count)
	if average == nil {
		return 0, count
	}
	return float64(int64(*average*10+0.5)) / 10, count
}

// milestoneGalleryURLs resolves content.gallery to absolute URLs.
func milestoneGalleryURLs(ctx context.Context, gallery any) []any {
	out := make([]any, 0)
	list, ok := gallery.([]any)
	if !ok {
		return out
	}
	for _, item := range list {
		if s, ok := item.(string); ok && s != "" {
			out = append(out, projectStorageURL(ctx, s))
		}
	}
	return out
}

// milestoneContentObject renders `content` with gallery URLs.
func milestoneContentObject(ctx context.Context, value any) any {
	decoded := eloquentJSONValue(value)
	obj, ok := decoded.(*jsonphp.Object)
	if !ok {
		return decoded
	}
	if gallery, present := obj.Get("gallery"); present {
		obj.Set("gallery", milestoneGalleryURLs(ctx, gallery))
	}
	return obj
}

// milestoneApproveObject renders the fully-loaded milestone.
type milestoneRenderFlags struct {
	includeProject bool
	// Values the ORACLE set in memory with now() serialize as Carbon even
	// though the column has no datetime cast; values rehydrated from the
	// database stay raw `Y-m-d H:i:s` strings.
	leadProCarbon    bool
	pmVerifiedCarbon bool
}

func milestoneApproveObject(ctx context.Context, pool *pgxpool.Pool, projectID, milestoneID int64, flags milestoneRenderFlags) (*jsonphp.Object, error) {
	// `content` must be selected as TEXT: pgx decodes jsonb into a Go map,
	// which loses the stored key order the oracle preserves.
	columns := make([]string, 0, len(milestoneApproveColumns))
	for _, column := range milestoneApproveColumns {
		if column == "content" {
			columns = append(columns, "content::text AS content")
			continue
		}
		columns = append(columns, column)
	}

	rows, err := pool.Query(ctx, `SELECT `+strings.Join(columns, ", ")+`
		FROM project_milestones WHERE id = $1 AND project_id = $2`, milestoneID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, errLedgerGone
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}

	byName := map[string]any{}
	entry := jsonphp.NewObject()
	for i, column := range fields {
		byName[column] = values[i]
		switch column {
		case "content":
			entry.Set(column, milestoneContentObject(ctx, values[i]))
		case "start_date", "due_date", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(values[i]))
		case "lead_pro_verified_at":
			if flags.leadProCarbon {
				entry.Set(column, projectTimeValue(values[i]))
			} else {
				entry.Set(column, mysqlDateTime(values[i]))
			}
		case "pm_verified_at":
			if flags.pmVerifiedCarbon {
				entry.Set(column, projectTimeValue(values[i]))
			} else {
				entry.Set(column, mysqlDateTime(values[i]))
			}
		case "is_completed":
			boolean := false
			if typed, ok := values[i].(bool); ok {
				boolean = typed
			}
			entry.Set(column, boolean)
		default:
			entry.Set(column, projectRawValue(values[i]))
		}
	}

	if flags.includeProject {
		project, err := rawProjectModel(ctx, pool, projectID)
		if err != nil {
			return nil, err
		}
		entry.Set("project", project)
	}

	for _, relation := range []struct {
		key   string
		table string
	}{
		{"arsitek", "arsiteks"},
		{"kontraktor", "kontraktors"},
		{"notaris", "notaris_profiles"},
		{"interior", "interior_profiles"},
		{"structural", "structural_engineers"},
		{"mep", "mep_engineers"},
	} {
		var profileID *int64
		if id, ok := byName[relation.key+"_id"].(int64); ok {
			profileID = &id
		}
		if profileID == nil || *profileID == 0 {
			entry.Set(relation.key, nil)
			continue
		}
		block, err := profileModelObject(ctx, pool, relation.table, *profileID, true)
		if err != nil {
			if isNoRows(err) {
				entry.Set(relation.key, nil)
				continue
			}
			return nil, err
		}
		entry.Set(relation.key, block)
	}

	return entry, rows.Err()
}

// ApproveMilestoneHandler serves
// `POST /api/projects/{project}/milestones/{milestone}/approve`.
func ApproveMilestoneHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("milestone")
		if rawID == "" {
			rawID = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/approve"))
		}
		milestoneID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectMilestone`, rawID)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("milestone-approve: viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := loadMilestoneRow(ctx, pool, projectID, milestoneID)
		if err != nil {
			slog.Error("milestone-approve: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("milestone-approve: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(fields, values)
		ownerID, _ := project["user_id"].(int64)
		var pmProfile *int64
		if id, ok := project["pm_id"].(int64); ok {
			pmProfile = &id
		}

		isPM := viewer.role == "project_manager" && verifyAssignedPM(viewer, pmProfile)
		isOwner := viewer.id == ownerID

		isLeadArsitek := false
		isLeadKontraktor := false
		if viewer.role == "arsitek" || viewer.role == "kontraktor" {
			subject, serr := loadSubject(ctx, pool, viewer.id)
			parties, perr := loadProjectParties(ctx, pool, projectID)
			if serr == nil && perr == nil && authzMatchesRole(parties, subject, viewer.role) {
				if viewer.role == "arsitek" {
					isLeadArsitek = true
				} else {
					isLeadKontraktor = true
				}
			}
		}
		canReview := (isLeadArsitek || isLeadKontraktor) &&
			(intPtrDeref(byName["structural_id"]) != 0 || intPtrDeref(byName["mep_id"]) != 0)

		if !isPM && !isOwner && !canReview {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		status, _ := byName["approval_status"].(string)
		milestoneTitle, _ := byName["title"].(string)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("milestone-approve: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		includeProject := false
		leadProCarbon := false
		pmVerifiedCarbon := false

		switch {
		case canReview && status == "pending":
			leadProCarbon = true
			if _, err := tx.Exec(ctx, `UPDATE project_milestones SET approval_status = 'reviewed',
				lead_pro_verified_at = date_trunc('second', now()), updated_at = date_trunc('second', now())
				WHERE id = $1`, milestoneID); err != nil {
				slog.Error("milestone-approve: review", "error", err)
				serverError(w)
				return
			}
			if err := insertActivityLog(ctx, tx, projectID, viewer.id, "milestone_reviewed",
				"Technical Review Completed: "+milestoneTitle); err != nil {
				slog.Error("milestone-approve: review log", "error", err)
				serverError(w)
				return
			}
			if ownerID != viewer.id {
				if err := insertNotification(ctx, tx, ownerID, "milestone_updated",
					"Technical Review Completed",
					"The lead professional completed the technical review of \""+milestoneTitle+"\". Final approval is pending.",
					`{"project_id": `+strconv.FormatInt(projectID, 10)+`, "milestone_id": `+strconv.FormatInt(milestoneID, 10)+`}`); err != nil {
					slog.Error("milestone-approve: review notify", "error", err)
					serverError(w)
					return
				}
			}

		case !isPM && !isOwner:
			message(w, http.StatusForbidden, "Only the Project Manager or Owner can give final approval.")
			return

		default:
			pmVerifiedCarbon = isPM
			if isPM {
				if _, err := tx.Exec(ctx, `UPDATE project_milestones SET is_completed = true,
					approval_status = 'approved', pm_verified_at = date_trunc('second', now()),
					updated_at = date_trunc('second', now()) WHERE id = $1`, milestoneID); err != nil {
					slog.Error("milestone-approve: final pm", "error", err)
					serverError(w)
					return
				}
			} else {
				if _, err := tx.Exec(ctx, `UPDATE project_milestones SET is_completed = true,
					approval_status = 'approved', updated_at = date_trunc('second', now()) WHERE id = $1`, milestoneID); err != nil {
					slog.Error("milestone-approve: final owner", "error", err)
					serverError(w)
					return
				}
			}

			// unlockLinkedTermin: every locked/pending stage becomes pending
			// and each one logs its own payment_triggered line.
			rows, err := tx.Query(ctx, `SELECT id, COALESCE(label, '') FROM project_payment_termins
				WHERE milestone_id = $1 AND status::text IN ('locked', 'pending') ORDER BY id`, milestoneID)
			if err != nil {
				slog.Error("milestone-approve: termins", "error", err)
				serverError(w)
				return
			}
			type staged struct {
				id    int64
				label string
			}
			stages := make([]staged, 0)
			for rows.Next() {
				var item staged
				if err := rows.Scan(&item.id, &item.label); err != nil {
					rows.Close()
					slog.Error("milestone-approve: termin scan", "error", err)
					serverError(w)
					return
				}
				stages = append(stages, item)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				slog.Error("milestone-approve: termin rows", "error", err)
				serverError(w)
				return
			}

			for _, stage := range stages {
				if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET status = 'pending',
					updated_at = date_trunc('second', now()) WHERE id = $1`, stage.id); err != nil {
					slog.Error("milestone-approve: stage", "error", err)
					serverError(w)
					return
				}
				if err := insertActivityLog(ctx, tx, projectID, viewer.id, "payment_triggered",
					"Progress Verified: '"+milestoneTitle+"'. Payment Termin '"+stage.label+"' is now unlocked and awaiting owner approval."); err != nil {
					slog.Error("milestone-approve: stage log", "error", err)
					serverError(w)
					return
				}
			}
			includeProject = len(stages) > 0

			if err := syncMilestoneVaultTx(ctx, tx, projectID, milestoneID, viewer.id, milestoneTitle, byName); err != nil {
				slog.Error("milestone-approve: vault", "error", err)
				serverError(w)
				return
			}

			if err := insertActivityLog(ctx, tx, projectID, viewer.id, "milestone_approved",
				"Final Verification: "+milestoneTitle); err != nil {
				slog.Error("milestone-approve: approve log", "error", err)
				serverError(w)
				return
			}

			proUser := milestoneProUserID(ctx, tx, byName)
			if proUser != 0 && proUser != viewer.id {
				if err := insertNotification(ctx, tx, proUser, "milestone_approved",
					"Milestone Approved",
					"\""+milestoneTitle+"\" was approved. Any linked payment termin has been unlocked.",
					`{"project_id": `+strconv.FormatInt(projectID, 10)+`, "milestone_id": `+strconv.FormatInt(milestoneID, 10)+`}`); err != nil {
					slog.Error("milestone-approve: notify", "error", err)
					serverError(w)
					return
				}
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("milestone-approve: commit", "error", err)
			serverError(w)
			return
		}

		entry, err := milestoneApproveObject(ctx, pool, projectID, milestoneID, milestoneRenderFlags{
			includeProject:   includeProject,
			leadProCarbon:    leadProCarbon,
			pmVerifiedCarbon: pmVerifiedCarbon,
		})
		if err != nil {
			slog.Error("milestone-approve: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// milestoneProUserID mirrors getMilestoneProUserId: the first non-null
// role relation's user id, in the controller's order.
func milestoneProUserID(ctx context.Context, tx pgx.Tx, byName map[string]any) int64 {
	for _, pair := range []struct {
		column string
		table  string
	}{
		{"arsitek_id", "arsiteks"},
		{"kontraktor_id", "kontraktors"},
		{"notaris_id", "notaris_profiles"},
		{"interior_id", "interior_profiles"},
		{"structural_id", "structural_engineers"},
		{"mep_id", "mep_engineers"},
	} {
		profileID := intPtrDeref(byName[pair.column])
		if profileID == 0 {
			continue
		}
		var userID *int64
		if err := tx.QueryRow(ctx, `SELECT user_id FROM `+pair.table+` WHERE id = $1`, profileID).Scan(&userID); err == nil && userID != nil {
			return *userID
		}
	}
	return 0
}

// syncMilestoneVault mirrors content.gallery into project_documents as
// verified rows, matching updateOrCreate on (project_id, file_path).
func syncMilestoneVaultTx(ctx context.Context, tx pgx.Tx, projectID, milestoneID, uploaderID int64, title string, byName map[string]any) error {
	decoded := eloquentJSONValue(byName["content"])
	content, ok := decoded.(map[string]any)
	if !ok {
		return nil
	}
	rawGallery, ok := content["gallery"].([]any)
	if !ok {
		return nil
	}

	fileNames := map[string]string{}
	if names, ok := content["file_names"].(map[string]any); ok {
		for key, value := range names {
			if s, ok := value.(string); ok {
				fileNames[key] = s
			}
		}
	}

	phase, _ := byName["phase_context"].(string)
	mtype, _ := byName["type"].(string)
	category := mtype
	if phase == "design" {
		category = "blueprint"
	}

	targetRole := ""
	switch {
	case intPtrDeref(byName["arsitek_id"]) != 0:
		targetRole = "architect"
	case intPtrDeref(byName["kontraktor_id"]) != 0:
		targetRole = "contractor"
	case intPtrDeref(byName["notaris_id"]) != 0:
		targetRole = "notary"
	case intPtrDeref(byName["interior_id"]) != 0:
		targetRole = "interior"
	case intPtrDeref(byName["pm_id"]) != 0:
		targetRole = "pm"
	case intPtrDeref(byName["structural_id"]) != 0:
		targetRole = "structural"
	case intPtrDeref(byName["mep_id"]) != 0:
		targetRole = "mep"
	}

	for _, item := range rawGallery {
		filePath, ok := item.(string)
		if !ok || filePath == "" {
			continue
		}
		fileName := title + " - " + path.Base(filePath)
		if custom, ok := fileNames[filePath]; ok && custom != "" {
			fileName = custom
		}
		ext := strings.TrimPrefix(path.Ext(filePath), ".")

		var target any
		if targetRole != "" {
			target = targetRole
		}
		var categoryValue any
		if category != "" {
			categoryValue = category
		}

		tag, err := tx.Exec(ctx, `UPDATE project_documents SET uploader_id = $3, file_name = $4,
			file_type = $5, category = $6, status = 'verified', version_label = $7, target_role = $8,
			updated_at = date_trunc('second', now())
			WHERE project_id = $1 AND file_path = $2`,
			projectID, filePath, uploaderID, fileName, ext, categoryValue, title, target)
		if err != nil {
			return err
		}
		if tag.RowsAffected() > 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `INSERT INTO project_documents
			(project_id, uploader_id, file_name, file_path, file_type, category, status, version_label, target_role, version, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, 'verified', $7, $8, 1, date_trunc('second', now()), date_trunc('second', now()))`,
			projectID, uploaderID, fileName, filePath, ext, categoryValue, title, target); err != nil {
			return err
		}
	}

	return nil
}
