<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_sub_professionals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->enum('parent_role', ['arsitek', 'kontraktor']);
            $table->string('sub_role', 50);
            $table->foreignId('assigned_by')->constrained('users')->onDelete('cascade');
            $table->enum('status', ['invited', 'accepted', 'active', 'completed', 'removed'])->default('invited');
            $table->decimal('rate', 24, 2)->default(0);
            $table->text('scope_notes')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['project_id', 'user_id', 'sub_role'], 'unique_project_sub');
            $table->index(['project_id', 'status'], 'idx_project_status');
            $table->index(['user_id', 'sub_role'], 'idx_user_role');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_sub_professionals');
    }
};
