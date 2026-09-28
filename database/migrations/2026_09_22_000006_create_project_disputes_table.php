<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_disputes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('opened_by')->constrained('users');
            $table->foreignId('termination_id')->nullable()->constrained('project_terminations')->nullOnDelete();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('category', 40)->index();
            $table->string('title');
            $table->text('description');
            $table->string('status', 20)->default('open')->index();
            $table->decimal('disputed_amount', 15, 2)->nullable();
            // Optional link to the payment under contention (types match
            // PaymentVerificationController: termin, addendum, material, *_bid).
            $table->string('payment_type', 40)->nullable();
            $table->unsignedBigInteger('payment_id')->nullable();
            $table->string('resolution', 30)->nullable();
            $table->text('resolution_notes')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['project_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_disputes');
    }
};
