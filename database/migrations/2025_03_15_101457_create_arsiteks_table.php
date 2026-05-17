<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('arsiteks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->string('nama');
            $table->string('no_telp')->nullable(); 
            $table->decimal('rate_harga', 15, 2)->default(0);
            $table->string('spesialisasi')->nullable();
            $table->text('deskripsi')->nullable();
            $table->string('lokasi')->nullable();
            $table->integer('pengalaman_tahun')->default(0);
            $table->string('file_portofolio')->nullable();
            $table->string('file_sertifikat')->nullable();
            $table->string('pendidikan')->nullable();
            $table->text('alasan_hire')->nullable();
            $table->enum('verification_status', ['pending', 'verified', 'rejected'])->default('pending');
            $table->text('rejection_reason')->nullable();
            $table->string('foto')->nullable(); 
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('arsiteks');
    }
};
