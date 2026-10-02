<?php

namespace Database\Seeders;

use App\Models\User;
use Database\Seeders\Support\DemoAccount;
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

        // DEMO CREDENTIALS. Every account shares one known password so a
        // reviewer can log in as any role without a signup dance. This is only
        // ever appropriate because `db:seed` targets a local database.
        $password = Hash::make(DemoAccount::PASSWORD);

        // 2. Create Core Professional Users
        //
        // Addresses come from DemoAccount rather than inline, because every other
        // seeder looks these accounts UP by address. See that class for why that
        // coupling through a string literal was worth removing.
        $professionals = [
            [
                'name' => 'Giska (Architect)',
                'email' => DemoAccount::ARSITEK,
                'username' => 'giska',
                'role_type' => 'arsitek',
            ],
            [
                'name' => 'Anindia (Contractor)',
                'email' => DemoAccount::KONTRAKTOR,
                'username' => 'anindia',
                'role_type' => 'kontraktor',
            ],
            [
                'name' => 'Abel (Interior)',
                'email' => DemoAccount::INTERIOR,
                'username' => 'abel',
                'role_type' => 'interior',
            ],
            [
                'name' => 'Rede (Notary)',
                'email' => DemoAccount::NOTARIS,
                'username' => 'rede',
                'role_type' => 'notaris',
            ],
            [
                'name' => 'Fariz (Courier)',
                'email' => DemoAccount::COURIER,
                'username' => 'fariz',
                'role_type' => 'user',
            ],
            [
                'name' => 'Akmal (Supplier)',
                'email' => DemoAccount::SUPPLIER,
                'username' => 'akmal',
                'role_type' => 'user',
            ],
            [
                'name' => 'Aisha (PM)',
                'email' => DemoAccount::PROJECT_MANAGER,
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
                'email' => DemoAccount::STRUCTURAL,
                'username' => 'budi_struc',
                'role_type' => 'structural',
            ],
            [
                'name' => 'Andi (MEP)',
                'email' => DemoAccount::MEP,
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
            ['email' => DemoAccount::CLIENT],
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

        // 4. Create an ordinary (non-professional) user
        //
        // Previously this was seeded under the repository owner's personal Gmail
        // address. Demo data in a public repository does not need a real inbox.
        $davin = User::updateOrCreate(
            ['email' => DemoAccount::ORDINARY_USER],
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
