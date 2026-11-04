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
}

// LoadConfig reads the environment.
func LoadConfig() Config {
	cfg := Config{
		APIKey:          strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		BaseURL:         strings.TrimSpace(os.Getenv("DEEPSEEK_BASE_URL")),
		Model:           strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL")),
		Temperature:     0.3,
		MaxOutputTokens: 2048,
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.deepseek.com/v1"
	}
	if cfg.Model == "" {
		cfg.Model = "deepseek-flash"
	}
	return cfg
}

// Enabled reports whether the assistant can answer (a key is configured).
func (c Config) Enabled() bool { return c.APIKey != "" }

// PublicStatus is the safe subset of the config the status endpoint may
// reveal. The key itself is never exposed.
func (c Config) PublicStatus() map[string]any {
	return map[string]any{
		"enabled": c.Enabled(),
		"model":   c.Model,
	}
}
