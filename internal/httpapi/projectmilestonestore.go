package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// milestoneInput is one validated work-plan entry.
type milestoneInput struct {
	title         string
	description   *string
	startDate     string
	dueDate       string
	milestoneType string
	sortOrder     *int64
	sortText      string
	phaseContext  string
	contentText   string
	contentArr    map[string]any
	rawTargets    map[string]any
	costImpact    string
	timeImpact    *int64
	gallery       []*uploadedFile
}

// validateMilestone enforces the store rules in declaration order:
// title, start_date, due_date, description, type, sort_order,
// phase_context, content, the four target_* exists rules, cost_impact,
// time_impact_days, gallery, gallery.*.
func validateMilestone(fields map[string]any, files []*uploadedFile, failures *errorBag) (milestoneInput, bool) {
	var input milestoneInput
	input.rawTargets = map[string]any{}
	ok := true

	if raw, present := fields["title"]; !present || raw == nil {
		failures.add("title", requiredMsg(attrName("title")))
		ok = false
	} else if s, isStr := raw.(string); !isStr {
		failures.add("title", "The title field must be a string.")
		ok = false
	} else if s == "" {
		failures.add("title", requiredMsg(attrName("title")))
		ok = false
	} else if len(s) > 255 {
		failures.add("title", "The title field must not be greater than 255 characters.")
		ok = false
	} else {
		input.title = s
	}

	for _, key := range []string{"start_date", "due_date"} {
		if raw, present := fields[key]; present && raw != nil {
			if s, isStr := raw.(string); !isStr {
				failures.add(key, "The "+attrName(key)+" field must be a valid date.")
				ok = false
			} else if _, perr := parseLooseDate(s); perr != nil {
				failures.add(key, "The "+attrName(key)+" field must be a valid date.")
				ok = false
			} else if key == "start_date" {
				input.startDate = s
			} else {
				input.dueDate = s
			}
		}
	}

	if raw, present := fields["description"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("description", "The description field must be a string.")
			ok = false
		} else {
			dup := s
			input.description = &dup
		}
	}

	if raw, present := fields["type"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("type", "The type field must be a string.")
			ok = false
		} else if len(s) > 100 {
			failures.add("type", "The type field must not be greater than 100 characters.")
			ok = false
		} else {
			input.milestoneType = s
		}
	}

	if raw, present := fields["sort_order"]; present && raw != nil {
		if text, present := numericTextOf(raw); !present || text == "" || !isNumericText(text) {
			failures.add("sort_order", "The sort order field must be an integer.")
			ok = false
		} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil || strings.Contains(text, ".") {
			failures.add("sort_order", "The sort order field must be an integer.")
			ok = false
		} else if parsed < 0 {
			failures.add("sort_order", "The sort order field must be at least 0.")
			ok = false
		} else {
			dup := parsed
			input.sortOrder = &dup
			input.sortText = strings.TrimSpace(text)
		}
	}

	if raw, present := fields["phase_context"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("phase_context", "The phase context field must be a string.")
			ok = false
		} else {
			input.phaseContext = s
		}
	}

	if raw, present := fields["content"]; present && raw != nil {
		switch typed := raw.(type) {
		case string:
			input.contentText = typed
		case map[string]any:
			input.contentArr = typed
		case []any:
			input.contentArr = map[string]any{"_list": typed}
		default:
			failures.add("content", "The content field must be a string.")
			ok = false
		}
	}

	for _, key := range []string{"target_notaris_id", "target_arsitek_id", "target_kontraktor_id", "target_interior_id", "target_structural_id", "target_mep_id"} {
		if raw, present := fields[key]; present && raw != nil {
			validated := key != "target_structural_id" && key != "target_mep_id"
			text, present := numericTextOf(raw)
			if !present || text == "" {
				if validated {
					failures.add(key, "The selected "+attrName(key)+" is invalid.")
					ok = false
				} else {
					input.rawTargets[key] = raw
				}
				continue
			}
			if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil {
				if validated {
					failures.add(key, "The selected "+attrName(key)+" is invalid.")
					ok = false
				} else {
					input.rawTargets[key] = raw
				}
				continue
			} else {
				input.rawTargets[key] = parsed
			}
		}
	}

	if raw, present := fields["cost_impact"]; present && raw != nil {
		if text, present := numericTextOf(raw); !present || text == "" || !isNumericText(text) {
			failures.add("cost_impact", "The cost impact field must be a number.")
			ok = false
		} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
			failures.add("cost_impact", "The cost impact field must be a number.")
			ok = false
		} else {
			input.costImpact = text
			if parsed < 0 {
				failures.add("cost_impact", "The cost impact field must be at least 0.")
				ok = false
			}
		}
	}

	if raw, present := fields["time_impact_days"]; present && raw != nil {
		if text, present := numericTextOf(raw); !present || text == "" || !isNumericText(text) {
			failures.add("time_impact_days", "The time impact days field must be a number.")
			ok = false
		} else if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err != nil || strings.Contains(text, ".") {
			failures.add("time_impact_days", "The time impact days field must be an integer.")
			ok = false
		} else if parsed < 0 {
			failures.add("time_impact_days", "The time impact days field must be at least 0.")
			ok = false
		} else {
			dup := parsed
			input.timeImpact = &dup
		}
	}

	if raw, present := fields["gallery"]; present && raw != nil {
		if arr, isArr := raw.([]any); !isArr {
			failures.add("gallery", "The gallery field must be an array.")
			ok = false
		} else if len(arr) > 10 {
			failures.add("gallery", "The gallery field must not have more than 10 items.")
			ok = false
		}
	}

	for index, upload := range files {
		key := "gallery." + strconv.Itoa(index)
		if !upload.isImage {
			failures.add(key, "The "+key+" field must be an image.")
			failures.add(key, "The "+key+" field must be a file of type: jpeg, png, jpg, gif, webp.")
			ok = false
			continue
		}
		allowed := map[string]bool{"jpeg": true, "png": true, "jpg": true, "gif": true, "webp": true}
		if !allowed[strings.ToLower(upload.ext)] {
			failures.add(key, "The "+key+" field must be a file of type: jpeg, png, jpg, gif, webp.")
			ok = false
			continue
		}
		if upload.size > 5120*1024 {
			failures.add(key, "The "+key+" field must not be greater than 5120 kilobytes.")
			ok = false
			continue
		}
		input.gallery = append(input.gallery, upload)
	}

	return input, ok
}

// readGalleryUploads collects every uploaded gallery file in field
// order, sniffing each for the image check. Multipart fields arrive as
// `gallery` or `gallery[]` depending on the client.
func readGalleryUploads(r *http.Request) []*uploadedFile {
	if r.MultipartForm == nil || r.MultipartForm.File == nil {
		return nil
	}

	var out []*uploadedFile
	for _, key := range []string{"gallery", "gallery[]"} {
		for _, header := range r.MultipartForm.File[key] {
			file, err := header.Open()
			if err != nil {
				continue
			}

			head := make([]byte, 512)
			n, _ := file.Read(head)

			var data []byte
			if rest, err := io.ReadAll(file); err == nil {
				data = append(head[:n], rest...)
			} else {
				data = head[:n]
			}
			_ = file.Close()

			out = append(out, &uploadedFile{
				filename: header.Filename,
				size:     header.Size,
				ext:      strings.ToLower(strings.TrimPrefix(extensionOf(header.Filename), ".")),
				isImage:  strings.HasPrefix(detectContentType(head[:n]), "image/"),
				data:     data,
			})
		}
	}

	return out
}

// hiredRoleForMilestone reports the caller's hired role for the gate.
func hiredRoleForMilestone(parties DbProject, subject DbSubject) (string, bool) {
	for _, role := range []identity.Role{identity.RoleArsitek, identity.RoleKontraktor, identity.RoleNotaris, identity.RoleInterior, identity.RoleStructural, identity.RoleMep} {
		if authz.Matches(parties, subject, role) {
			return role.String(), true
		}
	}
	return "", false
}

// milestoneContentInput builds the content document plus its top-level
// key order: a decoded object keeps document order, a decoded list
// becomes index-keyed (mirroring PHP's append-to-list), and an absent or
// invalid document is the empty plan.
func milestoneContentInput(input milestoneInput) (map[string]any, []string) {
	if input.contentArr != nil {
		keys := make([]string, 0, len(input.contentArr))
		for key := range input.contentArr {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		return input.contentArr, keys
	}
	if strings.TrimSpace(input.contentText) != "" {
		var decoded map[string]any
		if err := json.Unmarshal([]byte(input.contentText), &decoded); err == nil {
			return decoded, milestoneContentKeys(input.contentText)
		}
		var decodedList []any
		if err := json.Unmarshal([]byte(input.contentText), &decodedList); err == nil {
			out := map[string]any{}
			order := []string{}
			for index, item := range decodedList {
				key := strconv.Itoa(index)
				out[key] = item
				order = append(order, key)
			}
			return out, order
		}
	}
	return map[string]any{}, nil
}

// contentGallery reads the gallery list from content.
func contentGallery(content map[string]any) []any {
	if gallery, ok := content["gallery"].([]any); ok {
		return gallery
	}
	return []any{}
}

// contentFileNames reads the file-names map from content.
func contentFileNames(content map[string]any) map[string]any {
	if names, ok := content["file_names"].(map[string]any); ok {
		return names
	}
	return map[string]any{}
}

// appendKeyOnce appends keys not already present, preserving order.
func appendKeyOnce(order []string, keys ...string) []string {
	seen := map[string]bool{}
	for _, key := range order {
		seen[key] = true
	}
	for _, key := range keys {
		if !seen[key] {
			order = append(order, key)
			seen[key] = true
		}
	}
	return order
}

// hasContentKey reports whether a key exists in the content.
func hasContentKey(order []string, content map[string]any, key string) bool {
	for _, item := range order {
		if item == key {
			return true
		}
	}
	_, ok := content[key]
	return ok
}

// milestoneContentKeys reads the top-level key order of a JSON object.
func milestoneContentKeys(document string) []string {
	keys := []string{}
	depth := 0
	inString := false
	escaped := false
	start := -1

	flush := func(end int) {
		if start < 0 {
			return
		}
		candidate := document[start:end]
		rest := strings.TrimSpace(document[end+1:])
		if strings.HasPrefix(rest, ":") {
			var key string
			if err := json.Unmarshal([]byte(`"`+candidate+`"`), &key); err == nil {
				keys = append(keys, key)
			} else {
				keys = append(keys, candidate)
			}
		}
		start = -1
	}

	for i := 0; i < len(document); i++ {
		c := document[i]
		if inString {
			if escaped {
				escaped = false
			} else if c == '\\' {
				escaped = true
			} else if c == '"' {
				inString = false
				if depth == 1 {
					flush(i)
				}
			}
			continue
		}
		switch c {
		case '"':
			inString = true
			if depth == 1 {
				start = i + 1
			}
		case '{', '[':
			depth++
		case '}', ']':
			depth--
		}
	}

	return keys
}

// resolveGalleryURLs maps stored paths to absolute storage URLs,
// passing absolute URLs through and dropping empties.
func resolveGalleryURLs(ctx context.Context, gallery []any) []any {
	out := make([]any, 0, len(gallery))
	for _, item := range gallery {
		path, ok := item.(string)
		if !ok || path == "" {
			continue
		}
		if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
			out = append(out, path)
			continue
		}
		out = append(out, assetBaseOf(ctx)+"/storage/"+strings.TrimPrefix(path, "/"))
	}
	return out
}

// parseLooseDate parses the date shapes the SPA sends.
func parseLooseDate(text string) (time.Time, error) {
	trimmed := strings.TrimSpace(text)
	for _, layout := range []string{"2006-01-02", "2006-01-02 15:04:05", time.RFC3339, "2006/01/02", "2006-01-02T15:04:05"} {
		if parsed, err := time.Parse(layout, trimmed); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, errBadDate
}

var errBadDate = badDateError{}

type badDateError struct{}

func (badDateError) Error() string { return "not a date" }

// activeSubRole reads the caller's active sub-professional role.
func activeSubRole(ctx context.Context, pool *pgxpool.Pool, projectID, userID int64) (string, error) {
	var role *string
	if err := pool.QueryRow(ctx, `SELECT sub_role FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2 AND status::text = 'active' LIMIT 1`, projectID, userID).Scan(&role); err != nil {
		return "", err
	}
	if role == nil {
		return "", nil
	}
	return *role, nil
}

// milestoneRoleFK resolves the profile FK column and value: explicit
// targets first (notaris, arsitek, kontraktor, interior, structural,
// mep), else the caller's own profile by role. Mirrors the controller's
// if-chain exactly, including the missing pm target.
//
// A truthy but non-integer structural/mep target flows straight into the
// insert and fails there — the controller catches it as the generic 500.
func milestoneRoleFK(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, input milestoneInput) (string, *int64, bool) {
	targets := []struct {
		key    string
		column string
		table  string
	}{
		{"target_notaris_id", "notaris_id", "notaris_profiles"},
		{"target_arsitek_id", "arsitek_id", "arsiteks"},
		{"target_kontraktor_id", "kontraktor_id", "kontraktors"},
		{"target_interior_id", "interior_id", "interior_profiles"},
		{"target_structural_id", "structural_id", "structural_engineers"},
		{"target_mep_id", "mep_id", "mep_engineers"},
	}

	for _, target := range targets {
		raw, ok := input.rawTargets[target.key]
		if !ok || raw == nil {
			continue
		}
		if text, isStr := raw.(string); isStr && strings.TrimSpace(text) == "" {
			continue
		}
		if num, isNum := raw.(float64); isNum && num == 0 {
			continue
		}

		text, present := numericTextOf(raw)
		parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
		if !present || text == "" || err != nil || parsed == 0 {
			if target.key == "target_structural_id" || target.key == "target_mep_id" {
				return "", nil, false
			}
			continue
		}
		dup := parsed
		return target.column, &dup, true
	}

	profileTable := map[string]string{
		"arsitek": "arsiteks", "kontraktor": "kontraktors", "project_manager": "project_managers",
		"notaris": "notaris_profiles", "interior": "interior_profiles",
		"structural": "structural_engineers", "mep": "mep_engineers",
	}[viewer.role]
	profileColumn := map[string]string{
		"arsitek": "arsitek_id", "kontraktor": "kontraktor_id", "project_manager": "pm_id",
		"notaris": "notaris_id", "interior": "interior_id",
		"structural": "structural_id", "mep": "mep_id",
	}[viewer.role]

	if profileTable != "" {
		if own, ok := viewer.profiles[viewer.role]; ok && own != 0 {
			var exists bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM `+profileTable+` WHERE id = $1)`, own).Scan(&exists); err == nil && exists {
				dup := own
				return profileColumn, &dup, true
			}
		}
	}

	return "arsitek_id", nil, true
}

// syncMilestoneVault mirrors syncToVault: approved gallery files become
// verified (or under-review) documents, keyed by (project, file path).
func syncMilestoneVault(ctx context.Context, pool *pgxpool.Pool, projectID, milestoneID int64) error {
	var content *string
	var title, milestoneType, approvalStatus, phaseContext *string
	var arsitekID, kontraktorID, notarisID, interiorID, structuralID, mepID *int64
	var isCompleted bool

	err := pool.QueryRow(ctx, `SELECT content::text, title, type, approval_status, phase_context, arsitek_id, kontraktor_id, notaris_id, interior_id, structural_id, mep_id, is_completed FROM project_milestones WHERE id = $1`, milestoneID).Scan(
		&content, &title, &milestoneType, &approvalStatus, &phaseContext, &arsitekID, &kontraktorID, &notarisID, &interiorID, &structuralID, &mepID, &isCompleted)
	if err != nil {
		return err
	}

	files := approvedGalleryFiles(content)
	if len(files) == 0 {
		return nil
	}

	status := "under_review"
	if (approvalStatus != nil && *approvalStatus == "approved") || isCompleted {
		status = "verified"
	}

	var ownerID int64
	_ = pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID)

	fileNames := map[string]string{}
	if content != nil {
		var decoded map[string]any
		if err := json.Unmarshal([]byte(*content), &decoded); err == nil {
			if names, ok := decoded["file_names"].(map[string]any); ok {
				for path, name := range names {
					if s, ok := name.(string); ok {
						fileNames[path] = s
					}
				}
			}
		}
	}

	titleText := ""
	if title != nil {
		titleText = *title
	}

	for _, filePath := range files {
		name, ok := fileNames[filePath]
		if !ok {
			name = titleText + " - " + filepathBase(filePath)
		}

		category := "milestone_attachment"
		if milestoneType != nil && *milestoneType != "" {
			category = *milestoneType
		}
		if phaseContext != nil && *phaseContext == "design" {
			category = "blueprint"
		}

		targetRole := roleForMilestoneFK(arsitekID, kontraktorID, notarisID, interiorID, structuralID, mepID)

		var existingID int64
		err := pool.QueryRow(ctx, `SELECT id FROM project_documents WHERE project_id = $1 AND file_path = $2`, projectID, filePath).Scan(&existingID)
		if err == nil {
			if _, err := pool.Exec(ctx, `UPDATE project_documents SET uploader_id = $1, file_name = $2, file_type = $3, category = $4, status = $5, version_label = $6, target_role = $7, updated_at = date_trunc('second', now()) WHERE id = $8`,
				ownerID, name, filepathExtLower(filePath), category, status, titleText, targetRole, existingID); err != nil {
				return err
			}
			continue
		}

		if _, err := pool.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, file_type, category, status, version_label, target_role, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, date_trunc('second', now()), date_trunc('second', now()))`,
			projectID, ownerID, name, filePath, filepathExtLower(filePath), category, status, titleText, targetRole); err != nil {
			return err
		}
	}

	return nil
}

// approvedGalleryFiles reads non-empty string gallery entries.
func approvedGalleryFiles(content *string) []string {
	if content == nil || *content == "" {
		return nil
	}

	var decoded map[string]any
	if err := json.Unmarshal([]byte(*content), &decoded); err != nil {
		return nil
	}

	raw, ok := decoded["gallery"].([]any)
	if !ok {
		return nil
	}

	out := []string{}
	for _, item := range raw {
		if s, ok := item.(string); ok && s != "" {
			out = append(out, s)
		}
	}

	return out
}

// roleForMilestoneFK maps the set FK to the document target role.
func roleForMilestoneFK(arsitekID, kontraktorID, notarisID, interiorID, structuralID, mepID *int64) *string {
	present := func(id *int64) bool { return id != nil && *id != 0 }

	var role string
	switch {
	case present(arsitekID):
		role = "architect"
	case present(kontraktorID):
		role = "contractor"
	case present(notarisID):
		role = "notary"
	case present(interiorID):
		role = "interior"
	case present(structuralID):
		role = "structural"
	case present(mepID):
		role = "mep"
	default:
		return nil
	}

	return &role
}

// filepathBase returns the final path segment.
func filepathBase(path string) string {
	if index := strings.LastIndex(path, "/"); index >= 0 {
		return path[index+1:]
	}
	return path
}

// filepathExtLower returns the lowercase extension without the dot.
func filepathExtLower(path string) string {
	if dot := strings.LastIndex(path, "."); dot >= 0 {
		return strings.ToLower(path[dot+1:])
	}
	return ""
}

// renderMilestoneBase renders the shared column block: table columns in
// order with the casts, resolved gallery content, and Carbon datetimes.
func renderMilestoneBase(ctx context.Context, row milestoneRow) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range row.fields {
		value := row.byName[column]
		switch column {
		case "sort_order":
			entry.Set(column, intOrNilBid(row.byName, column))
		case "is_completed":
			entry.Set(column, boolOrFalse(value))
		case "content":
			entry.Set(column, milestoneContentBytes(ctx, value))
		case "start_date", "due_date", "lead_pro_verified_at", "pm_verified_at", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	return entry
}

// StoreMilestoneHandler serves `POST /api/projects/{project}/milestones`.
func StoreMilestoneHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("milestone-store: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("milestone-store: project", "error", err)
			serverError(w)
			return
		}

		byName := projectColumnsByName(fields, values)
		ownerID, _ := byName["user_id"].(int64)
		pmID := projectIntPtr(values, fields, "pm_id")

		subject, err := loadSubject(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("milestone-store: subject", "error", err)
			serverError(w)
			return
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			slog.Error("milestone-store: parties", "error", err)
			serverError(w)
			return
		}

		isOwner := viewer.id == ownerID
		isPM := pmID != nil && *pmID != 0 && viewer.profiles["project_manager"] == *pmID

		var subRoleName string
		var activeSub bool
		if err := pool.QueryRow(ctx, `SELECT sub_role FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2 AND status::text = 'active' LIMIT 1`,
			projectID, viewer.id).Scan(&subRoleName); err == nil && subRoleName != "" {
			activeSub = true
		}

		isHired := false
		if !isOwner && !isPM && !activeSub {
			if role, ok := hiredRoleForMilestone(parties, subject); ok {
				_ = role
				isHired = true
			}
		}

		if !isOwner && !isPM && !isHired && !activeSub {
			message(w, http.StatusForbidden, "Only hired professionals, active sub-professionals, or the Project Owner can add milestones.")
			return
		}

		formFields, _, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}
		input, _ := validateMilestone(formFields, readGalleryUploads(r), failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		phase := input.phaseContext
		if phase == "" {
			phase = "design"
		}

		for key, profileTable := range map[string]string{
			"target_notaris_id": "notaris_profiles", "target_arsitek_id": "arsiteks",
			"target_kontraktor_id": "kontraktors", "target_interior_id": "interior_profiles",
		} {
			raw, ok := input.rawTargets[key]
			if !ok || raw == nil {
				continue
			}
			var id int64
			switch typed := raw.(type) {
			case int64:
				id = typed
			case float64:
				id = int64(typed)
			default:
				continue
			}
			var exists bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM `+profileTable+` WHERE id = $1)`, id).Scan(&exists); err != nil {
				slog.Error("milestone-store: target", "error", err)
				serverError(w)
				return
			}
			if !exists {
				failures.add(key, "The selected "+attrName(key)+" is invalid.")
				failures.write(w)
				return
			}
		}

		if !isPM && !isOwner {
			handoverCols := map[string]string{
				"legal": "legal_handover_submitted_at", "design": "design_handover_submitted_at",
				"build": "construction_handover_submitted_at", "construction": "construction_handover_submitted_at",
				"interior": "interior_handover_submitted_at",
			}
			if column, ok := handoverCols[phase]; ok {
				if projectColumnsByName(fields, values)[column] != nil {
					message(w, http.StatusForbidden, "Cannot add milestones when phase handover is under review.")
					return
				}
			}
		}

		if phase == "build" || phase == "construction" {
			category, _ := byName["project_category"].(string)
			if category == "new_build" || category == "renovation" {
				var approved bool
				if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_milestones WHERE project_id = $1 AND approval_status::text = 'approved' AND (title LIKE '%PBG%' OR title LIKE '%IMB%'))`,
					projectID).Scan(&approved); err != nil {
					slog.Error("milestone-store: pbg", "error", err)
					serverError(w)
					return
				}

				pbgVerified := byName["pbg_verified_at"] != nil
				if !pbgVerified && !approved {
					message(w, http.StatusForbidden, "Physical site work is locked. PBG permit is missing or unverified.")
					return
				}
			}
		}

		content, contentOrder := milestoneContentInput(input)

		if column, ok := map[string]string{
			"design": "design_locked_at", "build": "construction_locked_at", "construction": "construction_locked_at",
			"interior": "interior_locked_at", "legal": "legal_locked_at",
		}[phase]; ok {
			if byName[column] != nil {
				content["is_addon"] = true
				content["original_phase_lock_date"] = time.Now().UTC().Format("2006-01-02T15:04:05.000000Z")
				contentOrder = appendKeyOnce(contentOrder, "is_addon", "original_phase_lock_date")
			}
		}

		var gallery []any
		var fileNamesOrdered [][2]string
		seenNames := map[string]bool{}
		if names, ok := content["file_names"].(map[string]any); ok {
			keys := make([]string, 0, len(names))
			for key := range names {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				if text, ok := names[key].(string); ok {
					fileNamesOrdered = append(fileNamesOrdered, [2]string{key, text})
					seenNames[key] = true
				}
			}
		}
		if existing, ok := content["gallery"].([]any); ok {
			gallery = append(gallery, existing...)
		}

		if len(input.gallery) > 0 {
			for _, upload := range input.gallery {
				stored, err := storeVaultFile("milestone_files", upload.filename, upload.data)
				if err != nil {
					slog.Error("milestone-store: file", "error", err)
					serverError(w)
					return
				}
				gallery = append(gallery, stored)
				if !seenNames[stored] {
					fileNamesOrdered = append(fileNamesOrdered, [2]string{stored, upload.filename})
					seenNames[stored] = true
				}
			}
			content["gallery"] = gallery
			if !hasContentKey(contentOrder, content, "gallery") {
				contentOrder = append(contentOrder, "gallery")
			}
			fileNamesMap := map[string]any{}
			for _, pair := range fileNamesOrdered {
				fileNamesMap[pair[0]] = pair[1]
			}
			content["file_names"] = fileNamesMap
			if !hasContentKey(contentOrder, content, "file_names") {
				contentOrder = append(contentOrder, "file_names")
			}
		}

		contentJSON, err := json.Marshal(content)
		if err != nil {
			slog.Error("milestone-store: content", "error", err)
			serverError(w)
			return
		}
		_ = contentOrder

		milestoneType := "milestone"
		if activeSub {
			if subRole, err := activeSubRole(ctx, pool, projectID, viewer.id); err == nil && subRole != "" {
				milestoneType = subRole
			}
		} else if input.milestoneType != "" {
			milestoneType = input.milestoneType
		}

		sortOrder := int64(0)
		if input.sortOrder != nil {
			sortOrder = *input.sortOrder
		}

		fkColumn, fkValue, fkOK := milestoneRoleFK(ctx, pool, viewer, input)
		if !fkOK {
			message(w, http.StatusInternalServerError, "We could not save that milestone. Please try again.")
			return
		}

		var startDate, dueDate *string
		if input.startDate != "" {
			if parsed, perr := parseLooseDate(input.startDate); perr == nil {
				formatted := parsed.Format("2006-01-02")
				startDate = &formatted
			}
		}
		if input.dueDate != "" {
			if parsed, perr := parseLooseDate(input.dueDate); perr == nil {
				formatted := parsed.Format("2006-01-02")
				dueDate = &formatted
			}
		}

		var createdID int64
		err = pool.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, description, start_date, due_date, type, sort_order, phase_context, content, is_completed, approval_status, `+fkColumn+`, created_at, updated_at)
			VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9::jsonb, false, 'pending', $10, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
			projectID, input.title, input.description, startDate, dueDate, milestoneType, sortOrder, phase, string(contentJSON), fkValue).Scan(&createdID)
		if err != nil {
			slog.Error("milestone-store: insert", "error", err)
			message(w, http.StatusInternalServerError, "We could not save that milestone. Please try again.")
			return
		}

		if input.costImpact != "" {
			if parsed, perr := strconv.ParseFloat(input.costImpact, 64); perr == nil && parsed > 0 {
				timeImpact := int64(0)
				if input.timeImpact != nil {
					timeImpact = *input.timeImpact
				}
				addonDesc := input.title
				if input.description != nil && *input.description != "" {
					addonDesc = *input.description
				}
				addonDesc = "Automatically generated fee request for add-on: " + addonDesc
				if _, err := pool.Exec(ctx, `INSERT INTO project_change_orders (project_id, requested_by, role_type, milestone_id, title, description, cost_impact, time_impact_days, status, created_at, updated_at)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'proposed', date_trunc('second', now()), date_trunc('second', now()))`,
					projectID, viewer.id, viewer.role, createdID, "Additional Fee: "+input.title, addonDesc, input.costImpact, timeImpact); err != nil {
					slog.Error("milestone-store: change order", "error", err)
					serverError(w)
					return
				}
			}
		}

		if err := syncMilestoneVault(ctx, pool, projectID, createdID); err != nil {
			slog.Error("milestone-store: vault", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLogPool(ctx, pool, projectID, viewer.id, "milestone_added", "Added: "+input.title); err != nil {
			slog.Error("milestone-store: log", "error", err)
			serverError(w)
			return
		}

		entry, err := buildStoreResponse(ctx, pool, input, createdID, projectID, content, contentOrder, gallery, fileNamesOrdered, milestoneType, sortOrder, input.sortText, phase, fkColumn, fkValue, startDate, dueDate)
		if err != nil {
			slog.Error("milestone-store: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)

		writeJSON(w, http.StatusOK, payload)
	}
}

// buildStoreResponse renders the 201 in create order: the validated
// fields in rule order (present keys only), then project_id,
// updated_at, created_at, id, and the six professional trees plus the
// fresh change orders. Unset FKs are absent — never null — because
// Eloquent only serializes attributes it actually set.
func buildStoreResponse(ctx context.Context, pool *pgxpool.Pool, input milestoneInput, createdID, projectID int64, content map[string]any, contentOrder []string, gallery []any, fileNames [][2]string, milestoneType string, sortOrder int64, sortText, phase, fkColumn string, fkValue *int64, startDate, dueDate *string) (*jsonphp.Object, error) {
	entry := jsonphp.NewObject()
	entry.Set("title", input.title)
	entry.Set("description", nullableString(input.description))
	entry.Set("start_date", milestoneDateValue(startDate))
	entry.Set("due_date", milestoneDateValue(dueDate))
	entry.Set("type", milestoneType)
	if sortText != "" {
		entry.Set("sort_order", sortText)
	} else {
		entry.Set("sort_order", sortOrder)
	}
	entry.Set("phase_context", phase)
	entry.Set("content", renderStoreContent(ctx, contentOrder, content, gallery, fileNames))
	entry.Set("is_completed", false)
	entry.Set("approval_status", "pending")
	if fkValue != nil {
		entry.Set(fkColumn, *fkValue)
	}
	entry.Set("project_id", projectID)
	entry.Set("updated_at", projectTimeValue(time.Now().UTC()))
	entry.Set("created_at", projectTimeValue(time.Now().UTC()))
	entry.Set("id", createdID)

	profiles := map[string]*int64{"arsitek_id": nil, "kontraktor_id": nil, "notaris_id": nil, "interior_id": nil, "structural_id": nil, "mep_id": nil}
	if fkValue != nil {
		profiles[fkColumn] = fkValue
	}
	for _, relation := range []struct {
		key   string
		table string
		fk    string
	}{
		{"arsitek", "arsiteks", "arsitek_id"},
		{"kontraktor", "kontraktors", "kontraktor_id"},
		{"notaris", "notaris_profiles", "notaris_id"},
		{"interior", "interior_profiles", "interior_id"},
		{"structural", "structural_engineers", "structural_id"},
		{"mep", "mep_engineers", "mep_id"},
	} {
		profile, err := milestoneProfile(ctx, pool, relation.table, profiles[relation.fk])
		if err != nil {
			return nil, err
		}
		entry.Set(relation.key, profile)
	}

	changeOrders, err := milestoneChangeOrders(ctx, pool, &createdID)
	if err != nil {
		return nil, err
	}
	entry.Set("change_orders", changeOrders)

	return entry, nil
}

// milestoneDateValue renders an optional Y-m-d string as Carbon.
func milestoneDateValue(value *string) any {
	if value == nil || *value == "" {
		return nil
	}
	if parsed, err := parseLooseDate(*value); err == nil {
		return projectTimeValue(parsed.UTC())
	}
	return projectTimeValue(value)
}

// renderStoreContent emits the content in key order with the gallery
// paths resolved to storage URLs. file_names follows upload order.
func renderStoreContent(ctx context.Context, order []string, content map[string]any, gallery []any, fileNames [][2]string) *jsonphp.Object {
	entry := jsonphp.NewObject()

	seenGallery := false
	seenNames := false
	for _, key := range order {
		switch key {
		case "gallery":
			seenGallery = true
			entry.Set("gallery", resolveGalleryURLs(ctx, gallery))
		case "file_names":
			seenNames = true
			names := jsonphp.NewObject()
			for _, pair := range fileNames {
				names.Set(pair[0], pair[1])
			}
			entry.Set("file_names", names)
		default:
			if value, ok := content[key]; ok {
				entry.Set(key, jsonOrNil(value))
			}
		}
	}

	if !seenGallery && len(gallery) > 0 {
		entry.Set("gallery", resolveGalleryURLs(ctx, gallery))
		seenGallery = true
	}
	if !seenNames && len(fileNames) > 0 {
		names := jsonphp.NewObject()
		for _, pair := range fileNames {
			names.Set(pair[0], pair[1])
		}
		entry.Set("file_names", names)
	}

	_ = seenGallery
	return entry
}
