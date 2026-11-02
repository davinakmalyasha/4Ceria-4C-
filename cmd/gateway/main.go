// Command gateway is the Go API server.
//
// WHAT IT IS FOR
// --------------
// The gateway serves all 296 API endpoints. The first thing it does is
// serve the ROUTE TABLE — because "every endpoint is registered" is not
// something a person can check by reading.
//
// A route in the manifest without a handler is a 404 in production that no
// test caught, because the test called the handler directly.
//
// So the gateway:
//
//   - reads the route manifest (`routing/routes.yaml`) and registers every
//     entry with its gates;
//   - answers a deliberate 501 stub for a manifest route with no handler;
//   - reports its own route table at `GET /internal/routes`;
//   - answers `GET /healthz` and `GET /readyz`.
//
// USAGE
//
//	go run ./cmd/gateway --manifest=routing/routes.yaml --addr=:8080
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/httpapi"
	_ "github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	manifestPath := flag.String("manifest", "routing/routes.yaml", "the route manifest to serve")
	addr := flag.String("addr", ":8080", "the address to listen on")
	readTimeout := flag.Duration("read-timeout", 15*time.Second, "the read timeout")
	writeTimeout := flag.Duration("write-timeout", 30*time.Second, "the write timeout")
	shutdownTimeout := flag.Duration("shutdown-timeout", 20*time.Second, "how long to wait for in-flight requests")
	flag.Parse()

	// Development secrets live in .env, exactly like Laravel reads them.
	// Production injects the environment directly and has no .env file.
	httpapi.LoadDotEnv(".env")

	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	manifest, err := httpapi.LoadManifest(*manifestPath)
	if err != nil {
		logger.Error("could not read the route manifest", "path", *manifestPath, "error", err)
		os.Exit(1)
	}

	// The gates are declared from the manifest and enforced through
	// interfaces that are not implemented yet. The readiness probe reports
	// that, so a load balancer never sends traffic to a gateway that would
	// answer 200 on a route it does not actually protect.
	gates := httpapi.Gates{
		Handlers: map[string]http.HandlerFunc{},
		// The rate limiter needs no database: it counts in memory, so it is
		// wired even when PostgreSQL is absent. A gateway that answers 501
		// on a throttled route because the limiter is "not implemented yet"
		// would be a lie with a cache header — the limit is a protection,
		// and an unwired one is a hole.
		Limiter: httpapi.NewMemoryLimiter(),
	}

	// IDENTITY LIVES IN MYSQL.
	//
	// ADR-0018 keeps `users`, `personal_access_tokens` and the Spatie
	// tables MySQL-owned for the whole transition. The Go service reads
	// and writes them through MySQL directly — the same rows, never a
	// copy — so a session minted by either stack works on both instantly.
	// PostgreSQL stays the read mirror for everything else, and the auth
	// handlers re-sync the touched rows into it before serialising.
	if mysqlDSN := os.Getenv("MYSQL_DSN"); mysqlDSN != "" {
		// UTC, EXPLICITLY.
		//
		// MySQL TIMESTAMP columns have no zone: the server renders them in
		// the session's zone. The legacy stack means UTC by them
		// (`APP_TIMEZONE=UTC`), while this machine's system zone is
		// +07:00. Without the session pin a wall clock reads seven hours
		// in the future and a 2-hour-old reset token verifies as fresh —
		// found live, comparing expiry against Laravel on the same row.
		// This is the same UTC discipline the ETL applies to PostgreSQL.
		logicDSN := mysqlDSN
		if !strings.Contains(logicDSN, "time_zone=") {
			separator := "?"
			if strings.Contains(logicDSN, "?") {
				separator = "&"
			}

			logicDSN += separator + "time_zone=%27%2B00%3A00%27"
		}

		mysqlDB, err := sql.Open("mysql", logicDSN)
		if err != nil {
			logger.Error("connecting to MySQL", "error", err)
			os.Exit(1)
		}
		defer mysqlDB.Close()

		if err := mysqlDB.PingContext(context.Background()); err != nil {
			logger.Error("MySQL did not answer", "error", err)
			os.Exit(1)
		}

		gates.Auth = httpapi.NewSanctum(mysqlDB)
		gates.MySQL = mysqlDB

		// The re-sync reads with ETL semantics: raw wall-clock text, no
		// session time-zone pin, so the mirror holds byte-for-byte what a
		// full ETL would write. The logic pool above stays pinned to UTC
		// for correct instant arithmetic (token expiry).
		wallDSN := os.Getenv("MYSQL_DSN")
		if i := strings.Index(wallDSN, "?"); i >= 0 {
			query, err := url.ParseQuery(wallDSN[i+1:])
			if err != nil {
				logger.Error("could not parse MYSQL_DSN", "error", err)
				os.Exit(1)
			}
			query.Set("parseTime", "false")
			query.Del("time_zone")
			wallDSN = wallDSN[:i+1] + query.Encode()
		} else {
			wallDSN += "?parseTime=false"
		}
		wallDB, err := sql.Open("mysql", wallDSN)
		if err != nil {
			logger.Error("connecting to MySQL for re-sync", "error", err)
			os.Exit(1)
		}
		defer wallDB.Close()

		if err := wallDB.PingContext(context.Background()); err != nil {
			logger.Error("MySQL re-sync source did not answer", "error", err)
			os.Exit(1)
		}

		gates.MySQLWall = wallDB

		logger.Info("mysql wired", "auth", true)
	}

	// POSTGRES IS OPTIONAL, AND SAYS SO WHEN IT IS ABSENT.
	//
	// The gateway must be runnable without a database — the route-parity gate
	// starts it and compares route tables, which needs no data. With
	// DATABASE_URL set, the ported handlers and the Sanctum authenticator are
	// wired; without it they stay stubs and `/readyz` reports the reason.
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		config, err := pgxpool.ParseConfig(dsn)
		if err != nil {
			logger.Error("parsing DATABASE_URL", "error", err)
			os.Exit(1)
		}

		// Every session parses wall-clock text as UTC. The ETL copies
		// MySQL walls under SET TIME ZONE 'UTC', and Laravel reads those
		// same walls as UTC — so a timestamp round-tripped through a text
		// literal (syncRow, ad-hoc fixes) lands on the identical instant
		// on both stacks. Without this the pool inherits the server
		// default (Asia/Bangkok), and every text timestamp shifts +7h.
		config.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
			_, err := conn.Exec(ctx, "SET TIME ZONE 'UTC'")
			return err
		}

		pool, err := pgxpool.NewWithConfig(context.Background(), config)
		if err != nil {
			logger.Error("connecting to PostgreSQL", "error", err)
			os.Exit(1)
		}
		defer pool.Close()

		if err := pool.Ping(context.Background()); err != nil {
			logger.Error("PostgreSQL did not answer", "error", err)
			os.Exit(1)
		}

		gates.Freezer = httpapi.NewDbFreezer(pool)
		gates.Handlers["get.api.admin.stats"] = httpapi.StatsHandler(pool)
		gates.Handlers["get.api.notifications"] = httpapi.NotificationsHandler(pool)
		gates.Handlers["get.api.user.active-projects"] = httpapi.ActiveProjectsHandler(pool)
		gates.Handlers["get.api.me"] = httpapi.MeHandler(pool)
		gates.Handlers["put.api.me"] = httpapi.UpdateMeHandler(pool)
		gates.Handlers["post.api.me.avatar"] = httpapi.UpdateAvatarHandler(pool)
		gates.Handlers["delete.api.me.avatar"] = httpapi.DeleteAvatarHandler(pool)
		gates.Handlers["post.api.me.professional"] = httpapi.UpdateProfessionalHandler(pool)
		gates.Handlers["get.api.me.unread-summary"] = httpapi.UnreadSummaryHandler(pool)
		gates.Handlers["get.api.admin.houses"] = httpapi.AdminHousesHandler(pool)
		gates.Handlers["get.api.admin.users"] = httpapi.AdminUsersHandler(pool)
		gates.Handlers["get.api.admin.projects"] = httpapi.AdminProjectsHandler(pool)
		gates.Handlers["get.api.material-quotes"] = httpapi.MaterialQuotesIndexHandler(pool)
		gates.Handlers["post.api.material-quotes"] = httpapi.StoreMaterialQuoteHandler(pool)
		gates.Handlers["put.api.material-quotes.quote.request-payment"] = httpapi.RequestQuotePaymentHandler(pool)
		gates.Handlers["post.api.material-quotes.quote.payment-proof"] = httpapi.UploadQuotePaymentProofHandler(pool)
		gates.Handlers["put.api.material-quotes.quote.mark-paid"] = httpapi.MarkQuotePaidHandler(pool)
		gates.Handlers["post.api.material-quotes.quote.approve"] = httpapi.ApproveQuoteHandler(pool)
		gates.Handlers["post.api.material-quotes.quote.post-delivery-job"] = httpapi.PostQuoteDeliveryJobHandler(pool)
		gates.Handlers["material-orders.index"] = httpapi.MaterialOrdersIndexHandler(pool)
		gates.Handlers["material-orders.show"] = httpapi.MaterialOrderShowHandler(pool)
		gates.Handlers["post.api.material-orders.material_order.payment-proof"] = httpapi.UploadOrderPaymentProofHandler(pool)
		gates.Handlers["material-orders.update"] = httpapi.UpdateMaterialOrderHandler(pool)
		gates.Handlers["post.api.material-orders.material_order.verify-payment"] = httpapi.VerifyOrderPaymentHandler(pool)
		gates.Handlers["get.api.suppliers.supplier.reviews"] = httpapi.SupplierReviewsHandler(pool)
		gates.Handlers["post.api.material-order-reviews"] = httpapi.StoreOrderReviewHandler(pool)
		gates.Handlers["put.api.material-order-reviews.material_order_review"] = httpapi.UpdateOrderReviewHandler(pool)
		gates.Handlers["delete.api.material-order-reviews.material_order_review"] = httpapi.DestroyOrderReviewHandler(pool)
		gates.Handlers["get.api.logistics.available-jobs"] = httpapi.LogisticsAvailableJobsHandler(pool)
		gates.Handlers["post.api.logistics.jobs.id.accept"] = httpapi.LogisticsAcceptJobHandler(pool)
		gates.Handlers["get.api.logistics.dashboard-stats"] = httpapi.LogisticsDashboardStatsHandler(pool)
		gates.Handlers["get.api.logistics.my-jobs"] = httpapi.LogisticsMyJobsHandler(pool)
		gates.Handlers["post.api.logistics.jobs.id.status"] = httpapi.LogisticsUpdateStatusHandler(pool)
		gates.Handlers["houses.store"] = httpapi.StoreHouseHandler(pool)
		gates.Handlers["houses.update"] = httpapi.UpdateHouseHandler(pool)
		gates.Handlers["houses.destroy"] = httpapi.DestroyHouseHandler(pool)
		gates.Handlers["post.api.houses.house.rooms"] = httpapi.StoreRoomHandler(pool)
		gates.Handlers["get.api.houses.house.questions"] = httpapi.HouseQuestionsHandler(pool)
		gates.Handlers["post.api.houses.house.questions"] = httpapi.StoreHouseQuestionHandler(pool)
		gates.Handlers["get.api.firm-members.profile.ownerId"] = httpapi.FirmMembersProfileHandler(pool)
		gates.Handlers["post.api.firm-members.update-profile"] = httpapi.FirmMembersUpdateProfileHandler(gates.MySQL, gates.MySQLWall, pool)
		gates.Handlers["get.api.firm-members.suggestions"] = httpapi.FirmMembersSuggestionsHandler(pool)
		gates.Handlers["get.api.firm-members.my-firms"] = httpapi.FirmMembersMyFirmsHandler(pool)
		gates.Handlers["post.api.firm-members.search"] = httpapi.FirmMembersSearchHandler(pool)
		gates.Handlers["post.api.firm-members.invite"] = httpapi.FirmMembersInviteHandler(pool)
		gates.Handlers["post.api.firm-members.request-join"] = httpapi.FirmMembersRequestJoinHandler(pool)
		gates.Handlers["post.api.firm-members.firmMember.respond"] = httpapi.FirmMembersRespondHandler(pool)
		gates.Handlers["get.api.firm-members.roster"] = httpapi.FirmMembersRosterHandler(pool)
		gates.Handlers["get.api.firm-members.invitations"] = httpapi.FirmMembersInvitationsHandler(pool)
		gates.Handlers["get.api.firm-members.browse-owners"] = httpapi.FirmMembersBrowseOwnersHandler(pool)
		gates.Handlers["post.api.firm-members.firmMember.cancel"] = httpapi.FirmMembersCancelHandler(pool)
		gates.Handlers["delete.api.firm-members.firmMember"] = httpapi.FirmMembersRemoveHandler(pool)
		gates.Handlers["post.api.firm-members.quick-assign"] = httpapi.FirmMembersQuickAssignHandler(pool)
		gates.Handlers["get.api.team-members"] = httpapi.TeamMembersIndexHandler(pool)
		gates.Handlers["post.api.team-members"] = httpapi.StoreTeamMemberHandler(pool)
		gates.Handlers["put.api.team-members.id"] = httpapi.UpdateTeamMemberHandler(pool)
		gates.Handlers["delete.api.team-members.id"] = httpapi.DestroyTeamMemberHandler(pool)
		gates.Handlers["get.api.portfolios"] = httpapi.PortfoliosIndexHandler(pool)
		gates.Handlers["post.api.portfolios"] = httpapi.StorePortfolioHandler(pool)
		gates.Handlers["post.api.portfolios.id"] = httpapi.UpdatePortfolioHandler(pool)
		gates.Handlers["delete.api.portfolios.id"] = httpapi.DestroyPortfolioHandler(pool)
		gates.Handlers["get.api.favorites"] = httpapi.FavoritesIndexHandler(pool)
		gates.Handlers["post.api.favorites.toggle"] = httpapi.ToggleFavoriteHandler(pool)
		gates.Handlers["post.api.favorites.merge"] = httpapi.MergeFavoritesHandler(pool)
		gates.Handlers["delete.api.favorites.favorite"] = httpapi.DestroyFavoriteHandler(pool)
		gates.Handlers["get.api.conversations"] = httpapi.ConversationsIndexHandler(pool)
		gates.Handlers["post.api.conversations"] = httpapi.StoreConversationHandler(pool)
		gates.Handlers["get.api.conversations.conversation"] = httpapi.ShowConversationHandler(pool)
		gates.Handlers["post.api.conversations.conversation.messages"] = httpapi.SendMessageHandler(pool)
		gates.Handlers["get.api.push.public-key"] = httpapi.PushPublicKeyHandler()
		gates.Handlers["post.api.push.subscribe"] = httpapi.PushSubscribeHandler(pool)
		gates.Handlers["post.api.push.unsubscribe"] = httpapi.PushUnsubscribeHandler(pool)
		gates.Handlers["get.api.merchant.profile"] = httpapi.MerchantProfileHandler(pool)
		gates.Handlers["put.api.merchant.profile"] = httpapi.MerchantUpdateProfileHandler(pool)
		gates.Handlers["get.api.merchant.materials"] = httpapi.MerchantMaterialsHandler(pool)
		gates.Handlers["materials.store"] = httpapi.StoreMaterialHandler(pool)
		gates.Handlers["materials.update"] = httpapi.UpdateMaterialHandler(pool)
		gates.Handlers["materials.destroy"] = httpapi.DestroyMaterialHandler(pool)
		gates.Handlers["get.api.marketplace.materials"] = httpapi.MarketplaceMaterialsHandler(pool)
		gates.Handlers["get.api.marketplace.suppliers"] = httpapi.MarketplaceSuppliersHandler(pool)
		gates.Handlers["get.api.marketplace.suppliers.id"] = httpapi.MarketplaceSupplierHandler(pool)
		gates.Handlers["get.api.consultations"] = httpapi.ConsultationsIndexHandler(pool)
		gates.Handlers["post.api.consultations"] = httpapi.StoreConsultationHandler(pool)
		gates.Handlers["post.api.consultations.consultation.respond"] = httpapi.RespondConsultationHandler(pool)

		// The nine remaining single routes.
		gates.Handlers["delete.api.rooms.room"] = httpapi.DestroyRoomHandler(pool)
		gates.Handlers["get.api.brief.token"] = httpapi.PublicBriefHandler(pool)
		gates.Handlers["get.api.contractor-subspecialties"] = httpapi.ContractorSubspecialtiesHandler(pool)
		gates.Handlers["get.api.delivery-jobs"] = httpapi.SupplierDeliveryJobsHandler(pool)
		gates.Handlers["get.api.hire-history"] = httpapi.HireHistoryHandler(pool)
		gates.Handlers["get.api.my-bids"] = httpapi.MyBidsHandler(pool)
		gates.Handlers["get.api.verifications.documents.type.id.field"] = httpapi.VerificationDocumentHandler(pool)
		gates.Handlers["post.api.questions.question.answers"] = httpapi.StoreHouseAnswerHandler(pool)
		gates.Handlers["post.api.upload"] = httpapi.UploadHandler(pool)

		// Phase brief lifecycle, kickoff and reviews.
		gates.Handlers["post.api.projects.project.approve-construction-brief"] = httpapi.ApproveConstructionBriefHandler(pool)
		gates.Handlers["post.api.projects.project.revise-construction-brief"] = httpapi.ReviseConstructionBriefHandler(pool)
		gates.Handlers["post.api.projects.project.lock-brief"] = httpapi.LockPhaseBriefHandler(pool)
		gates.Handlers["post.api.projects.project.kickoff"] = httpapi.IssueKickoffHandler(pool)
		gates.Handlers["post.api.projects.project.review"] = httpapi.ReviewProjectHandler(pool)

		// Payment termin writes and mutual termination.
		gates.Handlers["put.api.projects.project.payment-termins.termin"] = httpapi.UpdatePaymentTerminHandler(pool)
		gates.Handlers["delete.api.projects.project.payment-termins.termin"] = httpapi.DeletePaymentTerminHandler(pool)
		gates.Handlers["post.api.projects.project.payment-termins.termin.link-milestone"] = httpapi.LinkTerminMilestoneHandler(pool)
		gates.Handlers["post.api.projects.project.payment-termins.termin.unlink-milestone"] = httpapi.UnlinkTerminMilestoneHandler(pool)
		gates.Handlers["get.api.projects.project.mutual-termination"] = httpapi.MutualTerminationIndexHandler(pool)
		gates.Handlers["post.api.projects.project.mutual-termination.initiate"] = httpapi.InitiateMutualTerminationHandler(pool)
		gates.Handlers["post.api.projects.project.mutual-termination.termination.respond"] = httpapi.RespondMutualTerminationHandler(pool)
		gates.Handlers["post.api.projects.project.mutual-termination.termination.escalate"] = httpapi.EscalateMutualTerminationHandler(pool)

		// Engineering / specialist workflow.
		gates.Handlers["post.api.projects.project.request-engineering"] = httpapi.RequestEngineeringRoleHandler(pool)
		gates.Handlers["post.api.projects.project.verify-engineering.addendum"] = httpapi.VerifyEngineeringRequestHandler(pool)
		gates.Handlers["post.api.projects.project.approve-engineering-hire.addendum"] = httpapi.ApproveEngineeringHireHandler(pool)
		gates.Handlers["post.api.projects.project.reject-engineering-hire.addendum"] = httpapi.RejectEngineeringHireHandler(pool)
		gates.Handlers["post.api.projects.project.approve-engineering"] = httpapi.ApproveEngineeringIntegrationHandler(pool)
		gates.Handlers["post.api.projects.project.authorize-specialist"] = httpapi.AuthorizeSpecialistHandler(pool)
		gates.Handlers["post.api.projects.project.reject-specialist"] = httpapi.RejectSpecialistHandler(pool)
		gates.Handlers["post.api.projects.project.reject-engineering-bid.bidId"] = httpapi.RejectEngineeringBidHandler(pool)
		gates.Handlers["post.api.projects.project.submit-engineering-interview"] = httpapi.SubmitEngineeringInterviewHandler(pool)
		gates.Handlers["post.api.projects.project.shortlist-bid"] = httpapi.ShortlistBidHandler(pool)
		gates.Handlers["post.api.projects.project.terminate"] = httpapi.TerminateProfessionalHandler(pool)
		gates.Handlers["post.api.projects.project.resign"] = httpapi.ResignFromProjectHandler(pool)
		gates.Handlers["post.api.projects.project.propose-fee"] = httpapi.ProposeFeeHandler(pool)
		gates.Handlers["post.api.projects.project.import-external-vendor"] = httpapi.ImportExternalVendorHandler(pool)
		gates.Handlers["post.api.projects.project.technical-audit-submit"] = httpapi.TechnicalAuditHandler(pool)
		gates.Handlers["projects.store"] = httpapi.StoreProjectHandler(pool)
		gates.Handlers["projects.update"] = httpapi.UpdateProjectHandler(pool)
		gates.Handlers["post.api.projects.project.update"] = httpapi.UpdateProjectHandler(pool)
		gates.Handlers["get.api.admin.projects.export"] = httpapi.AdminProjectsExportHandler(pool)
		gates.Handlers["post.api.admin.projects.project.force-terminate"] = httpapi.AdminForceTerminateHandler(pool)
		gates.Handlers["get.api.admin.professionals"] = httpapi.AdminProfessionalsIndexHandler(pool)
		gates.Handlers["get.api.admin.professionals.history"] = httpapi.AdminProfessionalsHistoryHandler(pool)
		gates.Handlers["patch.api.admin.users.user.suspend"] = httpapi.AdminSuspendUserHandler(gates.MySQL, gates.MySQLWall, pool)
		gates.Handlers["patch.api.admin.users.user.role"] = httpapi.AdminUpdateUserRoleHandler(gates.MySQL, gates.MySQLWall, pool)
		gates.Handlers["patch.api.admin.houses.id.suspend"] = httpapi.AdminSuspendHouseHandler(pool)
		gates.Handlers["patch.api.admin.professionals.type.id.status"] = httpapi.AdminUpdateProfessionalStatusHandler(pool)
		gates.Handlers["get.api.admin.disputes"] = httpapi.AdminDisputesHandler(pool)
		gates.Handlers["get.api.admin.disputes.dispute"] = httpapi.AdminDisputeShowHandler(pool)
		gates.Handlers["post.api.admin.disputes.dispute.reply"] = httpapi.AdminDisputeReplyHandler(pool)
		gates.Handlers["post.api.admin.disputes.dispute.act"] = httpapi.AdminDisputeActHandler(pool)
		gates.Handlers["get.api.admin.disputes.dispute.messages.message.evidence"] = httpapi.AdminDisputeEvidenceHandler(pool)
		gates.Handlers["get.api.arsitek"] = httpapi.DirectoryHandler(pool, "arsiteks", "/api/arsitek", false)
		gates.Handlers["get.api.kontraktor"] = httpapi.DirectoryHandler(pool, "kontraktors", "/api/kontraktor", false)
		gates.Handlers["get.api.interior"] = httpapi.DirectoryHandler(pool, "interior_profiles", "/api/interior", false)
		gates.Handlers["get.api.notaris"] = httpapi.DirectoryHandler(pool, "notaris_profiles", "/api/notaris", true)
		gates.Handlers["get.api.project-manager"] = httpapi.DirectoryHandler(pool, "project_managers", "/api/project-manager", false)
		gates.Handlers["get.api.structural-engineers"] = httpapi.DirectoryHandler(pool, "structural_engineers", "/api/structural-engineers", false)
		gates.Handlers["get.api.mep-engineers"] = httpapi.DirectoryHandler(pool, "mep_engineers", "/api/mep-engineers", false)
		gates.Handlers["get.api.houses"] = httpapi.HousesHandler(pool)
		gates.Handlers["get.api.houses.house"] = httpapi.HouseHandler(pool)
		gates.Handlers["get.api.geocode.reverse"] = httpapi.GeocodeReverseHandler(pool)
		gates.Handlers["get.api.geocode.search"] = httpapi.GeocodeSearchHandler(pool)
		gates.Handlers["get.api.projects"] = httpapi.ProjectsHandler(pool)
		gates.Handlers["get.api.projects.project"] = httpapi.ProjectShowHandler(pool)
		gates.Handlers["get.api.projects.project.disputes.dispute.messages.message.evidence"] = httpapi.ProjectDisputeEvidenceHandler(pool)
		gates.Handlers["post.api.projects.project.disputes.dispute.withdraw"] = httpapi.ProjectDisputeWithdrawHandler(pool)
		gates.Handlers["get.api.projects.project.disputes"] = httpapi.ProjectDisputesIndexHandler(pool)
		gates.Handlers["post.api.projects.project.disputes"] = httpapi.ProjectDisputeStoreHandler(pool)
		gates.Handlers["get.api.projects.project.disputes.dispute"] = httpapi.ProjectDisputeShowHandler(pool)
		gates.Handlers["post.api.projects.project.disputes.dispute.reply"] = httpapi.ProjectDisputeReplyHandler(pool)
		gates.Handlers["get.api.projects.project.comments"] = httpapi.ProjectCommentsIndexHandler(pool)
		gates.Handlers["post.api.projects.project.comments"] = httpapi.ProjectCommentsStoreHandler(pool)
		gates.Handlers["put.api.projects.project.comments.comment"] = httpapi.UpdateCommentHandler(pool)
		gates.Handlers["delete.api.projects.project.comments.comment"] = httpapi.DestroyCommentHandler(pool)
		gates.Handlers["get.api.projects.project.reports"] = httpapi.ProjectReportsIndexHandler(pool)
		gates.Handlers["post.api.projects.project.reports"] = httpapi.StoreReportHandler(pool)
		gates.Handlers["put.api.projects.project.reports.report"] = httpapi.UpdateReportHandler(pool)
		gates.Handlers["delete.api.projects.project.reports.report"] = httpapi.DestroyReportHandler(pool)
		gates.Handlers["get.api.projects.project.sticky-notes"] = httpapi.StickyNotesIndexHandler(pool)
		gates.Handlers["post.api.projects.project.sticky-notes"] = httpapi.StoreStickyNoteHandler(pool)
		gates.Handlers["put.api.projects.project.sticky-notes.stickyNote"] = httpapi.UpdateStickyNoteHandler(pool)
		gates.Handlers["delete.api.projects.project.sticky-notes.stickyNote"] = httpapi.DestroyStickyNoteHandler(pool)
		gates.Handlers["post.api.projects.project.share-token"] = httpapi.GenerateShareTokenHandler(pool)
		gates.Handlers["delete.api.projects.project.share-token"] = httpapi.RevokeShareTokenHandler(pool)
		gates.Handlers["post.api.projects.project.broadcast-phase"] = httpapi.BroadcastPhaseHandler(pool)
		gates.Handlers["get.api.notification-preferences"] = httpapi.NotificationPreferencesIndexHandler(pool)
		gates.Handlers["put.api.notification-preferences"] = httpapi.UpdateNotificationPreferenceHandler(pool)
		gates.Handlers["delete.api.notification-preferences"] = httpapi.DestroyNotificationPreferenceHandler(pool)
		gates.Handlers["post.api.notifications.notification.read"] = httpapi.MarkNotificationReadHandler(pool)
		gates.Handlers["post.api.notifications.read-all"] = httpapi.MarkAllNotificationsReadHandler(pool)
		gates.Handlers["get.api.projects.project.bids"] = httpapi.GetProjectBidsHandler(pool)
		gates.Handlers["post.api.projects.project.bids"] = httpapi.SubmitProjectBidHandler(pool)
		gates.Handlers["post.api.projects.project.bids.bid.accept-invite"] = httpapi.AcceptInviteHandler(pool)
		gates.Handlers["post.api.projects.project.bids.bid.reject-invite"] = httpapi.RejectInviteHandler(pool)
		gates.Handlers["post.api.projects.project.bids.bid.negotiate"] = httpapi.NegotiateBidFeeHandler(pool)
		gates.Handlers["post.api.projects.project.bids.bid.confirm-fee"] = httpapi.ConfirmBidFeeHandler(pool)
		gates.Handlers["post.api.projects.project.accept-bid"] = httpapi.AcceptBidHandler(pool)
		gates.Handlers["post.api.projects.project.decline-bid"] = httpapi.DeclineBidHandler(pool)
		gates.Handlers["post.api.projects.project.bids.bid.sign-contract"] = httpapi.SignContractHandler(pool, gates.MySQL, gates.MySQLWall)
		gates.Handlers["post.api.projects.project.bids.bid.client-sign-contract"] = httpapi.ClientSignContractHandler(pool)
		gates.Handlers["get.api.projects.project.budget"] = httpapi.BudgetDashboardHandler(pool)
		gates.Handlers["post.api.projects.project.budget.transactions"] = httpapi.AddTransactionHandler(pool)
		gates.Handlers["post.api.projects.project.budget.sandbox"] = httpapi.AddSandboxHandler(pool)
		gates.Handlers["put.api.projects.project.budget.sandbox.id"] = httpapi.ToggleSandboxHandler(pool)
		gates.Handlers["put.api.projects.project.budget.sandbox.id.update"] = httpapi.UpdateSandboxHandler(pool)
		gates.Handlers["delete.api.projects.project.budget.sandbox.id"] = httpapi.DeleteSandboxHandler(pool)
		gates.Handlers["post.api.projects.project.budget.mark-paid"] = httpapi.MarkPaidHandler(pool)
		gates.Handlers["post.api.projects.project.budget.addendums"] = httpapi.CreateAddendumHandler(pool)
		gates.Handlers["put.api.projects.project.budget.addendums.id"] = httpapi.HandleAddendumHandler(pool)
		gates.Handlers["post.api.projects.project.verify-payment"] = httpapi.VerifyPaymentHandler(pool)
		gates.Handlers["post.api.projects.project.addendums.addendum.approve"] = httpapi.ApproveAddendumHandler(pool)
		gates.Handlers["post.api.projects.project.addendums.addendum.reject"] = httpapi.RejectAddendumHandler(pool)
		gates.Handlers["get.api.projects.project.bast"] = httpapi.BastHandler(pool)
		gates.Handlers["get.api.projects.project.legal-financials"] = httpapi.LegalFinancialsHandler(pool)
		gates.Handlers["post.api.projects.project.invite"] = httpapi.InviteProfessionalHandler(pool)
		gates.Handlers["post.api.projects.project.mark-complete"] = httpapi.MarkCompleteHandler(pool)
		gates.Handlers["projects.destroy"] = httpapi.DestroyProjectHandler(pool)
		gates.Handlers["get.api.projects.project.sub-professionals"] = httpapi.SubProfessionalsIndexHandler(pool)
		gates.Handlers["post.api.projects.project.sub-professionals"] = httpapi.AssignSubProfessionalHandler(pool)
		gates.Handlers["post.api.projects.project.sub-professionals.id.accept"] = httpapi.SubProfessionalDecisionHandler(pool, "accept")
		gates.Handlers["post.api.projects.project.sub-professionals.id.decline"] = httpapi.SubProfessionalDecisionHandler(pool, "decline")
		gates.Handlers["post.api.projects.project.sub-professionals.id.interview"] = httpapi.SubProfessionalDecisionHandler(pool, "interview")
		gates.Handlers["post.api.projects.project.sub-professionals.id.recommend"] = httpapi.SubProfessionalDecisionHandler(pool, "recommend")
		gates.Handlers["post.api.projects.project.sub-professionals.id.hire"] = httpapi.SubProfessionalDecisionHandler(pool, "hire")
		gates.Handlers["delete.api.projects.project.sub-professionals.id"] = httpapi.RemoveSubProfessionalHandler(pool)
		gates.Handlers["post.api.projects.project.sub-professionals.shortlist-bid.role.bidId"] = httpapi.ShortlistSubBidHandler(pool)
		gates.Handlers["post.api.projects.project.pm-bids"] = httpapi.SubmitPMBidHandler(pool)
		gates.Handlers["post.api.projects.project.pm-bids.bid.accept"] = httpapi.PMBidDecisionHandler(pool, "accept")
		gates.Handlers["post.api.projects.project.pm-bids.bid.decline"] = httpapi.PMBidDecisionHandler(pool, "decline")
		gates.Handlers["post.api.projects.project.pm-bids.bid.shortlist"] = httpapi.PMBidDecisionHandler(pool, "shortlist")
		gates.Handlers["post.api.projects.project.verify-pbg"] = httpapi.VerifyPBGHandler(pool)
		gates.Handlers["post.api.projects.project.verify-slf"] = httpapi.VerifySLFHandler(pool)
		gates.Handlers["get.api.projects.project.documents"] = httpapi.DocumentsIndexHandler(pool)
		gates.Handlers["post.api.projects.project.documents"] = httpapi.StoreDocumentHandler(pool)
		gates.Handlers["put.api.projects.project.documents.document"] = httpapi.UpdateDocumentHandler(pool)
		gates.Handlers["delete.api.projects.project.documents.document"] = httpapi.DestroyDocumentHandler(pool)
		gates.Handlers["post.api.projects.project.documents.document.verify"] = httpapi.VerifyDocumentHandler(pool)
		gates.Handlers["post.api.projects.project.documents.submit-design"] = httpapi.SubmitDesignHandler(pool)
		gates.Handlers["post.api.projects.project.documents.approve-design"] = httpapi.ApproveDesignHandler(pool)
		gates.Handlers["post.api.projects.project.documents.revise-design"] = httpapi.ReviseDesignHandler(pool)
		gates.Handlers["get.api.projects.project.material-folders"] = httpapi.MaterialFoldersIndexHandler(pool)
		gates.Handlers["post.api.projects.project.material-folders"] = httpapi.StoreMaterialFolderHandler(pool)
		gates.Handlers["put.api.projects.project.material-folders.folder"] = httpapi.UpdateMaterialFolderHandler(pool)
		gates.Handlers["delete.api.projects.project.material-folders.folder"] = httpapi.DestroyMaterialFolderHandler(pool)
		gates.Handlers["get.api.projects.project.change-orders"] = httpapi.ChangeOrdersIndexHandler(pool)
		gates.Handlers["post.api.projects.project.change-orders"] = httpapi.StoreChangeOrderHandler(pool)
		gates.Handlers["post.api.projects.project.change-orders.changeOrder.pm-review"] = httpapi.ChangeOrderDecisionHandler(pool, "pm-review")
		gates.Handlers["post.api.projects.project.change-orders.changeOrder.owner-decide"] = httpapi.ChangeOrderDecisionHandler(pool, "owner-decide")
		gates.Handlers["get.api.projects.project.extensions"] = httpapi.ExtensionsIndexHandler(pool)
		gates.Handlers["post.api.projects.project.extensions"] = httpapi.StoreExtensionHandler(pool)
		gates.Handlers["post.api.projects.project.extensions.extension.pm-review"] = httpapi.ExtensionDecisionHandler(pool, "pm-review")
		gates.Handlers["post.api.projects.project.extensions.extension.owner-decide"] = httpapi.ExtensionDecisionHandler(pool, "owner-decide")
		gates.Handlers["get.api.projects.project.daily-logs"] = httpapi.DailyLogsIndexHandler(pool)
		gates.Handlers["post.api.projects.project.daily-logs"] = httpapi.StoreDailyLogHandler(pool)
		gates.Handlers["delete.api.projects.project.daily-logs.dailyLog"] = httpapi.DestroyDailyLogHandler(pool)
		gates.Handlers["delete.api.projects.project.milestones.milestone"] = httpapi.DestroyMilestoneHandler(pool)
		gates.Handlers["post.api.projects.project.milestones.milestone.approve"] = httpapi.ApproveMilestoneHandler(pool)
		gates.Handlers["put.api.projects.project.milestones.milestone"] = httpapi.UpdateMilestoneHandler(pool)
		gates.Handlers["post.api.projects.project.engineering-logs"] = httpapi.StoreEngineeringLogHandler(pool)
		gates.Handlers["delete.api.projects.project.engineering-logs.milestone"] = httpapi.DeleteEngineeringLogHandler(pool)
		gates.Handlers["get.api.projects.project.schedules"] = httpapi.SchedulesIndexHandler(pool)
		gates.Handlers["put.api.projects.project.schedules.schedule"] = httpapi.UpdateScheduleHandler(pool)
		gates.Handlers["post.api.projects.project.delays"] = httpapi.LogDelayHandler(pool)
		gates.Handlers["get.api.projects.project.snag-items"] = httpapi.SnagItemsIndexHandler(pool)
		gates.Handlers["post.api.projects.project.snag-items"] = httpapi.StoreSnagItemHandler(pool)
		gates.Handlers["put.api.projects.project.snag-items.snagItem"] = httpapi.UpdateSnagItemHandler(pool)
		gates.Handlers["post.api.projects.project.snag-items.snagItem.accept"] = httpapi.AcceptSnagHandler(pool)
		gates.Handlers["get.api.projects.project.warranty-claims"] = httpapi.WarrantyClaimsIndexHandler(pool)
		gates.Handlers["post.api.projects.project.warranty-claims"] = httpapi.StoreWarrantyClaimHandler(pool)
		gates.Handlers["put.api.projects.project.warranty-claims.claim.status"] = httpapi.UpdateWarrantyClaimHandler(pool)
		gates.Handlers["post.api.projects.project.initiate-walkthrough"] = httpapi.InitiateWalkthroughHandler(pool)
		gates.Handlers["post.api.projects.project.owner-accept"] = httpapi.OwnerAcceptProjectHandler(pool)
		gates.Handlers["post.api.projects.project.handover.approve"] = httpapi.PhaseHandoverApproveHandler(pool)
		gates.Handlers["post.api.projects.project.handover.reject"] = httpapi.PhaseHandoverRevisionHandler(pool)
		gates.Handlers["post.api.projects.project.seal-design"] = httpapi.SealDesignHandler(pool)
		gates.Handlers["post.api.projects.project.seal-construction"] = httpapi.SealConstructionHandler(pool)
		gates.Handlers["post.api.projects.project.seal-interior"] = httpapi.SealInteriorHandler(pool)
		gates.Handlers["post.api.projects.project.seal-legal"] = httpapi.SealLegalHandler(pool)
		gates.Handlers["post.api.projects.project.authorize-phase"] = httpapi.AuthorizePhaseHandler(pool)
		gates.Handlers["post.api.projects.project.verify-legal"] = httpapi.VerifyLegalHandler(pool)
		gates.Handlers["post.api.projects.project.submit-planning"] = httpapi.SubmitPlanningHandler(pool)
		gates.Handlers["post.api.projects.project.approve-planning"] = httpapi.ApprovePlanningHandler(pool)
		gates.Handlers["post.api.projects.project.reject-planning"] = httpapi.RejectPlanningHandler(pool)
		gates.Handlers["post.api.projects.project.verify-planning-pm"] = httpapi.VerifyPlanningPMHandler(pool)
		gates.Handlers["post.api.projects.project.update-planning-audit"] = httpapi.UpdatePlanningAuditHandler(pool)
		gates.Handlers["get.api.projects.project.activity"] = httpapi.ActivityHandler(pool)
		gates.Handlers["get.api.projects.project.payment-termins"] = httpapi.PaymentTerminsHandler(pool)
		gates.Handlers["post.api.projects.project.payment-termins"] = httpapi.StoreTerminHandler(pool)
		gates.Handlers["get.api.projects.project.milestones"] = httpapi.MilestonesHandler(pool)
		gates.Handlers["post.api.projects.project.milestones"] = httpapi.StoreMilestoneHandler(pool)
		gates.Handlers["get.api.projects.project.requirements"] = httpapi.RequirementsHandler(pool)
		gates.Handlers["post.api.projects.project.requirements"] = httpapi.StoreRequirementHandler(pool)
		gates.Handlers["put.api.projects.project.requirements.requirement"] = httpapi.UpdateRequirementHandler(pool)
		gates.Handlers["delete.api.projects.project.requirements.requirement"] = httpapi.DeleteRequirementHandler(pool)
		gates.Handlers["get.api.projects.project.requirements-history"] = httpapi.ProjectHistoryHandler(pool)
		gates.Handlers["get.api.projects.project.requirements.requirement.history"] = httpapi.RequirementHistoryHandler(pool)
		gates.Handlers["post.api.projects.project.requirements.requirement.restock"] = httpapi.RestockHandler(pool)
		gates.Handlers["post.api.projects.project.requirements.requirement.use"] = httpapi.UseHandler(pool)
		gates.Handlers["post.api.projects.project.requirements.requirement.usage"] = httpapi.UsageHandler(pool)
		gates.Handlers["post.api.projects.project.requirements.requirement.request-procurement"] = httpapi.RequestProcurementHandler(pool)
		gates.Handlers["get.api.projects.project.procurement-requests"] = httpapi.ProcurementListHandler(pool)
		gates.Handlers["post.api.projects.project.payments.type.id.upload-proof"] = httpapi.UploadProofHandler(pool)
		gates.Handlers["post.api.projects.project.payments.type.id.verify-proof"] = httpapi.VerifyProofHandler(pool)
		gates.Handlers["post.api.projects.project.procurement-requests.procurementRequest.verify"] = httpapi.VerifyProcurementHandler(pool)
		gates.Handlers["post.api.projects.project.procurement-requests.procurementRequest.reject"] = httpapi.RejectProcurementHandler(pool)

		// Identity writes go to the MySQL owner store (ADR-0018) and read
		// back through the PG mirror after a targeted re-sync.
		if gates.MySQL != nil && gates.MySQLWall != nil {
			gates.Handlers["post.api.login"] = httpapi.LoginHandler(gates.MySQL, gates.MySQLWall, pool)
			gates.Handlers["post.api.register"] = httpapi.RegisterHandler(gates.MySQL, gates.MySQLWall, pool)
			gates.Handlers["post.api.logout"] = httpapi.LogoutHandler(gates.MySQL)
			gates.Handlers["post.api.forgot-password"] = httpapi.ForgotPasswordHandler(gates.MySQL, httpapi.NewMailer())
			gates.Handlers["post.api.reset-password"] = httpapi.ResetPasswordHandler(gates.MySQL)
		}

		logger.Info("postgres wired", "handlers", len(gates.Handlers))
	}

	router := httpapi.NewRouter(manifest, gates)

	logger.Info("gateway starting",
		"manifest", *manifestPath,
		"routes", len(manifest.Routes),
		"method_uri_pairs", len(manifest.MethodURIs()),
		"missing_gates", gates.Unimplemented(),
	)

	server := &http.Server{
		Addr:              *addr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       *readTimeout,
		WriteTimeout:      *writeTimeout,
	}

	// The graceful shutdown: a request in flight is a request that may be
	// writing to the database, so the process waits for it.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	serveErr := make(chan error, 1)

	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	select {
	case err := <-serveErr:
		logger.Error("the server stopped", "error", err)
		os.Exit(1)

	case sig := <-stop:
		logger.Info("shutting down", "signal", sig.String())

		ctx, cancel := context.WithTimeout(context.Background(), *shutdownTimeout)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			logger.Error("the shutdown did not finish cleanly", "error", err)
			os.Exit(1)
		}

		logger.Info("stopped")
	}
}
