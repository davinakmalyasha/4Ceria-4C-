package httpapi

import (
	"context"
	"crypto/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// STORAGE
// -------
// Uploads are stored on disk (or in S3 when configured) and every URL the API
// emits points at `/storage/<relative path>`. Public folders are readable by
// anyone; private folders need either a short-lived HMAC signature or a signed-in
// caller. This is the missing half of the upload contract: without it every
// avatar, receipt and evidence link is a 404.
var fallbackStorageKey struct {
	once sync.Once
	key  []byte
}

func storageKey() []byte {
	if key := os.Getenv("APP_KEY"); key != "" {
		return []byte(key)
	}

	fallbackStorageKey.once.Do(func() {
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			key = []byte("4ceria-ephemeral-storage-key")
		}
		fallbackStorageKey.key = key
	})

	return fallbackStorageKey.key
}

func storageRootFor(rel string) string {
	trimmed := strings.TrimPrefix(strings.ReplaceAll(rel, "\\", "/"), "/")

	for _, prefix := range publicStoragePrefixes {
		if strings.HasPrefix(trimmed, prefix) {
			return publicDiskRoot()
		}
	}

	if base := os.Getenv("EVIDENCE_DIR"); base != "" {
		return base
	}

	return publicDiskRoot()
}

func isPublicStoragePath(rel string) bool {
	trimmed := strings.TrimPrefix(strings.ReplaceAll(rel, "\\", "/"), "/")

	for _, prefix := range publicStoragePrefixes {
		if strings.HasPrefix(trimmed, prefix) {
			return true
		}
	}

	return false
}

func (r *Router) storage(w http.ResponseWriter, req *http.Request) {
	rel := strings.TrimPrefix(req.PathValue("path"), "/")
	if rel == "" || strings.Contains(rel, "\x00") {
		message(w, http.StatusNotFound, "Not found.")
		return
	}

	signatureOK := false
	if rawExpiry := req.URL.Query().Get("expires"); rawExpiry != "" {
		expires, err := strconv.ParseInt(rawExpiry, 10, 64)
		if err == nil && verifyStorageURL(rel, expires, req.URL.Query().Get("sig")) {
			signatureOK = true
		}
	}

	if !isPublicStoragePath(rel) && !signatureOK {
		if r.gates.Auth == nil {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}

		caller, err := r.gates.Auth.Authenticate(req)
		if err != nil || caller == nil {
			message(w, http.StatusUnauthorized, "Unauthenticated.")
			return
		}
	}

	full, err := safeStorageJoin(storageRootFor(rel), rel)
	if err != nil {
		message(w, http.StatusNotFound, "Not found.")
		return
	}

	file, err := os.Open(full)
	if err != nil {
		// Older rows may point at a file written before the private root was
		// split out. The public root is still a valid local fallback.
		fallback, joinErr := safeStorageJoin(publicDiskRoot(), rel)
		if joinErr == nil {
			file, err = os.Open(fallback)
		}
		if err != nil {
			message(w, http.StatusNotFound, "Not found.")
			return
		}
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil || info.IsDir() {
		message(w, http.StatusNotFound, "Not found.")
		return
	}

	w.Header().Set("X-Content-Type-Options", "nosniff")
	if isPublicStoragePath(rel) || signatureOK {
		w.Header().Set("Cache-Control", "public, max-age=3600")
	} else {
		w.Header().Set("Cache-Control", "private, no-store")
	}

	http.ServeContent(w, req, info.Name(), info.ModTime(), file)
}

// storageSignedURL is the local-disk signed URL for a private file.
func storageSignedURL(rel string) string {
	return presignedLocalURL(strings.TrimPrefix(rel, "/"), 15*time.Minute)
}

// storageSignedURLFor prefers the bucket when S3 is configured, then falls
// back to the local HMAC-signed URL.
func storageSignedURLFor(ctx context.Context, rel string) string {
	trimmed := strings.TrimPrefix(rel, "/")
	if s3Configured() {
		if signed, ok := presignedS3Get(ctx, trimmed, 15*time.Minute); ok {
			return signed
		}
	}
	return storageSignedURL(trimmed)
}
