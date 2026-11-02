package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROFESSIONAL PORTFOLIOS — four routes over `professional_portfolios`.
//
//   - GET ?user_id=… answers a BARE JSON ARRAY of the user's items (no `data`
//     wrapper), newest first; a missing user_id is a 400 "User ID is required"
//     (no trailing period).
//   - POST creates (200, `{message, data}`); the created model is in PAYLOAD
//     order, then updated_at BEFORE created_at, then id.
//   - POST /{id} updates (ownership 403 "Unauthorized") and answers the
//     hydrated model in table order.
//   - DELETE /{id} removes the row and its file.

// portfolioColumns is the `professional_portfolios` table order.
var portfolioColumns = []string{
	"id", "user_id", "role_type", "title", "description", "image_path",
	"duration", "client_review", "created_at", "updated_at",
}

// portfolioObject renders a hydrated row in table order.
func portfolioObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range portfolioColumns {
		switch column {
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	return entry
}

// portfolioCreatedObject renders Eloquent's CREATED model.
func portfolioCreatedObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range []string{
		"user_id", "role_type", "title", "description", "duration",
		"client_review", "image_path",
	} {
		entry.Set(column, projectRawValue(byName[column]))
	}
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// portfolioRow reads one row.
func portfolioRow(pool *pgxpool.Pool, r *http.Request, id int64) (map[string]any, bool, error) {
	rows, err := pool.Query(r.Context(), `SELECT `+strings.Join(portfolioColumns, ", ")+`
		FROM professional_portfolios WHERE id = $1`, id)
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

// portfolioImageFailures applies image|mimes:jpeg,png,jpg,webp|max:5120.
func portfolioImageFailures(upload *galleryUpload, key string, failures *errorBag) {
	attr := houseAttrName(key)
	if !upload.isImage {
		failures.add(key, "The "+attr+" field must be an image.")
	}
	switch upload.ext {
	case "jpeg", "png", "jpg", "webp":
		if upload.sizeBytes() > 5120*1024 {
			failures.add(key, "The "+attr+" field must not be greater than 5120 kilobytes.")
		}
	default:
		failures.add(key, "The "+attr+" field must be a file of type: jpeg, png, jpg, webp.")
	}
}

// portfolioRoleTypes is the controller's allow-list.
var portfolioRoleTypes = []string{
	"user", "arsitek", "kontraktor", "notaris", "interior", "structural",
	"mep", "project_manager", "supplier", "logistics",
}

// PortfoliosIndexHandler serves `GET /api/portfolios`.
func PortfoliosIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := r.URL.Query().Get("user_id")
		if raw == "" {
			message(w, http.StatusBadRequest, "User ID is required")
			return
		}
		userID, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			message(w, http.StatusBadRequest, "User ID is required")
			return
		}

		rows, err := pool.Query(r.Context(), `SELECT `+strings.Join(portfolioColumns, ", ")+`
			FROM professional_portfolios WHERE user_id = $1
			ORDER BY created_at DESC, id ASC`, userID)
		if err != nil {
			slog.Error("portfolios: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("portfolios: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			out = append(out, portfolioObject(byName))
		}

		// A BARE array — the controller answers `response()->json($portfolios)`.
		writeJSON(w, http.StatusOK, out)
	}
}

// portfolioInput is the validated payload.
type portfolioInput struct {
	roleType     string
	title        string
	description  string
	duration     any
	clientReview any
	image        *galleryUpload
}

// validatePortfolio applies the store or update rules.
func validatePortfolio(r *http.Request, fields map[string]any, failures *errorBag, update bool) portfolioInput {
	var in portfolioInput

	if !update {
		if raw, present := fields["role_type"]; !present || raw == nil {
			failures.add("role_type", "The role type field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("role_type", "The selected role type is invalid.")
		} else {
			valid := false
			for _, candidate := range portfolioRoleTypes {
				if candidate == text {
					valid = true
					break
				}
			}
			if !valid {
				failures.add("role_type", "The selected role type is invalid.")
			} else {
				in.roleType = text
			}
		}
	}

	in.title, _ = houseField(fields, "title", true, 255, false, nil, 0, failures)

	if raw, present := fields["description"]; !present || raw == nil {
		failures.add("description", "The description field is required.")
	} else if text, ok := raw.(string); !ok {
		failures.add("description", "The description field must be a string.")
	} else {
		in.description = text
	}

	durationMax := 0
	if update {
		durationMax = 255
	}
	if raw, present := fields["duration"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("duration", "The duration field must be a string.")
		} else if durationMax > 0 && len([]rune(text)) > durationMax {
			failures.add("duration", "The duration field must not be greater than "+strconv.Itoa(durationMax)+" characters.")
		} else {
			in.duration = text
		}
	}

	reviewMax := 0
	if update {
		reviewMax = 1000
	}
	if raw, present := fields["client_review"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("client_review", "The client review field must be a string.")
		} else if reviewMax > 0 && len([]rune(text)) > reviewMax {
			failures.add("client_review", "The client review field must not be greater than "+strconv.Itoa(reviewMax)+" characters.")
		} else {
			in.clientReview = text
		}
	}

	images := requestFilesNamed(r, "image")
	if len(images) > 0 {
		in.image = images[0]
		portfolioImageFailures(images[0], "image", failures)
	}
	return in
}

// StorePortfolioHandler serves `POST /api/portfolios`.
func StorePortfolioHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}

		failures := &errorBag{}
		input := validatePortfolio(r, fields, failures, false)
		if !failures.empty() {
			failures.write(w)
			return
		}

		var imagePath any
		if input.image != nil {
			stored, err := storeVaultFile("portfolios", input.image.filename, input.image.data)
			if err != nil {
				slog.Error("portfolio store: image", "error", err)
				serverError(w)
				return
			}
			imagePath = stored
		}

		var id int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO professional_portfolios
			(user_id, role_type, title, description, duration, client_review, image_path,
			 created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			caller.UserID(), input.roleType, input.title, input.description,
			input.duration, input.clientReview, imagePath).Scan(&id, &createdAt, &updatedAt); err != nil {
			slog.Error("portfolio store: insert", "error", err)
			serverError(w)
			return
		}

		created := map[string]any{
			"id": id, "user_id": caller.UserID(), "role_type": input.roleType,
			"title": input.title, "description": input.description,
			"duration": input.duration, "client_review": input.clientReview,
			"image_path": imagePath, "created_at": createdAt, "updated_at": updatedAt,
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Portfolio added successfully")
		payload.Set("data", portfolioCreatedObject(created))
		writeJSON(w, http.StatusOK, payload)
	}
}

// UpdatePortfolioHandler serves `POST /api/portfolios/{id}`.
func UpdatePortfolioHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("id")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\ProfessionalPortfolio`, raw)
			return
		}
		current, found, err := portfolioRow(pool, r, id)
		if err != nil {
			slog.Error("portfolio update: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProfessionalPortfolio`, raw)
			return
		}
		if intPtrDeref(current["user_id"]) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}
		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}

		failures := &errorBag{}
		input := validatePortfolio(r, fields, failures, true)
		if !failures.empty() {
			failures.write(w)
			return
		}

		imagePath := current["image_path"]
		if input.image != nil {
			if old, ok := imagePath.(string); ok && old != "" {
				_ = removeVaultFile(old)
			}
			stored, err := storeVaultFile("portfolios", input.image.filename, input.image.data)
			if err != nil {
				slog.Error("portfolio update: image", "error", err)
				serverError(w)
				return
			}
			imagePath = stored
		}

		if _, err := pool.Exec(ctx, `UPDATE professional_portfolios
			SET title = $2, description = $3, duration = $4, client_review = $5,
			    image_path = $6, updated_at = date_trunc('second', now())
			WHERE id = $1`,
			id, input.title, input.description, input.duration, input.clientReview,
			imagePath); err != nil {
			slog.Error("portfolio update: exec", "error", err)
			serverError(w)
			return
		}

		fresh, _, err := portfolioRow(pool, r, id)
		if err != nil {
			slog.Error("portfolio update: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Portfolio updated successfully")
		payload.Set("data", portfolioObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}

// DestroyPortfolioHandler serves `DELETE /api/portfolios/{id}`.
func DestroyPortfolioHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("id")
		if raw == "" {
			raw = lastPathSegment(r.URL.Path)
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\ProfessionalPortfolio`, raw)
			return
		}
		current, found, err := portfolioRow(pool, r, id)
		if err != nil {
			slog.Error("portfolio destroy: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\ProfessionalPortfolio`, raw)
			return
		}
		if intPtrDeref(current["user_id"]) != caller.UserID() {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		if path, ok := current["image_path"].(string); ok && path != "" {
			_ = removeVaultFile(path)
		}

		if _, err := pool.Exec(ctx, `DELETE FROM professional_portfolios WHERE id = $1`, id); err != nil {
			slog.Error("portfolio destroy: delete", "error", err)
			serverError(w)
			return
		}

		message(w, http.StatusOK, "Portfolio deleted successfully")
	}
}
