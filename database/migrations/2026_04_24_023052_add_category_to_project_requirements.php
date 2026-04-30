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
        Schema::table('project_requirements', function (Blueprint $table) {
            $table->enum('category', ['structural', 'architecture', 'mep', 'interior', 'general'])->default('general')->after('notes');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_requirements', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }
};
