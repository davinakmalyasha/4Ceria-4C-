<?php

namespace Database\Seeders;

use App\Models\BidNotaris;
use App\Models\Project;
use App\Models\ProjectAddendum;
use App\Models\User;
use App\Models\NotarisProfile;
use App\Models\ProjectManager;
use Illuminate\Database\Seeder;

class RestoreLegalLedgerSeeder extends Seeder
{
    public function run(): void
    {
        $client = User::where('email', 'client@4c.id')->first();
        $notaryUser = User::where('email', 'rede@gmail.com')->first();
        $pmUser = User::where('email', 'pm@4c.id')->first();

        if (!$client || !$notaryUser || !$pmUser) {
            return;
        }

        // 1. Ensure Notary Profile exists
        $notaryProfile = NotarisProfile::updateOrCreate(
            ['user_id' => $notaryUser->id],
            [
                'nama' => 'Notaris Rede, S.H., M.Kn.',
                'no_telp' => '08412345678',
                'nomor_sk' => 'SK-2023-NOT-999',
                'wilayah_kerja' => 'DKI Jakarta',
                'deskripsi' => 'Specialist in property law and large-scale land acquisition.',
                'spesialisasi' => 'Property Law, Corporate Law',
                'lokasi' => 'Jakarta Pusat',
                'pengalaman_tahun' => 15,
                'rate_harga' => 5000000,
                'verification_status' => 'verified',
            ]
        );

        // 2. Ensure PM Profile exists
        $pmProfile = ProjectManager::updateOrCreate(
            ['user_id' => $pmUser->id],
            [
                'nama' => 'John (Lead Project Manager)',
                'no_telp' => '08771234567',
                'rate_harga' => 25000000,
                'spesialisasi' => 'Financial Oversight & Construction Management',
                'deskripsi' => 'Senior PM with expertise in budget stabilization and technical auditing.',
                'lokasi' => 'Jakarta Barat',
                'pengalaman_tahun' => 12,
                'verification_status' => 'verified',
            ]
        );

        // 3. Create active project for Legal Ledger testing
        $project = Project::updateOrCreate(
            ['title' => 'Stabilization Test Project (Legal Phase)'],
            [
                'user_id' => $client->id,
                'description' => 'A test project specifically for verifying the Legal Ledger and Disbursement flow.',
                'budget' => 5000000000, // Rp 5 Billion
                'lokasi' => 'Pondok Indah, Jakarta',
                'jenis_proyek' => 'umum',
                'status' => 'legal',
                'selected_notaris_id' => $notaryProfile->id,
                'pm_id' => $pmUser->id,
                'target_role' => 'both',
            ]
        );

        // 4. Create accepted Notary Bid
        BidNotaris::updateOrCreate(
            ['project_id' => $project->id, 'notaris_id' => $notaryProfile->id],
            [
                'price' => 15000000,
                'tax_estimate' => 50000000,
                'status' => 'accepted',
                'proposal' => 'Legal handling for luxury residential project.',
                'estimated_duration' => 30,
                'duration_unit' => 'days',
            ]
        );

        // 5. Create some initial disbursements
        // A. One Paid disbursement
        $paidDis = ProjectAddendum::updateOrCreate(
            ['project_id' => $project->id, 'title' => '[Legal Disbursement] Biaya PNBP Hak Atas Tanah'],
            [
                'user_id' => $notaryUser->id,
                'role_type' => 'notaris',
                'description' => 'Payment for land registration PNBP fees.',
                'amount' => 5500000,
                'status' => 'paid',
                'paid_at' => now()->subDay(),
            ]
        );

        // Sync with transactions to show in the Master Budget Vault
        $project->budgetTransactions()->updateOrCreate(
            ['reference_model' => 'ProjectAddendum', 'reference_id' => $paidDis->id],
            [
                'transaction_type' => 'payment',
                'amount' => $paidDis->amount,
                'title' => $paidDis->title,
                'transaction_date' => now()->subDay(),
            ]
        );

        // B. One Pending disbursement for testing approval flow
        ProjectAddendum::updateOrCreate(
            ['project_id' => $project->id, 'title' => '[Legal Disbursement] Biaya Pajak BPHTB (Estimasi)'],
            [
                'user_id' => $notaryUser->id,
                'role_type' => 'notaris',
                'description' => 'Estimated tax for BPHTB based on deal value.',
                'amount' => 45000000,
                'status' => 'pending_approval',
            ]
        );
    }
}
