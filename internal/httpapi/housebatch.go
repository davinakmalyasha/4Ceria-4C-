package httpapi

import (
	"context"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
	"github.com/jackc/pgx/v5/pgxpool"
)

// housePageBundle holds the per-row relations of a houses page in maps.
//
// The public list rendered every row with four round trips (pics, owner,
// rooms, room pics per room). Twelve rows paid ~40+ queries and held the
// pool under concurrency. The bundle loads each relation once with =ANY.
type housePageBundle struct {
	pics   map[int64][]any
	owners map[int64]*jsonwire.Object
	rooms  map[int64][]any
}

// buildHousePageBundle loads pics, owners (+phones) and rooms (+room pics)
// for one page. Guests skip the phones query entirely.
func buildHousePageBundle(ctx context.Context, pool *pgxpool.Pool, houseIDs, ownerIDs []int64, viewerID int64, viewerIsAdmin bool) (*housePageBundle, error) {
	bundle := &housePageBundle{
		pics:   map[int64][]any{},
		owners: map[int64]*jsonwire.Object{},
		rooms:  map[int64][]any{},
	}

	pics, err := housePicsBatch(ctx, pool, houseIDs)
	if err != nil {
		return nil, err
	}
	bundle.pics = pics

	owners, err := houseOwnersBatch(ctx, pool, ownerIDs, viewerID, viewerIsAdmin)
	if err != nil {
		return nil, err
	}
	bundle.owners = owners

	rooms, err := houseRoomsBatch(ctx, pool, houseIDs)
	if err != nil {
		return nil, err
	}
	bundle.rooms = rooms

	return bundle, nil
}

// housePicsBatch is the batch form of housePics: every picture row for the
// page in one query, grouped by house, ordered by id within each house.
func housePicsBatch(ctx context.Context, pool *pgxpool.Pool, houseIDs []int64) (map[int64][]any, error) {
	out := map[int64][]any{}
	if len(houseIDs) == 0 {
		return out, nil
	}
	for _, id := range houseIDs {
		out[id] = make([]any, 0)
	}
	rows, err := pool.Query(ctx, `
		SELECT id, file_name, dir, size, id_house, created_at, updated_at
		  FROM house_pic WHERE id_house = ANY($1) ORDER BY id_house, id
	`, houseIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, house int64
		var fileName, dir, size *string
		var createdAt, updatedAt *time.Time
		if err := rows.Scan(&id, &fileName, &dir, &size, &house, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item := jsonwire.NewObject()
		item.Set("id", id)
		item.Set("file_name", nullableString(fileName))
		item.Set("dir", nullableString(dir))
		item.Set("size", nullableString(size))
		item.Set("id_house", house)
		item.Set("created_at", apiTimestamp(createdAt))
		item.Set("updated_at", apiTimestamp(updatedAt))
		out[house] = append(out[house], item)
	}
	return out, rows.Err()
}

// houseOwnersBatch is the batch form of houseOwner: one user query plus one
// phones query for the whole page. The email/phone rules match the single
// path exactly: email only for the owner or an admin, phones only for a
// signed-in viewer, otherwise [].
func houseOwnersBatch(ctx context.Context, pool *pgxpool.Pool, ownerIDs []int64, viewerID int64, viewerIsAdmin bool) (map[int64]*jsonwire.Object, error) {
	out := map[int64]*jsonwire.Object{}
	if len(ownerIDs) == 0 {
		return out, nil
	}
	rows, err := pool.Query(ctx,
		`SELECT id, name, email, COALESCE(role_type::text, '') FROM users WHERE id = ANY($1)`, ownerIDs)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id int64
		var name, role string
		var email *string
		if err := rows.Scan(&id, &name, &email, &role); err != nil {
			rows.Close()
			return nil, err
		}
		owner := jsonwire.NewObject()
		owner.Set("id", id)
		owner.Set("name", name)
		if (viewerID != 0 && viewerID == id) || viewerIsAdmin {
			owner.Set("email", nullableString(email))
		} else {
			owner.Set("email", nil)
		}
		owner.Set("phones", make([]any, 0))
		owner.Set("role_type", role)
		out[id] = owner
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	if viewerID == 0 {
		return out, nil
	}
	phoneRows, err := pool.Query(ctx,
		`SELECT id_user, contact FROM phone_user WHERE id_user = ANY($1) ORDER BY id_user, id`, ownerIDs)
	if err != nil {
		return nil, err
	}
	defer phoneRows.Close()
	for phoneRows.Next() {
		var uid int64
		var contact *string
		if err := phoneRows.Scan(&uid, &contact); err != nil {
			return nil, err
		}
		owner := out[uid]
		if owner == nil {
			continue
		}
		list, _ := owner.Get("phones")
		existing, _ := list.([]any)
		owner.Set("phones", append(existing, nullableString(contact)))
	}
	return out, phoneRows.Err()
}

// houseRoomsBatch is the batch form of houseRooms + roomPics: one rooms
// query for the page plus one rooms_pic query for every room on the page.
func houseRoomsBatch(ctx context.Context, pool *pgxpool.Pool, houseIDs []int64) (map[int64][]any, error) {
	out := map[int64][]any{}
	if len(houseIDs) == 0 {
		return out, nil
	}
	for _, id := range houseIDs {
		out[id] = make([]any, 0)
	}
	rows, err := pool.Query(ctx, `
		SELECT id, id_house, name, type, width, length, "desc"
		  FROM rooms WHERE id_house = ANY($1) ORDER BY id_house, id
	`, houseIDs)
	if err != nil {
		return nil, err
	}
	roomHouses := map[int64]int64{}
	roomIDs := make([]int64, 0, 32)
	roomObjs := map[int64]*jsonwire.Object{}
	for rows.Next() {
		var id, houseID int64
		var name, roomType, width, length, desc *string
		if err := rows.Scan(&id, &houseID, &name, &roomType, &width, &length, &desc); err != nil {
			rows.Close()
			return nil, err
		}
		room := jsonwire.NewObject()
		room.Set("id", id)
		room.Set("name", nullableString(name))
		room.Set("type", nullableString(roomType))
		room.Set("width", nullableString(width))
		room.Set("length", nullableString(length))
		room.Set("description", nullableString(desc))
		room.Set("pics", make([]any, 0))
		roomObjs[id] = room
		roomHouses[id] = houseID
		roomIDs = append(roomIDs, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	if len(roomIDs) > 0 {
		pics, err := pool.Query(ctx,
			`SELECT id, id_room, dir FROM rooms_pic WHERE id_room = ANY($1) ORDER BY id_room, id`, roomIDs)
		if err != nil {
			return nil, err
		}
		for pics.Next() {
			var id, roomID int64
			var dir *string
			if err := pics.Scan(&id, &roomID, &dir); err != nil {
				pics.Close()
				return nil, err
			}
			room := roomObjs[roomID]
			if room == nil {
				continue
			}
			item := jsonwire.NewObject()
			item.Set("id", id)
			item.Set("dir", nullableString(dir))
			list, _ := room.Get("pics")
			existing, _ := list.([]any)
			room.Set("pics", append(existing, item))
		}
		if err := pics.Err(); err != nil {
			pics.Close()
			return nil, err
		}
		pics.Close()
	}

	for roomID, houseID := range roomHouses {
		out[houseID] = append(out[houseID], roomObjs[roomID])
	}
	return out, nil
}

// houseResourceBundled assembles one HouseResource from the page bundle. It
// answers the same keys in the same order as houseResourceWithOwner; the
// single-row loaders stay for the show/store paths.
func houseResourceBundled(fields []string, values []any, viewerID int64, viewerIsAdmin bool, bundle *housePageBundle) (*jsonwire.Object, error) {
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	id, _ := byName["id"].(int64)
	ownerID, _ := byName["id_user"].(int64)

	row := jsonwire.NewObject()
	row.Set("id", id)
	setIfPresent(row, "name", byName["name"])
	setIfPresent(row, "price", decimalText(byName["price"]))
	setIfPresent(row, "description", byName["house_desc"])

	dimensions := jsonwire.NewObject()
	dimensions.Set("width", textOf(byName["width"]))
	dimensions.Set("length", textOf(byName["length"]))
	dimensions.Set("floors", intOf(byName["floors"]))
	row.Set("dimensions", dimensions)

	rooms := jsonwire.NewObject()
	rooms.Set("bedrooms", intOf(byName["br"]))
	rooms.Set("bathrooms", intOf(byName["ba"]))
	row.Set("rooms", rooms)

	address := jsonwire.NewObject()
	address.Set("street", textOf(byName["street_name"]))
	address.Set("kelurahan", textOf(byName["kelurahan"]))
	address.Set("kecamatan", textOf(byName["kecamatan"]))
	address.Set("city", textOf(byName["kab_kota"]))
	address.Set("province", textOf(byName["province"]))
	address.Set("postal_code", textOf(byName["postal_code"]))
	address.Set("coordinates", textOf(byName["coordinate"]))
	row.Set("address", address)

	row.Set("coordinate", textOf(byName["coordinate"]))
	row.Set("user_id", ownerID)
	row.Set("views", intOf(byName["views"]))
	row.Set("created_at", apiTime(byName["created_at"]))
	row.Set("updated_at", apiTime(byName["updated_at"]))

	if pics, ok := bundle.pics[id]; ok {
		row.Set("housePic", pics)
	} else {
		row.Set("housePic", make([]any, 0))
	}
	if owner, ok := bundle.owners[ownerID]; ok && owner != nil {
		row.Set("owner", owner)
	}
	if roomList, ok := bundle.rooms[id]; ok {
		row.Set("roomList", roomList)
	} else {
		row.Set("roomList", make([]any, 0))
	}

	return row, nil
}
