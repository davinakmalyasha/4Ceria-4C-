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
        Schema::create('material_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('supplier_id')->constrained('suppliers')->onDelete('cascade');
            $table->foreignId('project_id')->nullable()->constrained('projects')->onDelete('set null');
            
            $table->enum('status', ['pending', 'awaiting_payment', 'paid', 'shipping', 'delivered', 'completed', 'cancelled'])->default('pending');
            $table->decimal('total_price', 15, 2);
            $table->decimal('shipping_cost', 15, 2)->default(0);
            
            $table->string('whatsapp_order_id')->unique(); // Unique code for WhatsApp reference
            $table->string('payment_proof_path')->nullable(); // Optional receipt upload
            $table->text('notes')->nullable();
            
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('material_orders');
    }
};
