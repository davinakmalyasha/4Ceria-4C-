<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Notification;
use App\Models\User;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class GoogleAuthController extends Controller
{
    public function googleLogin(Request $request)
    {
        $request->validate([
            'id_token' => 'required|string',
            'role_type' => 'nullable|string|in:user,arsitek,kontraktor',
        ]);

        $idToken = $request->id_token;
        $response = Http::get("https://oauth2.googleapis.com/tokeninfo?id_token={$idToken}");

        if ($response->failed()) {
            return response()->json(['message' => 'Invalid Google ID token'], 401);
        }

        $payload = $response->json();
        if (!isset($payload['email'])) {
            return response()->json(['message' => 'Email not found in Google ID token'], 400);
        }

        $email = strtolower($payload['email']);
        $name = $payload['name'] ?? 'Google User';
        $user = User::where('email', $email)->first();

        if (!$user) {
            $roleType = $request->role_type ?? 'user';
            $username = strtolower(Str::slug($name) . '_' . Str::random(4));

            $user = User::create([
                'name' => $name,
                'username' => $username,
                'email' => $email,
                'password' => Hash::make(Str::random(24)),
                'role_type' => $roleType,
            ]);

            $this->createRoleProfile($user, $roleType);
            $user->assignRole($roleType);
        }

        if ($user->is_suspended) {
            return response()->json(['message' => 'Your account has been suspended by the administrator.'], 403);
        }

        $user->load([
            'phoneNumber', 'arsitek', 'kontraktor',
            'notaris_profile.services', 'interior_profile', 'project_manager',
            'structural_engineer', 'mep_engineer', 'supplier',
            'roles',
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => new UserResource($user),
        ]);
    }

    private function createRoleProfile(User $user, string $roleType)
    {
        if ($roleType === 'arsitek') {
            Arsitek::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);
            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Architect Profile',
                'body' => 'Your profile is almost ready! Add your skills, rate, and location to attract more clients.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        } elseif ($roleType === 'kontraktor') {
            Kontraktor::create(['user_id' => $user->id, 'nama' => $user->name]);
            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Constructor Profile',
                'body' => 'Your profile is almost ready! Add your skills, rate, and company background to attract more clients.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        }
    }
}
