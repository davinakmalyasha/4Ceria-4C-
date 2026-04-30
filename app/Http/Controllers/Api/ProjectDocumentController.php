<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\ProjectActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;

class ProjectDocumentController extends Controller
{
    public function index(Project $project)
    {
        return response()->json(['data' => $project->documents()->with('uploader')->get()]);
    }

    public function store(Request $request, Project $project)
    {
        $request->validate([
            'file' => 'required|file|mimes:pdf,doc,docx,jpg,png,xlsx,xls,dwg,zip|max:20480',
            'category' => 'nullable|string|max:50',
            'status' => 'nullable|string|in:uploaded,under_review,awaiting_signature,legally_binding',
            'target_role' => 'nullable|string|in:structural,mep,architect',
            'version_label' => 'nullable|string|max:50',
        ]);

        return DB::transaction(function () use ($project, $request) {
            $file = $request->file('file');
            $path = $file->store('project_documents', 'public');

            $document = $project->documents()->create([
                'uploader_id' => Auth::id(),
                'file_name' => $file->getClientOriginalName(),
                'file_path' => $path,
                'file_type' => $file->extension(),
                'category' => $request->category ?? 'general',
                'status' => $request->status ?? 'uploaded',
                'target_role' => $request->target_role,
                'version_label' => $request->version_label,
            ]);

            $this->logActivity($project, 'document_uploaded', "Uploaded: {$file->getClientOriginalName()}" . ($request->version_label ? " ({$request->version_label})" : ""));

            return response()->json(['data' => $document->load('uploader')]);
        });
    }

    public function destroy(Project $project, ProjectDocument $document)
    {
        if ($document->uploader_id !== Auth::id() && $project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $name = $document->file_name;
        Storage::disk('public')->delete($document->file_path);
        $document->delete();
        
        $this->logActivity($project, 'document_deleted', "Removed: {$name}");

        return response()->json(['message' => 'Deleted']);
    }

    public function verify(Project $project, ProjectDocument $document)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id === $user->id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Only owner or PM can verify documents.'], 403);
        }

        $document->update(['status' => 'verified']);
        
        $this->logActivity($project, 'document_verified', "Verified document: {$document->file_name}");

        return response()->json(['message' => 'Document verified', 'data' => $document]);
    }


    private function logActivity(Project $project, string $action, string $details): void
    {
        ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => $action,
            'details' => $details,
        ]);
    }
}
