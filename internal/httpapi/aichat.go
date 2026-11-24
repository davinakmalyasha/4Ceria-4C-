package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/ai"
	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE AI ASSISTANT SURFACE.
//
// Ceria, the in-product chatbot, served by GO ADK v2 over a DeepSeek
// OpenAI-compatible model:
//
//	GET    /api/ai/status             assistant availability + caller quota
//	GET    /api/ai/sessions           list my conversations
//	POST   /api/ai/sessions           open a conversation {title?}
//	GET    /api/ai/sessions/{session} read one conversation (history)
//	PUT    /api/ai/sessions/{session} rename {title}
//	DELETE /api/ai/sessions/{session} delete (messages cascade)
//	POST   /api/ai/chat               one turn, JSON answer
//	POST   /api/ai/chat/stream        one turn, SSE answer
//
// All routes are authenticated. The two chat writes carry `throttle:30,1`
// in the manifest; the handler adds a per-user quota (30/min, 100/day UTC)
// computed from the messages table. Without DEEPSEEK_API_KEY the chat
// endpoints answer 503 and everything else keeps working.

// aiConfig is the process model wiring, read once per request so tests can
// set the environment per case.
func aiConfig() ai.Config { return ai.LoadConfig() }

// AIStatusHandler serves `GET /api/ai/status`.
func AIStatusHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, _ := CallerFrom(r.Context())
		cfg := aiConfig()
		var quota string
		usedToday := 0
		memoryEnabled := cfg.Memory
		memoryItems := 0
		if caller != nil {
			// Quota, memory switch and memory count in one round trip.
			if snapshot, err := ai.LoadStatusSnapshot(r.Context(), pool, caller.UserID()); err == nil {
				quota = snapshot.Usage.Label()
				usedToday = snapshot.Usage.Day
				memoryEnabled = cfg.Memory && snapshot.MemoryEnabled
				memoryItems = snapshot.MemoryItems
			} else {
				slog.Error("ai: status snapshot", "error", err)
			}
		}
		body := jsonwire.NewObject()
		body.Set("enabled", cfg.Enabled())
		body.Set("model", cfg.Model)
		body.Set("quota", quota)
		body.Set("used_today", usedToday)
		body.Set("daily_quota", int64(ai.DailyQuota))
		body.Set("minute_quota", int64(ai.MinuteQuota))
		body.Set("memory_enabled", memoryEnabled)
		body.Set("memory_items", memoryItems)
		body.Set("specialists", cfg.Specialists)
		body.Set("skills", true)
		writeJSON(w, http.StatusOK, body)
	}
}

// AISessionsHandler serves `GET /api/ai/sessions` and `POST /api/ai/sessions`.
func AISessionsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		switch r.Method {
		case http.MethodGet:
			sessions, err := ai.ListSessions(r.Context(), pool, caller.UserID(), 50)
			if err != nil {
				slog.Error("ai: list sessions", "error", err)
				serverError(w)
				return
			}
			items := make([]any, 0, len(sessions))
			for _, s := range sessions {
				items = append(items, aiSessionObject(s))
			}
			body := jsonwire.NewObject()
			body.Set("data", items)
			writeJSON(w, http.StatusOK, body)
		case http.MethodPost:
			var req struct {
				Title string `json:"title"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			s, err := ai.CreateSession(r.Context(), pool, caller.UserID(), strings.TrimSpace(req.Title))
			if err != nil {
				slog.Error("ai: create session", "error", err)
				serverError(w)
				return
			}
			body := jsonwire.NewObject()
			body.Set("data", aiSessionObject(s))
			writeJSON(w, http.StatusCreated, body)
		default:
			message(w, http.StatusMethodNotAllowed, "Method not allowed.")
		}
	}
}

// AISessionHandler serves one conversation: GET history, PUT rename, DELETE.
func AISessionHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		id := r.PathValue("session")
		if id == "" {
			id = lastPathSegment(r.URL.Path)
		}
		if !isUUIDString(id) {
			message(w, http.StatusNotFound, "Chat not found.")
			return
		}
		switch r.Method {
		case http.MethodGet:
			s, err := ai.GetSession(r.Context(), pool, caller.UserID(), id)
			if err != nil {
				if isNoRows(err) {
					message(w, http.StatusNotFound, "Chat not found.")
					return
				}
				slog.Error("ai: get session", "error", err)
				serverError(w)
				return
			}
			msgs, err := ai.ListMessages(r.Context(), pool, caller.UserID(), id, 200)
			if err != nil {
				slog.Error("ai: list messages", "error", err)
				serverError(w)
				return
			}
			items := make([]any, 0, len(msgs))
			for _, m := range msgs {
				items = append(items, aiMessageObject(m))
			}
			body := jsonwire.NewObject()
			body.Set("data", aiSessionObject(s))
			body.Set("messages", items)
			writeJSON(w, http.StatusOK, body)
		case http.MethodPut, http.MethodPatch:
			var req struct {
				Title string `json:"title"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Title) == "" {
				validationError(w, "The given data was invalid.", map[string][]string{
					"title": {"The title field is required."},
				})
				return
			}
			if err := ai.RenameSession(r.Context(), pool, caller.UserID(), id, req.Title); err != nil {
				if err == pgx.ErrNoRows {
					message(w, http.StatusNotFound, "Chat not found.")
					return
				}
				slog.Error("ai: rename session", "error", err)
				serverError(w)
				return
			}
			s, err := ai.GetSession(r.Context(), pool, caller.UserID(), id)
			if err != nil {
				slog.Error("ai: reread session", "error", err)
				serverError(w)
				return
			}
			body := jsonwire.NewObject()
			body.Set("data", aiSessionObject(s))
			writeJSON(w, http.StatusOK, body)
		case http.MethodDelete:
			if err := ai.DeleteSession(r.Context(), pool, caller.UserID(), id); err != nil {
				if err == pgx.ErrNoRows {
					message(w, http.StatusNotFound, "Chat not found.")
					return
				}
				slog.Error("ai: delete session", "error", err)
				serverError(w)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			message(w, http.StatusMethodNotAllowed, "Method not allowed.")
		}
	}
}

// aiChatRequest is the body of both chat endpoints.
type aiChatRequest struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

// AIChatHandler serves `POST /api/ai/chat`: one turn, JSON answer.
func AIChatHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		var req aiChatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			validationError(w, "The given data was invalid.", map[string][]string{
				"message": {"The message field is required."},
			})
			return
		}
		reply, sessionID, refused, status, fail := aiTurn(r, pool, caller, req)
		if fail != nil {
			writeJSON(w, status, fail)
			return
		}
		body := jsonwire.NewObject()
		body.Set("session_id", sessionID)
		body.Set("reply", reply)
		body.Set("refused", refused)
		writeJSON(w, http.StatusOK, body)
	}
}

// AIStreamHandler serves `POST /api/ai/chat/stream`: one turn, SSE answer.
//
// Events: `data: {"session_id":...}` first, then `data: {"delta":"..."}`
// chunks, then `data: {"done":true,"refused":false}`. Errors arrive as
// `data: {"error":"..."}` with a 200 stream (headers are already sent) or
// as a JSON error when the turn never starts.
func AIStreamHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		var req aiChatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			validationError(w, "The given data was invalid.", map[string][]string{
				"message": {"The message field is required."},
			})
			return
		}
		prepared, fail, status := aiPrepareTurn(r, pool, caller, req)
		if fail != nil {
			writeJSON(w, status, fail)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		// The server's WriteTimeout is 30s, but an AI turn may legitimately
		// run for 120s. Extend this one response; the compression middleware
		// implements Unwrap so ResponseController reaches the real writer.
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(3 * time.Minute))
		flusher, _ := w.(http.Flusher)

		writeSSE(w, map[string]any{"session_id": prepared.sessionID})
		if flusher != nil {
			flusher.Flush()
		}

		// Injection refusals and disabled-assistant answers stream as one
		// chunk: the client renders them identically.
		if prepared.earlyReply != "" {
			writeSSE(w, map[string]any{"delta": prepared.earlyReply})
			storeCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
			defer cancel()
			if _, err := ai.AppendMessage(storeCtx, pool, caller.UserID(), prepared.sessionID, "assistant", prepared.earlyReply); err != nil {
				slog.Error("ai: store early reply", "error", err)
			}
			writeSSE(w, map[string]any{"done": true, "refused": prepared.earlyRefused})
			return
		}

		sentError := false
		result := ai.Stream(r.Context(), prepared.cfg, ai.TurnInput{
			Pool:          pool,
			UserID:        caller.UserID(),
			IsAdmin:       caller.IsAdmin(),
			SessionID:     prepared.sessionID,
			Message:       prepared.message,
			History:       prepared.history,
			MemoryEnabled: prepared.memoryEnabled,
		}, func(c ai.StreamChunk) bool {
			switch {
			case c.Error != "":
				sentError = true
				writeSSE(w, map[string]any{"error": c.Error})
			case c.Replace != "":
				writeSSE(w, map[string]any{"replace": c.Replace})
			case c.Tool != "":
				writeSSE(w, map[string]any{"tool": c.Tool, "status": c.ToolStatus})
			case c.Text != "":
				writeSSE(w, map[string]any{"delta": c.Text})
			}
			if flusher != nil {
				flusher.Flush()
			}
			return r.Context().Err() == nil
		})

		// Persist outside the request context: a client that closes the tab
		// after seeing the answer must not lose the transcript or its memory.
		storeCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 8*time.Second)
		defer cancel()
		if result.Text != "" {
			if _, err := ai.AppendMessage(storeCtx, pool, caller.UserID(), prepared.sessionID, "assistant", result.Text); err != nil {
				slog.Error("ai: store stream reply", "error", err)
			}
			if err := ai.SyncSessionIfEnabled(storeCtx, pool, caller.UserID(), prepared.sessionID, prepared.memoryEnabled); err != nil {
				slog.Error("ai: sync memory", "error", err)
			}
		}
		if result.Text == "" && !sentError {
			writeSSE(w, map[string]any{"error": "The assistant hit a snag. Please try again."})
		}
		writeSSE(w, map[string]any{"done": true, "refused": false, "tools": result.Tools})
	}
}

// ---------------------------------------------------------------------------
// Shared turn preparation
// ---------------------------------------------------------------------------

type aiPrepared struct {
	cfg           ai.Config
	sessionID     string
	message       string
	history       []ai.StoredMessage
	memoryEnabled bool
	earlyReply    string
	earlyRefused  bool
}

func aiPrepareTurn(r *http.Request, pool *pgxpool.Pool, caller Caller, req aiChatRequest) (*aiPrepared, any, int) {
	cleaned, ok, refusal := ai.ValidateMessage(req.Message)
	if !ok && cleaned == "" {
		return nil, validationObject("The given data was invalid.", map[string][]string{
			"message": {refusal},
		}), http.StatusUnprocessableEntity
	}
	cfg := aiConfig()

	// Resolve or open the session BEFORE spending quota on a refusal: the
	// client needs the session id to keep the transcript together.
	sessionID := strings.TrimSpace(req.SessionID)
	if sessionID == "" {
		s, err := ai.CreateSession(r.Context(), pool, caller.UserID(), ai.DeriveTitle(cleaned))
		if err != nil {
			slog.Error("ai: create session", "error", err)
			return nil, serverErrorObject(), http.StatusInternalServerError
		}
		sessionID = s.ID
	} else if !isUUIDString(sessionID) {
		return nil, messageObject("Chat not found."), http.StatusNotFound
	}

	// Ownership, both quota counters and the memory switch in one query.
	state, err := ai.LoadTurnState(r.Context(), pool, caller.UserID(), sessionID)
	if err != nil {
		slog.Error("ai: turn state", "error", err)
		return nil, serverErrorObject(), http.StatusInternalServerError
	}
	if !state.SessionExists {
		return nil, messageObject("Chat not found."), http.StatusNotFound
	}
	if quota := state.Usage.Label(); quota != "ok" {
		return nil, messageObject(ai.QuotaError(quota)), http.StatusTooManyRequests
	}

	if _, err := ai.AppendMessage(r.Context(), pool, caller.UserID(), sessionID, "user", cleaned); err != nil {
		slog.Error("ai: store user message", "error", err)
		return nil, serverErrorObject(), http.StatusInternalServerError
	}

	// Injection attempts never reach the model: fixed refusal, stored as
	// the assistant turn so the transcript stays coherent.
	if !ok {
		return &aiPrepared{cfg: cfg, sessionID: sessionID, earlyReply: refusal, earlyRefused: true}, nil, 0
	}

	if !cfg.Enabled() {
		return &aiPrepared{cfg: cfg, sessionID: sessionID,
			earlyReply:   "The AI assistant isn't configured yet — the operator still needs to set DEEPSEEK_API_KEY. Your message is saved; try again once it's enabled.",
			earlyRefused: true}, nil, 0
	}

	history, err := ai.RecentMessages(r.Context(), pool, caller.UserID(), sessionID, ai.MaxHistoryMessages)
	if err != nil {
		slog.Error("ai: history", "error", err)
		return nil, serverErrorObject(), http.StatusInternalServerError
	}
	// Drop the just-stored user message from the replayed context.
	if n := len(history); n > 0 && history[n-1].Role == "user" && history[n-1].Content == cleaned {
		history = history[:n-1]
	}
	memoryEnabled := cfg.Memory && state.MemoryEnabled
	return &aiPrepared{cfg: cfg, sessionID: sessionID, message: cleaned, history: history, memoryEnabled: memoryEnabled}, nil, 0
}

// aiTurn runs the non-streaming turn end to end.
func aiTurn(r *http.Request, pool *pgxpool.Pool, caller Caller, req aiChatRequest) (string, string, bool, int, any) {
	prepared, fail, status := aiPrepareTurn(r, pool, caller, req)
	if fail != nil {
		return "", "", false, status, fail
	}
	if prepared.earlyReply != "" {
		if _, err := ai.AppendMessage(r.Context(), pool, caller.UserID(), prepared.sessionID, "assistant", prepared.earlyReply); err != nil {
			slog.Error("ai: store refusal", "error", err)
		}
		return prepared.earlyReply, prepared.sessionID, true, 0, nil
	}
	result, err := ai.Chat(r.Context(), prepared.cfg, ai.TurnInput{
		Pool:          pool,
		UserID:        caller.UserID(),
		IsAdmin:       caller.IsAdmin(),
		SessionID:     prepared.sessionID,
		Message:       prepared.message,
		History:       prepared.history,
		MemoryEnabled: prepared.memoryEnabled,
	})
	if err != nil {
		slog.Error("ai: chat", "error", err)
		if strings.Contains(err.Error(), "assistant disabled") {
			return "", prepared.sessionID, false, http.StatusServiceUnavailable, messageObject("The AI assistant isn't configured yet.")
		}
		return "", prepared.sessionID, false, http.StatusBadGateway, messageObject("The assistant hit a snag. Please try again.")
	}
	if _, err := ai.AppendMessage(r.Context(), pool, caller.UserID(), prepared.sessionID, "assistant", result.Text); err != nil {
		slog.Error("ai: store reply", "error", err)
	}
	if err := ai.SyncSessionIfEnabled(r.Context(), pool, caller.UserID(), prepared.sessionID, prepared.memoryEnabled); err != nil {
		slog.Error("ai: sync memory", "error", err)
	}
	return result.Text, prepared.sessionID, false, 0, nil
}

func aiSessionObject(s ai.Session) *jsonwire.Object {
	entry := jsonwire.NewObject()
	entry.Set("id", s.ID)
	entry.Set("title", s.Title)
	entry.Set("created_at", apiTime(s.CreatedAt))
	entry.Set("updated_at", apiTime(s.UpdatedAt))
	return entry
}

func aiMessageObject(m ai.StoredMessage) *jsonwire.Object {
	entry := jsonwire.NewObject()
	entry.Set("id", m.ID)
	entry.Set("role", m.Role)
	entry.Set("content", m.Content)
	entry.Set("created_at", apiTime(m.CreatedAt))
	return entry
}

// messageObject builds the `{"message": ...}` body as a value (for paths
// that must choose the status at the call site).
func messageObject(text string) *jsonwire.Object {
	body := jsonwire.NewObject()
	body.Set("message", text)
	return body
}

// validationObject builds the 422 validation body as a value.
func validationObject(messageText string, errors map[string][]string) *jsonwire.Object {
	body := jsonwire.NewObject()
	body.Set("message", messageText)
	fields := jsonwire.NewObject()
	for _, field := range sortedKeys(errors) {
		list := make([]any, 0, len(errors[field]))
		for _, text := range errors[field] {
			list = append(list, text)
		}
		fields.Set(field, list)
	}
	body.Set("errors", fields)
	return body
}

// serverErrorObject builds the 500 body as a value.
func serverErrorObject() *jsonwire.Object {
	body := jsonwire.NewObject()
	body.Set("message", "Server Error")
	return body
}

func writeSSE(w http.ResponseWriter, payload map[string]any) {
	encoded, err := jsonwire.Marshal(payload)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "data: %s\n\n", encoded)
}

// isUUIDString accepts the canonical 8-4-4-4-12 hexadecimal form. A malformed
// id must be a 404, not a PostgreSQL `22P02` that surfaces as a 500.
func isUUIDString(value string) bool {
	if len(value) != 36 {
		return false
	}
	for i := 0; i < len(value); i++ {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if value[i] != '-' {
				return false
			}
			continue
		}
		ch := value[i]
		if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') && (ch < 'A' || ch > 'F') {
			return false
		}
	}
	return true
}
