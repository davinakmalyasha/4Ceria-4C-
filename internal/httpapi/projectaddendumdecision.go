package httpapi

import (
	"context"
	"strings"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GENERIC ADDENDUM AUTHORISATION — approve / reject.
//
// `/api/projects/{project}/addendums/{addendum}/approve|reject` is the
// simple binary decision next to the negotiation machine in
// `budget/addendums/{id}`: only a `pending_approval` row may move, only
// the owner or the assigned PM may move it, and the answer is the bare
// re-read addendum under `data`.
//
// Approve has a fork:
//   - amount > 0 → `approved_unpaid` (the owner must still upload a
//     payment proof) and, for a specialist addendum, the invited
//     sub-professional record is minted immediately so the specialist
//     sees the project and can verify the payment themselves;
//   - amount == 0 → `approved` and the project is touched (the plan
//     counts toward budget maths).
//
// A linked procurement request is set to `approved` either way. Both
// decisions notify the proposing professional and write an activity
// line.
//
// THE STATUS CHECK ANSWERS 400, NOT 422. It is the only 400 in this
// cluster, and the gate pins it.

// ApproveAddendumHandler serves
// `POST /api/projects/{project}/addendums/{addendum}/approve`.
func ApproveAddendumHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return addendumDecision(pool, true)
}

// RejectAddendumHandler serves
// `POST /api/projects/{project}/addendums/{addendum}/reject`.
func RejectAddendumHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return addendumDecision(pool, false)
}

// addendumDecision is the shared body: binding, gate, state, then the
// approve/reject fork.
func addendumDecision(pool *pgxpool.Pool, approve bool) http.HandlerFunc {
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

		rawAddendum := r.PathValue("addendum")
		if rawAddendum == "" {
			rawAddendum = addendumDecisionID(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("addendum-decision: viewer", "error", err)
			serverError(w)
			return
		}

		addID, parseErr := strconv.ParseInt(rawAddendum, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectAddendum`, rawAddendum)
			return
		}

		var rowProject int64
		var ownerID int64
		var pmID *int64
		var status, title *string
		var amount *int64
		var addType, roleType, specialistType, authorRole *string
		var teamMemberID, assignedUserID, procurementID, authorUserID *int64
		err = pool.QueryRow(ctx, `
			SELECT a.project_id, p.user_id, p.pm_id, a.status::text, a.title,
			       (a.amount * 100)::bigint,
			       a.type, a.role_type, a.specialist_type,
			       a.team_member_id, a.assigned_user_id, a.procurement_request_id,
			       a.user_id, u.role_type::text
			  FROM project_addendums a
			  JOIN projects p ON p.id = a.project_id
			  LEFT JOIN users u ON u.id = a.user_id
			 WHERE a.id = $1`, addID).Scan(
			&rowProject, &ownerID, &pmID, &status, &title,
			&amount,
			&addType, &roleType, &specialistType,
			&teamMemberID, &assignedUserID, &procurementID,
			&authorUserID, &authorRole)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectAddendum`, rawAddendum)
				return
			}
			slog.Error("addendum-decision: load", "error", err)
			serverError(w)
			return
		}

		// The binding check is the controller's own 404, not the model one.
		if rowProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		isOwner := viewer.id == ownerID
		isPM := viewer.role == "project_manager" && verifyAssignedPM(viewer, pmID)
		if !isOwner && !isPM {
			if approve {
				message(w, http.StatusForbidden, "Unauthorized. Only the Owner or PM can approve addendums.")
			} else {
				message(w, http.StatusForbidden, "Unauthorized. Only the Owner or PM can reject addendums.")
			}
			return
		}

		if status == nil || *status != "pending_approval" {
			message(w, http.StatusBadRequest, "This addendum is not pending approval.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("addendum-decision: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `SELECT id FROM project_addendums WHERE id = $1 FOR UPDATE`, addID); err != nil {
			slog.Error("addendum-decision: lock", "error", err)
			serverError(w)
			return
		}

		amountMinor := int64(0)
		if amount != nil {
			amountMinor = *amount
		}

		addTitle := ""
		if title != nil {
			addTitle = *title
		}

		// The specialist branch dereferences `$addendum->user`, which
		// EAGER-LOADS the author onto the model — and Eloquent serializes
		// every loaded relation, so the 200 grows a `user` block exactly
		// when that branch is reachable.
		specialistBranch := false
		if approve && amountMinor > 0 && addType != nil &&
			(*addType == "specialist_assignment" || *addType == "specialist_request") &&
			((teamMemberID != nil && *teamMemberID != 0) || (assignedUserID != nil && *assignedUserID != 0)) {
			specialistBranch = true
		}

		actorID := viewer.id
		_ = actorID

		if !approve {
			if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = 'rejected', updated_at = date_trunc('second', now()) WHERE id = $1`, addID); err != nil {
				slog.Error("addendum-decision: reject", "error", err)
				serverError(w)
				return
			}
		} else {
			if amountMinor > 0 {
				if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = 'approved_unpaid', paid_at = NULL, updated_at = date_trunc('second', now()) WHERE id = $1`, addID); err != nil {
					slog.Error("addendum-decision: approve", "error", err)
					serverError(w)
					return
				}

				if addType != nil && (*addType == "specialist_assignment" || *addType == "specialist_request") &&
					((teamMemberID != nil && *teamMemberID != 0) || (assignedUserID != nil && *assignedUserID != 0)) {
					if err := inviteSpecialist(ctx, tx, projectID, addID, *addType, roleType, specialistType, teamMemberID, assignedUserID, authorUserID, authorRole, amount); err != nil {
						slog.Error("addendum-decision: specialist", "error", err)
						serverError(w)
						return
					}
				}
			} else {
				if _, err := tx.Exec(ctx, `UPDATE project_addendums SET status = 'approved', updated_at = date_trunc('second', now()) WHERE id = $1`, addID); err != nil {
					slog.Error("addendum-decision: approve", "error", err)
					serverError(w)
					return
				}
				if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
					slog.Error("addendum-decision: touch", "error", err)
					serverError(w)
					return
				}
			}

			if procurementID != nil && *procurementID != 0 {
				if _, err := tx.Exec(ctx, `UPDATE project_procurement_requests SET status = 'authorized', updated_at = date_trunc('second', now()) WHERE id = $1`, *procurementID); err != nil {
					slog.Error("addendum-decision: procurement", "error", err)
					serverError(w)
					return
				}
			}
		}

		notifyKind := "addendum_rejected"
		notifyTitle := "Addendum Rejected"
		notifyBody := "Your addendum \"" + addTitle + "\" was rejected."
		action := "addendum_rejected"
		details := "Rejected addendum: " + addTitle
		if approve {
			notifyKind = "addendum_approved"
			notifyTitle = "Addendum Approved"
			notifyBody = "Your addendum \"" + addTitle + "\" has been approved."
			action = "addendum_approved"
			details = "Approved addendum: " + addTitle
		}

		notifyID := int64(0)
		if authorUserID != nil {
			notifyID = *authorUserID
		}
		if notifyID != 0 {
			if err := insertNotification(ctx, tx, notifyID, notifyKind, notifyTitle, notifyBody,
				`{"addendum_id": `+strconv.FormatInt(addID, 10)+`, "project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
				slog.Error("addendum-decision: notify", "error", err)
				serverError(w)
				return
			}
		}

		if err := insertActivityLog(ctx, tx, projectID, viewer.id, action, details); err != nil {
			slog.Error("addendum-decision: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("addendum-decision: commit", "error", err)
			serverError(w)
			return
		}

		entry, err := loadAddendumRow(ctx, pool, addID)
		if err != nil {
			slog.Error("addendum-decision: reload", "error", err)
			serverError(w)
			return
		}

		if specialistBranch && authorUserID != nil && *authorUserID != 0 {
			authorBlock, err := fullProfileUser(ctx, pool, *authorUserID, false)
			if err != nil {
				slog.Error("addendum-decision: author", "error", err)
				serverError(w)
				return
			}
			entry.Set("user", authorBlock)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// inviteSpecialist mints (or refreshes) the invited sub-professional row
// for a specialist addendum, with the AUTHOR as `assigned_by` — the
// oracle records who proposed the hire here, not who approved it.
func inviteSpecialist(ctx context.Context, tx pgx.Tx, projectID, addID int64, addType string, roleType, specialistType *string, teamMemberID, assignedUserID, authorUserID *int64, authorRole *string, amount *int64) error {
	subRole := ""
	if specialistType != nil && *specialistType != "" {
		subRole = *specialistType
	} else if roleType != nil {
		subRole = *roleType
	}

	var specialistUserID *int64
	specialistName := ""
	if assignedUserID != nil && *assignedUserID != 0 {
		var name string
		if err := tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, *assignedUserID).Scan(&name); err == nil {
			dup := *assignedUserID
			specialistUserID = &dup
			specialistName = name
		}
	} else if teamMemberID != nil && *teamMemberID != 0 {
		var name *string
		_ = tx.QueryRow(ctx, `SELECT name FROM team_members WHERE id = $1`, *teamMemberID).Scan(&name)
		if name != nil {
			specialistName = *name
		}
	}

	if specialistName == "" && specialistUserID == nil {
		return nil
	}

	parentRole := "arsitek"
	if authorRole != nil && *authorRole == "kontraktor" {
		parentRole = "kontraktor"
	}

	rateText := "0"
	if amount != nil {
		rateText = formatMinor(*amount)
	}

	assignedBy := int64(0)
	if authorUserID != nil {
		assignedBy = *authorUserID
	}

	sql := `INSERT INTO project_sub_professionals (project_id, sub_role, user_id, parent_role, assigned_by, status, rate, lead_pro_notes, hired_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'invited', $6::numeric, $7, NULL, date_trunc('second', now()), date_trunc('second', now()))`
	if found := subProfessionalExists(ctx, tx, projectID, subRole); found {
		if _, err := tx.Exec(ctx, `UPDATE project_sub_professionals SET user_id = $3, parent_role = $4, assigned_by = $5, status = 'invited', rate = $6::numeric, lead_pro_notes = $7, hired_at = NULL, updated_at = date_trunc('second', now()) WHERE project_id = $1 AND sub_role = $2`,
			projectID, subRole, specialistUserID, parentRole, assignedBy, rateText, "Assigned via Paid Addendum: "+specialistName); err != nil {
			return err
		}
	} else if _, err := tx.Exec(ctx, sql, projectID, subRole, specialistUserID, parentRole, assignedBy, rateText, "Assigned via Paid Addendum: "+specialistName); err != nil {
		return err
	}

	if specialistUserID != nil {
		if _, err := tx.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at) VALUES ($1, 'sub_professional_invite', 'New Sub-Professional Invitation', $2, $3, date_trunc('second', now()), date_trunc('second', now()))`,
			*specialistUserID,
			"You have been invited as a "+subRole+" for \""+projectTitleOf(ctx, tx, projectID)+"\".",
			`{"project_id": `+strconv.FormatInt(projectID, 10)+`}`); err != nil {
			return err
		}
	}

	_ = addType
	return nil
}

// subProfessionalExists reports whether the (project, sub_role) slot is taken.
func subProfessionalExists(ctx context.Context, tx pgx.Tx, projectID int64, subRole string) bool {
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND sub_role = $2)`, projectID, subRole).Scan(&exists); err != nil {
		return false
	}
	return exists
}

// projectTitleOf reads the project title for the invitation body.
func projectTitleOf(ctx context.Context, tx pgx.Tx, projectID int64) string {
	var title string
	_ = tx.QueryRow(ctx, `SELECT title FROM projects WHERE id = $1`, projectID).Scan(&title)
	return title
}

// loadAddendumRow re-reads one addendum in table order for the response.
func loadAddendumRow(ctx context.Context, pool *pgxpool.Pool, addID int64) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, `SELECT id, project_id, type, role_type, user_id, team_member_id, specialist_type, title, description, negotiation_note, attachment_path, amount::text, counter_offer_amount::text, recommended_bid_id, recommended_bid_type::text, status::text, payment_proof_path, verification_notes, paid_at, created_at, updated_at, procurement_request_id, assigned_user_id, refunded_amount::text
		FROM project_addendums WHERE id = $1`, addID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, errLedgerGone
	}

	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	entry := jsonphp.NewObject()
	for _, column := range fields {
		value := byName[column]
		switch column {
		case "amount", "counter_offer_amount", "refunded_amount":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "paid_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	return entry, nil
}

// addendumDecisionID reads the addendum segment before "approve"/"reject".
func addendumDecisionID(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := 0; i+1 < len(parts); i++ {
		if parts[i] == "addendums" {
			return parts[i+1]
		}
	}
	return lastPathSegment(path)
}
