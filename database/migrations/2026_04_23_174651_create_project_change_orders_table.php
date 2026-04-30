<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_change_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requested_by')->constrained('users');
            $table->string('title');
            $table->text('description');
            $table->decimal('cost_impact', 15, 2)->default(0);
            $table->integer('time_impact_days')->default(0);
            $table->enum('status', ['proposed', 'pm_reviewed', 'owner_approved', 'rejected', 'implemented'])->default('proposed');
            $table->text('pm_notes')->nullable();
            $table->text('owner_notes')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->index(['project_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_change_orders');
    }
};
