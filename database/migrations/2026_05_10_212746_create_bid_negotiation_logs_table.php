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
        Schema::create('bid_negotiation_logs', function (Blueprint $table) {
            $table->id();
            $table->morphs('bid'); // Polymorphic link to BidArsitek, BidPM, etc.
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->integer('round_number');
            $table->json('snapshot'); // Full proposal state (price, fee_type, termins, milestones)
            $table->text('note')->nullable(); // User's reasoning
            $table->json('changes_detected')->nullable(); // Auto-diff summary
            $table->timestamps();

            // Index for performance
            $table->index(['bid_id', 'bid_type', 'round_number']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bid_negotiation_logs');
    }
};
