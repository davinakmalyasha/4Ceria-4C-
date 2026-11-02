package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT READS — BAST handover data and the legal/financial summary.
//
// `GET /api/projects/{project}/bast` compiles the handover certificate
// behind the participant gate (owner or hired pro): document number and
// dates off the UTC wall clock, parties off the hired rows, the same
// three legal clauses with the escrow warranty window (180 days /
// 6 months, the configured defaults the lifecycle service computes
// from). Slashes escape (`\/`) exactly like the oracle's encoder.
//
// `GET /api/projects/{project}/legal-financials` admits only the owner,
// the hired notary or the assigned PM, and answers the escrow figures
// from the same arithmetic the write guard enforces (paidTotal and
// committedUnpaid, floats for the SPA plus exact cents), the allocated
// tax off hired notary bids, and the notary/architect termin schedule
// newest-first WITHOUT the milestone key (the relation is never eager
// loaded — unlike the termin list, which always carries it).

// BastHandler serves `GET /api/projects/{project}/bast`.
func BastHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		if _, err := loadViewer(ctx, pool, caller); err != nil {
			slog.Error("bast: viewer", "error", err)
			serverError(w)
			return
		}

		if _, _, err := projectRowByID(ctx, pool, projectID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("bast: project", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("bast: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("bast: parties", "error", err)
			serverError(w)
			return
		}

		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		var title, lokasi, city, budget *string
		var ownerID, kontraktorID, pmID *int64
		var createdAt time.Time
		var acceptedAt, warrantyEnd *time.Time
		if err := pool.QueryRow(ctx, `SELECT title, lokasi, city, budget::text, user_id, selected_kontraktor_id, pm_id, created_at, owner_accepted_at, warranty_end_at
			FROM projects WHERE id = $1`, projectID).Scan(
			&title, &lokasi, &city, &budget, &ownerID, &kontraktorID, &pmID, &createdAt, &acceptedAt, &warrantyEnd); err != nil {
			slog.Error("bast: load", "error", err)
			serverError(w)
			return
		}

		var ownerName string
		_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, ownerID).Scan(&ownerName)
		var ownerPhone *string
		_ = pool.QueryRow(ctx, `SELECT contact FROM phone_user WHERE id_user = $1 ORDER BY id LIMIT 1`, ownerID).Scan(&ownerPhone)

		contractorName := "N/A"
		contractorCompany := "N/A"
		if kontraktorID != nil && *kontraktorID != 0 {
			var nama *string
			var kontraktorUser *int64
			if err := pool.QueryRow(ctx, `SELECT nama, user_id FROM kontraktors WHERE id = $1`, *kontraktorID).Scan(&nama, &kontraktorUser); err == nil {
				if kontraktorUser != nil && *kontraktorUser != 0 {
					var userName *string
					_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, *kontraktorUser).Scan(&userName)
					if userName != nil && *userName != "" {
						contractorName = *userName
					} else if nama != nil && *nama != "" {
						contractorName = *nama
					}
				} else if nama != nil && *nama != "" {
					contractorName = *nama
				}
				if nama != nil && *nama != "" {
					contractorCompany = *nama
				}
			}
		}

		pmName := "N/A"
		if pmID != nil && *pmID != 0 {
			var pmUser *int64
			if err := pool.QueryRow(ctx, `SELECT user_id FROM project_managers WHERE id = $1`, *pmID).Scan(&pmUser); err == nil && pmUser != nil {
				var name *string
				_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, *pmUser).Scan(&name)
				if name != nil && *name != "" {
					pmName = *name
				}
			}
		}

		now := time.Now().UTC()
		location := ""
		if lokasi != nil {
			location = *lokasi
		}
		if location == "" && city != nil {
			location = *city
		}
		totalBudget := ""
		if budget != nil {
			totalBudget = *budget
		}
		projectTitle := ""
		if title != nil {
			projectTitle = *title
		}

		completion := "N/A"
		if acceptedAt != nil {
			completion = acceptedAt.UTC().Format("02 January 2006")
		}
		warranty := "N/A"
		if warrantyEnd != nil {
			warranty = warrantyEnd.UTC().Format("02 January 2006")
		}

		data := jsonphp.NewObject()
		data.Set("document_number", "BAST/"+strconv.FormatInt(projectID, 10)+"/"+now.Format("2006/01/02"))
		data.Set("date", now.Format("02 January 2006"))

		project := jsonphp.NewObject()
		project.Set("id", projectID)
		project.Set("title", projectTitle)
		project.Set("location", location)
		project.Set("total_budget", totalBudget)
		data.Set("project", project)

		partiesObj := jsonphp.NewObject()
		owner := jsonphp.NewObject()
		owner.Set("name", ownerName)
		owner.Set("phone", nullableString(ownerPhone))
		owner.Set("role", "PIHAK PERTAMA (Pemilik)")
		partiesObj.Set("owner", owner)
		contractor := jsonphp.NewObject()
		contractor.Set("name", contractorName)
		contractor.Set("company", contractorCompany)
		contractor.Set("role", "PIHAK KEDUA (Pelaksana)")
		partiesObj.Set("contractor", contractor)
		pm := jsonphp.NewObject()
		pm.Set("name", pmName)
		pm.Set("role", "PIHAK KETIGA (Pengawas)")
		partiesObj.Set("pm", pm)
		data.Set("parties", partiesObj)

		milestones := jsonphp.NewObject()
		milestones.Set("start_date", createdAt.UTC().Format("02 January 2006"))
		milestones.Set("completion_date", completion)
		milestones.Set("warranty_expiry", warranty)
		data.Set("milestones", milestones)

		data.Set("legal_clauses", []any{
			"BAST ini merupakan bukti sah penyerahan pekerjaan dari PIHAK KEDUA kepada PIHAK PERTAMA.",
			"PIHAK KEDUA bertanggung jawab penuh atas Masa Pemeliharaan selama 180 hari (6 bulan) sejak tanggal penandatanganan.",
			"Seluruh cacat pekerjaan (snag list) yang terdata sebelumnya telah dinyatakan selesai dan diperbaiki.",
		})

		payload := jsonphp.NewObject()
		payload.Set("data", data)

		writeJSON(w, http.StatusOK, payload)
	}
}

// LegalFinancialsHandler serves
// `GET /api/projects/{project}/legal-financials`.
func LegalFinancialsHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("legal: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("legal: project", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)

		var pmID *int64
		if id, ok := byName["pm_id"].(int64); ok {
			pmID = &id
		}
		var selectedNotaris *int64
		if id, ok := byName["selected_notaris_id"].(int64); ok {
			selectedNotaris = &id
		}

		isNotary := viewer.role == "notaris" && selectedNotaris != nil && *selectedNotaris != 0 &&
			viewer.profiles["notaris"] == *selectedNotaris
		isOwner := viewer.id == ownerID
		isPM := viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID)

		if !isNotary && !isOwner && !isPM {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		var taxMinor int64
		if err := pool.QueryRow(ctx, `SELECT COALESCE((SUM(tax_estimate) * 100)::bigint, 0) FROM bids
			WHERE project_id = $1 AND role::text = 'notaris'
			  AND status::text IN ('accepted','awaiting_payment','active','contract_pending','completed')`,
			projectID).Scan(&taxMinor); err != nil {
			slog.Error("legal: tax", "error", err)
			serverError(w)
			return
		}

		var paidMinor int64
		if err := pool.QueryRow(ctx, `
			SELECT COALESCE((SUM(amount) * 100)::bigint, 0)
			  FROM project_budget_transactions
			 WHERE project_id = $1
			   AND transaction_type::text IN ('payment', 'refund', 'platform_fee', 'retention_release')
		`, projectID).Scan(&paidMinor); err != nil {
			slog.Error("legal: paid", "error", err)
			serverError(w)
			return
		}

		var addendumMinor, terminMinor int64
		if err := pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount) * 100)::bigint, 0) FROM project_addendums WHERE project_id = $1 AND status::text IN ('approved_unpaid','pending_approval','verifying')`,
			projectID).Scan(&addendumMinor); err != nil {
			slog.Error("legal: addendum", "error", err)
			serverError(w)
			return
		}
		if err := pool.QueryRow(ctx, `SELECT COALESCE((SUM(amount) * 100)::bigint, 0) FROM project_payment_termins WHERE project_id = $1 AND status::text IN ('locked','pending','invoice_sent')`,
			projectID).Scan(&terminMinor); err != nil {
			slog.Error("legal: termin", "error", err)
			serverError(w)
			return
		}
		committedMinor := addendumMinor + terminMinor

		rows, err := pool.Query(ctx, `SELECT id FROM project_payment_termins WHERE project_id = $1 AND role_type IN ('notaris','arsitek') ORDER BY created_at DESC, id`, projectID)
		if err != nil {
			slog.Error("legal: disbursements", "error", err)
			serverError(w)
			return
		}
		var terminIDs []int64
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				slog.Error("legal: scan", "error", err)
				serverError(w)
				return
			}
			terminIDs = append(terminIDs, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			slog.Error("legal: rows", "error", err)
			serverError(w)
			return
		}

		out := make([]any, 0, len(terminIDs))
		for _, id := range terminIDs {
			entry, err := reloadVerifyTermin(ctx, pool, id)
			if err != nil {
				slog.Error("legal: entry", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("allocated_tax", float64(taxMinor)/100)
		payload.Set("total_spent", float64(paidMinor)/100)
		payload.Set("total_spent_cents", paidMinor)
		payload.Set("pending_approval", float64(committedMinor)/100)
		payload.Set("disbursements", out)

		writeJSON(w, http.StatusOK, payload)
	}
}
