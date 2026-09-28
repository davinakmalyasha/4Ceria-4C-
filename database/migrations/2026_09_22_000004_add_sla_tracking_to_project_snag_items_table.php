<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Snag/defect items get an SLA deadline (by severity) and a one-shot
     * escalation marker so overdue items surface instead of aging silently.
     */
    public function up(): void
    {
        Schema::table('project_snag_items', function (Blueprint $table) {
            $table->timestamp('due_at')->nullable()->after('status');
            $table->timestamp('escalated_at')->nullable()->after('due_at');
        });
    }

    public function down(): void
    {
        Schema::table('project_snag_items', function (Blueprint $table) {
            $table->dropColumn(['due_at', 'escalated_at']);
        });
    }
};
