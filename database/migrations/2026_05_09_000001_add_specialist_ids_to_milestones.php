<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('project_milestones', function (Blueprint $table) {
            $table->unsignedBigInteger('structural_id')->nullable()->after('pm_id');
            $table->unsignedBigInteger('mep_id')->nullable()->after('structural_id');

            $table->foreign('structural_id')->references('id')->on('structural_engineers')->onDelete('cascade');
            $table->foreign('mep_id')->references('id')->on('mep_engineers')->onDelete('cascade');
            
            $table->index('structural_id');
            $table->index('mep_id');
        });
    }

    public function down()
    {
        Schema::table('project_milestones', function (Blueprint $table) {
            $table->dropForeign(['structural_id']);
            $table->dropForeign(['mep_id']);
            $table->dropColumn(['structural_id', 'mep_id']);
        });
    }
};
