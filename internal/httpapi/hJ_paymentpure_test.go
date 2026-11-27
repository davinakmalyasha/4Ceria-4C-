package httpapi

// hJ payment pure units: path parsers, proof/verify validators, settled
// states, role maps and vault error propagation — no database required.

import (
	"os"
	"strings"
	"testing"
)

func TestHJPaymentPathUnits(t *testing.T) {
	if got := proofTypeFromPath("/api/projects/1/payments/termin/2/upload-proof"); got != "termin" {
		t.Fatalf("proofType = %q", got)
	}
	if got := proofTypeFromPath("/api/x/7"); got != "" {
		t.Fatalf("proofType bare = %q", got)
	}
	if got := proofIDFromPath("/api/projects/1/payments/termin/9/upload-proof"); got != "9" {
		t.Fatalf("proofID = %q", got)
	}
	if got := proofIDFromPath("/api/x/hJ-7"); got != "hJ-7" {
		t.Fatalf("proofID fallback = %q", got)
	}
	if got := verifyIDFromPath("/api/projects/1/payments/termin/9/verify-proof"); got != "9" {
		t.Fatalf("verifyID = %q", got)
	}
	if got := verifyIDFromPath("/api/x/hJ-8"); got != "hJ-8" {
		t.Fatalf("verifyID fallback = %q", got)
	}
}

func TestHJValidateVerifyProofUnits(t *testing.T) {
	run := func(fields map[string]any) (string, string, bool, *errorBag) {
		f := &errorBag{}
		action, notes, set := validateVerifyProof(fields, f)
		return action, notes, set, f
	}
	if _, _, _, f := run(map[string]any{}); f.bag["action"][0] != "The action field is required." {
		t.Fatalf("missing action = %v", f.bag)
	}
	if _, _, _, f := run(map[string]any{"action": ""}); f.bag["action"][0] != "The action field is required." {
		t.Fatalf("empty action = %v", f.bag)
	}
	if _, _, _, f := run(map[string]any{"action": 123}); len(f.bag["action"]) != 2 ||
		f.bag["action"][0] != "The action field must be a string." ||
		f.bag["action"][1] != "The action must be either accept or reject." {
		t.Fatalf("numeric action = %v", f.bag)
	}
	if _, _, _, f := run(map[string]any{"action": "hJ-bogus"}); f.bag["action"][0] != "The action must be either accept or reject." {
		t.Fatalf("bogus action = %v", f.bag)
	}
	if action, _, set, f := run(map[string]any{"action": "accept"}); !f.empty() || action != "accept" || set {
		t.Fatalf("accept = %q %v %v", action, set, f.bag)
	}
	if _, notes, set, f := run(map[string]any{"action": "reject", "notes": "hJ reason"}); !f.empty() || !set || notes != "hJ reason" {
		t.Fatalf("notes = %q %v", notes, set)
	}
	if _, _, set, f := run(map[string]any{"action": "reject", "notes": ""}); !f.empty() || set {
		t.Fatalf("empty notes set = %v", set)
	}
	if _, _, _, f := run(map[string]any{"action": "reject", "notes": 123}); f.bag["notes"][0] != "The notes field must be a string." {
		t.Fatalf("numeric notes = %v", f.bag)
	}
	if _, _, _, f := run(map[string]any{"action": "reject", "notes": strings.Repeat("n", 1001)}); f.bag["notes"][0] != "The notes field must not be greater than 1000 characters." {
		t.Fatalf("long notes = %v", f.bag)
	}
}

func TestHJVerifyRejectUnits(t *testing.T) {
	if got := verifyRejectData(11, "termin", 22, "hJ note", true); got != `{"notes": "hJ note", "payment_id": 22, "project_id": 11, "payment_type": "termin"}` {
		t.Fatalf("reject set = %q", got)
	}
	if got := verifyRejectData(11, "termin", 22, "", false); got != `{"notes": null, "payment_id": 22, "project_id": 11, "payment_type": "termin"}` {
		t.Fatalf("reject unset = %q", got)
	}
	if got := rejectReason("", false); got != "No specific reason provided." {
		t.Fatalf("reason default = %q", got)
	}
	if got := rejectReason("hJ why", true); got != "hJ why" {
		t.Fatalf("reason = %q", got)
	}
	lbl := "hJ Label"
	t1 := "hJ Title"
	tgt := &verifyTarget{verifyRow: verifyRow{label: &lbl, title: &t1}}
	if got := verifyLabel(tgt); got != "hJ Label" {
		t.Fatalf("label = %q", got)
	}
	tgt = &verifyTarget{verifyRow: verifyRow{title: &t1}}
	if got := verifyLabel(tgt); got != "hJ Title" {
		t.Fatalf("label title = %q", got)
	}
	tgt = &verifyTarget{}
	if got := verifyLabel(tgt); got != "a payment stage" {
		t.Fatalf("label fallback = %q", got)
	}
	if got := verifyNotifyLabel(tgt, "addendum"); got != "Addendum" {
		t.Fatalf("notify label = %q", got)
	}
	tgt = &verifyTarget{verifyRow: verifyRow{title: &t1}}
	if got := verifyNotifyLabel(tgt, "termin"); got != "hJ Title" {
		t.Fatalf("notify title = %q", got)
	}
	calc, price := "250000.00", "100000.00"
	if got := verifyBidAmount(&verifyTarget{calculated: &calc, price: &price}); got != 25000000 {
		t.Fatalf("bid amount = %d", got)
	}
	if got := verifyAmountMinor(&verifyTarget{verifyRow: verifyRow{table: "project_addendums"}, amount: &price}); got != 10000000 {
		t.Fatalf("addendum amount = %d", got)
	}
	if got := verifyAmountMinor(&verifyTarget{verifyRow: verifyRow{table: "material_orders"}}); got != 0 {
		t.Fatalf("material amount = %d", got)
	}
	amt := "75000.00"
	if got := verifyNotifyMinor(&verifyTarget{verifyRow: verifyRow{table: "project_addendums"}, amount: &amt}); got != 7500000 {
		t.Fatalf("notify minor = %d", got)
	}
	if got := verifyNotifyMinor(&verifyTarget{verifyRow: verifyRow{table: "material_orders"}}); got != 0 {
		t.Fatalf("notify material = %d", got)
	}
}

func TestHJProofSettledUnits(t *testing.T) {
	paid, refunded, voided, termd := "paid", "refunded", "void", "terminated"
	if err := proofSettled(&paid, &paid); err == nil || err.message != "This payment is already marked as paid and cannot be modified." {
		t.Fatalf("paid = %v", err)
	}
	if err := proofSettled(&refunded, &refunded); err == nil || err.message != "This payment was refunded through dispute arbitration and cannot be re-charged." {
		t.Fatalf("refunded = %v", err)
	}
	if err := proofSettled(&voided, &voided); err == nil || err.message != "This payment stage was voided (contract terminated or re-signed) and is no longer payable." {
		t.Fatalf("void = %v", err)
	}
	if err := proofSettled(nil, &termd); err == nil || err.message != "This payment is no longer payable — the related contract was terminated." {
		t.Fatalf("terminated = %v", err)
	}
	live, status := "verifying", "verifying"
	if err := proofSettled(&live, &status); err != nil {
		t.Fatalf("live = %v", err)
	}
	if err := proofSettled(nil, nil); err != nil {
		t.Fatalf("nil = %v", err)
	}
}

func TestHJProofBidRoleUnits(t *testing.T) {
	for role, table := range map[string]string{
		"arsitek_bid": "arsiteks", "kontraktor_bid": "kontraktors", "notaris_bid": "notaris_profiles",
		"interior_bid": "interior_profiles", "pm_bid": "project_managers", "structural_bid": "structural_engineers",
		"mep_bid": "mep_engineers",
	} {
		gotRole, gotTable, ok := proofBidRole(role)
		if !ok || gotTable != table {
			t.Fatalf("proofBidRole %s = %q %q %v", role, gotRole, gotTable, ok)
		}
	}
	if _, _, ok := proofBidRole("hJ-bogus"); ok {
		t.Fatalf("proofBidRole bogus ok")
	}
}

func TestHJValidateProofFileUnits(t *testing.T) {
	f := &errorBag{}
	if validateProofFile(map[string]any{}, map[string]*uploadedFile{}, f) != nil {
		t.Fatalf("missing ok")
	}
	hJErrBag(t, f, "proof", "The proof field is required.")

	f = &errorBag{}
	if validateProofFile(map[string]any{"proof": "hJ text"}, map[string]*uploadedFile{}, f) != nil {
		t.Fatalf("text ok")
	}
	if got := f.bag["proof"]; len(got) != 2 || got[0] != "The proof field must be a file." || got[1] != "The proof field must be a file of type: jpeg, png, jpg, pdf." {
		t.Fatalf("text errors = %q", got)
	}

	f = &errorBag{}
	bad := &uploadedFile{filename: "hJ.txt", ext: "txt", size: 10}
	if validateProofFile(map[string]any{}, map[string]*uploadedFile{"proof": bad}, f) != nil {
		t.Fatalf("mime ok")
	}
	hJErrBag(t, f, "proof", "The proof field must be a file of type: jpeg, png, jpg, pdf.")

	f = &errorBag{}
	huge := &uploadedFile{filename: "hJ.pdf", ext: "pdf", size: 5120*1024 + 1}
	if validateProofFile(map[string]any{}, map[string]*uploadedFile{"proof": huge}, f) != nil {
		t.Fatalf("size ok")
	}
	hJErrBag(t, f, "proof", "The proof field must not be greater than 5120 kilobytes.")

	f = &errorBag{}
	good := &uploadedFile{filename: "hJ.pdf", ext: "pdf", size: 100}
	if validateProofFile(map[string]any{}, map[string]*uploadedFile{"proof": good}, f) != good || !f.empty() {
		t.Fatalf("happy = %v", f.bag)
	}
}

func TestHJVaultErrorUnits(t *testing.T) {
	// An escaping relative path never touches the disk: the join fails.
	if err := removeVaultFile("../hJ-evil"); err == nil {
		t.Fatalf("evil removed")
	}
	// A vault base that is a file, not a directory: writes and removals
	// under it fail.
	f, err := os.CreateTemp("", "hJ-vault-*")
	if err != nil {
		t.Fatalf("temp: %v", err)
	}
	f.Close()
	defer os.Remove(f.Name())
	t.Setenv("EVIDENCE_DIR", f.Name())

	if _, err := storeProofFile("hJ.pdf", []byte("x"), nil); err == nil {
		t.Fatalf("filebase stored")
	}
	// A NUL byte in the name fails the removal before any disk touch.
	if err := removeVaultFile("receipts/hJ\x00.pdf"); err == nil {
		t.Fatalf("nul removed")
	}
	// Removing a missing vault file is a no-op (nil), never an error.
	t.Setenv("EVIDENCE_DIR", t.TempDir())
	if err := removeVaultFile("receipts/hJ-missing-1010099.pdf"); err != nil {
		t.Fatalf("missing remove = %v", err)
	}
}
