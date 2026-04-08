<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasColumn('material_order_reviews', 'image_path')) {
            Schema::table('material_order_reviews', function (Blueprint $table) {
                $table->renameColumn('image_path', 'image_paths');
            });
        }

        // Use text first so we can convert data without MySQL errors
        Schema::table('material_order_reviews', function (Blueprint $table) {
            $table->text('image_paths')->nullable()->change();
        });

        // Migrate existing data to array format
        $reviews = DB::table('material_order_reviews')->whereNotNull('image_paths')->get();
        foreach ($reviews as $review) {
            $currentValue = $review->image_paths;
            // Only wrap if it looks like a single path (doesn't start with [)
            if (!empty($currentValue) && strpos($currentValue, '[') !== 0) {
                DB::table('material_order_reviews')
                    ->where('id', $review->id)
                    ->update(['image_paths' => json_encode([$currentValue])]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_order_reviews', function (Blueprint $table) {
            $table->string('image_paths')->nullable()->change();
            $table->renameColumn('image_paths', 'image_path');
        });
    }
};
