<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Favorite;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FavoriteController extends Controller
{
    /**
     * Single source of truth for favoritable aliases. AppServiceProvider's
     * morph map must mirror these keys.
     */
    private const TYPES = [
        'house' => \App\Models\House::class,
        'arsitek' => \App\Models\Arsitek::class,
        'kontraktor' => \App\Models\Kontraktor::class,
        'interior' => \App\Models\InteriorProfile::class,
        'notaris' => \App\Models\NotarisProfile::class,
        'project_manager' => \App\Models\ProjectManager::class,
        'structural' => \App\Models\StructuralEngineer::class,
        'mep' => \App\Models\MepEngineer::class,
        'material' => \App\Models\Material::class,
    ];

    private const PRO_TYPES = ['arsitek', 'kontraktor', 'interior', 'notaris', 'project_manager', 'structural', 'mep'];

    public function index()
    {
        $grouped = Favorite::where('user_id', Auth::id())
            ->get()
            ->groupBy('favoritable_type')
            ->map(fn ($rows) => $rows->pluck('favoritable_id')->map(fn ($id) => (int) $id)->values())
            ->toArray();

        return response()->json([
            'data' => $grouped,
            'items' => $this->resolveItems($grouped),
        ]);
    }

    public function toggle(Request $request)
    {
        $validated = $request->validate([
            'favoritable_type' => 'required|string|in:' . implode(',', array_keys(self::TYPES)),
            'favoritable_id' => 'required|integer|min:1',
        ]);

        $userId = Auth::id();
        $type = $validated['favoritable_type'];
        $id = (int) $validated['favoritable_id'];

        $existing = Favorite::where('user_id', $userId)
            ->where('favoritable_type', $type)
            ->where('favoritable_id', $id)
            ->first();

        if ($existing) {
            $existing->delete();
            return response()->json(['favorited' => false, 'type' => $type, 'id' => $id]);
        }

        // Refuse orphan references.
        if (!self::TYPES[$type]::whereKey($id)->exists()) {
            return response()->json(['message' => 'Item not found.'], 404);
        }

        Favorite::create([
            'user_id' => $userId,
            'favoritable_type' => $type,
            'favoritable_id' => $id,
        ]);

        return response()->json(['favorited' => true, 'type' => $type, 'id' => $id], 201);
    }

    /**
     * Merge guest (localStorage) favorites after login. Duplicates are
     * ignored via the unique index.
     */
    public function merge(Request $request)
    {
        $validated = $request->validate([
            'items' => 'required|array|max:500',
            'items.*.type' => 'required|string|in:' . implode(',', array_keys(self::TYPES)),
            'items.*.id' => 'required|integer|min:1',
        ]);

        $now = now();
        $rows = [];
        foreach ($validated['items'] as $item) {
            $rows[] = [
                'user_id' => Auth::id(),
                'favoritable_type' => $item['type'],
                'favoritable_id' => (int) $item['id'],
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        Favorite::insertOrIgnore($rows);

        return $this->index();
    }

    public function destroy(Favorite $favorite)
    {
        if ((int) $favorite->user_id !== (int) Auth::id()) {
            abort(403, 'Unauthorized.');
        }

        $favorite->delete();

        return response()->json(['message' => 'Removed from favorites.']);
    }

    /**
     * Resolve stored ids into light, self-only payloads (never PII/KYC).
     */
    private function resolveItems(array $grouped): array
    {
        $items = [];

        if (!empty($grouped['house'])) {
            $houses = \App\Models\House::whereIn('id', $grouped['house'])->with('housePic')->get();
            foreach ($houses as $house) {
                $cover = $house->housePic->first();
                $items['house'][] = [
                    'id' => $house->id,
                    'type' => 'house',
                    'title' => $house->name,
                    'subtitle' => trim(implode(', ', array_filter([$house->kab_kota, $house->province])), ', '),
                    'image' => $cover && $cover->dir ? asset('storage/' . $cover->dir) : null,
                    'price' => $house->price !== null ? (float) $house->price : null,
                ];
            }
        }

        foreach (self::PRO_TYPES as $type) {
            $ids = $grouped[$type] ?? [];
            if (empty($ids)) continue;

            $model = self::TYPES[$type];
            foreach ($model::whereIn('id', $ids)->get() as $profile) {
                $title = $type === 'kontraktor'
                    ? ($profile->nama_perusahaan ?: $profile->nama)
                    : $profile->nama;

                $items[$type][] = [
                    'id' => $profile->id,
                    'type' => $type,
                    'title' => $title,
                    'subtitle' => $profile->spesialisasi ?: $profile->lokasi,
                    'image' => $profile->foto ? asset('storage/' . $profile->foto) : null,
                    'price' => null,
                ];
            }
        }

        if (!empty($grouped['material'])) {
            foreach (\App\Models\Material::whereIn('id', $grouped['material'])->get() as $material) {
                $items['material'][] = [
                    'id' => $material->id,
                    'type' => 'material',
                    'title' => $material->name,
                    'subtitle' => trim(implode(' · ', array_filter([$material->category, $material->unit])), ' · '),
                    'image' => $material->image_path ? asset('storage/' . $material->image_path) : null,
                    'price' => (float) $material->price,
                ];
            }
        }

        return $items;
    }
}
