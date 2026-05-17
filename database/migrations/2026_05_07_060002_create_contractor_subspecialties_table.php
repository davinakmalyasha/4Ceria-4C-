<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contractor_subspecialties', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 50)->unique();
            $table->string('label', 100);
            $table->string('label_id', 100);
            $table->enum('category', ['construction', 'mechanical', 'finishing']);
            $table->string('icon', 50)->nullable();
            $table->timestamps();

            $table->index('category', 'idx_category');
        });

        DB::table('contractor_subspecialties')->insert([
            ['slug' => 'roofing', 'label' => 'Roofing Specialist', 'label_id' => 'Spesialis Atap', 'category' => 'construction', 'icon' => 'roof', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'pool', 'label' => 'Pool Builder', 'label_id' => 'Pembangun Kolam', 'category' => 'construction', 'icon' => 'pool', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'foundation', 'label' => 'Foundation Specialist', 'label_id' => 'Spesialis Pondasi', 'category' => 'construction', 'icon' => 'foundation', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'steel_structure', 'label' => 'Steel Structure', 'label_id' => 'Struktur Baja', 'category' => 'construction', 'icon' => 'steel', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'hvac', 'label' => 'HVAC Installer', 'label_id' => 'Instalasi HVAC', 'category' => 'mechanical', 'icon' => 'hvac', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'electrical_specialist', 'label' => 'Electrical Specialist', 'label_id' => 'Spesialis Listrik', 'category' => 'mechanical', 'icon' => 'electric', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'plumbing_specialist', 'label' => 'Plumbing Specialist', 'label_id' => 'Spesialis Plumbing', 'category' => 'mechanical', 'icon' => 'plumbing', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'waterproofing', 'label' => 'Waterproofing', 'label_id' => 'Waterproofing', 'category' => 'finishing', 'icon' => 'water', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'glass_facade', 'label' => 'Glass & Facade', 'label_id' => 'Kaca & Fasad', 'category' => 'finishing', 'icon' => 'glass', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'painting', 'label' => 'Painting & Finishing', 'label_id' => 'Pengecatan & Finishing', 'category' => 'finishing', 'icon' => 'paint', 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('contractor_subspecialties');
    }
};
