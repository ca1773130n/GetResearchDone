---
phase: 77-testing-and-documentation
plan: "02"
subsystem: documentation
tags: [docs, backend-capabilities, agent-frontmatter, effort-profiles, plugin-data]
dependency_graph:
  requires: []
  provides: [CLAUDE.md-v0.3.12-docs]
  affects: [CLAUDE.md]
tech_stack:
  added: []
  patterns: [documentation-only]
key_files:
  created: []
  modified:
    - CLAUDE.md
decisions:
  - "Backend Capabilities table covers all 4 primary backends (claude, codex, gemini, opencode) with all 15 flags sourced directly from BACKEND_CAPABILITIES in lib/backend.ts"
  - "Effort Profiles table shows representative agents; full table referenced in backend.ts"
  - "/effort slash command documented under Agent Frontmatter as a subsection"
  - "Plugin Data section uses .planning/ vs CLAUDE_PLUGIN_DATA framing matching Phase 75 decision"
  - "Backend-Specific Notes use versioned ranges (v0.31-v0.34, v1.2.25-v1.2.27) for temporal accuracy"
metrics:
  duration_minutes: 5
  completed: 2026-03-19
  tasks_completed: 1
  files_modified: 1
---

# Phase 77 Plan 02: CLAUDE.md v0.3.12 Documentation Summary

CLAUDE.md updated with Backend Capabilities table (15 flags, 4 backends), Agent Frontmatter fields (effort/maxTurns/disallowedTools), /effort slash command interaction, Plugin Data boundary, and backend-specific notes for Codex, Gemini, and OpenCode.

## What Was Built

Single-task plan: updated `CLAUDE.md` with five new sections placed between "Testing" and "Gotchas":

1. **Backend Capabilities** — Table of all 15 capability flags sourced from `BACKEND_CAPABILITIES` in `lib/backend.ts`, covering claude, codex, gemini, and opencode backends.

2. **Agent Frontmatter** — Documents `effort`, `maxTurns`, and `disallowedTools` fields; includes an Effort Profiles table for representative agents and a `/effort` slash command subsection explaining interaction with GRD's `EFFORT_PROFILES` system.

3. **Plugin Data** — Clearly defines the `.planning/` vs `CLAUDE_PLUGIN_DATA` boundary (project state vs plugin infrastructure state).

4. **Backend-Specific Notes** — Versioned notes for:
   - Codex CLI (v0.115.0+): realtime websocket sessions, filesystem RPC, smart approvals
   - Gemini CLI (v0.31-v0.34): tracker tools, A2A timeout, browser/generalist agents, plan mode, gVisor sandboxing
   - OpenCode (v1.2.25-v1.2.27): worktree session fix, chunk timeout, multi-account auth, Azure completions

## Verification

All 5 success criteria met:
- Backend Capabilities table: present with all 15 flags across 4 backends
- Agent Frontmatter section: effort/maxTurns/disallowedTools documented
- /effort slash command interaction: documented under Agent Frontmatter
- CLAUDE_PLUGIN_DATA boundary: Plugin Data section added
- Backend-specific notes: Codex/Gemini/OpenCode all present
- Existing content: unchanged
- `npm run lint`: passes with 0 errors

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add backend capabilities and agent frontmatter docs to CLAUDE.md | ad86bad | CLAUDE.md |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- CLAUDE.md contains "Backend Capabilities" section with capability flags table: FOUND
- CLAUDE.md contains "Agent Frontmatter" section with effort/maxTurns/disallowedTools: FOUND
- CLAUDE.md mentions /effort slash command interaction: FOUND
- CLAUDE.md contains CLAUDE_PLUGIN_DATA documentation: FOUND
- CLAUDE.md contains backend-specific notes for Codex, Gemini, OpenCode: FOUND
- Commit ad86bad: FOUND
- `npm run lint`: PASSES
