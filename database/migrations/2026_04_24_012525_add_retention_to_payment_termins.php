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
        Schema::table('project_payment_termins', function (Blueprint $table) {
            $table->decimal('retention_amount', 15, 2)->default(0)->after('amount');
            $table->decimal('net_amount', 15, 2)->default(0)->after('retention_amount');
            $table->text('retention_notes')->nullable()->after('notes');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_payment_termins', function (Blueprint $table) {
            $table->dropColumn(['retention_amount', 'net_amount', 'retention_notes']);
        });
    }
};
