<?php

namespace Database\Seeders;

use App\Models\Kontraktor;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

class SubContractorSeeder extends Seeder
{
    public function run(): void
    {
        $password = Hash::make('12345678');

        $subContractors = [
            [
                'name'      => 'Rudi (Sub-Civil)',
                'email'     => 'sub_civil@gmail.com',
                'username'  => 'sub_civil',
                'role_type' => 'civil',
                'specialty' => 'Foundation, Framing, Columns & Beams',
            ],
            [
                'name'      => 'Dimas (Sub-Mechanical)',
                'email'     => 'sub_mechanical@gmail.com',
                'username'  => 'sub_mechanical',
                'role_type' => 'mechanical',
                'specialty' => 'HVAC, Elevator, Fire Protection',
            ],
            [
                'name'      => 'Wahyu (Sub-Electrical)',
                'email'     => 'sub_electrical@gmail.com',
                'username'  => 'sub_electrical',
                'role_type' => 'electrical',
                'specialty' => 'Power Distribution, Wiring, Panels',
            ],
            [
                'name'      => 'Hendra (Sub-Plumbing)',
                'email'     => 'sub_plumbing@gmail.com',
                'username'  => 'sub_plumbing',
                'role_type' => 'plumbing',
                'specialty' => 'Water Supply, Drainage, Sewage',
            ],
            [
                'name'      => 'Teguh (Sub-Roofing)',
                'email'     => 'sub_roofing@gmail.com',
                'username'  => 'sub_roofing',
                'role_type' => 'roofing',
                'specialty' => 'Roof Truss, Covering, Waterproofing',
            ],
            [
                'name'      => 'Agus (Sub-Finishing)',
                'email'     => 'sub_finishing@gmail.com',
                'username'  => 'sub_finishing',
                'role_type' => 'finishing',
                'specialty' => 'Plastering, Painting, Tiling, Facade',
            ],
        ];

        foreach ($subContractors as $sc) {
            Role::firstOrCreate(['name' => $sc['role_type'], 'guard_name' => 'web']);

            $user = User::updateOrCreate(
                ['email' => $sc['email']],
                [
                    'name'      => $sc['name'],
                    'username'  => $sc['username'],
                    'password'  => $password,
                    'role_type' => $sc['role_type'],
                ]
            );

            if (!$user->hasRole($sc['role_type'])) {
                $user->assignRole($sc['role_type']);
            }

            Kontraktor::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'nama'                => $sc['name'],
                    'no_telepon'          => '08' . rand(100000000, 999999999),
                    'alamat'              => 'Jakarta',
                    'jenis'               => 'Sub-Contractor',
                    'nama_perusahaan'     => null,
                    'pengalaman'          => rand(3, 10),
                    'spesialisasi'        => $sc['specialty'],
                    'rate_harga'          => rand(5000000, 25000000),
                    'verification_status' => 'verified',
                ]
            );
        }
    }
}
