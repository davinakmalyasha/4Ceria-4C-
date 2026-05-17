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
        Schema::table('project_addendums', function (Blueprint $table) {
            $table->unsignedBigInteger('recommended_bid_id')->nullable()->after('amount');
            $table->string('recommended_bid_type')->nullable()->after('recommended_bid_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_addendums', function (Blueprint $table) {
            $table->dropColumn(['recommended_bid_id', 'recommended_bid_type']);
        });
    }
};
