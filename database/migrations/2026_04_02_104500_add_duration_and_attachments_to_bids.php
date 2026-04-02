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
            $table->integer('estimated_duration')->nullable()->after('proposal');
            $table->string('duration_unit')->nullable()->after('estimated_duration');
            $table->string('attachment_1')->nullable()->after('duration_unit');
            $table->string('attachment_2')->nullable()->after('attachment_1');
            $table->string('attachment_3')->nullable()->after('attachment_2');
        });

        Schema::table('bids_kontraktor', function (Blueprint $table) {
            $table->integer('estimated_duration')->nullable()->after('proposal');
            $table->string('duration_unit')->nullable()->after('estimated_duration');
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
        Schema::table('bids_arsitek', function (Blueprint $table) {
            $table->dropColumn(['estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2', 'attachment_3']);
        });

        Schema::table('bids_kontraktor', function (Blueprint $table) {
            $table->dropColumn(['estimated_duration', 'duration_unit', 'attachment_1', 'attachment_2', 'attachment_3']);
        });
    }
};
