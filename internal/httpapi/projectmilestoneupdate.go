package httpapi

import (
	"context"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MILESTONE UPDATE — the professional's progress editor.
//
// Participants who pass canModifyMilestone may rename, describe and move
// their own row between in_progress / pending / revision, and upload up to
// ten gallery images. They can NEVER self-approve: `is_completed` and an
// `approved` status are stripped from the payload for non-owner/PM
// callers, because approval unlocks payment.
//
// Owner/PM approval runs the same finalization as the approve verb:
// pm_verified_at, completion, every linked locked/pending stage to
// pending, a vault resync, and an `Approved: {title}` activity line.
//
// Gallery handling has three sources, applied in this order:
//   1. `retained_gallery` (a JSON array of URLs) keeps only the stored
//      paths whose URL suffix or basename matches;
//   2. otherwise the stored gallery/file_names are preserved unless the
//      `content` JSON explicitly replaces them;
//   3. uploaded files append to both arrays under `milestone_files/`.
//
// The vault sync runs TWICE in the approval path (before and after the
// status flips to approved), matching the oracle's verified document
// rows.

// galleryUpload is one uploaded image.
type galleryUpload struct {
	filename string
	ext      string
	data     []byte
	isImage  bool
}

// milestoneUpdateInput is the validated payload.
type milestoneUpdateInput struct {
	title          *string
	description    *string
	revisionNotes  *string
	approvalStatus *string
	isCompleted    *bool
	contentText    *string
	galleryCount   int
	galleryFiles   []*galleryUpload
}

// UpdateMilestoneHandler serves
// `PUT /api/projects/{project}/milestones/{milestone}`.
func UpdateMilestoneHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, rawProject, ok := subRouteProject(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, rawProject)
			return
		}

		rawID := r.PathValue("milestone")
		if rawID == "" {
			rawID = lastPathSegment(r.URL.Path)
		}
		milestoneID, parseErr := strconv.ParseInt(rawID, 10, 64)
		if parseErr != nil {
			modelNotFound(w, `App\Models\ProjectMilestone`, rawID)
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
			slog.Error("milestone-update: viewer", "error", err)
			serverError(w)
			return
		}

		byName, found, err := loadMilestoneRow(ctx, pool, projectID, milestoneID)
		if err != nil {
			slog.Error("milestone-update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			message(w, http.StatusNotFound, "Not found.")
			return
		}

		if !canModifyMilestone(ctx, pool, viewer, projectID, byName) {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		projectFields, projectValues, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			slog.Error("milestone-update: project", "error", err)
			serverError(w)
			return
		}
		project := projectColumnsByName(projectFields, projectValues)
		ownerID, _ := project["user_id"].(int64)
		var pmProfile *int64
		if id, ok := project["pm_id"].(int64); ok {
			pmProfile = &id
		}
		projectTitle, _ := project["title"].(string)

		isOwner := viewer.id == ownerID
		isPM := viewer.role == "project_manager" && verifyAssignedPM(viewer, pmProfile)
		canFinalApprove := isOwner || isPM

		if !isPM && !isOwner {
			if locked, msg := milestoneHandoverLocked(byName, project); locked {
				message(w, http.StatusForbidden, msg)
				return
			}
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
		files := requestGalleryFiles(r)

		failures := &errorBag{}
		input := validateMilestoneUpdate(formFields, files, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		// SECURITY: only owner/PM may drive the approval flag.
		if !canFinalApprove {
			input.isCompleted = nil
			if input.approvalStatus != nil && *input.approvalStatus == "approved" {
				input.approvalStatus = nil
			}
		}

		oldContent, _ := byName["content"].(map[string]any)
		content := buildMilestoneContent(formFields, oldContent, input.galleryFiles)

		encoded, err := marshalOrderedContent(content)
		if err != nil {
			slog.Error("milestone-update: content", "error", err)
			serverError(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("milestone-update: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		sets := []string{"content = $2::jsonb", "updated_at = date_trunc('second', now())"}
		args := []any{milestoneID, encoded}
		add := func(column string, value any) {
			args = append(args, value)
			sets = append(sets, column+" = $"+strconv.Itoa(len(args)))
		}
		if input.title != nil {
			add("title", *input.title)
		}
		if input.description != nil {
			add("description", *input.description)
		}
		if input.revisionNotes != nil {
			add("revision_notes", *input.revisionNotes)
		}
		if input.approvalStatus != nil {
			add("approval_status", *input.approvalStatus)
		}
		if input.isCompleted != nil {
			add("is_completed", *input.isCompleted)
		}

		if _, err := tx.Exec(ctx, `UPDATE project_milestones SET `+strings.Join(sets, ", ")+` WHERE id = $1`, args...); err != nil {
			slog.Error("milestone-update: update", "error", err)
			serverError(w)
			return
		}

		if err := syncMilestoneVaultRunning(ctx, tx, projectID, milestoneID, viewer.id); err != nil {
			slog.Error("milestone-update: vault first", "error", err)
			serverError(w)
			return
		}

		includeProject := false
		finalized := false
		if canFinalApprove && input.approvalStatus != nil && *input.approvalStatus == "approved" {
			if _, err := tx.Exec(ctx, `UPDATE project_milestones SET pm_verified_at = date_trunc('second', now()),
				is_completed = true, approval_status = 'approved', updated_at = date_trunc('second', now())
				WHERE id = $1`, milestoneID); err != nil {
				slog.Error("milestone-update: finalize", "error", err)
				serverError(w)
				return
			}

			title, _ := byName["title"].(string)
			if input.title != nil {
				title = *input.title
			}

			rows, err := tx.Query(ctx, `SELECT id, COALESCE(label, '') FROM project_payment_termins
				WHERE milestone_id = $1 AND status::text IN ('locked', 'pending') ORDER BY id`, milestoneID)
			if err != nil {
				slog.Error("milestone-update: termins", "error", err)
				serverError(w)
				return
			}
			type staged struct {
				id    int64
				label string
			}
			stages := make([]staged, 0)
			for rows.Next() {
				var item staged
				if err := rows.Scan(&item.id, &item.label); err != nil {
					rows.Close()
					slog.Error("milestone-update: termin scan", "error", err)
					serverError(w)
					return
				}
				stages = append(stages, item)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				slog.Error("milestone-update: termin rows", "error", err)
				serverError(w)
				return
			}

			for _, stage := range stages {
				if _, err := tx.Exec(ctx, `UPDATE project_payment_termins SET status = 'pending',
					updated_at = date_trunc('second', now()) WHERE id = $1`, stage.id); err != nil {
					slog.Error("milestone-update: stage", "error", err)
					serverError(w)
					return
				}
				if err := insertActivityLog(ctx, tx, projectID, viewer.id, "payment_triggered",
					"Progress Verified: '"+title+"'. Payment Termin '"+stage.label+"' is now unlocked and awaiting owner approval."); err != nil {
					slog.Error("milestone-update: stage log", "error", err)
					serverError(w)
					return
				}
			}
			finalized = true
			includeProject = len(stages) > 0

			if err := syncMilestoneVaultRunning(ctx, tx, projectID, milestoneID, viewer.id); err != nil {
				slog.Error("milestone-update: vault second", "error", err)
				serverError(w)
				return
			}

			if err := insertActivityLog(ctx, tx, projectID, viewer.id, "milestone_approved",
				"Approved: "+title); err != nil {
				slog.Error("milestone-update: approved log", "error", err)
				serverError(w)
				return
			}
		}

		if input.approvalStatus != nil {
			switch *input.approvalStatus {
			case "pending":
				title, _ := byName["title"].(string)
				if input.title != nil {
					title = *input.title
				}
				if ownerID != viewer.id {
					if err := insertNotification(ctx, tx, ownerID, "milestone_updated",
						"Milestone Submitted for Approval",
						"\""+title+"\" on \""+projectTitle+"\" is awaiting your approval.",
						`{"project_id": `+strconv.FormatInt(projectID, 10)+`, "milestone_id": `+strconv.FormatInt(milestoneID, 10)+`}`); err != nil {
						slog.Error("milestone-update: notify owner", "error", err)
						serverError(w)
						return
					}
				}
				if pmUser := pmProfileUserID(ctx, tx, pmProfile); pmUser != 0 && pmUser != viewer.id {
					if err := insertNotification(ctx, tx, pmUser, "milestone_approval_needed",
						"Milestone Awaiting Verification",
						"\""+title+"\" on \""+projectTitle+"\" needs PM verification.",
						`{"project_id": `+strconv.FormatInt(projectID, 10)+`, "milestone_id": `+strconv.FormatInt(milestoneID, 10)+`}`); err != nil {
						slog.Error("milestone-update: notify pm", "error", err)
						serverError(w)
						return
					}
				}
			case "revision":
				proUser := milestoneProUserReloaded(ctx, tx, milestoneID)
				if proUser != 0 && proUser != viewer.id {
					title, _ := byName["title"].(string)
					if input.title != nil {
						title = *input.title
					}
					note := ""
					if input.revisionNotes != nil {
						note = *input.revisionNotes
					}
					if note == "" {
						note = "no details provided."
					}
					if err := insertNotification(ctx, tx, proUser, "milestone_revision_requested",
						"Revision Requested",
						"Revision requested for \""+title+"\": "+note,
						`{"project_id": `+strconv.FormatInt(projectID, 10)+`, "milestone_id": `+strconv.FormatInt(milestoneID, 10)+`}`); err != nil {
						slog.Error("milestone-update: notify revision", "error", err)
						serverError(w)
						return
					}
				}
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("milestone-update: commit", "error", err)
			serverError(w)
			return
		}

		entry, err := milestoneApproveObject(ctx, pool, projectID, milestoneID, milestoneRenderFlags{
			includeProject:   includeProject,
			pmVerifiedCarbon: finalized,
		})
		if err != nil {
			slog.Error("milestone-update: render", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// requestGalleryFiles collects every uploaded gallery image.
func requestGalleryFiles(r *http.Request) []*galleryUpload {
	if r.MultipartForm == nil || r.MultipartForm.File == nil {
		return nil
	}
	out := make([]*galleryUpload, 0)
	for _, key := range []string{"gallery[]", "gallery"} {
		headers := r.MultipartForm.File[key]
		for _, header := range headers {
			upload, err := readGalleryFile(header)
			if err != nil {
				continue
			}
			out = append(out, upload)
		}
		if len(out) > 0 {
			break
		}
	}
	return out
}

// readGalleryFile loads one multipart image.
func readGalleryFile(header *multipart.FileHeader) (*galleryUpload, error) {
	file, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return nil, err
	}
	head := data
	if len(head) > 512 {
		head = head[:512]
	}
	return &galleryUpload{
		filename: header.Filename,
		ext:      strings.ToLower(strings.TrimPrefix(extensionOf(header.Filename), ".")),
		data:     data,
		isImage:  strings.HasPrefix(detectContentType(head), "image/"),
	}, nil
}

// validateMilestoneUpdate enforces the controller's rules.
func validateMilestoneUpdate(fields map[string]any, files []*galleryUpload, failures *errorBag) milestoneUpdateInput {
	var input milestoneUpdateInput

	if raw, present := fields["title"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("title", "The title field must be a string.")
		} else if len([]rune(s)) > 255 {
			failures.add("title", "The title field must not be greater than 255 characters.")
		} else {
			dup := s
			input.title = &dup
		}
	}

	if raw, present := fields["description"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("description", "The description field must be a string.")
		} else {
			dup := s
			input.description = &dup
		}
	}

	if raw, present := fields["is_completed"]; present && raw != nil {
		if parsed, ok := laravelBoolean(raw); ok {
			dup := parsed
			input.isCompleted = &dup
		} else {
			failures.add("is_completed", "The is completed field must be true or false.")
		}
	}

	if raw, present := fields["approval_status"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("approval_status", "The selected approval status is invalid.")
		} else if s != "in_progress" && s != "pending" && s != "approved" && s != "revision" {
			failures.add("approval_status", "The selected approval status is invalid.")
		} else {
			dup := s
			input.approvalStatus = &dup
		}
	}

	if raw, present := fields["revision_notes"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("revision_notes", "The revision notes field must be a string.")
		} else {
			dup := s
			input.revisionNotes = &dup
		}
	}

	if raw, present := fields["content"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("content", "The content field must be a string.")
		} else {
			dup := s
			input.contentText = &dup
		}
	}

	// The `gallery` FIELD (JSON body) must be an array of images; uploads are
	// validated per file with `gallery.{i}` keys.
	if raw, present := fields["gallery"]; present && raw != nil {
		list, isList := raw.([]any)
		if !isList {
			failures.add("gallery", "The gallery field must be an array.")
		} else if len(list) > 10 {
			failures.add("gallery", "The gallery field must not have more than 10 items.")
		} else {
			for i := range list {
				failures.add("gallery."+strconv.Itoa(i), "The gallery."+strconv.Itoa(i)+" field must be an image.")
			}
		}
	}

	if len(files) > 10 {
		failures.add("gallery", "The gallery field must not have more than 10 items.")
	}
	for i, file := range files {
		key := "gallery." + strconv.Itoa(i)
		if !file.isImage {
			failures.add(key, "The "+key+" field must be an image.")
			continue
		}
		switch file.ext {
		case "jpeg", "png", "jpg", "gif", "webp":
		default:
			failures.add(key, "The "+key+" field must be a file of type: jpeg, png, jpg, gif, webp.")
		}
		if file.sizeBytes() > 5120*1024 {
			failures.add(key, "The "+key+" field must not be greater than 5120 kilobytes.")
		}
	}
	input.galleryFiles = files

	return input
}

// sizeBytes reports the upload size.
func (g *galleryUpload) sizeBytes() int64 { return int64(len(g.data)) }

// laravelBoolean accepts the boolean spellings Laravel does.
func laravelBoolean(value any) (bool, bool) {
	switch typed := value.(type) {
	case bool:
		return typed, true
	case float64:
		if typed == 0 {
			return false, true
		}
		if typed == 1 {
			return true, true
		}
	case string:
		switch typed {
		case "1", "true":
			return true, true
		case "0", "false":
			return false, true
		}
	}
	return false, false
}

// buildMilestoneContent applies retained_gallery, preservation and uploads.
func buildMilestoneContent(fields map[string]any, oldContent map[string]any, uploads []*galleryUpload) map[string]any {
	content := map[string]any{}
	if raw, present := fields["content"]; present {
		if text, ok := raw.(string); ok && text != "" {
			decoded := decodeJSONValue(text)
			if obj, ok := decoded.(map[string]any); ok {
				content = obj
			}
		}
	}

	oldGallery := stringList(oldContent["gallery"])
	oldNames, _ := oldContent["file_names"].(map[string]any)

	if raw, present := fields["retained_gallery"]; present {
		if text, ok := raw.(string); ok {
			var retained []any
			if decoded := decodeJSONValue(text); decoded != nil {
				retained, _ = decoded.([]any)
			}
			gallery := []any{}
			fileNames := map[string]any{}
			for _, oldPath := range oldGallery {
				for _, item := range retained {
					urlText, ok := item.(string)
					if !ok {
						continue
					}
					parsed, err := url.Parse(urlText)
					if err != nil || parsed.Path == "" {
						continue
					}
					decodedPath, err := url.PathUnescape(parsed.Path)
					if err != nil {
						decodedPath = parsed.Path
					}
					if strings.HasSuffix(decodedPath, oldPath) || path.Base(decodedPath) == path.Base(oldPath) {
						gallery = append(gallery, oldPath)
						if name, ok := oldNames[oldPath]; ok {
							fileNames[oldPath] = name
						}
						break
					}
				}
			}
			content["gallery"] = gallery
			content["file_names"] = fileNames
		}
	} else {
		if _, set := content["gallery"]; !set {
			if raw, had := oldContent["gallery"]; had {
				content["gallery"] = raw
			}
		}
		if _, set := content["file_names"]; !set {
			if raw, had := oldContent["file_names"]; had {
				content["file_names"] = raw
			}
		}
	}

	if len(uploads) > 0 {
		gallery := stringList(content["gallery"])
		fileNames, _ := content["file_names"].(map[string]any)
		if fileNames == nil {
			fileNames = map[string]any{}
		}
		outGallery := make([]any, 0, len(gallery)+len(uploads))
		for _, item := range gallery {
			outGallery = append(outGallery, item)
		}
		for _, upload := range uploads {
			stored, err := storeVaultFile("milestone_files", upload.filename, upload.data)
			if err != nil {
				continue
			}
			outGallery = append(outGallery, stored)
			fileNames[stored] = upload.filename
		}
		content["gallery"] = outGallery
		content["file_names"] = fileNames
	}

	return content
}

// stringList renders a JSON array of strings.
func stringList(value any) []string {
	list, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// marshalOrderedContent writes the content object for jsonb.
func marshalOrderedContent(content map[string]any) (string, error) {
	encoded, err := jsonphp.Marshal(content)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

// syncMilestoneVaultRunning mirrors the gallery from the row AS IT IS
// inside the running transaction.
func syncMilestoneVaultRunning(ctx context.Context, tx pgx.Tx, projectID, milestoneID, uploaderID int64) error {
	var content *string
	var title, milestoneType, approvalStatus, phaseContext *string
	var arsitekID, kontraktorID, notarisID, interiorID, structuralID, mepID *int64
	var isCompleted bool
	err := tx.QueryRow(ctx, `SELECT content::text, title, type, approval_status::text, phase_context,
		arsitek_id, kontraktor_id, notaris_id, interior_id, structural_id, mep_id, is_completed
		FROM project_milestones WHERE id = $1`, milestoneID).Scan(
		&content, &title, &milestoneType, &approvalStatus, &phaseContext,
		&arsitekID, &kontraktorID, &notarisID, &interiorID, &structuralID, &mepID, &isCompleted)
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

	fileNames := map[string]string{}
	if content != nil {
		decoded := decodeJSONValue(*content)
		if obj, ok := decoded.(map[string]any); ok {
			if names, ok := obj["file_names"].(map[string]any); ok {
				for key, value := range names {
					if s, ok := value.(string); ok {
						fileNames[key] = s
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
		err := tx.QueryRow(ctx, `SELECT id FROM project_documents WHERE project_id = $1 AND file_path = $2`,
			projectID, filePath).Scan(&existingID)
		if err == nil {
			if _, err := tx.Exec(ctx, `UPDATE project_documents SET uploader_id = $1, file_name = $2,
				file_type = $3, category = $4, status = $5, version_label = $6, target_role = $7,
				updated_at = date_trunc('second', now()) WHERE id = $8`,
				uploaderID, name, filepathExtLower(filePath), category, status, titleText, targetRole, existingID); err != nil {
				return err
			}
			continue
		}

		if _, err := tx.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path,
			file_type, category, status, version_label, target_role, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, date_trunc('second', now()), date_trunc('second', now()))`,
			projectID, uploaderID, name, filePath, filepathExtLower(filePath), category, status, titleText, targetRole); err != nil {
			return err
		}
	}

	return nil
}

// milestoneProUserReloaded reads the pro user from the row inside the tx.
func milestoneProUserReloaded(ctx context.Context, tx pgx.Tx, milestoneID int64) int64 {
	var arsitekID, kontraktorID, notarisID, interiorID, structuralID, mepID *int64
	if err := tx.QueryRow(ctx, `SELECT arsitek_id, kontraktor_id, notaris_id, interior_id, structural_id, mep_id
		FROM project_milestones WHERE id = $1`, milestoneID).Scan(
		&arsitekID, &kontraktorID, &notarisID, &interiorID, &structuralID, &mepID); err != nil {
		return 0
	}

	for _, pair := range []struct {
		id    *int64
		table string
	}{
		{arsitekID, "arsiteks"},
		{kontraktorID, "kontraktors"},
		{notarisID, "notaris_profiles"},
		{interiorID, "interior_profiles"},
		{structuralID, "structural_engineers"},
		{mepID, "mep_engineers"},
	} {
		if pair.id == nil || *pair.id == 0 {
			continue
		}
		var userID *int64
		if err := tx.QueryRow(ctx, `SELECT user_id FROM `+pair.table+` WHERE id = $1`, *pair.id).Scan(&userID); err == nil && userID != nil {
			return *userID
		}
	}
	return 0
}
