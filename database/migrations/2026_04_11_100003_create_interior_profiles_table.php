<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('interior_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->unique();
            $table->string('nama');
            $table->string('no_telp')->nullable();
            $table->string('foto')->nullable();
            $table->string('file_portofolio')->nullable();
            $table->string('file_sertifikat')->nullable();
            $table->string('spesialisasi')->nullable()->comment('kitchen set, minimalist, modern, etc');
            $table->text('deskripsi')->nullable();
            $table->string('lokasi')->nullable();
            $table->integer('pengalaman_tahun')->default(0);
            $table->decimal('rate_harga', 24, 2)->default(0);
            $table->enum('verification_status', ['pending', 'verified', 'rejected'])->default('pending');
            $table->text('rejection_reason')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('interior_profiles');
    }
};
