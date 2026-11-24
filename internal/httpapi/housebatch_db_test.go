package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

// TestHousesListQueryBudget pins the public list fan-out. The count+page
// batch is driver-level (untraced), the three relation batches are one query
// each for guests (no phones) and four for signed-in viewers.
func TestHousesListQueryBudget(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()

	request := httptest.NewRequest(http.MethodGet, "/api/houses?per_page=12", nil)
	recorder := httptest.NewRecorder()
	counter.Reset()
	HousesHandler(pool)(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := counter.Count(); got > 8 {
		t.Errorf("houses list used %d queries, budget 8", got)
	} else {
		t.Logf("houses list used %d queries", got)
	}
}

// TestHousesBatchMatchesSingle proves the bundled builders serialize exactly
// the same bytes as the per-row loaders they replaced.
func TestHousesBatchMatchesSingle(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	var houseID, ownerID int64
	if err := pool.QueryRow(ctx, `
		SELECT id, id_user FROM house WHERE id_user <> 0
		 ORDER BY created_at DESC, id ASC LIMIT 1
	`).Scan(&houseID, &ownerID); err != nil {
		t.Skip("no owned house")
	}

	fields, values, err := houseRow(ctx, pool, houseID)
	if err != nil {
		t.Fatalf("house row: %v", err)
	}
	single, err := houseResource(ctx, pool, fields, values, 0, false)
	if err != nil {
		t.Fatalf("single resource: %v", err)
	}

	pics, err := housePicsBatch(ctx, pool, []int64{houseID})
	if err != nil {
		t.Fatalf("pics batch: %v", err)
	}
	owners, err := houseOwnersBatch(ctx, pool, []int64{ownerID}, 0, false)
	if err != nil {
		t.Fatalf("owners batch: %v", err)
	}
	rooms, err := houseRoomsBatch(ctx, pool, []int64{houseID})
	if err != nil {
		t.Fatalf("rooms batch: %v", err)
	}
	bundled, err := houseResourceBundled(fields, values, 0, false, &housePageBundle{
		pics:   pics,
		owners: owners,
		rooms:  rooms,
	})
	if err != nil {
		t.Fatalf("bundled resource: %v", err)
	}

	if got, want := marshalText(t, bundled), marshalText(t, single); got != want {
		t.Errorf("bundled house differs\n got: %s\nwant: %s", got, want)
	}

	// The live list path must also carry the same first row.
	request := httptest.NewRequest(http.MethodGet, "/api/houses?per_page=12", nil)
	recorder := httptest.NewRecorder()
	HousesHandler(pool)(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("list status = %d", recorder.Code)
	}
	var body struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(body.Data) == 0 {
		t.Skip("empty houses page")
	}
	var want any
	if err := json.Unmarshal([]byte(marshalText(t, single)), &want); err != nil {
		t.Fatalf("decode single: %v", err)
	}
	for _, item := range body.Data {
		id, _ := item["id"].(float64)
		if int64(id) != houseID {
			continue
		}
		if !reflect.DeepEqual(item, want) {
			t.Errorf("list row %d differs from single\n got: %#v\nwant: %#v", houseID, item, want)
		}
		return
	}
	t.Logf("house %d not on first page, batch-vs-single check above still holds", houseID)
}
