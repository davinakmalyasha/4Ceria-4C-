<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Arsitek; 

class ArsitekController extends Controller
{
   public function index(Request $request)
{
    $arsiteks = Arsitek::all(); 
    $query = Arsitek::with('user');

    if ($request->lokasi) {
        $query->where('lokasi', 'like', '%' . $request->lokasi . '%');
    }

    if ($request->spesialisasi) {
        $query->where('spesialisasi', 'like', '%' . $request->spesialisasi . '%');
    }
    
    switch ($request->sort) {
        case 'rate_asc':
            $query->orderBy('rate_harga', 'asc');
            break;
        case 'rate_desc':
            $query->orderBy('rate_harga', 'desc');
            break;
        case 'pengalaman_desc':
            $query->orderBy('pengalaman_tahun', 'desc');
            break;
    }
    if (is_numeric($request->min_rate)) {
        $query->where('rate_harga', '>=', (int)$request->min_rate);
    }
    
    if (is_numeric($request->max_rate)) {
        $query->where('rate_harga', '<=', (int)$request->max_rate);
    }
    
    $arsiteks = $query->get();

    return view('users-page.house.arsitek', compact('arsiteks'));
}


public function show($id) 
{
    $arsitek = Arsitek::with(['user', 'projects'])->findOrFail($id);

    return view('users-page.detailArsitek', compact('arsitek'));
}



}
