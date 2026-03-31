<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\House;
use App\Models\Provinces;
use App\Models\Regions;
use Illuminate\Http\Request;
use App\Http\Resources\HouseResource;
use App\Http\Requests\StoreHouseRequest;
use App\Http\Requests\UpdateHouseRequest;
use Illuminate\Support\Facades\Auth;

class HouseController extends Controller
{
    public function index(Request $request)
    {
        $query = House::with(['housePic', 'user']);
        
        $houses = $query->paginate(10);
        return HouseResource::collection($houses);
    }

    public function store(StoreHouseRequest $request)
    {
        $validated = $request->validated();
        
        if($validated['kab_kota'] == "Jakarta"){
            Regions::firstOrCreate([
                'name' => $validated['kab_kota'],
                'id_province' => 1
            ]);
        } else {
            $province = Provinces::firstOrCreate(['name' => $validated['province']]);
            Regions::firstOrCreate([
                'name' => $validated['kab_kota'],
                'id_province' => $province->id
            ]);
        }

        $validated['price'] = str_replace('.', '', $validated['price']);
        $validated['id_user'] = Auth::id();
        $validated['coordinate'] = $validated['lat'].", ".$validated['lng'];

        $house = House::create($validated);

        return new HouseResource($house);
    }

    public function show(House $house)
    {
        $house->increment('views');
        $house->load(['housePic', 'room', 'user']);
        return new HouseResource($house);
    }

    public function update(UpdateHouseRequest $request, House $house)
    {
        if ($house->id_user !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized action. You do not own this house.'], 403);
        }

        $house->update($request->validated());
        
        return new HouseResource($house);
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
