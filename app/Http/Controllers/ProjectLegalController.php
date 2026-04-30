<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Services\ProjectLegalService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ProjectLegalController extends Controller
{
    protected $legalService;

    public function __construct(ProjectLegalService $legalService)
    {
        $this->legalService = $legalService;
    }

    /**
     * Seal project design and technical drawings.
     */
    public function sealLegal(Project $project)
    {
        // Authorization: Architect or PM or Owner
        if (!in_array(Auth::id(), [$project->user_id, $project->pm_id, $project->selected_arsitek_id])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $project = $this->legalService->sealProjectLegal($project);

        return response()->json([
            'message' => 'Project design officially sealed and locked.',
            'project' => $project
        ]);
    }

    /**
     * Fetch legal financial status.
     */
    public function getFinancials(Project $project)
    {
        $financials = $this->legalService->getLegalFinancials($project);

        return response()->json($financials);
    }

    /**
     * Store a new disbursement request for Notary or Permits.
     */
    public function storeDisbursement(Request $request, Project $project)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
            'description' => 'required|string',
        ]);

        $transaction = ProjectBudgetTransaction::create([
            'project_id' => $project->id,
            'title' => '[Legal Disbursement] ' . $request->title,
            'amount' => $request->amount,
            'description' => $request->description,
            'category' => 'legal',
            'type' => 'expense',
            'status' => 'pending_approval',
            'transaction_date' => now(),
        ]);

        return response()->json([
            'message' => 'Disbursement request submitted for PM review.',
            'transaction' => $transaction
        ]);
    }

    /**
     * Verify a disbursement request.
     */
    public function verifyDisbursement(Request $request, Project $project, $id)
    {
        $transaction = ProjectBudgetTransaction::findOrFail($id);

        if ($transaction->project_id !== $project->id) {
            return response()->json(['message' => 'Mismatch'], 404);
        }

        // Only PM or Owner can verify
        if (Auth::id() !== $project->user_id && Auth::id() !== $project->pm_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $transaction->update([
            'status' => $request->status === 'approved' ? 'paid' : 'rejected'
        ]);

        return response()->json([
            'message' => 'Financial ledger updated.',
            'transaction' => $transaction
        ]);
    }
}
