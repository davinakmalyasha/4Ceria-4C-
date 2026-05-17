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
            $table->boolean('is_recommended')->default(false)->after('status');
            $table->text('interview_notes')->nullable()->after('is_recommended');
        });

        Schema::table('bids_mep', function (Blueprint $table) {
            $table->boolean('is_recommended')->default(false)->after('status');
            $table->text('interview_notes')->nullable()->after('is_recommended');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bids_structural', function (Blueprint $table) {
            $table->dropColumn(['is_recommended', 'interview_notes']);
        });

        Schema::table('bids_mep', function (Blueprint $table) {
            $table->dropColumn(['is_recommended', 'interview_notes']);
        });
    }
};
