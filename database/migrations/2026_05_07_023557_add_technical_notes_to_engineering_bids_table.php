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
        Schema::table('bids_structural', function (Blueprint $table) {
            $table->text('technical_notes')->nullable()->after('proposal');
        });

        Schema::table('bids_mep', function (Blueprint $table) {
            $table->text('technical_notes')->nullable()->after('proposal');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bids_structural', function (Blueprint $table) {
            $table->dropColumn('technical_notes');
        });

        Schema::table('bids_mep', function (Blueprint $table) {
            $table->dropColumn('technical_notes');
        });
    }
};
