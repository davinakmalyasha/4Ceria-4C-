package httpapi

import (
	"context"
	"testing"
)

// Multi-field professional updates must keep every value on its own
// column. applyUpdates used to number placeholders BEFORE sorting the
// SET fragments, so `$2` travelled with value-of-a while still
// pointing at the pre-sort position — a silent cross-column write on
// every multi-field update (observed: numeric field read back "d").
// This pins the mapping with two and three fields at once.
func TestProfessionalMultiFieldMapping(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	uid := hCMkUser(t, ctx, pool, "promulti", "arsitek")
	defer hCCleanupProfessional(ctx, pool, uid)
	pid := hCSeedProfile(t, ctx, pool, "arsiteks", uid, "Multi Base")

	updates := map[string]string{
		"nama":      "Multi A",
		"deskripsi": "Multi D",
		"lokasi":    "Multi L",
	}
	if err := applyUpdates(ctx, pool, "arsiteks", pid, updates); err != nil {
		t.Fatalf("applyUpdates: %v", err)
	}

	var nama, deskripsi, lokasi string
	if err := pool.QueryRow(ctx, `SELECT nama, deskripsi, lokasi FROM arsiteks WHERE id = $1`, pid).Scan(&nama, &deskripsi, &lokasi); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if nama != "Multi A" || deskripsi != "Multi D" || lokasi != "Multi L" {
		t.Fatalf("columns crossed: nama=%q deskripsi=%q lokasi=%q", nama, deskripsi, lokasi)
	}

	// Empty map is a no-op, not an error.
	if err := applyUpdates(ctx, pool, "arsiteks", pid, map[string]string{}); err != nil {
		t.Fatalf("empty applyUpdates: %v", err)
	}
}
