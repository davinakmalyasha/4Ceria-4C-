<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up()
    {
        Schema::create('kontraktors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('nama');
            $table->string('no_telepon')->nullable();
            $table->string('alamat')->nullable();
            $table->string('jenis')->nullable();
            $table->string('nama_perusahaan')->nullable();
            $table->string('npwp')->nullable();
            $table->string('siup')->nullable();
            $table->integer('pengalaman')->default(0);
            $table->string('spesialisasi')->nullable();
            $table->decimal('rate_harga', 24, 2)->default(0);
            $table->string('pendidikan')->nullable();
            $table->text('alasan_hire')->nullable();
            $table->enum('verification_status', ['pending', 'verified', 'rejected'])->default('pending');
            $table->text('rejection_reason')->nullable();
            $table->string('foto')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kontraktors');
    }
};
