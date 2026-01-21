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
            $table->integer('npwp')->default(0);
            $table->string('siup')->nullable();
            $table->text('pengalaman')->nullable();
            $table->string('spesialisasi')->nullable();
            $table->timestamps();
        });
    }
    

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bids_kontraktors');
    }
};
