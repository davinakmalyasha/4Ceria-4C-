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
use Illuminate\Support\Facades\Mail;
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
            'password' => 'required|string|min:8',
            'role_type' => 'required|in:user,arsitek,kontraktor,notaris,interior,structural,mep,project_manager,supplier,logistics,civil,mechanical,electrical,plumbing,roofing,finishing',
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
            } elseif ($request->role_type === 'kontraktor') {
                Kontraktor::create(['user_id' => $user->id, 'nama' => $user->name, 'verification_status' => 'verified']);
            } elseif ($request->role_type === 'admin') {
                Admin::create(['user_id' => $user->id, 'nama' => $user->name]);
            } elseif ($request->role_type === 'notaris') {
                NotarisProfile::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);
            } elseif ($request->role_type === 'interior') {
                InteriorProfile::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);
            } elseif ($request->role_type === 'structural') {
                StructuralEngineer::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);
            } elseif ($request->role_type === 'mep') {
                MepEngineer::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);
            } elseif ($request->role_type === 'project_manager') {
                \App\Models\ProjectManager::create([
                    'user_id' => $user->id,
                    'nama' => $user->name,
                    'rate_harga' => 0,
                    'pengalaman_tahun' => 0,
                    'verification_status' => 'pending',
                ]);
            } elseif ($request->role_type === 'supplier') {
                \App\Models\Supplier::create([
                    'user_id' => $user->id,
                    'store_name' => $user->name."'s Store",
                    'verification_status' => 'pending',
                ]);
            } elseif ($request->role_type === 'logistics') {
                \App\Models\CourierProfile::create([
                    'user_id' => $user->id,
                    'vehicle_type' => 'Not Specified',
                    'license_plate' => 'Not Specified',
                    'is_active' => true,
                ]);
            } elseif (in_array($request->role_type, ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
                Kontraktor::create([
                    'user_id' => $user->id,
                    'nama' => $user->name,
                    'jenis' => 'Sub-Contractor',
                    'verification_status' => 'verified',
                ]);
            }

            // Ensure the Spatie role exists before assigning
            $roleName = $request->role_type;
            if (!in_array($roleName, ['user', 'arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager', 'supplier', 'logistics', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
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
        // NOTE: no exists: rule — an identical response for known and unknown
        // emails prevents account enumeration.
        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::where('email', $request->email)->first();

        if ($user) {
            $token = Password::broker()->createToken($user);

            $resetUrl = config('app.url') . '/reset-password/' . $token;

            try {
                Mail::raw(
                    "Halo {$user->name},\n\n" .
                    "Klik link berikut untuk mereset password Anda:\n{$resetUrl}\n\n" .
                    "Atau salin token ini ke aplikasi 4C:\n{$token}\n\n" .
                    "Link berlaku 60 menit.\n\n" .
                    "— 4Ceria Team",
                    function ($message) use ($user) {
                        $message->to($user->email)
                            ->subject('Reset Password 4C');
                    }
                );
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error('Forgot password email failed: ' . $e->getMessage(), [
                    'exception' => get_class($e),
                    'trace' => $e->getTraceAsString(),
                ]);

                return response()->json([
                    'message' => 'Gagal mengirim email. Silakan coba lagi nanti.',
                ], 500);
            }
        }

        // Identical response whether or not the account exists.
        return response()->json([
            'message' => 'Kode reset telah dikirim ke email Anda.',
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

                // SECURITY: revoke all existing tokens so a stolen session
                // cannot survive a password reset.
                $user->tokens()->delete();

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
