package httpapi

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// setAppUser pins the request's user into the database session for RLS.
//
// RLS policies read `current_setting('app.user_id', true)`: unset → allow
// (legacy path), set → enforce ownership as a second layer behind the
// handler WHERE. Call it at the top of a transaction that touches RLS-gated
// tables; `SET LOCAL` dies with the transaction so pooled sessions never leak.
func setAppUser(ctx context.Context, tx pgx.Tx, userID int64) error {
	if userID == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `SELECT set_config('app.user_id', $1, true)`, int64String(userID))
	return err
}

func int64String(v int64) string {
	if v == 0 {
		return ""
	}
	// Avoid importing strconv here twice; small local itoa.
	if v < 0 {
		return "-" + uintString(uint64(-v))
	}
	return uintString(uint64(v))
}

func uintString(v uint64) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}
