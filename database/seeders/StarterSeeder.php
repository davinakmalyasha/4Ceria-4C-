<?php

namespace Database\Seeders;

use App\Models\Provinces;
use App\Models\User;
use Hash;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;

class StarterSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        Provinces::create([
            'name' => 'Jakarta',
        ]);
        $permissions = [
            'user-edit',
            'contact-create',
            'contact-edit',
            'contact-view',
            'house-delete',
            'house-edit',
            'house-view',
            'permission-create',
            'permission-view',
            'role-create',
            'role-delete',
            'role-edit',
            'role-view',
            'user-edit',
            'user-view',
        ];
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission]);
        }
        $user = User::create([
            'name' => 'tesSeed',
            'username' => 'tesSeed',
            'email' => 'start@4c.id',
            'password' => Hash::make('123'),
        ]);
        $user->syncPermissions($permissions);
    }
}
