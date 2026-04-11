<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->unsignedBigInteger('selected_notaris_id')->nullable()->after('selected_kontraktor_id');
            $table->unsignedBigInteger('selected_interior_id')->nullable()->after('selected_notaris_id');
            $table->json('needed_phases')->nullable()->after('target_role')
                ->comment('JSON array of needed phases: legal, design, build, materials, interior, handover');

            $table->index('selected_notaris_id');
            $table->index('selected_interior_id');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['selected_notaris_id']);
            $table->dropIndex(['selected_interior_id']);
            $table->dropColumn(['selected_notaris_id', 'selected_interior_id', 'needed_phases']);
        });
    }
};
