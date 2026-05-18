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
        Schema::table('project_material_folders', function (Blueprint $table) {
            $table->string('bom_type')->default('raw')->after('name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_material_folders', function (Blueprint $table) {
            $table->dropColumn('bom_type');
        });
    }
};
