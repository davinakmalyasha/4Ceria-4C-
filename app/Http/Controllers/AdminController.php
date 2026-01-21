<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;
use App\Models\Provinces;
use App\Models\Regions;
use App\Models\HousePic;
use App\Models\HouseType;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Admin;
use App\Models\Room;
use Illuminate\Support\Facades\Storage;
use App\Models\BidArsitek;
use App\Models\BidKontraktor;
use App\Models\Contact;
use App\Models\HouseTypePic;
use Illuminate\Support\Facades\DB;
use App\Models\PengajuanSpesialisasi;
use App\Models\House;

class AdminController extends Controller
{
    public function index()
    {
        if (!Auth::check()) {
            return redirect()->route('login');
        }

        return view('users-page.admin', [
            'admin' => Auth::user(),
            'users' => collect([]),
        ]);
    }
    public function index1() {
        $projects = Project::all();
        $bidsArsitek = BidArsitek::all(); // atau filter per proyek kalau mau lebih rapih
        $bidsKontraktor = BidKontraktor::all();
    
        return view('users-page.admin.project-list', compact('projects', 'bidsArsitek', 'bidsKontraktor'));
    }
    
    public function manageUsers(Request $request)
    {
        $users = User::orderBy('name')->paginate(20);
        $query = User::query();
        $query = User::query()->where('role_type', '!=', 'admin');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%$search%")
                    ->orWhere('username', 'like', "%$search%")
                    ->orWhere('email', 'like', "%$search%");
            });
        }
        if ($request->filled('role')) {
            $role = $request->role;
            if (in_array($role, ['user', 'arsitek', 'kontraktor'])) {
                $query->where('role_type', $role);
            }
        }
        $users = $query->orderBy('name', 'asc')->paginate(20);
        $users->appends($request->all());

        $jumlahUserPerRole = [
            'total' => User::where('role_type', '!=', 'admin')->count(),
            'user' => User::where('role_type', 'user')->count(),
            'arsitek' => User::where('role_type', 'arsitek')->count(),
            'kontraktor' => User::where('role_type', 'kontraktor')->count(),
        ];


        return view('users-page.admin-manage-users', compact('users', 'jumlahUserPerRole'));
    }




    public function searchUser(Request $request)
    {
        $keyword = $request->keyword;

        $users = User::where(function ($query) use ($keyword) {
            $query->where('username', 'like', "%$keyword%")
                ->orWhere('email', 'like', "%$keyword%");
        })
            ->orWhereHas('arsitek', function ($query) use ($keyword) {
                $query->where('no_telp', 'like', "%$keyword%");
            })
            ->orWhereHas('kontraktor', function ($query) use ($keyword) {
                $query->where('no_telepon', 'like', "%$keyword%");
            })
            ->get();

        return view('users-page.admin', [
            'admin' => Auth::user(),
            'users' => $users
        ]);
    }

    public function deleteUser($id)
    {
        $user = User::findOrFail($id);
        $user->delete();

        return redirect()->back()->with('success', 'User berhasil dihapus.');
    }


    public function kelolaPengajuanSpesialisasi()
    {
        $pengajuan = PengajuanSpesialisasi::with(['kontraktor', 'spesialisasi'])
            ->where('status', 'pending')
            ->get();

        return view('users-page.kelola-pengajuan-spesialisasi', compact('pengajuan'));
    }

    public function prosesPengajuan(Request $request, $id)
    {
        $pengajuan = PengajuanSpesialisasi::findOrFail($id);

        if ($request->status === 'approved') {
            $exists = DB::table('kontraktor_spesialisasi')
                ->where('kontraktor_id', $pengajuan->kontraktor_id)
                ->where('spesialisasi_id', $pengajuan->spesialisasi_id)
                ->exists();

            if (!$exists) {
                DB::table('kontraktor_spesialisasi')->insert([
                    'kontraktor_id' => $pengajuan->kontraktor_id,
                    'spesialisasi_id' => $pengajuan->spesialisasi_id,
                ]);
            }
        }
        $pengajuan->update([
            'status' => $request->status,
        ]);

        return back()->with('success', 'Pengajuan telah diproses.');
    }


    public function daftarRumahUser(Request $request)
    {
        $houses = House::with('user')->get();
        $houseList = House::with(['housePic' => function ($query) {
            $query->limit(1);
        }])->select("*", DB::raw('CAST(created_at AS DATE) as uploadDate'));
        if ($request->has('provinceIn') && $request->provinceIn) {
            $houseList->where('province', $request->provinceIn);
        }
        if ($request->has('cityIn') && $request->cityIn) {
            $houseList->where('kab_kota', $request->cityIn);
        }
        if ($request->filled('kamarTidur')) {
            $houseList->where('br', $request->kamarTidur);
        }
        if ($request->filled('kamarMandi')) {
            $houseList->where('ba', $request->kamarMandi);
        }
        if ($request->has('minPrice') && $request->minPrice) {
            $minPrice = str_replace('.', '', $request->minPrice);
            $houseList->where('price', '>=', $minPrice);
        }
        if ($request->has('maxPrice') && $request->maxPrice) {
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

        $rumahList = House::with('user')->latest()->paginate(10);
        return view('house.houses-list', compact('houseList', 'rumahList', 'houses'));
    }
    public function DetaildaftarRumahUser($id)
    {
        $houseViews = House::find($id);
        $houseViews->views = $houseViews->views + 1;
        $houseViews->save();
        $house = House::with('housePic')->select("*", DB::raw('CAST(created_at AS DATE) as uploadDate'))->find($id);
        $contacts = Contact::all();


        return view('users-page.house.detailHouseAdmin', compact('house', 'contacts'));
    }
    public function editRumah($id)
{
    $house = House::with(['housePic', 'room', 'user.phoneNumber'])->findOrFail($id);
    return view('admin.editRumah', compact('house'));
}

public function updateRumah(Request $request, $id)
{
    $validated = $request->validate([
        'name' => 'required|string|max:255',
        'price' => 'required|numeric',
        'house_desc' => 'nullable|string',
        'floors' => 'required|integer|min:1',
        'br' => 'required|integer|min:0',
        'ba' => 'required|integer|min:0',
        'width' => 'required|numeric',
        'length' => 'required|numeric',
        'province' => 'nullable|string',
        'kab_kota' => 'nullable|string',
        'kecamatan' => 'nullable|string',
        'kelurahan' => 'nullable|string',
        'postal_code' => 'nullable|string',
        'street_name' => 'nullable|string',
        'coordinate' => 'nullable|string',
    ]);

    $house = House::findOrFail($id);
    $house->update($validated);
    if ($request->has('rooms')) {
        foreach ($request->rooms as $roomData) {
            if (isset($roomData['id'])) {
                Room::where('id', $roomData['id'])->update([
                    'name' => $roomData['name'],
                    'width' => $roomData['width'],
                    'length' => $roomData['length'],
                    'desc' => $roomData['desc'],
                ]);
            } else {
                $house->rooms()->create($roomData);
            }
        }
    }


    return redirect()->route('admin.rumah-user')->with('success', 'Data rumah berhasil diperbarui.');
}
public function destroyRumah($id)
{
    $house = House::findOrFail($id);

    foreach ($house->housePic as $foto) {
        if (Storage::exists($foto->dir)) {
            Storage::delete($foto->dir);
        }
        $foto->delete();
    }

    $house->delete();

    return redirect()->route('admin.rumah-user')->with('success', 'Data rumah berhasil dihapus.');
}

public function showProjects()
{
    $projects = Project::all();
    $bidsArsitek = BidArsitek::all(); 
    $bidsKontraktor = BidKontraktor::all();
    $projects = DB::table('projects')->get(); 

    return view('users-page.AdminProject', compact('projects', 'bidsArsitek', 'bidsKontraktor'));
}
public function editProject($id)
{
    $project = Project::findOrFail($id);
    return view('users-page.AdminEditProject', compact('project'));
}
public function deleteProject($id)
{
    $project = Project::findOrFail($id);
    $project->delete();

    return redirect()->route('admin.project')->with('success', 'Proyek berhasil dihapus.');
}
public function updateProject(Request $request, $id)
{
    $project = Project::findOrFail($id);

    $project->update([
        'title' => $request->title,
        'description' => $request->description,
        'budget' => $request->budget,
        'lokasi' => $request->lokasi,
        // tambahkan kolom lain jika perlu
    ]);

    return redirect()->route('admin.project')->with('success', 'Proyek berhasil diperbarui.');
}


}
