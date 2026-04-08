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
        Schema::table('material_order_reviews', function (Blueprint $table) {
            $table->renameColumn('image_path', 'image_paths');
            // Change type to json if supported, otherwise leave as longtext/text for cast
            $table->json('delivery_image_paths')->nullable()->after('delivery_user_id');
        });

        // Ensure image_paths is treated as JSON/Array
        // For MariaDB/MySQL we might need to change column type explicitly if it was string
        DB::statement('ALTER TABLE material_order_reviews MODIFY image_paths JSON NULL');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_order_reviews', function (Blueprint $table) {
            $table->renameColumn('image_paths', 'image_path');
            $table->dropColumn('delivery_image_paths');
        });
        
        DB::statement('ALTER TABLE material_order_reviews MODIFY image_path VARCHAR(255) NULL');
    }
};
