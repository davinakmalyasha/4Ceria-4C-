package httpapi

// hJ mark-paid coverage: the notaris/interior bid arms, the already-paid
// termin refusal, the notary role label, the specialist-assignment
// finalisation (existing-sub update, role fallback, no-specialist
// short-circuit, mep/interior slots), the recommended-bid path and the
// string/default id validators.

import (
	"context"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hJMarkPaidSetup(t *testing.T, ctx context.Context, pool *pgxpool.Pool, title string) (owner int64, pid int64, caller *roadmapCaller) {
	t.Helper()
	owner = hJMkUser(t, ctx, pool, "mpown", "user")
	pid = hJMkProject(t, ctx, pool, owner, title)
	return owner, pid, &roadmapCaller{id: owner, role: "user"}
}

func hJMarkPaidCleanup(ctx context.Context, pool *pgxpool.Pool, pid, owner int64) {
	pool.Exec(ctx, `DELETE FROM project_activity_logs WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=$1`, owner)
	pool.Exec(ctx, `DELETE FROM project_budget_transactions WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM project_sub_professionals WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM project_addendums WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM bids WHERE project_id=$1`, pid)
	pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, pid)
}

func TestHJMarkPaidBidRoles(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner, pid, ownerCaller := hJMarkPaidSetup(t, ctx, pool, "hJ MarkPaid Roles")
	defer func() {
		hJMarkPaidCleanup(ctx, pool, pid, owner)
		pool.Exec(ctx, `DELETE FROM notaris_profiles WHERE user_id=$1`, owner)
		pool.Exec(ctx, `DELETE FROM interior_profiles WHERE user_id=$1`, owner)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	}()

	var notProf, intProf int64
	if err := pool.QueryRow(ctx, `INSERT INTO notaris_profiles (user_id, nama, verification_status) VALUES ($1,'hJ Nota','verified') RETURNING id`, owner).Scan(&notProf); err != nil {
		t.Fatalf("notaris profile: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO interior_profiles (user_id, nama, verification_status) VALUES ($1,'hJ Int','verified') RETURNING id`, owner).Scan(&intProf); err != nil {
		t.Fatalf("interior profile: %v", err)
	}
	var notBid, intBid int64
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, notaris_id, price, calculated_total, status, payment_status) VALUES ($1,'notaris',$2,$3,$3,'100000','100000','pending','unpaid') RETURNING id`, pid, owner, notProf).Scan(&notBid); err != nil {
		t.Fatalf("notaris bid: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, interior_id, price, calculated_total, status, payment_status) VALUES ($1,'interior',$2,$3,$3,'75000','75000','pending','unpaid') RETURNING id`, pid, owner, intProf).Scan(&intBid); err != nil {
		t.Fatalf("interior bid: %v", err)
	}

	rec := hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"bid_notaris","id":`+itoaTest(notBid)+`}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid notaris = %d %s", rec.Code, rec.Body.String())
	}
	body := hJDecode(t, rec)
	if got := body["message"].(string); got != "Successfully marked as paid and deducted from budget." {
		t.Fatalf("notaris msg = %q", got)
	}
	if got := body["budget"].(string); got != "10000000.00" {
		t.Fatalf("notaris budget = %q", got)
	}
	var nst string
	_ = pool.QueryRow(ctx, `SELECT payment_status::text FROM bids WHERE id=$1`, notBid).Scan(&nst)
	if nst != "paid" {
		t.Fatalf("notaris bid = %s", nst)
	}
	var ntitle, namt string
	_ = pool.QueryRow(ctx, `SELECT title, amount::text FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' ORDER BY id DESC LIMIT 1`, pid).Scan(&ntitle, &namt)
	if ntitle != "Paid Notaris Base Fee" || namt != "100000.00" {
		t.Fatalf("notaris ledger = %q %q", ntitle, namt)
	}

	rec = hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"bid_interior","id":`+itoaTest(intBid)+`}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid interior = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["budget"].(string); got != "10000000.00" {
		t.Fatalf("interior budget = %q", got)
	}
	var ititle, iamt string
	_ = pool.QueryRow(ctx, `SELECT title, amount::text FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' ORDER BY id DESC LIMIT 1`, pid).Scan(&ititle, &iamt)
	if ititle != "Paid Interior Designer Base Fee" || iamt != "75000.00" {
		t.Fatalf("interior ledger = %q %q", ititle, iamt)
	}
}

func TestHJMarkPaidTerminGuards(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner, pid, ownerCaller := hJMarkPaidSetup(t, ctx, pool, "hJ MarkPaid Termin")
	defer func() {
		hJMarkPaidCleanup(ctx, pool, pid, owner)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	}()

	paid := hJMkTermin(t, ctx, pool, pid, "hJ Termin Paid", "paid", 100000)
	rec := hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"termin","id":`+itoaTest(paid)+`}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("markpaid paid = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "This payment has already been marked as paid." {
		t.Fatalf("markpaid paid msg = %q", got)
	}

	nota := hJMkTermin(t, ctx, pool, pid, "hJ Termin Notary", "pending", 50000)
	if _, err := pool.Exec(ctx, `UPDATE project_payment_termins SET role_type='notaris' WHERE id=$1`, nota); err != nil {
		t.Fatalf("role: %v", err)
	}
	rec = hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"termin","id":`+itoaTest(nota)+`}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("markpaid notary = %d %s", rec.Code, rec.Body.String())
	}
	var ntitle string
	_ = pool.QueryRow(ctx, `SELECT title FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' ORDER BY id DESC LIMIT 1`, pid).Scan(&ntitle)
	if ntitle != "Paid Notary Termin: hJ Termin Notary" {
		t.Fatalf("notary ledger title = %q", ntitle)
	}
}

func TestHJMarkPaidSpecialist(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner, pid, ownerCaller := hJMarkPaidSetup(t, ctx, pool, "hJ MarkPaid Spec")
	structSpec := hJMkUser(t, ctx, pool, "mpspecst", "structural")
	mepSpec := hJMkUser(t, ctx, pool, "mpspecmep", "mep")
	intSpec := hJMkUser(t, ctx, pool, "mpspecint", "interior")
	defer func() {
		hJMarkPaidCleanup(ctx, pool, pid, owner)
		pool.Exec(ctx, `DELETE FROM structural_engineers WHERE user_id=$1`, structSpec)
		pool.Exec(ctx, `DELETE FROM mep_engineers WHERE user_id=$1`, mepSpec)
		pool.Exec(ctx, `DELETE FROM interior_profiles WHERE user_id=$1`, intSpec)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, intSpec)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, mepSpec)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, structSpec)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	}()
	var structProf, mepProf, intProf int64
	if err := pool.QueryRow(ctx, `INSERT INTO structural_engineers (user_id, nama, verification_status) VALUES ($1,'hJ Struct','verified') RETURNING id`, structSpec).Scan(&structProf); err != nil {
		t.Fatalf("struct profile: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO mep_engineers (user_id, nama, verification_status) VALUES ($1,'hJ Mep','verified') RETURNING id`, mepSpec).Scan(&mepProf); err != nil {
		t.Fatalf("mep profile: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO interior_profiles (user_id, nama, verification_status) VALUES ($1,'hJ Int','verified') RETURNING id`, intSpec).Scan(&intProf); err != nil {
		t.Fatalf("int profile: %v", err)
	}

	mkAddendum := func(title, stype, role string, assignee *int64) int64 {
		t.Helper()
		var id int64
		if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, type, role_type, user_id, title, amount, status, assigned_user_id, specialist_type) VALUES ($1,'specialist_assignment',$2,$3,$4,'10000','approved_unpaid',$5,$6) RETURNING id`,
			pid, role, owner, title, assignee, stype).Scan(&id); err != nil {
			t.Fatalf("addendum %s: %v", title, err)
		}
		return id
	}

	// Pre-existing invited sub: the handler activates it in place.
	if _, err := pool.Exec(ctx, `INSERT INTO project_sub_professionals (project_id, sub_role, user_id, parent_role, assigned_by, status, rate, lead_pro_notes) VALUES ($1,'structural',$2,'arsitek',$3,'invited','10000','hJ pre')`, pid, structSpec, owner); err != nil {
		t.Fatalf("pre sub: %v", err)
	}
	addStruct := mkAddendum("hJ Struct Add", "structural", "arsitek", &structSpec)
	rec := hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"addendum","id":`+itoaTest(addStruct)+`}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("spec structural = %d %s", rec.Code, rec.Body.String())
	}
	var subStatus string
	var subUser, slot int64
	if err := pool.QueryRow(ctx, `SELECT status::text, user_id FROM project_sub_professionals WHERE project_id=$1 AND sub_role='structural'`, pid).Scan(&subStatus, &subUser); err != nil {
		t.Fatalf("sub: %v", err)
	}
	_ = pool.QueryRow(ctx, `SELECT structural_id FROM projects WHERE id=$1`, pid).Scan(&slot)
	if subStatus != "active" || subUser != structSpec || slot != structProf {
		t.Fatalf("structural post = %s %d slot %d want active/%d/%d", subStatus, subUser, slot, structSpec, structProf)
	}
	var nsubs int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_sub_professionals WHERE project_id=$1`, pid).Scan(&nsubs)
	if nsubs != 1 {
		t.Fatalf("subs = %d want 1 (update, not insert)", nsubs)
	}

	// Role-type fallback (no specialist_type) into the mep slot.
	addMep := mkAddendum("hJ Mep Add", "", "mep", &mepSpec)
	if _, err := pool.Exec(ctx, `UPDATE project_addendums SET specialist_type=NULL WHERE id=$1`, addMep); err != nil {
		t.Fatalf("null stype: %v", err)
	}
	rec = hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"addendum","id":`+itoaTest(addMep)+`}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("spec mep = %d %s", rec.Code, rec.Body.String())
	}
	var mepSlot int64
	var mepRole string
	_ = pool.QueryRow(ctx, `SELECT mep_id FROM projects WHERE id=$1`, pid).Scan(&mepSlot)
	_ = pool.QueryRow(ctx, `SELECT sub_role FROM project_sub_professionals WHERE project_id=$1 AND user_id=$2`, pid, mepSpec).Scan(&mepRole)
	if mepSlot != mepProf || mepRole != "mep" {
		t.Fatalf("mep post = slot %d role %q", mepSlot, mepRole)
	}

	// Interior slot via the same path.
	addInt := mkAddendum("hJ Int Add", "interior", "arsitek", &intSpec)
	rec = hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"addendum","id":`+itoaTest(addInt)+`}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("spec interior = %d %s", rec.Code, rec.Body.String())
	}
	var intSlot int64
	_ = pool.QueryRow(ctx, `SELECT selected_interior_id FROM projects WHERE id=$1`, pid).Scan(&intSlot)
	if intSlot != intProf {
		t.Fatalf("interior slot = %d want %d", intSlot, intProf)
	}

	// Specialist assignment with nobody attached: no sub row, still paid.
	addNone := mkAddendum("hJ None Add", "structural", "arsitek", nil)
	rec = hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"addendum","id":`+itoaTest(addNone)+`}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("spec none = %d %s", rec.Code, rec.Body.String())
	}
	var noneN int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM project_sub_professionals WHERE project_id=$1 AND user_id IS NULL`, pid).Scan(&noneN)
	var ast string
	_ = pool.QueryRow(ctx, `SELECT status::text FROM project_addendums WHERE id=$1`, addNone).Scan(&ast)
	if ast != "paid" {
		t.Fatalf("none addendum = %s", ast)
	}
}

func TestHJMarkPaidRecommended(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner, pid, ownerCaller := hJMarkPaidSetup(t, ctx, pool, "hJ MarkPaid Rec")
	structBidder := hJMkUser(t, ctx, pool, "mprecbid", "structural")
	defer func() {
		hJMarkPaidCleanup(ctx, pool, pid, owner)
		pool.Exec(ctx, `DELETE FROM structural_engineers WHERE user_id=$1`, structBidder)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, structBidder)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	}()
	var structProf int64
	if err := pool.QueryRow(ctx, `INSERT INTO structural_engineers (user_id, nama, verification_status) VALUES ($1,'hJ Rec Struct','verified') RETURNING id`, structBidder).Scan(&structProf); err != nil {
		t.Fatalf("struct profile: %v", err)
	}
	// Recommended bid with a previous-stack id and price-only fee.
	var bidID int64
	const bidLegacy = 777002
	if err := pool.QueryRow(ctx, `INSERT INTO bids (project_id, role, bidder_user_id, bidder_profile_id, structural_id, price, status, payment_status, legacy_id) VALUES ($1,'structural',$2,$3,$3,'75000','pending','unpaid',$4) RETURNING id`, pid, structBidder, structProf, bidLegacy).Scan(&bidID); err != nil {
		t.Fatalf("bid: %v", err)
	}
	var addID int64
	if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, type, role_type, user_id, title, amount, status, recommended_bid_id, recommended_bid_type) VALUES ($1,'extra_fee','arsitek',$2,'hJ Rec Add','20000','approved_unpaid',$3,'structural') RETURNING id`, pid, owner, bidLegacy).Scan(&addID); err != nil {
		t.Fatalf("addendum: %v", err)
	}

	rec := hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"addendum","id":`+itoaTest(addID)+`}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("recommended = %d %s", rec.Code, rec.Body.String())
	}
	var bpay string
	var slot int64
	_ = pool.QueryRow(ctx, `SELECT payment_status::text FROM bids WHERE id=$1`, bidID).Scan(&bpay)
	_ = pool.QueryRow(ctx, `SELECT structural_id FROM projects WHERE id=$1`, pid).Scan(&slot)
	if bpay != "paid" || slot != structProf {
		t.Fatalf("recommended post = bid %s slot %d", bpay, slot)
	}
	var feeTitle, feeAmt string
	var feeRef int64
	if err := pool.QueryRow(ctx, `SELECT title, amount::text, reference_id FROM project_budget_transactions WHERE project_id=$1 AND transaction_type='payment' AND title LIKE '%via specialist addendum%' ORDER BY id DESC LIMIT 1`, pid).Scan(&feeTitle, &feeAmt, &feeRef); err != nil {
		t.Fatalf("fee ledger: %v", err)
	}
	if feeTitle != "Paid Structural Engineer Fee (via specialist addendum)" || feeAmt != "75000.00" || feeRef != bidLegacy {
		t.Fatalf("fee ledger = %q %q %d", feeTitle, feeAmt, feeRef)
	}
}

func TestHJValidateMarkPaidIDs(t *testing.T) {
	// String id arms through the handler: empty, overflowing, valid.
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()
	owner, pid, ownerCaller := hJMarkPaidSetup(t, ctx, pool, "hJ MarkPaid IDs")
	defer func() {
		hJMarkPaidCleanup(ctx, pool, pid, owner)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	}()

	rec := hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"termin","id":""}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("empty id = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "id", "The id field is required.")

	rec = hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"termin","id":"99999999999999999999999"}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("huge id = %d %s", rec.Code, rec.Body.String())
	}
	hJErr(t, rec, "id", "The id field must be an integer.")

	// A well-formed id for a missing row: the reference's 500 generic.
	rec = hJCall(MarkPaidHandler(pool), http.MethodPost, "/x", `{"type":"termin","id":"5"}`, ownerCaller, map[string]string{"project": itoaTest(pid)})
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("missing row = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Failed to process payment tracking." {
		t.Fatalf("missing row msg = %q", got)
	}

	// Non-string numerics ride the default arm: direct unit, no database.
	f := &errorBag{}
	payType, payID := validateMarkPaid(map[string]any{"type": "termin", "id": int64(7)}, f)
	if !f.empty() || payType != "termin" || payID != 7 {
		t.Fatalf("int64 id = %q %d %v", payType, payID, f.bag)
	}
}
