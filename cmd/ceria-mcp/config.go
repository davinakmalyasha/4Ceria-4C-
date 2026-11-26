package main

import (
	"errors"
	"strconv"
	"strings"
	"time"
)

// defaultMCPPingTimeout is how long the MCP front-end waits for PostgreSQL
// to answer its startup ping before refusing to start.
func defaultMCPPingTimeout() time.Duration {
	return 5 * time.Second
}

// validateMCPDSN reports whether dsn names a PostgreSQL database to serve.
// main trims DATABASE_URL the same way as before and exits 2 naming
// DATABASE_URL when it is blank: a tool server that silently answers "no
// data" would be worse than one that refuses to start.
func validateMCPDSN(dsn string) error {
	if strings.TrimSpace(dsn) == "" {
		return errors.New("DATABASE_URL is required")
	}
	return nil
}

// resolveMCPUserID maps the --user flag and the CERIA_MCP_USER_ID
// environment value to the account that owns the session (0 means public
// tools only). An explicit flag always wins and is passed through untouched;
// otherwise a non-blank environment value must be a positive integer.
func resolveMCPUserID(flagVal int64, envRaw string) (int64, error) {
	if flagVal != 0 {
		return flagVal, nil
	}
	if raw := strings.TrimSpace(envRaw); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed <= 0 {
			return 0, errors.New("CERIA_MCP_USER_ID must be a positive integer")
		}
		return parsed, nil
	}
	return 0, nil
}

// resolveMCPAdmin reports whether the session runs with administrator
// scope: either --admin was passed or CERIA_MCP_ADMIN is "true"
// (case-insensitive, surrounding whitespace ignored).
func resolveMCPAdmin(flagVal bool, envRaw string) bool {
	return flagVal || strings.EqualFold(strings.TrimSpace(envRaw), "true")
}
