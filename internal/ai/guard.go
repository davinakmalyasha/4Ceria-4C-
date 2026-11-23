package ai

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// Input/output guards: prompt-injection screening, length caps and output
// redaction. These run BEFORE the model call (input) and AFTER it (output),
// so a malicious turn that slips past one layer still meets the next.

const (
	// MaxInputChars caps one user message. Long pastes (briefs, specs) go
	// through the normal project forms, not the chat.
	MaxInputChars = 4000
	// MaxHistoryMessages caps how many stored turns are replayed.
	MaxHistoryMessages = 20
)

// injectionMarkers are case-insensitive substrings that indicate a
// prompt-injection or jailbreak attempt. The match is deliberately narrow:
// ordinary domain questions ("ignore the fee?", "reveal the roof plan")
// must not trip it, so every marker names the instruction hierarchy or a
// known jailbreak token.
var injectionMarkers = []string{
	"ignore previous instructions",
	"ignore all previous instructions",
	"ignore your instructions",
	"disregard your instructions",
	"override your instructions",
	"reveal your system prompt",
	"show your system prompt",
	"print your system prompt",
	"repeat your system instructions",
	"what is your system prompt",
	"what are your system instructions",
	"you are now ",
	"you are now\n",
	"pretend you are",
	"pretend to be",
	"act as if you",
	"roleplay as",
	"jailbreak",
	" dan mode",
	"\ndan ",
	"developer mode",
	"bypass your safety",
	"bypass safety",
	"disable your guardrails",
	"no restrictions",
	"without restrictions",
	"exfiltrate",
	"send the api key",
	"show me the api key",
}

// SanitizeInput trims, strips control characters, collapses runs of
// whitespace and enforces the length cap. It returns the cleaned text.
func SanitizeInput(raw string) string {
	trimmed := strings.TrimSpace(raw)
	var b strings.Builder
	b.Grow(len(trimmed))
	prevSpace := false
	for _, r := range trimmed {
		if r == utf8.RuneError {
			continue
		}
		if unicode.IsControl(r) && r != '\n' && r != '\t' {
			continue
		}
		if r == '\n' || r == '\t' || unicode.IsSpace(r) {
			if !prevSpace {
				b.WriteByte(' ')
			}
			prevSpace = true
			continue
		}
		prevSpace = false
		b.WriteRune(r)
	}
	cleaned := strings.TrimSpace(b.String())
	return truncateRunes(cleaned, MaxInputChars)
}

// InjectionHit reports whether the input looks like a prompt-injection
// attempt, with the marker that matched (for logging, never echoed).
func InjectionHit(input string) (bool, string) {
	folded := " " + strings.ToLower(input) + " "
	for _, marker := range injectionMarkers {
		if strings.Contains(folded, marker) {
			return true, marker
		}
	}
	return false, ""
}

// InjectionRefusal is the fixed reply for injection attempts: brief, no
// lecture, no echo of the payload, still helpful within the rules.
const InjectionRefusal = "I can't follow instructions embedded in messages — I only follow my 4Ceria assistant guidelines. But I'm happy to help with your project, a property search, materials, or how anything on 4Ceria works. What would you like to do?"

// ValidateMessage sanitizes and screens one user message. An empty result
// means there is nothing to send; an injection attempt returns ok=false
// with the refusal text as the reply the handler should store and return
// WITHOUT calling the model.
func ValidateMessage(raw string) (cleaned string, ok bool, refusal string) {
	cleaned = SanitizeInput(raw)
	if cleaned == "" {
		return "", false, "Please write a message first — for example, ask about a project step, search houses, or find a professional."
	}
	if hit, _ := InjectionHit(cleaned); hit {
		return cleaned, false, InjectionRefusal
	}
	return cleaned, true, ""
}

// RedactOutput removes anything that must never leave the server in an
// assistant reply. Tools never return secrets, but defence in depth is
// cheap: belt (tool allow-list) and suspenders (this). Single pass, so it
// always terminates.
func RedactOutput(text string) string {
	// Two layers, because a model can repeat a token it was shown as well as
	// one a tool returned by mistake: the Authorization prefix form, and the
	// well-known credential prefixes. Matching is single-pass, so it always
	// terminates.
	text = redactPrefixed(text, []string{"Bearer ", "bearer "}, 128)
	for _, prefix := range []string{"sk-", "ghp_", "gho_", "github_pat_", "xoxb-", "xoxp-", "AIza"} {
		text = redactPrefixed(text, []string{prefix}, 96)
	}
	return text
}

func redactPrefixed(text string, prefixes []string, maxLen int) string {
	var b strings.Builder
	b.Grow(len(text))
	rest := text
	for len(rest) > 0 {
		idx := -1
		prefix := ""
		for _, p := range prefixes {
			i := strings.Index(rest, p)
			if !strings.HasSuffix(p, " ") {
				// A token prefix inside a word ("task-...") is not a
				// credential. Require a boundary before it.
				for i >= 0 && i > 0 && isWordByte(rest[i-1]) {
					next := strings.Index(rest[i+1:], p)
					if next < 0 {
						i = -1
						break
					}
					i += 1 + next
				}
			}
			if i >= 0 && (idx < 0 || i < idx) {
				idx, prefix = i, p
			}
		}
		if idx < 0 {
			b.WriteString(rest)
			break
		}
		b.WriteString(rest[:idx+len(prefix)])
		rest = rest[idx+len(prefix):]
		end := 0
		for end < len(rest) && end < maxLen && !isSpaceByte(rest[end]) {
			end++
		}
		b.WriteString("[redacted]")
		rest = rest[end:]
	}
	return b.String()
}

// truncateRunes is the UTF-8-safe cap used by inputs, titles and tool output.
func truncateRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

func isWordByte(c byte) bool {
	return c == '_' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

func isSpaceByte(c byte) bool {
	switch c {
	case ' ', '\t', '\n', '\r', '\v', '\f':
		return true
	}
	return false
}

// QuotaError formats the quota refusal.
func QuotaError(kind string) string {
	if kind == "minute" {
		return "You're sending messages very quickly — please wait a minute and try again."
	}
	return "You've reached today's AI chat allowance (100 messages). It resets at midnight UTC — your history stays saved."
}
