package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// REQUIREMENT STORE — POST /api/projects/{project}/requirements.
//
// A requirement is born with zeroed stock counters, an optional vault
// image (hash-named, like every other stored upload), a restock history
// row and an activity log. The 200 answers the row with its requester —
// notably WITHOUT the folder key, which only the list serializer loads.

// StoreRequirementHandler serves `POST /api/projects/{project}/requirements`.
func StoreRequirementHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("requirement-store: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("requirement-store: project", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)

		allowed, err := requirementGate(ctx, pool, viewer, projectID, ownerID)
		if err != nil {
			slog.Error("requirement-store: gate", "error", err)
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
		input, _ := validateRequirement(formFields, formFiles, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		if input.folderID != nil {
			var inProject bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_material_folders WHERE id = $1)`, *input.folderID).Scan(&inProject); err != nil {
				slog.Error("requirement-store: folder", "error", err)
				serverError(w)
				return
			}
			if !inProject {
				failures.add("folder_id", "The selected folder id is invalid.")
				failures.write(w)
				return
			}
		}

		imagePath := ""
		if input.image != nil {
			contents, err := readUploadedFile(r, "image")
			if err != nil {
				slog.Error("requirement-store: image", "error", err)
				serverError(w)
				return
			}
			input.image.data = contents

			stored, err := storeVaultFile("requirements", input.image.filename, input.image.data)
			if err != nil {
				slog.Error("requirement-store: image", "error", err)
				serverError(w)
				return
			}
			imagePath = stored
		}

		var createdID int64
		err = pool.QueryRow(ctx, `INSERT INTO project_requirements (project_id, name, bom_type, quantity_required, estimated_unit_cost, quantity_on_site, quantity_used, unit, quality_level, image_path, notes, purpose, category, user_id, folder_id, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7, $8, $9, $10, $11, $12, $13, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, input.name, input.bomType, input.quantityText, input.estimatedText, input.unit, input.quality, nullableOrEmpty(imagePath), input.notes, input.purpose, input.category, viewer.id, input.folderID).Scan(&createdID)
		if err != nil {
			slog.Error("requirement-store: insert", "error", err)
			serverError(w)
			return
		}

		if _, err := pool.Exec(ctx, `INSERT INTO project_requirement_histories (project_requirement_id, user_id, type, quantity, notes, created_at, updated_at) VALUES ($1, $2, 'restock', 0, 'Material requirement created', date_trunc('second', now()), date_trunc('second', now()))`, createdID, viewer.id); err != nil {
			slog.Error("requirement-store: history", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "requirement_added", "Added material: "+input.name); err != nil {
			slog.Error("requirement-store: log", "error", err)
			serverError(w)
			return
		}

		obj, err := buildRequirementResponse(ctx, pool, createdID, input, viewer.id, imagePath, projectID)
		if err != nil {
			slog.Error("requirement-store: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", obj)

		writeJSON(w, http.StatusOK, payload)
	}
}

// buildRequirementResponse renders the 201 in create order: the validated
// fields in rule order (present keys only), then user_id, image_path,
// the zeroed counters, project_id, the timestamps, id, image_url and the
// requester. A re-read would emit table order instead.
func buildRequirementResponse(ctx context.Context, pool *pgxpool.Pool, createdID int64, input requirementInput, userID int64, imagePath string, projectID int64) (*jsonphp.Object, error) {
	quantity, err := money.FromColumn(input.quantityText, "IDR")
	if err != nil {
		return nil, err
	}

	obj := jsonphp.NewObject()
	obj.Set("name", input.name)
	obj.Set("quantity_required", quantity.Decimal())
	obj.Set("unit", input.unit)
	obj.Set("bom_type", input.bomType)
	if input.quality != nil {
		obj.Set("quality_level", *input.quality)
	}
	if input.category != nil {
		obj.Set("category", *input.category)
	}
	if input.estimatedText != nil {
		estimated, err := money.FromColumn(*input.estimatedText, "IDR")
		if err != nil {
			return nil, err
		}
		obj.Set("estimated_unit_cost", estimated.Decimal())
	}
	if input.notes != nil {
		obj.Set("notes", *input.notes)
	}
	if input.purpose != nil {
		obj.Set("purpose", *input.purpose)
	}
	if input.folderID != nil {
		obj.Set("folder_id", *input.folderID)
	}
	obj.Set("user_id", userID)
	if imagePath == "" {
		obj.Set("image_path", nil)
	} else {
		obj.Set("image_path", imagePath)
	}
	obj.Set("quantity_on_site", "0.00")
	obj.Set("quantity_used", "0.00")
	obj.Set("project_id", projectID)
	obj.Set("updated_at", projectTimeValue(time.Now().UTC()))
	obj.Set("created_at", projectTimeValue(time.Now().UTC()))
	obj.Set("id", createdID)
	obj.Set("image_url", requirementImageURL(ctx, imagePath))

	user, err := fullProfileUser(ctx, pool, userID, false)
	if err != nil {
		return nil, err
	}
	obj.Set("user", user)

	return obj, nil
}

// requirementInput is one validated material requirement.
type requirementInput struct {
	name          string
	quantityText  string
	unit          string
	bomType       string
	quality       *string
	category      *string
	estimatedText *string
	notes         *string
	purpose       *string
	image         *uploadedImage
	folderID      *int64
}

// nullableOrEmpty renders an empty string as nil for optional columns.
func nullableOrEmpty(value string) *string {
	if value == "" {
		return nil
	}
	dup := value
	return &dup
}

// validateRequirement enforces the store rules in declaration order:
// name, quantity_required, unit, bom_type, quality_level, category,
// estimated_unit_cost, notes, purpose, image, folder_id.
func validateRequirement(fields map[string]any, files map[string]*uploadedFile, failures *errorBag) (requirementInput, bool) {
	var input requirementInput
	ok := true

	if raw, present := fields["name"]; !present || raw == nil {
		failures.add("name", requiredMsg(attrName("name")))
		ok = false
	} else if s, isStr := raw.(string); !isStr {
		failures.add("name", "The name field must be a string.")
		ok = false
	} else if s == "" {
		failures.add("name", requiredMsg(attrName("name")))
		ok = false
	} else if len(s) > 255 {
		failures.add("name", "The name field must not be greater than 255 characters.")
		ok = false
	} else {
		input.name = s
	}

	if raw, present := fields["quantity_required"]; !present || raw == nil {
		failures.add("quantity_required", requiredMsg(attrName("quantity_required")))
		ok = false
	} else if text, present := numericTextOf(raw); !present || text == "" {
		failures.add("quantity_required", "The quantity required field must be a number.")
		ok = false
	} else if !isNumericText(text) {
		failures.add("quantity_required", "The quantity required field must be a number.")
		ok = false
	} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
		failures.add("quantity_required", "The quantity required field must be a number.")
		ok = false
	} else {
		input.quantityText = text
		if parsed < 0 {
			failures.add("quantity_required", "The quantity required field must be at least 0.")
			ok = false
		}
	}

	if raw, present := fields["unit"]; !present || raw == nil {
		failures.add("unit", requiredMsg(attrName("unit")))
		ok = false
	} else if s, isStr := raw.(string); !isStr {
		failures.add("unit", "The unit field must be a string.")
		ok = false
	} else if s == "" {
		failures.add("unit", requiredMsg(attrName("unit")))
		ok = false
	} else if len(s) > 50 {
		failures.add("unit", "The unit field must not be greater than 50 characters.")
		ok = false
	} else {
		input.unit = s
	}

	if raw, present := fields["bom_type"]; !present || raw == nil {
		failures.add("bom_type", requiredMsg(attrName("bom_type")))
		ok = false
	} else if s, isStr := raw.(string); !isStr {
		failures.add("bom_type", "The bom type field must be a string.")
		failures.add("bom_type", "The selected bom type is invalid.")
		ok = false
	} else if s != "raw" && s != "finishing" {
		failures.add("bom_type", "The selected bom type is invalid.")
		ok = false
	} else {
		input.bomType = s
	}

	if raw, present := fields["quality_level"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("quality_level", "The quality level field must be a string.")
			failures.add("quality_level", "The selected quality level is invalid.")
			ok = false
		} else if s != "standard" && s != "premium" && s != "luxury" {
			failures.add("quality_level", "The selected quality level is invalid.")
			ok = false
		} else {
			dup := s
			input.quality = &dup
		}
	}

	if raw, present := fields["category"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("category", "The category field must be a string.")
			failures.add("category", "The selected category is invalid.")
			ok = false
		} else if s != "structural" && s != "architecture" && s != "mep" && s != "interior" && s != "general" {
			failures.add("category", "The selected category is invalid.")
			ok = false
		} else {
			dup := s
			input.category = &dup
		}
	}

	if raw, present := fields["estimated_unit_cost"]; present && raw != nil {
		if text, present := numericTextOf(raw); !present || text == "" {
			failures.add("estimated_unit_cost", "The estimated unit cost field must be a number.")
			ok = false
		} else if !isNumericText(text) {
			failures.add("estimated_unit_cost", "The estimated unit cost field must be a number.")
			ok = false
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add("estimated_unit_cost", "The estimated unit cost field must be a number.")
			ok = false
		} else {
			dup := text
			input.estimatedText = &dup
			if parsed < 0 {
				failures.add("estimated_unit_cost", "The estimated unit cost field must be at least 0.")
				ok = false
			}
		}
	}

	for _, key := range []string{"notes", "purpose"} {
		if raw, present := fields[key]; present && raw != nil {
			if s, isStr := raw.(string); !isStr {
				failures.add(key, "The "+attrName(key)+" field must be a string.")
				ok = false
			} else {
				dup := s
				if key == "notes" {
					input.notes = &dup
				} else {
					input.purpose = &dup
				}
			}
		}
	}

	validateRequirementImage(files["image"], failures, &input, &ok)

	if raw, present := fields["folder_id"]; present && raw != nil {
		if text, present := numericTextOf(raw); !present || text == "" {
			failures.add("folder_id", "The selected folder id is invalid.")
			ok = false
		} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
			failures.add("folder_id", "The selected folder id is invalid.")
			ok = false
		} else {
			dup := parsed
			input.folderID = &dup
		}
	}

	return input, ok
}

// validateRequirementImage enforces nullable|image|mimes|max on the
// upload. A non-image fails BOTH the image and the mimes rules, in
// that order; size is checked last.
func validateRequirementImage(file *uploadedFile, failures *errorBag, input *requirementInput, ok *bool) {
	if file == nil {
		return
	}

	if !file.isImage {
		failures.add("image", "The image field must be an image.")
		failures.add("image", "The image field must be a file of type: jpeg, png, jpg, webp.")
		*ok = false
		return
	}

	allowed := map[string]bool{"jpeg": true, "png": true, "jpg": true, "webp": true}
	if !allowed[strings.ToLower(file.ext)] {
		failures.add("image", "The image field must be a file of type: jpeg, png, jpg, webp.")
		*ok = false
		return
	}

	if file.size > 5120*1024 {
		failures.add("image", "The image field must not be greater than 5120 kilobytes.")
		*ok = false
		return
	}

	input.image = &uploadedImage{filename: file.filename, size: file.size, ext: file.ext}
}

// uploadedImage is a validated upload awaiting persistence.
type uploadedImage struct {
	filename string
	size     int64
	ext      string
	data     []byte
}

// readUploadedFile reads a multipart upload's full bytes.
func readUploadedFile(r *http.Request, key string) ([]byte, error) {
	if r.MultipartForm == nil || r.MultipartForm.File == nil {
		return nil, errNoUpload
	}

	headers, ok := r.MultipartForm.File[key]
	if !ok || len(headers) == 0 {
		return nil, errNoUpload
	}

	file, err := headers[0].Open()
	if err != nil {
		return nil, err
	}
	defer file.Close()

	return io.ReadAll(file)
}

var errNoUpload = noUploadError{}

type noUploadError struct{}

func (noUploadError) Error() string { return "no uploaded file" }

// storeVaultFile persists upload bytes under a hash name and returns
// the vault-relative path. The name is 40 hex chars, the shape of
// Laravel's Str::random(40) hash names — the VALUE is random either way,
// so the two stacks never emit the same bytes here; the shadow only
// covers the file-less paths.
func storeVaultFile(directory, filename string, data []byte) (string, error) {
	var random [20]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", err
	}

	ext := strings.ToLower(strings.TrimPrefix(extensionOf(filename), "."))
	name := hex.EncodeToString(random[:])
	if ext != "" {
		name += "." + ext
	}

	rel := directory + "/" + name
	if err := writeVaultFile(rel, data); err != nil {
		return "", err
	}

	return rel, nil
}

type requirementGoneError struct{}

func (requirementGoneError) Error() string { return "requirement row vanished mid-request" }
