<?php

namespace Database\Seeders\Support;

/**
 * The demo identities created by `db:seed`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The seeders used to hard-code their email addresses inline, in six files, and
 * couple to each other through those strings. `DummyProfessionalDataSeeder` does
 *
 *     $arsitekUser = User::where('email', 'giska@gmail.com')->first();
 *
 * to find a user that `RestoreUsersSeeder` created with the same literal,
 * somewhere else, in a different file. Changing an address meant grepping for it
 * and hoping every site was found; missing one produced a seeder that silently
 * created half a dataset.
 *
 * That is also why the addresses had to be real-looking. `@gmail.com` reads as a
 * throwaway, but these are live third-party addresses in a PUBLIC repository, and
 * one of them belonged to the repository owner. `EnterpriseRoleSeeder` was already
 * doing this correctly with `structural@example.com`; the rest had not caught up.
 *
 * So the addresses are declared once, here, on the reserved
 * `example.test` domain (RFC 2606 -- guaranteed never to resolve), and every
 * seeder resolves identities through this class.
 *
 * THE PASSWORD
 * ------------
 * Every account shares one known password, which is appropriate for demo data and
 * unacceptable anywhere else. It is a named constant rather than an inline
 * `Hash::make('123456')` in each seeder so that the value has one home and so a
 * future contributor sees "DEMO" next to it instead of an anonymous literal.
 */
final class DemoAccount
{
    /**
     * Demo-only. Every seeded account shares this password.
     *
     * `db:seed` is for a local database. Do not deploy it.
     */
    public const PASSWORD = '123456';

    // --- Professionals, one per bid role -----------------------------------
    public const ARSITEK = 'giska@example.test';

    public const KONTRAKTOR = 'anindia@example.test';

    public const INTERIOR = 'abel@example.test';

    public const NOTARIS = 'rede@example.test';

    public const STRUCTURAL = 'budi-struc@example.test';

    public const MEP = 'andi-mep@example.test';

    public const PROJECT_MANAGER = 'aisha@example.test';

    // --- Marketplace and support roles -------------------------------------
    public const COURIER = 'fariz@example.test';

    public const SUPPLIER = 'akmal@example.test';

    // --- Project owner and ordinary users ----------------------------------
    public const CLIENT = 'client@example.test';

    public const ORDINARY_USER = 'davin@example.test';

    /**
     * Every address above, for bulk operations such as reseeding a password.
     *
     * @return list<string>
     */
    public static function all(): array
    {
        return array_values(array_filter([
            self::ARSITEK,
            self::KONTRAKTOR,
            self::INTERIOR,
            self::NOTARIS,
            self::STRUCTURAL,
            self::MEP,
            self::PROJECT_MANAGER,
            self::COURIER,
            self::SUPPLIER,
            self::CLIENT,
            self::ORDINARY_USER,
        ], static fn ($e) => $e !== null));
    }

    /**
     * Resolve a user created by `RestoreUsersSeeder`, or fail loudly.
     *
     * A seeder that cannot find its subject should stop, not continue with
     * `null` and create an incomplete dataset that looks like it worked.
     */
    public static function user(string $email): \App\Models\User
    {
        $user = \App\Models\User::where('email', $email)->first();

        if (! $user) {
            throw new \RuntimeException(
                "Demo account {$email} does not exist. `RestoreUsersSeeder` runs first and "
                .'creates it; this seeder cannot run on its own.'
            );
        }

        return $user;
    }
}
