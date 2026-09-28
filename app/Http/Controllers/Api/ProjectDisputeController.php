<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DisputeMessage;
use App\Models\Project;
use App\Models\ProjectDispute;
use App\Services\DisputeService;
use App\Traits\HandlesProjectAuthorization;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ProjectDisputeController extends Controller
{
    use HandlesProjectAuthorization;

    public function __construct(private DisputeService $disputes)
    {
    }

    /**
     * List disputes for this project (participants only), newest first,
     * with the full thread + authors loaded for the panel.
     */
    public function index(Project $project)
    {
        $this->authorizeParticipant($project);

        return response()->json([
            'data' => ProjectDispute::with([
                'opener:id,name,pic',
                'resolver:id,name',
                'messages' => fn ($q) => $q->orderBy('created_at')->with('user:id,name,pic'),
            ])
                ->where('project_id', $project->id)
                ->orderByDesc('created_at')
                ->get(),
        ]);
    }

    /**
     * Open a new dispute (freezes payments until resolved).
     */
    public function store(Request $request, Project $project)
    {
        $user = $this->authorizeParticipant($project);

        $data = $request->validate([
            'category' => 'required|in:'.implode(',', DisputeService::CATEGORIES),
            'title' => 'required|string|max:255',
            'description' => 'required|string|max:5000',
            'disputed_amount' => 'nullable|numeric|min:0|max:999999999999999',
            'payment_type' => 'nullable|string|in:'.implode(',', DisputeService::PAYMENT_TYPES),
            'payment_id' => 'nullable|integer|min:1',
        ]);

        // payment_id without a type (or vice versa) is meaningless.
        if (isset($data['payment_type']) !== isset($data['payment_id'])) {
            return response()->json(['message' => 'payment_type and payment_id must be provided together.'], 422);
        }

        try {
            $dispute = $this->disputes->open($project, $user, $data);
        } catch (Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 422);
        }

        return response()->json([
            'message' => 'Dispute opened. All project payments are frozen until an admin resolves it.',
            'data' => $dispute,
        ], 201);
    }

    /**
     * Single dispute + thread.
     */
    public function show(Project $project, ProjectDispute $dispute)
    {
        $this->authorizeParticipant($project);

        if ((int) $dispute->project_id !== (int) $project->id) {
            abort(404, 'Not found.');
        }

        $dispute->load([
            'opener:id,name,pic',
            'resolver:id,name',
            'messages' => fn ($q) => $q->orderBy('created_at')->with('user:id,name,pic'),
        ]);

        return response()->json(['data' => $dispute]);
    }

    /**
     * Reply on the dispute thread (optional evidence file, private disk).
     */
    public function reply(Request $request, Project $project, ProjectDispute $dispute)
    {
        $user = $this->authorizeParticipant($project);

        if ((int) $dispute->project_id !== (int) $project->id) {
            abort(404, 'Not found.');
        }

        $data = $request->validate([
            'body' => 'required|string|max:5000',
            // SECURITY: a bare `file` rule accepts any type. Evidence is served
            // from a presigned URL, so an uploaded .html/.svg would execute on
            // the storage origin for every reviewer. Explicit allowlist, and the
            // download is forced to attachment + a pinned content type in
            // DisputeService::evidenceUrl().
            'evidence' => 'nullable|file|mimes:'.DisputeService::EVIDENCE_MIMES.'|max:'.DisputeService::EVIDENCE_MAX_KB,
        ]);

        try {
            $message = $this->disputes->reply(
                $dispute,
                $user,
                $data['body'],
                $request->file('evidence')
            );
        } catch (Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 422);
        }

        return response()->json([
            'message' => 'Message posted.',
            'data' => $message->load('user:id,name,pic'),
        ], 201);
    }

    /**
     * Withdraw an open dispute (opener only) — unfreezes payments.
     */
    public function withdraw(Project $project, ProjectDispute $dispute)
    {
        $user = $this->authorizeParticipant($project);

        if ((int) $dispute->project_id !== (int) $project->id) {
            abort(404, 'Not found.');
        }

        try {
            $dispute = $this->disputes->withdraw($dispute, $user);
        } catch (Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 422);
        }

        return response()->json([
            'message' => 'Dispute withdrawn. Payments are unfrozen.',
            'data' => $dispute,
        ]);
    }

    /**
     * Signed temporary URL for a thread evidence file (railway disk).
     */
    public function evidence(Project $project, ProjectDispute $dispute, DisputeMessage $message)
    {
        $this->authorizeParticipant($project);

        if ((int) $dispute->project_id !== (int) $project->id || (int) $message->dispute_id !== (int) $dispute->id) {
            abort(404, 'Not found.');
        }

        try {
            return response()->json(['url' => $this->disputes->evidenceUrl($message)]);
        } catch (Exception $e) {
            return response()->json(['message' => $e->getMessage()], 404);
        }
    }

    private function authorizeParticipant(Project $project)
    {
        $user = Auth::user();

        if (! $this->isProjectOwner($project, $user) && ! $this->isHiredProfessional($project, $user)) {
            abort(403, 'Unauthorized. Only project participants can view disputes.');
        }

        return $user;
    }
}
