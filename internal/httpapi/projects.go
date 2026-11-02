package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE PROJECT SURFACE.
//
// `GET /api/projects` lists the caller's projects (role-scoped, paginated
// at 50) and `GET /api/projects/{project}` shows one behind the membership
// gate. Both answer `ProjectResource`, whose shape is the contract — some
// 115 keys whose presence rules are the whole port:
//
//   - `whenLoaded` OMITS the key. List and show load different relations,
//     so the same builder emits both shapes from a load spec.
//   - `pii()` and the contact gates null out money, contacts and secrets
//     for anyone but the owner, the assigned PM or an admin.
//   - `visibleBids()` gates every bid block: the owner/PM/admin sees all
//     loaded bids, a professional sees only their own, anyone else none.
//     Counts stay public via the per-role COUNTs.
//   - `budget_summary` renders on the show route only; the list omits it
//     rather than fabricating it (2026-09-29).
//   - bids read from the unified `bids` table by role (ADR-0014); the wire
//     id is the legacy id for migrated rows.
//
// Timestamps are Carbon (`2006-01-02T15:04:05.000000Z`), decimals stay
// strings, floats stay floats — the casts on the model decide, and the
// builder mirrors them: budget/negotiated_fee/quantities are strings,
// latitude/longitude/averages are floats, counts are ints, flags are bools.
//
// Storage URLs mirror the local resolution: public prefixes and the S3
// prefix resolve to the asset URL, external URLs pass through, and private
// paths fall back to the public URL — which is what `Vault::url` does
// locally when the disk cannot presign. Production presigned URLs carry a
// signature and can never be byte-identical across stacks (same class as
// the dispute evidence URLs).

// projectViewer is the caller as the resource sees them.
type projectViewer struct {
	id       int64
	isAdmin  bool
	profiles map[string]int64
	role     string
}

// projectLoad is the endpoint's eager-load set: what `whenLoaded` sees.
type projectLoad struct {
	images         bool
	milestones     bool
	documents      bool
	comments       bool
	// bidsWithoutBidder renders the bid arrays but answers `bidder: null`,
	// matching a load that never eager-loaded the bidder tree.
	bidsWithoutBidder bool
	ownerPhone     bool   // phoneNumber relation loaded: owner.phone is the first contact only then, else null
	subPros        string // "", "viewer", "all"
	viewerBidRoles []string
	// unscopedBids loads every bid relation without the viewer filter —
	// the `with_bids=true` second with() call, which replaces the scoped
	// eager loads.
	unscopedBids bool
	// countRoles names the roles whose bids_*_count renders real counts
	// (the controller's loadCount list). Roles absent render 0; nil
	// renders all zero without querying.
	countRoles    []string
	clientHistory bool
	budgetSummary bool
	specialists   bool
	// hiredPros renders the hired arsitek/kontraktor/notaris/interior
	// blocks. The structural/mep short blocks and the full engineer
	// relation blocks follow `engineers`; accept/decline load the hired
	// four without ever loading an engineer relation.
	hiredPros bool
	// engineers names which full relation blocks render (bare relation,
	// null when unhired): show renders all three, accept/decline render
	// only interior_engineer (the only engineer relation they load),
	// every other read renders none. engineerPhones mirrors whether the
	// nested user carries its phoneNumber rows (show loads them, accept
	// does not).
	engineers      []string
	engineerPhones bool
	// engineerRatings appends the `ratings` rows to the interior-engineer
	// profile block when the load eager-loaded them.
	engineerRatings bool
	pmBlock        bool
	// paymentTermins renders the termin list (always empty on live data;
	// accept is the only S2 read that loads the relation).
	paymentTermins bool
	ratings        bool
	requirements   bool
	addendums      bool
}

// bidCountRoles is the seven roles in resource key order.
var bidCountRoles = []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager", "structural", "mep"}

// listLoad is what index() eager-loads: images, milestones,
// user.phoneNumber, the viewer's own role bids, and viewer-scoped
// sub-professionals — plus the seven counts and the client history.
func listLoad(role string, hasProfile bool) projectLoad {
	spec := projectLoad{
		images:        true,
		milestones:    true,
		ownerPhone:    true,
		subPros:       "viewer",
		countRoles:    bidCountRoles,
		clientHistory: true,
	}

	if role != "" && hasProfile {
		spec.viewerBidRoles = []string{role}
	}

	return spec
}

// showLoad is what show() eager-loads: the hired-professional relations,
// ratings, requirements, addendums, all sub-professionals, and the
// viewer's own role bids.
func showLoad(role string, hasProfile bool) projectLoad {
	spec := projectLoad{
		images:         true,
		ownerPhone:     true,
		subPros:        "all",
		countRoles:     bidCountRoles,
		clientHistory:  true,
		budgetSummary:  true,
		specialists:    true,
		hiredPros:      true,
		engineers:      []string{"structural_engineer", "mep_engineer", "interior_engineer"},
		engineerPhones: true,
		pmBlock:        true,
		ratings:        true,
		requirements:   true,
		addendums:      true,
	}

	if role != "" && hasProfile {
		spec.viewerBidRoles = []string{role}
	}

	return spec
}

// loadViewer resolves the caller for project reads: id, admin flag and
// the seven profile ids. Anonymous is impossible here (the route gate
// requires auth), but the zero value stays safe: no profile matches, no
// privilege, no phone.
func loadViewer(ctx context.Context, pool *pgxpool.Pool, caller Caller) (*projectViewer, error) {
	viewer := &projectViewer{profiles: map[string]int64{}}

	if caller == nil {
		return viewer, nil
	}

	viewer.id = caller.UserID()
	viewer.isAdmin = caller.IsAdmin()

	subject, err := loadSubject(ctx, pool, viewer.id)
	if err != nil {
		return nil, err
	}

	viewer.role = subject.RoleType()

	if !viewer.isAdmin {
		admin, err := isAdminUser(ctx, pool, viewer.id, viewer.role)
		if err != nil {
			return nil, err
		}
		viewer.isAdmin = admin
	}

	for _, role := range identity.Roles() {
		if id := subject.ProfileIDFor(role); id != nil && id.Valid() {
			viewer.profiles[role.String()] = int64(*id)
		}
	}

	return viewer, nil
}

// privileged reports the resource's private-data gate: an admin, the
// owner, or the assigned PM — `Hire::isOwnerOrAssignedPm`.
func (v *projectViewer) privileged(ownerID int64, pmID *int64) bool {
	if v == nil || v.id == 0 {
		return false
	}

	if v.isAdmin {
		return true
	}

	if v.id == ownerID {
		return true
	}

	if pmID != nil && *pmID != 0 {
		if own, ok := v.profiles[identity.RoleProjectManager.String()]; ok && own == *pmID {
			return true
		}
	}

	return false
}

// ProjectsHandler serves `GET /api/projects`.
//
// Role scoping mirrors the controller branch for branch: the client sees
// their own, each professional sees what names their profile (interior,
// structural and mep also see active sub-professional assignments, the
// trade roles only those), anyone else sees nothing. `?all=true` caps at
// 200 and drops the paginator; otherwise the page holds 50.
func ProjectsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		viewer, err := loadViewer(r.Context(), pool, caller)
		if err != nil {
			slog.Error("projects: viewer", "error", err)
			serverError(w)
			return
		}

		conditions := []string{}
		args := []any{}
		add := func(condition string, value any) {
			args = append(args, value)
			conditions = append(conditions, condition+" $"+strconv.Itoa(len(args)))
		}

		empty := false
		feed := r.URL.Query().Get("feed") == "true" || r.URL.Query().Get("discovery") == "true" || r.URL.Query().Get("bidding_board") == "true"
		withBids := r.URL.Query().Get("with_bids") == "true"

		if feed {
			feedWhere(&conditions, &args, viewer)
		} else {
			switch viewer.role {
			case "user":
				add("p.user_id =", viewer.id)
			case "arsitek", "kontraktor", "notaris":
				column := map[string]string{
					"arsitek":    "p.selected_arsitek_id",
					"kontraktor": "p.selected_kontraktor_id",
					"notaris":    "p.selected_notaris_id",
				}[viewer.role]
				if profile, ok := viewer.profiles[viewer.role]; ok {
					add(column+" =", profile)
				} else {
					empty = true
				}
			case "interior", "structural", "mep":
				column := map[string]string{
					"interior":   "p.selected_interior_id",
					"structural": "p.structural_id",
					"mep":        "p.mep_id",
				}[viewer.role]
				profile, ok := viewer.profiles[viewer.role]
				if ok {
					conditions = append(conditions, "("+column+" = $"+strconv.Itoa(len(args)+1)+
						" OR EXISTS (SELECT 1 FROM project_sub_professionals s WHERE s.project_id = p.id AND s.user_id = $"+strconv.Itoa(len(args)+2)+
						" AND s.status::text IN ('invited','accepted','interviewing','recommended','active')))")
					args = append(args, profile, viewer.id)
				} else {
					conditions = append(conditions, "(1 = 0 OR EXISTS (SELECT 1 FROM project_sub_professionals s WHERE s.project_id = p.id AND s.user_id = $"+strconv.Itoa(len(args)+1)+
						" AND s.status::text IN ('invited','accepted','interviewing','recommended','active')))")
					args = append(args, viewer.id)
				}
			case "project_manager":
				if profile, ok := viewer.profiles["project_manager"]; ok {
					add("p.pm_id =", profile)
				} else {
					// No profile: `pm_id = NULL` matches nothing — which is
					// the right answer, exactly like the controller.
					conditions = append(conditions, "p.pm_id = NULL")
				}
			case "civil", "mechanical", "electrical", "plumbing", "roofing", "finishing", "general":
				args = append(args, viewer.id)
				conditions = append(conditions, "EXISTS (SELECT 1 FROM project_sub_professionals s WHERE s.project_id = p.id AND s.user_id = $"+strconv.Itoa(len(args))+
					" AND s.status::text IN ('invited','accepted','interviewing','recommended','active'))")
			default:
				// Admins, suppliers, logistics, unknown roles: "My projects"
				// shows nothing unless hired — mirrored exactly.
				empty = true
			}
		} // end base (non-feed) scoping

		where := ""
		if empty {
			where = " WHERE 1 = 0"
		} else if len(conditions) > 0 {
			where = " WHERE " + strings.Join(conditions, " AND ")
		}

		if r.URL.Query().Get("all") == "true" || feed {
			rows, err := pool.Query(r.Context(), `SELECT * FROM projects p`+where+` ORDER BY p.created_at DESC, p.id DESC LIMIT `+feedLimit(feed)+``, args...)
			if err != nil {
				slog.Error("projects: all", "error", err)
				serverError(w)
				return
			}
			defer rows.Close()

			items, err := projectList(r.Context(), pool, rows, viewer, feedLoad(viewer, withBids))
			if err != nil {
				slog.Error("projects: rows", "error", err)
				serverError(w)
				return
			}

			payload := jsonphp.NewObject()
			payload.Set("data", items)
			writeJSON(w, http.StatusOK, payload)
			return
		}

		var total int
		if err := pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM projects p`+where, args...).Scan(&total); err != nil {
			slog.Error("projects: count", "error", err)
			serverError(w)
			return
		}

		currentPage := pageParam(r)
		const perPage = 50
		offset := (currentPage - 1) * perPage

		rows, err := pool.Query(r.Context(), `SELECT * FROM projects p`+where+` ORDER BY p.created_at DESC, p.id DESC LIMIT 50 OFFSET `+strconv.Itoa(offset), args...)
		if err != nil {
			slog.Error("projects: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		items, err := projectList(r.Context(), pool, rows, viewer, feedLoad(viewer, withBids))
		if err != nil {
			slog.Error("projects: rows", "error", err)
			serverError(w)
			return
		}

		baseURL := requestBaseURL(r)

		payload := jsonphp.NewObject()
		payload.Set("data", items)
		payload.Set("links", pageLinksSummary(baseURL, "", currentPage, lastPage(total, perPage)))
		payload.Set("meta", directoryMeta(total, perPage, currentPage, basePathOf(baseURL), "", items))

		writeJSON(w, http.StatusOK, payload)
	}
}

// hasBidProfile reports whether the viewer holds a profile in their own
// role — the controller loads the viewer's bid relation exactly then.
func hasBidProfile(viewer *projectViewer) bool {
	if viewer == nil {
		return false
	}

	_, ok := viewer.profiles[viewer.role]
	return ok
}

// projectList reads every row and builds its resource with the client
// history attached — the controller's `attachClientHistory` batch.
func projectList(ctx context.Context, pool *pgxpool.Pool, rows pgx.Rows, viewer *projectViewer, spec projectLoad) ([]any, error) {
	fields := fieldNames(rows)

	type rawProject struct {
		fields []string
		values []any
	}

	var projects []rawProject
	ownerIDs := map[int64]bool{}

	for rows.Next() {
		values, err := scanRow(rows, len(fields))
		if err != nil {
			return nil, err
		}

		projects = append(projects, rawProject{fields: fields, values: values})

		if id := projectInt(values, fields, "user_id"); id != 0 {
			ownerIDs[id] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	histories, err := clientHistories(ctx, pool, ownerIDs)
	if err != nil {
		return nil, err
	}

	items := make([]any, 0, len(projects))
	for _, project := range projects {
		row, err := projectResource(ctx, pool, project.fields, project.values, viewer, spec, histories)
		if err != nil {
			return nil, err
		}
		items = append(items, row)
	}

	return items, nil
}

// ProjectShowHandler serves `GET /api/projects/{project}` behind the
// membership gate: the owner, the assigned PM, an admin, a hired
// professional, an invited/active sub-professional, or anyone with a bid.
// Everyone else reads 403.
func ProjectShowHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		raw := r.PathValue("project")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, raw)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		viewer, err := loadViewer(r.Context(), pool, caller)
		if err != nil {
			slog.Error("project show: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(r.Context(), pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("project show: query", "error", err)
			serverError(w)
			return
		}

		ownerID := projectInt(values, fields, "user_id")
		pmID := projectIntPtr(values, fields, "pm_id")

		allowed, err := canAccessProject(r.Context(), pool, viewer, projectID, ownerID, pmID, projectColumns(values, fields, "selected_arsitek_id", "selected_kontraktor_id", "selected_notaris_id", "selected_interior_id", "structural_id", "mep_id"))
		if err != nil {
			slog.Error("project show: gate", "error", err)
			serverError(w)
			return
		}

		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized access to this project.")
			return
		}

		histories, err := clientHistories(r.Context(), pool, map[int64]bool{ownerID: true})
		if err != nil {
			slog.Error("project show: history", "error", err)
			serverError(w)
			return
		}

		row, err := projectResource(r.Context(), pool, fields, values, viewer, showLoad(viewer.role, hasBidProfile(viewer)), histories)
		if err != nil {
			slog.Error("project show: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", row)

		writeJSON(w, http.StatusOK, payload)
	}
}

// canAccessProject mirrors authorizeProjectDetailAccess: owner, assigned
// PM, admin, hired professional, bidder, or sub-professional member.
func canAccessProject(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID, ownerID int64, pmID *int64, selected map[string]*int64) (bool, error) {
	if viewer == nil || viewer.id == 0 {
		return false, nil
	}

	if viewer.id == ownerID {
		return true, nil
	}

	if pmID != nil && *pmID != 0 {
		if own, ok := viewer.profiles[identity.RoleProjectManager.String()]; ok && own == *pmID {
			return true, nil
		}
	}

	if viewer.isAdmin {
		return true, nil
	}

	byRole := map[string]struct {
		column  string
		profile string
	}{
		identity.RoleArsitek.String():        {column: "arsitek_id", profile: identity.RoleArsitek.String()},
		identity.RoleKontraktor.String():     {column: "kontraktor_id", profile: identity.RoleKontraktor.String()},
		identity.RoleNotaris.String():        {column: "notaris_id", profile: identity.RoleNotaris.String()},
		identity.RoleInterior.String():       {column: "interior_id", profile: identity.RoleInterior.String()},
		identity.RoleStructural.String():     {column: "structural_id", profile: identity.RoleStructural.String()},
		identity.RoleMep.String():            {column: "mep_id", profile: identity.RoleMep.String()},
		identity.RoleProjectManager.String(): {column: "pm_id", profile: identity.RoleProjectManager.String()},
	}

	if viewer.role != "" {
		if own, ok := viewer.profiles[viewer.role]; ok && own != 0 {
			if mapping, ok := byRole[viewer.role]; ok {
				if selected[mapping.column] != nil && *selected[mapping.column] == own {
					return true, nil
				}

				var exists bool
				if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM bids WHERE project_id = $1 AND role::text = $2 AND `+mapping.column+` = $3)`,
					projectID, viewer.role, own).Scan(&exists); err != nil {
					return false, err
				}
				if exists {
					return true, nil
				}
			}
		}
	}

	var member bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2)`,
		projectID, viewer.id).Scan(&member); err != nil {
		return false, err
	}

	return member, nil
}

// feedLimit is the cap for collection responses: the feed always takes
// 50, and ?all=true takes 200.
func feedLimit(feed bool) string {
	if feed {
		return "50"
	}
	return "200"
}

// feedLoad is the load spec for collection responses: the list shape,
// plus every bid relation unscoped when with_bids=true asks for them
// (the controller's second with() replaces the scoped eager loads).
func feedLoad(viewer *projectViewer, withBids bool) projectLoad {
	spec := listLoad(viewer.role, hasBidProfile(viewer))

	if withBids {
		spec.viewerBidRoles = []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager", "structural", "mep"}
		spec.unscopedBids = true
	}

	return spec
}

// feedWhere appends the bidding-board scope: everyone else's projects,
// no sub-professional assignment, and the per-role board filters.
func feedWhere(conditions *[]string, args *[]any, viewer *projectViewer) {
	add := func(condition string, value any) {
		*args = append(*args, value)
		*conditions = append(*conditions, condition+" $"+strconv.Itoa(len(*args)))
	}

	add("p.user_id <>", viewer.id)
	*args = append(*args, viewer.id)
	*conditions = append(*conditions, "NOT EXISTS (SELECT 1 FROM project_sub_professionals s WHERE s.project_id = p.id AND s.user_id = $"+strconv.Itoa(len(*args))+")")

	disjoint := func(role, column string) {
		own, ok := viewer.profiles[role]
		if !ok {
			return
		}
		*args = append(*args, own)
		*conditions = append(*conditions, "NOT EXISTS (SELECT 1 FROM bids WHERE project_id = p.id AND role::text = '"+role+"' AND "+column+" = $"+strconv.Itoa(len(*args))+")")
	}

	contains := func(column, value string) {
		*args = append(*args, "[\""+value+"\"]")
		*conditions = append(*conditions, column+" @> $"+strconv.Itoa(len(*args))+"::jsonb")
	}

	inStatus := func(values ...string) {
		quoted := make([]string, 0, len(values))
		for _, value := range values {
			*args = append(*args, value)
			quoted = append(quoted, "$"+strconv.Itoa(len(*args)))
		}
		*conditions = append(*conditions, "p.status::text IN ("+strings.Join(quoted, ", ")+")")
	}

	switch viewer.role {
	case "arsitek":
		*conditions = append(*conditions, "p.target_role IN ('both', 'arsitek')")
		contains("p.published_bidding_roles", "arsitek")
		inStatus("open", "accepted_kontraktor", "in_progress", "awaiting_payment")
		*conditions = append(*conditions, "p.selected_arsitek_id IS NULL")
		disjoint("arsitek", "arsitek_id")
	case "kontraktor":
		*conditions = append(*conditions, "(p.target_role = 'kontraktor' OR (p.target_role = 'both' AND (p.design_completed_at IS NOT NULL OR p.published_bidding_roles @> '[\"kontraktor\"]'::jsonb)))")
		contains("p.published_bidding_roles", "kontraktor")
		inStatus("open", "accepted_arsitek", "procurement", "in_progress", "awaiting_payment")
		*conditions = append(*conditions, "p.selected_kontraktor_id IS NULL")
		disjoint("kontraktor", "kontraktor_id")
	case "notaris":
		*conditions = append(*conditions, "(p.needed_phases @> '[\"legal\"]'::jsonb OR p.needed_phases IS NULL OR p.needed_phases::text = '[]')")
		contains("p.published_bidding_roles", "notaris")
		*conditions = append(*conditions, "p.selected_notaris_id IS NULL")
		inStatus("open", "accepted_arsitek", "accepted_kontraktor", "in_progress", "awaiting_payment")
		disjoint("notaris", "notaris_id")
	case "structural":
		add("p.requires_structural =", true)
		contains("p.published_bidding_roles", "structural")
		*conditions = append(*conditions, "p.structural_id IS NULL")
		inStatus("open", "accepted_arsitek", "accepted_kontraktor", "in_progress", "awaiting_payment")
		disjoint("structural", "structural_id")
	case "mep":
		add("p.requires_mep =", true)
		contains("p.published_bidding_roles", "mep")
		*conditions = append(*conditions, "p.mep_id IS NULL")
		inStatus("open", "accepted_arsitek", "accepted_kontraktor", "in_progress", "awaiting_payment")
		disjoint("mep", "mep_id")
	case "interior":
		*conditions = append(*conditions, "(p.needed_phases @> '[\"interior\"]'::jsonb OR p.needed_phases IS NULL OR p.needed_phases::text = '[]')")
		contains("p.published_bidding_roles", "interior")
		*conditions = append(*conditions, "p.selected_interior_id IS NULL")
		inStatus("open", "accepted_arsitek", "accepted_kontraktor", "in_progress", "awaiting_payment", "completed_build")
		disjoint("interior", "interior_id")
	case "project_manager":
		add("p.wants_project_manager =", true)
		contains("p.published_bidding_roles", "project_manager")
		*conditions = append(*conditions, "p.pm_id IS NULL")
		inStatus("open", "accepted_arsitek", "accepted_kontraktor", "in_progress", "awaiting_payment")
		disjoint("project_manager", "pm_id")
	default:
		inStatus("open", "accepted_arsitek", "accepted_kontraktor", "procurement", "in_progress", "awaiting_payment")
	}
}
