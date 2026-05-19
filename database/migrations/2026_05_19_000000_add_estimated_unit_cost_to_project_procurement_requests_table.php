<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_procurement_requests', function (Blueprint $table) {
            $table->decimal('estimated_unit_cost', 24, 2)->nullable()->after('quantity_needed');
        });
    }

    public function down(): void
    {
        Schema::table('project_procurement_requests', function (Blueprint $table) {
            $table->dropColumn('estimated_unit_cost');
        });
    }
};
