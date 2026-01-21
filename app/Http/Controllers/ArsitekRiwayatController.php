<?php

namespace App\Http\Controllers;
use App\Models\RiwayatProject;

use Illuminate\Http\Request;

class ArsitekRiwayatController extends Controller
{
    public function index()
{
    $arsitek = auth()->user()->arsitek;
    $riwayats = RiwayatProject::with([
    'project.arsitek',
    'project.kontraktor.spesialisasis',
    'user',
    'arsitekRating',
    'kontraktorRating'
])
->where('arsitek_id', $arsitek->id)
->orderByDesc('selesai_pada')
->get();


    return view('users-page.riwayat-project', compact('riwayats'));
}
}
