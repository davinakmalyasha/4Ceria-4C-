<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectMilestone;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectLegalController extends Controller
{
    public function getFinancials(Project $project)
    {
        return response()->json([
            'allocated_tax' => $project->budget * 0.1,
            'total_spent' => $project->paymentTermins()->where('status', 'paid')->sum('amount'),
            'pending_approval' => $project->paymentTermins()->where('status', 'pending')->sum('amount'),
            'disbursements' => $project->paymentTermins()
                ->whereIn('role_type', ['notaris', 'arsitek'])
                ->orderBy('created_at', 'desc')
                ->get(),
        ]);
    }

    /**
     * Finalize the legal scope after Notary-Owner discussion.
     * This is the "Negotiated Scope" endpoint — called from LegalBriefManager
     * after the Notary selects exactly which documents are required.
     */
    public function finalizeLegalScope(Request $request, Project $project)
    {
        $user = Auth::user();

        // Authorization: Only the assigned Notary, Owner, or PM can finalize
        $isNotary = $user->role_type === 'notaris'
            && $project->selected_notaris_id
            && optional($user->notaris_profile)->id === $project->selected_notaris_id;
        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id && $user->role_type === 'project_manager';

        if (!$isNotary && !$isOwner && !$isPM) {
            return response()->json([
                'message' => 'Only the assigned Notary, Project Owner, or PM can finalize the legal scope.'
            ], 403);
        }

        $validated = $request->validate([
            'selected_requirements' => 'required|array|min:1',
            'selected_requirements.*' => 'required|string|max:100',
        ]);

        $requirements = $validated['selected_requirements'];

        // Always ensure misc_legal is present as a catch-all
        if (!in_array('misc_legal', $requirements)) {
            $requirements[] = 'misc_legal';
        }

        DB::beginTransaction();
        try {
            // 1. Persist to project
            $project->update(['legal_requirements' => $requirements]);

            // 2. Seed milestone slots for each selected requirement
            $notarisUserId = null;
            if ($project->selected_notaris_id) {
                $notarisProfile = \App\Models\NotarisProfile::find($project->selected_notaris_id);
                $notarisUserId = $notarisProfile?->user_id;
            }

            foreach ($requirements as $index => $reqId) {
                $label = $this->getRequirementLabel($reqId);

                ProjectMilestone::firstOrCreate(
                    [
                        'project_id' => $project->id,
                        'type' => 'legal',
                        'content->req_id' => $reqId,
                    ],
                    [
                        'title' => $label,
                        'notaris_id' => $notarisUserId,
                        'description' => "Awaiting: {$label}",
                        'phase_context' => 'legal',
                        'sort_order' => $index,
                        'is_completed' => false,
                        'approval_status' => 'drafting',
                        'content' => ['req_id' => $reqId],
                    ]
                );
            }

            // 3. Log activity
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'legal_scope_finalized',
                'details' => 'Legal scope finalized with ' . count($requirements) . ' document requirements.',
            ]);

            DB::commit();

            return response()->json([
                'message' => 'Legal scope finalized. The Document Vault has been populated.',
                'requirements' => $requirements,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to finalize legal scope.',
            ], 500);
        }
    }

    public function storeDisbursement(Request $request, Project $project)
    {
        $request->validate([
            'amount' => 'required|numeric|min:1',
            'purpose' => 'required|string',
        ]);

        return response()->json(['message' => 'Disbursement request submitted.']);
    }

    public function verifyDisbursement(Request $request, Project $project, $id)
    {
        return response()->json(['message' => 'Disbursement verified.']);
    }

    /**
     * Map requirement IDs to human-readable labels.
     * Mirrors the frontend LegalStandardPresets dictionary.
     */
    private function getRequirementLabel(string $id): string
    {
        $labels = [
            'shm_shgb' => 'Sertifikat Tanah (SHM/SHGB)',
            'ajb_deed' => 'Akta Jual Beli (AJB)',
            'buku_tanah' => 'Buku Tanah (Land Book Copy)',
            'no_dispute_letter' => 'Surat Pernyataan Tidak Sengketa',
            'pbb_receipt' => 'Bukti Lunas PBB',
            'surat_ukur' => 'Surat Ukur (Measurement Letter)',
            'ktp_owner' => 'KTP (Owner Identity Card)',
            'kartu_keluarga' => 'Kartu Keluarga (KK)',
            'marriage_cert' => 'Surat Nikah (Marriage Certificate)',
            'npwp' => 'NPWP (Tax ID Number)',
            'surat_kuasa' => 'Surat Kuasa (Power of Attorney)',
            'prenuptial' => 'Perjanjian Kawin (Prenuptial Agreement)',
            'construction_contract' => 'Akta Perjanjian Pemborongan',
            'joint_build_agreement' => 'Perjanjian Bangun Bagi Hasil',
            'ppjb' => 'PPJB (Preliminary Sale & Purchase Agreement)',
            'pbg_permit' => 'PBG (Persetujuan Bangunan Gedung)',
            'slf_certification' => 'SLF (Sertifikat Laik Fungsi)',
            'environmental_permit' => 'SPPL/AMDAL (Environmental Permit)',
            'krk_kkpr' => 'KRK/KKPR (Zoning Advice)',
            'bphtb_receipt' => 'Bukti Bayar BPHTB',
            'pph_receipt' => 'Bukti Bayar PPh (Income Tax)',
            'apht_mortgage' => 'APHT (Akta Pemberian Hak Tanggungan)',
            'credit_agreement' => 'Perjanjian Kredit (Credit Agreement)',
            'bast_handover' => 'BAST (Berita Acara Serah Terima)',
            'lien_waiver' => 'Lien Waivers',
            'as_built_drawings' => 'As-Built Drawings (Record Drawings)',
            'obra_nueva' => 'Akta Pernyataan Obra Nueva',
            'misc_legal' => 'Field Reports (Misc Progress)',
        ];

        return $labels[$id] ?? ucwords(str_replace('_', ' ', $id));
    }
}
