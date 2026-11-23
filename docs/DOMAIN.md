# Domain

## Actors

| Role | What they do |
|---|---|
| `user` | Project owner: posts projects and properties, hires, approves milestones, pays |
| `arsitek` | Design, brief, design package, construction supervision |
| `kontraktor` | Builds; may hire sub-contractors (`civil`, `mechanical`, `electrical`, `plumbing`, `roofing`, `finishing`) |
| `mep` / `structural` | Specialist engineering |
| `interior` | Interior design and fit-out |
| `notaris` | Legal, notary and PPAT work |
| `project_manager` | Runs the owner's project and reviews proposals |
| `supplier` | Storefront, catalogue, quotes, orders, delivery jobs |
| `logistics` | Courier; Job Radar and delivery status |
| `admin` | Moderation, verification, disputes |

A professional can be hired in more than one role on different projects. The
`selected_*` columns on `projects` store **profile** ids (`arsiteks.id`,
`kontraktors.id`, …), not user ids.

## Project lifecycle

`project_status`: `open` → `accepted_arsitek` / `accepted_kontraktor` →
`awaiting_payment` → `in_progress` → `completed_build` → `completed`.
`legal` and `procurement` are phase gates; `termination_pending` freezes the
workspace while a mutual termination is negotiated; `cancelled` is terminal.

A project has:

- a brief, location, dimensions, budget and needed professional roles;
- a Bidding Board (`bids`, one row per role and bidder);
- contracts with milestone/terminin schedules;
- milestones, daily logs, documents, reports, snags and change orders;
- an escrow ledger (see `MONEY.md`);
- optional disputes, warranty claims and handover records.

## Bid flow

1. The owner publishes a project (`open`) or invites a professional.
2. A verified professional submits `price`, `proposal`, `estimated_duration`
   and `duration_unit`. `fee_type` may be fixed or percentage; the API rejects
   a bid for a role that is already filled or not requested.
3. The owner/PM shortlists, negotiates and accepts. Acceptance writes the
   `selected_*` column and creates the contract state.
4. The professional signs the contract (termins summing to 100%, milestones,
   bank details, signature). The owner countersigns.
5. Milestones are submitted, reviewed and approved; approved work becomes
   payable through the escrow ledger.

Bid statuses: `pending`, `shortlisted`, `invited`, `negotiating`,
`contract_pending`, `awaiting_payment`, `accepted`, `active`, `rejected`,
`declined`, `terminated`, `resigned`, `recommended`.

## Disputes

A dispute is opened against a project and optionally a specific payment. While
any dispute is `open`, every payment path is frozen (`FreezeGate`). An admin
resolves it as `release_payment`, `dismiss`, `record_refund` or
`terminate_project`; resolution unfreezes the project. The database enforces at
most one open dispute per project (partial unique index).

## Marketplace

- A supplier has one store and many materials.
- A buyer requests a quote; the supplier prices it; the buyer approves it and
  uploads payment proof; the supplier verifies and creates a delivery job.
- A courier accepts a job from Job Radar, updates its status and delivers.
- Reviews are written after completion and are visible on the supplier page.

## Firm workspace

Architects and contractors can own a firm, invite members, assign roles
(`parent_role` plus a sub-role) and publish a public firm profile. Specialist
roles join a firm; the roster is the source for sub-contractor assignment.

## Property marketplace

Owners list houses with photos, rooms, dimensions, address and coordinates.
Anyone can browse; a signed-in viewer can favourite a listing and ask the owner
a question. The owner can answer from the listing detail page.
