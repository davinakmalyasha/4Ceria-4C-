# Domain model

Marketplace where **owners** post construction/renovation projects and hire verified professionals per role, with escrow-style milestone payments — plus a materials marketplace with courier logistics and a house sale marketplace.

## Actors & roles

`users.role_type`: `user` (owner/client) | professional roles: `arsitek`, `kontraktor`, `notaris`, `interior`, `structural`, `mep`, `project_manager`, `supplier`, `logistics`, plus sub-roles (`civil`, `mechanical`, `electrical`, `plumbing`, `roofing`, `finishing`). Admins exist via Spatie role + `role_type='admin'`.

Each professional role has a profile table (`Arsitek`, `KontraktorProfile`, `NotarisProfile`, `InteriorProfile`, `StructuralProfile`, `MepProfile`, `ProjectManager`) keyed by `user_id`. Ratings live in per-role rating tables.

**ID convention trap**: bid tables store the *profile* id (e.g. `bids_arsitek.arsitek_id → arsitek.id`), but `projects.pm_id` and `projects.selected_*_id` columns mix conventions: `pm_id` = **user id**, while `selected_arsitek_id` etc. = **profile ids**.

## Project lifecycle

Statuses flow: `open → accepted_kontraktor/planning → in_progress → awaiting_payment → contract_pending … completed | cancelled | terminated`. Key gates:

1. Owner publishes project (+ optional bidding brief / published roles JSON).
2. Professionals **bid** via 7 parallel tables: `bids_arsitek`, `bids_kontraktor`, `bids_notaris`, `bids_interior`, `bids_project_manager`, `bids_structural`, `bids_mep`.
3. Shortlist → **accept-bid** (`ProjectController::acceptBid`) sets `selected_<role>_id`, status `contract_pending`; PM-recommendation may be required when a PM is assigned.
4. Fee negotiation rounds recorded in `bid_negotiation_logs` (cap ~5, alternation enforced on one of two endpoints).
5. **sign-contract**: professional signs, then client signs (`clientSignContract`) → SPK snapshot written to private storage (`ProjectContractService`) → `awaiting_payment`.
6. Payment termins (DP + progress splits, percentages must sum to 100) verified through proof upload/approval; ledger rows land in `project_budget_transactions`.
7. Milestones (`project_milestones`) drive phase work; approval can unlock linked termins.
8. Handover: snag list → BAST → owner acceptance → warranty period (`project_warranty_claims`).

## Money flow

- Escrow-like semantics without a wallet table: `projects.budget` minus ledger = available; every debit inserts a `project_budget_transactions` row (reference_model/reference_id dedup — *no unique index yet*, race documented in audits).
- Termin statuses: `locked → pending → invoice_sent → verifying → paid`. Proof upload by payer; verification by counterparty or PM.
- Addendums/change-orders create extra budget authorizations; procurement requests route pro→PM→owner with cost estimates.
- Materials marketplace: quotes (`material_quotes`) → orders (`material_orders`, unique `whatsapp_order_id`) → delivery jobs (`delivery_jobs`) → reviews. Stock decremented once via flag.

## Collaboration surfaces

- Chat: `conversations` (unique user pair) + `chat_messages`; unread counters cached in Redis (`forever` keys — see audit note), mirrored in DB counts.
- Notifications: single `notifications` table (one row per chat message too); read state via `read_at`.
- Firms & teams: `firm_members` (owner↔specialist, state machine invited/requested/active/removed) and `team_members`; sub-professionals attach to projects (`project_sub_professionals`).
- Activity log: nearly every action writes `project_activity_logs`.
- Public surfaces: professional directories (sanitized), house listings + Q&A, share-token construction brief (`projects.share_token`, budget stripped).

## Houses

Legacy-shaped tables restored by migration: `house`, `rooms`, `house_pic`, `rooms_pic`, `house_questions`, `house_answers` (public Q&A). Owner = `house.id_user`. Admin suspension via `is_suspended`.
