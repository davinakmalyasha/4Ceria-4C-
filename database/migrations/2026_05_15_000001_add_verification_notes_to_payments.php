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
        Schema::table('project_payment_termins', function (Blueprint $table) {
            $table->text('verification_notes')->nullable()->after('payment_proof_path');
        });

        Schema::table('project_addendums', function (Blueprint $table) {
            $table->text('verification_notes')->nullable()->after('payment_proof_path');
        });

        Schema::table('material_orders', function (Blueprint $table) {
            $table->text('verification_notes')->nullable()->after('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_payment_termins', function (Blueprint $table) {
            $table->dropColumn('verification_notes');
        });

        Schema::table('project_addendums', function (Blueprint $table) {
            $table->dropColumn('verification_notes');
        });

        Schema::table('material_orders', function (Blueprint $table) {
            $table->dropColumn('verification_notes');
        });
    }
};
