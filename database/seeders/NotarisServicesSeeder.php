<?php

namespace Database\Seeders;

use App\Models\NotarisProfile;
use Illuminate\Database\Seeder;

class NotarisServicesSeeder extends Seeder
{
    public function run()
    {
        $profile = NotarisProfile::where('user_id', 59)->first();

        if (! $profile) {
            return;
        }

        $profile->services()->createMany([
            [
                'title' => 'AJB & Balik Nama',
                'price' => 5000000,
                'description' => 'Professional handling of Akta Jual Beli and transfer of title with BPN.',
            ],
            [
                'title' => 'PBG (IMB) Permit',
                'price' => 7500000,
                'description' => 'Complete processing of Building Approval (PBG/IMB) according to local regulations.',
            ],
            [
                'title' => 'SLF Certification',
                'price' => 3000000,
                'description' => 'Certificate of Functional Worth (SLF) verification and processing for property legality.',
            ],
        ]);
    }
}
