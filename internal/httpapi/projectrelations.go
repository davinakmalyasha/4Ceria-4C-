package httpapi

import (
	"context"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RELATION BUILDERS for the project resource.

// projectImages lists a project's images in sort order.
func projectImages(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	m, err := projectImagesBatch(ctx, pool, []int64{projectID})
	if err != nil {
		return nil, err
	}
	return m[projectID], nil
}

// projectImagesBatch lists images for many projects in ONE query
// (WHERE project_id = ANY($1)). The list path was N+1: one query per row
// in a 50-row page. Callers that need per-project omission semantics keep
// calling projectImages; projectList uses the batch.
func projectImagesBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64) (map[int64][]any, error) {
	out := map[int64][]any{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT project_id, id, image_path, sort_order FROM project_images WHERE project_id = ANY($1) ORDER BY project_id, sort_order, id`, projectIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var pid, id int64
		var path *string
		var sortOrder int
		if err := rows.Scan(&pid, &id, &path, &sortOrder); err != nil {
			return nil, err
		}
		item := jsonphp.NewObject()
		item.Set("id", id)
		item.Set("url", projectStorageURL(ctx, nullableString(path)))
		item.Set("sort_order", sortOrder)
		out[pid] = append(out[pid], item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Preserve empty (not null) for projects with no images, matching the
	// single-row path which returns an empty list.
	for _, pid := range projectIDs {
		if _, ok := out[pid]; !ok {
			out[pid] = []any{}
		}
	}
	return out, nil
}

// projectMilestones lists a project's milestones, resolving gallery
// image URLs exactly like the model's accessor does.
func projectMilestones(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	m, err := projectMilestonesBatch(ctx, pool, []int64{projectID})
	if err != nil {
		return nil, err
	}
	return m[projectID], nil
}

// projectMilestonesBatch lists milestones for many projects in ONE query.
// Same N+1 rationale as projectImagesBatch.
func projectMilestonesBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64) (map[int64][]any, error) {
	out := map[int64][]any{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `
		SELECT project_id, id, title, description, type, content, approval_status, phase_context,
		       start_date, due_date, is_completed,
		       arsitek_id, kontraktor_id, notaris_id, interior_id, structural_id, mep_id,
		       review_note, review_status, created_at
		  FROM project_milestones WHERE project_id = ANY($1) ORDER BY project_id, id
	`, projectIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var pid, id int64
		var title, description, milestoneType *string
		var content []byte
		var approvalStatus, phaseContext *string
		var startDate, dueDate *time.Time
		var completed bool
		var arsitekID, kontraktorID, notarisID, interiorID, structuralID, mepID *int64
		var reviewNote, reviewStatus *string
		var createdAt *time.Time

		if err := rows.Scan(&pid, &id, &title, &description, &milestoneType, &content, &approvalStatus, &phaseContext,
			&startDate, &dueDate, &completed,
			&arsitekID, &kontraktorID, &notarisID, &interiorID, &structuralID, &mepID,
			&reviewNote, &reviewStatus, &createdAt); err != nil {
			return nil, err
		}

		item := jsonphp.NewObject()
		item.Set("id", id)
		item.Set("title", nullableString(title))
		item.Set("description", nullableString(description))
		item.Set("type", nullableString(milestoneType))
		item.Set("content", milestoneContent(ctx, content))
		item.Set("approval_status", nullableString(approvalStatus))
		item.Set("phase_context", nullableString(phaseContext))
		item.Set("start_date", milestoneDate(startDate))
		item.Set("due_date", milestoneDate(dueDate))
		item.Set("is_completed", completed)
		item.Set("arsitek_id", nullableInt64(arsitekID))
		item.Set("kontraktor_id", nullableInt64(kontraktorID))
		item.Set("notaris_id", nullableInt64(notarisID))
		item.Set("interior_id", nullableInt64(interiorID))
		item.Set("structural_id", nullableInt64(structuralID))
		item.Set("mep_id", nullableInt64(mepID))
		item.Set("review_note", nullableString(reviewNote))
		item.Set("review_status", nullableString(reviewStatus))
		item.Set("created_at", carbon(createdAt))
		out[pid] = append(out[pid], item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, pid := range projectIDs {
		if _, ok := out[pid]; !ok {
			out[pid] = []any{}
		}
	}
	return out, nil
}

// milestoneContent mirrors the resource: a gallery map gets its URLs
// resolved, anything else passes through.
func milestoneContent(ctx context.Context, raw []byte) any {
	if len(raw) == 0 {
		return nil
	}

	decoded := decodeJSONValue(string(raw))

	asMap, ok := decoded.(map[string]any)
	if !ok {
		return decoded
	}

	gallery, ok := asMap["gallery"].([]any)
	if !ok {
		return decoded
	}

	resolved := make([]any, 0, len(gallery))
	for _, file := range gallery {
		if path, ok := file.(string); ok && path != "" {
			resolved = append(resolved, projectStorageURL(ctx, path))
		}
	}
	asMap["gallery"] = resolved

	return asMap
}

// milestoneDate renders a nullable date or null.
func milestoneDate(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.Format("2006-01-02")
}

// projectRequirements lists a project's procurement requirements.
func projectRequirements(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, name, quantity_required::text, quantity_procured_externally::text, external_cost::text,
		       quantity_on_site::text, quantity_used::text, unit, quality_level, image_path, created_at
		  FROM project_requirements WHERE project_id = $1 ORDER BY id
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		var id int64
		var name *string
		var qtyRequired, qtyExternal, extCost, qtySite, qtyUsed *string
		var unit, quality, imagePath *string
		var createdAt *time.Time

		if err := rows.Scan(&id, &name, &qtyRequired, &qtyExternal, &extCost,
			&qtySite, &qtyUsed, &unit, &quality, &imagePath, &createdAt); err != nil {
			return nil, err
		}

		item := jsonphp.NewObject()
		item.Set("id", id)
		item.Set("name", nullableString(name))
		item.Set("quantity_required", projectDecimalText(qtyRequired))
		item.Set("quantity_procured_externally", projectDecimalText(qtyExternal))
		item.Set("external_cost", projectDecimalText(extCost))
		item.Set("quantity_on_site", projectDecimalText(qtySite))
		item.Set("quantity_used", projectDecimalText(qtyUsed))
		item.Set("unit", nullableString(unit))
		item.Set("quality_level", nullableString(quality))
		item.Set("image_url", projectStorageURL(ctx, nullableString(imagePath)))
		item.Set("created_at", carbon(createdAt))
		list = append(list, item)
	}

	return list, rows.Err()
}

// decimalText renders a decimal column value or nil.
func projectDecimalText(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

// projectAddendums lists a project's addendums with their team member
// and assigned user slices.
func projectAddendums(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, role_type, user_id, assigned_user_id, team_member_id, title, description,
		       amount::text, counter_offer_amount::text, negotiation_note, type, specialist_type,
		       status, paid_at, verification_notes, payment_proof_path, created_at
		  FROM project_addendums WHERE project_id = $1 ORDER BY id
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		var id int64
		var roleType *string
		var userID, assignedUserID, teamMemberID *int64
		var title, description *string
		var amount, counterOffer *string
		var negotiationNote, addendumType, specialistType *string
		var status *string
		var paidAt *time.Time
		var verificationNotes, paymentProofPath *string
		var createdAt *time.Time

		if err := rows.Scan(&id, &roleType, &userID, &assignedUserID, &teamMemberID, &title, &description,
			&amount, &counterOffer, &negotiationNote, &addendumType, &specialistType,
			&status, &paidAt, &verificationNotes, &paymentProofPath, &createdAt); err != nil {
			return nil, err
		}

		var teamMember any
		if teamMemberID != nil {
			member, err := addendumTeamMember(ctx, pool, *teamMemberID)
			if err != nil {
				return nil, err
			}
			teamMember = member
		}

		var assignedUser any
		if assignedUserID != nil {
			user, err := addendumAssignedUser(ctx, pool, *assignedUserID)
			if err != nil {
				return nil, err
			}
			assignedUser = user
		}

		item := jsonphp.NewObject()
		item.Set("id", id)
		item.Set("role_type", nullableString(roleType))
		item.Set("user_id", nullableInt64(userID))
		item.Set("assigned_user_id", nullableInt64(assignedUserID))
		item.Set("team_member_id", nullableInt64(teamMemberID))
		item.Set("title", nullableString(title))
		item.Set("description", nullableString(description))
		item.Set("amount", nullableString(amount))
		item.Set("counter_offer_amount", nullableString(counterOffer))
		item.Set("negotiation_note", nullableString(negotiationNote))
		item.Set("type", nullableString(addendumType))
		item.Set("specialist_type", nullableString(specialistType))
		item.Set("teamMember", teamMember)
		item.Set("assignedUser", assignedUser)
		item.Set("status", nullableString(status))
		item.Set("paid_at", carbon(paidAt))
		item.Set("verification_notes", nullableString(verificationNotes))
		item.Set("payment_proof_path", projectStorageURL(ctx, nullableString(paymentProofPath)))
		item.Set("created_at", carbon(createdAt))
		list = append(list, item)
	}

	return list, rows.Err()
}

// addendumTeamMember builds the team-member slice. `technical_skills`
// reads the `skills` column (B27); `phone_number` and `email` are the
// team's own columns.
func addendumTeamMember(ctx context.Context, pool *pgxpool.Pool, teamMemberID int64) (any, error) {
	var id int64
	var name, bio, skills, phone, email *string
	var verified bool
	if err := pool.QueryRow(ctx, `SELECT id, name, bio, skills, phone, email, is_verified FROM team_members WHERE id = $1`,
		teamMemberID).Scan(&id, &name, &bio, &skills, &phone, &email, &verified); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	member := jsonphp.NewObject()
	member.Set("id", id)
	member.Set("name", nullableString(name))
	member.Set("bio", nullableString(bio))
	member.Set("technical_skills", nullableString(skills))
	member.Set("is_verified", verified)
	member.Set("phone_number", nullableString(phone))
	member.Set("email", nullableString(email))
	member.Set("technical_skills", nullableString(skills))

	return member, nil
}

// addendumAssignedUser builds the assigned-user slice with the first
// phone contact and the resolved pic.
func addendumAssignedUser(ctx context.Context, pool *pgxpool.Pool, userID int64) (any, error) {
	user, err := userMini(ctx, pool, userID)
	if err != nil || user == nil {
		return nil, err
	}

	phones := userPhones(ctx, pool, userID)

	assigned := jsonphp.NewObject()
	assigned.Set("id", user["id"])
	assigned.Set("name", user["name"])
	assigned.Set("email", user["email"])
	assigned.Set("phone_number", firstPhoneOrEmpty(phones))
	assigned.Set("profile_picture", projectStorageURL(ctx, user["pic"]))
	assigned.Set("technical_skills", nil)

	return assigned, nil
}

// firstPhoneOrEmpty is the first contact or "".
func firstPhoneOrEmpty(contacts []string) any {
	if len(contacts) == 0 {
		return ""
	}
	return contacts[0]
}

// projectSubProfessionals lists assignments with their user slices.
func projectSubProfessionals(ctx context.Context, pool *pgxpool.Pool, projectID int64, viewer *projectViewer, viewerOnly bool) ([]any, error) {
	query := `SELECT id, project_id, user_id, parent_role, sub_role, assigned_by, status, rate,
	                 scope_notes, lead_pro_notes, suggested_fee,
	                 accepted_at, recommended_at, hired_at, completed_at
	            FROM project_sub_professionals WHERE project_id = $1`
	args := []any{projectID}

	if viewerOnly && viewer != nil {
		query += ` AND user_id = $2 AND status::text = 'active'`
		args = append(args, viewer.id)
	}
	query += ` ORDER BY id`

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]any, 0)
	for rows.Next() {
		var id, subProjectID, subUserID, assignedBy int64
		var parentRole, subRole *string
		var status *string
		var rate, suggestedFee *string
		var scopeNotes, leadProNotes *string
		var acceptedAt, recommendedAt, hiredAt, completedAt *time.Time

		if err := rows.Scan(&id, &subProjectID, &subUserID, &parentRole, &subRole, &assignedBy, &status, &rate,
			&scopeNotes, &leadProNotes, &suggestedFee,
			&acceptedAt, &recommendedAt, &hiredAt, &completedAt); err != nil {
			return nil, err
		}

		user, err := subProfessionalUser(ctx, pool, subUserID)
		if err != nil {
			return nil, err
		}

		item := jsonphp.NewObject()
		item.Set("id", id)
		item.Set("user_id", subUserID)
		item.Set("parent_role", nullableString(parentRole))
		item.Set("sub_role", nullableString(subRole))
		item.Set("assigned_by", assignedBy)
		item.Set("status", nullableString(status))
		item.Set("rate", nullableString(rate))
		item.Set("scope_notes", nullableString(scopeNotes))
		item.Set("lead_pro_notes", nullableString(leadProNotes))
		item.Set("suggested_fee", nullableString(suggestedFee))
		item.Set("accepted_at", carbon(acceptedAt))
		item.Set("recommended_at", carbon(recommendedAt))
		item.Set("hired_at", carbon(hiredAt))
		item.Set("completed_at", carbon(completedAt))
		item.Set("user", user)
		list = append(list, item)
	}

	return list, rows.Err()
}

// subProfessionalUser builds the assignment user slice: email ungated,
// phone from the relation with an "" fallback.
func subProfessionalUser(ctx context.Context, pool *pgxpool.Pool, userID int64) (any, error) {
	var id int64
	var name, email, role string
	var pic *string
	if err := pool.QueryRow(ctx, `SELECT id, name, email, role_type::text, pic FROM users WHERE id = $1`, userID).Scan(&id, &name, &email, &role, &pic); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	phones := userPhones(ctx, pool, userID)

	user := jsonphp.NewObject()
	user.Set("id", id)
	user.Set("name", name)
	user.Set("email", email)
	user.Set("role_type", role)
	user.Set("pic", nullableString(pic))
	user.Set("phone_number", firstPhoneOrEmpty(phones))

	return user, nil
}

// projectReview renders the first arsitek rating for a project.
func projectReview(ctx context.Context, pool *pgxpool.Pool, table, fk string, profileID *int64) (any, error) {
	if profileID == nil {
		return nil, nil
	}

	var rating int
	var comment *string
	var createdAt *time.Time
	if err := pool.QueryRow(ctx, `SELECT rating, komentar, created_at FROM `+table+` WHERE `+fk+` = $1 ORDER BY id LIMIT 1`,
		*profileID).Scan(&rating, &comment, &createdAt); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	review := jsonphp.NewObject()
	review.Set("rating", rating)
	review.Set("comment", nullableString(comment))
	review.Set("created_at", carbon(createdAt))

	return review, nil
}

// projectArsitekForReview resolves the hired arsitek profile id.
func projectArsitekForReview(ctx context.Context, pool *pgxpool.Pool, arsitekID *int64) *int64 {
	return arsitekID
}

// projectKontraktorReview renders the project's kontraktor rating.
func projectKontraktorReview(ctx context.Context, pool *pgxpool.Pool, projectID int64) (any, error) {
	var rating int
	var comment *string
	var createdAt *time.Time
	if err := pool.QueryRow(ctx, `SELECT rating, komentar, created_at FROM kontraktor_ratings WHERE project_id = $1 ORDER BY id LIMIT 1`,
		projectID).Scan(&rating, &comment, &createdAt); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	review := jsonphp.NewObject()
	review.Set("rating", rating)
	review.Set("comment", nullableString(comment))
	review.Set("created_at", carbon(createdAt))

	return review, nil
}

// projectFullProfessionals renders the hired-profile blocks for show.
func projectFullProfessionals(ctx context.Context, pool *pgxpool.Pool, row *jsonphp.Object, projectID int64, arsitekID, kontraktorID, notarisID, interiorID *int64) error {
	if arsitekID != nil {
		block, err := hiredProfessionalBlock(ctx, pool, "arsiteks", *arsitekID)
		if err != nil {
			return err
		}
		row.Set("arsitek", block)
	} else {
		row.Set("arsitek", nil)
	}

	if kontraktorID != nil {
		block, err := hiredProfessionalBlock(ctx, pool, "kontraktors", *kontraktorID)
		if err != nil {
			return err
		}
		row.Set("kontraktor", block)
	} else {
		row.Set("kontraktor", nil)
	}

	if notarisID != nil {
		block, err := hiredNotarisBlock(ctx, pool, *notarisID)
		if err != nil {
			return err
		}
		row.Set("notaris", block)
	} else {
		row.Set("notaris", nil)
	}

	if interiorID != nil {
		block, err := hiredInteriorBlock(ctx, pool, *interiorID)
		if err != nil {
			return err
		}
		row.Set("interior", block)
	} else {
		row.Set("interior", nil)
	}

	return nil
}

// hiredProfessionalBlock renders an arsitek/kontraktor hired block with
// the append ratings and the user's contact.
func hiredProfessionalBlock(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64) (any, error) {
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
	if user == nil {
		return nil, nil
	}

	phones := userPhones(ctx, pool, userID)
	role := map[string]string{"arsiteks": "arsitek", "kontraktors": "kontraktor"}[table]
	column := map[string]string{"arsitek": "arsitek_id", "kontraktor": "kontraktor_id"}[role]
	average, count := profileRating(ctx, pool, table, column, profileID)

	var phoneKey string
	if table == "kontraktors" {
		phoneKey = "no_telepon"
	} else {
		phoneKey = "no_telp"
	}
	phone, _ := profile[phoneKey].(string)

	var experience any
	if table == "kontraktors" {
		if value, ok := profile["pengalaman_tahun"]; ok && value != nil {
			experience = intOrProfile(value)
		} else {
			experience = 0
		}
	} else {
		experience = intOrProfile(profile["pengalaman_tahun"])
	}

	block := jsonphp.NewObject()
	block.Set("id", profileID)
	block.Set("verification_status", stringOrNil(profile["verification_status"]))
	block.Set("experience_years", experience)
	block.Set("rating", averageOrZero(average))
	block.Set("average_rating", averageOrZero(average))

	nested := jsonphp.NewObject()
	nested.Set("id", user["id"])
	nested.Set("name", user["name"])
	nested.Set("email", user["email"])
	if phone != "" {
		nested.Set("phone_number", phone)
	} else {
		nested.Set("phone_number", firstPhone(phones))
	}
	block.Set("user", nested)

	if table == "kontraktors" {
		_ = count
	}

	return block, nil
}

// hiredNotarisBlock renders the hired notaris block.
func hiredNotarisBlock(ctx context.Context, pool *pgxpool.Pool, profileID int64) (any, error) {
	profile, err := profileRowByID(ctx, pool, "notaris_profiles", profileID)
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
	if user == nil {
		return nil, nil
	}

	phones := userPhones(ctx, pool, userID)
	average, _ := profileRating(ctx, pool, "notaris_profiles", "notaris_id", profileID)

	phone, _ := profile["no_telp"].(string)

	block := jsonphp.NewObject()
	block.Set("id", profileID)
	block.Set("verification_status", stringOrNil(profile["verification_status"]))
	if value := intOrProfile(profile["pengalaman_tahun"]); value != nil {
		block.Set("experience_years", value)
	} else {
		block.Set("experience_years", 0)
	}
	block.Set("specialization", stringOrNil(profile["spesialisasi"]))
	block.Set("rating", averageOrZero(average))
	block.Set("average_rating", averageOrZero(average))

	nested := jsonphp.NewObject()
	nested.Set("id", user["id"])
	nested.Set("name", user["name"])
	nested.Set("email", user["email"])
	if phone != "" {
		nested.Set("phone_number", phone)
	} else {
		nested.Set("phone_number", firstPhone(phones))
	}
	block.Set("user", nested)

	return block, nil
}

// hiredInteriorBlock renders the hired interior block.
func hiredInteriorBlock(ctx context.Context, pool *pgxpool.Pool, profileID int64) (any, error) {
	profile, err := profileRowByID(ctx, pool, "interior_profiles", profileID)
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
	if user == nil {
		return nil, nil
	}

	phones := userPhones(ctx, pool, userID)
	average, _ := profileRating(ctx, pool, "interior_profiles", "interior_id", profileID)

	phone, _ := profile["no_telp"].(string)

	block := jsonphp.NewObject()
	block.Set("id", profileID)
	block.Set("verification_status", stringOrNil(profile["verification_status"]))
	if value := intOrProfile(profile["pengalaman_tahun"]); value != nil {
		block.Set("experience_years", value)
	} else {
		block.Set("experience_years", 0)
	}
	block.Set("specialization", stringOrNil(profile["spesialisasi"]))
	block.Set("rating", averageOrZero(average))
	block.Set("average_rating", averageOrZero(average))

	nested := jsonphp.NewObject()
	nested.Set("id", user["id"])
	nested.Set("name", user["name"])
	nested.Set("email", user["email"])
	if phone != "" {
		nested.Set("phone_number", phone)
	} else {
		nested.Set("phone_number", firstPhone(phones))
	}
	block.Set("user", nested)

	return block, nil
}

// projectManagerBlock renders the hired PM block.
func projectManagerBlock(ctx context.Context, pool *pgxpool.Pool, profileID int64) (any, error) {
	profile, err := profileRowByID(ctx, pool, "project_managers", profileID)
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

	phones := userPhones(ctx, pool, userID)
	average, _ := profileRating(ctx, pool, "project_managers", "pm_id", profileID)

	name, _ := profile["nama"].(string)
	if name == "" && user != nil {
		name, _ = user["name"].(string)
	}
	if name == "" {
		name = "Unknown PM"
	}

	phone, _ := profile["no_telp"].(string)

	block := jsonphp.NewObject()
	block.Set("id", profileID)
	block.Set("nama", name)
	block.Set("verification_status", stringOrNil(profile["verification_status"]))

	years := int64(0)
	if value := intOrProfile(profile["pengalaman_tahun"]); value != nil {
		years = value.(int64)
	}
	block.Set("pengalaman_tahun", years)
	block.Set("rating", averageOrZero(average))

	if user != nil {
		nested := jsonphp.NewObject()
		nested.Set("id", user["id"])
		nested.Set("name", user["name"])
		nested.Set("email", user["email"])
		block.Set("user", nested)
	} else {
		block.Set("user", nil)
	}

	if phone != "" {
		block.Set("phone_number", phone)
	} else {
		block.Set("phone_number", firstPhone(phones))
	}

	return block, nil
}

// projectShortProfessional renders the `{id, name, user{id, name}}`
// structural/mep short blocks.
func projectShortProfessional(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64) (any, error) {
	profile, err := profileRowByID(ctx, pool, table, profileID)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, err
	}

	name, _ := profile["nama"].(string)
	userID, _ := profile["user_id"].(int64)

	user, err := userMini(ctx, pool, userID)
	if err != nil {
		return nil, err
	}

	block := jsonphp.NewObject()
	block.Set("id", profileID)
	block.Set("name", nullableString(&name))

	if user != nil {
		nested := jsonphp.NewObject()
		nested.Set("id", user["id"])
		nested.Set("name", user["name"])
		block.Set("user", nested)
	} else {
		block.Set("user", nil)
	}

	return block, nil
}

// projectSpecialistProfile mirrors resolveSpecialistProfile: the hired
// profile or an active sub-professional assignment, with the payment
// status behind the bid or addendum fallback chain.
func projectSpecialistProfile(ctx context.Context, pool *pgxpool.Pool, role string, projectID int64, profileID *int64) (any, error) {
	idField := map[string]string{
		"structural": "structural_id",
		"mep":        "mep_id",
		"interior":   "selected_interior_id",
	}[role]

	_ = idField

	var engineer map[string]any
	if profileID != nil {
		table := map[string]string{
			"structural": "structural_engineers",
			"mep":        "mep_engineers",
			"interior":   "interior_profiles",
		}[role]

		profile, err := profileRowByID(ctx, pool, table, *profileID)
		if err != nil {
			return nil, err
		}
		engineer = profile
	}

	var subPro map[string]any
	subRows, err := pool.Query(ctx, `SELECT id, user_id, assigned_by, lead_pro_notes, name FROM (SELECT id, user_id, assigned_by, lead_pro_notes, NULL::text AS name FROM project_sub_professionals WHERE project_id = $1 AND sub_role::text = $2 AND status::text = 'active' ORDER BY id LIMIT 1) s`, projectID, role)
	if err != nil {
		return nil, err
	}
	if subRows.Next() {
		var id, subUserID, assignedBy int64
		var leadNotes, subName *string
		if err := subRows.Scan(&id, &subUserID, &assignedBy, &leadNotes, &subName); err != nil {
			subRows.Close()
			return nil, err
		}
		subPro = map[string]any{"id": id, "user_id": subUserID, "assigned_by": assignedBy, "lead_pro_notes": leadNotes, "name": subName}
	}
	subRows.Close()
	if err := subRows.Err(); err != nil {
		return nil, err
	}

	if profileID == nil && subPro == nil {
		return nil, nil
	}

	fallbackTitle := map[string]string{
		"structural": "Structural Engineer",
		"mep":        "MEP Engineer",
		"interior":   "Interior Designer",
	}[role]

	name := specialistName(ctx, pool, role, engineer, subPro, profileID, fallbackTitle)
	paymentStatus, err := specialistPaymentStatus(ctx, pool, role, projectID)
	if err != nil {
		return nil, err
	}

	var engineerUserID *int64
	if engineer != nil {
		if uid, ok := engineer["user_id"].(int64); ok {
			dup := uid
			engineerUserID = &dup
		}
	}

	var subProID *int64
	var subUserID *int64
	isInternal := false
	if subPro != nil {
		id := subPro["id"].(int64)
		subProID = &id
		uid := subPro["user_id"].(int64)
		assignedBy := subPro["assigned_by"].(int64)
		if uid != assignedBy {
			dup := uid
			subUserID = &dup
		}
		isInternal = isInternal || uid == assignedBy
	}

	userID := engineerUserID
	if userID == nil {
		userID = subUserID
	}

	profileType := "internal_team"
	if profileID != nil && engineer != nil {
		profileType = "platform_hired"
	}

	if profileID != nil && engineer == nil {
		isInternal = true
	}

	result := jsonphp.NewObject()
	result.Set("name", name)
	result.Set("type", profileType)
	result.Set("payment_status", paymentStatus)
	result.Set("sub_professional_id", nullableInt64(subProID))
	result.Set("user_id", nullableInt64(userID))
	result.Set("is_internal", isInternal)

	return result, nil
}

// specialistName mirrors the doResolveSpecialistProfile fallback chain.
func specialistName(ctx context.Context, pool *pgxpool.Pool, role string, engineer, subPro map[string]any, profileID *int64, fallback string) any {
	if engineer != nil {
		if name, ok := engineer["company_name"].(string); ok && name != "" {
			return name
		}
		if name, ok := engineer["nama"].(string); ok && name != "" {
			return name
		}
		if uid, ok := engineer["user_id"].(int64); ok && uid != 0 {
			var userName string
			if err := pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, uid).Scan(&userName); err == nil && userName != "" {
				return userName
			}
		}
	}

	if profileID != nil && engineer == nil {
		var teamName string
		if err := pool.QueryRow(ctx, `SELECT name FROM team_members WHERE id = $1`, *profileID).Scan(&teamName); err == nil && teamName != "" {
			return teamName
		}
	}

	if subPro != nil {
		uid, _ := subPro["user_id"].(int64)
		assignedBy, _ := subPro["assigned_by"].(int64)
		if uid != 0 && uid != assignedBy {
			var userName string
			if err := pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, uid).Scan(&userName); err == nil && userName != "" {
				return userName
			}
		}
		if name, ok := subPro["name"].(string); ok && name != "" {
			return name
		}
		if notes, ok := subPro["lead_pro_notes"].(string); ok && notes != "" {
			cleaned := strings.ReplaceAll(notes, "Assigned via Paid Addendum (Manual): ", "")
			cleaned = strings.ReplaceAll(cleaned, "Team: ", "")
			if cleaned != "" {
				return cleaned
			}
		}
	}

	return fallback
}

// specialistPaymentStatus mirrors the bid-then-addendum fallback: the
// first contracted bid's payment status, else a paid addendum, else the
// first authorizing addendum's status, else unpaid.
func specialistPaymentStatus(ctx context.Context, pool *pgxpool.Pool, role string, projectID int64) (any, error) {
	column, ok := bidProfileColumn(role)
	_ = column
	if !ok {
		return "unpaid", nil
	}

	var paymentStatus *string
	if err := pool.QueryRow(ctx, `SELECT payment_status::text FROM bids WHERE project_id = $1 AND role::text = $2 AND status::text IN ('accepted','awaiting_payment','active','contract_pending') ORDER BY id LIMIT 1`,
		projectID, role).Scan(&paymentStatus); err != nil && !isNoRows(err) {
		return nil, err
	}
	if paymentStatus != nil {
		return *paymentStatus, nil
	}

	var paidExists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_addendums WHERE project_id = $1 AND (role_type::text = $2 OR specialist_type::text = $2) AND type::text IN ('specialist_assignment','specialist_request') AND status::text = 'paid')`,
		projectID, role).Scan(&paidExists); err != nil {
		return nil, err
	}
	if paidExists {
		return "paid", nil
	}

	var authStatus *string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE project_id = $1 AND (role_type::text = $2 OR specialist_type::text = $2) AND type::text IN ('specialist_assignment','specialist_request') AND status::text IN ('authorized','verifying','approved_unpaid') ORDER BY id LIMIT 1`,
		projectID, role).Scan(&authStatus); err != nil && !isNoRows(err) {
		return nil, err
	}
	if authStatus != nil {
		return *authStatus, nil
	}

	return "unpaid", nil
}

// fullProfileBlock serializes a hired profile exactly like the bare
// relation: every column in table order with the model's casts, the
// rating appends where the model declares them, and the user minus
// $hidden plus their phoneNumber rows.
func fullProfileBlock(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64, withRatings, withRatingsRelation, withPhones bool) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, `SELECT `+profileRowColumns(table)+` FROM `+table+` WHERE id = $1`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, nil
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	decimalCols := map[string]bool{"rate_harga": true}
	intCols := map[string]bool{"reliability_score": true}

	block := jsonphp.NewObject()
	for _, column := range fields {
		value := byName[column]

		switch {
		case decimalCols[column]:
			block.Set(column, projectDecimalValue(value))
		case intCols[column]:
			block.Set(column, projectIntValue(value))
		case column == "created_at" || column == "updated_at" || strings.HasSuffix(column, "_at"):
			block.Set(column, projectTimeValue(value))
		default:
			block.Set(column, projectRawValue(value))
		}
	}

	if withRatings {
		average, count := profileRating(ctx, pool, table, ratingFK(table), profileID)
		block.Set("average_rating", averageOrZero(average))
		block.Set("review_count", count)
	}

	var userID int64
	if uid, ok := byName["user_id"].(int64); ok {
		userID = uid
	}
	user, err := fullProfileUser(ctx, pool, userID, withPhones)
	if err != nil {
		return nil, err
	}
	block.Set("user", user)

	if withRatingsRelation {
		ratings, err := profileRatings(ctx, pool, table, profileID)
		if err != nil {
			return nil, err
		}
		block.Set("ratings", ratings)
	}

	return block, nil
}

// ratingFK names the ratings foreign key per profile table.
func ratingFK(table string) string {
	switch table {
	case "arsiteks":
		return "arsitek_id"
	case "kontraktors":
		return "kontraktor_id"
	case "notaris_profiles":
		return "notaris_id"
	case "interior_profiles":
		return "interior_id"
	case "project_managers":
		return "pm_id"
	default:
		return ""
	}
}

// projectDecimalValue renders a decimal column with its scale.
func projectDecimalValue(value any) any {
	if value == nil {
		return nil
	}
	if s, ok := value.(string); ok {
		return s
	}
	return jsonVal(value)
}

// projectIntValue renders an integer column.
func projectIntValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
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

// projectTimeValue renders a timestamptz or null.
func projectTimeValue(value any) any {
	if value == nil {
		return nil
	}
	if typed, ok := value.(time.Time); ok {
		return carbon(&typed)
	}
	return jsonVal(value)
}

// projectRawValue passes text and booleans through.
func projectRawValue(value any) any {
	if value == nil {
		return nil
	}
	if s, ok := value.(string); ok {
		return s
	}
	if b, ok := value.(bool); ok {
		return b
	}
	return jsonVal(value)
}

// fullProfileUser serializes the profile owner's user minus $hidden —
// with their phoneNumber rows when the endpoint loaded them (show), and
// without the key at all when it did not (accept).
func fullProfileUser(ctx context.Context, pool *pgxpool.Pool, userID int64, withPhones bool) (any, error) {
	if userID == 0 {
		return nil, nil
	}

	rows, err := pool.Query(ctx, `SELECT `+usersRowColumns+` FROM users WHERE id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, nil
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	hidden := map[string]bool{
		"password": true, "remember_token": true,
		"bank_name": true, "bank_account_number": true, "bank_account_name": true,
		"unique_code": true,
	}

	user := jsonphp.NewObject()
	for i, column := range fields {
		if hidden[column] {
			continue
		}

		value := values[i]
		switch column {
		case "created_at", "updated_at", "email_verified_at":
			user.Set(column, projectTimeValue(value))
		case "is_suspended":
			if b, ok := value.(bool); ok {
				user.Set(column, b)
			} else {
				user.Set(column, value != nil)
			}
		default:
			user.Set(column, projectRawValue(value))
		}
	}

	phones, err := pool.Query(ctx, `SELECT id, contact, id_user, id_contact FROM phone_user WHERE id_user = $1 ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer phones.Close()

	if withPhones {
		list := make([]any, 0)
		for phones.Next() {
			var id, phoneUser, idContact *int64
			var contact *string
			if err := phones.Scan(&id, &contact, &phoneUser, &idContact); err != nil {
				return nil, err
			}
			item := jsonphp.NewObject()
			item.Set("id", nullableInt64(id))
			item.Set("contact", nullableString(contact))
			item.Set("id_user", nullableInt64(phoneUser))
			item.Set("id_contact", nullableInt64(idContact))
			list = append(list, item)
		}
		if err := phones.Err(); err != nil {
			return nil, err
		}

		user.Set("phone_number", list)
	}

	return user, nil
}

// ratingTable names the ratings table and its profile foreign key.
func ratingTable(table string) (string, string, bool) {
	switch table {
	case "arsiteks":
		return "arsitek_ratings", "arsitek_id", true
	case "kontraktors":
		return "kontraktor_ratings", "kontraktor_id", true
	case "notaris_profiles":
		return "notaris_ratings", "notaris_id", true
	case "interior_profiles":
		return "interior_ratings", "interior_id", true
	case "project_managers":
		return "p_m_ratings", "pm_id", true
	default:
		return "", "", false
	}
}

// profileRatings serializes a profile's loaded `ratings` relation: the raw
// rows in table order with Carbon timestamps — Eloquent's own model
// serialization, which a full-model block carries beside `user`.
func profileRatings(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64) ([]any, error) {
	ratingsTable, fk, ok := ratingTable(table)
	if !ok {
		return []any{}, nil
	}

	rows, err := pool.Query(ctx, `SELECT `+ratingsRowColumns(fk)+` FROM `+ratingsTable+` WHERE `+fk+` = $1 ORDER BY id`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		fields := fieldNames(rows)
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		entry := jsonphp.NewObject()
		for i, column := range fields {
			switch column {
			case "created_at", "updated_at":
				entry.Set(column, projectTimeValue(values[i]))
			default:
				entry.Set(column, projectRawValue(values[i]))
			}
		}
		out = append(out, entry)
	}

	return out, rows.Err()
}
