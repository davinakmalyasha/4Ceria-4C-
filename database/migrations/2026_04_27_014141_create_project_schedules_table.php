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
        Schema::create('project_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->string('phase_slug'); // legal, design, build, etc.
            $table->date('target_start_date')->nullable();
            $table->date('target_end_date')->nullable();
            $table->date('actual_start_date')->nullable();
            $table->date('actual_end_date')->nullable();
            $table->integer('progress_percentage')->default(0);
            $table->string('status')->default('pending'); // pending, active, completed, delayed
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['project_id', 'phase_slug']);
        });

        Schema::create('project_delays', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->string('phase_slug');
            $table->integer('days');
            $table->string('reason');
            $table->string('category')->default('external'); // weather, materials, labor, permits, design_change
            $table->date('logged_at');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('project_delays');
        Schema::dropIfExists('project_schedules');
    }
};
