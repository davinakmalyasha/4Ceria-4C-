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
        Schema::table('bids_arsitek', function (Blueprint $table) {
            $table->dropForeign('bids_arsitek_ibfk_2');
            $table->foreign('arsitek_id')->references('id')->on('arsiteks')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bids_arsitek', function (Blueprint $table) {
            $table->dropForeign(['arsitek_id']); // Drops the newly created constraint
            $table->foreign('arsitek_id', 'bids_arsitek_ibfk_2')->references('id')->on('users')->onDelete('cascade');
        });
    }
};
