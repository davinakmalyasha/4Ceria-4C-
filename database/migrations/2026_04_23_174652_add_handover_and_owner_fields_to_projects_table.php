<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // Final Handover
            $table->timestamp('final_walkthrough_at')->nullable();
            $table->timestamp('owner_accepted_at')->nullable();
            $table->text('owner_acceptance_notes')->nullable();

            // Owner Approval Gates (per phase)
            $table->timestamp('owner_design_approved_at')->nullable();
            $table->timestamp('owner_build_approved_at')->nullable();
            $table->timestamp('owner_interior_approved_at')->nullable();

            // Warranty / Retensi
            $table->timestamp('warranty_start_at')->nullable();
            $table->timestamp('warranty_end_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn([
                'final_walkthrough_at', 'owner_accepted_at', 'owner_acceptance_notes',
                'owner_design_approved_at', 'owner_build_approved_at', 'owner_interior_approved_at',
                'warranty_start_at', 'warranty_end_at',
            ]);
        });
    }
};
