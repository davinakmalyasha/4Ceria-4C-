<?php

namespace App\Http\Controllers;
use App\Models\Project;
use App\Models\ArsitekRating;
use App\Models\Arsitek;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;

class ArsitekRatingController extends Controller
{
   

public function showForm($project_id)
{
    $project = Project::with('bidsArsitek')->findOrFail($project_id);

    $bidArsitek = $project->bidsArsitek()->where('status', 'accepted')->first();
    if (!$bidArsitek) {
        return back()->with('error', 'Tidak ada arsitek terpilih.');
    }

    $existing = ArsitekRating::where('project_id', $project_id)->where('user_id', Auth::id())->first();
    if ($existing) {
        return redirect()->route('user.project.riwayat')->with('error', 'Rating sudah pernah diberikan.');
    }

    return view('users-page.form-rating', [
        'project' => $project,
        'arsitek' => $bidArsitek->arsitek,
    ]);
}

public function submit(Request $request, $project_id)
{
    $request->validate([
        'rating' => 'required|integer|min:1|max:5',
        'komentar' => 'nullable|string|max:1000',
    ]);

    $project = Project::with('bidsArsitek')->findOrFail($project_id);
    $bidArsitek = $project->bidsArsitek()->where('status', 'accepted')->first();

    if (!$bidArsitek) {
        return back()->with('error', 'Tidak ada arsitek terpilih.');
    }

    $existing = ArsitekRating::where('project_id', $project_id)->where('user_id', Auth::id())->first();
    if ($existing) {
        return redirect()->route('user.project.riwayat')->with('error', 'Rating sudah ada.');
    }

    ArsitekRating::create([
        'user_id' => Auth::id(),
        'arsitek_id' => $bidArsitek->arsitek_id,
        'project_id' => $project_id,
        'rating' => $request->rating,
        'komentar' => $request->komentar,
    ]);

    return redirect()->route('user.project.riwayat')->with('success', 'Rating berhasil diberikan!');
}

}
