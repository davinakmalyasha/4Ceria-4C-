package httpapi

import (
	"context"
	"crypto/rand"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MATERIAL QUOTE LIFECYCLE — the five money verbs.
//
//   - request-payment: the supplier names the freight, but never ABOVE the
//     platform tariff (Rp 50.000 for the first 5 km, Rp 4.000 per extra km
//     over a 1.3x-routed Haversine distance). Without a tariff the goods
//     value is the backstop.
//   - payment-proof: the buyer (or the assigned PM) uploads a receipt while
//     the quote is `awaiting_payment`; the file lands on the PRIVATE vault
//     and the supplier is told.
//   - mark-paid: the supplier confirms that receipt — the transition that
//     actually moves escrow, through the same ledger primitive every other
//     payment path uses, behind the dispute freeze.
//   - approve: creates the material order, its items and (for the platform
//     courier) the delivery job in one transaction.
//   - post-delivery-job: the supplier queues a courier job for the quote.
//
// Tariff pricing is a float calculation on the oracle side (deg2rad/sin/
// cos/asin are float64 there too), so the port reproduces the same float64
// operations before rounding the RUPIAH amount up.

// quoteSupplierProfile reads the caller's supplier profile. loadViewer only
// indexes the seven bid roles, so `suppliers` is looked up here.
func quoteSupplierProfile(ctx context.Context, pool *pgxpool.Pool, viewer *projectViewer) *int64 {
	if viewer.role != "supplier" {
		return nil
	}
	var id int64
	if err := pool.QueryRow(ctx, `SELECT id FROM suppliers WHERE user_id = $1`, viewer.id).Scan(&id); err != nil || id == 0 {
		return nil
	}
	return &id
}

// quoteSupplierGate answers "is this caller the quote's supplier?".
func quoteSupplierGate(viewer *projectViewer, supplierProfile *int64, quote map[string]any) bool {
	return supplierProfile != nil
}

// platformShippingTariff mirrors the controller's helper. It returns the
// tariff in MINOR units, or nil when the platform does not price the
// delivery.
func platformShippingTariff(quote map[string]any, supplier map[string]any, deliveryMethod string) *int64 {
	if deliveryMethod != "Hire Platform Courier" {
		return nil
	}

	quoteLat, okLat := quote["latitude"].(float64)
	quoteLng, okLng := quote["longitude"].(float64)
	supplierLat, okSLat := supplier["latitude"].(float64)
	supplierLng, okSLng := supplier["longitude"].(float64)
	if !okLat || !okLng || !okSLat || !okSLng {
		return nil
	}

	const earthRadiusKm = 6371.0
	lat1 := quoteLat * math.Pi / 180
	// The oracle converts the SUPPLIER coordinates first and the QUOTE
	// coordinates second.
	lat1 = supplierLat * math.Pi / 180
	lon1 := supplierLng * math.Pi / 180
	lat2 := quoteLat * math.Pi / 180
	lon2 := quoteLng * math.Pi / 180

	dLat := lat2 - lat1
	dLon := lon2 - lon1

	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1)*math.Cos(lat2)*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Asin(math.Sqrt(a))

	distanceKm := (earthRadiusKm * c) * 1.3

	base := int64(50000)
	var rupiah int64
	if distanceKm <= 5 {
		rupiah = base
	} else {
		rupiah = base + int64(math.Ceil((distanceKm-5)*4000))
	}
	minor := rupiah * 100
	return &minor
}

// supplierCoordinates reads the supplier row's lat/lng as floats.
func supplierCoordinates(ctx context.Context, pool *pgxpool.Pool, supplierID int64) map[string]any {
	out := map[string]any{}
	var lat, lng *float64
	_ = pool.QueryRow(ctx, `SELECT latitude::float8, longitude::float8 FROM suppliers WHERE id = $1`, supplierID).
		Scan(&lat, &lng)
	if lat != nil {
		out["latitude"] = *lat
	}
	if lng != nil {
		out["longitude"] = *lng
	}
	return out
}

// materialQuoteRefresh reads a quote after a write (items as ordered text).
func materialQuoteRefresh(ctx context.Context, pool *pgxpool.Pool, quoteID int64) (*jsonphp.Object, error) {
	byName, found, err := loadMaterialQuoteRow(ctx, pool, quoteID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, errLedgerGone
	}
	return materialQuoteObject(ctx, pool, byName, nil), nil
}

// RequestQuotePaymentHandler serves
// `PUT /api/material-quotes/{quote}/request-payment`.
func RequestQuotePaymentHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quoteID, raw, ok := quoteIDFromPath(r)
		if !ok {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
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
			slog.Error("quote request-payment: viewer", "error", err)
			serverError(w)
			return
		}
		byName, found, err := loadMaterialQuoteRow(ctx, pool, quoteID)
		if err != nil {
			slog.Error("quote request-payment: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
			return
		}
		var supplierProfile *int64
		if id := intPtrDeref(byName["supplier_id"]); id != 0 {
			supplierProfile = &id
		}
		own := quoteSupplierProfile(ctx, pool, viewer)
		if supplierProfile == nil || own == nil || *own != *supplierProfile {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		shippingText, deliveryMethod, totalWeight, weightSet := validateQuotePayment(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		requested := mustMinorValue(shippingText)
		supplier := supplierCoordinates(ctx, pool, *supplierProfile)
		tariff := platformShippingTariff(byName, supplier, deliveryMethod)

		if tariff != nil && requested > *tariff {
			message(w, http.StatusUnprocessableEntity,
				"Shipping cost exceeds the platform tariff for this delivery method. The maximum chargeable is Rp "+
					formatIDAmount(*tariff)+". Lower your figure or arrange delivery outside the platform.")
			return
		}

		if tariff == nil {
			goodsMinor := mustMinorValue(stringOf(byName["total_amount"]))
			if goodsMinor > 0 && requested > goodsMinor {
				message(w, http.StatusUnprocessableEntity,
					"Shipping cost exceeds the value of the goods. This delivery method is not priced by the platform, so a freight charge above the goods total requires a separate agreement with the buyer.")
				return
			}
		}

		weight := byName["total_weight"]
		if weightSet {
			weight = totalWeight
		}
		if _, err := pool.Exec(ctx, `UPDATE material_quotes SET shipping_cost = $2::numeric,
			delivery_method = $3, total_weight = $4::numeric, status = 'awaiting_payment',
			updated_at = date_trunc('second', now()) WHERE id = $1`,
			quoteID, formatMinor(requested), deliveryMethod, weight); err != nil {
			slog.Error("quote request-payment: update", "error", err)
			serverError(w)
			return
		}

		entry, err := materialQuoteRefresh(ctx, pool, quoteID)
		if err != nil {
			slog.Error("quote request-payment: render", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Payment requested from buyer.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// quoteIDFromPath reads the {quote} segment.
func quoteIDFromPath(r *http.Request) (int64, string, bool) {
	raw := r.PathValue("quote")
	if raw == "" {
		raw = lastPathSegment(r.URL.Path)
	}
	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || raw == "" {
		return 0, raw, false
	}
	return parsed, raw, true
}

// validateQuotePayment enforces shipping_cost required|numeric|min:0,
// delivery_method required|string and total_weight nullable|string.
func validateQuotePayment(fields map[string]any, failures *errorBag) (string, string, any, bool) {
	shipping := ""
	if raw, present := fields["shipping_cost"]; !present || raw == nil {
		failures.add("shipping_cost", "The shipping cost field is required.")
	} else if text, ok := numericTextOf(raw); ok && isNumericText(text) {
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil && parsed < 0 {
			failures.add("shipping_cost", "The shipping cost field must be at least 0.")
		} else {
			shipping = strings.TrimSpace(text)
		}
	} else {
		failures.add("shipping_cost", "The shipping cost field must be a number.")
	}

	deliveryMethod := ""
	if raw, present := fields["delivery_method"]; !present || raw == nil {
		failures.add("delivery_method", "The delivery method field is required.")
	} else if text, ok := raw.(string); !ok {
		failures.add("delivery_method", "The delivery method field must be a string.")
	} else {
		deliveryMethod = text
	}

	var weight any
	weightSet := false
	if raw, present := fields["total_weight"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("total_weight", "The total weight field must be a string.")
		} else {
			weight = text
			weightSet = true
		}
	}

	return shipping, deliveryMethod, weight, weightSet
}

// UploadQuotePaymentProofHandler serves
// `POST /api/material-quotes/{quote}/payment-proof`.
func UploadQuotePaymentProofHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quoteID, raw, ok := quoteIDFromPath(r)
		if !ok {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
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
			slog.Error("quote proof: viewer", "error", err)
			serverError(w)
			return
		}
		byName, found, err := loadMaterialQuoteRow(ctx, pool, quoteID)
		if err != nil {
			slog.Error("quote proof: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
			return
		}

		buyerID := intPtrDeref(byName["user_id"])
		isPm := false
		if viewer.role == "project_manager" {
			projectID := intPtrDeref(byName["project_id"])
			if projectID != 0 {
				if fields, values, perr := projectRowByID(ctx, pool, projectID); perr == nil {
					var pmProfile *int64
					if id, ok := projectColumnsByName(fields, values)["pm_id"].(int64); ok {
						pmProfile = &id
					}
					isPm = verifyAssignedPM(viewer, pmProfile)
				}
			}
		}
		if buyerID != viewer.id && !isPm {
			message(w, http.StatusForbidden, "Only the buyer can upload a payment proof.")
			return
		}

		if status := stringOf(byName["status"]); status != "awaiting_payment" {
			message(w, http.StatusUnprocessableEntity,
				"This quote is not awaiting payment (current: "+status+").")
			return
		}

		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
				return
			}
		}

		failures := &errorBag{}
		upload := validateQuoteProofFile(r, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		stored, err := storeVaultFile("payment_proofs", upload.filename, upload.data)
		if err != nil {
			slog.Error("quote proof: store", "error", err)
			serverError(w)
			return
		}

		if _, err := pool.Exec(ctx, `UPDATE material_quotes SET payment_proof_path = $2,
			updated_at = date_trunc('second', now()) WHERE id = $1`, quoteID, stored); err != nil {
			slog.Error("quote proof: update", "error", err)
			serverError(w)
			return
		}

		// Tell the supplier the receipt is waiting.
		var supplierUser *int64
		if supplierID := intPtrDeref(byName["supplier_id"]); supplierID != 0 {
			_ = pool.QueryRow(ctx, `SELECT user_id FROM suppliers WHERE id = $1`, supplierID).Scan(&supplierUser)
		}
		if supplierUser != nil {
			data := `{"material_quote_id": ` + strconv.FormatInt(quoteID, 10) + `}`
			if err := insertNotificationPool(ctx, pool, *supplierUser, "quote_payment_proof",
				"Payment Proof Uploaded",
				"The buyer uploaded a payment proof for quote #"+strconv.FormatInt(quoteID, 10)+". Please verify it to proceed.",
				data); err != nil {
				slog.Warn("quote proof: notify", "error", err)
			}
		}

		entry, err := materialQuoteRefresh(ctx, pool, quoteID)
		if err != nil {
			slog.Error("quote proof: render", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Payment proof uploaded. Waiting for supplier verification.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateQuoteProofFile enforces required|file|mimes:jpg,jpeg,png,webp,pdf|max:5120.
func validateQuoteProofFile(r *http.Request, failures *errorBag) *galleryUpload {
	files := requestFilesNamed(r, "payment_proof")
	if len(files) == 0 {
		failures.add("payment_proof", "The payment proof field is required.")
		return nil
	}
	upload := files[0]
	switch upload.ext {
	case "jpg", "jpeg", "png", "webp", "pdf":
	default:
		failures.add("payment_proof", "The payment proof field must be a file of type: jpg, jpeg, png, webp, pdf.")
		return nil
	}
	if upload.sizeBytes() > 5120*1024 {
		failures.add("payment_proof", "The payment proof field must not be greater than 5120 kilobytes.")
		return nil
	}
	return upload
}

// MarkQuotePaidHandler serves `PUT /api/material-quotes/{quote}/mark-paid`.
func MarkQuotePaidHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quoteID, raw, ok := quoteIDFromPath(r)
		if !ok {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
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
			slog.Error("quote mark-paid: viewer", "error", err)
			serverError(w)
			return
		}
		byName, found, err := loadMaterialQuoteRow(ctx, pool, quoteID)
		if err != nil {
			slog.Error("quote mark-paid: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
			return
		}
		var supplierProfile *int64
		if id := intPtrDeref(byName["supplier_id"]); id != 0 {
			supplierProfile = &id
		}
		own := quoteSupplierProfile(ctx, pool, viewer)
		if supplierProfile == nil || own == nil || *own != *supplierProfile {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		proofPath, _ := byName["payment_proof_path"].(string)
		if proofPath == "" {
			message(w, http.StatusUnprocessableEntity, "A payment proof is required before this quote can be marked as paid.")
			return
		}
		status := stringOf(byName["status"])
		if status == "paid" {
			message(w, http.StatusUnprocessableEntity, "This quote has already been marked as paid.")
			return
		}
		if status == "refunded" {
			message(w, http.StatusUnprocessableEntity, "This quote was refunded and cannot be marked as paid again.")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		notes, notesSet := validateQuoteNotes(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		amountMinor := mustMinorValue(stringOf(byName["total_amount"])) +
			mustMinorValue(stringOf(byName["shipping_cost"]))

		projectID := intPtrDeref(byName["project_id"])
		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("quote mark-paid: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if projectID != 0 {
			var openID int64
			var openTitle string
			if err := tx.QueryRow(ctx, `SELECT id, title FROM project_disputes
				WHERE project_id = $1 AND status::text = 'open' LIMIT 1`, projectID).
				Scan(&openID, &openTitle); err == nil {
				message(w, http.StatusUnprocessableEntity,
					"Payments are frozen: dispute #"+strconv.FormatInt(openID, 10)+" (\""+openTitle+"\") is open on this project. An admin must resolve it first.")
				return
			}

			var registryID int64
			if err := tx.QueryRow(ctx, `SELECT id FROM ledger_reference_types
				WHERE fqcn = 'App\Models\MaterialQuote' LIMIT 1`).Scan(&registryID); err != nil {
				slog.Error("quote mark-paid: registry", "error", err)
				serverError(w)
				return
			}

			if amountMinor > 0 {
				written, available, err := recordPaymentMinor(ctx, tx, projectID, amountMinor,
					"Payment: Material Quote #"+strconv.FormatInt(quoteID, 10),
					`App\Models\MaterialQuote`, quoteID, registryID, viewer.id, viewer.role)
				if err != nil {
					slog.Error("quote mark-paid: ledger", "error", err)
					serverError(w)
					return
				}
				if !written {
					message(w, http.StatusUnprocessableEntity,
						"Project budget is insufficient for this material payment. Available: Rp "+
							formatIDAmount(available)+".")
					return
				}

				// The oracle TOUCHES the project after writing the ledger row
				// (ProjectFinancialService's $project->touch()), which is how a
				// project listing's updated_at moves on a payment.
				if _, err := tx.Exec(ctx, `UPDATE projects SET updated_at = date_trunc('second', now()) WHERE id = $1`, projectID); err != nil {
					slog.Error("quote mark-paid: touch", "error", err)
					serverError(w)
					return
				}
			}
		}

		var notesArg any
		if notesSet {
			notesArg = notes
		}
		if _, err := tx.Exec(ctx, `UPDATE material_quotes SET status = 'paid',
			paid_at = date_trunc('second', now()), payment_verified_by = $2,
			payment_verified_at = date_trunc('second', now()), payment_notes = $3,
			updated_at = date_trunc('second', now()) WHERE id = $1`,
			quoteID, viewer.id, notesArg); err != nil {
			slog.Error("quote mark-paid: update", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("quote mark-paid: commit", "error", err)
			serverError(w)
			return
		}

		entry, err := materialQuoteRefresh(ctx, pool, quoteID)
		if err != nil {
			slog.Error("quote mark-paid: render", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Quote marked as paid.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateQuoteNotes enforces payment_notes nullable|string|max:1000.
func validateQuoteNotes(fields map[string]any, failures *errorBag) (string, bool) {
	notes := ""
	set := false
	if raw, present := fields["payment_notes"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("payment_notes", "The payment notes field must be a string.")
		} else if len([]rune(text)) > 1000 {
			failures.add("payment_notes", "The payment notes field must not be greater than 1000 characters.")
		} else if text != "" {
			notes = text
			set = true
		}
	}
	return notes, set
}

// ApproveQuoteHandler serves `POST /api/material-quotes/{quote}/approve`.
func ApproveQuoteHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quoteID, raw, ok := quoteIDFromPath(r)
		if !ok {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
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
			slog.Error("quote approve: viewer", "error", err)
			serverError(w)
			return
		}
		byName, found, err := loadMaterialQuoteRow(ctx, pool, quoteID)
		if err != nil {
			slog.Error("quote approve: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
			return
		}
		var supplierProfile *int64
		if id := intPtrDeref(byName["supplier_id"]); id != 0 {
			supplierProfile = &id
		}
		own := quoteSupplierProfile(ctx, pool, viewer)
		if supplierProfile == nil || own == nil || *own != *supplierProfile {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		input := validateQuoteApprove(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		status := stringOf(byName["status"])
		if status == "approved" {
			message(w, http.StatusUnprocessableEntity, "Quote already approved")
			return
		}

		shippingMinor := mustMinorValue(stringOf(byName["shipping_cost"]))
		if input.shippingCost != nil {
			shippingMinor = mustMinorValue(*input.shippingCost)
		}
		deliveryMethod := "Supplier Delivery"
		if text, ok := byName["delivery_method"].(string); ok && text != "" {
			deliveryMethod = text
		}
		if input.deliveryMethod != nil {
			deliveryMethod = *input.deliveryMethod
		}

		supplier := supplierCoordinates(ctx, pool, *supplierProfile)

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("quote approve: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		// Race guard: re-check under FOR UPDATE.
		var lockedStatus string
		if err := tx.QueryRow(ctx, `SELECT status FROM material_quotes WHERE id = $1 FOR UPDATE`,
			quoteID).Scan(&lockedStatus); err != nil {
			slog.Error("quote approve: lock", "error", err)
			serverError(w)
			return
		}
		if lockedStatus == "approved" {
			message(w, http.StatusUnprocessableEntity, "Quote already approved")
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE material_quotes SET status = 'approved',
			updated_at = date_trunc('second', now()) WHERE id = $1`, quoteID); err != nil {
			slog.Error("quote approve: quote update", "error", err)
			serverError(w)
			return
		}

		calculatedShipping := shippingMinor
		if deliveryMethod == "Hire Platform Courier" {
			if tariff := platformShippingTariff(byName, supplier, deliveryMethod); tariff != nil {
				calculatedShipping = *tariff
			}
		}

		totalMinor := mustMinorValue(stringOf(byName["total_amount"])) + calculatedShipping

		var projectArg any
		if projectID := intPtrDeref(byName["project_id"]); projectID != 0 {
			projectArg = projectID
		}
		var notesArg any
		if input.notes != nil {
			notesArg = *input.notes
		} else if note, ok := byName["note"].(string); ok && note != "" {
			notesArg = note
		}
		var weightArg any = byName["total_weight"]
		if input.totalWeight != nil {
			weightArg = *input.totalWeight
		}
		var latitudeArg, longitudeArg any
		if lat, ok := byName["latitude"].(float64); ok {
			latitudeArg = lat
		}
		if lng, ok := byName["longitude"].(float64); ok {
			longitudeArg = lng
		}
		var addressDetail any
		if text, ok := byName["address_detail"].(string); ok && text != "" {
			addressDetail = text
		}
		deliveryAddress := stringOf(byName["delivery_address"])

		var orderID int64
		if err := tx.QueryRow(ctx, `INSERT INTO material_orders
			(user_id, supplier_id, project_id, status, total_price, shipping_cost,
			 delivery_method, whatsapp_order_id, notes, delivery_address, address_detail,
			 latitude, longitude, total_weight, created_at, updated_at)
			VALUES ($1, $2, $3, 'pending', $4::numeric, $5::numeric, $6, $7, $8, $9, $10,
			 $11::numeric, $12::numeric, $13::numeric, date_trunc('second', now()), date_trunc('second', now()))
			RETURNING id`,
			intPtrDeref(byName["user_id"]), *supplierProfile, projectArg,
			formatMinor(totalMinor), formatMinor(calculatedShipping), deliveryMethod,
			"ORD-"+randomHexUpper(4), notesArg, deliveryAddress, addressDetail,
			numericArg(latitudeArg), numericArg(longitudeArg), weightArg).
			Scan(&orderID); err != nil {
			slog.Error("quote approve: order", "error", err)
			serverError(w)
			return
		}

		items := quoteItemsJSON(byName["items"])
		for _, item := range items {
			object, _ := item.(*jsonphp.Object)
			if object == nil {
				continue
			}
			var materialID, requirementID int64
			var quantity, price any
			if value, ok := object.Get("material_id"); ok {
				materialID = intPtrDeref(value)
			}
			if value, ok := object.Get("requirement_id"); ok {
				requirementID = intPtrDeref(value)
			}
			if value, ok := object.Get("qty"); ok {
				quantity = value
			}
			if value, ok := object.Get("price_at_quote"); ok {
				price = value
			}
			var requirementArg any
			if requirementID != 0 {
				requirementArg = requirementID
			}
			if _, err := tx.Exec(ctx, `INSERT INTO material_order_items
				(order_id, material_id, requirement_id, quantity, price_at_order, created_at, updated_at)
				VALUES ($1, $2, $3, $4::numeric, $5::numeric, date_trunc('second', now()), date_trunc('second', now()))`,
				orderID, materialID, requirementArg, quantity,
				formatMinor(mustMinorValue(stringOf(price)))); err != nil {
				slog.Error("quote approve: item", "error", err)
				serverError(w)
				return
			}
		}

		if deliveryMethod == "Hire Platform Courier" {
			var storeName, storeAddress string
			_ = tx.QueryRow(ctx, `SELECT COALESCE(store_name, 'Store'), COALESCE(address, 'No address set')
				FROM suppliers WHERE id = $1`, *supplierProfile).Scan(&storeName, &storeAddress)
			if _, err := tx.Exec(ctx, `INSERT INTO delivery_jobs
				(quote_id, order_id, pickup_address, dropoff_address, status, agreed_fee,
				 estimated_weight, created_at, updated_at)
				VALUES ($1, $2, $3, $4, 'pending', $5::numeric, $6, date_trunc('second', now()), date_trunc('second', now()))`,
				quoteID, orderID, storeName+" — "+storeAddress, deliveryAddress,
				formatMinor(calculatedShipping), weightOrNA(weightArg)); err != nil {
				slog.Error("quote approve: delivery job", "error", err)
				serverError(w)
				return
			}
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("quote approve: commit", "error", err)
			serverError(w)
			return
		}

		order, err := materialOrderCreatedObject(ctx, pool, orderID)
		if err != nil {
			slog.Error("quote approve: render order", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Quote approved and order created.")
		payload.Set("order", order)
		writeJSON(w, http.StatusOK, payload)
	}
}

// quoteApproveInput is the validated approve payload.
type quoteApproveInput struct {
	shippingCost   *string
	notes          *string
	deliveryMethod *string
	totalWeight    *string
}

// validateQuoteApprove enforces the four nullable fields.
func validateQuoteApprove(fields map[string]any, failures *errorBag) quoteApproveInput {
	var input quoteApproveInput
	if raw, present := fields["shipping_cost"]; present && raw != nil {
		if text, ok := numericTextOf(raw); ok && isNumericText(text) {
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil && parsed >= 0 {
				trimmed := strings.TrimSpace(text)
				input.shippingCost = &trimmed
			} else {
				failures.add("shipping_cost", "The shipping cost field must be at least 0.")
			}
		} else {
			failures.add("shipping_cost", "The shipping cost field must be a number.")
		}
	}
	for _, pair := range []struct {
		key  string
		dest **string
	}{
		{"notes", &input.notes},
		{"delivery_method", &input.deliveryMethod},
		{"total_weight", &input.totalWeight},
	} {
		if raw, present := fields[pair.key]; present && raw != nil {
			text, ok := raw.(string)
			if !ok {
				failures.add(pair.key, "The "+strings.ReplaceAll(pair.key, "_", " ")+" field must be a string.")
				continue
			}
			dup := text
			*pair.dest = &dup
		}
	}
	return input
}

// weightOrNA renders approve's `?? 'N/A'` fallback.
func weightOrNA(weight any) any {
	if weight == nil {
		return "N/A"
	}
	if text, ok := weight.(string); ok && text == "" {
		return "N/A"
	}
	return weight
}

// PostQuoteDeliveryJobHandler serves
// `POST /api/material-quotes/{quote}/post-delivery-job`.
func PostQuoteDeliveryJobHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quoteID, raw, ok := quoteIDFromPath(r)
		if !ok {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
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
			slog.Error("quote delivery-job: viewer", "error", err)
			serverError(w)
			return
		}
		byName, found, err := loadMaterialQuoteRow(ctx, pool, quoteID)
		if err != nil {
			slog.Error("quote delivery-job: load", "error", err)
			serverError(w)
			return
		}
		if !found {
			modelNotFound(w, `App\Models\MaterialQuote`, raw)
			return
		}
		var supplierProfile *int64
		if id := intPtrDeref(byName["supplier_id"]); id != 0 {
			supplierProfile = &id
		}
		own := quoteSupplierProfile(ctx, pool, viewer)
		if supplierProfile == nil || own == nil || *own != *supplierProfile {
			message(w, http.StatusForbidden, "Unauthorized")
			return
		}

		formFields, _, ferr := requestFields(r)
		if ferr != nil {
			formFields = map[string]any{}
		}
		failures := &errorBag{}
		shippingText, totalWeight, weightSet, internalNotes, notesSet := validateDeliveryJob(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		requested := mustMinorValue(shippingText)
		supplier := supplierCoordinates(ctx, pool, *supplierProfile)
		tariff := platformShippingTariff(byName, supplier, "Hire Platform Courier")

		if tariff != nil && requested > *tariff {
			message(w, http.StatusUnprocessableEntity,
				"Shipping cost exceeds the platform courier tariff. The maximum chargeable is Rp "+
					formatIDAmount(*tariff)+". Lower your figure or arrange delivery outside the platform.")
			return
		}
		if tariff == nil {
			goodsMinor := mustMinorValue(stringOf(byName["total_amount"]))
			if goodsMinor > 0 && requested > goodsMinor {
				message(w, http.StatusUnprocessableEntity,
					"Shipping cost exceeds the value of the goods. A freight charge above the goods total requires a separate agreement with the buyer.")
				return
			}
		}

		var storeName, storeAddress, detailLocation string
		_ = pool.QueryRow(ctx, `SELECT COALESCE(store_name, 'Store'), COALESCE(address, 'No address set'),
			COALESCE(detail_location, '') FROM suppliers WHERE id = $1`, *supplierProfile).
			Scan(&storeName, &storeAddress, &detailLocation)
		pickup := storeName + " — " + storeAddress
		if detailLocation != "" {
			pickup += " (" + detailLocation + ")"
		}

		weight := byName["total_weight"]
		if weightSet {
			weight = totalWeight
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("quote delivery-job: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE material_quotes SET delivery_method = 'Hire Platform Courier',
			shipping_cost = $2::numeric, total_weight = $3::numeric, status = 'awaiting_courier',
			updated_at = date_trunc('second', now()) WHERE id = $1`,
			quoteID, formatMinor(requested), weight); err != nil {
			slog.Error("quote delivery-job: quote update", "error", err)
			serverError(w)
			return
		}

		var internalArg any
		if notesSet {
			internalArg = internalNotes
		}
		_ = internalArg // delivery_jobs has no internal-notes column.

		if _, err := tx.Exec(ctx, `INSERT INTO delivery_jobs
			(quote_id, pickup_address, dropoff_address, agreed_fee, estimated_weight, status, created_at, updated_at)
			VALUES ($1, $2, $3, $4::numeric, $5, 'pending', date_trunc('second', now()), date_trunc('second', now()))`,
			quoteID, pickup, stringOf(byName["delivery_address"]), formatMinor(requested), weight); err != nil {
			slog.Error("quote delivery-job: insert", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("quote delivery-job: commit", "error", err)
			serverError(w)
			return
		}

		entry, err := materialQuoteRefresh(ctx, pool, quoteID)
		if err != nil {
			slog.Error("quote delivery-job: render", "error", err)
			serverError(w)
			return
		}
		payload := jsonphp.NewObject()
		payload.Set("success", true)
		payload.Set("message", "Delivery job posted.")
		payload.Set("data", entry)
		writeJSON(w, http.StatusOK, payload)
	}
}

// validateDeliveryJob enforces shipping_cost required|numeric|min:0,
// total_weight nullable|string|max:100 and internal_notes nullable|string.
func validateDeliveryJob(fields map[string]any, failures *errorBag) (string, any, bool, string, bool) {
	shipping := ""
	if raw, present := fields["shipping_cost"]; !present || raw == nil {
		failures.add("shipping_cost", "The shipping cost field is required.")
	} else if text, ok := numericTextOf(raw); ok && isNumericText(text) {
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil && parsed < 0 {
			failures.add("shipping_cost", "The shipping cost field must be at least 0.")
		} else {
			shipping = strings.TrimSpace(text)
		}
	} else {
		failures.add("shipping_cost", "The shipping cost field must be a number.")
	}

	var weight any
	weightSet := false
	if raw, present := fields["total_weight"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("total_weight", "The total weight field must be a string.")
		} else if len([]rune(text)) > 100 {
			failures.add("total_weight", "The total weight field must not be greater than 100 characters.")
		} else {
			weight = text
			weightSet = true
		}
	}

	notes := ""
	notesSet := false
	if raw, present := fields["internal_notes"]; present && raw != nil {
		if text, ok := raw.(string); !ok {
			failures.add("internal_notes", "The internal notes field must be a string.")
		} else if text != "" {
			notes = text
			notesSet = true
		}
	}

	return shipping, weight, weightSet, notes, notesSet
}

// quoteItemsJSON decodes the stored items while preserving key order.
func quoteItemsJSON(value any) []any {
	decoded := orderedJSONColumn(value)
	if list, ok := decoded.([]any); ok {
		return list
	}
	return nil
}

// mustMinorValue parses a decimal string into minor units, ignoring errors.
func mustMinorValue(text string) int64 {
	parsed, err := money.FromColumn(text, "IDR")
	if err != nil {
		return 0
	}
	return parsed.Int()
}

// materialOrderCreatedObject renders the approve response: the order in
// create order, then `items`, each with its `material`.
func materialOrderCreatedObject(ctx context.Context, pool *pgxpool.Pool, orderID int64) (*jsonphp.Object, error) {
	var (
		userID, supplierID       int64
		projectID                *int64
		status                   string
		totalPrice, shippingCost string
		deliveryMethod           *string
		whatsappOrderID          string
		notes, deliveryAddress   *string
		addressDetail            *string
		latitude, longitude      *float64
		totalWeight              *string
		createdAt, updatedAt     any
	)
	if err := pool.QueryRow(ctx, `SELECT user_id, supplier_id, project_id, status::text,
		total_price::text, shipping_cost::text, delivery_method, whatsapp_order_id, notes,
		delivery_address, address_detail, latitude::float8, longitude::float8, total_weight::text,
		created_at, updated_at FROM material_orders WHERE id = $1`, orderID).Scan(
		&userID, &supplierID, &projectID, &status, &totalPrice, &shippingCost, &deliveryMethod,
		&whatsappOrderID, &notes, &deliveryAddress, &addressDetail, &latitude, &longitude,
		&totalWeight, &createdAt, &updatedAt); err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	entry.Set("user_id", userID)
	entry.Set("supplier_id", supplierID)
	entry.Set("project_id", nullableInt64(projectID))
	entry.Set("status", status)
	entry.Set("total_price", totalPrice)
	entry.Set("shipping_cost", shippingCost)
	entry.Set("delivery_method", nullableString(deliveryMethod))
	entry.Set("whatsapp_order_id", whatsappOrderID)
	entry.Set("notes", nullableString(notes))
	entry.Set("delivery_address", nullableString(deliveryAddress))
	entry.Set("address_detail", nullableString(addressDetail))
	if latitude == nil {
		entry.Set("latitude", nil)
	} else {
		entry.Set("latitude", *latitude)
	}
	if longitude == nil {
		entry.Set("longitude", nil)
	} else {
		entry.Set("longitude", *longitude)
	}
	if totalWeight == nil {
		entry.Set("total_weight", nil)
	} else {
		entry.Set("total_weight", *totalWeight)
	}
	entry.Set("updated_at", projectTimeValue(updatedAt))
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("id", orderID)

	rows, err := pool.Query(ctx, `SELECT id, order_id, material_id, quantity,
		price_at_order::text, created_at, updated_at, requirement_id FROM material_order_items
		WHERE order_id = $1 ORDER BY id`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]any, 0)
	for rows.Next() {
		var (
			itemID, order, materialID int64
			quantity                  int64
			price                     string
			itemCreated, itemUpdated  any
			requirementID             *int64
		)
		if err := rows.Scan(&itemID, &order, &materialID, &quantity,
			&price, &itemCreated, &itemUpdated, &requirementID); err != nil {
			return nil, err
		}
		// The eager load RE-QUERIES the items, so they serialize in TABLE
		// order (requirement_id last), not in create order.
		item := jsonphp.NewObject()
		item.Set("id", itemID)
		item.Set("order_id", order)
		item.Set("material_id", materialID)
		item.Set("quantity", quantity)
		item.Set("price_at_order", price)
		item.Set("created_at", projectTimeValue(itemCreated))
		item.Set("updated_at", projectTimeValue(itemUpdated))
		item.Set("requirement_id", nullableInt64(requirementID))

		material, err := materialModelObject(ctx, pool, materialID)
		if err != nil {
			if isNoRows(err) {
				item.Set("material", nil)
			} else {
				return nil, err
			}
		} else {
			item.Set("material", material)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	entry.Set("items", items)
	return entry, nil
}

// materialModelObject renders the Material model (casts only).
func materialModelObject(ctx context.Context, pool *pgxpool.Pool, materialID int64) (*jsonphp.Object, error) {
	rows, err := pool.Query(ctx, `SELECT id, supplier_id, name, description, price::text, unit,
		category, stock, is_available, image_path, specifications::text, created_at, updated_at
		FROM materials WHERE id = $1`, materialID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, errLedgerGone
	}
	var (
		id, supplierID            int64
		name, description, price  *string
		unit, category            *string
		stock                     *int64
		isAvailable               bool
		imagePath, specifications *string
		createdAt, updatedAt      any
	)
	if err := rows.Scan(&id, &supplierID, &name, &description, &price, &unit, &category,
		&stock, &isAvailable, &imagePath, &specifications, &createdAt, &updatedAt); err != nil {
		return nil, err
	}

	entry := jsonphp.NewObject()
	entry.Set("id", id)
	entry.Set("supplier_id", supplierID)
	entry.Set("name", nullableString(name))
	entry.Set("description", nullableString(description))
	entry.Set("price", nullableString(price))
	entry.Set("unit", nullableString(unit))
	entry.Set("category", nullableString(category))
	if stock == nil {
		entry.Set("stock", nil)
	} else {
		entry.Set("stock", *stock)
	}
	entry.Set("is_available", isAvailable)
	entry.Set("image_path", nullableString(imagePath))
	if specifications == nil {
		entry.Set("specifications", nil)
	} else {
		entry.Set("specifications", orderedJSONColumn(*specifications))
	}
	entry.Set("created_at", projectTimeValue(createdAt))
	entry.Set("updated_at", projectTimeValue(updatedAt))
	return entry, rows.Err()
}

// randomHexUpper renders strtoupper(bin2hex(random_bytes(n))).
func randomHexUpper(n int) string {
	raw := make([]byte, n)
	if _, err := rand.Read(raw); err != nil {
		return "00000000"
	}
	const hexDigits = "0123456789ABCDEF"
	out := make([]byte, n*2)
	for i, b := range raw {
		out[i*2] = hexDigits[b>>4]
		out[i*2+1] = hexDigits[b&0x0f]
	}
	return string(out)
}
