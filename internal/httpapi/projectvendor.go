package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// IMPORT EXTERNAL VENDOR — an owner/PM assigns a phase to an outside
// professional. The agreed fee is committed to the escrow through the same
// ledger funnel every payment uses (deductBudget): the ceiling decreases, a
// transaction row records WHO moved it and against which vendor, and an
// unaffordable fee rolls the whole import back with a 422.

// vendorAgreedFee reads `agreed_fee`, defaulting to zero.
func vendorAgreedFee(fields map[string]any, failures *errorBag) string {
	raw, present := fields["agreed_fee"]
	if !present || raw == nil {
		return "0"
	}
	text, ok := numericTextOf(raw)
	if !ok || !isNumericText(text) {
		failures.add("agreed_fee", "The agreed fee field must be a number.")
		return "0"
	}
	minor, ok := numericMinor(strings.TrimSpace(text))
	if !ok {
		failures.add("agreed_fee", "The agreed fee field must be a number.")
		return "0"
	}
	if minor < 0 {
		failures.add("agreed_fee", "The agreed fee field must be at least 0.")
		return "0"
	}
	return text
}

// ImportExternalVendorHandler serves
// `POST /api/projects/{project}/import-external-vendor`.
func ImportExternalVendorHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("import-vendor: project", "error", err)
			serverError(w)
			return
		}

		body, _, ferr := requestFields(r)
		if ferr != nil {
			body = map[string]any{}
		}
		failures := &errorBag{}

		phaseRole := ""
		if raw, present := body["phase_role"]; !present || raw == nil {
			failures.add("phase_role", "The phase role field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("phase_role", "The selected phase role is invalid.")
		} else {
			valid := false
			for _, role := range []string{"arsitek", "kontraktor", "notaris", "interior", "project_manager", "structural", "mep"} {
				if text == role {
					valid = true
					break
				}
			}
			if !valid {
				failures.add("phase_role", "The selected phase role is invalid.")
			} else {
				phaseRole = text
			}
		}

		var teamMemberID *int64
		if raw, present := body["team_member_id"]; present && raw != nil {
			text, ok := numericTextOf(raw)
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if !ok || err != nil {
				failures.add("team_member_id", "The team member id field must be an integer.")
			} else if !existsID(ctx, pool, "team_members", parsed) {
				failures.add("team_member_id", "The selected team member id is invalid.")
			} else {
				teamMemberID = &parsed
			}
		}

		var companyName any
		if raw, present := body["company_name"]; present && raw != nil {
			if text, ok := raw.(string); !ok {
				failures.add("company_name", "The company name field must be a string.")
			} else if len([]rune(text)) > 255 {
				failures.add("company_name", "The company name field must not be greater than 255 characters.")
			} else {
				companyName = text
			}
		}

		contactPerson := ""
		if raw, present := body["contact_person"]; !present || raw == nil || (func() bool {
			text, ok := raw.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			failures.add("contact_person", "The contact person field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("contact_person", "The contact person field must be a string.")
		} else if len([]rune(text)) > 255 {
			failures.add("contact_person", "The contact person field must not be greater than 255 characters.")
		} else {
			contactPerson = text
		}

		phoneNumber := ""
		if raw, present := body["phone_number"]; !present || raw == nil || (func() bool {
			text, ok := raw.(string)
			return ok && strings.TrimSpace(text) == ""
		}()) {
			failures.add("phone_number", "The phone number field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("phone_number", "The phone number field must be a string.")
		} else if len([]rune(text)) > 20 {
			failures.add("phone_number", "The phone number field must not be greater than 20 characters.")
		} else {
			phoneNumber = text
		}

		var email any
		if raw, present := body["email"]; present && raw != nil {
			if text, ok := raw.(string); !ok {
				failures.add("email", "The email field must be a string.")
			} else if len([]rune(text)) > 255 {
				failures.add("email", "The email field must not be greater than 255 characters.")
			} else if !validEmail(text) {
				failures.add("email", "The email field must be a valid email address.")
			} else {
				email = text
			}
		}

		agreedFee := vendorAgreedFee(body, failures)

		var notes any
		if raw, present := body["notes"]; present && raw != nil {
			if text, ok := raw.(string); !ok {
				failures.add("notes", "The notes field must be a string.")
			} else {
				notes = text
			}
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("import-vendor: viewer", "error", err)
			serverError(w)
			return
		}
		ownerID := projectInt(values, fields, "user_id")
		if ownerID != viewer.id && !verifyAssignedPM(viewer, projectIntPtr(values, fields, "pm_id")) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		feeMinor, ok := parseMinor(strings.TrimSpace(agreedFee))
		if !ok {
			serverError(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("import-vendor: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		var vendorID int64
		var createdAt, updatedAt any
		if err := tx.QueryRow(ctx, `INSERT INTO project_external_vendors
			(project_id, team_member_id, phase_role, company_name, contact_person, phone_number, email, agreed_fee, notes, created_at, updated_at)
			VALUES ($1, $2, $3::phase_role, $4, $5, $6, $7, $8::numeric, $9,
			 date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			projectID, teamMemberID, phaseRole, companyName, contactPerson, phoneNumber, email,
			agreedFee, notes).Scan(&vendorID, &createdAt, &updatedAt); err != nil {
			slog.Error("import-vendor: insert", "error", err)
			serverError(w)
			return
		}

		if feeMinor > 0 {
			// Structural freeze: same rule as budget/transactions — lowering
			// the ceiling while a dispute is open is blocked.
			var openID int64
			var openTitle string
			if err := tx.QueryRow(ctx, `SELECT id, title FROM project_disputes WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).Scan(&openID, &openTitle); err == nil {
				message(w, http.StatusUnprocessableEntity, "Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
				return
			}
			var lockedBudget string
			if err := tx.QueryRow(ctx, `SELECT budget::text FROM projects WHERE id = $1 FOR UPDATE`,
				projectID).Scan(&lockedBudget); err != nil {
				slog.Error("import-vendor: lock", "error", err)
				serverError(w)
				return
			}
			budgetMinor, _ := parseMinor(lockedBudget)
			paid, err := paidTotalMinor(ctx, tx, projectID)
			if err != nil {
				slog.Error("import-vendor: paid", "error", err)
				serverError(w)
				return
			}
			if budgetMinor-paid < feeMinor {
				message(w, http.StatusUnprocessableEntity,
					"Insufficient project budget to allocate the agreed fee of Rp "+phpNumberFormat(agreedFee)+
						" to "+contactPerson+". Reduce the fee, or raise the project budget first.")
				return
			}

			if _, err := tx.Exec(ctx, `UPDATE projects SET budget = $2::numeric,
				updated_at = date_trunc('second', now()) WHERE id = $1`,
				projectID, formatMinor(budgetMinor-feeMinor)); err != nil {
				slog.Error("import-vendor: budget", "error", err)
				serverError(w)
				return
			}

			title := "External " + ucfirstASCII(phaseRole) + " Fee Allocation: " + contactPerson
			if _, err := tx.Exec(ctx, `INSERT INTO project_budget_transactions
				(project_id, transaction_type, amount, title, reference_model, reference_id,
				 transaction_date, actor_user_id, actor_role, created_at, updated_at)
				VALUES ($1, 'adjustment_down', $2::numeric, $3, 'App\Models\ProjectExternalVendor', $4,
				 date_trunc('second', now()), $5, $6, date_trunc('second', now()), date_trunc('second', now()))`,
				projectID, formatMinor(feeMinor), title, vendorID, viewer.id, viewer.role); err != nil {
				slog.Error("import-vendor: ledger", "error", err)
				serverError(w)
				return
			}
		}

		source := "external partner"
		if teamMemberID != nil {
			source = "internal team"
		}
		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "external_vendor_imported",
			"Externally handled "+phaseRole+" phase assigned to "+contactPerson+" (imported from "+source+")."); err != nil {
			slog.Error("import-vendor: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("import-vendor: commit", "error", err)
			serverError(w)
			return
		}

		vendor := jsonphp.NewObject()
		vendor.Set("project_id", projectID)
		vendor.Set("team_member_id", nullableInt64(teamMemberID))
		vendor.Set("phase_role", phaseRole)
		vendor.Set("company_name", companyName)
		vendor.Set("contact_person", contactPerson)
		vendor.Set("phone_number", phoneNumber)
		vendor.Set("email", email)
		// `agreed_fee` is a decimal:2 cast: read the stored scale back.
		var feeText *string
		_ = pool.QueryRow(ctx, `SELECT agreed_fee::text FROM project_external_vendors WHERE id = $1`, vendorID).Scan(&feeText)
		vendor.Set("agreed_fee", nullableString(feeText))
		vendor.Set("notes", notes)
		vendor.Set("updated_at", projectTimeValue(updatedAt))
		vendor.Set("created_at", projectTimeValue(createdAt))
		vendor.Set("id", vendorID)

		freshFields, freshValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("import-vendor: fresh", "error", err)
			serverError(w)
			return
		}
		projectEntry, err := projectResource(ctx, pool, freshFields, freshValues, viewer,
			projectLoad{budgetSummary: true}, nil, nil)
		if err != nil {
			slog.Error("import-vendor: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "External professional imported successfully.")
		payload.Set("vendor", vendor)
		payload.Set("project", projectEntry)
		writeJSON(w, http.StatusOK, payload)
	}
}
