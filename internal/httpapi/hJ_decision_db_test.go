package httpapi

// hJ decision coverage: the kontraktor accept that runs the implicit
// design verification over a non-empty completed-phases list — the
// item-string and already-designed arms the shared suite leaves dark.

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestHJAcceptKontraktorImplicitVerify(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner := hJMkUser(t, ctx, pool, "impvown", "user")
	kontra := hJMkUser(t, ctx, pool, "impvkontra", "kontraktor")
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, kontra)
	defer pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	var kontraProf int64
	if err := pool.QueryRow(ctx, `INSERT INTO kontraktors (user_id, nama, verification_status) VALUES ($1,'hJ Kontra','verified') RETURNING id`, kontra).Scan(&kontraProf); err != nil {
		t.Fatalf("profile: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM kontraktors WHERE id=$1`, kontraProf)
	pid := hJMkProject(t, ctx, pool, owner, "hJ Implicit Verify")
	defer func() {
		pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_milestones WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
		pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
	}()
	// Non-empty phases with design already recorded: the item loop and
	// the already-designed arm both run.
	if _, err := pool.Exec(ctx, `UPDATE projects SET completed_phases='["legal","design"]'::jsonb, status='open' WHERE id=$1`, pid); err != nil {
		t.Fatalf("phases: %v", err)
	}
	var bidID int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, kontraktor_id, price, calculated_total, proposal, status, fee_type, offered_by_id, negotiation_count) VALUES ($1,'kontraktor',$2,$3,$3,'200000000','200000000','hJ prop','shortlisted','fixed',$2,0) RETURNING id`, pid, kontra, kontraProf).Scan(&bidID); err != nil {
		t.Fatalf("bid: %v", err)
	}

	ownerCaller := &roadmapCaller{id: owner, role: "user"}
	rec := hJCall(AcceptBidHandler(pool), http.MethodPost, "/x", `{"bid_id":`+itoaTest(bidID)+`,"bid_type":"kontraktor"}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("accept kontraktor = %d %s", rec.Code, rec.Body.String())
	}
	var designAt, lockAt, doneAt *string
	var phases string
	var designLog int
	if err := pool.QueryRow(ctx, `SELECT owner_design_approved_at::text, design_locked_at::text, design_completed_at::text, completed_phases::text, (SELECT count(*) FROM project_activity_logs WHERE project_id=$1 AND action='design_verified') FROM projects WHERE id=$1`, pid).Scan(&designAt, &lockAt, &doneAt, &phases, &designLog); err != nil {
		t.Fatalf("post: %v", err)
	}
	if designAt == nil || lockAt == nil || doneAt == nil || designLog != 1 {
		t.Fatalf("verify stamps = %v %v %v log %d", designAt, lockAt, doneAt, designLog)
	}
	// Design is recorded exactly once: no duplicate phase appended.
	if strings.Count(phases, "design") != 1 || !strings.Contains(phases, "legal") {
		t.Fatalf("phases = %q", phases)
	}
	var bidStatus string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM bids WHERE id=$1`, bidID).Scan(&bidStatus)
	if bidStatus != "contract_pending" {
		t.Fatalf("bid status = %q", bidStatus)
	}
}
