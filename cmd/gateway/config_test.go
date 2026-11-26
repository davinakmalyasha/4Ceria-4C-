package main

import (
	"os"
	"reflect"
	"testing"
	"time"
)

func TestDefaultGatewayConfig(t *testing.T) {
	got := defaultGatewayConfig()
	want := gatewayConfig{
		manifestPath:    "routing/routes.yaml",
		addr:            ":8080",
		readTimeout:     15 * time.Second,
		writeTimeout:    30 * time.Second,
		shutdownTimeout: 20 * time.Second,
	}
	if got != want {
		t.Errorf("defaultGatewayConfig() = %+v, want %+v", got, want)
	}
}

func TestServerTuning(t *testing.T) {
	readHeader, idle, maxHeader := serverTuning()
	if readHeader != 10*time.Second {
		t.Errorf("readHeaderTimeout = %v, want 10s", readHeader)
	}
	if idle != 2*time.Minute {
		t.Errorf("idleTimeout = %v, want 2m", idle)
	}
	if maxHeader != 1<<20 {
		t.Errorf("maxHeaderBytes = %d, want %d", maxHeader, 1<<20)
	}
}

func TestProdSecretsMissing(t *testing.T) {
	cases := []struct {
		name     string
		appKey   string
		resend   string
		wantMiss []string
	}{
		{"both set", "k", "r", nil},
		{"app key missing", "", "r", []string{"APP_KEY"}},
		{"resend key missing", "k", "", []string{"RESEND_API_KEY"}},
		{"both missing in order", "", "", []string{"APP_KEY", "RESEND_API_KEY"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := prodSecretsMissing(tc.appKey, tc.resend); !reflect.DeepEqual(got, tc.wantMiss) {
				t.Errorf("prodSecretsMissing(%q, %q) = %v, want %v", tc.appKey, tc.resend, got, tc.wantMiss)
			}
		})
	}
}

func TestParsePositiveInt(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		def  int
		want int
	}{
		{"empty keeps default", "", 20, 20},
		{"blank keeps default", "   ", 20, 20},
		{"valid", "30", 20, 30},
		{"surrounding whitespace ignored", "  30\t", 20, 30},
		{"zero keeps default", "0", 20, 20},
		{"negative keeps default", "-5", 20, 20},
		{"non-numeric keeps default", "abc", 20, 20},
		{"trailing junk keeps default", "12x", 20, 20},
		{"leading plus wins", "+7", 20, 7},
		{"leading zeros win", "007", 20, 7},
		{"other default honored", "", 2, 2},
		{"other default overridden", "8", 2, 8},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := parsePositiveInt(tc.raw, tc.def); got != tc.want {
				t.Errorf("parsePositiveInt(%q, %d) = %d, want %d", tc.raw, tc.def, got, tc.want)
			}
		})
	}
}

func TestResolvePoolConns(t *testing.T) {
	cases := []struct {
		name    string
		maxRaw  string
		minRaw  string
		wantMax int32
		wantMin int32
	}{
		{"defaults", "", "", 20, 2},
		{"overrides", "64", "8", 64, 8},
		{"invalid keeps defaults", "abc", "0", 20, 2},
		{"whitespace tolerated", " 32 ", "\t4\n", 32, 4},
		{"negatives keep defaults", "-1", "-2", 20, 2},
		{"mixed", "64", "bogus", 64, 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotMax, gotMin := resolvePoolConns(tc.maxRaw, tc.minRaw)
			if gotMax != tc.wantMax || gotMin != tc.wantMin {
				t.Errorf("resolvePoolConns(%q, %q) = (%d, %d), want (%d, %d)",
					tc.maxRaw, tc.minRaw, gotMax, gotMin, tc.wantMax, tc.wantMin)
			}
		})
	}
}

func TestEnvInt(t *testing.T) {
	const key = "CERIA_TEST_GATEWAY_ENVINT"
	cases := []struct {
		name  string
		set   bool
		value string
		def   int
		want  int
	}{
		{"unset keeps default", false, "", 20, 20},
		{"valid", true, "30", 20, 30},
		{"whitespace trimmed", true, "  30 ", 20, 30},
		{"empty keeps default", true, "", 20, 20},
		{"blank keeps default", true, "   ", 20, 20},
		{"zero keeps default", true, "0", 20, 20},
		{"negative keeps default", true, "-5", 20, 20},
		{"non-numeric keeps default", true, "many", 20, 20},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if !tc.set {
				if err := os.Unsetenv(key); err != nil {
					t.Fatal(err)
				}
			} else {
				t.Setenv(key, tc.value)
			}
			if got := envInt(key, tc.def); got != tc.want {
				t.Errorf("envInt(%q, %d) = %d, want %d", key, tc.def, got, tc.want)
			}
		})
	}
}

func TestEnvIsProd(t *testing.T) {
	keys := []string{"APP_ENV", "GO_ENV", "ENV"}
	cases := []struct {
		name   string
		values map[string]string
		want   bool
	}{
		{"all unset", nil, false},
		{"all empty", map[string]string{}, false},
		{"app env production", map[string]string{"APP_ENV": "production"}, true},
		{"case-insensitive", map[string]string{"APP_ENV": "Production"}, true},
		{"whitespace tolerated", map[string]string{"APP_ENV": " production "}, true},
		{"go env production", map[string]string{"GO_ENV": "production"}, true},
		{"env production", map[string]string{"ENV": "production"}, true},
		{"staging is not prod", map[string]string{"APP_ENV": "staging"}, false},
		{"development is not prod", map[string]string{"APP_ENV": "development", "GO_ENV": "test"}, false},
		{"any key triggers", map[string]string{"APP_ENV": "development", "GO_ENV": "production"}, true},
		{"prefix is not prod", map[string]string{"APP_ENV": "production-ish"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, k := range keys {
				t.Setenv(k, tc.values[k])
			}
			if got := envIsProd(); got != tc.want {
				t.Errorf("envIsProd() with %v = %v, want %v", tc.values, got, tc.want)
			}
		})
	}
}
