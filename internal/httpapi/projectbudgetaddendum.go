package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BUDGET ADDENDUMS — professional proposals and their negotiation.
//
// `POST /api/projects/{project}/budget/addendums` admits only the hired
// professional for their own role (`Hire::matches`, which the null-loose
// comparison it replaced could never express) and mints a
// `pending_approval` row, answering the row in CREATE order. The
// attachment validates like every other file field but stores on the
// public disk under `addendums/`.
//
// `PUT /api/projects/{project}/budget/addendums/{id}` is two powers:
// the AUTHORISER (owner or assigned PM) decides money, the PROPOSER
// (the addendum's author) may only accept or counter while a negotiation
// is open — and never their own fee. The state machine is
// pending_approval → negotiating ↔ accepted_by_pro → approved_unpaid,
// with rejected terminal; amounts bind once the item leaves negotiation.
// Every terminal message, notification and activity line is the oracle's
// verbatim, including the actor label (Owner vs Project Manager).

// addendumAttachmentMimes is the `mimes:` vocabulary in rule order.
var addendumAttachmentMimes = map[string]bool{"jpg": true, "jpeg": true, "png": true, "webp": true, "pdf": true}

// CreateAddendumHandler serves
// `POST /api/projects/{project}/budget/addendums`.
func CreateAddendumHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("addendum: viewer", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("addendum: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("addendum: parties", "error", err)
			serverError(w)
			return
		}

		role, roleErr := identity.ParseRole(viewer.role)
		if roleErr != nil || !authz.Matches(parties, subject, role) {
			message(w, http.StatusForbidden, "Unauthorized. Must be hired professional.")
			return
		}

		formFields, formFiles, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
			formFiles = map[string]*uploadedFile{}
		}

		failures := &errorBag{}
		input := validateAddendumCreate(ctx, pool, formFields, formFiles, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var attachmentPath *string
		if input.attachment != nil {
			contents, err := readUploadedFile(r, "attachment")
			if err != nil {
				slog.Error("addendum: read", "error", err)
				serverError(w)
				return
			}
			stored, err := storeVaultFile("addendums", input.attachment.filename, contents)
			if err != nil {
				slog.Error("addendum: store", "error", err)
				serverError(w)
				return
			}
			attachmentPath = &stored
		}

		var createdID int64
		var createdAt, updatedAt any
		var storedAmount string
		if err := pool.QueryRow(ctx, `INSERT INTO project_addendums (project_id, role_type, user_id, title, amount, description, type, team_member_id, assigned_user_id, specialist_type, attachment_path, status, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9, $10, $11, 'pending_approval', date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, amount::text, created_at, updated_at`,
			projectID, viewer.role, viewer.id, input.title, input.amountText, input.description, input.addType,
			input.teamMemberID, input.assignedUserID, input.specialistType, attachmentPath).Scan(&createdID, &storedAmount, &createdAt, &updatedAt); err != nil {
			slog.Error("addendum: insert", "error", err)
			serverError(w)
			return
		}

		created := jsonphp.NewObject()
		created.Set("project_id", projectID)
		created.Set("role_type", viewer.role)
		created.Set("user_id", viewer.id)
		created.Set("title", input.title)
		created.Set("amount", storedAmount)
		created.Set("description", nullableString(input.description))
		created.Set("type", input.addType)
		created.Set("team_member_id", nullableInt64(input.teamMemberID))
		created.Set("assigned_user_id", nullableInt64(input.assignedUserID))
		created.Set("specialist_type", nullableString(input.specialistType))
		created.Set("attachment_path", nullableString(attachmentPath))
		created.Set("status", "pending_approval")
		created.Set("updated_at", projectTimeValue(updatedAt))
		created.Set("created_at", projectTimeValue(createdAt))
		created.Set("id", createdID)

		payload := jsonphp.NewObject()
		payload.Set("message", "Addendum submitted for client approval.")
		payload.Set("addendum", created)

		writeJSON(w, http.StatusOK, payload)
	}
}

// addendumCreateInput is one validated proposal.
type addendumCreateInput struct {
	title          string
	amountText     string
	description    *string
	addType        string
	teamMemberID   *int64
	assignedUserID *int64
	specialistType *string
	attachment     *uploadedFile
}

// validateAddendumCreate enforces the create rules in declaration order.
// An empty string reads as missing; a JSON non-file attachment fails
// BOTH file and mimes, while a multipart text part fails only mimes.
func validateAddendumCreate(ctx context.Context, pool *pgxpool.Pool, fields map[string]any, files map[string]*uploadedFile, failures *errorBag) addendumCreateInput {
	var input addendumCreateInput
	input.addType = "extra_fee"

	if raw, present := fields["title"]; !present || raw == nil {
		failures.add("title", "The title field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("title", "The title field must be a string.")
	} else if s == "" {
		failures.add("title", "The title field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("title", "The title field must not be greater than 255 characters.")
	} else {
		input.title = s
	}

	if raw, present := fields["amount"]; !present || raw == nil {
		failures.add("amount", "The amount field is required.")
	} else if s, isStr := raw.(string); isStr && strings.TrimSpace(s) == "" {
		failures.add("amount", "The amount field is required.")
	} else if text, present := numericTextOf(raw); !present || text == "" {
		failures.add("amount", "The amount field must be a number.")
	} else if !isNumericText(text) {
		failures.add("amount", "The amount field must be a number.")
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("amount", "The amount field must be a number.")
	} else if parsed < 1 {
		failures.add("amount", "The amount field must be at least 1.")
	} else {
		input.amountText = strings.TrimSpace(text)
	}

	if raw, present := fields["description"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("description", "The description field must be a string.")
		} else if s != "" {
			dup := s
			input.description = &dup
		}
	}

	if raw, present := fields["type"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("type", "The type field must be a string.")
			failures.add("type", "The selected type is invalid.")
		} else if s == "" {
			// ConvertEmptyStringsToNull: the default applies.
		} else if s != "extra_fee" && s != "specialist_assignment" {
			failures.add("type", "The selected type is invalid.")
		} else {
			input.addType = s
		}
	}

	if raw, present := fields["team_member_id"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s == "" {
			// absent
		} else if id, ok := addendumExistsID(raw); !ok {
			failures.add("team_member_id", "The selected team member id is invalid.")
		} else {
			var found bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM team_members WHERE id = $1)`, id).Scan(&found); err != nil || !found {
				failures.add("team_member_id", "The selected team member id is invalid.")
			} else {
				dup := id
				input.teamMemberID = &dup
			}
		}
	}

	if raw, present := fields["assigned_user_id"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s == "" {
			// absent
		} else if id, ok := addendumExistsID(raw); !ok {
			failures.add("assigned_user_id", "The selected assigned user id is invalid.")
		} else {
			var found bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)`, id).Scan(&found); err != nil || !found {
				failures.add("assigned_user_id", "The selected assigned user id is invalid.")
			} else {
				dup := id
				input.assignedUserID = &dup
			}
		}
	}

	if raw, present := fields["specialist_type"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("specialist_type", "The specialist type field must be a string.")
			failures.add("specialist_type", "The selected specialist type is invalid.")
		} else if s == "" {
			// absent
		} else if s != "structural" && s != "mep" {
			failures.add("specialist_type", "The selected specialist type is invalid.")
		} else {
			dup := s
			input.specialistType = &dup
		}
	}

	if file, present := files["attachment"]; present && file != nil {
		if !addendumAttachmentMimes[strings.ToLower(file.ext)] {
			failures.add("attachment", "The attachment field must be a file of type: jpg, jpeg, png, webp, pdf.")
		} else if file.size > 10240*1024 {
			failures.add("attachment", "The attachment field must not be greater than 10240 kilobytes.")
		} else {
			input.attachment = file
		}
	} else if raw, present := fields["attachment"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s == "" {
			// absent
		} else {
			failures.add("attachment", "The attachment field must be a file.")
			failures.add("attachment", "The attachment field must be a file of type: jpg, jpeg, png, webp, pdf.")
		}
	}

	return input
}

// addendumExistsID reads an exists-rule value as an id: integer text,
// or an integral float the way MySQL would coerce it.
func addendumExistsID(value any) (int64, bool) {
	switch typed := value.(type) {
	case string:
		text := strings.TrimSpace(typed)
		if isIntegerText(text) {
			if parsed, err := strconv.ParseInt(text, 10, 64); err == nil {
				return parsed, true
			}
			return 0, false
		}
		if parsed, err := strconv.ParseFloat(text, 64); err == nil && parsed == math_Trunc(parsed) {
			return int64(parsed), true
		}
		return 0, false
	case float64:
		if typed == math_Trunc(typed) {
			return int64(typed), true
		}
		return 0, false
	case bool:
		if typed {
			return 1, true
		}
		return 0, false
	default:
		text, _ := fieldNumeric(map[string]any{"v": value}, "v")
		if text == "" {
			return 0, false
		}
		return addendumExistsID(text)
	}
}

// HandleAddendumHandler serves
// `PUT /api/projects/{project}/budget/addendums/{id}`.
func HandleAddendumHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		rawID := r.PathValue("id")
		if rawID == "" {
			rawID = addendumIDFromPath(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("addendum-status: viewer", "error", err)
			serverError(w)
			return
		}

		addID, addParseErr := strconv.ParseInt(rawID, 10, 64)
		if addParseErr != nil {
			message(w, http.StatusNotFound, "Addendum not found.")
			return
		}

		var ownerID, pmID, proposerID *int64
		var owner int64
		var pm *int64
		var proposer *int64
		var addStatus *string
		var addTitle, addRole *string
		var addAmount, addCounter *string
		if err := pool.QueryRow(ctx, `SELECT p.user_id, p.pm_id, a.user_id, a.status::text, a.title, a.role_type, a.amount::text, a.counter_offer_amount::text
			FROM project_addendums a JOIN projects p ON p.id = a.project_id
			WHERE a.id = $1 AND a.project_id = $2`, addID, projectID).Scan(
			&owner, &pm, &proposer, &addStatus, &addTitle, &addRole, &addAmount, &addCounter); err != nil {
			if isNoRows(err) {
				message(w, http.StatusNotFound, "Addendum not found.")
				return
			}
			slog.Error("addendum-status: load", "error", err)
			serverError(w)
			return
		}
		ownerID, pmID, proposerID = &owner, pm, proposer

		isAuthoriser := viewer.id == ownerIDOrZero(ownerID) || (viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID))
		isProposer := proposerID != nil && *proposerID == viewer.id

		if !isAuthoriser && !isProposer {
			message(w, http.StatusForbidden, "Unauthorized. Only the project owner or assigned PM can authorise budget items.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		newStatus, amountText, amountSet, counterText, counterSet, note, noteSet := validateAddendumStatus(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if !isAuthoriser {
			allowed := newStatus == "accepted_by_pro" || newStatus == "negotiating"
			if !allowed {
				message(w, http.StatusForbidden, "A professional may accept or counter a negotiation, but cannot authorise or reject their own addendum. That is the Owner's or PM's decision.")
				return
			}
			if addStatus == nil || *addStatus != "negotiating" {
				message(w, http.StatusUnprocessableEntity, "This addendum has no open negotiation to respond to.")
				return
			}
			if counterSet || noteSet {
				message(w, http.StatusForbidden, "Counter-offer amount and note are set by the Owner or PM, not by the proposing professional.")
				return
			}
		}

		if addStatus == nil || (*addStatus != "pending_approval" && *addStatus != "negotiating" && *addStatus != "accepted_by_pro") {
			message(w, http.StatusUnprocessableEntity, "This item has already been processed or is not in a negotiable state.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("addendum-status: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `SELECT id FROM project_addendums WHERE id = $1 FOR UPDATE`, addID); err != nil {
			slog.Error("addendum-status: lock", "error", err)
			serverError(w)
			return
		}

		actorLabel := "Owner"
		if viewer.role == "project_manager" {
			actorLabel = "Project Manager"
		}

		// The amount binds once the item leaves negotiation: a revision
		// rides only on a pending_approval or negotiating row.
		if amountSet && addStatus != nil && (*addStatus == "pending_approval" || *addStatus == "negotiating") {
			if _, err := tx.Exec(ctx, `UPDATE project_addendums SET amount = $2::numeric WHERE id = $1`, addID, amountText); err != nil {
				slog.Error("addendum-status: amount", "error", err)
				serverError(w)
				return
			}
			addAmount = &amountText
		} else if amountSet {
			message(w, http.StatusUnprocessableEntity, "The agreed amount is binding once an addendum leaves negotiation.")
			return
		}

		// Accepting a counter-offer adopts the counter figure.
		if newStatus == "accepted_by_pro" && addCounter != nil {
			if _, err := tx.Exec(ctx, `UPDATE project_addendums SET amount = counter_offer_amount WHERE id = $1`, addID); err != nil {
				slog.Error("addendum-status: adopt", "error", err)
				serverError(w)
				return
			}
			addAmount = addCounter
		}

		if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = $2, updated_at = date_trunc('second', now()) WHERE id = $1`, addID, newStatus); err != nil {
			slog.Error("addendum-status: status", "error", err)
			serverError(w)
			return
		}

		pmUserID := pmUserOf(ctx, tx, pmID)

		title := ""
		if addTitle != nil {
			title = *addTitle
		}

		var answer string

		switch newStatus {
		case "approved_unpaid":
			notifyID := int64(0)
			if viewer.role == "project_manager" {
				notifyID = ownerIDOrZero(ownerID)
			} else {
				notifyID = pmUserID
			}
			if notifyID != 0 {
				if err := insertNotification(ctx, tx, notifyID, "budget_approved", "Budget Authorized by "+actorLabel,
					"The "+actorLabel+" has approved the budget of Rp "+formatIDAmount(orMinor(addAmount))+" for \""+title+"\". Please proceed with the payment.",
					mysqlJSONPair(`"project_id": `+strconv.FormatInt(projectID, 10))); err != nil {
					slog.Error("addendum-status: notify", "error", err)
					serverError(w)
					return
				}
			}
			if err := insertActivityLog(ctx, tx, projectID, viewer.id, "budget_authorized",
				actorLabel+" authorized budget: "+title+" (Rp "+formatIDAmount(orMinor(addAmount))+") - Awaiting Payment"); err != nil {
				slog.Error("addendum-status: log", "error", err)
				serverError(w)
				return
			}
			answer = "Budget authorized successfully. Awaiting payment from the Project Owner."
		case "negotiating":
			if isAuthoriser {
				if proposerID != nil && *proposerID != 0 {
					if err := insertNotification(ctx, tx, *proposerID, "budget_negotiation", "Fee Negotiation Requested",
						"The "+actorLabel+" has requested a fee negotiation for \""+title+"\". Counter-offer: Rp "+formatIDAmount(orMinor(counterTextPtr(counterText, counterSet)))+".",
						mysqlJSONPair(`"project_id": `+strconv.FormatInt(projectID, 10))); err != nil {
						slog.Error("addendum-status: notify", "error", err)
						serverError(w)
						return
					}
				}
				if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = 'negotiating', counter_offer_amount = $2::numeric, negotiation_note = $3, updated_at = date_trunc('second', now()) WHERE id = $1`,
					addID, counterOrNull(counterText, counterSet), noteOrNull(note, noteSet)); err != nil {
					slog.Error("addendum-status: negotiate", "error", err)
					serverError(w)
					return
				}
				if err := insertActivityLog(ctx, tx, projectID, viewer.id, "budget_negotiating",
					actorLabel+" requested fee negotiation for: "+title+" (Counter-offer: Rp "+formatIDAmount(orMinor(counterTextPtr(counterText, counterSet)))+")"); err != nil {
					slog.Error("addendum-status: log", "error", err)
					serverError(w)
					return
				}
			} else {
				if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = 'negotiating', updated_at = date_trunc('second', now()) WHERE id = $1`, addID); err != nil {
					slog.Error("addendum-status: negotiate", "error", err)
					serverError(w)
					return
				}
				notifyID := pmUserID
				if notifyID == 0 {
					notifyID = ownerIDOrZero(ownerID)
				}
				roleName := ""
				if addRole != nil {
					roleName = *addRole
				}
				if err := insertNotification(ctx, tx, notifyID, "budget_negotiation", "Revised Fee Proposed",
					"The "+roleName+" revised their fee for \""+title+"\" to Rp "+formatIDAmount(orMinor(addAmount))+".",
					mysqlJSONPair(`"project_id": `+strconv.FormatInt(projectID, 10))); err != nil {
					slog.Error("addendum-status: notify", "error", err)
					serverError(w)
					return
				}
				if err := insertActivityLog(ctx, tx, projectID, viewer.id, "budget_negotiating",
					"Professional revised fee for: "+title+" (Rp "+formatIDAmount(orMinor(addAmount))+")"); err != nil {
					slog.Error("addendum-status: log", "error", err)
					serverError(w)
					return
				}
			}
			answer = "Negotiation request sent."
		case "accepted_by_pro":
			notifyID := pmUserID
			if notifyID == 0 {
				notifyID = ownerIDOrZero(ownerID)
			}
			roleName := ""
			if addRole != nil {
				roleName = *addRole
			}
			if err := insertNotification(ctx, tx, notifyID, "budget_counter_accepted", "Counter-offer Accepted",
				"The "+roleName+" accepted the fee of Rp "+formatIDAmount(orMinor(addAmount))+" for \""+title+"\". It is ready to be authorised.",
				`{"project_id": `+strconv.FormatInt(projectID, 10)+`, "addendum_id": `+strconv.FormatInt(addID, 10)+`}`); err != nil {
				slog.Error("addendum-status: notify", "error", err)
				serverError(w)
				return
			}
			if err := insertActivityLog(ctx, tx, projectID, viewer.id, "budget_counter_accepted",
				"Professional accepted counter-offer for: "+title+" (Rp "+formatIDAmount(orMinor(addAmount))+")"); err != nil {
				slog.Error("addendum-status: log", "error", err)
				serverError(w)
				return
			}
			answer = "Counter-offer accepted. Awaiting authorisation."
		default:
			notifyID := int64(0)
			if viewer.role == "project_manager" {
				notifyID = ownerIDOrZero(ownerID)
			} else {
				notifyID = pmUserID
			}
			if notifyID != 0 {
				if err := insertNotification(ctx, tx, notifyID, "budget_rejected", "Budget Authorization Rejected by "+actorLabel,
					"The "+actorLabel+" has rejected the budget for \""+title+"\". Please discuss with the "+actorLabel+".",
					mysqlJSONPair(`"project_id": `+strconv.FormatInt(projectID, 10))); err != nil {
					slog.Error("addendum-status: notify", "error", err)
					serverError(w)
					return
				}
			}
			if err := insertActivityLog(ctx, tx, projectID, viewer.id, "budget_rejected",
				actorLabel+" rejected budget: "+title); err != nil {
				slog.Error("addendum-status: log", "error", err)
				serverError(w)
				return
			}
			answer = "Budget authorization rejected."
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("addendum-status: commit", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", answer)

		writeJSON(w, http.StatusOK, payload)
	}
}

// ownerIDOrZero reads the owner id pointer.
func ownerIDOrZero(ownerID *int64) int64 {
	if ownerID == nil {
		return 0
	}
	return *ownerID
}

// orMinor parses a decimal or returns zero.
func orMinor(text *string) int64 {
	if text == nil {
		return 0
	}
	if minor, ok := parseMinor(*text); ok {
		return minor
	}
	return 0
}

// counterTextPtr renders the counter text or empty.
func counterTextPtr(text string, set bool) *string {
	if !set {
		return nil
	}
	dup := text
	return &dup
}

// counterOrNull renders the counter value or NULL.
func counterOrNull(text string, set bool) any {
	if !set {
		return nil
	}
	return text
}

// noteOrNull renders the negotiation note or NULL.
func noteOrNull(note string, set bool) any {
	if !set {
		return nil
	}
	return note
}

// pmUserOf resolves the assigned PM's user id, or zero.
func pmUserOf(ctx context.Context, tx pgx.Tx, pmID *int64) int64 {
	if pmID == nil || *pmID == 0 {
		return 0
	}
	var userID *int64
	if err := tx.QueryRow(ctx, `SELECT user_id FROM project_managers WHERE id = $1`, *pmID).Scan(&userID); err != nil || userID == nil {
		return 0
	}
	return *userID
}

// validateAddendumStatus enforces status required|in:5, amount
// nullable|numeric|min:0, counter_offer_amount nullable|numeric|min:0,
// and negotiation_note nullable|string.
func validateAddendumStatus(fields map[string]any, failures *errorBag) (newStatus, amountText string, amountSet bool, counterText string, counterSet bool, note string, noteSet bool) {
	if raw, present := fields["status"]; !present || raw == nil {
		failures.add("status", "The status field is required.")
	} else if s, isStr := raw.(string); isStr && strings.TrimSpace(s) == "" {
		failures.add("status", "The status field is required.")
	} else if s, isStr := raw.(string); !isStr {
		failures.add("status", "The selected status is invalid.")
	} else if s != "approved_unpaid" && s != "rejected" && s != "negotiating" && s != "pending_approval" && s != "accepted_by_pro" {
		failures.add("status", "The selected status is invalid.")
	} else {
		newStatus = s
	}

	if raw, present := fields["amount"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s == "" {
			// absent
		} else if text, present := numericTextOf(raw); !present || text == "" {
			failures.add("amount", "The amount field must be a number.")
		} else if !isNumericText(text) {
			failures.add("amount", "The amount field must be a number.")
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add("amount", "The amount field must be a number.")
		} else if parsed < 0 {
			failures.add("amount", "The amount field must be at least 0.")
		} else {
			amountText, amountSet = strings.TrimSpace(text), true
		}
	}

	if raw, present := fields["counter_offer_amount"]; present && raw != nil {
		if s, isStr := raw.(string); isStr && s == "" {
			// absent
		} else if text, present := numericTextOf(raw); !present || text == "" {
			failures.add("counter_offer_amount", "The counter offer amount field must be a number.")
		} else if !isNumericText(text) {
			failures.add("counter_offer_amount", "The counter offer amount field must be a number.")
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add("counter_offer_amount", "The counter offer amount field must be a number.")
		} else if parsed < 0 {
			failures.add("counter_offer_amount", "The counter offer amount field must be at least 0.")
		} else {
			counterText, counterSet = strings.TrimSpace(text), true
		}
	}

	if raw, present := fields["negotiation_note"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("negotiation_note", "The negotiation note field must be a string.")
		} else if s != "" {
			note, noteSet = s, true
		}
	}

	return newStatus, amountText, amountSet, counterText, counterSet, note, noteSet
}

// addendumIDFromPath reads the segment after "addendums".
func addendumIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := 0; i+1 < len(parts); i++ {
		if parts[i] == "addendums" {
			return parts[i+1]
		}
	}
	return lastPathSegment(path)
}
