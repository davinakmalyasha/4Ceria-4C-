<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('firm_members', function (Blueprint $table) {
            $table->dropForeign(['firm_owner_id']);
            $table->dropUnique('idx_firm_unique');
            
            $table->unique(['firm_owner_id', 'member_user_id', 'role_in_firm'], 'idx_firm_role_unique');
            
            $table->foreign('firm_owner_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('firm_members', function (Blueprint $table) {
            $table->dropForeign(['firm_owner_id']);
            $table->dropUnique('idx_firm_role_unique');
            
            $table->unique(['firm_owner_id', 'member_user_id'], 'idx_firm_unique');
            
            $table->foreign('firm_owner_id')->references('id')->on('users')->onDelete('cascade');
        });
    }
};
