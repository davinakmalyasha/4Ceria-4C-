package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WARRANTY CLAIMS — defects raised after handover, inside the warranty window.
//
//   - GET warranty-claims: any participant. Rows in table order with the
//     FULL reporter user model.
//   - POST warranty-claims: participants only, and ONLY while the warranty
//     is running — no `warranty_end_at` answers "The warranty period has
//     not started yet…", a passed end date names the day. Up to five images
//     go to `projects/{id}/warranty`; the hired contractor's user is told.
//   - PUT warranty-claims/{claim}/status: the hired contractor or the owner.
//     `cost_impact` is owner-only when positive — the oracle's guard was
//     `$validated['cost_impact'] ?? null > 0 && !$isOwner`, where `??` binds
//     LOOSER than `&&`, so the expression was truthy for every numeric value
//     and even the owner was refused; fixed to compare the number.
//
// The store answer is Eloquent's CREATED model (relation-create order);
// the status answer is the updated row in table order (no reporter).

// warrantyColumns is the table order.
var warrantyColumns = []string{
	"id", "project_id", "reporter_id", "title", "description", "images",
	"status", "cost_impact", "resolved_at", "created_at", "updated_at",
}

// warrantyObject renders a loaded claim in table order.
func warrantyObject(ctx context.Context, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range warrantyColumns {
		switch column {
		case "images":
			// The claim model has NO toArray override: paths stay raw.
			entry.Set(column, eloquentJSONValue(byName[column]))
		case "cost_impact":
			entry.Set(column, projectDecimalValue(byName[column]))
		case "resolved_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	return entry
}

// warrantyCreatedObject renders the CREATED claim.
func warrantyCreatedObject(ctx context.Context, byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	entry.Set("reporter_id", projectRawValue(byName["reporter_id"]))
	entry.Set("title", projectRawValue(byName["title"]))
	entry.Set("description", projectRawValue(byName["description"]))
	entry.Set("images", eloquentJSONValue(byName["images"]))
	entry.Set("status", projectRawValue(byName["status"]))
	entry.Set("project_id", projectRawValue(byName["project_id"]))
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// insertNotificationPool writes a notifications row outside a transaction.
func insertNotificationPool(ctx context.Context, pool *pgxpool.Pool, userID int64, kind, title, body, data string) error {
	_, err := pool.Exec(ctx, `INSERT INTO notifications (user_id, type, title, body, data, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, date_trunc('second', now()), date_trunc('second', now()))`,
		userID, kind, title, body, data)
	return err
}

// warrantyRow reads one claim by id.
func warrantyRow(ctx context.Context, pool *pgxpool.Pool, claimID int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(warrantyColumns, ", ")+`
		FROM project_warranty_claims WHERE id = $1`, claimID)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, false, rows.Err()
	}
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return nil, false, err
	}
	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}
	return byName, true, rows.Err()
}

// WarrantyClaimsIndexHandler serves
// `GET /api/projects/{project}/warranty-claims`.
func WarrantyClaimsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
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
			slog.Error("warranty: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("warranty: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(warrantyColumns, ", ")+`
			FROM project_warranty_claims WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			slog.Error("warranty: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("warranty: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry := warrantyObject(ctx, byName)
			reporter := intPtrDeref(byName["reporter_id"])
			if reporter != 0 {
				user, err := fullProfileUser(ctx, pool, reporter, false)
				if err != nil {
					user = nil
				}
				entry.Set("reporter", user)
			} else {
				entry.Set("reporter", nil)
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("warranty: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreWarrantyClaimHandler serves
// `POST /api/projects/{project}/warranty-claims`.
func StoreWarrantyClaimHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
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
			slog.Error("warranty-store: viewer", "error", err)
			serverError(w)
			return
		}
		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("warranty-store: subject", "error", err)
			serverError(w)
			return
		}
		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("warranty-store: parties", "error", err)
			serverError(w)
			return
		}
		if !isParticipant(parties, subject) {
			message(w, http.StatusForbidden, "Unauthorized. Only project participants can file warranty claims.")
			return
		}

		projectFields, projectValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("warranty-store: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(projectFields, projectValues)
		projectTitle, _ := project["title"].(string)

		var warrantyEnd *time.Time
		if value, ok := project["warranty_end_at"].(time.Time); ok {
			warrantyEnd = &value
		}
		if warrantyEnd == nil {
			message(w, http.StatusUnprocessableEntity, "The warranty period has not started yet. Claims can be filed after project handover.")
			return
		}
		if time.Now().After(*warrantyEnd) {
			message(w, http.StatusUnprocessableEntity, "The warranty period ended on "+warrantyEnd.UTC().Format("02 Jan 2006")+".")
			return
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(64 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		title, description, images := validateWarrantyStore(formFields, r, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		stored := []any{}
		for _, upload := range images {
			path, err := storeVaultFile("projects/"+strconv.FormatInt(projectID, 10)+"/warranty", upload.filename, upload.data)
			if err != nil {
				slog.Error("warranty-store: image", "error", err)
				serverError(w)
				return
			}
			stored = append(stored, path)
		}
		encoded, err := jsonphp.Marshal(stored)
		if err != nil {
			serverError(w)
			return
		}

		var claimID int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO project_warranty_claims
			(project_id, reporter_id, title, description, images, status, cost_impact, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5::jsonb, 'open', 0, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			projectID, viewer.id, title, description, string(encoded)).Scan(&claimID, &createdAt, &updatedAt); err != nil {
			slog.Error("warranty-store: insert", "error", err)
			serverError(w)
			return
		}

		// Tell the responsible contractor.
		var contractorProfile *int64
		if id, ok := project["selected_kontraktor_id"].(int64); ok {
			contractorProfile = &id
		}
		if contractorProfile != nil && *contractorProfile != 0 {
			var contractorUser *int64
			_ = pool.QueryRow(ctx, `SELECT user_id FROM kontraktors WHERE id = $1`, *contractorProfile).Scan(&contractorUser)
			if contractorUser != nil && *contractorUser != 0 && *contractorUser != viewer.id {
				var reporterName string
				_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, viewer.id).Scan(&reporterName)
				data := `{"project_id": ` + strconv.FormatInt(projectID, 10) + `, "claim_id": ` + strconv.FormatInt(claimID, 10) + `}`
				if err := insertNotificationPool(ctx, pool, *contractorUser, "warranty_claim", "New Warranty Claim",
					reporterName+" filed \""+title+"\" on project \""+projectTitle+"\".", data); err != nil {
					slog.Error("warranty-store: notify", "error", err)
				}
			}
		}

		claim := map[string]any{
			"id": claimID, "project_id": projectID, "reporter_id": viewer.id,
			"title": title, "description": description, "images": stored,
			"status": "open", "created_at": createdAt, "updated_at": updatedAt,
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Warranty claim filed")
		payload.Set("data", warrantyCreatedObject(ctx, claim))
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateWarrantyStore enforces title/description/images.
func validateWarrantyStore(fields map[string]any, r *http.Request, failures *errorBag) (string, string, []*galleryUpload) {
	title := ""
	if raw, present := fields["title"]; !present || raw == nil {
		failures.add("title", "The title field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("title", "The title field must be a string.")
	} else if s == "" {
		failures.add("title", "The title field is required.")
	} else if len([]rune(s)) > 255 {
		failures.add("title", "The title field must not be greater than 255 characters.")
	} else {
		title = s
	}

	description := ""
	if raw, present := fields["description"]; !present || raw == nil {
		failures.add("description", "The description field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("description", "The description field must be a string.")
	} else if s == "" {
		failures.add("description", "The description field is required.")
	} else {
		description = s
	}

	images := requestFilesNamed(r, "images")
	if len(images) > 5 {
		failures.add("images", "The images field must not have more than 5 items.")
	}
	for i, upload := range images {
		key := "images." + strconv.Itoa(i)
		if !upload.isImage {
			failures.add(key, "The "+key+" field must be an image.")
			continue
		}
		if !snagImageExt(upload.ext) {
			failures.add(key, "The "+key+" field must be a file of type: jpeg, png, jpg, gif, webp.")
			continue
		}
		if upload.sizeBytes() > 5120*1024 {
			failures.add(key, "The "+key+" field must not be greater than 5120 kilobytes.")
		}
	}

	return title, description, images
}

// UpdateWarrantyClaimHandler serves
// `PUT /api/projects/{project}/warranty-claims/{claim}/status`.
func UpdateWarrantyClaimHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("claim")
		if rawID == "" {
			rawID = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/status"))
		}
		claimID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectWarrantyClaim`, rawID)
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
			slog.Error("warranty-update: viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := warrantyRow(ctx, pool, claimID)
		if err != nil {
			slog.Error("warranty-update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProjectWarrantyClaim`, rawID)
			return
		}
		if rowProject, _ := byName["project_id"].(int64); rowProject != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		projectFields, projectValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			serverError(w)
			return
		}
		project := projectColumnsByName(projectFields, projectValues)
		ownerID, _ := project["user_id"].(int64)

		isOwner := viewer.id == ownerID
		isContractor := false
		if viewer.role == "kontraktor" {
			subject, serr := loadSubject(ctx, pool, viewer.id)
			parties, perr := loadProjectParties(ctx, pool, projectID)
			if serr == nil && perr == nil && authzMatchesRole(parties, subject, "kontraktor") {
				isContractor = true
			}
		}
		if !isContractor && !isOwner {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}

		failures := &errorBag{}
		status, costText, costSet := validateWarrantyStatus(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		sets := []string{"status = $2", "updated_at = date_trunc('second', now())"}
		args := []any{claimID, status}
		if costSet {
			costMinor := mustMinor(costText)
			if costMinor > 0 && !isOwner {
				message(w, http.StatusForbidden, "Only the project owner can set a cost impact.")
				return
			}
			args = append(args, formatMinor(costMinor))
			sets = append(sets, "cost_impact = $"+strconv.Itoa(len(args))+"::numeric")
		}
		if status == "resolved" {
			sets = append(sets, "resolved_at = date_trunc('second', now())")
		}

		if _, err := pool.Exec(ctx, `UPDATE project_warranty_claims SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("warranty-update: exec", "error", err)
			serverError(w)
			return
		}

		fresh, _, err := warrantyRow(ctx, pool, claimID)
		if err != nil {
			slog.Error("warranty-update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Claim status updated")
		payload.Set("data", warrantyObject(ctx, fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateWarrantyStatus enforces status in fixing,resolved,closed and
// cost_impact nullable|numeric|min:0.
func validateWarrantyStatus(fields map[string]any, failures *errorBag) (string, string, bool) {
	status := ""
	if raw, present := fields["status"]; !present || raw == nil {
		failures.add("status", "The status field is required.")
	} else if s, ok := raw.(string); !ok {
		failures.add("status", "The selected status is invalid.")
	} else if s != "fixing" && s != "resolved" && s != "closed" {
		failures.add("status", "The selected status is invalid.")
	} else {
		status = s
	}

	costText := "0"
	costSet := false
	if raw, present := fields["cost_impact"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isNumericText(text) {
			if parsed, err := strconv.ParseFloat(text, 64); err == nil {
				if parsed < 0 {
					failures.add("cost_impact", "The cost impact field must be at least 0.")
				} else {
					costText = strings.TrimSpace(text)
					costSet = true
				}
			} else {
				failures.add("cost_impact", "The cost impact field must be a number.")
			}
		} else {
			failures.add("cost_impact", "The cost impact field must be a number.")
		}
	}

	return status, costText, costSet
}
