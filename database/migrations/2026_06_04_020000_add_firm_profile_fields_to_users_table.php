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
        Schema::table('users', function (Blueprint $table) {
            $table->string('firm_name')->nullable()->after('pic');
            $table->string('firm_slogan')->nullable()->after('firm_name');
            $table->string('firm_banner_path')->nullable()->after('firm_slogan');
            $table->text('firm_description')->nullable()->after('firm_banner_path');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['firm_name', 'firm_slogan', 'firm_banner_path', 'firm_description']);
        });
    }
};
