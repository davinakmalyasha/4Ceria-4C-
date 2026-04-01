<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\Admin;

use App\Models\Notification;

class AuthController extends Controller
{
    //
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email|string',
            'password' => 'required|string',
        ]);
        if (!Auth::attempt($request->only('email', 'password'))) {
            return response()->json([
                'message' => 'Invalid login credentials'
            ], 401);
        }
        $user = User::where('email', $request->email)->firstOrFail();
        $token = $user->createToken('auth_token')->plainTextToken;
        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => $user
        ]);
    }
    
    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users',
            'email' => 'required|string|lowercase|email|max:255|unique:users',
            'password' => 'required|string|min:6',
            'role_type' => 'required|in:user,arsitek,kontraktor,admin',
        ]);
        
        $user = User::create([
            'name' => $request->name,
            'username' => $request->username,
            'email' => strtolower($request->email),
            'password' => Hash::make($request->password),
            'role_type' => $request->role_type,
        ]);
        
        if ($request->role_type === 'arsitek') {
            Arsitek::create([ 'user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0 ]);
            
            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Architect Profile',
                'body' => 'Your profile is almost ready! Add your skills, rate, and location to attract more clients.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile']
            ]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Get Verified to Start Bidding',
                'body' => 'Verified architects are more trusted. Upload your certifications now.',
                'data' => ['tab' => 'profile', 'action' => 'verify']
            ]);
        } elseif ($request->role_type === 'kontraktor') {
            Kontraktor::create([ 'user_id' => $user->id, 'nama' => $user->name ]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Constructor Profile',
                'body' => 'Your profile is almost ready! Add your skills, rate, and company background to attract more clients.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile']
            ]);

            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Get Verified to Start Bidding',
                'body' => 'Verified constructors are more trusted. Upload your business permits and NPWP now.',
                'data' => ['tab' => 'profile', 'action' => 'verify']
            ]);
        } elseif ($request->role_type === 'admin') {
            Admin::create([ 'user_id' => $user->id, 'nama' => $user->name ]);
        }
        
        if ($request->role_type === 'arsitek') {
            $user->assignRole('arsitek');
        } elseif ($request->role_type === 'kontraktor') {
            $user->assignRole('kontraktor');
        } elseif ($request->role_type === 'admin') {
            $user->assignRole('admin');
        } else {
            $user->assignRole('user');
        }
        
        $token = $user->createToken('auth_token')->plainTextToken;
        
        return response()->json([
            'message' => 'User created successfully',
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => $user
        ], 201);
    }
    
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json([
            'message' => 'Logged out successfully'
        ]);
    }
}
