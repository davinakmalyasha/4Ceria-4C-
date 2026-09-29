# 4Ceria Portal

**Multi-party contract and payment coordination for Indonesian residential construction.**

An owner posts a project. Seven *separately licensed* professional roles bid on it — arsitek,
kontraktor, notaris, interior, structural engineer, MEP engineer, project manager. Each one
negotiates a fee, signs their own SPK, and gets a payment schedule. Money moves through a
milestone escrow **ledger**. Milestones gate payment. Disputes freeze it. Handover closes it.

---

## The problem

Indonesian house construction is coordinated in a WhatsApp group and a notebook, and it fails
there. The parties have to agree on scope, price, schedule, and *when money is released* — and
none of them have ever worked with each other before. The architect, the structural engineer, the
MEP engineer, the notary, the main contractor and the project manager are each individually
licensed, each legally liable, and each unable to verify the others. There is no shared record of
what was agreed, no single place where "how much is left" has one answer, and no mechanism that
stops a payment while a quality dispute is open.

4Ceria is the shared record. The hard part is not the marketplace; it is the money and the
contracts, and that is where the engineering effort went.

## What it is

A contract-bound payment graph, not a listing site. The structural bet is the seven-role model
and everything that falls out of it:

- **Seven parallel role pipelines.** Each role has its own bid table, profile, fee model,
  negotiation thread, contract, and termin schedule. A project is complete only when the roles it
  published are all filled.
- **Per-role SPK.** Seven separate agreements, each with its own signature, bank details, and
  payment plan whose percentages must sum to exactly 100%.
- **One escrow ledger per project.** A single source of truth for spendable balance, with a
  row-level lock, one affordability guard, and a database unique index that makes a double-charge
  physically impossible.
- **Milestone-gated release.** A termin is `locked` until its milestone is approved, and
  `void` the moment a professional is fired or a contract is re-signed.
- **A dispute centre that actually freezes money.** One open dispute per project; while it is
  open, every payment route returns 422. An admin then arbitrates with five defined outcomes,
  including partial refunds attributed to the specific payment they reverse.

Plus the supporting surfaces: materials marketplace with courier job board, BOM requirements
with usage tracking, change orders, snag lists, BAST handover, 180-day warranty, a notary legal
vault covering 27 Indonesian instruments, and a PWA.

## The escrow model, stated honestly

4Ceria maintains an escrow **ledger**. It does not hold your money. Transfers go from the client's
account to the professional's, and the platform records and gates each one.

| The ledger does | The ledger does not |
|---|---|
| Records every movement against the project budget | Hold or move funds |
| Refuses a payment the budget cannot cover | Recover money sent to a wrong account |
| Freezes every payment route while a dispute is open | Make a bank transfer itself |
| Records who authorised each movement | Issue tax invoices or withhold tax |
| Caps refunds at what that payment actually received | — |

There is currently **no platform fee**. That is a deliberate current state, not a hidden charge.

## The three hardest problems, and where they live

**1. Escrow overpayment and double-spend under concurrency.**
`ProjectFinancialService::deductBudget()` takes a `lockForUpdate()` on the project row, checks
affordability, writes the ledger row, and relies on the widened unique index
`(project_id, reference_model, reference_id, transaction_type)` — which permits exactly one
`payment` and one `refund` per referenced payment, so a reversal is representable but a second
identical charge is not. The unique-violation is caught and treated as success, so a
double-submit is idempotent rather than fatal.
→ `app/Services/ProjectFinancialService.php:99`

**2. Payment forgery: mint a payment stage, then self-verify it.**
A professional could create a termin in their own name and then accept it, moving the client's
escrow to themselves. Three independent guards close it: only the payee or a privileged role may
verify, the escrow must cover the amount, and the plan must stay within the negotiated contract
value. The test asserts the full chain, not one bug.
→ `tests/PaymentIntegrityTest.php:83`

**3. Refunding professional A's termin out of professional B's money.**
The dispute centre originally compared a refund against the *project's* total payments, so an
admin could return A's money twice by opening two disputes. Fixed with a durable `refunded_amount`
accumulator per payment, attributed at the payment rather than the project.
→ `app/Services/DisputeService.php`, `tests/PaymentIntegrityTest.php:508`

## State machines

`projects.status` is a MySQL ENUM and a hard write error outside the list
(`open, accepted_arsitek, accepted_kontraktor, awaiting_payment, in_progress, termination_pending,
legal, procurement, completed_build, completed, cancelled`).

```
termin:    locked ──approve milestone──> pending ──> invoice_sent ──> verifying ──proof──> paid
              │                                                                      │
              └──────────── fire pro / re-sign / terminate ─────────────────────┴──> void

dispute:   open ──withdraw──> withdrawn        open ──admin action──> resolved
              │                │                │   dismiss | release_payment
              └──escalate──────┴──> open        │   record_refund | terminate_project | custom
```

`docs/DOMAIN.md` has the full model.

## Stack

- **Backend** — Laravel 13 (API-only under `/api`), PHP 8.4+, Sanctum, Spatie Permission, Resend,
  Redis. **Laravel Octane (FrankenPHP)** locally, php-fpm + nginx in the container.
- **Frontend** — React 19 + TypeScript SPA, Vite 6, Tailwind 3, react-router 7, PWA
  (`injectManifest` with a hand-written service worker).
- **Data** — MySQL 8/9 (ENUM- and decimal-heavy; the schema is not SQLite-portable), Redis for
  cache/session/queue, S3-compatible object storage (Tigris) with two disks: `public` and the
  private `railway`.
- **Deploy** — SPA on Vercel (standalone `dist/` build), API as a Docker image on Railway
  (nginx + php-fpm + queue worker + scheduler under supervisord).

## Getting started

Requires **PHP >= 8.4** — the `php` on `PATH` may be older and will fail to parse vendor code.

```bash
composer install
npm install
cp .env.example .env          # then fill DB_*, RESEND_API_KEY
php artisan key:generate
php artisan migrate --seed
```

Run it:

```bash
composer dev                  # server + queue + logs + vite, all at once
# or
php artisan octane:start --server=frankenphp --port=9000
npm run dev                   # Vite on :5173
```

> No local Redis? Override the drivers per process:
> `set SESSION_DRIVER=file&& set CACHE_STORE=file&& set QUEUE_CONNECTION=sync&& php artisan octane:start --server=frankenphp --port=9000`

The test suite runs against **real MySQL** inside a rolled-back transaction — the migrations
contain raw `ALTER`/`ENUM` statements that SQLite cannot execute. Any MySQL 8+ will do; use a
scratch database, never a shared one.

## Testing

```bash
php artisan test               # all Pest suites
php artisan schema:verify      # every model attribute exists in a from-scratch migration
php artisan money:detect-duplicates   # read-only ledger integrity scan
scripts\verify-schema.cmd <scratch_db> # full migrate:fresh → verify → rollback → re-migrate
```

`schema:verify` is the gate that keeps the schema honest. It exists because 37 migrations were
once recorded as applied while doing nothing — see [AGENTS.md trap 11](AGENTS.md). `money:detect-duplicates`
exists because a bid could be marked `paid` with no ledger row behind it.

## Build

```bash
npm run build                          # Laravel-integrated, into public/build
VITE_STANDALONE=true npm run build     # standalone SPA into dist/ (this is what Vercel serves)
```

CI builds **both**, because building only the first proves an artifact that is never shipped.

## Key environment variables

| Variable | Purpose |
|---|---|
| `APP_URL` | Base URL used for reset links / signed URLs |
| `DB_*` | MySQL connection |
| `SESSION_DRIVER` / `CACHE_STORE` / `QUEUE_CONNECTION` | `redis` in prod; `file`/`sync` locally |
| `RESEND_API_KEY` | Transactional email |
| `PUBLIC_STORAGE_DRIVER` | `local` (dev) or `s3` (prod) |
| `RAILWAY_STORAGE_*` | Private bucket: contracts, KYC, receipts, evidence |
| `TRUSTED_PROXIES` | CIDR list behind the edge. `"*"` lets clients spoof `X-Forwarded-For` and rotate rate-limit buckets — do not use it in production. |
| `VAPID_*` | Web push. Push returns 501 until the trio is set. |
| `VITE_API_URL` / `VITE_STANDALONE` | Standalone SPA build config |

## Repository layout

| Path | |
|---|---|
| `routes/api.php` | The single source of truth for the API surface (~300 actions) |
| `app/Http/Controllers/Api/` | Controllers |
| `app/Services/` | Domain services — the money lives in `ProjectFinancialService` |
| `app/Support/Schema/` | Migration safety helpers (`EnumValues`, `ForeignKeyIndexGuard`) |
| `resources/js/` | React SPA |
| `tests/` | Pest suites, all against real MySQL, all rolled back |
| `docs/` | Architecture, domain model, conventions, API map, backlog |
| `AGENTS.md` | **Read this before changing anything** — 13 traps that have each cost real time |
| `refinement-tests/` | Local scratch scripts (gitignored conventions apply) |

## Documentation

| | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Working rules, the verification gate, and the critical traps |
| [`docs/DOMAIN.md`](docs/DOMAIN.md) | Domain model, lifecycle, money flow, dispute arbitration |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Runtime topology, request lifecycle, deploy pipeline |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Auth, authorization and upload conventions |
| [`docs/API_MAP.md`](docs/API_MAP.md) | Route map grouped by domain |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | What shipped, and what is deliberately not scheduled |

## Known limitations

Stated rather than hidden:

- **No payment gateway.** Money moves by manual bank transfer with human proof verification.
  There is no automated hold or release.
- **No platform fee, payouts or invoices.** The ledger records budget consumption, not who is
  owed. `retention_amount` / `net_amount` exist on `project_payment_termins` but are not yet
  written, so Indonesian 5% retention (potong) is not implemented.
- **Seven parallel bid tables.** 235 columns for 52 distinct names, with several type
  inconsistencies between them. `config/bids.php` is meant to paper over this and only partially
  does.
- **Type debt.** `tsconfig.json` is not `strict`. `npm run typecheck:check` is a ratchet against
  a recorded baseline, and the baseline is not zero.
- **No frontend test runner yet.** The backend has 75 tests; the SPA has none.

## License

MIT — see [LICENSE](LICENSE).
