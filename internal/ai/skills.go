package ai

import (
	"context"
	"embed"
	"io/fs"
	"sync"

	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/skilltoolset"
	"google.golang.org/adk/v2/tool/skilltoolset/skill"
)

// Skills are instruction packages shipped with the gateway, not code loaded
// from a user directory. The embedded filesystem is the whole source, so a
// deployment cannot lose a skill because a volume was not mounted, and an
// uploaded file can never become an instruction.
//
//go:embed skills
var skillFiles embed.FS

var (
	skillsOnce sync.Once
	skillsTool tool.Toolset
	skillsErr  error
)

// SkillsToolset returns the process-wide ADK skill toolset. It is safe for
// concurrent turns: the source is read-only and the toolset holds no
// per-user state.
func SkillsToolset(_ context.Context) (tool.Toolset, error) {
	skillsOnce.Do(func() {
		root, err := fs.Sub(skillFiles, "skills")
		if err != nil {
			skillsErr = err
			return
		}
		source := skill.NewFileSystemSource(root)
		// Context.Background is deliberate: the first chat turn may be the
		// one that initializes the cache, and a client disconnecting must not
		// poison every later turn with a canceled context.
		skillsTool, skillsErr = skilltoolset.New(context.Background(), skilltoolset.Config{Source: source})
	})
	return skillsTool, skillsErr
}
