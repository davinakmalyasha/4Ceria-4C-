<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bids_notaris', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('notaris_id');
            $table->decimal('price', 24, 2)->default(0);
            $table->decimal('tax_estimate', 24, 2)->nullable();
            $table->decimal('fee_percentage', 5, 2)->nullable();
            $table->text('proposal')->nullable();
            $table->enum('status', ['pending', 'accepted', 'rejected'])->default('pending');
            $table->string('estimated_duration')->nullable();
            $table->string('duration_unit')->nullable();
            $table->string('attachment_1')->nullable();
            $table->string('attachment_2')->nullable();
            $table->string('attachment_3')->nullable();
            $table->string('payment_status')->default('unpaid');
            $table->timestamp('paid_at')->nullable();
            $table->json('selected_services')->nullable();
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('notaris_id')->references('id')->on('notaris_profiles')->cascadeOnDelete();
            $table->index(['project_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bids_notaris');
    }
};
