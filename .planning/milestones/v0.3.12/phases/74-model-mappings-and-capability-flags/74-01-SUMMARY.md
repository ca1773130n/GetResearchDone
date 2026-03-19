---
phase: 74-model-mappings-and-capability-flags
plan: "01"
subsystem: backend
tags: [model-mappings, backend, codex, gemini, opencode]
dependency_graph:
  requires: []
  provides: [updated-DEFAULT_BACKEND_MODELS]
  affects: [lib/backend.ts, tests/unit/backend.test.ts]
tech_stack:
  added: []
  patterns: [model-tier-mapping, abstract-tier-resolution]
key_files:
  created: []
  modified:
    - lib/backend.ts
    - tests/unit/backend.test.ts
decisions:
  - "codex.haiku mapped to gpt-5.4-mini (2x faster than gpt-5.4, ideal for subagent/discovery work per REQ-110)"
  - "gemini.sonnet mapped to gemini-3.1-flash (updated Gemini 3.1 Flash replaces Gemini 3 Flash per REQ-113)"
  - "opencode mappings verified unchanged: anthropic/claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 (REQ-116)"
metrics:
  duration: "~5 minutes"
  completed: "2026-03-19"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 74 Plan 01: Model Mappings Update Summary

Updated DEFAULT_BACKEND_MODELS in lib/backend.ts so codex.haiku resolves to gpt-5.4-mini and gemini.sonnet resolves to gemini-3.1-flash, with matching test assertions — all 149 backend tests pass.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update DEFAULT_BACKEND_MODELS mappings | e895a87 | lib/backend.ts |
| 2 | Update model mapping test assertions | 1c624a7 | tests/unit/backend.test.ts |

## Changes Made

### lib/backend.ts

- `codex.haiku`: `'gpt-5.3-codex-spark'` → `'gpt-5.4-mini'`
- `gemini.sonnet`: `'gemini-3-flash'` → `'gemini-3.1-flash'`
- Module header comment updated: added "GPT-5.4-mini" to Codex CLI line, changed "3 Flash" to "3.1 Flash" in Gemini CLI line
- `codex.sonnet` remains `'gpt-5.3-codex-spark'` (correct mid-tier model)
- `gemini.opus` remains `'gemini-3.1-pro'`, `gemini.haiku` remains `'gemini-3.1-flash-lite'`
- `opencode` mappings verified unchanged

### tests/unit/backend.test.ts

- Test description for codex: "codex maps to gpt-5.4, gpt-5.3-codex-spark, gpt-5.3-codex-spark" → "codex maps to gpt-5.4, gpt-5.3-codex-spark, gpt-5.4-mini"
- Test description for gemini: "gemini maps to gemini-3.1-pro, gemini-3-flash, gemini-3.1-flash-lite" → "gemini maps to gemini-3.1-pro, gemini-3.1-flash, gemini-3.1-flash-lite"
- `test.each` entries updated for codex/haiku and gemini/sonnet resolveBackendModel cases

## Verification

- `npm run build:check` passed (no type errors)
- `npx jest tests/unit/backend.test.ts` — 149/149 tests pass, 0 failures

## Success Criteria

1. DEFAULT_BACKEND_MODELS.codex = { opus: 'gpt-5.4', sonnet: 'gpt-5.3-codex-spark', haiku: 'gpt-5.4-mini' } — PASS
2. DEFAULT_BACKEND_MODELS.gemini = { opus: 'gemini-3.1-pro', sonnet: 'gemini-3.1-flash', haiku: 'gemini-3.1-flash-lite' } — PASS
3. DEFAULT_BACKEND_MODELS.opencode unchanged — PASS
4. All backend.test.ts tests pass — PASS (149/149)
5. Type check passes — PASS

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `lib/backend.ts` modified and contains 'gpt-5.4-mini' at codex.haiku
- [x] `lib/backend.ts` modified and contains 'gemini-3.1-flash' at gemini.sonnet
- [x] `tests/unit/backend.test.ts` modified with updated assertions
- [x] Commit e895a87 exists (Task 1)
- [x] Commit 1c624a7 exists (Task 2)
- [x] 149 tests pass, 0 failures
