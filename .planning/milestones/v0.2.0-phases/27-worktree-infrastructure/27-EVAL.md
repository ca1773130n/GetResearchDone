# Evaluation Plan: Phase 27 — Worktree Infrastructure

**Designed:** 2026-02-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Git worktree lifecycle management (lib/worktree.js), CLI routing (bin/grd-tools.js), context init enrichment (lib/context.js), MCP tool descriptors (lib/mcp-server.js)
**Reference papers:** N/A — infrastructure/tooling work with no ML benchmarks; evaluation derived from requirements (REQ-40, REQ-42) and established project quality standards

## Evaluation Overview

Phase 27 delivers the git worktree infrastructure required by REQ-40 (worktree creation for phase execution) and REQ-42 (worktree lifecycle management). This is a pure infrastructure phase: no ML models, no benchmark datasets, no PSNR/SSIM metrics. Quality is measured entirely by correctness of behavior, adherence to existing codebase patterns, test coverage, and regression-free integration.

The primary risks are (1) git command whitelist friction — `git worktree` must be present in GIT_ALLOWED_COMMANDS or calls will silently fail, (2) regression in the existing 1,433-test suite, and (3) context.js enrichment producing incorrect `worktree_path`/`worktree_branch` values that mislead downstream executor agents.

Evaluation is largely completable in-phase because the deliverables are self-contained Node.js modules with unit tests. The only meaningful deferred validation is end-to-end: confirming that execute-phase actually creates, uses, and cleans up a worktree during a real plan execution, which requires Phase 31 (integration).

No paper-based evaluation methodology applies. All metrics are derived from project requirements, the existing test coverage standard (80%+), and the CLI quality bar established in v0.0.5.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit tests pass (worktree.test.js) | Plan 27-01 verification clause | Direct contract test — confirms each function does what the plan specifies |
| Zero regressions (1,433 existing tests) | Project quality bar, every milestone | Non-negotiable: new modules must not break existing functionality |
| Test coverage >= 80% on lib/worktree.js | PRODUCT-QUALITY.md P0 target | Established project-wide coverage standard for all lib/ modules |
| ESLint zero errors on new files | PRODUCT-QUALITY.md P1 target | Enforced in CI; any lint error will fail the CI gate |
| cmdInitExecutePhase outputs worktree_path and worktree_branch | REQ-40 | Direct requirement: executor agents need these fields to target the correct directory |
| grd-tools worktree CLI responds to create/remove/list | REQ-42 | Direct requirement for manual lifecycle management subcommands |
| MCP descriptors include grd_worktree_* tools | Plan 27-02 must_haves | Ensures worktree commands are accessible via MCP surface (105 tools becomes 108) |
| End-to-end worktree creation during execute-phase | REQ-40 + REQ-41 | Full validation of the infrastructure path; deferred to Phase 31 |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Basic functionality: module loads, CLI responds, output shape correct, no crashes |
| Proxy (L2) | 4 | Unit test suite, regression suite, coverage threshold, lint gate |
| Deferred (L3) | 2 | End-to-end worktree isolation during real execute-phase (Phase 31) |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module exports all four functions

- **What:** lib/worktree.js exists and exports cmdWorktreeCreate, cmdWorktreeRemove, cmdWorktreeList, cmdWorktreeRemoveStale
- **Command:** `node -e "const w = require('./lib/worktree'); console.log(Object.keys(w).join(','))"`
- **Expected:** Output contains all four: `cmdWorktreeCreate,cmdWorktreeRemove,cmdWorktreeList,cmdWorktreeRemoveStale`
- **Failure means:** Module not created or exports incomplete — Plan 27-01 Task 2 was not fully executed

### S2: CLI routes worktree command without "Unknown command" error

- **What:** bin/grd-tools.js dispatches `worktree` as a valid top-level command
- **Command:** `node bin/grd-tools.js worktree list 2>&1`
- **Expected:** Output is valid JSON (not `{"error":"Unknown command: worktree"}`)
- **Failure means:** Plan 27-02 Task 1 CLI routing was not wired

### S3: worktree list returns empty array on a repo with no GRD worktrees

- **What:** cmdWorktreeList returns a valid JSON structure, not an error, when no GRD worktrees exist
- **Command:** `node bin/grd-tools.js worktree list 2>&1`
- **Expected:** `{"worktrees":[],"count":0}` or equivalent (count 0, no error field)
- **Failure means:** cmdWorktreeList crashes on clean state or parses git output incorrectly

### S4: worktree create without --phase returns structured error JSON

- **What:** Missing required parameter produces error JSON, not a crash or unhandled exception
- **Command:** `node bin/grd-tools.js worktree create 2>&1`
- **Expected:** JSON with `error` field; process exits without stack trace
- **Failure means:** Missing validation on required `--phase` parameter

### S5: init execute-phase output contains worktree_path and worktree_branch fields

- **What:** cmdInitExecutePhase JSON output includes the two new worktree fields added in Plan 27-02
- **Command:** `node bin/grd-tools.js init execute-phase 27 2>&1 | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(typeof d.worktree_path, typeof d.worktree_branch)"`
- **Expected:** `string string` (or `object object` if null, but fields must be present as keys)
- **Failure means:** context.js enrichment was not applied — REQ-40 unmet

### S6: No NaN, undefined, or [object Object] in worktree list output

- **What:** cmdWorktreeList output is well-formed JSON with no stringification artifacts
- **Command:** `node bin/grd-tools.js worktree list 2>&1`
- **Expected:** Output parses cleanly with `JSON.parse()` and contains no literal string `"undefined"` or `"[object Object]"`
- **Failure means:** Path or branch field construction has a type coercion bug

### S7: MCP server lists grd_worktree_create, grd_worktree_remove, grd_worktree_list in tools/list

- **What:** The three new MCP tool descriptors appear in the COMMAND_DESCRIPTORS table and surface via tools/list
- **Command:** `node bin/grd-tools.js mcp-tools-list 2>&1 | grep -c "grd_worktree"`
- **Expected:** `3` (three matches: create, remove, list)
- **Failure means:** MCP descriptors were not added in lib/mcp-server.js — Plan 27-02 Task 2 Part B incomplete

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to proxy metrics review.

## Level 2: Proxy Metrics

**Purpose:** Automated validation of correctness and quality.
**IMPORTANT:** These are proxy metrics for the full end-to-end behavior verified in Phase 31. Unit tests verify contract; integration deferred.

### P1: worktree unit test suite passes

- **What:** All tests in tests/unit/worktree.test.js pass, covering all four functions and their edge cases
- **How:** Run Jest on the worktree test file
- **Command:** `npx jest tests/unit/worktree.test.js --no-coverage 2>&1 | tail -5`
- **Target:** `Tests: N passed, N total` with zero failures; minimum 15 test cases (per Plan 27-01 done criteria)
- **Evidence:** The test file is written TDD-first in Plan 27-01 Task 1 to specify all behaviors; passing = implementation matches specification
- **Correlation with full metric:** HIGH — unit tests directly exercise the four functions that constitute the phase deliverable; coverage of all specified behaviors
- **Blind spots:** Tests run with mocked or temp-dir git repos; real-world git state (partial commits, worktree locks from other processes, unusual git versions) not covered
- **Validated:** No — end-to-end behavior validated at Phase 31

### P2: Zero regressions in existing test suite

- **What:** All 1,433 previously passing tests continue to pass after Phase 27 changes
- **How:** Run full Jest suite
- **Command:** `npx jest --no-coverage 2>&1 | tail -5`
- **Target:** `Tests: 1433+ passed` (1,433 minimum, plus any new worktree and context tests from this phase)
- **Evidence:** Project-wide non-negotiable quality bar; every prior milestone has maintained this; regression = integration hazard for downstream phases
- **Correlation with full metric:** HIGH — the existing suite covers all 14 lib/ modules; any cross-module side effect from worktree additions would surface here
- **Blind spots:** Suite does not test actual git subprocess behavior (tests use mocks/fixtures); real git invocation failures not caught
- **Validated:** No — full E2E validation at Phase 31

### P3: Test coverage >= 80% on lib/worktree.js

- **What:** Jest coverage report shows >= 80% line coverage on the new worktree module
- **How:** Run Jest with coverage on the worktree module
- **Command:** `npx jest tests/unit/worktree.test.js --coverage --collectCoverageFrom="lib/worktree.js" 2>&1 | grep "worktree"`
- **Target:** >= 80% line coverage (PRODUCT-QUALITY.md P0 target for all lib/ modules)
- **Evidence:** This is the established coverage floor for all modules introduced since v0.0.5; cleanup.js, gates.js, long-term-roadmap.js all meet this threshold
- **Correlation with full metric:** MEDIUM — coverage measures how much code is exercised by tests; a module can be 100% covered but still incorrect for real git states not exercised in unit tests
- **Blind spots:** Branch coverage may miss error paths for real git failures; tmpdir edge cases on different OS not exercised
- **Validated:** No

### P4: ESLint reports zero errors on new and modified files

- **What:** All new/modified JS files pass ESLint with zero errors and zero warnings above threshold
- **How:** Run ESLint on the changed files
- **Command:** `npx eslint lib/worktree.js bin/grd-tools.js lib/context.js lib/mcp-server.js 2>&1 | tail -5`
- **Target:** No output (all clean) or summary line showing `0 errors, 0 warnings`
- **Evidence:** ESLint is enforced in CI (PRODUCT-QUALITY.md P1); any lint error would fail the CI gate on PR; catching here avoids CI failure
- **Correlation with full metric:** MEDIUM — lint correctness does not guarantee runtime correctness, but code style and obvious static errors are caught; consistent with patterns in all other lib/ modules
- **Blind spots:** ESLint does not catch logical errors, incorrect git argument ordering, or path construction bugs
- **Validated:** No

## Level 3: Deferred Validations

**Purpose:** Full validation requiring an integrated execute-phase pipeline.

### D1: End-to-end worktree creation during actual execute-phase — DEFER-27-01

- **What:** When `execute-phase` runs a plan, it creates a real git worktree at `os.tmpdir()/grd-worktree-{milestone}-{phase}`, executes the plan within that directory, and the worktree is cleaned up on completion
- **How:** Run `/grd:execute-phase` on a test phase in a real repo; verify the worktree directory exists during execution and is removed after; verify plan files land in the worktree directory not the main checkout
- **Why deferred:** This requires the execute-phase command template to be updated to consume `worktree_path`/`worktree_branch` from `cmdInitExecutePhase` and actually call `grd-tools worktree create`. That template update is scoped to Phase 28 (PR Workflow from Worktree) and Phase 31 (Integration). Phase 27 only delivers the infrastructure; wiring it into the execution loop is downstream work.
- **Validates at:** phase-31-integration
- **Depends on:** Phase 28 (execute-phase template updated to create worktree), Phase 31 (full E2E integration test)
- **Target:** Worktree exists at expected path during execution; plan files (PLAN.md, SUMMARY.md) created inside worktree directory; worktree removed after phase completes; `grd-tools worktree list` returns empty after cleanup
- **Risk if unmet:** Core v0.2.0 milestone goal (REQ-40) is unmet — phases run in main checkout, not isolated worktrees; no parallel execution isolation possible; REQ-44 (parallel spawning) is blocked
- **Fallback:** If worktree creation fails in Phase 31 integration, Phase 27 infrastructure can be debugged in isolation using `grd-tools worktree create --phase 27` and the root cause identified from structured JSON error output

### D2: Worktree stale cleanup during crashed session recovery — DEFER-27-02

- **What:** If execute-phase crashes mid-execution (process kill, network loss, etc.), the next session's `grd-tools worktree remove --stale` correctly identifies and removes orphaned worktrees from the previous session without affecting active worktrees
- **How:** Simulate crash by creating a worktree then killing the process; run `grd-tools worktree remove --stale`; verify orphaned worktree is cleaned, active ones untouched
- **Why deferred:** Requires a multi-session crash scenario that cannot be meaningfully simulated in unit tests without flakiness; the behavior depends on OS-level tmpdir persistence and git's worktree lock file mechanism, which varies between git versions
- **Validates at:** phase-31-integration
- **Depends on:** Phase 31 integration testing environment with controlled crash simulation
- **Target:** cmdWorktreeRemoveStale removes all worktrees where path does not exist or directory is empty; does not remove locked worktrees; returns correct count
- **Risk if unmet:** Stale worktrees accumulate in tmpdir across failed sessions, consuming disk space and polluting `git worktree list` output; medium severity, does not block primary flow
- **Fallback:** Manual cleanup via `git worktree prune` and `rm -rf /tmp/grd-worktree-*` documented as a known recovery procedure

## Ablation Plan

**No ablation plan** — Phase 27 implements a single new module (lib/worktree.js) with four lifecycle functions plus integration into three existing files. There are no sub-algorithms or competing implementation strategies to ablate. The four functions are decomposed by lifecycle stage (create / remove / list / remove-stale), not by algorithmic variation.

The one design decision worth noting: `cmdWorktreeRemoveStale` delegates stale detection to path-existence checking (not git's lock file directly). If this proves insufficient in D2 validation, a more robust lock-file-aware implementation would be the natural iteration.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing test suite | 1,433 tests across 27 suites passing | 1,433 passed, 0 failed | Current state (verified 2026-02-19) |
| New worktree tests | 15+ test cases per Plan 27-01 done criteria | >= 15 passed | Plan 27-01 task spec |
| Module coverage | lib/ modules at >= 80% line coverage | >= 80% on lib/worktree.js | PRODUCT-QUALITY.md P0 |
| ESLint | Zero lint errors on all lib/ files | 0 errors on worktree.js, context.js, mcp-server.js | PRODUCT-QUALITY.md P1 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/worktree.test.js     — unit tests for lib/worktree.js (created in Plan 27-01)
tests/unit/context.test.js      — existing + new worktree field tests (updated in Plan 27-02)
```

**How to run full evaluation:**
```bash
# Sanity gate (run first)
node -e "const w = require('./lib/worktree'); console.log(Object.keys(w).join(','))"
node bin/grd-tools.js worktree list
node bin/grd-tools.js init execute-phase 27 | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('worktree_path:', typeof d.worktree_path, 'worktree_branch:', typeof d.worktree_branch)"

# Proxy metrics
npx jest tests/unit/worktree.test.js --no-coverage
npx jest --no-coverage
npx jest tests/unit/worktree.test.js --coverage --collectCoverageFrom="lib/worktree.js"
npx eslint lib/worktree.js bin/grd-tools.js lib/context.js lib/mcp-server.js
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module exports 4 functions | [PASS/FAIL] | | |
| S2: CLI routes worktree command | [PASS/FAIL] | | |
| S3: worktree list returns empty array | [PASS/FAIL] | | |
| S4: create without --phase returns error JSON | [PASS/FAIL] | | |
| S5: init execute-phase has worktree fields | [PASS/FAIL] | | |
| S6: No NaN/undefined in list output | [PASS/FAIL] | | |
| S7: MCP lists 3 grd_worktree_* tools | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: worktree unit tests pass | 15+ tests, 0 failures | | [MET/MISSED] | |
| P2: Zero regressions | 1433+ passed | | [MET/MISSED] | |
| P3: Coverage >= 80% on worktree.js | >= 80% lines | | [MET/MISSED] | |
| P4: ESLint zero errors | 0 errors | | [MET/MISSED] | |

### Ablation Results

N/A — No ablation conditions designed for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-27-01 | End-to-end worktree creation during execute-phase | PENDING | phase-31-integration |
| DEFER-27-02 | Stale worktree cleanup on crash recovery | PENDING | phase-31-integration |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — all 7 checks are directly executable against the deliverables with deterministic expected outputs; no external services required
- Proxy metrics: Well-evidenced — unit tests are TDD-derived from the plan spec (HIGH correlation), regression suite is comprehensive (27 existing test suites), coverage threshold is the established project bar, ESLint is already wired in CI
- Deferred coverage: Comprehensive for what matters — the two deferred items (real execute-phase integration, crash recovery) are correctly classified as requiring Phase 31 integration; no meaningful shortcut exists

**What this evaluation CAN tell us:**
- Whether lib/worktree.js is correctly implemented per its specification (unit tests)
- Whether the new module integrates without breaking any of the 14 existing modules (regression suite)
- Whether the CLI surface is correct and accessible (sanity checks S2-S4, S7)
- Whether the context init enrichment provides the expected fields to executor agents (sanity check S5)
- Whether code quality meets project standards (P3 coverage, P4 lint)

**What this evaluation CANNOT tell us:**
- Whether worktrees are actually used correctly during a real execute-phase run (deferred to Phase 31 — requires execute-phase template wiring)
- Whether worktree paths are accessible to executor agents on non-standard OS tmpdir configurations (requires Phase 31 integration on target environments)
- Whether concurrent worktrees for parallel phases (REQ-42 edge case) work correctly under load (deferred to Phase 30 + Phase 31)
- Whether stale cleanup is robust against git version differences or filesystem edge cases (deferred to Phase 31 — DEFER-27-02)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-19*
