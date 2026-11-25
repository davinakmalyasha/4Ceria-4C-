package ai

// Pure unit tests for non-DB helpers: config, guards-adjacent formatting,
// agent tool wiring and the memory cache. No DATABASE_URL is required;
// DB-backed tests keep the existing skip pattern and are untouched.

import (
	"context"
	"strings"
	"testing"
	"time"

	"google.golang.org/adk/v2/memory"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func TestPureEnvBool(t *testing.T) {
	cases := []struct {
		value    string
		fallback bool
		want     bool
	}{
		{"", true, true},
		{"", false, false},
		{"1", false, true},
		{"true", false, true},
		{"TRUE", false, true},
		{"yes", false, true},
		{"on", false, true},
		{" On ", false, true},
		{"0", true, false},
		{"false", true, false},
		{"FALSE", true, false},
		{"no", true, false},
		{"off", true, false},
		{"bogus", true, true},
		{"bogus", false, false},
		{"2", true, true},
	}

	for _, tc := range cases {
		t.Setenv("PURE_ENVBOOL_PROBE", tc.value)
		// envBool reads a named variable; exercise via a scratch name by
		// temporarily shadowing through the same lookup path.
		got := envBool("PURE_ENVBOOL_PROBE", tc.fallback)
		if got != tc.want {
			t.Errorf("envBool(%q, %v) = %v, want %v", tc.value, tc.fallback, got, tc.want)
		}
	}
}

func TestPureLoadConfigEnv(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "  secret  ")
	t.Setenv("DEEPSEEK_BASE_URL", "https://proxy.example/v1")
	t.Setenv("DEEPSEEK_MODEL", "custom-model")
	t.Setenv("AI_MAX_STEPS", "3")
	t.Setenv("AI_MEMORY", "off")
	t.Setenv("AI_SPECIALISTS", "0")

	cfg := LoadConfig()
	if cfg.APIKey != "secret" {
		t.Fatalf("APIKey = %q, want trimmed", cfg.APIKey)
	}
	if cfg.BaseURL != "https://proxy.example/v1" || cfg.Model != "custom-model" {
		t.Fatalf("endpoint = %+v", cfg)
	}
	if cfg.MaxSteps != 3 {
		t.Fatalf("MaxSteps = %d, want 3", cfg.MaxSteps)
	}
	if cfg.Memory || cfg.Specialists {
		t.Fatal("kill switches not honoured")
	}
	if !cfg.Enabled() {
		t.Fatal("config with a key must be enabled")
	}

	// Steps clamp at 20; garbage keeps the default.
	t.Setenv("AI_MAX_STEPS", "99")
	if got := LoadConfig().MaxSteps; got != 20 {
		t.Fatalf("MaxSteps = %d, want clamp 20", got)
	}
	t.Setenv("AI_MAX_STEPS", "bogus")
	if got := LoadConfig().MaxSteps; got != 10 {
		t.Fatalf("MaxSteps garbage = %d, want default 10", got)
	}
	t.Setenv("AI_MAX_STEPS", "-2")
	if got := LoadConfig().MaxSteps; got != 10 {
		t.Fatalf("MaxSteps negative = %d, want default 10", got)
	}

	t.Setenv("DEEPSEEK_API_KEY", "")
	if LoadConfig().Enabled() {
		t.Fatal("keyless config must be disabled")
	}
}

func TestPurePublicStatusHidesKey(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "super-secret")
	t.Setenv("DEEPSEEK_MODEL", "m")
	cfg := LoadConfig()

	status := cfg.PublicStatus()
	if status["enabled"] != true {
		t.Fatalf("status = %v", status)
	}
	for key, value := range status {
		if text, ok := value.(string); ok && strings.Contains(text, "super-secret") {
			t.Fatalf("status leaks the key in %q", key)
		}
		if strings.Contains(strings.ToLower(key), "key") {
			t.Fatalf("status exposes a key field %q", key)
		}
	}
	if _, ok := status["model"]; !ok {
		t.Fatal("status must carry the model")
	}
}

func TestPureQuotaError(t *testing.T) {
	if got := QuotaError("minute"); !strings.Contains(got, "minute") {
		t.Fatalf("minute quota = %q", got)
	}
	day := QuotaError("day")
	if !strings.Contains(day, "100") || !strings.Contains(day, "midnight UTC") {
		t.Fatalf("daily quota = %q", day)
	}
	// Unknown kinds fall back to the daily allowance text.
	if got := QuotaError("hour"); got != day {
		t.Fatalf("unknown kind = %q, want the daily text", got)
	}
}

func TestPureParseMemoryUserID(t *testing.T) {
	cases := []struct {
		in    string
		want  int64
		valid bool
	}{
		{"user-42", 42, true},
		{"user-1", 1, true},
		{"  user-7  ", 7, true},
		{"", 0, false},
		{"42", 0, false},
		{"user-", 0, false},
		{"user-0", 0, false},
		{"user--5", 0, false},
		{"user-abc", 0, false},
		{"other-42", 0, false},
		{"USER-42", 0, false},
	}

	for _, tc := range cases {
		got, ok := parseMemoryUserID(tc.in)
		if ok != tc.valid || (ok && got != tc.want) {
			t.Errorf("parseMemoryUserID(%q) = (%d, %v), want (%d, %v)", tc.in, got, ok, tc.want, tc.valid)
		}
	}
}

func TestPureMemoryText(t *testing.T) {
	if got := memoryText(memory.Entry{}); got != "" {
		t.Fatalf("nil content = %q", got)
	}

	thought := &genai.Part{Thought: true, Text: "hidden reasoning"}
	if got := memoryText(memory.Entry{Content: &genai.Content{Parts: []*genai.Part{thought}}}); got != "" {
		t.Fatalf("thought-only = %q", got)
	}

	blank := &genai.Part{Text: ""}
	spoken := &genai.Part{Text: "Bandung house"}
	if got := memoryText(memory.Entry{Content: &genai.Content{Parts: []*genai.Part{blank, nil, spoken}}}); got != "Bandung house" {
		t.Fatalf("parts = %q", got)
	}

	joined := memoryText(memory.Entry{Content: &genai.Content{Parts: []*genai.Part{{Text: "prefers"}, {Text: "sharia"}}}})
	if joined != "prefers sharia" {
		t.Fatalf("join = %q", joined)
	}
}

func TestPureFilterTools(t *testing.T) {
	tools, err := BuildTools(ToolCtx{})
	if err != nil {
		t.Fatal(err)
	}

	got := filterTools(tools, "search_houses", "get_house")
	if len(got) != 2 {
		t.Fatalf("filter = %d tools, want 2", len(got))
	}

	if got := filterTools(tools, "no_such_tool"); len(got) != 0 {
		t.Fatalf("unknown filter = %d tools", len(got))
	}
	if got := filterTools(tools); len(got) != 0 {
		t.Fatalf("empty filter = %d tools", len(got))
	}
	// Order follows the tool list, not the request order.
	reversed := filterTools(tools, "get_house", "search_houses")
	if len(reversed) != 2 || reversed[0].Name() != got[0].Name() {
		t.Fatal("filter order is not stable")
	}

	if ptrFloat(0.3) == nil || *ptrFloat(0.3) != 0.3 {
		t.Fatal("ptrFloat broken")
	}
}

func TestPureTrimTitle(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", "New chat"},
		{"   ", "New chat"},
		{"\n\t hello \n", "hello"},
		{"short", "short"},
		{strings.Repeat("x", 200), strings.Repeat("x", 80)},
	}
	for _, tc := range cases {
		if got := trimTitle(tc.in); got != tc.want {
			t.Errorf("trimTitle(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPureBuildAgentToolsWiring(t *testing.T) {
	base, err := BuildTools(ToolCtx{})
	if err != nil {
		t.Fatal(err)
	}

	// Memory off, no specialists: exactly the direct tools plus skillset.
	tools, toolsets, err := BuildAgentTools(context.Background(), Config{Memory: false}, ToolCtx{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != len(base) {
		t.Fatalf("tools = %d, want %d direct tools", len(tools), len(base))
	}
	if len(toolsets) == 0 {
		t.Fatal("skills toolset missing")
	}

	// Memory on adds exactly three memory tools.
	memoryTools, _, err := BuildAgentTools(context.Background(), Config{Memory: true}, ToolCtx{MemoryEnabled: true}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(memoryTools) != len(base)+3 {
		t.Fatalf("memory tools = %d, want %d", len(memoryTools), len(base)+3)
	}
	names := map[string]bool{}
	for _, tool := range memoryTools {
		names[tool.Name()] = true
	}
	for _, want := range []string{"search_memory", "remember"} {
		if !names[want] {
			t.Errorf("memory tool %q missing: %v", want, names)
		}
	}

	// Specialists with a nil model stay off: no new capability may depend
	// on delegation.
	specialistTools, _, err := BuildAgentTools(context.Background(), Config{Specialists: true}, ToolCtx{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(specialistTools) != len(base) {
		t.Fatalf("nil-model specialists changed the tool count: %d", len(specialistTools))
	}
}

func TestPureMemoryToolNames(t *testing.T) {
	if got := newSearchMemoryTool(ToolCtx{}).Name(); got != "search_memory" {
		t.Fatalf("search tool = %q", got)
	}
	if got := newRememberTool(ToolCtx{}).Name(); got != "remember" {
		t.Fatalf("remember tool = %q", got)
	}
}

func TestPureSortedTools(t *testing.T) {
	if got := sortedTools(map[string]struct{}{}); len(got) != 0 {
		t.Fatalf("empty = %v", got)
	}
	got := sortedTools(map[string]struct{}{"b": {}, "a": {}, "c": {}})
	if len(got) != 3 || got[0] != "a" || got[1] != "b" || got[2] != "c" {
		t.Fatalf("sorted = %v", got)
	}
}

func TestPureCollectToolNames(t *testing.T) {
	into := map[string]struct{}{}
	collectToolNames(nil, into)
	collectToolNames(&session.Event{}, into)
	if len(into) != 0 {
		t.Fatalf("nil events collected %v", into)
	}

	ev := &session.Event{}
	ev.Content = &genai.Content{Parts: []*genai.Part{
		nil,
		{Text: "plain text"},
		{FunctionCall: &genai.FunctionCall{Name: "search_houses"}},
		{FunctionResponse: &genai.FunctionResponse{Name: "search_houses"}},
		{FunctionCall: &genai.FunctionCall{}},
	}}
	collectToolNames(ev, into)
	if len(into) != 1 || !hasToolName(into, "search_houses") {
		t.Fatalf("collected = %v", into)
	}
}

func TestPureEventText(t *testing.T) {
	if got := eventText(nil); got != "" {
		t.Fatalf("nil event = %q", got)
	}
	ev := &session.Event{}
	if got := eventText(ev); got != "" {
		t.Fatalf("empty event = %q", got)
	}
}

func TestPureNewMemoryServiceConstructors(t *testing.T) {
	if NewMemoryService(nil) == nil {
		t.Fatal("NewMemoryService returned nil")
	}
	if NewEnabledMemoryService(nil, true) == nil {
		t.Fatal("NewEnabledMemoryService returned nil")
	}
	cached := newCachedMemoryService(NewMemoryService(nil))
	if cached == nil {
		t.Fatal("cached constructor returned nil")
	}
	// A nil search request is an empty success, never a panic or a query.
	response, err := cached.SearchMemory(context.Background(), nil)
	if err != nil || response == nil {
		t.Fatalf("nil search = (%v, %v)", response, err)
	}
}

func TestPureIDRTextExtraShapes(t *testing.T) {
	cases := []struct {
		in   any
		want string
	}{
		{nil, "Rp 0"},
		{"", "Rp 0"},
		{"   ", "Rp 0"},
		{[]byte(""), "Rp 0"},
		{[]byte("1500000"), "Rp 1.500.000"},
		{int(6500000), "Rp 6.500.000"},
		{int32(-5), "Rp -5"},
		{float64(2500000.9), "Rp 2.500.000"},
	}
	for _, tc := range cases {
		if got := idrText(tc.in); got != tc.want {
			t.Errorf("idrText(%v) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPureGroupThousands(t *testing.T) {
	cases := map[string]string{
		"0": "0", "12": "12", "123": "123", "1234": "1.234",
		"123456": "123.456", "1234567": "1.234.567", "-1234567": "-1.234.567",
	}
	for in, want := range cases {
		if got := groupThousands(in); got != want {
			t.Errorf("groupThousands(%q) = %q, want %q", in, got, want)
		}
	}
	if got := trimDecimals("1500000.00"); got != "1.500.000" {
		t.Errorf("trimDecimals = %q", got)
	}
	if got := trimDecimals("1500000.50"); got != "1.500.000,5" {
		t.Errorf("trimDecimals fraction = %q", got)
	}
	if got := truncate("abcdef", 3); got != "abc…" {
		t.Errorf("truncate = %q", got)
	}
	if got := truncate("ab", 3); got != "ab" {
		t.Errorf("truncate short = %q", got)
	}
}

func hasToolName(set map[string]struct{}, name string) bool {
	_, ok := set[name]
	return ok
}

func TestPureProjectPartiesAllows(t *testing.T) {
	seven, nine := int64(7), int64(9)

	empty := projectParties{}
	if empty.allows(map[string]int64{"arsiteks": 7}) {
		t.Fatal("empty parties must allow nothing")
	}

	parties := projectParties{Arsitek: &seven, PM: &nine}
	if !parties.allows(map[string]int64{"arsiteks": 7}) {
		t.Fatal("matching profile id must allow")
	}
	if parties.allows(map[string]int64{"arsiteks": 8}) {
		t.Fatal("different profile id must not allow")
	}
	if parties.allows(map[string]int64{"kontraktors": 7}) {
		t.Fatal("profile id in the wrong table must not allow")
	}
	if !parties.allows(map[string]int64{"project_managers": 9, "arsiteks": 8}) {
		t.Fatal("any matching party must allow")
	}
	if parties.allows(map[string]int64{}) {
		t.Fatal("empty profile map must not allow")
	}
}

func TestPureProjectHeadAllowsWithoutDB(t *testing.T) {
	// Owner and admin short-circuit before any profile lookup, so no
	// pool is needed (nil pool would panic if touched).
	head := projectHead{OwnerID: 7}
	if !head.allows(context.Background(), ToolCtx{UserID: 7}) {
		t.Fatal("owner must be allowed")
	}

	other := projectHead{OwnerID: 8}
	if !other.allows(context.Background(), ToolCtx{UserID: 7, IsAdmin: true}) {
		t.Fatal("admin must be allowed")
	}
}

func TestPureToolFailureAndCtx(t *testing.T) {
	err := toolFailure("search_houses", context.DeadlineExceeded)
	if err == nil || strings.Contains(err.Error(), "DeadlineExceeded") {
		t.Fatalf("toolFailure must hide internals: %v", err)
	}

	ctx, cancel := ToolCtx{}.ctx(context.Background())
	cancel()
	if _, ok := ctx.Deadline(); !ok {
		t.Fatal("default tool ctx must carry a deadline")
	}

	ctx, cancel = ToolCtx{Timeout: 30 * time.Second}.ctx(context.Background())
	defer cancel()
	deadline, ok := ctx.Deadline()
	if !ok {
		t.Fatal("custom tool ctx must carry a deadline")
	}
	_ = deadline
}

func TestPureIdrMinor(t *testing.T) {
	cases := map[string]int64{
		"":            0,
		"   ":         0,
		"15000000.50": 1500000050,
		"15000000":    1500000000,
		"0.01":        1,
		"-3.25":       -325,
		"00012.50":    1250,
		".5":          50,
		"10.999":      1099,
		"abc":         0,
		"12.34.56":    1234,
	}
	for in, want := range cases {
		if got := idrMinor(in); got != want {
			t.Errorf("idrMinor(%q) = %d, want %d", in, got, want)
		}
	}
}
