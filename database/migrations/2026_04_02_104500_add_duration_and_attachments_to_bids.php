<?php

use Illuminate\Database\Migrations\Migration;

/**
 * NO-OP: Columns consolidated into base bid table migrations.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Columns already exist in consolidated base tables
    }

    public function down(): void
    {
        // No-op
    }
};