package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CREATE PROJECT — `POST /api/projects`.
//
// Validates the publish form, derives the published bidding roles (external
// vendors are already handled and are never published), writes the opening
// budget as a `deposit` ledger row, imports any external vendors and images,
// logs `project_created`, and answers the project resource with images.
//
// JSON `project_dimensions`/`external_vendors`/`bidding_choices` arrive as
// STRINGS (the FormRequest's `json` rule); `needed_phases` too.

// jsonDocument decodes a JSON string field or reports invalid.
func jsonDocument(raw any) (any, bool) {
	if raw == nil {
		return nil, true
	}
	text, ok := raw.(string)
	if !ok {
		return nil, false
	}
	if strings.TrimSpace(text) == "" {
		return nil, true
	}
	var decoded any
	if err := json.Unmarshal([]byte(text), &decoded); err != nil {
		return nil, false
	}
	return decoded, true
}

// parseDeadline accepts the shapes Laravel's `date` rule accepts here.
func parseDeadline(value string) (time.Time, bool) {
	for _, layout := range []string{
		"2006-01-02", "2006-01-02 15:04:05", time.RFC3339,
		"2006-01-02T15:04:05", "2006-01-02T15:04", "2006/01/02",
	} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

// StoreProjectHandler serves `POST /api/projects`.
func StoreProjectHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		fields, files, ferr := requestFields(r)
		if ferr != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		failures := &errorBag{}

		title, _ := requireText(fields, "title", 255, failures)
		description, _ := requireText(fields, "description", 0, failures)

		budget := ""
		if raw, present := fields["budget"]; !present || raw == nil {
			failures.add("budget", "The budget field is required.")
		} else if text, ok := numericTextOf(raw); !ok || !isNumericText(text) {
			failures.add("budget", "The budget field must be a number.")
		} else if minor, ok := numericMinor(strings.TrimSpace(text)); !ok {
			failures.add("budget", "The budget field must be a number.")
		} else if minor < 0 {
			failures.add("budget", "The budget field must be at least 0.")
		} else {
			budget = text
		}

		lokasi, _ := requireText(fields, "lokasi", 255, failures)

		optional := map[string]string{}
		for _, key := range []string{"latitude", "longitude", "province", "city", "kecamatan",
			"kelurahan", "postal_code", "street_name", "jenis_proyek"} {
			if value, has := optionalText(fields, key, 0, failures); has {
				optional[key] = value
			}
		}

		projectCategory := ""
		if raw, present := fields["project_category"]; !present || raw == nil {
			failures.add("project_category", "The project category field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("project_category", "The selected project category is invalid.")
		} else if text != "new_build" && text != "renovation" && text != "interior" && text != "maintenance" {
			failures.add("project_category", "The selected project category is invalid.")
		} else {
			projectCategory = text
		}

		var dimensions any
		if raw, present := fields["project_dimensions"]; present && raw != nil {
			decoded, valid := jsonDocument(raw)
			if !valid {
				failures.add("project_dimensions", "The project dimensions field must be a valid JSON string.")
			} else {
				dimensions = decoded
			}
		}

		// The column is NOT NULL with a legacy default of `arsitek`.
		targetRole := "arsitek"
		targetProvided := false
		if raw, present := fields["target_role"]; present && raw != nil {
			text, ok := raw.(string)
			if !ok || (text != "both" && text != "arsitek" && text != "kontraktor" && text != "interior") {
				failures.add("target_role", "The selected target role is invalid.")
			} else {
				targetRole = text
				targetProvided = true
			}
		}

		var deadline time.Time
		if raw, present := fields["deadline"]; !present || raw == nil {
			failures.add("deadline", "The deadline field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("deadline", "The deadline field must be a valid date.")
		} else if parsed, ok := parseDeadline(text); !ok {
			failures.add("deadline", "The deadline field must be a valid date.")
		} else {
			deadline = parsed
		}

		var attachment *uploadedFile
		if file, present := files["attachment"]; present {
			attachment = file
			validateFile("attachment", file, false,
				[]string{"pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "webp", "zip"}, 10240, failures)
		}

		images := requestGalleryFilesNamed(r, "images")
		if len(images) > 3 {
			failures.add("images", "The images field must not have more than 3 items.")
		}
		for index, image := range images {
			key := "images." + strconv.Itoa(index)
			switch image.ext {
			case "jpg", "jpeg", "png", "webp":
				if image.sizeBytes() > 5120*1024 {
					failures.add(key, "The "+key+" field must not be greater than 5120 kilobytes.")
				}
			default:
				failures.add(key, "The "+key+" field must be a file of type: jpg, jpeg, png, webp.")
			}
		}

		wantsPM := false
		if raw, present := fields["wants_project_manager"]; present && raw != nil {
			if value, valid := parseLaravelBoolean(raw); valid {
				wantsPM = value
			} else {
				failures.add("wants_project_manager", "The wants project manager field must be true or false.")
			}
		}
		wantsDiscuss := false
		if raw, present := fields["wants_to_discuss_later"]; present && raw != nil {
			if value, valid := parseLaravelBoolean(raw); valid {
				wantsDiscuss = value
			} else {
				failures.add("wants_to_discuss_later", "The wants to discuss later field must be true or false.")
			}
		}

		var legalDetail any
		if raw, present := fields["legal_detail"]; present && raw != nil {
			if text, ok := raw.(string); !ok {
				failures.add("legal_detail", "The legal detail field must be a string.")
			} else {
				legalDetail = text
			}
		}

		neededPhases := []any{}
		if raw, present := fields["needed_phases"]; present && raw != nil {
			decoded, valid := jsonDocument(raw)
			if !valid {
				failures.add("needed_phases", "The needed phases field must be a string.")
			} else if list, ok := decoded.([]any); ok {
				neededPhases = list
			}
		}

		externalVendors := map[string]any{}
		if raw, present := fields["external_vendors"]; present && raw != nil {
			decoded, valid := jsonDocument(raw)
			if !valid {
				failures.add("external_vendors", "The external vendors field must be a valid JSON string.")
			} else if object, ok := decoded.(map[string]any); ok {
				externalVendors = object
			}
		}

		biddingChoices := []any{}
		if raw, present := fields["bidding_choices"]; present && raw != nil {
			decoded, valid := jsonDocument(raw)
			if !valid {
				failures.add("bidding_choices", "The bidding choices field must be a valid JSON string.")
			} else if list, ok := decoded.([]any); ok {
				biddingChoices = list
			}
		}

		if !failures.empty() {
			failures.write(w)
			return
		}

		// Published roles: the PM first, or every needed phase's role, never a
		// role already covered by an external vendor.
		published := []any{}
		if wantsPM {
			if _, vendor := externalVendors["project_manager"]; !vendor {
				published = append(published, "project_manager")
			}
		} else {
			roleMap := map[string]string{
				"legal": "notaris", "design": "arsitek", "build": "kontraktor", "interior": "interior",
			}
			for _, phase := range neededPhases {
				role, ok := roleMap[stringOf(phase)]
				if !ok {
					continue
				}
				if _, vendor := externalVendors[role]; vendor {
					continue
				}
				published = append(published, role)
			}
		}

		var dimText any
		if dimensions != nil {
			encoded, _ := json.Marshal(dimensions)
			dimText = string(encoded)
		}
		phasesText, _ := json.Marshal(neededPhases)
		choicesText, _ := json.Marshal(biddingChoices)
		publishedText, _ := json.Marshal(published)

		var attachmentPath any
		if attachment != nil {
			stored, err := storePublicUpload(r, "attachment", "project_attachments", attachment)
			if err != nil {
				slog.Error("project store: attachment", "error", err)
				serverError(w)
				return
			}
			attachmentPath = stored
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("project store: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		sets := []string{
			"user_id", "title", "description", "budget", "lokasi", "jenis_proyek",
			"status", "wants_project_manager", "wants_to_discuss_later", "deadline",
			"target_role", "needed_phases", "project_category", "project_dimensions",
			"legal_detail", "bidding_choices", "published_bidding_roles", "attachment",
			"latitude", "longitude", "province", "city", "kecamatan", "kelurahan",
			"postal_code", "street_name",
		}
		values := []any{
			caller.UserID(), title, description, budget, lokasi,
			nullableOptional(optional, "jenis_proyek"), "open", wantsPM, wantsDiscuss,
			deadline, nullableOptional(optional, "target_role"), string(phasesText),
			projectCategory, dimText, legalDetail, string(choicesText), string(publishedText),
			attachmentPath,
			nullableOptional(optional, "latitude"), nullableOptional(optional, "longitude"),
			nullableOptional(optional, "province"), nullableOptional(optional, "city"),
			nullableOptional(optional, "kecamatan"), nullableOptional(optional, "kelurahan"),
			nullableOptional(optional, "postal_code"), nullableOptional(optional, "street_name"),
		}
		if targetRole != "" {
			values[10] = targetRole
		}

		placeholders := make([]string, len(sets))
		for i := range sets {
			placeholders[i] = "$" + strconv.Itoa(i+1)
		}
		// JSON columns and the boolean pair need explicit SQL types.
		placeholders[11] = placeholders[11] + "::jsonb" // needed_phases
		placeholders[13] = placeholders[13] + "::jsonb" // project_dimensions (nullable)
		placeholders[15] = placeholders[15] + "::jsonb" // bidding_choices
		placeholders[16] = placeholders[16] + "::jsonb" // published_bidding_roles
		placeholders[7] = placeholders[7] + "::boolean"
		placeholders[8] = placeholders[8] + "::boolean"
		placeholders[9] = placeholders[9] + "::timestamptz"

		var projectID int64
		query := `INSERT INTO projects (` + strings.Join(sets, ", ") + `, created_at, updated_at)
			VALUES (` + strings.Join(placeholders, ", ") + `, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`
		if err := tx.QueryRow(ctx, query, values...).Scan(&projectID); err != nil {
			slog.Error("project store: insert", "error", err)
			serverError(w)
			return
		}

		// Opening budget row: the escrow ceiling's baseline.
		// Exact minor-unit gate (no floats): a zero budget writes no row.
		budgetMinor, _ := numericMinor(strings.TrimSpace(budget))
		if budgetMinor > 0 {
			if _, err := tx.Exec(ctx, `INSERT INTO project_budget_transactions
				(project_id, transaction_type, amount, title, transaction_date, actor_user_id, actor_role, created_at, updated_at)
				VALUES ($1, 'deposit', $2::numeric, 'Opening project budget', date_trunc('second', now()), $3, $4,
				 date_trunc('second', now()), date_trunc('second', now()))`,
				projectID, budget, caller.UserID(), caller.RoleType()); err != nil {
				slog.Error("project store: ledger", "error", err)
				serverError(w)
				return
			}
		}

		for role, rawVendor := range externalVendors {
			vendor, ok := rawVendor.(map[string]any)
			if !ok {
				continue
			}
			contact := stringOf(vendor["contact_person"])
			phone := stringOf(vendor["phone_number"])
			if contact == "" || phone == "" {
				continue
			}
			var company any
			if text, ok := vendor["company_name"].(string); ok {
				company = text
			}
			if _, err := tx.Exec(ctx, `INSERT INTO project_external_vendors
				(project_id, phase_role, company_name, contact_person, phone_number, created_at, updated_at)
				VALUES ($1, $2::phase_role, $3, $4, $5, date_trunc('second', now()), date_trunc('second', now()))`,
				projectID, role, company, contact, phone); err != nil {
				slog.Error("project store: vendor", "error", err)
				serverError(w)
				return
			}
		}

		for index, image := range images {
			stored, err := storePublicUploadMulti(r, "images", index, "project_images", image)
			if err != nil {
				slog.Error("project store: image", "error", err)
				serverError(w)
				return
			}
			if _, err := tx.Exec(ctx, `INSERT INTO project_images
				(project_id, image_path, sort_order, created_at, updated_at)
				VALUES ($1, $2, $3, date_trunc('second', now()), date_trunc('second', now()))`,
				projectID, stored, index); err != nil {
				slog.Error("project store: image row", "error", err)
				serverError(w)
				return
			}
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "project_created",
			"Project \""+title+"\" was posted"); err != nil {
			slog.Error("project store: activity", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("project store: commit", "error", err)
			serverError(w)
			return
		}

		fieldsRow, valuesRow, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("project store: reload", "error", err)
			serverError(w)
			return
		}
		viewer, err := loadViewer(ctx, pool, caller)
		if err != nil {
			slog.Error("project store: viewer", "error", err)
			serverError(w)
			return
		}
		entry, err := projectResource(ctx, pool, fieldsRow, valuesRow, viewer,
			projectLoad{images: true}, nil, nil)
		if err != nil {
			slog.Error("project store: resource", "error", err)
			serverError(w)
			return
		}
		// The CREATED model never held the DB default: when `target_role` was
		// absent the column defaulted to `arsitek`, but the resource reads the
		// in-memory attribute, which is null.
		if !targetProvided {
			entry.Set("target_role", nil)
		}
		// Other DB defaults the freshly-created model never held in memory:
		// the resource reads the attribute, which is null (booleans too).
		entry.Set("construction_brief_status", nil)
		entry.Set("planning_status", nil)
		entry.Set("requires_structural", nil)
		entry.Set("requires_mep", nil)
		entry.Set("requires_interior", nil)

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusCreated, payload)
	}
}

// nullableOptional renders an optional map entry, nil when absent.
func nullableOptional(values map[string]string, key string) any {
	if value, ok := values[key]; ok {
		return value
	}
	return nil
}

// storeUploadTo persists one multipart file under the public disk and returns
// its relative path. The stored name is 40 alphanumerics (Laravel Str::random).
func storeUploadTo(r *http.Request, header *multipart.FileHeader, folder, ext string) (string, error) {
	name, err := randomAlphaNumeric(40)
	if err != nil {
		return "", err
	}
	rel := folder + "/" + name + "." + ext
	full := filepath.Join(publicDiskRoot(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return "", err
	}

	src, err := header.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	dst, err := os.OpenFile(full, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}
	return rel, nil
}

// requestGalleryFilesNamed reads repeated multipart files, in order.
func requestGalleryFilesNamed(r *http.Request, key string) []*galleryUpload {
	if r.MultipartForm == nil {
		return nil
	}
	headers := r.MultipartForm.File[key]
	if len(headers) == 0 {
		headers = r.MultipartForm.File[key+"[]"]
	}
	out := make([]*galleryUpload, 0, len(headers))
	for _, header := range headers {
		file, err := readGalleryFile(header)
		if err != nil {
			continue
		}
		out = append(out, file)
	}
	return out
}

// storePublicUpload persists one multipart file under the public disk.
func storePublicUpload(r *http.Request, key, folder string, file *uploadedFile) (string, error) {
	if r.MultipartForm == nil || len(r.MultipartForm.File[key]) == 0 {
		return "", nil
	}
	return storeUploadTo(r, r.MultipartForm.File[key][0], folder, file.ext)
}

// storePublicUploadMulti is the indexed `images` variant.
func storePublicUploadMulti(r *http.Request, key string, index int, folder string, file *galleryUpload) (string, error) {
	if r.MultipartForm == nil {
		return "", nil
	}
	headers := r.MultipartForm.File[key]
	if len(headers) == 0 {
		headers = r.MultipartForm.File[key+"[]"]
	}
	if index >= len(headers) {
		return "", nil
	}
	return storeUploadTo(r, headers[index], folder, file.ext)
}
