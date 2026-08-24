<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class ProvinceController extends Controller
{
    public function searchProvince(Request $request)
    {
        $query = $request->get('query', '');

        $allProvinces = Cache::rememberForever('all_provinces_list', function () {
            return DB::table('provinces')->pluck('name');
        });

        if ($query !== '') {
            $filtered = $allProvinces->filter(function ($name) use ($query) {
                return stripos($name, $query) !== false;
            })->values();
        } else {
            $filtered = $allProvinces;
        }

        return response()->json($filtered);
    }
}
