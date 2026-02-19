---
phase: 29-dependency-analysis
verified: 2026-02-19T11:46:45Z
status: gaps_found
score:
  level_1: 4/5 sanity checks passed
  level_2: 3/4 proxy metrics met
  level_3: 1 item deferred (tracked)
gaps:
  - truth: "analyze-deps output includes a parallel_groups array identifying sets of phases that can execute concurrently (no shared dependencies)"
    status: failed
    verification_level: 2
    reason: "ROADMAP.md uses **Depends on**: (colon outside bold markers) but lib/roadmap.js regex on line 343 matches only **Depends on:** (colon inside bold markers). All 5 depends_on fields in the real ROADMAP.md return null, producing 0 edges and all phases in one group."
    quantitative:
      metric: "parallel_groups for v0.2.0 ROADMAP.md"
      expected: "[['27','29'],['28','30'],['31']]"
      actual: "[['27','28','29','30','31']]"
    artifacts:
      - path: "lib/roadmap.js"
        issue: "Line 343: regex /\\*\\*Depends on:\\*\\*/i does not match '**Depends on**: Phase N' (colon-outside format used by actual ROADMAP.md)"
    missing:
      - "Update lib/roadmap.js line 343 regex from /\\*\\*Depends on:\\*\\*/i to /\\*\\*Depends on\\*\\*:?\\s*|\\*\\*Depends on:\\*\\*/i to match both formats, or update ROADMAP.md to use colon-inside format"
deferred_validations:
  - description: "Parallel executor (Phase 30) correctly consumes analyze-deps parallel_groups output to spawn teammate agents"
    metric: "parallel execution vs sequential wall-clock time"
    target: "Two independent phases execute concurrently in separate worktrees"
    depends_on: "Phase 27 (worktree), Phase 28 (PR workflow), Phase 30 (parallel execution)"
    tracked_in: "STATE.md as DEFER-29-01"
human_verification: []
---

# Phase 29: Phase Dependency Analysis Verification Report

**Phase Goal:** Roadmap phases have explicit dependency declarations and tooling can identify parallelizable phase sets
**Verified:** 2026-02-19T11:46:45Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Verification Summary by Tier

### Level 1: Sanity Checks

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| S1 | lib/deps.js exports all 5 functions | PASS | `parseDependsOn,buildDependencyGraph,computeParallelGroups,detectCycle,cmdPhaseAnalyzeDeps` — confirmed by `node -e "const d=require('./lib/deps'); console.log(Object.keys(d).join(','))"` |
| S2 | CLI subcommand routed (not "Unknown subcommand") | PASS | `node bin/grd-tools.js phase analyze-deps` returns `{` JSON, not error. `analyze-deps` in PHASE_SUBS at line 164 of bin/grd-tools.js |
| S3 | CLI output is valid JSON with required fields (nodes, edges, parallel_groups, has_cycle) | PASS | All 4 fields present — confirmed by field-check command returning `true` |
| S4 | analyzeRoadmap exported from lib/roadmap.js | PASS | `typeof r.analyzeRoadmap` = `function` — confirmed at line 477 of roadmap.js |
| S5 | MCP descriptor grd_phase_analyze_deps registered | PASS | `grep -c "grd_phase_analyze_deps" lib/mcp-server.js` = `1` — at line 632, empty params array, correct execute function |

**Level 1 Score:** 5/5 passed

Note: S2 passes at the routing/format level. The correctness gap (P2 below) is a proxy-level finding — the CLI runs and returns JSON, but the content is wrong for the actual ROADMAP.md.

### Level 2: Proxy Metrics

| # | Metric | Target | Achieved | Status |
|---|--------|--------|----------|--------|
| P1 | Unit test suite passes (deps.test.js) | >= 26 tests, 0 failures | 32 tests, 0 failures | PASS |
| P2 | Parallel groups correct for v0.2.0 ROADMAP.md | [["27","29"],["28","30"],["31"]] | [["27","28","29","30","31"]] | FAIL |
| P3 | Zero regressions on full test suite | 1,487+ passed, 0 failed | 1,519 passed, 0 failed | PASS |
| P4 | Cycle detection returns cycle path (not crash/hang) | has_cycle: true, cycle_path present | Verified via 4 unit tests in detectCycle describe block — 2-node, 3-node cycles detected correctly | PASS |

**Level 2 Score:** 3/4 met target

### Level 3: Deferred Validations

| # | Validation | Metric | Target | Depends On | Status |
|---|-----------|--------|--------|------------|--------|
| D1 | Parallel executor (Phase 30) consumes analyze-deps output correctly | parallel execution vs sequential wall-clock time | Two independent phases execute concurrently | Phase 27, 28, 30 | DEFERRED (DEFER-29-01) |

**Level 3:** 1 item tracked for integration phase (Phase 31)

## Goal Achievement

### Observable Truths (Phase 29 Success Criteria)

| # | Truth | Verification Level | Status | Evidence |
|---|-------|--------------------|--------|----------|
| 1 | `depends_on` field supported in ROADMAP.md and parsed by roadmap module | Level 2 (proxy) | FAIL | Parser regex `/\*\*Depends on:\*\*/i` (line 343, roadmap.js) does not match ROADMAP.md format `**Depends on**:` (colon outside bold). All 5 real depends_on entries return null. |
| 2 | `grd-tools phase analyze-deps` returns JSON with nodes, edges, parallel_groups, has_cycle | Level 1 (sanity) | PASS | Confirmed — all 4 fields present in output |
| 3 | analyze-deps output includes `parallel_groups` array identifying concurrent sets | Level 2 (proxy) | FAIL | Real ROADMAP.md produces `[["27","28","29","30","31"]]` (all in one group due to 0 edges) instead of `[["27","29"],["28","30"],["31"]]` |
| 4 | Circular dependency detection reports error with cycle path | Level 2 (proxy) | PASS | 4 detectCycle unit tests pass; 2 cmdPhaseAnalyzeDeps cycle tests pass (using colon-inside fixture format) |

### Required Artifacts

| Artifact | Expected | Exists | Lines | Sanity | Wired |
|----------|----------|--------|-------|--------|-------|
| `lib/deps.js` | Dependency analysis module, 5 exports, min 100 lines | Yes | 252 | PASS | PASS |
| `tests/unit/deps.test.js` | Comprehensive tests, min 200 lines | Yes | 582 | PASS | PASS |
| `bin/grd-tools.js` | Contains analyze-deps routing | Yes | - | PASS | PASS |
| `lib/mcp-server.js` | Contains grd_phase_analyze_deps descriptor | Yes | - | PASS | PASS |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| lib/deps.js | lib/roadmap.js | `analyzeRoadmap(cwd)` | WIRED | `const { analyzeRoadmap } = require('./roadmap')` at line 11; `analyzeRoadmap` exported at line 477 of roadmap.js |
| lib/deps.js | lib/utils.js | `output()` | WIRED | `const { output } = require('./utils')` at line 10 |
| bin/grd-tools.js | lib/deps.js | `cmdPhaseAnalyzeDeps` | WIRED | `const { cmdPhaseAnalyzeDeps } = require('../lib/deps')` at line 63; routing at line 396-397 |
| lib/mcp-server.js | lib/deps.js | `cmdPhaseAnalyzeDeps` | WIRED | `const { cmdPhaseAnalyzeDeps } = require('./deps')` at line 35; descriptor at line 631-636 |

## Root Cause Analysis: P2 Failure

### The Mismatch

The actual ROADMAP.md uses `**Depends on**:` (colon after the closing `**` bold marker):

```
**Depends on**: Nothing (first phase of v0.2.0)
**Depends on**: Phase 27
```

The parser regex in `lib/roadmap.js` line 343 expects `**Depends on:**` (colon before the closing `**`):

```javascript
const dependsMatch = section.match(/\*\*Depends on:\*\*\s*([^\n]+)/i);
```

The regex correctly matches `**Depends on:** Phase 27` (test fixture format) but NOT `**Depends on**: Phase 27` (actual ROADMAP.md format). All 5 `depends_on` entries in the real ROADMAP.md return `null`.

### Impact

- Live CLI produces `edges: []` and `parallel_groups: [["27","28","29","30","31"]]` — treating all phases as independent
- Phase 30's parallel executor would receive incorrect grouping if it consumed the live CLI output
- All 32 unit tests pass because test fixtures use the colon-inside format that the parser handles correctly

### Fix Required

Either:

1. (Preferred) Update the parser regex to accept both formats:
   ```javascript
   const dependsMatch = section.match(/\*\*Depends on:?\*\*:?\s*([^\n]+)/i);
   ```
   This matches both `**Depends on:**` and `**Depends on**:`.

2. (Alternative) Update ROADMAP.md to use the colon-inside format throughout.

The regex fix is backwards-compatible and requires only one line change.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib/deps.js | 7 | Comment says "Depends on: lib/utils.js (output, error)" but `error` import was removed (only `output` used) | INFO | Cosmetic — noted in REVIEW.md as INFO-1, no functional impact |

## Experiment Verification

Phase 29 implements standard graph algorithms (Kahn's topological sort, DFS cycle detection) — no paper baselines to compare against. Algorithm correctness is verified through unit tests.

| Check | Status | Details |
|-------|--------|---------|
| Algorithm direction correct (groups produce valid topological order) | PASS | Verified by 6 computeParallelGroups unit tests including v0.2.0 known-answer test |
| Kahn's algorithm implementation correct | PASS | test: "complex graph with mixed deps (v0.2.0 roadmap structure)" passes with correct output |
| DFS cycle detection correct | PASS | 4 detectCycle unit tests including 2-node and 3-node cycles |
| No degenerate outputs (infinite loop, crash) | PASS | process.exit(0) on all paths; no infinite loops possible with visited-state tracking |

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| REQ-43 (Phase Dependency Analysis) | PARTIAL | depends_on parsing fails for real ROADMAP.md format; parallel_groups output incorrect for live CLI |

## Human Verification Required

None — all checks are automated.

## Gaps Summary

**1 critical gap found:**

The `depends_on` parsing regex in `lib/roadmap.js` (line 343) uses format `**Depends on:**` but the actual ROADMAP.md consistently uses `**Depends on**:`. This format mismatch means:

- All 5 real roadmap phase entries return `depends_on: null`
- Live CLI produces `edges: []` and puts all 5 phases in one parallel group
- Expected output `[["27","29"],["28","30"],["31"]]` is never produced from the real ROADMAP.md

The algorithms themselves are correct (verified by 32 unit tests using colon-inside fixtures). The fix is a single-line change to the regex in `lib/roadmap.js`. The test suite should also add a test for the colon-outside format to prevent regression.

---

_Verified: 2026-02-19T11:46:45Z_
_Verifier: Claude (grd-verifier)_
_Verification levels applied: Level 1 (sanity), Level 2 (proxy), Level 3 (deferred)_
