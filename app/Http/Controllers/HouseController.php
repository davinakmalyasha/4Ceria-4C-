<?php

namespace App\Http\Controllers;

use App\Models\Contact;
use App\Models\DetailHouse;
use App\Models\House;
use App\Models\HouseAddress;
use App\Models\HousePic;
use App\Models\Provinces;
use App\Models\Regions;
use App\Models\Room;
use App\Models\RoomPic;
use Illuminate\Support\Facades\DB;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Log;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Traits\HasRoles;


class HouseController extends Controller
{
    public function index()
{
    $houses = House::where('id_user', Auth::id())->get();
    return view('house.rumahDijual', compact('houses'));
}

    //view/calling data
    public function dashboard(Request $request){
        
        $houseList = House::with(['housePic' => function ($query){
            $query->limit(1);
        } ])->select("*", DB::raw('CAST(created_at AS DATE) as uploadDate'));
        if($request->has('provinceIn') && $request->provinceIn){
            $houseList->where('province', $request->provinceIn);
        }
        if($request->has('cityIn') && $request->cityIn){
            $houseList->where('kab_kota', $request->cityIn);
        }
        if ($request->filled('kamarTidur')) {
            $houseList->where('br', $request->kamarTidur);
        }
        if ($request->filled('kamarMandi')) {
            $houseList->where('ba', $request->kamarMandi);
        }
        if($request->has('minPrice') && $request->minPrice){
            $minPrice = str_replace('.', '', $request->minPrice);
            $houseList->where('price', '>=', $minPrice);
        }
        if($request->has('maxPrice') && $request->maxPrice){
            $maxPrice = str_replace('.', '', $request->maxPrice);
            $houseList->where('price', '<=', $maxPrice);
        }
        $selectedProvince = $request->provinceIn;
        $selected = [
            $request->provinceIn,
            $request->cityIn,
            $request->kamarTidur,
            $request->kamarMandi,
            $request->minPrice,
            $request->maxPrice
        ];
        $provinces = Provinces::all();
        $regions = Regions::all();
        $houseList = $houseList->get();
       
        return view('users-page.house.cariRumah', compact('provinces','houseList', 'regions', 'selectedProvince', 'selected'));
    }
    public function getRegion($provinceId){
        $regions = Regions::where('id_province', $provinceId)->get();

        return response()->json(['regions' => $regions]);
    }
    public function viewHouse($id){
        $houseViews = House::find($id);
        $houseViews->views = $houseViews->views + 1;
        $houseViews->save();
        $house = House::with('housePic')->select("*", DB::raw('CAST(created_at AS DATE) as uploadDate'))->find($id);
        $contacts = Contact::all();
        // return $house;
        return view('users-page.house-view', compact('house', 'contacts'));
    }
    public function displayAll(){
        
        $houses = House::with('user')->get();
        return view('house.houses-list', compact('houses'));
    }
    public function displayOwnedHouse(){
        $houses = House::where('house.id_user', '=', Auth::id())->get();
        // return $houses;
        return view('users-page.house.rumahDijual', compact('houses'));
    }
    public function formCreateHouse(){
        $houses = House::where('house.id_user', '=', Auth::id())->get();
        // return $houses;
        return view('house.house-create', compact('houses')); 
    }
    public function displayDetail($idHouse){

        $house = House::with('housePic', 'room')->findOrFail($idHouse);
        $increment = 1;
        $isOwner = false;
        if(Auth::id()==$house->id_user || !Auth::user()->hasRole('user')){
            if(Auth::id()==$house->id_user){
                $isOwner = true;
            }
            // return $house;
            return view('users-page.house.house-detail', compact('house', 'increment', 'isOwner'));
        }
        else{
            return redirect()->route('dashboard');
        }
        
    }
    public function displayRoomDetail(House $house, $id){
        $room = Room::with('roomPic', 'house')->find($id);
        if (Auth::id()==$room->house->id_user) {
            // return $room;
            return view('users-page.house.room-detail', compact('room'));
        }
        else{
            return redirect()->route('dashboard');
        }
    }
    //house n shi
    public function createHouse(Request $request){
        $userId = Auth::id();
        // $request->validate([
        //     'house_pic' => ['required', 'file', 'max:2048', 'mimes:png,jpg,jpeg'],
        // ]);
        // $request->validate([
        //     'name'=>['required', 'string', 'max:255'],
        //     'price'=>['required', 'numeric'],
        //     'house_desc'=>['required', 'string', 'max:555'],
        //     'width'=>['required', 'numeric', 'max_digits:4'],
        //     'length'=>['required', 'numeric', 'max_digits:4'],
        //     'ba' =>['required', 'numeric', 'max_digits:2'],
        //     'br' =>['required', 'numeric', 'max_digits:2'],
        //     'floors' =>['required', 'numeric', 'max_digits:2'],
        //     'street_name'=>['required', 'string', 'max:255'],
        //     'kab_kota' => ['required', 'string', 'max:255'],
        //     'postal_code' => ['required', 'numeric', 'max_digits:255'],
        // ]);

        
        if($request->kab_kota == "Jakarta"){
            Regions::firstOrCreate([
                'name' => $request->kab_kota,
                'id_province' => 1
            ]);
        }
        else{
            $province = Provinces::firstOrCreate(['name' => $request->province]);
            Regions::firstOrCreate([
                'name' => $request->kab_kota,
                'id_province' => $province->id
            ]);
        }

        $price = str_replace('.', '', $request->price);
        // return $request;

        House::create([
            'name'=>$request->name,
            'price'=>$price,
            'house_desc'=>$request->house_desc,
            'width'=>$request->width,
            'length'=>$request->length,
            'ba'=>$request->ba,
            'br'=>$request->br,
            'floors'=>$request->floors,
            'street_name'=>$request->street_name,
            'kelurahan'=>$request->kelurahan,
            'kecamatan'=>$request->kecamatan,
            'kab_kota'=>$request->kab_kota,
            'province'=>$request->province,
            'postal_code'=>$request->postal_code,
            'id_user'=>$userId,
            'coordinate'=>$request->lat.", ".$request->lng,
        ]);
        if ($request->has('house_pic')) {
            foreach ($request->file('house_pic') as $house_pic) {
                if ($house_pic->isValid()) {
                    $saveFolder = 'uploads/house/house_' . Auth::id();
                    $path = $house_pic->store($saveFolder, 'public');
                    HousePic::create([
                        'file_name' => $house_pic->getClientOriginalName(),
                        'dir' => $path,
                        'size' => $house_pic->getSize(),
                        'id_house' => House::latest('id')->first()->id,  // Replace with the actual house ID if applicable
                    ]);
                }
            }
        }
        // return $price;
        return redirect()->route('user-houses-list');
    }
    public function formEditHouse($id){
        $house = House::find($id);
        return view('house.house-edit', compact('house'));
    }
    public function editHouse($id, Request $request){
        $request->validate([
            'name'=>['required', 'string', 'max:255'],
            'price'=>['required', 'numeric', 'maxdigits:17'],
            'house_desc'=>['required', 'string']
        ]);
        $pushHouse = House::findOrFail($id);

        $pushHouse->name=$request->name;
        $pushHouse->price=$request->price;
        $pushHouse->house_desc=$request->house_desc;
        $pushHouse->save();
        
        return redirect()->route('house.detail', $id);
    }

    public function destroyHouse(House $house, $id){
        $house = House::with('housePic', 'room.roomPic', 'room')->findOrFail($id);
        if($house->housePic->isNotEmpty()){
            foreach ($house->housePic as $pic) {
                $this->destroyHousePic($pic->id);
            }
        }
        if($house->Room->isNotEmpty()){
            foreach ($house->Room as $room) {
                if($room->roomPic->isNotEmpty()){
                    foreach ($room->roomPic as $roomPic) {
                        $this->destroyRoomPic($roomPic->id);
                    }
                }
                $room->delete();
            }
        }
        try {
            $house->delete();
            return redirect()->route('user-houses-list');
        } catch (Exception $e) {
            return redirect()->route('user-houses-list')->with('error', 'An error occured '.$e->getMessage());
        }
    }

    //house dimension configuration
    public function formCreateDimension($id){
        return view('users-page.house.house-detail-dimension-create', compact('id'));
    }
    public function createDimension(Request $request, $id){
        $request->validate([
            'width'=>['required', 'numeric', 'max_digits:4'],
            'length'=>['required', 'numeric', 'max_digits:4'],
            'ba' =>['required', 'numeric', 'max_digits:2'],
            'br' =>['required', 'numeric', 'max_digits:2'],
            'floors' =>['required', 'numeric', 'max_digits:2']
        ]);
        $request->validate([
            'width'=>['required', 'numeric', 'max_digits:4'],
            'length'=>['required', 'numeric', 'max_digits:4'],
            'ba' =>['required', 'numeric', 'max_digits:2'],
            'br' =>['required', 'numeric', 'max_digits:2'],
            'floors' =>['required', 'numeric', 'max_digits:2']
        ]);

        $pushEdit = House::findOrFail($id);
        $pushEdit->width = $request->width;
        $pushEdit->length = $request->length;
        $pushEdit->ba = $request->ba;
        $pushEdit->br = $request->br;
        $pushEdit->floors = $request->floors;
        $pushEdit->save();

        return redirect()->route('house.detail',$id);

    }

    public function editDimension(Request $request, $id){
        $request->validate([
            'width'=>['required', 'numeric', 'max_digits:4'],
            'length'=>['required', 'numeric', 'max_digits:4'],
            'ba' =>['required', 'numeric', 'max_digits:2'],
            'br' =>['required', 'numeric', 'max_digits:2'],
            'floors' =>['required', 'numeric', 'max_digits:2']
        ]);

        $pushEdit = House::findOrFail($id);
        $pushEdit->width = $request->width;
        $pushEdit->length = $request->length;
        $pushEdit->ba = $request->ba;
        $pushEdit->br = $request->br;
        $pushEdit->floors = $request->floors;
        $pushEdit->save();

        return redirect()->route('house.detail', $request->id_house);
    }

    public function destroyDimension($id){
        $destroy = House::find($id);
        $destroy->width = null;
        $destroy->length = null;
        $destroy->ba = null;
        $destroy->br = null;
        $destroy->floors = null;
        $destroy->save();
        return redirect()->route('house.detail', $id);
    }

    //address of house shi
    public function formCreateAddress($id){
        return view('users-page.house.house-address-create', compact('id'));
    }


    public function createAddress(Request $request, $id){
        $request->validate([
            'street_name'=>['required', 'string', 'max:255'],
            'kab_kota' => ['required', 'string', 'max:255'],
            'postal_code' => ['required', 'numeric', 'max_digits:255'],
        ]);
        if($request->kab_kota == "Jakarta"){
            Regions::firstOrCreate([
                'name' => $request->kab_kota,
                'id_province' => 1
            ]);
        }
        else{
            $province = Provinces::firstOrCreate(['name' => $request->province]);
            Regions::firstOrCreate([
                'name' => $request->kab_kota,
                'id_province' => $province->id
            ]);
        }
        $upAddress = House::find($id);
        $upAddress->street_name = $request->street_name;
        $upAddress->kelurahan = $request->kelurahan;
        $upAddress->kecamatan = $request->kecamatan;
        $upAddress->kab_kota = $request->kab_kota;
        if($request->kab_kota == "Jakarta"){
            $upAddress->province = "Jakarta";
        }
        else{
            $upAddress->province = $request->province;
        }
        $upAddress->postal_code = $request->postal_code;
        $upAddress->coordinate = $request->lat.",".$request->lng;
        $upAddress->save();

        return redirect()->route('house.detail', $request->id_house);
    }
    public function destroyAddress($id){
        $destroy = House::find($id);
        $destroy->coordinate = null;
        $destroy->street_name = null;
        $destroy->kelurahan = null;
        $destroy->kecamatan = null;
        $destroy->kab_kota = null;
        $destroy->province = null;
        $destroy->postal_code = null;
        $destroy->save();
        return redirect()->route('house.detail', $id);
    }

    //housing pictures
    public function createHousePic($id, Request $request){
        $request->validate([
            'house_pic' => ['required', 'file', 'max:2048', 'mimes:png,jpg,jpeg'],
        ]);
        if($request->hasFile('house_pic') && $request->file('house_pic')->isValid()){
            $saveFolder = 'uploads/house/house_'.$id;
            $path = $request->file('house_pic')->store($saveFolder, 'public');
            HousePic::create([
                'file_name' => $request->file('house_pic')->getClientOriginalName(),
                'dir' => $path,
                'size' => $request->file('house_pic')->getSize(),
                'id_house' => $id
            ]);
            return redirect()->route('house.detail', $id)->with('success', 'File Uploaded Succesfully');
        }
        else{
            return redirect()->route('house.detail', $id)->with('error', 'File failed to upload');
        }
    }

    public function destroyHousePic($id){
        $housePic = HousePic::find($id);
        if(Storage::exists($housePic->dir)){
            Storage::delete($housePic->dir);
        }
        $housePic->delete();
        return redirect()->route('house.detail',$housePic->id_house)->with('success', 'File succesfully deleted');
    }

    //room of house config
    public function createRoom(Request $request){
        $request->validate([
            'name'=>['required', 'max:255', 'string'],
            'width' =>['required', 'max_digits:3', 'numeric'],
            'length' =>['required', 'max_digits:3', 'numeric'],
            'desc'=>['required', 'max:255', 'string']
        ]);

        Room::create([
            'name' => $request->name,
            'width' => $request->width,
            'length' => $request->length,
            'desc' => $request->desc,
            'id_house' => $request->id_house,
        ]);

        return redirect()->route('house.detail',$request->id_house)->with('success1', 'Succesfully Added New Room');
    }
    
    public function editRoom($id, Request $request){
        $request->validate([
            'name'=>['required', 'max:255', 'string'],
            'width' =>['required', 'max_digits:3', 'numeric'],
            'length' =>['required', 'max_digits:3', 'numeric'],
            'desc'=>['required', 'max:255', 'string']
        ]);

        $upRoom = Room::find($id);
        $upRoom->name=$request->name;
        $upRoom->width=$request->width;
        $upRoom->length=$request->length;
        $upRoom->desc=$request->desc;
        $upRoom->save();

        return redirect()->route('house.room.detail',$upRoom->id)->with('success', 'Succesfully Edit Room Data');
    }

    public function destroyRoom(Room $room, $id){
        $room = Room::with('roomPic')->findOrFail($id);
        if($room->roomPic->isNotEmpty()){
            foreach ($room->roomPic as $roomPic) {
                $this->destroyRoomPic($roomPic->id);
            }

        }
    }

    public function createRoomPic($id, Request $request){
        $request->validate([
            'room_pic' => ['required', 'file', 'max:2048', 'mimes:png,jpg,jpeg'],
        ]);
        if($request->hasFile('room_pic') && $request->file('room_pic')->isValid()){
            $saveFolder = 'uploads/house/house_'.$request->id_house.'/rooms/_'.$id;
            $path = $request->file('room_pic')->store($saveFolder, 'public');
            RoomPic::create([
                'file_name' => $request->file('room_pic')->getClientOriginalName(),
                'dir' => $path,
                'size' => $request->file('room_pic')->getSize(),
                'id_room' => $id
            ]);
            return redirect()->route('house.room.detail', $id)->with('success', 'File Uploaded Succesfully');
        }
        else{
            return redirect()->route('house.room.detail', $id)->with('error', 'File failed to upload');
        }
    }
    public function destroyRoomPic($id){
        $roomPic = RoomPic::find($id);
        // $saveFolder = 'uploads/house/house_'.$id.'/rooms/_'.$id."/".$roomPic->if;
        if (Storage::exists($roomPic->dir)) {
                Storage::delete($roomPic->dir);
            }

        $roomPic->delete();
        return redirect()->route('house.room.detail',$roomPic->id_room)->with('success', 'File succesfully deleted');
    }

}
