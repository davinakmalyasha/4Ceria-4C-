package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// gatewayConfig carries the flag-driven tunables for the gateway process.
//
// defaultGatewayConfig returns the same defaults the --flags declare, so
// tests can pin the contract without executing main. main passes the
// returned values straight into the flag declarations, keeping one source
// of truth for the defaults.
type gatewayConfig struct {
	manifestPath    string
	addr            string
	readTimeout     time.Duration
	writeTimeout    time.Duration
	shutdownTimeout time.Duration
}

func defaultGatewayConfig() gatewayConfig {
	return gatewayConfig{
		manifestPath:    "routing/routes.yaml",
		addr:            ":8080",
		readTimeout:     15 * time.Second,
		writeTimeout:    30 * time.Second,
		shutdownTimeout: 20 * time.Second,
	}
}

// serverTuning returns the fixed (non-flag) HTTP server tunables used for
// the gateway listener: header-read timeout, idle timeout and header cap.
func serverTuning() (readHeaderTimeout, idleTimeout time.Duration, maxHeaderBytes int) {
	return 10 * time.Second, 2 * time.Minute, 1 << 20
}

// prodSecretsMissing names the required production secrets that are empty.
// main calls it only when envIsProd is true and refuses to boot, naming the
// first missing secret exactly as before.
func prodSecretsMissing(appKey, resendKey string) []string {
	var missing []string
	if appKey == "" {
		missing = append(missing, "APP_KEY")
	}
	if resendKey == "" {
		missing = append(missing, "RESEND_API_KEY")
	}
	return missing
}

// parsePositiveInt applies the gateway's PGPOOL_* parsing rule to a raw
// environment value: surrounding whitespace is ignored and only integers
// greater than zero win, otherwise def is kept.
func parsePositiveInt(raw string, def int) int {
	if strings.TrimSpace(raw) != "" {
		if v, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil && v > 0 {
			return v
		}
	}
	return def
}

// resolvePoolConns maps raw PGPOOL_MAX_CONNS / PGPOOL_MIN_CONNS environment
// values to the pgxpool connection caps, keeping the historical defaults of
// 20 open and 2 idle connections.
func resolvePoolConns(maxRaw, minRaw string) (maxConns, minConns int32) {
	return int32(parsePositiveInt(maxRaw, 20)), int32(parsePositiveInt(minRaw, 2))
}

func envInt(key string, def int) int {
	if raw := os.Getenv(key); raw != "" {
		if v, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil && v > 0 {
			return v
		}
	}
	return def
}

// envIsProd reports whether the process runs in production. Staging can opt
// into the same strictness by setting APP_ENV or GO_ENV to `production`.
func envIsProd() bool {
	for _, key := range []string{"APP_ENV", "GO_ENV", "ENV"} {
		if strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "production") {
			return true
		}
	}
	return false
}
