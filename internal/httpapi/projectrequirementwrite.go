package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// REQUIREMENT UPDATE + DELETE — PUT/DELETE
// /api/projects/{project}/requirements/{requirement}.
//
// Both bind the requirement to the project first (a requirement of
// another project 404s with the plain 'Not found.'), then gate on the
// hire rule. Update validates the same rules as store but NULLABLE, and
// answers the row with its requester — table column order, image_url,
// user, and notably WITHOUT the folder key, exactly like the store 201
// minus the create ordering. Delete cascades the histories and the
// procurement requests, logs the removal, and answers Deleted.
//
// HISTORY QUIRKS — read before touching the two history blocks. Both
// conditions are shaped `A && B ?? C != D`, and in PHP `&&` binds
// TIGHTER than `??`, so they parse as `(A && B) ?? (C != D)`:
//   - folder: `(present && newID) ?? ...` — an explicit null (or 0)
//     makes the left side falsy-but-not-null, and `false ?? x` is
//     `false`. So unassigning NEVER logs; setting any non-zero id
//     ALWAYS logs, even the same value ("Folder A" to "Folder A").
//   - bom: same shape — any present non-empty value logs, even the same
//     one, and the new name is computed as `(value ?? (null==='raw'))`
//     which is the truthy value itself, so it is ALWAYS 'Bahan Baku'.
// The port replicates both byte-for-byte, including the wrong names.

// UpdateRequirementHandler serves
// `PUT /api/projects/{project}/requirements/{requirement}`.
func UpdateRequirementHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		rawReq := r.PathValue("requirement")
		if rawReq == "" {
			rawReq = lastPathSegment(r.URL.Path)
		}

		requirementID, err := strconv.ParseInt(rawReq, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\ProjectRequirement`, rawReq)
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
			slog.Error("requirement-update: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("requirement-update: project", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)

		row, err := loadRequirement(ctx, pool, requirementID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectRequirement`, rawReq)
				return
			}
			slog.Error("requirement-update: load", "error", err)
			serverError(w)
			return
		}

		if projectOf(row) != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		allowed, err := requirementGate(ctx, pool, viewer, projectID, ownerID)
		if err != nil {
			slog.Error("requirement-update: gate", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		formFields, formFiles, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}
		input := validateRequirementUpdate(formFields, formFiles, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if input.folderIDSet && input.folderID != nil {
			var exists bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_material_folders WHERE id = $1)`, *input.folderID).Scan(&exists); err != nil {
				slog.Error("requirement-update: folder", "error", err)
				serverError(w)
				return
			}
			if !exists {
				failures.add("folder_id", "The selected folder id is invalid.")
				failures.write(w)
				return
			}
		}

		imagePath := ""
		imageSet := false
		if input.image != nil {
			contents, err := readUploadedFile(r, "image")
			if err != nil {
				slog.Error("requirement-update: image", "error", err)
				serverError(w)
				return
			}
			input.image.data = contents

			stored, err := storeVaultFile("requirements", input.image.filename, input.image.data)
			if err != nil {
				slog.Error("requirement-update: image", "error", err)
				serverError(w)
				return
			}
			imagePath, imageSet = stored, true
		}

		oldFolderID := intPtrOf(row.byName["folder_id"])
		oldBomType, _ := row.byName["bom_type"].(string)

		setClause, args := requirementUpdateSets(input, imagePath, imageSet)
		if len(setClause) > 0 {
			query := `UPDATE project_requirements SET ` + strings.Join(setClause, ", ") + `, updated_at = date_trunc('second', now()) WHERE id = $` + strconv.Itoa(len(args)+1)
			args = append(args, requirementID)
			if _, err := pool.Exec(ctx, query, args...); err != nil {
				slog.Error("requirement-update: update", "error", err)
				serverError(w)
				return
			}
		}

		// Folder-move history: fires only for a non-zero new id, even
		// when it equals the old one; explicit null never fires.
		if input.folderIDSet && input.folderID != nil && *input.folderID != 0 {
			oldName := "Unassigned"
			if oldFolderID != nil && *oldFolderID != 0 {
				oldName = folderNameOrDeleted(ctx, pool, *oldFolderID)
			}
			newName := folderNameOrDeleted(ctx, pool, *input.folderID)
			if _, err := pool.Exec(ctx, `INSERT INTO project_requirement_histories (project_requirement_id, user_id, type, quantity, notes, created_at, updated_at) VALUES ($1, $2, 'restock', 0, $3, date_trunc('second', now()), date_trunc('second', now()))`,
				requirementID, viewer.id, "Moved from '"+oldName+"' to '"+newName+"'"); err != nil {
				slog.Error("requirement-update: folder history", "error", err)
				serverError(w)
				return
			}
		}

		// Tab-move history: fires for any present non-empty bom_type,
		// even the same value; the new name is always 'Bahan Baku'.
		if input.bomTypeSet && input.bomType != nil && *input.bomType != "" {
			oldName := "Bahan Finishing"
			if oldBomType == "raw" {
				oldName = "Bahan Baku"
			}
			if _, err := pool.Exec(ctx, `INSERT INTO project_requirement_histories (project_requirement_id, user_id, type, quantity, notes, created_at, updated_at) VALUES ($1, $2, 'restock', 0, $3, date_trunc('second', now()), date_trunc('second', now()))`,
				requirementID, viewer.id, "Moved from '"+oldName+"' to 'Bahan Baku'"); err != nil {
				slog.Error("requirement-update: bom history", "error", err)
				serverError(w)
				return
			}
		}

		refreshed, err := loadRequirement(ctx, pool, requirementID)
		if err != nil {
			slog.Error("requirement-update: reload", "error", err)
			serverError(w)
			return
		}

		entry, err := requirementObject(ctx, pool, refreshed, false)
		if err != nil {
			slog.Error("requirement-update: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// DeleteRequirementHandler serves
// `DELETE /api/projects/{project}/requirements/{requirement}`.
func DeleteRequirementHandler(pool *pgxpool.Pool) http.HandlerFunc {
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

		rawReq := r.PathValue("requirement")
		if rawReq == "" {
			rawReq = lastPathSegment(r.URL.Path)
		}

		requirementID, err := strconv.ParseInt(rawReq, 10, 64)
		if err != nil {
			modelNotFound(w, `App\Models\ProjectRequirement`, rawReq)
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
			slog.Error("requirement-delete: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, rawProject)
				return
			}
			slog.Error("requirement-delete: project", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)

		row, err := loadRequirement(ctx, pool, requirementID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\ProjectRequirement`, rawReq)
				return
			}
			slog.Error("requirement-delete: load", "error", err)
			serverError(w)
			return
		}

		if projectOf(row) != projectID {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		allowed, err := requirementGate(ctx, pool, viewer, projectID, ownerID)
		if err != nil {
			slog.Error("requirement-delete: gate", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		name, _ := row.byName["name"].(string)

		if _, err := pool.Exec(ctx, `DELETE FROM project_requirement_histories WHERE project_requirement_id = $1`, requirementID); err != nil {
			slog.Error("requirement-delete: histories", "error", err)
			serverError(w)
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM project_procurement_requests WHERE requirement_id = $1`, requirementID); err != nil {
			slog.Error("requirement-delete: procurement", "error", err)
			serverError(w)
			return
		}

		if _, err := pool.Exec(ctx, `DELETE FROM project_requirements WHERE id = $1`, requirementID); err != nil {
			slog.Error("requirement-delete: delete", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "requirement_deleted", "Removed material: "+name); err != nil {
			slog.Error("requirement-delete: log", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Deleted")
	}
}

// requirementUpdate is one validated update: every field records
// presence separately, because an explicit null SETs the column while
// an absent key leaves it alone.
type requirementUpdate struct {
	nameSet, quantitySet, unitSet, bomTypeSet bool
	qualitySet, categorySet, estimatedSet     bool
	notesSet, purposeSet, folderIDSet         bool
	name, unit                                *string
	quantityText                              *string
	bomType, quality, category                *string
	estimatedText                             *string
	notes, purpose                            *string
	folderID                                  *int64
	image                                     *uploadedImage
}

// validateRequirementUpdate enforces the update rules in declaration
// order: name, quantity_required, unit, bom_type, quality_level,
// category, estimated_unit_cost, notes, purpose, image, folder_id —
// all nullable, so only present keys validate.
func validateRequirementUpdate(fields map[string]any, files map[string]*uploadedFile, failures *errorBag) requirementUpdate {
	var input requirementUpdate

	if raw, present := fields["name"]; present {
		input.nameSet = true
		if raw == nil {
			input.name = nil
		} else if s, isStr := raw.(string); !isStr {
			failures.add("name", "The name field must be a string.")
		} else if len(s) > 255 {
			failures.add("name", "The name field must not be greater than 255 characters.")
		} else {
			dup := s
			input.name = &dup
		}
	}

	if raw, present := fields["quantity_required"]; present {
		input.quantitySet = true
		if raw == nil {
			input.quantityText = nil
		} else if text, present := numericTextOf(raw); !present || text == "" {
			failures.add("quantity_required", "The quantity required field must be a number.")
		} else if !isNumericText(text) {
			failures.add("quantity_required", "The quantity required field must be a number.")
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add("quantity_required", "The quantity required field must be a number.")
		} else {
			dup := text
			input.quantityText = &dup
			if parsed < 0 {
				failures.add("quantity_required", "The quantity required field must be at least 0.")
			}
		}
	}

	if raw, present := fields["unit"]; present {
		input.unitSet = true
		if raw == nil {
			input.unit = nil
		} else if s, isStr := raw.(string); !isStr {
			failures.add("unit", "The unit field must be a string.")
		} else if len(s) > 50 {
			failures.add("unit", "The unit field must not be greater than 50 characters.")
		} else {
			dup := s
			input.unit = &dup
		}
	}

	if raw, present := fields["bom_type"]; present {
		input.bomTypeSet = true
		if raw == nil {
			input.bomType = nil
		} else if s, isStr := raw.(string); !isStr {
			failures.add("bom_type", "The bom type field must be a string.")
			failures.add("bom_type", "The selected bom type is invalid.")
		} else if s != "raw" && s != "finishing" {
			failures.add("bom_type", "The selected bom type is invalid.")
		} else {
			dup := s
			input.bomType = &dup
		}
	}

	if raw, present := fields["quality_level"]; present {
		input.qualitySet = true
		if raw == nil {
			input.quality = nil
		} else if s, isStr := raw.(string); !isStr {
			failures.add("quality_level", "The quality level field must be a string.")
			failures.add("quality_level", "The selected quality level is invalid.")
		} else if s != "standard" && s != "premium" && s != "luxury" {
			failures.add("quality_level", "The selected quality level is invalid.")
		} else {
			dup := s
			input.quality = &dup
		}
	}

	if raw, present := fields["category"]; present {
		input.categorySet = true
		if raw == nil {
			input.category = nil
		} else if s, isStr := raw.(string); !isStr {
			failures.add("category", "The category field must be a string.")
			failures.add("category", "The selected category is invalid.")
		} else if s != "structural" && s != "architecture" && s != "mep" && s != "interior" && s != "general" {
			failures.add("category", "The selected category is invalid.")
		} else {
			dup := s
			input.category = &dup
		}
	}

	if raw, present := fields["estimated_unit_cost"]; present {
		input.estimatedSet = true
		if raw == nil {
			input.estimatedText = nil
		} else if text, present := numericTextOf(raw); !present || text == "" {
			failures.add("estimated_unit_cost", "The estimated unit cost field must be a number.")
		} else if !isNumericText(text) {
			failures.add("estimated_unit_cost", "The estimated unit cost field must be a number.")
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add("estimated_unit_cost", "The estimated unit cost field must be a number.")
		} else {
			dup := text
			input.estimatedText = &dup
			if parsed < 0 {
				failures.add("estimated_unit_cost", "The estimated unit cost field must be at least 0.")
			}
		}
	}

	if raw, present := fields["notes"]; present {
		input.notesSet = true
		if raw == nil {
			input.notes = nil
		} else if s, isStr := raw.(string); !isStr {
			failures.add("notes", "The notes field must be a string.")
		} else {
			dup := s
			input.notes = &dup
		}
	}

	if raw, present := fields["purpose"]; present {
		input.purposeSet = true
		if raw == nil {
			input.purpose = nil
		} else if s, isStr := raw.(string); !isStr {
			failures.add("purpose", "The purpose field must be a string.")
		} else {
			dup := s
			input.purpose = &dup
		}
	}

	var dummy requirementInput
	dummyOK := true
	validateRequirementImage(files["image"], failures, &dummy, &dummyOK)
	if dummy.image != nil {
		input.image = dummy.image
	}

	if raw, present := fields["folder_id"]; present {
		input.folderIDSet = true
		if raw == nil {
			input.folderID = nil
		} else if text, present := numericTextOf(raw); !present || text == "" {
			failures.add("folder_id", "The selected folder id is invalid.")
		} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
			failures.add("folder_id", "The selected folder id is invalid.")
		} else {
			dup := parsed
			input.folderID = &dup
		}
	}

	return input
}

// requirementUpdateSets builds the SET clause from present keys only —
// an explicit null writes NULL, an absent key is untouched.
func requirementUpdateSets(input requirementUpdate, imagePath string, imageSet bool) ([]string, []any) {
	sets := []string{}
	args := []any{}

	bind := func(column string, value any) {
		args = append(args, value)
		sets = append(sets, column+" = $"+strconv.Itoa(len(args)))
	}

	if input.nameSet {
		bind("name", input.name)
	}
	if input.quantitySet {
		bind("quantity_required", input.quantityText)
	}
	if input.unitSet {
		bind("unit", input.unit)
	}
	if input.bomTypeSet {
		bind("bom_type", input.bomType)
	}
	if input.qualitySet {
		bind("quality_level", input.quality)
	}
	if input.categorySet {
		bind("category", input.category)
	}
	if input.estimatedSet {
		bind("estimated_unit_cost", input.estimatedText)
	}
	if input.notesSet {
		bind("notes", input.notes)
	}
	if input.purposeSet {
		bind("purpose", input.purpose)
	}
	if input.folderIDSet {
		bind("folder_id", input.folderID)
	}
	if imageSet {
		bind("image_path", nullableOrEmpty(imagePath))
	}

	return sets, args
}

// loadRequirement reads one requirement row by id.
func loadRequirement(ctx context.Context, pool *pgxpool.Pool, requirementID int64) (requirementRow, error) {
	rows, err := pool.Query(ctx, `SELECT * FROM project_requirements WHERE id = $1`, requirementID)
	if err != nil {
		return requirementRow{}, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return requirementRow{}, err
		}
		return requirementRow{}, pgx.ErrNoRows
	}

	row, err := scanRequirementRow(rows, 20)
	if err != nil {
		return requirementRow{}, err
	}
	if err := rows.Err(); err != nil {
		return requirementRow{}, err
	}

	return row, nil
}

// projectOf reads the requirement's project id.
func projectOf(row requirementRow) int64 {
	if id, ok := row.byName["project_id"].(int64); ok {
		return id
	}
	return 0
}

// folderNameOrDeleted resolves a folder name or the deleted placeholder.
func folderNameOrDeleted(ctx context.Context, pool *pgxpool.Pool, folderID int64) string {
	var name *string
	if err := pool.QueryRow(ctx, `SELECT name FROM project_material_folders WHERE id = $1`, folderID).Scan(&name); err != nil || name == nil {
		return "Deleted Folder"
	}
	return *name
}

// projectPathSegment reads the segment before "requirements" in a nested
// .../requirements/{requirement} URL — the project id when the mux
// pattern did not bind (it always does through the manifest patterns).
func projectPathSegment(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] == "requirements" && i > 0 {
			return parts[i-1]
		}
	}
	return lastPathSegment(path)
}
