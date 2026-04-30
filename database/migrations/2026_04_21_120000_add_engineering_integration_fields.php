<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->timestamp('structural_approved_at')->nullable()->after('mep_id');
            $table->timestamp('mep_approved_at')->nullable()->after('structural_approved_at');
        });

        Schema::table('project_documents', function (Blueprint $table) {
            $table->string('target_role', 50)->nullable()->after('category')->comment('structural|mep|architect - who this doc is for');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['structural_approved_at', 'mep_approved_at']);
        });

        Schema::table('project_documents', function (Blueprint $table) {
            $table->dropColumn('target_role');
        });
    }
};
