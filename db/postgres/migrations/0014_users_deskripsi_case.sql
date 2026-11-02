-- =============================================================================
-- 0014 — The capital-D `users.Deskripsi` column.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The legacy `users` table has exactly one column whose name is not all
-- lowercase: `Deskripsi` (capital D). Every PostgreSQL migration spelled
-- it `deskripsi`, which PostgreSQL folds to lowercase — a different
-- identifier. The ETL matches columns by name, so the values never copied
-- (both sides read NULL today), but the KEY NAME is the wire contract:
-- a full user serialization (`ProjectResource` engineer blocks, the owner
-- block) emits `Deskripsi` on the oracle and `deskripsi` on the port.
--
-- The fix is a rename, not a select-time alias: the mirror must hold the
-- same identifier the oracle reads, or every future non-null value
-- diverges again. Quoted, because unquoted folds straight back.
-- =============================================================================

ALTER TABLE users RENAME COLUMN deskripsi TO "Deskripsi";
