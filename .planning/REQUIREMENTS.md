# Requirements: v0.3.6 Backend Ecosystem Sync

**Milestone:** v0.3.6
**Created:** 2026-03-09

## Model Mapping Updates

### REQ-82: Gemini Model Mapping Update (Critical — gemini-3-pro deprecated)
**Priority:** P0 — Critical
**Category:** Backend
**Description:** Replace deprecated `gemini-3-pro` with `gemini-3.1-pro` in DEFAULT_BACKEND_MODELS. Gemini 3 Pro is being shut down March 9, 2026. Update opus tier to `gemini-3.1-pro`, sonnet tier to `gemini-3-flash` (unchanged), haiku tier to `gemini-3.1-flash-lite` (replacing `gemini-2.5-flash`). Verify model name format matches what Gemini CLI accepts.

### REQ-83: Codex Model Mapping Update (GPT-5.4)
**Priority:** P1 — High
**Category:** Backend
**Description:** Add GPT-5.4 as the opus-tier model for Codex backend in DEFAULT_BACKEND_MODELS. GPT-5.4 is OpenAI's most capable model with native computer-use and 1M context window. Keep GPT-5.3-Codex as sonnet tier and GPT-5.3-Codex-Spark as haiku tier.

### REQ-84: Claude Model Reference Update
**Priority:** P2 — Medium
**Category:** Backend
**Description:** Verify Claude model tier names are current. Claude Code now supports Opus 4.6, Sonnet 4.6, and Haiku 4.5. GRD uses abstract tiers ('opus', 'sonnet', 'haiku') which Claude Code resolves internally — confirm this still works correctly and update any hardcoded model ID references (e.g., in OpenCode backend mappings which reference `anthropic/claude-opus-4-5`).

## Capability Flag Updates

### REQ-85: Gemini Capability Flags Update
**Priority:** P1 — High
**Category:** Backend
**Description:** Update Gemini CLI capability flags in BACKEND_CAPABILITIES: change `subagents` from `'experimental'` to `true` (Generalist agent is now GA, enabled by default). Verify `parallel` status (Gemini now has contiguous parallel admission for agent tools). Verify `hooks` status. Add any new capability flags needed (e.g., `plan_mode`, `agent_skills`, `extensions`).

### REQ-86: Codex Capability Flags Update
**Priority:** P1 — High
**Category:** Backend
**Description:** Update Codex CLI capability flags in BACKEND_CAPABILITIES: verify `hooks` status (Codex now has plugin system with skills/MCP/app connectors). Verify `teams` status (Codex now has multi-agent with /agent command and thread forking). Update any new capability flags needed (e.g., `plugins`, `windows_native`).

## Backend Detection Updates

### REQ-87: Backend Detection Env Var Verification
**Priority:** P2 — Medium
**Category:** Backend
**Description:** Verify and update environment variable detection in `detectBackend()`. Confirm: `CLAUDE_CODE_*` prefix still valid for Claude Code, `CODEX_HOME` and `CODEX_THREAD_ID` still valid for Codex, `GEMINI_CLI_HOME` still valid for Gemini CLI, `OPENCODE` still valid for OpenCode. Update filesystem clue paths if config file locations have changed (e.g., `.codex/config.toml`, `.gemini/settings.json`).

### REQ-88: OpenCode Model & Detection Update
**Priority:** P1 — High
**Category:** Backend
**Description:** Update OpenCode backend support. The original `opencode-ai/opencode` repo was archived Sept 2025, but development continued under `anomalyco/opencode` (v1.2.21, 70K+ stars, 650K+ MAD). OpenCode is NOT deprecated — it is thriving. Update model mappings to latest Claude model IDs (`anthropic/claude-opus-4-6`, `anthropic/claude-sonnet-4-6`, `anthropic/claude-haiku-4-5`). Verify `OPENCODE` env var and `opencode.json` filesystem detection still work with the new repository. Verify capability flags match current features (subagents, MCP, hooks via agents).

## Documentation & Tests

### REQ-89: Backend Documentation Update
**Priority:** P2 — Medium
**Category:** Documentation
**Description:** Update CLAUDE.md agent model profiles table with new model names. Update any documentation referencing specific model names. Correct OpenCode status: document it is actively maintained under anomalyco/opencode (not archived).

### REQ-90: Backend Test Updates
**Priority:** P1 — High
**Category:** Testing
**Description:** Update unit tests in `tests/unit/backend.test.ts` to verify new model mappings, updated capability flags, and OpenCode deprecation warning. Ensure all existing backend detection tests still pass with updated constants. Add test for deprecated model migration path.

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-82 | Phase 69 | PENDING |
| REQ-83 | Phase 69 | PENDING |
| REQ-84 | Phase 69 | PENDING |
| REQ-85 | Phase 69 | PENDING |
| REQ-86 | Phase 69 | PENDING |
| REQ-87 | Phase 70 | PENDING |
| REQ-88 | Phase 69 | PENDING |
| REQ-89 | Phase 70 | PENDING |
| REQ-90 | Phase 70 | PENDING |
