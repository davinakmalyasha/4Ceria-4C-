<?php

namespace App\Services;

use App\Models\Project;
use Carbon\Carbon;

class BASTService
{
    /**
     * Compile BAST Data for a project
     */
    public function compileData(Project $project): array
    {
        $project->load(['user', 'pm.user', 'accepted_contractor_bid.contractor.user']);
        
        $contractor = $project->accepted_contractor_bid?->contractor?->user;
        $pm = $project->pm?->user;
        
        return [
            'document_number' => "BAST/" . $project->id . "/" . Carbon::now()->format('Y/m/d'),
            'date' => Carbon::now()->format('d F Y'),
            'project' => [
                'id' => $project->id,
                'title' => $project->title,
                'location' => $project->lokasi ?? $project->city,
                'total_budget' => $project->budget,
                'contract_price' => $project->hired_contract_price,
            ],
            'parties' => [
                'owner' => [
                    'name' => $project->user->name,
                    'phone' => $project->user->phone,
                    'role' => 'PIHAK PERTAMA (Pemilik)',
                ],
                'contractor' => [
                    'name' => $contractor?->name ?? 'N/A',
                    'company' => $project->accepted_contractor_bid?->contractor?->company_name ?? 'N/A',
                    'role' => 'PIHAK KEDUA (Pelaksana)',
                ],
                'pm' => [
                    'name' => $pm?->name ?? 'N/A',
                    'role' => 'PIHAK KETIGA (Pengawas)',
                ]
            ],
            'milestones' => [
                'start_date' => $project->created_at->format('d F Y'),
                'completion_date' => $project->owner_accepted_at ? $project->owner_accepted_at->format('d F Y') : 'N/A',
                'warranty_expiry' => $project->warranty_expires_at ? $project->warranty_expires_at->format('d F Y') : 'N/A',
            ],
            'legal_clauses' => [
                'BAST ini merupakan bukti sah penyerahan pekerjaan dari PIHAK KEDUA kepada PIHAK PERTAMA.',
                'PIHAK KEDUA bertanggung jawab penuh atas Masa Pemeliharaan selama 180 hari sejak tanggal penandatanganan.',
                'Seluruh cacat pekerjaan (snag list) yang terdata sebelumnya telah dinyatakan selesai dan diperbaiki.'
            ]
        ];
    }
}
