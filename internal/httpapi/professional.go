package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// THE PROFESSIONAL UPDATE.
//
// `POST /api/me/professional` accepts the user fields plus the role's profile
// fields, creates the profile row when the user has none, stores the KYC text
// metadata, replaces the notary's services, and answers with the FULL relation
// list — structural_engineer, mep_engineer and supplier included, which
// `PUT /api/me` omits.
//
// Files are validated, not persisted (see profile.go): a KYC upload lands on the
// private disk under a RANDOM name, so its stored path cannot be byte-identical
// without the shared store. The shadow tests send text only.

// stringFields validates a list of nullable|string fields and returns the ones
// present, in order.
func stringFields(fields map[string]any, keys []string, max int, failures *errorBag) map[string]string {
	updates := map[string]string{}

	for _, key := range keys {
		if text, ok := optionalText(fields, key, max, failures); ok {
			updates[key] = text
		}
	}

	return updates
}

// numericFields validates a list of nullable|numeric fields.
func numericFields(fields map[string]any, keys []string, failures *errorBag) map[string]string {
	updates := map[string]string{}

	for _, key := range keys {
		if text, ok := optionalNumeric(fields, key, failures); ok {
			updates[key] = text
		}
	}

	return updates
}

// ensureProfile returns the profile id, creating the row when the user has none.
func ensureProfile(ctx context.Context, pool *pgxpool.Pool, table, nameColumn string, userID int64, userName string) (int64, error) {
	var id int64

	err := pool.QueryRow(ctx, fmt.Sprintf(
		`SELECT id FROM %s WHERE user_id = $1`, table,
	), userID).Scan(&id)

	if err == nil {
		return id, nil
	}

	err = pool.QueryRow(ctx, fmt.Sprintf(
		`INSERT INTO %s (user_id, %s) VALUES ($1, $2) RETURNING id`, table, nameColumn,
	), userID, userName).Scan(&id)

	return id, err
}

// applyUpdates writes the validated column map.
func applyUpdates(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64, updates map[string]string) error {
	if len(updates) == 0 {
		return nil
	}

	set := make([]string, 0, len(updates))
	args := make([]any, 0, len(updates)+1)

	for column, value := range updates {
		args = append(args, value)
		set = append(set, fmt.Sprintf("%s = $%d", column, len(args)))
	}

	// Deterministic SQL: the map order must not leak into the statement.
	// (Sort by column for a stable query shape.)
	for i := range set {
		for j := i + 1; j < len(set); j++ {
			if set[i] > set[j] {
				set[i], set[j] = set[j], set[i]
				args[i], args[j] = args[j], args[i]
			}
		}
	}

	args = append(args, profileID)

	_, err := pool.Exec(ctx, fmt.Sprintf(
		`UPDATE %s SET %s, updated_at = date_trunc('second', now()) WHERE id = $%d`,
		table, strings.Join(set, ", "), len(args),
	), args...)

	return err
}

// verificationText validates the shared KYC text metadata.
func verificationText(fields map[string]any, failures *errorBag) map[string]string {
	updates := map[string]string{}

	for _, key := range []string{"company_name", "company_license"} {
		if text, ok := optionalText(fields, key, 255, failures); ok {
			updates[key] = text
		}
	}

	for _, key := range []string{"identity_number", "npwp_number", "siup_number"} {
		if text, ok := optionalText(fields, key, 100, failures); ok {
			updates[key] = text
		}
	}

	if text, ok := optionalText(fields, "entity_type", 0, failures); ok {
		if text != "individual" && text != "company" {
			failures.add("entity_type", "The selected entity_type is invalid.")
		} else {
			updates["entity_type"] = text
		}
	}

	return updates
}

// verificationFiles validates the shared KYC file fields.
func verificationFiles(files map[string]*uploadedFile, failures *errorBag) map[string]bool {
	present := map[string]bool{}

	specs := []struct {
		key   string
		mimes []string
		max   int64
	}{
		{"foto", []string{"jpg", "png", "jpeg"}, 5120},
		{"file_portofolio", []string{"pdf", "zip", "jpg", "png"}, 10240},
		{"file_sertifikat", []string{"pdf", "jpg", "png"}, 5120},
		{"npwp", []string{"pdf", "jpg", "png"}, 5120},
		{"siup", []string{"pdf", "jpg", "png"}, 5120},
	}

	for _, spec := range specs {
		if files[spec.key] == nil {
			continue
		}

		present[spec.key] = true
		validateFile(spec.key, files[spec.key], false, spec.mimes, spec.max, failures)
	}

	return present
}

// maybeVerify flips a profile to pending when new KYC arrived.
func maybeVerify(ctx context.Context, pool *pgxpool.Pool, table string, profileID int64, text map[string]string, files map[string]bool) error {
	hasNewDoc := len(files) > 0

	for _, key := range []string{"identity_number", "npwp_number", "siup_number"} {
		if text[key] != "" {
			hasNewDoc = true
		}
	}

	if !hasNewDoc {
		return nil
	}

	_, err := pool.Exec(ctx, fmt.Sprintf(
		`UPDATE %s SET verification_status = 'pending', updated_at = date_trunc('second', now())
		  WHERE id = $1 AND verification_status <> 'verified'`,
		table,
	), profileID)

	return err
}

// UpdateProfessionalHandler serves `POST /api/me/professional`.
func UpdateProfessionalHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()
		fields, files, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}

		failures := &errorBag{}

		name, _ := requireText(fields, "name", 255, failures)
		email, emailOK := requireText(fields, "email", 255, failures)
		username, usernameOK := requireText(fields, "username", 255, failures)

		if emailOK && !strings.Contains(email, "@") {
			failures.add("email", "The email field must be a valid email address.")
			emailOK = false
		}

		if emailOK {
			if taken, err := uniqueViolation(ctx, pool, "email", email, caller.UserID()); err != nil {
				slog.Error("me.professional: unique email", "error", err)
				serverError(w)
				return
			} else if taken {
				failures.add("email", "The email has already been taken.")
				emailOK = false
			}
		}

		if usernameOK {
			if taken, err := uniqueViolation(ctx, pool, "username", username, caller.UserID()); err != nil {
				slog.Error("me.professional: unique username", "error", err)
				serverError(w)
				return
			} else if taken {
				failures.add("username", "The username has already been taken.")
				usernameOK = false
			}
		}

		// The role fields are validated up front, in role order, so a request
		// carrying two roles' fields fails on the FIRST role's first error —
		// the same order Laravel validates in.
		type rolePlan struct {
			table      string
			nameColumn string
			strings    []string
			numerics   []string
		}

		var plan *rolePlan

		switch userRole(ctx, pool, caller.UserID()) {
		case "arsitek":
			plan = &rolePlan{"arsiteks", "nama",
				[]string{"spesialisasi", "lokasi", "no_telp", "deskripsi", "pendidikan", "alasan_hire"},
				[]string{"rate_harga", "pengalaman_tahun"}}
		case "kontraktor", "civil", "mechanical", "electrical", "plumbing", "roofing", "finishing":
			// Laravel merges the aliases BEFORE validating, so `lokasi` feeds
			// `alamat`, `no_telp` feeds `no_telepon`, and so on — and the
			// VALIDATED keys are the canonical ones.
			alias(fields, "lokasi", "alamat")
			alias(fields, "no_telp", "no_telepon")
			alias(fields, "pengalaman_tahun", "pengalaman")
			alias(fields, "deskripsi", "alasan_hire")

			plan = &rolePlan{"kontraktors", "nama",
				[]string{"nama_perusahaan", "alamat", "no_telepon", "jenis", "pendidikan", "alasan_hire", "spesialisasi"},
				[]string{"rate_harga"}}
		case "interior":
			plan = &rolePlan{"interior_profiles", "nama",
				[]string{"spesialisasi", "lokasi", "no_telp", "deskripsi"},
				[]string{"rate_harga", "pengalaman_tahun"}}
		case "notaris":
			plan = &rolePlan{"notaris_profiles", "nama",
				[]string{"nama", "no_telp", "nomor_sk", "wilayah_kerja", "spesialisasi", "lokasi", "deskripsi"},
				[]string{"pengalaman_tahun", "rate_harga"}}
		case "project_manager":
			plan = &rolePlan{"project_managers", "nama",
				[]string{"spesialisasi", "lokasi", "no_telp", "deskripsi", "pendidikan", "alasan_hire"},
				[]string{"rate_harga", "pengalaman_tahun"}}
		case "structural":
			plan = &rolePlan{"structural_engineers", "nama",
				[]string{"spesialisasi", "lokasi", "no_telp", "deskripsi", "pendidikan", "alasan_hire"},
				[]string{"rate_harga", "pengalaman_tahun"}}
		case "mep":
			plan = &rolePlan{"mep_engineers", "nama",
				[]string{"spesialisasi", "lokasi", "no_telp", "deskripsi", "pendidikan", "alasan_hire"},
				[]string{"rate_harga", "pengalaman_tahun"}}
		}

		var roleUpdates map[string]string
		var roleNumerics map[string]string

		if plan != nil {
			roleUpdates = stringFields(fields, plan.strings, 255, failures)
			roleNumerics = numericFields(fields, plan.numerics, failures)

			for key, value := range roleNumerics {
				roleUpdates[key] = value
			}
		}

		textUpdates := verificationText(fields, failures)
		filePresent := verificationFiles(files, failures)

		if !failures.empty() {
			failures.write(w)
			return
		}

		if _, err := pool.Exec(ctx,
			`UPDATE users SET name = $1, email = $2, username = $3, updated_at = date_trunc('second', now()) WHERE id = $4`,
			name, email, username, caller.UserID(),
		); err != nil {
			slog.Error("me.professional: user", "error", err)
			serverError(w)
			return
		}

		if phoneInput, ok := fields["phone_numbers"]; ok {
			if err := syncPhoneNumbers(ctx, pool, caller.UserID(), phoneInput); err != nil {
				slog.Error("me.professional: phones", "error", err)
				serverError(w)
				return
			}
		}

		if plan != nil {
			profileID, err := ensureProfile(ctx, pool, plan.table, plan.nameColumn, caller.UserID(), name)
			if err != nil {
				slog.Error("me.professional: ensure", "error", err)
				serverError(w)
				return
			}

			// The KYC text rides on the same update as the role fields.
			for key, value := range textUpdates {
				roleUpdates[key] = value
			}

			if err := applyUpdates(ctx, pool, plan.table, profileID, roleUpdates); err != nil {
				slog.Error("me.professional: profile", "error", err)
				serverError(w)
				return
			}

			if err := maybeVerify(ctx, pool, plan.table, profileID, textUpdates, filePresent); err != nil {
				slog.Error("me.professional: verify", "error", err)
				serverError(w)
				return
			}

			// The notary's services are replaced wholesale.
			if plan.table == "notaris_profiles" {
				if raw, ok := fields["services"]; ok && raw != nil {
					var services []struct {
						Title       string  `json:"title"`
						Price       any     `json:"price"`
						Description *string `json:"description"`
					}

					if text, ok := raw.(string); ok {
						if err := json.Unmarshal([]byte(text), &services); err != nil {
							services = nil
						}
					} else if list, ok := raw.([]any); ok {
						encoded, _ := json.Marshal(list)
						_ = json.Unmarshal(encoded, &services)
					}

					if services != nil {
						if _, err := pool.Exec(ctx, `DELETE FROM notaris_services WHERE notaris_id = $1`, profileID); err != nil {
							slog.Error("me.professional: services clear", "error", err)
							serverError(w)
							return
						}

						for _, service := range services {
							if _, err := pool.Exec(ctx,
								`INSERT INTO notaris_services (notaris_id, title, price, description) VALUES ($1, $2, $3, $4)`,
								profileID, service.Title, priceText(service.Price), service.Description,
							); err != nil {
								slog.Error("me.professional: services add", "error", err)
								serverError(w)
								return
							}
						}
					}
				}
			}
		}

		user, err := loadUser(ctx, pool, caller.UserID())
		if err != nil {
			slog.Error("me.professional: reload", "error", err)
			serverError(w)
			return
		}

		resource, err := userResource(ctx, pool, user, caller.UserID(), caller.IsAdmin(), professionalRelations(user.Role))
		if err != nil {
			slog.Error("me.professional: resource", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Professional profile updated successfully")
		payload.Set("user", resource)

		writeJSON(w, http.StatusOK, payload)
	}
}

// userRole reads the caller's role for the role switch above.
func userRole(ctx context.Context, pool *pgxpool.Pool, userID int64) string {
	var role string

	_ = pool.QueryRow(ctx, `SELECT role_type::text FROM users WHERE id = $1`, userID).Scan(&role)

	return role
}

// alias copies fields[from] to fields[to] when the target is absent.
func alias(fields map[string]any, from, to string) {
	if _, ok := fields[to]; ok {
		return
	}

	if value, ok := fields[from]; ok {
		fields[to] = value
	}
}

// priceText renders a service price for the numeric column.
func priceText(value any) string {
	switch typed := value.(type) {
	case nil:
		return "0"
	case string:
		if strings.TrimSpace(typed) == "" {
			return "0"
		}

		return strings.TrimSpace(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return fmt.Sprintf("%v", typed)
	}
}
