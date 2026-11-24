package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
)

type queryCounter struct {
	mu      sync.Mutex
	queries int
}

func (c *queryCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	c.mu.Lock()
	c.queries++
	c.mu.Unlock()
	return ctx
}

func (c *queryCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func (c *queryCounter) TraceBatchStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceBatchStartData) context.Context {
	return ctx
}

func (c *queryCounter) TraceBatchQuery(_ context.Context, _ *pgx.Conn, _ pgx.TraceBatchQueryData) {
	c.mu.Lock()
	c.queries++
	c.mu.Unlock()
}

func (c *queryCounter) TraceBatchEnd(context.Context, *pgx.Conn, pgx.TraceBatchEndData) {}

func (c *queryCounter) Count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.queries
}

func (c *queryCounter) Reset() {
	c.mu.Lock()
	c.queries = 0
	c.mu.Unlock()
}

func tracedPool(t *testing.T) (*pgxpool.Pool, *queryCounter) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL absent")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Skip("bad DATABASE_URL")
	}
	counter := &queryCounter{}
	cfg.ConnConfig.Tracer = counter
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Skip("no database")
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Skip("database unreachable")
	}
	return pool, counter
}

func TestStatsHandlerIsOneQuery(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()

	request := httptest.NewRequest(http.MethodGet, "/api/admin/stats", nil)
	recorder := httptest.NewRecorder()
	StatsHandler(pool)(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if got := counter.Count(); got != 1 {
		t.Errorf("stats used %d queries, want 1", got)
	}

	var body struct {
		TotalUsers int            `json:"total_users"`
		Roles      map[string]int `json:"role_distribution"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.TotalUsers == 0 || len(body.Roles) == 0 {
		t.Errorf("empty stats: %+v", body)
	}
}

func TestProjectsHandlerQueryBudget(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()
	ctx := context.Background()

	var userID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email = 'client@example.test'`).Scan(&userID); err != nil {
		t.Skip("demo owner absent")
	}
	caller := roadmapCaller{id: userID, role: "user"}
	request := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	request = request.WithContext(withCaller(request.Context(), caller))
	recorder := httptest.NewRecorder()
	counter.Reset()
	ProjectsHandler(pool)(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	t.Logf("projects handler used %d queries", counter.Count())
	if got := counter.Count(); got > 20 {
		t.Errorf("projects handler used %d queries; investigate the per-row loaders", got)
	}
}

func TestProjectsHandlerQueryCountIsRowInvariant(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()
	ctx := context.Background()

	var userID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email = 'client@example.test'`).Scan(&userID); err != nil {
		t.Skip("demo owner absent")
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO projects (user_id, title, description, budget, status, created_at, updated_at)
		SELECT $1, 'BATCHTEST-' || g, 'row invariance fixture', 1000000, 'open', now(), now()
		  FROM generate_series(1, 40) AS g
	`, userID); err != nil {
		t.Fatalf("seed projects: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM projects WHERE user_id = $1 AND title LIKE 'BATCHTEST-%'`, userID)

	request := httptest.NewRequest(http.MethodGet, "/api/projects?all=true", nil)
	request = request.WithContext(withCaller(request.Context(), roadmapCaller{id: userID, role: "user"}))
	recorder := httptest.NewRecorder()
	counter.Reset()
	ProjectsHandler(pool)(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	t.Logf("projects handler used %d queries for at least 40 rows", counter.Count())
	if got := counter.Count(); got > 20 {
		t.Errorf("projects handler used %d queries for 40+ rows, want <= 20", got)
	}
}

func TestAdminListQueryBudgets(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()
	ctx := context.Background()

	var adminID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email = 'admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("demo admin absent")
	}
	admin := roadmapCaller{id: adminID, role: "admin", admin: true}

	for _, item := range []struct {
		name    string
		path    string
		handler http.HandlerFunc
		budget  int
	}{
		{"admin projects", "/api/admin/projects", AdminProjectsHandler(pool), 12},
		{"admin users", "/api/admin/users", AdminUsersHandler(pool), 5},
		{"admin houses", "/api/admin/houses", AdminHousesHandler(pool), 3},
		{"admin professionals", "/api/admin/professionals", AdminProfessionalsIndexHandler(pool), 25},
	} {
		t.Run(item.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, item.path, nil)
			request = request.WithContext(withCaller(request.Context(), admin))
			recorder := httptest.NewRecorder()
			counter.Reset()
			item.handler(recorder, request)
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			t.Logf("%s used %d queries", item.name, counter.Count())
			if got := counter.Count(); got > item.budget {
				t.Errorf("%s used %d queries, budget %d", item.name, got, item.budget)
			}
		})
	}
}

func marshalText(t *testing.T, value any) string {
	t.Helper()
	encoded, err := jsonwire.Marshal(value)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(encoded)
}

func TestAdminBatchLoadersMatchSingles(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	var userID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID); err != nil {
		t.Skip("no seeded users")
	}
	singleUser, err := fullProfileUser(ctx, pool, userID, false)
	if err != nil {
		t.Fatalf("single user: %v", err)
	}
	users, err := fullProfileUsersBatch(ctx, pool, []int64{userID}, false, true)
	if err != nil {
		t.Fatalf("batch user: %v", err)
	}
	if got, want := marshalText(t, users[userID]), marshalText(t, singleUser); got != want {
		t.Errorf("batched user differs\n got: %s\nwant: %s", got, want)
	}

	singleRoles, err := adminUserRoles(ctx, pool, userID)
	if err != nil {
		t.Fatalf("single roles: %v", err)
	}
	roleMap, err := adminUserRolesBatch(ctx, pool, []int64{userID})
	if err != nil {
		t.Fatalf("batch roles: %v", err)
	}
	if got, want := marshalText(t, roleMap[userID]), marshalText(t, singleRoles); got != want {
		t.Errorf("batched roles differ\n got: %s\nwant: %s", got, want)
	}

	var projectID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects ORDER BY id LIMIT 1`).Scan(&projectID); err != nil {
		t.Skip("no seeded project")
	}
	singleModel, err := rawProjectModel(ctx, pool, projectID)
	if err != nil {
		t.Fatalf("single model: %v", err)
	}
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		t.Fatalf("project row: %v", err)
	}
	if got, want := marshalText(t, rawProjectModelFromValues(fields, values)), marshalText(t, singleModel); got != want {
		t.Errorf("batched project model differs\n got: %s\nwant: %s", got, want)
	}

	var arsitekID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM arsiteks ORDER BY id LIMIT 1`).Scan(&arsitekID); err == nil {
		singleProfile, err := profileModelObject(ctx, pool, "arsiteks", arsitekID, false)
		if err != nil {
			t.Fatalf("single profile: %v", err)
		}
		profiles, err := profileModelsBatch(ctx, pool, "arsiteks", []int64{arsitekID})
		if err != nil {
			t.Fatalf("batch profile: %v", err)
		}
		if got, want := marshalText(t, profiles[arsitekID]), marshalText(t, singleProfile); got != want {
			t.Errorf("batched profile differs\n got: %s\nwant: %s", got, want)
		}
	}

	bids, err := adminBidCountsBatch(ctx, pool, []int64{projectID})
	if err != nil {
		t.Fatalf("batch bids: %v", err)
	}
	var bidTotal, bidPending int64
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(CASE WHEN status::text IN
		           ('pending','reviewed','invited','negotiating','shortlisted')
		           THEN 1 ELSE 0 END), 0)
		  FROM bids WHERE project_id = $1
	`, projectID).Scan(&bidTotal, &bidPending); err != nil {
		t.Fatalf("single bids: %v", err)
	}
	if got := bids[projectID]; got.total != bidTotal || got.pending != bidPending {
		t.Errorf("bid counts = %+v, want total=%d pending=%d", got, bidTotal, bidPending)
	}

	ledger, err := adminLedgerBatch(ctx, pool, []int64{projectID})
	if err != nil {
		t.Fatalf("batch ledger: %v", err)
	}
	var paid, refunded int64
	if err := pool.QueryRow(ctx, `
		SELECT COALESCE((SUM(CASE WHEN transaction_type::text IN
		           ('payment','platform_fee','retention_release')
		           THEN amount ELSE 0 END) * 100)::bigint, 0),
		       COALESCE((SUM(CASE WHEN transaction_type::text = 'refund'
		           THEN amount ELSE 0 END) * 100)::bigint, 0)
		  FROM project_budget_transactions WHERE project_id = $1
	`, projectID).Scan(&paid, &refunded); err != nil {
		t.Fatalf("single ledger: %v", err)
	}
	if got := ledger[projectID]; got.paid != paid || got.refunded != refunded {
		t.Errorf("ledger = %+v, want paid=%d refunded=%d", got, paid, refunded)
	}
}

func TestAdminProfessionalsBatchMatchesSingle(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	collection := adminProfessionalCollections()[0]
	payload, err := adminProfessionalsPayload(ctx, pool, []adminProfileCollection{collection})
	if err != nil {
		t.Fatalf("batched payload: %v", err)
	}
	want, err := adminProfileList(ctx, pool, collection.table, collection.docs, collection.roleType)
	if err != nil {
		t.Fatalf("single payload: %v", err)
	}

	raw, ok := payload.Get(collection.key)
	if !ok {
		t.Fatalf("missing key %q", collection.key)
	}
	got, ok := raw.([]any)
	if !ok {
		t.Fatalf("%q is %T, want []any", collection.key, raw)
	}
	if gotText, wantText := marshalText(t, got), marshalText(t, want); gotText != wantText {
		t.Errorf("batched professionals differ\n got: %s\nwant: %s", gotText, wantText)
	}
}

func TestAdminHousesBatchMatchesSingle(t *testing.T) {
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

	single, err := fullProfileUser(ctx, pool, ownerID, false)
	if err != nil {
		t.Fatalf("single owner: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/admin/houses", nil)
	recorder := httptest.NewRecorder()
	AdminHousesHandler(pool)(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}

	var body struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, item := range body.Data {
		id, _ := item["id"].(float64)
		if int64(id) != houseID {
			continue
		}
		var want any
		if err := json.Unmarshal([]byte(marshalText(t, single)), &want); err != nil {
			t.Fatalf("decode single: %v", err)
		}
		if !reflect.DeepEqual(item["user"], want) {
			t.Errorf("house %d user differs\n got: %#v\nwant: %#v", houseID, item["user"], want)
		}
		return
	}
	t.Fatalf("house %d is not on the first admin page", houseID)
}

func TestConversationsIndexQueryBudget(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()
	ctx := context.Background()

	var callerID, otherID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&callerID); err != nil {
		t.Skip("no seeded users")
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE id <> $1 ORDER BY id LIMIT 1`, callerID).Scan(&otherID); err != nil {
		t.Skip("no second user")
	}

	low, high := callerID, otherID
	if low > high {
		low, high = high, low
	}
	var existing int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM conversations
		WHERE user_one_id = $1 AND user_two_id = $2`, low, high).Scan(&existing); err != nil {
		t.Fatalf("conversation probe: %v", err)
	}
	if existing != 0 {
		t.Skip("conversation fixture already exists")
	}

	var conversationID int64
	if err := pool.QueryRow(ctx, `INSERT INTO conversations
		(user_one_id, user_two_id, last_message_at, created_at, updated_at)
		VALUES ($1, $2, now(), now(), now()) RETURNING id`, low, high).Scan(&conversationID); err != nil {
		t.Fatalf("insert conversation: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, conversationID)

	if _, err := pool.Exec(ctx, `INSERT INTO chat_messages
		(conversation_id, sender_id, content, is_read, created_at, updated_at)
		VALUES ($1, $2, 'first', false, now() - interval '2 minutes', now()),
		       ($1, $2, 'second', false, now() - interval '1 minute', now()),
		       ($1, $3, 'last', true, now(), now())`,
		conversationID, otherID, callerID); err != nil {
		t.Fatalf("insert messages: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	request = request.WithContext(withCaller(request.Context(), roadmapCaller{id: callerID}))
	recorder := httptest.NewRecorder()
	counter.Reset()
	ConversationsIndexHandler(pool)(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	t.Logf("conversations inbox used %d queries", counter.Count())
	if got := counter.Count(); got > 5 {
		t.Errorf("conversations inbox used %d queries, budget 5", got)
	}

	var body struct {
		Data []struct {
			ID        int64 `json:"id"`
			OtherUser struct {
				ID int64 `json:"id"`
			} `json:"other_user"`
			LastMessage *struct {
				Content string `json:"content"`
			} `json:"last_message"`
			UnreadCount int64 `json:"unread_count"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, item := range body.Data {
		if item.ID != conversationID {
			continue
		}
		if item.OtherUser.ID != otherID {
			t.Errorf("other_user.id = %d, want %d", item.OtherUser.ID, otherID)
		}
		if item.UnreadCount != 2 {
			t.Errorf("unread_count = %d, want 2", item.UnreadCount)
		}
		if item.LastMessage == nil || item.LastMessage.Content != "last" {
			t.Errorf("last_message = %#v, want content %q", item.LastMessage, "last")
		}
		return
	}
	t.Fatalf("conversation %d absent from the inbox", conversationID)
}

func TestDirectoryQueryBudget(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()

	for _, item := range []struct {
		name         string
		table        string
		path         string
		withServices bool
	}{
		{"arsitek", "arsiteks", "/api/arsitek", false},
		{"notaris", "notaris_profiles", "/api/notaris", true},
	} {
		t.Run(item.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, item.path, nil)
			recorder := httptest.NewRecorder()
			counter.Reset()
			DirectoryHandler(pool, item.table, item.path, item.withServices)(recorder, request)
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			t.Logf("%s used %d queries", item.name, counter.Count())
			if got := counter.Count(); got > 7 {
				t.Errorf("%s used %d queries, budget 7", item.name, got)
			}
		})
	}
}

func TestMarketplaceListQueryBudgets(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()

	for _, item := range []struct {
		name    string
		path    string
		handler http.HandlerFunc
		budget  int
	}{
		{"suppliers", "/api/marketplace/suppliers", MarketplaceSuppliersHandler(pool), 5},
		{"materials", "/api/marketplace/materials", MarketplaceMaterialsHandler(pool), 5},
	} {
		t.Run(item.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, item.path, nil)
			recorder := httptest.NewRecorder()
			counter.Reset()
			item.handler(recorder, request)
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
			t.Logf("%s used %d queries", item.name, counter.Count())
			if got := counter.Count(); got > item.budget {
				t.Errorf("%s used %d queries, budget %d", item.name, got, item.budget)
			}
		})
	}
}

func TestMaterialOrdersIndexQueryBudget(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()
	ctx := context.Background()

	var userID, supplierID, projectID, materialID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID); err != nil {
		t.Skip("no users")
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM suppliers ORDER BY id LIMIT 1`).Scan(&supplierID); err != nil {
		t.Skip("no suppliers")
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM projects ORDER BY id LIMIT 1`).Scan(&projectID); err != nil {
		t.Skip("no projects")
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM materials ORDER BY id LIMIT 1`).Scan(&materialID); err != nil {
		t.Skip("no materials")
	}

	orderIDs := make([]int64, 0, 25)
	for index := 0; index < 25; index++ {
		var orderID int64
		if err := pool.QueryRow(ctx, `
			INSERT INTO material_orders
			    (user_id, supplier_id, project_id, status, total_price, shipping_cost,
			     whatsapp_order_id, created_at, updated_at)
			VALUES ($1, $2, $3, 'paid', 100000, 0, $4, now(), now())
			RETURNING id`,
			userID, supplierID, projectID, fmt.Sprintf("BATCHTEST-%d-%d", time.Now().UnixNano(), index),
		).Scan(&orderID); err != nil {
			t.Fatalf("insert order: %v", err)
		}
		orderIDs = append(orderIDs, orderID)
		if _, err := pool.Exec(ctx, `INSERT INTO material_order_items
			(order_id, material_id, quantity, price_at_order, created_at, updated_at)
			VALUES ($1, $2, 1, 100000, now(), now())`, orderID, materialID); err != nil {
			t.Fatalf("insert item: %v", err)
		}
		if index%2 == 0 {
			if _, err := pool.Exec(ctx, `INSERT INTO material_order_reviews
				(user_id, supplier_id, order_id, rating, comment, created_at, updated_at)
				VALUES ($1, $2, $3, 5, 'BATCHTEST review', now(), now())`,
				userID, supplierID, orderID); err != nil {
				t.Fatalf("insert review: %v", err)
			}
		}
	}
	defer pool.Exec(ctx, `DELETE FROM material_orders WHERE id = ANY($1)`, orderIDs)

	byName, found, err := materialOrderRow(ctx, pool, orderIDs[0])
	if err != nil || !found {
		t.Fatalf("single order: found=%v err=%v", found, err)
	}
	single := materialOrderObject(byName)
	if err := materialOrderRelations(ctx, pool, single, byName,
		[]string{"supplier", "user", "project", "items", "review", "deliveryJob"}); err != nil {
		t.Fatalf("single relations: %v", err)
	}
	bundle, err := buildMaterialOrderBundle(ctx, pool, []map[string]any{byName})
	if err != nil {
		t.Fatalf("bundle: %v", err)
	}
	batched := materialOrderObject(byName)
	bundle.relations(batched, byName,
		[]string{"supplier", "user", "project", "items", "review", "deliveryJob"})
	if got, want := marshalText(t, batched), marshalText(t, single); got != want {
		t.Errorf("batched order differs\n got: %s\nwant: %s", got, want)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/material-orders", nil)
	request = request.WithContext(withCaller(request.Context(), roadmapCaller{id: userID}))
	recorder := httptest.NewRecorder()
	counter.Reset()
	MaterialOrdersIndexHandler(pool)(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	t.Logf("material orders used %d queries for 25+ rows", counter.Count())
	if got := counter.Count(); got > 12 {
		t.Errorf("material orders used %d queries, budget 12", got)
	}

	var body struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Data) < 25 {
		t.Errorf("response has %d orders, want at least 25", len(body.Data))
	}
}

func TestRetentionSweepQueryBudget(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()
	ctx := context.Background()

	var userID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID); err != nil {
		t.Skip("no users")
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO projects (user_id, title, budget, status, warranty_end_at, created_at, updated_at)
		SELECT $1, 'BATCHTEST-RET-' || g, 1000000, 'completed',
		       now() - interval '1 day', now(), now()
		  FROM generate_series(1, 12) AS g
	`, userID); err != nil {
		t.Fatalf("seed projects: %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM projects WHERE title LIKE 'BATCHTEST-RET-%'`)

	if _, err := pool.Exec(ctx, `
		INSERT INTO project_payment_termins
		    (project_id, label, amount, retention_amount, net_amount, status, created_at, updated_at)
		SELECT id, 'Retention', 1000000, 100000, 900000, 'paid', now(), now()
		  FROM projects WHERE title LIKE 'BATCHTEST-RET-%'
	`); err != nil {
		t.Fatalf("seed termins: %v", err)
	}

	var blockedProject, disputedProject int64
	if err := pool.QueryRow(ctx, `SELECT id FROM projects WHERE title = 'BATCHTEST-RET-1'`).Scan(&blockedProject); err != nil {
		t.Fatalf("blocked fixture: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM projects WHERE title = 'BATCHTEST-RET-2'`).Scan(&disputedProject); err != nil {
		t.Fatalf("dispute fixture: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_warranty_claims
		(project_id, reporter_id, title, description, status, created_at, updated_at)
		VALUES ($1, $2, 'BATCHTEST claim', 'claim', 'open', now(), now())`,
		blockedProject, userID); err != nil {
		t.Fatalf("seed claim: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO project_disputes
		(project_id, opened_by, category, title, description, status, created_at, updated_at)
		VALUES ($1, $2, 'other', 'BATCHTEST dispute', 'dispute', 'open', now(), now())`,
		disputedProject, userID); err != nil {
		t.Fatalf("seed dispute: %v", err)
	}

	counter.Reset()
	result, err := ReleaseExpiredRetentions(ctx, pool, nil, true, nil)
	if err != nil {
		t.Fatalf("retention sweep: %v", err)
	}
	t.Logf("retention sweep used %d queries for %d projects", counter.Count(), result.Scanned)
	if got := counter.Count(); got > 8 {
		t.Errorf("retention sweep used %d queries, budget 8", got)
	}
	if result.Scanned < 12 {
		t.Errorf("scanned = %d, want at least 12", result.Scanned)
	}
	if result.SkippedBlocked < 1 {
		t.Errorf("skipped blocked = %d, want at least 1", result.SkippedBlocked)
	}
	if result.SkippedDispute < 1 {
		t.Errorf("skipped dispute = %d, want at least 1", result.SkippedDispute)
	}
	if result.ReleasedStages < 10 {
		t.Errorf("released stages = %d, want at least 10", result.ReleasedStages)
	}
}

func TestProjectBudgetSummaryIsOneQuery(t *testing.T) {
	pool, counter := tracedPool(t)
	defer pool.Close()
	ctx := context.Background()

	var projectID int64
	var budget string
	if err := pool.QueryRow(ctx, `SELECT id, budget::text FROM projects WHERE budget > 0 ORDER BY id LIMIT 1`).Scan(&projectID, &budget); err != nil {
		t.Skip("no seeded project")
	}
	counter.Reset()

	summary, err := projectBudgetSummary(ctx, pool, projectID, budget)
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	object, ok := summary.(*jsonwire.Object)
	if !ok {
		t.Fatalf("summary type %T", summary)
	}
	if _, ok := object.Get("total_cents"); !ok {
		t.Error("summary is missing total_cents")
	}
	if got := counter.Count(); got != 1 {
		t.Errorf("summary used %d queries, want 1", got)
	}
}
