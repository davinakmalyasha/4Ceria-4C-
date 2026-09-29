name: Pull request

## What this changes

<!-- One or two sentences. What behaviour is different after this PR? -->

## Type

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Schema change (migration added or modified)
- [ ] Money path (escrow / termin / refund / dispute / payout)
- [ ] Documentation only

## Verification

The gate from [`CONTRIBUTING.md`](../CONTRIBUTING.md). Tick what you ran:

- [ ] `php -l` sweep over `app database routes tests`
- [ ] `composer dump-autoload` (if classes were added or removed)
- [ ] `npm run typecheck:check` — ratchet, must not rise
- [ ] `npm run build` **and** `VITE_STANDALONE=true npm run build`
- [ ] `php artisan migrate --force` (migration added)
- [ ] `php artisan schema:verify` (migration added)
- [ ] `php artisan test`
- [ ] `php artisan money:detect-duplicates` (money path)
- [ ] Manual pass: login → dashboard → project page

## If this touches money

- [ ] A test in `tests/` fails before the change and passes after
- [ ] `docs/DOMAIN.md` reviewed, and updated if the model changed
- [ ] Every payment path still goes through `ProjectFinancialService` — no direct
      `project_budget_transactions` writes
- [ ] `recordPayment()` return values are checked
- [ ] New payment endpoints call `DisputeService::assertNoOpenDispute()`

## If this adds a migration

- [ ] `up()` is not empty
- [ ] No `MODIFY COLUMN` on a MySQL `ENUM` — used `EnumValues::addValues()` instead
- [ ] No bare `dropIndex()` on a composite over a foreign key — used
      `ForeignKeyIndexGuard::dropIndex()` instead
- [ ] `down()` works, or its one-way nature is documented in the file
- [ ] `scripts\verify-schema.cmd <scratch_db>` passes

## Notes

<!-- Anything a reviewer would otherwise have to reverse-engineer. -->
