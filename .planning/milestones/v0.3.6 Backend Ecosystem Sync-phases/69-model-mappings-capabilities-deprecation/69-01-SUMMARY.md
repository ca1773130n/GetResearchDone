---
phase: 69
plan: 1
subsystem: backend
tags: [model-mappings, capabilities, deprecation]
dependency_graph:
  requires: []
  provides: [updated-model-mappings, updated-capabilities]
  affects: [tests/unit/backend.test.ts]
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - lib/backend.ts
decisions:
  - "gemini-3-pro replaced by gemini-3.1-pro (deprecated March 9 2026)"
  - "gemini-2.5-flash replaced by gemini-3.1-flash-lite"
  - "gpt-5.3-codex replaced by gpt-5.4"
  - "claude-opus-4-5 and claude-sonnet-4-5 replaced by 4-6 variants"
  - "Gemini subagents promoted from experimental to GA"
  - "Codex hooks and teams capabilities enabled"
metrics:
  duration: 1min
  completed: 2026-03-10
---

# Phase 69 Plan 1: Update Model Mappings and Capability Constants Summary

Updated DEFAULT_BACKEND_MODELS and BACKEND_CAPABILITIES in lib/backend.ts to reflect the current AI CLI ecosystem as of March 2026, covering 6 requirements (REQ-82 through REQ-86, REQ-88).

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Update Gemini model mappings (opus, haiku) | c6dd003 |
| 2 | Update Codex opus model to GPT-5.4 | 0eddb5a |
| 3 | Update OpenCode models to Claude 4.6 | ca0c309 |
| 4 | Update Gemini capabilities (subagents GA, parallel) | 8797c33 |
| 5 | Update Codex capabilities (hooks, teams) | a8c90cd |

## Verification

All 9 invariants verified programmatically:

| Constant | Field | Old Value | New Value | Status |
|----------|-------|-----------|-----------|--------|
| DEFAULT_BACKEND_MODELS.gemini.opus | opus | gemini-3-pro | gemini-3.1-pro | PASS |
| DEFAULT_BACKEND_MODELS.gemini.haiku | haiku | gemini-2.5-flash | gemini-3.1-flash-lite | PASS |
| DEFAULT_BACKEND_MODELS.codex.opus | opus | gpt-5.3-codex | gpt-5.4 | PASS |
| DEFAULT_BACKEND_MODELS.opencode.opus | opus | anthropic/claude-opus-4-5 | anthropic/claude-opus-4-6 | PASS |
| DEFAULT_BACKEND_MODELS.opencode.sonnet | sonnet | anthropic/claude-sonnet-4-5 | anthropic/claude-sonnet-4-6 | PASS |
| BACKEND_CAPABILITIES.gemini.subagents | subagents | 'experimental' | true | PASS |
| BACKEND_CAPABILITIES.gemini.parallel | parallel | false | true | PASS |
| BACKEND_CAPABILITIES.codex.hooks | hooks | false | true | PASS |
| BACKEND_CAPABILITIES.codex.teams | teams | false | true | PASS |

TypeScript type-check (`npm run build:check`) passes after all changes.

Note: `npx jest tests/unit/backend.test.ts` is expected to fail after this plan because test assertions still reference old values. Plan 69-02 will update tests.

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- [x] lib/backend.ts modified with all 9 constant updates
- [x] All 5 commits exist (c6dd003, 0eddb5a, ca0c309, 8797c33, a8c90cd)
- [x] TypeScript type-check passes
- [x] All invariants verified
