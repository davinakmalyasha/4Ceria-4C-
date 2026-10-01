<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes for three queries the performance audit proved are full table scans.
 *
 * All three were verified with EXPLAIN before and after; the "before" plans are
 * quoted in the tests that accompany this migration.
 *
 * 1. `materials` -- the marketplace listing
 *      Filter: (materials.is_available = 1)   ->  Table scan on materials
 *    `MaterialController::index()` filters on `is_available` and orders by
 *    `created_at`. Only `supplier_id` was indexed, because that is the FK.
 *
 * 2. `suppliers` -- the UNAUTHENTICATED directory
 *      Filter: (suppliers.verification_status = 'verified')  ->  Table scan
 *    `SupplierController::index()` filters on exactly that. This one matters
 *    most: it is reachable by anyone, on every directory page load, and it is the
 *    same predicate the public professional directories use.
 *
 * 3. `projects.target_role` -- in ALL SEVEN feed branches
 *      Filter: (projects.target_role in ('both','arsitek'))  ->  Table scan
 *    Only the `selected_*` columns were indexed. `target_role` is low
 *    cardinality, so this will not be a dramatic win on its own -- its value is
 *    that it lets the optimizer pick it over the near-universal
 *    `selected_*_id IS NULL` residual, which every feed branch currently leans on.
 *    The real fix for the feed is a `project_published_roles` join table, since
 *    `published_bidding_roles` is a JSON column and can never use a btree index;
 *    that is recorded as remaining work rather than built blind here.
 *
 * 4. `notifications` -- the unread feed
 *    `notifications_user_created_idx (user_id, created_at)` exists but does not
 *    cover the `read_at IS NULL` residual, so the plan is
 *      Sort: notifications.created_at DESC
 *        -> Index lookup using notifications_user_id_read_at_index
 *    i.e. the index narrows the rows and then still FILESORTS them. A
 *    (user_id, read_at, created_at) index lets the ORDER BY be satisfied by the
 *    index instead.
 *
 * NO INDEX IS DROPPED HERE. The audit did find 14 redundant single-column indexes
 * across the `bids_*` tables (each a strict prefix of an existing composite), and
 * every bid INSERT maintains all of them -- but dropping an index that InnoDB has
 * adopted as a foreign key's backing store fails with error 1553, and only on a
 * from-scratch migration. That cleanup is left for a separate, guarded migration
 * using App\Support\Schema\ForeignKeyIndexGuard.
 *
 * None of these columns is a foreign key's leading column, so no ADD here can
 * collide with a constraint.
 */
return new class extends Migration
{
    /** @var list<array{0: string, 1: string, 2: list<string>}> */
    private const ADDITIONS = [
        ['materials', 'materials_available_created_idx', ['is_available', 'created_at']],
        ['materials', 'materials_category_price_idx', ['category', 'price']],
        ['suppliers', 'suppliers_verification_created_idx', ['verification_status', 'created_at']],
        ['projects', 'projects_target_role_status_idx', ['target_role', 'status']],
        ['notifications', 'notifications_user_read_created_idx', ['user_id', 'read_at', 'created_at']],
    ];

    public function up(): void
    {
        foreach (self::ADDITIONS as [$table, $name, $columns]) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $missing = array_values(array_filter(
                $columns,
                fn ($c) => Schema::hasColumn($table, $c)
            ));

            // Guarded on both the table and every column, so this is a no-op
            // against a database that already has the index -- which is what
            // makes it safe to re-run after the migration row is forgotten.
            if ($missing !== $columns || $this->hasIndex($table, $name)) {
                continue;
            }

            Schema::table($table, fn ($t) => $t->index($missing, $name));
        }
    }

    public function down(): void
    {
        foreach (self::ADDITIONS as [$table, $name]) {
            if (! Schema::hasTable($table) || ! $this->hasIndex($table, $name)) {
                continue;
            }

            // Additive indexes, so a rollback is a plain drop: no column is
            // involved, so this cannot invalidate a row. Unlike ENUM narrowing,
            // which is the ALGORITHM=COPY case in AGENTS.md trap 9.
            Schema::table($table, fn ($t) => $t->dropIndex($name));
        }
    }

    private function hasIndex(string $table, string $name): bool
    {
        return Schema::hasIndex($table, $name);
    }
};