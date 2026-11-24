package httpapi

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestSafeStorageJoinRejectsEscapes(t *testing.T) {
	base := t.TempDir()

	allowed := []string{
		"avatars/a.png",
		"projects/1/file.pdf",
		"./uploads/x.jpg",
		"/uploads/x.jpg",
		"uploads/2026/11/receipt.pdf",
		"uploads/a:b.png",
	}
	for _, rel := range allowed {
		if _, err := safeStorageJoin(base, rel); err != nil {
			t.Fatalf("safeStorageJoin(%q) = %v, want a path", rel, err)
		}
	}

	rejected := []string{
		"",
		"../escape.png",
		"a/../../escape.png",
		`..\escape.png`,
		"..",
		".",
		// Drive-qualified paths are absolute on Windows but relative on
		// Unix. They must be rejected on every host.
		"C:/Windows/system.ini",
		`C:\Windows\system.ini`,
		"c:relative.txt",
		"C:",
		"./C:/Windows/system.ini",
		// UNC and device forms.
		`\\server\share\file.png`,
		"//server/share/file.png",
		`\\?\C:\Windows\system.ini`,
		`\\.\PhysicalDrive0`,
		"//?/C:/Windows/system.ini",
		"//./PhysicalDrive0",
		// NUL bytes cannot be a path.
		"avatars/a\x00.png",
	}

	for _, rel := range rejected {
		full, err := safeStorageJoin(base, rel)
		if err == nil {
			t.Errorf("safeStorageJoin(%q) = %q, want an error", rel, full)
			continue
		}

		if full != "" && !strings.HasPrefix(full, base) {
			t.Errorf("safeStorageJoin(%q) escaped to %q", rel, full)
		}
	}
}

func TestUnsafeStorageRelativeIsHostIndependent(t *testing.T) {
	for _, rel := range []string{
		"C:/x", "c:x", "C:", `\\server\share`, "//server/share",
		`\\?\C:\x`, `\\.\x`,
	} {
		normalised := strings.ReplaceAll(rel, "\\", "/")
		if !unsafeStorageRelative(normalised) {
			t.Errorf("unsafeStorageRelative(%q) = false, want true", normalised)
		}
	}

	for _, rel := range []string{"avatars/a.png", "uploads/a:b.png", "a/b", "a..b"} {
		if unsafeStorageRelative(rel) {
			t.Errorf("unsafeStorageRelative(%q) = true, want false", rel)
		}
	}
}

func TestSanitiseExtension(t *testing.T) {
	cases := map[string]string{
		"photo.JPG":             "jpg",
		"receipt.pdf":           "pdf",
		"a.jpg/../../evil.sh":   "sh",
		"archive.tar.gz":        "gz",
		"no-extension":          "",
		"bad.$ext":              "",
		"name.":                 "",
		`windows\path\file.PNG`: "png",
	}

	for input, want := range cases {
		if got := sanitiseExtension(input); got != want {
			t.Errorf("sanitiseExtension(%q) = %q, want %q", input, got, want)
		}
	}

	joined, err := safeStorageJoin(t.TempDir(), filepath.FromSlash("avatars/"+strings.Repeat("a", 40)+".jpg"))
	if err != nil || !strings.HasSuffix(joined, ".jpg") {
		t.Fatalf("stored path = %q, %v", joined, err)
	}
}
