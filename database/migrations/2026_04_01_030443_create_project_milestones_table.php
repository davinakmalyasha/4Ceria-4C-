<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_milestones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->onDelete('cascade');
            $table->unsignedBigInteger('arsitek_id')->nullable();
            $table->unsignedBigInteger('kontraktor_id')->nullable();
            $table->unsignedBigInteger('notaris_id')->nullable();
            $table->unsignedBigInteger('interior_id')->nullable();
            $table->unsignedBigInteger('pm_id')->nullable();
            $table->string('title');
            $table->string('type')->default('milestone');
            $table->json('content')->nullable();
            $table->text('description')->nullable();
            $table->string('image')->nullable();
            $table->integer('sort_order')->default(0);
            $table->date('start_date')->nullable();
            $table->date('due_date')->nullable();
            $table->boolean('is_completed')->default(false);
            $table->string('approval_status')->default('pending');
            $table->text('revision_notes')->nullable();
            $table->string('phase_context')->nullable();
            $table->timestamp('pm_verified_at')->nullable();
            $table->string('progress_attachment')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_milestones');
    }
};
