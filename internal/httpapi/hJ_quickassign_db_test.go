package httpapi

// hJ quick-assign coverage: the loader-gate failure the shared suite
// leaves dark (a caller with no users row answers the fixed 500).

import (
	"net/http"
	"testing"
)

func TestHJQuickAssignViewerGate(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ghost := &roadmapCaller{id: 1010097, role: "arsitek"}

	rec := hJCall(FirmMembersQuickAssignHandler(pool), http.MethodPost, "/api/firm-members/quick-assign", `{}`, ghost, nil)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("quick ghost = %d %s", rec.Code, rec.Body.String())
	}
	if got := hJDecode(t, rec)["message"].(string); got != "Server Error" {
		t.Fatalf("quick ghost message = %q", got)
	}
}
