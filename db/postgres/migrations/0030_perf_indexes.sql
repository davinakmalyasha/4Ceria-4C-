-- 0030_perf_indexes.sql — indexes proven by EXPLAIN on a larger seed.
--
-- The demo seed is too small to distinguish an index scan from a sequential
-- scan. These three were measured on a synthetic 100k-house / 50k-project /
-- 50k-user dataset:
--
--   house price sort (is_suspended=false ORDER BY price LIMIT 12)
--     73.4 ms seq scan + top-N sort -> 0.23 ms index scan
--   admin projects (ORDER BY created_at DESC, id ASC LIMIT 15)
--     21.2 ms seq scan + top-N sort -> 0.10 ms index-only scan
--   admin users (ORDER BY created_at DESC, id ASC LIMIT 20)
--     21.1 ms seq scan + top-N sort -> 0.13 ms index-only scan
--
-- The existing house_is_suspended_created_at_index already covers the default
-- newest-first feed; this adds the price sort the UI exposes. The projects
-- status-created index does not help the admin list, which has no status
-- predicate.

CREATE INDEX IF NOT EXISTS house_is_suspended_price_idx
    ON house (is_suspended, price);

CREATE INDEX IF NOT EXISTS projects_created_at_id_idx
    ON projects (created_at DESC, id ASC);

CREATE INDEX IF NOT EXISTS users_created_at_id_idx
    ON users (created_at DESC, id ASC);
