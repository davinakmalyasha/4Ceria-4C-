<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    public function index()
    {
        $roles = Role::all();

        return view('roles.role-list', compact('roles'));
    }

    public function view($id)
    {
        $role = Role::with('permissions')->find($id);
        $permissions = Permission::all();

        return view('roles.role-view', compact('role', 'permissions'));
    }

    public function roleCreateForm()
    {
        $permission = Permission::all();

        return view('roles.role-create', compact('permission'));
    }

    public function createRole(Request $request)
    {
        $request->validate([
            'name' => ['required', 'string', 'max:75'],
            'permissions' => 'array',
        ]);

        Role::create(['name' => $request->name]);
        $role = Role::findByName($request->name);
        if ($request->permissions != null) {
            for ($i = 0; $i < count($request->permissions); $i++) {
                $role->givePermissionTo($request->permissions[$i]);
            }
        }

        return redirect()->route('role.list');
    }

    public function editRole(Request $request, $id)
    {
        $request->validate([
            'name' => ['required', 'string', 'max:75'],
            'permissions' => 'array',
        ]);
        $role = Role::find($id);
        $role->syncPermissions([]);
        $role->name = $request->name;
        if ($request->permissions != null) {
            for ($i = 0; $i < count($request->permissions); $i++) {
                $role->givePermissionTo($request->permissions[$i]);
            }
        }
        $role->save;

        return redirect()->route('role.list');
    }

    public function destroyRole(Role $role, $id)
    {
        $role = Role::find($id);
        $role->syncPermissions([]);
        try {
            $role->delete();

            return redirect()->route('role.list');
        } catch (\Throwable $e) {
            return redirect()->route('role.list')->with('error', 'An error occured '.$e->getMessage());
        }
    }
}
