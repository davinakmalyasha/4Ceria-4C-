// Package ai is the 4Ceria AI assistant.
//
// WHAT IT IS
// ----------
// A Go ADK v2 (google.golang.org/adk/v2) agent backed by a DeepSeek
// OpenAI-compatible model, with read-only PostgreSQL tools scoped to the
// calling user. The HTTP layer lives in internal/httpapi (aichat.go); this
// package owns configuration, the system prompt, input/output guards, the
// tool definitions, the ADK runner wiring and the chat-history store.
//
// WHAT IT IS NOT
// -------------
// The agent never moves money. Every tool is read-only except
// platform_help and estimate_budget, which compute from constants. Any
// payment, bid, contract or dispute write must happen through the normal
// API routes, where the escrow FreezeGate and the dispute checks live.
package ai

import (
	"os"
	"strconv"
	"strings"
)

// Config carries the model wiring. The only secret is APIKey; everything
// else has a safe default so the single thing an operator must do is paste
// the key into the environment.
type Config struct {
	// APIKey is the DeepSeek key ($DEEPSEEK_API_KEY). Empty means the
	// assistant is disabled and the HTTP layer answers 503.
	APIKey string
	// BaseURL is the OpenAI-compatible endpoint. Defaults to DeepSeek.
	BaseURL string
	// Model is the DeepSeek model id. Defaults to deepseek-flash
	// (DeepSeek-V4.1-Flash), the current tool-calling model.
	Model string
	// Temperature for generation. Low: this is a factual assistant.
	Temperature float32
	// MaxOutputTokens caps one answer.
	MaxOutputTokens int32
	// MaxSteps caps the model/tool loop for one turn.
	MaxSteps int
	// Memory enables long-term memory and the preload tool. The per-user
	// setting can still turn it off; this is the operator kill switch.
	Memory bool
	// Specialists enables the property/project single-turn specialist
	// agents. The direct tools stay available either way, so a failed
	// delegation cannot remove a capability.
	Specialists bool
}

// LoadConfig reads the environment.
func LoadConfig() Config {
	cfg := Config{
		APIKey:          strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		BaseURL:         strings.TrimSpace(os.Getenv("DEEPSEEK_BASE_URL")),
		Model:           strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL")),
		Temperature:     0.3,
		MaxOutputTokens: 2048,
		MaxSteps:        10,
		Memory:          envBool("AI_MEMORY", true),
		Specialists:     envBool("AI_SPECIALISTS", true),
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.deepseek.com/v1"
	}
	if cfg.Model == "" {
		cfg.Model = "deepseek-flash"
	}
	if raw := strings.TrimSpace(os.Getenv("AI_MAX_STEPS")); raw != "" {
		if steps, err := strconv.Atoi(raw); err == nil && steps > 0 {
			cfg.MaxSteps = steps
		}
	}
	if cfg.MaxSteps > 20 {
		cfg.MaxSteps = 20
	}
	return cfg
}

func envBool(name string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	switch strings.ToLower(raw) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

// Enabled reports whether the assistant can answer (a key is configured).
func (c Config) Enabled() bool { return c.APIKey != "" }

// PublicStatus is the safe subset of the config the status endpoint may
// reveal. The key itself is never exposed.
func (c Config) PublicStatus() map[string]any {
	return map[string]any{
		"enabled":     c.Enabled(),
		"model":       c.Model,
		"memory":      c.Memory,
		"specialists": c.Specialists,
	}
}
