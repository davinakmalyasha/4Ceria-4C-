-- 0017_bid_status_recommended.sql
--
-- `ProjectSubProfessional` recommendation writes `status = 'recommended'`
-- on the specialist bid (`SubProfessionalController::recommend`). On MySQL
-- the two affected tables — `bids_structural` and `bids_mep` — keep that
-- column as `varchar(255)`, so the value has always been storable there.
-- The PostgreSQL mirror typed every role's status as the shared
-- `bid_status` ENUM, which did not carry it: the port's same write failed
-- with `invalid input value for enum bid_status: "recommended"`.
--
-- APPEND-ONLY, deliberately. `ALTER TYPE ... ADD VALUE` is additive and
-- cannot invalidate an existing row (AGENTS.md trap #9: never rewrite an
-- enum, because a dropped value aborts the migration on live data). The
-- new label is APPENDED, because MySQL's four ENUM-backed bid tables
-- gain it with EnumValues::addValues(), which can only append. The schema
-- gate compares the unified type against the live MySQL union IN ORDER, so
-- both engines must end with the same label. PostgreSQL 12+ allows ADD VALUE
-- inside a transaction as long as the new value is not used in the same one.

ALTER TYPE bid_status ADD VALUE IF NOT EXISTS 'recommended';
