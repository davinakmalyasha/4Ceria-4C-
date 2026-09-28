<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The handover lifecycle previously mass-assigned `walkthrough_status`
     * while no such column existed, so every write was silently dropped.
     */
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->string('walkthrough_status')->nullable()->after('final_walkthrough_at');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('walkthrough_status');
        });
    }
};
