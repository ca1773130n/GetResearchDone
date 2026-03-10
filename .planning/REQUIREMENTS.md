# Requirements: v0.3.7 Claude Code Feature Sync

**Milestone:** v0.3.7
**Created:** 2026-03-11

## Effort Level Support

### REQ-91: Effort Level Configuration (Core Feature)
**Priority:** P0 — Critical
**Category:** Backend
**Description:** Add effort level (low/medium/high) as a second dimension alongside model tier in GRD's agent spawning system. Claude Code v2.1.68 introduced effort levels: Opus 4.6 defaults to medium effort, with "ultrathink" enabling high effort. Add `effort` field to `BackendCapabilities` (Claude supports it, others may not). Add `effort` to agent model profile config (e.g., planner gets high effort, verifier gets medium). Update `resolveBackendModel()` or add `resolveEffortLevel()` to return the appropriate effort for each agent role. Update all `cmdInit*` functions to include `effort_level` in JSON output.

### REQ-92: Agent Profile Effort Defaults
**Priority:** P1 — High
**Category:** Backend
**Description:** Define default effort levels per agent in the model profile system. Quality profile: planner=high, executor=high, surveyor=medium, verifier=medium. Balanced profile: planner=high, executor=medium, surveyor=medium, verifier=low. Budget profile: all=low. Add `effort_defaults` to config schema. Update CLAUDE.md agent model profiles table with effort column.

## Hook System Updates

### REQ-93: New Hook Event Registration
**Priority:** P1 — High
**Category:** Plugin
**Description:** Register new Claude Code hook events in plugin.json: `TeammateIdle` (fires when a teammate spawned via Agent tool becomes idle), `TaskCompleted` (fires when a background task completes), and `InstructionsLoaded` (fires when CLAUDE.md or rules files are loaded). `TeammateIdle` and `TaskCompleted` hooks support `{"continue": false, "stopReason": "..."}` response to stop the teammate/task. Use `InstructionsLoaded` for plugin setup verification (e.g., confirm `.planning/` exists).

### REQ-94: Hook Event Metadata Support
**Priority:** P2 — Medium
**Category:** Plugin
**Description:** Update GRD's hook handling to leverage new metadata fields available since v2.1.69: `agent_id` and `agent_type` in all hook events, and `worktree` field in status line hook commands. Update any hook commands that could benefit from filtering by agent type (e.g., only act on GRD-spawned agents).

### REQ-95: HTTP Hooks Capability Detection
**Priority:** P2 — Medium
**Category:** Backend
**Description:** Add `http_hooks` capability flag to `BACKEND_CAPABILITIES`. Claude Code v2.1.63 supports HTTP hooks (POST JSON to URL, receive JSON response). GRD currently only registers command-type hooks. Document HTTP hooks as an option for external integrations (e.g., webhook notifications for phase completion). Add `http_hooks` boolean to BackendCapabilities interface.

## Worktree & Tool Updates

### REQ-96: ExitWorktree Tool Integration
**Priority:** P1 — High
**Category:** Worktree
**Description:** Update GRD's worktree completion flow (`execute-phase.md`, `grd-executor.md`) to use the `ExitWorktree` tool (added in Claude Code v2.1.72) when running in native worktree isolation mode. Currently the executor writes artifacts but doesn't explicitly exit the worktree. Add `ExitWorktree` call before the completion flow step. Only applicable when `isolation_mode` is "native".

### REQ-97: CLAUDE_SKILL_DIR Variable Migration
**Priority:** P1 — High
**Category:** Plugin
**Description:** Migrate GRD command/skill files from using `${CLAUDE_PLUGIN_ROOT}` to `${CLAUDE_SKILL_DIR}` where appropriate (added in v2.1.69). `${CLAUDE_SKILL_DIR}` resolves to the directory containing the skill file, enabling relative path references. Audit all command `.md` files that reference `${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js` and determine which can use `${CLAUDE_SKILL_DIR}` instead. Note: `CLAUDE_PLUGIN_ROOT` is still valid — `CLAUDE_SKILL_DIR` is an additional option for skills that need self-relative paths.

## Capability Flags & Detection

### REQ-98: Cron/Loop Capability Support
**Priority:** P2 — Medium
**Category:** Backend
**Description:** Add `cron` capability flag to `BACKEND_CAPABILITIES`. Claude Code v2.1.71 added `/loop` command for recurring prompts and cron scheduling tools. Add detection of cron availability. Update `cmdInitAutopilot` to include `cron_available` field so the evolve loop can optionally use cron scheduling instead of manual re-invocation.

### REQ-99: Auto-Memory Awareness
**Priority:** P3 — Low
**Category:** Documentation
**Description:** Document the interaction between Claude Code's auto-memory feature (v2.1.59, `/memory` command) and GRD's STATE.md-based memory model. Clarify that GRD uses STATE.md as its structured memory (decisions, metrics, deferred validations) while auto-memory handles session-level context. Update CLAUDE.md with a section on memory model interaction. No code changes required — documentation only.

## Testing & Documentation

### REQ-100: Feature Sync Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Update unit tests in `tests/unit/backend.test.ts` to verify: new `effort` capability flag, `http_hooks` capability flag, `cron` capability flag in BACKEND_CAPABILITIES. Add tests for effort level resolution logic. Update init context tests to verify `effort_level` field in JSON output. Update hook registration tests if applicable.

### REQ-101: Feature Sync Documentation
**Priority:** P2 — Medium
**Category:** Documentation
**Description:** Update CLAUDE.md: add effort level column to agent model profiles table, document new hook events, document cron/loop awareness. Update plugin.json with new hook registrations. Update README if applicable.

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-91 | Phase 71 | PENDING |
| REQ-92 | Phase 71 | PENDING |
| REQ-93 | Phase 72 | PENDING |
| REQ-94 | Phase 72 | PENDING |
| REQ-95 | Phase 71 | PENDING |
| REQ-96 | Phase 72 | PENDING |
| REQ-97 | Phase 72 | PENDING |
| REQ-98 | Phase 71 | PENDING |
| REQ-99 | Phase 73 | PENDING |
| REQ-100 | Phase 73 | PENDING |
| REQ-101 | Phase 73 | PENDING |
