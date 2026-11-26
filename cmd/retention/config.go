package main

import (
	"fmt"

	"github.com/davinakmalyasha/4ceria/internal/httpapi"
)

// defaultRetentionDSN is the local baseline used when DATABASE_URL is
// unset. A set value passes through untouched (not even trimmed), exactly
// as before.
func defaultRetentionDSN(dsn string) string {
	if dsn == "" {
		return "postgres://postgres@127.0.0.1:5432/4ceria_pgcheck"
	}
	return dsn
}

// defaultRetentionMaxConns caps the sweeper pool: single-purpose sweeper,
// small pool, short life.
func defaultRetentionMaxConns() int32 {
	return 4
}

// retentionProjectFilter maps the --project flag to the
// ReleaseExpiredRetentions filter: 0 means scan all expired projects (nil),
// any other id scopes the sweep to that project.
func retentionProjectFilter(projectID int64) *int64 {
	if projectID == 0 {
		return nil
	}
	v := projectID
	return &v
}

// retentionVerb names the outcome for the totals line: a dry run releases
// nothing, so the line reports what WOULD be released.
func retentionVerb(dryRun bool) string {
	if dryRun {
		return "WOULD RELEASE"
	}
	return "Released"
}

// formatRetentionSummary renders the two trailing report lines: the totals
// line (verb, released stage count, grouped rupiah total) and the
// per-outcome scan counters.
func formatRetentionSummary(res httpapi.RetentionReleaseResult, dryRun bool) (totalLine, statsLine string) {
	totalLine = fmt.Sprintf("%s %d stage(s), total Rp %s",
		retentionVerb(dryRun), res.ReleasedStages, formatIDR(res.ReleasedTotalMinor))
	statsLine = fmt.Sprintf("projects scanned %d | skipped (blocking claim) %d | skipped (open dispute) %d | skipped (nothing held) %d",
		res.Scanned, res.SkippedBlocked, res.SkippedDispute, res.SkippedNothingHeld)
	return totalLine, statsLine
}

func formatIDR(minor int64) string {
	neg := minor < 0
	if neg {
		minor = -minor
	}
	whole := minor / 100
	var digits []byte
	if whole == 0 {
		digits = []byte("0")
	} else {
		for whole > 0 {
			digits = append([]byte{byte('0' + whole%10)}, digits...)
			whole /= 10
		}
	}
	var grouped []byte
	for i, c := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			grouped = append(grouped, '.')
		}
		grouped = append(grouped, c)
	}
	if neg {
		return "-" + string(grouped)
	}
	return string(grouped)
}
