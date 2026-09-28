<?php

namespace Tests\Support;

use Illuminate\Support\Facades\DB;

/**
 * Shared test-database harness.
 *
 * WHY THIS EXISTS
 * ---------------
 * The three money/payment suites (MoneyIntegrityTest, RefinementRegressionTest,
 * DisputeCenterTest, PaymentIntegrityTest) each hand-rolled the same ~30 lines:
 * read the developer's `.env` to recover a REAL MySQL connection, purge, then
 * wrap everything in an explicit transaction that is always rolled back.
 *
 * Two problems with that duplication:
 *  1. `file(base_path('.env'))` emits a warning and returns false when the file
 *     is absent — which is the normal case in CI, where only `.env.example`
 *     exists. The suites could therefore not run anywhere except one laptop.
 *  2. Four copies of the same safety-critical logic drift apart.
 *
 * This helper prefers the process environment (so CI can inject DB_* directly)
 * and falls back to parsing `.env`, so the same suites run locally and in a
 * pipeline.
 *
 * SAFETY MODEL (unchanged, and load-bearing)
 * -----------------------------------------
 * - Real MySQL, because the legacy migrations contain raw ALTER/ENUM statements
 *   that sqlite cannot execute.
 * - DML only. NEVER add DDL to a test.
 * - One outer transaction per test, rolled back in afterEach even on failure.
 */
final class DatabaseHarness
{
    /**
     * Point the app at the real MySQL database and open the test transaction.
     *
     * Called from every test's beforeEach, and it MUST run each time: Laravel
     * rebuilds the application instance per test, so any config set in a
     * previous test is discarded. An early-out "already booted" guard would
     * leave every test after the first one pointing at the phpunit.xml sqlite
     * placeholder (no such table: users).
     */
    public static function boot(): void
    {
        $real = self::envValues();

        config([
            'database.default' => 'mysql',
            'database.connections.mysql.database' => $real['DB_DATABASE'] ?? '4ceria',
            'database.connections.mysql.host' => $real['DB_HOST'] ?? '127.0.0.1',
            'database.connections.mysql.port' => $real['DB_PORT'] ?? '3306',
            'database.connections.mysql.username' => $real['DB_USERNAME'] ?? 'root',
            'database.connections.mysql.password' => $real['DB_PASSWORD'] ?? '',
        ]);

        DB::purge('mysql');

        // Hard safety net: refuse to run against anything that looks wrong, so a
        // misconfigured environment can never truncate a real database.
        $database = (string) config('database.connections.mysql.database');
        if (in_array($database, ['', ':memory:', 'null'], true)) {
            throw new \RuntimeException(
                'Refusing to run: no real MySQL database configured (set DB_DATABASE / .env).'
            );
        }

        DB::beginTransaction();
    }

    /**
     * Discard everything the test did — guaranteed even on assertion failure.
     */
    public static function rollback(): void
    {
        while (DB::transactionLevel() > 0) {
            try {
                DB::rollBack();
            } catch (\Throwable) {
                break;
            }
        }
    }

    /**
     * Resolve the real MySQL settings.
     *
     * ORDER MATTERS. phpunit.xml pins `DB_CONNECTION=sqlite` and
     * `DB_DATABASE=:memory:`, and PHPUnit exports those through putenv() —
     * so a naive "process env first" lookup would recover `:memory:` and the
     * harness would refuse to run (or, worse, run against sqlite).
     *
     * Therefore: `.env` is authoritative when it exists, and the process
     * environment is only a fallback for environments with no `.env` (CI,
     * containers), where the injected value is the real one.
     *
     * @return array<string, string>
     */
    private static function envValues(): array
    {
        $values = [];

        // 1. The project's .env (authoritative locally).
        $path = base_path('.env');
        if (is_file($path) && is_readable($path)) {
            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#')) {
                    continue;
                }
                [$k, $v] = array_pad(explode('=', $line, 2), 2, null);
                $values[trim($k)] = trim((string) $v, " \t\"'");
            }
        }

        // 2. Process environment — only for keys .env did not provide, and only
        //    when the value is a real database reference (never the phpunit.xml
        //    sqlite placeholder).
        foreach ([
            'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE',
            'DB_USERNAME', 'DB_PASSWORD',
        ] as $key) {
            if (array_key_exists($key, $values) && $values[$key] !== '') {
                continue;
            }

            $value = getenv($key);

            if ($value === false || $value === '') {
                continue;
            }

            if ($key === 'DB_DATABASE' && in_array($value, [':memory:', 'sqlite', 'null'], true)) {
                continue;
            }

            if ($key === 'DB_CONNECTION' && $value === 'sqlite') {
                continue;
            }

            $values[$key] = $value;
        }

        return $values;
    }
}
