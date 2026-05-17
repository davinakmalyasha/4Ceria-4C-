<?php

use Illuminate\Database\Migrations\Migration;

/**
 * NO-OP: All columns consolidated into base projects table migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Columns already exist in consolidated base table
    }

    public function down(): void
    {
        // No-op
    }
};