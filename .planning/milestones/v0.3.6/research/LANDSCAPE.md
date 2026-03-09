# Backend Ecosystem Landscape — March 2026

## Claude Code (v2.1.71, March 7 2026)

**Models:** Opus 4.6 (1M ctx), Sonnet 4.6 (1M ctx), Haiku 4.5
**GRD abstract tiers:** `opus`, `sonnet`, `haiku` — resolved internally by Claude Code

**Key capabilities for GRD:**
- 17+ hook events (up from ~8): SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, PostToolUseFailure, Notification, SubagentStart, SubagentStop, Stop, TeammateIdle, TaskCompleted, InstructionsLoaded, ConfigChange, WorktreeCreate, WorktreeRemove, PreCompact, SessionEnd
- Task tool renamed to Agent (v2.1.63) — old `Task(...)` still works as alias
- Agent memory: `memory: user|project|local` frontmatter
- Background agents: `background: true` frontmatter
- Agent Teams: experimental multi-agent via env var
- Skills hot reload, context fork
- HTTP hooks (POST JSON to URL)
- MCP tool lazy loading (ToolSearch) — 95% context reduction
- Plugin marketplace: claude.ai/settings/plugins/submit
- LSP server support in plugins (.lsp.json)

**Detection:** `CLAUDE_CODE_*` env prefix — STILL VALID

## Codex CLI (v0.112.0, March 8 2026)

**Models:**
- GPT-5.4: Most capable, native computer-use, experimental 1M context — **NEW, not in GRD**
- GPT-5.3-Codex: Strong agentic coding (current GRD opus tier)
- GPT-5.3-Codex-Spark: Fast variant (current GRD sonnet/haiku tier)
- codex-1 (o4-mini variant): Low-latency code Q&A, CLI default

**Key capabilities:**
- Multi-agent: /agent command, thread forking, sub-agents with nicknames — `subagents: true` CORRECT
- Skills system: SKILL.md + scripts, invocation policy
- Plugin architecture: skills, MCP, app connectors, @plugin mentions
- Windows native: Microsoft Store, PowerShell sandbox
- MCP: structured elicitation, OAuth
- Worktree support (added Dec 2025)
- Fast/Flex/Standard performance tiers
- Multimodal custom tool outputs

**Detection:** `CODEX_HOME` — STILL VALID. `CODEX_THREAD_ID` — may be deprecated (no docs mention)

**Capability updates needed:**
- `hooks`: Codex has hooks via plugin system — change to `true`? Needs verification
- `teams`: Has multi-agent thread forking — may warrant `true`

## Gemini CLI (v0.32.1 stable, March 4 2026)

**Models:**
- Gemini 3.1 Pro: Most capable — **REPLACES deprecated Gemini 3 Pro (shutdown March 9!)**
- Gemini 3 Flash: High-frequency workflows — STILL VALID
- Gemini 3.1 Flash-Lite: Optimized for high-volume, low-latency — **NEW, replaces 2.5 Flash**
- gemini-pro-latest alias: Points to 3.1 Pro as of March 6, 2026

**Key capabilities:**
- Plan Mode: /plan command, enter_plan_mode tool, external editor, research subagents — **NEW**
- Agent Skills: activate_skill tool, built-in + custom skills, enabled by default — **GA, not experimental**
- Subagents: Generalist agent enabled, .gemini/agents/*.md — **GA, not experimental**
- Extensions: marketplace, parallel loading, policy engine
- A2A protocol: HTTP auth, agent card discovery, streaming
- Hooks: hooks.json in extension directories
- MCP: full support, policy engine wildcards

**Detection:** `GEMINI_CLI_HOME` — NEEDS VERIFICATION (may have changed)
**Filesystem:** `.gemini/settings.json` — NEEDS VERIFICATION

**Capability updates needed:**
- `subagents`: Change from `'experimental'` to `true` — Generalist agent is GA
- `parallel`: Contiguous parallel admission for agent tools — may warrant `true`

## OpenCode (v1.2.21, March 7 2026) — NOT ARCHIVED

**CRITICAL CORRECTION:** The ORIGINAL repo `opencode-ai/opencode` was archived Sept 2025, but development continued under `anomalyco/opencode`. The project has 70K+ GitHub stars and 650K+ monthly active developers.

**Models:** Provider-agnostic (Anthropic, OpenAI, Google, AWS, Groq, OpenRouter, etc.)
- Uses `provider/model-id` format
- Current defaults likely: `anthropic/claude-opus-4-6`, `anthropic/claude-sonnet-4-6`, `anthropic/claude-haiku-4-5`
- Exposes `OPENCODE_PID` env var for process management

**Key capabilities:**
- 3 built-in agents: Build (full access), Plan (read-only), Subagent
- Full MCP support: local + remote, OAuth, .well-known/opencode endpoint
- Built-in tools: Bash, Edit, Read, Write, Grep, Glob, LS, WebFetch, Todo, Task
- Custom agents via markdown files
- Session management, undo/redo
- Go-based with Bubble Tea TUI
- Desktop app and IDE extension available

**Detection:** `OPENCODE` env var — STILL VALID? Needs verification with new repo
**Filesystem:** `opencode.json` — STILL VALID

**Capability updates needed:**
- Model IDs need update to latest Claude model versions (4.6 family)
- NOT deprecated — remove deprecation handling from REQ-88
