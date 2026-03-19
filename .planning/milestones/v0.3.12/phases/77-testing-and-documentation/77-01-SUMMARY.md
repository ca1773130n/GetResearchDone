---
phase: 77-testing-and-documentation
plan: "01"
subsystem: tests
tags: [testing, unit-tests, backend, context, agent-audit, v0.3.12]
dependency_graph:
  requires: [74-model-mappings-and-capability-flags, 75-hook-events-and-plugin-infrastructure, 76-agent-frontmatter-and-mcp-elicitation]
  provides: [v0.3.12-test-coverage]
  affects: [tests/unit/backend.test.ts, tests/unit/context.test.ts, tests/unit/agent-audit.test.ts]
tech_stack:
  added: []
  patterns: [jest-unit-testing, frontmatter-parsing, plugin-json-assertions]
key_files:
  created: []
  modified:
    - tests/unit/backend.test.ts
    - tests/unit/context.test.ts
    - tests/unit/agent-audit.test.ts
    - agents/grd-verifier.md
    - agents/grd-plan-checker.md
    - agents/grd-integration-checker.md
    - agents/grd-codebase-mapper.md
    - agents/grd-baseline-assessor.md
    - agents/grd-eval-reporter.md
    - agents/grd-code-reviewer.md
    - agents/grd-migrator.md
decisions:
  - "maxTurns added to 7 bounded agents (verifier, plan-checker, integration-checker, codebase-mapper, baseline-assessor, eval-reporter, code-reviewer)"
  - "disallowedTools added to 4 restricted read-only agents (verifier, plan-checker, integration-checker, code-reviewer) + codebase-mapper (Edit only)"
  - "grd-code-reviewer and grd-migrator were missing effort field; added as part of this plan"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-19"
  tasks_completed: 2
  files_modified: 11
---

# Phase 77 Plan 01: v0.3.12 Testing and Documentation — Unit Tests Summary

Unit tests covering all new model mappings, capability flags, init context fields, hook registrations, and agent frontmatter fields introduced in Phases 74-76. The new tests provide regression coverage for 6 capability flags, 4 model mappings, 2 init context fields, 2 hook registrations, and 3 agent frontmatter field types.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add capability flag and model mapping tests to backend.test.ts | 4f653e8 | tests/unit/backend.test.ts |
| 2 | Add init context and hook registration tests | f5c4d9c | tests/unit/context.test.ts, tests/unit/agent-audit.test.ts, agents/*.md |

## What Was Built

### Task 1: backend.test.ts — v0.3.12 capability flags and model mappings

Added two new describe blocks:

**`v0.3.12 capability flags`** — 7 tests covering all 6 new flags across the 4 primary backends:
- `smart_approvals`: true only for codex
- `plan_mode`: true only for gemini
- `sandbox_gvisor`: true only for gemini
- `sandbox_lxc`: false for all four primary backends
- `mcp_elicitation`: true only for claude
- `max_output_tokens`: `{ default: 64000, upper_bound: 128000 }` for claude, `null` for others

**`v0.3.12 model mappings`** — 4 tests verifying updated model strings:
- `DEFAULT_BACKEND_MODELS.codex.haiku` = `'gpt-5.4-mini'`
- `DEFAULT_BACKEND_MODELS.gemini.opus` = `'gemini-3.1-pro'`
- `DEFAULT_BACKEND_MODELS.gemini.sonnet` = `'gemini-3.1-flash'`
- `DEFAULT_BACKEND_MODELS.opencode.opus` = `'anthropic/claude-opus-4-6'`

### Task 2: context.test.ts and agent-audit.test.ts

**context.test.ts** — New `mcp_elicitation_available and model_overrides_available fields` describe block (4 tests):
- Both fields are present in `cmdInitExecutePhase` JSON output
- Both are typed as booleans
- `mcp_elicitation_available` is `true` for the claude backend fixture

**agent-audit.test.ts** — Hook registration and agent frontmatter tests:

*StopFailure and PostCompact hook tests (2 new tests):*
- `StopFailure` hook is registered with `stop-failure-hook` command, error suppression, timeout 1-60s
- `PostCompact` hook is registered with `post-compact-hook` command, error suppression, timeout 1-60s

*Updated existing tests:*
- `all hooks have error suppression` now covers StopFailure and PostCompact
- `hook timeout values are reasonable` now covers StopFailure and PostCompact

*New `Agent frontmatter — effort, maxTurns, disallowedTools` describe block (3 tests):*
- All 20 agents have `effort` field with value in `['low', 'medium', 'high']`
- At least 6 bounded agents have `maxTurns` field
- At least 4 restricted agents have `disallowedTools` field

**Agent file updates** (prerequisite for frontmatter tests):
- `grd-code-reviewer.md`: Added missing `effort: medium`, `maxTurns: 20`, `disallowedTools: Write, Edit`
- `grd-migrator.md`: Added missing `effort: medium`
- `grd-verifier.md`: Added `maxTurns: 20`, `disallowedTools: Write, Edit`
- `grd-plan-checker.md`: Added `maxTurns: 15`, `disallowedTools: Write, Edit`
- `grd-integration-checker.md`: Added `maxTurns: 20`, `disallowedTools: Write, Edit`
- `grd-codebase-mapper.md`: Added `maxTurns: 25`, `disallowedTools: Edit`
- `grd-baseline-assessor.md`: Added `maxTurns: 30`
- `grd-eval-reporter.md`: Added `maxTurns: 25`

## Test Results

```
Test Suites: 3 passed, 3 total
Tests:       397 passed, 397 total
```

All 397 tests in the 3 target files pass. The pre-existing failures in `backend-real-env.test.ts`, `utils.test.ts`, and `commands.test.ts` (7 failures in 3 suites) are not related to this plan — they existed before this plan's changes and cover stale model strings in those files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added effort field to grd-code-reviewer and grd-migrator**
- **Found during:** Task 2 (agent frontmatter tests)
- **Issue:** Two agents were missing the `effort` field that Phase 76 was supposed to add to all 20 agents; git status showed only 18 agents modified
- **Fix:** Added `effort: medium` to both files
- **Files modified:** `agents/grd-code-reviewer.md`, `agents/grd-migrator.md`
- **Commit:** f5c4d9c

**2. [Rule 2 - Missing Critical Functionality] Added maxTurns and disallowedTools to agents**
- **Found during:** Task 2 (agent frontmatter test required these fields to exist)
- **Issue:** No agents had `maxTurns` or `disallowedTools` fields; tests asserting >= 6 and >= 4 respectively would fail
- **Fix:** Added `maxTurns` to 7 agents (verifier, plan-checker, integration-checker, codebase-mapper, baseline-assessor, eval-reporter, code-reviewer) and `disallowedTools` to 5 agents (verifier, plan-checker, integration-checker, code-reviewer, codebase-mapper)
- **Files modified:** 7 agent files
- **Commit:** f5c4d9c

## Self-Check

Files created:
- SUMMARY.md: FOUND (this file)

Files modified:
- tests/unit/backend.test.ts: FOUND (commit 4f653e8)
- tests/unit/context.test.ts: FOUND (commit f5c4d9c)
- tests/unit/agent-audit.test.ts: FOUND (commit f5c4d9c)

Commits:
- 4f653e8: FOUND — feat(77-01): add v0.3.12 capability flag and model mapping tests
- f5c4d9c: FOUND — feat(77-01): add init context, hook registration, and agent frontmatter tests

## Self-Check: PASSED
