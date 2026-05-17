<?php

use Illuminate\Support\Facades\Route;

// All non-API web traffic routes to the strictly typed React SPA
Route::get('/login', function () {
    return view('app');
})->name('login');

// Handle static document templates explicitly
Route::get('/templates/{filename}', function ($filename) {
    if (file_exists(public_path('templates/' . $filename))) {
        return response()->file(public_path('templates/' . $filename));
    }
    abort(404);
});

Route::get('/', function () {
    return view('app');
});

Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');
