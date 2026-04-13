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
        Schema::table('project_documents', function (Blueprint $table) {
            $table->string('category')->default('general')->after('file_type');
            $table->enum('status', ['uploaded', 'under_review', 'awaiting_signature', 'legally_binding'])->default('uploaded')->after('category');
        });

        Schema::table('project_milestones', function (Blueprint $table) {
            $table->unsignedBigInteger('notaris_id')->nullable()->after('kontraktor_id');
            $table->unsignedBigInteger('interior_id')->nullable()->after('notaris_id');

            $table->foreign('notaris_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('interior_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('project_documents', function (Blueprint $table) {
            $table->dropColumn(['category', 'status']);
        });

        Schema::table('project_milestones', function (Blueprint $table) {
            $table->dropForeign(['notaris_id']);
            $table->dropForeign(['interior_id']);
            $table->dropColumn(['notaris_id', 'interior_id']);
        });
    }
};
