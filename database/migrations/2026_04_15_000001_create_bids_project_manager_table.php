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
        Schema::create('bids_project_manager', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->foreignId('pm_id')->constrained('project_managers')->onDelete('cascade');
            $table->decimal('price', 15, 2);
            $table->text('proposal');
            $table->string('status')->default('pending'); // pending, accepted, declined
            $table->integer('estimated_duration')->nullable(); // weeks
            $table->string('duration_unit')->default('weeks');
            $table->string('payment_status')->default('unpaid'); // unpaid, paid
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bids_project_manager');
    }
};
