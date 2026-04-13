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
        Schema::create('interior_ratings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->onDelete('cascade');
            $table->foreignId('reviewer_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('interior_id')->constrained('interior_profiles')->onDelete('cascade');
            $table->integer('rating');
            $table->text('komentar')->nullable();
            $table->timestamps();
        });

        Schema::create('notaris_ratings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->onDelete('cascade');
            $table->foreignId('reviewer_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('notaris_id')->constrained('notaris_profiles')->onDelete('cascade');
            $table->integer('rating');
            $table->text('komentar')->nullable();
            $table->timestamps();
        });

        // Fix kontraktors table
        Schema::table('kontraktors', function (Blueprint $table) {
            if (! Schema::hasColumn('kontraktors', 'spesialisasi')) {
                $table->string('spesialisasi')->nullable()->after('alamat');
            }
            if (! Schema::hasColumn('kontraktors', 'foto')) {
                $table->string('foto')->nullable()->after('nama');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('kontraktors', function (Blueprint $table) {
            $table->dropColumn(['spesialisasi', 'foto']);
        });
        Schema::dropIfExists('interior_ratings');
        Schema::dropIfExists('notaris_ratings');
    }
};
