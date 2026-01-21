<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\BidArsitek;
use App\Models\Project;
use Illuminate\Support\Facades\Auth;

class BidArsitekController extends Controller
{
    public function index()
{
    if (view()->exists('users-page.arsitek-bidding')) {
        return view('users-page.arsitek-bidding');
    } else {
        return "View tidak ditemukan!";
    }
}


public function formBid(Project $project)
{
    $arsitek = Auth::user()->arsitek;

    $existingBid = BidArsitek::where('arsitek_id', $arsitek->id)
        ->where('project_id', $project->id)
        ->first();

    if ($existingBid) {
        return redirect()->route('arsitek.bidding')
            ->with('error', 'Anda sudah mengajukan bid untuk proyek ini.');
    }

    return view('users-page.formulirBidArsitek', compact('project', 'arsitek'));
}

    
public function store(Request $request, $projectId)
{  
    $request->validate([
        'price' => 'required|numeric|min:0',
        'waktu_pengerjaan' => 'required|integer|min:1',
        'catatan' => 'nullable|string|max:1000',
        'proposal' => 'required|file|mimes:pdf,jpg,png|max:2048',
    ]);
    $path = $request->file('proposal')->store('proposals', 'public');
    
    BidArsitek::create([
        'arsitek_id' => Auth::user()->arsitek->id, 
        'project_id' => $projectId,
        'price' => $request->price,
        'waktu_pengerjaan' => $request->waktu_pengerjaan,
        'catatan' => $request->catatan,
        'proposal' => $path, 
    ]);

    
    return redirect()->route('arsitek.bidding')->with('success', 'Bid berhasil dikirim!');
}
public function selectBid($projectId, $arsitekId)
{
    $project = Project::findOrFail($projectId);
    $project->selected_arsitek_id = $arsitekId;
    $project->save();

    BidArsitek::where('project_id', $projectId)
        ->where('arsitek_id', $arsitekId)
        ->update(['status' => 'accepted']);

    BidArsitek::where('project_id', $projectId)
        ->where('arsitek_id', '!=', $arsitekId)
        ->update(['status' => 'rejected']);

        $project->status = 'accepted_arsitek';
        $project->status_kontraktor = 'pending'; 
        $project->save();
        session()->flash('success', 'Berhasil ngebid, Anda akan dihubungi jika diterima.');
    return redirect()->back()->with('success', 'Arsitek berhasil dipilih!');
}

public function showBids($projectId)
{
    $project = Project::with('bidsArsitek.arsitek')->findOrFail($projectId);
    $arsiteks = $project->bidsArsitek->map(function ($bid) {
        return $bid->arsitek;
    });

    return view('users-page.arsitek-bidding', compact('project', 'arsiteks'));
}

public function myBids()
{
    $arsitek = Auth::user()->arsitek;

    $bids = BidArsitek::with(['project.user'])
        ->where('arsitek_id', $arsitek->id)
        ->get();

    return view('users-page.arsitek-bidding-status', compact('bids'));
}


}

