<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\HouseController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectFeatureController;
use App\Http\Controllers\Api\ProjectPaymentTerminController;
use App\Http\Controllers\Api\ProjectEngineeringController;
use App\Http\Controllers\Api\ProjectAddendumController;
use App\Http\Controllers\Api\ProjectPhaseController;
use App\Http\Controllers\Api\ProjectActivityController;
use App\Http\Controllers\Api\RoomController;
use App\Http\Controllers\MaterialController;
use App\Http\Controllers\MaterialOrderController;
use App\Http\Controllers\MaterialQuoteController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\Api\ProjectLegalController;
use App\Http\Controllers\Api\ProjectExtensionController;
use App\Http\Controllers\Api\ProjectWarrantyController;
use App\Http\Controllers\Api\ProjectDailyLogController;
use App\Http\Controllers\Api\ProjectRequirementController;
use App\Http\Controllers\Api\ProjectRequirementHistoryController;
use App\Http\Controllers\Api\ProjectDocumentController;
use App\Http\Controllers\Api\ProjectCommentController;
use App\Http\Controllers\Api\ProjectMilestoneController;
use App\Http\Controllers\Api\ProjectHandoverController;
use App\Http\Controllers\Api\ProjectReportController;
use App\Http\Controllers\Api\ProjectScheduleController;
use App\Http\Controllers\Api\SubProfessionalController;
use App\Http\Controllers\Api\ContractorSubspecialtyController;
use App\Http\Controllers\Api\HireHistoryController;
use App\Http\Controllers\Api\TeamMemberController;
use App\Http\Controllers\Api\FirmMemberController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Public API endpoints
Route::get('/houses', [HouseController::class, 'index']);
Route::get('/houses/{house}', [HouseController::class, 'show']);

Route::get('/arsitek', function () {
    return response()->json(['data' => \App\Models\Arsitek::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'projects.images'])->get()]);
});
Route::get('/kontraktor', function () {
    return response()->json(['data' => \App\Models\Kontraktor::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'spesialisasis', 'projects.images'])->get()]);
});
Route::get('/interior', function () {
    return response()->json(['data' => \App\Models\InteriorProfile::with(['user.phoneNumber', 'ratings', 'projects.images'])->get()]);
});
Route::get('/notaris', function () {
    return response()->json(['data' => \App\Models\NotarisProfile::with(['user.phoneNumber', 'ratings', 'services'])->get()]);
});
Route::get('/project-manager', function () {
    return response()->json(['data' => \App\Models\ProjectManager::with(['user.phoneNumber', 'ratings', 'projects.images'])->get()]);
});
Route::get('/structural-engineers', function () {
    return response()->json(['data' => \App\Models\StructuralEngineer::with(['user.phoneNumber'])->get()]);
});
Route::get('/mep-engineers', function () {
    return response()->json(['data' => \App\Models\MepEngineer::with(['user.phoneNumber'])->get()]);
});

// Materials Marketplace Public Routes
Route::get('/marketplace/suppliers', [SupplierController::class, 'index']);
Route::get('/marketplace/suppliers/{id}', [SupplierController::class, 'show']);
Route::get('/marketplace/materials', [MaterialController::class, 'index']);

// Public Construction Brief (no auth — accessed via share link)
Route::get('/brief/{token}', [ProjectController::class, 'getPublicBrief']);

Route::middleware(['auth:sanctum', 'freeze_pending_termination'])->group(function () {
    Route::get('/hire-history', [HireHistoryController::class, 'index']);
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', function (Request $request) {
        $user = $request->user();
        $relations = [
            'phoneNumber', 'arsitek', 'kontraktor',
            'notaris_profile.services', 'interior_profile', 'project_manager',
            'roles',
            // 'structural_engineer', 'mep_engineer',
        ];
        if (in_array($user->role_type, ['arsitek', 'kontraktor'])) {
            $relations[] = 'teamMembers';
        }
        return new \App\Http\Resources\UserResource($user->load($relations));
    });
    Route::post('/me/professional', [ProfileController::class, 'updateProfessional']);
    Route::post('/me/avatar', function (Request $request) {
        $request->validate([
            'pic' => 'required|image|mimes:jpeg,png,jpg,gif,svg|max:2048',
        ]);

        $user = $request->user();

        if ($user->pic && \Illuminate\Support\Facades\Storage::disk('public')->exists($user->pic)) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($user->pic);
        }

        $path = \App\Services\ImageService::convertToWebp($request->file('pic'), 'profileUser');
        $user->update(['pic' => $path]);

        return response()->json([
            'message' => 'Avatar updated successfully',
            'pic' => asset('storage/' . $path),
        ]);
    });

    Route::delete('/me/avatar', function (Request $request) {
        $user = $request->user();

        if ($user->pic && \Illuminate\Support\Facades\Storage::disk('public')->exists($user->pic)) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($user->pic);
        }

        $user->update(['pic' => null]);

        return response()->json([
            'message' => 'Avatar deleted successfully',
        ]);
    });
    Route::get('/portfolios', [\App\Http\Controllers\Api\PortfolioController::class, 'index']);
    Route::post('/portfolios', [\App\Http\Controllers\Api\PortfolioController::class, 'store']);
    Route::delete('/portfolios/{id}', [\App\Http\Controllers\Api\PortfolioController::class, 'destroy']);
    Route::put('/me', function (Request $request) {
        $user = $request->user();
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email,'.$user->id,
            'username' => 'required|string|max:255|unique:users,username,'.$user->id,
            'phone_numbers' => 'nullable|array',
            'phone_numbers.*' => 'required|string|max:20',
        ], [
            'phone_numbers.*.max' => 'Each phone number must not be greater than 20 characters.',
            'phone_numbers.*.required' => 'Phone numbers cannot be blank.',
        ]);

        $user->update([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'username' => $validated['username'],
        ]);

        if ($request->has('phone_numbers') && !empty($validated['phone_numbers'])) {
            $firstPhone = $validated['phone_numbers'][0];

            // Update arsitek/kontraktor phone if profile exists
            if ($user->arsitek) {
                $user->arsitek->update(['no_telp' => $firstPhone]);
            }
            if ($user->kontraktor) {
                $user->kontraktor->update(['no_telepon' => $firstPhone]);
            }

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

        $relations = [
            'phoneNumber', 'arsitek', 'kontraktor',
            'notaris_profile.services', 'interior_profile', 'project_manager',
            'roles',
        ];
        if (in_array($user->role_type, ['arsitek', 'kontraktor'])) {
            $relations[] = 'teamMembers';
        }

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => new \App\Http\Resources\UserResource($user->load($relations)),
        ]);
    });

    // House Management
    Route::apiResource('houses', HouseController::class)->except(['index', 'show']);

    // Room Management
    Route::post('houses/{house}/rooms', [RoomController::class, 'store']);
    Route::delete('rooms/{room}', [RoomController::class, 'destroy']);

    // Protected API endpoints
    Route::get('/portfolios', [\App\Http\Controllers\Api\PortfolioController::class, 'index']);
    Route::post('/portfolios', [\App\Http\Controllers\Api\PortfolioController::class, 'store']);
    Route::delete('/portfolios/{id}', [\App\Http\Controllers\Api\PortfolioController::class, 'destroy']);
    
    Route::apiResource('projects', ProjectController::class)->except(['index', 'show']);
    Route::post('/projects/{project}/update', [ProjectController::class, 'update']);
    Route::post('/upload', [ProjectController::class, 'uploadFile']);
    Route::post('/projects/{project}/bids', [ProjectController::class, 'submitBid']);
    Route::post('/projects/{project}/accept-bid', [ProjectController::class, 'acceptBid']);
    Route::post('/projects/{project}/shortlist-bid', [ProjectController::class, 'shortlistBid']);
    Route::post('/projects/{project}/decline-bid', [ProjectController::class, 'declineBid']);
    Route::get('/my-bids', [ProjectController::class, 'myBids']);
    Route::get('/user/active-projects', [ProjectController::class, 'getActiveProjects']);
    Route::post('/projects/{project}/invite', [ProjectController::class, 'inviteProfessional']);
    Route::post('/projects/{project}/propose-fee', [ProjectController::class, 'proposeFeeAndTermins']);
    Route::post('/projects/{project}/bids/{bid}/negotiate', [ProjectController::class, 'negotiateBidFee']);
    Route::post('/projects/{project}/bids/{bid}/confirm-fee', [ProjectController::class, 'confirmBidFee']);
    Route::post('/projects/{project}/bids/{bid}/sign-contract', [ProjectController::class, 'signContract']);
    Route::post('/projects/{project}/termins/{termin}/upload-proof', [ProjectPaymentTerminController::class, 'uploadProof']);
    Route::post('/projects/{project}/termins/{termin}/verify-payment', [ProjectPaymentTerminController::class, 'verifyPayment']);
    Route::post('/projects/{project}/bids/{bid}/accept-invite', [ProjectController::class, 'acceptInvite']);
    Route::post('/projects/{project}/bids/{bid}/reject-invite', [ProjectController::class, 'rejectInvite']);
    Route::post('/projects/{project}/bids/{bid}/verify-payment', [ProjectController::class, 'verifyBidPayment']);
    Route::post('/projects/{project}/bids/{bid}/upload-payment-proof', [ProjectController::class, 'uploadBidPaymentProof']);
    Route::post('/projects/{project}/terminate', [\App\Http\Controllers\Api\ProjectTerminationController::class, 'fireProfessional']);
    Route::post('/projects/{project}/resign', [\App\Http\Controllers\Api\ProjectTerminationController::class, 'resignFromProject']);
    
    // Mutual Termination Routes
    Route::post('/projects/{project}/mutual-termination/initiate', [\App\Http\Controllers\Api\ProjectMutualTerminationController::class, 'initiate']);
    Route::post('/projects/{project}/mutual-termination/{termination}/respond', [\App\Http\Controllers\Api\ProjectMutualTerminationController::class, 'respond']);
    Route::post('/projects/{project}/mutual-termination/{termination}/escalate', [\App\Http\Controllers\Api\ProjectMutualTerminationController::class, 'escalate']);

    // Project Manager Bidding
    Route::post('/projects/{project}/pm-bids', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'store']);
    Route::post('/projects/{project}/pm-bids/{bid}/accept', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'accept']);
    Route::post('/projects/{project}/pm-bids/{bid}/shortlist', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'shortlist']);
    Route::post('/projects/{project}/pm-bids/{bid}/decline', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'decline']);

    // Project Features (Milestones, Comments, Documents)
    Route::get('/projects/{project}/milestones', [ProjectMilestoneController::class, 'index']);
    Route::post('/projects/{project}/milestones', [ProjectMilestoneController::class, 'store']);
    Route::put('/projects/{project}/milestones/{milestone}', [ProjectMilestoneController::class, 'update']);
    Route::post('/projects/{project}/milestones/{milestone}/approve', [ProjectMilestoneController::class, 'approve']);
    Route::post('/projects/{project}/milestones/{milestone}/request-revision', [ProjectMilestoneController::class, 'requestRevision']);
    Route::post('/projects/{project}/technical-audit-submit', [ProjectMilestoneController::class, 'submitTechnicalAudit']);
    Route::post('/projects/{project}/seal-design', [ProjectPhaseController::class, 'sealDesign']);
    Route::delete('/projects/{project}/milestones/{milestone}', [ProjectMilestoneController::class, 'destroy']);
    Route::post('/projects/{project}/milestones/{milestone}/verify-pm', [ProjectMilestoneController::class, 'verifyPM']);
    
    // Sticky Notes
    Route::get('/projects/{project}/sticky-notes', [\App\Http\Controllers\StickyNoteController::class, 'index']);
    Route::post('/projects/{project}/sticky-notes', [\App\Http\Controllers\StickyNoteController::class, 'store']);
    Route::put('/projects/{project}/sticky-notes/{stickyNote}', [\App\Http\Controllers\StickyNoteController::class, 'update']);
    Route::delete('/projects/{project}/sticky-notes/{stickyNote}', [\App\Http\Controllers\StickyNoteController::class, 'destroy']);


    // Construction Daily Logs
    Route::get('/projects/{project}/daily-logs', [ProjectDailyLogController::class, 'index']);
    Route::post('/projects/{project}/daily-logs', [ProjectDailyLogController::class, 'store']);
    Route::delete('/projects/{project}/daily-logs/{dailyLog}', [ProjectDailyLogController::class, 'destroy']);

    // Payment Termins
    Route::get('/projects/{project}/payment-termins', [ProjectPaymentTerminController::class, 'getPaymentTermins']);
    Route::post('/projects/{project}/payment-termins', [ProjectPaymentTerminController::class, 'storePaymentTermin']);
    Route::put('/projects/{project}/payment-termins/{termin}', [ProjectPaymentTerminController::class, 'updatePaymentTermin']);
    Route::delete('/projects/{project}/payment-termins/{termin}', [ProjectPaymentTerminController::class, 'deletePaymentTermin']);
    Route::post('/projects/{project}/payment-termins/{termin}/link-milestone', [ProjectPaymentTerminController::class, 'linkMilestone']);

    // Engineering Manual Logs
    Route::post('/projects/{project}/engineering-logs', [ProjectEngineeringController::class, 'storeLog']);
    Route::delete('/projects/{project}/engineering-logs/{milestone}', [ProjectEngineeringController::class, 'deleteLog']);
    Route::post('/projects/{project}/payment-termins/{termin}/unlink-milestone', [ProjectPaymentTerminController::class, 'unlinkMilestone']);
    
    // Proof of Transfer Endpoints
    Route::post('/projects/{project}/payments/{type}/{id}/upload-proof', [\App\Http\Controllers\Api\PaymentVerificationController::class, 'uploadProof']);
    Route::post('/projects/{project}/payments/{type}/{id}/verify-proof', [\App\Http\Controllers\Api\PaymentVerificationController::class, 'verifyProof']);

    Route::post('/projects/{project}/seal-construction', [ProjectPhaseController::class, 'sealConstruction']);
    Route::post('/projects/{project}/seal-interior', [ProjectPhaseController::class, 'sealInterior']);
    Route::post('/projects/{project}/seal-legal', [ProjectPhaseController::class, 'sealLegal']);
    Route::post('/projects/{project}/authorize-phase', [ProjectPhaseController::class, 'authorizePhase']);
    Route::post('/projects/{project}/kickoff', [ProjectPhaseController::class, 'issueKickoff']);
    Route::post('/projects/{project}/verify-design', [ProjectPhaseController::class, 'verifyDesign']);
    Route::post('/projects/{project}/verify-construction', [ProjectPhaseController::class, 'verifyConstruction']);
    Route::post('/projects/{project}/verify-interior', [ProjectPhaseController::class, 'verifyInterior']);
    Route::post('/projects/{project}/verify-legal', [ProjectPhaseController::class, 'verifyLegal']);
    Route::get('/projects/{project}/legal-financials', [ProjectLegalController::class, 'getFinancials']);
    Route::post('/projects/{project}/legal-disbursements', [ProjectLegalController::class, 'storeDisbursement']);
    Route::post('/projects/{project}/legal-disbursements/{id}/verify', [ProjectLegalController::class, 'verifyDisbursement']);
    Route::post('/projects/{project}/finalize-legal-scope', [ProjectLegalController::class, 'finalizeLegalScope']);

    Route::post('/projects/{project}/milestones/{milestone}/furniture-addendum', [ProjectAddendumController::class, 'createFurnitureAddendum']);
    Route::post('/projects/{project}/handover/approve', [ProjectHandoverController::class, 'approveHandover']);
    Route::post('/projects/{project}/handover/reject', [ProjectHandoverController::class, 'requestHandoverRevision']);

    // Owner Confirmation & Final Handover
    Route::post('/projects/{project}/initiate-walkthrough', [ProjectHandoverController::class, 'initiateWalkthrough']);
    Route::post('/projects/{project}/owner-accept', [ProjectHandoverController::class, 'ownerAcceptProject']);

    // Snag Items (Defect Tracking)
    Route::get('/projects/{project}/snag-items', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'getSnagItems']);
    Route::post('/projects/{project}/snag-items', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'storeSnagItem']);
    Route::put('/projects/{project}/snag-items/{snagItem}', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'updateSnagItemStatus']);
    Route::post('/projects/{project}/snag-items/{snagItem}/accept', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'acceptSnagResolution']);

    // Change Orders
    Route::get('/projects/{project}/change-orders', [\App\Http\Controllers\Api\ProjectChangeOrderController::class, 'index']);
    Route::post('/projects/{project}/change-orders', [\App\Http\Controllers\Api\ProjectChangeOrderController::class, 'store']);
    Route::post('/projects/{project}/change-orders/{changeOrder}/pm-review', [\App\Http\Controllers\Api\ProjectChangeOrderController::class, 'pmReview']);
    Route::post('/projects/{project}/change-orders/{changeOrder}/owner-decide', [\App\Http\Controllers\Api\ProjectChangeOrderController::class, 'ownerDecide']);
    Route::get('/projects/{project}/bast', [ProjectHandoverController::class, 'getBASTData']);

    // Timeline Extensions
    Route::get('/projects/{project}/extensions', [ProjectExtensionController::class, 'index']);
    Route::post('/projects/{project}/extensions', [ProjectExtensionController::class, 'store']);
    Route::post('/projects/{project}/extensions/{extension}/pm-review', [ProjectExtensionController::class, 'pmReview']);
    Route::post('/projects/{project}/extensions/{extension}/owner-decide', [ProjectExtensionController::class, 'ownerDecide']);

    // Warranty Claims
    Route::get('/projects/{project}/warranty-claims', [ProjectWarrantyController::class, 'index']);
    Route::post('/projects/{project}/warranty-claims', [ProjectWarrantyController::class, 'store']);
    Route::put('/projects/{project}/warranty-claims/{claim}/status', [ProjectWarrantyController::class, 'updateStatus']);

    // Technical Resourcing (Engineering)
    Route::post('/projects/{project}/request-engineering', [ProjectEngineeringController::class, 'requestEngineeringRole']);
    Route::post('/projects/{project}/verify-engineering/{addendum}', [ProjectEngineeringController::class, 'verifyEngineeringRequest']);
    Route::post('/projects/{project}/approve-engineering-hire/{addendum}', [ProjectEngineeringController::class, 'approveEngineeringHire']);
    Route::post('/projects/{project}/reject-engineering-hire/{addendum}', [ProjectEngineeringController::class, 'rejectEngineeringHire']);
    Route::post('/projects/{project}/approve-engineering', [ProjectEngineeringController::class, 'approveEngineeringIntegration']);
    Route::post('/projects/{project}/request-engineering-revision', [ProjectEngineeringController::class, 'requestEngineeringRevision']);
    Route::post('/projects/{project}/invite-engineering-vendor', [\App\Http\Controllers\Api\EngineeringProcurementController::class, 'inviteVendor']);
    Route::post('/projects/{project}/submit-engineering-interview', [\App\Http\Controllers\Api\EngineeringProcurementController::class, 'submitInterview']);
    Route::post('/projects/{project}/authorize-specialist', [ProjectEngineeringController::class, 'authorizeSpecialist']);
    Route::post('/projects/{project}/reject-specialist', [ProjectEngineeringController::class, 'rejectSpecialist']);

    // Phase Brief Lock (Prepare → Lock → Execute lifecycle)
    Route::post('/projects/{project}/submit-planning', [ProjectController::class, 'submitPlanning']);
    Route::post('/projects/{project}/approve-planning', [ProjectController::class, 'approvePlanning']);
    Route::post('/projects/{project}/verify-payment', [ProjectController::class, 'verifyDesignPayment']);
    Route::post('/projects/{project}/update-planning-audit', [ProjectController::class, 'updatePlanningAudit']);
    Route::post('/projects/{project}/verify-planning-pm', [ProjectController::class, 'verifyPlanningPM']);
    Route::post('/projects/{project}/reject-planning', [ProjectController::class, 'rejectPlanning']);
    Route::post('/projects/{project}/lock-brief', [ProjectController::class, 'lockPhaseBrief']);
    Route::post('/projects/{project}/approve-construction-brief', [ProjectController::class, 'approveConstructionBrief']);
    Route::post('/projects/{project}/revise-construction-brief', [ProjectController::class, 'reviseConstructionBrief']);
    Route::post('/projects/{project}/verify-pbg', [ProjectController::class, 'verifyPBG']);
    Route::post('/projects/{project}/verify-slf', [ProjectController::class, 'verifySLF']);
    Route::post('/projects/{project}/finalize', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'finalizeProject']);

    // Shareable Brief Link
    Route::post('/projects/{project}/share-token', [ProjectController::class, 'generateShareToken']);
    Route::delete('/projects/{project}/share-token', [ProjectController::class, 'revokeShareToken']);

    Route::get('/projects/{project}/comments', [ProjectCommentController::class, 'index']);
    Route::post('/projects/{project}/comments', [ProjectCommentController::class, 'store']);
    Route::put('/projects/{project}/comments/{comment}', [ProjectCommentController::class, 'update']);
    Route::delete('/projects/{project}/comments/{comment}', [ProjectCommentController::class, 'destroy']);

    // Phase Gating & External Vendors
    Route::post('/projects/{project}/broadcast-phase', [ProjectController::class, 'broadcastPhase']);
    Route::post('/projects/{project}/import-external-vendor', [ProjectController::class, 'importExternalVendor']);

    // Reviews
    Route::post('/projects/{project}/review', [\App\Http\Controllers\Api\ReviewController::class, 'store']);

    Route::get('/projects/{project}/documents', [ProjectDocumentController::class, 'index']);
    Route::post('/projects/{project}/documents', [ProjectDocumentController::class, 'store']);
    Route::put('/projects/{project}/documents/{document}', [ProjectDocumentController::class, 'update']);
    Route::delete('/projects/{project}/documents/{document}', [ProjectDocumentController::class, 'destroy']);
    Route::post('/projects/{project}/documents/{document}/verify', [ProjectDocumentController::class, 'verify']);
    Route::post('/projects/{project}/documents/submit-design', [\App\Http\Controllers\Api\TechnicalDesignReviewController::class, 'submitDesign']);
    Route::post('/projects/{project}/documents/approve-design', [\App\Http\Controllers\Api\TechnicalDesignReviewController::class, 'approveDesign']);
    Route::post('/projects/{project}/documents/revise-design', [\App\Http\Controllers\Api\TechnicalDesignReviewController::class, 'reviseDesign']);


    // Ratings & Activity Log
    Route::post('/projects/{project}/rate', [ProjectActivityController::class, 'rateProject']);
    Route::get('/projects/{project}/activity', [ProjectActivityController::class, 'getActivity']);
    Route::get('/projects/{project}/pending-actions', [ProjectActivityController::class, 'getPendingActions']);

    // Project Executive Reports
    Route::get('/projects/{project}/reports', [ProjectReportController::class, 'index']);
    Route::post('/projects/{project}/reports', [ProjectReportController::class, 'store']);
    Route::put('/projects/{project}/reports/{report}', [ProjectReportController::class, 'update']);
    Route::delete('/projects/{project}/reports/{report}', [ProjectReportController::class, 'destroy']);

    // Project Scheduling & Timeline
    Route::get('/projects/{project}/schedules', [ProjectScheduleController::class, 'index']);
    Route::put('/projects/{project}/schedules/{schedule}', [ProjectScheduleController::class, 'update']);
    Route::post('/projects/{project}/delays', [ProjectScheduleController::class, 'logDelay']);

    // Material Requirements (Bill of Materials)
    Route::get('/projects/{project}/requirements', [ProjectRequirementController::class, 'index']);
    Route::post('/projects/{project}/requirements', [ProjectRequirementController::class, 'store']);
    Route::put('/projects/{project}/requirements/{requirement}', [ProjectRequirementController::class, 'update']);
    Route::delete('/projects/{project}/requirements/{requirement}', [ProjectRequirementController::class, 'destroy']);
    Route::post('/projects/{project}/requirements/{requirement}/usage', [ProjectRequirementController::class, 'logUsage']);
    Route::post('/projects/{project}/requirements/{requirement}/manual-procurement', [ProjectRequirementController::class, 'logExternalProcurement']);
    Route::post('/projects/{project}/requirements/{requirement}/request-procurement', [ProjectRequirementController::class, 'requestProcurement']);
    Route::get('/projects/{project}/requirements/{requirement}/history', [ProjectRequirementHistoryController::class, 'index']);
    Route::post('/projects/{project}/requirements/{requirement}/restock', [ProjectRequirementHistoryController::class, 'restock']);
    Route::post('/projects/{project}/requirements/{requirement}/use', [ProjectRequirementHistoryController::class, 'use']);
    Route::get('/projects/{project}/procurement-requests', [ProjectRequirementController::class, 'getProcurementRequests']);
    Route::get('/projects/{project}/requirements-history', [ProjectRequirementController::class, 'getHistory']);
    
    // Material Folders
    Route::get('/projects/{project}/material-folders', [\App\Http\Controllers\Api\ProjectMaterialFolderController::class, 'index']);
    Route::post('/projects/{project}/material-folders', [\App\Http\Controllers\Api\ProjectMaterialFolderController::class, 'store']);
    Route::put('/projects/{project}/material-folders/{folder}', [\App\Http\Controllers\Api\ProjectMaterialFolderController::class, 'update']);
    Route::delete('/projects/{project}/material-folders/{folder}', [\App\Http\Controllers\Api\ProjectMaterialFolderController::class, 'destroy']);
    Route::post('/projects/{project}/procurement-requests/{procurementRequest}/verify', [\App\Http\Controllers\Api\ProjectFeatureController::class, 'pmVerifyProcurement']);
    Route::post('/projects/{project}/procurement-requests/{procurementRequest}/reject', [\App\Http\Controllers\Api\ProjectFeatureController::class, 'pmRejectProcurement']);
    Route::post('/projects/{project}/procurement-requests/{procurementRequest}/owner-approve', [ProjectRequirementController::class, 'ownerApproveProcurement']);
    Route::post('/projects/{project}/procurement-requests/{procurementRequest}/owner-reject', [ProjectRequirementController::class, 'ownerRejectProcurement']);

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

    // Generic Addendum Authorization
    Route::post('/projects/{project}/addendums/{addendum}/approve', [ProjectAddendumController::class, 'approveAddendum']);
    Route::post('/projects/{project}/addendums/{addendum}/reject', [ProjectAddendumController::class, 'rejectAddendum']);

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

    // Team Members (Firm Roster)
    Route::get('/team-members', [TeamMemberController::class, 'index']);
    Route::post('/team-members', [TeamMemberController::class, 'store']);
    Route::put('/team-members/{id}', [TeamMemberController::class, 'update']);
    Route::delete('/team-members/{id}', [TeamMemberController::class, 'destroy']);

    // Firm Members (Account-linked Roster)
    Route::get('/firm-members/suggestions', [FirmMemberController::class, 'suggestions']);
    Route::get('/firm-members/my-firms', [FirmMemberController::class, 'myFirms']);
    Route::get('/firm-members/join-requests', [FirmMemberController::class, 'joinRequests']);
    Route::post('/firm-members/search', [FirmMemberController::class, 'search']);
    Route::post('/firm-members/invite', [FirmMemberController::class, 'invite']);
    Route::post('/firm-members/request-join', [FirmMemberController::class, 'requestJoin']);
    Route::post('/firm-members/{firmMember}/respond', [FirmMemberController::class, 'respond']);
    Route::get('/firm-members/roster', [FirmMemberController::class, 'index']);
    Route::get('/firm-members/invitations', [FirmMemberController::class, 'invitations']);
    Route::get('/firm-members/browse-owners', [FirmMemberController::class, 'browseFirmOwners']);
    Route::post('/firm-members/{firmMember}/resend', [FirmMemberController::class, 'resend']);
    Route::post('/firm-members/{firmMember}/cancel', [FirmMemberController::class, 'cancel']);
    Route::delete('/firm-members/{firmMember}', [FirmMemberController::class, 'remove']);
    Route::post('/firm-members/quick-assign', [FirmMemberController::class, 'quickAssign']);

    // Sub-Professional Management
    Route::get('/projects/{project}/sub-professionals', [SubProfessionalController::class, 'index']);
    Route::post('/projects/{project}/sub-professionals', [SubProfessionalController::class, 'assign']);
    Route::post('/projects/{project}/sub-professionals/{id}/interview', [SubProfessionalController::class, 'interview']);
    Route::post('/projects/{project}/sub-professionals/{id}/recommend', [SubProfessionalController::class, 'recommend']);
    Route::post('/projects/{project}/sub-professionals/{id}/accept', [SubProfessionalController::class, 'accept']);
    Route::post('/projects/{project}/sub-professionals/{id}/decline', [SubProfessionalController::class, 'decline']);
    Route::post('/projects/{project}/sub-professionals/{id}/hire', [SubProfessionalController::class, 'hire']);
    Route::post('/projects/{project}/sub-professionals/shortlist-bid/{role}/{bidId}', [SubProfessionalController::class, 'shortlistBid']);
    Route::delete('/projects/{project}/sub-professionals/{id}', [SubProfessionalController::class, 'remove']);

    // Contractor Subspecialties Lookup
    Route::get('/contractor-subspecialties', [ContractorSubspecialtyController::class, 'index']);
});
