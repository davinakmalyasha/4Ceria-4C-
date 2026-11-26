package main

import (
	"testing"
	"time"
)

func TestDefaultMCPPingTimeout(t *testing.T) {
	if got := defaultMCPPingTimeout(); got != 5*time.Second {
		t.Errorf("defaultMCPPingTimeout() = %v, want 5s", got)
	}
}

func TestValidateMCPDSN(t *testing.T) {
	cases := []struct {
		name    string
		dsn     string
		wantErr string
	}{
		{"empty", "", "DATABASE_URL is required"},
		{"blank", "   ", "DATABASE_URL is required"},
		{"whitespace only", "\t\n ", "DATABASE_URL is required"},
		{"valid", "postgres://postgres@127.0.0.1:5432/4ceria", ""},
		{"valid with padding passes", "  postgres://x  ", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateMCPDSN(tc.dsn)
			if tc.wantErr == "" {
				if err != nil {
					t.Errorf("validateMCPDSN(%q) = %v, want nil", tc.dsn, err)
				}
				return
			}
			if err == nil || err.Error() != tc.wantErr {
				t.Errorf("validateMCPDSN(%q) = %v, want error %q", tc.dsn, err, tc.wantErr)
			}
		})
	}
}

func TestResolveMCPUserID(t *testing.T) {
	const msg = "CERIA_MCP_USER_ID must be a positive integer"
	cases := []struct {
		name    string
		flagVal int64
		envRaw  string
		want    int64
		wantErr string
	}{
		{"flag wins", 42, "", 42, ""},
		{"flag wins over invalid env", 42, "bogus", 42, ""},
		{"flag wins over valid env", 7, "9", 7, ""},
		{"negative flag passes through", -5, "", -5, ""},
		{"empty env means public", 0, "", 0, ""},
		{"blank env means public", 0, "   ", 0, ""},
		{"env id", 0, "7", 7, ""},
		{"env id padded", 0, "  7  ", 7, ""},
		{"env with plus", 0, "+9", 9, ""},
		{"non-numeric env", 0, "abc", 0, msg},
		{"zero env", 0, "0", 0, msg},
		{"negative env", 0, "-3", 0, msg},
		{"fractional env", 0, "1.5", 0, msg},
		{"overflowing env", 0, "9999999999999999999999", 0, msg},
		{"alphanumeric env", 0, "12x", 0, msg},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := resolveMCPUserID(tc.flagVal, tc.envRaw)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("resolveMCPUserID(%d, %q) error = %v, want nil", tc.flagVal, tc.envRaw, err)
				}
				if got != tc.want {
					t.Errorf("resolveMCPUserID(%d, %q) = %d, want %d", tc.flagVal, tc.envRaw, got, tc.want)
				}
				return
			}
			if err == nil || err.Error() != tc.wantErr {
				t.Errorf("resolveMCPUserID(%d, %q) error = %v, want %q", tc.flagVal, tc.envRaw, err, tc.wantErr)
			}
			if got != 0 {
				t.Errorf("resolveMCPUserID(%d, %q) = %d on error, want 0", tc.flagVal, tc.envRaw, got)
			}
		})
	}
}

func TestResolveMCPAdmin(t *testing.T) {
	cases := []struct {
		name    string
		flagVal bool
		envRaw  string
		want    bool
	}{
		{"flag only", true, "", true},
		{"flag beats false env", true, "false", true},
		{"env true", false, "true", true},
		{"env case-insensitive", false, "TRUE", true},
		{"env padded", false, " true ", true},
		{"neither", false, "", false},
		{"one is not true", false, "1", false},
		{"yes is not true", false, "yes", false},
		{"false env", false, "false", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveMCPAdmin(tc.flagVal, tc.envRaw); got != tc.want {
				t.Errorf("resolveMCPAdmin(%v, %q) = %v, want %v", tc.flagVal, tc.envRaw, got, tc.want)
			}
		})
	}
}
