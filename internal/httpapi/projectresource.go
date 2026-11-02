package httpapi

import (
	"context"
	"encoding/json"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"strconv"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT RESOURCE — the shared serialiser behind the S2 reads.
//
// The key order below IS the contract (PHP preserves insertion order), and
// every `whenLoaded` gate is driven by the endpoint's load spec: the list
// loads images, milestones, the owner phones, the viewer's own role bids
// and viewer-scoped sub-professionals; the show loads the hired
// professionals, ratings, requirements, addendums, all sub-professionals
// and the viewer's own role bids. Neither loads documents, external
// vendors, payment termins, comments, warranty claims, timeline
// extensions, change orders or snag items — so those blocks stay omitted
// and their summaries read zero.

// projectColumnsByName indexes a row's values by column.
func projectColumnsByName(fields []string, values []any) map[string]any {
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}
	return byName
}

// projectInt reads a nullable integer column or 0.
func projectInt(values []any, fields []string, column string) int64 {
	for i, name := range fields {
		if name != column {
			continue
		}
		switch typed := values[i].(type) {
		case nil:
			return 0
		case int64:
			return typed
		case int32:
			return int64(typed)
		case int:
			return int64(typed)
		default:
			return 0
		}
	}
	return 0
}

// projectIntPtr reads a nullable integer column, preserving null.
func projectIntPtr(values []any, fields []string, column string) *int64 {
	for i, name := range fields {
		if name != column {
			continue
		}
		switch typed := values[i].(type) {
		case nil:
			return nil
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
	return nil
}

// projectText reads a nullable text column or nil.
func projectText(values []any, fields []string, column string) any {
	for i, name := range fields {
		if name != column {
			continue
		}
		if values[i] == nil {
			return nil
		}
		if s, ok := values[i].(string); ok {
			return s
		}
		return jsonVal(values[i])
	}
	return nil
}

// projectDecimal reads a numeric column exactly as Eloquent's `decimal:2`
// cast does: the stored text with its scale, or nil.
func projectDecimal(values []any, fields []string, column string) any {
	for i, name := range fields {
		if name != column {
			continue
		}
		if values[i] == nil {
			return nil
		}
		if s, ok := values[i].(string); ok {
			return s
		}
		return jsonVal(values[i])
	}
	return nil
}

// projectFloat reads a numeric column the way the `float` cast does.
func projectFloat(values []any, fields []string, column string) any {
	for i, name := range fields {
		if name != column {
			continue
		}
		if values[i] == nil {
			return nil
		}
		if s, ok := values[i].(string); ok {
			if parsed, err := strconv.ParseFloat(s, 64); err == nil {
				return parsed
			}
			return nil
		}
		return jsonVal(values[i])
	}
	return nil
}

// projectBool reads a boolean column or nil when the column is null.
func projectBool(values []any, fields []string, column string) any {
	for i, name := range fields {
		if name != column {
			continue
		}
		if values[i] == nil {
			return nil
		}
		if b, ok := values[i].(bool); ok {
			return b
		}
		return nil
	}
	return nil
}

// projectTime reads a timestamptz column in Carbon form, or nil.
func projectTime(values []any, fields []string, column string) any {
	for i, name := range fields {
		if name != column {
			continue
		}
		if values[i] == nil {
			return nil
		}
		if typed, ok := values[i].(time.Time); ok {
			return carbon(&typed)
		}
		return jsonVal(values[i])
	}
	return nil
}

// projectDate reads a date column as `Y-m-d`, or nil.
func projectDate(values []any, fields []string, column string) any {
	for i, name := range fields {
		if name != column {
			continue
		}
		if values[i] == nil {
			return nil
		}
		if typed, ok := values[i].(time.Time); ok {
			return typed.Format("2006-01-02")
		}
		if s, ok := values[i].(string); ok && len(s) >= 10 {
			return s[:10]
		}
		return jsonVal(values[i])
	}
	return nil
}

// projectJSONArray reads a jsonb column as an array, defaulting to an
// empty list exactly where the resource writes `?? []`.
func projectJSONArray(values []any, fields []string, column string) any {
	raw := projectJSONRaw(values, fields, column)
	if raw == "" {
		return []any{}
	}

	var decoded any
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		return []any{}
	}

	if decoded == nil {
		return []any{}
	}

	if list, ok := decoded.([]any); ok {
		if list == nil {
			return []any{}
		}
		return list
	}

	return decoded
}

// projectJSONValue reads a jsonb column as-is: null stays null, objects
// and arrays decode.
func projectJSONValue(values []any, fields []string, column string) any {
	raw := projectJSONRaw(values, fields, column)
	if raw == "" {
		return nil
	}

	var decoded any
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		return raw
	}

	return decoded
}

// projectJSONRaw renders a jsonb column to its text. pgx hands jsonb
// back decoded already ([]any/map) as often as raw ([]byte/string) —
// both spellings are normalised here.
func projectJSONRaw(values []any, fields []string, column string) string {
	for i, name := range fields {
		if name != column {
			continue
		}
		if values[i] == nil {
			return ""
		}
		switch typed := values[i].(type) {
		case string:
			return typed
		case []byte:
			return string(typed)
		default:
			if encoded, err := json.Marshal(values[i]); err == nil {
				return string(encoded)
			}
			return ""
		}
	}
	return ""
}

// projectColumns picks nullable int64 columns by name.
func projectColumns(values []any, fields []string, columns ...string) map[string]*int64 {
	out := map[string]*int64{}
	for _, column := range columns {
		out[column] = projectIntPtr(values, fields, column)
	}
	return out
}

// projectResource builds the full `ProjectResource` object: every key, in
// order, with `whenLoaded` driven by the load spec.
func projectResource(ctx context.Context, pool *pgxpool.Pool, fields []string, values []any, viewer *projectViewer, spec projectLoad, histories map[int64]*clientHistory) (*jsonphp.Object, error) {
	byName := projectColumnsByName(fields, values)

	id, _ := byName["id"].(int64)
	ownerID, _ := byName["user_id"].(int64)

	pmID := projectIntPtr(values, fields, "pm_id")
	privileged := viewer.privileged(ownerID, pmID)

	canViewPhone, err := projectCanViewPhone(ctx, pool, viewer, id, ownerID, pmID, byName, spec)
	if err != nil {
		return nil, err
	}

	hasBid, err := projectHasSubmittedBid(ctx, pool, viewer, id, spec)
	if err != nil {
		return nil, err
	}

	row := jsonphp.NewObject()
	row.Set("id", id)
	row.Set("has_submitted_bid", hasBid)
	row.Set("title", projectText(values, fields, "title"))
	row.Set("description", projectText(values, fields, "description"))
	row.Set("budget", projectDecimal(values, fields, "budget"))
	row.Set("location", projectText(values, fields, "lokasi"))
	row.Set("latitude", projectGatedFloat(projectFloat(values, fields, "latitude"), canViewPhone))
	row.Set("longitude", projectGatedFloat(projectFloat(values, fields, "longitude"), canViewPhone))
	row.Set("province", projectText(values, fields, "province"))
	row.Set("city", projectText(values, fields, "city"))
	row.Set("kecamatan", projectText(values, fields, "kecamatan"))
	row.Set("kelurahan", projectGated(projectText(values, fields, "kelurahan"), canViewPhone))
	row.Set("postal_code", projectGated(projectText(values, fields, "postal_code"), canViewPhone))
	row.Set("street_name", projectGated(projectText(values, fields, "street_name"), canViewPhone))
	row.Set("type", projectText(values, fields, "jenis_proyek"))
	row.Set("target_role", projectText(values, fields, "target_role"))
	row.Set("status", projectText(values, fields, "status"))
	row.Set("project_category", projectText(values, fields, "project_category"))
	row.Set("deadline", projectDate(values, fields, "deadline"))
	row.Set("attachment", projectText(values, fields, "attachment"))
	row.Set("owner_id", ownerID)
	row.Set("user_id", ownerID)

	owner, err := projectOwnerBlock(ctx, pool, ownerID, canViewPhone, spec.ownerPhone)
	if err != nil {
		return nil, err
	}
	row.Set("owner", owner)

	row.Set("selected_arsitek_id", projectIntOrNil(values, fields, "selected_arsitek_id"))
	row.Set("selected_kontraktor_id", projectIntOrNil(values, fields, "selected_kontraktor_id"))
	row.Set("selected_notaris_id", projectIntOrNil(values, fields, "selected_notaris_id"))
	row.Set("selected_interior_id", projectIntOrNil(values, fields, "selected_interior_id"))
	row.Set("completed_phases", projectJSONArray(values, fields, "completed_phases"))
	row.Set("needed_phases", projectJSONArray(values, fields, "needed_phases"))
	row.Set("design_completed_at", projectTime(values, fields, "design_completed_at"))
	row.Set("design_locked_at", projectTime(values, fields, "design_locked_at"))
	row.Set("design_authorized_at", projectTime(values, fields, "design_authorized_at"))
	row.Set("design_details", projectDesignDetails(ctx, projectJSONValue(values, fields, "design_details")))
	row.Set("legal_requirements", projectJSONArray(values, fields, "legal_requirements"))
	row.Set("construction_completed_at", projectTime(values, fields, "construction_completed_at"))
	row.Set("construction_locked_at", projectTime(values, fields, "construction_locked_at"))
	row.Set("construction_authorized_at", projectTime(values, fields, "construction_authorized_at"))
	row.Set("materials_authorized_at", projectTime(values, fields, "materials_authorized_at"))
	row.Set("interior_completed_at", projectTime(values, fields, "interior_completed_at"))
	row.Set("interior_locked_at", projectTime(values, fields, "interior_locked_at"))
	row.Set("legal_locked_at", projectTime(values, fields, "legal_locked_at"))
	row.Set("construction_details", projectPII(projectJSONValue(values, fields, "construction_details"), privileged))
	row.Set("interior_details", projectJSONValue(values, fields, "interior_details"))
	row.Set("design_handover_submitted_at", projectTime(values, fields, "design_handover_submitted_at"))
	row.Set("design_handover_notes", projectText(values, fields, "design_handover_notes"))
	row.Set("construction_handover_submitted_at", projectTime(values, fields, "construction_handover_submitted_at"))
	row.Set("construction_handover_notes", projectText(values, fields, "construction_handover_notes"))
	row.Set("interior_handover_submitted_at", projectTime(values, fields, "interior_handover_submitted_at"))
	row.Set("interior_handover_notes", projectText(values, fields, "interior_handover_notes"))
	row.Set("legal_handover_submitted_at", projectTime(values, fields, "legal_handover_submitted_at"))
	row.Set("legal_handover_notes", projectText(values, fields, "legal_handover_notes"))
	row.Set("construction_brief_status", projectText(values, fields, "construction_brief_status"))
	row.Set("construction_brief_revision_notes", projectText(values, fields, "construction_brief_revision_notes"))
	row.Set("pbg_verified_at", projectTime(values, fields, "pbg_verified_at"))
	row.Set("slf_verified_at", projectTime(values, fields, "slf_verified_at"))
	row.Set("final_walkthrough_at", projectTime(values, fields, "final_walkthrough_at"))
	row.Set("walkthrough_status", projectWalkthroughStatus(values, fields))
	row.Set("owner_accepted_at", projectTime(values, fields, "owner_accepted_at"))
	row.Set("owner_acceptance_notes", projectText(values, fields, "owner_acceptance_notes"))
	row.Set("owner_design_approved_at", projectTime(values, fields, "owner_design_approved_at"))
	row.Set("owner_build_approved_at", projectTime(values, fields, "owner_build_approved_at"))
	row.Set("owner_interior_approved_at", projectTime(values, fields, "owner_interior_approved_at"))
	row.Set("owner_legal_approved_at", projectTime(values, fields, "owner_legal_approved_at"))
	row.Set("warranty_start_at", projectTime(values, fields, "warranty_start_at"))
	row.Set("warranty_end_at", projectTime(values, fields, "warranty_end_at"))
	row.Set("retention_balance", 0)
	row.Set("snag_counts", projectSnagCounts())
	row.Set("change_order_summary", projectChangeOrderSummary())

	if spec.budgetSummary {
		summary, err := projectBudgetSummary(ctx, pool, id, projectDecimal(values, fields, "budget"))
		if err != nil {
			return nil, err
		}
		row.Set("budget_summary", summary)
	}

	if spec.clientHistory {
		if history, ok := histories[ownerID]; ok && history != nil {
			row.Set("client_history", history.object())
		}
	}

	row.Set("wants_project_manager", projectBoolOrFalse(values, fields, "wants_project_manager"))
	row.Set("requires_structural", projectBool(values, fields, "requires_structural"))
	row.Set("requires_mep", projectBool(values, fields, "requires_mep"))
	row.Set("project_dimensions", projectJSONValue(values, fields, "project_dimensions"))
	row.Set("requires_interior", projectBool(values, fields, "requires_interior"))
	row.Set("planning_status", projectText(values, fields, "planning_status"))
	row.Set("negotiated_fee", projectDecimal(values, fields, "negotiated_fee"))
	row.Set("payment_instructions", projectText(values, fields, "payment_instructions"))
	row.Set("planning_submitted_at", projectTime(values, fields, "planning_submitted_at"))
	row.Set("planning_approved_at", projectTime(values, fields, "planning_approved_at"))
	row.Set("design_payment_verified_at", projectTime(values, fields, "design_payment_verified_at"))
	row.Set("design_locked_at", projectTime(values, fields, "design_locked_at"))
	row.Set("pm_id", projectIntOrNil(values, fields, "pm_id"))
	row.Set("pm_audit_notes", projectText(values, fields, "pm_audit_notes"))
	row.Set("pm_audit_attachments", projectResolvedStringList(ctx, projectJSONValue(values, fields, "pm_audit_attachments")))
	row.Set("architect_notes", projectText(values, fields, "architect_notes"))
	row.Set("planning_iteration", projectInt(values, fields, "planning_iteration"))
	row.Set("structural_id", projectIntOrNil(values, fields, "structural_id"))
	row.Set("mep_id", projectIntOrNil(values, fields, "mep_id"))
	row.Set("is_structural_hired_4c", projectInt(values, fields, "structural_id") != 0)
	row.Set("is_mep_hired_4c", projectInt(values, fields, "mep_id") != 0)

	if spec.specialists {
		structural, err := projectSpecialistProfile(ctx, pool, "structural", id, projectIntPtr(values, fields, "structural_id"))
		if err != nil {
			return nil, err
		}
		row.Set("structural_profile", structural)

		mep, err := projectSpecialistProfile(ctx, pool, "mep", id, projectIntPtr(values, fields, "mep_id"))
		if err != nil {
			return nil, err
		}
		row.Set("mep_profile", mep)

		interior, err := projectSpecialistProfile(ctx, pool, "interior", id, projectIntPtr(values, fields, "selected_interior_id"))
		if err != nil {
			return nil, err
		}
		row.Set("interior_profile", interior)
	} else {
		row.Set("structural_profile", nil)
		row.Set("mep_profile", nil)
		row.Set("interior_profile", nil)
	}

	if len(spec.engineers) > 0 {
		byKey := map[string]struct {
			table   string
			id      *int64
			ratings bool
			phones  bool
		}{
			"structural_engineer": {"structural_engineers", projectIntPtr(values, fields, "structural_id"), false, spec.engineerPhones},
			"mep_engineer":        {"mep_engineers", projectIntPtr(values, fields, "mep_id"), false, spec.engineerPhones},
			"interior_engineer":   {"interior_profiles", projectIntPtr(values, fields, "selected_interior_id"), true, spec.engineerPhones},
		}

		for _, key := range spec.engineers {
			full, ok := byKey[key]
			if !ok {
				continue
			}

			if full.id == nil {
				row.Set(key, nil)
				continue
			}

			block, err := fullProfileBlock(ctx, pool, full.table, *full.id, true, spec.engineerRatings && full.ratings, full.phones)
			if err != nil {
				return nil, err
			}
			row.Set(key, block)
		}
	}

	row.Set("structural_approved_at", projectTime(values, fields, "structural_approved_at"))
	row.Set("mep_approved_at", projectTime(values, fields, "mep_approved_at"))
	row.Set("interior_approved_at", projectTime(values, fields, "owner_interior_approved_at"))
	row.Set("share_token", projectGated(projectText(values, fields, "share_token"), privileged))

	destinations, err := projectPayoutDestinations(ctx, pool, viewer, id, byName, privileged)
	if err != nil {
		return nil, err
	}
	row.Set("payout_destinations", destinations)

	row.Set("legal_detail", projectText(values, fields, "legal_detail"))
	row.Set("wants_to_discuss_later", projectBoolOrFalse(values, fields, "wants_to_discuss_later"))
	row.Set("published_bidding_roles", projectJSONArray(values, fields, "published_bidding_roles"))
	row.Set("bidding_choices", projectJSONArray(values, fields, "bidding_choices"))
	if spec.documents {
		docs, err := resourceDocuments(ctx, pool, id)
		if err != nil {
			return nil, err
		}
		row.Set("documents", docs)
	}

	row.Set("created_at", projectTime(values, fields, "created_at"))
	row.Set("updated_at", projectTime(values, fields, "updated_at"))

	counts := map[string]int64{}
	if len(spec.countRoles) > 0 {
		all, err := projectBidCounts(ctx, pool, id)
		if err != nil {
			return nil, err
		}
		for _, role := range spec.countRoles {
			counts[role] = all[role]
		}
	}
	for _, role := range bidCountRoles {
		row.Set("bids_"+role+"_count", counts[role])
	}

	loaded, err := loadViewerBids(ctx, pool, id, viewer, spec)
	if err != nil {
		return nil, err
	}

	bySpelling, _, err := registryIDs(ctx, pool)
	if err != nil {
		return nil, err
	}

	if spec.addendums {
		addendums, err := projectAddendums(ctx, pool, id)
		if err != nil {
			return nil, err
		}
		row.Set("addendums", addendums)
	}

	if spec.comments {
		thread, err := resourceComments(ctx, pool, id)
		if err != nil {
			return nil, err
		}
		row.Set("comments", thread)
	}

	if spec.images {
		images, err := projectImages(ctx, pool, id)
		if err != nil {
			return nil, err
		}
		row.Set("images", images)
	}

	if err := renderBidLists(ctx, pool, row, id, viewer, privileged, loaded, []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager"}, bySpelling, !spec.bidsWithoutBidder); err != nil {
		return nil, err
	}

	if spec.milestones {
		milestones, err := projectMilestones(ctx, pool, id)
		if err != nil {
			return nil, err
		}
		row.Set("milestones", milestones)
	}

	if spec.ratings {
		review, err := projectReview(ctx, pool, "arsitek_ratings", "arsitek_id", projectArsitekForReview(ctx, pool, projectIntPtr(values, fields, "selected_arsitek_id")))
		if err != nil {
			return nil, err
		}
		row.Set("review_arsitek", review)

		kontraktorReview, err := projectKontraktorReview(ctx, pool, id)
		if err != nil {
			return nil, err
		}
		row.Set("review_kontraktor", kontraktorReview)
	}

	if spec.hiredPros {
		if err := projectFullProfessionals(ctx, pool, row, id, projectIntPtr(values, fields, "selected_arsitek_id"), projectIntPtr(values, fields, "selected_kontraktor_id"), projectIntPtr(values, fields, "selected_notaris_id"), projectIntPtr(values, fields, "selected_interior_id")); err != nil {
			return nil, err
		}
	}

	if spec.requirements {
		requirements, err := projectRequirements(ctx, pool, id)
		if err != nil {
			return nil, err
		}
		row.Set("requirements", requirements)
	}

	if spec.pmBlock {
		if pmID != nil {
			profile, err := projectManagerBlock(ctx, pool, *pmID)
			if err != nil {
				return nil, err
			}
			row.Set("project_manager", profile)
		} else {
			row.Set("project_manager", nil)
		}
	}

	if err := renderBidLists(ctx, pool, row, id, viewer, privileged, loaded, []string{"structural", "mep"}, bySpelling, !spec.bidsWithoutBidder); err != nil {
		return nil, err
	}

	if hasEngineer(spec.engineers, "structural_engineer") {
		if sid := projectIntPtr(values, fields, "structural_id"); sid != nil {
			short, err := projectShortProfessional(ctx, pool, "structural_engineers", *sid)
			if err != nil {
				return nil, err
			}
			row.Set("structural", short)
		} else {
			row.Set("structural", nil)
		}
	}

	if hasEngineer(spec.engineers, "mep_engineer") {
		if mid := projectIntPtr(values, fields, "mep_id"); mid != nil {
			short, err := projectShortProfessional(ctx, pool, "mep_engineers", *mid)
			if err != nil {
				return nil, err
			}
			row.Set("mep", short)
		} else {
			row.Set("mep", nil)
		}
	}

	if err := renderAcceptedBids(ctx, pool, row, loaded, viewer, privileged); err != nil {
		return nil, err
	}

	// accept-bid is the only S2 read that loads the relation; live it is
	// always empty, and no S2 write ever creates a termin.
	if spec.paymentTermins {
		termins, err := projectResourceTermins(ctx, pool, id)
		if err != nil {
			return nil, err
		}
		row.Set("payment_termins", termins)
	}

	if spec.subPros != "" {
		subs, err := projectSubProfessionals(ctx, pool, id, viewer, spec.subPros == "viewer")
		if err != nil {
			return nil, err
		}
		row.Set("sub_professionals", subs)
	}

	return row, nil
}

// hasEngineer reports whether the load spec renders an engineer block.
func hasEngineer(engineers []string, key string) bool {
	for _, item := range engineers {
		if item == key {
			return true
		}
	}
	return false
}

// projectGated returns the value for entitled viewers and nil otherwise.
func projectGated(value any, allowed bool) any {
	if allowed {
		return value
	}
	return nil
}

// projectGatedFloat gates a float the same way.
func projectGatedFloat(value any, allowed bool) any {
	if allowed {
		return value
	}
	return nil
}

// projectPII is the resource's pii(): privileged viewers see the value,
// everyone else null.
func projectPII(value any, privileged bool) any {
	if privileged {
		return value
	}
	return nil
}

// projectIntOrNil preserves null for nullable id columns.
func projectIntOrNil(values []any, fields []string, column string) any {
	return nullableInt64(projectIntPtr(values, fields, column))
}

// projectBoolOrFalse renders a nullable boolean as false when null.
func projectBoolOrFalse(values []any, fields []string, column string) any {
	if value := projectBool(values, fields, column); value != nil {
		return value
	}
	return false
}

// projectWalkthroughStatus mirrors the fallback: the column, else
// completed when accepted, else pending when walked, else null.
func projectWalkthroughStatus(values []any, fields []string) any {
	if status := projectText(values, fields, "walkthrough_status"); status != nil {
		return status
	}

	if projectTime(values, fields, "owner_accepted_at") != nil {
		return "completed"
	}
	if projectTime(values, fields, "final_walkthrough_at") != nil {
		return "pending"
	}
	return nil
}

// projectSnagCounts is four zeros: snag items are never loaded here.
func projectSnagCounts() *jsonphp.Object {
	counts := jsonphp.NewObject()
	counts.Set("open", 0)
	counts.Set("in_progress", 0)
	counts.Set("resolved", 0)
	counts.Set("accepted", 0)
	return counts
}

// projectChangeOrderSummary is zeros: change orders are never loaded here.
func projectChangeOrderSummary() *jsonphp.Object {
	summary := jsonphp.NewObject()
	summary.Set("total_cost_impact", 0)
	summary.Set("pending_count", 0)
	return summary
}

// projectDesignDetails resolves requirement image URLs inside the
// design details document, exactly like the resource.
func projectDesignDetails(ctx context.Context, value any) any {
	details, ok := value.(map[string]any)
	if !ok || details == nil {
		return value
	}

	requirements, ok := details["requirements"].([]any)
	if !ok {
		return value
	}

	for _, item := range requirements {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if image, ok := entry["image_url"].(string); ok && image != "" {
			entry["image_url"] = projectStorageURL(ctx, image)
		}
	}

	return value
}

// projectResolvedStringList resolves every path in a JSON string list.
func projectResolvedStringList(ctx context.Context, value any) any {
	list, ok := value.([]any)
	if !ok || list == nil {
		return []any{}
	}

	out := make([]any, 0, len(list))
	for _, item := range list {
		if path, ok := item.(string); ok {
			out = append(out, projectStorageURL(ctx, path))
		} else {
			out = append(out, item)
		}
	}

	return out
}

// projectOwnerBlock builds the minimal owner slice: id, name, and the
// first phone contact for entitled viewers. Email never appears here.
func projectOwnerBlock(ctx context.Context, pool *pgxpool.Pool, ownerID int64, canViewPhone, withPhones bool) (*jsonphp.Object, error) {
	if ownerID == 0 {
		return nil, nil
	}

	var id int64
	var name string
	if err := pool.QueryRow(ctx, `SELECT id, name FROM users WHERE id = $1`, ownerID).Scan(&id, &name); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	var phone any
	if canViewPhone && withPhones {
		var contact *string
		_ = pool.QueryRow(ctx, `SELECT contact FROM phone_user WHERE id_user = $1 ORDER BY id LIMIT 1`, id).Scan(&contact)
		phone = nullableString(contact)
	}

	owner := jsonphp.NewObject()
	owner.Set("id", id)
	owner.Set("name", name)
	owner.Set("phone", phone)

	return owner, nil
}

// projectCanViewPhone mirrors the resource rule: the owner, the assigned
// PM, a hired professional, or an active sub-professional assignment.
func projectCanViewPhone(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID, ownerID int64, pmID *int64, byName map[string]any, spec projectLoad) (bool, error) {
	if viewer == nil || viewer.id == 0 {
		return false, nil
	}

	if viewer.id == ownerID {
		return true, nil
	}

	if pmID != nil && *pmID != 0 {
		// NOTE: this reproduces the controller's own comparison,
		// `$user->id === $this->pm_id`, which matches the CALLER's USER
		// id against a column that holds a PROFILE id. `Hire::isAssignedPm`
		// (used by the pii gate) compares profile ids instead — the two
		// rules genuinely disagree in the legacy code, and parity means
		// reproducing the disagreement, not resolving it.
		if viewer.id == *pmID {
			return true, nil
		}
	}

	selected := map[string]string{
		"selected_arsitek_id":    identity.RoleArsitek.String(),
		"selected_kontraktor_id": identity.RoleKontraktor.String(),
		"selected_notaris_id":    identity.RoleNotaris.String(),
		"selected_interior_id":   identity.RoleInterior.String(),
		"structural_id":          identity.RoleStructural.String(),
		"mep_id":                 identity.RoleMep.String(),
	}

	for column, role := range selected {
		raw, ok := byName[column]
		if !ok || raw == nil {
			continue
		}
		var hired int64
		switch typed := raw.(type) {
		case int64:
			hired = typed
		case int32:
			hired = int64(typed)
		case int:
			hired = int64(typed)
		default:
			continue
		}
		if hired == 0 {
			continue
		}
		if own, ok := viewer.profiles[role]; ok && own == hired {
			return true, nil
		}
	}

	if spec.subPros == "viewer" {
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2 AND status::text = 'active')`,
			projectID, viewer.id).Scan(&exists); err != nil {
			return false, err
		}
		return exists, nil
	}

	if spec.subPros == "all" {
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2 AND status::text = 'active')`,
			projectID, viewer.id).Scan(&exists); err != nil {
			return false, err
		}
		return exists, nil
	}

	return false, nil
}

// projectHasSubmittedBid mirrors the resource: a non-invited bid from the
// viewer's own profile — from the loaded relation when present, else a
// targeted exists query.
func projectHasSubmittedBid(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64, spec projectLoad) (bool, error) {
	if viewer == nil || viewer.id == 0 || viewer.role == "" {
		return false, nil
	}

	own, ok := viewer.profiles[viewer.role]
	if !ok || own == 0 {
		return false, nil
	}

	column, ok := bidProfileColumn(viewer.role)
	if !ok {
		return false, nil
	}

	for _, loaded := range spec.viewerBidRoles {
		if loaded != viewer.role {
			continue
		}
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM bids WHERE project_id = $1 AND role::text = $2 AND `+column+` = $3 AND status::text <> 'invited')`,
			projectID, viewer.role, own).Scan(&exists); err != nil {
			return false, err
		}
		return exists, nil
	}

	// Not loaded for this role: the exists query the resource falls back to.
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM bids WHERE project_id = $1 AND role::text = $2 AND `+column+` = $3 AND status::text <> 'invited')`,
		projectID, viewer.role, own).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}
