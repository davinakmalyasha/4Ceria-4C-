<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('bids_kontraktor', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->unsignedBigInteger('kontraktor_id')->nullable();
            $table->decimal('price', 24, 2)->default(0);
            $table->text('proposal')->nullable();
            $table->enum('status', ['pending', 'accepted', 'rejected'])->default('pending');
            $table->integer('estimated_duration')->nullable();
            $table->string('duration_unit')->nullable();
            $table->string('attachment_1')->nullable();
            $table->string('attachment_2')->nullable();
            $table->string('attachment_3')->nullable();
            $table->string('construction_method')->nullable();
            $table->json('cost_breakdown')->nullable();
            $table->integer('workforce_count')->nullable();
            $table->text('equipment_owned')->nullable();
            $table->integer('warranty_months')->nullable();
            $table->string('payment_preference')->nullable();
            $table->string('payment_status')->default('unpaid');
            $table->timestamp('paid_at')->nullable();
            $table->json('scopes')->nullable();
            $table->json('deliverables')->nullable();
            $table->timestamps();

            $table->foreign('kontraktor_id')->references('id')->on('kontraktors')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bids_kontraktor');
    }
};
