<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('firm_members', function (Blueprint $table) {
            $table->timestamp('requested_at')->nullable()->after('accepted_at');
        });
    }

    public function down(): void
    {
        Schema::table('firm_members', function (Blueprint $table) {
            $table->dropColumn('requested_at');
        });
    }
};
