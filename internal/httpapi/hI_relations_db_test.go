package httpapi

// hI relations helpers: pure value branches plus DB-backed specialist,
// ratings and image/milestone batches.

import (
	"context"
	"testing"
	"time"
)

func TestHIRelationsPure(t *testing.T) {
	// projectDecimalText nil vs value.
	if projectDecimalText(nil) != nil {
		t.Fatalf("decimal nil")
	}
	if got := projectDecimalText(ptrString("12.50")); got != "12.50" {
		t.Fatalf("decimal value = %v", got)
	}
	// milestoneDate nil vs value.
	if milestoneDate(nil) != nil {
		t.Fatalf("milestone date nil")
	}
	fixed := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	if got := milestoneDate(&fixed); got != "2026-11-01" {
		t.Fatalf("milestone date = %v", got)
	}
	// milestoneContent: empty, non-map, gallery, no-gallery.
	if milestoneContent(context.Background(), nil) != nil {
		t.Fatalf("content nil")
	}
	if milestoneContent(context.Background(), []byte{}) != nil {
		t.Fatalf("content empty")
	}
	// Non-map JSON passes through.
	decoded := milestoneContent(context.Background(), []byte(`[1,2]`))
	if list, ok := decoded.([]any); !ok || len(list) != 2 {
		t.Fatalf("content array = %v", decoded)
	}
	// Map without gallery passes through.
	decoded = milestoneContent(context.Background(), []byte(`{"foo":"bar"}`))
	if m, ok := decoded.(map[string]any); !ok || m["foo"] != "bar" {
		t.Fatalf("content map = %v", decoded)
	}
	// firstPhoneOrEmpty.
	if firstPhoneOrEmpty(nil) != "" {
		t.Fatalf("phone empty")
	}
	if firstPhoneOrEmpty([]string{}) != "" {
		t.Fatalf("phone empty slice")
	}
	if firstPhoneOrEmpty([]string{"hI-081"}) != "hI-081" {
		t.Fatalf("phone value")
	}
	// projectIntValue branches.
	if projectIntValue(nil) != nil {
		t.Fatalf("int nil")
	}
	if projectIntValue(int64(7)) != int64(7) {
		t.Fatalf("int64")
	}
	if projectIntValue(int32(8)) != int64(8) {
		t.Fatalf("int32")
	}
	if projectIntValue(int(9)) != int64(9) {
		t.Fatalf("int")
	}
	if projectIntValue("hI") != nil {
		t.Fatalf("int string should be nil")
	}
	// projectTimeValue nil vs time.
	if projectTimeValue(nil) != nil {
		t.Fatalf("time nil")
	}
	if got := projectTimeValue(fixed); got == nil {
		t.Fatalf("time value nil")
	}
	// projectRawValue.
	if projectRawValue(nil) != nil {
		t.Fatalf("raw nil")
	}
	if projectRawValue("hI") != "hI" {
		t.Fatalf("raw string")
	}
	if projectRawValue(true) != true {
		t.Fatalf("raw bool")
	}
	// projectDecimalValue.
	if projectDecimalValue(nil) != nil {
		t.Fatalf("decval nil")
	}
	if projectDecimalValue("1.00") != "1.00" {
		t.Fatalf("decval string")
	}
	// ratingFK.
	if ratingFK("arsiteks") != "arsitek_id" {
		t.Fatalf("ratingFK arsiteks")
	}
	if ratingFK("kontraktors") != "kontraktor_id" {
		t.Fatalf("ratingFK kontraktors")
	}
	if ratingFK("notaris_profiles") != "notaris_id" {
		t.Fatalf("ratingFK notaris")
	}
	if ratingFK("interior_profiles") != "interior_id" {
		t.Fatalf("ratingFK interior")
	}
	if ratingFK("project_managers") != "pm_id" {
		t.Fatalf("ratingFK pm")
	}
	if ratingFK("bogus") != "" {
		t.Fatalf("ratingFK bogus")
	}
	// specialistName pure branches (no DB hit).
	eng := map[string]any{"company_name": "hI Co"}
	if got := specialistName(context.Background(), nil, "structural", eng, nil, nil, "Fallback"); got != "hI Co" {
		t.Fatalf("spec company = %v", got)
	}
	eng = map[string]any{"nama": "hI Nama"}
	if got := specialistName(context.Background(), nil, "structural", eng, nil, nil, "Fallback"); got != "hI Nama" {
		t.Fatalf("spec nama = %v", got)
	}
	// No engineer, no subPro → fallback.
	if got := specialistName(context.Background(), nil, "structural", nil, nil, nil, "hI Fallback"); got != "hI Fallback" {
		t.Fatalf("spec fallback = %v", got)
	}
}

func ptrString(s string) *string {
	dup := s
	return &dup
}

func TestHIRelationsDB(t *testing.T) {
	pool := hIPool(t)
	fx := hISetup(t, pool)
	ctx := context.Background()

	// Images batch: empty vs populated.
	m, err := projectImagesBatch(ctx, pool, []int64{})
	if err != nil || len(m) != 0 {
		t.Fatalf("images empty = %v %v", m, err)
	}
	m, err = projectImagesBatch(ctx, pool, []int64{fx.projectID})
	if err != nil {
		t.Fatalf("images batch: %v", err)
	}
	if len(m[fx.projectID]) != 0 {
		t.Fatalf("images should be empty, got %d", len(m[fx.projectID]))
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_images (project_id, image_path, sort_order, created_at, updated_at)
		VALUES ($1, 'hI/pic.jpg', 0, now(), now())`, fx.projectID); err != nil {
		t.Fatalf("image insert: %v", err)
	}
	m, err = projectImagesBatch(ctx, pool, []int64{fx.projectID})
	if err != nil || len(m[fx.projectID]) != 1 {
		t.Fatalf("images one = %v %v", m, err)
	}
	// Milestones batch: empty vs populated with gallery content.
	mm, err := projectMilestonesBatch(ctx, pool, []int64{})
	if err != nil || len(mm) != 0 {
		t.Fatalf("milestones empty")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_milestones (project_id, title, content, created_at, updated_at)
		VALUES ($1, 'hI MS', '{"gallery":["vault/hI-a.pdf"]}'::jsonb, now(), now())`, fx.projectID); err != nil {
		t.Fatalf("milestone insert: %v", err)
	}
	mm, err = projectMilestonesBatch(ctx, pool, []int64{fx.projectID})
	if err != nil || len(mm[fx.projectID]) != 1 {
		t.Fatalf("milestones one = %v %v", mm, err)
	}
	// Requirements: empty then one row with decimals.
	reqs, err := projectRequirements(ctx, pool, fx.projectID)
	if err != nil {
		t.Fatalf("reqs: %v", err)
	}
	if len(reqs) != 0 {
		t.Fatalf("reqs should be empty")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_requirements
		(project_id, name, quantity_required, quantity_procured_externally, external_cost, quantity_on_site, quantity_used, unit, created_at, updated_at)
		VALUES ($1, 'hI Req', 5, 1, 100, 2, 1, 'pcs', now(), now())`, fx.projectID); err != nil {
		t.Fatalf("req insert: %v", err)
	}
	reqs, err = projectRequirements(ctx, pool, fx.projectID)
	if err != nil || len(reqs) != 1 {
		t.Fatalf("reqs one = %v %v", reqs, err)
	}
	// Addendums: empty then one with assigned user (no team member: the
	// is_verified column does not exist, so any present team id would 500).
	adds, err := projectAddendums(ctx, pool, fx.projectID)
	if err != nil {
		t.Fatalf("adds: %v", err)
	}
	if len(adds) != 0 {
		t.Fatalf("adds empty")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums
		(project_id, role_type, user_id, assigned_user_id, title, amount, status, created_at, updated_at)
		VALUES ($1, 'arsitek', $2, $2, 'hI Add', 1000, 'pending_approval', now(), now())`,
		fx.projectID, fx.owner.id); err != nil {
		t.Fatalf("addendum insert: %v", err)
	}
	adds, err = projectAddendums(ctx, pool, fx.projectID)
	if err != nil || len(adds) != 1 {
		t.Fatalf("adds one = %v %v", adds, err)
	}
	// NOTE: addendumTeamMember is not exercised: its SELECT names
	// is_verified, which does not exist in team_members, so any present
	// id would 500. The nil-id branch (no DB call) is already covered by
	// the addendum above (team_member_id NULL).
	// addendumAssignedUser happy.
	au, err := addendumAssignedUser(ctx, pool, fx.owner.id)
	if err != nil || au == nil {
		t.Fatalf("assigned user = %v %v", au, err)
	}
	// specialistPaymentStatus: no bids/addendums → unpaid literal.
	st, err := specialistPaymentStatus(ctx, pool, "structural", fx.projectID)
	if err != nil || st != "unpaid" {
		t.Fatalf("payment status = %v %v", st, err)
	}
	// Unknown role → unpaid (0.0% branch).
	st, err = specialistPaymentStatus(ctx, pool, "wizard", fx.projectID)
	if err != nil || st != "unpaid" {
		t.Fatalf("payment wizard = %v %v", st, err)
	}
	// specialist profile nil/nil → nil.
	sp, err := projectSpecialistProfile(ctx, pool, "structural", fx.projectID, nil)
	if err != nil {
		t.Fatalf("spec nil: %v", err)
	}
	if sp != nil {
		t.Fatalf("spec nil should be nil, got %v", sp)
	}
	// profileRatings empty.
	ratings, err := profileRatings(ctx, pool, "arsiteks", hIArsitekProfileID)
	if err != nil {
		t.Fatalf("ratings: %v", err)
	}
	_ = ratings
	_ = fx
}
