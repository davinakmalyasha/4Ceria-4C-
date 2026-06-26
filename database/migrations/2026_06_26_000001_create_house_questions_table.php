<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('house_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('house_id')->constrained('house')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->text('question');
            $table->timestamps();
        });

        Schema::create('house_answers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('question_id')->constrained('house_questions')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->text('answer');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('house_answers');
        Schema::dropIfExists('house_questions');
    }
};
