<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('firm_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('firm_owner_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('member_user_id')->constrained('users')->onDelete('cascade');
            $table->string('role_in_firm', 50);
            $table->enum('status', ['invited', 'active', 'removed'])->default('invited');
            $table->timestamp('invited_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();

            $table->unique(['firm_owner_id', 'member_user_id'], 'idx_firm_unique');
            $table->index(['member_user_id', 'status'], 'idx_member_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('firm_members');
    }
};
