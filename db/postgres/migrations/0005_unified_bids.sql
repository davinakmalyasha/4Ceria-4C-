-- =============================================================================
-- 0005 — The unified `bids` table.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The legacy schema has SEVEN near-identical bid tables:
--
--     bids_arsitek       33 columns
--     bids_kontraktor    38 columns
--     bids_notaris       32 columns
--     bids_interior      32 columns
--     bids_structural    35 columns
--     bids_mep           30 columns
--     bids_project_manager 30 columns
--     ------------------------------------------------
--     total             235 columns, of which 185 are exact duplicates
--
-- The duplication has already produced three documented defects:
--
--   * config/bids.php, the "single source of truth" for the role registry, was
--     WRONG for six of the seven roles (defect B5);
--   * ProjectController carried FOUR hand-maintained match ladders over
--     role -> model, role -> FK column, role -> project column and role ->
--     profile model, and PaymentVerificationService carried five more;
--   * profile ids are PER TABLE and overlap: architect 42 and contractor 42
--     are different people. The cross-table id-collision bug class produced a
--     production incident where a project was shown the CONTRACTOR's bank
--     details under the ARCHITECT's role.
--
-- One table with a role discriminator removes the class of bug rather than
-- hiding it (ADR-0014).
--
-- THE STATUS ENUM IS THE UNION OF THE SEVEN
-- -----------------------------------------
-- Four of the seven legacy status columns are MySQL ENUMs:
--
--     bids_arsitek, bids_interior, bids_kontraktor, bids_notaris
--
-- and they all carry the SAME twelve values, in the same order. The other
-- three — bids_mep, bids_project_manager, bids_structural — are VARCHAR(255)
-- columns with no type constraint at all, defaulting to 'pending'. The same
-- controller code paths write the same twelve values to all seven tables
-- (ProjectController:1529/1683/1699/1716/1754/2290-2305/2805-2811 and
-- BidProjectManagerController:109/214/271), so the union of the seven is the
-- same twelve values. The three varchar columns are therefore gaining a type
-- they never had; they are not losing one.
--
-- 'resigned' is in the union because it is in the legacy ENUM, even though no
-- writer in the current code produces it. Removing a value from an enum is
-- exactly the operation this repository has been bitten by twice (AGENTS.md
-- traps 8 and 9), so the value list only ever grows.
--
-- THE ID SPACES
-- -------------
--   bidder_user_id     the AUTHORITATIVE identity. Globally unique, joins
--                      straight to `users`, and it is what the unique
--                      constraint is keyed on.
--   bidder_profile_id  the profile id, preserved VERBATIM from the legacy
--                      role column, for the audit trail.
--   <role>_id          the seven legacy profile columns, kept as real nullable
--                      columns with real foreign keys. Exactly one of them is
--                      set, and the CHECK constraint below says which.
--
-- The per-role profile columns exist because the legacy tables had them and
-- the backfill has to carry their values across without a join table. The
-- CHECK constraint is what stops them from drifting: the column that matches
-- `role` must equal `bidder_profile_id`, and the other six must be NULL.
--
-- WHY THE UNIQUE CONSTRAINT IS KEYED ON THE USER
-- ----------------------------------------------
-- The legacy unique indexes were (project_id, <role>_id) — keyed on the
-- PROFILE id. The new one is (project_id, role, bidder_user_id) — keyed on
-- the USER id. Those coincide only because a user holds at most one profile
-- per role, which the legacy schema did NOT enforce: it indexed
-- `<table>.user_id` non-uniquely. Every profile table therefore gains a
-- UNIQUE constraint on `user_id` (see 0003). The pre-flight count of
-- duplicate user_ids is 0 in all nine profile tables, so no data has to
-- change.
--
-- THE SEVEN WIRE KEYS ARE PRESERVED
-- ---------------------------------
-- The SPA reads `bids_arsitek`, `bids_kontraktor`, `bids_notaris`,
-- `bids_interior`, `bids_structural`, `bids_mep` and `bids_project_manager`
-- as seven separate top-level arrays in forty-odd places. The Go serializer
-- emits them from ONE query via an in-memory split, so the frontend does not
-- change at all.

-- -----------------------------------------------------------------------------
-- The enum vocabulary. `bid_role` was already created in 0004, because
-- project_addendums.recommended_bid_type uses it.
-- -----------------------------------------------------------------------------

CREATE TYPE bid_status AS ENUM (
    'pending', 'shortlisted', 'invited', 'negotiating', 'contract_pending',
    'awaiting_payment', 'accepted', 'active', 'rejected', 'declined',
    'terminated', 'resigned'
);

CREATE TYPE bid_payment_status AS ENUM (
    'unpaid', 'pending', 'verifying', 'paid', 'refunded'
);

-- -----------------------------------------------------------------------------
-- bids  (legacy tables: bids_arsitek, bids_interior, bids_kontraktor,
--         bids_notaris, bids_project_manager, bids_structural, bids_mep)
-- -----------------------------------------------------------------------------
CREATE TABLE bids (
    id                     bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id             bigint NOT NULL,
    role                   bid_role NOT NULL,
    bidder_user_id         bigint NOT NULL,
    bidder_profile_id      bigint NOT NULL,

    -- The seven legacy profile columns. Exactly one is set; the CHECK
    -- constraint at the bottom of this table says which one.
    arsitek_id             bigint,
    kontraktor_id          bigint,
    notaris_id             bigint,
    interior_id            bigint,
    pm_id                  bigint,
    structural_id          bigint,
    mep_id                 bigint,

    -- THE 27 UNIVERSAL COLUMNS (present in all seven legacy tables).
    price                  numeric(24,2) NOT NULL DEFAULT 0,
    price_max              numeric(24,2),
    negotiation_count      integer NOT NULL DEFAULT 0,
    fee_type               text,
    unit_price             numeric(24,2),
    quantity               numeric(24,2),
    calculated_total       numeric(24,2),
    proposal               text,
    status                 bid_status NOT NULL DEFAULT 'pending',
    is_recommended         boolean NOT NULL DEFAULT false,
    estimated_duration     integer,
    duration_unit          text,
    attachment_1           text,
    attachment_2           text,
    attachment_3           text,
    payment_status         bid_payment_status NOT NULL DEFAULT 'unpaid',
    paid_at                timestamptz,
    scopes                 jsonb,
    deliverables           jsonb,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    offered_by_id          bigint,
    fee_agreed_at          timestamptz,
    payment_proof_path     text,
    verification_notes     text,
    proposed_termins       jsonb,
    proposed_milestones    jsonb,
    refunded_amount        numeric(24,2) NOT NULL DEFAULT 0,

    -- THE ROLE-SPECIFIC COLUMNS. Each one is NULL for every role that does
    -- not have it; the comment names the roles that own it.
    proposed_team          jsonb,        -- arsitek, kontraktor
    style                  text,         -- arsitek, interior
    construction_method    text,         -- kontraktor
    cost_breakdown         jsonb,        -- kontraktor
    workforce_count        integer,      -- kontraktor
    equipment_owned        text,         -- kontraktor
    warranty_months        integer,      -- kontraktor
    payment_preference     text,         -- kontraktor
    tax_estimate           numeric(24,2),-- notaris
    fee_percentage         numeric(5,2), -- notaris
    selected_services      jsonb,        -- notaris
    license_number         text,         -- structural, mep
    experience_years       integer,      -- structural, mep
    technical_notes        text,         -- structural, mep
    interview_notes        text,         -- structural, mep

    CONSTRAINT bids_project_id_fkey        FOREIGN KEY (project_id)        REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT bids_bidder_user_id_fkey    FOREIGN KEY (bidder_user_id)    REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT bids_arsitek_id_fkey        FOREIGN KEY (arsitek_id)        REFERENCES arsiteks (id) ON DELETE CASCADE,
    CONSTRAINT bids_kontraktor_id_fkey     FOREIGN KEY (kontraktor_id)     REFERENCES kontraktors (id) ON DELETE CASCADE,
    CONSTRAINT bids_notaris_id_fkey        FOREIGN KEY (notaris_id)        REFERENCES notaris_profiles (id) ON DELETE CASCADE,
    CONSTRAINT bids_interior_id_fkey       FOREIGN KEY (interior_id)       REFERENCES interior_profiles (id) ON DELETE CASCADE,
    CONSTRAINT bids_pm_id_fkey             FOREIGN KEY (pm_id)             REFERENCES project_managers (id) ON DELETE CASCADE,
    CONSTRAINT bids_structural_id_fkey     FOREIGN KEY (structural_id)     REFERENCES structural_engineers (id) ON DELETE CASCADE,
    CONSTRAINT bids_mep_id_fkey            FOREIGN KEY (mep_id)            REFERENCES mep_engineers (id) ON DELETE CASCADE,
    CONSTRAINT bids_offered_by_id_fkey     FOREIGN KEY (offered_by_id)     REFERENCES users (id) ON DELETE SET NULL,

    -- The uniqueness rule the legacy per-role indexes expressed. It is keyed
    -- on the USER id, which is globally unique, so the cross-table profile-id
    -- collision class is structurally impossible (ADR-0014).
    CONSTRAINT bids_project_role_bidder_unique UNIQUE (project_id, role, bidder_user_id),

    -- The role and the profile columns cannot disagree. This is what makes
    -- `bidder_profile_id` an audit trail rather than a second source of
    -- truth.
    CONSTRAINT bids_role_profile_consistent CHECK (
        CASE role
            WHEN 'arsitek' THEN
                arsitek_id IS NOT DISTINCT FROM bidder_profile_id
                AND kontraktor_id IS NULL AND notaris_id IS NULL AND interior_id IS NULL
                AND pm_id IS NULL AND structural_id IS NULL AND mep_id IS NULL
            WHEN 'kontraktor' THEN
                kontraktor_id IS NOT DISTINCT FROM bidder_profile_id
                AND arsitek_id IS NULL AND notaris_id IS NULL AND interior_id IS NULL
                AND pm_id IS NULL AND structural_id IS NULL AND mep_id IS NULL
            WHEN 'notaris' THEN
                notaris_id IS NOT DISTINCT FROM bidder_profile_id
                AND arsitek_id IS NULL AND kontraktor_id IS NULL AND interior_id IS NULL
                AND pm_id IS NULL AND structural_id IS NULL AND mep_id IS NULL
            WHEN 'interior' THEN
                interior_id IS NOT DISTINCT FROM bidder_profile_id
                AND arsitek_id IS NULL AND kontraktor_id IS NULL AND notaris_id IS NULL
                AND pm_id IS NULL AND structural_id IS NULL AND mep_id IS NULL
            WHEN 'structural' THEN
                structural_id IS NOT DISTINCT FROM bidder_profile_id
                AND arsitek_id IS NULL AND kontraktor_id IS NULL AND notaris_id IS NULL
                AND interior_id IS NULL AND pm_id IS NULL AND mep_id IS NULL
            WHEN 'mep' THEN
                mep_id IS NOT DISTINCT FROM bidder_profile_id
                AND arsitek_id IS NULL AND kontraktor_id IS NULL AND notaris_id IS NULL
                AND interior_id IS NULL AND pm_id IS NULL AND structural_id IS NULL
            WHEN 'project_manager' THEN
                pm_id IS NOT DISTINCT FROM bidder_profile_id
                AND arsitek_id IS NULL AND kontraktor_id IS NULL AND notaris_id IS NULL
                AND interior_id IS NULL AND structural_id IS NULL AND mep_id IS NULL
            ELSE false
        END
    ),

    -- A bid is a price. It cannot be negative, and a refund cannot make it
    -- negative either.
    CONSTRAINT bids_price_non_negative      CHECK (price >= 0),
    CONSTRAINT bids_price_max_sane           CHECK (price_max IS NULL OR price_max >= 0),
    CONSTRAINT bids_refunded_amount_non_negative CHECK (refunded_amount >= 0),
    -- The fee percentage is a PERCENTAGE of the ceiling, in [0, 100].
    CONSTRAINT bids_fee_percentage_range     CHECK (fee_percentage IS NULL OR (fee_percentage >= 0 AND fee_percentage <= 100)),

    -- The legacy varchar length limits, preserved as CHECK constraints
    -- because MySQL rejected an over-long value under strict mode and
    -- PostgreSQL's `text` would not. Where the seven legacy tables disagreed
    -- the LOOSEST limit wins, so the unified table never rejects a value the
    -- legacy schema accepted.
    CONSTRAINT bids_fee_type_length           CHECK (char_length(fee_type) <= 255),
    CONSTRAINT bids_duration_unit_length      CHECK (char_length(duration_unit) <= 255),
    CONSTRAINT bids_attachment_1_length       CHECK (char_length(attachment_1) <= 255),
    CONSTRAINT bids_attachment_2_length       CHECK (char_length(attachment_2) <= 255),
    CONSTRAINT bids_attachment_3_length       CHECK (char_length(attachment_3) <= 255),
    CONSTRAINT bids_payment_proof_path_length CHECK (char_length(payment_proof_path) <= 255),
    CONSTRAINT bids_style_length              CHECK (char_length(style) <= 255),
    CONSTRAINT bids_construction_method_length CHECK (char_length(construction_method) <= 255),
    CONSTRAINT bids_payment_preference_length CHECK (char_length(payment_preference) <= 255),
    CONSTRAINT bids_license_number_length     CHECK (char_length(license_number) <= 255)
);

COMMENT ON TABLE bids IS
    'The unified bid table. Replaces seven near-identical legacy tables (235 '
    'columns, 185 of them exact duplicates) with one row per bid discriminated '
    'by `role` (ADR-0014). `bidder_user_id` is the authoritative identity; '
    '`bidder_profile_id` is the legacy profile id preserved verbatim for the '
    'audit trail.';

COMMENT ON COLUMN bids.role IS
    'Which of the seven professional roles this bid is for. The discriminator '
    'that replaces seven tables.';

COMMENT ON COLUMN bids.bidder_user_id IS
    'The authoritative bidder identity: a user id. Globally unique, so the '
    'cross-table profile-id collision class cannot occur.';

COMMENT ON COLUMN bids.bidder_profile_id IS
    'The profile id, copied VERBATIM from the legacy role column '
    '(bids_arsitek.arsitek_id and so on). It is an audit trail, not a lookup '
    'key; the role-specific column below is the one with the foreign key.';

COMMENT ON COLUMN bids.status IS
    'The UNION of the seven legacy status columns. Four of them were MySQL '
    'ENUMs with these twelve values in this order; three were unconstrained '
    'VARCHARs defaulting to ''pending''. No value is lost.';

COMMENT ON COLUMN bids.payment_status IS
    'unpaid -> pending -> verifying -> paid, plus refunded. `paid` and '
    '`refunded` are terminal (MONEY.md section 9).';

CREATE INDEX bids_project_id_status_idx ON bids (project_id, status);
CREATE INDEX bids_bidder_user_id_idx ON bids (bidder_user_id);
CREATE INDEX bids_bidder_profile_id_idx ON bids (bidder_profile_id);
CREATE INDEX bids_role_profile_created_idx ON bids (role, bidder_profile_id, created_at DESC);
CREATE INDEX bids_payment_status_idx ON bids (payment_status);
CREATE INDEX bids_offered_by_id_idx ON bids (offered_by_id);

-- -----------------------------------------------------------------------------
-- bid_negotiation_logs  (legacy table: bid_negotiation_logs)
--
-- `bid_type` was an Eloquent class name. `Relation::morphMap()` registered
-- nine entries and NONE of them was a bid model, so the raw class name was
-- stored — the same defect class ADR-0013 retired in the ledger. It becomes
-- a registry key (ADR-0013).
--
-- `bid_id` now points at the unified `bids.id`. It carries no foreign key,
-- exactly as the legacy column did: the legacy bid ids are per table, so
-- before the backfill there is no single table for a key to point at, and
-- after it there is.
-- -----------------------------------------------------------------------------
CREATE TABLE bid_negotiation_logs (
    id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    bid_type_id      smallint NOT NULL,
    bid_id           bigint NOT NULL,
    user_id          bigint NOT NULL,
    round_number     integer NOT NULL,
    snapshot         jsonb NOT NULL,
    note             text,
    changes_detected jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bid_negotiation_logs_bid_type_id_fkey FOREIGN KEY (bid_type_id) REFERENCES ledger_reference_types (id),
    CONSTRAINT bid_negotiation_logs_user_id_fkey    FOREIGN KEY (user_id)     REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX bid_negotiation_logs_bid_type_bid_round_idx ON bid_negotiation_logs (bid_type_id, bid_id, round_number);
CREATE INDEX bid_negotiation_logs_bid_id_idx ON bid_negotiation_logs (bid_id);
CREATE INDEX bid_negotiation_logs_user_id_idx ON bid_negotiation_logs (user_id);
