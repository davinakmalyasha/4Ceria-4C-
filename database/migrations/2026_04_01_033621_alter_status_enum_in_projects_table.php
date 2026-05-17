<?php

use Illuminate\Database\Migrations\Migration;

/**
 * NO-OP: Status enum already defined in consolidated base projects table.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Status already defined with all values in consolidated base table
    }

    public function down(): void
    {
        // No-op
    }
};
