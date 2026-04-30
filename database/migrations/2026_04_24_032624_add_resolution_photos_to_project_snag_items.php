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
        Schema::table('project_snag_items', function (Blueprint $table) {
            $table->json('resolution_photos')->nullable()->after('resolution_note');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_snag_items', function (Blueprint $table) {
            $table->dropColumn('resolution_photos');
        });
    }
};
