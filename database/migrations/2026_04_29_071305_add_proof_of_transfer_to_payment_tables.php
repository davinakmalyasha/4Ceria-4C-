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
        Schema::table('project_payment_termins', function (Blueprint $table) {
            $table->string('payment_proof_path')->nullable()->after('status');
        });

        Schema::table('project_addendums', function (Blueprint $table) {
            $table->string('payment_proof_path')->nullable()->after('status');
        });

        // Update ENUMs
        DB::statement("ALTER TABLE project_addendums MODIFY COLUMN status ENUM('pending_approval', 'approved_unpaid', 'rejected', 'verifying', 'paid') DEFAULT 'pending_approval'");
        DB::statement("ALTER TABLE material_orders MODIFY COLUMN status ENUM('pending', 'awaiting_payment', 'verifying', 'paid', 'shipping', 'delivered', 'completed', 'cancelled') DEFAULT 'pending'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_payment_termins', function (Blueprint $table) {
            $table->dropColumn('payment_proof_path');
        });

        Schema::table('project_addendums', function (Blueprint $table) {
            $table->dropColumn('payment_proof_path');
        });

        // Revert ENUMs
        DB::statement("ALTER TABLE project_addendums MODIFY COLUMN status ENUM('pending_approval', 'approved_unpaid', 'rejected', 'paid') DEFAULT 'pending_approval'");
        DB::statement("ALTER TABLE material_orders MODIFY COLUMN status ENUM('pending', 'awaiting_payment', 'paid', 'shipping', 'delivered', 'completed', 'cancelled') DEFAULT 'pending'");
    }
};
