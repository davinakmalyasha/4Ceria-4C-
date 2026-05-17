<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProvinceController extends Controller
{
    public function searchProvince(Request $request)
    {
        $query = $request->get('query', '');

        // Ambil data dari tabel 'provinces' berdasarkan nama yang cocok
        $provinces = DB::table('provinces')
            ->where('name', 'like', '%'.$query.'%')
            ->pluck('name'); // Ambil hanya kolom 'name'

        return response()->json($provinces); // Kembalikan data dalam format JSON
    }
}
