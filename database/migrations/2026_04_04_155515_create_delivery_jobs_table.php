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
        Schema::create('delivery_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quote_id')->constrained('material_quotes')->onDelete('cascade');
            $table->foreignId('order_id')->nullable()->constrained('material_orders')->onDelete('cascade');
            $table->foreignId('logistics_id')->nullable()->constrained('users')->onDelete('set null'); // The assigned courier
            $table->text('pickup_address')->nullable();
            $table->text('dropoff_address')->nullable();
            $table->string('status')->default('pending'); // pending, accepted, picked_up, delivered, completed
            $table->decimal('agreed_fee', 15, 2)->nullable();
            $table->string('estimated_weight')->nullable(); // e.g. "500kg"
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('delivery_jobs');
    }
};
