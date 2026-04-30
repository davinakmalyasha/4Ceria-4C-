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
        Schema::create('project_timeline_extensions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->foreignId('requester_id')->constrained('users');
            $table->string('reason');
            $table->text('description')->nullable();
            $table->integer('days_requested');
            $table->enum('status', ['proposed', 'pm_reviewed', 'approved', 'rejected'])->default('proposed');
            $table->date('original_deadline');
            $table->date('new_deadline_date')->nullable();
            $table->text('pm_notes')->nullable();
            $table->text('owner_notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('project_timeline_extensions');
    }
};
