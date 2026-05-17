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
        Schema::create('conversations', function (Blueprint $row) {
            $row->id();
            $row->foreignId('user_one_id')->constrained('users')->onDelete('cascade');
            $row->foreignId('user_two_id')->constrained('users')->onDelete('cascade');
            $row->timestamp('last_message_at')->nullable();
            $row->timestamps();

            $row->unique(['user_one_id', 'user_two_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('conversations');
    }
};
