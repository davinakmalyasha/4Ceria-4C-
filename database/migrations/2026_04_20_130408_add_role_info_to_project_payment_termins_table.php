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
            $table->string('role_type')->after('project_id')->nullable();
            $table->unsignedBigInteger('recipient_id')->after('role_type')->nullable();
            
            $table->index('role_type');
            $table->foreign('recipient_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('project_payment_termins', function (Blueprint $table) {
            $table->dropForeign(['recipient_id']);
            $table->dropColumn(['role_type', 'recipient_id']);
        });
    }
};
