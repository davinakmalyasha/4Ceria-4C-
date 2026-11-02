package httpapi

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/davinakmalyasha/4ceria/internal/domain/money"
	"github.com/davinakmalyasha/4ceria/internal/domain/terminplan"
	"github.com/jackc/pgx/v5"
)

// CONTRACT SNAPSHOT — the immutable SPK record written on the owner's
// counter-signature.
//
// It mirrors ProjectContractService::storeContractSnapshot: the contract
// number, the project/client/professional blocks, the agreed fee with the
// persisted stages, the role's milestones, the signature paths, and the
// four articles. The JSON file is pretty-printed; the documents row is
// updated-or-created on (project, spk, target_role).

// snapshotTermin is one persisted stage in the snapshot file.
type snapshotTermin struct {
	Label      *string `json:"label"`
	Percentage *string `json:"percentage"`
	Amount     *string `json:"amount"`
	Status     *string `json:"status"`
}

// snapshotMilestone is one role milestone in the snapshot file.
type snapshotMilestone struct {
	Title          string  `json:"title"`
	Description    *string `json:"description"`
	ApprovalStatus *string `json:"approval_status"`
}

// storeContractSnapshotTx writes the signed-contract snapshot file and its
// documents row inside the counter-signature transaction.
func storeContractSnapshotTx(ctx context.Context, tx pgx.Tx, projectID int64, role string, bid map[string]any, ownerID int64) error {
	column, _ := bidProfileColumn(role)
	profileID := profileID(bid, column)
	table, _ := bidProfileTable(role)

	var proName, clientName *string
	var proUserID *int64
	_ = tx.QueryRow(ctx, `SELECT u.name FROM `+table+` p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = $1`, profileID).Scan(&proName)
	_ = tx.QueryRow(ctx, `SELECT user_id FROM `+table+` WHERE id = $1`, profileID).Scan(&proUserID)
	_ = tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, ownerID).Scan(&clientName)

	var feeCalc, feePrice *string
	_ = tx.QueryRow(ctx, `SELECT calculated_total::text, price::text FROM bids WHERE id = $1`, bidPhysicalID(bid)).Scan(&feeCalc, &feePrice)
	fee := feeCalc
	if fee == nil {
		fee = feePrice
	}
	feeText := ""
	if fee != nil {
		feeText = *fee
	}

	termins := []snapshotTermin{}
	terminRows, err := tx.Query(ctx, `SELECT label, percentage::text, amount::text, status::text FROM project_payment_termins WHERE project_id = $1 AND role_type = $2 ORDER BY id`, projectID, role)
	if err != nil {
		return err
	}
	for terminRows.Next() {
		var termin snapshotTermin
		var label, percentage, amount, status *string
		if err := terminRows.Scan(&label, &percentage, &amount, &status); err != nil {
			terminRows.Close()
			return err
		}
		termin.Label = label
		termin.Percentage = percentage
		termin.Amount = amount
		termin.Status = status
		termins = append(termins, termin)
	}
	terminRows.Close()
	if err := terminRows.Err(); err != nil {
		return err
	}

	milestones := []snapshotMilestone{}
	milestoneRows, err := tx.Query(ctx, `SELECT title, description, approval_status::text FROM project_milestones WHERE project_id = $1 AND `+columnToMilestoneFK(column)+` = $2 ORDER BY id`, projectID, profileID)
	if err != nil {
		return err
	}
	for milestoneRows.Next() {
		var milestone snapshotMilestone
		if err := milestoneRows.Scan(&milestone.Title, &milestone.Description, &milestone.ApprovalStatus); err != nil {
			milestoneRows.Close()
			return err
		}
		milestones = append(milestones, milestone)
	}
	milestoneRows.Close()
	if err := milestoneRows.Err(); err != nil {
		return err
	}

	var lokasi, street, kelurahan, kecamatan, city, province, postal, title *string
	_ = tx.QueryRow(ctx, `SELECT lokasi, street_name, kelurahan, kecamatan, city, province, postal_code, title FROM projects WHERE id = $1`, projectID).
		Scan(&lokasi, &street, &kelurahan, &kecamatan, &city, &province, &postal, &title)
	projectTitle := stringOrNilText(title)
	location := projectLocationText(lokasi, street, kelurahan, kecamatan, city, province, postal)

	timestamp := int64(0)
	if created, isTime := bid["created_at"].(time.Time); isTime {
		timestamp = created.Unix()
	}
	wireID := bidWireID(bid)
	proSigPath := "contracts/project_" + strconv.FormatInt(projectID, 10) + "/signatures/" + signatureFileName(role, wireID, timestamp, false)
	clientSigPath := "contracts/project_" + strconv.FormatInt(projectID, 10) + "/signatures/" + signatureFileName(role, wireID, timestamp, true)

	clientNameText := stringOrNilText(clientName)
	proID := int64(0)
	if proUserID != nil {
		proID = *proUserID
	}

	feeMoney, _ := money.FromColumn(feeText, "IDR")
	feeDisplay := terminplan.FormatWhole(feeMoney)

	snapshot := map[string]any{
		"contract_number": "SPK/" + strconv.FormatInt(projectID, 10) + "/" + strconv.FormatInt(wireID, 10),
		"project": map[string]any{
			"id":       projectID,
			"title":    projectTitle,
			"location": location,
		},
		"client": map[string]any{
			"id":   ownerID,
			"name": clientNameText,
		},
		"professional": map[string]any{
			"id":   proID,
			"name": contractBidderName(proName, role),
			"role": strings.ToUpper(role),
		},
		"financials": map[string]any{
			"agreed_fee": feeText,
			"termins":    termins,
		},
		"milestones": milestones,
		"signatures": map[string]any{
			"professional_signature_path": proSigPath,
			"client_signature_path":       clientSigPath,
			"signed_at":                   time.Now().UTC().Format("2006-01-02 15:04:05"),
		},
		"articles": []any{
			map[string]any{"title": "PASAL 1: LINGKUP PEKERJAAN", "content": "Pihak Pertama memberikan tugas kepada Pihak Kedua, dan Pihak Kedua menerima tugas tersebut untuk melaksanakan pekerjaan " + projectTitle + " yang berlokasi di " + location + " dengan rincian lingkup tugas sesuai kesepakatan dan standar pengerjaan platform 4Ceria."},
			map[string]any{"title": "PASAL 2: NILAI PEKERJAAN & JASA", "content": "Total nilai pekerjaan disepakati sebesar Rp " + feeDisplay + ". Jumlah ini sudah termasuk seluruh paket dasar jasa profesional serta dokumen-dokumen hukum pendukung yang telah dipilih dan disepakati di platform."},
			map[string]any{"title": "PASAL 3: SKEMA PEMBAYARAN ESCROW", "content": "Pembayaran dilakukan secara termin menggunakan sistem Rekening Bersama (Escrow) 4Ceria. Setiap pencairan dana hanya dilakukan setelah deliverables/scope pada termin bersangkutan diunggah di dalam Document Vault dan disetujui oleh Pihak Pertama atau Project Manager yang ditunjuk."},
			map[string]any{"title": "PASAL 4: PENYELESAIAN PERSELISIHAN", "content": "Apabila terjadi perselisihan atau perbedaan pendapat dalam pelaksanaan perjanjian ini, para pihak sepakat untuk menyelesaikan secara musyawarah mufakat, atau menggunakan layanan mediasi yang disediakan oleh platform 4Ceria sebelum menempuh jalur hukum formal."},
		},
	}

	encoded, err := json.MarshalIndent(snapshot, "", "    ")
	if err != nil {
		return err
	}

	targetRole := signTargetRole(role)
	fileName := "SPK_" + role + "_" + strconv.FormatInt(projectID, 10) + "_signed.json"
	filePath := "contracts/project_" + strconv.FormatInt(projectID, 10) + "/" + fileName
	if err := writeVaultFile(filePath, encoded); err != nil {
		return err
	}

	var existingID int64
	err = tx.QueryRow(ctx, `SELECT id FROM project_documents WHERE project_id = $1 AND category = 'spk' AND target_role = $2`, projectID, targetRole).Scan(&existingID)
	if err == nil {
		_, err = tx.Exec(ctx, `UPDATE project_documents SET uploader_id = $1, file_name = $2, file_path = $3, file_type = 'json', status = 'verified', version_label = 'v1.0', updated_at = date_trunc('second', now()) WHERE id = $4`,
			ownerID, "SPK_"+role+"_"+strconv.FormatInt(projectID, 10)+".json", filePath, existingID)
		return err
	}

	_, err = tx.Exec(ctx, `INSERT INTO project_documents (project_id, uploader_id, file_name, file_path, category, target_role, file_type, status, version_label, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 'spk', $5, 'json', 'verified', 'v1.0', date_trunc('second', now()), date_trunc('second', now()))`,
		projectID, ownerID, "SPK_"+role+"_"+strconv.FormatInt(projectID, 10)+".json", filePath, targetRole)
	return err
}

// stringOrNilText renders a nullable string as text.
func stringOrNilText(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
