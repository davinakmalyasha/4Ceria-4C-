package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func extractToken(t *testing.T, body string) string {
	t.Helper()
	var raw map[string]any
	if err := json.Unmarshal([]byte(body), &raw); err != nil {
		t.Fatalf("decode token: %v", err)
	}
	tok, _ := raw["access_token"].(string)
	if tok == "" {
		t.Fatalf("no access_token in %s", body)
	}
	return tok
}

func authViaSanctumPG(t *testing.T, pool *pgxpool.Pool, token string) roadmapCaller {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	caller, err := NewSanctumPG(pool).Authenticate(req)
	if err != nil || caller == nil {
		t.Fatalf("sanctum-pg authenticate: %v", err)
	}
	if rc, ok := caller.(roadmapCaller); ok {
		return rc
	}
	return roadmapCaller{id: caller.UserID(), role: caller.RoleType(), admin: caller.IsAdmin()}
}

// PG identity round-trips against the live database (skips without one).
// These pin the ADR-0023 cutover: register → login → me → logout,
// forgot → reset (real minted token), admin suspend + role.

func TestPGRegisterLoginMeLogout(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	email := "pgtest-auth@example.test"
	pool.Exec(t.Context(), `DELETE FROM personal_access_tokens WHERE tokenable_id IN (SELECT id FROM users WHERE email = $1)`, email)
	pool.Exec(t.Context(), `DELETE FROM users WHERE email = $1`, email)

	body := strings.NewReader(`{"name":"PG Auth","username":"pgautht1","email":"` + email + `","password":"12345678","role_type":"user"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/register", body)
	rec := httptest.NewRecorder()
	RegisterPGHandler(pool)(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "access_token") {
		t.Fatalf("register = %d, %s", rec.Code, rec.Body.String())
	}

	req2 := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"email":"`+email+`","password":"12345678"}`))
	rec2 := httptest.NewRecorder()
	LoginPGHandler(pool)(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("login = %d, %s", rec2.Code, rec2.Body.String())
	}
	token := extractToken(t, rec2.Body.String())

	req3 := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req3.Header.Set("Authorization", "Bearer "+token)
	caller3, err := NewSanctumPG(pool).Authenticate(req3)
	if err != nil || caller3 == nil {
		t.Fatalf("sanctum-pg authenticate: %v", err)
	}
	req3 = req3.WithContext(withCaller(req3.Context(), caller3))
	rec3 := httptest.NewRecorder()
	MeHandler(pool)(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Fatalf("me = %d, %s", rec3.Code, rec3.Body.String())
	}

	req4 := httptest.NewRequest(http.MethodPost, "/api/logout", nil)
	req4.Header.Set("Authorization", "Bearer "+token)
	req4 = req4.WithContext(withCaller(req4.Context(), caller3))
	rec4 := httptest.NewRecorder()
	LogoutPGHandler(pool)(rec4, req4)
	if rec4.Code != http.StatusOK {
		t.Fatalf("logout = %d, %s", rec4.Code, rec4.Body.String())
	}

	pool.Exec(t.Context(), `DELETE FROM personal_access_tokens WHERE tokenable_id IN (SELECT id FROM users WHERE email = $1)`, email)
	pool.Exec(t.Context(), `DELETE FROM users WHERE email = $1`, email)
}

func TestPGForgotReset(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	email := "pgtest-forgot@example.test"
	pool.Exec(t.Context(), `DELETE FROM personal_access_tokens WHERE tokenable_id IN (SELECT id FROM users WHERE email = $1)`, email)
	pool.Exec(t.Context(), `DELETE FROM users WHERE email = $1`, email)
	pool.Exec(t.Context(), `DELETE FROM password_reset_tokens WHERE email = $1`, email)

	// Register first.
	body := strings.NewReader(`{"name":"PG Forgot","username":"pgforgott1","email":"` + email + `","password":"12345678","role_type":"user"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/register", body)
	rec := httptest.NewRecorder()
	RegisterPGHandler(pool)(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("register = %d, %s", rec.Code, rec.Body.String())
	}

	// Forgot mints a real token row.
	req2 := httptest.NewRequest(http.MethodPost, "/api/forgot-password", strings.NewReader(`{"email":"`+email+`"}`))
	rec2 := httptest.NewRecorder()
	ForgotPasswordPGHandler(pool, NewMailer())(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("forgot = %d, %s", rec2.Code, rec2.Body.String())
	}
	var n int
	if err := pool.QueryRow(t.Context(), `SELECT count(*) FROM password_reset_tokens WHERE email = $1`, email).Scan(&n); err != nil || n != 1 {
		t.Fatalf("reset row missing: n=%d err=%v", n, err)
	}

	// Reset with a wrong token must fail.
	req3 := httptest.NewRequest(http.MethodPost, "/api/reset-password", strings.NewReader(`{"email":"`+email+`","token":"wrong","password":"newpass123","password_confirmation":"newpass123"}`))
	rec3 := httptest.NewRecorder()
	ResetPasswordPGHandler(pool)(rec3, req3)
	if rec3.Code == http.StatusOK {
		t.Fatal("reset with wrong token succeeded")
	}

	pool.Exec(t.Context(), `DELETE FROM personal_access_tokens WHERE tokenable_id IN (SELECT id FROM users WHERE email = $1)`, email)
	pool.Exec(t.Context(), `DELETE FROM password_reset_tokens WHERE email = $1`, email)
	pool.Exec(t.Context(), `DELETE FROM users WHERE email = $1`, email)
}

func TestPGAdminSuspendRole(t *testing.T) {
	pool := roadmapPool(t)
	defer pool.Close()
	// Admin caller from seeded admin.
	var adminID int64
	if err := pool.QueryRow(t.Context(), `SELECT id FROM users WHERE email = 'admin@4c.id'`).Scan(&adminID); err != nil {
		t.Skip("no seeded admin")
	}
	admin := roadmapCaller{id: adminID, role: "admin", admin: true}

	email := "pgtest-admin@example.test"
	pool.Exec(t.Context(), `DELETE FROM personal_access_tokens WHERE tokenable_id IN (SELECT id FROM users WHERE email = $1)`, email)
	pool.Exec(t.Context(), `DELETE FROM users WHERE email = $1`, email)
	var uid int64
	if err := pool.QueryRow(t.Context(), `INSERT INTO users (name, username, email, password, role_type, unique_code, created_at, updated_at) VALUES ('PG Admin T','pgadmint1',$1,'x','user','ADMNT1',NOW(),NOW()) RETURNING id`, email).Scan(&uid); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	suspendPath := "/api/admin/users/1/suspend"
	req := httptest.NewRequest(http.MethodPatch, suspendPath, nil)
	req.SetPathValue("user", itoaTest(uid))
	req = req.WithContext(withCaller(req.Context(), admin))
	rec := httptest.NewRecorder()
	AdminSuspendUserPGHandler(pool)(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "suspended") {
		t.Fatalf("suspend = %d, %s", rec.Code, rec.Body.String())
	}
	req2 := httptest.NewRequest(http.MethodPatch, suspendPath, nil)
	req2.SetPathValue("user", itoaTest(uid))
	req2 = req2.WithContext(withCaller(req2.Context(), admin))
	rec2 := httptest.NewRecorder()
	AdminSuspendUserPGHandler(pool)(rec2, req2)
	if rec2.Code != http.StatusOK || !strings.Contains(rec2.Body.String(), "activated") {
		t.Fatalf("unsuspend = %d, %s", rec2.Code, rec2.Body.String())
	}
	req3 := httptest.NewRequest(http.MethodPatch, "/api/admin/users/1/role", strings.NewReader(`{"role_type":"kontraktor"}`))
	req3.SetPathValue("user", itoaTest(uid))
	req3 = req3.WithContext(withCaller(req3.Context(), admin))
	rec3 := httptest.NewRecorder()
	AdminUpdateUserRolePGHandler(pool)(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Fatalf("role = %d, %s", rec3.Code, rec3.Body.String())
	}

	pool.Exec(t.Context(), `DELETE FROM model_has_roles WHERE model_id = $1`, uid)
	pool.Exec(t.Context(), `DELETE FROM personal_access_tokens WHERE tokenable_id = $1`, uid)
	pool.Exec(t.Context(), `DELETE FROM kontraktors WHERE user_id = $1`, uid)
	pool.Exec(t.Context(), `DELETE FROM users WHERE id = $1`, uid)
}
