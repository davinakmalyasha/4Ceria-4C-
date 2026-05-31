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
        Schema::table('project_managers', function (Blueprint $table) {
            $table->text('alasan_hire')->nullable()->after('pendidikan');
        });
        Schema::table('structural_engineers', function (Blueprint $table) {
            $table->text('alasan_hire')->nullable()->after('pendidikan');
        });
        Schema::table('mep_engineers', function (Blueprint $table) {
            $table->text('alasan_hire')->nullable()->after('pendidikan');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_managers', function (Blueprint $table) {
            $table->dropColumn('alasan_hire');
        });
        Schema::table('structural_engineers', function (Blueprint $table) {
            $table->dropColumn('alasan_hire');
        });
        Schema::table('mep_engineers', function (Blueprint $table) {
            $table->dropColumn('alasan_hire');
        });
    }
};
