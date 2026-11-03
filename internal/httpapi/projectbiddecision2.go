package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// syncLegalScopeTx mirrors ProjectLegalController::syncProjectLegalScope:
// persist the requirement list (always with misc_legal), seed one milestone
// slot per requirement, and log the finalization.
func syncLegalScopeTx(ctx context.Context, tx pgx.Tx, projectID int64, serviceIDs []string, actingUserID int64, bid map[string]any) error {
	requirements := append([]string{}, serviceIDs...)
	hasMisc := false
	for _, req := range requirements {
		if req == "misc_legal" {
			hasMisc = true
		}
	}
	if !hasMisc {
		requirements = append(requirements, "misc_legal")
	}

	encoded, err := json.Marshal(requirements)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE projects SET legal_requirements = $1::jsonb, updated_at = date_trunc('second', now()) WHERE id = $2`, string(encoded), projectID); err != nil {
		return err
	}

	titles := map[string]string{}
	if raw := bid["selected_services"]; raw != nil {
		if decoded, ok := jsonOrNil(raw).([]any); ok {
			for _, item := range decoded {
				if m, ok := item.(map[string]any); ok {
					var id, title string
					if rawID, ok := m["id"]; ok {
						switch typed := rawID.(type) {
						case string:
							id = typed
						case float64:
							id = strconv.FormatFloat(typed, 'f', -1, 64)
						}
					}
					if rawTitle, ok := m["title"].(string); ok {
						title = rawTitle
					}
					if id != "" && title != "" {
						titles[id] = title
					}
				}
			}
		}
	}

	var notarisProfileID *int64
	_ = tx.QueryRow(ctx, `SELECT selected_notaris_id FROM projects WHERE id = $1`, projectID).Scan(&notarisProfileID)

	for index, reqID := range requirements {
		label := legalLabel(reqID)
		if title, ok := titles[reqID]; ok {
			label = title
		}

		content := `{"req_id":"` + reqID + `"}`

		var existing int64
		err := tx.QueryRow(ctx, `SELECT id FROM project_milestones WHERE project_id = $1 AND type = 'legal' AND content->>'req_id' = $2`, projectID, reqID).Scan(&existing)
		if err == nil {
			if _, err := tx.Exec(ctx, `UPDATE project_milestones SET title = $1, notaris_id = $2, description = $3, phase_context = 'legal', sort_order = $4, approval_status = 'drafting', is_completed = false, content = $5::jsonb, updated_at = date_trunc('second', now()) WHERE id = $6`,
				label, notarisProfileID, "Awaiting: "+label, index, content, existing); err != nil {
				return err
			}
			continue
		}

		if _, err := tx.Exec(ctx, `INSERT INTO project_milestones (project_id, type, title, notaris_id, description, phase_context, sort_order, is_completed, approval_status, content, created_at, updated_at) VALUES ($1, 'legal', $2, $3, $4, 'legal', $5, false, 'drafting', $6::jsonb, date_trunc('second', now()), date_trunc('second', now()))`,
			projectID, label, notarisProfileID, "Awaiting: "+label, index, content); err != nil {
			return err
		}
	}

	details := "Legal scope finalized with " + strconv.Itoa(len(requirements)) + " document requirements."
	if _, err := tx.Exec(ctx, `INSERT INTO project_activity_logs (project_id, user_id, action, details, created_at, updated_at) VALUES ($1, $2, 'legal_scope_finalized', $3, date_trunc('second', now()), date_trunc('second', now()))`,
		projectID, actingUserID, details); err != nil {
		return err
	}

	return nil
}

// implicitVerifyDesignTx mirrors lifecycleService->implicitVerify('design')
// on a project with no hired subs, documents, milestones or locked termins:
// stamp the three design timestamps, mark the phase complete, log it. Every
// other branch reads rows that are empty on the projects this port accepts
// on, so each is a no-op here exactly as in the oracle.
func implicitVerifyDesignTx(ctx context.Context, tx pgx.Tx, projectID, actorID int64) error {
	var doneAt *time.Time
	_ = tx.QueryRow(ctx, `SELECT owner_design_approved_at FROM projects WHERE id = $1`, projectID).Scan(&doneAt)
	if doneAt != nil {
		return nil
	}

	var completedRaw []byte
	_ = tx.QueryRow(ctx, `SELECT COALESCE(completed_phases::text, '[]') FROM projects WHERE id = $1`, projectID).Scan(&completedRaw)

	phases := []string{}
	if decoded, ok := jsonOrNil(string(completedRaw)).([]any); ok {
		for _, item := range decoded {
			if s, ok := item.(string); ok {
				phases = append(phases, s)
			}
		}
	}
	hasDesign := false
	for _, phase := range phases {
		if phase == "design" {
			hasDesign = true
		}
	}
	if !hasDesign {
		phases = append(phases, "design")
	}
	encoded, err := json.Marshal(phases)
	if err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `UPDATE projects SET owner_design_approved_at = date_trunc('second', now()), design_locked_at = date_trunc('second', now()), design_completed_at = date_trunc('second', now()), completed_phases = $1::jsonb, updated_at = date_trunc('second', now()) WHERE id = $2`,
		string(encoded), projectID); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `INSERT INTO project_activity_logs (project_id, user_id, action, details, created_at, updated_at) VALUES ($1, $2, 'design_verified', $3, date_trunc('second', now()), date_trunc('second', now()))`,
		projectID, actorID, "PM/Owner formally verified and approved the Design Phase."); err != nil {
		return err
	}

	return nil
}

// insertBudgetAddendumTx records the structural/mep/tax budget addendum.
// The recommended bid id is the wire (legacy) id, the same reference every
// other surface names.
func insertBudgetAddendumTx(ctx context.Context, tx pgx.Tx, projectID int64, roleType string, actorID int64, title, description, amount string, bidWireID int64) error {
	_, err := tx.Exec(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, description, amount, status, recommended_bid_id, recommended_bid_type, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval', $7, $8::bid_role, date_trunc('second', now()), date_trunc('second', now()))`,
		projectID, roleType, actorID, title, description, amount, bidWireID, roleType)
	return err
}

// kickoffMilestoneTx mirrors firstOrCreate(['project_id','Project Kickoff']).
// The `status` attribute has no column and is discarded by the oracle too.
func kickoffMilestoneTx(ctx context.Context, tx pgx.Tx, projectID int64) error {
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_milestones WHERE project_id = $1 AND title = 'Project Kickoff')`, projectID).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}

	_, err := tx.Exec(ctx, `INSERT INTO project_milestones (project_id, title, description, created_at, updated_at) VALUES ($1, 'Project Kickoff', 'Contract executed. The project is ready to begin.', date_trunc('second', now()), date_trunc('second', now()))`,
		projectID)
	return err
}

// acceptShowAfterWrite reloads the project for the accept/decline 200.
func acceptShowAfterWrite(ctx context.Context, pool *pgxpool.Pool, spec projectLoad, projectID int64, viewer *projectViewer) (*jsonphp.Object, error) {
	fields, values, err := projectRowByID(ctx, pool, projectID)
	if err != nil {
		return nil, err
	}

	return projectResource(ctx, pool, fields, values, viewer, spec, map[int64]*clientHistory{}, nil)
}

// acceptHireRole runs the per-role hire branch inside the accept transaction.
func acceptHireRole(ctx context.Context, tx pgx.Tx, pool *pgxpool.Pool, projectID int64, role string, bid map[string]any, physicalID int64, notes *string, actorID int64, projectTitle string) (bidderName string, bidderUserID *int64, err error) {
	bidderName = "Professional"

	if _, err = tx.Exec(ctx, `UPDATE bids SET status = 'contract_pending', verification_notes = $2, updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID, notes); err != nil {
		return "", nil, err
	}

	column, _ := bidProfileColumn(role)
	profileID := profileID(bid, column)

	if _, err = tx.Exec(ctx, `UPDATE bids SET status = 'rejected', updated_at = date_trunc('second', now()) WHERE project_id = $1 AND role::text = $2 AND id <> $3`, projectID, role, physicalID); err != nil {
		return "", nil, err
	}

	projectColumn := map[string]string{
		"arsitek": "selected_arsitek_id", "kontraktor": "selected_kontraktor_id",
		"notaris": "selected_notaris_id", "interior": "selected_interior_id",
		"structural": "structural_id", "mep": "mep_id",
	}[role]

	setStatus := ""
	if role == "notaris" {
		setStatus = `, status = 'in_progress'`
	}
	if projectColumn == "structural_id" || projectColumn == "mep_id" || projectColumn == "" {
		// Structural/mep hires create no project column write.
	} else {
		if _, err = tx.Exec(ctx, `UPDATE projects SET `+projectColumn+` = $1, updated_at = date_trunc('second', now())`+setStatus+` WHERE id = $2`, profileID, projectID); err != nil {
			return "", nil, err
		}
	}

	table, _ := bidProfileTable(role)
	var name, userName *string
	var userID *int64
	_ = tx.QueryRow(ctx, `SELECT p.user_id, u.name FROM `+table+` p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = $1`, profileID).Scan(&userID, &name)
	_ = userID
	if name != nil && *name != "" {
		bidderName = *name
	} else if userName != nil && *userName != "" {
		bidderName = *userName
	}

	switch role {
	case "kontraktor":
		if err = implicitVerifyDesignTx(ctx, tx, projectID, actorID); err != nil {
			return "", nil, err
		}
	case "notaris":
		if bidderName == "Professional" {
			bidderName = "Notary"
		}
		bidderUserID = txBidderUserID(ctx, tx, role, bid)

		services := []string{}
		if raw := bid["selected_services"]; raw != nil {
			if decoded, ok := jsonOrNil(raw).([]any); ok {
				for _, item := range decoded {
					switch typed := item.(type) {
					case map[string]any:
						if id, ok := typed["id"]; ok {
							switch idTyped := id.(type) {
							case string:
								services = append(services, idTyped)
							case float64:
								services = append(services, strconv.FormatFloat(idTyped, 'f', -1, 64))
							}
						} else {
							services = append(services, stringOrNilJSON(item))
						}
					case string:
						services = append(services, typed)
					case float64:
						services = append(services, strconv.FormatFloat(typed, 'f', -1, 64))
					}
				}
			} else if s, ok := raw.(string); ok && s != "" {
				services = append(services, s)
			}
		}
		if len(services) > 0 {
			if err = syncLegalScopeTx(ctx, tx, projectID, services, actorID, bid); err != nil {
				return "", nil, err
			}
		}

		var tax *string
		_ = tx.QueryRow(ctx, `SELECT tax_estimate::text FROM bids WHERE id = $1`, physicalID).Scan(&tax)
		if tax != nil {
			if parsed, perr := strconv.ParseFloat(*tax, 64); perr == nil && parsed > 0 {
				if err = insertBudgetAddendumTx(ctx, tx, projectID, "notaris", actorID, "Legal Tax Estimate Confirmation", "Estimated taxes (BPHTB/PPH) for legalization. Click to acknowledge and include in budget.", *tax, bidWireID(bid)); err != nil {
					return "", nil, err
				}
			}
		}
	case "interior":
		if bidderName == "Professional" {
			bidderName = "Interior Designer"
		}
		bidderUserID = txBidderUserID(ctx, tx, role, bid)
	case "structural", "mep":
		if bidderName == "Professional" {
			bidderName = "Specialist"
		}
		bidderUserID = txBidderUserID(ctx, tx, role, bid)

		amount := ""
		var calculated, price *string
		_ = tx.QueryRow(ctx, `SELECT calculated_total::text, price::text FROM bids WHERE id = $1`, physicalID).Scan(&calculated, &price)
		if calculated != nil && *calculated != "" {
			amount = *calculated
		} else if price != nil {
			amount = *price
		}
		title := "Structural Engineer Budget Authorization"
		description := "Acknowledging fee for " + bidderName + " structural analysis resource."
		if role == "mep" {
			title = "MEP Engineer Budget Authorization"
			description = "Acknowledging fee for " + bidderName + " MEP design resource."
		}
		if err = insertBudgetAddendumTx(ctx, tx, projectID, role, actorID, title, description, amount, bidWireID(bid)); err != nil {
			return "", nil, err
		}
	}

	return bidderName, bidderUserID, nil
}

// stringOrNilJSON renders a JSON value as text.
func stringOrNilJSON(value any) string {
	if s, ok := value.(string); ok {
		return s
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(encoded)
}

// AcceptBidHandler serves `POST /api/projects/{project}/accept-bid`.
func AcceptBidHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("accept-bid: viewer", "error", err)
			serverError(w)
			return
		}

		ownerID, pmID, isPM, title, err := acceptGate(ctx, pool, viewer, projectID)
		if err != nil {
			slog.Error("accept-bid: gate", "error", err)
			serverError(w)
			return
		}

		if viewer.id != ownerID && !isPM {
			message(w, http.StatusForbidden, "Unauthorized. Only the Project Owner or Hired Project Manager can finalize hiring.")
			return
		}

		formFields, formFiles, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		_ = formFiles

		failures := &errorBag{}
		bidID, bidType, notes, _ := validateDecisionFields(formFields, true, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("accept-bid: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		projectFields, projectValues, err := decisionProject(ctx, tx, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("accept-bid: lock", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(projectFields, projectValues)
		if id, ok := byName["user_id"].(int64); ok {
			ownerID = id
		}
		pmID = projectIntPtr(projectValues, projectFields, "pm_id")
		if titleText, ok := byName["title"].(string); ok {
			title = titleText
		}
		isPM = pmID != nil && *pmID != 0 && viewer.profiles["project_manager"] == *pmID

		bidFields, bidValues, found, err := findBidTx(ctx, tx, projectID, bidType, bidID)
		if err != nil {
			slog.Error("accept-bid: lookup", "error", err)
			serverError(w)
			return
		}
		if !found {
			bidNotFound(w, bidType)
			return
		}

		bid := bidMap(bidFields, bidValues)
		physicalID := bidPhysicalID(bid)

		projectColumn := map[string]string{
			"arsitek": "selected_arsitek_id", "kontraktor": "selected_kontraktor_id",
			"notaris": "selected_notaris_id", "interior": "selected_interior_id",
			"structural": "structural_id", "mep": "mep_id",
		}[bidType]

		hiredProfile := projectIntPtr(projectValues, projectFields, projectColumn)

		var contracted bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM bids WHERE project_id = $1 AND role::text = $2 AND status::text IN ('contract_pending','awaiting_payment','accepted','active'))`,
			projectID, bidType).Scan(&contracted); err != nil {
			slog.Error("accept-bid: contracted", "error", err)
			serverError(w)
			return
		}

		if (hiredProfile != nil && *hiredProfile != 0) || contracted {
			message(w, http.StatusUnprocessableEntity, "This role already has a hired professional or a pending contract.")
			return
		}

		status, _ := bid["status"].(string)
		if status != "shortlisted" && status != "negotiating" && status != "pending" {
			message(w, http.StatusUnprocessableEntity, "You must shortlist, negotiate, or have a pending bid first before hiring.")
			return
		}

		if bidMoney(bid["price"]) <= 0 && bidMoney(bid["calculated_total"]) <= 0 {
			message(w, http.StatusUnprocessableEntity, "Cannot hire a professional with a Rp 0 fee. Please negotiate terms first.")
			return
		}

		if !bidFeeAgreedAt(bid) {
			if _, err := tx.Exec(ctx, `UPDATE bids SET fee_agreed_at = date_trunc('second', now()), updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID); err != nil {
				slog.Error("accept-bid: fee", "error", err)
				serverError(w)
				return
			}
		}

		var verificationNotes *string
		if notes != nil {
			verificationNotes = notes
		}

		if isPM {
			if _, err := tx.Exec(ctx, `UPDATE bids SET is_recommended = true, verification_notes = $2, updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID, verificationNotes); err != nil {
				slog.Error("accept-bid: recommend", "error", err)
				serverError(w)
				return
			}

			noteText := "None"
			if notes != nil && *notes != "" {
				noteText = *notes
			}
			if err := insertActivityLog(ctx, tx, projectID, viewer.id, "bid_recommended", "Recommended "+ucfirst(bidType)+" bid to the owner. PM Notes: "+noteText); err != nil {
				slog.Error("accept-bid: log", "error", err)
				serverError(w)
				return
			}

			wireID := bidWireID(bid)
			data := mysqlJSONPair(`"project_id": `+strconv.FormatInt(projectID, 10), `"bid_id": `+strconv.FormatInt(wireID, 10), `"bid_type": "`+bidType+`"`)
			if err := insertNotification(ctx, tx, ownerID, "bid_recommended", "Professional Recommended", "Your Project Manager has recommended a professional for your project \""+title+"\". Please review and approve.", data); err != nil {
				slog.Error("accept-bid: notify", "error", err)
				serverError(w)
				return
			}

			if err := tx.Commit(ctx); err != nil {
				slog.Error("accept-bid: commit", "error", err)
				serverError(w)
				return
			}

			row, err := acceptShowAfterWrite(ctx, pool, acceptLoad(), projectID, viewer)
			if err != nil {
				slog.Error("accept-bid: reload", "error", err)
				serverError(w)
				return
			}

			payload := jsonphp.NewObject()
			payload.Set("data", row)
			writeJSON(w, http.StatusOK, payload)
			return
		}

		pmIDNow := projectIntPtr(projectValues, projectFields, "pm_id")
		if pmIDNow != nil && *pmIDNow != 0 && !bidIsRecommended(bid) {
			message(w, http.StatusForbidden, "Unauthorized. The Project Manager must recommend this professional first.")
			return
		}

		bidderName, bidderUserID, err := acceptHireRole(ctx, tx, pool, projectID, bidType, bid, physicalID, verificationNotes, viewer.id, title)
		if err != nil {
			slog.Error("accept-bid: hire", "error", err)
			serverError(w)
			return
		}

		if bidderUserID != nil {
			data := mysqlJSONPair(`"project_id": ` + strconv.FormatInt(projectID, 10))
			if err := insertNotification(ctx, tx, *bidderUserID, "bid_accepted", "Congratulations! Your Bid was Accepted", "Your proposal for project \""+title+"\" has been accepted. You are now officially assigned to the project.", data); err != nil {
				slog.Error("accept-bid: notify hire", "error", err)
				serverError(w)
				return
			}
		}

		var kickoffStatus string
		_ = tx.QueryRow(ctx, `SELECT status::text FROM projects WHERE id = $1`, projectID).Scan(&kickoffStatus)
		if kickoffStatus == "in_progress" || kickoffStatus == "accepted_arsitek" || kickoffStatus == "accepted_kontraktor" {
			if err := kickoffMilestoneTx(ctx, tx, projectID); err != nil {
				slog.Error("accept-bid: kickoff", "error", err)
				serverError(w)
				return
			}
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, "bid_accepted", "Accepted "+bidType+" bid from "+bidderName+". Budget commitment managed via professional fee ledger."); err != nil {
			slog.Error("accept-bid: log hire", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("accept-bid: commit", "error", err)
			serverError(w)
			return
		}

		row, err := acceptShowAfterWrite(ctx, pool, acceptLoad(), projectID, viewer)
		if err != nil {
			slog.Error("accept-bid: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", row)
		writeJSON(w, http.StatusOK, payload)
	}
}

// DeclineBidHandler serves `POST /api/projects/{project}/decline-bid`.
func DeclineBidHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("decline-bid: viewer", "error", err)
			serverError(w)
			return
		}

		ownerID, pmID, isPM, _, err := acceptGate(ctx, pool, viewer, projectID)
		if err != nil {
			slog.Error("decline-bid: gate", "error", err)
			serverError(w)
			return
		}

		if viewer.id != ownerID && !isPM {
			message(w, http.StatusForbidden, "Unauthorized. Must be project owner or the assigned Project Manager.")
			return
		}

		var wantsPM bool
		_ = pool.QueryRow(ctx, `SELECT wants_project_manager FROM projects WHERE id = $1`, projectID).Scan(&wantsPM)
		if viewer.id == ownerID && wantsPM && !isPM {
			message(w, http.StatusForbidden, "This project is managed by a Project Manager. Only the Project Manager can decline professionals.")
			return
		}
		_ = pmID

		formFields, formFiles, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		_ = formFiles

		failures := &errorBag{}
		bidID, bidType, _, _ := validateDecisionFields(formFields, false, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("decline-bid: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, _, err := decisionProject(ctx, tx, projectID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("decline-bid: lock", "error", err)
			serverError(w)
			return
		}

		rows, err := tx.Query(ctx, `SELECT `+bidsColumns+` FROM bids WHERE project_id = $1 AND role::text = $2 AND (id = $3 OR legacy_id = $3) AND status::text IN ('pending','shortlisted') ORDER BY CASE WHEN legacy_id = $3 THEN 0 ELSE 1 END LIMIT 1`,
			projectID, bidType, bidID)
		if err != nil {
			slog.Error("decline-bid: lookup", "error", err)
			serverError(w)
			return
		}

		bidFields := fieldNames(rows)
		var bidValues []any
		found := rows.Next()
		if found {
			bidValues, err = scanRow(rows, len(bidFields))
		}
		rows.Close()
		if err != nil {
			slog.Error("decline-bid: scan", "error", err)
			serverError(w)
			return
		}
		if !found {
			bidNotFound(w, bidType)
			return
		}

		bid := bidMap(bidFields, bidValues)
		physicalID := bidPhysicalID(bid)

		// The oracle wrote `rejection_reason` here, which is neither fillable
		// nor a column — every success 500'd. Status only.
		if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'rejected', updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID); err != nil {
			slog.Error("decline-bid: update", "error", err)
			serverError(w)
			return
		}

		bidderUserID := txBidderUserID(ctx, tx, bidType, bid)

		var reason *string
		if raw, present := formFields["reason"]; present && raw != nil {
			if text, isStr := raw.(string); isStr && text != "" {
				dup := text
				reason = &dup
			}
		}

		body := ""
		var projectTitle string
		_ = tx.QueryRow(ctx, `SELECT title FROM projects WHERE id = $1`, projectID).Scan(&projectTitle)
		body = "Your proposal for project \"" + projectTitle + "\" was not selected this time."
		reasonText := "null"
		if reason != nil {
			body += " Reason: " + *reason
			reasonText = strconv.Quote(*reason)
		}
		data := mysqlJSONPair(`"project_id": `+strconv.FormatInt(projectID, 10), `"rejection_reason": `+reasonText)

		if bidderUserID != nil {
			if err := insertNotification(ctx, tx, *bidderUserID, "bid_rejected", "Proposal Update", body, data); err != nil {
				slog.Error("decline-bid: notify", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("decline-bid: commit", "error", err)
			serverError(w)
			return
		}

		row, err := acceptShowAfterWrite(ctx, pool, declineLoad(), projectID, viewer)
		if err != nil {
			slog.Error("decline-bid: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", row)
		writeJSON(w, http.StatusOK, payload)
	}
}
