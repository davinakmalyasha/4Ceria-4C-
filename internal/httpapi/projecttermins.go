package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/domain/escrow"
	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/domain/terminplan"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PAYMENT TERMINS — the per-role payment schedule.
//
// GET lists every stage with its milestone (owner or hired professional
// only). POST mints one stage behind the terminplan guards: the role must
// be licensed, the plan must stay within the negotiated value, and the
// retention split is computed exactly the way the Eloquent `creating`
// hook computes it — never zero-filled, or the PG invariant
// ppt_retention_split_exact rejects the row.

// PaymentTerminsHandler serves `GET /api/projects/{project}/payment-termins`.
func PaymentTerminsHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("termins: subject", "error", err)
			serverError(w)
			return
		}

		if _, _, err := projectRowByID(ctx, pool, projectID); err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("termins: project", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("termins: parties", "error", err)
			serverError(w)
			return
		}

		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT id, project_id, role_type, recipient_id, label, percentage::text, amount::text, retention_amount::text, retention_released_at, retention_released_amount::text, net_amount::text, trigger_description, status::text, payment_proof_path, verification_notes, milestone_id, change_order_id, paid_at, notes, retention_notes, created_at, updated_at, refunded_amount::text, milestone_id
			FROM project_payment_termins WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			slog.Error("termins: list", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			entry, err := scanTerminRow(ctx, pool, rows)
			if err != nil {
				slog.Error("termins: scan", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("termins: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)

		writeJSON(w, http.StatusOK, payload)
	}
}

// scanTerminRow renders one termin row in MySQL column order with the
// model casts, plus the milestone block (null when unlinked).
func scanTerminRow(ctx context.Context, pool *pgxpool.Pool, rows pgxRows) (*jsonphp.Object, error) {
	entry, milestoneRef, err := scanTerminColumns(rows)
	if err != nil {
		return nil, err
	}

	milestone, err := nullableMilestone(ctx, pool, milestoneRef)
	if err != nil {
		return nil, err
	}
	entry.Set("milestone", milestone)

	return entry, nil
}

// scanTerminColumns renders the row's OWN columns (table order) and
// returns the milestone reference for the caller that wants the relation.
func scanTerminColumns(rows pgxRows) (*jsonphp.Object, *int64, error) {
	var id, projectID, recipientID, milestoneID, changeOrderID *int64
	var roleType, label, percentage, amount, retention, retentionReleased, net, trigger, status, proofPath, verificationNotes, notes, retentionNotes, refunded *string
	var paidAt, createdAt, updatedAt any
	var retentionReleasedAt any
	var milestoneRef *int64

	if err := rows.Scan(&id, &projectID, &roleType, &recipientID, &label, &percentage, &amount, &retention, &retentionReleasedAt, &retentionReleased, &net, &trigger, &status, &proofPath, &verificationNotes, &milestoneID, &changeOrderID, &paidAt, &notes, &retentionNotes, &createdAt, &updatedAt, &refunded, &milestoneRef); err != nil {
		return nil, nil, err
	}

	entry := jsonphp.NewObject()
	entry.Set("id", nullableInt64(id))
	entry.Set("project_id", nullableInt64(projectID))
	entry.Set("role_type", nullableString(roleType))
	entry.Set("recipient_id", nullableInt64(recipientID))
	entry.Set("label", nullableString(label))
	entry.Set("percentage", nullableString(percentage))
	entry.Set("amount", nullableString(amount))
	entry.Set("retention_amount", nullableString(retention))
	entry.Set("retention_released_at", projectTimeValue(retentionReleasedAt))
	entry.Set("retention_released_amount", nullableString(retentionReleased))
	entry.Set("net_amount", nullableString(net))
	entry.Set("trigger_description", nullableString(trigger))
	entry.Set("status", nullableString(status))
	entry.Set("payment_proof_path", nullableString(proofPath))
	entry.Set("verification_notes", nullableString(verificationNotes))
	entry.Set("milestone_id", nullableInt64(milestoneID))
	entry.Set("change_order_id", nullableInt64(changeOrderID))
	entry.Set("paid_at", projectTimeValue(paidAt))
	entry.Set("notes", nullableString(notes))
	entry.Set("retention_notes", nullableString(retentionNotes))
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("updated_at", projectTimeValue(updatedAt))
	entry.Set("refunded_amount", nullableString(refunded))

	return entry, milestoneRef, nil
}

// pgxRows is the rows interface both pgx.Rows and pgx.Row satisfy for
// scanning. Only Next/Scan/Err/Close are used.
type pgxRows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close()
}

// nullableMilestone renders a full milestone row or null. Milestones
// carry no appends — plain columns with the model casts.
func nullableMilestone(ctx context.Context, pool *pgxpool.Pool, milestoneID *int64) (any, error) {
	if milestoneID == nil || *milestoneID == 0 {
		return nil, nil
	}

	var id, projectID, arsitekID, kontraktorID, notarisID, interiorID, pmID, structuralID, mepID *int64
	var title, milestoneType, content, description, reviewNote, reviewStatus, image *string
	var sortOrder *int
	var startDate, dueDate any
	var isCompleted *bool
	var approvalStatus, revisionNotes, phaseContext *string
	var leadVerified, pmVerified, createdAt, updatedAt any
	var progressAttachment *string

	err := pool.QueryRow(ctx, `SELECT id, project_id, arsitek_id, kontraktor_id, notaris_id, interior_id, pm_id, structural_id, mep_id, title, type, content::text, description, review_note, review_status, image, sort_order, start_date, due_date, is_completed, approval_status, revision_notes, phase_context, lead_pro_verified_at, pm_verified_at, progress_attachment, created_at, updated_at
		FROM project_milestones WHERE id = $1`, *milestoneID).Scan(
		&id, &projectID, &arsitekID, &kontraktorID, &notarisID, &interiorID, &pmID, &structuralID, &mepID, &title, &milestoneType, &content, &description, &reviewNote, &reviewStatus, &image, &sortOrder, &startDate, &dueDate, &isCompleted, &approvalStatus, &revisionNotes, &phaseContext, &leadVerified, &pmVerified, &progressAttachment, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	entry.Set("id", nullableInt64(id))
	entry.Set("project_id", nullableInt64(projectID))
	entry.Set("arsitek_id", nullableInt64(arsitekID))
	entry.Set("kontraktor_id", nullableInt64(kontraktorID))
	entry.Set("notaris_id", nullableInt64(notarisID))
	entry.Set("interior_id", nullableInt64(interiorID))
	entry.Set("pm_id", nullableInt64(pmID))
	entry.Set("structural_id", nullableInt64(structuralID))
	entry.Set("mep_id", nullableInt64(mepID))
	entry.Set("title", nullableString(title))
	entry.Set("type", nullableString(milestoneType))
	entry.Set("content", jsonOrNilString(content))
	entry.Set("description", nullableString(description))
	entry.Set("review_note", nullableString(reviewNote))
	entry.Set("review_status", nullableString(reviewStatus))
	entry.Set("image", nullableString(image))
	entry.Set("sort_order", nullableSortOrder(sortOrder))
	entry.Set("start_date", mysqlDate(startDate))
	entry.Set("due_date", mysqlDate(dueDate))
	entry.Set("is_completed", isCompleted != nil && *isCompleted)
	entry.Set("approval_status", nullableString(approvalStatus))
	entry.Set("revision_notes", nullableString(revisionNotes))
	entry.Set("phase_context", nullableString(phaseContext))
	entry.Set("lead_pro_verified_at", projectTimeValue(leadVerified))
	entry.Set("pm_verified_at", projectTimeValue(pmVerified))
	entry.Set("progress_attachment", nullableString(progressAttachment))
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("updated_at", projectTimeValue(updatedAt))

	return entry, nil
}

// nullableSortOrder renders an integer sort column or null.
func nullableSortOrder(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

// jsonOrNilString decodes a JSON text column or renders null.
func jsonOrNilString(value *string) any {
	if value == nil || *value == "" {
		return nil
	}
	return jsonOrNil(*value)
}

// StoreTerminHandler serves `POST /api/projects/{project}/payment-termins`.
func StoreTerminHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
		formFields, formFiles, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		_ = formFiles

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("termin-store: viewer", "error", err)
			serverError(w)
			return
		}

		var ownerID int64
		var pmID *int64
		if err := pool.QueryRow(ctx, `SELECT user_id, pm_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &pmID); err != nil {
			slog.Error("termin-store: project", "error", err)
			serverError(w)
			return
		}

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("termin-store: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("termin-store: parties", "error", err)
			serverError(w)
			return
		}

		isOwner := viewer.id == ownerID
		isPM := pmID != nil && *pmID != 0 && viewer.profiles["project_manager"] == *pmID
		isHired := isParticipant(parties, subject) && !isOwner

		if !isOwner && !isPM && !isHired {
			message(w, http.StatusForbidden, "Unauthorized. Only the project owner, the assigned Project Manager, or a hired professional on this project may create a payment schedule.")
			return
		}

		var openID int64
		var openTitle string
		if err := pool.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
			message(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
			return
		}

		failures := &errorBag{}
		input, valid := validateTermin(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}
		_ = valid

		if input.milestoneID != nil {
			var inProject bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_milestones WHERE id = $1 AND project_id = $2)`, *input.milestoneID, projectID).Scan(&inProject); err != nil {
				slog.Error("termin-store: milestone", "error", err)
				serverError(w)
				return
			}
			if !inProject {
				failures.add("milestone_id", "The selected work phase does not belong to this project.")
				failures.write(w)
				return
			}
		}

		requestedRole := input.roleType
		if !isOwner && !isPM {
			requestedRole = viewer.role
		}
		effectiveRole := requestedRole
		if effectiveRole == "" {
			effectiveRole = viewer.role
		}

		if err := terminplan.AssertKnownRole(effectiveRole); err != nil {
			message(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		contract, err := signContractValue(ctx, pool, projectID, effectiveRole)
		if err != nil {
			slog.Error("termin-store: value", "error", err)
			serverError(w)
			return
		}

		var planned money.Money
		planned, err = terminPlannedTotal(ctx, pool, projectID, effectiveRole)
		if err != nil {
			slog.Error("termin-store: planned", "error", err)
			serverError(w)
			return
		}

		amount, err := money.FromColumn(input.amountText, "IDR")
		if err != nil {
			slog.Error("termin-store: amount", "error", err)
			serverError(w)
			return
		}

		combined, err := planned.Add(amount)
		if err != nil {
			slog.Error("termin-store: total", "error", err)
			serverError(w)
			return
		}

		if err := terminplan.AssertTotalWithinContractValue(contract, combined); err != nil {
			message(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		split, err := escrow.SplitRetention(amount, "5")
		if err != nil {
			slog.Error("termin-store: split", "error", err)
			serverError(w)
			return
		}

		var recipientID *int64
		if requestedRole == "" || requestedRole == viewer.role {
			dup := viewer.id
			recipientID = &dup
		}

		status := input.status
		if status == "" {
			status = "locked"
		}

		var createdID int64
		err = pool.QueryRow(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, trigger_description, status, milestone_id, notes, role_type, recipient_id, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8::payment_termin_status, $9, $10, $11, $12, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, input.label, input.percentageText, input.amountText, split.Retention.Decimal(), split.Net.Decimal(), input.trigger, status, input.milestoneID, input.notes, effectiveRole, recipientID).Scan(&createdID)
		if err != nil {
			slog.Error("termin-store: insert", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "termin_added", "Payment termin added: "+input.label); err != nil {
			slog.Error("termin-store: log", "error", err)
			serverError(w)
			return
		}

		// The 201 echoes the create in input order — label first, id
		// near-last, milestone last — not the table order. Build it from
		// the inputs rather than re-reading the row.
		created := jsonphp.NewObject()
		created.Set("label", input.label)
		percentageEcho, _ := money.FromColumn(input.percentageText, "IDR")
		created.Set("percentage", percentageEcho.Decimal())
		created.Set("amount", amount.Decimal())
		created.Set("trigger_description", nullableString(input.trigger))
		created.Set("status", status)
		created.Set("milestone_id", nullableInt64(input.milestoneID))
		created.Set("notes", nullableString(input.notes))
		created.Set("role_type", effectiveRole)
		created.Set("recipient_id", nullableInt64(recipientID))
		created.Set("project_id", projectID)
		created.Set("retention_amount", split.Retention.Decimal())
		created.Set("net_amount", split.Net.Decimal())
		created.Set("updated_at", projectTimeValue(time.Now().UTC()))
		created.Set("created_at", projectTimeValue(time.Now().UTC()))
		created.Set("id", createdID)

		milestone, err := nullableMilestone(ctx, pool, input.milestoneID)
		if err != nil {
			slog.Error("termin-store: milestone", "error", err)
			serverError(w)
			return
		}
		created.Set("milestone", milestone)

		payload := jsonphp.NewObject()
		payload.Set("data", created)

		writeJSON(w, http.StatusCreated, payload)
	}
}

// terminInput is one validated payment stage.
type terminInput struct {
	label          string
	percentageText string
	percentage     float64
	amountText     string
	status         string
	trigger        *string
	milestoneID    *int64
	notes          *string
	roleType       string
}

// validateTermin enforces the store rules in declaration order: label,
// percentage, amount, trigger_description, status, milestone_id, notes,
// role_type.
func validateTermin(fields map[string]any, failures *errorBag) (terminInput, bool) {
	var input terminInput
	ok := true

	if raw, present := fields["label"]; !present || raw == nil {
		failures.add("label", requiredMsg(attrName("label")))
		ok = false
	} else if s, isStr := raw.(string); !isStr {
		failures.add("label", "The label field must be a string.")
		ok = false
	} else if s == "" {
		failures.add("label", requiredMsg(attrName("label")))
		ok = false
	} else if len(s) > 255 {
		failures.add("label", "The label field must not be greater than 255 characters.")
		ok = false
	} else {
		input.label = s
	}

	if raw, present := fields["percentage"]; !present || raw == nil {
		failures.add("percentage", requiredMsg(attrName("percentage")))
		ok = false
	} else if text, present := numericTextOf(raw); !present || text == "" {
		failures.add("percentage", "The percentage field must be a number.")
		ok = false
	} else if !isNumericText(text) {
		failures.add("percentage", "The percentage field must be a number.")
		ok = false
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("percentage", "The percentage field must be a number.")
		ok = false
	} else {
		input.percentageText, input.percentage = text, parsed
		if parsed < 0 {
			failures.add("percentage", "The percentage field must be at least 0.")
			ok = false
		}
		if parsed > 100 {
			failures.add("percentage", "The percentage field must not be greater than 100.")
			ok = false
		}
	}

	if raw, present := fields["amount"]; !present || raw == nil {
		failures.add("amount", requiredMsg(attrName("amount")))
		ok = false
	} else if text, present := numericTextOf(raw); !present || text == "" {
		failures.add("amount", "The amount field must be an integer.")
		ok = false
	} else if !isNumericText(text) {
		failures.add("amount", "The amount field must be an integer.")
		ok = false
	} else if !isIntegerText(text) {
		failures.add("amount", "The amount field must be an integer.")
		ok = false
	} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
		failures.add("amount", "The amount field must be an integer.")
		ok = false
	} else {
		input.amountText = strings.TrimSpace(text)
		_ = parsed
		if parsed < 0 {
			failures.add("amount", "The amount field must be at least 0.")
			ok = false
		}
		if parsed > 99999999999999 {
			failures.add("amount", "The amount field must not be greater than 99999999999999.")
			ok = false
		}
	}

	if raw, present := fields["trigger_description"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("trigger_description", "The trigger description field must be a string.")
			ok = false
		} else if len(s) > 255 {
			failures.add("trigger_description", "The trigger description field must not be greater than 255 characters.")
			ok = false
		} else {
			dup := s
			input.trigger = &dup
		}
	}

	if raw, present := fields["status"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("status", "The status field must be a string.")
			failures.add("status", "The selected status is invalid.")
			ok = false
		} else if s != "locked" && s != "pending" && s != "invoice_sent" {
			failures.add("status", "The selected status is invalid.")
			ok = false
		} else {
			input.status = s
		}
	}

	if raw, present := fields["milestone_id"]; present && raw != nil {
		if text, present := numericTextOf(raw); !present || text == "" {
			failures.add("milestone_id", "The selected work phase does not belong to this project.")
			ok = false
		} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
			failures.add("milestone_id", "The selected work phase does not belong to this project.")
			ok = false
		} else {
			dup := parsed
			input.milestoneID = &dup
		}
	}

	if raw, present := fields["notes"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("notes", "The notes field must be a string.")
			ok = false
		} else if len(s) > 1000 {
			failures.add("notes", "The notes field must not be greater than 1000 characters.")
			ok = false
		} else {
			dup := s
			input.notes = &dup
		}
	}

	if raw, present := fields["role_type"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("role_type", "The role type field must be a string.")
			ok = false
		} else {
			input.roleType = s
		}
	}

	return input, ok
}

// terminPlannedTotal sums the non-void stages for a role.
func terminPlannedTotal(ctx context.Context, pool *pgxpool.Pool, projectID int64, role string) (money.Money, error) {
	var total *string
	if err := pool.QueryRow(ctx, `SELECT COALESCE(SUM(amount), 0)::text FROM project_payment_termins WHERE project_id = $1 AND role_type = $2 AND status::text <> 'void'`,
		projectID, role).Scan(&total); err != nil {
		return money.Money{}, err
	}

	text := "0"
	if total != nil {
		text = *total
	}

	return money.FromColumn(text, "IDR")
}

// insertActivityLogPool writes an activity row outside a transaction.
func insertActivityLogPool(ctx context.Context, pool *pgxpool.Pool, projectID, userID int64, action, details string) error {
	_, err := pool.Exec(ctx, `INSERT INTO project_activity_logs (project_id, user_id, action, details, created_at, updated_at) VALUES ($1, $2, $3, $4, date_trunc('second', now()), date_trunc('second', now()))`,
		projectID, userID, action, details)
	return err
}
