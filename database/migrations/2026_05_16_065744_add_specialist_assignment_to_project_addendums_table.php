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
        Schema::table('project_addendums', function (Blueprint $table) {
            $table->string('type')->default('extra_fee')->after('project_id'); // extra_fee, specialist_assignment
            $table->unsignedBigInteger('team_member_id')->nullable()->after('user_id');
            $table->string('specialist_type')->nullable()->after('team_member_id'); // structural, mep
            $table->string('attachment_path')->nullable()->after('description');
            
            $table->foreign('team_member_id')->references('id')->on('team_members')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_addendums', function (Blueprint $table) {
            $table->dropForeign(['team_member_id']);
            $table->dropColumn(['type', 'team_member_id', 'specialist_type', 'attachment_path']);
        });
    }
};
