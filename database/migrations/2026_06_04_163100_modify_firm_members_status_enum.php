<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE firm_members MODIFY COLUMN status ENUM('invited', 'active', 'removed', 'requested') NOT NULL DEFAULT 'invited'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            // Revert back to original ENUM values
            DB::statement("ALTER TABLE firm_members MODIFY COLUMN status ENUM('invited', 'active', 'removed') NOT NULL DEFAULT 'invited'");
        }
    }
};
