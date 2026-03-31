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
        } elseif ($request->role_type === 'kontraktor') {
            Kontraktor::create([ 'user_id' => $user->id, 'nama' => $user->name ]);
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
