<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Retention release bookkeeping.
 *
 * `retention_amount` and `net_amount` have existed on
 * `project_payment_termins` since they were added, and had exactly ONE write
 * site, which hardcoded `retention_amount => 0`. So retention was a display-only
 * fiction: nothing was ever held back, and nothing could ever be released.
 *
 * This migration adds what a release needs to be AUDITABLE and IDEMPOTENT:
 *
 *   retention_released_at      when the balance moved. NULL means "still held",
 *                               and is what the release command filters on, so a
 *                               repeated run cannot pay twice.
 *   retention_released_amount  the figure that was actually paid, recorded rather
 *                               than inferred. If the retention PERCENTAGE changes
 *                               between hold and release, the amount released is
 *                               the one that was held, and this column proves it.
 *
 * Both are NULLABLE and additive: existing rows are untouched and read as "never
 * released", which is the truthful description of a row whose retention was 0.
 *
 * No backfill. A row with `retention_amount = 0` has nothing to release, and
 * inventing a release date for it would put a false event in the ledger's history.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('project_payment_termins')) {
            return;
        }

        Schema::table('project_payment_termins', function ($table) {
            if (! Schema::hasColumn('project_payment_termins', 'retention_released_at')) {
                $table->timestamp('retention_released_at')->nullable()->after('retention_amount');
            }

            if (! Schema::hasColumn('project_payment_termins', 'retention_released_amount')) {
                $table->decimal('retention_released_amount', 24, 2)->nullable()->after('retention_released_at');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('project_payment_termins')) {
            return;
        }

        Schema::table('project_payment_termins', function ($table) {
            // Dropping a column is safe here -- these are bookkeeping fields added
            // by this migration and hold no row data that cannot be recomputed.
            // This is NOT the ENUM case in AGENTS.md trap 9, where narrowing a
            // type rebuilds the table and can invalidate rows.
            $columns = array_values(array_filter(
                ['retention_released_at', 'retention_released_amount'],
                fn ($c) => Schema::hasColumn('project_payment_termins', $c)
            ));

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};