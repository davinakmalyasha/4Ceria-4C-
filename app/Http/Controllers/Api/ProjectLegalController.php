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

        try {
            $requirements = self::syncProjectLegalScope($project, $validated['selected_requirements'], $user->id);
            return response()->json([
                'message' => 'Legal scope finalized. The Document Vault has been populated.',
                'requirements' => $requirements,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to finalize legal scope: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Core logic to sync legal requirements to milestones.
     * Can be called automatically when a bid is accepted/signed.
     */
    public static function syncProjectLegalScope(Project $project, array $requirements, $actingUserId = null)
    {
        // Always ensure misc_legal is present as a catch-all
        if (!in_array('misc_legal', $requirements)) {
            $requirements[] = 'misc_legal';
        }

        return DB::transaction(function () use ($project, $requirements, $actingUserId) {
            // 1. Persist to project
            $project->update(['legal_requirements' => $requirements]);

            // 2. Seed milestone slots for each selected requirement
            $notarisUserId = null;
            $bidServices = collect();
            if ($project->selected_notaris_id) {
                $notarisProfile = \App\Models\NotarisProfile::find($project->selected_notaris_id);
                if ($notarisProfile) {
                    $notarisUserId = $notarisProfile->user_id;
                }
                
                // Get the accepted bid to find service titles
                $bid = \App\Models\BidNotaris::where('project_id', $project->id)
                    ->where('notaris_id', $project->selected_notaris_id)
                    ->whereIn('status', ['accepted', 'awaiting_payment', 'active', 'contract_pending'])
                    ->first();
                
                if ($bid && is_array($bid->selected_services)) {
                    $bidServices = collect($bid->selected_services);
                }
            }

            foreach ($requirements as $index => $reqId) {
                // Try to get label from hardcoded list first
                $label = (new self)->getRequirementLabel($reqId);
                
                // If the reqId is a dynamic service ID (numeric), look it up in the bid's selected services
                if (is_numeric($reqId)) {
                    $service = $bidServices->first(function($s) use ($reqId) {
                        $id = is_array($s) ? ($s['id'] ?? null) : (is_object($s) ? ($s->id ?? null) : $s);
                        return (string)$id === (string)$reqId;
                    });
                    
                    if ($service) {
                        $label = is_array($service) ? ($service['title'] ?? $label) : (is_object($service) ? ($service->title ?? $label) : $label);
                    }
                }

                ProjectMilestone::updateOrCreate(
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
            if ($actingUserId) {
                ProjectActivityLog::create([
                    'project_id' => $project->id,
                    'user_id' => $actingUserId,
                    'action' => 'legal_scope_finalized',
                    'details' => 'Legal scope finalized with ' . count($requirements) . ' document requirements.',
                ]);
            }

            return $requirements;
        });
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
