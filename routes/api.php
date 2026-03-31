<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\HouseController;
use App\Http\Controllers\Api\ProjectController;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Public API endpoints
Route::get('/houses', [HouseController::class, 'index']);
Route::get('/houses/{house}', [HouseController::class, 'show']);
Route::get('/projects', [ProjectController::class, 'index']);
Route::get('/projects/{project}', [ProjectController::class, 'show']);

Route::get('/arsitek', function () {
    return response()->json(['data' => \App\Models\Arsitek::with(['user', 'ratings'])->get()]);
});
Route::get('/kontraktor', function () {
    return response()->json(['data' => \App\Models\Kontraktor::with(['user', 'ratings', 'spesialisasis'])->get()]);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', function (Request $request) {
        return $request->user();
    });
    Route::put('/me', function (Request $request) {
        $user = $request->user();
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email,' . $user->id,
            'username' => 'required|string|max:255|unique:users,username,' . $user->id,
        ]);
        $user->update($validated);
        return response()->json(['message' => 'Profile updated successfully', 'user' => $user]);
    });
    
    // Protected API endpoints
    Route::apiResource('houses', HouseController::class)->except(['index', 'show']);
    Route::apiResource('projects', ProjectController::class)->except(['index', 'show']);
    Route::post('/projects/{project}/bids', [ProjectController::class, 'submitBid']);
    Route::post('/projects/{project}/accept-bid', [ProjectController::class, 'acceptBid']);
    Route::post('/projects/{project}/decline-bid', [ProjectController::class, 'declineBid']);
});
