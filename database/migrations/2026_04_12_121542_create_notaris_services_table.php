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
        Schema::create('notaris_services', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('notaris_id');
            $table->string('title');
            $table->decimal('price', 15, 2);
            $table->text('description')->nullable();
            $table->timestamps();

            $table->foreign('notaris_id')->references('id')->on('notaris_profiles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notaris_services');
    }
};
