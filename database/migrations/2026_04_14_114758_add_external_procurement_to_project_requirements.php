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
        Schema::table('project_requirements', function (Blueprint $table) {
            $table->decimal('quantity_procured_externally', 15, 2)->default(0)->after('quantity_required');
            $table->decimal('external_cost', 15, 2)->default(0)->after('quantity_procured_externally');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_requirements', function (Blueprint $table) {
            $table->dropColumn(['quantity_procured_externally', 'external_cost']);
        });
    }
};
