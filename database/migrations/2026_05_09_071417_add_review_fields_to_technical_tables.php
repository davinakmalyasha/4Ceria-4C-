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
        Schema::table('project_milestones', function (Blueprint $table) {
            $table->text('review_note')->nullable()->after('description');
            $table->string('review_status', 50)->default('pending')->after('review_note');
        });

        Schema::table('project_documents', function (Blueprint $table) {
            $table->text('review_note')->nullable()->after('status');
            $table->timestamp('reviewed_at')->nullable()->after('review_note');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_milestones', function (Blueprint $table) {
            $table->dropColumn(['review_note', 'review_status']);
        });

        Schema::table('project_documents', function (Blueprint $table) {
            $table->dropColumn(['review_note', 'reviewed_at']);
        });
    }
};
