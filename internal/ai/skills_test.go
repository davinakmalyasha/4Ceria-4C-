package ai

import (
	"context"
	"io/fs"
	"strings"
	"testing"

	"google.golang.org/adk/v2/tool/skilltoolset/skill"
)

func TestEmbeddedSkillsParse(t *testing.T) {
	entries, err := fs.ReadDir(skillFiles, "skills")
	if err != nil {
		t.Fatalf("read skills: %v", err)
	}
	if len(entries) < 6 {
		t.Fatalf("got %d skills, want at least 6", len(entries))
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		raw, err := fs.ReadFile(skillFiles, "skills/"+entry.Name()+"/SKILL.md")
		if err != nil {
			t.Errorf("%s: %v", entry.Name(), err)
			continue
		}
		frontmatter, instructions, err := skill.ParseBytes(raw)
		if err != nil {
			t.Errorf("%s: %v", entry.Name(), err)
			continue
		}
		if frontmatter.Name != entry.Name() {
			t.Errorf("%s: frontmatter name %q", entry.Name(), frontmatter.Name)
		}
		if strings.TrimSpace(frontmatter.Description) == "" {
			t.Errorf("%s: empty description", entry.Name())
		}
		if strings.TrimSpace(instructions) == "" {
			t.Errorf("%s: empty instructions", entry.Name())
		}
	}
}

func TestSkillsToolsetBuilds(t *testing.T) {
	ts, err := SkillsToolset(context.Background())
	if err != nil {
		t.Fatalf("SkillsToolset: %v", err)
	}
	if ts == nil || ts.Name() == "" {
		t.Fatal("empty skills toolset")
	}
}
