<?php

use App\Support\Schema\EnumValues;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Two ENUM columns the application writes values that simply are not in.
 *
 * WHY APPEND, NEVER `MODIFY COLUMN`
 * ---------------------------------
 * `EnumValues::addValues()` only ever APPENDS and preserves the existing order,
 * so no row can be invalidated by the statement. A hand-written
 * `MODIFY COLUMN ... ENUM(...)` that drops a value is an ALGORITHM=COPY table
 * rebuild which aborts with error 1265 if any row still holds it -- and the
 * container entrypoint runs `migrate --force` on every replica start, so that
 * failure becomes a deploy-time outage. See AGENTS.md trap 9.
 *
 * THE TWO BUGS
 * ------------
 * 1. `material_orders.status`
 *    `MaterialOrderController::update()` validates
 *    `in:pending,processing,ready_for_pickup,awaiting_payment,paid,shipping,...`
 *    but the column is
 *    `enum('pending','awaiting_payment','verifying','paid','shipping','delivered','completed','cancelled')`.
 *    So a supplier pressing "Diproses Toko" or "Siap Diambil" in the SPA got
 *    ERROR 1265 under STRICT_TRANS_TABLES -- an unconditional 500.
 *
 *    These are NOT aliased onto `paid`/`shipping` on purpose. The SPA treats them
 *    as distinct, buyer-visible states:
 *      - OrderCard.tsx   renders 'processing' as "Diproses Toko" (amber) and
 *                          'ready_for_pickup' as "Siap Diambil" (blue)
 *      - TrackingTimeline.tsx keys a delivery step off `ready_for_pickup`
 *    Collapsing them would silently destroy the order tracking the buyer is shown.
 *
 * 2. `team_members.owner_role`
 *    `TeamMemberController::store()` admits
 *    `['arsitek','kontraktor','structural','mep','interior']` and then writes
 *    `owner_role => $user->role_type`, but the column is `enum('arsitek','kontraktor')`.
 *    So a structural engineer, MEP engineer or interior designer -- three roles
 *    the 4C Specialist feature exists for -- got an unconditional 500 when adding
 *    anyone to their team, and the controller's own allow-list contradicted the
 *    schema.
 *
 * Both are append-only, and `addValues()` is a no-op when the values are already
 * present, so this migration is safe to re-run and safe on a database that has
 * already been ALTERed.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('material_orders') && Schema::hasColumn('material_orders', 'status')) {
            EnumValues::addValues('material_orders', 'status', ['processing', 'ready_for_pickup']);
        }

        if (Schema::hasTable('team_members') && Schema::hasColumn('team_members', 'owner_role')) {
            EnumValues::addValues('team_members', 'owner_role', ['structural', 'mep', 'interior']);
        }
    }

    public function down(): void
    {
        // Intentionally empty.
        //
        // A rollback would have to DROP the four values, which is the
        // ALGORITHM=COPY rebuild described above, and it would fail outright for
        // any row that already uses one of them. These values are written by
        // shipping code paths, so there is no safe "before" state to return to;
        // the values are additive and inert for older readers.
    }
};