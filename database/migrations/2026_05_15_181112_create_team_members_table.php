<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('team_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('owner_user_id')->constrained('users')->onDelete('cascade');
            $table->enum('owner_role', ['arsitek', 'kontraktor']);
            $table->string('name', 255);
            $table->string('photo_path', 500)->nullable();
            $table->string('role_title', 100);
            $table->text('bio')->nullable();
            $table->json('skills')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('email', 255)->nullable();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();

            $table->index(['owner_user_id', 'status'], 'idx_owner_status');
            $table->index(['owner_user_id', 'owner_role'], 'idx_owner_role');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('team_members');
    }
};
