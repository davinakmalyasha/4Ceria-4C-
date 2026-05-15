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
        // 1. provinces
        Schema::create('provinces', function (Blueprint $table) {
            $table->id();
            $table->string('name');
        });

        // 2. regions
        Schema::create('regions', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->foreignId('id_province')->constrained('provinces')->onDelete('cascade');
        });

        // 3. contact
        Schema::create('contact', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('url')->nullable();
            $table->string('banner_dir')->nullable();
            $table->string('size')->nullable();
        });

        // 4. phone_user
        Schema::create('phone_user', function (Blueprint $table) {
            $table->id();
            $table->string('contact');
            $table->foreignId('id_user')->constrained('users')->onDelete('cascade');
            $table->foreignId('id_contact')->nullable()->constrained('contact')->onDelete('cascade');
        });

        // 5. house
        Schema::create('house', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->decimal('price', 15, 2)->nullable();
            $table->text('house_desc')->nullable();
            $table->string('width')->nullable();
            $table->string('length')->nullable();
            $table->integer('br')->default(0);
            $table->integer('ba')->default(0);
            $table->integer('floors')->default(1);
            $table->string('coordinate')->nullable();
            $table->string('street_name')->nullable();
            $table->string('kelurahan')->nullable();
            $table->string('kecamatan')->nullable();
            $table->string('kab_kota')->nullable();
            $table->string('province')->nullable();
            $table->string('postal_code')->nullable();
            $table->integer('views')->default(0);
            $table->foreignId('id_user')->constrained('users')->onDelete('cascade');
            $table->timestamps();
        });

        // 6. rooms
        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type')->nullable();
            $table->string('width')->nullable();
            $table->string('length')->nullable();
            $table->text('desc')->nullable();
            $table->foreignId('id_house')->constrained('house')->onDelete('cascade');
            $table->timestamps();
        });

        // 7. house_pic
        Schema::create('house_pic', function (Blueprint $table) {
            $table->id();
            $table->string('file_name')->nullable();
            $table->string('dir');
            $table->string('size')->nullable();
            $table->foreignId('id_house')->constrained('house')->onDelete('cascade');
            $table->timestamps();
        });

        // 8. rooms_pic
        Schema::create('rooms_pic', function (Blueprint $table) {
            $table->id();
            $table->string('file_name')->nullable();
            $table->string('dir');
            $table->string('size')->nullable();
            $table->foreignId('id_room')->constrained('rooms')->onDelete('cascade');
            $table->timestamps();
        });

        // 9. riwayat_projects
        Schema::create('riwayat_projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->onDelete('cascade');
            $table->foreignId('arsitek_id')->constrained('arsiteks')->onDelete('cascade');
            $table->foreignId('kontraktor_id')->constrained('kontraktors')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->timestamp('selesai_pada')->nullable();
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // 10. spesialisasi
        Schema::create('spesialisasi', function (Blueprint $table) {
            $table->id();
            $table->string('nama');
            $table->string('kategori')->nullable();
            $table->timestamps();
        });

        // 11. kontraktor_spesialisasi (pivot)
        Schema::create('kontraktor_spesialisasi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kontraktor_id')->constrained('kontraktors')->onDelete('cascade');
            $table->foreignId('spesialisasi_id')->constrained('spesialisasi')->onDelete('cascade');
        });

        // 12. pengajuan_spesialisasi
        Schema::create('pengajuan_spesialisasi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kontraktor_id')->constrained('kontraktors')->onDelete('cascade');
            $table->foreignId('spesialisasi_id')->constrained('spesialisasi')->onDelete('cascade');
            $table->string('file_sertifikat')->nullable();
            $table->text('catatan')->nullable();
            $table->string('status')->default('pending');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pengajuan_spesialisasi');
        Schema::dropIfExists('kontraktor_spesialisasi');
        Schema::dropIfExists('spesialisasi');
        Schema::dropIfExists('riwayat_projects');
        Schema::dropIfExists('rooms_pic');
        Schema::dropIfExists('house_pic');
        Schema::dropIfExists('rooms');
        Schema::dropIfExists('house');
        Schema::dropIfExists('phone_user');
        Schema::dropIfExists('contact');
        Schema::dropIfExists('regions');
        Schema::dropIfExists('provinces');
    }
};
