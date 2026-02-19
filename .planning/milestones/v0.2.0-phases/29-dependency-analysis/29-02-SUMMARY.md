---
phase: 29-dependency-analysis
plan: 02
subsystem: dependency-analysis
tags: [cli-wiring, mcp-server, integration-tests]
dependency_graph:
  requires: [lib/deps.js, lib/roadmap.js, lib/utils.js]
  provides: [cli-phase-analyze-deps, mcp-grd_phase_analyze_deps]
  affects: [bin/grd-tools.js, lib/mcp-server.js, tests/unit/deps.test.js]
tech_stack:
  added: []
  patterns: [cli-subcommand-routing, mcp-descriptor-table, fixture-based-integration-tests]
key_files:
  created: []
  modified:
    - bin/grd-tools.js
    - lib/mcp-server.js
    - tests/unit/deps.test.js
key_decisions:
  - analyze-deps takes no arguments (reads ROADMAP.md from cwd), matching grd_roadmap_analyze pattern
  - MCP descriptor placed in Phase operations section with empty params array
  - Integration tests use fixture ROADMAPs with realistic dependency structures (v0.2.0 layout)
metrics:
  duration: 3min
  completed: 2026-02-19
---

# Phase 29 Plan 02: CLI Wiring and Integration Summary

Wired lib/deps.js cmdPhaseAnalyzeDeps into the CLI router (bin/grd-tools.js) and MCP server (lib/mcp-server.js), adding `phase analyze-deps` subcommand and `grd_phase_analyze_deps` MCP tool descriptor with 5 integration tests.

## What Was Done

### Task 1: Wire phase analyze-deps into CLI router and add MCP descriptor
- Added `const { cmdPhaseAnalyzeDeps } = require('../lib/deps')` import to bin/grd-tools.js
- Added `'analyze-deps'` to PHASE_SUBS constant array
- Added routing: `else if (sub === 'analyze-deps') { cmdPhaseAnalyzeDeps(cwd, raw); }` in the phase case block
- Added `const { cmdPhaseAnalyzeDeps } = require('./deps')` import to lib/mcp-server.js
- Added MCP descriptor `grd_phase_analyze_deps` with empty params array and `execute: (cwd, _args) => cmdPhaseAnalyzeDeps(cwd, false)`
- Verified: `node bin/grd-tools.js phase analyze-deps` returns valid JSON with nodes, edges, parallel_groups, has_cycle
- Full test suite: 1,514 tests pass, zero regressions
- Commit: `104df75`

### Task 2: Add CLI integration tests for phase analyze-deps
- Added new `CLI integration -- phase analyze-deps` describe block with 5 tests:
  1. CLI outputs valid JSON with expected fields (nodes, edges, parallel_groups, has_cycle)
  2. Parallel groups match expected v0.2.0 layout: `[['27','29'], ['28','30'], ['31']]`
  3. JSON output contains all phase numbers with no duplicates
  4. Cycle detection returns error with has_cycle:true and cycle_path
  5. MCP descriptor grd_phase_analyze_deps exists with empty params and execute function
- Added COMMAND_DESCRIPTORS import from lib/mcp-server.js for descriptor verification
- Total deps tests: 32 (27 from Plan 01 + 5 new integration tests)
- Full suite: 1,519 tests, zero regressions
- Commit: `5a523d1`

## Deviations from Plan

None - plan executed exactly as written.

## Key Metrics

| Metric | Value |
|--------|-------|
| New tests | 5 |
| Total deps tests | 32 |
| Total tests | 1519 |
| Test delta | +5 |
| tests/unit/deps.test.js lines | 582 |
| Regressions | 0 |

## Self-Check

```
FOUND: bin/grd-tools.js
FOUND: lib/mcp-server.js
FOUND: tests/unit/deps.test.js
FOUND: 104df75
FOUND: 5a523d1
```

## Self-Check: PASSED
