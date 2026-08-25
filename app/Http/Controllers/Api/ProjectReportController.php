<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectReport;
use App\Services\ProjectReportService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

class ProjectReportController extends Controller
{
    use AuthorizesRequests;

    protected $reportService;

    public function __construct(ProjectReportService $reportService)
    {
        $this->reportService = $reportService;
    }

    /**
     * List all reports for a project.
     */
    public function index(Request $request, Project $project)
    {
        $this->authorize('viewAny', [ProjectReport::class, $project]);

        $reports = $project->reports()
            ->with('creator')
            ->orderBy('published_at', 'desc')
            ->get();

        return response()->json($reports);
    }

    /**
     * Store a new report.
     */
    public function store(Request $request, Project $project)
    {
        $this->authorize('create', [ProjectReport::class, $project]);

        $validator = Validator::make($request->all(), [
            'phase_slug' => 'nullable|string',
            'summary' => 'required|string',
            'progress_percentage' => 'required|integer|min:0|max:100',
            'budget_health' => 'required|in:on_track,warning,critical',
            'photos.*' => 'image|mimes:jpeg,png,jpg,webp|max:5120', // Max 5MB
            'attachments.*' => 'file|mimes:pdf,doc,docx,xls,xlsx,zip,rar|max:10240', // Max 10MB
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $report = $this->reportService->createReport($project, $request->all(), Auth::id());
            return response()->json([
                'message' => 'Report published successfully!',
                'report' => $report
            ], 201);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to publish report: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Update an existing report.
     */
    public function update(Request $request, Project $project, ProjectReport $report)
    {
        $this->authorize('update', $report);

        $validator = Validator::make($request->all(), [
            'phase_slug' => 'nullable|string',
            'summary' => 'sometimes|required|string',
            'progress_percentage' => 'sometimes|required|integer|min:0|max:100',
            'budget_health' => 'sometimes|required|in:on_track,warning,critical',
            'photos.*' => 'image|mimes:jpeg,png,jpg,webp|max:5120',
            'attachments.*' => 'file|mimes:pdf,doc,docx,xls,xlsx,zip,rar|max:10240',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $report = $this->reportService->updateReport($report, $request->all());

            return response()->json([
                'message' => 'Report updated successfully!',
                'report' => $report
            ]);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to update report: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Delete a report.
     */
    public function destroy(Project $project, ProjectReport $report)
    {
        $this->authorize('delete', $report);

        try {
            $this->reportService->deleteReport($report);
            return response()->json(['message' => 'Report deleted successfully.']);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to delete report.'], 500);
        }
    }
}
