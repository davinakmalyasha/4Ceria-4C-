<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Models\Arsitek;
use App\Models\InteriorProfile;
use App\Models\Kontraktor;
use App\Models\MepEngineer;
use App\Models\NotarisProfile;
use App\Models\Notification;
use App\Models\StructuralEngineer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    //
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email|string',
            'password' => 'required|string',
        ]);
        if (! Auth::attempt($request->only('email', 'password'))) {
            return response()->json([
                'message' => 'Invalid login credentials',
            ], 401);
        }
        $user = User::where('email', $request->email)->with('roles')->firstOrFail();
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => $user,
        ]);
    }

    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users',
            'email' => 'required|string|lowercase|email|max:255|unique:users',
            'password' => 'required|string|min:6',
            'role_type' => 'required|in:user,arsitek,kontraktor,admin,notaris,interior,structural,mep,project_manager,supplier,logistics,civil,mechanical,electrical,plumbing,roofing,finishing',
        ]);

        $user = User::create([
            'name' => $request->name,
            'username' => $request->username,
            'email' => strtolower($request->email),
            'password' => Hash::make($request->password),
            'role_type' => $request->role_type,
        ]);

        if ($request->role_type === 'arsitek') {
            Arsitek::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Architect Profile',
                'body' => 'Your profile is almost ready! Add your skills, rate, and location to attract more clients.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Get Verified to Start Bidding',
                'body' => 'Verified architects are more trusted. Upload your certifications now.',
                'data' => ['tab' => 'profile', 'action' => 'verify'],
            ]);
        } elseif ($request->role_type === 'kontraktor') {
            Kontraktor::create(['user_id' => $user->id, 'nama' => $user->name]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Constructor Profile',
                'body' => 'Your profile is almost ready! Add your skills, rate, and company background to attract more clients.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Get Verified to Start Bidding',
                'body' => 'Verified constructors are more trusted. Upload your business permits and NPWP now.',
                'data' => ['tab' => 'profile', 'action' => 'verify'],
            ]);
        } elseif ($request->role_type === 'admin') {
            Admin::create(['user_id' => $user->id, 'nama' => $user->name]);
        } elseif ($request->role_type === 'notaris') {
            NotarisProfile::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Notaris Profile',
                'body' => 'Add your license number, work region, and specialization to start receiving clients.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        } elseif ($request->role_type === 'interior') {
            InteriorProfile::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Interior Profile',
                'body' => 'Upload your portfolio and certifications to attract homeowners looking for interior designers.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        } elseif ($request->role_type === 'structural') {
            StructuralEngineer::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Structural Engineer Profile',
                'body' => 'Add your certifications and specialization to start receiving project invitations.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        } elseif ($request->role_type === 'mep') {
            MepEngineer::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your MEP Engineer Profile',
                'body' => 'Add your certifications and specialization to start receiving project invitations.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        } elseif ($request->role_type === 'project_manager') {
            \App\Models\ProjectManager::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'rate_harga' => 0,
                'pengalaman_tahun' => 0,
                'verification_status' => 'pending',
            ]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Project Manager Profile',
                'body' => 'Add your skills, rate, and certifications to start managing real estate projects.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        } elseif ($request->role_type === 'supplier') {
            \App\Models\Supplier::create([
                'user_id' => $user->id,
                'store_name' => $user->name."'s Store",
                'verification_status' => 'pending',
            ]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Set Up Your Store Profile',
                'body' => 'Add your store address, category, and bio to start listing construction materials.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        } elseif ($request->role_type === 'logistics') {
            \App\Models\CourierProfile::create([
                'user_id' => $user->id,
                'vehicle_type' => 'Not Specified',
                'license_plate' => 'Not Specified',
                'is_active' => true,
            ]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Driver Profile',
                'body' => 'Add your vehicle details and license plate to start accepting delivery orders.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        } elseif (in_array($request->role_type, ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
            Kontraktor::create([
                'user_id' => $user->id,
                'nama' => $user->name,
                'jenis' => 'Sub-Contractor',
                'verification_status' => 'verified',
            ]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Trade Profile',
                'body' => 'Add your specialty details and pricing rate to start accepting sub-contracts.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        }

        if ($request->role_type === 'arsitek') {
            $user->assignRole('arsitek');
        } elseif ($request->role_type === 'kontraktor') {
            $user->assignRole('kontraktor');
        } elseif ($request->role_type === 'admin') {
            $user->assignRole('admin');
        } elseif ($request->role_type === 'notaris') {
            $user->assignRole('notaris');
        } elseif ($request->role_type === 'interior') {
            $user->assignRole('interior');
        } elseif ($request->role_type === 'structural') {
            $user->assignRole('structural');
        } elseif ($request->role_type === 'mep') {
            $user->assignRole('mep');
        } elseif ($request->role_type === 'project_manager') {
            $user->assignRole('project_manager');
        } elseif ($request->role_type === 'supplier') {
            $user->assignRole('supplier');
        } elseif ($request->role_type === 'logistics') {
            $user->assignRole('logistics');
        } elseif (in_array($request->role_type, ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
            $user->assignRole($request->role_type);
        } else {
            $user->assignRole('user');
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'User created successfully',
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => $user,
        ], 201);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully',
        ]);
    }
}
