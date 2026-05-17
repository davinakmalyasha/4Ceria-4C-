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
        Schema::table('project_external_vendors', function (Blueprint $table) {
            $table->foreignId('team_member_id')->nullable()->after('project_id')->constrained('team_members')->onDelete('set null');
            $table->text('notes')->nullable()->after('agreed_fee');
        });

        // Update enum to include structural and mep roles
        DB::statement("ALTER TABLE project_external_vendors MODIFY COLUMN phase_role ENUM('arsitek', 'kontraktor', 'notaris', 'interior', 'project_manager', 'structural', 'mep') NOT NULL");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_external_vendors', function (Blueprint $table) {
            $table->dropForeign(['team_member_id']);
            $table->dropColumn(['team_member_id', 'notes']);
        });

        DB::statement("ALTER TABLE project_external_vendors MODIFY COLUMN phase_role ENUM('arsitek', 'kontraktor', 'notaris', 'interior', 'project_manager') NOT NULL");
    }
};
