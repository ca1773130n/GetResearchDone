---
phase: 79-wireup-orchestrator-and-execution
plan: "03"
subsystem: wireup
tags: [detection, missing-connections, classification, heuristics, orchestrator]
dependency_graph:
  requires: ["79-02"]
  provides: ["detectMissingConnections", "classifyFailure", "MissingConnection", "IssuesByConfidence", "IssuesByType"]
  affects: ["lib/wireup/orchestrator.ts", "lib/wireup/index.ts"]
tech_stack:
  added: []
  patterns: ["filesystem-based classification", "heuristic dispatch chain", "null-coalescing fallback"]
key_files:
  created:
    - lib/wireup/detection.ts
  modified:
    - lib/wireup/types.ts
    - lib/wireup/orchestrator.ts
    - lib/wireup/index.ts
decisions:
  - "Detection uses spawnSync grep/find — no shell injection, no LLM calls"
  - "classifyFailure uses null-coalescing dispatcher: env-var > import > route > middleware > handler > nav-link"
  - "Deduplication key is (issue_type, source_file, target_file) — keeps highest-confidence duplicate"
  - "WireupResult extended with issues[], issues_by_confidence, issues_by_type for Phase 80 auto-fix consumption"
  - "Dry-run early return now includes zero-value issues_by_confidence and issues_by_type fields"
metrics:
  duration: "10m"
  completed: "2026-03-20"
  tasks_completed: 2
  files_created: 1
  files_modified: 3
---

# Phase 79 Plan 03: Missing Connection Detection Summary

One-liner: Missing connection detection engine classifying failed scenario results into 6 structured issue types (missing-route, unconnected-handler, missing-import, missing-middleware, broken-nav-link, missing-env-var) with confidence levels via pure filesystem heuristics, fully integrated into the wireup orchestrator pipeline.

## What Was Built

### lib/wireup/detection.ts

New module implementing the missing connection detection engine. Exports two functions:

- `detectMissingConnections(cwd, failedResults)` — top-level API. Filters to failed scenarios, iterates failed steps, calls classifyFailure() per step, deduplicates by (issue_type, source_file, target_file), and sorts high-confidence first.
- `classifyFailure(cwd, step, scenario)` — dispatcher. Runs 6 heuristics in priority order and returns the first match (or null).

Six heuristics implemented using grep/find via spawnSync:

| Heuristic | Trigger | Confidence |
|-----------|---------|------------|
| missing-env-var | ECONNREFUSED, undefined env var | high (if name extractable) |
| missing-import | Cannot find module / ModuleNotFoundError | high |
| missing-route | HTTP 404 + route pattern not in codebase | high |
| missing-middleware | HTTP 401/403 | medium |
| unconnected-handler | HTTP 2xx + empty body + step failed | medium |
| broken-nav-link | HTTP 404 on page-like path (no /api/, no extension) | low |

Helper functions (internal):
- `grepForPattern(cwd, pattern, globs?)` — spawnSync grep -rl, returns file paths
- `findRouteFiles(cwd)` — find files matching *route*/*router*/*controller*/*handler*
- `parseModuleFromError(stderr)` — regex extraction for Node.js/Python module errors

### lib/wireup/types.ts additions

New types:
- `IssueType` — union of 6 issue type string literals
- `Confidence` — 'high' | 'medium' | 'low'
- `MissingConnection` — interface with: issue_type, source_file, target_file, suggested_fix, confidence, scenario_id, step_index, error_context
- `IssuesByConfidence` — { high, medium, low } counts
- `IssuesByType` — per-type count record

WireupResult extended with:
- `issues: MissingConnection[]`
- `issues_by_confidence: IssuesByConfidence`
- `issues_by_type: IssuesByType`

### lib/wireup/orchestrator.ts integration

- Replaced try/catch stub with proper typed import of `detectMissingConnections`
- After executeScenarios(), filters failed results and calls detectMissingConnections
- Groups results into issuesByConfidence and issuesByType counters
- _buildPassFailSummary updated to accept and render issues summary
- cmdWireup stdout updated to show issues_by_confidence inline
- Dry-run return path includes zero-value issue fields for consistent shape

Full pipeline confirmed: discoverUnwiredFeatures → generateScenarios → executeScenarios → detectMissingConnections → writeWireupState → WireupResult

### lib/wireup/index.ts barrel

Added detectMissingConnections and classifyFailure to barrel exports. Added detection.ts to @see JSDoc.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d73f425 | feat(79-03): implement MissingConnection type and detection heuristics |
| 2 | 1338c65 | feat(79-03): integrate detection into orchestrator and update barrel exports |

## Deviations from Plan

None — plan executed exactly as written.

The `classifyFailure` function is exported (plan mentioned it as "if exported") — it was exported to allow direct unit testing in Phase 81 and to support the Phase 80 auto-fix layer.

## Verification Results

Level 1 (Sanity): All passed
- detection.ts compiles without errors (tsc --noEmit clean)
- MissingConnection has all 6 required fields (issue_type, source_file, target_file, suggested_fix, confidence, scenario_id)
- All 6 issue types handled in detection.ts

Level 2 (Proxy): All passed
- No LLM subprocess calls in detection module (only comments mention them)
- Orchestrator implements complete discover→generate→execute→detect→report pipeline
- WireupResult contains features_discovered, scenarios_run, scenarios_passed, scenarios_failed, issues_found
- Test suite: 2874 tests passing across 43 suites, tsc clean

## Self-Check: PASSED

- `/Users/neo/Developer/Projects/GetResearchDone/lib/wireup/detection.ts` — exists, 501 lines
- `/Users/neo/Developer/Projects/GetResearchDone/lib/wireup/types.ts` — MissingConnection, IssuesByConfidence, IssuesByType added
- Commits d73f425 and 1338c65 confirmed in git log
