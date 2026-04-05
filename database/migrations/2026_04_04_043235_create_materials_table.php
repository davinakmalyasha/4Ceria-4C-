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
        Schema::create('materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('suppliers')->onDelete('cascade');
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('price', 15, 2);
            $table->string('unit'); // bag, m2, kg, unit, box
            $table->string('category'); // Foundation, Wall, Roof, Finishing, etc.
            $table->integer('stock')->default(0);
            $table->boolean('is_available')->default(true);
            $table->string('image_path')->nullable();
            $table->json('specifications')->nullable(); // Technical specs
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('materials');
    }
};
