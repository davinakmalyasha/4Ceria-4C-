<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class CityController extends Controller
{
    public function searchCity(Request $request)
    {
        $query = $request->get('query', '');

        $allCities = Cache::rememberForever('all_cities_list', function () {
            return DB::table('regions')
                ->where('type', 'kota')
                ->pluck('name');
        });

        if ($query !== '') {
            $filtered = $allCities->filter(function ($name) use ($query) {
                return stripos($name, $query) !== false;
            })->values();
        } else {
            $filtered = $allCities;
        }

        return response()->json($filtered);
    }
}
