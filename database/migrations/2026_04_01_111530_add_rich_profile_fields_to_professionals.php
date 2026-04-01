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
        Schema::table('arsiteks', function (Blueprint $table) {
            $table->text('pendidikan')->nullable();
            $table->text('alasan_hire')->nullable();
        });

        Schema::table('kontraktors', function (Blueprint $table) {
            $table->text('pendidikan')->nullable();
            $table->text('alasan_hire')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('arsiteks', function (Blueprint $table) {
            $table->dropColumn(['pendidikan', 'alasan_hire']);
        });

        Schema::table('kontraktors', function (Blueprint $table) {
            $table->dropColumn(['pendidikan', 'alasan_hire']);
        });
    }
};
