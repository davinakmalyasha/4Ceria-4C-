package httpapi

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/domain/terminplan"
	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CLIENT SIGN — the owner's counter-signature.
//
// It binds the plan: the client file, awaiting_payment on both rows, the
// immutable snapshot and its log line. Unlike sign-contract, the response
// envelope IS message+bid (verified live — see the ENVELOPE TRAP in
// projectbidsign.go for why sign differs).

// validateClientSign enforces clientSignContract's rules in declaration
// order: bid_type (required|string|in:7), signature
// (required|string|max:1572864|regex).
func validateClientSign(fields map[string]any, failures *errorBag) (bidType string, signature string, ok bool) {
	ok = true

	rawType, present := fields["bid_type"]
	if !present || rawType == nil {
		failures.add("bid_type", requiredMsg(attrName("bid_type")))
		ok = false
	} else if text, isStr := rawType.(string); !isStr {
		failures.add("bid_type", "The bid type field must be a string.")
		failures.add("bid_type", "The selected bid type is invalid.")
		ok = false
	} else if strings.TrimSpace(text) == "" {
		failures.add("bid_type", requiredMsg(attrName("bid_type")))
		ok = false
	} else {
		known := false
		for _, role := range bidTypeOrder {
			if text == role {
				known = true
				break
			}
		}
		if !known {
			failures.add("bid_type", "The selected bid type is invalid.")
			ok = false
		} else {
			bidType = text
		}
	}

	raw, present := fields["signature"]
	if !present || raw == nil {
		failures.add("signature", requiredMsg("signature"))
		ok = false
	} else if text, isStr := raw.(string); !isStr {
		failures.add("signature", "The signature field must be a string.")
		failures.add("signature", "The signature field format is invalid.")
		ok = false
	} else if text == "" {
		failures.add("signature", requiredMsg("signature"))
		ok = false
	} else {
		if len(text) > 1572864 {
			failures.add("signature", "The signature field must not be greater than 1572864 characters.")
			ok = false
		}
		if !signaturePattern.MatchString(text) {
			failures.add("signature", "The signature field format is invalid.")
			ok = false
		}
		signature = text
	}

	return bidType, signature, ok
}

// bidderDisplayName mirrors ProjectContractService::getBidderName: the
// profile's user name, else the per-role fallback.
func contractBidderName(profileName *string, role string) string {
	if profileName != nil && strings.TrimSpace(*profileName) != "" {
		return strings.TrimSpace(*profileName)
	}

	switch role {
	case "arsitek":
		return "Architect"
	case "kontraktor":
		return "Contractor"
	case "notaris":
		return "Notary"
	case "interior":
		return "Interior Designer"
	case "project_manager":
		return "Project Manager"
	case "structural":
		return "Structural Engineer"
	case "mep":
		return "MEP Engineer"
	default:
		return "Professional"
	}
}

// ClientSignContractHandler serves `POST /api/projects/{project}/bids/{bid}/client-sign-contract`.
func ClientSignContractHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(withAssetBase(r.Context(), requestOrigin(r)))

		projectID, projectRaw, ok := bidProjectID(r)
		if !ok {
			modelNotFound(w, `App\Models\Project`, projectRaw)
			return
		}

		bidRaw := r.PathValue("bid")
		if bidRaw == "" {
			bidRaw = lastPathSegment(r.URL.Path)
		}

		caller, ok := CallerFrom(r.Context())
		if !ok {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		ctx := r.Context()
		formFields, formFiles, err := requestFields(r)
		if err != nil {
			message(w, http.StatusUnprocessableEntity, "The given data was invalid.")
			return
		}
		_ = formFiles

		failures := &errorBag{}
		bidType, signature, _ := validateClientSign(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}

		bidFields, bidValues, found, err := findBid(ctx, pool, projectID, bidType, bidRaw)
		if err != nil {
			slog.Error("client-sign: lookup", "error", err)
			serverError(w)
			return
		}
		if !found {
			bidNotFound(w, bidType)
			return
		}

		bid := bidMap(bidFields, bidValues)
		physicalID := bidPhysicalID(bid)

		var ownerID int64
		var projectTitle string
		if err := pool.QueryRow(ctx, `SELECT user_id, title FROM projects WHERE id = $1`, projectID).Scan(&ownerID, &projectTitle); err != nil {
			slog.Error("client-sign: project", "error", err)
			serverError(w)
			return
		}

		if caller.UserID() != ownerID {
			message(w, http.StatusForbidden, "Unauthorized. Only the project owner can sign this contract.")
			return
		}

		status, _ := bid["status"].(string)
		if status != "contract_pending" && status != "awaiting_payment" {
			message(w, http.StatusUnprocessableEntity, "This contract is not in a signable state.")
			return
		}

		var createdUnix int64
		if created, isTime := bid["created_at"].(time.Time); isTime {
			createdUnix = created.Unix()
		}
		wireID := bidWireID(bid)

		proFile := "contracts/project_" + strconv.FormatInt(projectID, 10) + "/signatures/" + signatureFileName(bidType, wireID, createdUnix, false)
		vaultDisk, publicDisk := vaultBaseDir(), filepathJoin("storage", "app", "public")
		altBase := "signatures/" + signatureFileName(bidType, wireID, createdUnix, false)
		proExists := vaultHasFile(proFile) ||
			fileExists(filepathJoin(publicDisk, filepathFromSlash(proFile))) ||
			fileExists(filepathJoin(vaultDisk, altBase)) ||
			fileExists(filepathJoin(publicDisk, altBase))
		if !proExists {
			message(w, http.StatusUnprocessableEntity, "The professional must sign the contract first.")
			return
		}

		contract, err := signContractValue(ctx, pool, projectID, bidType)
		if err != nil {
			slog.Error("client-sign: value", "error", err)
			serverError(w)
			return
		}

		persisted, err := poolPersistedStages(ctx, pool, projectID, bidType)
		if err != nil {
			slog.Error("client-sign: stages", "error", err)
			serverError(w)
			return
		}
		if err := terminplan.AssertPlanComplete(contract, persisted); err != nil {
			message(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("client-sign: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		comma := strings.Index(signature, ",")
		if comma < 0 {
			message(w, http.StatusUnprocessableEntity, "Invalid signature format.")
			return
		}
		decoded, ok := decodeSignatureDataURL(signature)
		if !ok {
			message(w, http.StatusUnprocessableEntity, "Invalid signature format.")
			return
		}
		_ = decoded

		clientRel := "contracts/project_" + strconv.FormatInt(projectID, 10) + "/signatures/" + signatureFileName(bidType, wireID, createdUnix, true)
		if err := writeVaultFile(clientRel, decoded); err != nil {
			slog.Error("client-sign: signature", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'awaiting_payment', updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID); err != nil {
			slog.Error("client-sign: bid", "error", err)
			serverError(w)
			return
		}

		if _, err := tx.Exec(ctx, `UPDATE projects SET status = 'awaiting_payment', updated_at = date_trunc('second', now()) WHERE id = $1 AND status::text NOT IN ('in_progress','completed','cancelled')`, projectID); err != nil {
			slog.Error("client-sign: project", "error", err)
			serverError(w)
			return
		}

		if err := storeContractSnapshotTx(ctx, tx, projectID, bidType, bid, ownerID); err != nil {
			slog.Error("client-sign: snapshot", "error", err)
			serverError(w)
			return
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "contract_signed_by_client", "Client has signed the SPK contract. Status transitioned to awaiting payment."); err != nil {
			slog.Error("client-sign: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("client-sign: commit", "error", err)
			serverError(w)
			return
		}

		refreshed, err := reloadBid(ctx, pool, physicalID)
		if err != nil {
			slog.Error("client-sign: reload", "error", err)
			serverError(w)
			return
		}

		// getBidderName touches the profile relation (and its user), so
		// the wire bid carries it — the one key beyond the legacy columns.
		bidObject := rawBidObject(bidType, refreshed.fields, refreshed.values)
		if key, table, profile, ok := bidRelationKey(bidType, bid); ok {
			block, err := fullProfileBlock(ctx, pool, table, profile, true, true, false)
			if err != nil {
				slog.Error("client-sign: relation", "error", err)
				serverError(w)
				return
			}
			bidObject.Set(key, block)
		}

		payload := jsonphp.NewObject()
		payload.Set("message", "Contract signed successfully! Awaiting payment verification.")
		payload.Set("bid", bidObject)
		writeJSON(w, http.StatusOK, payload)
	}
}
