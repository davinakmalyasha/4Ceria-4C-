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
        // BUGFIX: previously eager-loaded nonexistent relations ('pm',
        // 'accepted_contractor_bid') -> RelationNotFoundException, and read
        // nonexistent attributes (users.phone, warranty_expires_at,
        // hired_contract_price) -> MissingAttributeException under strict mode.
        $project->load(['user.phoneNumber', 'kontraktor.user', 'projectManager.user']);

        $contractor = $project->kontraktor?->user;
        $pm = $project->projectManager?->user;

        return [
            'document_number' => "BAST/" . $project->id . "/" . Carbon::now()->format('Y/m/d'),
            'date' => Carbon::now()->format('d F Y'),
            'project' => [
                'id' => $project->id,
                'title' => $project->title,
                'location' => $project->lokasi ?? $project->city,
                'total_budget' => $project->budget,
            ],
            'parties' => [
                'owner' => [
                    'name' => $project->user->name,
                    'phone' => $project->user->phoneNumber->first()?->contact,
                    'role' => 'PIHAK PERTAMA (Pemilik)',
                ],
                'contractor' => [
                    'name' => $contractor?->name ?? $project->kontraktor?->nama ?? 'N/A',
                    'company' => $project->kontraktor?->nama ?? 'N/A',
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
                'warranty_expiry' => $project->warranty_end_at ? $project->warranty_end_at->format('d F Y') : 'N/A',
            ],
            'legal_clauses' => [
                'BAST ini merupakan bukti sah penyerahan pekerjaan dari PIHAK KEDUA kepada PIHAK PERTAMA.',
                'PIHAK KEDUA bertanggung jawab penuh atas Masa Pemeliharaan selama 180 hari sejak tanggal penandatanganan.',
                'Seluruh cacat pekerjaan (snag list) yang terdata sebelumnya telah dinyatakan selesai dan diperbaiki.'
            ]
        ];
    }
}
