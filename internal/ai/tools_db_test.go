package ai

import (
	"context"
	"strings"
	"testing"
)

// These tests pin the part that is easy to get subtly wrong without a live
// database: PostgreSQL numeric formatting and the ownership scope of the
// project tools. They run only when DATABASE_URL points at a seeded database.

func TestToolMoneyFormattingAgainstPostgres(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	defer pool.Close()
	ctx := context.Background()
	tc := ToolCtx{Pool: pool, UserID: userID}

	var houseID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM house WHERE is_suspended = false AND price > 0 ORDER BY id LIMIT 1`).Scan(&houseID); err != nil {
		t.Skip("no seeded house")
	}
	houses, err := searchHouses(ctx, tc, HouseSearchArgs{Limit: 5})
	if err != nil {
		t.Fatalf("search houses: %v", err)
	}
	if len(houses.Houses) == 0 {
		t.Fatal("no houses returned")
	}
	for _, house := range houses.Houses {
		if house.PriceIDR == "Rp 0" || house.PriceIDR == "Rp —" {
			t.Errorf("house %d price lost its numeric type: %q", house.ID, house.PriceIDR)
		}
	}
	detail, err := getHouse(ctx, tc, HouseArgs{HouseID: houseID})
	if err != nil {
		t.Fatalf("get house: %v", err)
	}
	if !detail.Found || strings.HasPrefix(detail.PriceIDR, "Rp 0") {
		t.Errorf("house detail: %+v", detail)
	}

	var materialName string
	var materialPrice string
	if err := pool.QueryRow(ctx, `SELECT name, price::text FROM materials WHERE is_available = true AND price > 0 ORDER BY id LIMIT 1`).Scan(&materialName, &materialPrice); err == nil {
		materials, err := searchMaterials(ctx, tc, MaterialSearchArgs{Query: materialName, Limit: 3})
		if err != nil {
			t.Fatalf("search materials: %v", err)
		}
		if len(materials.Materials) == 0 {
			t.Fatalf("material %q was not found", materialName)
		}
		if materials.Materials[0].PriceIDR == "Rp 0" || materials.Materials[0].PriceIDR == "Rp —" {
			t.Errorf("material price lost its numeric type: %q", materials.Materials[0].PriceIDR)
		}
	}
}

func TestProjectToolsRespectOwnership(t *testing.T) {
	pool, userID, otherID := memoryPool(t)
	defer pool.Close()
	ctx := context.Background()

	var projectID, ownerID int64
	err := pool.QueryRow(ctx, `
		SELECT id, user_id FROM projects
		 WHERE budget > 0
		 ORDER BY id LIMIT 1
	`).Scan(&projectID, &ownerID)
	if err != nil {
		t.Skip("no seeded project")
	}
	other := otherID
	if other == ownerID {
		other = userID
	}
	if other == ownerID {
		t.Skip("no second user")
	}

	owner := ToolCtx{Pool: pool, UserID: ownerID}
	project, err := getProject(ctx, owner, ProjectArgs{ProjectID: projectID})
	if err != nil {
		t.Fatalf("get project as owner: %v", err)
	}
	if !project.Found || !project.Accessible || project.BudgetIDR == "Rp 0" || project.BudgetIDR == "Rp —" {
		t.Fatalf("owner project: %+v", project)
	}

	stranger := ToolCtx{Pool: pool, UserID: other}
	denied, err := getProject(ctx, stranger, ProjectArgs{ProjectID: projectID})
	if err != nil {
		t.Fatalf("get project as stranger: %v", err)
	}
	if !denied.Found || denied.Accessible {
		t.Fatalf("stranger saw the project: %+v", denied)
	}

	finance, err := projectFinance(ctx, owner, ProjectArgs{ProjectID: projectID})
	if err != nil {
		t.Fatalf("finance: %v", err)
	}
	if !finance.Accessible || finance.BudgetIDR == "" || strings.HasPrefix(finance.BudgetIDR, "Rp 0") {
		t.Fatalf("finance: %+v", finance)
	}
	schedule, err := projectSchedule(ctx, owner, ProjectArgs{ProjectID: projectID})
	if err != nil {
		t.Fatalf("schedule: %v", err)
	}
	if !schedule.Accessible {
		t.Fatalf("schedule denied: %+v", schedule)
	}
	bids, err := projectBids(ctx, owner, ProjectArgs{ProjectID: projectID})
	if err != nil {
		t.Fatalf("bids: %v", err)
	}
	if !bids.Accessible {
		t.Fatalf("bids denied: %+v", bids)
	}
}

func TestMyBidsScope(t *testing.T) {
	pool, _, _ := memoryPool(t)
	defer pool.Close()
	ctx := context.Background()
	var bidder int64
	if err := pool.QueryRow(ctx, `SELECT bidder_user_id FROM bids ORDER BY id LIMIT 1`).Scan(&bidder); err != nil {
		t.Skip("no seeded bids")
	}
	tc := ToolCtx{Pool: pool, UserID: bidder}
	bids, err := myBids(ctx, tc, MyBidsArgs{Limit: 20})
	if err != nil {
		t.Fatalf("my bids: %v", err)
	}
	if len(bids.Bids) == 0 {
		t.Fatal("bidder has no bids")
	}
	for _, bid := range bids.Bids {
		if bid.PriceIDR == "Rp 0" || bid.PriceIDR == "Rp —" {
			t.Errorf("bid price lost its numeric type: %q", bid.PriceIDR)
		}
	}
}

func TestCallerProfileIDsCachedMemoizes(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	defer pool.Close()
	ctx := context.Background()
	tc := ToolCtx{Pool: pool, UserID: userID, Profiles: NewProfileCache()}

	first := callerProfileIDsCached(ctx, tc, userID)
	second := callerProfileIDsCached(ctx, tc, userID)
	if len(first) == 0 {
		t.Skip("caller holds no profile rows")
	}
	if len(first) != len(second) {
		t.Fatalf("cached profiles differ: %d vs %d", len(first), len(second))
	}
	for table, id := range first {
		if second[table] != id {
			t.Fatalf("table %s: %d vs %d", table, id, second[table])
		}
	}
	if tc.Profiles.byUser[userID] == nil {
		t.Fatal("cache was not populated")
	}
}
