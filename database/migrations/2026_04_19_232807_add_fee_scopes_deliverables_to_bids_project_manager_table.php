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
            $table->string('fee_type')->nullable()->after('duration_unit');
            $table->json('scopes')->nullable()->after('fee_type');
            $table->json('deliverables')->nullable()->after('scopes');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bids_project_manager', function (Blueprint $table) {
            $table->dropColumn(['fee_type', 'scopes', 'deliverables']);
        });
    }
};
