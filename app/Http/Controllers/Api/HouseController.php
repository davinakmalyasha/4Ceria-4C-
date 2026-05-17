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
        $query = House::with(['housePic', 'user.phoneNumber', 'room.roomPic']);

        $houses = $query->paginate(10);

        return HouseResource::collection($houses);
    }

    public function store(StoreHouseRequest $request)
    {
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
                if ($request->hasFile("rooms.{$index}.pics")) {
                    foreach ($request->file("rooms.{$index}.pics") as $roomPic) {
                        if ($roomPic->isValid()) {
                            $roomFolder = 'uploads/house/house_'.$house->id.'/rooms/room_'.$room->id;
                            $path = $roomPic->store($roomFolder, 'public');
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
                    $path = $pic->store($saveFolder, 'public');
                    HousePic::create([
                        'file_name' => $pic->getClientOriginalName(),
                        'dir' => $path,
                        'size' => $pic->getSize(),
                        'id_house' => $house->id,
                    ]);
                }
            }
        }

        return new HouseResource($house->load(['housePic', 'room', 'room.roomPic']));
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
                if ($room && $request->hasFile("rooms.{$index}.pics")) {
                    foreach ($request->file("rooms.{$index}.pics") as $roomPic) {
                        if ($roomPic->isValid()) {
                            $roomFolder = 'uploads/house/house_'.$house->id.'/rooms/room_'.$room->id;
                            $path = $roomPic->store($roomFolder, 'public');
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

        if ($request->hasFile('house_pics')) {
            $houseFolder = 'uploads/house/house_'.$house->id;
            foreach ($request->file('house_pics') as $pic) {
                if ($pic->isValid()) {
                    $path = $pic->store($houseFolder, 'public');
                    HousePic::create([
                        'file_name' => $pic->getClientOriginalName(),
                        'dir' => $path,
                        'size' => $pic->getSize(),
                        'id_house' => $house->id,
                    ]);
                }
            }
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

        return response()->json(['message' => 'House deleted successfully']);
    }
}
