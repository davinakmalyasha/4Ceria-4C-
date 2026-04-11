<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN role_type ENUM('user', 'arsitek', 'kontraktor', 'admin', 'supplier', 'logistics', 'notaris', 'interior') DEFAULT 'user'");

        Role::firstOrCreate(['name' => 'notaris', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'interior', 'guard_name' => 'web']);
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE users MODIFY COLUMN role_type ENUM('user', 'arsitek', 'kontraktor', 'admin', 'supplier', 'logistics') DEFAULT 'user'");
    }
};
