<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\HouseController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectFeatureController;
use App\Http\Controllers\Api\RoomController;
use App\Http\Controllers\MaterialController;
use App\Http\Controllers\MaterialOrderController;
use App\Http\Controllers\MaterialQuoteController;
use App\Http\Controllers\SupplierController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Public API endpoints
Route::get('/houses', [HouseController::class, 'index']);
Route::get('/houses/{house}', [HouseController::class, 'show']);

Route::get('/arsitek', function () {
    return response()->json(['data' => \App\Models\Arsitek::with(['user.phoneNumber', 'ratings', 'projects.images'])->get()]);
});
Route::get('/kontraktor', function () {
    return response()->json(['data' => \App\Models\Kontraktor::with(['user.phoneNumber', 'ratings', 'spesialisasis', 'projects.images'])->get()]);
});
Route::get('/interior', function () {
    return response()->json(['data' => \App\Models\InteriorProfile::with(['user.phoneNumber', 'ratings', 'projects.images'])->get()]);
});
Route::get('/notaris', function () {
    return response()->json(['data' => \App\Models\NotarisProfile::with(['user.phoneNumber', 'ratings', 'services'])->get()]);
});

// Materials Marketplace Public Routes
Route::get('/marketplace/suppliers', [SupplierController::class, 'index']);
Route::get('/marketplace/suppliers/{id}', [SupplierController::class, 'show']);
Route::get('/marketplace/materials', [MaterialController::class, 'index']);

// Public Construction Brief (no auth — accessed via share link)
Route::get('/brief/{token}', [ProjectController::class, 'getPublicBrief']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', function (Request $request) {
        return new \App\Http\Resources\UserResource(
            $request->user()->load([
                'phoneNumber', 'arsitek', 'kontraktor', 
                'notaris_profile', 'interior_profile', 'project_manager',
                'structural_engineer', 'mep_engineer'
            ])
        );
    });
    Route::post('/me/professional', [ProfileController::class, 'updateProfessional']);
    Route::put('/me', function (Request $request) {
        $user = $request->user();
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email,'.$user->id,
            'username' => 'required|string|max:255|unique:users,username,'.$user->id,
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
                if (! in_array($number, $existingNumbers)) {
                    $user->phoneNumber()->create(['contact' => $number]);
                }
            }
        }

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $user->load('phoneNumber'),
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

    // Project Manager Bidding
    Route::post('/projects/{project}/pm-bids', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'store']);
    Route::post('/projects/{project}/pm-bids/{bid}/accept', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'accept']);
    Route::post('/projects/{project}/pm-bids/{bid}/decline', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'decline']);

    // Project Features (Milestones, Comments, Documents)
    Route::get('/projects/{project}/milestones', [ProjectFeatureController::class, 'getMilestones']);
    Route::post('/projects/{project}/milestones', [ProjectFeatureController::class, 'storeMilestone']);
    Route::put('/projects/{project}/milestones/{milestone}', [ProjectFeatureController::class, 'updateMilestone']);
    Route::post('/projects/{project}/milestones/{milestone}/approve', [ProjectFeatureController::class, 'approveMilestone']);
    Route::post('/projects/{project}/milestones/{milestone}/request-revision', [ProjectFeatureController::class, 'requestMilestoneRevision']);
    Route::post('/projects/{project}/seal-design', [ProjectFeatureController::class, 'sealDesign']);
    Route::delete('/projects/{project}/milestones/{milestone}', [ProjectFeatureController::class, 'deleteMilestone']);

    // Construction Daily Logs
    Route::get('/projects/{project}/daily-logs', [ProjectFeatureController::class, 'getDailyLogs']);
    Route::post('/projects/{project}/daily-logs', [ProjectFeatureController::class, 'storeDailyLog']);
    Route::delete('/projects/{project}/daily-logs/{dailyLog}', [ProjectFeatureController::class, 'deleteDailyLog']);

    // Payment Termins
    Route::get('/projects/{project}/payment-termins', [ProjectFeatureController::class, 'getPaymentTermins']);
    Route::post('/projects/{project}/payment-termins', [ProjectFeatureController::class, 'storePaymentTermin']);
    Route::put('/projects/{project}/payment-termins/{termin}', [ProjectFeatureController::class, 'updatePaymentTermin']);
    Route::delete('/projects/{project}/payment-termins/{termin}', [ProjectFeatureController::class, 'deletePaymentTermin']);

    Route::post('/projects/{project}/seal-construction', [ProjectFeatureController::class, 'sealConstruction']);
    Route::post('/projects/{project}/seal-interior', [ProjectFeatureController::class, 'sealInterior']);

    // Phase Brief Lock (Prepare → Lock → Execute lifecycle)
    Route::post('/projects/{project}/lock-brief', [ProjectController::class, 'lockPhaseBrief']);

    // Shareable Brief Link
    Route::post('/projects/{project}/share-token', [ProjectController::class, 'generateShareToken']);
    Route::delete('/projects/{project}/share-token', [ProjectController::class, 'revokeShareToken']);

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

    // Material Requirements (Bill of Materials)
    Route::get('/projects/{project}/requirements', [ProjectFeatureController::class, 'getRequirements']);
    Route::post('/projects/{project}/requirements', [ProjectFeatureController::class, 'storeRequirement']);
    Route::put('/projects/{project}/requirements/{requirement}', [ProjectFeatureController::class, 'updateRequirement']);
    Route::delete('/projects/{project}/requirements/{requirement}', [ProjectFeatureController::class, 'deleteRequirement']);
    Route::post('/projects/{project}/requirements/{requirement}/usage', [ProjectFeatureController::class, 'logRequirementUsage']);
    Route::post('/projects/{project}/requirements/{requirement}/manual-procurement', [ProjectFeatureController::class, 'logExternalProcurement']);

    // Project Budget & Finance Endpoints
    Route::get('/projects/{project}/budget', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'getDashboard']);
    Route::post('/projects/{project}/budget/transactions', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'addTransaction']);
    Route::post('/projects/{project}/budget/mark-paid', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'markPaid']);
    Route::post('/projects/{project}/budget/sandbox', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'addSandboxItem']);
    Route::put('/projects/{project}/budget/sandbox/{id}', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'toggleSandboxItem']);
    Route::put('/projects/{project}/budget/sandbox/{id}/update', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'updateSandboxItem']);
    Route::delete('/projects/{project}/budget/sandbox/{id}', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'deleteSandboxItem']);
    Route::post('/projects/{project}/budget/addendums', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'createAddendum']);
    Route::put('/projects/{project}/budget/addendums/{id}', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'handleAddendumStatus']);

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
        Route::post('/jobs/{id}/status', [\App\Http\Controllers\LogisticsJobController::class, 'updateStatus']);
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
        Route::get('/suppliers', function () {
            return response()->json(['data' => \App\Models\Supplier::with('user')->get()]);
        });
        Route::patch('/suppliers/{id}/status', function (Request $request, $id) {
            $supplier = \App\Models\Supplier::findOrFail($id);
            $supplier->update($request->only(['verification_status', 'rejection_reason']));

            return response()->json(['message' => 'Status updated']);
        });
    });

    // Notary Consultations
    // Route::get('/consultations', [ConsultationController::class, 'index']);
    // Route::post('/consultations', [ConsultationController::class, 'store']);
    // Route::put('/consultations/{consultation}', [ConsultationController::class, 'update']);
    Route::get('/notaris/services', [ProjectController::class, 'getNotarisServices']);
});
