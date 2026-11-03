package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DESIGN PAYMENT VERIFICATION — the architect confirms the design fee.
//
// `POST /api/projects/{project}/verify-payment` admits only the hired
// architect, behind the planning-approved and not-yet-verified guards
// plus the dispute freeze. It stamps the project, settles the accepted
// arsitek bid through the shared escrow guard, tells the owner, then
// regenerates the deliverable milestones from the brief — deleting the
// architect's previous ones first, so a second call cannot duplicate
// them (the idempotency guard rejects it earlier anyway).
//
// The answer is the lean ProjectResource: base attributes, the owner
// block, zeroed counts and the budget summary — no bid, milestone or
// termin relations are ever loaded, exactly like the oracle, which
// returns the binding-fresh model with nothing eager-loaded.

// VerifyPaymentHandler serves
// `POST /api/projects/{project}/verify-payment`.
func VerifyPaymentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		rawProject := r.PathValue("project")
		if rawProject == "" {
			rawProject = projectPathSegment(r.URL.Path)
		}

		projectID, err := strconv.ParseInt(rawProject, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("verify-payment: viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("verify-payment: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("verify-payment: parties", "error", err)
			serverError(w)
			return
		}

		if !authz.Matches(parties, subject, identity.RoleArsitek) {
			message(w, http.StatusForbidden, "Only the assigned architect can verify payments.")
			return
		}

		var planningStatus *string
		var verifiedAt any
		var projectTitle string
		if err := pool.QueryRow(ctx, `SELECT planning_status::text, design_payment_verified_at, title FROM projects WHERE id = $1`, projectID).Scan(&planningStatus, &verifiedAt, &projectTitle); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("verify-payment: project", "error", err)
			serverError(w)
			return
		}

		if planningStatus == nil || *planningStatus != "approved" {
			message(w, http.StatusUnprocessableEntity, "The project must be approved before payment can be verified.")
			return
		}

		if verifiedAt != nil {
			message(w, http.StatusUnprocessableEntity, "The design fee has already been verified for this project.")
			return
		}

		var openID int64
		var openTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
			message(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		bySpelling, _, err := registryIDs(ctx, pool)
		if err != nil {
			slog.Error("verify-payment: registry", "error", err)
			serverError(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("verify-payment: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `SELECT id FROM projects WHERE id = $1 FOR UPDATE`, projectID); err != nil {
			slog.Error("verify-payment: lock", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE projects SET design_payment_verified_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
			slog.Error("verify-payment: stamp", "error", err)
			serverError(w)
			return
		}

		var bidID, legacyID, profileID int64
		var hasLegacy *int64
		var calculated, price *string
		bidErr := tx.QueryRow(ctx, `SELECT id, legacy_id, calculated_total::text, price::text, bidder_profile_id FROM bids
			WHERE project_id = $1 AND role::text = 'arsitek' AND status::text = 'accepted' LIMIT 1 FOR UPDATE`,
			projectID).Scan(&bidID, &hasLegacy, &calculated, &price, &profileID)
		if bidErr != nil && !isNoRows(bidErr) {
			slog.Error("verify-payment: bid", "error", bidErr)
			serverError(w)
			return
		}

		if bidErr == nil {
			legacyID = bidID
			if hasLegacy != nil {
				legacyID = *hasLegacy
			}

			if _, err := tx.Exec(ctx, `UPDATE bids SET payment_status = 'paid', paid_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, bidID); err != nil {
				slog.Error("verify-payment: pay", "error", err)
				serverError(w)
				return
			}

			amountMinor := verifyBidMinor(calculated, price)

			registryID, ok := bySpelling[`App\Models\BidArsitek`]
			if !ok {
				slog.Error("verify-payment: registry")
				serverError(w)
				return
			}

			written, available, err := recordPaymentMinor(ctx, tx, projectID, amountMinor,
				"Paid Architect Base Fee (Verified by Professional)", `App\Models\BidArsitek`, legacyID, registryID, viewer.id, viewer.role)
			if err != nil {
				if fe, ok := asFrozen(err); ok {
					message(w, http.StatusUnprocessableEntity, fe.Error())
					return
				}
				slog.Error("verify-payment: ledger", "error", err)
				serverError(w)
				return
			}
			if !written {
				message(w, http.StatusUnprocessableEntity, "Project budget is insufficient for the design fee (Rp "+formatIDAmount(amountMinor)+"). Available: Rp "+formatIDAmount(available)+".")
				return
			}

			var ownerID int64
			_ = tx.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID)
			data := `{"payment_id": ` + strconv.FormatInt(legacyID, 10) +
				`, "payment_type": "arsitek_bid", "project_id": ` + strconv.FormatInt(projectID, 10) + `}`
			if _, err := tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at) VALUES ($1, 'payment_verified', 'Payment Verified', $2, $3, date_trunc('second', now()), date_trunc('second', now()))`,
				ownerID,
				"Your Rp "+formatIDAmount(amountMinor)+" design fee for \""+projectTitle+"\" has been verified.",
				data); err != nil {
				slog.Error("verify-payment: notify", "error", err)
				serverError(w)
				return
			}
		}

		var arsitekID *int64
		_ = tx.QueryRow(ctx, `SELECT selected_arsitek_id FROM projects WHERE id = $1`, projectID).Scan(&arsitekID)
		if arsitekID != nil && *arsitekID != 0 {
			if _, err := tx.Exec(ctx, `DELETE FROM project_milestones WHERE project_id = $1 AND arsitek_id = $2`, projectID, *arsitekID); err != nil {
				slog.Error("verify-payment: clear", "error", err)
				serverError(w)
				return
			}
		}

		deliverables, err := verifyDeliverables(ctx, tx, projectID)
		if err != nil {
			slog.Error("verify-payment: brief", "error", err)
			serverError(w)
			return
		}

		for index, delID := range deliverables {
			mapping, ok := verifyMilestoneMap[delID]
			if !ok {
				continue
			}
			content := jsonphp.NewObject()
			content.Set("synced_from_brief", true)
			content.Set("checklist", verifyChecklist(delID))
			encoded, err := jsonphp.Marshal(content)
			if err != nil {
				slog.Error("verify-payment: content", "error", err)
				serverError(w)
				return
			}
			if _, err := tx.Exec(ctx, `INSERT INTO project_milestones (project_id, arsitek_id, title, type, description, sort_order, is_completed, content, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, false, $7::jsonb, date_trunc('second', now()), date_trunc('second', now()))`,
				projectID, arsitekID, mapping.title, mapping.milestoneType, mapping.description, index, string(encoded)); err != nil {
				slog.Error("verify-payment: milestone", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("verify-payment: commit", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("verify-payment: reload", "error", err)
			serverError(w)
			return
		}

		entry, err := projectResource(ctx, pool, fields, values, viewer, projectLoad{budgetSummary: true}, nil, nil)
		if err != nil {
			slog.Error("verify-payment: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// verifyBidMinor mirrors `(float)($calculated_total ?? $price)`.
func verifyBidMinor(calculated, price *string) int64 {
	if calculated != nil {
		if minor, ok := parseMinor(*calculated); ok {
			return minor
		}
	}
	if price != nil {
		if minor, ok := parseMinor(*price); ok {
			return minor
		}
	}
	return 0
}

// verifyDeliverables reads the brief's deliverable ids, in order.
func verifyDeliverables(ctx context.Context, tx pgx.Tx, projectID int64) ([]string, error) {
	var details []byte
	if err := tx.QueryRow(ctx, `SELECT design_details::text FROM projects WHERE id = $1`, projectID).Scan(&details); err != nil || len(details) == 0 {
		return nil, err
	}

	decoded := decodeJSONValue(string(details))
	if decoded == nil {
		return nil, nil
	}

	obj, ok := decoded.(map[string]any)
	if !ok {
		return nil, nil
	}

	raw, ok := obj["deliverables"].([]any)
	if !ok {
		return nil, nil
	}

	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}

	return out, nil
}

// verifyMapping is one generated roadmap milestone.
type verifyMapping struct {
	title         string
	milestoneType string
	description   string
}

// verifyMilestoneMap mirrors the controller's deliverable mapping.
var verifyMilestoneMap = map[string]verifyMapping{
	"3d_render": {
		title:         "3D Visualization: Photorealistic Renders",
		milestoneType: "development",
		description:   "High-quality 3D renderings to visualize the final architectural design.",
	},
	"floor_plan": {
		title:         "Architectural Design: Detailed Floor Plans",
		milestoneType: "schematic",
		description:   "Precise layout of rooms, dimensions, and spatial flow.",
	},
	"mep_plan": {
		title:         "Technical Phase: MEP Engineering Plans",
		milestoneType: "construction",
		description:   "Mechanical, Electrical, and Plumbing blueprints for site implementation.",
	},
	"structural": {
		title:         "Engineering Phase: Structural Blueprints",
		milestoneType: "construction",
		description:   "Technical specifications for foundations, beams, and load-bearing elements.",
	},
	"vr_walkthrough": {
		title:         "Digital Twin: 360/VR Walkthrough",
		milestoneType: "development",
		description:   "Immersive virtual tour to explore the space before construction starts.",
	},
	"interior_concept": {
		title:         "Interior Phase: Concept & Material Selection",
		milestoneType: "schematic",
		description:   "Moodboards and material specifications for internal finishes.",
	},
}

// verifyChecklist mirrors getDefaultChecklistForDeliverable.
func verifyChecklist(delID string) []any {
	pairs := map[string][]string{
		"3d_render": {
			"Exterior Lighting & Mood",
			"Primary Material Textures",
			"Landscape & Surroundings",
		},
		"floor_plan": {
			"Accurate Room Dimensions",
			"Furniture Layout",
			"Wall Thickness & Material Specs",
		},
		"mep_plan": {
			"Electrical Outlet Layout",
			"Plumbing & Drainage Schematic",
			"HVAC / AC Positioning",
		},
		"structural": {
			"Foundation Engineering",
			"Beam & Column Schedules",
			"Concrete / Steel Specifications",
		},
		"vr_walkthrough": {
			"Navigation Hotspots",
			"360 Render Quality",
		},
		"interior_concept": {
			"Color Palette Selection",
			"Furniture Proposals",
			"Lighting Style",
		},
	}

	items, ok := pairs[delID]
	if !ok {
		return []any{}
	}

	out := make([]any, 0, len(items))
	for _, label := range items {
		item := jsonphp.NewObject()
		item.Set("label", label)
		item.Set("checked", false)
		out = append(out, item)
	}

	return out
}
