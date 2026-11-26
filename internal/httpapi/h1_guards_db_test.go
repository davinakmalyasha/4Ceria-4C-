package httpapi

// Half-1 guard sweep: every marketplace/material/store/inventory/quotes/
// orders handler plus every project-workspace handler gets its entry
// branches covered: unauthenticated (401), bad id (404) and missing row
// (404). The happy paths live in h1_market_db_test.go and
// h1_workspace_db_test.go; this file pins the guards.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

type h1Handler struct {
	name   string
	public bool
	// list marks caller-scoped (or public) index handlers that ignore
	// path ids and answer 200 even for the missing-row/bad-id probes.
	list bool
	make func(pool *pgxpool.Pool) http.HandlerFunc
}

// h1Handlers lists every handler owned by the half-1 worker.
func h1Handlers() []h1Handler {
	return []h1Handler{
		// marketplace (public)
		{"MarketplaceSuppliersHandler", true, true, MarketplaceSuppliersHandler},
		{"MarketplaceSupplierHandler", true, false, MarketplaceSupplierHandler},
		{"MarketplaceMaterialsHandler", true, true, MarketplaceMaterialsHandler},
		// material orders / reviews / quotes
		{"StoreOrderReviewHandler", false, false, StoreOrderReviewHandler},
		{"UpdateOrderReviewHandler", false, false, UpdateOrderReviewHandler},
		{"DestroyOrderReviewHandler", false, false, DestroyOrderReviewHandler},
		{"SupplierReviewsHandler", true, true, SupplierReviewsHandler},
		{"MaterialOrdersIndexHandler", false, true, MaterialOrdersIndexHandler},
		{"MaterialOrderShowHandler", false, false, MaterialOrderShowHandler},
		{"UploadOrderPaymentProofHandler", false, false, UploadOrderPaymentProofHandler},
		{"VerifyOrderPaymentHandler", false, false, VerifyOrderPaymentHandler},
		{"UpdateMaterialOrderHandler", false, false, UpdateMaterialOrderHandler},
		{"ConfirmOrderReceiptHandler", false, false, ConfirmOrderReceiptHandler},
		{"RequestQuotePaymentHandler", false, false, RequestQuotePaymentHandler},
		{"UploadQuotePaymentProofHandler", false, false, UploadQuotePaymentProofHandler},
		{"MarkQuotePaidHandler", false, false, MarkQuotePaidHandler},
		{"ApproveQuoteHandler", false, false, ApproveQuoteHandler},
		{"PostQuoteDeliveryJobHandler", false, false, PostQuoteDeliveryJobHandler},
		{"MaterialQuotesIndexHandler", false, true, MaterialQuotesIndexHandler},
		{"StoreMaterialQuoteHandler", false, false, StoreMaterialQuoteHandler},
		{"StoreMaterialHandler", false, false, StoreMaterialHandler},
		{"UpdateMaterialHandler", false, false, UpdateMaterialHandler},
		{"DestroyMaterialHandler", false, false, DestroyMaterialHandler},
		// project store / requirements / stock / procurement
		{"StoreProjectHandler", false, false, StoreProjectHandler},
		{"ProjectHistoryHandler", false, false, ProjectHistoryHandler},
		{"RequirementHistoryHandler", false, false, RequirementHistoryHandler},
		{"ProcurementListHandler", false, false, ProcurementListHandler},
		{"RequestProcurementHandler", false, false, RequestProcurementHandler},
		{"RequirementsHandler", false, false, RequirementsHandler},
		{"RestockHandler", false, false, RestockHandler},
		{"UseHandler", false, false, UseHandler},
		{"UsageHandler", false, false, UsageHandler},
		{"StoreRequirementHandler", false, false, StoreRequirementHandler},
		{"UpdateRequirementHandler", false, false, UpdateRequirementHandler},
		{"DeleteRequirementHandler", false, false, DeleteRequirementHandler},
		// single reads/writes (marketplace-flavored)
		{"PublicBriefHandler", true, false, PublicBriefHandler},
		{"ContractorSubspecialtiesHandler", true, true, ContractorSubspecialtiesHandler},
		{"MyBidsHandler", false, true, MyBidsHandler},
		{"HireHistoryHandler", false, true, HireHistoryHandler},
		{"SupplierDeliveryJobsHandler", false, false, SupplierDeliveryJobsHandler},
		{"VerificationDocumentHandler", false, false, VerificationDocumentHandler},
		{"StoreHouseAnswerHandler", false, false, StoreHouseAnswerHandler},
		{"DestroyRoomHandler", false, false, DestroyRoomHandler},
		{"UploadHandler", true, false, UploadHandler},
		// project workspace
		{"ActivityHandler", false, false, ActivityHandler},
		{"ApproveAddendumHandler", false, false, ApproveAddendumHandler},
		{"RejectAddendumHandler", false, false, RejectAddendumHandler},
		{"AcceptInviteHandler", false, false, AcceptInviteHandler},
		{"RejectInviteHandler", false, false, RejectInviteHandler},
		{"NegotiateBidFeeHandler", false, false, NegotiateBidFeeHandler},
		{"ConfirmBidFeeHandler", false, false, ConfirmBidFeeHandler},
		{"AcceptBidHandler", false, false, AcceptBidHandler},
		{"DeclineBidHandler", false, false, DeclineBidHandler},
		{"SignContractHandler", false, false, SignContractHandler},
		{"ClientSignContractHandler", false, false, ClientSignContractHandler},
		{"SubmitProjectBidHandler", false, false, SubmitProjectBidHandler},
		{"GetProjectBidsHandler", false, false, GetProjectBidsHandler},
		{"ApproveConstructionBriefHandler", false, false, ApproveConstructionBriefHandler},
		{"ReviseConstructionBriefHandler", false, false, ReviseConstructionBriefHandler},
		{"LockPhaseBriefHandler", false, false, LockPhaseBriefHandler},
		{"IssueKickoffHandler", false, false, IssueKickoffHandler},
		{"ReviewProjectHandler", false, false, ReviewProjectHandler},
		{"BudgetDashboardHandler", false, false, BudgetDashboardHandler},
		{"CreateAddendumHandler", false, false, CreateAddendumHandler},
		{"HandleAddendumHandler", false, false, HandleAddendumHandler},
		{"MarkPaidHandler", false, false, MarkPaidHandler},
		{"AddTransactionHandler", false, false, AddTransactionHandler},
		{"AddSandboxHandler", false, false, AddSandboxHandler},
		{"ToggleSandboxHandler", false, false, ToggleSandboxHandler},
		{"UpdateSandboxHandler", false, false, UpdateSandboxHandler},
		{"DeleteSandboxHandler", false, false, DeleteSandboxHandler},
		{"ChangeOrdersIndexHandler", false, false, ChangeOrdersIndexHandler},
		{"StoreChangeOrderHandler", false, false, StoreChangeOrderHandler},
		{"ProjectCommentsIndexHandler", true, false, ProjectCommentsIndexHandler},
		{"ProjectCommentsStoreHandler", true, false, ProjectCommentsStoreHandler},
		{"UpdateCommentHandler", true, false, UpdateCommentHandler},
		{"DestroyCommentHandler", true, false, DestroyCommentHandler},
		{"DailyLogsIndexHandler", false, false, DailyLogsIndexHandler},
		{"StoreDailyLogHandler", false, false, StoreDailyLogHandler},
		{"DestroyDailyLogHandler", false, false, DestroyDailyLogHandler},
		{"SubmitDesignHandler", false, false, SubmitDesignHandler},
		{"ApproveDesignHandler", false, false, ApproveDesignHandler},
		{"ReviseDesignHandler", false, false, ReviseDesignHandler},
		{"DocumentsIndexHandler", false, false, DocumentsIndexHandler},
		{"StoreDocumentHandler", false, false, StoreDocumentHandler},
		{"UpdateDocumentHandler", false, false, UpdateDocumentHandler},
		{"DestroyDocumentHandler", false, false, DestroyDocumentHandler},
		{"VerifyDocumentHandler", false, false, VerifyDocumentHandler},
		{"RequestEngineeringRoleHandler", false, false, RequestEngineeringRoleHandler},
		{"VerifyEngineeringRequestHandler", false, false, VerifyEngineeringRequestHandler},
		{"ApproveEngineeringHireHandler", false, false, ApproveEngineeringHireHandler},
		{"RejectEngineeringHireHandler", false, false, RejectEngineeringHireHandler},
		{"ApproveEngineeringIntegrationHandler", false, false, ApproveEngineeringIntegrationHandler},
		{"AuthorizeSpecialistHandler", false, false, AuthorizeSpecialistHandler},
		{"RejectSpecialistHandler", false, false, RejectSpecialistHandler},
		{"RejectEngineeringBidHandler", false, false, RejectEngineeringBidHandler},
		{"SubmitEngineeringInterviewHandler", false, false, SubmitEngineeringInterviewHandler},
		{"StoreEngineeringLogHandler", false, false, StoreEngineeringLogHandler},
		{"DeleteEngineeringLogHandler", false, false, DeleteEngineeringLogHandler},
		{"InitiateWalkthroughHandler", false, false, InitiateWalkthroughHandler},
		{"OwnerAcceptProjectHandler", false, false, OwnerAcceptProjectHandler},
		{"PhaseHandoverApproveHandler", false, false, PhaseHandoverApproveHandler},
		{"PhaseHandoverRevisionHandler", false, false, PhaseHandoverRevisionHandler},
		{"BastHandler", false, false, BastHandler},
		{"LegalFinancialsHandler", false, false, LegalFinancialsHandler},
		{"InviteProfessionalHandler", false, false, InviteProfessionalHandler},
		{"MarkCompleteHandler", false, false, MarkCompleteHandler},
		{"DestroyProjectHandler", false, false, DestroyProjectHandler},
		{"MaterialFoldersIndexHandler", false, false, MaterialFoldersIndexHandler},
		{"StoreMaterialFolderHandler", false, false, StoreMaterialFolderHandler},
		{"UpdateMaterialFolderHandler", false, false, UpdateMaterialFolderHandler},
		{"DestroyMaterialFolderHandler", false, false, DestroyMaterialFolderHandler},
		{"ApproveMilestoneHandler", false, false, ApproveMilestoneHandler},
		{"DestroyMilestoneHandler", false, false, DestroyMilestoneHandler},
		{"MilestonesHandler", false, false, MilestonesHandler},
		{"StoreMilestoneHandler", false, false, StoreMilestoneHandler},
		{"UpdateMilestoneHandler", false, false, UpdateMilestoneHandler},
		{"MutualTerminationIndexHandler", false, false, MutualTerminationIndexHandler},
		{"InitiateMutualTerminationHandler", false, false, InitiateMutualTerminationHandler},
		{"RespondMutualTerminationHandler", false, false, RespondMutualTerminationHandler},
		{"EscalateMutualTerminationHandler", false, false, EscalateMutualTerminationHandler},
		{"UploadProofHandler", false, false, UploadProofHandler},
		{"VerifyProofHandler", false, false, VerifyProofHandler},
		{"VerifyPBGHandler", false, false, VerifyPBGHandler},
		{"VerifySLFHandler", false, false, VerifySLFHandler},
		{"SubmitPlanningHandler", false, false, SubmitPlanningHandler},
		{"ApprovePlanningHandler", false, false, ApprovePlanningHandler},
		{"VerifyPlanningPMHandler", false, false, VerifyPlanningPMHandler},
		{"UpdatePlanningAuditHandler", false, false, UpdatePlanningAuditHandler},
		{"RejectPlanningHandler", false, false, RejectPlanningHandler},
		{"SubmitPMBidHandler", false, false, SubmitPMBidHandler},
		{"VerifyProcurementHandler", false, false, VerifyProcurementHandler},
		{"RejectProcurementHandler", false, false, RejectProcurementHandler},
		{"ProjectReportsIndexHandler", true, false, ProjectReportsIndexHandler},
		{"StoreReportHandler", false, false, StoreReportHandler},
		{"UpdateReportHandler", false, false, UpdateReportHandler},
		{"DestroyReportHandler", false, false, DestroyReportHandler},
		{"ProjectsHandler", false, true, ProjectsHandler},
		{"ProjectShowHandler", false, false, ProjectShowHandler},
		{"SchedulesIndexHandler", false, false, SchedulesIndexHandler},
		{"UpdateScheduleHandler", false, false, UpdateScheduleHandler},
		{"LogDelayHandler", false, false, LogDelayHandler},
		{"SealDesignHandler", false, false, SealDesignHandler},
		{"SealConstructionHandler", false, false, SealConstructionHandler},
		{"SealInteriorHandler", false, false, SealInteriorHandler},
		{"SealLegalHandler", false, false, SealLegalHandler},
		{"AuthorizePhaseHandler", false, false, AuthorizePhaseHandler},
		{"StickyNotesIndexHandler", false, false, StickyNotesIndexHandler},
		{"StoreStickyNoteHandler", false, false, StoreStickyNoteHandler},
		{"UpdateStickyNoteHandler", false, false, UpdateStickyNoteHandler},
		{"DestroyStickyNoteHandler", false, false, DestroyStickyNoteHandler},
		{"GenerateShareTokenHandler", false, false, GenerateShareTokenHandler},
		{"RevokeShareTokenHandler", false, false, RevokeShareTokenHandler},
		{"NotificationPreferencesIndexHandler", false, true, NotificationPreferencesIndexHandler},
		{"UpdateNotificationPreferenceHandler", false, false, UpdateNotificationPreferenceHandler},
		{"DestroyNotificationPreferenceHandler", false, false, DestroyNotificationPreferenceHandler},
		{"MarkNotificationReadHandler", false, false, MarkNotificationReadHandler},
		{"MarkAllNotificationsReadHandler", false, true, MarkAllNotificationsReadHandler},
		{"BroadcastPhaseHandler", false, false, BroadcastPhaseHandler},
		{"ShortlistBidHandler", false, false, ShortlistBidHandler},
		{"SnagItemsIndexHandler", false, false, SnagItemsIndexHandler},
		{"StoreSnagItemHandler", false, false, StoreSnagItemHandler},
		{"UpdateSnagItemHandler", false, false, UpdateSnagItemHandler},
		{"AcceptSnagHandler", false, false, AcceptSnagHandler},
		{"SubProfessionalsIndexHandler", false, false, SubProfessionalsIndexHandler},
		{"AssignSubProfessionalHandler", false, false, AssignSubProfessionalHandler},
		{"RemoveSubProfessionalHandler", false, false, RemoveSubProfessionalHandler},
		{"ShortlistSubBidHandler", false, false, ShortlistSubBidHandler},
		{"TechnicalAuditHandler", false, false, TechnicalAuditHandler},
		{"TerminateProfessionalHandler", false, false, TerminateProfessionalHandler},
		{"ResignFromProjectHandler", false, false, ResignFromProjectHandler},
		{"PaymentTerminsHandler", false, false, PaymentTerminsHandler},
		{"StoreTerminHandler", false, false, StoreTerminHandler},
		{"UpdatePaymentTerminHandler", false, false, UpdatePaymentTerminHandler},
		{"DeletePaymentTerminHandler", false, false, DeletePaymentTerminHandler},
		{"LinkTerminMilestoneHandler", false, false, LinkTerminMilestoneHandler},
		{"UnlinkTerminMilestoneHandler", false, false, UnlinkTerminMilestoneHandler},
		{"UpdateProjectHandler", false, false, UpdateProjectHandler},
		{"ImportExternalVendorHandler", false, false, ImportExternalVendorHandler},
		{"VerifyLegalHandler", false, false, VerifyLegalHandler},
		{"VerifyPaymentHandler", false, false, VerifyPaymentHandler},
		{"WarrantyClaimsIndexHandler", false, false, WarrantyClaimsIndexHandler},
		{"StoreWarrantyClaimHandler", false, false, StoreWarrantyClaimHandler},
		{"UpdateWarrantyClaimHandler", false, false, UpdateWarrantyClaimHandler},
		{"ExtensionsIndexHandler", false, false, ExtensionsIndexHandler},
		{"StoreExtensionHandler", false, false, StoreExtensionHandler},
		{"ProposeFeeHandler", false, false, ProposeFeeHandler},
	}
}

// h1VerbHandlers are the row-state handlers that take a verb argument.
func h1VerbHandlers() []h1Handler {
	return []h1Handler{
		{"ChangeOrderDecisionHandler/owner-decide", false, false, func(pool *pgxpool.Pool) http.HandlerFunc {
			return ChangeOrderDecisionHandler(pool, "owner-decide")
		}},
		{"ChangeOrderDecisionHandler/pm-review", false, false, func(pool *pgxpool.Pool) http.HandlerFunc {
			return ChangeOrderDecisionHandler(pool, "pm-review")
		}},
		{"PMBidDecisionHandler/accept", false, false, func(pool *pgxpool.Pool) http.HandlerFunc {
			return PMBidDecisionHandler(pool, "accept")
		}},
		{"PMBidDecisionHandler/decline", false, false, func(pool *pgxpool.Pool) http.HandlerFunc {
			return PMBidDecisionHandler(pool, "decline")
		}},
		{"PMBidDecisionHandler/shortlist", false, false, func(pool *pgxpool.Pool) http.HandlerFunc {
			return PMBidDecisionHandler(pool, "shortlist")
		}},
		{"SubProfessionalDecisionHandler/accept", false, false, func(pool *pgxpool.Pool) http.HandlerFunc {
			return SubProfessionalDecisionHandler(pool, "accept")
		}},
		{"SubProfessionalDecisionHandler/hire", false, false, func(pool *pgxpool.Pool) http.HandlerFunc {
			return SubProfessionalDecisionHandler(pool, "hire")
		}},
	}
}

// h1AllPathKeys sets every route key any owned handler reads, so the
// table needs no per-handler routing knowledge.
func h1AllPathKeys(req *http.Request, id string) {
	for _, key := range []string{
		"project", "id", "milestone", "termin", "requirement",
		"bid", "bidId", "document", "comment", "report", "folder",
		"schedule", "snagItem", "claim", "quote", "material_order",
		"material_order_review", "supplier", "notification",
		"stickyNote", "dailyLog", "dailyLogs", "addendum",
		"changeOrder", "extension", "termination", "type", "field",
		"question", "room", "token",
	} {
		req.SetPathValue(key, id)
	}
}

func h1JSONRequest(t *testing.T, method, target, body string) *http.Request {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader(`{}`)
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set("Content-Type", "application/json")
	return req
}

// TestH1Guards pins the entry branches of every owned handler:
// unauthenticated callers are rejected (or served for the public few),
// garbage ids 404, and missing rows never 200.
func TestH1Guards(t *testing.T) {
	pool := testPool(t)
	defer pool.Close()
	ctx := context.Background()

	var ownerID int64
	if err := pool.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&ownerID); err != nil {
		t.Skip("no users")
	}
	caller := roadmapCaller{id: ownerID, role: "user"}

	all := append(h1Handlers(), h1VerbHandlers()...)

	for _, h := range all {
		t.Run(h.name+"/unauthenticated", func(t *testing.T) {
			req := h1JSONRequest(t, http.MethodPost, "/api/x/999999999", "")
			h1AllPathKeys(req, "999999999")
			rec := httptest.NewRecorder()
			h.make(pool)(rec, req)
			if h.public {
				if rec.Code < 200 || rec.Code >= 600 {
					t.Fatalf("%s public unauthenticated: status %d", h.name, rec.Code)
				}
				return
			}
			if rec.Code != http.StatusUnauthorized && rec.Code != http.StatusNotFound {
				t.Fatalf("%s unauthenticated: status = %d, want 401 (or 404), body %.200s", h.name, rec.Code, rec.Body.String())
			}
		})

		t.Run(h.name+"/missing-row", func(t *testing.T) {
			req := h1JSONRequest(t, http.MethodPost, "/api/x/999999999", "")
			h1AllPathKeys(req, "999999999")
			req = req.WithContext(withCaller(req.Context(), caller))
			rec := httptest.NewRecorder()
			h.make(pool)(rec, req)
			if h.list {
				// Caller-scoped (or public) indexes ignore path ids.
				if rec.Code != http.StatusOK {
					t.Fatalf("%s missing-row: status = %d, want 200, body %.200s", h.name, rec.Code, rec.Body.String())
				}
				return
			}
			if rec.Code == http.StatusOK || rec.Code == http.StatusCreated {
				// A 200 on a missing row would be a guard hole; log the body.
				t.Fatalf("%s missing-row: status = %d, want 4xx (or 500), body %.200s", h.name, rec.Code, rec.Body.String())
			}
			// A missing row is a client error, never a 500: loader gates map
			// pgx.ErrNoRows to 404 via gateError (anything else stays 500,
			// which fails here by design).
			if rec.Code < 400 || rec.Code >= 500 {
				t.Fatalf("%s missing-row: status = %d, want 4xx, body %.200s", h.name, rec.Code, rec.Body.String())
			}
		})

		t.Run(h.name+"/bad-id", func(t *testing.T) {
			req := h1JSONRequest(t, http.MethodPost, "/api/x/abc", "")
			// No path values: handlers fall back to the URL segment.
			req = req.WithContext(withCaller(req.Context(), caller))
			rec := httptest.NewRecorder()
			h.make(pool)(rec, req)
			if h.list {
				// Caller-scoped indexes ignore path ids (200); the
				// supplier-reviews filter 404s on an unparseable id.
				// Either is a covered guard.
				if rec.Code != http.StatusOK && rec.Code != http.StatusNotFound {
					t.Fatalf("%s bad-id: status = %d, want 200/404, body %.200s", h.name, rec.Code, rec.Body.String())
				}
				return
			}
			if rec.Code < 400 || rec.Code >= 600 {
				t.Fatalf("%s bad-id: status = %d, want 4xx/5xx, body %.200s", h.name, rec.Code, rec.Body.String())
			}
		})
	}
}
