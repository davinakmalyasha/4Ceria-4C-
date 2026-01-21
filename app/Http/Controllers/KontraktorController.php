<?php

namespace App\Http\Controllers;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\Kontraktor;
use App\Models\PengajuanSpesialisasi;
use Illuminate\Support\Facades\Storage;
use App\Models\Spesialisasi;




class KontraktorController extends Controller
{
    public function index(Request $request)
    {
        $query = Kontraktor::with(['spesialisasis', 'user']);
    
        if ($request->lokasi) {
            $query->where('lokasi', 'like', '%' . $request->lokasi . '%');
        }
    
        if ($request->spesialisasi) {
            $query->whereHas('spesialisasis', function ($q) use ($request) {
                $q->where('nama', $request->spesialisasi);
            });
        }
    
        if ($request->pengalaman) {
            $query->where('pengalaman', '>=', $request->pengalaman);
        }
        if (is_numeric($request->min_rate)) {
            $query->where('rate_harga', '>=', (int)$request->min_rate);
        }
        
        if (is_numeric($request->max_rate)) {
            $query->where('rate_harga', '<=', (int)$request->max_rate);
        }
        
        $kontraktors = $query->get();
        $spesialisasis = Spesialisasi::all();
    
        $kontraktor = Kontraktor::with(['spesialisasis', 'pengajuanSpesialisasi.spesialisasi'])
            ->where('user_id', Auth::id())
            ->first();
    
        return view('users-page.kontraktor', compact('kontraktors', 'kontraktor', 'spesialisasis'));
    }
    

    
    public function show($id) 
    {
        $kontraktor = Kontraktor::findOrFail($id);
        return view('users-page.detailKontraktor', compact('kontraktor'));
    }  
    public function ajukanSpesialisasi(Request $request)
{
    $request->validate([
        'spesialisasi_id' => 'required|exists:spesialisasi,id',
        'file_sertifikat' => 'required|file|mimes:pdf,jpg,png|max:2048',
    ]);

    $path = $request->file('file_sertifikat')->store('bukti_spesialisasi', 'public');

    $kontraktor = Auth::user()->kontraktor;
 
    PengajuanSpesialisasi::create([
        
        'kontraktor_id' => $kontraktor->id,
        'spesialisasi_id' => $request->spesialisasi_id,
        'file_sertifikat' => $path,
        'status' => 'pending',
    ]);

    return back()->with('success', 'Pengajuan dikirim, menunggu persetujuan admin.');
}
}