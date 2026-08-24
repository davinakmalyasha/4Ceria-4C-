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
            'lat' => 'required|numeric|between:-90,90',
            'lng' => 'required|numeric|between:-180,180',
        ]);

        // Round to 4 decimals (~11 m precision) — bounds Redis key cardinality
        // and prevents cache-flooding via scripted unique coordinates.
        $lat = round((float) $request->input('lat'), 4);
        $lng = round((float) $request->input('lng'), 4);

        $cacheKey = "geocode:reverse:lat:{$lat}:lng:{$lng}";

        // Cache misses are short-lived so a transient Nominatim outage is not
        // poisoned into the cache for 30 days.
        $data = Cache::remember($cacheKey, 300, function () use ($lat, $lng) {
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

        // Promote successful lookups to the long-TTL key.
        Cache::put($cacheKey, $data, 2592000); // 30 days

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

        $query = trim($request->input('q'));
        $cacheKey = "geocode:search:" . md5($query);

        // Short TTL on failures; successful searches are promoted below.
        $data = Cache::remember($cacheKey, 300, function () use ($query) {
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

        Cache::put($cacheKey, $data, 2592000); // 30 days

        return response()->json($data);
    }
}
