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
        Schema::table('project_addendums', function (Blueprint $table) {
            $table->decimal('counter_offer_amount', 24, 2)->nullable()->after('amount');
            $table->text('negotiation_note')->nullable()->after('description');
            // We can't easily modify ENUM in Laravel without a raw query or changing to string
            // For safety and compatibility, we'll allow the status to be updated via raw if needed, 
            // or just rely on the application logic if we change it to string later.
            // But let's try to add it.
        });

        // Add 'negotiating' to the enum if possible, or just handle it as a valid value in logic
        DB::statement("ALTER TABLE project_addendums MODIFY COLUMN status ENUM('pending_approval', 'approved_unpaid', 'rejected', 'paid', 'negotiating') DEFAULT 'pending_approval'");
    }

    public function down(): void
    {
        Schema::table('project_addendums', function (Blueprint $table) {
            $table->dropColumn(['counter_offer_amount', 'negotiation_note']);
        });
        DB::statement("ALTER TABLE project_addendums MODIFY COLUMN status ENUM('pending_approval', 'approved_unpaid', 'rejected', 'paid') DEFAULT 'pending_approval'");
    }
};
