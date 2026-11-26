package ai

// DB-backed closure for internal/ai: sessions/messages CRUD (store.go),
// memory CRUD and search edges (memory.go), the DB-backed tools
// (searchProfessionals, myProjects, filtered searchHouses/materials,
// project not-found/denied/with-rows paths), the remember tool with a real
// pool, and the MCP handler bodies.
//
// Every database test uses the established skip-gated pattern: when
// DATABASE_URL is absent or the seed is missing the test skips, so the
// pure-unit suite is unaffected. Tests only read seeded demo rows; every
// row they create (sessions, messages, memories, milestones, schedules)
// is deleted again, scoped to the calling test user. A handful of
// DB-free error-path tests (Chat/Stream runner init, 500-model) live here
// too because they close the same service.go gaps; they are not gated.

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/memory"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool/toolconfirmation"
)

// db2Clean wipes the AI rows a test user owns. Seeded demo rows in other
// tables are never touched.
func db2Clean(ctx context.Context, t *testing.T, pool *pgxpool.Pool, userID int64) {
	t.Helper()
	for _, q := range []string{
		`DELETE FROM ai_chat_sessions WHERE user_id = $1`,
		`DELETE FROM ai_memories WHERE user_id = $1`,
		`DELETE FROM ai_memory_settings WHERE user_id = $1`,
	} {
		if _, err := pool.Exec(ctx, q, userID); err != nil {
			t.Fatalf("cleanup: %v", err)
		}
	}
}

// db2ProjectlessUser returns a seeded user that owns no projects,
// skipping when the seed lacks one. Such a user may still be hired on a
// project through a professional profile (the hired branch of myProjects).
func db2ProjectlessUser(ctx context.Context, t *testing.T, pool *pgxpool.Pool) int64 {
	t.Helper()
	var id int64
	if err := pool.QueryRow(ctx, `
		SELECT u.id FROM users u
		 WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.user_id = u.id)
		 ORDER BY u.id LIMIT 1
	`).Scan(&id); err != nil {
		t.Skip("no project-less seeded user")
	}
	return id
}

// db2IsolatedUser returns a seeded user with no projects, no bids and no
// professional profile rows (for denied/empty-path tests), skipping when
// the seed lacks one. Seeded rows are only read, never changed.
func db2IsolatedUser(ctx context.Context, t *testing.T, pool *pgxpool.Pool) int64 {
	t.Helper()
	var id int64
	if err := pool.QueryRow(ctx, `
		SELECT u.id FROM users u
		 WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.user_id = u.id)
		   AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.bidder_user_id = u.id)
		   AND NOT EXISTS (SELECT 1 FROM arsiteks a WHERE a.user_id = u.id)
		   AND NOT EXISTS (SELECT 1 FROM kontraktors k WHERE k.user_id = u.id)
		   AND NOT EXISTS (SELECT 1 FROM notaris_profiles n WHERE n.user_id = u.id)
		   AND NOT EXISTS (SELECT 1 FROM interior_profiles i WHERE i.user_id = u.id)
		   AND NOT EXISTS (SELECT 1 FROM structural_engineers s WHERE s.user_id = u.id)
		   AND NOT EXISTS (SELECT 1 FROM mep_engineers m WHERE m.user_id = u.id)
		   AND NOT EXISTS (SELECT 1 FROM project_managers pm WHERE pm.user_id = u.id)
		 ORDER BY u.id LIMIT 1
	`).Scan(&id); err != nil {
		t.Skip("no isolated seeded user")
	}
	return id
}

func TestDB2SessionCRUD(t *testing.T) {
	pool, userID, otherID := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	db2Clean(ctx, t, pool, userID)
	t.Cleanup(func() { db2Clean(ctx, t, pool, userID) })

	// Empty title falls back; an over-long title is capped at 80 runes.
	s, err := CreateSession(ctx, pool, userID, "")
	if err != nil {
		t.Fatalf("create empty title: %v", err)
	}
	if s.Title != "New chat" {
		t.Fatalf("title = %q, want New chat", s.Title)
	}
	long := strings.Repeat("x", 200)
	sLong, err := CreateSession(ctx, pool, userID, long)
	if err != nil {
		t.Fatalf("create long title: %v", err)
	}
	if n := len([]rune(sLong.Title)); n != 80 {
		t.Fatalf("title runes = %d, want 80", n)
	}

	// Newest-first ordering: bumping the older session moves it to the top.
	first, err := CreateSession(ctx, pool, userID, "first chat")
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	second, err := CreateSession(ctx, pool, userID, "second chat")
	if err != nil {
		t.Fatalf("create second: %v", err)
	}
	if _, err := AppendMessage(ctx, pool, userID, first.ID, "user", "bump"); err != nil {
		t.Fatalf("bump: %v", err)
	}
	listed, err := ListSessions(ctx, pool, userID, 0) // clamp to default
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(listed) < 4 {
		t.Fatalf("sessions = %d, want >= 4", len(listed))
	}
	if listed[0].ID != first.ID {
		t.Fatalf("newest = %q, want bumped %q", listed[0].ID, first.ID)
	}
	capped, err := ListSessions(ctx, pool, userID, 5000)
	if err != nil || len(capped) != len(listed) {
		t.Fatalf("capped list = %d (%v), want %d", len(capped), err, len(listed))
	}
	one, err := ListSessions(ctx, pool, userID, 1)
	if err != nil || len(one) != 1 {
		t.Fatalf("limit 1 = %d (%v)", len(one), err)
	}

	// GetSession proves ownership.
	got, err := GetSession(ctx, pool, userID, second.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Title != "second chat" {
		t.Fatalf("title = %q", got.Title)
	}
	if _, err := GetSession(ctx, pool, otherID, second.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("cross-user get err = %v, want ErrNoRows", err)
	}
	if _, err := GetSession(ctx, pool, userID, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("missing get err = %v, want ErrNoRows", err)
	}

	// Rename, including the blank-title fallback and ownership checks.
	if err := RenameSession(ctx, pool, userID, second.ID, "renamed"); err != nil {
		t.Fatalf("rename: %v", err)
	}
	renamed, err := GetSession(ctx, pool, userID, second.ID)
	if err != nil || renamed.Title != "renamed" {
		t.Fatalf("renamed = %+v (%v)", renamed, err)
	}
	if err := RenameSession(ctx, pool, userID, second.ID, "   "); err != nil {
		t.Fatalf("blank rename: %v", err)
	}
	blank, err := GetSession(ctx, pool, userID, second.ID)
	if err != nil || blank.Title != "New chat" {
		t.Fatalf("blank renamed = %+v (%v)", blank, err)
	}
	if err := RenameSession(ctx, pool, otherID, second.ID, "hijack"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("cross-user rename err = %v, want ErrNoRows", err)
	}
	if err := RenameSession(ctx, pool, userID, "00000000-0000-0000-0000-000000000000", "x"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("missing rename err = %v, want ErrNoRows", err)
	}

	// Delete cascades to messages; a repeat or a stranger hits ErrNoRows.
	msgSession, err := CreateSession(ctx, pool, userID, "doomed")
	if err != nil {
		t.Fatalf("create doomed: %v", err)
	}
	if _, err := AppendMessage(ctx, pool, userID, msgSession.ID, "user", "bye"); err != nil {
		t.Fatalf("append doomed: %v", err)
	}
	if err := DeleteSession(ctx, pool, userID, msgSession.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if msgs, err := ListMessages(ctx, pool, userID, msgSession.ID, 10); err != nil || len(msgs) != 0 {
		t.Fatalf("cascade left %d messages (%v)", len(msgs), err)
	}
	if err := DeleteSession(ctx, pool, userID, msgSession.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("repeat delete err = %v, want ErrNoRows", err)
	}
	if err := DeleteSession(ctx, pool, otherID, second.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("cross-user delete err = %v, want ErrNoRows", err)
	}
}

func TestDB2MessageFlows(t *testing.T) {
	pool, userID, otherID := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	db2Clean(ctx, t, pool, userID)
	t.Cleanup(func() { db2Clean(ctx, t, pool, userID) })

	s, err := CreateSession(ctx, pool, userID, "messages")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	for _, text := range []string{"m1", "m2", "m3", "m4", "m5"} {
		if _, err := AppendMessage(ctx, pool, userID, s.ID, "user", text); err != nil {
			t.Fatalf("append %q: %v", text, err)
		}
	}
	// A stranger cannot append to the session.
	if _, err := AppendMessage(ctx, pool, otherID, s.ID, "user", "hijack"); err == nil {
		t.Fatal("cross-user append was accepted")
	}

	msgs, err := ListMessages(ctx, pool, userID, s.ID, 0) // clamp to default
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(msgs) != 5 || msgs[0].Content != "m1" || msgs[4].Content != "m5" {
		t.Fatalf("oldest-first broken: %+v", msgs)
	}
	two, err := ListMessages(ctx, pool, userID, s.ID, 2)
	if err != nil || len(two) != 2 || two[1].Content != "m2" {
		t.Fatalf("limit 2 = %+v (%v)", two, err)
	}
	huge, err := ListMessages(ctx, pool, userID, s.ID, 5000)
	if err != nil || len(huge) != 5 {
		t.Fatalf("clamped = %d (%v)", len(huge), err)
	}
	stranger, err := ListMessages(ctx, pool, otherID, s.ID, 10)
	if err != nil || len(stranger) != 0 {
		t.Fatalf("cross-user list = %d (%v)", len(stranger), err)
	}

	// RecentMessages returns the tail, oldest-first.
	tail, err := RecentMessages(ctx, pool, userID, s.ID, 2)
	if err != nil {
		t.Fatalf("recent: %v", err)
	}
	if len(tail) != 2 || tail[0].Content != "m4" || tail[1].Content != "m5" {
		t.Fatalf("tail = %+v", tail)
	}
	all, err := RecentMessages(ctx, pool, userID, s.ID, 0) // clamp to MaxHistoryMessages
	if err != nil || len(all) != 5 {
		t.Fatalf("recent default = %d (%v)", len(all), err)
	}
	capped, err := RecentMessages(ctx, pool, userID, s.ID, 5000)
	if err != nil || len(capped) != 5 {
		t.Fatalf("recent capped = %d (%v)", len(capped), err)
	}
	none, err := RecentMessages(ctx, pool, otherID, s.ID, 2)
	if err != nil || len(none) != 0 {
		t.Fatalf("cross-user recent = %d (%v)", len(none), err)
	}
}

func TestDB2QuotaCounts(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	db2Clean(ctx, t, pool, userID)
	t.Cleanup(func() { db2Clean(ctx, t, pool, userID) })

	s, err := CreateSession(ctx, pool, userID, "quota")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	zero, err := ReadQuota(ctx, pool, userID)
	if err != nil || zero.Minute != 0 || zero.Day != 0 {
		t.Fatalf("zero quota = %+v (%v)", zero, err)
	}
	if label, err := CheckQuota(ctx, pool, userID); err != nil || label != "ok" {
		t.Fatalf("check = %q (%v)", label, err)
	}
	// Assistant turns never consume the user budget.
	if _, err := AppendMessage(ctx, pool, userID, s.ID, "assistant", "hi"); err != nil {
		t.Fatalf("append assistant: %v", err)
	}
	if _, err := AppendMessage(ctx, pool, userID, s.ID, "user", "hello"); err != nil {
		t.Fatalf("append user: %v", err)
	}
	usage, err := ReadQuota(ctx, pool, userID)
	if err != nil || usage.Minute != 1 || usage.Day != 1 {
		t.Fatalf("usage = %+v (%v)", usage, err)
	}
	if label, err := CheckQuota(ctx, pool, userID); err != nil || label != "ok" {
		t.Fatalf("check = %q (%v)", label, err)
	}
	// Past the per-minute burst cap the gate says "minute".
	for i := 0; i < MinuteQuota; i++ {
		if _, err := AppendMessage(ctx, pool, userID, s.ID, "user", fmt.Sprintf("burst %d", i)); err != nil {
			t.Fatalf("burst %d: %v", i, err)
		}
	}
	if label, err := CheckQuota(ctx, pool, userID); err != nil || label != "minute" {
		t.Fatalf("burst check = %q (%v)", label, err)
	}
}

func TestDB2QuotaLabelPure(t *testing.T) {
	if got := (QuotaUsage{Minute: 0, Day: 0}).Label(); got != "ok" {
		t.Fatalf("label = %q", got)
	}
	if got := (QuotaUsage{Minute: MinuteQuota, Day: 0}).Label(); got != "minute" {
		t.Fatalf("label = %q", got)
	}
	if got := (QuotaUsage{Minute: 0, Day: DailyQuota}).Label(); got != "day" {
		t.Fatalf("label = %q", got)
	}
	if got := (QuotaUsage{Minute: MinuteQuota, Day: DailyQuota}).Label(); got != "minute" {
		t.Fatalf("label = %q, minute wins", got)
	}
}

func TestDB2MemorySnapshotListsAndDelete(t *testing.T) {
	pool, userID, otherID := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	db2Clean(ctx, t, pool, userID)
	db2Clean(ctx, t, pool, otherID)
	t.Cleanup(func() {
		db2Clean(ctx, t, pool, userID)
		db2Clean(ctx, t, pool, otherID)
	})

	if _, err := Remember(ctx, pool, userID, ""); err == nil {
		t.Fatal("empty note was accepted")
	}
	firstID, err := Remember(ctx, pool, userID, "prefers a Ramadan handover pause")
	if err != nil {
		t.Fatalf("remember: %v", err)
	}
	if _, err := Remember(ctx, pool, userID, "shortlists Bandung villas"); err != nil {
		t.Fatalf("remember: %v", err)
	}
	s, err := CreateSession(ctx, pool, userID, "snapshot source")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := AppendMessage(ctx, pool, userID, s.ID, "user", "remember the Bandung budget"); err != nil {
		t.Fatalf("append: %v", err)
	}
	if err := SyncSession(ctx, pool, userID, s.ID); err != nil {
		t.Fatalf("sync: %v", err)
	}

	snap, err := LoadMemorySnapshot(ctx, pool, userID, 0) // clamp to default
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if !snap.Enabled || snap.Count != 3 || len(snap.Items) != 3 {
		t.Fatalf("snapshot = %+v", snap)
	}
	limited, err := LoadMemorySnapshot(ctx, pool, userID, 1)
	if err != nil || len(limited.Items) != 1 || limited.Count != 3 {
		t.Fatalf("limited = %+v (%v)", limited, err)
	}
	huge, err := LoadMemorySnapshot(ctx, pool, userID, 5000) // clamp to 100
	if err != nil || len(huge.Items) != 3 {
		t.Fatalf("huge = %+v (%v)", huge, err)
	}

	items, err := ListMemories(ctx, pool, userID, 1)
	if err != nil || len(items) != 1 {
		t.Fatalf("list 1 = %+v (%v)", items, err)
	}
	allItems, err := ListMemories(ctx, pool, userID, 0)
	if err != nil || len(allItems) != 3 {
		t.Fatalf("list all = %d (%v)", len(allItems), err)
	}
	if allItems[0].CreatedAt.Before(allItems[2].CreatedAt) {
		t.Fatal("memories are not newest-first")
	}

	otherNote, err := Remember(ctx, pool, otherID, "other user's secret")
	if err != nil {
		t.Fatalf("other remember: %v", err)
	}
	if deleted, err := DeleteMemory(ctx, pool, userID, otherNote); err != nil || deleted {
		t.Fatalf("cross-user delete = %v (%v)", deleted, err)
	}
	if deleted, err := DeleteMemory(ctx, pool, userID, firstID); err != nil || !deleted {
		t.Fatalf("own delete = %v (%v)", deleted, err)
	}
	if deleted, err := DeleteMemory(ctx, pool, userID, firstID); err != nil || deleted {
		t.Fatalf("repeat delete = %v (%v)", deleted, err)
	}
	if deleted, err := DeleteMemory(ctx, pool, otherID, otherNote); err != nil || !deleted {
		t.Fatalf("other cleanup delete = %v (%v)", deleted, err)
	}
	if count, _ := CountMemories(ctx, pool, userID); count != 2 {
		t.Fatalf("count = %d, want 2", count)
	}
}

func TestDB2SearchMemoryEdges(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	db2Clean(ctx, t, pool, userID)
	t.Cleanup(func() { db2Clean(ctx, t, pool, userID) })

	svc := NewMemoryService(pool)

	// Nil and malformed identities search nothing and fail nothing.
	if out, err := svc.SearchMemory(ctx, nil); err != nil || len(out.Memories) != 0 {
		t.Fatalf("nil req = %+v (%v)", out, err)
	}
	for _, bad := range []string{"", "bogus", "user-0", "user--5", "user-abc"} {
		out, err := svc.SearchMemory(ctx, &memory.SearchRequest{UserID: bad, Query: "house"})
		if err != nil || len(out.Memories) != 0 {
			t.Fatalf("bad id %q = %+v (%v)", bad, out, err)
		}
	}

	// A switched-off memory returns nothing, even with rows present.
	if _, err := Remember(ctx, pool, userID, "Bandung villa hunt"); err != nil {
		t.Fatalf("remember: %v", err)
	}
	if err := SetMemoryEnabled(ctx, pool, userID, false); err != nil {
		t.Fatalf("disable: %v", err)
	}
	if out, err := svc.SearchMemory(ctx, &memory.SearchRequest{UserID: fmt.Sprintf("user-%d", userID), Query: "Bandung"}); err != nil || len(out.Memories) != 0 {
		t.Fatalf("disabled search = %+v (%v)", out, err)
	}
	if enabled, err := MemoryEnabled(ctx, pool, userID); err != nil || enabled {
		t.Fatalf("enabled = %v (%v)", enabled, err)
	}
	if err := SetMemoryEnabled(ctx, pool, userID, true); err != nil {
		t.Fatalf("enable: %v", err)
	}

	// Empty query returns newest first; LIKE metacharacters cannot flood.
	empty, err := svc.SearchMemory(ctx, &memory.SearchRequest{UserID: fmt.Sprintf("user-%d", userID), Query: "   "})
	if err != nil || len(empty.Memories) == 0 {
		t.Fatalf("empty query = %+v (%v)", empty, err)
	}
	meta, err := svc.SearchMemory(ctx, &memory.SearchRequest{UserID: fmt.Sprintf("user-%d", userID), Query: `100%_%_`})
	if err != nil {
		t.Fatalf("metachar query: %v", err)
	}
	if len(meta.Memories) > memorySearchLimit {
		t.Fatalf("metachar flood: %d rows", len(meta.Memories))
	}
	// Punctuation-only input yields an empty tsquery; the OR arm still works.
	if _, err := svc.SearchMemory(ctx, &memory.SearchRequest{UserID: fmt.Sprintf("user-%d", userID), Query: "!!!"}); err != nil {
		t.Fatalf("punctuation query: %v", err)
	}

	// The 6000-byte prompt cap stops the preload after five full entries.
	big := strings.Repeat("bandungtest ", 125)
	for i := 0; i < 7; i++ {
		if _, err := Remember(ctx, pool, userID, big); err != nil {
			t.Fatalf("big remember %d: %v", i, err)
		}
	}
	capped, err := svc.SearchMemory(ctx, &memory.SearchRequest{UserID: fmt.Sprintf("user-%d", userID), Query: "bandungtest"})
	if err != nil {
		t.Fatalf("capped search: %v", err)
	}
	if len(capped.Memories) != 5 {
		t.Fatalf("capped rows = %d, want 5", len(capped.Memories))
	}
}

func TestDB2EnabledServiceCacheAndAddSession(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	db2Clean(ctx, t, pool, userID)
	t.Cleanup(func() { db2Clean(ctx, t, pool, userID) })

	if _, err := Remember(ctx, pool, userID, "Bandung school zones"); err != nil {
		t.Fatalf("remember: %v", err)
	}
	uid := fmt.Sprintf("user-%d", userID)

	off := NewEnabledMemoryService(pool, false)
	if out, err := off.SearchMemory(ctx, &memory.SearchRequest{UserID: uid, Query: "Bandung"}); err != nil || len(out.Memories) != 0 {
		t.Fatalf("pinned-off search = %+v (%v)", out, err)
	}
	on := NewEnabledMemoryService(pool, true)
	if out, err := on.SearchMemory(ctx, &memory.SearchRequest{UserID: uid, Query: "Bandung"}); err != nil || len(out.Memories) == 0 {
		t.Fatalf("pinned-on search = %+v (%v)", out, err)
	}

	// The turn cache answers the repeat without a second database round trip.
	cached := newCachedMemoryService(NewMemoryService(pool))
	cachedSvc, ok := cached.(*cachedMemoryService)
	if !ok {
		t.Fatal("not a cached service")
	}
	req := &memory.SearchRequest{UserID: uid, Query: "Bandung"}
	firstHit, err := cached.SearchMemory(ctx, req)
	if err != nil || len(firstHit.Memories) == 0 {
		t.Fatalf("first = %+v (%v)", firstHit, err)
	}
	secondHit, err := cached.SearchMemory(ctx, req)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if len(secondHit.Memories) != len(firstHit.Memories) {
		t.Fatalf("cache mismatch: %d vs %d", len(secondHit.Memories), len(firstHit.Memories))
	}
	if cachedSvc.cache[uid+"\x00Bandung"] == nil {
		t.Fatal("turn cache was not populated")
	}
	if err := cached.AddSessionToMemory(ctx, nil); err != nil {
		t.Fatalf("cached nil session: %v", err)
	}

	// AddSessionToMemory: nil and malformed sessions are no-ops; a real one syncs.
	pgSvc := NewMemoryService(pool)
	if err := pgSvc.AddSessionToMemory(ctx, nil); err != nil {
		t.Fatalf("nil session: %v", err)
	}
	sessions := session.InMemoryService()
	bogus, err := sessions.Create(ctx, &session.CreateRequest{
		AppName: "ceria", UserID: "not-a-user", SessionID: "db2-bogus-session",
	})
	if err != nil {
		t.Fatalf("bogus create: %v", err)
	}
	if err := pgSvc.AddSessionToMemory(ctx, bogus.Session); err != nil {
		t.Fatalf("bogus session: %v", err)
	}

	dbSession, err := CreateSession(ctx, pool, userID, "ingest me")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := AppendMessage(ctx, pool, userID, dbSession.ID, "user", "db2 syncable turn"); err != nil {
		t.Fatalf("append: %v", err)
	}
	before, err := CountMemories(ctx, pool, userID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	created, err := sessions.Create(ctx, &session.CreateRequest{
		AppName: "ceria", UserID: uid, SessionID: dbSession.ID,
	})
	if err != nil {
		t.Fatalf("session create: %v", err)
	}
	fetched, err := sessions.Get(ctx, &session.GetRequest{
		AppName: "ceria", UserID: uid, SessionID: dbSession.ID,
	})
	if err != nil {
		t.Fatalf("session get: %v", err)
	}
	_ = created
	if err := pgSvc.AddSessionToMemory(ctx, fetched.Session); err != nil {
		t.Fatalf("ingest: %v", err)
	}
	after, err := CountMemories(ctx, pool, userID)
	if err != nil || after != before+1 {
		t.Fatalf("count %d -> %d (%v)", before, after, err)
	}
	// A retried ingest must not duplicate context (partial unique index).
	if err := pgSvc.AddSessionToMemory(ctx, fetched.Session); err != nil {
		t.Fatalf("retry: %v", err)
	}
	if again, _ := CountMemories(ctx, pool, userID); again != after {
		t.Fatalf("retry duplicated: %d vs %d", again, after)
	}
}

func TestDB2SearchHousesFilters(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	tc := ToolCtx{Pool: pool, UserID: userID}

	bandung, err := searchHouses(ctx, tc, HouseSearchArgs{City: "bandung"})
	if err != nil {
		t.Fatalf("city: %v", err)
	}
	if len(bandung.Houses) != 1 || bandung.Houses[0].ID != 6 {
		t.Fatalf("bandung = %+v", bandung)
	}
	band, err := searchHouses(ctx, tc, HouseSearchArgs{PriceMin: 1800000000, PriceMax: 1900000000})
	if err != nil || len(band.Houses) != 1 || band.Houses[0].ID != 2 {
		t.Fatalf("band = %+v (%v)", band, err)
	}
	four, err := searchHouses(ctx, tc, HouseSearchArgs{Bedrooms: 4, Limit: 99})
	if err != nil || len(four.Houses) != 2 {
		t.Fatalf("bedrooms = %+v (%v)", four, err)
	}
	query, err := searchHouses(ctx, tc, HouseSearchArgs{Query: "Canggu"})
	if err != nil || len(query.Houses) != 1 || query.Houses[0].ID != 3 {
		t.Fatalf("query = %+v (%v)", query, err)
	}
	combo, err := searchHouses(ctx, tc, HouseSearchArgs{City: "Bandung", Bedrooms: 3, PriceMax: 4000000000})
	if err != nil || len(combo.Houses) != 1 {
		t.Fatalf("combo = %+v (%v)", combo, err)
	}
	for _, row := range combo.Houses {
		if !strings.HasPrefix(row.PriceIDR, "Rp ") || row.PriceIDR == "Rp 0" {
			t.Fatalf("price lost type: %+v", row)
		}
	}
	none, err := searchHouses(ctx, tc, HouseSearchArgs{City: "Nowhereville", Limit: 0})
	if err != nil || len(none.Houses) != 0 || none.Note == "" {
		t.Fatalf("no-match = %+v (%v)", none, err)
	}

	detail, err := getHouse(ctx, tc, HouseArgs{HouseID: 6})
	if err != nil {
		t.Fatalf("get house: %v", err)
	}
	if !detail.Found || detail.City != "Bandung" || !strings.HasPrefix(detail.PriceIDR, "Rp 3.850.000.000") {
		t.Fatalf("detail = %+v", detail)
	}
	missing, err := getHouse(ctx, tc, HouseArgs{HouseID: 999999999})
	if err != nil || missing.Found {
		t.Fatalf("missing = %+v (%v)", missing, err)
	}
}

func TestDB2SearchProfessionalsAndMaterials(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	tc := ToolCtx{Pool: pool, UserID: userID}

	kontraktor, err := searchProfessionals(ctx, tc, ProSearchArgs{Role: "kontraktor"})
	if err != nil {
		t.Fatalf("kontraktor: %v", err)
	}
	if len(kontraktor.Professionals) == 0 {
		t.Fatal("no verified kontraktors")
	}
	if kontraktor.Professionals[0].Name == "" {
		t.Fatalf("row = %+v", kontraktor.Professionals[0])
	}
	filtered, err := searchProfessionals(ctx, tc, ProSearchArgs{Role: "kontraktor", Query: "Anindia", Limit: 99})
	if err != nil || len(filtered.Professionals) != 1 {
		t.Fatalf("filtered = %+v (%v)", filtered, err)
	}
	// company_name-mapped roles exercise the alternate column branches.
	for _, role := range []string{"arsitek", "interior", "notaris", "project_manager"} {
		res, err := searchProfessionals(ctx, tc, ProSearchArgs{Role: role})
		if err != nil {
			t.Fatalf("%s: %v", role, err)
		}
		for _, row := range res.Professionals {
			if row.Name == "" {
				t.Fatalf("%s row = %+v", role, row)
			}
		}
	}
	unknown, err := searchProfessionals(ctx, tc, ProSearchArgs{Role: "pengacara"})
	if err != nil || unknown.Note == "" {
		t.Fatalf("unknown role = %+v (%v)", unknown, err)
	}
	empty, err := searchProfessionals(ctx, tc, ProSearchArgs{Role: "arsitek", Query: "zzz-no-such-pro"})
	if err != nil || len(empty.Professionals) != 0 || empty.Note == "" {
		t.Fatalf("empty = %+v (%v)", empty, err)
	}

	all, err := searchMaterials(ctx, tc, MaterialSearchArgs{})
	if err != nil || len(all.Materials) == 0 {
		t.Fatalf("all materials = %+v (%v)", all, err)
	}
	none, err := searchMaterials(ctx, tc, MaterialSearchArgs{Query: "zzz-no-such-material"})
	if err != nil || len(none.Materials) != 0 || none.Note == "" {
		t.Fatalf("no-match = %+v (%v)", none, err)
	}
}

func TestDB2MyProjectsAndCallerIDs(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()

	// 31682 owns seeded projects and holds an arsitek profile.
	mine, err := myProjects(ctx, ToolCtx{Pool: pool, UserID: userID}, MyProjectsArgs{})
	if err != nil {
		t.Fatalf("my projects: %v", err)
	}
	if len(mine.Projects) == 0 {
		t.Fatal("owner sees no projects")
	}
	for _, p := range mine.Projects {
		if !strings.HasPrefix(p.Budget, "Rp ") || p.Budget == "Rp 0" || p.Budget == "Rp —" {
			t.Fatalf("budget lost type: %+v", p)
		}
	}
	// A hired professional resolves through the profile branch: user 31683
	// owns nothing but holds kontraktor profile 6544, selected on 14972.
	hiredID := db2ProjectlessUser(ctx, t, pool)
	hired, err := myProjects(ctx, ToolCtx{Pool: pool, UserID: hiredID, Profiles: NewProfileCache()}, MyProjectsArgs{Limit: 99})
	if err != nil {
		t.Fatalf("hired: %v", err)
	}
	foundHired := false
	for _, p := range hired.Projects {
		if p.ID == 14972 {
			foundHired = true
		}
	}
	if !foundHired {
		t.Fatalf("hired professional misses 14972: %+v", hired)
	}

	// A user with no projects and no profiles gets the guidance note.
	strangerID := db2IsolatedUser(ctx, t, pool)
	empty, err := myProjects(ctx, ToolCtx{Pool: pool, UserID: strangerID}, MyProjectsArgs{})
	if err != nil || len(empty.Projects) != 0 || empty.Note == "" {
		t.Fatalf("empty = %+v (%v)", empty, err)
	}

	ids := callerProfileIDs(ctx, pool, userID)
	if ids["arsiteks"] == 0 {
		t.Fatalf("caller profiles = %v", ids)
	}
	if none := callerProfileIDs(ctx, pool, strangerID); len(none) != 0 {
		t.Fatalf("stranger profiles = %v", none)
	}
}

func TestDB2ProjectNotFoundDeniedAndRows(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	strangerID := db2IsolatedUser(ctx, t, pool)

	const missingID = int64(999999999)
	owner := ToolCtx{Pool: pool, UserID: userID}
	stranger := ToolCtx{Pool: pool, UserID: strangerID}
	admin := ToolCtx{Pool: pool, UserID: strangerID, IsAdmin: true}

	// Unknown ids are "not found" on every scoped tool.
	if r, err := getProject(ctx, owner, ProjectArgs{ProjectID: missingID}); err != nil || r.Found {
		t.Fatalf("get missing = %+v (%v)", r, err)
	}
	if r, err := projectFinance(ctx, owner, ProjectArgs{ProjectID: missingID}); err != nil || r.Found {
		t.Fatalf("finance missing = %+v (%v)", r, err)
	}
	if r, err := projectSchedule(ctx, owner, ProjectArgs{ProjectID: missingID}); err != nil || r.Found {
		t.Fatalf("schedule missing = %+v (%v)", r, err)
	}
	if r, err := projectBids(ctx, owner, ProjectArgs{ProjectID: missingID}); err != nil || r.Found {
		t.Fatalf("bids missing = %+v (%v)", r, err)
	}

	// A stranger is refused everywhere on the owner's project 14970.
	if r, err := getProject(ctx, stranger, ProjectArgs{ProjectID: 14970}); err != nil || !r.Found || r.Accessible {
		t.Fatalf("stranger get = %+v (%v)", r, err)
	}
	if r, err := projectFinance(ctx, stranger, ProjectArgs{ProjectID: 14970}); err != nil || !r.Found || r.Accessible {
		t.Fatalf("stranger finance = %+v (%v)", r, err)
	}
	if r, err := projectSchedule(ctx, stranger, ProjectArgs{ProjectID: 14970}); err != nil || !r.Found || r.Accessible {
		t.Fatalf("stranger schedule = %+v (%v)", r, err)
	}
	if r, err := projectBids(ctx, stranger, ProjectArgs{ProjectID: 14970}); err != nil || !r.Found || r.Accessible {
		t.Fatalf("stranger bids = %+v (%v)", r, err)
	}
	// An admin passes the same gates.
	if r, err := getProject(ctx, admin, ProjectArgs{ProjectID: 14970}); err != nil || !r.Accessible {
		t.Fatalf("admin get = %+v (%v)", r, err)
	}
	if r, err := projectBids(ctx, admin, ProjectArgs{ProjectID: 14970}); err != nil || !r.Accessible {
		t.Fatalf("admin bids = %+v (%v)", r, err)
	}

	// Project 14976 (owner 31692) carries seeded bids and a payment termin.
	var owner14976 int64
	if err := pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = 14976`).Scan(&owner14976); err != nil {
		t.Skip("no seeded project 14976")
	}
	ownerCtx := ToolCtx{Pool: pool, UserID: owner14976}
	bids, err := projectBids(ctx, ownerCtx, ProjectArgs{ProjectID: 14976})
	if err != nil {
		t.Fatalf("bids: %v", err)
	}
	if !bids.Accessible || len(bids.Bids) != 3 {
		t.Fatalf("bids = %+v", bids)
	}
	for _, b := range bids.Bids {
		if b.Bidder == "" || !strings.HasPrefix(b.PriceIDR, "Rp ") || b.PriceIDR == "Rp 0" {
			t.Fatalf("bid row = %+v", b)
		}
	}
	fin, err := projectFinance(ctx, ownerCtx, ProjectArgs{ProjectID: 14976})
	if err != nil {
		t.Fatalf("finance: %v", err)
	}
	if !fin.Accessible || len(fin.Termins) != 1 || fin.Termins[0].Label != "DP" {
		t.Fatalf("finance = %+v", fin)
	}
	if fin.BudgetIDR == "" || fin.PaidIDR == "" || fin.CommittedIDR == "" || fin.AvailableIDR == "" {
		t.Fatalf("finance amounts missing: %+v", fin)
	}

	// Milestones and phases come from the caller's own rows, then go away.
	if _, err := pool.Exec(ctx, `DELETE FROM project_milestones WHERE project_id = 14970 AND title = 'db2-milestone'`); err != nil {
		t.Fatalf("pre-clean milestone: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM project_schedules WHERE project_id = 14970 AND phase_slug = 'db2-phase'`); err != nil {
		t.Fatalf("pre-clean schedule: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO project_milestones (project_id, title, approval_status, is_completed, sort_order, due_date)
		VALUES (14970, 'db2-milestone', 'approved', true, 1, CURRENT_DATE + 7)
	`); err != nil {
		t.Fatalf("insert milestone: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO project_schedules (project_id, phase_slug, status, progress_percentage, target_end_date)
		VALUES (14970, 'db2-phase', 'ongoing', 40, CURRENT_DATE + 30)
	`); err != nil {
		t.Fatalf("insert schedule: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM project_milestones WHERE project_id = 14970 AND title = 'db2-milestone'`)
		pool.Exec(ctx, `DELETE FROM project_schedules WHERE project_id = 14970 AND phase_slug = 'db2-phase'`)
	})
	sched, err := projectSchedule(ctx, owner, ProjectArgs{ProjectID: 14970})
	if err != nil {
		t.Fatalf("schedule: %v", err)
	}
	if !sched.Accessible || sched.Total != 1 || sched.Completed != 1 {
		t.Fatalf("milestones = %+v", sched)
	}
	if len(sched.Milestones) != 1 || sched.Milestones[0].DueDate == "" {
		t.Fatalf("milestone rows = %+v", sched.Milestones)
	}
	if len(sched.Phases) != 1 || sched.Phases[0].Progress != 40 {
		t.Fatalf("phases = %+v", sched.Phases)
	}

	// A professional with no bids gets the guidance note.
	if r, err := myBids(ctx, ToolCtx{Pool: pool, UserID: strangerID}, MyBidsArgs{}); err != nil || len(r.Bids) != 0 || r.Note == "" {
		t.Fatalf("empty bids = %+v (%v)", r, err)
	}
}

// db2AgentCtx is an agent.Context for tests that reach the database: it
// embeds the interface (like the pure stub) so the wide surface stays
// satisfied, but serves Deadline/Done/Err/Value from a real context — the
// stub's nil embedded interface panics on Done once pgx acquires a
// connection. The explicit methods shadow the promoted nil ones.
type db2AgentCtx struct {
	agent.Context
	live context.Context
}

func (d *db2AgentCtx) SearchMemory(context.Context, string) (*memory.SearchResponse, error) {
	return &memory.SearchResponse{}, nil
}

func (d *db2AgentCtx) ToolConfirmation() *toolconfirmation.ToolConfirmation { return nil }

func (d *db2AgentCtx) Deadline() (time.Time, bool) { return d.live.Deadline() }
func (d *db2AgentCtx) Done() <-chan struct{}       { return d.live.Done() }
func (d *db2AgentCtx) Err() error                  { return d.live.Err() }
func (d *db2AgentCtx) Value(key any) any           { return d.live.Value(key) }

func TestDB2RememberToolWithPool(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	db2Clean(ctx, t, pool, userID)
	t.Cleanup(func() { db2Clean(ctx, t, pool, userID) })

	// stubAgentCtx (pure tests) embeds a nil agent.Context, whose Done()
	// panics once the handler reaches the pool. This wrapper keeps the
	// same two overrides but serves the context methods from a real one.
	actx := &db2AgentCtx{live: ctx}
	tool := newRememberTool(ToolCtx{Pool: pool, UserID: userID, MemoryEnabled: true})
	runner, ok := tool.(toolRunner)
	if !ok {
		t.Fatal("remember tool has no Run method")
	}
	out, err := runner.Run(actx, map[string]any{"content": "db2 pool note"})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if stored, _ := out["stored"].(bool); !stored {
		t.Fatalf("stored = %v", out)
	}
	if count, _ := CountMemories(ctx, pool, userID); count != 1 {
		t.Fatalf("count = %d, want 1", count)
	}
	// A blank note is a tool error, never a stored row.
	if _, err := runner.Run(actx, map[string]any{"content": "   "}); err == nil {
		t.Fatal("blank note was accepted")
	}
	// Memory off stores nothing.
	off := newRememberTool(ToolCtx{Pool: pool, UserID: userID})
	offRunner, ok := off.(toolRunner)
	if !ok {
		t.Fatal("off tool has no Run method")
	}
	out, err = offRunner.Run(actx, map[string]any{"content": "db2 off note"})
	if err != nil {
		t.Fatalf("off run: %v", err)
	}
	if stored, _ := out["stored"].(bool); stored {
		t.Fatalf("off stored = %v", out)
	}
}

func TestDB2MCPHandlersAgainstPostgres(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()

	server := NewMCPServer(ToolCtx{Pool: pool, UserID: userID}, true)
	client := mcp.NewClient(&mcp.Implementation{Name: "db2", Version: "0.0.1"}, nil)
	serverTransport, clientTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("server connect: %v", err)
	}
	defer serverSession.Close()
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	defer clientSession.Close()

	calls := []struct {
		name string
		args map[string]any
	}{
		{"search_houses", map[string]any{"query": "Bandung"}},
		{"get_house", map[string]any{"house_id": float64(6)}},
		{"search_professionals", map[string]any{"role": "kontraktor"}},
		{"search_materials", map[string]any{}},
		{"platform_help", map[string]any{"topic": "escrow"}},
		{"estimate_budget", map[string]any{"project_type": "new_build", "area_m2": float64(100)}},
		{"my_projects", map[string]any{"limit": float64(3)}},
		{"get_project", map[string]any{"project_id": float64(14970)}},
		{"project_finance", map[string]any{"project_id": float64(14970)}},
		{"project_schedule", map[string]any{"project_id": float64(14970)}},
		{"project_bids", map[string]any{"project_id": float64(14970)}},
		{"my_bids", map[string]any{"limit": float64(5)}},
	}
	for _, call := range calls {
		result, err := clientSession.CallTool(ctx, &mcp.CallToolParams{
			Name:      call.name,
			Arguments: call.args,
		})
		if err != nil {
			t.Fatalf("%s: %v", call.name, err)
		}
		if result.IsError {
			t.Fatalf("%s errored: %+v", call.name, result)
		}
		if len(result.Content) == 0 {
			t.Fatalf("%s returned no content", call.name)
		}
	}
}

// The last four close service.go's init/failure branches without a model:
// a missing model name fails before any network, and a 500 fails the run.

func TestDB2ProfileBranches(t *testing.T) {
	pool, _, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()

	// Every professional table gets a turn as the caller, so each
	// ownership OR-branch in myProjects executes at least once.
	tables := []string{
		"arsiteks", "kontraktors", "notaris_profiles", "interior_profiles",
		"structural_engineers", "mep_engineers", "project_managers",
	}
	seen := 0
	for _, table := range tables {
		var uid int64
		if err := pool.QueryRow(ctx,
			fmt.Sprintf(`SELECT user_id FROM %s ORDER BY id LIMIT 1`, table),
		).Scan(&uid); err != nil {
			continue
		}
		seen++
		if _, err := myProjects(ctx, ToolCtx{Pool: pool, UserID: uid, Profiles: NewProfileCache()}, MyProjectsArgs{Limit: 3}); err != nil {
			t.Errorf("%s caller: %v", table, err)
		}
	}
	if seen == 0 {
		t.Skip("no seeded professional profiles")
	}
}

// TestDB2ClosedPoolErrors pins the failure contract of every read path: a
// dead database must surface a Go error (or an empty scope), never a panic
// and never a zero-money answer. Each error return is also a coverage
// statement the seeded suite cannot reach with a healthy pool.
func TestDB2ClosedPoolErrors(t *testing.T) {
	pool, userID, _ := memoryPool(t)
	t.Cleanup(pool.Close)
	ctx := context.Background()
	pool.Close() // kill it; every call below must fail soft.
	tc := ToolCtx{Pool: pool, UserID: userID}

	if _, err := searchHouses(ctx, tc, HouseSearchArgs{Query: "x"}); err == nil {
		t.Error("searchHouses accepted a dead pool")
	}
	if _, err := getHouse(ctx, tc, HouseArgs{HouseID: 1}); err == nil {
		t.Error("getHouse accepted a dead pool")
	}
	if _, err := searchProfessionals(ctx, tc, ProSearchArgs{Role: "kontraktor"}); err == nil {
		t.Error("searchProfessionals accepted a dead pool")
	}
	if _, err := searchMaterials(ctx, tc, MaterialSearchArgs{Query: "x"}); err == nil {
		t.Error("searchMaterials accepted a dead pool")
	}
	if _, err := myProjects(ctx, tc, MyProjectsArgs{}); err == nil {
		t.Error("myProjects accepted a dead pool")
	}
	if _, err := getProject(ctx, tc, ProjectArgs{ProjectID: 1}); err == nil {
		t.Error("getProject accepted a dead pool")
	}
	if _, err := projectFinance(ctx, tc, ProjectArgs{ProjectID: 1}); err == nil {
		t.Error("projectFinance accepted a dead pool")
	}
	if _, err := projectSchedule(ctx, tc, ProjectArgs{ProjectID: 1}); err == nil {
		t.Error("projectSchedule accepted a dead pool")
	}
	if _, err := projectBids(ctx, tc, ProjectArgs{ProjectID: 1}); err == nil {
		t.Error("projectBids accepted a dead pool")
	}
	if _, err := myBids(ctx, tc, MyBidsArgs{}); err == nil {
		t.Error("myBids accepted a dead pool")
	}
	if ids := callerProfileIDs(ctx, pool, userID); len(ids) != 0 {
		t.Errorf("callerProfileIDs on dead pool = %v", ids)
	}
	if _, err := CreateSession(ctx, pool, userID, "x"); err == nil {
		t.Error("CreateSession accepted a dead pool")
	}
	if _, err := ListSessions(ctx, pool, userID, 5); err == nil {
		t.Error("ListSessions accepted a dead pool")
	}
	if _, err := GetSession(ctx, pool, userID, "00000000-0000-0000-0000-000000000000"); err == nil {
		t.Error("GetSession accepted a dead pool")
	}
	if err := RenameSession(ctx, pool, userID, "00000000-0000-0000-0000-000000000000", "x"); err == nil {
		t.Error("RenameSession accepted a dead pool")
	}
	if err := DeleteSession(ctx, pool, userID, "00000000-0000-0000-0000-000000000000"); err == nil {
		t.Error("DeleteSession accepted a dead pool")
	}
	if _, err := AppendMessage(ctx, pool, userID, "00000000-0000-0000-0000-000000000000", "user", "x"); err == nil {
		t.Error("AppendMessage accepted a dead pool")
	}
	if _, err := ListMessages(ctx, pool, userID, "00000000-0000-0000-0000-000000000000", 5); err == nil {
		t.Error("ListMessages accepted a dead pool")
	}
	if _, err := RecentMessages(ctx, pool, userID, "00000000-0000-0000-0000-000000000000", 5); err == nil {
		t.Error("RecentMessages accepted a dead pool")
	}
	if _, err := ReadQuota(ctx, pool, userID); err == nil {
		t.Error("ReadQuota accepted a dead pool")
	}
	if _, err := CheckQuota(ctx, pool, userID); err == nil {
		t.Error("CheckQuota accepted a dead pool")
	}
	if _, err := LoadTurnState(ctx, pool, userID, "00000000-0000-0000-0000-000000000000"); err == nil {
		t.Error("LoadTurnState accepted a dead pool")
	}
	if _, err := LoadStatusSnapshot(ctx, pool, userID); err == nil {
		t.Error("LoadStatusSnapshot accepted a dead pool")
	}
	if _, err := LoadMemorySnapshot(ctx, pool, userID, 5); err == nil {
		t.Error("LoadMemorySnapshot accepted a dead pool")
	}
	if _, err := ListMemories(ctx, pool, userID, 5); err == nil {
		t.Error("ListMemories accepted a dead pool")
	}
	if _, err := CountMemories(ctx, pool, userID); err == nil {
		t.Error("CountMemories accepted a dead pool")
	}
	if err := ClearMemories(ctx, pool, userID); err == nil {
		t.Error("ClearMemories accepted a dead pool")
	}
	if _, err := DeleteMemory(ctx, pool, userID, 1); err == nil {
		t.Error("DeleteMemory accepted a dead pool")
	}
	if _, err := Remember(ctx, pool, userID, "x"); err == nil {
		t.Error("Remember accepted a dead pool")
	}
	if err := SetMemoryEnabled(ctx, pool, userID, true); err == nil {
		t.Error("SetMemoryEnabled accepted a dead pool")
	}
	if _, err := MemoryEnabled(ctx, pool, userID); err == nil {
		t.Error("MemoryEnabled accepted a dead pool")
	}
	if err := SyncSession(ctx, pool, userID, "00000000-0000-0000-0000-000000000000"); err == nil {
		t.Error("SyncSession accepted a dead pool")
	}
	svc := NewMemoryService(pool)
	if _, err := svc.SearchMemory(ctx, &memory.SearchRequest{UserID: "user-1", Query: "x"}); err == nil {
		t.Error("SearchMemory accepted a dead pool")
	}
}

func TestDB2ChatModelInitError(t *testing.T) {
	if _, err := Chat(context.Background(), Config{APIKey: "x"}, TurnInput{
		SessionID: "db200000-0000-0000-0000-000000000000",
		Message:   "hi",
	}); err == nil || !strings.Contains(err.Error(), "ai model") {
		t.Fatalf("err = %v, want model init failure", err)
	}
}

func TestDB2StreamRunnerInitError(t *testing.T) {
	var errs []string
	result := Stream(context.Background(), Config{APIKey: "x"}, TurnInput{
		SessionID: "db200000-0000-0000-0000-000000000001",
		Message:   "hi",
	}, func(chunk StreamChunk) bool {
		if chunk.Error != "" {
			errs = append(errs, chunk.Error)
		}
		return true
	})
	if result.Text != "" {
		t.Fatalf("text = %q", result.Text)
	}
	if len(errs) == 0 || !strings.Contains(errs[0], "could not start") {
		t.Fatalf("errors = %v", errs)
	}
}

func failingModelServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "overloaded", http.StatusInternalServerError)
	}))
}

func TestDB2ChatAndStreamAgainstFailingModel(t *testing.T) {
	server := failingModelServer(t)
	defer server.Close()
	if _, err := Chat(context.Background(), mockConfig(server), TurnInput{
		SessionID: "db200000-0000-0000-0000-000000000002",
		Message:   "hi",
	}); err == nil {
		t.Fatal("500 model was accepted")
	}

	var errs []string
	result := Stream(context.Background(), mockConfig(server), TurnInput{
		SessionID: "db200000-0000-0000-0000-000000000003",
		Message:   "hi",
	}, func(chunk StreamChunk) bool {
		if chunk.Error != "" {
			errs = append(errs, chunk.Error)
		}
		return true
	})
	if result.Text != "" {
		t.Fatalf("text = %q", result.Text)
	}
	if len(errs) == 0 {
		t.Fatal("failing stream yielded no error")
	}
}
