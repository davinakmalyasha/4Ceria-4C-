<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_procurement_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->foreignId('requirement_id')->constrained('project_requirements')->onDelete('cascade');
            $table->foreignId('requested_by')->constrained('users')->onDelete('cascade');
            $table->decimal('quantity_needed', 18, 2);
            $table->decimal('estimated_cost', 24, 2)->nullable();
            $table->text('message')->nullable();
            $table->boolean('offer_to_buy')->default(false);
            $table->enum('status', ['pending_pm', 'pending_owner', 'authorized', 'rejected'])->default('pending_pm');
            $table->text('pm_note')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_procurement_requests');
    }
};
