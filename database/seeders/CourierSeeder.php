<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class CourierSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $user = \App\Models\User::firstOrCreate(
            ['email' => 'driver@4ceria.com'],
            [
                'name' => 'Budi Express',
                'username' => 'budiexpress',
                'password' => \Illuminate\Support\Facades\Hash::make('password'),
                'role_type' => 'logistics',
            ]
        );

        $role = \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'logistics']);
        if (!$user->hasRole('logistics')) {
            $user->assignRole($role);
        }

        \App\Models\CourierProfile::firstOrCreate(
            ['user_id' => $user->id],
            [
                'vehicle_type' => 'Pickup Truck (Max 1000kg)',
                'license_plate' => 'B 1234 CD',
                'is_active' => true,
            ]
        );
    }
}
