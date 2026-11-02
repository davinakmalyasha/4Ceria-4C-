package httpapi

import (
	"context"
	"github.com/davinakmalyasha/4ceria/internal/domain/authz"
	"github.com/davinakmalyasha/4ceria/internal/domain/identity"
	"github.com/jackc/pgx/v5"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PROJECT REQUIREMENTS — the bill of materials.
//
// GET lists every requirement with its requester and folder. POST mints
// one (optional vault image, zeroed stock counters, a restock history row
// and an activity log). Both gate on the hire rule — owner or hired
// professional of the licensed roles (arsitek, kontraktor, project
// manager, interior, structural, mep; structural/mep also pass as active
// sub-professionals) — never a stranger, never a notary.

// requirementRow is one scanned requirement with its columns.
type requirementRow struct {
	fields []string
	values []any
	byName map[string]any
}

// scanRequirementRow reads one requirement row.
func scanRequirementRow(rows pgx.Rows, width int) (requirementRow, error) {
	fields := fieldNames(rows)
	values, err := scanRow(rows, len(fields))
	if err != nil {
		return requirementRow{}, err
	}

	byName := map[string]any{}
	for i, column := range fields {
		byName[column] = values[i]
	}

	return requirementRow{fields: fields, values: values, byName: byName}, nil
}

// requirementObject renders one requirement: table columns in order with
// the decimal casts, the image_url append, and the user + folder links.
func requirementObject(ctx context.Context, pool *pgxpool.Pool, row requirementRow, withFolder bool) (*jsonphp.Object, error) {
	byName := row.byName

	entry := jsonphp.NewObject()
	for _, column := range row.fields {
		value := byName[column]
		switch column {
		case "quantity_required", "estimated_unit_cost", "quantity_procured_externally", "external_cost", "quantity_on_site", "quantity_used":
			entry.Set(column, decimalOrNilBid(byName, column))
		case "created_at", "updated_at":
			entry.Set(column, projectTimeValue(value))
		default:
			entry.Set(column, projectRawValue(value))
		}
	}

	entry.Set("image_url", requirementImageURL(ctx, byName["image_path"]))

	user, err := nullableUser(ctx, pool, intPtrOf(byName["user_id"]))
	if err != nil {
		return nil, err
	}
	entry.Set("user", user)

	if withFolder {
		folder, err := requirementFolder(ctx, pool, intPtrOf(byName["folder_id"]))
		if err != nil {
			return nil, err
		}
		entry.Set("folder", folder)
	}

	return entry, nil
}

// requirementImageURL mirrors getImageUrlAttribute: null when empty,
// pass-through for absolute URLs, otherwise the public storage path.
//
// Locally the vault IS the public disk, whose temporaryUrl throws — so the
// helper falls through to the plain storage path whether or not the file
// exists. Either way the bytes are deterministic.
func requirementImageURL(ctx context.Context, value any) any {
	path, ok := value.(string)
	if !ok || path == "" {
		return nil
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}

	return "/storage/" + strings.TrimPrefix(path, "/")
}

// requirementFolder renders one material folder row or null.
func requirementFolder(ctx context.Context, pool *pgxpool.Pool, folderID *int64) (any, error) {
	if folderID == nil || *folderID == 0 {
		return nil, nil
	}

	var id, projectID, createdBy *int64
	var name, bomType *string
	var createdAt, updatedAt any

	err := pool.QueryRow(ctx, `SELECT id, project_id, name, bom_type, created_by, created_at, updated_at FROM project_material_folders WHERE id = $1`, *folderID).Scan(
		&id, &projectID, &name, &bomType, &createdBy, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	entry.Set("id", nullableInt64(id))
	entry.Set("project_id", nullableInt64(projectID))
	entry.Set("name", nullableString(name))
	entry.Set("bom_type", nullableString(bomType))
	entry.Set("created_by", nullableInt64(createdBy))
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("updated_at", projectTimeValue(updatedAt))

	return entry, nil
}

// requirementGate reports whether the caller may read or write the
// project's bill of materials: the owner, or a hired professional of a
// licensed role (structural/mep also pass as active sub-professionals).
func requirementGate(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer, projectID int64, ownerID int64) (bool, error) {
	if viewer.id == ownerID {
		return true, nil
	}

	subject, err := loadSubject(ctx, pool, viewer.id)
	if err != nil {
		return false, err
	}

	for _, role := range []string{"arsitek", "kontraktor", "project_manager", "interior", "structural", "mep"} {
		if subject.RoleType() != role {
			continue
		}

		parties, err := loadProjectParties(ctx, pool, projectID)
		if err != nil {
			return false, err
		}

		if authz.Matches(parties, subject, identity.Role(role)) {
			return true, nil
		}

		if role == "structural" || role == "mep" {
			var activeSub bool
			if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_sub_professionals WHERE project_id = $1 AND user_id = $2 AND sub_role = $3 AND status::text = 'active')`,
				projectID, viewer.id, role).Scan(&activeSub); err != nil {
				return false, err
			}
			if activeSub {
				return true, nil
			}
		}
	}

	return false, nil
}

// RequirementsHandler serves `GET /api/projects/{project}/requirements`.
func RequirementsHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
			slog.Error("requirements: viewer", "error", err)
			serverError(w)
			return
		}

		fields, values, err := projectRowByID(ctx, pool, projectID)
		if err != nil {
			if isNoRows(err) {
				modelNotFound(w, `App\Models\Project`, raw)
				return
			}
			slog.Error("requirements: project", "error", err)
			serverError(w)
			return
		}

		ownerID, _ := projectColumnsByName(fields, values)["user_id"].(int64)

		allowed, err := requirementGate(ctx, pool, viewer, projectID, ownerID)
		if err != nil {
			slog.Error("requirements: gate", "error", err)
			serverError(w)
			return
		}
		if !allowed {
			message(w, http.StatusForbidden, "Unauthorized.")
			return
		}

		rows, err := pool.Query(ctx, `SELECT * FROM project_requirements WHERE project_id = $1 ORDER BY id`, projectID)
		if err != nil {
			slog.Error("requirements: list", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			row, err := scanRequirementRow(rows, 20)
			if err != nil {
				slog.Error("requirements: scan", "error", err)
				serverError(w)
				return
			}

			entry, err := requirementObject(ctx, pool, row, true)
			if err != nil {
				slog.Error("requirements: render", "error", err)
				serverError(w)
				return
			}
			out = append(out, entry)
		}
		if err := rows.Err(); err != nil {
			slog.Error("requirements: rows", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)

		writeJSON(w, http.StatusOK, payload)
	}
}
