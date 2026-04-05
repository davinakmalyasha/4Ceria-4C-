<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\HouseController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectFeatureController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\RoomController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\MaterialController;
use App\Http\Controllers\MaterialQuoteController;
use App\Http\Controllers\MaterialOrderController;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Public API endpoints
Route::get('/houses', [HouseController::class, 'index']);
Route::get('/houses/{house}', [HouseController::class, 'show']);

Route::get('/arsitek', function () {
    return response()->json(['data' => \App\Models\Arsitek::with(['user.phoneNumber', 'ratings', 'projects'])->get()]);
});
Route::get('/kontraktor', function () {
    return response()->json(['data' => \App\Models\Kontraktor::with(['user.phoneNumber', 'ratings', 'spesialisasis', 'projects'])->get()]);
});

// Materials Marketplace Public Routes
Route::get('/marketplace/suppliers', [SupplierController::class, 'index']);
Route::get('/marketplace/suppliers/{id}', [SupplierController::class, 'show']);
Route::get('/marketplace/materials', [MaterialController::class, 'index']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', function (Request $request) {
        return $request->user()->load(['phoneNumber', 'arsitek', 'kontraktor']);
    });
    Route::post('/me/professional', [ProfileController::class, 'updateProfessional']);
    Route::put('/me', function (Request $request) {
        $user = $request->user();
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email,' . $user->id,
            'username' => 'required|string|max:255|unique:users,username,' . $user->id,
            'phone_numbers' => 'nullable|array',
            'phone_numbers.*' => 'required|string|max:20',
        ]);
        
        $user->update([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'username' => $validated['username'],
        ]);

        if ($request->has('phone_numbers')) {
            // Delete numbers that are not in the provided list
            $user->phoneNumber()->whereNotIn('contact', $validated['phone_numbers'])->delete();

            // Add new numbers that are not already in the database
            $existingNumbers = $user->phoneNumber()->pluck('contact')->toArray();
            foreach ($validated['phone_numbers'] as $number) {
                if (!in_array($number, $existingNumbers)) {
                    $user->phoneNumber()->create(['contact' => $number]);
                }
            }
        }

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $user->load('phoneNumber')
        ]);
    });
    
    // House Management
    Route::apiResource('houses', HouseController::class)->except(['index', 'show']);
    
    // Room Management
    Route::post('houses/{house}/rooms', [RoomController::class, 'store']);
    Route::delete('rooms/{room}', [RoomController::class, 'destroy']);

    // Protected API endpoints
    Route::apiResource('projects', ProjectController::class)->except(['index', 'show']);
    Route::post('/projects/{project}/update', [ProjectController::class, 'update']);
    Route::post('/projects/{project}/bids', [ProjectController::class, 'submitBid']);
    Route::post('/projects/{project}/accept-bid', [ProjectController::class, 'acceptBid']);
    Route::post('/projects/{project}/decline-bid', [ProjectController::class, 'declineBid']);
    Route::get('/my-bids', [ProjectController::class, 'myBids']);

    // Project Features (Milestones, Comments, Documents)
    Route::get('/projects/{project}/milestones', [ProjectFeatureController::class, 'getMilestones']);
    Route::post('/projects/{project}/milestones', [ProjectFeatureController::class, 'storeMilestone']);
    Route::put('/projects/{project}/milestones/{milestone}', [ProjectFeatureController::class, 'updateMilestone']);
    Route::delete('/projects/{project}/milestones/{milestone}', [ProjectFeatureController::class, 'deleteMilestone']);

    Route::get('/projects/{project}/comments', [ProjectFeatureController::class, 'getComments']);
    Route::post('/projects/{project}/comments', [ProjectFeatureController::class, 'storeComment']);
    Route::put('/projects/{project}/comments/{comment}', [ProjectFeatureController::class, 'updateComment']);
    Route::delete('/projects/{project}/comments/{comment}', [ProjectFeatureController::class, 'deleteComment']);
    
    // Reviews
    Route::post('/projects/{project}/review', [\App\Http\Controllers\Api\ReviewController::class, 'store']);

    Route::get('/projects/{project}/documents', [ProjectFeatureController::class, 'getDocuments']);
    Route::post('/projects/{project}/documents', [ProjectFeatureController::class, 'storeDocument']);
    Route::delete('/projects/{project}/documents/{document}', [ProjectFeatureController::class, 'deleteDocument']);

    // Ratings & Activity Log
    Route::post('/projects/{project}/rate', [ProjectFeatureController::class, 'rateProject']);
    Route::get('/projects/{project}/activity', [ProjectFeatureController::class, 'getActivity']);

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);

    // Chat
    Route::get('/conversations', [ChatController::class, 'index']);
    Route::post('/conversations', [ChatController::class, 'store']);
    Route::get('/conversations/{conversation}', [ChatController::class, 'show']);
    Route::post('/conversations/{conversation}/messages', [ChatController::class, 'sendMessage']);

    // Supplier & Merchant Management
    Route::prefix('merchant')->group(function () {
        Route::get('/profile', [SupplierController::class, 'getProfile']);
        Route::put('/profile', [SupplierController::class, 'updateProfile']);
        Route::get('/materials', [MaterialController::class, 'merchantIndex']);
        Route::apiResource('materials', MaterialController::class)->except(['index']);
    });

    // Logistics & Courier Management
    Route::prefix('logistics')->group(function () {
        Route::get('/dashboard-stats', [\App\Http\Controllers\LogisticsJobController::class, 'dashboardStats']);
        Route::get('/available-jobs', [\App\Http\Controllers\LogisticsJobController::class, 'availableJobs']);
        Route::get('/my-jobs', [\App\Http\Controllers\LogisticsJobController::class, 'myJobs']);
        Route::post('/jobs/{id}/accept', [\App\Http\Controllers\LogisticsJobController::class, 'acceptJob']);
        Route::put('/jobs/{id}/status', [\App\Http\Controllers\LogisticsJobController::class, 'updateStatus']);
    });

    // Material Quotes / Procurement Flow
    Route::get('/material-quotes', [MaterialQuoteController::class, 'index']);
    Route::post('/material-quotes', [MaterialQuoteController::class, 'store']);
    Route::put('/material-quotes/{quote}/request-payment', [MaterialQuoteController::class, 'requestPayment']);
    Route::put('/material-quotes/{quote}/mark-paid', [MaterialQuoteController::class, 'markAsPaid']);
    Route::post('/material-quotes/{quote}/post-delivery-job', [MaterialQuoteController::class, 'postDeliveryJob']);
    Route::get('/delivery-jobs', [MaterialQuoteController::class, 'getDeliveryJobs']);
    Route::post('/material-quotes/{quote}/approve', [MaterialQuoteController::class, 'approve']);

    // Material Orders / Fulfillment Flow
    Route::apiResource('material-orders', MaterialOrderController::class)->only(['index', 'show', 'update']);

    // Material Order Review Routes
    Route::post('/material-order-reviews', [\App\Http\Controllers\MaterialOrderReviewController::class, 'store']);
    Route::put('/material-order-reviews/{material_order_review}', [\App\Http\Controllers\MaterialOrderReviewController::class, 'update']);
    Route::delete('/material-order-reviews/{material_order_review}', [\App\Http\Controllers\MaterialOrderReviewController::class, 'destroy']);
    Route::get('/suppliers/{supplier}/reviews', [\App\Http\Controllers\MaterialOrderReviewController::class, 'getBySupplier']);

    // Admin Routes
    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('/stats', [\App\Http\Controllers\Api\Admin\AdminDashboardController::class, 'stats']);
        Route::get('/professionals', [\App\Http\Controllers\Api\Admin\VerificationController::class, 'index']);
        Route::patch('/professionals/{type}/{id}/status', [\App\Http\Controllers\Api\Admin\VerificationController::class, 'updateStatus']);
        Route::get('/houses', [\App\Http\Controllers\Api\Admin\AdminDashboardController::class, 'houses']);
        Route::get('/projects', [\App\Http\Controllers\Api\Admin\AdminDashboardController::class, 'projects']);
        
        // Supplier Verification
        Route::get('/suppliers', function() {
            return response()->json(['data' => \App\Models\Supplier::with('user')->get()]);
        });
        Route::patch('/suppliers/{id}/status', function(Request $request, $id) {
            $supplier = \App\Models\Supplier::findOrFail($id);
            $supplier->update($request->only(['verification_status', 'rejection_reason']));
            return response()->json(['message' => 'Status updated']);
        });
    });
});
