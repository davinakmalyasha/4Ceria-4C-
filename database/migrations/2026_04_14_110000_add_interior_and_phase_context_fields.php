<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->json('interior_details')->nullable()->after('construction_details');
            $table->timestamp('interior_locked_at')->nullable()->after('interior_details');
            $table->timestamp('interior_completed_at')->nullable()->after('interior_locked_at');
        });

        Schema::table('project_milestones', function (Blueprint $table) {
            $table->string('phase_context')->nullable()->default('build')->after('type');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['interior_details', 'interior_locked_at', 'interior_completed_at']);
        });

        Schema::table('project_milestones', function (Blueprint $table) {
            $table->dropColumn('phase_context');
        });
    }
};
