<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\StickyNote;
use App\Models\Project;
use Illuminate\Support\Facades\Auth;

class StickyNoteController extends Controller
{
    public function index(Request $request, Project $project)
    {
        $query = $project->stickyNotes()->where('user_id', Auth::id());
        
        if ($request->has('phase_context')) {
            $query->where('phase_context', $request->phase_context);
        }

        return response()->json(['data' => $query->orderBy('position_index')->get()]);
    }

    public function store(Request $request, Project $project)
    {
        $validated = $request->validate([
            'phase_context' => 'nullable|string|max:100',
            'title' => 'nullable|string|max:255',
            'content' => 'nullable|string',
            'position_index' => 'nullable|integer',
        ]);

        $note = $project->stickyNotes()->create([
            'user_id' => Auth::id(),
            'phase_context' => $validated['phase_context'] ?? null,
            'title' => $validated['title'] ?? '',
            'content' => $validated['content'] ?? '',
            'position_index' => $validated['position_index'] ?? 0,
        ]);

        return response()->json(['data' => $note]);
    }

    public function update(Request $request, Project $project, StickyNote $stickyNote)
    {
        if ($stickyNote->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'nullable|string|max:255',
            'content' => 'nullable|string',
            'position_index' => 'nullable|integer',
        ]);

        $stickyNote->update($validated);

        return response()->json(['data' => $stickyNote]);
    }

    public function destroy(Project $project, StickyNote $stickyNote)
    {
        if ($stickyNote->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $stickyNote->delete();

        return response()->json(['message' => 'Deleted successfully']);
    }
}
