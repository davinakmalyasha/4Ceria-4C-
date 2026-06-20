<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\SpaController;

// All non-API web traffic routes to the strictly typed React SPA
Route::get('/login', [SpaController::class, 'index'])->name('login');

// Handle static document templates explicitly (with path traversal prevention)
Route::get('/templates/{filename}', [SpaController::class, 'showTemplate']);

Route::get('/', [SpaController::class, 'index']);

Route::get('storage/{path}', [\App\Http\Controllers\StorageFallbackController::class, 'handle'])
    ->where('path', '.*');

Route::get('/{any}', [SpaController::class, 'index'])->where('any', '.*');

