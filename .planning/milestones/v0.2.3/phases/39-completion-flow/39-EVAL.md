# Evaluation Plan: Phase 39 — Completion Flow

**Designed:** 2026-02-21
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** runTestGate, mergeWorktree, discardWorktree, keepWorktree, cleanupWorktree (Plan 01); cmdWorktreeComplete orchestrator with CLI routing (Plan 02)
**Reference papers:** N/A — pure infrastructure/feature phase

## Evaluation Overview

Phase 39 introduces the completion flow for worktree-based phase execution. When a phase finishes inside a git worktree, the user is offered four outcomes: merge (local merge to base branch), pr (push and create a GitHub PR), keep (leave worktree intact), or discard (delete branch and worktree). Before merge or pr, the full test suite runs inside the worktree as a gate; if tests fail, the action is blocked and failure details are returned.

This is an infrastructure feature phase with no experimental components and no ML or quality metrics. All evaluation is behavioral: do the helper functions return the correct result objects, does the orchestrator enforce the test gate, does cleanup run in finally blocks even when errors occur, and does the CLI route the `worktree complete` subcommand correctly?

Plan 01 (Wave 1) delivers five helper functions in `lib/worktree.js` with TDD tests. Plan 02 (Wave 2) delivers `cmdWorktreeComplete` in `lib/worktree.js` and CLI routing in `bin/grd-tools.js`, with comprehensive tests for all four completion paths plus test-gate failure blocking. The deferred validation captures the one thing that cannot be tested at this phase boundary: the end-to-end execute-phase command template (Phase 41) calling `cmdWorktreeComplete` with real-world user interaction.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test suite pass count (1,633 baseline) | STATE.md cumulative total | Zero-regression gate for new feature addition |
| worktree.test.js count (32 baseline) | Pre-execution run | Verify all new helper and orchestrator tests are present |
| Lint error count | eslint.config.js | Enforced by pre-commit hook; must be zero |
| runTestGate return contract | REQ-73, Plan 01 must_haves | Core deliverable — gate before merge/PR |
| cleanupWorktree no-throw guarantee | REQ-74, Plan 01 must_haves | Finally-block safety is a hard correctness requirement |
| mergeWorktree merge-abort on conflict | REQ-72, Plan 01 must_haves | Repo must be left clean when merge fails |
| discardWorktree idempotency | REQ-72, Plan 01 must_haves | Must succeed even when worktree directory is already gone |
| cmdWorktreeComplete test gate enforcement | REQ-73, Plan 02 must_haves | Merge/PR must be blocked when tests fail |
| cmdWorktreeComplete worktree presence after block | REQ-73, Plan 02 must_haves | Worktree must survive a test gate failure (user may fix and retry) |
| cmdWorktreeComplete finally-block cleanup | REQ-74, Plan 02 must_haves | Worktree removed on merge/pr/discard even on error |
| CLI routing for 'worktree complete' | Plan 02 must_haves | grd-tools.js must route the subcommand |
| Integration E2E suite (25 baseline) | worktree-parallel-e2e.test.js | Existing integration layer must not regress |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 10 checks | Functionality, correctness, regression, and contract verification |
| Proxy (L2) | 0 metrics | No meaningful proxy exists for infrastructure feature implementation |
| Deferred (L3) | 1 validation | Full end-to-end execute-phase command consuming cmdWorktreeComplete |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Full test suite — zero regressions

- **What:** All 1,633 existing tests continue to pass after adding Phase 39 functions and CLI routing
- **Command:** `npx jest --no-coverage 2>&1 | tail -6`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 1,633 and zero failures
- **Failure means:** A regression was introduced in `lib/worktree.js`, `bin/grd-tools.js`, or `tests/unit/worktree.test.js`; must be fixed before phase is complete

### S2: worktree.test.js — all helper functions present and passing

- **What:** New tests for `runTestGate`, `cleanupWorktree`, `mergeWorktree`, `discardWorktree`, `keepWorktree`, and `cmdWorktreeComplete` are present and all pass; existing 32 tests continue to pass with zero regressions
- **Command:** `npx jest tests/unit/worktree.test.js --no-coverage 2>&1 | tail -6`
- **Expected:** Tests >= 60 passed (baseline: 32; Plan 01 adds ~17, Plan 02 adds ~11+), zero failures
- **Failure means:** Helper functions are absent from `lib/worktree.js` exports, tests were not added, or a regression exists in existing worktree behavior

### S3: runTestGate returns correct result shape

- **What:** `runTestGate` returns `{ passed, exitCode, stdout, stderr }` for both passing and failing commands; defaults to `npm test` when no testCmd is provided
- **Command:** `node -e "const {runTestGate}=require('./lib/worktree'); const pass=runTestGate(process.cwd(), 'node -e \"process.exit(0)\"'); console.log('passed:', pass.passed, 'exitCode:', pass.exitCode); const fail=runTestGate(process.cwd(), 'node -e \"process.exit(1)\"'); console.log('passed:', fail.passed, 'exitCode:', fail.exitCode);" 2>&1`
- **Expected:** `passed: true exitCode: 0` then `passed: false exitCode: 1`
- **Failure means:** `runTestGate` is not exported, crashes on execution, or does not capture exit code correctly

### S4: cleanupWorktree never throws

- **What:** `cleanupWorktree` returns `{ cleaned, error }` without throwing, even when called with invalid paths or a non-existent cwd
- **Command:** `node -e "const {cleanupWorktree}=require('./lib/worktree'); const result=cleanupWorktree('/nonexistent-dir-12345', '/also/nonexistent'); console.log('cleaned:', result.cleaned); console.log('has error prop:', 'error' in result); console.log('did not throw: true');" 2>&1`
- **Expected:** `cleaned: false` (or true), `has error prop: true`, `did not throw: true` — no uncaught exception
- **Failure means:** `cleanupWorktree` throws instead of absorbing errors, making it unsafe for finally blocks

### S5: mergeWorktree leaves repo in clean state after conflict

- **What:** When `mergeWorktree` encounters a conflict, it calls `git merge --abort` and returns `{ merged: false, error: ... }` without leaving unresolved merge conflicts in the working tree
- **Command:** `npx jest tests/unit/worktree.test.js -t "aborts merge on failure leaving repo in clean state" --no-coverage 2>&1 | tail -5`
- **Expected:** Test passes — `statusResult` does not contain `UU ` (unmerged files marker)
- **Failure means:** Failed merges leave the repository in a mid-merge state, which would block any subsequent git operations

### S6: discardWorktree is idempotent

- **What:** `discardWorktree` returns `{ discarded: true }` even when the worktree directory was already removed before the call
- **Command:** `npx jest tests/unit/worktree.test.js -t "succeeds even when worktree directory is already gone" --no-coverage 2>&1 | tail -5`
- **Expected:** Test passes
- **Failure means:** `discardWorktree` throws or returns `discarded: false` when directory is pre-removed, breaking retry scenarios

### S7: cmdWorktreeComplete blocks merge/pr when test gate fails and preserves worktree

- **What:** When `action=merge` or `action=pr` and the testCmd exits non-zero, `cmdWorktreeComplete` returns `{ blocked: true, reason: 'Test gate failed', test_exit_code: ... }` AND the worktree directory still exists on disk
- **Command:** `npx jest tests/unit/worktree.test.js -t "merge: blocks when test gate fails" --no-coverage 2>&1 | tail -5`
- **Expected:** Test passes — both the `blocked: true` assertion and the `fs.existsSync(wtPath)` assertion pass
- **Failure means:** The test gate is not enforced (merge proceeds despite failing tests) or the worktree is incorrectly cleaned up when tests fail (user cannot fix and retry)

### S8: cmdWorktreeComplete discard path skips test gate

- **What:** When `action=discard`, `cmdWorktreeComplete` removes the worktree without running any test command, returning `{ action: 'discard', discarded: true }`
- **Command:** `npx jest tests/unit/worktree.test.js -t "discard: removes worktree and deletes branch without test gate" --no-coverage 2>&1 | tail -5`
- **Expected:** Test passes — worktree directory does not exist after discard and no test command was invoked
- **Failure means:** Discard path incorrectly runs tests (unnecessary and would fail in many valid discard scenarios) or fails to remove the worktree

### S9: CLI routes 'worktree complete' to cmdWorktreeComplete

- **What:** `bin/grd-tools.js` recognizes `worktree complete` as a valid subcommand and routes it to `cmdWorktreeComplete`; passing `--action missing-action` returns a structured JSON error (not a crash or "unknown subcommand" error)
- **Command:** `node bin/grd-tools.js worktree complete --action invalid --phase 99 --milestone v0.2.0 2>&1`
- **Expected:** Valid JSON output containing `{ "error": "..." }` — not a crash, not "unknown subcommand"
- **Failure means:** The `'complete'` case is missing from `WORKTREE_SUBS` or the routing block in `bin/grd-tools.js`, causing the subcommand to fall through to an error or no-op

### S10: Integration suite still passes

- **What:** The `worktree-parallel-e2e.test.js` integration test suite (25 tests) still passes after Phase 39 changes; no existing integration behaviors are broken
- **Command:** `npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage 2>&1 | tail -5`
- **Expected:** `Tests: 25 passed, 25 total` (or more if Phase 39 adds integration tests)
- **Failure means:** Changes to `lib/worktree.js` exports or `bin/grd-tools.js` routing broke the integration layer; investigate what changed in the common code paths

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Phase 40.

## Level 2: Proxy Metrics

### No Proxy Metrics

**Rationale:** Phase 39 is a pure infrastructure feature implementation. Every correctness requirement has a direct behavioral test: does the function return the specified result object, does the test gate block when it should, does cleanup run even on error, does the CLI route correctly. There is no quality axis to approximate and no experimental hypothesis to validate indirectly. Inventing a proxy metric (e.g., "code coverage percentage" or "function count") would not correlate with the specific behavioral contracts required by REQ-72, REQ-73, and REQ-74.

The per-file coverage thresholds enforced by `jest.config.js` serve as passive coverage floors — if new code is added without tests, coverage may drop below established thresholds and fail the test run. This is an adequate passive gate for an infrastructure phase.

**Recommendation:** Rely entirely on Level 1 sanity checks. The targeted test-name checks (S3-S9) verify the specific contracts that matter for this phase.

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration with Phase 41.

### D1: End-to-end execute-phase command consuming cmdWorktreeComplete — DEFER-39-01

- **What:** A real `/grd:execute-phase` invocation (with worktree isolation enabled) that completes by offering the user the four options (merge/pr/keep/discard), runs the test gate before merge or pr, and executes the chosen action with proper cleanup. Verifies that the command template in `commands/execute-phase.md` correctly calls `grd-tools.js worktree complete --action ...` and that the JSON result is consumed and presented to the user.
- **How:** Run `/grd:execute-phase` on Phase 40 with git isolation enabled; after the phase agent completes, observe the four-option completion prompt; choose each option in separate test runs; verify worktree cleanup, merge result, and PR creation against expectations.
- **Why deferred:** `commands/execute-phase.md` (the command template that calls `grd-tools.js worktree complete`) is Phase 41's deliverable. Phase 39 provides the `cmdWorktreeComplete` function that the command template will call, but the command template itself does not exist yet. Without Phase 41, there is no caller-level integration to test.
- **Validates at:** Phase 41 (command-and-documentation-updates) completion
- **Depends on:** Phase 41 updating `commands/execute-phase.md` to call `worktree complete --action {choice}` after phase execution; Phase 40 settings interview exposing the default completion action preference
- **Target:** All four completion paths produce correct outcomes: merge brings branch into base and removes worktree; pr pushes branch, creates PR, and removes worktree; keep leaves worktree intact; discard removes worktree and deletes branch. Test gate blocks merge/pr when tests fail.
- **Risk if unmet:** The `cmdWorktreeComplete` function interface (flags: `--action`, `--phase`, `--milestone`, `--test-cmd`, `--base`) may not match what Phase 41's command template assumes; this would require a targeted alignment fix before the execute-phase workflow is usable with the new completion flow.
- **Fallback:** Align the CLI flags between `cmdWorktreeComplete` and the Phase 41 command template via a follow-up fix in Phase 41; the underlying helper functions are low-risk since unit tests verify all behavioral contracts.

## Ablation Plan

**No ablation plan** — This phase implements a set of individually necessary, non-overlapping functions. Each helper (`runTestGate`, `mergeWorktree`, `discardWorktree`, `keepWorktree`, `cleanupWorktree`) maps to a specific slice of the completion flow; removing any one of them removes a required user-facing option. The Plan 01 (helpers) / Plan 02 (orchestrator) wave split is already the natural decomposition for isolation testing.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Total tests | Full suite before Phase 39 changes | 1,633 passing | STATE.md + pre-execution run |
| worktree.test.js | Before completion flow helpers and orchestrator tests | 32 tests | Pre-execution run (confirmed) |
| integration (worktree-parallel-e2e) | Cross-module integration before Phase 39 | 25 tests | Pre-execution run (confirmed) |
| Lint errors | Before Phase 39 changes | 0 errors | npm run lint baseline (confirmed) |
| lib/worktree.js exports | Before Phase 39 | 5 functions: cmdWorktreeCreate, cmdWorktreeRemove, cmdWorktreeList, cmdWorktreeRemoveStale, cmdWorktreePushAndPR | worktree.js module.exports |

## Evaluation Scripts

**Location of evaluation code:**

```
tests/unit/worktree.test.js          (existing, extended by Plan 01 Tasks 1-2 and Plan 02 Task 2)
tests/integration/worktree-parallel-e2e.test.js  (existing, must still pass)
```

**How to run full evaluation:**

```bash
# Run all worktree unit tests — zero regression + new helper and orchestrator coverage (S2)
npx jest tests/unit/worktree.test.js --no-coverage

# Run targeted sanity checks for specific contracts (S3-S9)
npx jest tests/unit/worktree.test.js -t "runTestGate" --no-coverage
npx jest tests/unit/worktree.test.js -t "cleanupWorktree" --no-coverage
npx jest tests/unit/worktree.test.js -t "mergeWorktree" --no-coverage
npx jest tests/unit/worktree.test.js -t "discardWorktree" --no-coverage
npx jest tests/unit/worktree.test.js -t "keepWorktree" --no-coverage
npx jest tests/unit/worktree.test.js -t "cmdWorktreeComplete" --no-coverage

# Run integration sanity (S10)
npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage

# Run full suite — zero regression gate (S1)
npx jest --no-coverage

# Lint gate
npm run lint

# CLI routing check — must return structured JSON error, not crash (S9)
node bin/grd-tools.js worktree complete --action invalid --phase 99 --milestone v0.2.0

# runTestGate smoke test (S3)
node -e "const {runTestGate}=require('./lib/worktree'); const pass=runTestGate(process.cwd(), 'node -e \"process.exit(0)\"'); console.log('passed:', pass.passed, 'exitCode:', pass.exitCode); const fail=runTestGate(process.cwd(), 'node -e \"process.exit(1)\"'); console.log('passed:', fail.passed, 'exitCode:', fail.exitCode);"

# cleanupWorktree no-throw check (S4)
node -e "const {cleanupWorktree}=require('./lib/worktree'); const result=cleanupWorktree('/nonexistent-dir-12345', '/also/nonexistent'); console.log('cleaned:', result.cleaned); console.log('has error prop:', 'error' in result); console.log('did not throw: true');"
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Full suite zero regressions | PENDING | | |
| S2: worktree.test.js all helpers + orchestrator | PENDING | | |
| S3: runTestGate result shape | PENDING | | |
| S4: cleanupWorktree never throws | PENDING | | |
| S5: mergeWorktree clean state after conflict | PENDING | | |
| S6: discardWorktree idempotent | PENDING | | |
| S7: cmdWorktreeComplete blocks and preserves worktree | PENDING | | |
| S8: cmdWorktreeComplete discard skips test gate | PENDING | | |
| S9: CLI routes 'worktree complete' | PENDING | | |
| S10: Integration suite still passes | PENDING | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| (none) | — | — | N/A | No proxy metrics for infrastructure phase |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| (none) | — | — | No ablation applicable |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-39-01 | End-to-end execute-phase command consuming cmdWorktreeComplete | PENDING | Phase 41 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**

- Sanity checks: Adequate. Ten concrete, executable checks cover every behavioral claim in Plans 01 and 02. Checks S3 and S4 use direct node invocations to verify function contracts without test scaffolding. Checks S5-S8 use targeted jest test-name filters to verify the specific edge cases that matter (merge conflict recovery, idempotent discard, test gate blocking, test gate bypass for discard). Check S9 verifies CLI routing at the binary level.
- Proxy metrics: None designed — honest absence. For an infrastructure feature with fully-testable behavioral contracts, there is no meaningful proxy. The per-file coverage thresholds in `jest.config.js` serve as passive coverage floors.
- Deferred coverage: Comprehensive for what can be deferred. The one deferred item (end-to-end execute-phase consuming cmdWorktreeComplete) is the natural boundary of Phase 39 — it explicitly requires Phase 41's command template update to be meaningful. The interface contract (`--action`, `--phase`, `--milestone`, `--test-cmd`, `--base` flags) is documented in Plan 02 and tested via S9, minimizing integration risk.

**What this evaluation CAN tell us:**

- Whether `runTestGate` correctly captures stdout/stderr and exit codes for both passing and failing test commands
- Whether `cleanupWorktree` absorbs all errors without throwing (finally-block safety confirmed)
- Whether `mergeWorktree` calls `git merge --abort` on failure and leaves the repository in a clean state
- Whether `discardWorktree` succeeds idempotently when the worktree directory is pre-removed
- Whether `keepWorktree` is a true no-op that leaves the worktree directory intact
- Whether `cmdWorktreeComplete` enforces the test gate for merge and pr actions and blocks with structured output on failure
- Whether `cmdWorktreeComplete` leaves the worktree intact after a test gate failure (user can fix and retry)
- Whether `cmdWorktreeComplete` cleans up the worktree in the finally block for merge and pr paths
- Whether the CLI correctly routes `grd-tools.js worktree complete` to `cmdWorktreeComplete`
- Whether zero regressions were introduced across all 1,633 existing tests

**What this evaluation CANNOT tell us:**

- Whether the execute-phase command template (Phase 41) correctly calls `cmdWorktreeComplete` with the right flags and handles all four completion options at the user interaction level (deferred to Phase 41)
- Whether real GitHub PR creation via `gh pr create` works end-to-end with actual GitHub authentication in the target environment (deferred to Phase 41 manual validation)
- Whether the test gate timeout (5 minutes) is appropriate for real project test suites (deferred to Phase 41 first real execution observation)
- Whether macOS `.worktrees/` symlink resolution behaves correctly under the new project-local path convention (deferred to Phase 39 first real execution; partially inherited from Phase 38 DEFER-38-01)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-21*
