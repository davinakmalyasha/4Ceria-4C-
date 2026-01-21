<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\BidKontraktor;
use App\Models\Project;
use Illuminate\Support\Facades\Auth;

class BidKontraktorController extends Controller
{
    public function index()
    {
        if (view()->exists('users-page.kontraktor-bidding')) {
            return view('users-page.kontraktor-bidding');
        } else {
            return "View tidak ditemukan!";
        }
    }
    
public function formBid(Project $project)
{
    $kontraktor = Auth::user()->kontraktor;
    return view('users-page.formulirBidKontraktor', compact('project', 'kontraktor'));
}
    public function store(Request $request, $projectId)
    {  
       $request->validate([
        'price' => 'required|numeric',
        'waktu_pengerjaan' => 'required|integer|min:1',
        'catatan' => 'nullable|string|max:1000',
        'proposal' => 'required|file|mimes:pdf,jpg,png|max:2048', 
    ]);
    
    $proposalPath = $request->file('proposal')->store('proposals', 'public');

        $project = Project::findOrFail($projectId);

        if ($project->status_kontraktor !== 'posted') {
            return back()->with('error', 'Bidding kontraktor belum dibuka untuk proyek ini.');
        }
       
        BidKontraktor::create([
            'project_id' => $project->id,
            'kontraktor_id' => Auth::user()->kontraktor->id,
            'price' => $request->price,
            'waktu_pengerjaan' => $request->waktu_pengerjaan,
            'catatan' => $request->catatan,
            'proposal' => $proposalPath, 
        ]);
            
        if ($project->status_kontraktor === 'posted') {
            $project->update(['status_kontraktor' => 'bidding_ongoing']);
        }
        session()->flash('success', 'Berhasil ngebid, Anda akan dihubungi jika diterima.');
        return redirect()->route('kontraktor.bidding')->with('success', 'Bid berhasil dikirim!');
        
    }

    public function selectBid($projectId, $kontraktorId)
{
    $project = Project::findOrFail($projectId);

    if (Auth::id() !== $project->user_id) {
        return back()->with('error', 'Anda tidak memiliki izin untuk memilih kontraktor.');
    }

    $project->selected_kontraktor_id = $kontraktorId;
    $project->status = 'accepted_kontraktor'; 
    $project->save();

    BidKontraktor::where('project_id', $projectId)
        ->where('kontraktor_id', $kontraktorId)
        ->update(['status' => 'accepted']);

    BidKontraktor::where('project_id', $projectId)
        ->where('kontraktor_id', '!=', $kontraktorId)
        ->update(['status' => 'rejected']);

    return redirect()->route('forum.project')->with('success', 'Kontraktor berhasil dipilih!');
}

    


    public function showBids($projectId)
    {
        $project = Project::with('bidsKontraktor.kontraktor')->findOrFail($projectId);
        $kontraktors = $project->bidsKontraktor->map(function ($bid) {
            return $bid->kontraktor;
        });

        return view('users-page.kontraktor-bidding', compact('project', 'kontraktors'));
    }
    
}
