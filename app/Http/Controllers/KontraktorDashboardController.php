<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Project;
use Illuminate\Support\Facades\Auth;
use App\Models\RiwayatProject;
use App\Models\Kontraktor;
class KontraktorDashboardController extends Controller
{
    public function index()
{
    $spesialisasi = \App\Models\Spesialisasi::all();
    $kontraktors = Kontraktor::withAvg('ratings', 'rating')->withCount('ratings')->get();


   return view('users-page.adminKontraktor', [
    'spesialisasi' => $spesialisasi,
    'kontraktors' => $kontraktors,
    'kontraktor' => Kontraktor::where('user_id', Auth::id())->first(), 
]);

}

    
public function bidding()
{
    $kontraktor = Auth::user()->kontraktor;

    $spesialisasiNames = $kontraktor->spesialisasis->pluck('nama')->map(fn($val) => strtolower($val))->toArray();

    $projectsQuery = Project::whereNotNull('selected_arsitek_id');

    if (!in_array('umum', $spesialisasiNames)) {
        $projectsQuery->whereIn('jenis_proyek', $spesialisasiNames);
    }

    $projects = $projectsQuery->get();
    return view('users-page.forumKontraktor', compact('projects'));
    
}
    public function update(Request $request)
    {
        $request->validate([
            'nama' => 'required|string|max:255',
            'no_telepon' => 'nullable|regex:/^[0-9]+$/|max:20', 
            'alamat' => 'nullable|string|max:255',
            'jenis' => 'nullable|string|max:255',
            'nama_perusahaan' => 'nullable|string|max:255',
            'npwp' => 'nullable|string|max:255',
            'siup' => 'nullable|string|max:255',
            'pengalaman' => 'nullable|integer|min:0',
            'pic' => 'nullable|image|mimes:jpg,jpeg,png|max:2048',

            'spesialisasi' => 'sometimes|array',
            'spesialisasi.*' => 'exists:spesialisasi,id',
        ]);
    
    
        $kontraktor = Auth::user()->kontraktor;
        if (!$kontraktor) {
    return redirect()->route('some.route')->with('error', 'Data kontraktor belum lengkap. Harap lengkapi terlebih dahulu.');
}
        $kontraktor->update([
            'nama' => $request->nama,
            'no_telepon' => $request->no_telepon,
            'alamat' => $request->alamat,
            'jenis' => $request->jenis,
            'nama_perusahaan' => $request->nama_perusahaan,
            'npwp' => $request->npwp,
            'siup' => $request->siup,
            'pengalaman' => $request->pengalaman,
        ]);
    
        if ($request->has('spesialisasi')) {
            $kontraktor->spesialisasis()->sync($request->spesialisasi);
        }

        if ($request->hasFile('pic')) {
            $user = Auth::user();
    
            
            $path = $request->file('pic')->store('profile_pics', 'public');
            $user->pic = $path;
            $user->save();
        }
        $user = Auth::user();
        $user->email = $request->email;
        $user->save();
    
        return redirect()->back()->with('success', 'Profil berhasil diperbarui.');
    }
 public function riwayatProject()
{
    $kontraktorId = Auth::user()->kontraktor->id;

    $riwayats = RiwayatProject::with([
            'project.kontraktor',
            'project.kontraktor.spesialisasis',
            'user',
            'arsitekRating',
            'kontraktorRating'
        ])
        ->where('kontraktor_id', $kontraktorId)
        ->orderByDesc('selesai_pada')
        ->get();

    return view('users-page.riwayatKontraktorProject', compact('riwayats'));
}

}
