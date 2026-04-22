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
        Schema::table('projects', function (Blueprint $table) {
            $table->timestamp('design_handover_submitted_at')->nullable();
            $table->timestamp('construction_handover_submitted_at')->nullable();
            $table->timestamp('interior_handover_submitted_at')->nullable();
            $table->text('design_handover_notes')->nullable();
            $table->text('construction_handover_notes')->nullable();
            $table->text('interior_handover_notes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn([
                'design_handover_submitted_at',
                'construction_handover_submitted_at',
                'interior_handover_submitted_at',
                'design_handover_notes',
                'construction_handover_notes',
                'interior_handover_notes',
            ]);
        });
    }
};
