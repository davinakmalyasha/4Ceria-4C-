<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class PageController extends Controller
{
    public function profile(Request $request)
    {
        $tab = $request->query('tab', 'profile'); // Default tab adalah 'profile'

        return view('profile', compact('tab'));
    }
}
