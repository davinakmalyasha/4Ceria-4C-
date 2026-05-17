<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bids_arsitek', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->unsignedBigInteger('arsitek_id')->nullable();
            $table->decimal('price', 24, 2)->default(0);
            $table->text('proposal')->nullable();
            $table->enum('status', ['pending', 'accepted', 'rejected'])->default('pending');
            $table->integer('estimated_duration')->nullable();
            $table->string('duration_unit')->nullable();
            $table->string('attachment_1')->nullable();
            $table->string('attachment_2')->nullable();
            $table->string('attachment_3')->nullable();
            $table->string('payment_status')->default('unpaid');
            $table->timestamp('paid_at')->nullable();
            $table->json('scopes')->nullable();
            $table->json('deliverables')->nullable();
            $table->timestamps();

            $table->foreign('arsitek_id')->references('id')->on('arsiteks')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bids_arsitek');
    }
};
