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
        Schema::create('chat_messages', function (Blueprint $row) {
            $row->id();
            $row->foreignId('conversation_id')->constrained('conversations')->onDelete('cascade');
            $row->foreignId('sender_id')->constrained('users')->onDelete('cascade');
            $row->text('content');
            $row->boolean('is_read')->default(false);
            $row->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('chat_messages');
    }
};
