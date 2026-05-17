<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN role_type ENUM('user', 'arsitek', 'kontraktor', 'admin', 'supplier', 'logistik') NOT NULL DEFAULT 'user'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN role_type ENUM('user', 'arsitek', 'kontraktor', 'admin') NOT NULL DEFAULT 'user'");
    }
};
