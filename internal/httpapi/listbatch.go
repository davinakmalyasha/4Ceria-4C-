package httpapi

import (
	"context"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LIST BATCHING — the project-list N+1 fix.
//
// A 50-row list page built each card with ~7 per-row queries (bid counts,
// viewer bids, negotiation logs, sub-professionals, phone gate, owner block,
// registry). This file batches each of those into one `WHERE ... = ANY($1)`
// query per relation. `projectList` builds a bundle and `projectResource`
// prefers it; every other caller passes nil and keeps the per-row path
// byte-for-byte, so the parity gate cannot tell the difference.
//
// The batch builders return empty (not nil) collections exactly where the
// per-row path returns empty lists, and absent map keys read as such.

// negLogKey identifies one bid's negotiation thread inside a role batch.
type negLogKey struct {
	projectID int64
	role      string
	refID     int64
}

// negLogBatch is one role's negotiation logs, keyed by bid.
type negLogBatch struct {
	logs  map[negLogKey][]any
	roles map[string]bool
}

// listBundle carries one page's prefetched relations.
type listBundle struct {
	counts      map[int64]map[string]int64
	viewerBids  map[int64]map[string][]map[string]any
	bidsBatched bool
	batchRoles  []string
	bySpelling  map[string]int64
	negLogs     *negLogBatch
	hasBid      map[int64]bool
	subPros     map[int64][]any
	subBatched  bool
	subActive   map[int64]bool
	ownerNames  map[int64]string
	ownerFound  map[int64]bool
	ownerPhones map[int64]*string
	bidders     *bidderBatch
}

// projectBidCountsBatch counts unified bids per role for many projects.
func projectBidCountsBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64) (map[int64]map[string]int64, error) {
	out := map[int64]map[string]int64{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT project_id, role::text, COUNT(*) FROM bids WHERE project_id = ANY($1) GROUP BY project_id, role::text`, projectIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid int64
		var role string
		var count int64
		if err := rows.Scan(&pid, &role, &count); err != nil {
			return nil, err
		}
		m, ok := out[pid]
		if !ok {
			m = map[string]int64{}
			out[pid] = m
		}
		m[role] = count
	}
	return out, rows.Err()
}

// bidRowsBatch loads unified bid rows for many projects, one role,
// optionally scoped to one profile — the batch form of bidRows.
func bidRowsBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64, role string, profileID *int64) (map[int64][]map[string]any, error) {
	out := map[int64][]map[string]any{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	column, ok := bidProfileColumn(role)
	if !ok {
		return out, nil
	}
	query := `SELECT ` + bidsColumns + ` FROM bids WHERE project_id = ANY($1) AND role::text = $2`
	args := []any{projectIDs, role}
	if profileID != nil {
		query += ` AND ` + column + ` = $3`
		args = append(args, *profileID)
	}
	query += ` ORDER BY project_id, id`
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	fields := fieldNames(rows)
	for rows.Next() {
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}
		row := map[string]any{}
		for i, col := range fields {
			row[col] = values[i]
		}
		var pid int64
		switch typed := row["project_id"].(type) {
		case int64:
			pid = typed
		case int32:
			pid = int64(typed)
		default:
			continue
		}
		out[pid] = append(out[pid], row)
	}
	return out, rows.Err()
}

// bidNegotiationLogsBatch loads negotiation logs for many projects, one
// role — the batch form of bidNegotiationLogs. The (bid_type_id, bid_id)
// match is exactly the per-row filter; the project join only keys results.
func bidNegotiationLogsBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64, role string, registryID int64) (map[negLogKey][]any, error) {
	out := map[negLogKey][]any{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `
		SELECT b.project_id, COALESCE(NULLIF(b.legacy_id, 0), b.id),
		       l.user_id, l.round_number, l.note, l.changes_detected, l.created_at, u.name
		  FROM bid_negotiation_logs l
		  JOIN bids b ON b.project_id = ANY($1) AND b.role::text = $2
		              AND (b.id = l.bid_id OR (b.legacy_id <> 0 AND b.legacy_id = l.bid_id))
		  JOIN users u ON u.id = l.user_id
		 WHERE l.bid_type_id = $3
		 ORDER BY l.id
	`, projectIDs, role, registryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid, ref, userID int64
		var round int
		var note *string
		var changes any
		var createdAt *time.Time
		var userName string
		if err := rows.Scan(&pid, &ref, &userID, &round, &note, &changes, &createdAt, &userName); err != nil {
			return nil, err
		}
		entry := jsonphp.NewObject()
		entry.Set("user_name", userName)
		entry.Set("round_number", round)
		entry.Set("note", nullableString(note))
		entry.Set("changes", jsonOrNil(changes))
		entry.Set("created_at", carbon(createdAt))
		key := negLogKey{projectID: pid, role: role, refID: ref}
		out[key] = append(out[key], entry)
	}
	return out, rows.Err()
}

// bidHasSubmittedBatch reports which projects hold a non-invited bid from
// one profile — the batch form of the projectHasSubmittedBid exists query.
func bidHasSubmittedBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64, role, column string, profileID int64) (map[int64]bool, error) {
	out := map[int64]bool{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT project_id FROM bids WHERE project_id = ANY($1) AND role::text = $2 AND `+column+` = $3 AND status::text <> 'invited' GROUP BY project_id`, projectIDs, role, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid int64
		if err := rows.Scan(&pid); err != nil {
			return nil, err
		}
		out[pid] = true
	}
	return out, rows.Err()
}

// subProsActiveBatch reports which projects hold an active assignment for
// one user — the batch form of the projectCanViewPhone exists query.
func subProsActiveBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64, userID int64) (map[int64]bool, error) {
	out := map[int64]bool{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT DISTINCT project_id FROM project_sub_professionals WHERE project_id = ANY($1) AND user_id = $2 AND status::text = 'active'`, projectIDs, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid int64
		if err := rows.Scan(&pid); err != nil {
			return nil, err
		}
		out[pid] = true
	}
	return out, rows.Err()
}

// subProsUsersBatch loads users for many sub-professional assignments.
func subProsUsersBatch(ctx context.Context, pool *pgxpool.Pool, userIDs []int64) (map[int64]map[string]any, error) {
	out := map[int64]map[string]any{}
	if len(userIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT id, name, email, role_type::text, pic FROM users WHERE id = ANY($1)`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name, email, role string
		var pic *string
		if err := rows.Scan(&id, &name, &email, &role, &pic); err != nil {
			return nil, err
		}
		out[id] = map[string]any{"id": id, "name": name, "email": email, "role_type": role, "pic": nullableString(pic)}
	}
	return out, rows.Err()
}

// phonesBatch loads ordered phone contacts for many users.
func phonesBatch(ctx context.Context, pool *pgxpool.Pool, userIDs []int64) (map[int64][]string, error) {
	out := map[int64][]string{}
	if len(userIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT id_user, contact FROM phone_user WHERE id_user = ANY($1) ORDER BY id_user, id`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid int64
		var contact *string
		if err := rows.Scan(&uid, &contact); err != nil {
			return nil, err
		}
		if contact == nil {
			continue
		}
		out[uid] = append(out[uid], *contact)
	}
	return out, rows.Err()
}

// projectSubProfessionalsBatch lists viewer-scoped assignments for many
// projects — the batch form of projectSubProfessionals with viewerOnly.
func projectSubProfessionalsBatch(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64, viewerID int64, users map[int64]map[string]any, phones map[int64][]string) (map[int64][]any, error) {
	out := map[int64][]any{}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx, `SELECT id, project_id, user_id, parent_role, sub_role, assigned_by, status, rate,
	                 scope_notes, lead_pro_notes, suggested_fee,
	                 accepted_at, recommended_at, hired_at, completed_at
	            FROM project_sub_professionals
	           WHERE project_id = ANY($1) AND user_id = $2 AND status::text = 'active'
	           ORDER BY project_id, id`, projectIDs, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
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
		item.Set("user", subProfessionalUserFromMaps(subUserID, users, phones))
		out[subProjectID] = append(out[subProjectID], item)
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

// subProfessionalUserFromMaps builds the assignment user slice from
// prefetched maps — same shape as subProfessionalUser, no queries.
func subProfessionalUserFromMaps(userID int64, users map[int64]map[string]any, phones map[int64][]string) any {
	u, ok := users[userID]
	if !ok {
		return nil
	}
	id, _ := u["id"].(int64)
	name, _ := u["name"].(string)
	email, _ := u["email"].(string)
	role, _ := u["role_type"].(string)
	user := jsonphp.NewObject()
	user.Set("id", id)
	user.Set("name", name)
	user.Set("email", email)
	user.Set("role_type", role)
	user.Set("pic", u["pic"])
	user.Set("phone_number", firstPhoneOrEmpty(phones[userID]))
	return user
}

// buildListBundle prefetches one page's relations. Any query failure
// returns nil so the caller falls back to the per-row path byte-for-byte.
func buildListBundle(ctx context.Context, pool *pgxpool.Pool, projectIDs []int64, ownerIDs []int64, viewer *projectViewer, spec projectLoad) *listBundle {
	b := &listBundle{
		counts:      map[int64]map[string]int64{},
		viewerBids:  map[int64]map[string][]map[string]any{},
		bySpelling:  map[string]int64{},
		hasBid:      map[int64]bool{},
		subPros:     map[int64][]any{},
		subActive:   map[int64]bool{},
		ownerNames:  map[int64]string{},
		ownerFound:  map[int64]bool{},
		ownerPhones: map[int64]*string{},
	}

	counts, err := projectBidCountsBatch(ctx, pool, projectIDs)
	if err != nil {
		return nil
	}
	b.counts = counts

	bySpelling, _, err := registryIDs(ctx, pool)
	if err != nil {
		return nil
	}
	b.bySpelling = bySpelling

	roles := spec.viewerBidRoles
	if len(roles) <= 1 || spec.unscopedBids {
		batchRoles := roles
		var profileID *int64
		batched := true
		if !spec.unscopedBids {
			if len(roles) == 1 {
				if viewer == nil {
					batchRoles = nil
				} else if own, ok := viewer.profiles[roles[0]]; ok {
					profileID = &own
				} else {
					batchRoles = nil
				}
			}
			if len(roles) > 1 {
				batched = false
			}
		}
		if batched {
			b.bidsBatched = true
			b.batchRoles = batchRoles
			for _, role := range batchRoles {
				var profID *int64
				if !spec.unscopedBids {
					profID = profileID
				}
				rows, err := bidRowsBatch(ctx, pool, projectIDs, role, profID)
				if err != nil {
					return nil
				}
				for pid, list := range rows {
					m, ok := b.viewerBids[pid]
					if !ok {
						m = map[string][]map[string]any{}
						b.viewerBids[pid] = m
					}
					m[role] = list
				}
				if registryID, ok := bySpelling[bidRegistryKey(role)]; ok {
					logs, err := bidNegotiationLogsBatch(ctx, pool, projectIDs, role, registryID)
					if err != nil {
						return nil
					}
					if b.negLogs == nil {
						b.negLogs = &negLogBatch{logs: map[negLogKey][]any{}, roles: map[string]bool{}}
					}
					for k, v := range logs {
						b.negLogs.logs[k] = v
					}
					b.negLogs.roles[role] = true
				}
			}
		}
	}

	if viewer != nil && viewer.id != 0 && viewer.role != "" {
		if column, ok := bidProfileColumn(viewer.role); ok {
			if own, ok := viewer.profiles[viewer.role]; ok && own != 0 {
				m, err := bidHasSubmittedBatch(ctx, pool, projectIDs, viewer.role, column, own)
				if err != nil {
					return nil
				}
				b.hasBid = m
			}
		}
	}

	if spec.subPros == "viewer" && viewer != nil {
		subUserIDs := []int64{viewer.id}
		users, err := subProsUsersBatch(ctx, pool, subUserIDs)
		if err != nil {
			return nil
		}
		phones, err := phonesBatch(ctx, pool, subUserIDs)
		if err != nil {
			return nil
		}
		subs, err := projectSubProfessionalsBatch(ctx, pool, projectIDs, viewer.id, users, phones)
		if err != nil {
			return nil
		}
		b.subPros = subs
		b.subBatched = true
	}

	if viewer != nil && viewer.id != 0 && spec.subPros != "" {
		active, err := subProsActiveBatch(ctx, pool, projectIDs, viewer.id)
		if err != nil {
			return nil
		}
		b.subActive = active
	}

	names, found, err := ownersBatch(ctx, pool, ownerIDs)
	if err != nil {
		return nil
	}
	b.ownerNames, b.ownerFound = names, found
	contacts, _, err := ownerPhonesBatch(ctx, pool, ownerIDs)
	if err != nil {
		return nil
	}
	b.ownerPhones = contacts

	if !spec.bidsWithoutBidder {
		var needs []bidderNeed
		for _, perRole := range b.viewerBids {
			for role, list := range perRole {
				column, ok := bidProfileColumn(role)
				if !ok {
					continue
				}
				table, ok := bidProfileTable(role)
				if !ok {
					continue
				}
				for _, bid := range list {
					if pid := profileID(bid, column); pid != 0 {
						needs = append(needs, bidderNeed{role: role, table: table, profileID: pid})
					}
				}
			}
		}
		if len(needs) > 0 {
			bb, err := loadBidderBatch(ctx, pool, needs)
			if err != nil {
				return nil
			}
			b.bidders = bb
		}
	}

	return b
}

// projectOwnerBlockBundled serves the owner block from a bundle when
// present, otherwise from the database — identical objects either way.
func projectOwnerBlockBundled(ctx context.Context, pool *pgxpool.Pool, id, ownerID int64, canViewPhone, withPhones bool, bundle *listBundle) (*jsonphp.Object, error) {
	if bundle == nil {
		return projectOwnerBlock(ctx, pool, ownerID, canViewPhone, withPhones)
	}
	_ = ctx
	_ = pool
	_ = id
	return projectOwnerBlockFromMaps(ownerID, canViewPhone, withPhones, bundle), nil
}

// bundleBidders returns the bundle's bidder trees, or nil when the caller
// must fall back to the per-row bidderTree.
func bundleBidders(bundle *listBundle) *bidderBatch {
	if bundle == nil {
		return nil
	}
	return bundle.bidders
}

// bundleNegLogs returns the bundle's negotiation logs, or nil when the
// caller must fall back to the per-row query.
func bundleNegLogs(bundle *listBundle) *negLogBatch {
	if bundle == nil {
		return nil
	}
	return bundle.negLogs
}

// projectOwnerBlockFromMaps replicates projectOwnerBlock from prefetched
// maps: no queries, identical objects (missing owner reads as null, exactly
// like the per-row no-rows branch).
func projectOwnerBlockFromMaps(ownerID int64, canViewPhone, withPhones bool, bundle *listBundle) *jsonphp.Object {
	if ownerID == 0 {
		return nil
	}
	name, ok := bundle.ownerNames[ownerID]
	if !ok || !bundle.ownerFound[ownerID] {
		return nil
	}
	var phone any
	if canViewPhone && withPhones {
		phone = nullableString(bundle.ownerPhones[ownerID])
	}
	owner := jsonphp.NewObject()
	owner.Set("id", ownerID)
	owner.Set("name", name)
	owner.Set("phone", phone)
	return owner
}

// bidNegotiationLogsBundled serves one bid's negotiation logs from a
// prefetched batch when it covers the role; otherwise it queries per-row
// exactly like bidNegotiationLogs.
func bidNegotiationLogsBundled(ctx context.Context, pool *pgxpool.Pool, role string, bid map[string]any, bySpelling map[string]int64, neg *negLogBatch, projectID int64) []any {
	if neg != nil && neg.roles[role] {
		if list, ok := neg.logs[negLogKey{projectID: projectID, role: role, refID: bidRefID(bid)}]; ok {
			return list
		}
		return []any{}
	}
	return bidNegotiationLogs(ctx, pool, role, bid, bySpelling)
}

// bidderNeed identifies one bidder profile lookup.
type bidderNeed struct {
	role      string
	table     string
	profileID int64
}

// bidderDatum holds one bidder's prefetched relations.
type bidderDatum struct {
	profile map[string]any
	user    map[string]any
	average any
	count   any
	phones  []string
	found   bool
}

// bidderBatch carries prefetched bidder trees keyed by need.
type bidderBatch struct {
	trees map[bidderNeed]bidderDatum
}

// loadBidderBatch loads bidder relations for many needs in bulk:
// profiles per table, users + phones per user id, ratings per mapped table.
func loadBidderBatch(ctx context.Context, pool *pgxpool.Pool, needs []bidderNeed) (*bidderBatch, error) {
	out := &bidderBatch{trees: map[bidderNeed]bidderDatum{}}
	if len(needs) == 0 {
		return out, nil
	}
	// Deduplicate needs; collect per-table ids and user ids later.
	seen := map[bidderNeed]bool{}
	var uniq []bidderNeed
	for _, n := range needs {
		if !seen[n] {
			seen[n] = true
			uniq = append(uniq, n)
		}
	}
	// Profiles, grouped by table (columns differ per table).
	byTable := map[string][]int64{}
	for _, n := range uniq {
		byTable[n.table] = append(byTable[n.table], n.profileID)
	}
	profiles := map[bidderNeed]map[string]any{}
	for table, ids := range byTable {
		rows, err := pool.Query(ctx, `SELECT `+profileRowColumns(table)+` FROM `+table+` WHERE id = ANY($1)`, ids)
		if err != nil {
			return nil, err
		}
		fields := fieldNames(rows)
		for rows.Next() {
			values, err := scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				return nil, err
			}
			row := map[string]any{}
			for i, col := range fields {
				row[col] = values[i]
			}
			var pid int64
			switch v := row["id"].(type) {
			case int64:
				pid = v
			case int32:
				pid = int64(v)
			default:
				continue
			}
			// Find the role(s) for this table+id (same profile may serve
			// several roles only if tables overlap, which they don't —
			// match by table and id).
			for _, n := range uniq {
				if n.table == table && n.profileID == pid {
					profiles[n] = row
				}
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	// User ids from found profiles, exactly like bidderTree's assertion.
	var userIDs []int64
	seenUser := map[int64]bool{}
	for n := range profiles {
		if id, ok := profiles[n]["user_id"].(int64); ok && id != 0 && !seenUser[id] {
			seenUser[id] = true
			userIDs = append(userIDs, id)
		}
	}
	users := map[int64]map[string]any{}
	if len(userIDs) > 0 {
		urows, err := pool.Query(ctx, `SELECT id, name, email, pic FROM users WHERE id = ANY($1)`, userIDs)
		if err != nil {
			return nil, err
		}
		for urows.Next() {
			var id int64
			var name string
			var email, pic *string
			if err := urows.Scan(&id, &name, &email, &pic); err != nil {
				urows.Close()
				return nil, err
			}
			users[id] = map[string]any{"id": id, "name": name, "email": nullableString(email), "pic": nullableString(pic)}
		}
		urows.Close()
		if err := urows.Err(); err != nil {
			return nil, err
		}
	}
	// Ratings per mapped table (unmapped tables keep the single path's
	// nil, nil — the port renders those as 0/null, never an error).
	type ratingKey struct {
		table string
		fk    string
		id    int64
	}
	ratings := map[ratingKey][2]any{}
	ratingTables := map[string][2]string{
		"arsiteks":          {"arsitek_ratings", "arsitek_id"},
		"kontraktors":       {"kontraktor_ratings", "kontraktor_id"},
		"notaris_profiles":  {"notaris_ratings", "notaris_id"},
		"interior_profiles": {"interior_ratings", "interior_id"},
		"project_managers":  {"p_m_ratings", "pm_id"},
	}
	byRatingTable := map[string][]int64{}
	byRatingFK := map[string]string{}
	for n := range profiles {
		if rt, ok := ratingTables[n.table]; ok {
			byRatingTable[rt[0]] = append(byRatingTable[rt[0]], n.profileID)
			byRatingFK[rt[0]] = rt[1]
		}
	}
	for table, ids := range byRatingTable {
		rrows, err := pool.Query(ctx, `SELECT `+byRatingFK[table]+`, COALESCE(AVG(rating)::float8, 0), COUNT(*) FROM `+table+` WHERE `+byRatingFK[table]+` = ANY($1) GROUP BY `+byRatingFK[table], ids)
		if err != nil {
			return nil, err
		}
		for rrows.Next() {
			var pid int64
			var avg float64
			var count int64
			if err := rrows.Scan(&pid, &avg, &count); err != nil {
				rrows.Close()
				return nil, err
			}
			ratings[ratingKey{table: table, fk: byRatingFK[table], id: pid}] = [2]any{avg, count}
		}
		rrows.Close()
		if err := rrows.Err(); err != nil {
			return nil, err
		}
	}
	// Phones per user.
	phoneMap := map[int64][]string{}
	if len(userIDs) > 0 {
		prows, err := pool.Query(ctx, `SELECT id_user, contact FROM phone_user WHERE id_user = ANY($1) ORDER BY id_user, id`, userIDs)
		if err != nil {
			return nil, err
		}
		for prows.Next() {
			var uid int64
			var contact *string
			if err := prows.Scan(&uid, &contact); err != nil {
				prows.Close()
				return nil, err
			}
			if contact == nil {
				continue
			}
			phoneMap[uid] = append(phoneMap[uid], *contact)
		}
		prows.Close()
		if err := prows.Err(); err != nil {
			return nil, err
		}
	}
	_ = seen
	for _, n := range uniq {
		profile, ok := profiles[n]
		if !ok {
			continue
		}
		var user map[string]any
		var phones []string
		if uid, ok := profile["user_id"].(int64); ok && uid != 0 {
			user = users[uid]
			phones = phoneMap[uid]
		}
		var avg, count any
		if rt, ok := ratingTables[n.table]; ok {
			if r, ok := ratings[ratingKey{table: rt[0], fk: rt[1], id: n.profileID}]; ok {
				avg, count = r[0], r[1]
			} else {
				avg, count = 0, int64(0)
			}
		}
		out.trees[n] = bidderDatum{profile: profile, user: user, average: avg, count: count, phones: phones, found: true}
	}
	return out, nil
}

// bidderTreeBatched serves one bid's bidder tree from prefetched data —
// byte-identical to bidderTree, without queries.
func bidderTreeBatched(ctx context.Context, role string, bid map[string]any, privileged bool, bb *bidderBatch) (any, error) {
	if bb == nil {
		return nil, nil
	}
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
	d, ok := bb.trees[bidderNeed{role: role, table: table, profileID: profileID}]
	if !ok || !d.found {
		return nil, nil
	}
	return assembleBidderTree(ctx, role, bid, privileged, d.profile, profileID, d.user, d.average, d.count, d.phones), nil
}
func ownersBatch(ctx context.Context, pool *pgxpool.Pool, ownerIDs []int64) (map[int64]string, map[int64]bool, error) {
	names := map[int64]string{}
	found := map[int64]bool{}
	if len(ownerIDs) == 0 {
		return names, found, nil
	}
	rows, err := pool.Query(ctx, `SELECT id, name FROM users WHERE id = ANY($1)`, ownerIDs)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, nil, err
		}
		names[id] = name
		found[id] = true
	}
	return names, found, rows.Err()
}

// ownerPhonesBatch loads first contacts for many owners.
func ownerPhonesBatch(ctx context.Context, pool *pgxpool.Pool, ownerIDs []int64) (map[int64]*string, map[int64]bool, error) {
	contacts := map[int64]*string{}
	found := map[int64]bool{}
	if len(ownerIDs) == 0 {
		return contacts, found, nil
	}
	rows, err := pool.Query(ctx, `SELECT DISTINCT ON (id_user) id_user, contact FROM phone_user WHERE id_user = ANY($1) ORDER BY id_user, id`, ownerIDs)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid int64
		var contact *string
		if err := rows.Scan(&uid, &contact); err != nil {
			return nil, nil, err
		}
		contacts[uid] = contact
		found[uid] = true
	}
	return contacts, found, rows.Err()
}
