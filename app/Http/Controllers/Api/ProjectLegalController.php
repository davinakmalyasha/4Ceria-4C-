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
        $user = Auth::user();

        // Only project participants may see legal/financial summaries.
        $isNotary = $user->role_type === 'notaris'
            && $project->selected_notaris_id
            && optional($user->notaris_profile)->id === $project->selected_notaris_id;
        $isOwner = $project->user_id === $user->id;
        $isPM = $user->role_type === 'project_manager' && (int) $project->pm_id === (int) $user->id;

        if (!$isNotary && !$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

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
        // BUGFIX: must verify the PM is THE assigned PM (pm_id stores user id),
        // not just any account with the project_manager role.
        $isPM = $user->role_type === 'project_manager' && $project->pm_id && (int) $project->pm_id === (int) $user->id;

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
                        // BUGFIX: milestones.notaris_id stores PROFILE ids (matching
                        // signContract + the notaris() relation) — writing the user
                        // id here previously resolved the relation to the wrong notary.
                        'notaris_id' => $project->selected_notaris_id,
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
        $user = Auth::user();

        // Only hired notary/architect or the owner/PM may request disbursements.
        $isNotary = $user->role_type === 'notaris'
            && $project->selected_notaris_id
            && optional($user->notaris_profile)->id === $project->selected_notaris_id;
        $isArsitek = $user->role_type === 'arsitek'
            && $project->selected_arsitek_id
            && optional($user->arsitek)->id === $project->selected_arsitek_id;
        $isOwner = $project->user_id === $user->id;
        $isPM = $user->role_type === 'project_manager' && (int) $project->pm_id === (int) $user->id;

        if (!$isNotary && !$isArsitek && !$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'amount' => 'required|numeric|min:1',
            'purpose' => 'required|string|max:2000',
            'title' => 'nullable|string|max:255',
        ]);

        // BUGFIX: this endpoint previously validated input and returned success
        // WITHOUT persisting anything — silent data loss for the requester.
        $disbursement = \App\Models\ProjectDisbursement::create([
            'project_id' => $project->id,
            'requested_by' => $user->id,
            'title' => $validated['title'] ?? null,
            'purpose' => $validated['purpose'],
            'amount' => $validated['amount'],
            'status' => 'pending',
        ]);

        // Notify owner (or PM when one is assigned) that approval is needed.
        $approverId = $project->pm_id ?: $project->user_id;
        if ($approverId && (int) $approverId !== (int) $user->id) {
            \App\Models\Notification::create([
                'user_id' => $approverId,
                'type' => 'budget_approval_needed',
                'title' => 'Disbursement Request',
                'body' => "{$user->name} requested a disbursement of Rp " . number_format((float) $validated['amount'], 0, ',', '.') . " on \"{$project->title}\".",
                'data' => [
                    'project_id' => $project->id,
                    'disbursement_id' => $disbursement->id,
                ],
            ]);
        }

        return response()->json(['message' => 'Disbursement request submitted.', 'data' => $disbursement], 201);
    }

    public function verifyDisbursement(Request $request, Project $project, $id)
    {
        $user = Auth::user();

        $disbursement = \App\Models\ProjectDisbursement::where('project_id', $project->id)->find($id);
        if (!$disbursement) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $isOwner = $project->user_id === $user->id;
        $isPM = $user->role_type === 'project_manager' && (int) $project->pm_id === (int) $user->id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Only the Owner or PM can verify disbursements.'], 403);
        }

        if ($disbursement->status !== 'pending') {
            return response()->json(['message' => 'This disbursement has already been processed.'], 422);
        }

        $validated = $request->validate([
            'action' => 'nullable|in:verify,reject',
            'notes' => 'nullable|string|max:1000',
        ]);

        $action = $validated['action'] ?? 'verify';

        $disbursement->update([
            'status' => $action === 'verify' ? 'verified' : 'rejected',
            'verified_by' => $user->id,
            'verified_at' => now(),
            'verification_notes' => $validated['notes'] ?? null,
        ]);

        return response()->json(['message' => 'Disbursement verified.', 'data' => $disbursement]);
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
