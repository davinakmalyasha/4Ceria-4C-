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
        Schema::table('sticky_notes', function (Blueprint $table) {
            $table->string('title')->nullable()->after('phase_context');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sticky_notes', function (Blueprint $table) {
            $table->dropColumn('title');
        });
    }
};
