-- =============================================================================
-- 0004 — Projects and the project lifecycle.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The project is the centre of the domain: every money movement, every bid,
-- every document and every dispute hangs off one of these rows. This file
-- creates the project and the tables that describe its lifecycle - the
-- milestones, the schedule, the documents, the payment stages, the
-- terminations, the disputes and the warranty.
--
-- THE MONEY TABLES THAT ARE NOT THE LEDGER
-- -----------------------------------------
-- 'project_payment_termins' is here because it is a payment STAGE - the
-- schedule of who gets paid when - and not a movement of money. The money
-- lives in 'project_budget_transactions', which is 0006 and which owns the
-- invariants. The two are linked by a reference, not by a foreign key: the
-- ledger points AT the stage through the registry, because a stage can be
-- paid, have a platform fee, and later have a retention release, and each of
-- those is a separate ledger row against the same stage.
--
-- THE TWO STATE MACHINES THAT BECAME ENUMS HERE
-- ---------------------------------------------
-- 'project_payment_termins.status' was an unconstrained VARCHAR(255) and is
-- the most money-critical state machine in the application. 'projects'
-- carries three more VARCHAR state machines - planning_status,
-- construction_brief_status and walkthrough_status. All four are native
-- enums now (ADR-0007), with the value lists read out of the application
-- and recorded in spec/enums.yaml.
--
-- 'project_disputes.status' and 'project_disputes.resolution' are enums for
-- the same reason: the dispute freeze gate (MONEY.md section 8) is a
-- function of them.



-- The enum vocabulary this file needs. Every value list is the
-- MySQL one, in MySQL's order, and spec/enums.yaml is the source.

CREATE TYPE bid_role AS ENUM ('arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager');

CREATE TYPE bom_type AS ENUM ('raw', 'finishing');

CREATE TYPE budget_health AS ENUM ('on_track', 'warning', 'critical');

CREATE TYPE dispute_resolution AS ENUM ('dismiss', 'release_payment', 'record_refund', 'terminate_project', 'custom');

CREATE TYPE dispute_status AS ENUM ('open', 'resolved', 'dismissed', 'withdrawn');

CREATE TYPE parent_role AS ENUM ('arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager');

CREATE TYPE payment_termin_status AS ENUM ('locked', 'pending', 'invoice_sent', 'verifying', 'accepted', 'paid', 'void');

CREATE TYPE phase_role AS ENUM ('arsitek', 'kontraktor', 'notaris', 'interior', 'project_manager', 'structural', 'mep');

CREATE TYPE project_addendums_status AS ENUM ('pending_approval', 'approved', 'approved_unpaid', 'authorized', 'verifying', 'paid', 'rejected', 'negotiating', 'accepted_by_pro');

CREATE TYPE project_change_orders_status AS ENUM ('proposed', 'pm_reviewed', 'owner_approved', 'rejected', 'implemented');

CREATE TYPE project_construction_brief_status AS ENUM ('draft', 'pending_review', 'revision_requested', 'approved');

CREATE TYPE project_planning_status AS ENUM ('draft', 'proposed', 'approved', 'pm_verified');

CREATE TYPE project_procurement_requests_status AS ENUM ('pending_pm', 'pending_owner', 'authorized', 'rejected');

CREATE TYPE project_requirements_category AS ENUM ('structural', 'architecture', 'mep', 'interior', 'general');

CREATE TYPE project_snag_items_status AS ENUM ('open', 'in_progress', 'resolved', 'accepted');

CREATE TYPE project_status AS ENUM ('open', 'accepted_arsitek', 'accepted_kontraktor', 'awaiting_payment', 'in_progress', 'termination_pending', 'legal', 'procurement', 'completed_build', 'completed', 'cancelled');

CREATE TYPE project_sub_professionals_status AS ENUM ('invited', 'interviewing', 'accepted', 'recommended', 'active', 'completed', 'removed');

CREATE TYPE project_terminations_status AS ENUM ('pending', 'accepted', 'rejected', 'escalated');

CREATE TYPE project_timeline_extensions_status AS ENUM ('proposed', 'pm_reviewed', 'approved', 'rejected');

CREATE TYPE project_walkthrough_status AS ENUM ('in_progress', 'completed');

CREATE TYPE project_warranty_claims_status AS ENUM ('open', 'fixing', 'resolved', 'closed');

CREATE TYPE quality_level AS ENUM ('standard', 'premium', 'luxury');

CREATE TYPE requirement_history_type AS ENUM ('restock', 'use');

CREATE TYPE severity AS ENUM ('minor', 'major', 'critical');

-- --------------------------------------------------------------------------
-- projects  (legacy table: `projects`)
-- The project. The single most-read table in the application.
--
-- THE 'selected_*' COLUMNS - EVERY ONE OF THEM IS A PROFILE ID
-- -----------------------------------------------------------
--   selected_arsitek_id     -> arsiteks.id
--   selected_kontraktor_id  -> kontraktors.id
--   selected_notaris_id     -> notaris_profiles.id
--   selected_interior_id    -> interior_profiles.id
--   pm_id                   -> project_managers.id
--   structural_id           -> structural_engineers.id
--   mep_id                  -> mep_engineers.id
--
-- Seven columns, seven profile tables, seven FOREIGN KEYS. The legacy
-- schema declared a foreign key on NONE of them - they were bare unsigned
-- bigints with a plain index - and it also declared 'pm_id' as the PM's
-- USER id while the other six were profile ids. The 2026-10-21 migration
-- made 'pm_id' a profile id too (ADR-0015), so there is now ONE convention
-- and the database enforces it.
--
-- Why profile ids and not user ids: the value in 'selected_arsitek_id' is
-- the SAME value as 'bids_arsitek.arsitek_id', because acceptBid() copies
-- one to the other. A user id would make the two columns incomparable and
-- force every "who is hired?" query through a second join. In the unified
-- 'bids' table the same rule applies: 'bids.bidder_profile_id' is the
-- audit trail and 'bids.bidder_user_id' is the authoritative identity
-- (ADR-0014).
--
-- 'owner_id' is a vestigial column: nothing reads it meaningfully (the
-- API resource emits 'user_id' under the name 'owner_id'), and the legacy
-- schema declared no foreign key on it. It is carried over verbatim and
-- left unconstrained.
--
-- THE JSON COLUMNS
-- ----------------
--   published_bidding_roles, bidding_choices, needed_phases,
--   completed_phases, design_details, construction_details,
--   interior_details, pm_audit_attachments, project_dimensions,
--   legal_requirements
--
-- All jsonb. 'published_bidding_roles' is the one the performance audit
-- recommended moving to a pivot table; it is a short list of role names
-- and the rewrite may do that, but it is not a schema correctness issue
-- and it is not done here.
-- --------------------------------------------------------------------------
CREATE TABLE projects (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    user_id bigint NOT NULL,
    title text NOT NULL,
    CONSTRAINT projects_title_length CHECK (char_length(title) <= 255),
    description text,
    budget numeric(24,2) NOT NULL DEFAULT 0.00,
    lokasi text,
    CONSTRAINT projects_lokasi_length CHECK (char_length(lokasi) <= 255),
    jenis_proyek text,
    CONSTRAINT projects_jenis_proyek_length CHECK (char_length(jenis_proyek) <= 255),
    owner_id bigint,
    selected_arsitek_id bigint,
    selected_kontraktor_id bigint,
    selected_notaris_id bigint,
    selected_interior_id bigint,
    pm_id bigint,
    structural_id bigint,
    mep_id bigint,
    structural_approved_at timestamptz,
    mep_approved_at timestamptz,
    status project_status NOT NULL DEFAULT 'open',
    published_bidding_roles jsonb,
    bidding_choices jsonb,
    target_role text NOT NULL DEFAULT 'arsitek',
    CONSTRAINT projects_target_role_length CHECK (char_length(target_role) <= 255),
    needed_phases jsonb,
    completed_phases jsonb,
    wants_project_manager boolean NOT NULL DEFAULT false,
    requires_structural boolean NOT NULL DEFAULT false,
    requires_mep boolean NOT NULL DEFAULT false,
    requires_interior boolean NOT NULL DEFAULT false,
    latitude numeric(10,7),
    longitude numeric(10,7),
    province text,
    CONSTRAINT projects_province_length CHECK (char_length(province) <= 255),
    city text,
    CONSTRAINT projects_city_length CHECK (char_length(city) <= 255),
    kecamatan text,
    CONSTRAINT projects_kecamatan_length CHECK (char_length(kecamatan) <= 255),
    kelurahan text,
    CONSTRAINT projects_kelurahan_length CHECK (char_length(kelurahan) <= 255),
    postal_code text,
    CONSTRAINT projects_postal_code_length CHECK (char_length(postal_code) <= 255),
    street_name text,
    CONSTRAINT projects_street_name_length CHECK (char_length(street_name) <= 255),
    design_details jsonb,
    design_completed_at timestamptz,
    design_authorized_at timestamptz,
    materials_authorized_at timestamptz,
    design_locked_at timestamptz,
    legal_completed_at timestamptz,
    pbg_verified_at timestamptz,
    slf_verified_at timestamptz,
    legal_locked_at timestamptz,
    construction_details jsonb,
    construction_completed_at timestamptz,
    construction_authorized_at timestamptz,
    construction_locked_at timestamptz,
    construction_brief_status project_construction_brief_status NOT NULL DEFAULT 'draft',
    construction_brief_revision_notes text,
    interior_details jsonb,
    interior_locked_at timestamptz,
    interior_completed_at timestamptz,
    planning_status project_planning_status NOT NULL DEFAULT 'draft',
    negotiated_fee numeric(24,2),
    payment_instructions text,
    planning_submitted_at timestamptz,
    planning_approved_at timestamptz,
    design_payment_verified_at timestamptz,
    construction_payment_verified_at timestamptz,
    interior_payment_verified_at timestamptz,
    arsitek_kickoff_at timestamptz,
    kontraktor_kickoff_at timestamptz,
    pm_audit_notes text,
    pm_audit_attachments jsonb,
    architect_notes text,
    planning_iteration integer NOT NULL DEFAULT 0,
    project_category text,
    CONSTRAINT projects_project_category_length CHECK (char_length(project_category) <= 255),
    project_dimensions jsonb,
    legal_detail text,
    wants_to_discuss_later boolean NOT NULL DEFAULT false,
    legal_requirements jsonb,
    share_token citext,
    CONSTRAINT projects_share_token_length CHECK (char_length(share_token) <= 255),
    attachment text,
    CONSTRAINT projects_attachment_length CHECK (char_length(attachment) <= 255),
    deadline date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    design_handover_submitted_at timestamptz,
    construction_handover_submitted_at timestamptz,
    interior_handover_submitted_at timestamptz,
    design_handover_notes text,
    construction_handover_notes text,
    interior_handover_notes text,
    legal_handover_submitted_at timestamptz,
    legal_handover_notes text,
    final_walkthrough_at timestamptz,
    walkthrough_status project_walkthrough_status,
    -- B25. The column was missing from the legacy schema entirely, so
    -- `POST /api/projects/{project}/mark-complete` answered 500 for every
    -- owner. The MySQL migration is
    -- `2026_10_21_000004_add_completed_at_to_projects.php`.
    completed_at timestamptz,
    owner_accepted_at timestamptz,
    owner_acceptance_notes text,
    owner_design_approved_at timestamptz,
    owner_build_approved_at timestamptz,
    owner_interior_approved_at timestamptz,
    owner_legal_approved_at timestamptz,
    warranty_start_at timestamptz,
    warranty_end_at timestamptz,
    deleted_at timestamptz,
    CONSTRAINT projects_pkey PRIMARY KEY (id),
    CONSTRAINT projects_share_token_key UNIQUE (share_token),
    CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    -- THE SEVEN PROFILE FOREIGN KEYS. The legacy schema declared NONE of,
    -- them, and it declared pm_id as a USER id while the other six were,
    -- profile ids. The 2026-10-21 migration made pm_id a profile id too,
    -- (ADR-0015), so there is ONE convention and the database enforces it.,
    CONSTRAINT projects_selected_arsitek_id_fkey    FOREIGN KEY (selected_arsitek_id)    REFERENCES arsiteks (id) ON DELETE SET NULL,
    CONSTRAINT projects_selected_kontraktor_id_fkey FOREIGN KEY (selected_kontraktor_id) REFERENCES kontraktors (id) ON DELETE SET NULL,
    CONSTRAINT projects_selected_notaris_id_fkey    FOREIGN KEY (selected_notaris_id)    REFERENCES notaris_profiles (id) ON DELETE SET NULL,
    CONSTRAINT projects_selected_interior_id_fkey   FOREIGN KEY (selected_interior_id)   REFERENCES interior_profiles (id) ON DELETE SET NULL,
    CONSTRAINT projects_pm_id_fkey                  FOREIGN KEY (pm_id)                  REFERENCES project_managers (id) ON DELETE SET NULL,
    CONSTRAINT projects_structural_id_fkey          FOREIGN KEY (structural_id)          REFERENCES structural_engineers (id) ON DELETE SET NULL,
    CONSTRAINT projects_mep_id_fkey                 FOREIGN KEY (mep_id)                 REFERENCES mep_engineers (id) ON DELETE SET NULL,
    -- The ceiling. It is mutable - deposit raises it and adjustment_down,
    -- lowers it - and it is NEVER read to answer "how much is left".,
    -- MONEY.md section 3: available = ceiling - outflow, and the outflow is,
    -- the ledger's, not the ceiling's.,
    CONSTRAINT projects_budget_non_negative CHECK (budget >= 0)
);

CREATE INDEX projects_deleted_at_index ON projects (deleted_at);
CREATE INDEX projects_mep_id_index ON projects (mep_id);
CREATE INDEX projects_pm_id_index ON projects (pm_id);
CREATE INDEX projects_selected_arsitek_id_index ON projects (selected_arsitek_id);
CREATE INDEX projects_selected_interior_id_index ON projects (selected_interior_id);
CREATE INDEX projects_selected_kontraktor_id_index ON projects (selected_kontraktor_id);
CREATE INDEX projects_selected_notaris_id_index ON projects (selected_notaris_id);
CREATE INDEX projects_status_created_at_index ON projects (status, created_at);
CREATE INDEX projects_structural_id_index ON projects (structural_id);
CREATE INDEX projects_target_role_status_idx ON projects (target_role, status);
CREATE INDEX projects_user_id_status_index ON projects (user_id, status);
CREATE INDEX projects_status_created_at_idx ON projects (status, created_at DESC);
CREATE INDEX projects_owner_id_idx ON projects (owner_id);

-- --------------------------------------------------------------------------
-- project_milestones  (legacy table: `project_milestones`)
-- A milestone in the project plan.
-- --------------------------------------------------------------------------
CREATE TABLE project_milestones (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    arsitek_id bigint,
    kontraktor_id bigint,
    notaris_id bigint,
    interior_id bigint,
    pm_id bigint,
    structural_id bigint,
    mep_id bigint,
    title text NOT NULL,
    CONSTRAINT project_milestones_title_length CHECK (char_length(title) <= 255),
    type text NOT NULL DEFAULT 'milestone',
    CONSTRAINT project_milestones_type_length CHECK (char_length(type) <= 255),
    content jsonb,
    description text,
    review_note text,
    review_status text NOT NULL DEFAULT 'pending',
    CONSTRAINT project_milestones_review_status_length CHECK (char_length(review_status) <= 50),
    image text,
    CONSTRAINT project_milestones_image_length CHECK (char_length(image) <= 255),
    sort_order integer NOT NULL DEFAULT 0,
    start_date date,
    due_date date,
    is_completed boolean NOT NULL DEFAULT false,
    approval_status text NOT NULL DEFAULT 'pending',
    CONSTRAINT project_milestones_approval_status_length CHECK (char_length(approval_status) <= 255),
    revision_notes text,
    phase_context text,
    CONSTRAINT project_milestones_phase_context_length CHECK (char_length(phase_context) <= 255),
    lead_pro_verified_at timestamptz,
    pm_verified_at timestamptz,
    progress_attachment text,
    CONSTRAINT project_milestones_progress_attachment_length CHECK (char_length(progress_attachment) <= 255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_milestones_pkey PRIMARY KEY (id),
    CONSTRAINT project_milestones_mep_id_fkey FOREIGN KEY (mep_id) REFERENCES mep_engineers (id) ON DELETE CASCADE,
    CONSTRAINT project_milestones_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_milestones_structural_id_fkey FOREIGN KEY (structural_id) REFERENCES structural_engineers (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- project_schedules  (legacy table: `project_schedules`)
-- The schedule for one phase of a project.
-- --------------------------------------------------------------------------
CREATE TABLE project_schedules (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    phase_slug text NOT NULL,
    CONSTRAINT project_schedules_phase_slug_length CHECK (char_length(phase_slug) <= 255),
    target_start_date date,
    target_end_date date,
    original_target_end_date date,
    shifted_days integer NOT NULL DEFAULT 0,
    actual_start_date date,
    actual_end_date date,
    progress_percentage integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending',
    CONSTRAINT project_schedules_status_length CHECK (char_length(status) <= 255),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_schedules_pkey PRIMARY KEY (id),
    CONSTRAINT project_schedules_project_id_phase_slug_key UNIQUE (project_id, phase_slug),
    CONSTRAINT project_schedules_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- project_activity_logs  (legacy table: `project_activity_logs`)
-- The project activity feed.
-- --------------------------------------------------------------------------
CREATE TABLE project_activity_logs (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    user_id bigint NOT NULL,
    action text NOT NULL,
    CONSTRAINT project_activity_logs_action_length CHECK (char_length(action) <= 255),
    details text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_activity_logs_pkey PRIMARY KEY (id),
    CONSTRAINT project_activity_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX project_activity_logs_project_created_idx ON project_activity_logs (project_id, created_at);

-- --------------------------------------------------------------------------
-- project_comments  (legacy table: `project_comments`)
-- Threaded project comments.
-- --------------------------------------------------------------------------
CREATE TABLE project_comments (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    user_id bigint NOT NULL,
    parent_id bigint,
    message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_comments_pkey PRIMARY KEY (id),
    CONSTRAINT project_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES project_comments (id) ON DELETE CASCADE,
    CONSTRAINT project_comments_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- project_documents  (legacy table: `project_documents`)
-- Uploaded project documents, versioned.
-- --------------------------------------------------------------------------
CREATE TABLE project_documents (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    uploader_id bigint NOT NULL,
    parent_id bigint,
    file_name text NOT NULL,
    CONSTRAINT project_documents_file_name_length CHECK (char_length(file_name) <= 255),
    description text,
    version integer NOT NULL DEFAULT 1,
    file_path text NOT NULL,
    CONSTRAINT project_documents_file_path_length CHECK (char_length(file_path) <= 255),
    category text,
    CONSTRAINT project_documents_category_length CHECK (char_length(category) <= 50),
    target_role text,
    CONSTRAINT project_documents_target_role_length CHECK (char_length(target_role) <= 50),
    status text,
    CONSTRAINT project_documents_status_length CHECK (char_length(status) <= 50),
    review_note text,
    reviewed_at timestamptz,
    version_label text,
    CONSTRAINT project_documents_version_label_length CHECK (char_length(version_label) <= 255),
    file_type text,
    CONSTRAINT project_documents_file_type_length CHECK (char_length(file_type) <= 255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_documents_pkey PRIMARY KEY (id),
    CONSTRAINT project_documents_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES project_documents (id) ON DELETE CASCADE,
    CONSTRAINT project_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_documents_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES users (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- project_images  (legacy table: `project_images`)
-- Project images with a sort order.
-- --------------------------------------------------------------------------
CREATE TABLE project_images (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    image_path text NOT NULL,
    CONSTRAINT project_images_image_path_length CHECK (char_length(image_path) <= 255),
    sort_order smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_images_pkey PRIMARY KEY (id),
    CONSTRAINT project_images_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- project_daily_logs  (legacy table: `project_daily_logs`)
-- Daily site logs.
-- --------------------------------------------------------------------------
CREATE TABLE project_daily_logs (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    user_id bigint NOT NULL,
    log_date date NOT NULL,
    weather text NOT NULL DEFAULT 'sunny',
    CONSTRAINT project_daily_logs_weather_length CHECK (char_length(weather) <= 255),
    worker_count integer NOT NULL DEFAULT 0,
    activities text NOT NULL,
    issues text,
    photos jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_daily_logs_pkey PRIMARY KEY (id),
    CONSTRAINT project_daily_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_daily_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX project_daily_logs_project_id_log_date_index ON project_daily_logs (project_id, log_date);

-- --------------------------------------------------------------------------
-- project_delays  (legacy table: `project_delays`)
-- Logged schedule delays.
-- --------------------------------------------------------------------------
CREATE TABLE project_delays (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    phase_slug text NOT NULL,
    CONSTRAINT project_delays_phase_slug_length CHECK (char_length(phase_slug) <= 255),
    days integer NOT NULL,
    reason text NOT NULL,
    CONSTRAINT project_delays_reason_length CHECK (char_length(reason) <= 255),
    category text NOT NULL DEFAULT 'external',
    CONSTRAINT project_delays_category_length CHECK (char_length(category) <= 255),
    logged_at date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_delays_pkey PRIMARY KEY (id),
    CONSTRAINT project_delays_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- project_reports  (legacy table: `project_reports`)
-- Published progress reports. 'summary' was a MySQL LONGTEXT and becomes text; 'site_photos' and 'attachments' are jsonb.
-- --------------------------------------------------------------------------
CREATE TABLE project_reports (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    phase_slug text,
    CONSTRAINT project_reports_phase_slug_length CHECK (char_length(phase_slug) <= 255),
    created_by bigint NOT NULL,
    summary text,
    progress_percentage integer NOT NULL DEFAULT 0,
    budget_health budget_health NOT NULL DEFAULT 'on_track',
    site_photos jsonb,
    attachments jsonb,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_reports_pkey PRIMARY KEY (id),
    CONSTRAINT project_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT project_reports_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX project_reports_project_id_published_at_index ON project_reports (project_id, published_at);

-- --------------------------------------------------------------------------
-- project_timeline_extensions  (legacy table: `project_timeline_extensions`)
-- A request to extend the project timeline.
-- --------------------------------------------------------------------------
CREATE TABLE project_timeline_extensions (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    requester_id bigint NOT NULL,
    reason text NOT NULL,
    CONSTRAINT project_timeline_extensions_reason_length CHECK (char_length(reason) <= 255),
    description text,
    days_requested integer NOT NULL,
    status project_timeline_extensions_status NOT NULL DEFAULT 'proposed',
    original_deadline date NOT NULL,
    new_deadline_date date,
    pm_notes text,
    owner_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_timeline_extensions_pkey PRIMARY KEY (id),
    CONSTRAINT project_timeline_extensions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_timeline_extensions_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE NO ACTION
);

-- --------------------------------------------------------------------------
-- project_terminations  (legacy table: `project_terminations`)
-- A mutual termination request.
-- --------------------------------------------------------------------------
CREATE TABLE project_terminations (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    initiator_id bigint NOT NULL,
    reason text NOT NULL,
    settlement_terms text,
    status project_terminations_status NOT NULL DEFAULT 'pending',
    resolution_notes text,
    resolved_by_id bigint,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_terminations_pkey PRIMARY KEY (id),
    CONSTRAINT project_terminations_initiator_id_fkey FOREIGN KEY (initiator_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT project_terminations_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_terminations_resolved_by_id_fkey FOREIGN KEY (resolved_by_id) REFERENCES users (id) ON DELETE SET NULL
);

-- --------------------------------------------------------------------------
-- project_disputes  (legacy table: `project_disputes`)
-- A dispute. 'status' and 'resolution' were VARCHARs and become native
-- enums (ADR-0007): they are the state machine that gates every money
-- movement (MONEY.md section 8).
--
-- 'payment_type' was a CLASS NAME and becomes a registry key
-- ('payment_type_id'), for the same reason the ledger's 'reference_model'
-- does (ADR-0013).
-- --------------------------------------------------------------------------
CREATE TABLE project_disputes (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    opened_by bigint NOT NULL,
    termination_id bigint,
    resolved_by bigint,
    category text NOT NULL,
    CONSTRAINT project_disputes_category_length CHECK (char_length(category) <= 40),
    title text NOT NULL,
    CONSTRAINT project_disputes_title_length CHECK (char_length(title) <= 255),
    description text NOT NULL,
    status dispute_status NOT NULL DEFAULT 'open',
    disputed_amount numeric(24,2),
    -- Was a polymorphic model NAME (payment_type). It is now a registry key:,
    -- a smallint cannot be spelled two ways, which is the whole point of,
    -- ADR-0013.,
    payment_type_id smallint REFERENCES ledger_reference_types (id),
    payment_id bigint,
    resolution dispute_resolution,
    resolution_notes text,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_disputes_pkey PRIMARY KEY (id),
    CONSTRAINT project_disputes_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES users (id) ON DELETE NO ACTION,
    CONSTRAINT project_disputes_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_disputes_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT project_disputes_termination_id_fkey FOREIGN KEY (termination_id) REFERENCES project_terminations (id) ON DELETE SET NULL
);

CREATE INDEX project_disputes_category_index ON project_disputes (category);
CREATE INDEX project_disputes_project_id_status_index ON project_disputes (project_id, status);
CREATE INDEX project_disputes_status_index ON project_disputes (status);

-- --------------------------------------------------------------------------
-- dispute_messages  (legacy table: `dispute_messages`)
-- Messages and evidence inside a dispute.
-- --------------------------------------------------------------------------
CREATE TABLE dispute_messages (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    dispute_id bigint NOT NULL,
    user_id bigint NOT NULL,
    body text NOT NULL,
    evidence_path text,
    CONSTRAINT dispute_messages_evidence_path_length CHECK (char_length(evidence_path) <= 255),
    evidence_original_name text,
    CONSTRAINT dispute_messages_evidence_original_name_length CHECK (char_length(evidence_original_name) <= 255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dispute_messages_pkey PRIMARY KEY (id),
    CONSTRAINT dispute_messages_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES project_disputes (id) ON DELETE CASCADE,
    CONSTRAINT dispute_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE NO ACTION
);

CREATE INDEX dispute_messages_dispute_id_created_at_index ON dispute_messages (dispute_id, created_at);

-- --------------------------------------------------------------------------
-- project_warranty_claims  (legacy table: `project_warranty_claims`)
-- A warranty claim after hand-over.
-- --------------------------------------------------------------------------
CREATE TABLE project_warranty_claims (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    reporter_id bigint NOT NULL,
    title text NOT NULL,
    CONSTRAINT project_warranty_claims_title_length CHECK (char_length(title) <= 255),
    description text NOT NULL,
    images jsonb,
    status project_warranty_claims_status NOT NULL DEFAULT 'open',
    cost_impact numeric(24,2) NOT NULL DEFAULT 0.00,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_warranty_claims_pkey PRIMARY KEY (id),
    CONSTRAINT project_warranty_claims_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_warranty_claims_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE NO ACTION
);

-- --------------------------------------------------------------------------
-- project_snag_items  (legacy table: `project_snag_items`)
-- Snag (defect) items and their severity.
-- --------------------------------------------------------------------------
CREATE TABLE project_snag_items (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    title text NOT NULL,
    CONSTRAINT project_snag_items_title_length CHECK (char_length(title) <= 255),
    description text,
    location text,
    CONSTRAINT project_snag_items_location_length CHECK (char_length(location) <= 255),
    severity severity NOT NULL DEFAULT 'minor',
    photos jsonb,
    status project_snag_items_status NOT NULL DEFAULT 'open',
    due_at timestamptz,
    escalated_at timestamptz,
    assigned_role text,
    CONSTRAINT project_snag_items_assigned_role_length CHECK (char_length(assigned_role) <= 50),
    reported_by bigint NOT NULL,
    resolved_at timestamptz,
    resolution_note text,
    resolution_photos jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_snag_items_pkey PRIMARY KEY (id),
    CONSTRAINT project_snag_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_snag_items_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES users (id) ON DELETE NO ACTION
);

CREATE INDEX project_snag_items_due_at_fk_support ON project_snag_items (due_at);
CREATE INDEX project_snag_items_due_at_idx ON project_snag_items (due_at);
CREATE INDEX project_snag_items_escalated_at_fk_support ON project_snag_items (escalated_at);
CREATE INDEX project_snag_items_escalated_at_idx ON project_snag_items (escalated_at);
CREATE INDEX project_snag_items_project_id_status_index ON project_snag_items (project_id, status);

-- --------------------------------------------------------------------------
-- project_external_vendors  (legacy table: `project_external_vendors`)
-- An external vendor hired for a phase.
-- --------------------------------------------------------------------------
CREATE TABLE project_external_vendors (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    team_member_id bigint,
    phase_role phase_role NOT NULL,
    company_name text,
    CONSTRAINT project_external_vendors_company_name_length CHECK (char_length(company_name) <= 255),
    contact_person text NOT NULL,
    CONSTRAINT project_external_vendors_contact_person_length CHECK (char_length(contact_person) <= 255),
    phone_number text NOT NULL,
    CONSTRAINT project_external_vendors_phone_number_length CHECK (char_length(phone_number) <= 255),
    email text,
    CONSTRAINT project_external_vendors_email_length CHECK (char_length(email) <= 255),
    agreed_fee numeric(24,2),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_external_vendors_pkey PRIMARY KEY (id),
    CONSTRAINT project_external_vendors_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_external_vendors_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES team_members (id) ON DELETE SET NULL
);

-- --------------------------------------------------------------------------
-- project_sub_professionals  (legacy table: `project_sub_professionals`)
-- A sub-contractor assignment under a parent professional.
-- --------------------------------------------------------------------------
CREATE TABLE project_sub_professionals (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    user_id bigint NOT NULL,
    parent_role parent_role,
    sub_role text NOT NULL,
    CONSTRAINT project_sub_professionals_sub_role_length CHECK (char_length(sub_role) <= 50),
    assigned_by bigint NOT NULL,
    status project_sub_professionals_status DEFAULT 'invited',
    rate numeric(24,2) NOT NULL DEFAULT 0.00,
    scope_notes text,
    lead_pro_notes text,
    suggested_fee numeric(24,2),
    accepted_at timestamptz,
    recommended_at timestamptz,
    hired_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_sub_professionals_pkey PRIMARY KEY (id),
    CONSTRAINT unique_project_sub UNIQUE (project_id, user_id, sub_role),
    CONSTRAINT project_sub_professionals_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT project_sub_professionals_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_sub_professionals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_project_status ON project_sub_professionals (project_id, status);
CREATE INDEX idx_user_role ON project_sub_professionals (user_id, sub_role);

-- --------------------------------------------------------------------------
-- project_change_orders  (legacy table: `project_change_orders`)
-- A change order request and its cost impact.
-- --------------------------------------------------------------------------
CREATE TABLE project_change_orders (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    requested_by bigint NOT NULL,
    role_type text,
    CONSTRAINT project_change_orders_role_type_length CHECK (char_length(role_type) <= 255),
    title text NOT NULL,
    CONSTRAINT project_change_orders_title_length CHECK (char_length(title) <= 255),
    description text NOT NULL,
    cost_impact numeric(24,2) NOT NULL DEFAULT 0.00,
    time_impact_days integer NOT NULL DEFAULT 0,
    status project_change_orders_status NOT NULL DEFAULT 'proposed',
    pm_notes text,
    owner_notes text,
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    milestone_id bigint,
    CONSTRAINT project_change_orders_pkey PRIMARY KEY (id),
    CONSTRAINT project_change_orders_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES project_milestones (id) ON DELETE SET NULL,
    CONSTRAINT project_change_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_change_orders_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users (id) ON DELETE NO ACTION
);

CREATE INDEX project_change_orders_project_id_status_index ON project_change_orders (project_id, status);

-- --------------------------------------------------------------------------
-- project_material_folders  (legacy table: `project_material_folders`)
-- A folder grouping the project's material requirements.
-- --------------------------------------------------------------------------
CREATE TABLE project_material_folders (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    name text NOT NULL,
    CONSTRAINT project_material_folders_name_length CHECK (char_length(name) <= 255),
    bom_type text NOT NULL DEFAULT 'raw',
    CONSTRAINT project_material_folders_bom_type_length CHECK (char_length(bom_type) <= 255),
    created_by bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_material_folders_pkey PRIMARY KEY (id),
    CONSTRAINT project_material_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT project_material_folders_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- project_requirements  (legacy table: `project_requirements`)
-- A material requirement (BOM line).
-- --------------------------------------------------------------------------
CREATE TABLE project_requirements (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    name text NOT NULL,
    CONSTRAINT project_requirements_name_length CHECK (char_length(name) <= 255),
    bom_type bom_type NOT NULL DEFAULT 'raw',
    quantity_required numeric(15,2) NOT NULL,
    estimated_unit_cost numeric(24,2),
    quantity_on_site numeric(15,2) NOT NULL DEFAULT 0.00,
    quantity_used numeric(15,2) NOT NULL DEFAULT 0.00,
    quantity_procured_externally numeric(15,2) NOT NULL DEFAULT 0.00,
    external_cost numeric(24,2) NOT NULL DEFAULT 0.00,
    unit text NOT NULL,
    CONSTRAINT project_requirements_unit_length CHECK (char_length(unit) <= 255),
    quality_level quality_level NOT NULL DEFAULT 'standard',
    image_path text,
    CONSTRAINT project_requirements_image_path_length CHECK (char_length(image_path) <= 255),
    notes text,
    purpose text,
    category project_requirements_category NOT NULL DEFAULT 'general',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    user_id bigint,
    folder_id bigint,
    CONSTRAINT project_requirements_pkey PRIMARY KEY (id),
    CONSTRAINT project_requirements_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES project_material_folders (id) ON DELETE SET NULL,
    CONSTRAINT project_requirements_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_requirements_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- --------------------------------------------------------------------------
-- project_requirement_histories  (legacy table: `project_requirement_histories`)
-- The restock/use history of a requirement.
-- --------------------------------------------------------------------------
CREATE TABLE project_requirement_histories (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_requirement_id bigint NOT NULL,
    user_id bigint,
    type requirement_history_type NOT NULL,
    quantity numeric(24,2) NOT NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_requirement_histories_pkey PRIMARY KEY (id),
    CONSTRAINT project_requirement_histories_project_requirement_id_fkey FOREIGN KEY (project_requirement_id) REFERENCES project_requirements (id) ON DELETE CASCADE,
    CONSTRAINT project_requirement_histories_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- --------------------------------------------------------------------------
-- project_procurement_requests  (legacy table: `project_procurement_requests`)
-- A procurement request for a requirement.
-- --------------------------------------------------------------------------
CREATE TABLE project_procurement_requests (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    requirement_id bigint NOT NULL,
    requested_by bigint NOT NULL,
    quantity_needed numeric(18,2) NOT NULL,
    estimated_unit_cost numeric(24,2),
    estimated_cost numeric(24,2),
    message text,
    offer_to_buy boolean NOT NULL DEFAULT false,
    status project_procurement_requests_status NOT NULL DEFAULT 'pending_pm',
    pm_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_procurement_requests_pkey PRIMARY KEY (id),
    CONSTRAINT project_procurement_requests_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_procurement_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT project_procurement_requests_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES project_requirements (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- project_addendums  (legacy table: `project_addendums`)
-- An addendum - an extra fee, or a specialist assignment.
--
-- 'recommended_bid_type' was a free-text role name ('notaris',
-- 'structural') and becomes the 'bid_role' enum (ADR-0013).
-- 'recommended_bid_id' points at the legacy per-role bid tables, so it is
-- left unconstrained here: after the unified 'bids' table lands it points
-- at 'bids.id', and the backfill is what resolves it.
--
-- NOTE: ADR-0013 records that 'project_addendums.status' has no 'refunded'
-- member, so a dispute refund against an addendum is a hard error AFTER the
-- money moved. The enum below is the legacy list, unchanged, because the
-- enum vocabulary is generated from the live database; the missing value
-- is a separate migration in the rewrite track, and it is listed in
-- docs/POSTGRES-SCHEMA.md as a known defect carried forward.
-- --------------------------------------------------------------------------
CREATE TABLE project_addendums (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    type text NOT NULL DEFAULT 'extra_fee',
    CONSTRAINT project_addendums_type_length CHECK (char_length(type) <= 255),
    role_type text NOT NULL,
    CONSTRAINT project_addendums_role_type_length CHECK (char_length(role_type) <= 255),
    user_id bigint,
    team_member_id bigint,
    specialist_type text,
    CONSTRAINT project_addendums_specialist_type_length CHECK (char_length(specialist_type) <= 255),
    title text NOT NULL,
    CONSTRAINT project_addendums_title_length CHECK (char_length(title) <= 255),
    description text,
    negotiation_note text,
    attachment_path text,
    CONSTRAINT project_addendums_attachment_path_length CHECK (char_length(attachment_path) <= 255),
    amount numeric(24,2) NOT NULL,
    counter_offer_amount numeric(24,2),
    recommended_bid_id bigint,
    recommended_bid_type bid_role,
    status project_addendums_status DEFAULT 'pending_approval',
    payment_proof_path text,
    CONSTRAINT project_addendums_payment_proof_path_length CHECK (char_length(payment_proof_path) <= 255),
    verification_notes text,
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    procurement_request_id bigint,
    assigned_user_id bigint,
    refunded_amount numeric(24,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT project_addendums_pkey PRIMARY KEY (id),
    CONSTRAINT project_addendums_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT project_addendums_procurement_request_id_fkey FOREIGN KEY (procurement_request_id) REFERENCES project_procurement_requests (id) ON DELETE SET NULL,
    CONSTRAINT project_addendums_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_addendums_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES team_members (id) ON DELETE SET NULL,
    CONSTRAINT project_addendums_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX project_addendums_recommended_bid_id_fk_support ON project_addendums (recommended_bid_id);
CREATE INDEX project_addendums_recommended_bid_idx ON project_addendums (recommended_bid_id);

-- --------------------------------------------------------------------------
-- project_payment_termins  (legacy table: `project_payment_termins`)
-- A payment stage. THE MOST MONEY-CRITICAL STATE MACHINE IN THE APPLICATION,
-- and it was an unconstrained VARCHAR(255) until now.
--
-- 'status' becomes the 'payment_termin_status' enum (ADR-0007): locked,
-- pending, invoice_sent, verifying, accepted, paid, void.
--
-- THE RETENTION SPLIT
-- ------------------
--   retention_amount + net_amount = amount   EXACTLY (MONEY.md section 6)
--
-- The split is written AT INSERT and is never recomputed - a later rate
-- change must not move an agreed net. That is why all three columns are
-- NOT NULL with a zero default rather than nullable: a half-written split
-- (net 0, retention > 0) is corruption, and it is visible as a constraint
-- violation rather than as a silent misreading.
-- --------------------------------------------------------------------------
CREATE TABLE project_payment_termins (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    role_type text,
    CONSTRAINT project_payment_termins_role_type_length CHECK (char_length(role_type) <= 255),
    recipient_id bigint,
    label text NOT NULL,
    CONSTRAINT project_payment_termins_label_length CHECK (char_length(label) <= 255),
    percentage numeric(5,2) NOT NULL DEFAULT 0.00,
    amount numeric(24,2) NOT NULL DEFAULT 0.00,
    retention_amount numeric(24,2) NOT NULL DEFAULT 0.00,
    retention_released_at timestamptz,
    retention_released_amount numeric(24,2),
    net_amount numeric(24,2) NOT NULL DEFAULT 0.00,
    trigger_description text,
    CONSTRAINT project_payment_termins_trigger_description_length CHECK (char_length(trigger_description) <= 255),
    status payment_termin_status NOT NULL DEFAULT 'locked',
    payment_proof_path text,
    CONSTRAINT project_payment_termins_payment_proof_path_length CHECK (char_length(payment_proof_path) <= 255),
    verification_notes text,
    milestone_id bigint,
    change_order_id bigint,
    paid_at timestamptz,
    notes text,
    retention_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    refunded_amount numeric(24,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT project_payment_termins_pkey PRIMARY KEY (id),
    CONSTRAINT payment_termin_change_order_key UNIQUE (change_order_id),
    CONSTRAINT project_payment_termins_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES project_change_orders (id) ON DELETE SET NULL,
    CONSTRAINT project_payment_termins_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES project_milestones (id) ON DELETE SET NULL,
    CONSTRAINT project_payment_termins_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT project_payment_termins_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE SET NULL,
    -- MONEY.md section 6: the split is exact. The check IS the invariant; the,
    -- application writes it at insert and never recomputes it.,
    CONSTRAINT ppt_retention_split_exact CHECK (retention_amount + net_amount = amount),
    -- A termin may not be negative.,
    CONSTRAINT ppt_amount_non_negative CHECK (amount >= 0)
);

CREATE INDEX project_payment_termins_role_type_index ON project_payment_termins (role_type);
CREATE INDEX project_payment_termins_status_idx ON project_payment_termins (status);
CREATE INDEX project_payment_termins_project_status_idx ON project_payment_termins (project_id, status);

-- --------------------------------------------------------------------------
-- project_budget_sandbox  (legacy table: `project_budget_sandbox`)
-- A what-if budget estimate, separate from the real ceiling.
-- --------------------------------------------------------------------------
CREATE TABLE project_budget_sandbox (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    title text NOT NULL,
    CONSTRAINT project_budget_sandbox_title_length CHECK (char_length(title) <= 255),
    estimated_amount numeric(24,2) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_budget_sandbox_pkey PRIMARY KEY (id),
    CONSTRAINT project_budget_sandbox_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- arsitek_ratings  (legacy table: `arsitek_ratings`)
-- A rating of an architect on a project.
-- --------------------------------------------------------------------------
CREATE TABLE arsitek_ratings (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    reviewer_id bigint NOT NULL,
    arsitek_id bigint NOT NULL,
    rating integer NOT NULL,
    komentar text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT arsitek_ratings_pkey PRIMARY KEY (id),
    CONSTRAINT arsitek_ratings_arsitek_id_fkey FOREIGN KEY (arsitek_id) REFERENCES arsiteks (id) ON DELETE CASCADE,
    CONSTRAINT arsitek_ratings_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT arsitek_ratings_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- kontraktor_ratings  (legacy table: `kontraktor_ratings`)
-- A rating of a contractor on a project.
-- --------------------------------------------------------------------------
CREATE TABLE kontraktor_ratings (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    reviewer_id bigint NOT NULL,
    kontraktor_id bigint NOT NULL,
    rating integer NOT NULL,
    komentar text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kontraktor_ratings_pkey PRIMARY KEY (id),
    CONSTRAINT kontraktor_ratings_kontraktor_id_fkey FOREIGN KEY (kontraktor_id) REFERENCES kontraktors (id) ON DELETE CASCADE,
    CONSTRAINT kontraktor_ratings_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT kontraktor_ratings_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- notaris_ratings  (legacy table: `notaris_ratings`)
-- A rating of a notary on a project.
-- --------------------------------------------------------------------------
CREATE TABLE notaris_ratings (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    reviewer_id bigint NOT NULL,
    notaris_id bigint NOT NULL,
    rating integer NOT NULL,
    komentar text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notaris_ratings_pkey PRIMARY KEY (id),
    CONSTRAINT notaris_ratings_notaris_id_fkey FOREIGN KEY (notaris_id) REFERENCES notaris_profiles (id) ON DELETE CASCADE,
    CONSTRAINT notaris_ratings_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT notaris_ratings_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- interior_ratings  (legacy table: `interior_ratings`)
-- A rating of an interior designer on a project.
-- --------------------------------------------------------------------------
CREATE TABLE interior_ratings (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    reviewer_id bigint NOT NULL,
    interior_id bigint NOT NULL,
    rating integer NOT NULL,
    komentar text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT interior_ratings_pkey PRIMARY KEY (id),
    CONSTRAINT interior_ratings_interior_id_fkey FOREIGN KEY (interior_id) REFERENCES interior_profiles (id) ON DELETE CASCADE,
    CONSTRAINT interior_ratings_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT interior_ratings_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------
-- p_m_ratings  (legacy table: `p_m_ratings`)
-- A rating of a project manager on a project.
-- --------------------------------------------------------------------------
CREATE TABLE p_m_ratings (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    project_id bigint NOT NULL,
    user_id bigint NOT NULL,
    pm_id bigint NOT NULL,
    rating integer NOT NULL,
    komentar text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT p_m_ratings_pkey PRIMARY KEY (id),
    CONSTRAINT p_m_ratings_pm_id_fkey FOREIGN KEY (pm_id) REFERENCES project_managers (id) ON DELETE CASCADE,
    CONSTRAINT p_m_ratings_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT p_m_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
