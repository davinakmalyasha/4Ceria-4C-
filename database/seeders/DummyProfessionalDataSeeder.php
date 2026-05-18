<?php

namespace Database\Seeders;

use App\Models\Arsitek;
use App\Models\CourierProfile;
use App\Models\InteriorProfile;
use App\Models\Kontraktor;
use App\Models\Material;
use App\Models\NotarisProfile;
use App\Models\StructuralEngineer;
use App\Models\MepEngineer;
use App\Models\ProjectManager;
use App\Models\Project;
use App\Models\ProjectImage;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Database\Seeder;

class DummyProfessionalDataSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Architect Dummy Data (Giska)
        $arsitekUser = User::where('email', 'giska@gmail.com')->first();
        if ($arsitekUser) {
            Arsitek::updateOrCreate(
                ['user_id' => $arsitekUser->id],
                [
                    'nama' => 'Giska Modern Architecture',
                    'no_telp' => '08123456789',
                    'rate_harga' => 15000000,
                    'spesialisasi' => 'Minimalist, Eco-Friendly, Modern',
                    'deskripsi' => 'Architectural excellence focused on sustainable and eco-friendly designs with a modern minimalist touch.',
                    'lokasi' => 'Jakarta Selatan',
                    'pengalaman_tahun' => 8,
                    'file_portofolio' => 'https://example.com/portfolio-giska.pdf',
                    'foto' => 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1976&auto=format&fit=crop',
                    'verification_status' => 'verified',
                ]
            );
        }

        // 2. Contractor Dummy Data (Anindia)
        $kontraktorUser = User::where('email', 'anindia@gmail.com')->first();
        if ($kontraktorUser) {
            Kontraktor::updateOrCreate(
                ['user_id' => $kontraktorUser->id],
                [
                    'nama' => 'Anindia Build Co.',
                    'no_telepon' => '08212345678',
                    'alamat' => 'Jl. Pembangunan No. 12, Bandung',
                    'jenis' => 'General Contractor',
                    'nama_perusahaan' => 'PT Anindia Bangun Indonesia',
                    'pengalaman' => 12,
                    'spesialisasi' => 'Residential, Commercial, Industrial',
                    'rate_harga' => 50000000,
                    'verification_status' => 'verified',
                    'foto' => 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=1961&auto=format&fit=crop',
                ]
            );
        }

        // 3. Interior Designer Dummy Data (Abel)
        $interiorUser = User::where('email', 'abel@gmail.com')->first();
        if ($interiorUser) {
            InteriorProfile::updateOrCreate(
                ['user_id' => $interiorUser->id],
                [
                    'nama' => 'Abel Chic Interiors',
                    'no_telp' => '08312345678',
                    'deskripsi' => 'Turning spaces into warm, stylish homes. Specializing in Scandinavian and Mid-century modern interiors.',
                    'spesialisasi' => 'Scandinavian, Mid-Century, Industrial',
                    'lokasi' => 'Tangerang Selatan',
                    'pengalaman_tahun' => 5,
                    'rate_harga' => 10000000,
                    'file_portofolio' => 'https://example.com/portfolio-abel.pdf',
                    'foto' => 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1976&auto=format&fit=crop',
                    'verification_status' => 'verified',
                ]
            );
        }

        // 4. Notary Dummy Data (Rede)
        $notarisUser = User::where('email', 'rede@gmail.com')->first();
        if ($notarisUser) {
            NotarisProfile::updateOrCreate(
                ['user_id' => $notarisUser->id],
                [
                    'nama' => 'Notaris Rede, S.H., M.Kn.',
                    'no_telp' => '08412345678',
                    'nomor_sk' => 'SK-2023-NOT-999',
                    'wilayah_kerja' => 'DKI Jakarta',
                    'deskripsi' => 'Professional notary services for property transactions, company legals, and legal consultations.',
                    'spesialisasi' => 'Property Law, Corporate Law',
                    'lokasi' => 'Jakarta Pusat',
                    'pengalaman_tahun' => 15,
                    'rate_harga' => 5000000,
                    'verification_status' => 'verified',
                    'foto' => 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1974&auto=format&fit=crop',
                ]
            );
        }

        // 5. Driver / Courier Dummy Data (Fariz)
        $driverUser = User::where('email', 'fariz@gmail.com')->first();
        if ($driverUser) {
            CourierProfile::updateOrCreate(
                ['user_id' => $driverUser->id],
                [
                    'vehicle_type' => 'Pickup Truck (L300)',
                    'license_plate' => 'B 4122 CER',
                    'is_active' => true,
                ]
            );
        }

        // 6. Structural Engineer Dummy Data (Budi)
        $structuralUser = User::where('email', 'budi_struc@gmail.com')->first();
        if ($structuralUser) {
            StructuralEngineer::updateOrCreate(
                ['user_id' => $structuralUser->id],
                [
                    'nama' => 'Budi Structural & Civil',
                    'no_telp' => '08512345678',
                    'spesialisasi' => 'High-Rise, Steel Structures',
                    'deskripsi' => 'Expert in structural integrity and earthquake-resistant designs.',
                    'lokasi' => 'Bandung',
                    'pengalaman_tahun' => 10,
                    'rate_harga' => 12000000,
                    'verification_status' => 'verified',
                ]
            );
        }

        // 7. MEP Engineer Dummy Data (Andi)
        $mepUser = User::where('email', 'andi_mep@gmail.com')->first();
        if ($mepUser) {
            MepEngineer::updateOrCreate(
                ['user_id' => $mepUser->id],
                [
                    'nama' => 'Andi MEP Solutions',
                    'no_telp' => '08612345678',
                    'spesialisasi' => 'Electrical, Plumbing, HVAC',
                    'deskripsi' => 'Comprehensive MEP engineering for modern smart homes.',
                    'lokasi' => 'Surabaya',
                    'pengalaman_tahun' => 7,
                    'rate_harga' => 8000000,
                    'verification_status' => 'verified',
                ]
            );
        }

        // 8. Project Manager Dummy Data (Aisha)
        $pmUser = User::where('email', 'aisha@gmail.com')->first();
        if ($pmUser) {
            ProjectManager::updateOrCreate(
                ['user_id' => $pmUser->id],
                [
                    'nama' => 'Aisha Project Management',
                    'no_telp' => '08712345678',
                    'spesialisasi' => 'Agile Construction, Risk Management',
                    'deskripsi' => 'Ensuring project delivery on time and within budget.',
                    'lokasi' => 'Jakarta',
                    'pengalaman_tahun' => 9,
                    'rate_harga' => 20000000,
                    'verification_status' => 'verified',
                ]
            );
        }

        // 6. Interior Products (Akmal - Supplier)
        $supplierUser = User::where('email', 'akmal@gmail.com')->first();
        if ($supplierUser) {
            $supplier = Supplier::updateOrCreate(
                ['user_id' => $supplierUser->id],
                [
                    'store_name' => 'Akmal Elite Interior & Furniture',
                    'address' => 'Mall Alam Sutera, GF 12, Tangerang',
                    'category' => 'Interior',
                    'bio' => 'Premium furniture and decor curated for modern living.',
                    'verification_status' => 'verified',
                    'foto' => 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?q=80&w=2070&auto=format&fit=crop',
                ]
            );

            $products = [
                [
                    'name' => 'Luxurious Scandinavian Grey Sofa',
                    'description' => 'A luxurious 3-seater sofa with premium velvet finish and solid oak legs.',
                    'price' => 7500000,
                    'unit' => 'piece',
                    'category' => 'Furniture',
                    'stock' => 10,
                    'image_path' => 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=2070&auto=format&fit=crop',
                    'specifications' => ['Material' => 'Velvet, Solid Wood', 'Dimensions' => '220 x 90 x 85 cm'],
                ],
                [
                    'name' => 'Minimalist Coffee Table Set',
                    'description' => 'Real Carrara marble top with industrial steel frame.',
                    'price' => 3200000,
                    'unit' => 'piece',
                    'category' => 'Furniture',
                    'stock' => 5,
                    'image_path' => 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=2069&auto=format&fit=crop',
                    'specifications' => ['Material' => 'Marble, Steel', 'Dimensions' => '100 x 60 x 45 cm'],
                ],
            ];

            foreach ($products as $p) {
                Material::updateOrCreate(
                    ['name' => $p['name']],
                    array_merge($p, ['supplier_id' => $supplier->id])
                );
            }
        }

        // 7. Portfolio Projects for specific professionals
        $client = User::first();
        if (! $client) {
            return;
        }

        // 7. Portfolio Projects for specific professionals
        $client = User::first();
        if (! $client) {
            return;
        }

        $portfolios = [
            [
                'email' => 'giska@gmail.com',
                'role' => 'arsitek',
                'projects' => [
                    [
                        'title' => 'Modern Minimalist Villa in Ubud',
                        'images' => [
                            'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=2070&auto=format&fit=crop',
                            'https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=2071&auto=format&fit=crop',
                        ],
                    ],
                    [
                        'title' => 'Sustainable Eco-Resort Concept',
                        'images' => [
                            'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=2070&auto=format&fit=crop',
                        ],
                    ],
                ],
            ],
            [
                'email' => 'anindia@gmail.com',
                'role' => 'kontraktor',
                'projects' => [
                    [
                        'title' => 'Industrial Warehouse Renovation',
                        'images' => [
                            'https://images.unsplash.com/photo-1503387762-592dea58ef23?q=80&w=2070&auto=format&fit=crop',
                            'https://images.unsplash.com/photo-1541888946425-d81bb19480c5?q=80&w=2070&auto=format&fit=crop',
                        ],
                    ],
                ],
            ],
            [
                'email' => 'abel@gmail.com',
                'role' => 'interior',
                'projects' => [
                    [
                        'title' => 'Scandinavian Living Room Makeover',
                        'images' => [
                            'https://images.unsplash.com/photo-1583847268964-b28dc2f51ac9?q=80&w=1974&auto=format&fit=crop',
                            'https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?q=80&w=2070&auto=format&fit=crop',
                        ],
                    ],
                    [
                        'title' => 'Chic Mid-Century Office Space',
                        'images' => [
                            'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop',
                        ],
                    ],
                ],
            ],
        ];

        foreach ($portfolios as $prof) {
            $user = User::where('email', $prof['email'])->first();
            if (! $user) {
                continue;
            }

            $profModel = null;
            $idField = '';

            // Map the role to the correct model and foreign key field
            if ($prof['role'] === 'arsitek') {
                $profModel = Arsitek::where('user_id', $user->id)->first();
                $idField = 'selected_arsitek_id';
            } elseif ($prof['role'] === 'kontraktor') {
                $profModel = Kontraktor::where('user_id', $user->id)->first();
                $idField = 'selected_kontraktor_id';
            } elseif ($prof['role'] === 'interior') {
                $profModel = InteriorProfile::where('user_id', $user->id)->first();
                $idField = 'selected_interior_id';
            }

            if (! $profModel) {
                continue;
            }

            foreach ($prof['projects'] as $pData) {
                // Ensure target_role is valid for the enum: arsitek, kontraktor, or both
                $targetRole = ($prof['role'] === 'interior') ? 'arsitek' : $prof['role'];

                $project = Project::updateOrCreate(
                    ['title' => $pData['title'], $idField => $profModel->id],
                    [
                        'user_id' => $client->id,
                        'description' => 'A successfully completed project showcasing professional excellence and attention to detail.',
                        'budget' => rand(25000000, 150000000),
                        'lokasi' => 'Professional Showroom',
                        'jenis_proyek' => 'umum',
                        'status' => 'completed',
                        'target_role' => $targetRole,
                    ]
                );

                foreach ($pData['images'] as $index => $imgUrl) {
                    ProjectImage::updateOrCreate(
                        ['project_id' => $project->id, 'image_path' => $imgUrl],
                        ['sort_order' => $index]
                    );
                }
            }
        }
    }
}
