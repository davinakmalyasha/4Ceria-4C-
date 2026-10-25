<?php

use App\Support\Schema\ForeignKeyIndexGuard;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Link auto-generated payment stages back to the change order that
     * produced them.
     *
     * WHY: `ProjectChangeOrderController::ownerDecide` minted a brand-new
     * ProjectPaymentTermin on EVERY approval, with no status guard — so
     * approve → reject → approve produced two ordinary payable stages for one
     * change order, and each was a distinct reference so the ledger dedupe
     * could never catch it. A nullable UNIQUE column makes "one payable stage
     * per change order" a database invariant instead of a convention.
     */
    public function up(): void
    {
        if (! Schema::hasTable('project_payment_termins')) {
            return;
        }

        if (Schema::hasColumn('project_payment_termins', 'change_order_id')) {
            return;
        }

        if (! Schema::hasTable('project_change_orders')) {
            return;
        }

        Schema::table('project_payment_termins', function (Blueprint $table) {
            $table->foreignId('change_order_id')
                ->nullable()
                ->after('milestone_id')
                ->constrained('project_change_orders')
                ->nullOnDelete();

            // One payable stage per change order.
            $table->unique('change_order_id', 'payment_termin_change_order_unique');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('project_payment_termins') || ! Schema::hasColumn('project_payment_termins', 'change_order_id')) {
            return;
        }

        // The unique index's LEADING column is the foreign-key column, so
        // InnoDB adopted it as the constraint's only backing store. Dropping
        // it first fails with:
        //
        //     1553 Cannot drop index 'payment_termin_change_order_unique':
        //     needed in a foreign key constraint
        //
        // The guard creates a plain single-column index on `change_order_id`
        // first, so the constraint keeps a backing store and the drop
        // succeeds. MySQL removes the support index along with the column in
        // the next statement, so nothing is left behind.
        ForeignKeyIndexGuard::dropIndex('project_payment_termins', 'payment_termin_change_order_unique');

        Schema::table('project_payment_termins', function (Blueprint $table) {
            $table->dropConstrainedForeignId('change_order_id');
        });
    }
};
