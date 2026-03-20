# Requirements: v0.3.12 Multi-Backend Feature Sync

**Milestone:** v0.3.12
**Created:** 2026-03-19

## Claude Code Updates (2.1.73 → 2.1.79)

### REQ-102: StopFailure Hook Registration
**Priority:** P1 — High
**Category:** Plugin
**Description:** Register the `StopFailure` hook event (v2.1.78) in plugin.json. Fires when a turn ends due to an API error (rate limit, auth failure). GRD can use this to log failures in evolve/autopilot subprocesses and trigger retry logic. Add `stop_failure` capability flag or integrate into existing hook infrastructure.

### REQ-103: CLAUDE_PLUGIN_DATA Integration
**Priority:** P1 — High
**Category:** Plugin
**Description:** Migrate GRD's persistent plugin state to use `${CLAUDE_PLUGIN_DATA}` (v2.1.78) which survives plugin updates. Currently GRD stores state in `.planning/` which is project-scoped. `CLAUDE_PLUGIN_DATA` is plugin-scoped — use it for cross-project plugin config (scheduler state, evolve global config). Document the distinction: `.planning/` = project state, `CLAUDE_PLUGIN_DATA` = plugin state.

### REQ-104: Agent Frontmatter Extensions
**Priority:** P1 — High
**Category:** Agents
**Description:** Update GRD agent definitions to use new frontmatter fields from v2.1.78: `effort` (low/medium/high per agent), `maxTurns` (cap turns per agent), `disallowedTools` (restrict tools per agent). Audit all 20 agent `.md` files. Set appropriate effort levels matching GRD's model profile system (e.g., planner=high, verifier=medium). Set maxTurns for agents that should be bounded (e.g., code-reviewer=15, verifier=10).

### REQ-105: MCP Elicitation Support
**Priority:** P2 — Medium
**Category:** Backend
**Description:** Add `mcp_elicitation` capability flag to `BackendCapabilities` (v2.1.76). Claude Code supports MCP elicitation — MCP servers can request structured input mid-task. Add `Elicitation` and `ElicitationResult` to hook event awareness. Update `cmdInitExecutePhase` to include `mcp_elicitation_available` field so agents know they can interact with MCP servers that use elicitation.

### REQ-106: modelOverrides Awareness
**Priority:** P2 — Medium
**Category:** Backend
**Description:** Document and support `modelOverrides` setting (v2.1.73) in GRD's model resolution system. When `modelOverrides` is configured, GRD's `resolveBackendModel()` should note that the user may have custom model mappings. Add `model_overrides_available` to init context so agents are aware custom models may be in use. No code changes to model resolution itself — just awareness and documentation.

### REQ-107: Output Token Limit Updates
**Priority:** P1 — High
**Category:** Backend
**Description:** Update GRD's awareness of output token limits. Claude Opus 4.6 now defaults to 64k output tokens with an upper bound of 128k (v2.1.77). Sonnet 4.6 upper bound is also 128k. Update any hardcoded token assumptions. Add `max_output_tokens` to `BackendCapabilities` or model config. This affects evolve prompt sizing and batch execution planning.

### REQ-108: PostCompact Hook and allowRead Sandbox
**Priority:** P3 — Low
**Category:** Plugin
**Description:** Register `PostCompact` hook event (v2.1.76) in plugin.json — fires after compaction completes. Register awareness of `allowRead` sandbox setting (v2.1.77) — re-allows read access within `denyRead` regions. Both are informational — no GRD-specific logic needed, but hook registration enables future use.

### REQ-109: Effort Slash Command Awareness
**Priority:** P3 — Low
**Category:** Documentation
**Description:** Document `/effort` slash command (v2.1.76) in CLAUDE.md. Users can now change effort level mid-session. GRD's effort profile system (REQ-92 from v0.3.7) sets effort via agent frontmatter, but users can override with `/effort`. Note this interaction in documentation.

## Codex CLI Updates (0.115.0+)

### REQ-110: GPT-5.4 Mini Model Mapping
**Priority:** P1 — High
**Category:** Backend
**Description:** Add `gpt-5.4-mini` to Codex model mappings in `MODEL_NAMES`. Map haiku tier → `gpt-5.4-mini` (fast, 30% usage of GPT-5.4, 2x faster). Update `DEFAULT_MODEL_NAMES.codex` to include the mini model. GPT-5.4 mini is ideal for subagent/discovery work in evolve.

### REQ-111: Codex Smart Approvals Capability
**Priority:** P2 — Medium
**Category:** Backend
**Description:** Add `smart_approvals` capability flag to `BackendCapabilities` for Codex. Smart Approvals route review requests through a guardian subagent, reducing repeated permission prompts. Set `smart_approvals: true` for Codex, `false` for others. Informational — no GRD code changes needed beyond capability detection.

### REQ-112: Codex Realtime and Filesystem RPC Awareness
**Priority:** P3 — Low
**Category:** Documentation
**Description:** Document Codex's new realtime websocket sessions and filesystem RPC capabilities in CLAUDE.md. The v2 app-server exposes filesystem RPCs for file operations. Note these as available but not currently used by GRD.

## Gemini CLI Updates (v0.31 → v0.34)

### REQ-113: Gemini 3.1 Pro Model Mapping
**Priority:** P1 — High
**Category:** Backend
**Description:** Update Gemini model mappings. Gemini 3.1 Pro Preview is available (v0.31). Update `DEFAULT_MODEL_NAMES.gemini` to map opus → `gemini-3.1-pro`, sonnet → `gemini-3.1-flash`. Verify the generalist agent (v0.32) doesn't conflict with GRD's agent spawning.

### REQ-114: Gemini Plan Mode and Sandboxing Capabilities
**Priority:** P2 — Medium
**Category:** Backend
**Description:** Add capability flags for Gemini's new features: `plan_mode` (enabled by default in v0.34), `sandbox_gvisor` (native gVisor sandboxing), `sandbox_lxc` (experimental LXC container sandboxing). Update `BACKEND_CAPABILITIES.gemini` accordingly. Plan mode detection may be useful for GRD's phase planning workflow.

### REQ-115: Gemini Tracker and A2A Awareness
**Priority:** P3 — Low
**Category:** Documentation
**Description:** Document Gemini CLI's new tracker CRUD tools (v0.34) and A2A agent timeout increase to 30 minutes. Note the browser agent (experimental, v0.31) and generalist agent (v0.32) as available features. Informational only.

## OpenCode Updates (v1.2.25 → v1.2.27)

### REQ-116: OpenCode Model and Auth Updates
**Priority:** P1 — High
**Category:** Backend
**Description:** Update OpenCode model mappings: GPT-5.4 is now in the allowed models list. Update `DEFAULT_MODEL_NAMES.opencode` if needed. Note multi-account workspace authentication support and non-OpenAI Azure completions endpoint support. Update backend detection if env vars or config changed.

### REQ-117: OpenCode Worktree Session Fix Awareness
**Priority:** P3 — Low
**Category:** Documentation
**Description:** Document OpenCode's fix for lost sessions across worktrees and orphan branches (v1.2.27). This is relevant to GRD's worktree isolation when running on OpenCode backend. Note the 5-minute chunk timeout increase (from 2 min).

## Testing & Documentation

### REQ-118: Multi-Backend Sync Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Update unit tests: new model mappings for all 4 backends, new capability flags (smart_approvals, plan_mode, sandbox_gvisor, sandbox_lxc, mcp_elicitation), StopFailure hook registration, CLAUDE_PLUGIN_DATA paths. Update init context tests to verify new fields. Verify agent frontmatter with effort/maxTurns/disallowedTools.

### REQ-119: Multi-Backend Sync Documentation
**Priority:** P2 — Medium
**Category:** Documentation
**Description:** Update CLAUDE.md: new model mappings table, new capability flags, agent frontmatter fields, CLAUDE_PLUGIN_DATA usage. Update commands/evolve.md if evolve behavior changed. Update README if applicable.

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-102 | Phase 75 | DONE |
| REQ-103 | Phase 75 | DONE |
| REQ-104 | Phase 76 | DONE |
| REQ-105 | Phase 76 | DONE |
| REQ-106 | Phase 76 | DONE |
| REQ-107 | Phase 74 | DONE |
| REQ-108 | Phase 75 | DONE |
| REQ-109 | Phase 77 | DONE |
| REQ-110 | Phase 74 | DONE |
| REQ-111 | Phase 74 | DONE |
| REQ-112 | Phase 77 | DONE |
| REQ-113 | Phase 74 | DONE |
| REQ-114 | Phase 74 | DONE |
| REQ-115 | Phase 77 | DONE |
| REQ-116 | Phase 74 | DONE |
| REQ-117 | Phase 77 | DONE |
| REQ-118 | Phase 77 | DONE |
| REQ-119 | Phase 77 | DONE |
