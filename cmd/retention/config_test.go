package main

import (
	"testing"

	"github.com/davinakmalyasha/4ceria/internal/httpapi"
)

func TestDefaultRetentionDSN(t *testing.T) {
	cases := []struct {
		name string
		dsn  string
		want string
	}{
		{"unset falls back to baseline", "", "postgres://postgres@127.0.0.1:5432/4ceria_pgcheck"},
		{"explicit passes through", "postgres://app@db:5432/4ceria", "postgres://app@db:5432/4ceria"},
		{"whitespace passes through untrimmed", "   ", "   "},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := defaultRetentionDSN(tc.dsn); got != tc.want {
				t.Errorf("defaultRetentionDSN(%q) = %q, want %q", tc.dsn, got, tc.want)
			}
		})
	}
}

func TestDefaultRetentionMaxConns(t *testing.T) {
	if got := defaultRetentionMaxConns(); got != 4 {
		t.Errorf("defaultRetentionMaxConns() = %d, want 4", got)
	}
}

func TestRetentionProjectFilter(t *testing.T) {
	if got := retentionProjectFilter(0); got != nil {
		t.Errorf("retentionProjectFilter(0) = %d, want nil", *got)
	}
	for _, id := range []int64{1, 12, -3} {
		got := retentionProjectFilter(id)
		if got == nil {
			t.Errorf("retentionProjectFilter(%d) = nil, want pointer", id)
			continue
		}
		if *got != id {
			t.Errorf("retentionProjectFilter(%d) points to %d", id, *got)
		}
	}
}

func TestRetentionVerb(t *testing.T) {
	if got := retentionVerb(false); got != "Released" {
		t.Errorf("retentionVerb(false) = %q, want %q", got, "Released")
	}
	if got := retentionVerb(true); got != "WOULD RELEASE" {
		t.Errorf("retentionVerb(true) = %q, want %q", got, "WOULD RELEASE")
	}
}

func TestFormatIDR(t *testing.T) {
	cases := []struct {
		name  string
		minor int64
		want  string
	}{
		{"zero", 0, "0"},
		{"sub-rupiah truncates", 1, "0"},
		{"ninety-nine sen truncates", 99, "0"},
		{"one rupiah", 100, "1"},
		{"fraction truncates", 199, "1"},
		{"tens", 1000, "10"},
		{"thousands group", 100000, "1.000"},
		{"thousands", 123400, "1.234"},
		{"millions", 123456700, "1.234.567"},
		{"exact millions", 100000000, "1.000.000"},
		{"billions", 123456789012, "1.234.567.890"},
		{"negative sub-rupiah", -1, "-0"},
		{"negative", -250, "-2"},
		{"negative groups", -123456700, "-1.234.567"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := formatIDR(tc.minor); got != tc.want {
				t.Errorf("formatIDR(%d) = %q, want %q", tc.minor, got, tc.want)
			}
		})
	}
}

func TestFormatRetentionSummary(t *testing.T) {
	res := httpapi.RetentionReleaseResult{
		Scanned:            5,
		ReleasedStages:     2,
		ReleasedTotalMinor: 123456700,
		SkippedBlocked:     1,
		SkippedDispute:     1,
		SkippedNothingHeld: 1,
	}
	total, stats := formatRetentionSummary(res, false)
	if total != "Released 2 stage(s), total Rp 1.234.567" {
		t.Errorf("total line = %q", total)
	}
	if stats != "projects scanned 5 | skipped (blocking claim) 1 | skipped (open dispute) 1 | skipped (nothing held) 1" {
		t.Errorf("stats line = %q", stats)
	}

	dryTotal, dryStats := formatRetentionSummary(res, true)
	if dryTotal != "WOULD RELEASE 2 stage(s), total Rp 1.234.567" {
		t.Errorf("dry-run total line = %q", dryTotal)
	}
	if dryStats != stats {
		t.Errorf("dry-run stats line = %q, want %q", dryStats, stats)
	}

	emptyTotal, emptyStats := formatRetentionSummary(httpapi.RetentionReleaseResult{}, false)
	if emptyTotal != "Released 0 stage(s), total Rp 0" {
		t.Errorf("empty total line = %q", emptyTotal)
	}
	if emptyStats != "projects scanned 0 | skipped (blocking claim) 0 | skipped (open dispute) 0 | skipped (nothing held) 0" {
		t.Errorf("empty stats line = %q", emptyStats)
	}
}
