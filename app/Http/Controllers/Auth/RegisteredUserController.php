<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Models\Arsitek;
use App\Models\InteriorProfile;
use App\Models\Kontraktor;
use App\Models\NotarisProfile;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;
use Illuminate\View\View;

class RegisteredUserController extends Controller
{
    /**
     * Display the registration view.
     */
    public function create(): View
    {
        return view('auth.register');
    }

    /**
     * Handle an incoming registration request.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255', 'unique:users'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', 'unique:users'],
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
            'role_type' => ['required', 'in:user,arsitek,kontraktor,admin,notaris,interior,structural,mep,project_manager,supplier,logistics,civil,mechanical,electrical,plumbing,roofing,finishing'],
        ]);

        $user = User::create([
            'name' => $request->name,
            'username' => $request->username,
            'email' => strtolower($request->email),
            'password' => Hash::make($request->password),
            'role_type' => $request->role_type,
            'unique_code' => User::generateUniqueCode(),
        ]);

        // Jika role adalah arsitek, buat data di tabel arsiteks
        if ($request->role_type === 'arsitek') {
            Arsitek::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'no_telp' => null,
                'foto' => null,
                'file_portofolio' => null,
                'file_sertifikat' => null,
                'rate_harga' => 0,
                'spesialisasi' => null,
                'deskripsi' => null,
                'lokasi' => null,
                'pengalaman_tahun' => 0,
            ]);
        }

        if ($request->role_type === 'kontraktor') {
            Kontraktor::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'email' => null,
                'no_telepon' => null,
                'alamat' => null,
                'jenis' => null,
                'nama_perusahaan' => null,
                'npwp' => null,
                'siup' => null,
                'pengalaman' => null,
            ]);
        }

        if ($request->role_type === 'admin') {
            Admin::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'no_telepon' => null,
                'foto' => null,
            ]);
        }

        if ($request->role_type === 'notaris') {
            NotarisProfile::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'no_telp' => null,
                'foto' => null,
                'nomor_sk' => null,
                'wilayah_kerja' => null,
                'spesialisasi' => null,
                'deskripsi' => null,
                'lokasi' => null,
                'pengalaman_tahun' => 0,
                'rate_harga' => 0,
            ]);
        }

        if ($request->role_type === 'interior') {
            InteriorProfile::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'no_telp' => null,
                'foto' => null,
                'file_portofolio' => null,
                'file_sertifikat' => null,
                'spesialisasi' => null,
                'deskripsi' => null,
                'lokasi' => null,
                'pengalaman_tahun' => 0,
                'rate_harga' => 0,
            ]);
        }

        if ($request->role_type === 'structural') {
            \App\Models\StructuralEngineer::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'no_telp' => null,
                'foto' => null,
                'file_portofolio' => null,
                'file_sertifikat' => null,
                'spesialisasi' => null,
                'deskripsi' => null,
                'lokasi' => null,
                'pengalaman_tahun' => 0,
                'rate_harga' => 0,
            ]);
        }

        if ($request->role_type === 'mep') {
            \App\Models\MepEngineer::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'no_telp' => null,
                'foto' => null,
                'file_portofolio' => null,
                'file_sertifikat' => null,
                'spesialisasi' => null,
                'deskripsi' => null,
                'lokasi' => null,
                'pengalaman_tahun' => 0,
                'rate_harga' => 0,
            ]);
        }

        if ($request->role_type === 'project_manager') {
            \App\Models\ProjectManager::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'no_telp' => null,
                'foto' => null,
                'file_portofolio' => null,
                'file_sertifikat' => null,
                'spesialisasi' => null,
                'deskripsi' => null,
                'lokasi' => null,
                'pengalaman_tahun' => 0,
                'rate_harga' => 0,
                'verification_status' => 'pending',
            ]);
        }

        if ($request->role_type === 'supplier') {
            \App\Models\Supplier::create([
                'user_id' => $user->id,
                'store_name' => $user->name."'s Store",
                'verification_status' => 'pending',
            ]);
        }

        if ($request->role_type === 'logistics') {
            \App\Models\CourierProfile::create([
                'user_id' => $user->id,
                'vehicle_type' => 'Not Specified',
                'license_plate' => 'Not Specified',
                'is_active' => true,
            ]);
        }

        if (in_array($request->role_type, ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
            Kontraktor::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'email' => null,
                'no_telepon' => null,
                'alamat' => null,
                'jenis' => 'Sub-Contractor',
                'nama_perusahaan' => null,
                'npwp' => null,
                'siup' => null,
                'pengalaman' => null,
                'verification_status' => 'verified',
            ]);
        }

        switch ($request->role_type) {
            case 'arsitek':
                $user->assignRole('arsitek');
                break;
            case 'kontraktor':
                $user->assignRole('kontraktor');
                break;
            case 'admin':
                $user->assignRole('admin');
                break;
            case 'notaris':
                $user->assignRole('notaris');
                break;
            case 'interior':
                $user->assignRole('interior');
                break;
            case 'structural':
                $user->assignRole('structural');
                break;
            case 'mep':
                $user->assignRole('mep');
                break;
            case 'project_manager':
                $user->assignRole('project_manager');
                break;
            case 'supplier':
                $user->assignRole('supplier');
                break;
            case 'logistics':
                $user->assignRole('logistics');
                break;
            case 'civil':
            case 'mechanical':
            case 'electrical':
            case 'plumbing':
            case 'roofing':
            case 'finishing':
                $user->assignRole($request->role_type);
                break;
            default:
                $user->assignRole('user');
                break;
        }

        event(new Registered($user));

        Auth::login($user);

        session(['role_type' => $request->role_type]);

        return match ($user->role_type) {
            'arsitek' => redirect()->route('users-page.adminArsitek'),
            'kontraktor' => redirect()->route('users-page.adminKontraktor'),
            'admin' => redirect()->route('users-page.admin'),
            'notaris' => redirect()->route('index'),
            'interior' => redirect()->route('index'),
            'structural' => redirect()->route('index'),
            'mep' => redirect()->route('index'),
            'project_manager' => redirect()->route('index'),
            'supplier' => redirect()->route('index'),
            'logistics' => redirect()->route('index'),
            'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing' => redirect()->route('index'),
            default => redirect()->route('index'),
        };
    }
}
