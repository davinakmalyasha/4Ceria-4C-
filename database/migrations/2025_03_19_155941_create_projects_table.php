<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Consolidated projects table — includes ALL columns the Project model uses.
     * This prevents cascading failures in downstream ALTER TABLE migrations.
     */
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('title');
            $table->text('description')->nullable();
            $table->decimal('budget', 24, 2)->default(0);
            $table->string('lokasi')->nullable();
            $table->string('jenis_proyek')->nullable();
            $table->unsignedBigInteger('owner_id')->nullable();
            $table->unsignedBigInteger('selected_arsitek_id')->nullable();
            $table->unsignedBigInteger('selected_kontraktor_id')->nullable();
            $table->unsignedBigInteger('selected_notaris_id')->nullable();
            $table->unsignedBigInteger('selected_interior_id')->nullable();
            $table->unsignedBigInteger('pm_id')->nullable();
            $table->unsignedBigInteger('structural_id')->nullable();
            $table->unsignedBigInteger('mep_id')->nullable();
            $table->enum('status', [
                'open', 'accepted_arsitek', 'accepted_kontraktor',
                'in_progress', 'legal', 'procurement', 'completed_build',
                'completed', 'cancelled'
            ])->default('open');
            $table->string('target_role')->default('arsitek');
            $table->json('needed_phases')->nullable();
            $table->json('completed_phases')->nullable();
            $table->boolean('wants_project_manager')->default(false);
            $table->boolean('requires_structural')->default(false);
            $table->boolean('requires_mep')->default(false);

            // Location
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('province')->nullable();
            $table->string('city')->nullable();
            $table->string('kecamatan')->nullable();
            $table->string('kelurahan')->nullable();
            $table->string('postal_code')->nullable();
            $table->string('street_name')->nullable();

            // Design Phase
            $table->json('design_details')->nullable();
            $table->timestamp('design_completed_at')->nullable();
            $table->timestamp('design_locked_at')->nullable();

            // Construction Phase
            $table->json('construction_details')->nullable();
            $table->timestamp('construction_completed_at')->nullable();
            $table->timestamp('construction_locked_at')->nullable();

            // Interior Phase
            $table->json('interior_details')->nullable();
            $table->timestamp('interior_locked_at')->nullable();
            $table->timestamp('interior_completed_at')->nullable();

            // Planning Workflow
            $table->string('planning_status')->default('draft');
            $table->decimal('negotiated_fee', 24, 2)->nullable();
            $table->text('payment_instructions')->nullable();
            $table->timestamp('planning_submitted_at')->nullable();
            $table->timestamp('planning_approved_at')->nullable();
            $table->timestamp('design_payment_verified_at')->nullable();
            $table->text('pm_audit_notes')->nullable();
            $table->json('pm_audit_attachments')->nullable();
            $table->text('architect_notes')->nullable();
            $table->integer('planning_iteration')->default(0);

            // Project Details
            $table->string('project_category')->nullable();
            $table->json('project_dimensions')->nullable();
            $table->json('legal_requirements')->nullable();

            // Sharing
            $table->string('share_token')->nullable()->unique();

            // Misc
            $table->string('attachment')->nullable();
            $table->date('deadline')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
