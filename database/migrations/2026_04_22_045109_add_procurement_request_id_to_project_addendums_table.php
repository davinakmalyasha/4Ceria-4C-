<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_addendums', function (Blueprint $table) {
            $table->foreignId('procurement_request_id')->nullable()->constrained('project_procurement_requests')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('project_addendums', function (Blueprint $table) {
            if (Schema::hasColumn('project_addendums', 'procurement_request_id')) {
                $table->dropForeign(['procurement_request_id']);
                $table->dropColumn('procurement_request_id');
            }
        });
    }
};
