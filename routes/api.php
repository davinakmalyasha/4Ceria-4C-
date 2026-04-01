<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\HouseController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectFeatureController;

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
    Route::get('/my-bids', [ProjectController::class, 'myBids']);

    // Project Features (Milestones, Comments, Documents)
    Route::get('/projects/{project}/milestones', [ProjectFeatureController::class, 'getMilestones']);
    Route::post('/projects/{project}/milestones', [ProjectFeatureController::class, 'storeMilestone']);
    Route::put('/milestones/{milestone}', [ProjectFeatureController::class, 'updateMilestone']);
    Route::delete('/projects/{project}/milestones/{milestone}', [ProjectFeatureController::class, 'deleteMilestone']);

    Route::get('/projects/{project}/comments', [ProjectFeatureController::class, 'getComments']);
    Route::post('/projects/{project}/comments', [ProjectFeatureController::class, 'storeComment']);

    Route::get('/projects/{project}/documents', [ProjectFeatureController::class, 'getDocuments']);
    Route::post('/projects/{project}/documents', [ProjectFeatureController::class, 'storeDocument']);
    Route::delete('/projects/{project}/documents/{document}', [ProjectFeatureController::class, 'deleteDocument']);

    // Ratings & Activity Log
    Route::post('/projects/{project}/rate', [ProjectFeatureController::class, 'rateProject']);
    Route::get('/projects/{project}/activity', [ProjectFeatureController::class, 'getActivity']);
});
