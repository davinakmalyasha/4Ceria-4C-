<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $sharedColumns = function(Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('nama')->nullable();
            $table->string('no_telp')->nullable();
            $table->decimal('rate_harga', 24, 2)->default(0);
            $table->string('spesialisasi')->nullable();
            $table->text('deskripsi')->nullable();
            $table->string('lokasi')->nullable();
            $table->integer('pengalaman_tahun')->default(0);
            $table->string('file_portofolio')->nullable();
            $table->string('file_sertifikat')->nullable();
            $table->string('pendidikan')->nullable();
            $table->enum('verification_status', ['pending','verified','rejected'])->default('pending');
            $table->text('rejection_reason')->nullable();
            $table->string('foto')->nullable();
            $table->timestamps();
            
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        };

        Schema::create('project_managers', $sharedColumns);
        Schema::create('structural_engineers', $sharedColumns);
        Schema::create('mep_engineers', $sharedColumns);
    }

    public function down(): void
    {
        Schema::dropIfExists('mep_engineers');
        Schema::dropIfExists('structural_engineers');
        Schema::dropIfExists('project_managers');
    }
};
