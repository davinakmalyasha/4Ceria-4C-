package httpapi

import (
	"context"

	"github.com/davinakmalyasha/4ceria/internal/jsonphp"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The resource's `payment_termins` projection — deliberately NARROWER and
// differently typed than the termin list endpoint:
//
//   - `percentage` and `amount` are the DECIMAL strings (model casts),
//     while `retention_amount` and `net_amount` are cast to floats in the
//     resource itself;
//   - the milestone is reduced to id/title/approval_status, with its title
//     ALSO lifted to `milestone_title` beside it;
//   - `proposal` is the row's `trigger_description`;
//   - `payment_proof_path` resolves through the storage helper, so a
//     private receipt yields a signed URL (environment-dependent).
//
// Order matters: paid_at precedes payment_proof_path, and the milestone
// block sits between milestone_title and proposal.

// projectResourceTermins renders the resource's termin list oldest-first.
func projectResourceTermins(ctx context.Context, pool *pgxpool.Pool, projectID int64) ([]any, error) {
	rows, err := pool.Query(ctx, `SELECT id, label, percentage::text, amount::text, notes, status::text,
		milestone_id, trigger_description, role_type, recipient_id,
		retention_amount::text, net_amount::text, paid_at, payment_proof_path, verification_notes,
		(SELECT title FROM project_milestones m WHERE m.id = t.milestone_id),
		(SELECT approval_status::text FROM project_milestones m WHERE m.id = t.milestone_id)
		FROM project_payment_termins t WHERE project_id = $1 ORDER BY id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]any, 0)
	for rows.Next() {
		var id, milestoneID, recipientID *int64
		var label, percentage, amount, notes, status, trigger, roleType, retention, net, proofPath, verificationNotes *string
		var paidAt any
		var milestoneTitle, milestoneApproval *string

		if err := rows.Scan(&id, &label, &percentage, &amount, &notes, &status,
			&milestoneID, &trigger, &roleType, &recipientID,
			&retention, &net, &paidAt, &proofPath, &verificationNotes,
			&milestoneTitle, &milestoneApproval); err != nil {
			return nil, err
		}

		entry := jsonphp.NewObject()
		entry.Set("id", nullableInt64(id))
		entry.Set("label", nullableString(label))
		entry.Set("percentage", nullableString(percentage))
		entry.Set("amount", nullableString(amount))
		entry.Set("notes", nullableString(notes))
		entry.Set("status", nullableString(status))
		entry.Set("milestone_id", nullableInt64(milestoneID))
		entry.Set("milestone_title", nullableString(milestoneTitle))
		if milestoneID != nil && *milestoneID != 0 && milestoneTitle != nil {
			block := jsonphp.NewObject()
			block.Set("id", *milestoneID)
			block.Set("title", *milestoneTitle)
			block.Set("approval_status", nullableString(milestoneApproval))
			entry.Set("milestone", block)
		} else {
			entry.Set("milestone", nil)
		}
		entry.Set("proposal", nullableString(trigger))
		entry.Set("role_type", nullableString(roleType))
		entry.Set("recipient_id", nullableInt64(recipientID))
		entry.Set("retention_amount", minorFloat(retention))
		entry.Set("net_amount", minorFloat(net))
		entry.Set("paid_at", projectTimeValue(paidAt))
		proof := ""
		if proofPath != nil {
			proof = *proofPath
		}
		entry.Set("payment_proof_path", resolveStorageURL(ctx, proof))
		entry.Set("verification_notes", nullableString(verificationNotes))

		out = append(out, entry)
	}

	return out, rows.Err()
}

// minorFloat renders a decimal column as the float the resource casts to.
func minorFloat(text *string) float64 {
	if text == nil {
		return 0
	}
	return float64(mustMinor(*text)) / 100
}
