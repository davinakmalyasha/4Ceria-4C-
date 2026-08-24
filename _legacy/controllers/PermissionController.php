<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;

class PermissionController extends Controller
{
    public function index()
    {
        $permissions = Permission::all();

        return view('permissions.permissions-list', compact('permissions'));
    }

    public function createPermissionForm()
    {
        return view('permissions.permission-create');
    }

    public function createPermission(Request $request)
    {
        $request->validate([
            'name' => ['required', 'string', 'max:25'],
        ]);
        Permission::create([
            'name' => $request->name,
        ]);

        return redirect()->route('permissions.list');
    }
}
