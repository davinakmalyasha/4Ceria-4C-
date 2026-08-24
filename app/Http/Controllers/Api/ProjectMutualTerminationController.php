<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectTermination;
use App\Models\ProjectActivityLog;
use App\Traits\HandlesProjectAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectMutualTerminationController extends Controller
{
    use HandlesProjectAuthorization;

    /**
     * Initiate a mutual project termination request.
     */
    public function initiate(Request $request, Project $project)
    {
        $request->validate([
            'reason' => 'required|string|max:1000',
            'settlement_terms' => 'nullable|string|max:1000',
        ]);

        $user = Auth::user();
        // Owner (user_id), assigned PM (pm_id stores the PM's USER id) or a hired
        // professional (selected_* columns store PROFILE ids, resolved via trait).
        $isParticipant = $this->isProjectOwner($project, $user)
            || (int) $project->pm_id === (int) $user->id
            || $this->isHiredProfessional($project, $user);

        if (!$isParticipant) abort(403, 'Unauthorized.');
        if (in_array($project->status, ['cancelled', 'completed', 'termination_pending'])) {
            return response()->json(['message' => 'Proyek tidak dalam status aktif untuk dibatalkan.'], 422);
        }

        return DB::transaction(function () use ($project, $request, $user) {
            $term = ProjectTermination::create([
                'project_id' => $project->id,
                'initiator_id' => $user->id,
                'reason' => $request->reason,
                'settlement_terms' => $request->settlement_terms,
                'status' => 'pending',
            ]);

            $project->update(['status' => 'termination_pending']);

            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'termination_initiated',
                'details' => "Pengajuan pembatalan proyek diajukan oleh {$user->name}. Alasan: {$request->reason}",
            ]);

            return response()->json([
                'message' => 'Pengajuan pembatalan bersama berhasil dibuat. Workspace dibekukan sementara.',
                'data' => $term
            ]);
        });
    }

    /**
     * Respond (Accept/Reject) to a pending mutual termination request.
     */
    public function respond(Request $request, Project $project, ProjectTermination $termination)
    {
        $request->validate([
            'action' => 'required|in:accept,reject',
            'resolution_notes' => 'nullable|string|max:1000',
        ]);

        $user = Auth::user();

        // Binding check: the termination must belong to THIS project.
        if ((int) $termination->project_id !== (int) $project->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($termination->initiator_id === $user->id) {
            abort(403, 'Anda tidak bisa menanggapi pengajuan yang Anda buat sendiri.');
        }

        // Only project participants may accept/reject a termination request.
        $isParticipant = $this->isProjectOwner($project, $user)
            || (int) $project->pm_id === (int) $user->id
            || $this->isHiredProfessional($project, $user);
        if (!$isParticipant) {
            abort(403, 'Unauthorized.');
        }

        if ($termination->status !== 'pending') {
            return response()->json(['message' => 'Pengajuan ini sudah diproses.'], 422);
        }

        return DB::transaction(function () use ($project, $termination, $request, $user) {
            $isAccept = $request->action === 'accept';
            $termination->update([
                'status' => $isAccept ? 'accepted' : 'rejected',
                'resolved_at' => $isAccept ? now() : null,
                'resolution_notes' => $request->resolution_notes ?? 'Diselesaikan secara kekeluargaan.',
            ]);

            // Revert project to in_progress if rejected, or cancel it if accepted
            $project->update(['status' => $isAccept ? 'cancelled' : 'in_progress']);

            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'termination_responded',
                'details' => "Pengajuan pembatalan " . ($isAccept ? 'disetujui' : 'ditolak') . " oleh {$user->name}.",
            ]);

            return response()->json([
                'message' => $isAccept ? 'Proyek dibatalkan secara bersama.' : 'Pengajuan pembatalan ditolak. Proyek kembali aktif.',
                'data' => $termination
            ]);
        });
    }

    /**
     * Escalate a rejected mutual termination to administrative dispute/arbitration.
     */
    public function escalate(Project $project, ProjectTermination $termination)
    {
        $user = Auth::user();
        if ($termination->project_id !== $project->id || $termination->status !== 'rejected') {
            return response()->json(['message' => 'Status pengajuan tidak valid untuk dieskalasi.'], 422);
        }

        // Only participants of this project may escalate the dispute.
        $isParticipant = $this->isProjectOwner($project, $user)
            || (int) $project->pm_id === (int) $user->id
            || $this->isHiredProfessional($project, $user);
        if (!$isParticipant) {
            abort(403, 'Unauthorized.');
        }

        $termination->update(['status' => 'escalated']);

        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'termination_escalated',
            'details' => "Perselisihan pembatalan proyek dieskalasi ke admin oleh {$user->name}.",
        ]);

        return response()->json([
            'message' => 'Perselisihan berhasil dieskalasi ke Admin Platform. Admin akan melakukan review menyeluruh.',
            'data' => $termination
        ]);
    }
}
