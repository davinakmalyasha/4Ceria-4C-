<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\RiwayatProject;
use App\Models\Spesialisasi;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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

    public function show($id)
    {
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
            'jenis_proyek' => 'required|string|in:umum,fondasi,struktur,dinding,atap,lantai,ventilasi,listrik,plumbing',
            'deadline' => 'nullable|date',
            'attachment' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:2048',
            'needed_phases' => 'nullable|string',
            'target_role' => 'nullable|string',
            'latitude' => 'nullable|string',
            'longitude' => 'nullable|string',
            'province' => 'nullable|string',
            'city' => 'nullable|string',
            'kecamatan' => 'nullable|string',
            'kelurahan' => 'nullable|string',
            'postal_code' => 'nullable|string',
            'street_name' => 'nullable|string',
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
            'target_role' => $request->target_role ?? 'both',
            'latitude' => $request->latitude,
            'longitude' => $request->longitude,
            'province' => $request->province,
            'city' => $request->city,
            'kecamatan' => $request->kecamatan,
            'kelurahan' => $request->kelurahan,
            'postal_code' => $request->postal_code,
            'street_name' => $request->street_name,
        ];

        if ($request->needed_phases) {
            $data['needed_phases'] = json_decode($request->needed_phases, true);
        }

        if ($request->hasFile('attachment')) {
            $path = $request->file('attachment')->store('project_attachments', 'public');
            $data['attachment'] = $path;
        }

        $project = Project::create($data);

        // Handle multi-image upload
        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                $path = $image->store('project_images', 'public');
                $project->images()->create(['image_path' => $path]);
            }
        }

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
        $project = Project::with([
            'bidsArsitek',
            'bidsKontraktor',
            'bidsNotaris',
            'bidsInterior',
            'bidsProjectManager',
            'bidsStructural',
            'bidsMep',
            'paymentTermins',
            'dailyLogs',
            'subProfessionals'
        ])->findOrFail($id);

        if ($project->user_id !== Auth::id()) {
            return back()->with('error', 'Anda tidak bisa menghapus proyek ini.');
        }

        // GATE 1: Active Hires Check
        $hasHiredProfessionals = $project->selected_arsitek_id
            || $project->selected_kontraktor_id
            || $project->selected_notaris_id
            || $project->selected_interior_id
            || $project->pm_id
            || $project->structural_id
            || $project->mep_id;

        if ($hasHiredProfessionals) {
            return back()->with('error', 'Proyek tidak bisa dihapus karena sudah ada profesional yang disewa. Silakan lakukan pengajuan Pembatalan Bersama (Mutual Termination).');
        }

        // GATE 2: Proof-of-Payment Financial Check (Paid or Verifying Termins)
        $hasFinancialTransactions = $project->paymentTermins()
            ->whereIn('status', ['paid', 'verifying'])
            ->exists();

        if ($hasFinancialTransactions) {
            return back()->with('error', 'Proyek tidak bisa dihapus karena terdapat transaksi pembayaran yang sudah diverifikasi atau sedang dalam proses verifikasi bukti transfer.');
        }

        // GATE 3: Work-in-Progress Check (Daily Logs or Active Subcontractors)
        $hasWorkProgress = $project->dailyLogs()->exists()
            || $project->subProfessionals()->where('status', 'active')->exists();

        if ($hasWorkProgress) {
            return back()->with('error', 'Proyek tidak bisa dihapus karena progress pembangunan lapangan sudah berjalan.');
        }

        // GATE 4 & 5: Pre-hire Clean-up & Soft Deletion
        \Illuminate\Support\Facades\DB::beginTransaction();
        try {
            // Cancel and archive all outstanding proposals
            $project->bidsArsitek()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsKontraktor()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsNotaris()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsInterior()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsProjectManager()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsStructural()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsMep()->where('status', 'pending')->update(['status' => 'cancelled']);

            // Soft delete the project to preserve audit trail
            $project->delete();

            \Illuminate\Support\Facades\DB::commit();
            return back()->with('success', 'Proyek dan semua bid pending berhasil dihapus dan diarsipkan.');
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\DB::rollBack();
            return back()->with('error', 'Gagal menghapus proyek: ' . $e->getMessage());
        }
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
        if (! $existing) {
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
