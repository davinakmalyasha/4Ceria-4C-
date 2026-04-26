<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_addendums', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->string('role_type'); // arsitek, kontraktor, dll.
            $table->foreignId('user_id')->nullable()->constrained()->onDelete('cascade'); // ID pro yang buat
            $table->string('title');
            $table->text('description')->nullable();
            $table->decimal('amount', 24, 2);
            $table->enum('status', ['pending_approval', 'approved_unpaid', 'rejected', 'paid'])->default('pending_approval');
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_addendums');
    }
};
