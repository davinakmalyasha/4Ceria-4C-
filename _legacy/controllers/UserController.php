<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    // function __construct(){
    // $this->middleware('permission:user-view|user-edit', ['only'=>['display', 'formEdit', 'editUser']]);
    // }
    public function display()
    {
        $users = User::with('roles')->get();

        return view('users.users-list', compact('users'));
    }

    public function formEdit($id)
    {
        $users = User::find($id);
        $role = \Spatie\Permission\Models\Role::all();

        return view('users.user-edit', compact('users', 'role'));
    }

    public function editUser(Request $request, $id)
    {
        $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255', 'unique:users,username,'.$id],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', 'unique:users,email,'.$id],
            'role_assign' => ['required', 'string'],
        ]);
        $push = User::find($id);
        $push->syncRoles([]);
        $push->assignRole($request->role_assign);
        $push->name = $request->name;
        $push->username = $request->username;
        $push->email = $request->email;
        $push->save();

        return redirect()->route('users.list');
    }
}
