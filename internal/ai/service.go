package ai

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/memory"
	"google.golang.org/adk/v2/model/openaimodel"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

// The ADK wiring: model client, per-turn agent, ephemeral session, memory
// service, and the two call shapes (one-shot and streaming).
//
// WHY THE SESSION IS EPHEMERAL
// ----------------------------
// PostgreSQL is the source of truth. A chat has one durable transcript in
// ai_chat_messages; the ADK session exists only for the duration of one turn.
// Before the run, the last turns are replayed into a fresh in-memory session;
// after the run, the session is discarded.
//
// The previous implementation kept a shared in-memory session service for the
// process lifetime and ALSO folded the transcript into the user message. That
// duplicated the context, leaked every session until restart, and made two
// gateway instances behave differently. This design has none of those
// properties: any instance can answer from the database, and a restart loses
// nothing.
//
// Long-term memory is separate and persistent (memory.go). It is scoped by
// user, not by session, so it survives a deleted conversation only while the
// user keeps it.

// TurnInput is one chat turn.
type TurnInput struct {
	Pool          *pgxpool.Pool
	UserID        int64
	IsAdmin       bool
	SessionID     string
	Message       string
	History       []StoredMessage
	MemoryEnabled bool
}

// TurnResult is the answer plus the facts the HTTP layer and logs need.
type TurnResult struct {
	Text  string
	Tools []string
	Steps int
	Usage *genai.GenerateContentResponseUsageMetadata
}

// StreamChunk is one SSE payload.
type StreamChunk struct {
	Text       string
	Replace    string
	Tool       string
	ToolStatus string
	Done       bool
	Error      string
}

// adkUserID is the ADK user key. Memory parses the "user-" prefix back to the
// numeric account id.
func adkUserID(userID int64) string { return fmt.Sprintf("user-%d", userID) }

// buildRunner constructs a per-turn runner. The model and agents are cheap to
// construct; the session is fresh and contains only the replayed transcript.
func buildRunner(ctx context.Context, cfg Config, tc ToolCtx, history []StoredMessage) (*runner.Runner, error) {
	llm, err := openaimodel.NewModel(ctx, cfg.Model, &openaimodel.ClientConfig{
		APIKey:  cfg.APIKey,
		BaseURL: cfg.BaseURL,
		API:     openaimodel.APIChatCompletions,
	})
	if err != nil {
		return nil, fmt.Errorf("ai model: %w", err)
	}

	tools, toolsets, err := BuildAgentTools(ctx, cfg, tc, llm)
	if err != nil {
		return nil, fmt.Errorf("ai tools: %w", err)
	}
	temp := cfg.Temperature
	instruction := SystemInstruction
	if !cfg.Specialists {
		instruction += "\nSpecialist agents are disabled for this deployment; use the direct tools.\n"
	}
	if !cfg.Memory || !tc.MemoryEnabled {
		instruction += "\nLong-term memory tools are unavailable for this account or deployment; do not claim to remember anything.\n"
	}
	ag, err := llmagent.New(llmagent.Config{
		Name:        "ceria_assistant",
		Description: "4Ceria assistant: projects, property and materials search, platform guidance.",
		Instruction: instruction,
		Model:       llm,
		Tools:       tools,
		Toolsets:    toolsets,
		GenerateContentConfig: &genai.GenerateContentConfig{
			Temperature:     &temp,
			MaxOutputTokens: cfg.MaxOutputTokens,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("ai agent: %w", err)
	}

	sessions := session.InMemoryService()
	userID := adkUserID(tc.UserID)
	created, err := sessions.Create(ctx, &session.CreateRequest{
		AppName:   "ceria",
		UserID:    userID,
		SessionID: tc.SessionID,
	})
	if err != nil {
		return nil, fmt.Errorf("ai session: %w", err)
	}
	if err := replayHistory(ctx, sessions, created.Session, history); err != nil {
		return nil, fmt.Errorf("ai replay: %w", err)
	}

	var mem memory.Service = memory.InMemoryService()
	if tc.Pool != nil && tc.MemoryEnabled {
		mem = newCachedMemoryService(NewEnabledMemoryService(tc.Pool, true))
	}

	r, err := runner.New(runner.Config{
		AppName:           "ceria",
		Agent:             ag,
		SessionService:    sessions,
		MemoryService:     mem,
		AutoCreateSession: false,
	})
	if err != nil {
		return nil, fmt.Errorf("ai runner: %w", err)
	}
	return r, nil
}

// replayHistory turns durable stored turns into ADK events, oldest first.
// Only text is replayed: tool calls are not needed for conversational
// continuity, and replaying a stale tool result would present old data as
// current.
func replayHistory(ctx context.Context, sessions session.Service, sess session.Session, history []StoredMessage) error {
	if len(history) == 0 {
		return nil
	}
	if len(history) > MaxHistoryMessages {
		history = history[len(history)-MaxHistoryMessages:]
	}
	for _, msg := range history {
		role := genai.Role(genai.RoleUser)
		if msg.Role == "assistant" {
			role = genai.Role(genai.RoleModel)
		} else if msg.Role != "user" {
			continue
		}
		event := session.NewEvent(ctx, "replay")
		event.Author = msg.Role
		event.Timestamp = msg.CreatedAt
		event.Content = genai.NewContentFromText(msg.Content, role)
		if err := sessions.AppendEvent(ctx, sess, event); err != nil {
			return err
		}
	}
	return nil
}

// Chat runs one non-streaming turn.
func Chat(ctx context.Context, cfg Config, in TurnInput) (TurnResult, error) {
	if !cfg.Enabled() {
		return TurnResult{}, fmt.Errorf("assistant disabled: set DEEPSEEK_API_KEY")
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	r, err := buildRunner(ctx, cfg, ToolCtx{
		Pool: in.Pool, UserID: in.UserID, IsAdmin: in.IsAdmin,
		SessionID: in.SessionID, MemoryEnabled: in.MemoryEnabled,
	}, in.History)
	if err != nil {
		return TurnResult{}, err
	}
	return collectFinal(ctx, r, in, agent.RunConfig{
		StreamingMode: agent.StreamingModeNone,
		MaxLLMCalls:   cfg.MaxSteps,
	})
}

// collectFinal accumulates the final non-partial answer. Partial text is a
// fallback for a provider that closes the stream without an aggregate.
func collectFinal(ctx context.Context, r *runner.Runner, in TurnInput, rc agent.RunConfig) (TurnResult, error) {
	var final, partial string
	var usage *genai.GenerateContentResponseUsageMetadata
	tools := map[string]struct{}{}
	steps := 0

	for ev, err := range r.Run(ctx, adkUserID(in.UserID), in.SessionID, userMessage(in.Message), rc) {
		if err != nil {
			if final != "" || partial != "" {
				break
			}
			return TurnResult{}, err
		}
		if ev == nil {
			continue
		}
		steps++
		if ev.UsageMetadata != nil {
			usage = ev.UsageMetadata
		}
		collectToolNames(ev, tools)
		if ev.Content == nil || ev.Author == "user" {
			continue
		}
		text := eventText(ev)
		if text == "" {
			continue
		}
		if ev.Partial {
			partial = mergePartial(partial, text)
		} else {
			final = text
		}
	}

	answer := strings.TrimSpace(final)
	if answer == "" {
		answer = strings.TrimSpace(partial)
	}
	if answer == "" {
		return TurnResult{}, fmt.Errorf("empty model response")
	}
	result := TurnResult{
		Text:  RedactOutput(answer),
		Tools: sortedTools(tools),
		Steps: steps,
		Usage: usage,
	}
	logTurn(in, result)
	return result, nil
}

// Stream runs one turn, pushing deltas to yield until the final response.
// The returned Text is the authoritative final answer, not the concatenation
// of partial chunks.
func Stream(ctx context.Context, cfg Config, in TurnInput, yield func(StreamChunk) bool) TurnResult {
	if !cfg.Enabled() {
		yield(StreamChunk{Error: "assistant disabled: set DEEPSEEK_API_KEY"})
		return TurnResult{}
	}
	ctx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	r, err := buildRunner(ctx, cfg, ToolCtx{
		Pool: in.Pool, UserID: in.UserID, IsAdmin: in.IsAdmin,
		SessionID: in.SessionID, MemoryEnabled: in.MemoryEnabled,
	}, in.History)
	if err != nil {
		yield(StreamChunk{Error: "The assistant could not start. Please try again."})
		return TurnResult{}
	}

	var emitted, final string
	var usage *genai.GenerateContentResponseUsageMetadata
	tools := map[string]struct{}{}
	steps := 0
	cont := true

	for ev, err := range r.Run(ctx, adkUserID(in.UserID), in.SessionID, userMessage(in.Message), agent.RunConfig{
		StreamingMode: agent.StreamingModeSSE,
		MaxLLMCalls:   cfg.MaxSteps,
	}) {
		if !cont {
			break
		}
		if err != nil {
			if emitted == "" && final == "" {
				yield(StreamChunk{Error: "The assistant hit a snag. Please try again."})
				return TurnResult{}
			}
			break
		}
		if ev == nil {
			continue
		}
		steps++
		if ev.UsageMetadata != nil {
			usage = ev.UsageMetadata
		}
		collectToolNames(ev, tools)
		if ev.Content != nil && ev.Author != "user" {
			for _, p := range ev.Content.Parts {
				if p == nil {
					continue
				}
				if p.FunctionCall != nil && p.FunctionCall.Name != "" {
					cont = yield(StreamChunk{Tool: p.FunctionCall.Name, ToolStatus: "started"})
					if !cont {
						break
					}
				}
				if p.FunctionResponse != nil && p.FunctionResponse.Name != "" {
					cont = yield(StreamChunk{Tool: p.FunctionResponse.Name, ToolStatus: "completed"})
					if !cont {
						break
					}
				}
			}
			if !cont {
				break
			}
			text := eventText(ev)
			if text == "" {
				continue
			}
			if ev.Partial {
				delta, next := mergeDelta(emitted, text)
				emitted = next
				if delta != "" {
					cont = yield(StreamChunk{Text: RedactOutput(delta)})
					if !cont {
						break
					}
				}
				continue
			}
			// The final aggregate is authoritative. If it extends what the
			// client already saw, send only the suffix; if it differs, ask
			// the client to replace the bubble so nothing is duplicated.
			final = text
			if strings.HasPrefix(text, emitted) {
				if suffix := text[len(emitted):]; suffix != "" {
					emitted = text
					cont = yield(StreamChunk{Text: RedactOutput(suffix)})
				} else {
					emitted = text
				}
			} else if text != emitted {
				emitted = text
				cont = yield(StreamChunk{Replace: RedactOutput(text)})
			}
			if !cont {
				break
			}
		}
	}

	answer := strings.TrimSpace(final)
	if answer == "" {
		answer = strings.TrimSpace(emitted)
	}
	result := TurnResult{
		Text:  RedactOutput(answer),
		Tools: sortedTools(tools),
		Steps: steps,
		Usage: usage,
	}
	logTurn(in, result)
	if result.Text == "" {
		yield(StreamChunk{Error: "The assistant returned an empty reply. Please try again."})
		return TurnResult{}
	}
	return result
}

// userMessage is the current turn only. History is replayed into the session,
// never folded into this text: one copy of the context, not two. The system
// prompt already labels user text as data; adding a prefix here would pollute
// memory search with boilerplate.
func userMessage(message string) *genai.Content {
	return genai.NewContentFromText(message, genai.RoleUser)
}

// eventText joins the visible text parts of one event, skipping thoughts.
func eventText(ev *session.Event) string {
	if ev == nil || ev.Content == nil {
		return ""
	}
	var b strings.Builder
	for _, p := range ev.Content.Parts {
		if p == nil || p.Thought || p.Text == "" {
			continue
		}
		b.WriteString(p.Text)
	}
	return b.String()
}

// mergePartial returns the new suffix and the full text seen so far. Providers
// disagree about whether a partial chunk is a delta or the cumulative text, so
// both shapes are handled.
func mergePartial(emitted, incoming string) string {
	if strings.HasPrefix(incoming, emitted) {
		return incoming
	}
	return emitted + incoming
}

func mergeDelta(emitted, incoming string) (string, string) {
	if incoming == "" {
		return "", emitted
	}
	if strings.HasPrefix(incoming, emitted) {
		return incoming[len(emitted):], incoming
	}
	return incoming, emitted + incoming
}

func collectToolNames(ev *session.Event, into map[string]struct{}) {
	if ev == nil || ev.Content == nil {
		return
	}
	for _, p := range ev.Content.Parts {
		if p == nil {
			continue
		}
		if p.FunctionCall != nil && p.FunctionCall.Name != "" {
			into[p.FunctionCall.Name] = struct{}{}
		}
		if p.FunctionResponse != nil && p.FunctionResponse.Name != "" {
			into[p.FunctionResponse.Name] = struct{}{}
		}
	}
}

func sortedTools(set map[string]struct{}) []string {
	if len(set) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(set))
	for name := range set {
		out = append(out, name)
	}
	// Stable output keeps the SSE payload and logs easy to compare.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

func logTurn(in TurnInput, result TurnResult) {
	attrs := []any{
		"user_id", in.UserID,
		"session_id", in.SessionID,
		"steps", result.Steps,
		"tools", strings.Join(result.Tools, ","),
	}
	if result.Usage != nil {
		attrs = append(attrs,
			"prompt_tokens", result.Usage.PromptTokenCount,
			"output_tokens", result.Usage.CandidatesTokenCount,
			"total_tokens", result.Usage.TotalTokenCount,
		)
	}
	slog.Info("ai turn", attrs...)
}
