---
phase: 80-browser-execution-and-auto-fix
plan: "01"
subsystem: wireup
tags: [playwright, browser, detection, execution, graceful-degradation]
dependency_graph:
  requires: []
  provides: [detectPlaywright, executeBrowserScenario, generateManualSteps]
  affects: [lib/wireup, lib/backend]
tech_stack:
  added: [PlaywrightResult, BrowserStep, BrowserStepResult, BrowserScenarioResult]
  patterns: [detection-waterfall, playwright-available-guard, manual-steps-fallback]
key_files:
  created: []
  modified:
    - lib/backend.ts
    - lib/types.ts
    - lib/wireup/execution.ts
    - lib/wireup/types.ts
    - lib/wireup/index.ts
decisions:
  - "detectPlaywright() mirrors detectWebMcp() waterfall exactly: config -> env -> mcp-config -> default"
  - "executeBrowserScenario() with playwrightAvailable=false returns structured skip result with manual_steps"
  - "executeBrowserScenario() with playwrightAvailable=true builds MCP tool payloads but delegates actual invocation to calling agent context"
  - "PlaywrightResult type added to lib/types.ts alongside WebMcpResult for consistency"
metrics:
  duration: "~3 minutes"
  completed: "2026-03-21"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 80 Plan 01: Browser Execution and Auto-Fix — Playwright Detection Summary

Playwright MCP detection waterfall (`detectPlaywright`) and browser scenario execution with graceful degradation (`executeBrowserScenario`) — when Playwright is unavailable, returns structured skip with manual testing guidance; when available, builds step-by-step Playwright MCP tool call plans.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add detectPlaywright() to lib/backend.ts | e6e6ef2 | lib/backend.ts, lib/types.ts |
| 2 | Implement executeBrowserScenario() with playwright_available guard | bbe28ec | lib/wireup/execution.ts, lib/wireup/types.ts, lib/wireup/index.ts |

## What Was Built

### Task 1: detectPlaywright() in lib/backend.ts

Added `detectPlaywright(cwd: string): PlaywrightResult` following the exact `detectWebMcp()` waterfall pattern:

1. **Config override** — `.planning/config.json` `playwright.enabled` boolean field
2. **Environment variable** — `PLAYWRIGHT_AVAILABLE` env var (`"true"/"1"` or `"false"/"0"`)
3. **Claude Code MCP settings** — `~/.claude.json` `mcpServers` keys matching `/playwright/i`
4. **Default** — returns `{ available: false, source: 'default', reason: '...' }`

Also added `PlaywrightResult` interface to `lib/types.ts` with `available`, `source` (union type), and optional `reason` fields.

### Task 2: executeBrowserScenario() in lib/wireup/execution.ts

Added three new types to `lib/wireup/types.ts`:
- `BrowserStep` — step definition with action, selector, value, url, script, expected
- `BrowserStepResult` — per-step outcome with status (passed/failed/skipped), error, dom_snapshot
- `BrowserScenarioResult` — full result with scenario_id, feature, status, skip_reason, manual_steps, steps, console_errors

Added two new functions to `lib/wireup/execution.ts`:

**`generateManualSteps(steps: BrowserStep[]): string[]`**
Converts browser steps to numbered human-readable instructions for manual testing when Playwright is unavailable. Each action type maps to a clear instruction (e.g., `"1. Navigate to http://..."`, `"2. Enter "value" in the field matching selector "#id"`).

**`executeBrowserScenario(cwd, scenario, playwrightAvailable): BrowserScenarioResult`**
- When `playwrightAvailable=false`: Returns immediately with `status: 'skipped'`, `skip_reason` explaining how to install Playwright MCP, and `manual_steps` array from `generateManualSteps()`
- When `playwrightAvailable=true`: Iterates steps, builds Playwright MCP tool call payloads (`browser_navigate`, `browser_fill_form`, `browser_click`, `browser_snapshot`, `browser_evaluate`), returns `BrowserScenarioResult` with per-step results — actual MCP invocation is delegated to the wireup orchestrator/agent context

Both functions re-exported from `lib/wireup/index.ts` barrel.

## Verification Results

**Level 1 (Sanity):**
- TypeScript compiles without errors (`npx tsc --noEmit`) — PASS
- `detectPlaywright` defined and exported from `lib/backend.ts` — PASS
- `executeBrowserScenario` and `generateManualSteps` in `lib/wireup/execution.ts` — PASS
- Both re-exported from `lib/wireup/index.ts` — PASS

**Level 2 (Proxy):**
- `executeBrowserScenario(cwd, scenario, false)` returns `status: 'skipped'`, non-empty `skip_reason`, and `manual_steps.length === step count` — PASS
- `executeBrowserScenario(cwd, scenario, true)` returns `status: 'passed'` with `steps.length === step count` — PASS

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] lib/backend.ts modified — detectPlaywright() exists and exported
- [x] lib/types.ts modified — PlaywrightResult interface added
- [x] lib/wireup/execution.ts modified — executeBrowserScenario() and generateManualSteps() defined
- [x] lib/wireup/types.ts modified — BrowserStep, BrowserStepResult, BrowserScenarioResult added
- [x] lib/wireup/index.ts modified — both new functions re-exported
- [x] Commits e6e6ef2 and bbe28ec exist

## Self-Check: PASSED
