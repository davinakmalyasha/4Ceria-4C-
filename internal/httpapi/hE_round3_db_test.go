package httpapi

// hE round 3: bogus-string enum spellings (the last validation arms) and
// the specialist_type fallback in the hire decision.

import (
	"context"
	"net/http"
	"testing"
)

func TestHERound3EnumShapes(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// A live addendum for the authorize/reject shapes.
	rec := hECall(t, RequestEngineeringRoleHandler(pool), http.MethodPost, "/x",
		`{"role_type":"structural","description":"hE round3"}`, &fx.arsitek, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("round3 addendum = %d %s", rec.Code, rec.Body.String())
	}
	var liveAdd int64
	_ = pool.QueryRow(ctx, `SELECT id FROM project_addendums WHERE project_id = $1 AND description = 'hE round3' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&liveAdd)

	// A live change order for the action shape.
	recCO := hECall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hE round3","description":"hE","cost_impact":5}`, &fx.kontraktor, p)
	if recCO.Code != http.StatusCreated {
		t.Fatalf("round3 co = %d %s", recCO.Code, recCO.Body.String())
	}
	liveCO := map[string]string{"project": int64String(hEProjectID),
		"changeOrder": int64String(int64(hEDecode(t, recCO)["data"].(map[string]any)["id"].(float64)))}

	cases := []struct {
		name string
		h    http.HandlerFunc
		body string
		vals map[string]string
		who  *roadmapCaller
		want string
	}{
		{"integration-civil", ApproveEngineeringIntegrationHandler(pool), `{"role_type":"civil"}`, p, &fx.owner, "The selected role type is invalid."},
		{"authorize-civil", AuthorizeSpecialistHandler(pool), `{"role_type":"civil","addendum_id":` + int64String(liveAdd) + `}`, p, &fx.owner, "The selected role type is invalid."},
		{"reject-spec-civil", RejectSpecialistHandler(pool), `{"role_type":"civil","addendum_id":` + int64String(liveAdd) + `}`, p, &fx.owner, "The selected role type is invalid."},
		{"lock-lobby", LockPhaseBriefHandler(pool), `{"phase":"lobby"}`, p, &fx.kontraktor, "The selected phase is invalid."},
		{"co-action-maybe", ChangeOrderDecisionHandler(pool, "pm-review"), `{"action":"maybe","pm_notes":"hE"}`, liveCO, &fx.pm, "The selected action is invalid."},
	}
	for _, c := range cases {
		rec := hECall(t, c.h, http.MethodPost, "/x", c.body, c.who, c.vals)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), c.want) {
			t.Fatalf("%s = %d %s, want 422 %q", c.name, rec.Code, rec.Body.String(), c.want)
		}
	}

	// Hire decision falls back to specialist_type when role_type is blank.
	if _, err := pool.Exec(ctx, `UPDATE project_addendums SET role_type = '', specialist_type = 'mep' WHERE id = $1`, liveAdd); err != nil {
		t.Fatalf("blank role: %v", err)
	}
	hp := map[string]string{"project": int64String(hEProjectID), "addendum": int64String(liveAdd)}
	rec = hECall(t, ApproveEngineeringHireHandler(pool), http.MethodPost, "/x", `{}`, &fx.owner, hp)
	if rec.Code != http.StatusOK {
		t.Fatalf("hire fallback = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Hiring approved. Awaiting payment." {
		t.Fatalf("hire message = %q", got)
	}
	var details string
	_ = pool.QueryRow(ctx, `SELECT details FROM project_activity_logs WHERE project_id = $1 AND action = 'engineering_hire_approved' ORDER BY id DESC LIMIT 1`, hEProjectID).Scan(&details)
	if details != "Owner approved hiring for mep" {
		t.Fatalf("hire log = %q, want the specialist fallback label", details)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}
