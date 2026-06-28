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
    public function index(Request $request, Project $project)
    {
        $query = $project->documents()->with('uploader');
        if ($request->has('target_role')) {
            $query->where('target_role', $request->target_role);
        }
        return response()->json(['data' => $query->get()]);
    }

    public function store(Request $request, Project $project)
    {
        $validated = $request->validate([
            'file' => 'required|file|mimes:pdf,doc,docx,jpg,png,xlsx,xls,dwg,zip|max:20480',
            'category' => 'nullable|string|max:50',
            'status' => 'nullable|string|in:uploaded,under_review,awaiting_signature,legally_binding',
            'target_role' => 'nullable|string|in:structural,mep,architect,contractor,notary,interior,pm,civil,mechanical,electrical,plumbing,roofing,finishing,general',
            'version_label' => 'nullable|string|max:50',
            'parent_id' => 'nullable|integer|exists:project_documents,id',
            'title' => 'nullable|string|max:255',
            'description' => 'nullable|string',
        ]);

        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        $isPM = $user->role_type === 'project_manager' && $project->pm_id === $user->id;
        $isHiredPro = false;
        if ($user->role_type === 'arsitek' && $project->selected_arsitek_id === $user->arsitek?->id) $isHiredPro = true;
        if ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id === $user->kontraktor?->id) $isHiredPro = true;
        if ($user->role_type === 'notaris' && $project->selected_notaris_id === $user->notaris_profile?->id) $isHiredPro = true;
        if ($user->role_type === 'interior' && $project->selected_interior_id === $user->interior_profile?->id) $isHiredPro = true;
        if ($user->role_type === 'structural' && $project->structural_id === $user->structural_engineer?->id) $isHiredPro = true;
        if ($user->role_type === 'mep' && $project->mep_id === $user->mep_engineer?->id) $isHiredPro = true;
        
        $isSubPro = DB::table('project_sub_professionals')
            ->where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();

        if (!$isOwner && !$isPM && !$isHiredPro && !$isSubPro) {
            return response()->json(['message' => 'Unauthorized. You must be assigned to this project to upload documents.'], 403);
        }

        $parentId = $validated['parent_id'] ?? null;
        $category = $validated['category'] ?? 'general';
        $targetRole = $validated['target_role'] ?? null;
        $version = 1;

        if ($parentId) {
            $parent = ProjectDocument::findOrFail($parentId);
            if ($parent->project_id !== $project->id) {
                return response()->json(['message' => 'Invalid parent document.'], 403);
            }
            $category = $parent->category;
            $targetRole = $parent->target_role;
            $maxVersion = ProjectDocument::where('parent_id', $parent->id)->orWhere('id', $parent->id)->max('version') ?? 1;
            $version = $maxVersion + 1;
        }

        $file = $request->file('file');
        $path = $file->store('project_documents', 'public');

        $document = DB::transaction(function () use ($project, $validated, $category, $targetRole, $parentId, $version, $file, $path) {
            $fileName = $validated['title'] ?? $file->getClientOriginalName();
            $document = $project->documents()->create([
                'uploader_id' => Auth::id(),
                'parent_id' => $parentId,
                'version' => $version,
                'file_name' => $fileName,
                'description' => $validated['description'] ?? null,
                'file_path' => $path,
                'file_type' => $file->extension(),
                'category' => $category,
                'status' => $validated['status'] ?? 'uploaded',
                'target_role' => $targetRole,
                'version_label' => $validated['version_label'] ?? null,
            ]);

            $this->logActivity($project, 'document_uploaded', "Uploaded: {$fileName} (v{$version})" . (isset($validated['version_label']) ? " ({$validated['version_label']})" : ""));

            return $document;
        });

        return response()->json(['data' => $document->load('uploader')]);
    }

    public function update(Request $request, Project $project, ProjectDocument $document)
    {
        if ($document->uploader_id !== Auth::id() && $project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $isLocked = ($document->status === 'verified' || $document->status === 'approved');
        if ($isLocked) {
            return response()->json(['message' => 'Cannot modify a verified or approved document.'], 403);
        }

        $validated = $request->validate([
            'file_name' => 'required|string|max:255',
            'version_label' => 'nullable|string|max:255',
        ]);

        $document->update($validated);

        return response()->json(['data' => $document->load('uploader')]);
    }

    public function destroy(Project $project, ProjectDocument $document)
    {
        if ($document->uploader_id !== Auth::id() && $project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $isLocked = ($document->status === 'verified' || $document->status === 'approved');
        if ($isLocked) {
            return response()->json(['message' => 'Cannot delete a verified or approved document.'], 403);
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
