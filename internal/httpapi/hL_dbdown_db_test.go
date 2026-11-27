package httpapi

// hL DB-down pins: every owned handler answers 500 (or a documented twin)
// when PostgreSQL is unreachable, proving the error branches the happy
// paths never touch.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHLHandlersDBDown(t *testing.T) {
	closed := hLClosedPool(t)
	admin := roadmapCaller{id: 1030001, role: "admin", admin: true}
	owner := roadmapCaller{id: 1030001, role: "user"}
	project := map[string]string{"project": "1032001"}

	rec := func(h http.HandlerFunc, method, target, body string, caller *roadmapCaller, pathVals map[string]string) *httptest.ResponseRecorder {
		return hLCall(t, h, method, target, body, caller, pathVals)
	}

	cases := []struct {
		name   string
		rec    *httptest.ResponseRecorder
		code   int
		substr string
	}{
		{"activity", rec(ActivityHandler(closed), http.MethodGet, "/x", "", &owner, project), 500, "Server Error"},
		{"comments-index", rec(ProjectCommentsIndexHandler(closed), http.MethodGet, "/x", "", &owner, project), 500, "Server Error"},
		{"comments-store", rec(ProjectCommentsStoreHandler(closed), http.MethodPost, "/x", `{"message":"hL"}`, &owner, project), 500, "Server Error"},
		{"comments-update", rec(UpdateCommentHandler(closed), http.MethodPut, "/x", `{"message":"hL"}`, &owner, map[string]string{"project": "1032001", "comment": "7"}), 500, "Server Error"},
		{"comments-delete", rec(DestroyCommentHandler(closed), http.MethodDelete, "/x", "", &owner, map[string]string{"project": "1032001", "comment": "7"}), 500, "Server Error"},
		{"reports-index", rec(ProjectReportsIndexHandler(closed), http.MethodGet, "/x", "", &owner, project), 500, "Server Error"},
		{"reports-store", rec(StoreReportHandler(closed), http.MethodPost, "/x", `{"summary":"hL","progress_percentage":10,"budget_health":"on_track"}`, &owner, project), 500, "Server Error"},
		{"reports-update", rec(UpdateReportHandler(closed), http.MethodPut, "/x", `{"summary":"hL"}`, &owner, map[string]string{"project": "1032001", "report": "9"}), 500, "Server Error"},
		{"reports-delete", rec(DestroyReportHandler(closed), http.MethodDelete, "/x", "", &owner, map[string]string{"project": "1032001", "report": "9"}), 500, "Server Error"},
		{"approve-brief", rec(ApproveConstructionBriefHandler(closed), http.MethodPost, "/x", "", &owner, project), 500, "Server Error"},
		{"revise-brief", rec(ReviseConstructionBriefHandler(closed), http.MethodPost, "/x", `{"notes":"hL"}`, &owner, project), 500, "Server Error"},
		{"lock-brief", rec(LockPhaseBriefHandler(closed), http.MethodPost, "/x", `{"phase":"design"}`, &owner, project), 500, "Server Error"},
		{"kickoff", rec(IssueKickoffHandler(closed), http.MethodPost, "/x", `{"role":"arsitek"}`, &owner, project), 500, "Server Error"},
		{"review", rec(ReviewProjectHandler(closed), http.MethodPost, "/x", `{"rating":5}`, &owner, project), 500, "Server Error"},
		{"conv-index", rec(ConversationsIndexHandler(closed), http.MethodGet, "/x", "", &owner, nil), 500, "Server Error"},
		{"conv-show", rec(ShowConversationHandler(closed), http.MethodGet, "/x", "", &owner, map[string]string{"conversation": "5"}), 500, "Server Error"},
		{"conv-send", rec(SendMessageHandler(closed), http.MethodPost, "/x", `{"content":"hL"}`, &owner, map[string]string{"conversation": "5"}), 500, "Server Error"},
		{"store-project", rec(StoreProjectHandler(closed), http.MethodPost, "/x", `{"title":"hL","description":"hL","budget":1000,"lokasi":"hL","project_category":"new_build","deadline":"2027-01-01"}`, &owner, nil), 500, "Server Error"},
		{"directory", func() *httptest.ResponseRecorder {
			req := httptest.NewRequest(http.MethodGet, "/api/arsitek", nil)
			req = req.WithContext(withCaller(req.Context(), owner))
			recorder := httptest.NewRecorder()
			DirectoryHandler(closed, "arsiteks", "/api/arsitek", false)(recorder, req)
			return recorder
		}(), 500, "Server Error"},
		{"subscribe", rec(PushSubscribeHandler(closed), http.MethodPost, "/x", `{"endpoint":"https://updates.push.services.mozilla.com/hL-down","keys":{"p256dh":"a","auth":"b"}}`, &owner, nil), 500, "Server Error"},
		{"unsubscribe", rec(PushUnsubscribeHandler(closed), http.MethodPost, "/x", `{"endpoint":"https://updates.push.services.mozilla.com/hL-down"}`, &owner, nil), 500, "Server Error"},
		{"admin-users", rec(AdminUsersHandler(closed), http.MethodGet, "/x", "", &admin, nil), 500, "Server Error"},
		{"admin-projects", rec(AdminProjectsHandler(closed), http.MethodGet, "/x", "", &admin, nil), 500, "Server Error"},
		{"admin-houses", rec(AdminHousesHandler(closed), http.MethodGet, "/x", "", &admin, nil), 500, "Server Error"},
		{"admin-professionals", rec(AdminProfessionalsIndexHandler(closed), http.MethodGet, "/x", "", &admin, nil), 500, "Server Error"},
		{"admin-history", rec(AdminProfessionalsHistoryHandler(closed), http.MethodGet, "/x", "", &admin, nil), 500, "Server Error"},
		{"admin-export", rec(AdminProjectsExportHandler(closed), http.MethodGet, "/x", "", &admin, nil), 500, "Server Error"},
		{"admin-suspend-house", rec(AdminSuspendHouseHandler(closed), http.MethodPatch, "/x", "", &admin, map[string]string{"id": "1"}), 500, "Server Error"},
		{"admin-prof-status", rec(AdminUpdateProfessionalStatusHandler(closed), http.MethodPatch, "/x", `{"status":"verified"}`, &admin, map[string]string{"type": "arsitek", "id": "1"}), 500, "Server Error"},
		{"admin-suspend-user", rec(AdminSuspendUserPGHandler(closed), http.MethodPatch, "/x", "", &admin, map[string]string{"user": "1030005"}), 404, "No query results for model"},
		{"admin-user-role", rec(AdminUpdateUserRolePGHandler(closed), http.MethodPatch, "/x", `{"role_type":"user"}`, &admin, map[string]string{"user": "1030005"}), 500, "Server Error"},
		{"admin-terminate", rec(AdminForceTerminateHandler(closed), http.MethodPost, "/x", "", &admin, map[string]string{"project": "1032001"}), 500, "Server Error"},
	}

	for _, c := range cases {
		if c.rec.Code != c.code {
			t.Fatalf("%s = %d, want %d (%s)", c.name, c.rec.Code, c.code, c.rec.Body.String())
		}
		if !strings.Contains(c.rec.Body.String(), c.substr) {
			t.Fatalf("%s body missing %q: %s", c.name, c.substr, c.rec.Body.String())
		}
	}

	// StoreConversation fails closed at validation: an existence check
	// cannot run, so the id reads invalid (422), never 500.
	recStore := rec(StoreConversationHandler(closed), http.MethodPost, "/x", `{"user_id":1030005}`, &owner, nil)
	if recStore.Code != http.StatusUnprocessableEntity {
		t.Fatalf("store conversation closed = %d, want 422", recStore.Code)
	}
	if !strings.Contains(recStore.Body.String(), "The selected user id is invalid.") {
		t.Fatalf("store closed body = %s", recStore.Body.String())
	}

	// Push public key: 501 without VAPID, the key with it (no pool at all).
	t.Setenv("VAPID_PUBLIC_KEY", "")
	rec501 := httptest.NewRecorder()
	PushPublicKeyHandler()(rec501, httptest.NewRequest(http.MethodGet, "/x", nil))
	if rec501.Code != http.StatusNotImplemented || !strings.Contains(rec501.Body.String(), "Web push is not configured") {
		t.Fatalf("pubkey missing = %d %s", rec501.Code, rec501.Body.String())
	}
	t.Setenv("VAPID_PUBLIC_KEY", "hL-pub")
	rec200 := httptest.NewRecorder()
	PushPublicKeyHandler()(rec200, httptest.NewRequest(http.MethodGet, "/x", nil))
	if rec200.Code != http.StatusOK || !strings.Contains(rec200.Body.String(), "hL-pub") {
		t.Fatalf("pubkey = %d %s", rec200.Code, rec200.Body.String())
	}
}
