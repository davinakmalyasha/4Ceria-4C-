<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreHouseRequest;
use App\Http\Requests\UpdateHouseRequest;
use App\Http\Resources\HouseResource;
use App\Models\House;
use App\Models\HousePic;
use App\Models\Provinces;
use App\Models\Regions;
use App\Models\RoomPic;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

class HouseController extends Controller
{
    public function index(Request $request)
    {
        $query = House::with(['housePic', 'user.phoneNumber', 'room.roomPic'])->where('is_suspended', false);

        if ($request->boolean('mine') && Auth::check()) {
            $query->where('id_user', Auth::id());
        }

        if ($request->has('search') && !empty($request->search)) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('house_desc', 'like', "%{$search}%")
                  ->orWhere('kecamatan', 'like', "%{$search}%")
                  ->orWhere('kelurahan', 'like', "%{$search}%")
                  ->orWhere('kab_kota', 'like', "%{$search}%")
                  ->orWhere('street_name', 'like', "%{$search}%");
            });
        }

        if ($request->has('city') && !empty($request->city)) {
            $query->where('kab_kota', $request->city);
        }

        if ($request->has('price_min') && !empty($request->price_min)) {
            $query->where('price', '>=', (float) $request->price_min);
        }

        if ($request->has('price_max') && !empty($request->price_max)) {
            $query->where('price', '<=', (float) $request->price_max);
        }

        // Support sorting
        if ($request->has('sort')) {
            if ($request->sort === 'price_asc') {
                $query->orderBy('price', 'asc');
            } elseif ($request->sort === 'price_desc') {
                $query->orderBy('price', 'desc');
            } else {
                $query->latest();
            }
        } else {
            $query->latest();
        }

        $perPage = $request->input('per_page', 12);
        
        $cacheKey = 'houses_list_' . md5(json_encode($request->all()));
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        
        $houses = $supportsTags
            ? \Illuminate\Support\Facades\Cache::tags(['houses'])->remember($cacheKey, 600, function () use ($query, $perPage) {
                return $query->paginate($perPage);
            })
            : \Illuminate\Support\Facades\Cache::remember($cacheKey, 600, function () use ($query, $perPage) {
                return $query->paginate($perPage);
            });

        return HouseResource::collection($houses);
    }

    public function store(StoreHouseRequest $request)
    {
        try {
            $validated = $request->validated();

            if ($validated['kab_kota'] == 'Jakarta') {
                Regions::firstOrCreate([
                    'name' => $validated['kab_kota'],
                    'id_province' => 1,
                ]);
            } else {
                $province = Provinces::firstOrCreate(['name' => $validated['province']]);
                Regions::firstOrCreate([
                    'name' => $validated['kab_kota'],
                    'id_province' => $province->id,
                ]);
            }

            $validated['price'] = str_replace('.', '', $validated['price']);
            $validated['id_user'] = Auth::id();
            $validated['coordinate'] = $validated['lat'].', '.$validated['lng'];

            $house = House::create($validated);

            // Handle initial rooms and their photos if provided
            if ($request->has('rooms')) {
                foreach ($request->input('rooms') as $index => $roomData) {
                    $room = $house->room()->create([
                        'name' => $roomData['name'],
                        'type' => $roomData['type'],
                        'width' => $roomData['width'],
                        'length' => $roomData['length'],
                        'desc' => $roomData['desc'] ?? '',
                    ]);

                    // Handle room photos if any
                    $allRoomFiles = $request->file('rooms');
                    $roomPics = is_array($allRoomFiles) ? ($allRoomFiles[$index]['pics'] ?? null) : null;
                    if (!empty($roomPics)) {
                        foreach ($roomPics as $roomPic) {
                            if ($roomPic->isValid()) {
                                $roomFolder = 'uploads/house/house_'.$house->id.'/rooms/room_'.$room->id;
                                $path = \App\Services\ImageService::convertToWebp($roomPic, $roomFolder);
                                RoomPic::create([
                                    'file_name' => $roomPic->getClientOriginalName(),
                                    'dir' => $path,
                                    'size' => $roomPic->getSize(),
                                    'id_room' => $room->id,
                                ]);
                            }
                        }
                    }
                }
            }

            // Handle house_pic file uploads
            if ($request->hasFile('house_pic')) {
                foreach ($request->file('house_pic') as $pic) {
                    if ($pic->isValid()) {
                        $saveFolder = 'uploads/house/house_'.Auth::id();
                        $path = \App\Services\ImageService::convertToWebp($pic, $saveFolder);
                        HousePic::create([
                            'file_name' => $pic->getClientOriginalName(),
                            'dir' => $path,
                            'size' => $pic->getSize(),
                            'id_house' => $house->id,
                        ]);
                    }
                }
            }

            $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
            if ($supportsTags) {
                \Illuminate\Support\Facades\Cache::tags(['houses'])->flush();
            } else {
                \Illuminate\Support\Facades\Cache::flush();
            }

            return new HouseResource($house->load(['housePic', 'room', 'room.roomPic']));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('House creation failed', [
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'message' => 'Gagal menyimpan properti: '.$e->getMessage(),
            ], 500);
        }
    }

    public function show(House $house)
    {
        $house->increment('views');
        $house->load(['housePic', 'room.roomPic', 'user']);

        return new HouseResource($house);
    }

    public function update(UpdateHouseRequest $request, House $house)
    {
        if ($house->id_user !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized action. You do not own this house.'], 403);
        }

        $validated = $request->validated();

        if (isset($validated['lat']) && isset($validated['lng'])) {
            $validated['coordinate'] = $validated['lat'].', '.$validated['lng'];
        }

        if (isset($validated['price'])) {
            $validated['price'] = str_replace('.', '', $validated['price']);
        }

        $house->update($validated);

        // Handle rooms during update
        if ($request->has('rooms')) {
            foreach ($request->input('rooms') as $index => $roomData) {
                // Determine if we're updating or creating
                if (isset($roomData['id'])) {
                    $room = $house->room()->find($roomData['id']);
                    if ($room) {
                        $room->update([
                            'name' => $roomData['name'],
                            'type' => $roomData['type'],
                            'width' => $roomData['width'],
                            'length' => $roomData['length'],
                            'desc' => $roomData['desc'] ?? '',
                        ]);
                    }
                } else {
                    $room = $house->room()->create([
                        'name' => $roomData['name'],
                        'type' => $roomData['type'],
                        'width' => $roomData['width'],
                        'length' => $roomData['length'],
                        'desc' => $roomData['desc'] ?? '',
                    ]);
                }

                // Handle room photos if any (new uploads)
                $roomPics = $request->file('rooms')[$index]['pics'] ?? null;
                if ($room && !empty($roomPics)) {
                    foreach ($roomPics as $roomPic) {
                        if ($roomPic->isValid()) {
                            $roomFolder = 'uploads/house/house_'.$house->id.'/rooms/room_'.$room->id;
                            $path = \App\Services\ImageService::convertToWebp($roomPic, $roomFolder);
                            RoomPic::create([
                                'file_name' => $roomPic->getClientOriginalName(),
                                'dir' => $path,
                                'size' => $roomPic->getSize(),
                                'id_room' => $room->id,
                            ]);
                        }
                    }
                }
            }
        }

        // Handle House Photos Gallery
        if ($request->has('deleted_house_pics')) {
            foreach ($request->input('deleted_house_pics') as $picId) {
                $pic = HousePic::where('id', $picId)->where('id_house', $house->id)->first();
                if ($pic) {
                    // Delete physical file
                    if (Storage::disk('public')->exists($pic->dir)) {
                        Storage::disk('public')->delete($pic->dir);
                    }
                    $pic->delete();
                }
            }
        }

        // Handle deleted room photos — mirror house_pic pattern exactly
        if ($request->has('deleted_room_pics')) {
            foreach ($request->input('deleted_room_pics') as $roomPicId) {
                $roomPic = RoomPic::where('id', $roomPicId)->first();
                if ($roomPic && $roomPic->room && $roomPic->room->id_house === $house->id) {
                    if (Storage::disk('public')->exists($roomPic->dir)) {
                        Storage::disk('public')->delete($roomPic->dir);
                    }
                    $roomPic->delete();
                }
            }
        }

        if ($request->hasFile('house_pics')) {
            $houseFolder = 'uploads/house/house_'.$house->id;
            foreach ($request->file('house_pics') as $pic) {
                if ($pic->isValid()) {
                    $path = \App\Services\ImageService::convertToWebp($pic, $houseFolder);
                    HousePic::create([
                        'file_name' => $pic->getClientOriginalName(),
                        'dir' => $path,
                        'size' => $pic->getSize(),
                        'id_house' => $house->id,
                    ]);
                }
            }
        }

        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        if ($supportsTags) {
            \Illuminate\Support\Facades\Cache::tags(['houses'])->flush();
        } else {
            \Illuminate\Support\Facades\Cache::flush();
        }

        return new HouseResource($house->load(['housePic', 'room', 'room.roomPic']));
    }

    public function destroy(House $house)
    {
        if ($house->id_user !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized action. You do not own this house.'], 403);
        }

        // Ideally, extracting file deletion to an independent Action/Service class goes here.
        $house->delete();

        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        if ($supportsTags) {
            \Illuminate\Support\Facades\Cache::tags(['houses'])->flush();
        } else {
            \Illuminate\Support\Facades\Cache::flush();
        }

        return response()->json(['message' => 'House deleted successfully']);
    }
}
