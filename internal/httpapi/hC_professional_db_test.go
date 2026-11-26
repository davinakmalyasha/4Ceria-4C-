package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func hCCallProfessional(pool *pgxpool.Pool, caller *roadmapCaller, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/me/professional", strings.NewReader(body))
	if caller != nil {
		r = r.WithContext(withCaller(r.Context(), *caller))
	}
	rec := httptest.NewRecorder()
	UpdateProfessionalHandler(pool)(rec, r)
	return rec
}

func hCSeedProfile(t *testing.T, ctx context.Context, pool *pgxpool.Pool, table string, userID int64, name string) int64 {
	t.Helper()
	var id int64
	if err := pool.QueryRow(ctx, `INSERT INTO `+table+` (user_id, nama, verification_status) VALUES ($1,$2,'verified') RETURNING id`, userID, name).Scan(&id); err != nil {
		t.Fatalf("seed profile %s: %v", table, err)
	}
	return id
}

func hCCleanupProfessional(ctx context.Context, pool *pgxpool.Pool, userID int64) {
	pool.Exec(ctx, `DELETE FROM notaris_services WHERE notaris_id IN (SELECT id FROM notaris_profiles WHERE user_id=$1)`, userID)
	pool.Exec(ctx, `DELETE FROM arsiteks WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM kontraktors WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM interior_profiles WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM notaris_profiles WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM project_managers WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM structural_engineers WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM mep_engineers WHERE user_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM phone_user WHERE id_user=$1`, userID)
	pool.Exec(ctx, `DELETE FROM model_has_roles WHERE model_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM personal_access_tokens WHERE tokenable_id=$1`, userID)
	pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
}

func TestHCUpdateProfessionalRoles(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	// Unauth rejection twin
	if rec := hCCallProfessional(pool, nil, `{}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("prof unauth = %d %s", rec.Code, rec.Body.String())
	}

	// Malformed JSON rejection twin
	arsi := hCMkUser(t, ctx, pool, "profahrsi", "arsitek")
	defer hCCleanupProfessional(ctx, pool, arsi)
	hCSeedProfile(t, ctx, pool, "arsiteks", arsi, "hC Arsi")
	arsiCaller := &roadmapCaller{id: arsi, role: "arsitek"}
	recBad := httptest.NewRequest(http.MethodPost, "/api/me/professional", strings.NewReader(`{bad`))
	recBad = recBad.WithContext(withCaller(recBad.Context(), *arsiCaller))
	recBadRec := httptest.NewRecorder()
	UpdateProfessionalHandler(pool)(recBadRec, recBad)
	if recBadRec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof malformed = %d %s", recBadRec.Code, recBadRec.Body.String())
	}
	if got := hCDecode(t, recBadRec)["message"].(string); got != "The given data was invalid." {
		t.Fatalf("prof malformed msg = %q", got)
	}

	// Missing fields rejection twin (empty object) — exact required messages
	// name+email+username all missing: summarize adds "(and 2 more errors)" (literal)
	rec0 := hCCallProfessional(pool, arsiCaller, `{}`)
	if rec0.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof missing = %d %s", rec0.Code, rec0.Body.String())
	}
	hCErrors(t, rec0, "name", "The name field is required.")
	if got := hCDecode(t, rec0)["message"].(string); got != "The name field is required. (and 2 more errors)" {
		t.Fatalf("prof missing msg = %q", got)
	}
	// Rejection twin invariant: failed validation must not touch users row
	var nm0 string
	_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id=$1`, arsi).Scan(&nm0)
	if contains(nm0, "hC Arsi2") {
		t.Fatalf("prof missing mutated user")
	}

	// Role single-field happy paths — pin exact column values (literals)
	type roleCase struct {
		role    string
		table   string
		column  string
		payload string // single profile field JSON fragment
		want    string // literal expected column value
	}
	for _, tc := range []roleCase{
		{"arsitek", "arsiteks", "spesialisasi", `"spesialisasi":"hC Villa"`, "hC Villa"},
		{"kontraktor", "kontraktors", "nama_perusahaan", `"nama_perusahaan":"hC PT"`, "hC PT"},
		{"interior", "interior_profiles", "spesialisasi", `"spesialisasi":"hC Loft"`, "hC Loft"},
		{"notaris", "notaris_profiles", "wilayah_kerja", `"wilayah_kerja":"hC Jakarta"`, "hC Jakarta"},
		{"project_manager", "project_managers", "spesialisasi", `"spesialisasi":"hC PM"`, "hC PM"},
		{"structural", "structural_engineers", "spesialisasi", `"spesialisasi":"hC Struktur"`, "hC Struktur"},
		{"mep", "mep_engineers", "spesialisasi", `"spesialisasi":"hC MEP"`, "hC MEP"},
	} {
		uid := hCMkUser(t, ctx, pool, "prof"+tc.role, tc.role)
		// no profile row: ensureProfile must create it
		caller := &roadmapCaller{id: uid, role: tc.role}
		// fetch the generated email/username to echo back (required fields)
		var email, uname string
		_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, uid).Scan(&email, &uname)
		body := `{"name":"hC ` + tc.role + `","email":"` + email + `","username":"` + uname + `",` + tc.payload + `}`
		rec := hCCallProfessional(pool, caller, body)
		if rec.Code != http.StatusOK {
			t.Fatalf("prof %s = %d %s", tc.role, rec.Code, rec.Body.String())
		}
		if got := hCDecode(t, rec)["message"].(string); got != "Professional profile updated successfully" {
			t.Fatalf("prof %s msg = %q", tc.role, got)
		}
		var got string
		if err := pool.QueryRow(ctx, `SELECT `+tc.column+`::text FROM `+tc.table+` WHERE user_id=$1`, uid).Scan(&got); err != nil {
			t.Fatalf("prof %s row: %v", tc.role, err)
		}
		if got != tc.want {
			t.Fatalf("prof %s %s = %q want %q (placeholder-reorder class)", tc.role, tc.column, got, tc.want)
		}
		// users row pinned too
		var nm string
		_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id=$1`, uid).Scan(&nm)
		if nm != "hC "+tc.role {
			t.Fatalf("prof %s name = %q", tc.role, nm)
		}
		hCCleanupProfessional(ctx, pool, uid)
	}

	// Kontraktor alias: lokasi feeds alamat (canonical column)
	kid := hCMkUser(t, ctx, pool, "profkali", "kontraktor")
	defer hCCleanupProfessional(ctx, pool, kid)
	hCSeedProfile(t, ctx, pool, "kontraktors", kid, "hC Kont")
	var kemail, kuname string
	_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, kid).Scan(&kemail, &kuname)
	kCaller := &roadmapCaller{id: kid, role: "kontraktor"}
	recK := hCCallProfessional(pool, kCaller, `{"name":"hC Kont","email":"`+kemail+`","username":"`+kuname+`","lokasi":"hC Alias Addr"}`)
	if recK.Code != http.StatusOK {
		t.Fatalf("prof kontraktor alias = %d %s", recK.Code, recK.Body.String())
	}
	var addr *string
	_ = pool.QueryRow(ctx, `SELECT alamat FROM kontraktors WHERE user_id=$1`, kid).Scan(&addr)
	if addr == nil || *addr != "hC Alias Addr" {
		t.Fatalf("kontraktor alias alamat = %v", addr)
	}

	// Error twins on the arsitek user: invalid email, uppercase, taken, entity_type, bank
	var aemail, auname string
	_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, arsi).Scan(&aemail, &auname)
	other := hCMkUser(t, ctx, pool, "proftaken", "arsitek")
	defer hCCleanupProfessional(ctx, pool, other)
	var otherEmail string
	_ = pool.QueryRow(ctx, `SELECT email::text FROM users WHERE id=$1`, other).Scan(&otherEmail)

	recE := hCCallProfessional(pool, arsiCaller, `{"name":"X","email":"not-an-email","username":"`+auname+`"}`)
	if recE.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof bad email = %d", recE.Code)
	}
	hCErrors(t, recE, "email", "The email field must be a valid email address.")

	recU := hCCallProfessional(pool, arsiCaller, `{"name":"X","email":"UPPER@EXAMPLE.TEST","username":"`+auname+`"}`)
	if recU.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof upper email = %d", recU.Code)
	}
	hCErrors(t, recU, "email", "The email field must be lowercase.")

	recT := hCCallProfessional(pool, arsiCaller, `{"name":"X","email":"`+otherEmail+`","username":"`+auname+`"}`)
	if recT.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof taken = %d %s", recT.Code, recT.Body.String())
	}
	hCErrors(t, recT, "email", "The email has already been taken.")

	recET := hCCallProfessional(pool, arsiCaller, `{"name":"hC Arsi","email":"`+aemail+`","username":"`+auname+`","entity_type":"bogus"}`)
	if recET.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof entity = %d %s", recET.Code, recET.Body.String())
	}
	hCErrors(t, recET, "entity_type", "The selected entity_type is invalid.")

	// Bank too long rejection twin — exact message from handler
	longBank := strings.Repeat("b", 256)
	recB := hCCallProfessional(pool, arsiCaller, `{"name":"hC Arsi","email":"`+aemail+`","username":"`+auname+`","bank_name":"`+longBank+`"}`)
	if recB.Code != http.StatusUnprocessableEntity {
		t.Fatalf("prof bank = %d %s", recB.Code, recB.Body.String())
	}
	if got := hCDecode(t, recB)["message"].(string); got != "The payout details are too long." {
		t.Fatalf("prof bank msg = %q", got)
	}

	// Phone sync happy: JSON array string stored as contacts (literals)
	recP := hCCallProfessional(pool, arsiCaller, `{"name":"hC Arsi","email":"`+aemail+`","username":"`+auname+`","phone_numbers":["+62811"," +62822 "]}`)
	if recP.Code != http.StatusOK {
		t.Fatalf("prof phones = %d %s", recP.Code, recP.Body.String())
	}
	var phN int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM phone_user WHERE id_user=$1 AND contact IN ('+62811','+62822')`, arsi).Scan(&phN)
	if phN != 2 {
		t.Fatalf("phones = %d want 2", phN)
	}

	// KYC text triggers pending verification (literals) — needs a non-verified
	// profile: verified rows are sticky by design (WHERE <> 'verified')
	kycUID := hCMkUser(t, ctx, pool, "profkyc", "arsitek")
	defer hCCleanupProfessional(ctx, pool, kycUID)
	if _, err := pool.Exec(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hC Kyc','rejected')`, kycUID); err != nil {
		t.Fatalf("kyc profile: %v", err)
	}
	var yemail, yuname string
	_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, kycUID).Scan(&yemail, &yuname)
	kycCaller := &roadmapCaller{id: kycUID, role: "arsitek"}
	recV := hCCallProfessional(pool, kycCaller, `{"name":"hC Kyc","email":"`+yemail+`","username":"`+yuname+`","identity_number":"hC-ID-1"}`)
	if recV.Code != http.StatusOK {
		t.Fatalf("prof kyc = %d %s", recV.Code, recV.Body.String())
	}
	var idnum, vstat string
	_ = pool.QueryRow(ctx, `SELECT identity_number::text, verification_status::text FROM arsiteks WHERE user_id=$1`, kycUID).Scan(&idnum, &vstat)
	if idnum != "hC-ID-1" || vstat != "pending" {
		t.Fatalf("kyc = %q %q want hC-ID-1/pending", idnum, vstat)
	}

	// Notaris services wholesale replace + priceText coverage (literals)
	nid := hCMkUser(t, ctx, pool, "profnota", "notaris")
	defer hCCleanupProfessional(ctx, pool, nid)
	hCSeedProfile(t, ctx, pool, "notaris_profiles", nid, "hC Nota")
	var nprof int64
	_ = pool.QueryRow(ctx, `SELECT id FROM notaris_profiles WHERE user_id=$1`, nid).Scan(&nprof)
	var nemail, nuname string
	_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, nid).Scan(&nemail, &nuname)
	nCaller := &roadmapCaller{id: nid, role: "notaris"}
	recN := hCCallProfessional(pool, nCaller, `{"name":"hC Nota","email":"`+nemail+`","username":"`+nuname+`","services":[{"title":"hC Akta","price":250000}]}`)
	if recN.Code != http.StatusOK {
		t.Fatalf("prof notaris services = %d %s", recN.Code, recN.Body.String())
	}
	var svcTitle, svcPrice string
	if err := pool.QueryRow(ctx, `SELECT title::text, price::text FROM notaris_services WHERE notaris_id=$1`, nprof).Scan(&svcTitle, &svcPrice); err != nil {
		t.Fatalf("notaris services row: %v", err)
	}
	if svcTitle != "hC Akta" || svcPrice != "250000.00" {
		t.Fatalf("notaris services = %q %q want hC Akta/250000.00", svcTitle, svcPrice)
	}
	// priceText unit branches (pure, no DB): nil/blank/trim/float/int-default (literals)
	if got := priceText(nil); got != "0" {
		t.Fatalf("priceText nil = %q", got)
	}
	if got := priceText(""); got != "0" {
		t.Fatalf("priceText blank = %q", got)
	}
	if got := priceText("   "); got != "0" {
		t.Fatalf("priceText spaces = %q", got)
	}
	if got := priceText("  42 "); got != "42" {
		t.Fatalf("priceText trim = %q", got)
	}
	if got := priceText(float64(12.5)); got != "12.5" {
		t.Fatalf("priceText float = %q", got)
	}
	if got := priceText(7); got != "7" {
		t.Fatalf("priceText int = %q", got)
	}
	// syncPhoneNumbers branches: nil no-op, empty no-op, string JSON, string plain,
	// default type no-op (literals)
	if err := syncPhoneNumbers(context.Background(), pool, arsi, nil); err != nil {
		t.Fatalf("sync nil: %v", err)
	}
	if err := syncPhoneNumbers(context.Background(), pool, arsi, []any{}); err != nil {
		t.Fatalf("sync empty: %v", err)
	}
	if err := syncPhoneNumbers(context.Background(), pool, arsi, `["+62833"]`); err != nil {
		t.Fatalf("sync json: %v", err)
	}
	var n33 int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM phone_user WHERE id_user=$1 AND contact='+62833'`, arsi).Scan(&n33)
	if n33 != 1 {
		t.Fatalf("sync json row = %d want 1", n33)
	}
	if err := syncPhoneNumbers(context.Background(), pool, arsi, "+62844"); err != nil {
		t.Fatalf("sync plain: %v", err)
	}
	if err := syncPhoneNumbers(context.Background(), pool, arsi, 123); err != nil {
		t.Fatalf("sync default: %v", err)
	}
}
