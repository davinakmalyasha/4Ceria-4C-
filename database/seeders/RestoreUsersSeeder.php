<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

class RestoreUsersSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Ensure Roles exist
        $roles = [
            'admin',
            'user',
            'arsitek',
            'kontraktor',
            'notaris',
            'interior',
            'project_manager',
            'mep',
            'structural'
        ];

        foreach ($roles as $roleName) {
            Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
        }

        $password = Hash::make('12345678');

        // 2. Create Core Professional Users
        $professionals = [
            [
                'name' => 'Giska (Architect)',
                'email' => 'giska@gmail.com',
                'username' => 'giska',
                'role_type' => 'arsitek',
            ],
            [
                'name' => 'Anindia (Contractor)',
                'email' => 'anindia@gmail.com',
                'username' => 'anindia',
                'role_type' => 'kontraktor',
            ],
            [
                'name' => 'Abel (Interior)',
                'email' => 'abel@gmail.com',
                'username' => 'abel',
                'role_type' => 'interior',
            ],
            [
                'name' => 'Rede (Notary)',
                'email' => 'rede@gmail.com',
                'username' => 'rede',
                'role_type' => 'notaris',
            ],
            [
                'name' => 'Fariz (Courier)',
                'email' => 'fariz@gmail.com',
                'username' => 'fariz',
                'role_type' => 'user', 
            ],
            [
                'name' => 'Akmal (Supplier)',
                'email' => 'akmal@gmail.com',
                'username' => 'akmal',
                'role_type' => 'user',
            ],
            [
                'name' => 'Aisha (PM)',
                'email' => 'aisha@gmail.com',
                'username' => 'aisha',
                'role_type' => 'project_manager',
            ],
            [
                'name' => 'John (Lead PM)',
                'email' => 'pm@4c.id',
                'username' => 'john_pm_lead',
                'role_type' => 'project_manager',
            ],
            [
                'name' => 'Budi (Structural)',
                'email' => 'budi_struc@gmail.com',
                'username' => 'budi_struc',
                'role_type' => 'structural',
            ],
            [
                'name' => 'Andi (MEP)',
                'email' => 'andi_mep@gmail.com',
                'username' => 'andi_mep',
                'role_type' => 'mep',
            ]
        ];

        foreach ($professionals as $p) {
            $user = User::updateOrCreate(
                ['email' => $p['email']],
                [
                    'name' => $p['name'],
                    'username' => $p['username'],
                    'password' => $password,
                    'role_type' => $p['role_type'],
                ]
            );

            // Assign role
            if (!$user->hasRole($p['role_type'])) {
                $user->assignRole($p['role_type']);
            }
        }

        // 3. Create Client/Owner
        $client = User::updateOrCreate(
            ['email' => 'client@4c.id'],
            [
                'name' => 'Malya (Project Owner)',
                'username' => 'malya',
                'password' => $password,
                'role_type' => 'user',
            ]
        );
        if (!$client->hasRole('user')) {
             $client->assignRole('user');
        }

        // 4. Create Davin (Normal User)
        $davin = User::updateOrCreate(
            ['email' => 'davin@gmail.com'],
            [
                'name' => 'Davin',
                'username' => 'davin',
                'password' => $password,
                'role_type' => 'user',
            ]
        );
        if (!$davin->hasRole('user')) {
            $davin->assignRole('user');
        }
        // Ensure he doesn't have admin role if he previously did
        $davin->removeRole('admin');

        // 5. Create System Admin
        $admin = User::updateOrCreate(
            ['email' => 'admin@4c.id'],
            [
                'name' => 'System Admin',
                'username' => 'admin',
                'password' => $password,
                'role_type' => 'admin',
            ]
        );
        if (!$admin->hasRole('admin')) {
            $admin->assignRole('admin');
        }
    }
}
