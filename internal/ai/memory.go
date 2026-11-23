package ai

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/adk/v2/memory"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

// Long-term memory.
//
// The transcript in ai_chat_messages is the short-term record: one
// conversation, replayed into the agent on each turn. This file implements the
// other half: user-owned memory that survives a conversation and a restart.
//
// PostgreSQL is the store, not an in-process cache. The assistant is
// stateless per turn (service.go), so memory has to be readable by any
// gateway instance and cannot disappear when a process recycles. Full-text
// search uses the `simple` configuration because the product is bilingual;
// stemming with an Indonesian or English dictionary would silently miss
// matches in the other language.
//
// Every query is scoped by user_id. There is no method that searches across
// users, and the API handlers use the authenticated caller as that id.

// MemoryItem is one remembered row, shaped for the API.
type MemoryItem struct {
	ID        int64     `json:"id"`
	Kind      string    `json:"kind"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

const (
	// memorySearchLimit bounds what one preload can inject into a prompt.
	memorySearchLimit = 6
	// memoryEntryChars bounds one entry; the model needs the fact, not a
	// pasted essay.
	memoryEntryChars = 1200
	// memoryNoteChars bounds an explicit "remember this" note.
	memoryNoteChars = 2000
)

// pgMemoryService implements ADK's memory.Service over PostgreSQL.
type pgMemoryService struct {
	pool *pgxpool.Pool
}

// NewMemoryService returns the ADK memory service used by the runner.
func NewMemoryService(pool *pgxpool.Pool) memory.Service {
	return &pgMemoryService{pool: pool}
}

// AddSessionToMemory implements memory.Service. The chat handler normally
// syncs stored messages directly (SyncSession); this method keeps the ADK
// contract honest for any caller that has a live session and lets a future
// job re-ingest a session from the session service.
func (s *pgMemoryService) AddSessionToMemory(ctx context.Context, sess session.Session) error {
	if sess == nil {
		return nil
	}
	userID, ok := parseMemoryUserID(sess.UserID())
	if !ok {
		return nil
	}
	return SyncSession(ctx, s.pool, userID, sess.ID())
}

// SearchMemory implements memory.Service. An empty query returns the newest
// entries; a query ranks full-text matches first and falls back to a
// substring match for short or punctuation-heavy input that produces an empty
// tsquery.
func (s *pgMemoryService) SearchMemory(ctx context.Context, req *memory.SearchRequest) (*memory.SearchResponse, error) {
	out := &memory.SearchResponse{Memories: []memory.Entry{}}
	if req == nil {
		return out, nil
	}
	userID, ok := parseMemoryUserID(req.UserID)
	if !ok {
		return out, nil
	}
	enabled, err := MemoryEnabled(ctx, s.pool, userID)
	if err != nil || !enabled {
		return out, err
	}

	query := strings.TrimSpace(req.Query)
	var rows pgx.Rows
	if query == "" {
		rows, err = s.pool.Query(ctx, `
			SELECT id::text, role, content, created_at
			  FROM ai_memories
			 WHERE user_id = $1
			 ORDER BY created_at DESC, id DESC
			 LIMIT $2
		`, userID, memorySearchLimit)
	} else {
		rows, err = s.pool.Query(ctx, `
			WITH q AS (
				SELECT to_tsquery(
					'simple'::regconfig,
					string_agg(quote_literal(lexeme), ' | ')
				) AS tsq
				  FROM unnest(tsvector_to_array(to_tsvector('simple'::regconfig, $2))) AS lexeme
			)
			SELECT m.id::text, m.role, m.content, m.created_at
			  FROM ai_memories m
			  LEFT JOIN q ON true
			 WHERE m.user_id = $1
			   AND (
			        q.tsq IS NULL
			        OR m.content_tsv @@ q.tsq
			        OR m.content ILIKE '%' || $2 || '%'
			   )
			 ORDER BY
			        CASE WHEN q.tsq IS NULL THEN 0 ELSE ts_rank_cd(m.content_tsv, q.tsq) END DESC,
			        m.created_at DESC, m.id DESC
			 LIMIT $3
		`, userID, query, memorySearchLimit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	total := 0
	for rows.Next() {
		var id, role, content string
		var created time.Time
		if err := rows.Scan(&id, &role, &content, &created); err != nil {
			return nil, err
		}
		content = truncateRunes(content, memoryEntryChars)
		if total+len(content) > 6000 {
			break
		}
		total += len(content)
		genaiRole := genai.Role(genai.RoleUser)
		if role == "assistant" {
			genaiRole = genai.Role(genai.RoleModel)
		}
		out.Memories = append(out.Memories, memory.Entry{
			ID:        id,
			Author:    role,
			Timestamp: created,
			Content:   genai.NewContentFromText(content, genaiRole),
		})
	}
	return out, rows.Err()
}

// MemoryEnabled reports whether the user has long-term memory on. A missing
// settings row means on: memory is a product feature, and the user can turn
// it off or clear it from the assistant panel.
func MemoryEnabled(ctx context.Context, pool *pgxpool.Pool, userID int64) (bool, error) {
	var enabled bool
	err := pool.QueryRow(ctx, `
		SELECT COALESCE((SELECT enabled FROM ai_memory_settings WHERE user_id = $1), true)
	`, userID).Scan(&enabled)
	return enabled, err
}

// SetMemoryEnabled turns long-term memory on or off for one user.
func SetMemoryEnabled(ctx context.Context, pool *pgxpool.Pool, userID int64, enabled bool) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO ai_memory_settings (user_id, enabled, updated_at)
		VALUES ($1, $2, now())
		ON CONFLICT (user_id) DO UPDATE
		   SET enabled = EXCLUDED.enabled, updated_at = now()
	`, userID, enabled)
	return err
}

// SyncSession copies any stored chat messages that are not yet memory rows.
// The partial unique index on (session_id, message_id) makes this idempotent,
// so a retried request or a reconnected stream cannot duplicate context.
func SyncSession(ctx context.Context, pool *pgxpool.Pool, userID int64, sessionID string) error {
	enabled, err := MemoryEnabled(ctx, pool, userID)
	if err != nil || !enabled {
		return err
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO ai_memories (user_id, session_id, message_id, kind, role, content)
		SELECT s.user_id, m.session_id, m.id, 'message', m.role,
		       left(m.content, $3)
		  FROM ai_chat_messages m
		  JOIN ai_chat_sessions s ON s.id = m.session_id
		  LEFT JOIN ai_memories mem ON mem.message_id = m.id
		 WHERE m.session_id = $1
		   AND s.user_id = $2
		   AND mem.id IS NULL
		   AND m.role IN ('user', 'assistant')
		   AND char_length(m.content) > 0
		ON CONFLICT (session_id, message_id) WHERE message_id IS NOT NULL DO NOTHING
	`, sessionID, userID, memoryEntryChars)
	return err
}

// Remember stores an explicit note. It is the only write the assistant can
// perform, it is scoped to the caller, and it never touches project data.
func Remember(ctx context.Context, pool *pgxpool.Pool, userID int64, content string) (int64, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return 0, errors.New("memory note is empty")
	}
	content = truncateRunes(content, memoryNoteChars)
	var id int64
	err := pool.QueryRow(ctx, `
		INSERT INTO ai_memories (user_id, kind, role, content)
		VALUES ($1, 'note', 'note', $2)
		RETURNING id
	`, userID, content).Scan(&id)
	return id, err
}

// ListMemories returns the user's newest memory rows for the settings panel.
func ListMemories(ctx context.Context, pool *pgxpool.Pool, userID int64, limit int) ([]MemoryItem, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := pool.Query(ctx, `
		SELECT id, kind, role, content, created_at
		  FROM ai_memories
		 WHERE user_id = $1
		 ORDER BY created_at DESC, id DESC
		 LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MemoryItem{}
	for rows.Next() {
		var item MemoryItem
		if err := rows.Scan(&item.ID, &item.Kind, &item.Role, &item.Content, &item.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// CountMemories returns the number of rows the user owns.
func CountMemories(ctx context.Context, pool *pgxpool.Pool, userID int64) (int, error) {
	var count int
	err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM ai_memories WHERE user_id = $1`, userID).Scan(&count)
	return count, err
}

// ClearMemories deletes every memory row the user owns.
func ClearMemories(ctx context.Context, pool *pgxpool.Pool, userID int64) error {
	_, err := pool.Exec(ctx, `DELETE FROM ai_memories WHERE user_id = $1`, userID)
	return err
}

// DeleteMemory deletes one row after proving it belongs to the caller.
func DeleteMemory(ctx context.Context, pool *pgxpool.Pool, userID, id int64) (bool, error) {
	result, err := pool.Exec(ctx, `DELETE FROM ai_memories WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() > 0, nil
}

// parseMemoryUserID turns the ADK user id ("user-42") back into the numeric
// key. A malformed id yields no memory rather than a query for user 0.
func parseMemoryUserID(raw string) (int64, bool) {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "user-") {
		return 0, false
	}
	var id int64
	if _, err := fmt.Sscanf(raw, "user-%d", &id); err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}
