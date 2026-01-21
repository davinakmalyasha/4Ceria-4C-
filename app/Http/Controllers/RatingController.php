<?php

namespace App\Http\Controllers;
use App\Models\RiwayatProject;
use App\Models\Project;
use Illuminate\Http\Request;
use App\Models\ArsitekRating;
use App\Models\KontraktorRating;

class RatingController extends Controller
{
   public function showForm($project_id, $tipe)
{
    $project = Project::findOrFail($project_id);
    $riwayat = RiwayatProject::where('project_id', $project_id)->firstOrFail();

    if ($tipe === 'arsitek') {
        $target = $riwayat->arsitek;
        $rating = $riwayat->arsitekRating;
    } elseif ($tipe === 'kontraktor') {
        $target = $riwayat->kontraktor;
        $rating = $riwayat->kontraktorRating;
    } else {
        abort(404);
    }

    return view('users-page.form-rating', [
        'project' => $project,
        'tipe' => $tipe,
        'target' => $target,
        'rating' => $rating
    ]);
}
public function submit(Request $request, $project_id)
{
    $request->validate([
        'rating' => 'required|integer|min:1|max:5',
        'komentar' => 'nullable|string',
        'tipe' => 'required|in:arsitek,kontraktor',
    ]);

    $riwayat = RiwayatProject::where('project_id', $project_id)->firstOrFail();

    if ($request->tipe === 'arsitek') {
        $existing = ArsitekRating::where('project_id', $riwayat->project_id)->first();

        if (!$existing) {
            ArsitekRating::create([
               'project_id' => $riwayat->project_id,
                'arsitek_id' => $riwayat->arsitek_id,
                'user_id' => auth()->id(),
                'rating' => $request->rating,
                'komentar' => $request->komentar,
            ]);
        }
    } elseif ($request->tipe === 'kontraktor') {
        $existing = KontraktorRating::where('project_id', $riwayat->id)->first();
        if (!$existing) {
            KontraktorRating::create([
               'project_id' => $riwayat->project_id,
                'kontraktor_id' => $riwayat->kontraktor_id,
                'user_id' => auth()->id(),
                'rating' => $request->rating,
                'komentar' => $request->komentar,
            ]);
        }
    }

    return redirect()->route('user.project.riwayat')->with('success', 'Rating berhasil disimpan.');
}

}
