<?php

namespace App\Http\Controllers;

class SpaController extends Controller
{
    public function index()
    {
        return view('app');
    }

    public function showTemplate($filename)
    {
        $safeName = basename($filename);
        $path = public_path('templates/' . $safeName);
        
        if (file_exists($path)) {
            return response()->file($path);
        }
        abort(404);
    }
}
