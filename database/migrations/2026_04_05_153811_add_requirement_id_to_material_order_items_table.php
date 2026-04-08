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
        Schema::table('material_order_items', function (Blueprint $table) {
            $table->foreignId('requirement_id')->nullable()->constrained('project_requirements')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_order_items', function (Blueprint $table) {
            $table->dropForeign(['requirement_id']);
            $table->dropColumn('requirement_id');
        });
    }
};
