<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Add new columns for timestamps
        Schema::table('material_orders', function (Blueprint $table) {
            if (!Schema::hasColumn('material_orders', 'ready_for_pickup_at')) {
                $table->timestamp('ready_for_pickup_at')->after('paid_at')->nullable();
            }
        });

        // Update the enum status column
        // Since Laravel's $table->enum doesn't support easy modifications on some DBs, 
        // and we want to preserve data, we'll use raw SQL for MySQL/MariaDB.
        DB::statement("ALTER TABLE material_orders MODIFY COLUMN status ENUM('pending', 'awaiting_payment', 'paid', 'processing', 'ready_for_pickup', 'shipping', 'delivered', 'completed', 'cancelled') DEFAULT 'pending'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_orders', function (Blueprint $table) {
            $table->dropColumn('ready_for_pickup_at');
        });

        DB::statement("ALTER TABLE material_orders MODIFY COLUMN status ENUM('pending', 'awaiting_payment', 'paid', 'shipping', 'delivered', 'completed', 'cancelled') DEFAULT 'pending'");
    }
};
