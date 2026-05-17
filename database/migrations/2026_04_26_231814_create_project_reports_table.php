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
        Schema::create('project_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
            
            $table->longText('summary')->nullable();
            $table->integer('progress_percentage')->default(0);
            $table->enum('budget_health', ['on_track', 'warning', 'critical'])->default('on_track');
            
            $table->json('site_photos')->nullable();
            $table->json('attachments')->nullable();
            
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['project_id', 'published_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('project_reports');
    }
};
