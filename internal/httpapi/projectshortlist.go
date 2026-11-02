package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SHORTLIST — the first hiring decision.
//
// The owner and the assigned PM may shortlist any role; the lead architect or
// lead contractor may also shortlist SPECIALISTS (structural/mep) for their
// own project. A PM-managed project refuses the owner until the PM is the one
// acting. Only live bids are eligible, and the answer is the reloaded project.
func ShortlistBidHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()
		projectID, rawProject := projectPathID(r)

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("shortlist: project", "error", err)
			serverError(w)
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("shortlist: viewer", "error", err)
			serverError(w)
			return
		}

		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}

		ownerID := projectInt(values, fields, "user_id")
		pmID := projectIntPtr(values, fields, "pm_id")
		isOwner := viewer.id == ownerID
		isPM := verifyAssignedPM(viewer, pmID)

		leadArchitect := false
		if selected := projectIntPtr(values, fields, "selected_arsitek_id"); selected != nil && viewer.role == "arsitek" {
			if own, ok := viewer.profiles["arsitek"]; ok && own == *selected {
				leadArchitect = true
			}
		}
		leadContractor := false
		if selected := projectIntPtr(values, fields, "selected_kontraktor_id"); selected != nil && viewer.role == "kontraktor" {
			if own, ok := viewer.profiles["kontraktor"]; ok && own == *selected {
				leadContractor = true
			}
		}

		bidType := ""
		if raw, present := body["bid_type"]; present && raw != nil {
			if text, ok := raw.(string); ok {
				bidType = text
			}
		}
		isSpecialist := bidType == "structural" || bidType == "mep"
		canShortlist := isOwner || isPM || (isSpecialist && (leadArchitect || leadContractor))
		if !canShortlist {
			message(w, http.StatusForbidden, "Unauthorized. Only project owner, PM, or assigned lead professional can shortlist candidates.")
			return
		}

		wantsPM := false
		if raw := projectBool(values, fields, "wants_project_manager"); raw != nil {
			wantsPM = raw.(bool)
		}
		if (isOwner || isPM) && wantsPM && !isPM {
			message(w, http.StatusForbidden, "This project is managed by a Project Manager. Only the Project Manager can shortlist professionals.")
			return
		}

		failures := &errorBag{}
		var bidID int64
		if raw, present := body["bid_id"]; !present || raw == nil {
			failures.add("bid_id", "The bid id field is required.")
		} else {
			text, ok := numericTextOf(raw)
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if !ok || err != nil {
				failures.add("bid_id", "The bid id field must be an integer.")
			} else {
				bidID = parsed
			}
		}

		validBidType := false
		for _, role := range []string{"arsitek", "kontraktor", "notaris", "interior", "structural", "mep"} {
			if bidType == role {
				validBidType = true
				break
			}
		}
		if bidType == "" {
			failures.add("bid_type", "The bid type field is required.")
		} else if !validBidType {
			failures.add("bid_type", "The selected bid type is invalid.")
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		bidFields, bidValues, found, err := engineeringBid(ctx, pool, projectID, bidType, bidID)
		if err != nil {
			slog.Error("shortlist: bid", "error", err)
			serverError(w)
			return
		}
		if !found {
			scopedNotFound(w, bidModelNameForRole(bidType))
			return
		}
		bid := projectColumnsByName(bidFields, bidValues)
		status := stringOf(bid["status"])
		if status != "pending" && status != "negotiating" && status != "invited" && status != "reviewed" {
			message(w, http.StatusUnprocessableEntity, "A bid with status '"+status+"' cannot be shortlisted.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("shortlist: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'shortlisted',
			updated_at = date_trunc('second', now())
			WHERE project_id = $1 AND role::text = $2 AND (id = $3 OR legacy_id = $3)`,
			projectID, bidType, bidID); err != nil {
			slog.Error("shortlist: update", "error", err)
			serverError(w)
			return
		}

		// Notify the bidder.
		if profileID := intPtrOf(bid[bidProfileColumnForRole(bidType)]); profileID != nil {
			var bidderUserID *int64
			table, _ := bidProfileTable(bidType)
			if table != "" {
				_ = tx.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, *profileID).Scan(&bidderUserID)
			}
			if bidderUserID != nil && *bidderUserID != 0 {
				title := stringOf(projectText(values, fields, "title"))
				data := `{"project_id":` + strconv.FormatInt(projectID, 10) + `}`
				body := "You have been shortlisted for project \"" + title + "\". The owner wants to discuss your proposal."
				if _, err := tx.Exec(ctx, `INSERT INTO notifications
					(user_id, type, title, body, data, created_at, updated_at)
					VALUES ($1, 'bid_shortlisted', 'Proposal Shortlisted!', $2, $3::jsonb,
					 date_trunc('second', now()), date_trunc('second', now()))`,
					*bidderUserID, body, data); err != nil {
					slog.Warn("shortlist: notify", "error", err)
				}
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("shortlist: commit", "error", err)
			serverError(w)
			return
		}

		viewerForResource, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("shortlist: reload viewer", "error", err)
			serverError(w)
			return
		}

		renderProjectAnswer(ctx, pool, w, projectID, viewerForResource, projectLoad{
			images:       true,
			unscopedBids: true,
			// shortlistBid loads the four hired pros (so `interior_engineer`
			// renders null) and the seven bid trees, but no engineer blocks.
			viewerBidRoles: []string{"arsitek", "kontraktor", "notaris", "interior", "structural", "mep"},
			hiredPros:      true,
			engineers:      []string{"interior_engineer"},
			ratings:        true,
			budgetSummary:  true,
			countRoles:     bidCountRoles,
		})
	}
}

// bidModelNameForRole is the legacy model name used by the scoped 404.
func bidModelNameForRole(role string) string {
	switch role {
	case "arsitek":
		return `App\Models\BidArsitek`
	case "kontraktor":
		return `App\Models\BidKontraktor`
	case "notaris":
		return `App\Models\BidNotaris`
	case "interior":
		return `App\Models\BidInterior`
	case "structural":
		return `App\Models\BidStructural`
	case "mep":
		return `App\Models\BidMep`
	default:
		return `App\Models\BidArsitek`
	}
}

// bidProfileColumnForRole is the unified table's profile column.
func bidProfileColumnForRole(role string) string {
	column, _ := bidProfileColumn(role)
	return column
}
