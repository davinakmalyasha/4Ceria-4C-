<?php

namespace App\Http\Controllers;

use App\Models\House;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
// use App\Http\Controllers\Hash;

class ProfilController extends Controller
{
    public function index()
    {
        $user = Auth::user();
        $houses = House::with(['housePic' => function ($query){
            $query->limit(1);
        } ])->where('id_user', Auth::id())->get();
        // return view('profile', compact('user', 'houses'));
        return view($houses);
    }

    public function updateProfile(Request $request, $id)
    {
        $request->validate([
            'update_name' => 'required|string|max:255',
            'update_username' => 'required|string|max:255',
            'update_email' => 'required|email|max:255',
            'update_password' => 'nullable|string|min:6',
            'update_deskripsi' => 'nullable|string|max:255',
            'update_pNumber' => 'max:15',
            'pic' => 'nullable|image|mimes:jpeg,png,jpg,gif,svg|max:2048',
        ]);
       
        $user = User::find($id);
        $user->username = $request->update_username;
        $user->name = $request->update_name;
        $user->email = $request->update_email;
        // $user->phone_number = $request->update_pNumber;
        $user->Deskripsi = $request->update_deskripsi;

        if ($request->hasFile('pic')) {
            if ($user->pic && Storage::exists('public/profileUser/'.$user->pic)) {
                Storage::delete('public/profileUser/'.$user->pic);
            }
            
            // Simpan foto baru di folder profileUser
            $path = $request->file('pic')->store('profileUser', 'public');
            $user->pic = $path;
        }
        if ($request->filled('update_password')) {
            $user->password = Hash::make($request->update_password);
        }
        $user->save();

        return redirect()->back()->with('success', 'Profile updated successfully.');
        // return $user;
    }

    public function deleteHouse($id)
    {
        DB::table('house')->where('id', $id)->delete();
        return redirect()->back()->with('success', 'House deleted successfully.');
    }
}