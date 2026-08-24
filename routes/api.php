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
use Illuminate\Support\Facades\Cache;

Route::post('/register', [AuthController::class, 'register']);
// Brute-force protection: dedicated tight limiters on credential endpoints.
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');

// Public API endpoints
Route::get('/houses', [HouseController::class, 'index']);
Route::get('/houses/{house}', [HouseController::class, 'show']);

Route::get('/arsitek', [\App\Http\Controllers\Api\PublicProfessionalController::class, 'getArsiteks']);
Route::get('/kontraktor', [\App\Http\Controllers\Api\PublicProfessionalController::class, 'getKontraktors']);
Route::get('/interior', [\App\Http\Controllers\Api\PublicProfessionalController::class, 'getInteriors']);
Route::get('/notaris', [\App\Http\Controllers\Api\PublicProfessionalController::class, 'getNotarises']);
Route::get('/project-manager', [\App\Http\Controllers\Api\PublicProfessionalController::class, 'getProjectManagers']);
Route::get('/structural-engineers', [\App\Http\Controllers\Api\PublicProfessionalController::class, 'getStructuralEngineers']);
Route::get('/mep-engineers', [\App\Http\Controllers\Api\PublicProfessionalController::class, 'getMepEngineers']);

// House Q&A Public Routes
Route::get('/houses/{house}/questions', [\App\Http\Controllers\Api\HouseQAController::class, 'index']);

// Notary Consultations (BUGFIX: the SPA's ConsultationModal already called
// POST /consultations — the endpoint was missing and 404'd)
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/consultations', [\App\Http\Controllers\Api\ConsultationController::class, 'index']);
    Route::post('/consultations', [\App\Http\Controllers\Api\ConsultationController::class, 'store']);
});

// Geocoding Proxy Public Routes
Route::get('/geocode/reverse', [\App\Http\Controllers\Api\GeocodeController::class, 'reverse']);
Route::get('/geocode/search', [\App\Http\Controllers\Api\GeocodeController::class, 'search']);

// Registration Draft Public Routes
Route::get('/registration/draft/{tempId}', [\App\Http\Controllers\Api\RegistrationDraftController::class, 'show']);
Route::post('/registration/draft/{tempId}', [\App\Http\Controllers\Api\RegistrationDraftController::class, 'store']);
Route::post('/registration/submit/{tempId}', [\App\Http\Controllers\Api\RegistrationDraftController::class, 'submit']);


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
    Route::get('/verifications/documents/{type}/{id}/{field}', [\App\Http\Controllers\Api\SecureVerificationDocumentController::class, 'getSignedUrl']);
    Route::get('/me', [ProfileController::class, 'show']);
    Route::post('/me/professional', [ProfileController::class, 'updateProfessional']);
    Route::post('/me/avatar', [ProfileController::class, 'updateAvatar']);
    Route::delete('/me/avatar', [ProfileController::class, 'deleteAvatar']);
    Route::put('/me', [ProfileController::class, 'update']);

    // House Management
    Route::apiResource('houses', HouseController::class)->only(['store', 'update', 'destroy']);

    // Room Management
    Route::post('houses/{house}/rooms', [RoomController::class, 'store']);
    Route::delete('rooms/{room}', [RoomController::class, 'destroy']);

    // House Q&A
    Route::post('/houses/{house}/questions', [\App\Http\Controllers\Api\HouseQAController::class, 'storeQuestion']);
    Route::post('/questions/{question}/answers', [\App\Http\Controllers\Api\HouseQAController::class, 'storeAnswer']);
    Route::delete('/questions/{question}', [\App\Http\Controllers\Api\HouseQAController::class, 'deleteQuestion']);

    // Protected API endpoints
    Route::get('/portfolios', [\App\Http\Controllers\Api\PortfolioController::class, 'index']);
    Route::post('/portfolios', [\App\Http\Controllers\Api\PortfolioController::class, 'store']);
    Route::post('/portfolios/{id}', [\App\Http\Controllers\Api\PortfolioController::class, 'update']);
    Route::delete('/portfolios/{id}', [\App\Http\Controllers\Api\PortfolioController::class, 'destroy']);
    
    Route::apiResource('projects', ProjectController::class)->only(['store', 'update', 'destroy']);
    Route::post('/upload', [ProjectController::class, 'uploadFile']);
    Route::get('/my-bids', [ProjectController::class, 'myBids']);
    Route::get('/user/active-projects', [ProjectController::class, 'getActiveProjects']);

    Route::prefix('projects/{project}')->group(function () {
        Route::post('/update', [ProjectController::class, 'update']);
        Route::post('/bids', [ProjectController::class, 'submitBid']);
        Route::get('/bids', [ProjectController::class, 'getBids']);
        Route::post('/accept-bid', [ProjectController::class, 'acceptBid']);
        Route::post('/shortlist-bid', [ProjectController::class, 'shortlistBid']);
        Route::post('/decline-bid', [ProjectController::class, 'declineBid']);
        Route::post('/invite', [ProjectController::class, 'inviteProfessional']);
        Route::post('/propose-fee', [ProjectController::class, 'proposeFeeAndTermins']);
        Route::post('/bids/{bid}/negotiate', [ProjectController::class, 'negotiateBidFee']);
        Route::post('/bids/{bid}/confirm-fee', [ProjectController::class, 'confirmBidFee']);
        Route::post('/bids/{bid}/sign-contract', [ProjectController::class, 'signContract']);
        Route::post('/bids/{bid}/client-sign-contract', [ProjectController::class, 'clientSignContract']);
        Route::post('/termins/{termin}/upload-proof', [ProjectPaymentTerminController::class, 'uploadProof']);
        Route::post('/termins/{termin}/verify-payment', [ProjectPaymentTerminController::class, 'verifyPayment']);
        Route::post('/bids/{bid}/accept-invite', [ProjectController::class, 'acceptInvite']);
        Route::post('/bids/{bid}/reject-invite', [ProjectController::class, 'rejectInvite']);
        Route::post('/bids/{bid}/verify-payment', [ProjectController::class, 'verifyBidPayment']);
        Route::post('/bids/{bid}/upload-payment-proof', [ProjectController::class, 'uploadBidPaymentProof']);
        Route::post('/terminate', [\App\Http\Controllers\Api\ProjectTerminationController::class, 'fireProfessional']);
        Route::post('/resign', [\App\Http\Controllers\Api\ProjectTerminationController::class, 'resignFromProject']);
        
        // Mutual Termination Routes
        Route::post('/mutual-termination/initiate', [\App\Http\Controllers\Api\ProjectMutualTerminationController::class, 'initiate']);
        Route::post('/mutual-termination/{termination}/respond', [\App\Http\Controllers\Api\ProjectMutualTerminationController::class, 'respond']);
        Route::post('/mutual-termination/{termination}/escalate', [\App\Http\Controllers\Api\ProjectMutualTerminationController::class, 'escalate']);

        // Project Manager Bidding
        Route::post('/pm-bids', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'store']);
        Route::post('/pm-bids/{bid}/accept', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'accept']);
        Route::post('/pm-bids/{bid}/shortlist', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'shortlist']);
        Route::post('/pm-bids/{bid}/decline', [\App\Http\Controllers\Api\BidProjectManagerController::class, 'decline']);

        // Project Features (Milestones, Comments, Documents)
        Route::get('/milestones', [ProjectMilestoneController::class, 'index']);
        Route::post('/milestones', [ProjectMilestoneController::class, 'store']);
        Route::put('/milestones/{milestone}', [ProjectMilestoneController::class, 'update']);
        Route::post('/milestones/{milestone}/approve', [ProjectMilestoneController::class, 'approve']);
        Route::post('/technical-audit-submit', [ProjectMilestoneController::class, 'submitTechnicalAudit']);
        Route::post('/seal-design', [ProjectPhaseController::class, 'sealDesign']);
        Route::delete('/milestones/{milestone}', [ProjectMilestoneController::class, 'destroy']);
        
        // Sticky Notes
        Route::get('/sticky-notes', [\App\Http\Controllers\StickyNoteController::class, 'index']);
        Route::post('/sticky-notes', [\App\Http\Controllers\StickyNoteController::class, 'store']);
        Route::put('/sticky-notes/{stickyNote}', [\App\Http\Controllers\StickyNoteController::class, 'update']);
        Route::delete('/sticky-notes/{stickyNote}', [\App\Http\Controllers\StickyNoteController::class, 'destroy']);

        // Construction Daily Logs
        Route::get('/daily-logs', [ProjectDailyLogController::class, 'index']);
        Route::post('/daily-logs', [ProjectDailyLogController::class, 'store']);
        Route::delete('/daily-logs/{dailyLog}', [ProjectDailyLogController::class, 'destroy']);

        // Payment Termins
        Route::get('/payment-termins', [ProjectPaymentTerminController::class, 'getPaymentTermins']);
        Route::post('/payment-termins', [ProjectPaymentTerminController::class, 'storePaymentTermin']);
        Route::put('/payment-termins/{termin}', [ProjectPaymentTerminController::class, 'updatePaymentTermin']);
        Route::delete('/payment-termins/{termin}', [ProjectPaymentTerminController::class, 'deletePaymentTermin']);
        Route::post('/payment-termins/{termin}/link-milestone', [ProjectPaymentTerminController::class, 'linkMilestone']);
        Route::post('/payment-termins/{termin}/unlink-milestone', [ProjectPaymentTerminController::class, 'unlinkMilestone']);

        // Engineering Manual Logs
        Route::post('/engineering-logs', [ProjectEngineeringController::class, 'storeLog']);
        Route::delete('/engineering-logs/{milestone}', [ProjectEngineeringController::class, 'deleteLog']);
        
        // Proof of Transfer Endpoints
        Route::post('/payments/{type}/{id}/upload-proof', [\App\Http\Controllers\Api\PaymentVerificationController::class, 'uploadProof']);
        Route::post('/payments/{type}/{id}/verify-proof', [\App\Http\Controllers\Api\PaymentVerificationController::class, 'verifyProof']);

        Route::post('/seal-construction', [ProjectPhaseController::class, 'sealConstruction']);
        Route::post('/seal-interior', [ProjectPhaseController::class, 'sealInterior']);
        Route::post('/seal-legal', [ProjectPhaseController::class, 'sealLegal']);
        Route::post('/authorize-phase', [ProjectPhaseController::class, 'authorizePhase']);
        Route::post('/kickoff', [ProjectPhaseController::class, 'issueKickoff']);
        Route::post('/verify-design', [ProjectPhaseController::class, 'verifyDesign']);
        Route::post('/verify-construction', [ProjectPhaseController::class, 'verifyConstruction']);
        Route::post('/verify-interior', [ProjectPhaseController::class, 'verifyInterior']);
        Route::post('/verify-legal', [ProjectPhaseController::class, 'verifyLegal']);
        Route::get('/legal-financials', [ProjectLegalController::class, 'getFinancials']);
        Route::post('/legal-disbursements', [ProjectLegalController::class, 'storeDisbursement']);
        Route::post('/legal-disbursements/{id}/verify', [ProjectLegalController::class, 'verifyDisbursement']);
        Route::post('/finalize-legal-scope', [ProjectLegalController::class, 'finalizeLegalScope']);

        Route::post('/milestones/{milestone}/furniture-addendum', [ProjectAddendumController::class, 'createFurnitureAddendum']);
        Route::post('/handover/approve', [ProjectHandoverController::class, 'approveHandover']);
        Route::post('/handover/reject', [ProjectHandoverController::class, 'requestHandoverRevision']);

        // Owner Confirmation & Final Handover
        Route::post('/initiate-walkthrough', [ProjectHandoverController::class, 'initiateWalkthrough']);
        Route::post('/owner-accept', [ProjectHandoverController::class, 'ownerAcceptProject']);

        // Snag Items (Defect Tracking)
        Route::get('/snag-items', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'getSnagItems']);
        Route::post('/snag-items', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'storeSnagItem']);
        Route::put('/snag-items/{snagItem}', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'updateSnagItemStatus']);
        Route::post('/snag-items/{snagItem}/accept', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'acceptSnagResolution']);

        // Change Orders
        Route::get('/change-orders', [\App\Http\Controllers\Api\ProjectChangeOrderController::class, 'index']);
        Route::post('/change-orders', [\App\Http\Controllers\Api\ProjectChangeOrderController::class, 'store']);
        Route::post('/change-orders/{changeOrder}/pm-review', [\App\Http\Controllers\Api\ProjectChangeOrderController::class, 'pmReview']);
        Route::post('/change-orders/{changeOrder}/owner-decide', [\App\Http\Controllers\Api\ProjectChangeOrderController::class, 'ownerDecide']);
        Route::get('/bast', [ProjectHandoverController::class, 'getBASTData']);

        // Timeline Extensions
        Route::get('/extensions', [ProjectExtensionController::class, 'index']);
        Route::post('/extensions', [ProjectExtensionController::class, 'store']);
        Route::post('/extensions/{extension}/pm-review', [ProjectExtensionController::class, 'pmReview']);
        Route::post('/extensions/{extension}/owner-decide', [ProjectExtensionController::class, 'ownerDecide']);

        // Warranty Claims
        Route::get('/warranty-claims', [ProjectWarrantyController::class, 'index']);
        Route::post('/warranty-claims', [ProjectWarrantyController::class, 'store']);
        Route::put('/warranty-claims/{claim}/status', [ProjectWarrantyController::class, 'updateStatus']);

        // Technical Resourcing (Engineering)
        Route::post('/request-engineering', [ProjectEngineeringController::class, 'requestEngineeringRole']);
        Route::post('/verify-engineering/{addendum}', [ProjectEngineeringController::class, 'verifyEngineeringRequest']);
        Route::post('/approve-engineering-hire/{addendum}', [ProjectEngineeringController::class, 'approveEngineeringHire']);
        Route::post('/reject-engineering-hire/{addendum}', [ProjectEngineeringController::class, 'rejectEngineeringHire']);
        Route::post('/approve-engineering', [ProjectEngineeringController::class, 'approveEngineeringIntegration']);
        Route::post('/invite-engineering-vendor', [\App\Http\Controllers\Api\EngineeringProcurementController::class, 'inviteVendor']);
        Route::post('/submit-engineering-interview', [\App\Http\Controllers\Api\EngineeringProcurementController::class, 'submitInterview']);
        Route::post('/authorize-specialist', [ProjectEngineeringController::class, 'authorizeSpecialist']);
        Route::post('/reject-specialist', [ProjectEngineeringController::class, 'rejectSpecialist']);
        // BUGFIX: endpoint the SPA's EngineeringBidsBoard already calls — was a
        // phantom 404 (see ProjectEngineeringController::rejectEngineeringBid).
        Route::post('/reject-engineering-bid/{bidId}', [ProjectEngineeringController::class, 'rejectEngineeringBid']);

        // Phase Brief Lock (Prepare → Lock → Execute lifecycle)
        Route::post('/submit-planning', [ProjectController::class, 'submitPlanning']);
        Route::post('/approve-planning', [ProjectController::class, 'approvePlanning']);
        Route::post('/verify-payment', [ProjectController::class, 'verifyDesignPayment']);
        Route::post('/update-planning-audit', [ProjectController::class, 'updatePlanningAudit']);
        Route::post('/verify-planning-pm', [ProjectController::class, 'verifyPlanningPM']);
        Route::post('/reject-planning', [ProjectController::class, 'rejectPlanning']);
        Route::post('/lock-brief', [ProjectController::class, 'lockPhaseBrief']);
        Route::post('/approve-construction-brief', [ProjectController::class, 'approveConstructionBrief']);
        Route::post('/revise-construction-brief', [ProjectController::class, 'reviseConstructionBrief']);
        Route::post('/verify-pbg', [ProjectController::class, 'verifyPBG']);
        Route::post('/verify-slf', [ProjectController::class, 'verifySLF']);
        Route::post('/finalize', [\App\Http\Controllers\Api\ProjectHandoverController::class, 'finalizeProject']);
        Route::post('/mark-complete', [\App\Http\Controllers\Api\ProjectController::class, 'markComplete']);

        // Shareable Brief Link
        Route::post('/share-token', [ProjectController::class, 'generateShareToken']);
        Route::delete('/share-token', [ProjectController::class, 'revokeShareToken']);

        Route::get('/comments', [ProjectCommentController::class, 'index']);
        Route::post('/comments', [ProjectCommentController::class, 'store']);
        Route::put('/comments/{comment}', [ProjectCommentController::class, 'update']);
        Route::delete('/comments/{comment}', [ProjectCommentController::class, 'destroy']);

        // Phase Gating & External Vendors
        Route::post('/broadcast-phase', [ProjectController::class, 'broadcastPhase']);
        Route::post('/import-external-vendor', [ProjectController::class, 'importExternalVendor']);

        // Reviews
        Route::post('/review', [\App\Http\Controllers\Api\ReviewController::class, 'store']);

        Route::get('/documents', [ProjectDocumentController::class, 'index']);
        Route::post('/documents', [ProjectDocumentController::class, 'store']);
        Route::put('/documents/{document}', [ProjectDocumentController::class, 'update']);
        Route::delete('/documents/{document}', [ProjectDocumentController::class, 'destroy']);
        Route::post('/documents/{document}/verify', [ProjectDocumentController::class, 'verify']);
        Route::post('/documents/submit-design', [\App\Http\Controllers\Api\TechnicalDesignReviewController::class, 'submitDesign']);
        Route::post('/documents/approve-design', [\App\Http\Controllers\Api\TechnicalDesignReviewController::class, 'approveDesign']);
        Route::post('/documents/revise-design', [\App\Http\Controllers\Api\TechnicalDesignReviewController::class, 'reviseDesign']);

        // Ratings & Activity Log
        Route::post('/rate', [ProjectActivityController::class, 'rateProject']);
        Route::get('/activity', [ProjectActivityController::class, 'getActivity']);
        Route::get('/pending-actions', [ProjectActivityController::class, 'getPendingActions']);

        // Project Executive Reports
        Route::get('/reports', [ProjectReportController::class, 'index']);
        Route::post('/reports', [ProjectReportController::class, 'store']);
        Route::put('/reports/{report}', [ProjectReportController::class, 'update']);
        Route::delete('/reports/{report}', [ProjectReportController::class, 'destroy']);

        // Project Scheduling & Timeline
        Route::get('/schedules', [ProjectScheduleController::class, 'index']);
        Route::put('/schedules/{schedule}', [ProjectScheduleController::class, 'update']);
        Route::post('/delays', [ProjectScheduleController::class, 'logDelay']);

        // Material Requirements (Bill of Materials)
        Route::get('/requirements', [ProjectRequirementController::class, 'index']);
        Route::post('/requirements', [ProjectRequirementController::class, 'store']);
        Route::put('/requirements/{requirement}', [ProjectRequirementController::class, 'update']);
        Route::delete('/requirements/{requirement}', [ProjectRequirementController::class, 'destroy']);
        Route::post('/requirements/{requirement}/usage', [ProjectRequirementController::class, 'logUsage']);
        Route::post('/requirements/{requirement}/manual-procurement', [ProjectRequirementController::class, 'logExternalProcurement']);
        Route::post('/requirements/{requirement}/request-procurement', [ProjectRequirementController::class, 'requestProcurement']);
        Route::get('/requirements/{requirement}/history', [ProjectRequirementHistoryController::class, 'index']);
        Route::post('/requirements/{requirement}/restock', [ProjectRequirementHistoryController::class, 'restock']);
        Route::post('/requirements/{requirement}/use', [ProjectRequirementHistoryController::class, 'use']);
        Route::get('/procurement-requests', [ProjectRequirementController::class, 'getProcurementRequests']);
        Route::get('/requirements-history', [ProjectRequirementController::class, 'getHistory']);
        
        // Material Folders
        Route::get('/material-folders', [\App\Http\Controllers\Api\ProjectMaterialFolderController::class, 'index']);
        Route::post('/material-folders', [\App\Http\Controllers\Api\ProjectMaterialFolderController::class, 'store']);
        Route::put('/material-folders/{folder}', [\App\Http\Controllers\Api\ProjectMaterialFolderController::class, 'update']);
        Route::delete('/material-folders/{folder}', [\App\Http\Controllers\Api\ProjectMaterialFolderController::class, 'destroy']);
        Route::post('/procurement-requests/{procurementRequest}/verify', [\App\Http\Controllers\Api\ProjectFeatureController::class, 'pmVerifyProcurement']);
        Route::post('/procurement-requests/{procurementRequest}/reject', [\App\Http\Controllers\Api\ProjectFeatureController::class, 'pmRejectProcurement']);
        Route::post('/procurement-requests/{procurementRequest}/owner-approve', [ProjectRequirementController::class, 'ownerApproveProcurement']);
        Route::post('/procurement-requests/{procurementRequest}/owner-reject', [ProjectRequirementController::class, 'ownerRejectProcurement']);

        // Project Budget & Finance Endpoints
        Route::get('/budget', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'getDashboard']);
        Route::post('/budget/transactions', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'addTransaction']);
        Route::post('/budget/mark-paid', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'markPaid']);
        Route::post('/budget/sandbox', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'addSandboxItem']);
        Route::put('/budget/sandbox/{id}', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'toggleSandboxItem']);
        Route::put('/budget/sandbox/{id}/update', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'updateSandboxItem']);
        Route::delete('/budget/sandbox/{id}', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'deleteSandboxItem']);
        Route::post('/budget/addendums', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'createAddendum']);
        Route::put('/budget/addendums/{id}', [\App\Http\Controllers\Api\ProjectBudgetController::class, 'handleAddendumStatus']);

        // Generic Addendum Authorization
        Route::post('/addendums/{addendum}/approve', [ProjectAddendumController::class, 'approveAddendum']);
        Route::post('/addendums/{addendum}/reject', [ProjectAddendumController::class, 'rejectAddendum']);

        // Sub-Professional Management
        Route::get('/sub-professionals', [SubProfessionalController::class, 'index']);
        Route::post('/sub-professionals', [SubProfessionalController::class, 'assign']);
        Route::post('/sub-professionals/{id}/interview', [SubProfessionalController::class, 'interview']);
        Route::post('/sub-professionals/{id}/recommend', [SubProfessionalController::class, 'recommend']);
        Route::post('/sub-professionals/{id}/accept', [SubProfessionalController::class, 'accept']);
        Route::post('/sub-professionals/{id}/decline', [SubProfessionalController::class, 'decline']);
        Route::post('/sub-professionals/{id}/hire', [SubProfessionalController::class, 'hire']);
        Route::post('/sub-professionals/shortlist-bid/{role}/{bidId}', [SubProfessionalController::class, 'shortlistBid']);
        Route::delete('/sub-professionals/{id}', [SubProfessionalController::class, 'remove']);
    });

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);

    // Aggregated unread counters for header heartbeat (single cheap query)
    Route::get('/me/unread-summary', \App\Http\Controllers\Api\UnreadSummaryController::class);

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
        Route::apiResource('materials', MaterialController::class)->only(['store', 'update', 'destroy']);
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
        Route::get('/professionals/history', [\App\Http\Controllers\Api\Admin\VerificationController::class, 'history']);
        Route::patch('/professionals/{type}/{id}/status', [\App\Http\Controllers\Api\Admin\VerificationController::class, 'updateStatus']);
        Route::get('/houses', [\App\Http\Controllers\Api\Admin\AdminDashboardController::class, 'houses']);
        Route::patch('/houses/{id}/suspend', [\App\Http\Controllers\Api\Admin\AdminDashboardController::class, 'toggleHouseSuspend']);
        Route::get('/projects', [\App\Http\Controllers\Api\Admin\AdminDashboardController::class, 'projects']);
        Route::post('/projects/{project}/force-terminate', [\App\Http\Controllers\Api\Admin\AdminDashboardController::class, 'terminateProject']);

        // User Management
        Route::get('/users', [\App\Http\Controllers\Api\Admin\AdminUserController::class, 'index']);
        Route::patch('/users/{user}/suspend', [\App\Http\Controllers\Api\Admin\AdminUserController::class, 'toggleSuspend']);
        Route::patch('/users/{user}/role', [\App\Http\Controllers\Api\Admin\AdminUserController::class, 'updateRole']);

        // Supplier Verification
        Route::get('/suppliers', [\App\Http\Controllers\Api\Admin\AdminSupplierController::class, 'index']);
        Route::patch('/suppliers/{id}/status', [\App\Http\Controllers\Api\Admin\AdminSupplierController::class, 'updateStatus']);
    });

    // Notary services
    Route::get('/notaris/services', [ProjectController::class, 'getNotarisServices']);

    // Team Members (Firm Roster)
    Route::get('/team-members', [TeamMemberController::class, 'index']);
    Route::post('/team-members', [TeamMemberController::class, 'store']);
    Route::put('/team-members/{id}', [TeamMemberController::class, 'update']);
    Route::delete('/team-members/{id}', [TeamMemberController::class, 'destroy']);

    // Firm Members (Account-linked Roster)
    Route::get('/firm-members/profile/{ownerId}', [FirmMemberController::class, 'getProfile']);
    Route::post('/firm-members/update-profile', [FirmMemberController::class, 'updateProfile']);
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

    // Contractor Subspecialties Lookup
    Route::get('/contractor-subspecialties', [ContractorSubspecialtyController::class, 'index']);
});
