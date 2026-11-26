package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hCCallQuick(pool *pgxpool.Pool, caller *roadmapCaller, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/firm-members/quick-assign", strings.NewReader(body))
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	FirmMembersQuickAssignHandler(pool)(rec, r)
	return rec
}

func hCSeedFirmSetup(t *testing.T, ctx context.Context, pool *pgxpool.Pool, tag string) (ownerID, ownerProfID, memberID, projectID int64) {
	t.Helper()
	lead := hCMkUser(t, ctx, pool, tag+"lead", "arsitek")
	var prof int64
	if err := pool.QueryRow(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,$2,'verified') RETURNING id`, lead, "hC Lead "+tag).Scan(&prof); err != nil {
		t.Fatalf("lead profile: %v", err)
	}
	member := hCMkUser(t, ctx, pool, tag+"mem", "user")
	var proj int64
	if err := pool.QueryRow(ctx, `INSERT INTO projects (user_id, title, status, budget) VALUES ($1,$2,'open',10000000) RETURNING id`, lead, "hC QA "+tag).Scan(&proj); err != nil {
		t.Fatalf("qa project: %v", err)
	}
	// hire the lead: selected_arsitek_id = lead profile
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$2 WHERE id=$1`, proj, prof); err != nil {
		t.Fatalf("hire lead: %v", err)
	}
	return lead, prof, member, proj
}

func hCCleanupFirmSetup(ctx context.Context, pool *pgxpool.Pool, lead, member, project int64) {
	pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id=$1`, project)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE project_id=$1`, project)
	pool.Exec(ctx, `DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM project_disputes WHERE project_id=$1)`, project)
	pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, project)
	pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, project)
	pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, project)
	pool.Exec(ctx, `DELETE FROM firm_members WHERE firm_owner_id=$1 OR member_user_id=$1`, lead)
	pool.Exec(ctx, `DELETE FROM firm_members WHERE firm_owner_id=$1 OR member_user_id=$1`, member)
	pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, project)
	pool.Exec(ctx, `DELETE FROM arsiteks WHERE user_id=$1`, lead)
	pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, lead)
	pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, member)
}

func TestHCQuickAssignBranches(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	// Unauth rejection twin
	if rec := hCCallQuick(pool, nil, `{}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("quick unauth = %d", rec.Code)
	}

	lead, _, member, project := hCSeedFirmSetup(t, ctx, pool, "qa1")
	defer hCCleanupFirmSetup(ctx, pool, lead, member, project)
	leadCaller := &roadmapCaller{id: lead, role: "arsitek"}

	// Validation twins — exact messages
	// empty: 4 required fields, summarize adds "(and 3 more errors)" (literal)
	rec := hCCallQuick(pool, leadCaller, `{}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick empty = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "member_user_id", "The member user id field is required.")
	if got := hCDecode(t, rec)["message"].(string); got != "The member user id field is required. (and 3 more errors)" {
		t.Fatalf("quick empty msg = %q", got)
	}

	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":"abc","project_id":"xyz","sub_role":"x","rate":1}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick invalid ids = %d", rec.Code)
	}
	hCErrors(t, rec, "member_user_id", "The selected member user id is invalid.")

	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":123,"rate":100}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick subrole type = %d %s", rec.Code, rec.Body.String())
	}
	hCErrors(t, rec, "sub_role", "The sub role field must be a string.")

	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":"`+strings.Repeat("s", 51)+`","rate":100}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick subrole long = %d", rec.Code)
	}
	hCErrors(t, rec, "sub_role", "The sub role field must not be greater than 50 characters.")

	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":"hC-draft","rate":"abc"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick rate nan = %d", rec.Code)
	}
	hCErrors(t, rec, "rate", "The rate field must be a number.")

	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":"hC-draft","rate":-5}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick rate neg = %d", rec.Code)
	}
	hCErrors(t, rec, "rate", "The rate field must be at least 0.")

	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":"hC-draft","rate":100,"description":123}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick desc type = %d", rec.Code)
	}
	hCErrors(t, rec, "description", "The description field must be a string.")

	// Not in roster -> 403 holds this active role
	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":"hC-draft","rate":100}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("quick no-roster = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "The selected specialist does not hold this active role in your firm roster." {
		t.Fatalf("quick no-roster msg = %q", got)
	}

	// Join roster, but viewer not hired lead -> 403 Unauthorized
	if _, err := pool.Exec(ctx, `INSERT INTO firm_members (firm_owner_id, member_user_id, role_in_firm, status) VALUES ($1,$2,'hC-draft','active')`, lead, member); err != nil {
		t.Fatalf("roster: %v", err)
	}
	// Unhire lead: clear selected_arsitek_id
	if _, err := pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=NULL WHERE id=$1`, project); err != nil {
		t.Fatalf("unhire: %v", err)
	}
	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":"hC-draft","rate":100}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("quick not-hired = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Unauthorized. You must be the hired lead professional on this project." {
		t.Fatalf("quick not-hired msg = %q", got)
	}
	// Re-hire lead
	var profID int64
	_ = pool.QueryRow(ctx, `SELECT id FROM arsiteks WHERE user_id=$1`, lead).Scan(&profID)
	pool.Exec(ctx, `UPDATE projects SET selected_arsitek_id=$2 WHERE id=$1`, project, profID)

	// Freeze: open dispute blocks with 422
	var openDispute int64
	_ = pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status) VALUES ($1,$2,'quality','hC Freeze','hC freeze','open') RETURNING id`, project, lead).Scan(&openDispute)
	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":"hC-draft","rate":100}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("quick frozen = %d %s", rec.Code, rec.Body.String())
	}
	if !contains(rec.Body.String(), "Payments are frozen") {
		t.Fatalf("quick frozen msg = %s", rec.Body.String())
	}
	// close dispute for happy path (dismiss via admin not needed: withdraw by opener)
	pool.Exec(ctx, `UPDATE project_disputes SET status='withdrawn' WHERE id=$1`, openDispute)
	pool.Exec(ctx, `DELETE FROM project_disputes WHERE id=$1`, openDispute)

	// Happy: assignment proposal created — literals pinned
	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":"hC-draft","rate":150000,"description":"hC Draft Work"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("quick happy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Specialist assignment proposal submitted to project owner." {
		t.Fatalf("quick happy msg = %q", got)
	}
	// Post-state literals: addendum row
	var aTitle, aDesc, aType, aSType, aStatus, aAmt string
	var aProj, aRoleUID, aAssign int64
	var aRole string
	if err := pool.QueryRow(ctx, `SELECT project_id, role_type, user_id, title, amount::text, description, type, assigned_user_id, specialist_type, status FROM project_addendums WHERE project_id=$1 AND assigned_user_id=$2 ORDER BY id DESC LIMIT 1`, project, member).Scan(&aProj, &aRole, &aRoleUID, &aTitle, &aAmt, &aDesc, &aType, &aAssign, &aSType, &aStatus); err != nil {
		t.Fatalf("quick row: %v", err)
	}
	if aProj != project || aRole != "arsitek" || aRoleUID != lead || aTitle != "Specialist Assignment: HC-DRAFT" || aAmt != "150000.00" || aDesc != "hC Draft Work" || aType != "specialist_assignment" || aAssign != member || aSType != "hC-draft" || aStatus != "pending_approval" {
		t.Fatalf("quick row = %d %s %d %q %s %q %s %d %s %s", aProj, aRole, aRoleUID, aTitle, aAmt, aDesc, aType, aAssign, aSType, aStatus)
	}

	// Duplicate proposal -> 409
	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member)+`,"project_id":`+itoaTest(project)+`,"sub_role":"hC-draft","rate":100}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("quick dup = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "An assignment proposal for this specialist and capability is already pending or active on this project." {
		t.Fatalf("quick dup msg = %q", got)
	}

	// Structural already assigned -> 409 (separate member/role)
	member2 := hCMkUser(t, ctx, pool, "qa1mem2", "user")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, member2)
	pool.Exec(ctx, `INSERT INTO firm_members (firm_owner_id, member_user_id, role_in_firm, status) VALUES ($1,$2,'structural','active')`, lead, member2)
	// assign structural slot on project
	var structProf int64
	structUser := hCMkUser(t, ctx, pool, "qa1struct", "structural")
	defer hCCleanupProfessionalLite(ctx, pool, structUser, "structural_engineers")
	_ = pool.QueryRow(ctx, `INSERT INTO structural_engineers (user_id, nama, verification_status) VALUES ($1,'hC Struct','verified') RETURNING id`, structUser).Scan(&structProf)
	pool.Exec(ctx, `UPDATE projects SET structural_id=$2 WHERE id=$1`, project, structProf)
	rec = hCCallQuick(pool, leadCaller, `{"member_user_id":`+itoaTest(member2)+`,"project_id":`+itoaTest(project)+`,"sub_role":"structural","rate":100}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("quick structural = %d %s", rec.Code, rec.Body.String())
	}
	if got := hCDecode(t, rec)["message"].(string); got != "Structural Engineer is already assigned to this project." {
		t.Fatalf("quick structural msg = %q", got)
	}
	// cleanup structural slot for zero leftovers
	pool.Exec(ctx, `UPDATE projects SET structural_id=NULL WHERE id=$1`, project)
	pool.Exec(ctx, `DELETE FROM firm_members WHERE firm_owner_id=$1 AND member_user_id=$2`, lead, member2)
	pool.Exec(ctx, `DELETE FROM structural_engineers WHERE user_id=$1`, structUser)
	pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, structUser)
	// member2 users row deleted via defer; firm row already removed above
}

func hCCleanupProfessionalLite(ctx context.Context, pool *pgxpool.Pool, userID int64, table string) {
	pool.Exec(ctx, `DELETE FROM `+table+` WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
}
