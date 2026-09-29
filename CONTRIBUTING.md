# Contributing

## Before you change anything

Read [`AGENTS.md`](AGENTS.md). It is short and it contains 13 traps that have each cost real
debugging time — the MySQL `ENUM` that silently broke a whole flow for months, the `pm_id`
column that stores a user id while every other id column stores a profile id, the index that
InnoDB adopts as a foreign key's backing store.

Two rules that are not negotiable:

- **Never commit without the owner's explicit instruction.** The owner reviews the tree.
- **Before deleting something as "dead", re-grep the inbound references yourself.** Two past
  audit claims about dead code were wrong.

## Environment

- **PHP >= 8.4.** The `php` on `PATH` may be older and will fail to parse vendor code.
- **MySQL 8+.** The schema is not SQLite-portable — the migrations contain raw `ALTER`/`ENUM`
  statements that SQLite cannot execute. The test suite needs a real MySQL.
- **Node 18+.**

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
```

## The verification gate

Run the full list after any structural change. CI runs the same one.

```bash
# 1. syntax
php -l <file>                                   # or sweep app database routes tests
# 2. autoloader, after adding/removing a class
composer dump-autoload
# 3. types — a ratchet, must not RISE
npm run typecheck:check
# 4. BOTH builds. Production ships dist/, not public/build.
npm run build
VITE_STANDALONE=true npm run build
# 5. migrations, if you added one
php artisan migrate --force
# 6. schema honesty — every model attribute exists in a from-scratch migration
php artisan schema:verify
# 7. tests — real MySQL, every test rolled back
php artisan test
# 8. manual pass
# login -> dashboard -> project page, in a browser
```

For a full round-trip against a throwaway database:

```bash
scripts\verify-schema.cmd 4ceria_scratch
```

That drops the database, runs every migration from scratch, verifies the schema against every
model, rolls back the last three batches, re-applies, and verifies again. It is slow — MySQL
rebuilds the whole table for every `ENUM` alter — but it is the only way to know the schema is
reproducible.

## Money changes

Money is not a "refinement". A change to escrow, termin, refund, dispute or payout logic needs:

1. **A test in `tests/`** that fails before the fix and passes after.
2. **A look at `docs/DOMAIN.md`**, and an update if the model changed.
3. A `money:detect-duplicates` run to confirm the ledger is still coherent.

Every payment path goes through `ProjectFinancialService`. Never write a
`project_budget_transactions` row by hand, and never read `projects.budget` to answer "how much
is left" — use `available()` / `summary()`. Check the return value of `recordPayment()`.

## Adding a migration

- **Never** write a migration whose `up()` is empty. 37 of them once accumulated that way, and
  they left 26 columns in the models but not the database. If a migration is unnecessary, delete
  the file.
- **Never rewrite a MySQL `ENUM` with `MODIFY COLUMN`.** It is a full table rebuild and it aborts
  the migration if any row holds a value you dropped. Use
  `App\Support\Schema\EnumValues::addValues()`, which only appends.
- **Never `dropIndex()` a composite whose leading column is a foreign key.** Use
  `App\Support\Schema\ForeignKeyIndexGuard::dropIndex()`.
- Keep `down()` honest, or document loudly why it is one-way.

## Tests

- Suites share `tests/Support/DatabaseHarness.php`. Do not re-roll the `.env` recovery or the
  transaction rollback per file.
- Build fixtures through a scenario factory. Do not add a fifth copy of a hand-rolled user
  builder.
- DML only. Never DDL in a test.
- Test scratch scripts go in `refinement-tests/`. Dev tooling belongs in
  `app/Console/Commands/` — a Pest suite is a test, an artisan command is a tool.

## Where things belong

| | |
|---|---|
| Business logic | `app/Services/`, behind a thin controller |
| Request validation | `app/Http/Requests/` |
| Authorization | a policy, not an inline id comparison |
| A new API route | `routes/api.php`, then `docs/API_MAP.md` |
| A new domain concept | `docs/DOMAIN.md` |
| A decision worth explaining | `docs/CLEANUP-LOG.md` |
| Shipped work | `docs/BACKLOG.md` |

## Local-only files

Keep out of commits: `.env`, `resources/js/pages/dev/` (the quick-login panel),
`refinement-tests/` scratch scripts, and `REFINEMENT-PLAN.md` (a local working document).
