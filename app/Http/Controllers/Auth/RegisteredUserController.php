<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;
use Illuminate\View\View;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Admin;

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
            'role_type' => ['required', 'in:user,arsitek,kontraktor,admin'], 
        ]);

        $user = User::create([
            'name' => $request->name,
            'username' => $request->username,
            'email' => strtolower($request->email),
            'password' => Hash::make($request->password),
            'role_type' => $request->role_type, 
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
            default => redirect()->route('index'),
        };
    }    
}
