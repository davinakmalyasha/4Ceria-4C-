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
        Schema::create('project_warranty_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->foreignId('reporter_id')->constrained('users'); // Usually the Owner
            $table->string('title');
            $table->text('description');
            $table->json('images')->nullable();
            $table->enum('status', ['open', 'fixing', 'resolved', 'closed'])->default('open');
            $table->decimal('cost_impact', 15, 2)->default(0); // If deducted from retention
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('project_warranty_claims');
    }
};
