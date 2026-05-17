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
        Schema::table('bids_project_manager', function (Blueprint $table) {
            $table->json('proposed_termins')->nullable()->after('verification_notes');
            $table->json('proposed_milestones')->nullable()->after('proposed_termins');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bids_project_manager', function (Blueprint $table) {
            $table->dropColumn(['proposed_termins', 'proposed_milestones']);
        });
    }
};
