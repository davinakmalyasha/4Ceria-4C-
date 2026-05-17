<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('project_change_orders', function (Blueprint $table) {
            $table->foreignId('milestone_id')->nullable()->constrained('project_milestones')->nullOnDelete();
            $table->string('role_type')->nullable()->after('requested_by');
        });
    }

    public function down(): void
    {
        Schema::table('project_change_orders', function (Blueprint $table) {
            $table->dropForeign(['milestone_id']);
            $table->dropColumn(['milestone_id', 'role_type']);
        });
    }
};
