package httpapi

import (
	"context"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BID READ + WRITE — GET /api/projects/{project}/bids and
// POST /api/projects/{project}/bids.
//
// getBids is the membership-gated read: owner, assigned PM, hired
// professional or existing bidder. Everyone else reads 403. It returns
// ProjectResource with ALL seven bid relations loaded unscoped (the
// controller names no constraint), no counts (no loadCount, so zeros),
// no images/milestones/requirements/addendums/sub-professionals/hired
// pros/ratings — but WITH budget_summary (the route names {project}).
//
// submitBid is the creation path: role gate, verification gate, project
// status, vacancy, target_role, contractor sequencing, validation,
// duplicate guard, BidCalculationService, insert, notification, reload.

// getBidsLoad is what getBids() eager-loads: all seven bid relations
// unscoped, owner phones, and the budget summary. No counts (zeros),
// no client history, no images, no hired pros.
func getBidsLoad() projectLoad {
	return projectLoad{
		ownerPhone:     false,
		viewerBidRoles: []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager", "structural", "mep"},
		unscopedBids:   true,
		countRoles:     nil,
		clientHistory:  false,
		budgetSummary:  true,
		specialists:    false,
		hiredPros:      false,
		pmBlock:        false,
		ratings:        false,
		requirements:   false,
		addendums:      false,
	}
}

// submitBidLoad is what submitBid() reloads for its 200: images, owner,
// the FIVE main bid relations (structural/mep are NOT loaded), ratings
// (ratings + kontraktorRating), the hired PM block — but no counts,
// no milestones, no hired pros, no requirements/addendums.
func submitBidLoad() projectLoad {
	return projectLoad{
		images:         true,
		ownerPhone:     false,
		viewerBidRoles: []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager"},
		unscopedBids:   true,
		countRoles:     nil,
		clientHistory:  false,
		budgetSummary:  true,
		specialists:    false,
		hiredPros:      false,
		pmBlock:        true,
		ratings:        true,
		requirements:   false,
		addendums:      false,
	}
}

// GetProjectBidsHandler serves `GET /api/projects/{project}/bids`.
func GetProjectBidsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		raw := r.PathValue("project")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, raw)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		viewer, err := loadViewer(r.Context(), pool, caller)
		if err != nil {
			slog.Error("project bids: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(r.Context(), pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("project bids: query", "error", err)
			serverError(w)
			return
		}

		allowed, err := canAccessBids(r.Context(), pool, viewer, projectID, projectColumns(values, fields, "selected_arsitek_id", "selected_kontraktor_id", "selected_notaris_id", "selected_interior_id", "structural_id", "mep_id"))
		if err != nil {
			slog.Error("project bids: gate", "error", err)
			serverError(w)
			return
		}

		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized access to project bids.")
			return
		}

		row, err := projectResource(r.Context(), pool, fields, values, viewer, getBidsLoad(), map[int64]*clientHistory{}, nil)
		if err != nil {
			slog.Error("project bids: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", row)

		writeJSON(w, http.StatusOK, payload)
	}
}

// canAccessBids mirrors getBids' gate: owner, assigned PM, hired
// professional, or existing bidder. Anyone else reads 403.
func canAccessBids(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64, selected map[string]*int64) (bool, error) {
	if viewer == nil || viewer.id == 0 {
		return false, nil
	}

	var ownerID int64
	if err := pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID); err != nil {
		return false, err
	}

	if viewer.id == ownerID {
		return true, nil
	}

	var pmID *int64
	if err := pool.QueryRow(ctx, `SELECT pm_id FROM projects WHERE id = $1`, projectID).Scan(&pmID); err != nil {
		return false, err
	}

	if pmID != nil && *pmID != 0 {
		if own, ok := viewer.profiles["project_manager"]; ok && own == *pmID {
			// The legacy gate reads Hire::isAssignedPm (profile match),
			// not the user-id comparison — mirrored here.
			return true, nil
		}
	}

	byRole := map[string]struct {
		column  string
		profile string
	}{
		"arsitek":         {column: "arsitek_id", profile: "arsitek"},
		"kontraktor":      {column: "kontraktor_id", profile: "kontraktor"},
		"notaris":         {column: "notaris_id", profile: "notaris"},
		"interior":        {column: "interior_id", profile: "interior"},
		"structural":      {column: "structural_id", profile: "structural"},
		"mep":             {column: "mep_id", profile: "mep"},
		"project_manager": {column: "pm_id", profile: "project_manager"},
	}

	if viewer.role != "" {
		if own, ok := viewer.profiles[viewer.role]; ok && own != 0 {
			if mapping, ok := byRole[viewer.role]; ok {
				// Hired check: project's selected column names this profile.
				colMap := map[string]string{
					"arsitek":         "selected_arsitek_id",
					"kontraktor":      "selected_kontraktor_id",
					"notaris":         "selected_notaris_id",
					"interior":        "selected_interior_id",
					"structural":      "structural_id",
					"mep":             "mep_id",
					"project_manager": "pm_id",
				}
				if col, ok := colMap[viewer.role]; ok {
					if selected[col] != nil && *selected[col] == own {
						return true, nil
					}
				}

				var exists bool
				if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM bids WHERE project_id = $1 AND role::text = $2 AND `+mapping.column+` = $3)`,
					projectID, viewer.role, own).Scan(&exists); err != nil {
					return false, err
				}
				if exists {
					return true, nil
				}
			}
		}
	}

	return false, nil
}

// bidCalculation ports BidCalculationService::calculate exactly:
// fee_type default fixed, percentage against the project budget,
// unit/sqm/hourly/fixed branches, and the ceil-to-int total with the
// zero guard.
func bidCalculation(feeType string, priceInput, unitPrice, quantity float64, projectBudget string, projectDimensions string) (feeOut string, priceOut, unitOut, quantityOut, totalOut float64) {
	if feeType == "" {
		feeType = "fixed"
	}

	calculated := 0.0

	switch feeType {
	case "percentage":
		var budget float64
		if projectBudget != "" {
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(projectBudget), 64); err == nil {
				budget = parsed
			}
		}
		if budget > 0 {
			calculated = (priceInput / 100) * budget
		} else {
			calculated = 0
		}
	case "unit":
		calculated = unitPrice * quantity
	case "sqm":
		area := 1.0
		if projectDimensions != "" {
			area = bidArea(projectDimensions)
		}
		calculated = priceInput * area
		quantity = area
		unitPrice = priceInput
	case "hourly":
		calculated = priceInput
	case "fixed":
		fallthrough
	default:
		calculated = priceInput
	}

	if calculated > 0 {
		calculated = math.Max(1, math.Ceil(calculated))
	} else {
		calculated = 0
	}

	return feeType, priceInput, unitPrice, quantity, calculated
}

// bidArea reads the first positive dimension for the sqm branch.
func bidArea(dimensions string) float64 {
	for _, key := range []string{"building_area", "building_size", "renovation_area", "area_size", "land_area", "land_size"} {
		needle := `"` + key + `"`
		idx := strings.Index(dimensions, needle)
		if idx < 0 {
			continue
		}
		rest := dimensions[idx+len(needle):]
		colon := strings.Index(rest, ":")
		if colon < 0 {
			continue
		}
		rest = strings.TrimSpace(rest[colon+1:])
		rest = strings.Trim(rest, `",} `)
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(rest), 64); err == nil && parsed > 0 {
			return parsed
		}
	}
	return 1.0
}
