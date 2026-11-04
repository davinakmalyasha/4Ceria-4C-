package ai

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The chat-history store.
//
// Two tables (migration 0027): ai_chat_sessions (one row per conversation,
// owned by a user) and ai_chat_messages (append-only turns). Sessions are
// the unit of listing/deletion; deleting a session cascades to its
// messages. Quotas are computed from the messages table so no extra
// counters can drift.

// Session is one AI conversation.
type Session struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// StoredMessage is one persisted turn.
type StoredMessage struct {
	ID        int64     `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// Quota limits: generous enough for real use, tight enough to bound cost.
const (
	// DailyQuota is the per-user assistant message budget per UTC day.
	DailyQuota = 100
	// MinuteQuota caps bursts (spam / runaway clients).
	MinuteQuota = 30
)

// CreateSession opens a new conversation for the user.
func CreateSession(ctx context.Context, pool *pgxpool.Pool, userID int64, title string) (Session, error) {
	if title == "" {
		title = "New chat"
	}
	if len(title) > 80 {
		title = title[:80]
	}
	var s Session
	err := pool.QueryRow(ctx, `
		INSERT INTO ai_chat_sessions (user_id, title)
		VALUES ($1, $2)
		RETURNING id::text, title, created_at, updated_at
	`, userID, title).Scan(&s.ID, &s.Title, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

// ListSessions returns the user's conversations, newest first.
func ListSessions(ctx context.Context, pool *pgxpool.Pool, userID int64, limit int) ([]Session, error) {
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	rows, err := pool.Query(ctx, `
		SELECT id::text, title, created_at, updated_at
		  FROM ai_chat_sessions
		 WHERE user_id = $1
		 ORDER BY updated_at DESC
		 LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.Title, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// GetSession reads one session after proving ownership.
func GetSession(ctx context.Context, pool *pgxpool.Pool, userID int64, id string) (Session, error) {
	var s Session
	err := pool.QueryRow(ctx, `
		SELECT id::text, title, created_at, updated_at
		  FROM ai_chat_sessions
		 WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(&s.ID, &s.Title, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

// RenameSession changes a session title (ownership-checked).
func RenameSession(ctx context.Context, pool *pgxpool.Pool, userID int64, id, title string) error {
	title = trimTitle(title)
	ct, err := pool.Exec(ctx, `
		UPDATE ai_chat_sessions SET title = $3, updated_at = now()
		 WHERE id = $1 AND user_id = $2
	`, id, userID, title)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// DeleteSession removes a session and (via cascade) its messages.
func DeleteSession(ctx context.Context, pool *pgxpool.Pool, userID int64, id string) error {
	ct, err := pool.Exec(ctx, `DELETE FROM ai_chat_sessions WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// AppendMessage stores one turn and bumps the session clock.
func AppendMessage(ctx context.Context, pool *pgxpool.Pool, userID int64, sessionID, role, content string) (StoredMessage, error) {
	var m StoredMessage
	err := pool.QueryRow(ctx, `
		WITH owned AS (
			SELECT id FROM ai_chat_sessions WHERE id = $1 AND user_id = $2
		), ins AS (
			INSERT INTO ai_chat_messages (session_id, role, content)
			SELECT owned.id, $3, $4 FROM owned
			RETURNING id, role, content, created_at
		)
		UPDATE ai_chat_sessions s SET updated_at = now()
		FROM owned WHERE s.id = owned.id
		RETURNING (SELECT id FROM ins), (SELECT role FROM ins),
		          (SELECT content FROM ins), (SELECT created_at FROM ins)
	`, sessionID, userID, role, content).Scan(&m.ID, &m.Role, &m.Content, &m.CreatedAt)
	return m, err
}

// ListMessages returns a session's turns oldest-first, ownership-checked.
func ListMessages(ctx context.Context, pool *pgxpool.Pool, userID int64, sessionID string, limit int) ([]StoredMessage, error) {
	if limit <= 0 || limit > 200 {
		limit = 200
	}
	rows, err := pool.Query(ctx, `
		SELECT m.id, m.role, m.content, m.created_at
		  FROM ai_chat_messages m
		  JOIN ai_chat_sessions s ON s.id = m.session_id AND s.user_id = $2
		 WHERE m.session_id = $1
		 ORDER BY m.id ASC
		 LIMIT $3
	`, sessionID, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StoredMessage{}
	for rows.Next() {
		var m StoredMessage
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// RecentMessages returns the last n turns for context folding.
func RecentMessages(ctx context.Context, pool *pgxpool.Pool, userID int64, sessionID string, n int) ([]StoredMessage, error) {
	if n <= 0 || n > MaxHistoryMessages {
		n = MaxHistoryMessages
	}
	rows, err := pool.Query(ctx, `
		SELECT m.id, m.role, m.content, m.created_at FROM (
			SELECT m.id, m.role, m.content, m.created_at
			  FROM ai_chat_messages m
			  JOIN ai_chat_sessions s ON s.id = m.session_id AND s.user_id = $2
			 WHERE m.session_id = $1
			 ORDER BY m.id DESC
			 LIMIT $3
		) m ORDER BY m.id ASC
	`, sessionID, userID, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StoredMessage{}
	for rows.Next() {
		var m StoredMessage
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// CheckQuota reports whether the user may send another message: "ok",
// "minute" or "day".
func CheckQuota(ctx context.Context, pool *pgxpool.Pool, userID int64) (string, error) {
	var minuteCount, dayCount int
	err := pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE m.created_at > now() - interval '1 minute'),
			COUNT(*) FILTER (WHERE m.created_at > date_trunc('day', now()))
		  FROM ai_chat_messages m
		  JOIN ai_chat_sessions s ON s.id = m.session_id
		 WHERE s.user_id = $1 AND m.role = 'user'
	`, userID).Scan(&minuteCount, &dayCount)
	if err != nil {
		return "", err
	}
	if minuteCount >= MinuteQuota {
		return "minute", nil
	}
	if dayCount >= DailyQuota {
		return "day", nil
	}
	return "ok", nil
}

func trimTitle(t string) string {
	r := []rune(t)
	for len(r) > 0 && (r[0] == ' ' || r[0] == '\n' || r[0] == '\t') {
		r = r[1:]
	}
	for len(r) > 0 && (r[len(r)-1] == ' ' || r[len(r)-1] == '\n' || r[len(r)-1] == '\t') {
		r = r[:len(r)-1]
	}
	if len(r) == 0 {
		return "New chat"
	}
	if len(r) > 80 {
		r = r[:80]
	}
	return string(r)
}

// DeriveTitle makes a chat-list title from the first user message.
func DeriveTitle(first string) string {
	r := []rune(first)
	if len(r) > 60 {
		r = append(r[:60], '…')
	}
	return trimTitle(string(r))
}
