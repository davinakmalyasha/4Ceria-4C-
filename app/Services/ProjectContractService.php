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
                'location' => $project->location_address,
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
}
