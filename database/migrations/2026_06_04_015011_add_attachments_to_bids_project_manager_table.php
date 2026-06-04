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
        Schema::table('bids_project_manager', function (Blueprint $table) {
            $table->string('attachment_1')->nullable()->after('duration_unit');
            $table->string('attachment_2')->nullable()->after('attachment_1');
            $table->string('attachment_3')->nullable()->after('attachment_2');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bids_project_manager', function (Blueprint $table) {
            $table->dropColumn(['attachment_1', 'attachment_2', 'attachment_3']);
        });
    }
};
