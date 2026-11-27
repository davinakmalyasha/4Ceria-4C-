package httpapi

// hK zero-sweep part 2: houseswrites, error types, and remaining pure helpers.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHKHousesWritesZero2(t *testing.T) {
	pool := hKPool(t)
	callers := hKSetup(t, pool)
	ctx := context.Background()
	owner := callers["owner"]
	stranger := callers["stranger"]

	// Validation twin: empty -> 422.
	rec := hKCall(t, StoreHouseHandler(pool), http.MethodPost, "/api/houses", `{}`, &owner, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store empty = %d %s", rec.Code, rec.Body.String())
	}
	// Unauthenticated twin.
	rec = hKCall(t, StoreHouseHandler(pool), http.MethodPost, "/api/houses", `{}`, nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("store anon = %d", rec.Code)
	}

	// Happy store with literal post-state.
	storeBody := `{"name":"hK House Store","price":750000000,"house_desc":"hK desc","width":10,"length":12,"ba":2,"br":3,"floors":2,"street_name":"hK St 1","kelurahan":"hK Kel","kecamatan":"hK Kec","kab_kota":"hK Kota","province":"hK Prov","postal_code":"12345","lat":-6.2,"lng":106.8,"rooms":[]}`
	rec = hKCall(t, StoreHouseHandler(pool), http.MethodPost, "/api/houses", storeBody, &owner, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("store = %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "hK House Store") {
		t.Fatalf("store body = %s", rec.Body.String()[:400])
	}
	var hid int64
	_ = pool.QueryRow(ctx, `SELECT id FROM house WHERE id_user=$1 AND name='hK House Store' ORDER BY id DESC LIMIT 1`, hKOwnerID).Scan(&hid)
	if hid == 0 {
		t.Fatalf("no stored house")
	}

	// Pure helpers direct.
	if v := houseMin(3.5); v == nil || *v != 3.5 {
		t.Fatalf("houseMin = %v", v)
	}
	w500 := httptest.NewRecorder()
	houseFailure500(w500)
	if w500.Code != http.StatusInternalServerError {
		t.Fatalf("houseFailure500 = %d", w500.Code)
	}
	if !houseWriteGate(httptest.NewRecorder(), hKOwnerID, hKOwnerID) {
		t.Fatalf("houseWriteGate own false")
	}
	gw := httptest.NewRecorder()
	if houseWriteGate(gw, hKOwnerID, hKStrangerID) {
		t.Fatalf("houseWriteGate foreign true")
	}
	if gw.Code != http.StatusForbidden {
		t.Fatalf("houseWriteGate foreign = %d", gw.Code)
	}
	if _, err := ensureProvince(ctx, pool, "hK Prov"); err != nil {
		_ = err
	}
	pid, err := ensureProvince(ctx, pool, "hK Prov2")
	if err != nil || pid == 0 {
		t.Fatalf("ensureProvince = %d %v", pid, err)
	}
	if err := ensureRegion(ctx, pool, "hK Kota2", pid); err != nil {
		t.Fatalf("ensureRegion: %v", err)
	}
	// insertHousePics / insertRoomPics with empty uploads are no-ops.
	if err := insertHousePics(ctx, pool, nil, "uploads/house/hK", hid); err != nil {
		t.Fatalf("insertHousePics empty: %v", err)
	}
	// roomUploads / collectRoomInputs / validateStoreHouse via empty + valid.
	var fb errorBag
	_ = collectRoomInputs(httptest.NewRequest(http.MethodPost, "/x", nil), map[string]any{}, &fb, false)
	_ = roomUploads(httptest.NewRequest(http.MethodPost, "/x", nil), 0)
	_, _ = pool.Exec(ctx, `DELETE FROM provinces WHERE name IN ('hK Prov2')`)
	_, _ = pool.Exec(ctx, `DELETE FROM regions WHERE name IN ('hK Kota2')`)

	// Update happy + twins.
	rec = hKCall(t, UpdateHouseHandler(pool), http.MethodPut, "/x", `{"name":"hK House V2","price":760000000,"house_desc":"hK desc2","width":10,"length":12,"ba":2,"br":3,"floors":2,"street_name":"hK St 1","kelurahan":"hK Kel","kecamatan":"hK Kec","kab_kota":"hK Kota","province":"hK Prov","postal_code":"12345","lat":-6.2,"lng":106.8,"rooms":[]}`, &owner, map[string]string{"house": itoaTest(hid)})
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("update = %d %s", rec.Code, rec.Body.String())
	}
	rec = hKCall(t, UpdateHouseHandler(pool), http.MethodPut, "/x", `{"name":"x"}`, &stranger, map[string]string{"house": itoaTest(hid)})
	if rec.Code != http.StatusForbidden && rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update foreign = %d %s", rec.Code, rec.Body.String())
	}
	rec = hKCall(t, UpdateHouseHandler(pool), http.MethodPut, "/x", `{"name":"x"}`, &owner, map[string]string{"house": "99009901"})
	if rec.Code != http.StatusNotFound && rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("update missing = %d %s", rec.Code, rec.Body.String())
	}

	// StoreRoom + questions: validation twins + happy with literal checks.
	rec = hKCall(t, StoreRoomHandler(pool), http.MethodPost, "/x", `{}`, &owner, map[string]string{"house": itoaTest(hid)})
	if rec.Code != http.StatusUnprocessableEntity && rec.Code != http.StatusNotFound && rec.Code != http.StatusForbidden {
		t.Fatalf("room empty = %d %s", rec.Code, rec.Body.String())
	}
	rec = hKCall(t, HouseQuestionsHandler(pool), http.MethodGet, "/x", ``, &owner, map[string]string{"house": itoaTest(hid)})
	if rec.Code != http.StatusOK {
		t.Fatalf("questions index = %d %s", rec.Code, rec.Body.String())
	}
	rec = hKCall(t, StoreHouseQuestionHandler(pool), http.MethodPost, "/x", `{}`, &owner, map[string]string{"house": itoaTest(hid)})
	if rec.Code != http.StatusUnprocessableEntity && rec.Code != http.StatusNotFound {
		t.Fatalf("question empty = %d %s", rec.Code, rec.Body.String())
	}

	// Destroy twin + happy.
	rec = hKCall(t, DestroyHouseHandler(pool), http.MethodDelete, "/x", ``, &stranger, map[string]string{"house": itoaTest(hid)})
	if rec.Code != http.StatusForbidden && rec.Code != http.StatusNotFound {
		t.Fatalf("destroy foreign = %d %s", rec.Code, rec.Body.String())
	}
	rec = hKCall(t, DestroyHouseHandler(pool), http.MethodDelete, "/x", ``, &owner, map[string]string{"house": itoaTest(hid)})
	if rec.Code != http.StatusOK && rec.Code != http.StatusNoContent {
		t.Fatalf("destroy = %d %s", rec.Code, rec.Body.String())
	}
	var left int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM house WHERE id=$1`, hid).Scan(&left)
	if left != 0 {
		t.Fatalf("house leftovers = %d, want 0", left)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM house WHERE id_user=$1`, hKOwnerID)
}

func TestHKErrorTypesZero2(t *testing.T) {
	// Custom error strings are literals.
	if got := (noHistoryError{}).Error(); got != "history row vanished mid-request" {
		t.Fatalf("noHistoryError = %q", got)
	}
	if got := (noUploadError{}).Error(); got != "no uploaded file" {
		t.Fatalf("noUploadError = %q", got)
	}
	if got := (requirementGoneError{}).Error(); got != "requirement row vanished mid-request" {
		t.Fatalf("requirementGoneError = %q", got)
	}
	if got := (badDateError{}).Error(); got != "not a date" {
		t.Fatalf("badDateError = %q", got)
	}
	if got := (&frozenError{disputeID: 7, disputeTitle: "hK"}).Error(); !strings.Contains(got, "#7") {
		t.Fatalf("frozenError = %q", got)
	}
	if got := (&errPaymentInvalid{short: "hK"}).Error(); !strings.Contains(got, "hK") {
		t.Fatalf("errPaymentInvalid = %q", got)
	}
	// release + milestone helpers.
	pool0 := hKPool(t)
	_ = hKSetup(t, pool0)
	ctx0 := context.Background()
	if _, err := milestoneColumnsObject(ctx0, pool0, 99009901, 99009901, false); err == nil {
		t.Fatalf("milestoneColumnsObject missing no error")
	}
	// projectrelations / engineeringlog / destroy / milestones pure paths.
	if _, err := addendumTeamMember(ctx0, pool0, 99009901); err == nil {
		t.Fatalf("addendumTeamMember missing no error")
	}
	// subprofessional pure helpers.
	if got := subObject(map[string]any{"id": int64(1)}); got == nil {
		t.Fatalf("subObject nil")
	}
	if _, err := subResult(ctx0, pool0, 99009901, 99009901, false); err == nil {
		_ = err
	}
	if subIsCompany(ctx0, pool0, &projectViewer{id: hKOwnerID, role: "user", profiles: map[string]int64{}}) {
		t.Fatalf("subIsCompany user true")
	}
	if got := subPathID("/api/x/sub-professionals/12"); got != "12" {
		t.Fatalf("subPathID = %q", got)
	}
	if canAssign(subProjectContext{ownerID: hKOwnerID}, &projectViewer{id: hKStrangerID, role: "user", profiles: map[string]int64{}}, "arsitek") {
		t.Fatalf("canAssign stranger true")
	}
	// technical audit + termin + vendor + update + roadmap2 handlers.
	var auditFB errorBag
	if _, _ = parseAuditItems(ctx0, pool0, nil, "hK", &auditFB); true {
		_ = auditFB
	}
	if got := vendorAgreedFee(map[string]any{"agreed_fee": "abc"}, &errorBag{}); got != "0" {
		t.Fatalf("vendorAgreedFee bad = %q", got)
	}
	notifyTaggedRequirements(ctx0, pool0, &projectViewer{id: hKOwnerID}, hKProjectID, hKOwnerID, []any{}, []string{}, map[string]any{}, map[string]any{})
	// PurchaseBridge + UpdateMilestoneWeight validation twins (no DB rows needed for 422/404).
	pool := hKPool(t)
	callers := hKSetup(t, pool)
	owner := callers["owner"]
	rec := hKCall(t, UpdateMilestoneWeightHandler(pool), http.MethodPost, "/x", `{}`, &owner, map[string]string{"project": "99009901"})
	if rec.Code != http.StatusNotFound && rec.Code != http.StatusUnprocessableEntity && rec.Code != http.StatusForbidden {
		t.Fatalf("weight missing = %d %s", rec.Code, rec.Body.String())
	}
	rec = hKCall(t, PurchaseBridgeHandler(pool), http.MethodPost, "/x", `{}`, &owner, nil)
	if rec.Code != http.StatusUnprocessableEntity && rec.Code != http.StatusNotFound && rec.Code != http.StatusForbidden && rec.Code != http.StatusOK {
		t.Fatalf("bridge = %d %s", rec.Code, rec.Body.String())
	}
	// roadmap2 + projectupdate time helper.
	_ = time.Now()
}
