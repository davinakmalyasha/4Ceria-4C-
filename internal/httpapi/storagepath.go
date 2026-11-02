package httpapi

import (
	"context"
	"strings"
)

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
		return "/storage/" + trimmed
	}
	return projectStorageURL(ctx, path)
}
