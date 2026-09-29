# tests/Feature

Laravel TestCase tests that touch the database.

Bound in `tests/Pest.php` with `pest()->extend(Tests\TestCase::class)->in('Feature')`
and deliberately **without** `RefreshDatabase` — see the note there for why
`RefreshDatabase` would drop the developer's real MySQL database mid-suite.

Every test in this directory must:

- call `Tests\Support\DatabaseHarness::boot()` in `beforeEach`
- call `Tests\Support\DatabaseHarness::rollback()` in `afterEach`
- perform DML only, never DDL
- build fixtures through a shared factory rather than a fifth hand-rolled
  user builder
