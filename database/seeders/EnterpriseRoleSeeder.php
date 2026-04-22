<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\MepEngineer;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

class EnterpriseRoleSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Ensure roles exist in Spatie
        $rolesToCreate = ['project_manager', 'structural', 'mep'];
        foreach ($rolesToCreate as $roleName) {
            Role::firstOrCreate(['name' => $roleName]);
        }

        // 2. Create Raman (MEP Engineer)
        $mepUser = User::firstOrCreate(
            ['email' => 'raman@gmail.com'],
            [
                'name' => 'Raman',
                'username' => 'raman_mep',
                'password' => Hash::make('12345678'),
                'role_type' => 'mep',
            ]
        );
        if (!$mepUser->hasRole('mep')) {
            $mepUser->assignRole('mep');
        }
        
        MepEngineer::firstOrCreate(
            ['user_id' => $mepUser->id],
            [
                'nama' => 'Raman (MEP Specialist)',
                'rate_harga' => 15000000,
                'spesialisasi' => 'Advanced HVAC & Smart Plumbing',
                'pengalaman_tahun' => 12,
                'verification_status' => 'approved',
            ]
        );

        // 3. Create Dummy Project Manager
        $pmUser = User::firstOrCreate(
            ['email' => 'pm@example.com'],
            [
                'name' => 'John ProjectManager',
                'username' => 'john_pm',
                'password' => Hash::make('password'),
                'role_type' => 'project_manager',
            ]
        );
        if (!$pmUser->hasRole('project_manager')) {
            $pmUser->assignRole('project_manager');
        }

        ProjectManager::firstOrCreate(
            ['user_id' => $pmUser->id],
            [
                'nama' => 'John (Project Director)',
                'rate_harga' => 35000000,
                'spesialisasi' => 'High-end Residential',
                'pengalaman_tahun' => 20,
                'verification_status' => 'approved',
            ]
        );

        // 4. Create Dummy Structural Engineer
        $structuralUser = User::firstOrCreate(
            ['email' => 'structural@example.com'],
            [
                'name' => 'Sarah Structural',
                'username' => 'sarah_se',
                'password' => Hash::make('password'),
                'role_type' => 'structural',
            ]
        );
        if (!$structuralUser->hasRole('structural')) {
            $structuralUser->assignRole('structural');
        }

        StructuralEngineer::firstOrCreate(
            ['user_id' => $structuralUser->id],
            [
                'nama' => 'Sarah (Principal SE)',
                'rate_harga' => 25000000,
                'spesialisasi' => 'Seismic Analysis & Steel Frame',
                'pengalaman_tahun' => 15,
                'verification_status' => 'approved',
            ]
        );
    }
}
