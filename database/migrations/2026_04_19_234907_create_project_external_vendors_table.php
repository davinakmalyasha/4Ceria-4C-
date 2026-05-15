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
        Schema::create('project_external_vendors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->onDelete('cascade');
            $table->enum('phase_role', ['arsitek', 'kontraktor', 'notaris', 'interior']);
            $table->string('company_name')->nullable();
            $table->string('contact_person');
            $table->string('phone_number');
            $table->string('email')->nullable();
            $table->decimal('agreed_fee', 15, 2)->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('project_external_vendors');
    }
};
