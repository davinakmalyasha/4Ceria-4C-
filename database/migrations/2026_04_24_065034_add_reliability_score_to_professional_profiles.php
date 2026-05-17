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
        $tables = ['arsiteks', 'kontraktors', 'interior_profiles', 'notaris_profiles', 'project_managers'];
        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->integer('reliability_score')->default(100)->after('foto');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $tables = ['arsiteks', 'kontraktors', 'interior_profiles', 'notaris_profiles', 'project_managers'];
        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropColumn('reliability_score');
            });
        }
    }
};
