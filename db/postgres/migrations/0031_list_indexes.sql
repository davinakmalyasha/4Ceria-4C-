-- 0031_list_indexes.sql — remaining list ORDER BY / filter indexes.
--
-- 0030 covered the three admin sorts the 100k audit proved. The small-scale
-- EXPLAIN run still seq-scanned these lists; each index below matches an exact
-- ORDER BY in the handler, so the planner can serve Limit without a sort:
--
--   admin houses (ORDER BY created_at DESC, id ASC, no predicate)
--     seq scan + sort on 1k rows; fails --strict at 50k+ plan rows
--   owner projects (WHERE user_id=$1 ORDER BY created_at DESC, id DESC)
--     existing (user_id,status) filters but cannot order
--   material orders by buyer/supplier (WHERE user_id/supplier_id ORDER BY
--     created_at DESC, id ASC) — existing buyer index lacks the id tiebreak
--     and direction, supplier has only (supplier_id,status)
--   conversation last messages (DISTINCT ON conversation_id ORDER BY
--     conversation_id, id DESC) — existing index orders by created_at
--   directory / marketplace (WHERE verification_status='verified' ORDER BY id)
--     no index on the profile tables; suppliers has only (verification,status,created)
--
-- Sweeps (retention, auto-complete, snag, prune) stay unindexed by design:
-- they are infrequent full scans over small candidate sets.

CREATE INDEX IF NOT EXISTS house_created_at_id_idx
    ON house (created_at DESC, id ASC);

CREATE INDEX IF NOT EXISTS projects_user_created_id_idx
    ON projects (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS material_orders_user_created_id_idx
    ON material_orders (user_id, created_at DESC, id ASC);

CREATE INDEX IF NOT EXISTS material_orders_supplier_created_id_idx
    ON material_orders (supplier_id, created_at DESC, id ASC);

CREATE INDEX IF NOT EXISTS chat_messages_conv_id_idx
    ON chat_messages (conversation_id, id DESC);

CREATE INDEX IF NOT EXISTS arsiteks_verification_id_idx
    ON arsiteks (verification_status, id);
CREATE INDEX IF NOT EXISTS kontraktors_verification_id_idx
    ON kontraktors (verification_status, id);
CREATE INDEX IF NOT EXISTS notaris_profiles_verification_id_idx
    ON notaris_profiles (verification_status, id);
CREATE INDEX IF NOT EXISTS interior_profiles_verification_id_idx
    ON interior_profiles (verification_status, id);
CREATE INDEX IF NOT EXISTS structural_engineers_verification_id_idx
    ON structural_engineers (verification_status, id);
CREATE INDEX IF NOT EXISTS mep_engineers_verification_id_idx
    ON mep_engineers (verification_status, id);
CREATE INDEX IF NOT EXISTS project_managers_verification_id_idx
    ON project_managers (verification_status, id);
CREATE INDEX IF NOT EXISTS suppliers_verification_id_idx
    ON suppliers (verification_status, id);
