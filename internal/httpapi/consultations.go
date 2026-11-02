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

// NOTARY CONSULTATIONS — booking, listing and the notary's lifecycle actions.
//
//   - POST validates the naive WIB wall clock, caps pending bookings at five a
//     day, refuses a duplicate slot, creates the row and notifies the notary.
//   - GET lists the caller's bookings (as client OR as the booked notary's
//     user), oldest schedule first, with `notaris.user` and `user`.
//   - POST /{id}/respond is notary-only; confirm/reject/reschedule/complete
//     move the status with their own 422s and notify the client.
//
// `schedule_date` is a `datetime` cast: stored UTC, rendered as Carbon ISO.

// consultationColumns is the `notaris_consultations` table order.
var consultationColumns = []string{
	"id", "notaris_id", "user_id", "schedule_date", "status", "notes",
	"created_at", "updated_at",
}

// wib is Asia/Jakarta (fixed +07:00 — Indonesia has no DST).
var wib = time.FixedZone("WIB", 7*3600)

// consultationLayouts are the wall-clock shapes Carbon::parse accepts here.
var consultationLayouts = []string{
	"2006-01-02T15:04:05",
	"2006-01-02T15:04",
	"2006-01-02 15:04:05",
	"2006-01-02 15:04",
	"2006-01-02",
	time.RFC3339,
}

// parseScheduleDate parses a WIB wall clock and returns it in UTC.
func parseScheduleDate(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	for _, layout := range consultationLayouts {
		if parsed, err := time.ParseInLocation(layout, value, wib); err == nil {
			return parsed.UTC(), true
		}
	}
	return time.Time{}, false
}

// consultationObject renders a row in table order.
func consultationObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range consultationColumns {
		switch column {
		case "schedule_date", "created_at", "updated_at":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	return entry
}

// consultationCreatedObject renders Eloquent's CREATED model.
func consultationCreatedObject(byName map[string]any) *jsonphp.Object {
	entry := jsonphp.NewObject()
	for _, column := range []string{"notaris_id", "user_id", "schedule_date", "status", "notes"} {
		switch column {
		case "schedule_date":
			entry.Set(column, projectTimeValue(byName[column]))
		default:
			entry.Set(column, projectRawValue(byName[column]))
		}
	}
	entry.Set("updated_at", projectTimeValue(byName["updated_at"]))
	entry.Set("created_at", projectTimeValue(byName["created_at"]))
	entry.Set("id", projectRawValue(byName["id"]))
	return entry
}

// consultationRow reads one consultation.
func consultationRow(ctx context.Context, pool *pgxpool.Pool, id int64) (map[string]any, bool, error) {
	rows, err := pool.Query(ctx, `SELECT `+strings.Join(consultationColumns, ", ")+`
		FROM notaris_consultations WHERE id = $1`, id)
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

// wibStamp is Carbon's `d M Y H:i` in Asia/Jakarta.
func wibStamp(value any) string {
	switch typed := value.(type) {
	case time.Time:
		return typed.In(wib).Format("02 Jan 2006 15:04")
	}
	return ""
}

// consultationNotary renders the `notaris.user` relation.
func consultationNotary(ctx context.Context, pool *pgxpool.Pool, notarisID int64) (any, error) {
	block, err := profileModelObject(ctx, pool, "notaris_profiles", notarisID, false)
	if err != nil {
		return nil, err
	}
	var userID int64
	_ = pool.QueryRow(ctx, `SELECT user_id FROM notaris_profiles WHERE id = $1`, notarisID).Scan(&userID)
	user, err := fullProfileUser(ctx, pool, userID, false)
	if err != nil {
		return nil, err
	}
	block.Set("user", user)
	return block, nil
}

// ConsultationsIndexHandler serves `GET /api/consultations`.
func ConsultationsIndexHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		rows, err := pool.Query(ctx, `SELECT `+strings.Join(consultationColumns, ", ")+`
			FROM notaris_consultations c
			WHERE c.user_id = $1
			   OR EXISTS (SELECT 1 FROM notaris_profiles p
			               WHERE p.id = c.notaris_id AND p.user_id = $1)
			ORDER BY c.schedule_date ASC, c.id ASC`, caller.UserID())
		if err != nil {
			slog.Error("consultations: query", "error", err)
			serverError(w)
			return
		}
		defer rows.Close()

		out := make([]any, 0)
		for rows.Next() {
			fields := fieldNames(rows)
			values, err := scanRow(rows, len(fields))
			if err != nil {
				slog.Error("consultations: scan", "error", err)
				serverError(w)
				return
			}
			byName := map[string]any{}
			for i, column := range fields {
				byName[column] = values[i]
			}
			entry := consultationObject(byName)
			notary, err := consultationNotary(ctx, pool, intPtrDeref(byName["notaris_id"]))
			if err != nil {
				slog.Error("consultations: notary", "error", err)
				serverError(w)
				return
			}
			entry.Set("notaris", notary)
			user, err := fullProfileUser(ctx, pool, intPtrDeref(byName["user_id"]), false)
			if err != nil {
				slog.Error("consultations: user", "error", err)
				serverError(w)
				return
			}
			entry.Set("user", user)
			out = append(out, entry)
		}

		payload := jsonphp.NewObject()
		payload.Set("data", out)
		writeJSON(w, http.StatusOK, payload)
	}
}

// StoreConsultationHandler serves `POST /api/consultations`.
func StoreConsultationHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}

		var notarisID int64
		if raw, present := fields["notaris_id"]; !present || raw == nil {
			failures.add("notaris_id", "The notaris id field is required.")
		} else if text, ok := numericTextOf(raw); ok && isIntegerText(text) {
			parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64)
			if err != nil || !existsID(ctx, pool, "notaris_profiles", parsed) {
				failures.add("notaris_id", "The selected notaris id is invalid.")
			} else {
				notarisID = parsed
			}
		} else {
			failures.add("notaris_id", "The selected notaris id is invalid.")
		}

		var scheduleUTC time.Time
		scheduleOK := false
		if raw, present := fields["schedule_date"]; !present || raw == nil {
			failures.add("schedule_date", "The schedule date field is required.")
		} else if text, ok := raw.(string); !ok {
			failures.add("schedule_date", "The schedule date field must be a string.")
		} else if parsed, ok := parseScheduleDate(text); !ok {
			failures.add("schedule_date", "The schedule date is not a valid datetime.")
		} else if parsed.Before(time.Now().UTC()) {
			failures.add("schedule_date", "The schedule date must be a datetime in the future.")
		} else {
			scheduleUTC = parsed
			scheduleOK = true
		}

		var notes any
		if raw, present := fields["notes"]; present && raw != nil {
			if text, ok := raw.(string); !ok {
				failures.add("notes", "The notes field must be a string.")
			} else if len([]rune(text)) > 2000 {
				failures.add("notes", "The notes field must not be greater than 2000 characters.")
			} else {
				notes = text
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}
		if !scheduleOK {
			return
		}

		var notaryUserID int64
		if err := pool.QueryRow(ctx, `SELECT user_id FROM notaris_profiles WHERE id = $1`,
			notarisID).Scan(&notaryUserID); err != nil || notaryUserID == 0 {
			message(w, http.StatusNotFound, "Notary not found.")
			return
		}

		var daily int64
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM notaris_consultations
			WHERE user_id = $1 AND status = 'pending' AND created_at >= now() - interval '1 day'`,
			caller.UserID()).Scan(&daily)
		if daily >= 5 {
			message(w, http.StatusTooManyRequests,
				"You have too many pending consultation requests. Please wait for confirmations.")
			return
		}

		var existing bool
		_ = pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM notaris_consultations
			WHERE notaris_id = $1 AND user_id = $2 AND schedule_date = $3
			  AND status IN ('pending', 'confirmed'))`,
			notarisID, caller.UserID(), scheduleUTC).Scan(&existing)
		if existing {
			message(w, http.StatusUnprocessableEntity, "You already have a consultation booked for this time.")
			return
		}

		var id int64
		var createdAt, updatedAt any
		if err := pool.QueryRow(ctx, `INSERT INTO notaris_consultations
			(notaris_id, user_id, schedule_date, status, notes, created_at, updated_at)
			VALUES ($1, $2, $3, 'pending', $4, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id, created_at, updated_at`,
			notarisID, caller.UserID(), scheduleUTC, notes).Scan(&id, &createdAt, &updatedAt); err != nil {
			slog.Error("consultation store: insert", "error", err)
			serverError(w)
			return
		}

		created := map[string]any{
			"id": id, "notaris_id": notarisID, "user_id": caller.UserID(),
			"schedule_date": scheduleUTC, "status": "pending", "notes": notes,
			"created_at": createdAt, "updated_at": updatedAt,
		}

		var senderName string
		_ = pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, caller.UserID()).Scan(&senderName)
		body := senderName + " requested a consultation on " + scheduleUTC.In(wib).Format("02 Jan 2006 15:04") + " WIB."
		data, _ := jsonphp.Marshal(func() *jsonphp.Object {
			entry := jsonphp.NewObject()
			entry.Set("consultation_id", id)
			entry.Set("notaris_id", notarisID)
			return entry
		}())
		if err := insertNotificationPool(ctx, pool, notaryUserID, "consultation_requested",
			"New Consultation Booking", body, string(data)); err != nil {
			slog.Warn("consultation store: notify", "error", err)
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Consultation booked successfully.")
		payload.Set("data", consultationCreatedObject(created))
		writeJSON(w, http.StatusCreated, payload)
	}
}

// RespondConsultationHandler serves
// `POST /api/consultations/{consultation}/respond`.
func RespondConsultationHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
		ctx := r.Context()

		raw := r.PathValue("consultation")
		if raw == "" {
			raw = lastPathSegment(strings.TrimSuffix(r.URL.Path, "/respond"))
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || raw == "" {
			modelNotFound(w, `App\Models\NotarisConsultation`, raw)
			return
		}
		byName, found, err := consultationRow(ctx, pool, id)
		if err != nil {
			slog.Error("consultation respond: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\NotarisConsultation`, raw)
			return
		}

		var notaryUserID int64
		_ = pool.QueryRow(ctx, `SELECT user_id FROM notaris_profiles WHERE id = $1`,
			intPtrDeref(byName["notaris_id"])).Scan(&notaryUserID)
		if notaryUserID == 0 || notaryUserID != caller.UserID() {
			message(w, http.StatusForbidden, "Only the booked notary can manage this consultation.")
			return
		}

		fields, _, ferr := requestFields(r)
		if ferr != nil {
			fields = map[string]any{}
		}
		failures := &errorBag{}

		action := ""
		if rawAction, present := fields["action"]; !present || rawAction == nil {
			failures.add("action", "The action field is required.")
		} else if text, ok := rawAction.(string); !ok {
			failures.add("action", "The selected action is invalid.")
		} else if text != "confirm" && text != "reject" && text != "reschedule" && text != "complete" {
			failures.add("action", "The selected action is invalid.")
		} else {
			action = text
		}

		var newSchedule time.Time
		newScheduleOK := false
		if rawDate, present := fields["schedule_date"]; present && rawDate != nil {
			if text, ok := rawDate.(string); !ok {
				failures.add("schedule_date", "The schedule date field must be a string.")
			} else if parsed, ok := parseScheduleDate(text); !ok {
				failures.add("schedule_date", "The schedule date is not a valid datetime.")
			} else if parsed.Before(time.Now().UTC()) {
				failures.add("schedule_date", "The new schedule must be in the future.")
			} else {
				newSchedule = parsed
				newScheduleOK = true
			}
		} else if action == "reschedule" {
			failures.add("schedule_date", "The schedule date field is required when action is reschedule.")
		}

		var notes any
		notesSet := false
		if rawNotes, present := fields["notes"]; present && rawNotes != nil {
			if text, ok := rawNotes.(string); !ok {
				failures.add("notes", "The notes field must be a string.")
			} else if len([]rune(text)) > 2000 {
				failures.add("notes", "The notes field must not be greater than 2000 characters.")
			} else {
				notes = text
				notesSet = true
			}
		}
		if !failures.empty() {
			failures.write(w)
			return
		}

		status := stringOf(byName["status"])
		notesText := ""
		if text, ok := byName["notes"].(string); ok {
			notesText = text
		}
		notificationType := "consultation_confirmed"
		body := ""

		switch action {
		case "confirm":
			if status != "pending" {
				message(w, http.StatusUnprocessableEntity, "Only pending bookings can be confirmed.")
				return
			}
			body = "Your consultation on " + wibStamp(byName["schedule_date"]) + " WIB has been CONFIRMED."
			if _, err := pool.Exec(ctx, `UPDATE notaris_consultations SET status = 'confirmed',
				updated_at = date_trunc('second', now()) WHERE id = $1`, id); err != nil {
				slog.Error("consultation respond: confirm", "error", err)
				serverError(w)
				return
			}

		case "reject":
			if status == "completed" || status == "cancelled" {
				message(w, http.StatusUnprocessableEntity, "This booking is already closed.")
				return
			}
			reason := "no reason given"
			if notesSet {
				if text, ok := notes.(string); ok && text != "" {
					reason = text
				}
			}
			merged := "Declined: " + reason
			if notesText != "" {
				merged = notesText + "\n" + merged
			}
			notificationType = "consultation_declined"
			body = "Your consultation request was declined by the notary. "
			if notesSet {
				if text, ok := notes.(string); ok {
					body += text
				}
			}
			if _, err := pool.Exec(ctx, `UPDATE notaris_consultations SET status = 'cancelled',
				notes = $2, updated_at = date_trunc('second', now()) WHERE id = $1`, id, merged); err != nil {
				slog.Error("consultation respond: reject", "error", err)
				serverError(w)
				return
			}

		case "reschedule":
			if status != "pending" && status != "confirmed" {
				message(w, http.StatusUnprocessableEntity, "Only active bookings can be rescheduled.")
				return
			}
			if !newScheduleOK {
				return
			}
			old := wibStamp(byName["schedule_date"])
			notificationType = "consultation_rescheduled"
			body = "Consultation rescheduled from " + old + " to " + newSchedule.In(wib).Format("02 Jan 2006 15:04") + " WIB."
			if _, err := pool.Exec(ctx, `UPDATE notaris_consultations SET schedule_date = $2,
				status = 'confirmed', updated_at = date_trunc('second', now()) WHERE id = $1`,
				id, newSchedule); err != nil {
				slog.Error("consultation respond: reschedule", "error", err)
				serverError(w)
				return
			}

		default:
			if status != "confirmed" {
				message(w, http.StatusUnprocessableEntity, "Only confirmed bookings can be completed.")
				return
			}
			notificationType = "consultation_completed"
			body = "Your consultation has been marked complete"
			if notesSet {
				if text, ok := notes.(string); ok && text != "" {
					body += ". Notes: " + text
				} else {
					body += "."
				}
			} else {
				body += "."
			}
			if _, err := pool.Exec(ctx, `UPDATE notaris_consultations SET status = 'completed',
				updated_at = date_trunc('second', now()) WHERE id = $1`, id); err != nil {
				slog.Error("consultation respond: complete", "error", err)
				serverError(w)
				return
			}
		}

		data, _ := jsonphp.Marshal(func() *jsonphp.Object {
			entry := jsonphp.NewObject()
			entry.Set("consultation_id", id)
			entry.Set("notaris_id", intPtrDeref(byName["notaris_id"]))
			return entry
		}())
		if err := insertNotificationPool(ctx, pool, intPtrDeref(byName["user_id"]), notificationType,
			"Consultation Update", body, string(data)); err != nil {
			slog.Warn("consultation respond: notify", "error", err)
		}

		fresh, _, err := consultationRow(ctx, pool, id)
		if err != nil {
			slog.Error("consultation respond: reload", "error", err)
			serverError(w)
			return
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Consultation updated.")
		payload.Set("data", consultationObject(fresh))
		writeJSON(w, http.StatusOK, payload)
	}
}
