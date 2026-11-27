package httpapi

// hJ professional coverage: the KYC text branch (company fields ride the
// same update as the role fields) and the kontraktor alias early-return.

import (
	"context"
	"net/http"
	"testing"
)

func TestHJProfessionalCompanyFields(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	arsi := hJMkUser(t, ctx, pool, "profcoar", "arsitek")
	defer func() {
		pool.Exec(ctx, `DELETE FROM arsiteks WHERE user_id=$1`, arsi)
		pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, arsi)
	}()
	if _, err := pool.Exec(ctx, `INSERT INTO arsiteks (user_id, nama, verification_status) VALUES ($1,'hJ Arsi','rejected')`, arsi); err != nil {
		t.Fatalf("profile: %v", err)
	}
	var aemail, auname string
	_ = pool.QueryRow(ctx, `SELECT email::text, username::text FROM users WHERE id=$1`, arsi).Scan(&aemail, &auname)
	arsiCaller := &roadmapCaller{id: arsi, role: "arsitek"}

	rec := hJCall(UpdateProfessionalHandler(pool), http.MethodPost, "/api/me/professional",
		`{"name":"hJ A","email":"`+aemail+`","username":"`+auname+`","company_name":"hJ Co","company_license":"LIC-101","identity_number":"ID-101"}`,
		arsiCaller, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prof company = %d %s", rec.Code, rec.Body.String())
	}
	// Post-state literals: KYC text lands on the profile row and the new
	// document flips verification back to pending.
	var company, license, identity, vstat string
	if err := pool.QueryRow(ctx, `SELECT company_name, company_license, identity_number, verification_status::text FROM arsiteks WHERE user_id=$1`, arsi).Scan(&company, &license, &identity, &vstat); err != nil {
		t.Fatalf("row: %v", err)
	}
	if company != "hJ Co" || license != "LIC-101" || identity != "ID-101" || vstat != "pending" {
		t.Fatalf("row = %q %q %q %q want hJ Co/LIC-101/ID-101/pending", company, license, identity, vstat)
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Professional profile updated successfully" {
		t.Fatalf("message = %q", got)
	}
}

func TestHJAliasEarlyReturn(t *testing.T) {
	// Both sides present: the target wins, the source never copies.
	fields := map[string]any{"lokasi": "hJ Src", "alamat": "hJ Keep"}
	alias(fields, "lokasi", "alamat")
	if fields["alamat"] != "hJ Keep" {
		t.Fatalf("alias overwrote = %v", fields["alamat"])
	}
	// Target absent: the source feeds the canonical key.
	only := map[string]any{"lokasi": "hJ Src"}
	alias(only, "lokasi", "alamat")
	if only["alamat"] != "hJ Src" {
		t.Fatalf("alias missed = %v", only)
	}
}
