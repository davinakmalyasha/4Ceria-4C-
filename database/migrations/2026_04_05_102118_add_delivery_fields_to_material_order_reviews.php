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
            $table->integer('delivery_rating')->nullable()->after('comment');
            $table->text('delivery_comment')->nullable()->after('delivery_rating');
            $table->foreignId('delivery_user_id')->nullable()->constrained('users')->onDelete('set null')->after('delivery_comment');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('material_order_reviews', function (Blueprint $table) {
            $table->dropForeign(['delivery_user_id']);
            $table->dropColumn(['delivery_rating', 'delivery_comment', 'delivery_user_id']);
        });
    }
};
