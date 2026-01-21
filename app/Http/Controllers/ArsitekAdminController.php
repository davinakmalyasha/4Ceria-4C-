<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\Arsitek;

class ArsitekAdminController extends Controller
{
    public function index()
{
    if (!Auth::check()) {
        return redirect()->route('login');
    }

    $arsiteks = Arsitek::withAvg('ratings', 'rating')
                       ->withCount('ratings')
                       ->get();

    return view('users-page.adminArsitek', [
        'arsitek' => Auth::user(),
        'arsiteks' => $arsiteks,
    ]);
}

 
    public function bidding()
    {
        $projects = Project::all(); 
        return view('users-page.arsitek-bidding', compact('projects'));
    }
   
    public function update(Request $request)
    {
        $request->validate([
            'nama' => 'required|string|max:255',
            'no_telp' => 'nullable|string|max:20',
            'rate_harga' => 'nullable|numeric',
            'spesialisasi' => 'nullable|array',
            'spesialisasi.*' => 'string|max:255', 
            'deskripsi' => 'nullable|string',
            'lokasi' => 'nullable|string|max:255',
            'pengalaman_tahun' => 'nullable|integer',
            'pic' => 'nullable|image|mimes:jpg,jpeg,png|max:2048',
        ]);
    
        $arsitek = Auth::user()->arsitek;
 
        $arsitek->update([
            'nama' => $request->nama,
            'no_telp' => $request->no_telp,
            'rate_harga' => $request->rate_harga,
            'spesialisasi' => implode(',', $request->spesialisasi ?? []),
            'deskripsi' => $request->deskripsi,
            'lokasi' => $request->lokasi,
            'pengalaman_tahun' => $request->pengalaman_tahun,
        ]);
    
       
        if ($request->hasFile('pic')) {
            $user = Auth::user();
    
           
            $path = $request->file('pic')->store('profile_pics', 'public');
            $user->pic = $path;
            $user->save();
        }
    
        return redirect()->back()->with('success', 'Profil berhasil diperbarui.');
    }
    


}
