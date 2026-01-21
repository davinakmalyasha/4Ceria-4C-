<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\KontraktorRating;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;

class KontraktorRatingController extends Controller
{
    public function showForm($project_id)
    {
        $project = Project::with('bidsKontraktor')->findOrFail($project_id);

        $bidKontraktor = $project->bidsKontraktor()->where('status', 'accepted')->first();
        if (!$bidKontraktor) {
            return back()->with('error', 'Tidak ada kontraktor terpilih.');
        }

        $existing = KontraktorRating::where('project_id', $project_id)
            ->where('user_id', Auth::id())->first();

        if ($existing) {
            return redirect()->route('user.project.riwayat')->with('error', 'Rating sudah pernah diberikan.');
        }

        return view('users-page.form-rating', [
            'project' => $project,
            'kontraktor' => $bidKontraktor->kontraktor,
        ]);
    }

    public function submit(Request $request, $project_id)
    {
        $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'komentar' => 'nullable|string|max:1000',
        ]);

        $project = Project::with('bidsKontraktor')->findOrFail($project_id);
        $bidKontraktor = $project->bidsKontraktor()->where('status', 'accepted')->first();

        if (!$bidKontraktor) {
            return back()->with('error', 'Tidak ada kontraktor terpilih.');
        }

        $existing = KontraktorRating::where('project_id', $project_id)
            ->where('user_id', Auth::id())->first();

        if ($existing) {
            return redirect()->route('user.project.riwayat')->with('error', 'Rating sudah ada.');
        }

        KontraktorRating::create([
            'user_id' => Auth::id(),
            'kontraktor_id' => $bidKontraktor->kontraktor_id,
            'project_id' => $project_id,
            'rating' => $request->rating,
            'komentar' => $request->komentar,
        ]);

        return redirect()->route('user.project.riwayat')->with('success', 'Rating berhasil diberikan!');
    }
}
