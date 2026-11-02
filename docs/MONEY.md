# The 4Ceria Money Model

**Status:** Active · **Supersedes:** the money sections of `docs/DOMAIN.md`
**Decisions:** ADR-0012 (integer minor units) · ADR-0013 (the reference registry) ·
ADR-0020 (the invariant lives in the database) · ADR-0022 (the post-parity money fix)

> `docs/DOMAIN.md` contains two known errors, both corrected here:
> 1. It says a dispute refund is "attributed to the PAYMENT (not the dispute)". It is
>    **inverted** — the refund's `reference_*` is the **dispute**, and `reverses_*` is
>    the payment (`internal/httpapi/disputes.go`, the refund branch of the admin action).
> 2. It says the unique index "allows exactly ONE `payment` and one `refund` per
>    referenced payment". Since `2026_09_29_000003` a refund's reference is the
>    **dispute**: one refund per dispute, any number against a payment.

---

## 1. The actors

| Actor | Role type | Bids in | Is paid by | Profile table |
|---|---|---|---|---|
| Owner | `user` | — | — | `users` |
| Architect | `arsitek` | `bids_arsitek` | the escrow | `arsiteks` |
| Contractor | `kontraktor` | `bids_kontraktor` | the escrow | `kontraktors` |
| Notary | `notaris` | `bids_notaris` | the escrow | `notaris_profiles` |
| Interior designer | `interior` | `bids_interior` | the escrow | `interior_profiles` |
| Structural engineer | `structural` | `bids_structural` | the escrow | `structural_engineers` |
| MEP engineer | `mep` | `bids_mep` | the escrow | `mep_engineers` |
| Project manager | `project_manager` | `bids_project_manager` | the escrow | `project_managers` |
| Supplier | `supplier` | — | the escrow (via quotes/orders) | `suppliers` |
| Courier | `logistics` | — | the platform (per delivery) | `courier_profiles` |
| Sub-contractors | `civil` `mechanical` `electrical` `plumbing` `roofing` `finishing` | via `project_sub_professionals` | the escrow (via addenda) | — |
| Admin | `admin` | — | — | — |

Every hired professional holds a **profile id** in its role's profile table. Every
`projects.selected_*` column holds a **profile id** (ADR-0015).

---

## 2. The three escrow type-lists

These are the vocabulary of the ledger. They answer **three different questions**, and
conflating them is how the balance went wrong four times.

| List | Members | The question it answers |
|---|---|---|
| **`DISBURSEMENT_TYPES`** | `payment`, `refund`, `platform_fee`, `retention_release` | *What left the escrow?* |
| **`CEILING_NEUTRAL_TYPES`** | `payment`, `refund`, `platform_fee`, `retention_release` | *What spent the escrow **without** moving the ceiling?* |
| **`PROFESSIONAL_EARNINGS_TYPES`** | `payment`, `refund`, `retention_release` | *What reached a professional?* |

Three consequences that are easy to get wrong:

- **`deposit` and `adjustment_down` are NOT disbursements.** They already moved
  `projects.budget`, so counting them again double-counts. This was the *"Add Funds
  shows Rp 150 M but the server refuses"* bug.
- **`refund` rows are NEGATIVE** and are part of the disbursement sum. Excluding them
  leaves refunded money permanently consumed.
- **`platform_fee` is NOT a professional earning.** It is the platform's revenue. The
  omission is deliberate and documented in `escrow.IsProfessionalEarning()`.

**`CEILING_NEUTRAL_TYPES` is the one that caused a double charge.** The old test was
`$type !== 'payment'`, which sent `platform_fee` and `retention_release` down the
ceiling-decrement branch as well as the disbursement branch — so the same rupiah was
subtracted twice: a 1 % fee on a 100 M project dropped the reported ceiling to 99 M
*and* the available balance to 98 M. The test is now a **membership** test.

---

## 3. Ceiling vs available

```
ceiling   = projects.budget                            -- the ESCROW CEILING (mutable)
outflow   = SUM(project_budget_transactions.amount)
            WHERE project_id = ?
              AND transaction_type IN ('payment','refund','platform_fee','retention_release')
available = ceiling - outflow
```

| Concept | Meaning | Read by |
|---|---|---|
| `ceiling` | The maximum the owner has committed. Moved by `deposit` (+) and `adjustment_down` (−) only. | `projects.budget` |
| `available` | What is actually still in the escrow. | `escrow.Service.Available()` |
| `committed` | **Informational only.** Money that is promised but not yet paid: addenda in (`approved_unpaid`, `pending_approval`, `verifying`) + termin stages in (`locked`, `pending`, `invoice_sent`). **Does not reduce `available`.** | `escrow.Service.Summary()` |
| `allocated` | `paid + committed` — how much of the ceiling is spoken for. | `escrow.Service.Summary()` |

**`available` is never computed from `projects.budget` directly.** `Service.Summary()` returns
**both** float keys (`total`, `paid`, `allocated`, `committed`, `remaining`,
`available`, `percent_used`) **and** exact integer keys (`*_cents`) **and** display
strings — and the key names are part of the API's wire contract.

---

## 4. The ledger

### 4.1 The table

```sql
CREATE TABLE project_budget_transactions (
    id                bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id        bigint       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    transaction_type  ledger_tx_type NOT NULL,
    amount            numeric(24,2) NOT NULL,
    title             text         NOT NULL,
    reference_type    ledger_ref_type NULL,   -- the registry key (ADR-0013)
    reference_id      bigint       NULL,
    reverses_type     ledger_ref_type NULL,   -- the row a reversal returns
    reverses_id       bigint       NULL,
    transaction_date  timestamptz  NOT NULL DEFAULT now(),
    actor_user_id     bigint       NULL REFERENCES users(id),
    actor_role        text         NULL,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT budget_tx_reference_unique
        UNIQUE NULLS NOT DISTINCT
            (project_id, reference_type, reference_id, transaction_type),
    CONSTRAINT pbt_reference_required CHECK (
        transaction_type IN ('deposit','adjustment_down')
        OR (reference_type IS NOT NULL AND reference_id IS NOT NULL)),
    CONSTRAINT pbt_amount_sign CHECK (
        (transaction_type = 'refund' AND amount < 0)
     OR (transaction_type <> 'refund' AND amount > 0))
);
```

> **`UNIQUE NULLS NOT DISTINCT` is required, not optional.** The structural rows
> (`deposit`, `adjustment_down`) carry **no** reference. Under PostgreSQL's default
> NULLS-DISTINCT semantics every deposit row would be mutually "unique" and the index
> would protect nothing.

### 4.2 The type-lists

```sql
CREATE TYPE ledger_tx_type AS ENUM (
    'deposit', 'adjustment_down', 'payment', 'refund',
    'platform_fee', 'retention_release'
);
```

### 4.3 The reference registry

```sql
CREATE TABLE ledger_reference_types (
    id             smallint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    type_key       varchar(64)  NOT NULL,
    fqcn           varchar(255) NOT NULL,
    legacy_aliases text[]       NOT NULL DEFAULT '{}',
    target_table   varchar(64)  NOT NULL,
    CONSTRAINT ledger_reference_types_type_key_key UNIQUE (type_key),
    CONSTRAINT ledger_reference_types_fqcn_key     UNIQUE (fqcn)
);
```

Fourteen rows — one per referenced model — each carrying **every spelling the code has
ever written** for it. The `legacy_aliases` array is the forensic record of the two
spellings that caused the live double-count (ADR-0013).

### 4.4 The idempotency key

| Movement | `reference_type` / `id` | `reverses_type` / `id` | Amount | Dedupe key |
|---|---|---|---|---|
| `payment` on a bid | `bid` / `bids.id` | — | **+** | `(project, 'bid', id, 'payment')` |
| `payment` on a termin | `payment_termin` / id | — | **+** | `(project, 'payment_termin', id, 'payment')` |
| `payment` on an addendum | `addendum` / id | — | **+** | `(project, 'addendum', id, 'payment')` |
| `payment` on a material order | `material_order` / id | — | **+** | `(project, 'material_order', id, 'payment')` |
| `platform_fee` | **the same as its payment** | — | **+** | `(project, ref, id, 'platform_fee')` |
| `retention_release` | `payment_termin` / id | — | **+** | `(project, 'payment_termin', id, 'retention_release')` |
| `refund` | **`dispute` / `project_disputes.id`** | the **payment's** type/id | **−** | `(project, 'dispute', id, 'refund')` |
| `deposit` | — | — | **+** | (not deduped — a deposit must be repeatable) |
| `adjustment_down` | — | — | **+** (decrements the ceiling) | (not deduped) |

**The `platform_fee` row shares its payment's reference** — that is what makes the fee
*itemised beside* the payment rather than folded into it, and it is why the dedupe key
includes `transaction_type`.

---

## 5. The write path

There is exactly **one** writer. `escrow.record_movement(...)` (ADR-0020).

```
1. SELECT budget FROM projects WHERE id = $1 FOR UPDATE
      -- locks the ceiling row; serialises every concurrent payment on the project

2. SELECT COALESCE(SUM(amount),0) FROM project_budget_transactions
    WHERE project_id = $1 AND transaction_type = ANY(DISBURSEMENT_TYPES)
      -- computed INSIDE the lock; refund rows are negative and are included

3. if type != 'deposit' AND available < amount -> insufficient funds (422)

4. INSERT ... ON CONFLICT (project_id, reference_type, reference_id, transaction_type)
                WHERE reference_id IS NOT NULL
   DO NOTHING RETURNING id
      -- 0 rows  => already recorded => idempotent success.
      --             NO ceiling move. NO platform fee.
      -- 1 row   => written.

5. if type NOT IN CEILING_NEUTRAL_TYPES:
      UPDATE projects SET budget = budget ± amount

6. COMMIT   -- the ceiling move and the ledger row are atomic
```

**The order matters.** The insert comes **before** the ceiling move. In the legacy implementation
the ceiling was decremented first, and the unique-violation was caught *inside* the
transaction — so a duplicate could commit a ceiling change with **no ledger row**.

**The caller must inspect the result.** `RecordPayment` returns
`(written bool, err error)`; a discarded result is how a bid ends up `paid` with no
ledger row (`AGENTS.md` trap #12). The compiler cannot see a discarded result, so
the escrow tests assert the written flag and code review treats a bare call as a defect.

---

## 6. The retention split

Every payment stage (`project_payment_termins`) carries a **persisted** split:

```
retention_amount + net_amount === amount      exactly
```

| Rule | Detail |
|---|---|
| The split is filled **at insert** | The three handlers that mint a stage (`projecttermins`, `projectbidsign`, `projectupdate`) call `escrow.SplitRetention`; no stage is minted with a zeroed column. |
| The remainder goes to `net` | A 5 % retention of Rp 1 000 000.03 is 50 000.0015 → truncated to 50 000; the **net** takes the remainder. The rounding error is never rounded away. |
| The percentage is currently a constant | **5** is passed at the three call sites. The Go service does not read `ESCROW_RETENTION_PERCENT`. |
| `escrow.ForTermin()` **reads** the persisted split | It never recomputes it. A later rate change must not move an agreed net. |
| Legacy rows (`net_amount = 0`) fall back to the **gross** | Pre-D1 stages have no split. |
| A **half-written** split (net 0, retention > 0) is corruption, not legacy | The recorded retention is held back. **Not currently covered by a test.** |
| The termin payment debits the **net** | The gross was never paid out. |
| The release debits the **retention**, as a `retention_release` row | Never as a `payment`. Reusing the termin's reference with type `payment` is what made the original release a silent no-op. |
| The release is blocked by a claim in `open` or `fixing` | `resolved` and `closed` do not block. |
| The release is **idempotent** | `retention_released_at` is re-read inside the transaction that writes the ledger row. |
| The warranty window comes from `projects.warranty_end_at` | Recorded at hand-over, never recomputed. |

> ⚠ **Known gap:** the release itself is not exposed in the Go service. The ledger
> type (`retention_release`), the `retention_released_at` column and the UI display exist,
> but no endpoint or scheduler writes the release row yet — the legacy
> `escrow:release-retention` command was not ported. Treat a retained amount as held until
> that job is written and tested.
>
> The warranty window is `handoverWarrantyDays = 180` for every project
> (`internal/httpapi/projecthandover.go`); the ported UI no longer shows a
> per-category window.

---

## 7. The platform fee

| Rule | Detail |
|---|---|
| It is a **separate ledger row** sharing the payment's reference | Never folded into the professional's fee. |
| It is **0 % by default** | `ESCROW_PLATFORM_FEE_PERCENT = 0`, which keeps the shipped product copy literally true. |
| The percentage is clamped to `[0, 100]` | |
| It is charged **only when the payment itself was written** | A refused payment charges no fee. |
| A failure to record the fee does **not** fail the payment | It is logged. The professional is paid. |

---

## 8. The dispute freeze

`DisputeService::assertNoOpenDispute()` is the **single** freeze gate. It raises
**422**.

**One open dispute per project** — a second attempt is **409**.

**Frozen while a dispute is open** (every one of these calls the gate):

- `POST /projects/{p}/payments/{type}/{id}/upload-proof`
- `POST /projects/{p}/payments/{type}/{id}/verify-proof`
- `POST /projects/{p}/budget/mark-paid`
- `POST /projects/{p}/payment-termins` and `PUT`/`DELETE`
- `POST /projects/{p}/payment-termins/{t}/link-milestone` and `/unlink-milestone`
- `PUT /material-quotes/{q}/mark-paid`
- `POST /projects/{p}/change-orders` and the PM/owner decisions
- `POST /firm-members/quick-assign`
- `POST /projects/{p}/verify-payment`
- procurement verification

**Not frozen** (deliberately): `POST /projects/{p}/disputes/*` itself,
`POST /projects/{p}/mutual-termination/*`, and the admin arbitration actions.

**The five admin arbitration actions** (`POST /admin/disputes/{id}/act`):

| Action | Effect on the money |
|---|---|
| `dismiss` | The dispute closes; the freeze lifts. No ledger row. |
| `release_payment` | Runs the full `verifyProof` accept path with the admin override. **One** `payment` row. |
| `record_refund` | A **negative** `refund` row, referenced by the **dispute**, reversing the **payment**. Accumulates `refunded_amount`; flips the payment to `refunded` when the gross returned covers the gross paid. |
| `terminate_project` | `projects.status = 'cancelled'`. Unpaid stages are voided. |
| `custom` | A log-only action. |

**The refund model, precisely:**

```
paidAgainst(ref)     = SUM(amount) WHERE reference_*  = ref  AND type IN ('payment')
refundedAgainst(rev) = ABS(SUM(amount) WHERE reverses_* = rev AND type = 'refund')
refundable(ref)      = max(0, paidAgainst(ref) - refundedAgainst(ref))
```

`paidAgainst` and `refundedAgainst` are **two separate queries over two separate
columns**. The legacy implementation computed `SUM(payment + refund) - refunded_amount` =
**net − gross**, which shrank by twice the already-refunded amount on every subsequent
refund. The separation makes that class of bug structurally impossible.

---

## 9. Terminal states

| Object | Terminal states | Rule |
|---|---|---|
| A bid's `payment_status` | `paid`, `refunded` | A refunded bid cannot be re-paid. `MaterialOrder` was the gap (defect B9) — a refunded order could be flipped back to `paid`. |
| A bid's `status` | `rejected`, `declined`, `terminated`, `resigned` | |
| A termin's `status` | `paid`, `void` | A voided stage is never paid. |
| A material order | `paid`, `shipping`, `delivered`, `completed`, `cancelled`, **`refunded`** | `refunded` is terminal. |
| A material quote | `paid`, `refunded` | |
| A dispute | `resolved`, `dismissed`, `withdrawn` | The freeze lifts on any of them. |
| A sub-professional assignment | `completed`, `removed` | **Decline writes `removed`, not `declined`** — `declined` is not an ENUM member, and writing it is a hard error. |

---

## 10. The state machines

### 10.1 `projects.status` (11 values, a native enum)

```
open ──accept bid──▶ accepted_arsitek / accepted_kontraktor
  │                        │
  │                   sign contract ──▶ awaiting_payment
  │                        │
  │                   pay ──▶ in_progress
  │                              │
  │                        legal ──▶ legal
  │                              │
  │                      procurement ──▶ procurement
  │                              │
  │                    handover ──▶ completed_build ──▶ completed
  │
  ├──cancel owner/PM──▶ cancelled
  ├──mutual termination──▶ termination_pending ──▶ cancelled | rejected
  └──admin force-terminate──▶ cancelled
```

### 10.2 `project_payment_termins.status` (6 values)

```
locked ──owner funds it──▶ pending ──invoice sent──▶ invoice_sent
   │                                                     │
   │                                              proof uploaded
   │                                                     ▼
   │                                                 verifying
   │                                                     │
   │                                              accepted
   │                                                     ▼
   └──voided──▶ void                                    paid
```

> The termin status was a `varchar(255)` — **unconstrained**, and it is the most
> money-critical state machine in the app. It becomes a native enum (ADR-0007).

### 10.3 `bids_*.status` (12 values)

```
pending ──shortlisted──▶ shortlisted ──invite──▶ invited
   │                          │                      │
   │                    negotiate                  negotiate
   │                          ▼                      ▼
   │                    negotiating ──confirm fee──▶ contract_pending
   │                                                   │
   │                                              counter-signed
   │                                                   ▼
   │                                             awaiting_payment
   │                                                   │
   │                                               accepted ──▶ active
   │
   ├──reject──▶ rejected     ──decline──▶ declined
   └──fire/terminate──▶ terminated          ──resign──▶ resigned
```

### 10.4 `project_disputes.status`

```
open ──reply──▶ open ──withdraw──▶ withdrawn
  │                │
  │           admin arbitrates
  │                ▼
  └──dismiss──▶ dismissed      ──resolve──▶ resolved
```

---

## 11. The invariants

The machine-checked list. Every row is either a test today or a row in the rewrite's
test plan. **A row marked ⚠ is not currently covered by any test** — those are the
parity risks.

| # | Invariant | Enforced by | Test |
|---|---|---|---|
| I1 | `DISBURSEMENT_TYPES` is exactly `{payment, refund, platform_fee, retention_release}` | `escrow.IsDisbursement()` | `TestOnlyDepositAndAdjustmentDownMoveTheCeiling` |
| I2 | `CEILING_NEUTRAL_TYPES` = the same four; they spend but do not move the ceiling | `escrow.IsCeilingNeutral()` | `TestOnlyDepositAndAdjustmentDownMoveTheCeiling` |
| I3 | `PROFESSIONAL_EARNINGS_TYPES` = `{payment, refund, retention_release}` — excludes `platform_fee` | `escrow.IsProfessionalEarning()` | `TestAPlatformFeeIsNotAProfessionalEarning` |
| I4 | `available = ceiling − Σ(DISBURSEMENT_TYPES)` | `:188-191` | `MoneyFigureConsistencyTest` |
| I5 | Only `deposit` and `adjustment_down` move the ceiling | `:395-402` | `EscrowCeilingAuditTest` |
| I6 | A `deposit` is never limited by the current balance | `:368` | `EscrowCeilingAuditTest` |
| I7 | The opening budget's ledger row is written **directly**, not through `deductBudget` | `ProjectController:405-432` | `EscrowCeilingAuditTest` |
| I8 | `projects.budget` may not be written through `PUT /projects/{id}` | `UpdateProjectRequest` | `EscrowCeilingAuditTest` |
| I9 | `summary()` returns the float keys, the `*_cents` keys and the `*_display` strings | `:230-260` | `MoneyFigureConsistencyTest` |
| I10 | `committed` does **not** reduce `available` | `:205-217` | `MoneyFigureConsistencyTest` |
| I11 | Exactly one ledger row per `(project, reference, type)` | the unique index | `MoneyIntegrityTest` |
| I12 | The dedupe key includes `transaction_type`, so a fee may share a payment's reference | `:313-341` | `PlatformFeeTest` |
| I13 | The reference is **normalised** before writing | `:297-299` | `MoneyIntegrityTest` |
| I14 | A unique violation is an **idempotent success**, not a 500 | `:429-431` | `MoneyIntegrityTest` |
| I15 | The project row is locked **before** the affordability check | `:353` | `MoneyIntegrityTest` |
| I16 | Every ledger row records `actor_user_id` and `actor_role`; NULL is a *system* movement | `:287-289` | `LedgerActorTest` |
| I17 | A `refund` with no actor is an invariant violation; a `payment` with no actor is only informational | `ReconcileEscrowCommand:222-274` | `EscrowReconciliationTest` |
| I18 | `recordPayment()`'s return value is checked by every caller | `:456-489` | `SpecialistAddendumPaymentTest` |
| I19 | `transaction_type` is a closed set of 6 | the enum | `EnumLiteralSafetyTest` |
| I20 | `retention_amount + net_amount === amount` exactly | `RetentionService:51-75` | `RetentionTest` |
| I21 | The percentage is configurable; the remainder goes to `net` | `:53, 64-74` | `RetentionTest` |
| I22 | `forTermin()` **reads** the persisted split | `:94-112` | `RetentionTest` |
| I23 | Legacy rows (`net = 0`, `retention = 0`) pay the gross | `:107-109` | `RetentionLedgerTest` |
| I24 | A **half-written** split holds back the recorded retention | `:100-105` | ⚠ **not covered** |
| I25 | The termin payment debits the **net** | `PaymentVerificationService:383-394` | `RetentionLedgerTest` |
| I26 | The release uses `retention_release`, never `payment` | `ReleaseExpiredRetentionCommand:147-154` | `RetentionLedgerTest` |
| I27 | The release is blocked by a claim in `open` or `fixing` | `RetentionService:175-182` | `RetentionTest` |
| I28 | The release is **idempotent** | `ReleaseExpiredRetentionCommand:118-166` | `RetentionTest` |
| I29 | The warranty window is read from `projects.warranty_end_at` | `RetentionService:146-149` | `RetentionTest` |
| I30 | A zero-retention stage is never released | `ReleaseExpiredRetentionCommand:98-102` | `RetentionTest` |
| I31 | The split is filled **on insert** | `ProjectPaymentTermin::creating` | `RetentionTest` |
| I32 | `retention_released_at` / `retention_released_amount` exist | migration `2026_10_01_000012` | `RetentionLedgerTest` |
| I33 | The fee is a **separate** row sharing the payment's reference | `escrow.recordFee()` | `TestFeeOnOnePercent` |
| I34 | The fee is **0 %** by default | `WithPlatformFeePercent` (default "0") | `TestTheFeeIsOffByDefault` |
| I35 | The fee is clamped to `[0, 100]` | `escrow.feePercent` clamp | `TestTheFeeIsClamped` |
| I36 | The fee is charged only when the payment was written | `Service.RecordPayment()` | `TestFeeOnOnePercent` |
| I37 | A fee that cannot be recorded does not fail the payment | `Service.recordFee()` | `TestFeeOnANonPositiveGrossIsZero` |
| I38 | `assertNoOpenDispute()` is the single freeze gate; it raises 422 | `Service.AssertNoOpenDispute()` | `TestTheFreezeGateBlocksAPayment` |
| I39 | One open dispute per project (409) | `disputes.create` handler | `internal/httpapi` suite |
| I40 | A refund is **negative** and referenced by the **dispute** | `DisputeService:380-383` | `RefundAccountingTest` |
| I41 | `refunded_amount` equals the sum of the refund reversals | — | `RefundAccountingTest` |
| I42 | A refund cannot exceed the gross paid | — | `RefundAccountingTest` |
| I43 | `paid` / `refunded` are terminal on every payment object | `PaymentVerificationService:237-265` | `PaymentTerminalStateTest` |
| I44 | The `Hire` rule requires all four of: role held, profile exists, project column non-null, ids match | `Hire:152-185` | `HireAuthorizationTest` (29) |
| I45 | The PM's id on a project is a **profile id**, like every other role | `Project.php:361` | `HireAuthorizationTest` |
| I46 | `bids.bidder_user_id` is the authoritative identity; the profile id is never a global key | ADR-0014 | `ListPerformanceTest` |
| I47 | The billing "fee percentage" of a bid is a **percentage of the ceiling**, and the computed total is stored | `BidCalculationService` | ⚠ **only one test; no sen/rounding test** |
| I48 | Percentage allocations sum to **exactly** 100 % ± 0.01 | `TerminPlanService` | `TerminPlanIntegrityTest` |
| I49 | A termin plan may not exceed the contract value | `TerminPlanService` | `TerminPlanIntegrityTest` |
| I50 | `Money::percentage()` is **odd**: `f(-x) == -f(x)` | ADR-0012 | ⚠ **new — the Go property test** |

---

## 12. The Go API surface

```go
package escrow

type TxType string
const (
    TxDeposit          TxType = "deposit"
    TxAdjustmentDown   TxType = "adjustment_down"
    TxPayment          TxType = "payment"
    TxRefund           TxType = "refund"
    TxPlatformFee      TxType = "platform_fee"
    TxRetentionRelease TxType = "retention_release"
)

type Actor struct {
    UserID *int64   // nil = a system movement (scheduled settlement, repair)
    Role   string
}

type Movement struct {
    ProjectID int64
    Type      TxType
    Amount    money.Amount
    Title     string
    Ref       Ref        // zero => no reference (deposit / adjustment_down only)
    Reverses  Reversal   // zero => not a reversal
    Actor     Actor
}

type Result struct {
    Written   bool          // a ledger row was actually INSERTED
    Duplicate bool          // the unique guard rejected it
    TxID      int64
    Ceiling   money.Amount
    Available money.Amount
}

type Summary struct {
    Ceiling, Paid, Committed, Available, Allocated money.Amount
    PercentUsed float64
    Currency     money.Currency
}

type Service struct { /* pgxpool, fee, dispute gate */ }

// Record writes ONE movement. It is the ONLY writer of the ledger.
//   err != nil                => nothing was written (the transaction rolled back)
//   err == nil, Duplicate     => already recorded; idempotent success.
//                                NO ceiling move. NO platform fee.
// CALLERS MUST INSPECT Written before charging a platform fee.
func (s *Service) Record(ctx context.Context, m Movement) (Result, error)

func (s *Service) RecordPayment(ctx context.Context, m Movement) (Result, error)
func (s *Service) Available(ctx context.Context, projectID int64) (money.Amount, error)
func (s *Service) Summary(ctx context.Context, projectID int64) (Summary, error)
func (s *Service) PaidTotalByOwner(ctx context.Context, ownerIDs []int64) (map[int64]money.Amount, error)
func (s *Service) Ceiling(ctx context.Context, projectID int64) (money.Amount, error)
```

**The Go `Record` is the reference implementation** of the SQL function's semantics.
`go test ./internal/domain/escrow` covers the Go implementation, and
`db/postgres/tests/escrow_behaviour.sql` (run by the baseline gate) asserts the SQL
function's invariants against a real PostgreSQL.

---

## 13. The API contract

`GET /projects/{p}/budget` returns **one** summary object, computed by
`escrow.Service.Summary()` (rendered by `projectBudgetSummary` in
`internal/httpapi/projectmoney.go`):

| Field | Meaning |
|---|---|
| `total`, `paid`, `allocated`, `committed`, `remaining`, `available` | floats, for display |
| `percent_used` | paid / ceiling × 100, or 0 when the ceiling is 0 |
| `total_cents`, `paid_cents`, `committed_cents`, `available_cents` | exact integer minor units |
| `total_display`, `paid_display`, `committed_display`, `available_display` | formatted strings |
| `currency` | `IDR` |

**What the client must never do:**

- compute `available` from `projects.budget` and the ledger rows;
- compute `paid` from a termin's `status`;
- compute a percentage allocation with `Math.round(pct/100 × total)` and treat it as
  the payable amount (the server recomputes and owns the payable amount);
- send a computed amount to the server as the authoritative figure.

**What the server must never do:**

- accept a client-supplied amount for a payment stage;
- read `projects.budget` to answer "how much is left" outside `escrow.Service`;
- write a ledger row outside the escrow service.

---

## 14. Configuration

The port keeps these as **constants**, not environment variables. That is a
deliberate difference: a money constant that an environment can change is a
number nobody can audit.

| Value | Value | Where |
|---|---|---|
| Retention percentage | **5 %** | passed to `escrow.SplitRetention` at the three stage-creating handlers |
| Warranty window | **180 days** | `handoverWarrantyDays` in `internal/httpapi/projecthandover.go` |
| Blocking claim states | `open`, `fixing` | the warranty-claim status check |
| Platform fee | **0 %** | `escrow.WithPlatformFeePercent` default |
| Retention release | **not implemented** | see the known gap in §6 |

---

## 15. Related documents

| Document | What it adds |
|---|---|
| `docs/adr/0012-money-is-integer-minor-units.md` | The representation, and the two rounding bugs the port fixes |
| `docs/adr/0013-the-ledger-reference-registry.md` | The reference vocabulary, and the live double-count it fixes |
| `docs/adr/0020-escrow-invariants-live-in-the-database.md` | The `SECURITY DEFINER` function and the privileges |
| `docs/adr/0022-the-post-parity-money-fix-is-separate.md` | The history of the dual-block parity period |
| `docs/DOMAIN.md` | The domain model |
| `docs/CONVENTIONS.md` | The coding rules |
| `AGENTS.md` traps #2, #3, #12 | The three rules that shaped this model |
