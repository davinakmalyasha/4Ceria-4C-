<?php

namespace Database\Seeders;

use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Create permissions
        $permissions = [
            'user-edit',
            'user-view',
            'house-view',
            'house-detail',
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission]);
        }

        // Create roles and assign existing permissions
        $adminRole = Role::firstOrCreate(['name' => 'admin']);
        $adminRole->syncPermissions($permissions);

        $userRole = Role::firstOrCreate(['name' => 'user']);
        // $user = User::find(2);
        // $user->assignRole('admin');

        $this->call([
            RestoreUsersSeeder::class,
            DummyProfessionalDataSeeder::class,
            RestoreLegalLedgerSeeder::class,
            NotarisServicesSeeder::class,
        ]);
    }
}
