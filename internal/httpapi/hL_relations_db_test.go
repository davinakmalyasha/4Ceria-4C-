package httpapi

// hL relations: addendum slices, specialist fallback chains, payment
// status legs, ratings, review twins, batch loaders and row rendering.

import (
	"context"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
)

func TestHLAddendumSlices(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)

	// Plain addendum: no team, no assignee — nil slices in table order.
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (project_id, role_type, title, amount, status)
		VALUES ($1,'arsitek','hL Plain',1000,'pending_approval')`, fx.projectID); err != nil {
		t.Fatalf("seed addendum: %v", err)
	}
	list, err := projectAddendums(ctx, pool, fx.projectID)
	if err != nil {
		t.Fatalf("addendums: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("addendums len = %d", len(list))
	}
	first := list[0].(*jsonwire.Object)
	title, _ := first.Get("title")
	if title != "hL Plain" {
		t.Fatalf("addendum title = %v", title)
	}
	if tm, _ := first.Get("teamMember"); tm != nil {
		t.Fatalf("teamMember = %v, want nil", tm)
	}
	if au, _ := first.Get("assignedUser"); au != nil {
		t.Fatalf("assignedUser = %v, want nil", au)
	}

	// Assigned user slice: phone from the relation, pic from storage.
	if _, err := pool.Exec(ctx, `INSERT INTO phone_user (contact, id_contact, id_user) VALUES ('+62811',NULL,$1)`, fx.arsitek.id); err != nil {
		t.Fatalf("seed phone: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (project_id, role_type, title, amount, status, assigned_user_id)
		VALUES ($1,'kontraktor','hL Assigned',2000,'pending_approval',$2)`, fx.projectID, fx.arsitek.id); err != nil {
		t.Fatalf("seed assigned addendum: %v", err)
	}
	got, err := addendumAssignedUser(ctx, pool, fx.arsitek.id)
	if err != nil || got == nil {
		t.Fatalf("assigned user = %v %v", got, err)
	}
	assigned := got.(*jsonwire.Object)
	if phone, _ := assigned.Get("phone_number"); phone != "+62811" {
		t.Fatalf("assigned phone = %v", phone)
	}
	if name, _ := assigned.Get("name"); name != "hL Arsitek" {
		t.Fatalf("assigned name = %v", name)
	}

	// Team-member slice: the table has no is_verified column, so the loader
	// documents the schema gap with an error instead of a row.
	if _, err := pool.Exec(ctx, `INSERT INTO team_members (owner_user_id, name, role_title) VALUES ($1,'hL Member','hL Role')`, fx.owner.id); err != nil {
		t.Fatalf("seed member: %v", err)
	}
	var memberID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM team_members WHERE owner_user_id=$1`, fx.owner.id).Scan(&memberID); err != nil {
		t.Fatalf("member id: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (project_id, role_type, title, amount, status, team_member_id)
		VALUES ($1,'arsitek','hL Team',3000,'pending_approval',$2)`, fx.projectID, memberID); err != nil {
		t.Fatalf("seed team addendum: %v", err)
	}
	if _, err := addendumTeamMember(ctx, pool, memberID); err == nil {
		t.Fatalf("team member unexpectedly ok")
	}
	// A team-member addendum propagates that loader error (never a half
	// row, never a silent nil).
	if _, err := projectAddendums(ctx, pool, fx.projectID); err == nil {
		t.Fatalf("addendums with team row ok, want error")
	}
	// Missing team member row errors like every other call: the missing
	// column fails the query before the no-rows check can run. When the
	// column lands, this leg becomes (nil, nil) and this pin must flip.
	if _, err := addendumTeamMember(ctx, pool, 19999991); err == nil {
		t.Fatalf("missing member unexpectedly ok")
	}
}

func TestHLSpecialistProfile(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)

	// No hired profile and no active assignment: nil, nil (no fallback).
	got, err := projectSpecialistProfile(ctx, pool, "structural", fx.projectID, nil)
	if err != nil || got != nil {
		t.Fatalf("empty specialist = %v %v", got, err)
	}

	// Hired structural engineer with a company name: platform_hired.
	var engID int64
	if err := pool.QueryRow(ctx, `INSERT INTO structural_engineers (user_id, company_name, nama, verification_status) VALUES ($1,'hL Struct Co','hL Struct','verified') RETURNING id`,
		fx.arsitek.id).Scan(&engID); err != nil {
		t.Fatalf("seed engineer: %v", err)
	}
	profileID := engID
	got, err = projectSpecialistProfile(ctx, pool, "structural", fx.projectID, &profileID)
	if err != nil || got == nil {
		t.Fatalf("hired specialist = %v %v", got, err)
	}
	block := got.(*jsonwire.Object)
	if name, _ := block.Get("name"); name != "hL Struct Co" {
		t.Fatalf("specialist name = %v", name)
	}
	if typ, _ := block.Get("type"); typ != "platform_hired" {
		t.Fatalf("specialist type = %v", typ)
	}
	if pay, _ := block.Get("payment_status"); pay != "unpaid" {
		t.Fatalf("specialist pay = %v", pay)
	}
	if uid, _ := block.Get("user_id"); uid != fx.arsitek.id {
		t.Fatalf("specialist user = %v", uid)
	}

	// Active sub-professional assignment with a prefixed note: with no
	// hired profile the note is cleaned to the lead's name and the
	// external user is surfaced.
	if _, err := pool.Exec(ctx, `INSERT INTO project_sub_professionals (project_id, user_id, parent_role, sub_role, assigned_by, status, lead_pro_notes)
		VALUES ($1,$2,'kontraktor','structural',$3,'active','Team: hL Lead')`,
		fx.projectID, fx.kontraktor.id, fx.owner.id); err != nil {
		t.Fatalf("seed subpro: %v", err)
	}
	got, err = projectSpecialistProfile(ctx, pool, "structural", fx.projectID, nil)
	if err != nil || got == nil {
		t.Fatalf("subpro specialist = %v %v", got, err)
	}
	sub := got.(*jsonwire.Object)
	// The assignee's user name wins over the lead note.
	if name, _ := sub.Get("name"); name != "hL Kontraktor" {
		t.Fatalf("subpro name = %v", name)
	}
	if uid, _ := sub.Get("user_id"); uid != fx.kontraktor.id {
		t.Fatalf("subpro user = %v", uid)
	}
	if internal, _ := sub.Get("is_internal"); internal != false {
		t.Fatalf("subpro internal = %v", internal)
	}
	if subID, _ := sub.Get("sub_professional_id"); subID == nil {
		t.Fatalf("subpro id missing")
	}
	// A prefixed lead note is cleaned when the assignment is internal
	// (assignee == assigner, so the user leg is skipped).
	pool.Exec(ctx, `DELETE FROM project_sub_professionals WHERE project_id=$1`, fx.projectID)
	if _, err := pool.Exec(ctx, `INSERT INTO project_sub_professionals (project_id, user_id, parent_role, sub_role, assigned_by, status, lead_pro_notes)
		VALUES ($1,$2,'kontraktor','structural',$2,'active','Assigned via Paid Addendum (Manual): Team: hL Lead')`,
		fx.projectID, fx.owner.id); err != nil {
		t.Fatalf("seed internal subpro: %v", err)
	}
	got, err = projectSpecialistProfile(ctx, pool, "structural", fx.projectID, nil)
	if err != nil || got == nil {
		t.Fatalf("internal subpro = %v %v", got, err)
	}
	// The row's note/name arrive as *string, so the string legs below do
	// not fire through this path: the fallback answers. The cleanup
	// itself is pinned directly below with string values.
	if name, _ := got.(*jsonwire.Object).Get("name"); name != "Structural Engineer" {
		t.Fatalf("internal subpro name = %v", name)
	}
	// Direct notes cleanup: prefix and Team label stripped.
	if got := specialistName(ctx, pool, "mep", nil,
		map[string]any{"lead_pro_notes": "Assigned via Paid Addendum (Manual): Team: hL Lead"}, nil, "hL Fall"); got != "hL Lead" {
		t.Fatalf("notes cleanup = %v", got)
	}
	if got := specialistName(ctx, pool, "mep", nil,
		map[string]any{"lead_pro_notes": "   "}, nil, "hL Fall"); got != "   " {
		t.Fatalf("blank notes = %q", got)
	}

	// A hired engineer wins over the assignment for the display name.
	var otherEng int64
	_ = pool.QueryRow(ctx, `INSERT INTO structural_engineers (user_id, nama, verification_status) VALUES ($1,'hL NoCo','verified') RETURNING id`,
		fx.pm.id).Scan(&otherEng)
	got, err = projectSpecialistProfile(ctx, pool, "structural", fx.projectID, &otherEng)
	if err != nil || got == nil {
		t.Fatalf("hired+subpro specialist = %v %v", got, err)
	}
	if name, _ := got.(*jsonwire.Object).Get("name"); name != "hL NoCo" {
		t.Fatalf("hired+subpro name = %v", name)
	}

	// Nameless self-assignment without notes: the role fallback title.
	pool.Exec(ctx, `UPDATE project_sub_professionals SET lead_pro_notes=NULL WHERE project_id=$1`, fx.projectID)
	got, err = projectSpecialistProfile(ctx, pool, "structural", fx.projectID, nil)
	if err != nil || got == nil {
		t.Fatalf("fallback specialist = %v %v", got, err)
	}
	fallback := got.(*jsonwire.Object)
	if name, _ := fallback.Get("name"); name != "Structural Engineer" {
		t.Fatalf("fallback name = %v", name)
	}
	if internal, _ := fallback.Get("is_internal"); internal != true {
		t.Fatalf("self-assign internal = %v", internal)
	}

	// specialistName legs, direct: user fallback, team fallback, raw fallback.
	if got := specialistName(ctx, pool, "mep", map[string]any{"user_id": fx.notaris.id}, nil, nil, "hL Fall"); got != "hL Notaris" {
		t.Fatalf("name user fallback = %v", got)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO team_members (owner_user_id, name, role_title) VALUES ($1,'hL Team Lead','hL')`, fx.owner.id); err != nil {
		t.Fatalf("seed team: %v", err)
	}
	var teamID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM team_members WHERE owner_user_id=$1`, fx.owner.id).Scan(&teamID)
	if got := specialistName(ctx, pool, "mep", nil, nil, &teamID, "hL Fall"); got != "hL Team Lead" {
		t.Fatalf("name team fallback = %v", got)
	}
	if got := specialistName(ctx, pool, "mep", map[string]any{}, map[string]any{}, nil, "hL Fall"); got != "hL Fall" {
		t.Fatalf("name raw fallback = %v", got)
	}
	if got := specialistName(ctx, pool, "mep", map[string]any{"company_name": "hL MEP Co"}, nil, nil, "hL Fall"); got != "hL MEP Co" {
		t.Fatalf("name company = %v", got)
	}
	if got := specialistName(ctx, pool, "mep", map[string]any{"nama": "hL Mep"}, nil, nil, "hL Fall"); got != "hL Mep" {
		t.Fatalf("name nama = %v", got)
	}
	// Sub-pro user leg: external assignee resolves through users.
	if got := specialistName(ctx, pool, "mep", nil,
		map[string]any{"user_id": fx.notaris.id, "assigned_by": fx.owner.id}, nil, "hL Fall"); got != "hL Notaris" {
		t.Fatalf("name subpro user = %v", got)
	}
	// Sub-pro explicit name leg.
	if got := specialistName(ctx, pool, "mep", nil,
		map[string]any{"user_id": int64(0), "assigned_by": int64(0), "name": "hL Sub"}, nil, "hL Fall"); got != "hL Sub" {
		t.Fatalf("name subpro name = %v", got)
	}
	// Paid-addendum leg beats the authorized leg beats unpaid.
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (project_id, role_type, specialist_type, type, title, amount, status)
		VALUES ($1,'contractor','mep','specialist_assignment','hL Spec',1000,'paid')`, fx.projectID); err != nil {
		t.Fatalf("seed paid spec: %v", err)
	}
	if got, err := specialistPaymentStatus(ctx, pool, "mep", fx.projectID); err != nil || got != "paid" {
		t.Fatalf("spec paid = %v %v", got, err)
	}
	pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id=$1`, fx.projectID)
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (project_id, role_type, specialist_type, type, title, amount, status)
		VALUES ($1,'contractor','mep','specialist_request','hL Spec2',1000,'authorized')`, fx.projectID); err != nil {
		t.Fatalf("seed auth spec: %v", err)
	}
	if got, err := specialistPaymentStatus(ctx, pool, "mep", fx.projectID); err != nil || got != "authorized" {
		t.Fatalf("spec auth = %v %v", got, err)
	}
	pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id=$1`, fx.projectID)
	if got, err := specialistPaymentStatus(ctx, pool, "mep", fx.projectID); err != nil || got != "unpaid" {
		t.Fatalf("spec unpaid = %v %v", got, err)
	}
	// Contracted bid leg: the bid's own payment status wins.
	if _, err := pool.Exec(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, structural_id, status, payment_status)
		VALUES ($1,'structural',$2,$3,$3,'accepted','verifying')`, fx.projectID, fx.arsitek.id, engID); err != nil {
		t.Fatalf("seed bid: %v", err)
	}
	if got, err := specialistPaymentStatus(ctx, pool, "structural", fx.projectID); err != nil || got != "verifying" {
		t.Fatalf("spec bid = %v %v", got, err)
	}
	// Unknown role never touches the tables.
	if got, err := specialistPaymentStatus(ctx, pool, "wizard", fx.projectID); err != nil || got != "unpaid" {
		t.Fatalf("spec unknown = %v %v", got, err)
	}
}

func TestHLProfileRatingsReviews(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)

	// Unknown table: empty, no error.
	if out, err := profileRatings(ctx, pool, "suppliers", hLSupplierProfileID); err != nil || len(out) != 0 {
		t.Fatalf("ratings unknown = %v %v", out, err)
	}
	// Empty table: empty, no error.
	if out, err := profileRatings(ctx, pool, "arsiteks", hLArsitekProfileID); err != nil || len(out) != 0 {
		t.Fatalf("ratings empty = %v %v", out, err)
	}
	// Seeded rating serializes in table order with reviewer 5.
	if _, err := pool.Exec(ctx, `INSERT INTO arsitek_ratings (project_id, reviewer_id, arsitek_id, rating, komentar)
		VALUES ($1,$2,$3,5,'hL great')`, fx.projectID, fx.owner.id, hLArsitekProfileID); err != nil {
		t.Fatalf("seed rating: %v", err)
	}
	out, err := profileRatings(ctx, pool, "arsiteks", hLArsitekProfileID)
	if err != nil || len(out) != 1 {
		t.Fatalf("ratings = %d %v", len(out), err)
	}
	entry := out[0].(*jsonwire.Object)
	if rating, _ := entry.Get("rating"); rating != int32(5) && rating != int64(5) && rating != 5 {
		t.Fatalf("rating value = %v (%T)", rating, rating)
	}
	if comment, _ := entry.Get("komentar"); comment != "hL great" {
		t.Fatalf("rating comment = %v", comment)
	}

	// projectReview: nil profile, missing rating, seeded rating.
	if got, err := projectReview(ctx, pool, "arsitek_ratings", "arsitek_id", nil); err != nil || got != nil {
		t.Fatalf("review nil = %v %v", got, err)
	}
	other := int64(19999992)
	if got, err := projectReview(ctx, pool, "arsitek_ratings", "arsitek_id", &other); err != nil || got != nil {
		t.Fatalf("review missing = %v %v", got, err)
	}
	arsitekProfile := hLArsitekProfileID
	got, err := projectReview(ctx, pool, "arsitek_ratings", "arsitek_id", &arsitekProfile)
	if err != nil || got == nil {
		t.Fatalf("review = %v %v", got, err)
	}
	// projectKontraktorReview: missing then seeded.
	if got, err := projectKontraktorReview(ctx, pool, fx.projectID); err != nil || got != nil {
		t.Fatalf("kreview missing = %v %v", got, err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO kontraktor_ratings (project_id, reviewer_id, kontraktor_id, rating, komentar)
		VALUES ($1,$2,$3,4,'hL solid')`, fx.projectID, fx.owner.id, hLKontraktorProfileID); err != nil {
		t.Fatalf("seed kreview: %v", err)
	}
	got, err = projectKontraktorReview(ctx, pool, fx.projectID)
	if err != nil || got == nil {
		t.Fatalf("kreview = %v %v", got, err)
	}
	if rating, _ := got.(*jsonwire.Object).Get("rating"); rating != 4 {
		t.Fatalf("kreview rating = %v", rating)
	}

	// subProfessionalUser: missing user nil, seeded user block.
	if got, err := subProfessionalUser(ctx, pool, 19999993); err != nil || got != nil {
		t.Fatalf("subuser missing = %v %v", got, err)
	}
	got, err = subProfessionalUser(ctx, pool, fx.kontraktor.id)
	if err != nil || got == nil {
		t.Fatalf("subuser = %v %v", got, err)
	}
	if email, _ := got.(*jsonwire.Object).Get("email"); email != "hl-kontraktor@example.test" {
		t.Fatalf("subuser email = %v", email)
	}
}

func TestHLBatchLoaders(t *testing.T) {
	pool := hLPool(t)
	ctx := context.Background()
	fx := hLSetup(t, pool)

	// fullProfileUsersBatch: phones on, one user phoneless (empty list leg).
	if _, err := pool.Exec(ctx, `INSERT INTO phone_user (contact, id_contact, id_user) VALUES ('+62812',NULL,$1)`, fx.owner.id); err != nil {
		t.Fatalf("seed phone: %v", err)
	}
	batch, err := fullProfileUsersBatch(ctx, pool, []int64{fx.owner.id, fx.stranger.id}, true, true)
	if err != nil {
		t.Fatalf("batch phones: %v", err)
	}
	ownerBlock := batch[fx.owner.id].(*jsonwire.Object)
	phones, _ := ownerBlock.Get("phone_number")
	if list, ok := phones.([]any); !ok || len(list) != 1 {
		t.Fatalf("owner phones = %v", phones)
	}
	strangerBlock := batch[fx.stranger.id].(*jsonwire.Object)
	if list, _ := strangerBlock.Get("phone_number"); list == nil {
		t.Fatalf("stranger phones missing")
	} else if items, ok := list.([]any); !ok || len(items) != 0 {
		t.Fatalf("stranger phones = %v", list)
	}
	// Phones off: early return without the phone key.
	batch, err = fullProfileUsersBatch(ctx, pool, []int64{fx.owner.id}, false, true)
	if err != nil {
		t.Fatalf("batch nophones: %v", err)
	}
	if _, has := batch[fx.owner.id].(*jsonwire.Object).Get("phone_number"); has {
		t.Fatalf("nophones batch carries phone_number")
	}
	// Empty ids: empty map, no query.
	if out, err := fullProfileUsersBatch(ctx, pool, nil, true, true); err != nil || len(out) != 0 {
		t.Fatalf("batch empty = %v %v", out, err)
	}

	// fullProfileUserContact: zero id, missing user, happy with phones.
	if got, err := fullProfileUserContact(ctx, pool, 0, true, true); err != nil || got != nil {
		t.Fatalf("contact zero = %v %v", got, err)
	}
	if got, err := fullProfileUserContact(ctx, pool, 19999994, true, true); err != nil || got != nil {
		t.Fatalf("contact missing = %v %v", got, err)
	}
	got, err := fullProfileUserContact(ctx, pool, fx.owner.id, true, true)
	if err != nil || got == nil {
		t.Fatalf("contact = %v %v", got, err)
	}
	// profileUserObject renders a suspended flag from a non-bool source.
	obj := profileUserObject([]string{"id", "is_suspended"}, []any{fx.owner.id, int64(1)}, true)
	if flag, _ := obj.Get("is_suspended"); flag != true {
		t.Fatalf("suspended int = %v", flag)
	}
	obj = profileUserObject([]string{"id", "is_suspended"}, []any{fx.owner.id, nil}, true)
	if flag, _ := obj.Get("is_suspended"); flag != false {
		t.Fatalf("suspended nil = %v", flag)
	}
	// adminUserResponse on a missing user still carries the roles key.
	roles, err := adminUserRoles(ctx, pool, 19999995)
	if err != nil {
		t.Fatalf("roles missing: %v", err)
	}
	_ = roles
	resp, err := adminUserResponse(ctx, pool, 19999995)
	if err != nil {
		t.Fatalf("user response missing: %v", err)
	}
	if _, has := resp.Get("roles"); !has {
		t.Fatalf("missing user response has no roles")
	}
	// Closed-pool error twins for the loaders.
	closed := testPool(t)
	closed.Close()
	if _, err := fullProfileUserContact(ctx, closed, fx.owner.id, true, true); err == nil {
		t.Fatalf("contact closed ok, want error")
	}
	if _, err := fullProfileUsersBatch(ctx, closed, []int64{fx.owner.id}, true, true); err == nil {
		t.Fatalf("batch closed ok, want error")
	}
	if _, err := adminUserResponse(ctx, closed, fx.owner.id); err == nil {
		t.Fatalf("user response closed ok, want error")
	}
	if _, err := profileRatings(ctx, closed, "arsiteks", hLArsitekProfileID); err == nil {
		t.Fatalf("ratings closed ok, want error")
	}
	if _, err := projectAddendums(ctx, closed, fx.projectID); err == nil {
		t.Fatalf("addendums closed ok, want error")
	}
	if _, err := addendumAssignedUser(ctx, closed, fx.owner.id); err == nil {
		t.Fatalf("assigned closed ok, want error")
	}
}
