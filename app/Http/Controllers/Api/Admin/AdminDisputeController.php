<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\DisputeMessage;
use App\Models\ProjectDispute;
use App\Services\DisputeService;
use Exception;
use Illuminate\Http\Request;

class AdminDisputeController extends Controller
{
    public function __construct(private DisputeService $disputes)
    {
    }

    /**
     * Arbitration queue. ?status=open|resolved|dismissed|withdrawn (default: all,
     * open first) plus an open_count for the nav badge.
     */
    public function index(Request $request)
    {
        $query = ProjectDispute::with(['project:id,title,status,budget', 'opener:id,name,pic', 'resolver:id,name'])
            ->orderByRaw("FIELD(status, 'open', 'resolved', 'dismissed', 'withdrawn')")
            ->orderByDesc('created_at');

        $status = $request->query('status');
        if ($status && in_array($status, ['open', 'resolved', 'dismissed', 'withdrawn'], true)) {
            $query->where('status', $status);
        }

        return response()->json([
            'data' => $query->paginate(20),
            'open_count' => ProjectDispute::where('status', 'open')->count(),
        ]);
    }

    public function show(ProjectDispute $dispute)
    {
        $dispute->load([
            'project:id,title,status,budget,pm_id,user_id',
            'opener:id,name,pic',
            'resolver:id,name',
            'messages' => fn ($q) => $q->orderBy('created_at')->with('user:id,name,pic'),
        ]);

        return response()->json(['data' => $dispute]);
    }

    /**
     * Admin reply on the thread (same rules as participants).
     */
    public function reply(Request $request, ProjectDispute $dispute)
    {
        $data = $request->validate([
            'body' => 'required|string|max:5000',
            'evidence' => 'nullable|file|mimes:'.DisputeService::EVIDENCE_MIMES.'|max:'.DisputeService::EVIDENCE_MAX_KB,
        ]);

        try {
            $message = $this->disputes->reply(
                $dispute,
                $request->user(),
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
     * Signed temporary URL for a thread evidence file (railway disk).
     */
    public function evidence(ProjectDispute $dispute, DisputeMessage $message)
    {
        if ((int) $message->dispute_id !== (int) $dispute->id) {
            abort(404, 'Not found.');
        }

        try {
            return response()->json(['url' => $this->disputes->evidenceUrl($message)]);
        } catch (Exception $e) {
            return response()->json(['message' => $e->getMessage()], 404);
        }
    }

    /**
     * Arbitration action: dismiss | release_payment | record_refund |
     * terminate_project | custom.
     */
    public function act(Request $request, ProjectDispute $dispute)
    {
        $data = $request->validate([
            'action' => 'required|in:'.implode(',', DisputeService::ADMIN_ACTIONS),
            'notes' => 'nullable|string|max:5000',
            'amount' => 'nullable|numeric|min:0.01|max:999999999999999',
        ]);

        try {
            $dispute = $this->disputes->adminAction(
                $dispute,
                $request->user(),
                $data['action'],
                $data['notes'] ?? null,
                // Passed through unconverted: DisputeService normalises it to
                // App\Support\Money. Casting to float here is what let a
                // fractional cent be lost before the cap was ever evaluated.
                $data['amount'] ?? null
            );
        } catch (Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 422);
        }

        $messages = [
            'dismiss' => 'Dispute dismissed. Payments are unfrozen.',
            'release_payment' => 'Payment released and recorded. Dispute closed.',
            'record_refund' => 'Refund recorded in the ledger. Dispute closed.',
            'terminate_project' => 'Project force-terminated. Dispute closed.',
            'custom' => 'Dispute closed with custom resolution.',
        ];

        return response()->json([
            'message' => $messages[$data['action']] ?? 'Dispute closed.',
            'data' => $dispute,
        ]);
    }
}
