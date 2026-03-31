<?php

use Illuminate\Support\Facades\Route;

// All non-API web traffic routes to the strictly typed React SPA
Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');

