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
        if (Schema::hasTable('project_comments') && !Schema::hasColumn('project_comments', 'parent_id')) {
            Schema::table('project_comments', function (Blueprint $table) {
                $table->foreignId('parent_id')->nullable()->after('user_id')->constrained('project_comments')->onDelete('cascade');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('project_comments') && Schema::hasColumn('project_comments', 'parent_id')) {
            Schema::table('project_comments', function (Blueprint $table) {
                $table->dropForeign(['parent_id']);
                $table->dropColumn('parent_id');
            });
        }
    }
};
