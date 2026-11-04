package ai

import (
	"context"
	"fmt"
	"strings"
	"time"

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
	Pool    *pgxpool.Pool
	UserID  int64
	IsAdmin bool
	Timeout time.Duration
}

func (c ToolCtx) ctx(parent context.Context) (context.Context, context.CancelFunc) {
	d := c.Timeout
	if d <= 0 {
		d = 8 * time.Second
	}
	return context.WithTimeout(parent, d)
}

// BuildTools constructs the agent's function tools for one request.
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
	}, func(_ agent.Context, a HouseSearchArgs) (HouseSearchResult, error) {
		return searchHouses(context.Background(), tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "get_house",
		Description: "Returns one property listing in detail (price, address, rooms, description). Call with the house id from search_houses.",
	}, func(_ agent.Context, a HouseArgs) (HouseResult, error) {
		return getHouse(context.Background(), tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "search_professionals",
		Description: "Searches the verified professional directory. Role is one of: arsitek, kontraktor, interior, notaris, project_manager, structural, mep. Returns names, specialisation, location, experience.",
	}, func(_ agent.Context, a ProSearchArgs) (ProSearchResult, error) {
		return searchProfessionals(context.Background(), tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "search_materials",
		Description: "Searches the live building-materials catalogue (name, price IDR, unit, category, stock). Use for material/price questions.",
	}, func(_ agent.Context, a MaterialSearchArgs) (MaterialSearchResult, error) {
		return searchMaterials(context.Background(), tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "my_projects",
		Description: "Lists the CURRENT user's projects (owned or hired on): id, title, status, budget. Use for 'my project', 'status of my project', progress questions.",
	}, func(_ agent.Context, a MyProjectsArgs) (MyProjectsResult, error) {
		return myProjects(context.Background(), tc, a)
	})); err != nil {
		return nil, err
	}

	if err := add(functiontool.New(functiontool.Config{
		Name:        "get_project",
		Description: "Returns one project the CURRENT user owns or is hired on (status, budget, milestones progress, parties). Refuses with an explanation when the project is not theirs.",
	}, func(_ agent.Context, a ProjectArgs) (ProjectResult, error) {
		return getProject(context.Background(), tc, a)
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
	Query    string  `json:"query,omitempty" jsonschema:"Free-text search on name, description, area"`
	City     string  `json:"city,omitempty" jsonschema:"City (kab/kota), e.g. Bandung"`
	PriceMin float64 `json:"price_min,omitempty" jsonschema:"Minimum price in IDR"`
	PriceMax float64 `json:"price_max,omitempty" jsonschema:"Maximum price in IDR"`
	Bedrooms int     `json:"bedrooms,omitempty" jsonschema:"Minimum bedrooms"`
	Limit    int     `json:"limit,omitempty" jsonschema:"Max results (default 5, max 10)"`
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
		SELECT h.id, h.name, h.price, h.kab_kota, h.br, h.ba
		  FROM house h WHERE `+strings.Join(conds, " AND ")+`
		 ORDER BY h.created_at DESC LIMIT `+ph(), args...)
	if err != nil {
		return HouseSearchResult{}, err
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
		SELECT h.name, h.price, h.house_desc, h.street_name, h.kelurahan,
		       h.kecamatan, h.kab_kota, h.province, h.br, h.ba
		  FROM house h WHERE h.id = $1 AND h.is_suspended = false
	`, a.HouseID).Scan(&name, &price, &desc, &street, &kel, &kec, &city, &prov, &br, &ba)
	if err != nil {
		return HouseResult{Found: false, Note: "That listing was not found. It may have been removed."}, nil
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
		rate = "p." + cfg.rateCol
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
		return ProSearchResult{}, err
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
		row.RateIDR = idrText(rateV)
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
		SELECT m.name, m.price, m.unit, m.category, m.stock
		  FROM materials m WHERE `+conds+`
		 ORDER BY m.updated_at DESC LIMIT $`+fmt.Sprintf("%d", len(args)), args...)
	if err != nil {
		return MaterialSearchResult{}, err
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
	for _, t := range []string{"arsiteks", "kontraktors", "notaris_profiles", "interior_profiles", "structural_engineers", "mep_engineers", "project_managers"} {
		var id *int64
		if err := pool.QueryRow(ctx, `SELECT id FROM `+t+` WHERE user_id = $1`, userID).Scan(&id); err == nil && id != nil {
			ids[t] = *id
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
		SELECT p.id, p.title, p.status::text, p.budget
		  FROM projects p WHERE (`+strings.Join(conds, " OR ")+`)
		 ORDER BY p.updated_at DESC LIMIT $`+fmt.Sprintf("%d", len(args)), args...)
	if err != nil {
		return MyProjectsResult{}, err
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
	var title, status *string
	var budget any
	var ownerID int64
	err := tc.Pool.QueryRow(ctx, `
		SELECT p.title, p.status::text, p.budget, p.user_id
		  FROM projects p WHERE p.id = $1
	`, a.ProjectID).Scan(&title, &status, &budget, &ownerID)
	if err != nil {
		return ProjectResult{Found: false, Note: "That project was not found."}, nil
	}
	allowed := ownerID == tc.UserID || tc.IsAdmin
	if !allowed {
		prof := callerProfileIDs(ctx, tc.Pool, tc.UserID)
		cols := map[string]string{
			"arsiteks": "selected_arsitek_id", "kontraktors": "selected_kontraktor_id",
			"notaris_profiles": "selected_notaris_id", "interior_profiles": "selected_interior_id",
			"project_managers": "pm_id", "structural_engineers": "structural_id", "mep_engineers": "mep_id",
		}
		for table, col := range cols {
			id, ok := prof[table]
			if !ok {
				continue
			}
			var one int64
			if err := tc.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM projects WHERE id = $1 AND `+col+` = $2`, a.ProjectID, id).Scan(&one); err == nil && one > 0 {
				allowed = true
				break
			}
		}
	}
	if !allowed {
		return ProjectResult{Found: true, Accessible: false,
			Note: "That project belongs to another account, so I can't show its details. If they shared it with you or hired you, it will appear once you're added."}, nil
	}
	var total, done int
	_ = tc.Pool.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'approved')
		  FROM project_milestones WHERE project_id = $1
	`, a.ProjectID).Scan(&total, &done)
	r := ProjectResult{Found: true, Accessible: true, ID: a.ProjectID}
	if title != nil {
		r.Title = *title
	}
	if status != nil {
		r.Status = *status
	}
	r.BudgetIDR = idrText(budget)
	r.Milestones = fmt.Sprintf("%d of %d milestones approved", done, total)
	return r, nil
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
func estimateBudget(a EstimateArgs) EstimateResult {
	area := a.AreaM2
	if area <= 0 {
		area = 100
	}
	if area > 10000 {
		area = 10000
	}
	base := map[string][3]float64{
		"new_build":  {4500000, 6500000, 10000000},
		"renovation": {2500000, 4000000, 7000000},
		"interior":   {2000000, 3500000, 6000000},
	}[strings.ToLower(strings.TrimSpace(a.ProjectType))]
	if base == [3]float64{} {
		base = [3]float64{4500000, 6500000, 10000000}
	}
	idx := 1
	switch strings.ToLower(strings.TrimSpace(a.Quality)) {
	case "standard", "ekonomis":
		idx = 0
	case "premium", "mewah":
		idx = 2
	}
	mid := base[idx]
	low, high := mid*0.85*area, mid*1.25*area
	return EstimateResult{
		LowIDR:  formatIDR(int64(low)),
		HighIDR: formatIDR(int64(high)),
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
		return "Rp " + trimDecimals(t)
	case []byte:
		return "Rp " + trimDecimals(string(t))
	case int64:
		return formatIDR(t)
	case int32:
		return formatIDR(int64(t))
	case int:
		return formatIDR(int64(t))
	case float64:
		return formatIDR(int64(t))
	default:
		return "Rp 0"
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
