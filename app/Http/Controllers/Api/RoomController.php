<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\HouseResource;
use App\Models\House;
use App\Models\Room;
use App\Models\RoomPic;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class RoomController extends Controller
{
    /**
     * Store a new room for a property.
     */
    public function store(Request $request, House $house)
    {
        // Security check
        if ($house->id_user !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized action. You do not own this house.'], 403);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'type' => 'required|string|in:room,bedroom,bathroom,others',
            'width' => 'required|numeric|min:0',
            'length' => 'required|numeric|min:0',
            'desc' => 'required|string',
            'room_pic' => 'nullable|array',
            'room_pic.*' => 'image|mimes:jpeg,png,jpg|max:2048',
        ]);

        $room = Room::create([
            'name' => $validated['name'],
            'type' => $validated['type'],
            'width' => $validated['width'],
            'length' => $validated['length'],
            'desc' => $validated['desc'],
            'id_house' => $house->id,
        ]);

        // Handle room_pic multi-upload
        if ($request->hasFile('room_pic')) {
            foreach ($request->file('room_pic') as $pic) {
                if ($pic->isValid()) {
                    $saveFolder = "uploads/house/house_{$house->id}/rooms/room_{$room->id}";
                    $path = $pic->store($saveFolder, 'public');

                    RoomPic::create([
                        'file_name' => $pic->getClientOriginalName(),
                        'dir' => $path,
                        'size' => $pic->getSize(),
                        'id_room' => $room->id,
                    ]);
                }
            }
        }

        return response()->json([
            'message' => 'Room added successfully',
            'house' => new HouseResource($house->load(['room.roomPic', 'housePic'])),
        ]);
    }

    /**
     * Remove a room from a property.
     */
    public function destroy(Room $room)
    {
        $house = $room->house;

        // Security check
        if ($house->id_user !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized action. You do not own this house.'], 403);
        }

        // Delete associated photos from storage
        $pics = $room->roomPic;
        foreach ($pics as $pic) {
            if (Storage::disk('public')->exists($pic->dir)) {
                Storage::disk('public')->delete($pic->dir);
            }
        }

        $room->delete();

        return response()->json([
            'message' => 'Room deleted successfully',
            'house' => new HouseResource($house->load(['room.roomPic', 'housePic'])),
        ]);
    }
}
