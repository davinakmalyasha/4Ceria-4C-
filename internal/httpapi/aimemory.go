package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/ai"
	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
	"github.com/jackc/pgx/v5/pgxpool"
)

// /api/ai/memory — the user's long-term memory, visible and controllable.
//
// Memory is derived from the user's own conversations plus explicit notes.
// Listing it is a privacy feature, not an admin feature: the caller can see
// exactly what the assistant remembers, delete one row, or clear everything.
// The same user id that scopes the chat scopes these queries.

// AIMemoryHandler serves `GET`, `PUT` and `DELETE /api/ai/memory`.
func AIMemoryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		switch r.Method {
		case http.MethodGet:
			enabled, err := ai.MemoryEnabled(r.Context(), pool, caller.UserID())
			if err != nil {
				slog.Error("ai memory: enabled", "error", err)
				serverError(w)
				return
			}
			items, err := ai.ListMemories(r.Context(), pool, caller.UserID(), 50)
			if err != nil {
				slog.Error("ai memory: list", "error", err)
				serverError(w)
				return
			}
			count, err := ai.CountMemories(r.Context(), pool, caller.UserID())
			if err != nil {
				slog.Error("ai memory: count", "error", err)
				serverError(w)
				return
			}
			data := make([]any, 0, len(items))
			for _, item := range items {
				entry := jsonwire.NewObject()
				entry.Set("id", item.ID)
				entry.Set("kind", item.Kind)
				entry.Set("role", item.Role)
				entry.Set("content", item.Content)
				entry.Set("created_at", apiTime(item.CreatedAt))
				data = append(data, entry)
			}
			body := jsonwire.NewObject()
			body.Set("enabled", enabled)
			body.Set("count", count)
			body.Set("data", data)
			writeJSON(w, http.StatusOK, body)

		case http.MethodPut:
			var req struct {
				Enabled *bool `json:"enabled"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Enabled == nil {
				validationError(w, "The given data was invalid.", map[string][]string{
					"enabled": {"The enabled field is required."},
				})
				return
			}
			if err := ai.SetMemoryEnabled(r.Context(), pool, caller.UserID(), *req.Enabled); err != nil {
				slog.Error("ai memory: set enabled", "error", err)
				serverError(w)
				return
			}
			body := jsonwire.NewObject()
			body.Set("enabled", *req.Enabled)
			writeJSON(w, http.StatusOK, body)

		case http.MethodDelete:
			if err := ai.ClearMemories(r.Context(), pool, caller.UserID()); err != nil {
				slog.Error("ai memory: clear", "error", err)
				serverError(w)
				return
			}
			w.WriteHeader(http.StatusNoContent)

		default:
			message(w, http.StatusMethodNotAllowed, "Method not allowed.")
		}
	}
}

// AIMemoryItemHandler serves `DELETE /api/ai/memory/{memory}`.
func AIMemoryItemHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		if r.Method != http.MethodDelete {
			message(w, http.StatusMethodNotAllowed, "Method not allowed.")
			return
		}
		raw := r.PathValue("memory")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || id <= 0 {
			message(w, http.StatusNotFound, "Memory not found.")
			return
		}
		removed, err := ai.DeleteMemory(r.Context(), pool, caller.UserID(), id)
		if err != nil {
			slog.Error("ai memory: delete", "error", err)
			serverError(w)
			return
		}
		if !removed {
			message(w, http.StatusNotFound, "Memory not found.")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
