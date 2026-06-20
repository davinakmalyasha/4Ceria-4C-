<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class GeocodeController extends Controller
{
    /**
     * Reverse geocode coordinates.
     */
    public function reverse(Request $request)
    {
        $request->validate([
            'lat' => 'required|numeric',
            'lng' => 'required|numeric',
        ]);

        $lat = $request->input('lat');
        $lng = $request->input('lng');

        $cacheKey = "geocode:reverse:lat:{$lat}:lng:{$lng}";

        $data = Cache::remember($cacheKey, 2592000, function () use ($lat, $lng) { // 30 days
            $response = Http::withHeaders([
                'User-Agent' => '4Ceria-App-Backend'
            ])->timeout(5)->get('https://nominatim.openstreetmap.org/reverse', [
                'format' => 'json',
                'lat' => $lat,
                'lon' => $lng,
                'addressdetails' => 1,
                'accept-language' => 'id',
            ]);

            return $response->successful() ? $response->json() : null;
        });

        if (!$data) {
            return response()->json(['message' => 'Geocoding service unavailable'], 503);
        }

        return response()->json($data);
    }

    /**
     * Search address or place.
     */
    public function search(Request $request)
    {
        $request->validate([
            'q' => 'required|string|max:255',
        ]);

        $query = $request->input('q');
        $cacheKey = "geocode:search:" . md5($query);

        $data = Cache::remember($cacheKey, 2592000, function () use ($query) { // 30 days
            $response = Http::withHeaders([
                'User-Agent' => '4Ceria-App-Backend'
            ])->timeout(5)->get('https://nominatim.openstreetmap.org/search', [
                'format' => 'json',
                'q' => $query,
                'limit' => 5,
                'countrycodes' => 'id',
            ]);

            return $response->successful() ? $response->json() : null;
        });

        if ($data === null) {
            return response()->json(['message' => 'Geocoding service unavailable'], 503);
        }

        return response()->json($data);
    }
}
