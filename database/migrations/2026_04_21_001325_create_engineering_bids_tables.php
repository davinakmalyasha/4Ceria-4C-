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
        Schema::create('bids_structural', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->onDelete('cascade');
            $table->foreignId('structural_id')->constrained('structural_engineers')->onDelete('cascade');
            $table->bigInteger('price');
            $table->string('fee_type', 50)->nullable()->default('fixed');
            $table->bigInteger('unit_price')->nullable();
            $table->decimal('quantity', 15, 2)->nullable();
            $table->bigInteger('calculated_total')->nullable();
            $table->text('proposal');
            $table->string('status')->default('pending');
            $table->integer('estimated_duration')->nullable();
            $table->string('duration_unit', 50)->nullable();
            $table->string('attachment_1')->nullable();
            $table->string('attachment_2')->nullable();
            $table->string('attachment_3')->nullable();
            $table->json('scopes')->nullable();
            $table->json('deliverables')->nullable();
            $table->string('payment_status')->default('unpaid');
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        Schema::create('bids_mep', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->onDelete('cascade');
            $table->foreignId('mep_id')->constrained('mep_engineers')->onDelete('cascade');
            $table->bigInteger('price');
            $table->string('fee_type', 50)->nullable()->default('fixed');
            $table->bigInteger('unit_price')->nullable();
            $table->decimal('quantity', 15, 2)->nullable();
            $table->bigInteger('calculated_total')->nullable();
            $table->text('proposal');
            $table->string('status')->default('pending');
            $table->integer('estimated_duration')->nullable();
            $table->string('duration_unit', 50)->nullable();
            $table->string('attachment_1')->nullable();
            $table->string('attachment_2')->nullable();
            $table->string('attachment_3')->nullable();
            $table->json('scopes')->nullable();
            $table->json('deliverables')->nullable();
            $table->string('payment_status')->default('unpaid');
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bids_structural');
        Schema::dropIfExists('bids_mep');
    }
};
