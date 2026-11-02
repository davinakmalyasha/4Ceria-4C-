<?php

use App\Support\Schema\EnumValues;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Append `recommended` to the four ENUM-backed bid tables.
     *
     * WHY
     * ---
     * The specialist recommendation flow writes `status = 'recommended'`.
     * `bids_structural` and `bids_mep` keep that column as VARCHAR(255), so the
     * write always worked there; the four ENUM tables (`bids_arsitek`,
     * `bids_kontraktor`, `bids_notaris`, `bids_interior`) did not carry the
     * label. The PostgreSQL baseline folds all seven into ONE `bid_status`
     * type, and its 0017 migration appends `recommended` so the port can store
     * the value. That made PostgreSQL a superset of the live MySQL ENUM union,
     * which the schema gate correctly reports as drift.
     *
     * `EnumValues::addValues()` only ever APPENDS (AGENTS.md trap #9): it
     * cannot invalidate a row, and it preserves the existing order. The
     * PostgreSQL append was changed to append as well, so both engines carry
     * the same thirteen labels in the same order.
     */
    public function up(): void
    {
        foreach (['bids_arsitek', 'bids_kontraktor', 'bids_notaris', 'bids_interior'] as $table) {
            EnumValues::addValues($table, 'status', ['recommended']);
        }
    }

    /**
     * Removing an ENUM value is a destructive table rebuild that aborts on any
     * row holding it (trap #9). Append-only migrations do not roll back; the
     * value stays available, which is harmless.
     */
    public function down(): void
    {
        // Intentionally irreversible.
    }
};
