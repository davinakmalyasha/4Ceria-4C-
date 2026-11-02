package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TECHNICAL AUDIT — the lead professional and/or PM review milestones and
// documents in one pass.
//
// A LEAD pro (architect/contractor) approves → `reviewed` + lead timestamp.
// The PM approves → `approved`, completed, linked payment stages unlocked
// (locked/pending → pending) and gallery files synced to the document vault.
// Any revision request clears both verifications and blocks the integration.
// Only when EVERY submitted item is approved does the project's
// structural/mep integration timestamp move.

// auditMilestoneInput is one reviewed milestone.
type auditMilestoneInput struct {
	index  int
	id     int64
	status string
	note   any
}

// auditDocumentInput is one reviewed document.
type auditDocumentInput struct {
	index  int
	id     int64
	status string
	note   any
}

// parseAuditItems validates the two nested arrays.
func parseAuditItems(ctx context.Context, pool *pgxpool.Pool, raw any, key string, failures *errorBag) ([]auditMilestoneInput, []auditDocumentInput) {
	milestones := []auditMilestoneInput{}
	documents := []auditDocumentInput{}
	if raw == nil {
		return milestones, documents
	}
	list, ok := raw.([]any)
	if !ok {
		failures.add(key, "The "+key+" field must be an array.")
		return milestones, documents
	}
	for index, item := range list {
		row, ok := item.(map[string]any)
		prefix := key + "." + strconv.Itoa(index)
		if !ok {
			failures.add(prefix, "The "+prefix+" field must be an object.")
			continue
		}

		var id int64
		if value, present := row["id"]; !present || value == nil {
			failures.add(prefix+".id", "The "+prefix+".id field is required.")
		} else if text, ok := numericTextOf(value); !ok {
			failures.add(prefix+".id", "The "+prefix+".id field must be an integer.")
		} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
			failures.add(prefix+".id", "The "+prefix+".id field must be an integer.")
		} else {
			id = parsed
			// `exists:` is part of the id rule and runs before `status`, so the
			// error bag keeps Laravel's field order.
			table := "project_milestones"
			if key == "documents" {
				table = "project_documents"
			}
			var exists bool
			_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM `+table+` WHERE id = $1)`, id).Scan(&exists)
			if !exists {
				failures.add(prefix+".id", "The selected "+prefix+".id is invalid.")
			}
		}

		status := ""
		if value, present := row["status"]; !present || value == nil {
			failures.add(prefix+".status", "The "+prefix+".status field is required.")
		} else if text, ok := value.(string); !ok {
			failures.add(prefix+".status", "The selected "+prefix+".status is invalid.")
		} else if text != "approved" && text != "revision_requested" {
			failures.add(prefix+".status", "The selected "+prefix+".status is invalid.")
		} else {
			status = text
		}

		var note any
		if value, present := row["note"]; present && value != nil {
			if text, ok := value.(string); !ok {
				failures.add(prefix+".note", "The "+prefix+".note field must be a string.")
			} else {
				note = text
			}
		}

		if key == "milestones" {
			milestones = append(milestones, auditMilestoneInput{index: index, id: id, status: status, note: note})
		} else {
			documents = append(documents, auditDocumentInput{index: index, id: id, status: status, note: note})
		}
	}
	return milestones, documents
}

// auditMilestoneRow is the milestone state the audit reads/writes.
type auditMilestoneRow struct {
	id             int64
	projectID      int64
	title          string
	phaseContext   *string
	milestoneType  *string
	content        *string
	approvalStatus *string
	isCompleted    bool
	arsitekID      *int64
	kontraktorID   *int64
	notarisID      *int64
	interiorID     *int64
	pmID           *int64
	structuralID   *int64
	mepID          *int64
}

// loadAuditMilestone reads the columns the audit needs.
func loadAuditMilestone(ctx context.Context, tx pgx.Tx, id int64) (auditMilestoneRow, error) {
	var row auditMilestoneRow
	var isCompleted *bool
	err := tx.QueryRow(ctx, `SELECT id, project_id, title, phase_context, type, content::text,
		approval_status::text, is_completed, arsitek_id, kontraktor_id, notaris_id,
		interior_id, pm_id, structural_id, mep_id
		FROM project_milestones WHERE id = $1`, id).Scan(
		&row.id, &row.projectID, &row.title, &row.phaseContext, &row.milestoneType, &row.content,
		&row.approvalStatus, &isCompleted, &row.arsitekID, &row.kontraktorID, &row.notarisID,
		&row.interiorID, &row.pmID, &row.structuralID, &row.mepID)
	if err != nil {
		return row, err
	}
	row.isCompleted = isCompleted != nil && *isCompleted
	return row, nil
}

// auditProUserID is getMilestoneProUserId: the first assigned role's user.
func auditProUserID(ctx context.Context, tx pgx.Tx, row auditMilestoneRow) *int64 {
	pairs := []struct {
		table string
		id    *int64
	}{
		{"arsiteks", row.arsitekID}, {"kontraktors", row.kontraktorID},
		{"notaris_profiles", row.notarisID}, {"interior_profiles", row.interiorID},
		{"structural_engineers", row.structuralID}, {"mep_engineers", row.mepID},
	}
	for _, pair := range pairs {
		if pair.id == nil || *pair.id == 0 {
			continue
		}
		var userID *int64
		if err := tx.QueryRow(ctx, `SELECT user_id FROM `+pair.table+` WHERE id = $1`,
			*pair.id).Scan(&userID); err == nil && userID != nil && *userID != 0 {
			return userID
		}
	}
	return nil
}

// auditNotify inserts one milestone notification unless the recipient is the
// actor.
func auditNotify(ctx context.Context, tx pgx.Tx, recipient *int64, actor int64,
	kind, title, body string, projectID, milestoneID int64) {
	if recipient == nil || *recipient == 0 || *recipient == actor {
		return
	}
	data := `{"project_id":` + strconv.FormatInt(projectID, 10) +
		`,"milestone_id":` + strconv.FormatInt(milestoneID, 10) + `}`
	if _, err := tx.Exec(ctx, `INSERT INTO notifications
		(user_id, type, title, body, data, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, date_trunc('second', now()), date_trunc('second', now()))`,
		*recipient, kind, title, body, data); err != nil {
		slog.Warn("technical audit: notify", "error", err)
	}
}

// auditSyncVault upserts the milestone's approved gallery files into the
// document vault (`ProjectDocument`).
func auditSyncVault(ctx context.Context, tx pgx.Tx, row auditMilestoneRow, actor int64) error {
	files := []string{}
	fileNames := map[string]any{}
	if row.content != nil {
		var decoded map[string]any
		if err := json.Unmarshal([]byte(*row.content), &decoded); err == nil {
			if gallery, ok := decoded["gallery"].([]any); ok {
				for _, item := range gallery {
					if text, ok := item.(string); ok && text != "" {
						files = append(files, text)
					}
				}
			}
			if names, ok := decoded["file_names"].(map[string]any); ok {
				fileNames = names
			}
		}
	}
	if len(files) == 0 {
		return nil
	}

	status := "under_review"
	if (row.approvalStatus != nil && *row.approvalStatus == "approved") || row.isCompleted {
		status = "verified"
	}
	category := "milestone_attachment"
	if row.phaseContext != nil && *row.phaseContext == "design" {
		category = "blueprint"
	} else if row.milestoneType != nil && *row.milestoneType != "" {
		category = *row.milestoneType
	}
	targetRole := any(nil)
	for _, pair := range []struct {
		id   *int64
		role string
	}{
		{row.arsitekID, "architect"}, {row.kontraktorID, "contractor"},
		{row.notarisID, "notary"}, {row.interiorID, "interior"},
		{row.pmID, "pm"}, {row.structuralID, "structural"}, {row.mepID, "mep"},
	} {
		if pair.id != nil && *pair.id != 0 {
			targetRole = pair.role
			break
		}
	}

	for _, filePath := range files {
		fileName := row.title + " - " + path.Base(filePath)
		if name, ok := fileNames[filePath].(string); ok && name != "" {
			fileName = name
		}
		fileType := strings.TrimPrefix(path.Ext(filePath), ".")

		var existingID int64
		err := tx.QueryRow(ctx, `SELECT id FROM project_documents
			WHERE project_id = $1 AND file_path = $2 LIMIT 1`, row.projectID, filePath).Scan(&existingID)
		if err == nil {
			if _, err := tx.Exec(ctx, `UPDATE project_documents SET uploader_id = $2, file_name = $3,
				file_type = $4, category = $5, status = $6, version_label = $7, target_role = $8,
				updated_at = date_trunc('second', now()) WHERE id = $1`,
				existingID, actor, fileName, fileType, category, status, row.title, targetRole); err != nil {
				return err
			}
			continue
		}
		if !isNoRows(err) {
			return err
		}

		if _, err := tx.Exec(ctx, `INSERT INTO project_documents
			(project_id, uploader_id, file_name, version, file_path, category, target_role,
			 status, version_label, file_type, created_at, updated_at)
			VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9,
			 date_trunc('second', now()), date_trunc('second', now()))`,
			row.projectID, actor, fileName, filePath, category, targetRole,
			status, row.title, fileType); err != nil {
			return err
		}
	}
	return nil
}

// TechnicalAuditHandler serves
// `POST /api/projects/{project}/technical-audit-submit`.
func TechnicalAuditHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
			slog.Error("technical audit: project", "error", err)
			serverError(w)
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("technical audit: viewer", "error", err)
			serverError(w)
			return
		}
		columns, err := projectHireColumns(ctx, pool, projectID)
		if err != nil {
			slog.Error("technical audit: columns", "error", err)
			serverError(w)
			return
		}
		ownerID := projectInt(values, fields, "user_id")
		isOwner := ownerID == viewer.id
		isPM := verifyAssignedPM(viewer, projectIntPtr(values, fields, "pm_id"))
		isLeadArsitek := viewer.role == "arsitek" && hireMatches(viewer, columns, "arsitek")
		isLeadKontraktor := viewer.role == "kontraktor" && hireMatches(viewer, columns, "kontraktor")
		if !isPM && !isOwner && !isLeadArsitek && !isLeadKontraktor {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}
		failures := &errorBag{}

		roleType := ""
		if raw, present := body["role_type"]; !present || raw == nil {
			failures.add("role_type", "The role type field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("role_type", "The selected role type is invalid.")
		} else {
			valid := false
			for _, role := range []string{"structural", "mep", "design", "build", "interior", "legal"} {
				if text == role {
					valid = true
					break
				}
			}
			if !valid {
				failures.add("role_type", "The selected role type is invalid.")
			} else {
				roleType = text
			}
		}

		milestones, documents := parseAuditItems(ctx, pool, body["milestones"], "milestones", failures)
		_, documents = parseAuditItems(ctx, pool, body["documents"], "documents", failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		// Cross-project ownership is checked before any write.
		for _, item := range milestones {
			var exists bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_milestones
				WHERE id = $1 AND project_id = $2)`, item.id, projectID).Scan(&exists); err != nil {
				slog.Error("technical audit: milestone check", "error", err)
				serverError(w)
				return
			}
			if !exists {
				message(w, http.StatusUnprocessableEntity,
					"Milestone #"+strconv.FormatInt(item.id, 10)+" does not belong to this project.")
				return
			}
		}
		for _, item := range documents {
			var exists bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_documents
				WHERE id = $1 AND project_id = $2)`, item.id, projectID).Scan(&exists); err != nil {
				slog.Error("technical audit: document check", "error", err)
				serverError(w)
				return
			}
			if !exists {
				message(w, http.StatusUnprocessableEntity,
					"Document #"+strconv.FormatInt(item.id, 10)+" does not belong to this project.")
				return
			}
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("technical audit: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		projectTitle := stringOf(projectText(values, fields, "title"))
		allApproved := true
		unlocked := make([]any, 0)

		for _, item := range milestones {
			row, err := loadAuditMilestone(ctx, tx, item.id)
			if err != nil {
				slog.Error("technical audit: milestone load", "error", err)
				serverError(w)
				return
			}

			reviewStatus := item.status
			var leadAt, pmAt, completed any
			approval := ""
			if item.status == "approved" {
				if isLeadArsitek || isLeadKontraktor {
					leadAt = "now"
					approval = "reviewed"
				}
				if isPM {
					pmAt = "now"
					approval = "approved"
					completed = true
				}
			} else {
				allApproved = false
				approval = "pending"
				leadAt = nil
				pmAt = nil
			}

			sets := []string{"review_note = $2", "review_status = $3", "approval_status = $4",
				"lead_pro_verified_at = CASE WHEN $5 THEN date_trunc('second', now()) ELSE NULL END",
				"pm_verified_at = CASE WHEN $6 THEN date_trunc('second', now()) ELSE NULL END",
				"updated_at = date_trunc('second', now())"}
			args := []any{item.id, item.note, reviewStatus, approval, leadAt != nil, pmAt != nil}
			if completed != nil {
				sets = append(sets, "is_completed = true")
			}
			if _, err := tx.Exec(ctx, `UPDATE project_milestones SET `+strings.Join(sets, ", ")+
				` WHERE id = $1`, args...); err != nil {
				slog.Error("technical audit: milestone update", "error", err)
				serverError(w)
				return
			}

			// Reload the post-update state for the vault sync and notifications.
			fresh, err := loadAuditMilestone(ctx, tx, item.id)
			if err != nil {
				slog.Error("technical audit: milestone reload", "error", err)
				serverError(w)
				return
			}

			if isPM && item.status == "approved" {
				terminRows, err := tx.Query(ctx, `SELECT id, label, amount::text
					FROM project_payment_termins WHERE milestone_id = $1
					  AND status::text IN ('locked','pending') ORDER BY id`, item.id)
				if err != nil {
					slog.Error("technical audit: termins", "error", err)
					serverError(w)
					return
				}
				type pendingTermin struct {
					id     int64
					label  string
					amount string
				}
				terms := []pendingTermin{}
				for terminRows.Next() {
					var termin pendingTermin
					if err := terminRows.Scan(&termin.id, &termin.label, &termin.amount); err != nil {
						terminRows.Close()
						slog.Error("technical audit: termin scan", "error", err)
						serverError(w)
						return
					}
					terms = append(terms, termin)
				}
				terminRows.Close()
				for _, termin := range terms {
					if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET status = 'pending',
						updated_at = date_trunc('second', now()) WHERE id = $1`, termin.id); err != nil {
						slog.Error("technical audit: termin update", "error", err)
						serverError(w)
						return
					}
					entry := jsonphp.NewObject()
					entry.Set("label", termin.label)
					entry.Set("amount", termin.amount)
					entry.Set("milestone_title", row.title)
					unlocked = append(unlocked, entry)

					if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "payment_triggered",
						"Progress Verified: '"+row.title+"'. Payment Termin '"+termin.label+"' is now unlocked and awaiting owner approval."); err != nil {
						slog.Error("technical audit: termin activity", "error", err)
						serverError(w)
						return
					}
				}

				if err := auditSyncVault(ctx, tx, fresh, caller.UserID()); err != nil {
					slog.Error("technical audit: vault", "error", err)
					serverError(w)
					return
				}
			}

			if item.status == "approved" && approval == "approved" {
				proUser := auditProUserID(ctx, tx, fresh)
				auditNotify(ctx, tx, proUser, caller.UserID(), "milestone_approved",
					"Milestone Approved",
					"\""+row.title+"\" was approved. Any linked payment termin has been unlocked.",
					projectID, row.id)
			} else if item.status == "revision_requested" {
				proUser := auditProUserID(ctx, tx, fresh)
				noteText := "no details provided."
				if item.note != nil {
					noteText = stringOf(item.note)
				}
				auditNotify(ctx, tx, proUser, caller.UserID(), "milestone_revision_requested",
					"Revision Requested",
					"Revision requested for \""+row.title+"\": "+noteText,
					projectID, row.id)
			}
		}

		for _, item := range documents {
			var noteArg any
			if item.note != nil {
				noteArg = item.note
			}
			if _, err := tx.Exec(ctx, `UPDATE project_documents SET review_note = $2, status = $3,
				reviewed_at = date_trunc('second', now()),
				updated_at = date_trunc('second', now()) WHERE id = $1`,
				item.id, noteArg, item.status); err != nil {
				slog.Error("technical audit: document update", "error", err)
				serverError(w)
				return
			}
			if item.status != "approved" {
				allApproved = false
			}
		}

		hasItems := len(milestones) > 0 || len(documents) > 0
		if allApproved && hasItems {
			column := "mep_approved_at"
			if roleType == "structural" {
				column = "structural_approved_at"
			}
			if _, err := tx.Exec(ctx, `UPDATE projects SET `+column+` = date_trunc('second', now()),
				updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
				slog.Error("technical audit: integration", "error", err)
				serverError(w)
				return
			}
			if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "integration_approved",
				"Integrated "+roleType+" role via Audit"); err != nil {
				slog.Error("technical audit: integration activity", "error", err)
				serverError(w)
				return
			}
		}
		_ = projectTitle

		if err := tx.Commit(ctx); err != nil {
			slog.Error("technical audit: commit", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Audit submitted successfully")
		payload.Set("unlocked_termins", unlocked)
		writeJSON(w, http.StatusOK, payload)
	}
}
