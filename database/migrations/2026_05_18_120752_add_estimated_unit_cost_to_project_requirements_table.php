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
            $table->decimal('estimated_unit_cost', 15, 2)->nullable()->after('quantity_required');
        });
    }

    public function down(): void
    {
        Schema::table('project_requirements', function (Blueprint $table) {
            $table->dropColumn('estimated_unit_cost');
        });
    }
};
