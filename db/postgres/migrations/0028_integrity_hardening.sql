-- 0028: integrity and operational hardening.
--
-- 1. A project can have at most one open dispute. The handler checks before
--    inserting, but two concurrent opens both passed that check; the partial
--    unique index is the invariant.
-- 2. Rate-limit rows are pruned by age, so the prune needs its own index.
-- 3. Mail delivery needs attempt accounting; a permanent failure must not be
--    retried forever at 25 messages a day.
-- 4. Expired tokens are removed, not merely ignored. Sanctum semantics keep
--    non-expiring tokens, but an expired row is dead weight and a credential
--    that should no longer exist.

CREATE UNIQUE INDEX IF NOT EXISTS project_disputes_one_open_per_project
    ON project_disputes (project_id)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS rate_limit_hits_at
    ON rate_limit_hits (hit_at);

ALTER TABLE mail_outbox
    ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS mail_outbox_due
    ON mail_outbox (next_attempt_at)
    WHERE sent_at IS NULL;

-- Web push is delivered by a sweeper, never before the creating transaction
-- commits. The marker makes delivery at-most-once per notification.
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_push_pending
    ON notifications (created_at)
    WHERE push_sent_at IS NULL;

DELETE FROM personal_access_tokens
 WHERE expires_at IS NOT NULL AND expires_at <= now();
