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
     * The project's address, from columns that actually exist.
     *
     * WHY A HELPER
     * ------------
* `projects` has NO `location_address` column. Reading it throws
     * MissingAttributeException under `Model::shouldBeStrict(!isProduction())`
     * — so it is a 500 locally and a silent null in production.
     *
     * That reference was fixed once, in `generateSPKDraft`, and left in place in
     * BOTH `storeContractSnapshot` and the counter-signature snapshot builder.
     * The snapshot builder is the one that runs on the OWNER'S COUNTER-SIGNATURE,
     * so the half-fix turned it into: signing works when `lokasi` is populated
     * and fails when it is not — and `lokasi` is nullable, so that is a reachable
     * state. Same drift pattern as the `/legal-disbursements` and material-quote
     * pairs, then a fourth instance when a third call site was added here and the
     * helper was not used.
     *
     * ONE helper, and now ALL call sites, so it cannot diverge again. A grep for
     * `location_address` returns only this docblock and the two SPA lines fixed
     * alongside it.
     *
     * `lokasi` is the free-text address the owner typed at creation and is
     * preferred because it is what they actually entered. The structured
     * columns are the fallback, assembled in address order rather than left as a
     * bare `city`, because a legally-binding snapshot with only a city name is
     * not much of a location.
     */
    /**
     * The project's address, NEVER empty.
     *
     * @return string
     */
    public static function projectLocation(Project $project): string
    {
        $lokasi = trim((string) ($project->lokasi ?? ''));

        if ($lokasi !== '') {
            return $lokasi;
        }

        $structured = collect([
            $project->street_name,
            $project->kelurahan,
            $project->kecamatan,
            $project->city,
            $project->province,
            $project->postal_code,
        ])
            ->map(fn ($part) => trim((string) ($part ?? '')))
            ->filter()
            ->unique()
            ->implode(', ');

        // A total function. This is interpolated into a binding contract
        // clause, so returning "" produced
        //
        //     "... yang berlokasi di  dengan rincian lingkup ..."
        //
        // Every field can legitimately be NULL for a project created without an
        // address, so the empty case is reachable and must read as a placeholder
        // a human must complete, not as a gap.
        return $structured !== '' ? $structured : 'Lokasi Proyek';
    }

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
                // See self::projectLocation() — `location_address` does not
                // exist on `projects`, so reading it throws
                // MissingAttributeException under strict mode.
                'location' => self::projectLocation($project),
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
                    'location' => self::projectLocation($project),
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
                    ['title' => 'PASAL 1: LINGKUP PEKERJAAN', 'content' => "Pihak Pertama memberikan tugas kepada Pihak Kedua, dan Pihak Kedua menerima tugas tersebut untuk melaksanakan pekerjaan {$project->title} yang berlokasi di " . self::projectLocation($project) . " dengan rincian lingkup tugas sesuai kesepakatan dan standar pengerjaan platform 4Ceria."],
                    ['title' => 'PASAL 2: NILAI PEKERJAAN & JASA', 'content' => "Total nilai pekerjaan disepakati sebesar Rp " . number_format($fee, 0, ',', '.') . ". Jumlah ini sudah termasuk seluruh paket dasar jasa profesional serta dokumen-dokumen hukum pendukung yang telah dipilih dan disepakati di platform."],
                    ['title' => 'PASAL 3: SKEMA PEMBAYARAN ESCROW', 'content' => "Pembayaran dilakukan secara termin menggunakan sistem Rekening Bersama (Escrow) 4Ceria. Setiap pencairan dana hanya dilakukan setelah deliverables/scope pada termin bersangkutan diunggah di dalam Document Vault dan disetujui oleh Pihak Pertama atau Project Manager yang ditunjuk."],
                    ['title' => 'PASAL 4: PENYELESAIAN PERSELISIHAN', 'content' => "Apabila terjadi perselisihan atau perbedaan pendapat dalam pelaksanaan perjanjian ini, para pihak sepakat untuk menyelesaikan secara musyawarah mufakat, atau menggunakan layanan mediasi yang disediakan oleh platform 4Ceria sebelum menempuh jalur hukum formal."],
                ]
            ];

            $fileName = "SPK_{$roleType}_{$project->id}_signed.json";
            $filePath = "contracts/project_{$project->id}/" . $fileName;
            
            \Illuminate\Support\Facades\Storage::disk(\App\Support\Vault::disk())->put($filePath, json_encode($snapshotData, JSON_PRETTY_PRINT));

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
