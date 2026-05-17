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
        Schema::create('project_payment_termins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->string('label'); // e.g. "Termin 1 — Down Payment"
            $table->decimal('percentage', 5, 2)->default(0); // e.g. 30.00
            $table->bigInteger('amount')->default(0); // calculated from contract price
            $table->string('trigger_description')->nullable(); // what triggers this payment
            $table->string('status')->default('locked'); // locked, pending, invoice_sent, paid
            $table->unsignedBigInteger('milestone_id')->nullable(); // linked milestone
            $table->timestamp('paid_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('project_id');
            $table->foreign('milestone_id')->references('id')->on('project_milestones')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('project_payment_termins');
    }
};
