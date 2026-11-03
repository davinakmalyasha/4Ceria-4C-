package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/domain/escrow"
	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/domain/terminplan"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CONTRACT SIGNING — sign-contract and client-sign-contract.
//
// signContract binds the payment plan the professional proposes: bank
// details onto the signer's own user row, the signature bytes onto the
// vault, milestones and termins replacing the role's pending schedule,
// and the SPK activity log. clientSignContract countersigns: the client
// file, awaiting_payment on both rows, the immutable snapshot, and its
// own log line.
//
// ENVELOPE TRAP — read before touching the returns below. signContract's
// tail reads `return response()->json(['message' => ..., 'bid' => $bid])`,
// but the method OPENS with `return DB::transaction(function () ... {
// ... return $bid; })` — the transaction's result IS the method's result,
// and everything after the `});` is dead code that never runs. The live
// oracle answers the FLAT bid (33 legacy columns, no message wrapper,
// no relations) and never writes the SPK draft row. The port matches the
// live oracle, not the dead text. clientSignContract has no such trap:
// it answers message+bid (verified live).

// signTargetRole maps the bid role to the documents target_role.
func signTargetRole(role string) string {
	switch role {
	case "arsitek":
		return "architect"
	case "kontraktor":
		return "contractor"
	case "notaris":
		return "notary"
	case "project_manager":
		return "pm"
	default:
		return role
	}
}

// signPhaseContext maps the bid role to the milestone phase_context.
func signPhaseContext(role string) string {
	switch role {
	case "notaris":
		return "legal"
	case "arsitek":
		return "design"
	case "kontraktor":
		return "build"
	case "interior":
		return "interior"
	case "project_manager":
		return "management"
	default:
		return role
	}
}

// attrName mirrors Laravel's attribute display: underscores read as spaces.
// The error-bag KEYS keep their underscores; only the sentences change.
func attrName(field string) string {
	return strings.ReplaceAll(field, "_", " ")
}

var digitsPattern = regexp.MustCompile(`^[0-9]+$`)
var signaturePattern = regexp.MustCompile(`^data:image/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$`)

// signTermin is one validated payment stage.
type signTermin struct {
	label          string
	percentageText string
	percentage     float64
	amountText     string
	amount         float64
	milestoneIndex *int64
	raw            map[string]any
}

// signMilestone is one validated work-plan entry.
type signMilestone struct {
	title       string
	description *string
	services    []any
}

// validateSignContract enforces signContract's rules in declaration order:
// bid_type, termins (+ per-item label/percentage/amount, item-major),
// milestones (+ per-item title/description), signature, bank_type,
// bank_account_no, bank_account_name.
func validateSignContract(fields map[string]any, failures *errorBag) (bidType string, termins []signTermin, milestones []signMilestone, signature *string, bankType, bankNo, bankName string, ok bool) {
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

	rawTermins, present := fields["termins"]
	if !present || rawTermins == nil {
		failures.add("termins", requiredMsg(attrName("termins")))
		ok = false
	} else if items, isArr := rawTermins.([]any); !isArr {
		failures.add("termins", "The termins field must be an array.")
		ok = false
	} else if len(items) == 0 {
		failures.add("termins", requiredMsg(attrName("termins")))
		ok = false
	} else {
		for i, item := range items {
			prefix := "termins." + strconv.Itoa(i)
			m, _ := item.(map[string]any)

			var label string
			if m == nil {
				failures.add(prefix+".label", requiredMsg(attrName(prefix+".label")))
				failures.add(prefix+".percentage", requiredMsg(attrName(prefix+".percentage")))
				failures.add(prefix+".amount", requiredMsg(attrName(prefix+".amount")))
				ok = false
				continue
			}

			if raw, present := m["label"]; !present || raw == nil {
				failures.add(prefix+".label", requiredMsg(attrName(prefix+".label")))
				ok = false
			} else if s, isStr := raw.(string); !isStr {
				failures.add(prefix+".label", "The "+prefix+".label field must be a string.")
				ok = false
			} else if s == "" {
				failures.add(prefix+".label", requiredMsg(attrName(prefix+".label")))
				ok = false
			} else {
				label = s
			}

			var pctText string
			var pct float64

			if raw, present := m["percentage"]; !present || raw == nil {
				failures.add(prefix+".percentage", requiredMsg(attrName(prefix+".percentage")))
				ok = false
			} else if text, present := numericTextOf(raw); !present || text == "" {
				if _, isBool := raw.(bool); isBool {
					failures.add(prefix+".percentage", "The "+prefix+".percentage field must be a number.")
					ok = false
				} else {
					failures.add(prefix+".percentage", requiredMsg(attrName(prefix+".percentage")))
					ok = false
				}
			} else if !isNumericText(text) {
				failures.add(prefix+".percentage", "The "+prefix+".percentage field must be a number.")
				ok = false
			} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
				failures.add(prefix+".percentage", "The "+prefix+".percentage field must be a number.")
				ok = false
			} else {
				pctText, pct = text, parsed
				if parsed < 0 {
					failures.add(prefix+".percentage", "The "+prefix+".percentage field must be at least 0.")
					ok = false
				}
				if parsed > 100 {
					failures.add(prefix+".percentage", "The "+prefix+".percentage field must not be greater than 100.")
					ok = false
				}
			}

			var amtText string
			var amt float64
			if raw, present := m["amount"]; !present || raw == nil {
				failures.add(prefix+".amount", requiredMsg(attrName(prefix+".amount")))
				ok = false
			} else if text, present := numericTextOf(raw); !present || text == "" {
				if _, isBool := raw.(bool); isBool {
					failures.add(prefix+".amount", "The "+prefix+".amount field must be a number.")
					ok = false
				} else {
					failures.add(prefix+".amount", requiredMsg(attrName(prefix+".amount")))
					ok = false
				}
			} else if !isNumericText(text) {
				failures.add(prefix+".amount", "The "+prefix+".amount field must be a number.")
				ok = false
			} else if parsed, err := strconv.ParseFloat(text, 64); err != nil {
				failures.add(prefix+".amount", "The "+prefix+".amount field must be a number.")
				ok = false
			} else {
				amtText, amt = text, parsed
				if parsed < 0 {
					failures.add(prefix+".amount", "The "+prefix+".amount field must be at least 0.")
					ok = false
				}
			}

			var milestoneIndex *int64
			if raw, present := m["milestone_index"]; present && raw != nil {
				if text, present := numericTextOf(raw); present && text != "" {
					if parsed, err := strconv.ParseInt(strings.TrimSpace(text), 10, 64); err == nil {
						dup := parsed
						milestoneIndex = &dup
					}
				}
			}

			termins = append(termins, signTermin{
				label: label, percentageText: pctText, percentage: pct,
				amountText: amtText, amount: amt, milestoneIndex: milestoneIndex, raw: m,
			})
		}
	}

	if raw, present := fields["milestones"]; present && raw != nil {
		if items, isArr := raw.([]any); !isArr {
			failures.add("milestones", "The milestones field must be an array.")
			ok = false
		} else {
			for i, item := range items {
				prefix := "milestones." + strconv.Itoa(i)
				m, _ := item.(map[string]any)
				if m == nil {
					failures.add(prefix+".title", requiredMsg(attrName(prefix+".title")))
					ok = false
					continue
				}

				var title string
				if raw, present := m["title"]; !present || raw == nil {
					failures.add(prefix+".title", requiredMsg(attrName(prefix+".title")))
					ok = false
				} else if s, isStr := raw.(string); !isStr {
					failures.add(prefix+".title", "The "+prefix+".title field must be a string.")
					ok = false
				} else if s == "" {
					failures.add(prefix+".title", requiredMsg(attrName(prefix+".title")))
					ok = false
				} else if len(s) > 255 {
					failures.add(prefix+".title", "The "+prefix+".title field must not be greater than 255 characters.")
					ok = false
				} else {
					title = s
				}

				var description *string
				if raw, present := m["description"]; present && raw != nil {
					if s, isStr := raw.(string); !isStr {
						failures.add(prefix+".description", "The "+prefix+".description field must be a string.")
						ok = false
					} else {
						dup := s
						description = &dup
					}
				}

				var services []any
				if raw, present := m["services"]; present && raw != nil {
					if arr, isArr := raw.([]any); isArr {
						services = arr
					}
				}

				milestones = append(milestones, signMilestone{title: title, description: description, services: services})
			}
		}
	}

	if raw, present := fields["signature"]; present && raw != nil {
		if s, isStr := raw.(string); !isStr {
			failures.add("signature", "The signature field must be a string.")
			failures.add("signature", "The signature field format is invalid.")
			ok = false
		} else if s != "" {
			if len(s) > 1572864 {
				failures.add("signature", "The signature field must not be greater than 1572864 characters.")
				ok = false
			}
			if !signaturePattern.MatchString(s) {
				failures.add("signature", "The signature field format is invalid.")
				ok = false
			}
			dup := s
			signature = &dup
		}
	}

	if raw, present := fields["bank_type"]; !present || raw == nil {
		failures.add("bank_type", requiredMsg(attrName("bank_type")))
		ok = false
	} else if s, isStr := raw.(string); !isStr {
		failures.add("bank_type", "The bank type field must be a string.")
		ok = false
	} else if s == "" {
		failures.add("bank_type", requiredMsg(attrName("bank_type")))
		ok = false
	} else if len(s) > 255 {
		failures.add("bank_type", "The bank type field must not be greater than 255 characters.")
		ok = false
	} else {
		bankType = s
	}

	if raw, present := fields["bank_account_no"]; !present || raw == nil {
		failures.add("bank_account_no", requiredMsg(attrName("bank_account_no")))
		ok = false
	} else {
		text := ""
		isStr := false
		if s, isString := raw.(string); isString {
			text, isStr = s, true
		} else if numText, present := numericTextOf(raw); present {
			text = numText
		}
		if !isStr && text == "" {
			if _, isBool := raw.(bool); isBool {
				failures.add("bank_account_no", "The bank account no field must be a string.")
			} else {
				failures.add("bank_account_no", requiredMsg(attrName("bank_account_no")))
			}
			ok = false
		} else if !isStr {
			failures.add("bank_account_no", "The bank account no field must be a string.")
			ok = false
			if !digitsPattern.MatchString(text) {
				failures.add("bank_account_no", "The bank account no field format is invalid.")
				ok = false
			}
		} else if text == "" {
			failures.add("bank_account_no", requiredMsg(attrName("bank_account_no")))
			ok = false
		} else {
			if !digitsPattern.MatchString(text) {
				failures.add("bank_account_no", "The bank account no field format is invalid.")
				ok = false
			}
			if len(text) < 5 {
				failures.add("bank_account_no", "The bank account no field must be at least 5 characters.")
				ok = false
			}
			if len(text) > 30 {
				failures.add("bank_account_no", "The bank account no field must not be greater than 30 characters.")
				ok = false
			}
			bankNo = text
		}
	}

	if raw, present := fields["bank_account_name"]; !present || raw == nil {
		failures.add("bank_account_name", requiredMsg(attrName("bank_account_name")))
		ok = false
	} else if s, isStr := raw.(string); !isStr {
		failures.add("bank_account_name", "The bank account name field must be a string.")
		ok = false
	} else if s == "" {
		failures.add("bank_account_name", requiredMsg(attrName("bank_account_name")))
		ok = false
	} else if len(s) < 3 {
		failures.add("bank_account_name", "The bank account name field must be at least 3 characters.")
		ok = false
	} else if len(s) > 255 {
		failures.add("bank_account_name", "The bank account name field must not be greater than 255 characters.")
		ok = false
	} else {
		bankName = s
	}

	return bidType, termins, milestones, signature, bankType, bankNo, bankName, ok
}

// numericTextOf reads a JSON number or numeric string as text.
// Bools are not numeric; ints and json.Number pass through as text.
func numericTextOf(value any) (string, bool) {
	switch typed := value.(type) {
	case nil:
		return "", false
	case string:
		return strings.TrimSpace(typed), true
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64), true
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 64), true
	case int:
		return strconv.Itoa(typed), true
	case int64:
		return strconv.FormatInt(typed, 10), true
	case json.Number:
		return strings.TrimSpace(string(typed)), true
	case bool:
		return "", false
	default:
		return "", false
	}
}

// signContractValue reads the negotiated value for a role: the first
// accepted/active/contract_pending/awaiting_payment bid's
// calculated_total ?? price. Nil when no accepted bid exists.
func signContractValue(ctx context.Context, pool *pgxpool.Pool, projectID int64, role string) (*money.Money, error) {
	column, ok := bidProfileColumn(role)
	if !ok {
		return nil, nil
	}
	_ = column

	rows, err := pool.Query(ctx, `SELECT calculated_total::text, price::text FROM bids WHERE project_id = $1 AND role::text = $2 AND status::text IN ('accepted','active','contract_pending','awaiting_payment') ORDER BY id LIMIT 1`,
		projectID, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, rows.Err()
	}

	var calculated, price *string
	if err := rows.Scan(&calculated, &price); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	pick := calculated
	if pick == nil {
		pick = price
	}
	if pick == nil {
		return nil, nil
	}

	amount, err := money.FromColumn(*pick, "IDR")
	if err != nil {
		return nil, err
	}

	return &amount, nil
}

// vaultBaseDir mirrors the vault layout locally: EVIDENCE_DIR, or the
// local `storage/app/public` that matches the local VAULT_DISK=public.
func vaultBaseDir() string {
	if base := os.Getenv("EVIDENCE_DIR"); base != "" {
		return base
	}
	return filepath.Join("storage", "app", "public")
}

// writeVaultFile stores decoded bytes at a vault-relative path.
func writeVaultFile(rel string, data []byte) error {
	full := filepath.Join(vaultBaseDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	return os.WriteFile(full, data, 0o644)
}

// vaultHasFile reports whether any of the known signature layouts exists.
func vaultHasFile(rels ...string) bool {
	for _, rel := range rels {
		if info, err := os.Stat(filepath.Join(vaultBaseDir(), filepath.FromSlash(rel))); err == nil && !info.IsDir() {
			return true
		}
	}
	return false
}

// signatureFileName builds the deterministic signature path: the bid's
// created_at epoch, identical on both stacks because the mirror holds
// the same wall the oracle read (see the timestamp note in PORTING.md).
func signatureFileName(role string, wireID, timestamp int64, client bool) string {
	suffix := ""
	if client {
		suffix = "_client"
	}
	return "signature_" + role + "_" + strconv.FormatInt(wireID, 10) + "_" + strconv.FormatInt(timestamp, 10) + suffix + ".png"
}

// decodeSignatureDataURL splits and decodes a data-URL signature.
func decodeSignatureDataURL(dataURL string) ([]byte, bool) {
	comma := strings.Index(dataURL, ",")
	if comma < 0 {
		return nil, false
	}
	decoded, err := base64.StdEncoding.DecodeString(dataURL[comma+1:])
	if err != nil {
		return nil, false
	}
	return decoded, true
}

// projectLocationText mirrors ProjectContractService::projectLocation:
// the free-text lokasi, else the structured parts in address order
// (deduped), else the 'Lokasi Proyek' placeholder.
func projectLocationText(lokasi, street, kelurahan, kecamatan, city, province, postal *string) string {
	textOf := func(value *string) string {
		if value == nil {
			return ""
		}
		return strings.TrimSpace(*value)
	}

	if textOf(lokasi) != "" {
		return textOf(lokasi)
	}

	seen := map[string]bool{}
	parts := []string{}
	for _, part := range []*string{street, kelurahan, kecamatan, city, province, postal} {
		trimmed := textOf(part)
		if trimmed == "" || seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		parts = append(parts, trimmed)
	}

	if len(parts) == 0 {
		return "Lokasi Proyek"
	}

	return strings.Join(parts, ", ")
}

// updateUserBank writes the signer's bank details to PostgreSQL directly,
// so the response serialiser sees what was just committed.
func updateUserBank(ctx context.Context, pool *pgxpool.Pool, userID int64, bankType, bankNo, bankName string) error {
	bankType = strings.TrimSpace(bankType)
	bankNo = strings.TrimSpace(bankNo)
	bankName = strings.TrimSpace(bankName)

	if _, err := pool.Exec(ctx,
		`UPDATE users SET bank_name = $1, bank_account_number = $2, bank_account_name = $3 WHERE id = $4`,
		bankType, bankNo, bankName, userID); err != nil {
		return err
	}

	return nil
}

// SignContractHandler serves `POST /api/projects/{project}/bids/{bid}/sign-contract`.
func SignContractHandler(pool *pgxpool.Pool) http.HandlerFunc {
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
		bidType, termins, milestones, signature, bankType, bankNo, bankName, valid := validateSignContract(formFields, failures)
		if !failures.empty() {
			failures.write(w)
			return
		}
		_ = valid

		bidFields, bidValues, found, err := findBid(ctx, pool, projectID, bidType, bidRaw)
		if err != nil {
			slog.Error("sign-contract: lookup", "error", err)
			serverError(w)
			return
		}
		if !found {
			bidNotFound(w, bidType)
			return
		}

		bid := bidMap(bidFields, bidValues)
		physicalID := bidPhysicalID(bid)

		proUserID := bidderUserID(ctx, pool, bidType, bid)
		if proUserID == nil || caller.UserID() != *proUserID {
			message(w, http.StatusForbidden, "Unauthorized. Only the invited professional can sign this contract.")
			return
		}

		status, _ := bid["status"].(string)
		if status != "contract_pending" {
			message(w, http.StatusUnprocessableEntity, "This bid is not in a signable state.")
			return
		}

		var locked bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_payment_termins WHERE project_id = $1 AND role_type = $2 AND status::text IN ('verifying','paid'))`,
			projectID, bidType).Scan(&locked); err != nil {
			slog.Error("sign-contract: payments", "error", err)
			serverError(w)
			return
		}
		if locked {
			message(w, http.StatusUnprocessableEntity, "This contract already has an ongoing or completed payment. Its terms are locked and can no longer be changed.")
			return
		}

		contract, err := signContractValue(ctx, pool, projectID, bidType)
		if err != nil {
			slog.Error("sign-contract: value", "error", err)
			serverError(w)
			return
		}
		if contract == nil || contract.Int() <= 0 {
			message(w, http.StatusUnprocessableEntity, "Contract value cannot be zero. Please negotiate a fee first.")
			return
		}

		percentages := make([]float64, 0, len(termins))
		for _, termin := range termins {
			percentages = append(percentages, termin.percentage)
		}
		if err := terminplan.AssertPercentagesWithinWhole(percentages); err != nil {
			message(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		var totalMinor int64
		zeroLabel := ""
		for _, termin := range termins {
			amount, err := money.FromColumn(termin.amount, "IDR")
			if err != nil {
				message(w, http.StatusUnprocessableEntity, "The "+termin.label+" amount field must be a number.")
				return
			}
			if amount.Int() <= 0 && zeroLabel == "" {
				zeroLabel = termin.label
			}
			totalMinor += amount.Int()
		}
		total := money.OfMinor(totalMinor, "IDR")
		if zeroLabel != "" {
			message(w, http.StatusUnprocessableEntity, "Every payment stage must carry an amount. Stage \""+zeroLabel+"\" was submitted as Rp 0; supply the amounts you agreed rather than having the server derive them.")
			return
		}

		if err := terminplan.AssertTotalWithinContractValue(contract, total); err != nil {
			message(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		if diff := contract.Int() - total.Int(); diff > 0 {
			shortfall := money.OfMinor(diff, "IDR")
			message(w, http.StatusUnprocessableEntity, "The total of the payment stages (Rp "+terminplan.FormatWhole(total)+") is Rp "+terminplan.FormatWhole(shortfall)+" short of the negotiated contract value (Rp "+terminplan.FormatWhole(*contract)+").")
			return
		}

		var createdAt time.Time
		if created, isTime := bid["created_at"].(time.Time); isTime {
			createdAt = created
		}
		wireID := bidWireID(bid)
		signatureTS := createdAt.Unix()

		if err := updateUserBank(ctx, pool, caller.UserID(), bankType, bankNo, bankName); err != nil {
			slog.Error("sign-contract: bank", "error", err)
			serverError(w)
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			slog.Error("sign-contract: begin", "error", err)
			serverError(w)
			return
		}
		defer tx.Rollback(ctx)

		if signature != nil && *signature != "" {
			if decoded, ok := decodeSignatureDataURL(*signature); ok {
				rel := "contracts/project_" + strconv.FormatInt(projectID, 10) + "/signatures/" + signatureFileName(bidType, wireID, signatureTS, false)
				if err := writeVaultFile(rel, decoded); err != nil {
					slog.Error("sign-contract: signature", "error", err)
					serverError(w)
					return
				}
			}
		}

		if _, err := tx.Exec(ctx, `DELETE FROM project_payment_termins WHERE project_id = $1 AND role_type = $2 AND status::text NOT IN ('verifying','paid')`,
			projectID, bidType); err != nil {
			slog.Error("sign-contract: clear", "error", err)
			serverError(w)
			return
		}

		milestoneIDs := map[int64]int64{}
		for index, milestone := range milestones {
			servicesJSON := "[]"
			if len(milestone.services) > 0 {
				if encoded, err := json.Marshal(milestone.services); err == nil {
					servicesJSON = string(encoded)
				}
			}
			content := `{"services":` + servicesJSON + `}`

			column, _ := bidProfileColumn(bidType)
			profileID := profileID(bid, column)

			var createdID int64
			if err := tx.QueryRow(ctx, `INSERT INTO project_milestones (project_id, title, description, approval_status, phase_context, sort_order, content, `+columnToMilestoneFK(column)+`, created_at, updated_at)
				VALUES ($1, $2, $3, 'pending', $4, $5, $6::jsonb, $7, date_trunc('second', now()), date_trunc('second', now())) RETURNING id`,
				projectID, milestone.title, milestone.description, signPhaseContext(bidType), index, content, nilInt64(profileID)).Scan(&createdID); err != nil {
				slog.Error("sign-contract: milestone", "error", err)
				serverError(w)
				return
			}
			milestoneIDs[int64(index)] = createdID
		}

		for _, termin := range termins {
			// The retention split is computed on creation by the model hook
			// (5% of the stage, remainder forced onto net so the sum is
			// exact) — never zero-filled, or the PG invariant
			// ppt_retention_split_exact rejects the row.
			gross, err := money.FromColumn(termin.amount, "IDR")
			if err != nil {
				slog.Error("sign-contract: gross", "error", err)
				serverError(w)
				return
			}
			split, err := escrow.SplitRetention(gross, "5")
			if err != nil {
				slog.Error("sign-contract: split", "error", err)
				serverError(w)
				return
			}

			var milestoneID *int64
			if termin.milestoneIndex != nil {
				if id, ok := milestoneIDs[*termin.milestoneIndex]; ok {
					dup := id
					milestoneID = &dup
				}
			}

			if _, err := tx.Exec(ctx, `INSERT INTO project_payment_termins (project_id, label, percentage, amount, retention_amount, net_amount, status, role_type, recipient_id, milestone_id, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, date_trunc('second', now()), date_trunc('second', now()))`,
				projectID, termin.label, termin.percentageText, termin.amountText, split.Retention.Decimal(), split.Net.Decimal(), bidType, caller.UserID(), milestoneID); err != nil {
				slog.Error("sign-contract: termin", "error", err)
				serverError(w)
				return
			}
		}

		if _, err := tx.Exec(ctx, `UPDATE bids SET status = 'contract_pending', updated_at = date_trunc('second', now()) WHERE id = $1`, physicalID); err != nil {
			slog.Error("sign-contract: bid", "error", err)
			serverError(w)
			return
		}

		persisted, err := txPersistedStages(ctx, tx, projectID, bidType)
		if err != nil {
			slog.Error("sign-contract: persisted", "error", err)
			serverError(w)
			return
		}
		if err := terminplan.AssertPlanComplete(contract, persisted); err != nil {
			message(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		if bidType == "notaris" {
			services := []string{}
			if raw := bid["selected_services"]; raw != nil {
				if decoded, ok := jsonOrNil(raw).([]any); ok {
					for _, item := range decoded {
						switch typed := item.(type) {
						case map[string]any:
							if id, ok := typed["id"]; ok {
								switch idTyped := id.(type) {
								case string:
									services = append(services, idTyped)
								case float64:
									services = append(services, strconv.FormatFloat(idTyped, 'f', -1, 64))
								}
							} else {
								services = append(services, stringOrNilJSON(item))
							}
						case string:
							services = append(services, typed)
						case float64:
							services = append(services, strconv.FormatFloat(typed, 'f', -1, 64))
						}
					}
				} else if s, ok := raw.(string); ok && s != "" {
					services = append(services, s)
				}
			}
			if len(services) > 0 {
				if err := syncLegalScopeTx(ctx, tx, projectID, services, caller.UserID(), bid); err != nil {
					slog.Error("sign-contract: legal", "error", err)
					serverError(w)
					return
				}
			}
		}

		if err := insertActivityLog(ctx, tx, projectID, caller.UserID(), "contract_signed", "Professional has signed the SPK and defined payment termins."); err != nil {
			slog.Error("sign-contract: log", "error", err)
			serverError(w)
			return
		}

		if err := tx.Commit(ctx); err != nil {
			slog.Error("sign-contract: commit", "error", err)
			serverError(w)
			return
		}

		refreshed, err := reloadBid(ctx, pool, physicalID)
		if err != nil {
			slog.Error("sign-contract: reload", "error", err)
			serverError(w)
			return
		}

		// The live oracle answers the bare bid — the wrapper and the SPK
		// draft below it are dead code (see the ENVELOPE TRAP above).
		writeJSON(w, http.StatusOK, rawBidObject(bidType, refreshed.fields, refreshed.values))
	}
}

// columnToMilestoneFK maps a bid profile column to the milestone FK.
func columnToMilestoneFK(column string) string {
	switch column {
	case "arsitek_id":
		return "arsitek_id"
	case "kontraktor_id":
		return "kontraktor_id"
	case "notaris_id":
		return "notaris_id"
	case "interior_id":
		return "interior_id"
	case "pm_id":
		return "pm_id"
	case "structural_id":
		return "structural_id"
	case "mep_id":
		return "mep_id"
	default:
		return "arsitek_id"
	}
}

// nilInt64 renders 0 as NULL for optional FKs.
func nilInt64(value int64) *int64 {
	if value == 0 {
		return nil
	}
	dup := value
	return &dup
}

// txPersistedStages reads the persisted non-void stages for a role.
func txPersistedStages(ctx context.Context, tx pgx.Tx, projectID int64, role string) ([]terminplan.Stage, error) {
	rows, err := tx.Query(ctx, `SELECT percentage::text, amount::text FROM project_payment_termins WHERE project_id = $1 AND role_type = $2 AND status::text <> 'void'`,
		projectID, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stages := []terminplan.Stage{}
	for rows.Next() {
		var percentage, amount *string
		if err := rows.Scan(&percentage, &amount); err != nil {
			return nil, err
		}

		stage := terminplan.Stage{}
		if percentage != nil {
			if parsed, err := strconv.ParseFloat(*percentage, 64); err == nil {
				stage.Percentage = parsed
			}
		}
		if amount != nil {
			if parsed, err := money.FromColumn(*amount, "IDR"); err == nil {
				stage.Amount = parsed
			}
		}
		stages = append(stages, stage)
	}

	return stages, rows.Err()
}
