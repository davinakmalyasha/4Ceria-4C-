<?php

use App\Support\Schema\ForeignKeyIndexGuard;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Drop the duplicate `payment_status` indexes on the seven bid tables.
 *
 * WHY THESE, AND ONLY THESE
 * -------------------------
 * A performance audit reported "14 redundant indexes" across `bids_*`. That count
 * was wrong, and acting on it as stated would have been destructive, so the
 * claim was re-derived from `information_schema.STATISTICS` before anything was
 * dropped.
 *
 * There are 33 index pairs on those tables sharing a leading column, but almost
 * all of them are NOT redundant -- they differ in the second column and answer
 * different queries:
 *
 *     bids_arsitek_arsitek_created_idx  (arsitek_id, created_at)
 *     bids_arsitek_arsitek_id_index     (arsitek_id)               <- prefix
 *
 * A prefix of a composite is not always redundant: it is smaller, and for a
 * lookup on the single column it is a genuinely better index. Those stay.
 *
 * `offered_by_id` and the `*_id` columns ARE foreign keys. InnoDB adopts a
 * same-column index as a constraint's backing store, and dropping the one in use
 * fails with error 1553 -- but only on a from-scratch migration, so a drifted
 * database would let it through and a clean deploy would fail. Those stay, and
 * the guard below would refuse them anyway.
 *
 * WHAT IS ACTUALLY REDUNDANT
 * --------------------------
 * `payment_status` carries a genuine exact duplicate on every bid table: two
 * distinct index NAMES over the identical single column.
 *
 *     bids_arsitek_payment_status_fk_support
 *     bids_arsitek_payment_status_idx
 *
 * Both are maintained on every INSERT and UPDATE of a bid row, and the optimizer
 * can only choose one of them, so the second is pure write amplification for
 * nothing.
 *
 * The `_fk_support` name is VESTIGIAL, which is worth stating because it is the
 * only thing that makes dropping the other one look risky: `payment_status` is a
 * VARCHAR status, and `KEY_COLUMN_USAGE` confirms the only foreign keys on
 * `bids_arsitek` are `arsitek_id`, `offered_by_id` and `project_id`. There is no
 * constraint for either index to be backing.
 *
 * The `_idx` one is therefore kept and the `_fk_support` one dropped, so the
 * name that survives is the one that does not imply a foreign key exists.
 *
 * NOT DONE, DELIBERATELY
 * ----------------------
 * `notifications_user_id_read_at_index (user_id, read_at)` is a strict prefix of
 * `notifications_user_read_created_idx (user_id, read_at, created_at)`, added by
 * migration 000014, and is therefore genuinely redundant now. It is NOT dropped
 * here: `notifications_user_id_foreign` is a foreign key on `user_id` and three
 * indexes lead with that column, so InnoDB may have adopted any of them as the
 * backing store. `ForeignKeyIndexGuard` will decline to drop it if so, and
 * whether it succeeds depends on the live database's internal choice -- not
 * something to bundle into a migration about a different table.
 */
return new class extends Migration
{
    /**
     * The 7 exact duplicates, as table => index to drop.
     *
     * @var array<string, string>
     */
    private const DUPLICATES = [
        'bids_arsitek' => 'bids_arsitek_payment_status_fk_support',
        'bids_interior' => 'bids_interior_payment_status_fk_support',
        'bids_kontraktor' => 'bids_kontraktor_payment_status_fk_support',
        'bids_mep' => 'bids_mep_payment_status_fk_support',
        'bids_notaris' => 'bids_notaris_payment_status_fk_support',
        'bids_project_manager' => 'bids_project_manager_payment_status_fk_support',
        'bids_structural' => 'bids_structural_payment_status_fk_support',
    ];

    public function up(): void
    {
        $this->dropEach();
    }

    public function down(): void
    {
        foreach (self::DUPLICATES as $table => $index) {
            if (! Schema::hasTable($table) || Schema::hasIndex($table, $index)) {
                continue;
            }

            // Additive, and `payment_status` is not a foreign key column, so
            // re-adding cannot invalidate a row. (The ENUM-narrowing case that
            // makes rollback dangerous in AGENTS.md trap 9 does not apply here.)
            Schema::table($table, function ($t) use ($index) {
                $t->index('payment_status', $index);
            });
        }
    }

    private function dropEach(): void
    {
        foreach (self::DUPLICATES as $table => $index) {
            if (! Schema::hasTable($table) || ! Schema::hasIndex($table, $index)) {
                continue;
            }

            // The guard is belt-and-braces. `payment_status` is not a foreign key
            // column, so this should always be droppable -- but the guard is what
            // turns a 1553 into a skip instead of an aborted `migrate --force`
            // on every replica start, which is how trap 10 became an outage once.
            ForeignKeyIndexGuard::dropIndex($table, $index);
        }
    }
};
