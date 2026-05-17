<?php

namespace Database\Seeders;

use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class CompanyProfessionalSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Company Architect (Architect Firm)
        $arsitekFirm = User::updateOrCreate(
            ['email' => 'firm_architect@4ceria.com'],
            [
                'name' => 'Elite Design Architecture',
                'password' => Hash::make('password'),
                'role_type' => 'arsitek',
            ]
        );

        Arsitek::updateOrCreate(
            ['user_id' => $arsitekFirm->id],
            [
                'nama' => 'Elite Design Architecture',
                'no_telp' => '08122334455',
                'rate_harga' => 20000000,
                'spesialisasi' => 'High-End Residential, Office Complexes',
                'deskripsi' => 'A full-service architectural firm with in-house structural and MEP teams.',
                'lokasi' => 'Jakarta Barat',
                'pengalaman_tahun' => 15,
                'verification_status' => 'verified',
                'entity_type' => 'company',
                'company_name' => 'PT Elite Design Architecture',
                'company_license' => 'SKA-FIRM-001',
            ]
        );

        // 2. Company Constructor (Constructor Corp)
        $constructorCorp = User::updateOrCreate(
            ['email' => 'corp_constructor@4ceria.com'],
            [
                'name' => 'Global Build Construction',
                'password' => Hash::make('password'),
                'role_type' => 'kontraktor',
            ]
        );

        Kontraktor::updateOrCreate(
            ['user_id' => $constructorCorp->id],
            [
                'nama' => 'Global Build Construction',
                'no_telepon' => '08223344556',
                'alamat' => 'Sudirman Central Business District, Jakarta',
                'jenis' => 'Main Contractor',
                'nama_perusahaan' => 'PT Global Build Construction',
                'pengalaman' => 20,
                'spesialisasi' => 'Infrastructure, Commercial Building',
                'rate_harga' => 100000000,
                'verification_status' => 'verified',
                'entity_type' => 'company',
                'company_name' => 'PT Global Build Construction',
                'company_license' => 'SIUJK-CORP-001',
            ]
        );
    }
}
