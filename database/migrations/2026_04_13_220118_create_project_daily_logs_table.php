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
        Schema::create('project_daily_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->date('log_date');
            $table->string('weather')->default('sunny'); // sunny, cloudy, rainy, stormy
            $table->integer('worker_count')->default(0);
            $table->text('activities');
            $table->text('issues')->nullable();
            $table->json('photos')->nullable(); // array of file paths, max 4
            $table->timestamps();

            $table->index(['project_id', 'log_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('project_daily_logs');
    }
};
