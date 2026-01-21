<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Project;
use Illuminate\Support\Facades\Auth;
use App\Models\Spesialisasi;
use App\Models\RiwayatProject;

class ProjectController extends Controller
{
   public function index()
{
    $projects = Project::with(['bidsArsitek', 'bidsKontraktor'])
        ->where('user_id', Auth::id())
        ->where('status', '!=', 'completed') 
        ->get();

    return view('users-page.forumProject', compact('projects'));
}

public function formPostProject()
{
    $spesialisasis = Spesialisasi::all(); 
    return view('users-page.FormForumProject', compact('spesialisasis'));
}
    

    public function show($id) {
        $project = Project::with('bidsArsitek', 'bidsKontraktor')->findOrFail($id);
        return view('users-page.projectDetail', compact('project'));
    }

    public function store(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'budget' => 'required|numeric|min:0',
            'lokasi' => 'required|string|max:255',
            'jenis_proyek' => 'required|string|in:umum,fondasi,struktur,dinding,atap,lantai,ventilasi,listrik',
            'deadline' => 'nullable|date',
            'attachment' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:2048',
        ]);
     
        $data = [
            'user_id' => Auth::id(),
            'title' => $request->title,
            'description' => $request->description,
            'budget' => $request->budget,
            'lokasi' => $request->lokasi,
            'jenis_proyek' => $request->jenis_proyek,
            'deadline' => $request->deadline,
            'status' => 'open',
        ];
    
    
        if ($request->hasFile('attachment')) {
            $path = $request->file('attachment')->store('project_attachments', 'public');
            $data['attachment'] = $path;
        }
       

    
        Project::create($data);
    
        return back()->with('success', 'Proyek berhasil dibuat!');
    }
    public function edit($id)
    {
        $project = Project::findOrFail($id);
        if ($project->user_id !== Auth::id()) {
            return back()->with('error', 'Anda tidak bisa mengedit proyek ini.');
        }
    
        return view('users-page.editProject', compact('project'));
    }
    
    public function update(Request $request, $id)
{
    $project = Project::findOrFail($id);

    $request->validate([
        'title' => 'required|string|max:255',
        'description' => 'required|string',
        'budget' => 'required|numeric|min:0',
        'deadline' => 'required|date',
        'attachment' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:2048',
    ]);

    $data = $request->only(['title', 'description', 'budget', 'deadline']);

    if ($request->hasFile('attachment')) {
        $path = $request->file('attachment')->store('project_attachments', 'public');
        $data['attachment'] = $path;
    }

    $project->update($data);

    return redirect()->route('forum.project')->with('success', 'Proyek berhasil diperbarui!');
}

    
    public function destroy($id)
    {
        $project = Project::findOrFail($id);
        if ($project->user_id !== Auth::id()) {
            return back()->with('error', 'Anda tidak bisa menghapus proyek ini.');
        }
    
        $project->delete();
        return back()->with('success', 'Proyek berhasil dihapus!');
    }
    
    public function updateStatusKontraktor(Request $request, $projectId)
    {
        $project = Project::findOrFail($projectId);
    
        if (Auth::id() !== $project->user_id) {
            return back()->with('error', 'Anda tidak memiliki izin untuk mengubah status proyek ini.');
        }
    
        if ($request->status_kontraktor === 'posted') {
            $project->status_kontraktor = 'posted';
        } elseif ($request->status_kontraktor === 'skip') {
            $project->status_kontraktor = 'skip';
        } else {
            return back()->with('error', 'Status tidak valid.');
        }
    
        $project->save(); 
    
        return redirect()->route('forum.project')->with('success', 'Status proyek diperbarui!');
    }
public function markCompleted($id)
{
    $project = Project::findOrFail($id);
    $project->status = 'completed';
    $project->save();
    $existing = RiwayatProject::where('project_id', $project->id)->first();
    if (!$existing) {
        RiwayatProject::create([
            'user_id' => $project->user_id,
            'arsitek_id' => $project->selected_arsitek_id,
            'kontraktor_id' => $project->selected_kontraktor_id,
            'project_id' => $project->id,
            'selesai_pada' => now(),
            'keterangan' => 'Proyek selesai dengan status complete',
        ]);
    }

    return redirect()->back()->with('success', 'Proyek telah diselesaikan.');
}
public function riwayat()
{
    $riwayats = RiwayatProject::with(['project', 'user', 'rating'])
        ->where('user_id', Auth::id())
        ->latest('selesai_pada')
        ->get();

    return view('users-page.project-riwayat', compact('riwayats'));
}


}



