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
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Auth\Events\PasswordReset;
use Spatie\Permission\Models\Role;

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
        $user = User::where('email', $request->email)->firstOrFail();
        if ($user->is_suspended) {
            return response()->json([
                'message' => 'Your account has been suspended by the administrator.',
            ], 403);
        }

        $relations = [
            'phoneNumber', 'arsitek', 'kontraktor',
            'notaris_profile.services', 'interior_profile', 'project_manager',
            'structural_engineer', 'mep_engineer', 'supplier',
            'roles',
        ];
        if (in_array($user->role_type, ['arsitek', 'kontraktor'])) {
            $relations[] = 'teamMembers';
        }
        $user->load($relations);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => new UserResource($user),
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

        try {
            DB::beginTransaction();

            $user = User::create([
                'name' => $request->name,
                'username' => $request->username,
                'email' => strtolower($request->email),
                'password' => Hash::make($request->password),
                'role_type' => $request->role_type,
            ]);

            if ($request->role_type === 'arsitek') {
                Arsitek::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0, 'verification_status' => 'verified']);

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
                Kontraktor::create(['user_id' => $user->id, 'nama' => $user->name, 'verification_status' => 'verified']);

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

            // Ensure the Spatie role exists before assigning
            $roleName = $request->role_type;
            if (!in_array($roleName, ['user', 'arsitek', 'kontraktor', 'admin', 'notaris', 'interior', 'structural', 'mep', 'project_manager', 'supplier', 'logistics', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
                $roleName = 'user';
            }
            Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
            $user->assignRole($roleName);

            $relations = [
                'phoneNumber', 'arsitek', 'kontraktor',
                'notaris_profile.services', 'interior_profile', 'project_manager',
                'structural_engineer', 'mep_engineer', 'supplier',
                'roles',
            ];
            if (in_array($user->role_type, ['arsitek', 'kontraktor'])) {
                $relations[] = 'teamMembers';
            }
            $user->load($relations);

            $token = $user->createToken('auth_token')->plainTextToken;

            DB::commit();

            return response()->json([
                'message' => 'User created successfully',
                'access_token' => $token,
                'token_type' => 'Bearer',
                'user' => new UserResource($user),
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Registration failed: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
                'input' => $request->except('password'),
            ]);
            return response()->json([
                'message' => 'Registration failed. Please try again.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully',
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email|exists:users',
        ]);

        $user = User::where('email', $request->email)->firstOrFail();
        $token = Password::broker()->createToken($user);

        // Still try to send email (works when SMTP is configured on Railway)
        Password::sendResetLink($request->only('email'));

        return response()->json([
            'message' => 'We have emailed a password reset link.',
            'reset_token' => $token,
            'email' => $request->email,
        ]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function ($user, $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                ])->save();

                event(new PasswordReset($user));
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json([
                'message' => 'Your password has been reset successfully.',
            ]);
        }

        return response()->json([
            'message' => __($status),
        ], 422);
    }
}
