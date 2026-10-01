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
                // The DAYS come from config so they cannot contradict
                // `warranty_end_at`, which ProjectLifecycleService computes from the
                // same value. These were previously two independent hardcoded 180s,
                // so changing the window in one place produced a contract that
                // disagreed with its own expiry date.
                //
                // `warranty_months_display` is used for the human-readable phrase
                // because "6 bulan" is what an Indonesian construction contract
                // says, while the arithmetic stays in exact days. The two are NOT
                // derived from each other: 6 months is not 180 days, and pretending
                // otherwise would move a date money is released against.
                'PIHAK KEDUA bertanggung jawab penuh atas Masa Pemeliharaan selama '
                    .(int) config('escrow.warranty_days', 180)
                    .' hari ('.(int) config('escrow.warranty_months_display', 6)
                    .' bulan) sejak tanggal penandatanganan.',
                'Seluruh cacat pekerjaan (snag list) yang terdata sebelumnya telah dinyatakan selesai dan diperbaiki.'
            ]
        ];
    }
}
