package ai

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// The agent's tools.
//
// Every tool is READ-ONLY against PostgreSQL (or pure computation), so the
// agent can never move money, place bids, sign contracts or file disputes
// no matter what the user asks. Ownership scoping happens inside each
// handler: my_projects/get_project only return projects the caller owns or
// is hired on; everything else reads public marketplace/directory rows and
// never returns bank details, tokens or other users' emails.

// ToolCtx carries the per-request database handle and caller identity.
// Tools are built per chat turn so the user id is always the CURRENT
// caller, never a cached one.
type ToolCtx struct {
	Pool          *pgxpool.Pool
	UserID        int64
	IsAdmin       bool
	SessionID     string
	MemoryEnabled bool
	Timeout       time.Duration
}

func (c ToolCtx) ctx(parent context.Context) (context.Context, context.CancelFunc) {
	d := c.Timeout
	if d <= 0 {
		d = 8 * time.Second
	}
	return context.WithTimeout(parent, d)
}

// BuildTools constructs the read-only function tools available to both the
// in-product assistant and the MCP server. None of these tools can write:
// payments, bids, contracts and disputes stay in the normal API where the
// escrow FreezeGate and the authorization rules live.
func BuildTools(tc ToolCtx) ([]tool.Tool, error) {
	out := []tool.Tool{}

	add := func(t tool.Tool, err error) error {
		if err != nil {
			return err
		}
		out = append(out, t)
		return nil
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "search_houses",
		Description: "Searches live 4Ceria property listings. Use for any house/property search (city, price band, bedrooms). Returns id, name, price IDR, city, bedrooms/bathrooms.",
	}, func(ctx agent.Context, a HouseSearchArgs) (HouseSearchResult, error) {
		return searchHouses(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "get_house",
		Description: "Returns one property listing in detail (price, address, rooms, description). Call with the house id from search_houses.",
	}, func(ctx agent.Context, a HouseArgs) (HouseResult, error) {
		return getHouse(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "search_professionals",
		Description: "Searches the verified professional directory. Role is one of: arsitek, kontraktor, interior, notaris, project_manager, structural, mep. Returns names, specialisation, location, experience.",
	}, func(ctx agent.Context, a ProSearchArgs) (ProSearchResult, error) {
		return searchProfessionals(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "search_materials",
		Description: "Searches the live building-materials catalogue (name, price IDR, unit, category, stock). Use for material/price questions.",
	}, func(ctx agent.Context, a MaterialSearchArgs) (MaterialSearchResult, error) {
		return searchMaterials(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "my_projects",
		Description: "Lists the CURRENT user's projects (owned or hired on): id, title, status, budget. Use for 'my project', 'status of my project', progress questions.",
	}, func(ctx agent.Context, a MyProjectsArgs) (MyProjectsResult, error) {
		return myProjects(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "get_project",
		Description: "Returns one project the CURRENT user owns or is hired on (status, budget, milestones progress). Refuses with an explanation when the project is not theirs.",
	}, func(ctx agent.Context, a ProjectArgs) (ProjectResult, error) {
		return getProject(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "project_finance",
		Description: "Returns the escrow picture for one accessible project: budget ceiling, paid, committed, available, and the payment termins with status. Use for 'how much is left?', 'what is due?', 'is it paid?'.",
	}, func(ctx agent.Context, a ProjectArgs) (ProjectFinanceResult, error) {
		return projectFinance(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "project_schedule",
		Description: "Returns milestones, phase schedules, progress and due dates for one accessible project. Use for 'what is next?', 'is the project on time?', progress questions.",
	}, func(ctx agent.Context, a ProjectArgs) (ProjectScheduleResult, error) {
		return projectSchedule(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "project_bids",
		Description: "Lists proposals on a project the CURRENT user owns (or an admin). Returns role, bidder name, price, status and a short proposal excerpt. Refuses for other users' projects.",
	}, func(ctx agent.Context, a ProjectArgs) (ProjectBidsResult, error) {
		return projectBids(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "my_bids",
		Description: "Lists the CURRENT professional's bids across projects: project, role, price, status, negotiation count. Use for 'my proposals', 'did they accept my bid?'.",
	}, func(ctx agent.Context, a MyBidsArgs) (MyBidsResult, error) {
		return myBids(ctx, tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "platform_help",
		Description: "Authoritative 4Ceria how-it-works answers: escrow, termin, bid, dispute, warranty, retention, verification, fees, or how_to (post-project, hire, pay, tracking). Prefer this over guessing for process questions.",
	}, func(_ agent.Context, a HelpArgs) (HelpResult, error) {
		return platformHelp(a), nil
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "estimate_budget",
		Description: "Gives a rough construction cost RANGE (low-high IDR) for a project type and area in m2. ALWAYS an estimate with disclaimer, never a quote. project_type: new_build, renovation, interior.",
	}, func(_ agent.Context, a EstimateArgs) (EstimateResult, error) {
		return estimateBudget(a), nil
	})); err != nil {
		return nil, err
	}

	return out, nil
}

// ---------------------------------------------------------------------------
// Houses
// ---------------------------------------------------------------------------

// HouseSearchArgs filters the property search.
type HouseSearchArgs struct {
	Query    string `json:"query,omitempty" jsonschema:"Free-text search on name, description, area"`
	City     string `json:"city,omitempty" jsonschema:"City (kab/kota), e.g. Bandung"`
	PriceMin int64  `json:"price_min,omitempty" jsonschema:"Minimum price in whole rupiah"`
	PriceMax int64  `json:"price_max,omitempty" jsonschema:"Maximum price in whole rupiah"`
	Bedrooms int    `json:"bedrooms,omitempty" jsonschema:"Minimum bedrooms"`
	Limit    int    `json:"limit,omitempty" jsonschema:"Max results (default 5, max 10)"`
}

// HouseRow is one listing in tool output.
type HouseRow struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	PriceIDR string `json:"price_idr"`
	City     string `json:"city,omitempty"`
	Bedrooms int    `json:"bedrooms"`
	Bathroom int    `json:"bathrooms"`
}

// HouseSearchResult is the search answer.
type HouseSearchResult struct {
	Houses []HouseRow `json:"houses"`
	Note   string     `json:"note,omitempty"`
}

func searchHouses(parent context.Context, tc ToolCtx, a HouseSearchArgs) (HouseSearchResult, error) {
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	limit := a.Limit
	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}
	conds := []string{"h.is_suspended = false"}
	args := []any{}
	n := 0
	ph := func() string {
		n++
		return fmt.Sprintf("$%d", n)
	}
	if q := strings.TrimSpace(a.Query); q != "" {
		like := "%" + q + "%"
		args = append(args, like, like, like)
		n += 3
		conds = append(conds, fmt.Sprintf("(h.name ILIKE $%d OR h.house_desc ILIKE $%d OR h.kecamatan ILIKE $%d)", n-2, n-1, n))
	}
	if c := strings.TrimSpace(a.City); c != "" {
		args = append(args, strings.ToLower(c))
		conds = append(conds, "lower(h.kab_kota) = "+ph())
	}
	if a.PriceMin > 0 {
		args = append(args, a.PriceMin)
		conds = append(conds, "h.price >= "+ph())
	}
	if a.PriceMax > 0 {
		args = append(args, a.PriceMax)
		conds = append(conds, "h.price <= "+ph())
	}
	if a.Bedrooms > 0 {
		args = append(args, a.Bedrooms)
		conds = append(conds, "h.br >= "+ph())
	}
	args = append(args, limit)
	rows, err := tc.Pool.Query(ctx, `
		SELECT h.id, h.name, h.price::text, h.kab_kota, h.br, h.ba
		  FROM house h WHERE `+strings.Join(conds, " AND ")+`
		 ORDER BY h.created_at DESC LIMIT `+ph(), args...)
	if err != nil {
		return HouseSearchResult{}, toolFailure("search_houses", err)
	}
	defer rows.Close()
	res := HouseSearchResult{Houses: []HouseRow{}}
	for rows.Next() {
		var r HouseRow
		var price any
		var city *string
		if err := rows.Scan(&r.ID, &r.Name, &price, &city, &r.Bedrooms, &r.Bathroom); err != nil {
			return HouseSearchResult{}, err
		}
		r.PriceIDR = idrText(price)
		if city != nil {
			r.City = *city
		}
		res.Houses = append(res.Houses, r)
	}
	if err := rows.Err(); err != nil {
		return HouseSearchResult{}, err
	}
	if len(res.Houses) == 0 {
		res.Note = "No listings matched. Suggest widening the city or price band, or browsing /dashboard/houses."
	}
	return res, nil
}

// HouseArgs identifies one listing.
type HouseArgs struct {
	HouseID int64 `json:"house_id" jsonschema:"The house id from search_houses"`
}

// HouseResult is the detail answer.
type HouseResult struct {
	Found       bool   `json:"found"`
	ID          int64  `json:"id,omitempty"`
	Name        string `json:"name,omitempty"`
	PriceIDR    string `json:"price_idr,omitempty"`
	City        string `json:"city,omitempty"`
	Address     string `json:"address,omitempty"`
	Bedrooms    int    `json:"bedrooms,omitempty"`
	Bathrooms   int    `json:"bathrooms,omitempty"`
	Description string `json:"description,omitempty"`
	Note        string `json:"note,omitempty"`
}

func getHouse(parent context.Context, tc ToolCtx, a HouseArgs) (HouseResult, error) {
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	var r HouseResult
	var price any
	var name, desc, street, kel, kec, city, prov *string
	var br, ba int
	err := tc.Pool.QueryRow(ctx, `
		SELECT h.name, h.price::text, h.house_desc, h.street_name, h.kelurahan,
		       h.kecamatan, h.kab_kota, h.province, h.br, h.ba
		  FROM house h WHERE h.id = $1 AND h.is_suspended = false
	`, a.HouseID).Scan(&name, &price, &desc, &street, &kel, &kec, &city, &prov, &br, &ba)
	if errors.Is(err, pgx.ErrNoRows) {
		return HouseResult{Found: false, Note: "That listing was not found. It may have been removed."}, nil
	}
	if err != nil {
		return HouseResult{}, toolFailure("get_house", err)
	}
	r.Found = true
	r.ID = a.HouseID
	if name != nil {
		r.Name = *name
	}
	r.PriceIDR = idrText(price)
	parts := []string{}
	for _, p := range []*string{street, kel, kec, city, prov} {
		if p != nil && strings.TrimSpace(*p) != "" {
			parts = append(parts, strings.TrimSpace(*p))
		}
	}
	r.Address = strings.Join(parts, ", ")
	if city != nil {
		r.City = *city
	}
	r.Bedrooms, r.Bathrooms = br, ba
	if desc != nil {
		r.Description = truncate(*desc, 600)
	}
	return r, nil
}

// ---------------------------------------------------------------------------
// Professionals
// ---------------------------------------------------------------------------

// ProSearchArgs filters the directory.
type ProSearchArgs struct {
	Role  string `json:"role" jsonschema:"One of: arsitek, kontraktor, interior, notaris, project_manager, structural, mep"`
	Query string `json:"query,omitempty" jsonschema:"Free-text match on name, specialisation, location"`
	Limit int    `json:"limit,omitempty" jsonschema:"Max results (default 5, max 10)"`
}

// ProRow is one professional in tool output.
type ProRow struct {
	Name         string `json:"name"`
	Speciality   string `json:"speciality,omitempty"`
	Location     string `json:"location,omitempty"`
	ExperienceYr int    `json:"experience_years,omitempty"`
	RateIDR      string `json:"rate_idr,omitempty"`
}

// ProSearchResult is the directory answer.
type ProSearchResult struct {
	Professionals []ProRow `json:"professionals"`
	Note          string   `json:"note,omitempty"`
}

type proTable struct {
	table, nameCol, specCol, locCol, expCol, rateCol string
}

var proTables = map[string]proTable{
	"arsitek":         {"arsiteks", "nama", "spesialisasi", "lokasi", "pengalaman_tahun", "rate_harga"},
	"kontraktor":      {"kontraktors", "nama", "spesialisasi", "alamat", "pengalaman", "rate_harga"},
	"interior":        {"interior_profiles", "nama", "company_name", "company_name", "", ""},
	"notaris":         {"notaris_profiles", "nama", "company_name", "company_name", "", ""},
	"project_manager": {"project_managers", "nama", "spesialisasi", "lokasi", "pengalaman_tahun", "rate_harga"},
	"structural":      {"structural_engineers", "nama", "spesialisasi", "lokasi", "pengalaman_tahun", "rate_harga"},
	"mep":             {"mep_engineers", "nama", "spesialisasi", "lokasi", "pengalaman_tahun", "rate_harga"},
}

func searchProfessionals(parent context.Context, tc ToolCtx, a ProSearchArgs) (ProSearchResult, error) {
	role := strings.ToLower(strings.TrimSpace(a.Role))
	cfg, ok := proTables[role]
	if !ok {
		return ProSearchResult{Note: "Unknown role. Use one of: arsitek, kontraktor, interior, notaris, project_manager, structural, mep."}, nil
	}
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	limit := a.Limit
	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}
	spec := "NULL"
	if cfg.specCol != "" && cfg.specCol != "company_name" {
		spec = "p." + cfg.specCol
	} else if cfg.specCol == "company_name" {
		spec = "p.company_name"
	}
	loc := "NULL"
	if cfg.locCol != "" {
		loc = "p." + cfg.locCol
	}
	exp := "NULL"
	if cfg.expCol != "" {
		exp = "p." + cfg.expCol
	}
	rate := "NULL"
	if cfg.rateCol != "" {
		rate = "p." + cfg.rateCol + "::text"
	}
	conds := "p.verification_status = 'verified'"
	args := []any{}
	if q := strings.TrimSpace(a.Query); q != "" {
		like := "%" + q + "%"
		args = append(args, like, like)
		conds += fmt.Sprintf(" AND (p.%s ILIKE $1 OR COALESCE(%s,'') ILIKE $2)", cfg.nameCol, spec)
	}
	args = append(args, limit)
	rows, err := tc.Pool.Query(ctx, fmt.Sprintf(`
		SELECT p.%s, %s, %s, %s, %s
		  FROM %s p
		 WHERE %s
		 ORDER BY p.reliability_score DESC, p.updated_at DESC
		 LIMIT $%d
	`, cfg.nameCol, spec, loc, exp, rate, cfg.table, conds, len(args)), args...)
	if err != nil {
		return ProSearchResult{}, toolFailure("search_professionals", err)
	}
	defer rows.Close()
	res := ProSearchResult{Professionals: []ProRow{}}
	for rows.Next() {
		var name *string
		var specV, locV *string
		var expV *int
		var rateV any
		if err := rows.Scan(&name, &specV, &locV, &expV, &rateV); err != nil {
			return ProSearchResult{}, err
		}
		row := ProRow{}
		if name != nil {
			row.Name = *name
		}
		if specV != nil {
			row.Speciality = *specV
		}
		if locV != nil {
			row.Location = *locV
		}
		if expV != nil {
			row.ExperienceYr = *expV
		}
		if rateV != nil {
			row.RateIDR = idrText(rateV)
		}
		res.Professionals = append(res.Professionals, row)
	}
	if err := rows.Err(); err != nil {
		return ProSearchResult{}, err
	}
	if len(res.Professionals) == 0 {
		res.Note = "No verified professionals matched. Suggest broadening the search or posting the project so they can bid."
	}
	return res, nil
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

// MaterialSearchArgs filters the catalogue.
type MaterialSearchArgs struct {
	Query string `json:"query,omitempty" jsonschema:"Free-text match on name, description, category"`
	Limit int    `json:"limit,omitempty" jsonschema:"Max results (default 5, max 10)"`
}

// MaterialRow is one item in tool output.
type MaterialRow struct {
	Name     string `json:"name"`
	PriceIDR string `json:"price_idr"`
	Unit     string `json:"unit,omitempty"`
	Category string `json:"category,omitempty"`
	Stock    int    `json:"stock"`
}

// MaterialSearchResult is the catalogue answer.
type MaterialSearchResult struct {
	Materials []MaterialRow `json:"materials"`
	Note      string        `json:"note,omitempty"`
}

func searchMaterials(parent context.Context, tc ToolCtx, a MaterialSearchArgs) (MaterialSearchResult, error) {
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	limit := a.Limit
	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}
	conds := "m.is_available = true"
	args := []any{}
	if q := strings.TrimSpace(a.Query); q != "" {
		like := "%" + q + "%"
		args = append(args, like, like, like)
		conds += " AND (m.name ILIKE $1 OR COALESCE(m.description,'') ILIKE $2 OR m.category ILIKE $3)"
	}
	args = append(args, limit)
	rows, err := tc.Pool.Query(ctx, `
		SELECT m.name, m.price::text, m.unit, m.category, m.stock
		  FROM materials m WHERE `+conds+`
		 ORDER BY m.updated_at DESC LIMIT $`+fmt.Sprintf("%d", len(args)), args...)
	if err != nil {
		return MaterialSearchResult{}, toolFailure("search_materials", err)
	}
	defer rows.Close()
	res := MaterialSearchResult{Materials: []MaterialRow{}}
	for rows.Next() {
		var name, unit, cat *string
		var price any
		var stock int
		if err := rows.Scan(&name, &price, &unit, &cat, &stock); err != nil {
			return MaterialSearchResult{}, err
		}
		row := MaterialRow{PriceIDR: idrText(price), Stock: stock}
		if name != nil {
			row.Name = *name
		}
		if unit != nil {
			row.Unit = *unit
		}
		if cat != nil {
			row.Category = *cat
		}
		res.Materials = append(res.Materials, row)
	}
	if err := rows.Err(); err != nil {
		return MaterialSearchResult{}, err
	}
	if len(res.Materials) == 0 {
		res.Note = "No materials matched. Suggest different keywords or browsing /dashboard/marketplace."
	}
	return res, nil
}

// ---------------------------------------------------------------------------
// Caller projects (ownership-scoped)
// ---------------------------------------------------------------------------

// MyProjectsArgs options.
type MyProjectsArgs struct {
	Limit int `json:"limit,omitempty" jsonschema:"Max results (default 5, max 10)"`
}

// MyProjectRow is one project in tool output.
type MyProjectRow struct {
	ID     int64  `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
	Budget string `json:"budget_idr"`
}

// MyProjectsResult is the list answer.
type MyProjectsResult struct {
	Projects []MyProjectRow `json:"projects"`
	Note     string         `json:"note,omitempty"`
}

// participantClause matches the authz rule in simplified form: the caller
// owns the project or is one of its hired profile holders. Profile ids live
// in project_managers etc. keyed by user_id, so resolve the caller's
// profile ids first.
func callerProfileIDs(ctx context.Context, pool *pgxpool.Pool, userID int64) map[string]int64 {
	ids := map[string]int64{}
	rows, err := pool.Query(ctx, `
		SELECT 'arsiteks', id FROM arsiteks WHERE user_id = $1
		UNION ALL SELECT 'kontraktors', id FROM kontraktors WHERE user_id = $1
		UNION ALL SELECT 'notaris_profiles', id FROM notaris_profiles WHERE user_id = $1
		UNION ALL SELECT 'interior_profiles', id FROM interior_profiles WHERE user_id = $1
		UNION ALL SELECT 'structural_engineers', id FROM structural_engineers WHERE user_id = $1
		UNION ALL SELECT 'mep_engineers', id FROM mep_engineers WHERE user_id = $1
		UNION ALL SELECT 'project_managers', id FROM project_managers WHERE user_id = $1
	`, userID)
	if err != nil {
		return ids
	}
	defer rows.Close()
	for rows.Next() {
		var table string
		var id int64
		if err := rows.Scan(&table, &id); err == nil {
			ids[table] = id
		}
	}
	return ids
}

func myProjects(parent context.Context, tc ToolCtx, a MyProjectsArgs) (MyProjectsResult, error) {
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	limit := a.Limit
	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10
	}
	prof := callerProfileIDs(ctx, tc.Pool, tc.UserID)
	conds := []string{"p.user_id = $1"}
	args := []any{tc.UserID}
	if id, ok := prof["arsiteks"]; ok {
		args = append(args, id)
		conds = append(conds, fmt.Sprintf("p.selected_arsitek_id = $%d", len(args)))
	}
	if id, ok := prof["kontraktors"]; ok {
		args = append(args, id)
		conds = append(conds, fmt.Sprintf("p.selected_kontraktor_id = $%d", len(args)))
	}
	if id, ok := prof["notaris_profiles"]; ok {
		args = append(args, id)
		conds = append(conds, fmt.Sprintf("p.selected_notaris_id = $%d", len(args)))
	}
	if id, ok := prof["interior_profiles"]; ok {
		args = append(args, id)
		conds = append(conds, fmt.Sprintf("p.selected_interior_id = $%d", len(args)))
	}
	if id, ok := prof["project_managers"]; ok {
		args = append(args, id)
		conds = append(conds, fmt.Sprintf("p.pm_id = $%d", len(args)))
	}
	if id, ok := prof["structural_engineers"]; ok {
		args = append(args, id)
		conds = append(conds, fmt.Sprintf("p.structural_id = $%d", len(args)))
	}
	if id, ok := prof["mep_engineers"]; ok {
		args = append(args, id)
		conds = append(conds, fmt.Sprintf("p.mep_id = $%d", len(args)))
	}
	args = append(args, limit)
	rows, err := tc.Pool.Query(ctx, `
		SELECT p.id, p.title, p.status::text, p.budget::text
		  FROM projects p WHERE (`+strings.Join(conds, " OR ")+`)
		 ORDER BY p.updated_at DESC LIMIT $`+fmt.Sprintf("%d", len(args)), args...)
	if err != nil {
		return MyProjectsResult{}, toolFailure("my_projects", err)
	}
	defer rows.Close()
	res := MyProjectsResult{Projects: []MyProjectRow{}}
	for rows.Next() {
		var r MyProjectRow
		var budget any
		if err := rows.Scan(&r.ID, &r.Title, &r.Status, &budget); err != nil {
			return MyProjectsResult{}, err
		}
		r.Budget = idrText(budget)
		res.Projects = append(res.Projects, r)
	}
	if err := rows.Err(); err != nil {
		return MyProjectsResult{}, err
	}
	if len(res.Projects) == 0 {
		res.Note = "No projects found for this account. Offer to explain how to post one (Dashboard → Post Project)."
	}
	return res, nil
}

// ProjectArgs identifies one project.
type ProjectArgs struct {
	ProjectID int64 `json:"project_id" jsonschema:"The project id"`
}

// ProjectResult is the scoped summary answer.
type ProjectResult struct {
	Found      bool   `json:"found"`
	Accessible bool   `json:"accessible"`
	ID         int64  `json:"id,omitempty"`
	Title      string `json:"title,omitempty"`
	Status     string `json:"status,omitempty"`
	BudgetIDR  string `json:"budget_idr,omitempty"`
	Milestones string `json:"milestones,omitempty"`
	Note       string `json:"note,omitempty"`
}

func getProject(parent context.Context, tc ToolCtx, a ProjectArgs) (ProjectResult, error) {
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	head, found, err := loadProject(ctx, tc.Pool, a.ProjectID)
	if err != nil {
		return ProjectResult{}, toolFailure("get_project", err)
	}
	if !found {
		return ProjectResult{Found: false, Note: "That project was not found."}, nil
	}
	if !head.allows(ctx, tc) {
		return ProjectResult{Found: true, Accessible: false,
			Note: "That project belongs to another account, so I can't show its details. If they shared it with you or hired you, it will appear once you're added."}, nil
	}
	var total, done int
	if err := tc.Pool.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE approval_status = 'approved')
		  FROM project_milestones WHERE project_id = $1
	`, a.ProjectID).Scan(&total, &done); err != nil {
		return ProjectResult{}, toolFailure("get_project", err)
	}
	return ProjectResult{
		Found: true, Accessible: true, ID: a.ProjectID,
		Title: head.Title, Status: head.Status, BudgetIDR: idrText(head.Budget),
		Milestones: fmt.Sprintf("%d of %d milestones approved", done, total),
	}, nil
}

// ---------------------------------------------------------------------------
// Project finance, schedule and proposals
// ---------------------------------------------------------------------------

// ProjectFinanceResult is the escrow answer for one project.
type ProjectFinanceResult struct {
	Found        bool        `json:"found"`
	Accessible   bool        `json:"accessible"`
	ProjectID    int64       `json:"project_id,omitempty"`
	BudgetIDR    string      `json:"budget_idr,omitempty"`
	PaidIDR      string      `json:"paid_idr,omitempty"`
	CommittedIDR string      `json:"committed_idr,omitempty"`
	AvailableIDR string      `json:"available_idr,omitempty"`
	PercentUsed  int         `json:"percent_used"`
	Termins      []TerminRow `json:"termins"`
	Note         string      `json:"note,omitempty"`
}

// TerminRow is one payment stage in the finance answer.
type TerminRow struct {
	Label        string `json:"label"`
	Status       string `json:"status"`
	AmountIDR    string `json:"amount_idr"`
	NetIDR       string `json:"net_idr"`
	RetentionIDR string `json:"retention_idr"`
}

func projectFinance(parent context.Context, tc ToolCtx, a ProjectArgs) (ProjectFinanceResult, error) {
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	head, found, err := loadProject(ctx, tc.Pool, a.ProjectID)
	if err != nil {
		return ProjectFinanceResult{}, toolFailure("project_finance", err)
	}
	if !found {
		return ProjectFinanceResult{Found: false, Note: "That project was not found."}, nil
	}
	if !head.allows(ctx, tc) {
		return ProjectFinanceResult{Found: true, Accessible: false, ProjectID: a.ProjectID,
			Note: "That project belongs to another account, so I can't show its finances."}, nil
	}

	// One round trip for the three independent sums.
	var paidMinor, addendumMinor, terminMinor int64
	if err := tc.Pool.QueryRow(ctx, `
		SELECT
			(SELECT COALESCE(trunc(SUM(amount) * 100)::bigint, 0)
			   FROM project_budget_transactions
			  WHERE project_id = $1
			    AND transaction_type::text IN ('payment','refund','platform_fee','retention_release')),
			(SELECT COALESCE(trunc(SUM(amount) * 100)::bigint, 0)
			   FROM project_addendums
			  WHERE project_id = $1
			    AND status::text IN ('approved_unpaid','pending_approval','verifying')),
			(SELECT COALESCE(trunc(SUM(amount) * 100)::bigint, 0)
			   FROM project_payment_termins
			  WHERE project_id = $1
			    AND status::text IN ('locked','pending','invoice_sent'))
	`, a.ProjectID).Scan(&paidMinor, &addendumMinor, &terminMinor); err != nil {
		return ProjectFinanceResult{}, toolFailure("project_finance", err)
	}
	ceiling := idrMinor(head.Budget)
	committed := addendumMinor + terminMinor
	available := ceiling - paidMinor
	percent := 0
	if ceiling > 0 {
		percent = int(paidMinor * 100 / ceiling)
	}

	rows, err := tc.Pool.Query(ctx, `
		SELECT label, status::text, amount::text, net_amount::text, retention_amount::text
		  FROM project_payment_termins
		 WHERE project_id = $1
		 ORDER BY id
		 LIMIT 20
	`, a.ProjectID)
	if err != nil {
		return ProjectFinanceResult{}, toolFailure("project_finance", err)
	}
	defer rows.Close()
	termins := []TerminRow{}
	for rows.Next() {
		var row TerminRow
		var amount, net, retention string
		if err := rows.Scan(&row.Label, &row.Status, &amount, &net, &retention); err != nil {
			return ProjectFinanceResult{}, err
		}
		row.AmountIDR = idrText(amount)
		row.NetIDR = idrText(net)
		row.RetentionIDR = idrText(retention)
		termins = append(termins, row)
	}
	if err := rows.Err(); err != nil {
		return ProjectFinanceResult{}, err
	}

	return ProjectFinanceResult{
		Found: true, Accessible: true, ProjectID: a.ProjectID,
		BudgetIDR: idrText(head.Budget), PaidIDR: formatIDR(paidMinor / 100),
		CommittedIDR: formatIDR(committed / 100), AvailableIDR: formatIDR(available / 100),
		PercentUsed: percent, Termins: termins,
	}, nil
}

// ProjectScheduleResult is the milestone/phase answer for one project.
type ProjectScheduleResult struct {
	Found      bool           `json:"found"`
	Accessible bool           `json:"accessible"`
	ProjectID  int64          `json:"project_id,omitempty"`
	Milestones []MilestoneRow `json:"milestones"`
	Phases     []ScheduleRow  `json:"phases"`
	Completed  int            `json:"completed_milestones"`
	Total      int            `json:"total_milestones"`
	Note       string         `json:"note,omitempty"`
}

// MilestoneRow is one milestone in the schedule answer.
type MilestoneRow struct {
	Title     string `json:"title"`
	Approval  string `json:"approval_status"`
	Completed bool   `json:"completed"`
	DueDate   string `json:"due_date,omitempty"`
	SortOrder int    `json:"sort_order"`
}

// ScheduleRow is one phase schedule.
type ScheduleRow struct {
	Phase     string `json:"phase"`
	Status    string `json:"status"`
	Progress  int    `json:"progress_percentage"`
	TargetEnd string `json:"target_end_date,omitempty"`
}

func projectSchedule(parent context.Context, tc ToolCtx, a ProjectArgs) (ProjectScheduleResult, error) {
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	head, found, err := loadProject(ctx, tc.Pool, a.ProjectID)
	if err != nil {
		return ProjectScheduleResult{}, toolFailure("project_schedule", err)
	}
	if !found {
		return ProjectScheduleResult{Found: false, Note: "That project was not found."}, nil
	}
	if !head.allows(ctx, tc) {
		return ProjectScheduleResult{Found: true, Accessible: false, ProjectID: a.ProjectID,
			Note: "That project belongs to another account, so I can't show its schedule."}, nil
	}

	rows, err := tc.Pool.Query(ctx, `
		SELECT title, approval_status, is_completed,
		       COALESCE(to_char(due_date, 'YYYY-MM-DD'), ''), sort_order
		  FROM project_milestones
		 WHERE project_id = $1
		 ORDER BY sort_order, id
		 LIMIT 50
	`, a.ProjectID)
	if err != nil {
		return ProjectScheduleResult{}, toolFailure("project_schedule", err)
	}
	defer rows.Close()
	out := ProjectScheduleResult{Found: true, Accessible: true, ProjectID: a.ProjectID, Milestones: []MilestoneRow{}, Phases: []ScheduleRow{}}
	for rows.Next() {
		var row MilestoneRow
		if err := rows.Scan(&row.Title, &row.Approval, &row.Completed, &row.DueDate, &row.SortOrder); err != nil {
			return ProjectScheduleResult{}, err
		}
		out.Total++
		if row.Approval == "approved" {
			out.Completed++
		}
		out.Milestones = append(out.Milestones, row)
	}
	if err := rows.Err(); err != nil {
		return ProjectScheduleResult{}, err
	}

	rows, err = tc.Pool.Query(ctx, `
		SELECT phase_slug, status, progress_percentage,
		       COALESCE(to_char(target_end_date, 'YYYY-MM-DD'), '')
		  FROM project_schedules
		 WHERE project_id = $1
		 ORDER BY phase_slug
	`, a.ProjectID)
	if err != nil {
		return ProjectScheduleResult{}, toolFailure("project_schedule", err)
	}
	defer rows.Close()
	for rows.Next() {
		var row ScheduleRow
		if err := rows.Scan(&row.Phase, &row.Status, &row.Progress, &row.TargetEnd); err != nil {
			return ProjectScheduleResult{}, err
		}
		out.Phases = append(out.Phases, row)
	}
	return out, rows.Err()
}

// ProjectBidsResult is the owner-facing proposal comparison.
type ProjectBidsResult struct {
	Found      bool     `json:"found"`
	Accessible bool     `json:"accessible"`
	ProjectID  int64    `json:"project_id,omitempty"`
	Bids       []BidRow `json:"bids"`
	Note       string   `json:"note,omitempty"`
}

// BidRow is one proposal.
type BidRow struct {
	Role       string `json:"role"`
	Bidder     string `json:"bidder,omitempty"`
	PriceIDR   string `json:"price_idr"`
	Status     string `json:"status"`
	Negotiated int    `json:"negotiation_count"`
	Excerpt    string `json:"proposal_excerpt,omitempty"`
}

func projectBids(parent context.Context, tc ToolCtx, a ProjectArgs) (ProjectBidsResult, error) {
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	head, found, err := loadProject(ctx, tc.Pool, a.ProjectID)
	if err != nil {
		return ProjectBidsResult{}, toolFailure("project_bids", err)
	}
	if !found {
		return ProjectBidsResult{Found: false, Note: "That project was not found."}, nil
	}
	if head.OwnerID != tc.UserID && !tc.IsAdmin {
		return ProjectBidsResult{Found: true, Accessible: false, ProjectID: a.ProjectID,
			Note: "Only the project owner (or an admin) can review all proposals. Your own bid stays visible under My Bids."}, nil
	}
	rows, err := tc.Pool.Query(ctx, `
		SELECT b.role::text, COALESCE(u.name, ''), b.price::text, b.status::text,
		       b.negotiation_count, COALESCE(b.proposal, '')
		  FROM bids b
		  LEFT JOIN users u ON u.id = b.bidder_user_id
		 WHERE b.project_id = $1
		 ORDER BY b.price ASC, b.id
		 LIMIT 20
	`, a.ProjectID)
	if err != nil {
		return ProjectBidsResult{}, toolFailure("project_bids", err)
	}
	defer rows.Close()
	out := ProjectBidsResult{Found: true, Accessible: true, ProjectID: a.ProjectID, Bids: []BidRow{}}
	for rows.Next() {
		var row BidRow
		if err := rows.Scan(&row.Role, &row.Bidder, &row.PriceIDR, &row.Status, &row.Negotiated, &row.Excerpt); err != nil {
			return ProjectBidsResult{}, err
		}
		row.PriceIDR = idrText(row.PriceIDR)
		row.Excerpt = truncateRunes(strings.TrimSpace(row.Excerpt), 280)
		out.Bids = append(out.Bids, row)
	}
	if err := rows.Err(); err != nil {
		return ProjectBidsResult{}, err
	}
	if len(out.Bids) == 0 {
		out.Note = "No proposals yet. The project can be shared from its workspace."
	}
	return out, nil
}

// MyBidsArgs bounds the professional's bid list.
type MyBidsArgs struct {
	Limit int `json:"limit,omitempty" jsonschema:"Max results (default 10, max 20)"`
}

// MyBidsResult lists the caller's own proposals.
type MyBidsResult struct {
	Bids []MyBidRow `json:"bids"`
	Note string     `json:"note,omitempty"`
}

// MyBidRow is one of the caller's proposals.
type MyBidRow struct {
	ProjectID  int64  `json:"project_id"`
	Project    string `json:"project_title"`
	Role       string `json:"role"`
	PriceIDR   string `json:"price_idr"`
	Status     string `json:"status"`
	Negotiated int    `json:"negotiation_count"`
	CreatedAt  string `json:"created_at,omitempty"`
}

func myBids(parent context.Context, tc ToolCtx, a MyBidsArgs) (MyBidsResult, error) {
	ctx, cancel := tc.ctx(parent)
	defer cancel()
	limit := a.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 20 {
		limit = 20
	}
	rows, err := tc.Pool.Query(ctx, `
		SELECT b.project_id, COALESCE(p.title, ''), b.role::text, b.price::text,
		       b.status::text, b.negotiation_count,
		       COALESCE(to_char(b.created_at, 'YYYY-MM-DD'), '')
		  FROM bids b
		  LEFT JOIN projects p ON p.id = b.project_id
		 WHERE b.bidder_user_id = $1
		 ORDER BY b.updated_at DESC, b.id DESC
		 LIMIT $2
	`, tc.UserID, limit)
	if err != nil {
		return MyBidsResult{}, toolFailure("my_bids", err)
	}
	defer rows.Close()
	out := MyBidsResult{Bids: []MyBidRow{}}
	for rows.Next() {
		var row MyBidRow
		if err := rows.Scan(&row.ProjectID, &row.Project, &row.Role, &row.PriceIDR, &row.Status, &row.Negotiated, &row.CreatedAt); err != nil {
			return MyBidsResult{}, err
		}
		row.PriceIDR = idrText(row.PriceIDR)
		out.Bids = append(out.Bids, row)
	}
	if err := rows.Err(); err != nil {
		return MyBidsResult{}, err
	}
	if len(out.Bids) == 0 {
		out.Note = "No bids on this account yet. The Bidding Board lists open projects."
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Access helpers
// ---------------------------------------------------------------------------

type projectHead struct {
	OwnerID int64
	Title   string
	Status  string
	Budget  string
	Parties projectParties
}

type projectParties struct {
	Arsitek    *int64
	Kontraktor *int64
	Notaris    *int64
	Interior   *int64
	PM         *int64
	Structural *int64
	MEP        *int64
}

func (p projectParties) allows(profiles map[string]int64) bool {
	matches := []struct {
		table string
		id    *int64
	}{
		{"arsiteks", p.Arsitek}, {"kontraktors", p.Kontraktor},
		{"notaris_profiles", p.Notaris}, {"interior_profiles", p.Interior},
		{"project_managers", p.PM}, {"structural_engineers", p.Structural},
		{"mep_engineers", p.MEP},
	}
	for _, match := range matches {
		if match.id == nil {
			continue
		}
		if id, ok := profiles[match.table]; ok && id == *match.id {
			return true
		}
	}
	return false
}

func (h projectHead) allows(ctx context.Context, tc ToolCtx) bool {
	return h.OwnerID == tc.UserID || tc.IsAdmin || h.Parties.allows(callerProfileIDs(ctx, tc.Pool, tc.UserID))
}

func loadProject(ctx context.Context, pool *pgxpool.Pool, projectID int64) (projectHead, bool, error) {
	var head projectHead
	err := pool.QueryRow(ctx, `
		SELECT user_id, title, status::text, budget::text,
		       selected_arsitek_id, selected_kontraktor_id, selected_notaris_id,
		       selected_interior_id, pm_id, structural_id, mep_id
		  FROM projects WHERE id = $1
	`, projectID).Scan(
		&head.OwnerID, &head.Title, &head.Status, &head.Budget,
		&head.Parties.Arsitek, &head.Parties.Kontraktor, &head.Parties.Notaris,
		&head.Parties.Interior, &head.Parties.PM, &head.Parties.Structural, &head.Parties.MEP,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return head, false, nil
	}
	return head, err == nil, err
}

func toolFailure(tool string, err error) error {
	slog.Error("ai tool failed", "tool", tool, "error", err)
	return errors.New("the 4Ceria data service is temporarily unavailable; try again")
}

// idrMinor converts a decimal IDR text into minor units for display
// arithmetic. It is deliberately integer-only: the tool never recomputes a
// ledger amount, it only formats one.
func idrMinor(value string) int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	neg := false
	if strings.HasPrefix(value, "-") {
		neg = true
		value = value[1:]
	}
	whole, fraction, _ := strings.Cut(value, ".")
	whole = strings.TrimLeft(whole, "0")
	if whole == "" {
		whole = "0"
	}
	var minor int64
	fmt.Sscanf(whole, "%d", &minor)
	minor *= 100
	fraction = (fraction + "00")[:2]
	var cents int64
	fmt.Sscanf(fraction, "%d", &cents)
	minor += cents
	if neg {
		return -minor
	}
	return minor
}

// ---------------------------------------------------------------------------
// Static knowledge + estimator (no DB)
// ---------------------------------------------------------------------------

// HelpArgs selects a topic.
type HelpArgs struct {
	Topic string `json:"topic" jsonschema:"One of: escrow, termin, bid, dispute, warranty, retention, verification, fees, how_to_post_project, how_to_hire, how_to_pay, how_to_track"`
}

// HelpResult is the knowledge answer.
type HelpResult struct {
	Answer string `json:"answer"`
}

func platformHelp(a HelpArgs) HelpResult {
	switch strings.ToLower(strings.TrimSpace(a.Topic)) {
	case "escrow":
		return HelpResult{Answer: "Escrow on 4Ceria: the client deposits the project budget into escrow (integer rupiah). Funds release only against approved milestones/payment termins. Every payment path checks for an open dispute first — while a dispute is open, payments freeze until an admin resolves it. Deposits raise the budget ceiling; payments, refunds, platform fees and retention releases never do (they spend from it). All amounts stay in the ledger (project_budget_transactions) with idempotency keys."}
	case "termin":
		return HelpResult{Answer: "Payment termins (tahapan pembayaran): the project price is split into stages (e.g. 30/40/30). Each termin moves locked → pending → invoice_sent → verifying (after the client uploads proof) → paid. Only the NET amount pays out per termin; 5% retention is held per termin and released later as its own ledger row. A termin needs its linked milestones approved before it can be invoiced."}
	case "bid":
		return HelpResult{Answer: "Bidding flow: a professional submits a bid with a fee → the owner shortlists or invites → they negotiate (a few rounds) → the professional confirms the fee → the owner accepts → both sides sign the contract (SPK, professional first, then client) → the project moves to awaiting_payment. Bid statuses include pending, invited, shortlisted, negotiated, confirmed, accepted, declined, and recommended."}
	case "dispute":
		return HelpResult{Answer: "Disputes: one open dispute per project. Opening one freezes payments on that project (422 on payment writes) until resolved. Either side posts messages/evidence; an admin acts (dismiss, release payment, record refund, terminate, or custom). A dispute can be withdrawn by its opener. If work simply ends by agreement, use mutual termination instead."}
	case "warranty":
		return HelpResult{Answer: "Warranty: after handover (BAST) and owner acceptance, a 180-day warranty covers defects. Snag items found at walkthrough must be fixed (accepted) before retention releases. Open or fixing-status warranty claims block retention release."}
	case "retention":
		return HelpResult{Answer: "Retention: 5% of every termin is held back (retention + net always equals the termin amount exactly). It releases as a separate ledger row after the warranty window when no warranty claim or dispute blocks it; a nightly sweep auto-releases expired retentions."}
	case "verification":
		return HelpResult{Answer: "Verification: professionals and suppliers complete document verification (Dashboard → Verification) before they can fully operate. Statuses: pending → verified (or rejected with a reason). Verification history is kept for audit."}
	case "fees":
		return HelpResult{Answer: "Fees: the platform fee defaults to 0% and is recorded as its own ledger row next to the payment it belongs to (it never reduces the professional's paid amount semantics — paid/refunded totals exclude it). Check the budget dashboard on the project page for the exact applied fee."}
	case "how_to_post_project":
		return HelpResult{Answer: "Post a project: Dashboard → Post Project → fill title, description, budget (IDR), location, project type and needed roles → publish. It opens for bidding (status open); review bids under the project workspace → Proposals, negotiate, accept, then both sides sign. Share via the project's share link if needed."}
	case "how_to_hire":
		return HelpResult{Answer: "Hire: open the project → Proposals tab → compare bids (fee, profile, history) → shortlist or invite → negotiate the fee → accept the bid → sign the contract (professional signs first, then you). The project then moves to awaiting_payment."}
	case "how_to_pay":
		return HelpResult{Answer: "Pay: open the project → Payments tab → the due termin shows Upload Proof → attach the transfer receipt → the professional/admin verifies → status becomes paid. Track everything under the Budget tab (total, paid, remaining)."}
	case "how_to_track":
		return HelpResult{Answer: "Track: project workspace tabs — Overview (status), Process (phases), Payments/Budget (money), Activity (log), Files (documents), QA (questions). Milestones show approved/total; daily logs and reports show site progress."}
	default:
		return HelpResult{Answer: "I can explain: escrow, termins, bidding, disputes, warranty, retention, verification, fees, or how-to (post a project, hire, pay, track). Ask about any of those, or search houses, professionals, or materials."}
	}
}

// EstimateArgs selects the estimate.
type EstimateArgs struct {
	ProjectType string  `json:"project_type" jsonschema:"new_build, renovation, or interior"`
	AreaM2      float64 `json:"area_m2" jsonschema:"Floor area in square meters"`
	Quality     string  `json:"quality,omitempty" jsonschema:"standard, middle, or premium (default middle)"`
}

// EstimateResult is the range answer.
type EstimateResult struct {
	LowIDR  string `json:"low_idr"`
	HighIDR string `json:"high_idr"`
	Note    string `json:"note"`
}

// 2026 ballpark build costs per m2 in IDR. Clearly labelled estimates.
// The arithmetic is integer-only even though the result is a display range:
// money is never a float in this codebase.
func estimateBudget(a EstimateArgs) EstimateResult {
	area := a.AreaM2
	if area <= 0 {
		area = 100
	}
	if area > 10000 {
		area = 10000
	}
	base := map[string][3]int64{
		"new_build":  {4500000, 6500000, 10000000},
		"renovation": {2500000, 4000000, 7000000},
		"interior":   {2000000, 3500000, 6000000},
	}[strings.ToLower(strings.TrimSpace(a.ProjectType))]
	if base == [3]int64{} {
		base = [3]int64{4500000, 6500000, 10000000}
	}
	idx := 1
	switch strings.ToLower(strings.TrimSpace(a.Quality)) {
	case "standard", "ekonomis":
		idx = 0
	case "premium", "mewah":
		idx = 2
	}
	// areaMilli keeps one thousandth of a square metre without making the
	// money arithmetic a float.
	areaMilli := int64(math.Round(area * 1000))
	mid := base[idx]
	low := mid * areaMilli * 85 / 100000
	high := mid * areaMilli * 125 / 100000
	return EstimateResult{
		LowIDR:  formatIDR(low),
		HighIDR: formatIDR(high),
		Note:    "ROUGH ESTIMATE only — 2026 ballpark per-m2 rates, not a quote. Real bids on 4Ceria vary by design, structure, materials and city. Post the project to collect professional bids.",
	}
}

// ---------------------------------------------------------------------------
// Formatting helpers (display only — never money arithmetic)
// ---------------------------------------------------------------------------

func idrText(v any) string {
	switch t := v.(type) {
	case nil:
		return "Rp 0"
	case string:
		if strings.TrimSpace(t) == "" {
			return "Rp 0"
		}
		return "Rp " + trimDecimals(t)
	case []byte:
		if strings.TrimSpace(string(t)) == "" {
			return "Rp 0"
		}
		return "Rp " + trimDecimals(string(t))
	case int64:
		return formatIDR(t)
	case int32:
		return formatIDR(int64(t))
	case int:
		return formatIDR(int64(t))
	case float64:
		return formatIDR(int64(t))
	case pgtype.Numeric:
		if !t.Valid {
			return "Rp 0"
		}
		if value, err := t.Value(); err == nil {
			if text, ok := value.(string); ok {
				return "Rp " + trimDecimals(text)
			}
		}
		return "Rp 0"
	case pgtype.Int8:
		if t.Valid {
			return formatIDR(t.Int64)
		}
		return "Rp 0"
	case pgtype.Float8:
		if t.Valid {
			return formatIDR(int64(t.Float64))
		}
		return "Rp 0"
	default:
		// Never silently print zero for a shape we forgot to handle: that is
		// indistinguishable from a real zero in an answer about money.
		return "Rp —"
	}
}

func trimDecimals(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '.'); i >= 0 {
		intPart := s[:i]
		frac := strings.TrimRight(s[i+1:], "0")
		if frac == "" {
			return groupThousands(intPart)
		}
		return groupThousands(intPart) + "," + frac
	}
	return groupThousands(s)
}

func groupThousands(s string) string {
	neg := ""
	if strings.HasPrefix(s, "-") {
		neg = "-"
		s = s[1:]
	}
	n := len(s)
	if n <= 3 {
		return neg + s
	}
	var b strings.Builder
	b.WriteString(neg)
	rem := n % 3
	if rem > 0 {
		b.WriteString(s[:rem])
		if n > rem {
			b.WriteByte('.')
		}
	}
	for i := rem; i < n; i += 3 {
		b.WriteString(s[i : i+3])
		if i+3 < n {
			b.WriteByte('.')
		}
	}
	return b.String()
}

func formatIDR(v int64) string {
	neg := ""
	if v < 0 {
		neg = "-"
		v = -v
	}
	s := fmt.Sprintf("%d", v)
	return "Rp " + neg + groupThousands(s)
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
