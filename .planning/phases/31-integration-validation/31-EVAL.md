# Evaluation Plan: Phase 31 — Integration & Validation

**Designed:** 2026-02-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Cross-module integration of lib/worktree.js, lib/deps.js, lib/parallel.js, lib/context.js; deferred validation resolution for DEFER-22-01, DEFER-27-01, DEFER-27-02, DEFER-30-01
**Reference artifacts:** 30-EVAL.md, 30-VERIFICATION.md, STATE.md (deferred validation table), ROADMAP.md (Phase 31 success criteria)

## Evaluation Overview

Phase 31 is an integration phase. It does not introduce new features — it validates that the four modules built across Phases 27-30 (worktree infrastructure, PR workflow, dependency analysis, parallel execution) work correctly as an assembled pipeline. The primary output is `tests/integration/worktree-parallel-e2e.test.js` (Plan 01) and the verification report with state updates (Plan 02).

What can be verified in this phase: cross-module correctness of the worktree lifecycle pipeline in a real git environment, structural equivalence between sequential and parallel execution contexts, stale worktree cleanup under simulated crash conditions, dependency graph integration with parallel context building, zero regressions against the 1,552 baseline test count, and resolution of three of the four outstanding deferred validations (DEFER-22-01, DEFER-27-01, DEFER-27-02).

What cannot be verified in this phase: actual Claude Code teammate agent spawning (DEFER-30-01 requires the Claude Code Teams API at runtime), real GitHub PR creation (requires GitHub auth and a network-accessible remote), and production-like concurrent execution across multiple real agent sessions. These constraints are documented clearly in DEFER-30-01's partial resolution status.

This phase has no external research papers. All metrics trace to ROADMAP.md success criteria, STATE.md deferred validation table, and plan must_haves.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| E2E single-phase worktree pipeline | ROADMAP.md Phase 31 success criterion #1 | Resolves DEFER-22-01 — end-to-end branching workflow |
| E2E parallel execution context | ROADMAP.md Phase 31 success criterion #2 | Resolves DEFER-30-01 at module level |
| Sequential/parallel context equivalence | ROADMAP.md Phase 31 success criterion #3 | Validates fallback produces identical artifact structure |
| Zero regressions on 1,552 baseline | ROADMAP.md Phase 31 success criterion #4 | Regression is the primary risk of new integration tests |
| Test count >= 1,572 (20+ new) | ROADMAP.md Phase 31 success criterion #5 + 31-01-PLAN.md | Guards against thin integration coverage |
| DEFER-22-01 resolved | STATE.md deferred validation table | End-to-end git branching from Phase 22 |
| DEFER-27-01 resolved | Phase 27 implicit deferred (worktree in real execute context) | Execute-phase context fields match real worktree paths |
| DEFER-27-02 resolved | Phase 27 implicit deferred (stale cleanup) | Crash recovery via cmdWorktreeRemoveStale |
| DEFER-30-01 partially resolved | STATE.md deferred validation table | Module-level parallel execution validated; spawning deferred |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 checks | Integration test file validity, imports, crash-free suite run |
| Proxy (L2) | 5 metrics | Functional correctness of cross-module E2E flows and regressions |
| Deferred (L3) | 1 validation | Real Claude Code teammate spawning remains untestable |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Integration test file exists and is syntactically valid JavaScript

- **What:** `tests/integration/worktree-parallel-e2e.test.js` exists and can be parsed without syntax errors
- **Command:** `node --check /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/worktree-parallel-e2e.test.js && echo ok`
- **Expected:** Prints `ok` with exit code 0; no syntax errors
- **Failure means:** Test file was not created or has a syntax error that blocks loading

### S2: All required module imports resolve

- **What:** The integration test file imports from lib/worktree.js, lib/deps.js, lib/parallel.js, and lib/context.js without "MODULE_NOT_FOUND" errors
- **Command:** `node -e "require('./tests/integration/worktree-parallel-e2e.test.js')" 2>&1 | head -5` (run from project root `/Users/edward.seo/dev/private/project/harness/GetResearchDone`)
- **Expected:** Either silent (Jest re-exports make direct require unusual) or an error that is NOT "Cannot find module" — a Jest environment error is acceptable, a missing module error is not
- **Failure means:** One of the required modules (worktree.js, deps.js, parallel.js, context.js) is not importable or was not linked correctly in the test file

### S3: Integration test file has minimum line count (completeness guard)

- **What:** The integration test file contains at least 200 lines (31-01-PLAN.md artifact requirement)
- **Command:** `wc -l /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/worktree-parallel-e2e.test.js | awk '{print $1}'`
- **Expected:** Line count >= 200
- **Failure means:** Integration test file is a stub; 6 describe blocks with 20+ tests cannot fit in fewer than 200 lines

### S4: Integration test file has all 6 required describe blocks

- **What:** All 6 cross-module describe blocks are present by name
- **Command:** `grep -c "describe(" /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/worktree-parallel-e2e.test.js`
- **Expected:** Count >= 6
- **Failure means:** One or more of the required E2E describe blocks is missing (worktree lifecycle, parallel execution, sequential fallback, stale cleanup, dependency integration, status tracker)

### S5: Full test suite runs without crash (all test suites load)

- **What:** `npx jest` completes without uncaught exceptions or module load failures (separate from individual test pass/fail)
- **Command:** `npx jest --no-coverage 2>&1 | grep -E "Test Suites:|Tests:" | head -2`
- **Expected:** Both "Test Suites:" and "Tests:" lines appear; no "FATAL ERROR" or "Cannot find module" in output
- **Failure means:** New integration test file causes a crash during module loading that prevents the suite from reporting results

### S6: Existing 30 test suites all report (no suite removed or renamed)

- **What:** All 30 previously passing test suites continue to load and report results
- **Command:** `npx jest --no-coverage 2>&1 | grep "Test Suites:" | grep -oE "[0-9]+ passed"`
- **Expected:** 30+ passed (30 existing + 1 new integration suite = 31 minimum)
- **Failure means:** A previously passing suite was broken or renamed by the integration test file

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Plan 02 (verification report).

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of integration correctness and deferred validation resolution via automated test assertions with real git repos.
**IMPORTANT:** These proxy metrics operate on real git repos in temp directories and exercise actual module I/O. Correlation with full production behavior is higher than unit-test-only proxies from prior phases, but real teammate spawning remains untested.

### P1: Cross-module E2E pipeline — worktree create to cleanup

- **What:** `cmdWorktreeCreate` → work in worktree → `cmdWorktreePushAndPR` (push succeeds) → `cmdWorktreeRemove` → worktree gone from disk and `git worktree list`
- **How:** Integration tests in "E2E: Single-phase worktree execution pipeline" describe block, using a real temp git repo with a bare remote clone
- **Command:** `npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage --verbose 2>&1 | grep -E "Single-phase|PASS|FAIL|✓|✗|×"`
- **Target:** All tests in the "E2E: Single-phase worktree execution pipeline" describe block pass; `push_succeeded: true` in cmdWorktreePushAndPR output
- **Evidence:** Resolves DEFER-22-01 — "End-to-end git branching workflow validation." The test exercises the full Phase 22 deferred scenario: init → branch → work → push. The only gap (PR creation via gh CLI) is documented, not hidden.
- **Correlation with full metric:** HIGH — test uses a real git repo with a real bare remote. Push is the critical path; gh CLI auth gap is a known and documented limitation.
- **Blind spots:** gh CLI PR creation requires GitHub auth and is not tested. Network-accessible remotes are not tested. Concurrent execution by multiple Claude agents in the same repo is not tested.
- **Validated:** No — DEFER-22-01 resolution status confirmed in 31-02 verification report

### P2: Parallel phase context — separate paths, no collision

- **What:** `buildParallelContext` for two independent phases returns different `worktree_path` and `worktree_branch` values per phase; `cmdWorktreeCreate` called for both phases in a real git repo produces two distinct, accessible worktree directories
- **How:** Integration tests in "E2E: Parallel execution of independent phases" describe block
- **Command:** `npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage --verbose 2>&1 | grep -E "Parallel execution|PASS|FAIL|✓|✗|×"`
- **Target:** All tests in the "E2E: Parallel execution of independent phases" describe block pass; both worktrees appear in `cmdWorktreeList` output with distinct paths and branches
- **Evidence:** Resolves DEFER-30-01 at module level. The Phase 30 EVAL.md states: "Does not test against a real parsed ROADMAP.md; depends_on parsing errors in lib/deps.js could cause wrong graphs" — this integration test uses a real fixture with real dep parsing, closing that proxy gap.
- **Correlation with full metric:** MEDIUM-HIGH — module-level parallel context is fully validated. The gap is teammate agent spawning, which requires Claude Code runtime.
- **Blind spots:** Actual concurrent execution by two parallel Claude agents is not testable. `cmdInitExecuteParallel` mode='parallel' path is validated structurally; the Teams API call is not made.
- **Validated:** No — DEFER-30-01 marked as PARTIALLY RESOLVED (runtime gap documented)

### P3: Sequential vs parallel context structural equivalence

- **What:** Both `mode:'sequential'` (backend=codex) and `mode:'parallel'` (backend=claude) contexts contain the identical per-phase structure: `phase_number`, `phase_name`, `worktree_path`, `worktree_branch`, `plans`, `plan_count`; and `status_tracker` with identical phase keys and `'pending'` status. The ONLY differences are `mode`, `fallback_note`, and `backend_capabilities`.
- **How:** Integration tests in "E2E: Sequential fallback equivalence" describe block comparing both contexts side by side
- **Command:** `npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage --verbose 2>&1 | grep -E "Sequential fallback|PASS|FAIL|✓|✗|×"`
- **Target:** All tests in the "E2E: Sequential fallback equivalence" describe block pass; structural diff confirms only three fields differ between modes
- **Evidence:** ROADMAP.md Phase 31 success criterion #3: "Sequential fallback produces identical artifacts to parallel execution (same PRs, same branch structure)." Structural equivalence at the context level is the testable proxy for output artifact equivalence.
- **Correlation with full metric:** MEDIUM — structural JSON equivalence does not guarantee identical execution outcomes if the command template behaves differently based on mode. This is the best available proxy without a real execution runtime.
- **Blind spots:** Does not validate that the `/grd:execute-phase` command template actually produces the same PRs and branches on both paths. Command template behavior is untestable in the test environment.
- **Validated:** No — full artifact equivalence deferred to first real production use

### P4: Stale worktree cleanup under simulated crash

- **What:** Creating a worktree, then deleting its directory from disk (simulating a crash), then calling `cmdWorktreeRemoveStale` successfully detects and removes the orphaned git registration; `cmdWorktreeList` returns empty. Partially stale scenario: only the deleted worktree is removed, the live one survives.
- **How:** Integration tests in "E2E: Stale worktree cleanup" describe block using a real temp git repo with manual directory deletion
- **Command:** `npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage --verbose 2>&1 | grep -E "Stale worktree|PASS|FAIL|✓|✗|×"`
- **Target:** All tests in "E2E: Stale worktree cleanup" pass; stale-only removal does not affect live worktrees
- **Evidence:** Resolves DEFER-27-02 — "Stale worktree cleanup on crashed session recovery." The Phase 27 EVAL.md noted this as a deferred validation. The simulated crash (manual directory deletion) is the closest testable proxy for a real crash scenario.
- **Correlation with full metric:** HIGH — the stale detection mechanism (`git worktree list` showing a path that no longer exists on disk) is exactly what a real crash produces. The only gap is OS-level crash vs. manual deletion, which should behave identically for git.
- **Blind spots:** Does not test recovery when a process lock file was left by the crash (if locking is implemented). Does not test concurrent stale removal (two processes calling removeStale simultaneously).
- **Validated:** No — DEFER-27-02 resolution status confirmed in 31-02 verification report

### P5: Zero regressions and minimum integration test count

- **What:** (a) All 1,552 previously passing tests continue to pass. (b) Total test count is >= 1,572 (1,552 baseline + 20 minimum new integration tests from Plan 01 success criteria).
- **How:** Full test suite run after Plan 01 completion
- **Command:** `npx jest --no-coverage 2>&1 | grep "Tests:"`
- **Target:** `Tests: 1572+ passed, 0 failed` (exact count depends on integration test implementation; minimum 1,572)
- **Evidence:** ROADMAP.md Phase 31 success criteria #4 (1,433+ tests, now 1,552 actual) and #5 (40+ new tests across Phases 27-30 already at 119; Phase 31 adds integration layer). STATE.md records baseline of 1,552 after Phase 30-02.
- **Correlation with full metric:** HIGH for regression detection (direct count), MEDIUM for coverage quality (count without assertion quality assessment)
- **Blind spots:** Test count alone does not catch weak assertions. Combined with P1-P4 passing, the assertions are structurally meaningful (cross-module with real git repos).
- **Validated:** No — recorded in 31-02-SUMMARY.md after Plan 01 execution

## Level 3: Deferred Validations

**Purpose:** Full validation requiring real Claude Code teammate runtime, GitHub auth, or production concurrency not available in the test environment.

### D1: Real Claude Code teammate spawning — DEFER-30-01 (runtime gap)

- **What:** When mode is `'parallel'`, the `/grd:execute-phase` command template actually invokes the Claude Code Teams API, spawning two teammate agents targeting separate worktrees. Both agents execute their assigned phases independently. A failure in one agent does not abort the other.
- **How:** Execute `/grd:execute-phase 27 29` (or two independent phases in a real v0.2.0-milestone project) on a Claude Code backend with `use_teams:true` enabled in config. Observe two teammate conversations appearing, each operating in a separate worktree directory. Both phases complete and branches are pushed.
- **Why deferred:** The Teams API is not invocable in the Jest test environment. `cmdInitExecuteParallel` produces the correct JSON context (validated at Level 2), but the command template that reads this JSON and calls the Teams API is the `/grd:execute-phase` slash command — a markdown template that runs in a live Claude Code session. No automated test framework can simulate that runtime.
- **Validates at:** First real production use of `/grd:execute-phase` with multiple independent phases on a Claude Code backend
- **Depends on:** Active Claude Code session with `use_teams:true` in `.planning/config.json`; a project with two truly independent phases in ROADMAP.md; Phase 27 worktree infrastructure operational
- **Target:** Two teammate agents spawn and operate concurrently in separate worktrees; both phases complete; `status_tracker` entries transition from `pending` → `complete` (or `failed` without aborting the other)
- **Risk if unmet:** The `/grd:execute-phase` command template may need updates to read `cmdInitExecuteParallel` JSON output and invoke the Teams API correctly. Budget: 1 additional plan (31-03-PLAN.md or Phase 32 hotfix) to wire the template.
- **Fallback:** If Claude Code Teams API is unavailable, validate sequential fallback path manually: run two independent phases sequentially and confirm branch + PR structure matches the parallel path.

## Ablation Plan

**No ablation plan** — Phase 31 validates an assembled pipeline, not a new algorithm or component. There are no sub-components to isolate against each other. The meaningful isolation has already been done in unit tests for each individual module (Phases 27-30). The integration tests specifically validate inter-module wiring, which by definition cannot be ablated without defeating the purpose of the tests.

The closest meaningful ablation — "what if we skip the dependency validation before building parallel context?" — is covered by the error-path integration tests in P2: the "E2E: Parallel execution of independent phases" block tests both the valid path (independent phases accepted) and the invalid path (dependent phases rejected) at integration level.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test suite before Phase 31 | All passing tests after Phase 30-02 | 1,552 tests passing | STATE.md performance metrics |
| Test suite after Phase 31 | Baseline + new integration tests | >= 1,572 tests passing | 31-01-PLAN.md success criteria (20+ new tests) |
| Integration test file line count | Implementation completeness guard | >= 200 lines | 31-01-PLAN.md must_haves.artifacts |
| Integration describe blocks | Coverage completeness guard | >= 6 blocks | 31-01-PLAN.md task specification |
| Deferred validations resolved | Validations closed by Phase 31 | 3 fully + 1 partially | STATE.md + ROADMAP.md Phase 31 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/integration/worktree-parallel-e2e.test.js  (created by Plan 01)
```

**How to run integration tests only:**
```bash
npx jest /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/worktree-parallel-e2e.test.js --no-coverage --verbose
```

**How to run full suite (regression check):**
```bash
npx jest --no-coverage 2>&1 | tail -5
```

**How to check integration file line count:**
```bash
wc -l /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/worktree-parallel-e2e.test.js
```

**How to check describe block count:**
```bash
grep -c "describe(" /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/worktree-parallel-e2e.test.js
```

**How to check individual E2E sections pass:**
```bash
npx jest /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/worktree-parallel-e2e.test.js --no-coverage --verbose 2>&1 | grep -E "PASS|FAIL|✓|✗|×|describe"
```

**How to verify deferred validation test evidence (for P1-P4):**
```bash
npx jest /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/worktree-parallel-e2e.test.js --no-coverage --verbose 2>&1 | grep -E "Single-phase|Parallel execution|Sequential fallback|Stale worktree|Dependency graph|Status tracker"
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: File exists and parses | - | - | |
| S2: All module imports resolve | - | - | |
| S3: File >= 200 lines | - | - | |
| S4: >= 6 describe blocks | - | - | |
| S5: Full suite runs without crash | - | - | |
| S6: All 30+ suites report | - | - | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: E2E worktree lifecycle (single-phase) | All tests pass, push_succeeded:true | - | - | |
| P2: Parallel context — separate paths, no collision | All tests pass, 2 distinct worktrees | - | - | |
| P3: Sequential/parallel structural equivalence | All tests pass, only 3 fields differ | - | - | |
| P4: Stale worktree cleanup (simulated crash) | All tests pass, selective removal works | - | - | |
| P5: Zero regressions + >= 1,572 total tests | 0 failures, count >= 1,572 | - | - | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-22-01 | E2E git branching workflow | PENDING → RESOLVED (via P1) | Phase 31 Plan 01 |
| DEFER-27-01 | Worktree in real execute-phase context | PENDING → RESOLVED (via P1) | Phase 31 Plan 01 |
| DEFER-27-02 | Stale cleanup on crash recovery | PENDING → RESOLVED (via P4) | Phase 31 Plan 01 |
| DEFER-30-01 | Real teammate spawning on Claude Code | PENDING → PARTIALLY RESOLVED | First production use |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 6 checks cover file validity, imports, line count, describe block count, suite loading, and suite count. All are mechanically verifiable in under 30 seconds.
- Proxy metrics: Well-evidenced — P1 through P4 each directly address a named deferred validation using real git repos. Correlation with full metric is HIGH for P1 (real push to bare remote), HIGH for P4 (real directory deletion), and MEDIUM-HIGH for P2-P3 (module-level validation of context structure). The one honest gap (Teams API) is explicitly classified as Deferred (L3), not hidden.
- Deferred coverage: Appropriate — exactly one deferred item remains (DEFER-30-01 runtime gap). Three of four outstanding deferred validations are closed by this phase's integration tests. The remaining gap has clear fallback documentation and low risk (sequential path already validated).

**What this evaluation CAN tell us:**
- Whether the four v0.2.0 modules (worktree, deps, parallel, context) work correctly as an integrated pipeline with real git repos
- Whether worktree creation, listing, push, and removal work in sequence without leaving orphaned state
- Whether the parallel context correctly assigns distinct, non-colliding worktree paths and branches to independent phases
- Whether sequential and parallel mode produce structurally identical per-phase context (same fields, same status_tracker structure)
- Whether stale worktree detection and cleanup works under the most common crash scenario (directory deleted, git registration orphaned)
- Whether adding 20+ integration tests causes any regressions in the 1,552-test baseline

**What this evaluation CANNOT tell us:**
- Whether Claude Code's Teams API actually spawns two agents when given mode='parallel' context (requires live Claude Code session)
- Whether real concurrent agent execution maintains isolation when both agents write to their respective worktrees simultaneously (requires live parallel execution)
- Whether the `/grd:execute-phase` command template correctly reads `cmdInitExecuteParallel` JSON and invokes the Teams API (command template behavior is not testable in Jest)
- Whether `status_tracker` transitions (pending → running → complete/failed) are triggered correctly by the orchestrator during real execution (status initialization tested; transition logic in command template untested)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-19*
