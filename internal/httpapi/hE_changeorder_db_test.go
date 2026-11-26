package httpapi

// hE change-order gaps (addendum merge, approved-milestone termin, frozen
// owner-decide, duplicate stage, no-PathValue suffix parsing), extension
// gaps (reject paths, nil-deadline approve, binding 404s) and report gaps
// (owner edits, attachment append, bad ids, gates).

import (
	"context"
	"net/http"
	"testing"
	"time"
)

func TestHEChangeOrderGaps(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// --- unauth pin ---
	rec := hECall(t, ChangeOrdersIndexHandler(pool), http.MethodGet, "/x", "", nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("co index unauth = %d, want 401", rec.Code)
	}

	// --- validation twins ---
	for _, tc := range []struct{ name, body, want string }{
		{"title-long", `{"title":"` + longStr(256) + `","description":"hE","cost_impact":1}`, "The title field must not be greater than 255 characters."},
		{"desc-long", `{"title":"hE","description":"` + longStr(2001) + `","cost_impact":1}`, "The description field must not be greater than 2000 characters."},
		{"cost-neg", `{"title":"hE","description":"hE","cost_impact":-1}`, "The cost impact field must be at least 0."},
		{"cost-huge", `{"title":"hE","description":"hE","cost_impact":100000000000000}`, "The cost impact field must not be greater than 99999999999999."},
		{"cost-word", `{"title":"hE","description":"hE","cost_impact":"lots"}`, "The cost impact field must be a number."},
		{"time-neg", `{"title":"hE","description":"hE","cost_impact":1,"time_impact_days":-1}`, "The time impact days field must be at least 0."},
		{"time-huge", `{"title":"hE","description":"hE","cost_impact":1,"time_impact_days":3651}`, "The time impact days field must not be greater than 3650."},
		{"time-word", `{"title":"hE","description":"hE","cost_impact":1,"time_impact_days":"soon"}`, "The time impact days field must be an integer."},
		{"milestone-word", `{"title":"hE","description":"hE","cost_impact":1,"milestone_id":"soon"}`, "The selected milestone id is invalid."},
	} {
		rec = hECall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x", tc.body, &fx.kontraktor, p)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("co %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}

	// --- billable addendums merge into the index with mapped statuses ---
	if _, err := pool.Exec(ctx, `INSERT INTO project_addendums (project_id, user_id, role_type, type, title, description, amount, status)
		VALUES ($1, $2, 'structural', 'specialist_request', 'hE paid extra', 'hE', 120000, 'paid'),
		       ($1, $2, 'mep', 'specialist_request', 'hE haggling', 'hE', 80000, 'negotiating')`,
		hEProjectID, hEArsitekID); err != nil {
		t.Fatalf("addendums: %v", err)
	}
	rec = hECall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hE CO","description":"hE extra","cost_impact":320000,"time_impact_days":2}`, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("co store = %d %s", rec.Code, rec.Body.String())
	}
	coID := int64(hEDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rec = hECall(t, ChangeOrdersIndexHandler(pool), http.MethodGet, "/x", "", &fx.owner, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("co index = %d %s", rec.Code, rec.Body.String())
	}
	seen := map[string]string{}
	for _, item := range hEDecode(t, rec)["data"].([]any) {
		row := item.(map[string]any)
		seen[row["id"].(string)] = row["type"].(string) + "/" + row["status"].(string) + "/" + row["title"].(string)
	}
	if len(seen) != 3 {
		t.Fatalf("co index rows = %v, want 3", seen)
	}
	var paidID, negID string
	for id, v := range seen {
		if containsStr(v, "hE paid extra") {
			paidID = id
		}
		if containsStr(v, "hE haggling") {
			negID = id
		}
	}
	if !containsStr(paidID, "add-") || seen[paidID] != "addendum/owner_approved/hE paid extra" {
		t.Fatalf("paid addendum = %q/%q", paidID, seen[paidID])
	}
	if seen[negID] != "addendum/proposed/hE haggling" {
		t.Fatalf("negotiating addendum = %q", seen[negID])
	}
	if seen["co-"+int64String(coID)] != "change_order/proposed/hE CO" {
		t.Fatalf("co row = %q", seen["co-"+int64String(coID)])
	}

	// --- pm-review via URL suffix only (no changeOrder path value) ---
	cop := map[string]string{"project": int64String(hEProjectID)}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost,
		"/api/projects/"+int64String(hEProjectID)+"/change-orders/"+int64String(coID)+"/pm-review",
		`{"action":5,"pm_notes":"hE"}`, &fx.pm, cop)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected action is invalid.") {
		t.Fatalf("pm-review bad action = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost,
		"/api/projects/"+int64String(hEProjectID)+"/change-orders/"+int64String(coID)+"/pm-review",
		`{"action":"approve"}`, &fx.pm, cop)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The pm notes field is required.") {
		t.Fatalf("pm-review no notes = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost,
		"/api/projects/"+int64String(hEProjectID)+"/change-orders/"+int64String(coID)+"/pm-review",
		`{"action":"approve","pm_notes":"`+longStr(2001)+`"}`, &fx.pm, cop)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The pm notes field must not be greater than 2000 characters.") {
		t.Fatalf("pm-review long notes = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost,
		"/api/projects/"+int64String(hEProjectID)+"/change-orders/"+int64String(coID)+"/pm-review",
		`{"action":"approve","pm_notes":"hE ok"}`, &fx.pm, cop)
	if rec.Code != http.StatusOK {
		t.Fatalf("pm-review = %d %s", rec.Code, rec.Body.String())
	}
	// twice-reviewed is a 422 with the live status
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "pm-review"), http.MethodPost,
		"/api/projects/"+int64String(hEProjectID)+"/change-orders/"+int64String(coID)+"/pm-review",
		`{"action":"reject","pm_notes":"hE no"}`, &fx.pm, cop)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("pm-review again = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "This change order has already been reviewed (status: pm_reviewed)." {
		t.Fatalf("pm-review message = %q", got)
	}

	// --- owner-decide twins + over-budget + frozen dispute ---
	copFull := map[string]string{"project": int64String(hEProjectID), "changeOrder": int64String(coID)}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve","owner_notes":5}`, &fx.owner, copFull)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The owner notes field must be a string.") {
		t.Fatalf("owner bad notes = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":""}`, &fx.owner, copFull)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The action field is required.") {
		t.Fatalf("owner empty action = %d %s", rec.Code, rec.Body.String())
	}

	// over-budget: 999.999.999 of cost against 500.000.000 of escrow
	rec = hECall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hE huge","description":"hE","cost_impact":999999999}`, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("huge store = %d %s", rec.Code, rec.Body.String())
	}
	hugeID := int64(hEDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	hugePaths := map[string]string{"project": int64String(hEProjectID), "changeOrder": int64String(hugeID)}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.owner, hugePaths)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("huge approve = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "This change order costs Rp 999.999.999 but only Rp 500.000.000 of escrow remains. Increase the project budget before approving." {
		t.Fatalf("huge message = %q", got)
	}

	// frozen: an open dispute blocks the owner decision with its identity
	var disputeID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_disputes (project_id, opened_by, category, title, description, status)
		VALUES ($1, $2, 'payment', 'hE freeze', 'hE frozen', 'open') RETURNING id`,
		hEProjectID, hEOwnerID).Scan(&disputeID); err != nil {
		t.Fatalf("dispute: %v", err)
	}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.owner, copFull)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("frozen decide = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	wantFrozen := "Payments are frozen: dispute #" + int64String(disputeID) + ` ("hE freeze") is open on this project. An admin must resolve it first.`
	if got := hEDecode(t, rec)["message"]; got != wantFrozen {
		t.Fatalf("frozen message = %q, want %q", got, wantFrozen)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_disputes WHERE id = $1`, disputeID); err != nil {
		t.Fatalf("dispute cleanup: %v", err)
	}

	// --- approve mints the exact-minor-unit stage, then blocks a duplicate ---
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve","owner_notes":"hE go"}`, &fx.owner, copFull)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner approve = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Change order decided." {
		t.Fatalf("decide message = %q", got)
	}
	var terminAmount string
	_ = pool.QueryRow(ctx, `SELECT amount::text FROM project_payment_termins WHERE change_order_id = $1`, coID).Scan(&terminAmount)
	if terminAmount != "320000.00" {
		t.Fatalf("termin = %q, want 320000.00", terminAmount)
	}
	// reset to proposed: the unique stage index refuses a second mint
	if _, err := pool.Exec(ctx, `UPDATE project_change_orders SET status = 'proposed' WHERE id = $1`, coID); err != nil {
		t.Fatalf("reset: %v", err)
	}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.owner, copFull)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("duplicate termin = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "A payment stage already exists for this change order." {
		t.Fatalf("duplicate message = %q", got)
	}
	// decided (owner_approved) twice is a 422 with the live status
	if _, err := pool.Exec(ctx, `UPDATE project_change_orders SET status = 'owner_approved' WHERE id = $1`, coID); err != nil {
		t.Fatalf("redecide setup: %v", err)
	}
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"reject"}`, &fx.owner, copFull)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("re-decide = %d, want 422 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "This change order has already been decided (status: owner_approved)." {
		t.Fatalf("re-decide message = %q", got)
	}

	// --- approved milestone: the minted stage is pending, not locked ---
	var msID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, approval_status) VALUES ($1, 'hE done ms', 'approved') RETURNING id`,
		hEProjectID).Scan(&msID); err != nil {
		t.Fatalf("ms: %v", err)
	}
	rec = hECall(t, StoreChangeOrderHandler(pool), http.MethodPost, "/x",
		`{"title":"hE linked","description":"hE","cost_impact":1000,"milestone_id":`+int64String(msID)+`}`, &fx.kontraktor, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("linked store = %d %s", rec.Code, rec.Body.String())
	}
	linkedID := int64(hEDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	rec = hECall(t, ChangeOrderDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"action":"approve"}`, &fx.owner, map[string]string{"project": int64String(hEProjectID), "changeOrder": int64String(linkedID)})
	if rec.Code != http.StatusOK {
		t.Fatalf("linked approve = %d %s", rec.Code, rec.Body.String())
	}
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_payment_termins WHERE change_order_id = $1`, linkedID).Scan(&terminAmount)
	// terminAmount reused as status here
	if terminAmount != "pending" {
		t.Fatalf("linked termin = %q, want pending", terminAmount)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHEExtensionGaps(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	// --- unauth + validation twins ---
	rec := hECall(t, StoreExtensionHandler(pool), http.MethodPost, "/x", `{"reason":"hE","days_requested":1}`, nil, p)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("ext unauth = %d, want 401", rec.Code)
	}
	for _, tc := range []struct{ name, body, want string }{
		{"reason-long", `{"reason":"` + longStr(256) + `","days_requested":1}`, "The reason field must not be greater than 255 characters."},
		{"reason-number", `{"reason":5,"days_requested":1}`, "The reason field must be a string."},
		{"desc-number", `{"reason":"hE","description":5,"days_requested":1}`, "The description field must be a string."},
		{"days-zero", `{"reason":"hE","days_requested":0}`, "The days requested field must be at least 1."},
		{"days-word", `{"reason":"hE","days_requested":"many"}`, "The days requested field must be an integer."},
	} {
		rec = hECall(t, StoreExtensionHandler(pool), http.MethodPost, "/x", tc.body, &fx.kontraktor, p)
		if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), tc.want) {
			t.Fatalf("ext %s = %d %s, want %q", tc.name, rec.Code, rec.Body.String(), tc.want)
		}
	}

	rec = hECall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hE rain","description":"hE wet","days_requested":7}`, &fx.kontraktor, p)
	if rec.Code != http.StatusOK {
		t.Fatalf("ext store = %d %s", rec.Code, rec.Body.String())
	}
	extID := int64(hEDecode(t, rec)["data"].(map[string]any)["id"].(float64))

	// --- bad-id / missing / wrong-project binding ---
	rec = hECall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, "/x/abc", `{"status":"pm_reviewed"}`, &fx.pm,
		map[string]string{"project": int64String(hEProjectID), "extension": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("ext bad id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ExtensionDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/999999999", `{"status":"approved"}`, &fx.owner,
		map[string]string{"project": int64String(hEProjectID), "extension": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("ext missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, "/x", `{"status":"pm_reviewed"}`, &fx.pm,
		map[string]string{"project": int64String(hEProject2ID), "extension": int64String(extID)})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("ext wrong project = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// --- pm-review twins: validation, then reject stamps notes ---
	extURL := func(id int64, verb string) string {
		return "/api/projects/" + int64String(hEProjectID) + "/extensions/" + int64String(id) + "/" + verb
	}
	projOnly := map[string]string{"project": int64String(hEProjectID)}
	rec = hECall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, extURL(extID, "pm-review"), `{}`, &fx.pm, projOnly)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The status field is required.") {
		t.Fatalf("pm-review empty = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, extURL(extID, "pm-review"), `{"status":"approved"}`, &fx.pm, projOnly)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected status is invalid.") {
		t.Fatalf("pm-review wrong status = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ExtensionDecisionHandler(pool, "pm-review"), http.MethodPost, extURL(extID, "pm-review"),
		`{"status":"rejected","pm_notes":"hE denied"}`, &fx.pm, projOnly)
	if rec.Code != http.StatusOK {
		t.Fatalf("pm-review reject = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Review submitted" {
		t.Fatalf("pm-review message = %q", got)
	}
	var extStatus string
	var pmNotes *string
	_ = pool.QueryRow(ctx, `SELECT status::text, pm_notes FROM project_timeline_extensions WHERE id = $1`, extID).Scan(&extStatus, &pmNotes)
	if extStatus != "rejected" || pmNotes == nil || *pmNotes != "hE denied" {
		t.Fatalf("ext = %q/%v, want rejected/hE denied", extStatus, pmNotes)
	}

	// --- owner-decide twins, then an approve on the dateless project ---
	rec = hECall(t, ExtensionDecisionHandler(pool, "owner-decide"), http.MethodPost, extURL(extID, "owner-decide"),
		`{"status":"maybe"}`, &fx.owner, projOnly)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected status is invalid.") {
		t.Fatalf("owner bad status = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, ExtensionDecisionHandler(pool, "owner-decide"), http.MethodPost, extURL(extID, "owner-decide"),
		`{"status":"rejected","owner_notes":5}`, &fx.owner, projOnly)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The owner notes field must be a string.") {
		t.Fatalf("owner bad notes = %d %s", rec.Code, rec.Body.String())
	}

	// P2 has no usable deadline at decide time: approve counts from today.
	// (store needs a deadline for original_deadline, so set-then-clear it)
	if _, err := pool.Exec(ctx, `UPDATE projects SET deadline = '2027-02-01' WHERE id = $1`, hEProject2ID); err != nil {
		t.Fatalf("p2 deadline: %v", err)
	}
	rec = hECall(t, StoreExtensionHandler(pool), http.MethodPost, "/x",
		`{"reason":"hE p2 rain","days_requested":4}`, &fx.kontraktor, hEProjectPath(hEProject2ID))
	if rec.Code != http.StatusOK {
		t.Fatalf("p2 ext store = %d %s", rec.Code, rec.Body.String())
	}
	p2ext := int64(hEDecode(t, rec)["data"].(map[string]any)["id"].(float64))
	if _, err := pool.Exec(ctx, `UPDATE projects SET deadline = NULL WHERE id = $1`, hEProject2ID); err != nil {
		t.Fatalf("p2 deadline clear: %v", err)
	}
	rec = hECall(t, ExtensionDecisionHandler(pool, "owner-decide"), http.MethodPost, "/x/owner-decide",
		`{"status":"approved"}`, &fx.owner, map[string]string{"project": int64String(hEProject2ID), "extension": int64String(p2ext)})
	if rec.Code != http.StatusOK {
		t.Fatalf("p2 approve = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Decision recorded" {
		t.Fatalf("owner message = %q", got)
	}
	wantDate := time.Now().UTC().AddDate(0, 0, 4).Format("2006-01-02")
	var newDeadline, projDeadline string
	_ = pool.QueryRow(ctx, `SELECT new_deadline_date::text, (SELECT deadline::text FROM projects WHERE id = $1) FROM project_timeline_extensions WHERE id = $2`,
		hEProject2ID, p2ext).Scan(&projDeadline, &newDeadline)
	_ = projDeadline
	if newDeadline != wantDate {
		t.Fatalf("deadline = %q, want %q (today + 4)", newDeadline, wantDate)
	}
	var gotNew string
	_ = pool.QueryRow(ctx, `SELECT new_deadline_date::text FROM project_timeline_extensions WHERE id = $1`, p2ext).Scan(&gotNew)
	if gotNew != wantDate {
		t.Fatalf("new_deadline = %q, want %q", gotNew, wantDate)
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}

func TestHEReportGaps(t *testing.T) {
	pool := hEPool(t)
	fx := hESetup(t, pool)
	ctx := context.Background()
	p := hEProjectPath(hEProjectID)

	t.Setenv("EVIDENCE_DIR", t.TempDir())
	t.Setenv("PUBLIC_STORAGE_ROOT", t.TempDir())

	// --- kontraktor (not owner/PM) is refused the write verbs ---
	rec := hECall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hE","progress_percentage":10,"budget_health":"on_track"}`, &fx.kontraktor, p)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("report kontraktor = %d, want 403 %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "This action is unauthorized." {
		t.Fatalf("report gate = %q", got)
	}

	// --- PM stores; the owner (non-creator) may still edit ---
	rec = hECall(t, StoreReportHandler(pool), http.MethodPost, "/x",
		`{"summary":"hE pm week","progress_percentage":20,"budget_health":"warning"}`, &fx.pm, p)
	if rec.Code != http.StatusCreated {
		t.Fatalf("pm report store = %d %s", rec.Code, rec.Body.String())
	}
	reportID := int64(hEDecode(t, rec)["report"].(map[string]any)["id"].(float64))
	rp := map[string]string{"project": int64String(hEProjectID), "report": int64String(reportID)}
	rec = hECall(t, UpdateReportHandler(pool), http.MethodPut, "/x",
		`{"summary":"hE owner edit","progress_percentage":25,"budget_health":"critical","phase_slug":"build"}`, &fx.owner, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner edit = %d %s", rec.Code, rec.Body.String())
	}
	var summary string
	var progress int64
	var health, phase *string
	_ = pool.QueryRow(ctx, `SELECT summary, progress_percentage, budget_health::text, phase_slug FROM project_reports WHERE id = $1`,
		reportID).Scan(&summary, &progress, &health, &phase)
	if summary != "hE owner edit" || progress != 25 || health == nil || *health != "critical" || phase == nil || *phase != "build" {
		t.Fatalf("report = %q/%d/%v/%v", summary, progress, health, phase)
	}
	// The answer carries the project relation.
	if !containsStr(rec.Body.String(), `"project"`) || !containsStr(rec.Body.String(), int64String(hEProjectID)) {
		t.Fatalf("report answer missing project relation: %.300s", rec.Body.String())
	}

	// --- attachments append via multipart; validation uses the envelope ---
	pdf := []byte("%PDF-1.4\nhE\n%%EOF\n")
	reader, ctype := hEMultipartFiles(t, map[string]string{"summary": "hE with docs"}, "attachments",
		[]hEFile{{name: "hE-spec.pdf", data: pdf}})
	req := newHEFileRequest(t, "/x", reader, ctype, rp, &fx.pm)
	urec := serveHE(UpdateReportHandler(pool), req)
	if urec.Code != http.StatusOK {
		t.Fatalf("report attach = %d %s", urec.Code, urec.Body.String())
	}
	var attachJSON string
	_ = pool.QueryRow(ctx, `SELECT attachments::text FROM project_reports WHERE id = $1`, reportID).Scan(&attachJSON)
	if !containsStr(attachJSON, "hE-spec.pdf") {
		t.Fatalf("attachments = %q, want the pdf entry", attachJSON)
	}
	rec = hECall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"summary":""}`, &fx.pm, rp)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The given data was invalid.") {
		t.Fatalf("report empty summary = %d %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, UpdateReportHandler(pool), http.MethodPut, "/x", `{"budget_health":"dying"}`, &fx.pm, rp)
	if rec.Code != http.StatusUnprocessableEntity || !containsStr(rec.Body.String(), "The selected budget health is invalid.") {
		t.Fatalf("report bad health = %d %s", rec.Code, rec.Body.String())
	}

	// --- bad-id / missing pins for update and destroy ---
	rec = hECall(t, UpdateReportHandler(pool), http.MethodPut, "/x/abc", `{"summary":"hE"}`, &fx.owner,
		map[string]string{"project": int64String(hEProjectID), "report": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("report update bad id = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, UpdateReportHandler(pool), http.MethodPut, "/x/999999999", `{"summary":"hE"}`, &fx.owner,
		map[string]string{"project": int64String(hEProjectID), "report": "999999999"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("report update missing = %d, want 404 %s", rec.Code, rec.Body.String())
	}
	rec = hECall(t, DestroyReportHandler(pool), http.MethodDelete, "/x/abc", "", &fx.owner,
		map[string]string{"project": int64String(hEProjectID), "report": "abc"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("report destroy bad id = %d, want 404 %s", rec.Code, rec.Body.String())
	}

	// --- destroy by the PM creator; the row and its files go ---
	rec = hECall(t, DestroyReportHandler(pool), http.MethodDelete, "/x", "", &fx.pm, rp)
	if rec.Code != http.StatusOK {
		t.Fatalf("report destroy = %d %s", rec.Code, rec.Body.String())
	}
	if got := hEDecode(t, rec)["message"]; got != "Report deleted successfully." {
		t.Fatalf("destroy message = %q", got)
	}
	var left int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_reports WHERE id = $1`, reportID).Scan(&left)
	if left != 0 {
		t.Fatalf("report survived destroy")
	}

	hEClean(ctx, pool)
	hEAssertNoLeftovers(t, pool)
}
