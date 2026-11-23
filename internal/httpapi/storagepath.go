package httpapi

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"time"
)

// errUnsafeStoragePath rejects a path that would escape its storage root.
var errUnsafeStoragePath = errors.New("unsafe storage path")

// safeStorageJoin resolves a storage-relative path inside base.
//
// Every path that reaches the filesystem from the database or an upload goes
// through here: a leading slash, a backslash, or a `..` segment must never be
// able to read, write or delete outside the configured root.
func safeStorageJoin(base, rel string) (string, error) {
	rel = strings.TrimSpace(rel)
	if rel == "" {
		return "", errUnsafeStoragePath
	}

	rel = strings.ReplaceAll(rel, "\\", "/")
	rel = strings.TrimPrefix(rel, "/")

	clean := filepath.Clean(filepath.FromSlash(rel))
	if clean == "." || clean == ".." || filepath.IsAbs(clean) ||
		strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", errUnsafeStoragePath
	}

	baseAbs, err := filepath.Abs(base)
	if err != nil {
		return "", err
	}
	fullAbs, err := filepath.Abs(filepath.Join(baseAbs, clean))
	if err != nil {
		return "", err
	}
	inside, err := filepath.Rel(baseAbs, fullAbs)
	if err != nil || inside == ".." || strings.HasPrefix(inside, ".."+string(filepath.Separator)) {
		return "", errUnsafeStoragePath
	}

	return fullAbs, nil
}

// sanitiseExtension keeps only a short alphanumeric suffix. A client filename
// is a label, never a path: `photo.jpg/../../x` contributes nothing.
func sanitiseExtension(name string) string {
	base := filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	dot := strings.LastIndex(base, ".")
	if dot < 0 || dot == len(base)-1 {
		return ""
	}

	ext := strings.ToLower(base[dot+1:])
	if len(ext) == 0 || len(ext) > 8 {
		return ""
	}

	for _, ch := range ext {
		if (ch < 'a' || ch > 'z') && (ch < '0' || ch > '9') {
			return ""
		}
	}

	return ext
}

// publicStoragePrefixes mirrors App\Support\StoragePath::PUBLIC_PREFIXES.
var publicStoragePrefixes = []string{
	"addendums/", "avatars/", "chat_images/", "daily_logs/", "design_briefs/",
	"deliveries/", "delivery_docs/", "firm_banners/", "materials/", "milestone_files/",
	"milestones/", "portfolios/", "project_assets/", "project_attachments/",
	"project_images/", "projects/", "reviews/", "suppliers/", "team-members/", "uploads/",
}

// resolveStorageURL mirrors ProjectResource::resolveStorageUrl.
//
// PRIVATE paths (the allowlist decides — everything else is private) resolve
// through the vault: on this stack that is the public disk's RELATIVE url,
// while public prefixes use asset() and therefore an absolute URL. Production
// presigns private paths instead of handing out a world-readable link.
func resolveStorageURL(ctx context.Context, path string) any {
	if path == "" {
		return nil
	}

	const s3Prefix = "https://t3.storageapi.dev/fourc-storage-fneicjrzkq3/"
	if strings.HasPrefix(path, s3Prefix) {
		path = strings.TrimPrefix(path, s3Prefix)
	} else if strings.Contains(path, "/storage/") {
		parts := strings.Split(path, "/storage/")
		path = parts[len(parts)-1]
	} else if isExternalURL(path) {
		return path
	}

	trimmed := strings.TrimPrefix(path, "/")
	private := true
	for _, prefix := range publicStoragePrefixes {
		if strings.HasPrefix(trimmed, prefix) {
			private = false
			break
		}
	}
	if private {
		if s3Configured() {
			if signed, ok := presignedS3Get(ctx, trimmed, 15*time.Minute); ok {
				return signed
			}
		}
		return storageSignedURL(trimmed)
	}

	return projectStorageURL(ctx, path)
}
