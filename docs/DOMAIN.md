# Domain model

Marketplace where **owners** post construction/renovation projects and hire verified professionals per role, with escrow-style milestone payments — plus a materials marketplace with courier logistics and a house sale marketplace.

## Actors & roles

`users.role_type`: `user` (owner/client) | professional roles: `arsitek`, `kontraktor`, `notaris`, `interior`, `structural`, `mep`, `project_manager`, `supplier`, `logistics`, plus sub-roles (`civil`, `mechanical`, `electrical`, `plumbing`, `roofing`, `finishing`). Admins exist via Spatie role + `role_type='admin'`.

Each professional role has a profile table (`Arsitek`, `Kontraktor`, `NotarisProfile`, `InteriorProfile`, `StructuralEngineer`, `MepEngineer`, `ProjectManager`) keyed by `user_id`. Ratings live in per-role rating tables.

**ID convention trap**: bid tables store the *profile* id (e.g. `bids_arsitek.arsitek_id → arsitek.id`), but `projects.pm_id` and `projects.selected_*_id` columns mix conventions: `pm_id` = **user id**, while `selected_arsitek_id` etc. = **profile ids**.

## Project lifecycle

`projects.status` is a **MySQL ENUM** — the only legal values are:
`open, accepted_arsitek, accepted_kontraktor, awaiting_payment, in_progress, termination_pending, legal, procurement, completed_build, completed, cancelled`.
Writing anything else is a hard error under strict mode. `termination_pending` (amicable exit) and the payment/contract states on the *bid* tables (`contract_pending`, `awaiting_payment`, `active`) are different things: bids have their own status enums. Check `SHOW COLUMNS FROM projects LIKE 'status'` before writing a status.

Statuses flow: `open → accepted_arsitek → accepted_kontraktor → awaiting_payment → in_progress → (legal | procurement) → completed_build → completed`, with `cancelled` reachable from a mutual termination or admin dispute arbitration, and `termination_pending` used while an amicable exit is under review. Key gates:

1. Owner publishes project (+ optional bidding brief / published roles JSON).
2. Professionals **bid** via 7 parallel tables: `bids_arsitek`, `bids_kontraktor`, `bids_notaris`, `bids_interior`, `bids_project_manager`, `bids_structural`, `bids_mep`.
3. Shortlist → **accept-bid** (`ProjectController::acceptBid`) sets `selected_<role>_id`, status `contract_pending`; PM-recommendation may be required when a PM is assigned.
4. Fee negotiation rounds recorded in `bid_negotiation_logs` (cap ~5, alternation enforced on one of two endpoints).
5. **sign-contract**: professional signs, then client signs (`clientSignContract`) → SPK snapshot written to private storage (`ProjectContractService`) → `awaiting_payment`.
6. Payment termins (DP + progress splits, percentages must sum to 100) verified through proof upload/approval; ledger rows land in `project_budget_transactions`.
7. Milestones (`project_milestones`) drive phase work; approval can unlock linked termins.
8. Handover: snag list → BAST → owner acceptance → warranty period (`project_warranty_claims`).

## Money flow

- **The money model (single source of truth: `ProjectFinancialService`).** `projects.budget` is the escrow CEILING, mutated by owner deposits/adjustments (which also write a ledger row for the audit trail). Every debit inserts a `project_budget_transactions` row; the unique index `budget_tx_reference_unique` on `(project_id, reference_model, reference_id, transaction_type)` allows exactly ONE row per (reference, type), which is what blocks a double-charge while still permitting a same-reference reversal of a different type.
- **Two different questions, three constants.** "How much left the account", "does this movement move the ceiling" and "how much reached the professional" are separate, and conflating them is how a client gets charged twice or not at all:
  - `DISBURSEMENT_TYPES` (`payment`, `refund`, `platform_fee`, `retention_release`) — everything that SPENT the escrow. `available = ceiling - SUM(these)`.
  - `CEILING_NEUTRAL_TYPES` — the same set. These are counted by `available` and must NOT also be applied to the `budget` column; doing both charges the client twice. Only `deposit` (raises) and `adjustment_down` (lowers) are structural and move the column.
  - `PROFESSIONAL_EARNINGS_TYPES` (`payment`, `refund`, `retention_release`) — feeds the PUBLIC `client_history.total_spent` on a professional's profile. Deliberately excludes `platform_fee`: that is the platform's revenue, not the professional's income.
- **Retention (D1/D2).** A termin stores a split at creation: `retention_amount` (held until the warranty expires) and `net_amount` (payable now), and `retention_amount + net_amount === amount` exactly. The termin payment debits the **net**; the release debits the **retention** later, as its own `retention_release` row. The type must be distinct from `payment` — the same `(reference, type)` tuple is already occupied by the termin's own payment, and reusing it made the release a silent no-op that still reported success. `RetentionService::forTermin()` READS the persisted split and never recomputes it, so a rate change cannot move a net the parties already agreed. Pre-D1 rows carry no split and fall back to the gross. Release is blocked by an open or `fixing` claim, is idempotent (every replica runs the schedule), and runs via `escrow:release-retention`.
- **Platform fee (E1).** `PlatformFeeService` records the fee as a SEPARATE `platform_fee` row sharing the payment's reference — never folded into the professional's fee — and only when the payment itself was written. It is **0% by default** (`ESCROW_PLATFORM_FEE_PERCENT`), which keeps the shipped product copy literally true.
- **Refund accounting**: `project_*` and `bids_*` payment tables carry `refunded_amount`; a dispute refund writes a negative `refund` row attributed to the PAYMENT (not the dispute) and accumulates that column, so a payment can be partially refunded and never over-refunded. `paid`/`refunded` are terminal states. `MaterialOrder` has no `payment_status`, so a refund flips its `status` ENUM instead — which is why `refunded` was appended to `material_orders.status`.
- Termin statuses: `locked → pending → invoice_sent → verifying → paid`, plus `void` (auto-set when the contract is fired/resigned so a departed professional cannot pull a debit).
- Payment proof is MANDATORY before verification: `verifyProof` requires `payment_proof_path` and a `verifying` state. Receipts live on the private `railway` disk and are served as presigned URLs (`ProjectResource::presignedPrivateUrl`).
- Addendums/change-orders create extra budget authorizations; a change order mints exactly ONE payment stage (`project_payment_termins.change_order_id` is UNIQUE) and cannot be re-approved.
- Materials marketplace: quotes (`material_quotes`) → orders (`material_orders`, unique `whatsapp_order_id`) → delivery jobs (`delivery_jobs`) → reviews. Stock decremented once via flag. Project-bound orders post to the same escrow ledger.

## Dispute / arbitration (`project_disputes` + `dispute_messages`)

- One **open** dispute per project (409 otherwise). While open, payment paths are frozen with 422: `upload-proof`, `verify-proof` (unless admin override), and `budget/mark-paid`. Freeze lifts when the dispute is resolved/dismissed/withdrawn.
- Opened by any project participant (`category` ∈ payment/quality/termination/delay/other) with an optional linked payment (`payment_type` + `payment_id`, termins chosen from the UI) and optional `disputed_amount`. A **rejected mutual termination escalates** into a dispute row (idempotent, links `termination_id`).
- Thread lives in `dispute_messages` (optional evidence on the private `railway` disk, served via temporaryUrl). Participants reply/withdraw while open; admins reply anytime.
- Admin arbitration closes with one of five actions: `dismiss` (unfreeze, nothing moves), `release_payment` (runs the full verifyProof accept path with `$adminOverride` — budget check, ledger, activation, notifications), `record_refund` (negative `payment` ledger row referenced by the dispute FQCN + underlying payment flipped to `refunded`; money moves off-platform), `terminate_project` (status `cancelled`), `custom` (free-form notes).
- `DisputeService::assertNoOpenDispute()` is the single freeze gate; `DisputePanel.tsx` (project workspace) self-hides on 403; `AdminDisputes.tsx` is the arbitration queue under `/admin/disputes`.

## Collaboration surfaces

- Chat: `conversations` (unique user pair) + `chat_messages`; unread counters cached in Redis (`forever` keys — see audit note), mirrored in DB counts.
- Notifications: single `notifications` table (one row per chat message too); read state via `read_at`.
- Firms & teams: `firm_members` (owner↔specialist, state machine invited/requested/active/removed) and `team_members`; sub-professionals attach to projects (`project_sub_professionals`).
- Activity log: nearly every action writes `project_activity_logs`.
- Public surfaces: professional directories (sanitized), house listings + Q&A, share-token construction brief (`projects.share_token`, budget stripped).

## Houses

Legacy-shaped tables restored by migration: `house`, `rooms`, `house_pic`, `rooms_pic`, `house_questions`, `house_answers` (public Q&A). Owner = `house.id_user`. Admin suspension via `is_suspended`.
