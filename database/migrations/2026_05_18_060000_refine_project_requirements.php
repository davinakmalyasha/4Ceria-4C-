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
        // 1. Add bom_type to project_requirements table
        if (Schema::hasTable('project_requirements') && !Schema::hasColumn('project_requirements', 'bom_type')) {
            Schema::table('project_requirements', function (Blueprint $table) {
                $table->enum('bom_type', ['raw', 'finishing'])->default('raw')->after('name');
            });
        }

        // 2. Create project_requirement_histories table
        if (!Schema::hasTable('project_requirement_histories')) {
            Schema::create('project_requirement_histories', function (Blueprint $table) {
                $table->id();
                $table->foreignId('project_requirement_id')
                    ->constrained('project_requirements')
                    ->onDelete('cascade');
                $table->foreignId('user_id')
                    ->nullable()
                    ->constrained('users')
                    ->onDelete('set null');
                $table->enum('type', ['restock', 'use']);
                $table->decimal('quantity', 15, 2);
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('project_requirement_histories');

        if (Schema::hasTable('project_requirements') && Schema::hasColumn('project_requirements', 'bom_type')) {
            Schema::table('project_requirements', function (Blueprint $table) {
                $table->dropColumn('bom_type');
            });
        }
    }
};
