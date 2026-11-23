package httpapi

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestSafeStorageJoinRejectsEscapes(t *testing.T) {
	base := t.TempDir()

	allowed := []string{"avatars/a.png", "projects/1/file.pdf", "./uploads/x.jpg"}
	for _, rel := range allowed {
		if _, err := safeStorageJoin(base, rel); err != nil {
			t.Fatalf("safeStorageJoin(%q) = %v, want a path", rel, err)
		}
	}

	rejected := []string{
		"../escape.png",
		"a/../../escape.png",
		`..\escape.png`,
		"C:/Windows/system.ini",
		"",
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
