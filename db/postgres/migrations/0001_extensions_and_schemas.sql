-- =============================================================================
-- 0001 — Extensions, schemas and roles.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- PostgreSQL does not have MySQL's implicit capabilities. Three of them are
-- load-bearing for this application, and each has to be installed EXPLICITLY
-- before anything else in the baseline can be created:
--
--   citext    — the case-insensitive string type. MySQL's default collation
--               (utf8mb4_0900_ai_ci) compares strings case-insensitively, and
--               PostgreSQL's default does not. Login, every Sanctum token
--               lookup, the public brief link and the firm invite codes all
--               depend on that. ADR-0008 decides the treatment PER COLUMN
--               FAMILY; citext is the type-level expression of the
--               "case-insensitive by requirement" family.
--
--   pg_trgm   — the search columns. MySQL's LIKE is case-insensitive AND
--               accent-insensitive; PostgreSQL's LIKE is neither. The search
--               family therefore needs an explicit case-folding rule in the
--               query and an index that can serve an INFIX match, which a
--               b-tree cannot. See the search-column indexes in 0008.
--
--   btree_gin — lets a GIN index carry a scalar column alongside jsonb, so
--               the "documents that mention this material AND are still
--               active" shape needs one index instead of two.
--
-- THE SCHEMAS
-- -----------
-- 'public' holds the tables. 'escrow' holds the ledger's enforcement
-- functions, and it exists as its own schema for ONE reason: a SECURITY
-- DEFINER function must have a pinned search_path, and putting the functions
-- in a schema of their own means that search_path can be pinned to exactly
-- two entries (public, escrow) without dragging every table into it.
--
-- THE ROLES
-- ---------
-- 'app_rw' is the application role and 'app_ro' is the reporting role. They
-- are created here, as NOLOGIN group roles, because 0006 REVOKEs
-- INSERT/UPDATE/DELETE on the ledger from 'app_rw' and GRANTs EXECUTE on
-- 'escrow.record_movement()' instead. "Never write a ledger row directly"
-- becomes a DATABASE PRIVILEGE rather than a code convention (ADR-0020), and
-- a privilege cannot be revoked from a role that does not exist.
--
-- The roles are created with a guard so the file is idempotent: the same
-- migration runner may replay it against a database that already has them.
--
-- THE DATABASE COLLATION
-- ----------------------
-- The target database is created with LC_COLLATE=C LC_CTYPE=C. That is the
-- "keep the default C collation" half of ADR-0008: under C, every comparison
-- that this schema does NOT explicitly mark as case-insensitive is byte-exact,
-- which is the STRICTEST reading and the one that makes an accidental
-- case-insensitive match impossible.
--
-- The consequence is stated once, here, so nobody has to rediscover it:
-- MySQL's utf8mb4_0900_ai_ci treats ß = ss and strips accents. PostgreSQL's C
-- does neither. Every place the legacy schema leaned on that is enumerated in
-- docs/POSTGRES-SCHEMA.md, section "What C costs".

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE SCHEMA IF NOT EXISTS escrow;

COMMENT ON SCHEMA escrow IS
    'The escrow ledger''s enforcement functions. Separate from public so that '
    'SECURITY DEFINER functions can pin search_path to exactly two entries.';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
        CREATE ROLE app_rw NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ro') THEN
        CREATE ROLE app_ro NOLOGIN;
    END IF;
END
$$;

COMMENT ON ROLE app_rw IS
    'The application role. It may read everything and write everything EXCEPT '
    'project_budget_transactions, whose writes go exclusively through '
    'escrow.record_movement() (ADR-0020).';

COMMENT ON ROLE app_ro IS
    'The reporting role. Read-only. Used by the reconciliation jobs and by the '
    'legacy-mysql-parity nightly, which must be able to see the ledger without '
    'being able to move money.';

