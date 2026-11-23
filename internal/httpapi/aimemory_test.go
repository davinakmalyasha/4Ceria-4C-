package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/ai"
)

func TestAIMemoryHandlerRoundTrip(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	// Use the last seeded account: the ai package's DB tests use the first
	// one, and `go test ./...` runs packages in parallel against the same DB.
	var userID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id DESC LIMIT 1`).Scan(&userID); err != nil {
		t.Skip("no seeded users")
	}
	cleanup := func() {
		pool.Exec(ctx, `DELETE FROM ai_memories WHERE user_id = $1`, userID)
		pool.Exec(ctx, `DELETE FROM ai_memory_settings WHERE user_id = $1`, userID)
	}
	cleanup()
	t.Cleanup(cleanup)

	id, err := ai.Remember(ctx, pool, userID, "Prefers a three-bedroom house in Bandung.")
	if err != nil {
		t.Fatalf("remember: %v", err)
	}
	caller := roadmapCaller{id: userID, role: "user"}

	get := httptest.NewRequest(http.MethodGet, "/api/ai/memory", nil)
	get = get.WithContext(withCaller(get.Context(), caller))
	getRec := httptest.NewRecorder()
	AIMemoryHandler(pool)(getRec, get)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET = %d, %s", getRec.Code, getRec.Body.String())
	}
	var list struct {
		Enabled bool `json:"enabled"`
		Count   int  `json:"count"`
		Data    []struct {
			ID      int64  `json:"id"`
			Content string `json:"content"`
		} `json:"data"`
	}
	if err := json.Unmarshal(getRec.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode GET: %v", err)
	}
	if !list.Enabled || list.Count != 1 || len(list.Data) != 1 {
		t.Fatalf("unexpected GET body: %+v", list)
	}
	if !strings.Contains(list.Data[0].Content, "Bandung") {
		t.Errorf("content = %q", list.Data[0].Content)
	}

	put := httptest.NewRequest(http.MethodPut, "/api/ai/memory", strings.NewReader(`{"enabled":false}`))
	put = put.WithContext(withCaller(put.Context(), caller))
	putRec := httptest.NewRecorder()
	AIMemoryHandler(pool)(putRec, put)
	if putRec.Code != http.StatusOK || !strings.Contains(putRec.Body.String(), `"enabled":false`) {
		t.Fatalf("PUT = %d, %s", putRec.Code, putRec.Body.String())
	}
	if enabled, _ := ai.MemoryEnabled(ctx, pool, userID); enabled {
		t.Fatal("memory stayed enabled")
	}

	delOne := httptest.NewRequest(http.MethodDelete, "/api/ai/memory/"+strconv.FormatInt(id, 10), nil)
	delOne.SetPathValue("memory", strconv.FormatInt(id, 10))
	delOne = delOne.WithContext(withCaller(delOne.Context(), caller))
	delRec := httptest.NewRecorder()
	AIMemoryItemHandler(pool)(delRec, delOne)
	if delRec.Code != http.StatusNoContent {
		t.Fatalf("DELETE one = %d, %s", delRec.Code, delRec.Body.String())
	}

	// Deleting the same row again is a scoped 404, not a 500.
	delAgain := httptest.NewRequest(http.MethodDelete, "/api/ai/memory/"+strconv.FormatInt(id, 10), nil)
	delAgain.SetPathValue("memory", strconv.FormatInt(id, 10))
	delAgain = delAgain.WithContext(withCaller(delAgain.Context(), caller))
	delAgainRec := httptest.NewRecorder()
	AIMemoryItemHandler(pool)(delAgainRec, delAgain)
	if delAgainRec.Code != http.StatusNotFound {
		t.Fatalf("DELETE again = %d, want 404", delAgainRec.Code)
	}

	clear := httptest.NewRequest(http.MethodDelete, "/api/ai/memory", nil)
	clear = clear.WithContext(withCaller(clear.Context(), caller))
	clearRec := httptest.NewRecorder()
	AIMemoryHandler(pool)(clearRec, clear)
	if clearRec.Code != http.StatusNoContent {
		t.Fatalf("DELETE all = %d, %s", clearRec.Code, clearRec.Body.String())
	}
}
