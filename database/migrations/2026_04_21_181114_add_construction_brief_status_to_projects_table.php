<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->string('construction_brief_status')->default('draft')->after('construction_locked_at');
            $table->text('construction_brief_revision_notes')->nullable()->after('construction_brief_status');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['construction_brief_status', 'construction_brief_revision_notes']);
        });
    }
};
