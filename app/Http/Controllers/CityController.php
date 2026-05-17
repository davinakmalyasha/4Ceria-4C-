<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CityController extends Controller
{
    public function searchCity(Request $request)
    {
        $query = $request->get('query', '');

        // Pastikan nama kolom 'name' dan tipe kota sesuai dengan data yang ada di tabel 'regions'
        $cities = DB::table('regions')
            ->where('name', 'like', '%'.$query.'%')
            ->where('type', 'kota') // Jika ada tipe kota, pastikan filter ini sesuai
            ->pluck('name');

        return response()->json($cities); // Kembalikan hasil dalam format JSON
    }
}
