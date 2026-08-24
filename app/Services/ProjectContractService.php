<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\ProjectActivityLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectContractService
{
    /**
     * Generate a digital SPK (Work Order) draft for a bid.
     */
    public function generateSPKDraft(Project $project, $bid, string $roleType)
    {
        return DB::transaction(function () use ($project, $bid, $roleType) {
            $proName = $this->getBidderName($bid, $roleType);
            $fee = $bid->calculated_total ?? $bid->price;

            $content = [
                'title' => "SURAT PERINTAH KERJA (SPK)",
                'project' => $project->title,
                // BUGFIX: projects has no location_address column — this line
                // threw MissingAttributeException under strict mode. Fall back
                // through the columns that DO exist.
                'location' => $project->lokasi ?? ($project->city ?? null),
                'owner' => $project->user->name,
                'professional' => $proName,
                'role' => strtoupper($roleType),
                'agreed_fee' => $fee,
                'generated_at' => now()->toDateTimeString(),
                'articles' => [
                    ['title' => 'Lingkup Pekerjaan', 'content' => 'Sesuai dengan proposal dan scope yang telah disepakati dalam sistem 4Ceria.'],
                    ['title' => 'Nilai Pekerjaan', 'content' => "Total nilai pekerjaan adalah Rp " . number_format($fee, 0, ',', '.') . "."],
                    ['title' => 'Sistem Pembayaran', 'content' => 'Pembayaran dilakukan secara termin melalui sistem 4Ceria sesuai dengan kesepakatan milestones.'],
                ]
            ];

            // Create or Update SPK Document record
            return ProjectDocument::updateOrCreate(
                [
                    'project_id' => $project->id,
                    'category' => 'spk',
                    'target_role' => match($roleType) {
                        'arsitek' => 'architect',
                        'kontraktor' => 'contractor',
                        'notaris' => 'notary',
                        'project_manager' => 'pm',
                        default => $roleType,
                    },
                ],
                [
                    'uploader_id' => Auth::id(),
                    'file_name' => "SPK_{$roleType}_{$project->id}.json",
                    'file_path' => 'internal_content', // We store the content as JSON in the database or a specialized table
                    'file_type' => 'json',
                    'status' => 'draft',
                    'version_label' => 'v1.0'
                ]
            );
        });
    }

    private function getBidderName($bid, $type)
    {
        return match ($type) {
            'arsitek' => $bid->arsitek->user->name ?? 'Architect',
            'kontraktor' => $bid->kontraktor->user->name ?? 'Contractor',
            'notaris' => $bid->notaris->user->name ?? 'Notary',
            'interior' => $bid->interior->user->name ?? 'Interior Designer',
            'project_manager' => $bid->pm->user->name ?? 'Project Manager',
            'structural' => $bid->structuralEngineer->user->name ?? 'Structural Engineer',
            'mep' => $bid->mepEngineer->user->name ?? 'MEP Engineer',
        };
    }

    /**
     * Generate and store an immutable snapshot of the signed SPK contract as a JSON file.
     */
    public function storeContractSnapshot(Project $project, $bid, string $roleType)
    {
        return DB::transaction(function () use ($project, $bid, $roleType) {
            $proName = $this->getBidderName($bid, $roleType);
            $fee = $bid->calculated_total ?? $bid->price;
            
            $targetRole = match($roleType) {
                'arsitek' => 'architect',
                'kontraktor' => 'contractor',
                'notaris' => 'notary',
                'project_manager' => 'pm',
                default => $roleType,
            };

            // Get payment termins associated with this role/contract
            $termins = $project->paymentTermins()->where('role_type', $roleType)->get()->map(fn($t) => [
                'label' => $t->label,
                'percentage' => $t->percentage,
                'amount' => $t->amount,
                'status' => $t->status,
            ])->toArray();

            // Get milestones associated with this role/contract
            $milestones = $project->milestones()
                ->where(function($q) use ($bid, $roleType) {
                    if ($roleType === 'arsitek') $q->where('arsitek_id', $bid->arsitek_id);
                    elseif ($roleType === 'kontraktor') $q->where('kontraktor_id', $bid->kontraktor_id);
                    elseif ($roleType === 'notaris') $q->where('notaris_id', $bid->notaris_id);
                    elseif ($roleType === 'interior') $q->where('interior_id', $bid->interior_id);
                    elseif ($roleType === 'project_manager') $q->where('pm_id', $bid->pm_id);
                    elseif ($roleType === 'structural') $q->where('structural_id', $bid->structural_id);
                    elseif ($roleType === 'mep') $q->where('mep_id', $bid->mep_id);
                })
                ->get()
                ->map(fn($m) => [
                    'title' => $m->title,
                    'description' => $m->description,
                    'approval_status' => $m->approval_status,
                ])
                ->toArray();

            $timestamp = $bid->created_at ? $bid->created_at->timestamp : time();
            $proSigPath = "contracts/project_{$project->id}/signatures/signature_{$roleType}_{$bid->id}_{$timestamp}.png";
            $clientSigPath = "contracts/project_{$project->id}/signatures/signature_{$roleType}_{$bid->id}_{$timestamp}_client.png";

            $clientName = $project->user->name ?? 'Client';
            
            $snapshotData = [
                'contract_number' => "SPK/{$project->id}/{$bid->id}",
                'project' => [
                    'id' => $project->id,
                    'title' => $project->title,
                    'location' => $project->lokasi ?? $project->location_address,
                ],
                'client' => [
                    'id' => $project->user_id,
                    'name' => $clientName,
                ],
                'professional' => [
                    'id' => $this->getBidderUserId($bid, $roleType),
                    'name' => $proName,
                    'role' => strtoupper($roleType),
                ],
                'financials' => [
                    'agreed_fee' => $fee,
                    'termins' => $termins,
                ],
                'milestones' => $milestones,
                'signatures' => [
                    'professional_signature_path' => $proSigPath,
                    'client_signature_path' => $clientSigPath,
                    'signed_at' => now()->toDateTimeString(),
                ],
                'articles' => [
                    ['title' => 'PASAL 1: LINGKUP PEKERJAAN', 'content' => "Pihak Pertama memberikan tugas kepada Pihak Kedua, dan Pihak Kedua menerima tugas tersebut untuk melaksanakan pekerjaan {$project->title} yang berlokasi di " . ($project->lokasi ?? $project->location_address ?? 'Lokasi Proyek') . " dengan rincian lingkup tugas sesuai kesepakatan dan standar pengerjaan platform 4Ceria."],
                    ['title' => 'PASAL 2: NILAI PEKERJAAN & JASA', 'content' => "Total nilai pekerjaan disepakati sebesar Rp " . number_format($fee, 0, ',', '.') . ". Jumlah ini sudah termasuk seluruh paket dasar jasa profesional serta dokumen-dokumen hukum pendukung yang telah dipilih dan disepakati di platform."],
                    ['title' => 'PASAL 3: SKEMA PEMBAYARAN ESCROW', 'content' => "Pembayaran dilakukan secara termin menggunakan sistem Rekening Bersama (Escrow) 4Ceria. Setiap pencairan dana hanya dilakukan setelah deliverables/scope pada termin bersangkutan diunggah di dalam Document Vault dan disetujui oleh Pihak Pertama atau Project Manager yang ditunjuk."],
                    ['title' => 'PASAL 4: PENYELESAIAN PERSELISIHAN', 'content' => "Apabila terjadi perselisihan atau perbedaan pendapat dalam pelaksanaan perjanjian ini, para pihak sepakat untuk menyelesaikan secara musyawarah mufakat, atau menggunakan layanan mediasi yang disediakan oleh platform 4Ceria sebelum menempuh jalur hukum formal."],
                ]
            ];

            $fileName = "SPK_{$roleType}_{$project->id}_signed.json";
            $filePath = "contracts/project_{$project->id}/" . $fileName;
            
            \Illuminate\Support\Facades\Storage::disk('railway')->put($filePath, json_encode($snapshotData, JSON_PRETTY_PRINT));

            return ProjectDocument::updateOrCreate(
                [
                    'project_id' => $project->id,
                    'category' => 'spk',
                    'target_role' => $targetRole,
                ],
                [
                    'uploader_id' => $project->user_id,
                    'file_name' => "SPK_{$roleType}_{$project->id}.json",
                    'file_path' => $filePath,
                    'file_type' => 'json',
                    'status' => 'verified',
                    'version_label' => 'v1.0'
                ]
            );
        });
    }

    private function getBidderUserId($bid, $type)
    {
        return match ($type) {
            'arsitek' => $bid->arsitek->user_id ?? \App\Models\Arsitek::find($bid->arsitek_id)->user_id ?? null,
            'kontraktor' => $bid->kontraktor->user_id ?? \App\Models\Kontraktor::find($bid->kontraktor_id)->user_id ?? null,
            'notaris' => $bid->notaris->user_id ?? \App\Models\NotarisProfile::find($bid->notaris_id)->user_id ?? null,
            'interior' => $bid->interior->user_id ?? \App\Models\InteriorProfile::find($bid->interior_id)->user_id ?? null,
            'project_manager' => $bid->pm->user_id ?? \App\Models\ProjectManager::find($bid->pm_id)->user_id ?? null,
            'structural' => $bid->structuralEngineer->user_id ?? \App\Models\StructuralEngineer::find($bid->structural_id)->user_id ?? null,
            'mep' => $bid->mepEngineer->user_id ?? \App\Models\MepEngineer::find($bid->mep_id)->user_id ?? null,
        };
    }
}
