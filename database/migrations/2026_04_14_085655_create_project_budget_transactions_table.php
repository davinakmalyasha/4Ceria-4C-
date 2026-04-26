<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_budget_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->enum('transaction_type', ['deposit', 'adjustment_down', 'payment', 'refund']);
            $table->decimal('amount', 24, 2);
            $table->string('title');
            $table->string('reference_model')->nullable(); // e.g., 'BidArsitek', 'ProjectAddendum', 'ProjectPaymentTermin'
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->timestamp('transaction_date');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_budget_transactions');
    }
};
