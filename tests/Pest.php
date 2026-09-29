<?php

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| Three distinct kinds of test live in this repository, and they must NOT share
| a binding:
|
|   tests/Unit        Pure logic. No Laravel, no database. The binding is the
|                     default `PHPUnit\Framework\TestCase`. App\Support\Money
|                     is a value object — booting the kernel to test it would
|                     be slower and would hide the fact that it has no
|                     dependencies.
|
|   tests/Feature     Laravel TestCase, real MySQL, one transaction per test,
|                     always rolled back (tests/Support/DatabaseHarness.php).
|
|   tests/*Test.php   The four root-level money suites, same harness. They stay
|                     at the root so the file history is not churned.
|
| WHY THERE IS NO `RefreshDatabase` ANYWHERE
| -----------------------------------------
| It was bound with `->in('Feature')` while no `Feature` directory existed, so
| it never applied to anything. The day a `tests/Feature` directory appeared it
| would have started running — and `RefreshDatabase` wraps each test in
| migrate:fresh, which drops every table. Against the developer's real MySQL
| database that destroys the data the money suites are about to assert on.
|
| The safety model for every database test is explicit and per-file instead:
|
|   beforeEach => DatabaseHarness::boot()      recover MySQL, BEGIN
|   afterEach  => DatabaseHarness::rollback()  unwind every level, always
|
| DML only. Never add DDL to a test.
|
*/

// Database-backed suites. Deliberately WITHOUT RefreshDatabase — see above.
pest()->extend(Tests\TestCase::class)
    ->in('Feature');

pest()->extend(Tests\TestCase::class)
    ->in('Money');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});
