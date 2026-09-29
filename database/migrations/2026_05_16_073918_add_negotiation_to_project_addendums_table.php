<?php

use App\Support\Schema\EnumValues;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add fee negotiation to an addendum.
     *
     * This file previously did two unsafe things, both of which only worked
     * because the database it ran against had drifted:
     *
     * 1. It added `counter_offer_amount` and `negotiation_note`
     *    UNCONDITIONALLY. The base `create_project_addendums_table` migration
     *    already creates both, so a from-scratch `migrate:fresh` died with
     *    `SQLSTATE[42S21] Column already exists: counter_offer_amount` — which
     *    is to say, `migrate:fresh` has never worked.
     *
     * 2. It rewrote the `status` ENUM with a SHORTER list:
     *       MODIFY COLUMN status ENUM('pending_approval','approved_unpaid',
     *                                   'rejected','paid','negotiating')
     *    The list at that point also contained `verifying`, so this statement
     *    silently REMOVED a legal value. On a populated table under
     *    `sql_mode=strict` it aborts the migration (error 1265) — and because
     *    the Docker entrypoint runs `migrate --force` on every replica start,
     *    that is a deploy-blocking failure. Under non-strict mode it coerces
     *    every `verifying` row to ''. The repair then needed its own migration
     *    one second later (`2026_05_17_000001`), which is the tell.
     *
     * Both are now fixed at the source: the columns are guarded, and the ENUM
     * is only ever EXTENDED, never rewritten. See EnumValues for why that is
     * the only safe operation on a MySQL ENUM.
     */
    public function up(): void
    {
        if (! Schema::hasTable('project_addendums')) {
            return;
        }

        Schema::table('project_addendums', function (Blueprint $table) {
            if (! Schema::hasColumn('project_addendums', 'counter_offer_amount')) {
                $table->decimal('counter_offer_amount', 24, 2)->nullable()->after('amount');
            }

            if (! Schema::hasColumn('project_addendums', 'negotiation_note')) {
                $table->text('negotiation_note')->nullable()->after('description');
            }
        });

        // ADDITIVE ONLY: append `negotiating` if it is not already legal. The
        // existing members (including `verifying` and `authorized`) are
        // preserved in their current order.
        EnumValues::addValues('project_addendums', 'status', ['negotiating']);
    }

    public function down(): void
    {
        if (! Schema::hasTable('project_addendums')) {
            return;
        }

        // Refuse to roll back if any row still depends on `negotiating`:
        // removing an ENUM member that is in use is a data-loss operation, and
        // silently coercing those rows to '' is worse than a failed rollback.
        $inUse = EnumValues::valuesInUseOutside('project_addendums', 'status', array_diff(
            EnumValues::current('project_addendums', 'status'),
            ['negotiating']
        ));

        if ($inUse !== []) {
            throw new RuntimeException(
                'Cannot roll back addendum negotiation: project_addendums.status still holds '
                .implode(', ', $inUse)
                .'. EnumValues::addValues() only ever extends the list, so this migration cannot '
                .'remove `negotiating` without data loss.'
            );
        }

        Schema::table('project_addendums', function (Blueprint $table) {
            if (Schema::hasColumn('project_addendums', 'counter_offer_amount')) {
                $table->dropColumn('counter_offer_amount');
            }

            if (Schema::hasColumn('project_addendums', 'negotiation_note')) {
                $table->dropColumn('negotiation_note');
            }
        });
    }
};
