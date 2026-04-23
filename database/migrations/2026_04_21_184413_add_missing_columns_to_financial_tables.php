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
        Schema::table('project_budget_transactions', function (Blueprint $table) {
            $table->string('category')->nullable()->after('title');
            $table->string('type')->nullable()->after('category');
            $table->string('status')->nullable()->after('type');
            $table->text('description')->nullable()->after('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_budget_transactions', function (Blueprint $table) {
            $table->dropColumn(['category', 'type', 'status', 'description']);
        });
    }
};
