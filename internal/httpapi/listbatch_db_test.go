package httpapi

import (
	"context"
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
)

// TestListBundleMatchesPerRow renders the same projects through the
// per-row path and the batched list path and requires byte-identical JSON.
// Any divergence is a parity break, not an optimization.
func TestListBundleMatchesPerRow(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	var ids []int64
	rows, err := pool.Query(ctx, `SELECT id FROM projects ORDER BY id LIMIT 12`)
	if err != nil {
		t.Skip("no database")
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(ids) == 0 {
		t.Skip("no projects seeded")
	}

	// Viewer fixtures: anonymous, an owner, a professional, an admin.
	var ownerID int64
	if err := pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, ids[0]).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	var proID string
	var proUser int64
	_ = pool.QueryRow(ctx, `SELECT 'arsitek', user_id FROM arsiteks ORDER BY id LIMIT 1`).Scan(&proID, &proUser)
	var adminID int64
	adminOK := pool.QueryRow(ctx, `SELECT id FROM users WHERE email = 'admin@4c.id'`).Scan(&adminID) == nil

	type viewerCase struct {
		name   string
		caller *roadmapCaller
		feed   bool
	}
	cases := []viewerCase{
		{name: "anon", caller: nil},
		{name: "owner", caller: &roadmapCaller{id: ownerID}},
	}
	if proUser != 0 {
		cases = append(cases, viewerCase{name: "pro", caller: &roadmapCaller{id: proUser}})
	}
	if adminOK {
		cases = append(cases,
			viewerCase{name: "admin", caller: &roadmapCaller{id: adminID}},
			viewerCase{name: "admin-feed", caller: &roadmapCaller{id: adminID}, feed: true},
		)
	}

	for _, tc := range cases {
		var caller Caller
		if tc.caller != nil {
			caller = tc.caller
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			t.Fatalf("%s: loadViewer: %v", tc.name, err)
		}
		spec := listLoad(viewer.role, hasBidProfile(viewer))
		if tc.feed {
			spec = feedLoad(viewer, true)
		}

		// Inputs identical to the list path: explicit columns, table order.
		lrows, err := pool.Query(ctx, `SELECT `+projectListColumnsNoPrefix()+` FROM projects p WHERE p.id = ANY($1) ORDER BY p.id`, ids)
		if err != nil {
			t.Fatal(err)
		}
		fields := fieldNames(lrows)
		type rawProject struct {
			fields []string
			values []any
			id     int64
		}
		var projects []rawProject
		ownerIDs := map[int64]bool{}
		var pids []int64
		var ownerIDList []int64
		for lrows.Next() {
			values, err := scanRow(lrows, len(fields))
			if err != nil {
				lrows.Close()
				t.Fatal(err)
			}
			pid := projectInt(values, fields, "id")
			projects = append(projects, rawProject{fields: fields, values: values, id: pid})
			pids = append(pids, pid)
			if oid := projectInt(values, fields, "user_id"); oid != 0 && !ownerIDs[oid] {
				ownerIDs[oid] = true
				ownerIDList = append(ownerIDList, oid)
			}
		}
		lrows.Close()
		if err := lrows.Err(); err != nil {
			t.Fatal(err)
		}

		histories, err := clientHistories(ctx, pool, ownerIDs)
		if err != nil {
			t.Fatal(err)
		}

		bundle := buildListBundle(ctx, pool, pids, ownerIDList, viewer, spec)
		if bundle == nil {
			t.Fatalf("%s: bundle build failed on seeded data", tc.name)
		}

		for _, p := range projects {
			single, err := projectResource(ctx, pool, p.fields, p.values, viewer, spec, histories, nil)
			if err != nil {
				t.Fatalf("%s project %d single: %v", tc.name, p.id, err)
			}
			batched, err := projectResource(ctx, pool, p.fields, p.values, viewer, spec, histories, bundle)
			if err != nil {
				t.Fatalf("%s project %d batched: %v", tc.name, p.id, err)
			}
			sb, err := jsonphp.Marshal(single)
			if err != nil {
				t.Fatal(err)
			}
			bb, err := jsonphp.Marshal(batched)
			if err != nil {
				t.Fatal(err)
			}
			if string(sb) != string(bb) {
				t.Fatalf("%s project %d: batched output differs\nsingle:  %s\nbatched: %s", tc.name, p.id, sb, bb)
			}
		}
	}
}

// projectListColumnsNoPrefix strips the `p.` qualifiers the list query uses.
// TestBatchHelpersAgainstSingleRow paths exercises the batch builders
// against their per-row twins on live rows (the seed ships no negotiation
// logs or active subs, so this test inserts ephemeral ones and removes
// them afterwards).
func TestBatchHelpersAgainstSingleRow(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	var regArsitek int64
	if err := pool.QueryRow(ctx, `SELECT id FROM ledger_reference_types WHERE type_key = 'bid.arsitek'`).Scan(&regArsitek); err != nil {
		t.Skip("no registry")
	}
	var ownerID int64
	if err := pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = 14976`).Scan(&ownerID); err != nil {
		t.Skip("no seeded project")
	}

	// Ephemeral negotiation logs on a real bid (legacy ids name the
	// thread: use the row exactly as the list path loads it).
	allBids, err := bidRows(ctx, pool, 14976, "arsitek", nil)
	if err != nil || len(allBids) == 0 {
		t.Skip("no arsitek bid to attach logs to")
	}
	bid := allBids[0]
	refID := bidRefID(bid)
	if _, err := pool.Exec(ctx, `INSERT INTO bid_negotiation_logs (bid_type_id, bid_id, user_id, round_number, snapshot, note) VALUES ($1, $2, $3, 1, '{}', 'BATCHTEST-1'), ($1, $2, $3, 2, '{}', 'BATCHTEST-2')`, regArsitek, refID, ownerID); err != nil {
		t.Fatalf("seed logs: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM bid_negotiation_logs WHERE note LIKE 'BATCHTEST-%'`)
	// Ephemeral active sub-professional for the owner on 14976.
	if _, err := pool.Exec(ctx, `INSERT INTO project_sub_professionals (project_id, user_id, parent_role, sub_role, assigned_by, status) VALUES (14976, $1, 'arsitek', 'drafter', $1, 'active')`, ownerID); err != nil {
		t.Fatalf("seed sub: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM project_sub_professionals WHERE project_id = 14976 AND sub_role = 'drafter'`)

	bySpelling := map[string]int64{"bid.arsitek": regArsitek}
	single := bidNegotiationLogs(ctx, pool, "arsitek", bid, bySpelling)
	batch, err := bidNegotiationLogsBatch(ctx, pool, []int64{14976}, "arsitek", regArsitek)
	if err != nil {
		t.Fatal(err)
	}
	got := batch[negLogKey{projectID: 14976, role: "arsitek", refID: bidRefID(bid)}]
	sb, _ := jsonphp.Marshal(single)
	bb, _ := jsonphp.Marshal(got)
	if string(sb) != string(bb) {
		t.Fatalf("neg logs differ\nsingle:  %s\nbatched: %s", sb, bb)
	}

	// Sub-professionals: single vs batch for the owner viewer.
	singleSubs, err := projectSubProfessionals(ctx, pool, 14976, &projectViewer{id: ownerID}, true)
	if err != nil {
		t.Fatal(err)
	}
	users, err := subProsUsersBatch(ctx, pool, []int64{ownerID})
	if err != nil {
		t.Fatal(err)
	}
	phones, err := phonesBatch(ctx, pool, []int64{ownerID})
	if err != nil {
		t.Fatal(err)
	}
	batchedSubs, err := projectSubProfessionalsBatch(ctx, pool, []int64{14976}, ownerID, users, phones)
	if err != nil {
		t.Fatal(err)
	}
	ssb, _ := jsonphp.Marshal(singleSubs)
	bsb, _ := jsonphp.Marshal(batchedSubs[14976])
	if string(ssb) != string(bsb) {
		t.Fatalf("subs differ\nsingle:  %s\nbatched: %s", ssb, bsb)
	}

	// Owner block: single vs maps.
	singleOwner, err := projectOwnerBlock(ctx, pool, ownerID, true, true)
	if err != nil {
		t.Fatal(err)
	}
	names, found, err := ownersBatch(ctx, pool, []int64{ownerID})
	if err != nil {
		t.Fatal(err)
	}
	contacts, _, err := ownerPhonesBatch(ctx, pool, []int64{ownerID})
	if err != nil {
		t.Fatal(err)
	}
	bundle := &listBundle{ownerNames: names, ownerFound: found, ownerPhones: contacts}
	batchedOwner := projectOwnerBlockFromMaps(ownerID, true, true, bundle)
	sob, _ := jsonphp.Marshal(singleOwner)
	bob, _ := jsonphp.Marshal(batchedOwner)
	if string(sob) != string(bob) {
		t.Fatalf("owner differs\nsingle:  %s\nbatched: %s", sob, bob)
	}
}

func projectListColumnsNoPrefix() string {
	out := ""
	for i, col := range splitComma(projectListColumns) {
		if i > 0 {
			out += ","
		}
		out += col
	}
	return out
}

func splitComma(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			parts = append(parts, trimPrefixP(s[start:i]))
			start = i + 1
		}
	}
	return append(parts, trimPrefixP(s[start:]))
}

func trimPrefixP(col string) string {
	if len(col) > 2 && col[0] == 'p' && col[1] == '.' {
		return col[2:]
	}
	return col
}
