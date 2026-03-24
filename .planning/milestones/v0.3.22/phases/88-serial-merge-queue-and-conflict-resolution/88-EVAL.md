# Evaluation Plan: Phase 88 — Serial Merge Queue and Conflict Resolution

**Designed:** 2026-03-24
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** `createMergeQueue` FIFO primitive, restructured `runPostPhasePipeline` with queue parameter, concurrent wave loop, enhanced `buildConflictResolvePrompt` with phase context injection, enriched conflict-halt reporting
**Reference papers:** N/A — internal software implementation against REQ-165 and REQ-166

## Evaluation Overview

Phase 88 delivers two related but independent infrastructure improvements to `lib/autopilot.ts`. Plan 88-01 introduces a `createMergeQueue()` FIFO serialization primitive and restructures the autopilot wave loop so that post-phase pipelines (simplify, PR creation, code review) run concurrently across phases while the rebase+merge step is serialized through the shared queue. Plan 88-02 enriches `buildConflictResolvePrompt()` with phase goal (from ROADMAP.md), plan summaries (from PLAN.md), conflicting file diffs, and explicit preserve-both-versions instructions, and improves the conflict-halt message to include the affected files and manual resolution steps.

The deliverable is split: new runtime code in `lib/autopilot.ts` plus new unit tests in `tests/unit/autopilot.test.ts`. Because this is infrastructure — not a user-facing feature — there are no external benchmark metrics. Quality is assessed through TypeScript compilation, lint cleanliness, unit test pass rates, coverage thresholds, and structural code inspection. Both plans run in Wave 1 with no inter-plan dependency.

The existing `runPostPhasePipeline` code (lines 421–521 in `lib/autopilot.ts`) and the autopilot wave loop (around line 1246) provide the baseline. The current `buildConflictResolvePrompt` is a one-liner stub (line 374–376). Neither `createMergeQueue` nor a `mergeQueue` parameter exist before phase execution. The evaluation therefore has clear before/after boundaries.

Proxy confidence is HIGH for correctness of the serialization primitive (unit tests directly exercise timing semantics) and MEDIUM for the conflict prompt enhancement (tests verify string content but cannot verify Claude subprocess behavior at runtime).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | `tsconfig.json` + `tsc --noEmit` | New code and tests are TypeScript — compile errors block execution |
| ESLint clean | `.eslintrc` + `npm run lint` | Pre-commit hook; failures block commits |
| `createMergeQueue` unit tests pass | Plan 88-01 Task 2 spec | Directly exercises FIFO ordering, error isolation, concurrent enqueue |
| `buildConflictResolvePrompt` unit tests pass | Plan 88-02 Task 2 spec | Directly verifies prompt content requirements from REQ-166 |
| Line coverage >= 83% for `lib/autopilot.ts` | `jest.config.js` locked threshold | Project quality gate; new code must not drop coverage |
| Function coverage >= 93% | `jest.config.js` locked threshold | `createMergeQueue` is a new exported function — must be covered |
| Branch coverage >= 76% | `jest.config.js` locked threshold | Error isolation and fallback paths add new branches |
| No regressions in existing tests | Standard requirement | 3 existing `runPostPhasePipeline` tests + 4 prompt-builder tests must still pass |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 4 | Compilation, lint, crash-free test run, structural code inspection |
| Proxy (L2) | 6 | Coverage thresholds, targeted test-block pass rates, structural assertions, regression check |
| Deferred (L3) | 2 | Real parallel execution behavior, real conflict resolution subprocess |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compilation

- **What:** `lib/autopilot.ts` and `tests/unit/autopilot.test.ts` compile with no type errors after phase execution
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check`
- **Expected:** Exit code 0, no errors printed
- **Failure means:** New code has a type error — wrong interface, missing export, invalid argument type in the new `mergeQueue` parameter or enhanced `buildConflictResolvePrompt` signature. Fix before proceeding.

### S2: ESLint Clean

- **What:** `lib/` and `bin/` directories produce no lint errors or warnings after modifications
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint`
- **Expected:** Exit code 0, no output
- **Failure means:** Code style violation in `lib/autopilot.ts` — common causes: unused variable (e.g., from destructuring opts), `any` type slipping into the queue generic, or missing `'use strict'` handling.

### S3: Single-File Test Run (No Crash)

- **What:** The autopilot test file loads and Jest completes without setup/teardown crashes
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --no-coverage 2>&1 | tail -10`
- **Expected:** Output contains a `Tests:` summary line, exit code 0, no uncaught exceptions or timeout panics
- **Failure means:** Bad mock setup, missing import of `createMergeQueue`, or temp-directory teardown failure in new tests. Diagnose with `--verbose --runInBand`.

### S4: Structural Code Inspection — createMergeQueue Exported and mergeQueue Parameter Present

- **What:** `lib/autopilot.ts` exports `createMergeQueue` and `runPostPhasePipeline` accepts an optional `mergeQueue` parameter
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && grep -n "createMergeQueue\|mergeQueue" lib/autopilot.ts`
- **Expected:** At minimum four matches: the factory function definition, the `MergeQueue` interface, the `mergeQueue?` opts field in `runPostPhasePipeline`, and the `module.exports` line
- **Failure means:** Plan 88-01 was only partially implemented — function exists but is not wired in, or is not exported.

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and quality.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full runtime evaluation. Results should be treated with appropriate skepticism for the subprocess/git interaction paths.

### P1: createMergeQueue Unit Tests — Serialization and FIFO Correctness (REQ-165)

- **What:** The `createMergeQueue` describe block verifies FIFO ordering, concurrent enqueue, error isolation, and immediate single-item execution
- **How:** Run Jest filtered to the new describe block
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "createMergeQueue" --no-coverage --verbose`
- **Target:** 4 or more passing tests covering: FIFO order (array order matches enqueue order), concurrent enqueue (multiple simultaneous enqueue calls still serialize), error isolation (second function runs after first throws), single-item immediate execution
- **Evidence:** Plan 88-01 Task 2 specifies exactly these 4 scenarios; FIFO via promise-chain serialization is deterministic and testable with real `setTimeout` delays (10–50ms per plan instruction)
- **Correlation with full metric:** HIGH — the promise-chain implementation is self-contained and its serialization behavior is fully observable in unit tests without integration
- **Blind spots:** Does not verify the queue behaves correctly under extremely high concurrency (100+ concurrent enqueues) or when `fn` hangs indefinitely; does not verify behavior when the same queue instance is used across `runPostPhasePipeline` calls as done in the wave loop
- **Validated:** No — real parallel phase execution deferred to D1

### P2: buildConflictResolvePrompt Unit Tests — Content Correctness (REQ-166)

- **What:** The `buildConflictResolvePrompt` describe block verifies that the enriched prompt contains the phase goal, plan summary, conflicting file list, both-versions instruction, and falls back gracefully on missing context
- **How:** Run Jest filtered to the describe block
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "buildConflictResolvePrompt" --no-coverage --verbose`
- **Target:** 6 or more passing tests covering: phase goal from ROADMAP.md, plan summary from PLAN.md, conflicting file list, graceful fallback on missing ROADMAP.md, "PRESERVING CHANGES FROM BOTH VERSIONS" text present, halt message with file list and manual steps
- **Evidence:** Plan 88-02 Task 2 specifies exactly these 6 scenarios; the prompt content requirements come directly from REQ-166
- **Correlation with full metric:** MEDIUM — tests verify string content injected into the prompt but cannot verify that a real Claude subprocess receiving the prompt behaves correctly
- **Blind spots:** Does not test prompt behavior when `execGit` for conflict diff fails or returns empty output; does not test truncation when more than 5 conflicting files are present (plan cap)
- **Validated:** No — real subprocess prompt effectiveness deferred to D2

### P3: Coverage Thresholds Met for lib/autopilot.ts

- **What:** Line, function, and branch coverage for `lib/autopilot.ts` remain at or above locked thresholds after adding `createMergeQueue` and the enhanced `buildConflictResolvePrompt`
- **How:** Run Jest with `--coverage` on the autopilot test file
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --coverage --coverageReporters=text 2>&1 | grep "autopilot.ts"`
- **Target:** lines >= 83%, functions >= 93%, branches >= 76% (locked in `jest.config.js`)
- **Evidence:** `jest.config.js` threshold block for `./lib/autopilot.ts` — these are the project's standing quality gates. `createMergeQueue` is a new exported function (adds to function count); the fallback branches in the enhanced prompt builder add new branch coverage requirements.
- **Correlation with full metric:** HIGH — coverage thresholds are the project's primary quality signal for this deliverable type
- **Blind spots:** A test that calls `createMergeQueue` without asserting timing behavior adds coverage without confidence in serialization; coverage does not guarantee assertion quality
- **Validated:** No — CI confirmation deferred to D1

### P4: Existing runPostPhasePipeline Tests Still Pass (No Regression)

- **What:** The 3 existing `runPostPhasePipeline` tests continue to pass after the function signature is extended with the optional `mergeQueue` parameter
- **How:** Run Jest filtered to the describe block
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "runPostPhasePipeline" --no-coverage --verbose`
- **Target:** All 3 existing tests pass; no tests change from pass to fail; the new tests added by plan 88-02 Task 2 (halt message test) also pass
- **Evidence:** The `mergeQueue` parameter is optional — existing call sites pass no argument, so backward compatibility is a compile-time guarantee. The runtime behavior of steps 1–3 is unchanged. The existing tests do not exercise the rebase step (they fail at simplify or create-pr), so step 4 changes do not affect them.
- **Correlation with full metric:** HIGH — direct regression measurement
- **Blind spots:** Existing tests do not exercise the new concurrent wave loop behavior; they only test the function in isolation
- **Validated:** No — full regression suite check is P5

### P5: Full Autopilot Test Suite — No Cross-File Regressions

- **What:** The entire `tests/unit/autopilot.test.ts` file and the rest of the test suite pass without any failures
- **How:** Run full test suite
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test 2>&1 | tail -20`
- **Target:** All test suites pass; coverage thresholds met across all files; no threshold failures
- **Evidence:** Standard non-regression requirement; tests must not introduce mock leakage between describe blocks or affect other test files
- **Correlation with full metric:** HIGH — direct measurement of test health
- **Blind spots:** npm test uses `--runInBand` behavior by default if configured; parallel test execution ordering differences would only appear in CI
- **Validated:** No — CI is deferred to D1

### P6: Wave Loop Uses Concurrent Launch — Structural Assertion

- **What:** The autopilot wave loop in `lib/autopilot.ts` launches post-pipelines concurrently rather than sequentially awaiting each one
- **How:** Grep for `Promise.all` or `map.*runPostPhasePipeline` pattern near the wave loop section; verify the sequential `await runPostPhasePipeline` inside the `for` loop is replaced
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && grep -n "Promise\.all\|pipelinePromises\|runPostPhasePipeline" lib/autopilot.ts`
- **Target:** At minimum: one `Promise.all` call referencing pipeline promises, at least one `map` call referencing `runPostPhasePipeline`, and no `await runPostPhasePipeline` inside the sequential `for` loop at line ~1250
- **Evidence:** Plan 88-01 Task 1 step 5 specifies this exact restructuring with `{ phaseNum, promise }` tuples and `Promise.all(pipelinePromises)`. The current code at line 1250 shows the old sequential pattern that must be replaced.
- **Correlation with full metric:** MEDIUM — structural presence confirms intent but does not verify runtime timing behavior
- **Blind spots:** The `Promise.all` could technically be present but still await each pipeline sequentially inside (e.g., if the array is built sequentially). A structural check is necessary but not sufficient.
- **Validated:** No — runtime concurrency behavior deferred to D1

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring real parallel execution, real git repositories, or real Claude subprocess invocation.

### D1: Real Parallel Phase Execution — Merge Serialization Verified — DEFER-88-01

- **What:** When two or more phases complete execution concurrently, their rebase+merge steps execute one at a time in arrival order, while simplify/PR/review steps run in parallel. No rebase race condition occurs.
- **How:** Run autopilot with a milestone containing 2–3 phases that can execute in parallel. Observe log output to confirm: (a) simplify/review steps from different phases interleave, (b) rebase+merge steps do not overlap, (c) both PRs merge cleanly to main.
- **Why deferred:** Requires a real git repository with a real main branch, real worktrees, and real elapsed time. Unit tests mock `spawnClaudeAsync` and `execGit`, so timing behavior cannot be verified without integration.
- **Validates at:** First autopilot run with parallel phases after merge (operational verification)
- **Depends on:** Phase 88 merged to main, a milestone with >= 2 parallel-eligible phases ready for execution
- **Target:** Zero "conflict during concurrent rebase" errors; log shows interleaved simplify/review steps + sequential rebase steps; all phases merge successfully
- **Risk if unmet:** The `Promise.all` restructuring may have a bug where pipelines are accidentally still sequential, OR the queue implementation has a race in its own promise-chain construction. Budget: 1 debugging iteration. The old sequential behavior (before phase 88) is still available as a fallback by reverting to `await runPostPhasePipeline` inside the loop.
- **Fallback:** Revert wave loop to sequential if concurrent mode introduces failures; the `createMergeQueue` primitive itself remains useful for future use.

### D2: Real Conflict Resolution Subprocess — Prompt Effectiveness — DEFER-88-02

- **What:** When a real git rebase produces merge conflicts, the `claude -p` subprocess launched by `spawnStep` receives the enriched prompt (with actual diff output, actual ROADMAP.md goal, actual PLAN.md summary), and either resolves conflicts successfully or exits non-zero with an actionable halt message.
- **How:** Manually trigger a merge conflict scenario on a development branch. Observe that: (a) the subprocess prompt contains the expected sections, (b) Claude successfully resolves the conflict and runs `git rebase --continue`, OR (c) on failure, the halt log message identifies the conflicting files and manual steps.
- **Why deferred:** Requires a real git conflict, a real Claude session running `claude -p`, and the ability to inspect the subprocess's prompt at runtime. Unit tests mock `execGit` and cannot produce real conflict markers.
- **Validates at:** First real merge conflict encountered during autopilot operation after merge
- **Depends on:** Phase 88 merged to main; a real conflict occurring during autopilot execution (or a deliberately crafted test scenario)
- **Target:** Subprocess prompt contains "Phase Goal:", "Plan Summary:", at least one `### <filename>` diff section, "PRESERVING CHANGES FROM BOTH VERSIONS"; on resolution failure the halt log contains the file list and `git rebase main` / `git rebase --continue` manual steps
- **Risk if unmet:** Context injection may fail silently (e.g., ROADMAP.md parse returns empty string on a different format). The prompt will still be valid (fallback text is specified in plan) but less effective. Budget: 1 iteration to fix the ROADMAP.md parsing regex or PLAN.md objective extraction.
- **Fallback:** The existing one-liner prompt (current pre-phase-88 behavior) remains the fallback if context injection breaks the function. The function is designed to degrade gracefully per plan specification.

---

## Ablation Plan

**No ablation plan** — Phase 88 implements two distinct features (merge queue and conflict prompt) with no sub-components to ablate independently. The merge queue's correctness is binary (serializes or does not), not a performance gradient. The conflict prompt's quality improvement is verified by content assertions, not a continuous metric.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All modified files are `lib/autopilot.ts` (TypeScript runtime) and `tests/unit/autopilot.test.ts`.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Line coverage before phase | Existing `lib/autopilot.ts` line coverage | >= 83% | `jest.config.js` threshold |
| Function coverage before phase | Existing function coverage | >= 93% | `jest.config.js` threshold |
| Branch coverage before phase | Existing branch coverage | >= 76% | `jest.config.js` threshold |
| Existing `runPostPhasePipeline` tests | Tests in the describe block before phase execution | 3 tests | `tests/unit/autopilot.test.ts` line 3525 |
| Existing `buildConflictResolvePrompt` tests | Tests in prompt-builders describe block | 1 test (phase number only) | `tests/unit/autopilot.test.ts` line 3129 |
| `createMergeQueue` tests before phase | Tests for the factory | 0 (function does not exist yet) | `grep createMergeQueue lib/autopilot.ts` returns empty |
| Wave loop pattern before phase | Sequential `await runPostPhasePipeline` inside for-loop | 1 sequential await at ~line 1250 | `lib/autopilot.ts` line 1250 |

---

## Evaluation Scripts

**Location of evaluation code:**
```
lib/autopilot.ts                    (modified by phase execution)
tests/unit/autopilot.test.ts        (modified by phase execution)
jest.config.js                      (thresholds — read-only)
```

**How to run full evaluation:**
```bash
# S1: Type check
cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check

# S2: Lint
cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint

# S3: Crash-free test run
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --no-coverage 2>&1 | tail -10

# S4: Structural code inspection
cd /Users/neo/Developer/Projects/GetResearchDone && grep -n "createMergeQueue\|mergeQueue" lib/autopilot.ts

# P1: createMergeQueue serialization tests
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "createMergeQueue" --no-coverage --verbose

# P2: buildConflictResolvePrompt content tests
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "buildConflictResolvePrompt" --no-coverage --verbose

# P3: Coverage thresholds
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --coverage --coverageReporters=text 2>&1 | grep "autopilot.ts"

# P4: runPostPhasePipeline no regression
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "runPostPhasePipeline" --no-coverage --verbose

# P5: Full suite
cd /Users/neo/Developer/Projects/GetResearchDone && npm test 2>&1 | tail -20

# P6: Wave loop structural assertion
cd /Users/neo/Developer/Projects/GetResearchDone && grep -n "Promise\.all\|pipelinePromises\|runPostPhasePipeline" lib/autopilot.ts
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | | | |
| S2: ESLint clean | | | |
| S3: Single-file test run (no crash) | | | |
| S4: createMergeQueue exported + mergeQueue param present | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: createMergeQueue tests | >= 4 passing (FIFO, concurrent, error isolation, single-item) | | | |
| P2: buildConflictResolvePrompt tests | >= 6 passing (goal, plan, files, fallback, both-versions, halt message) | | | |
| P3: Line coverage | >= 83% | | | |
| P3: Function coverage | >= 93% | | | |
| P3: Branch coverage | >= 76% | | | |
| P4: runPostPhasePipeline no regression | 3 existing pass + new halt test passes | | | |
| P5: Full suite | All suites pass, no threshold failures | | | |
| P6: Wave loop concurrent structure | Promise.all present, no sequential await in for-loop | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-88-01 | Real parallel phase execution — merge serialization verified | PENDING | First autopilot run with >= 2 parallel phases post-merge |
| DEFER-88-02 | Real conflict resolution subprocess — prompt effectiveness | PENDING | First real merge conflict during autopilot operation post-merge |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH for merge queue correctness; MEDIUM for conflict prompt effectiveness.

**Justification:**
- Sanity checks: Adequate — TypeScript and lint are deterministic; structural grep is a binary signal for plan compliance
- Proxy metrics for merge queue (P1, P6): Well-evidenced — FIFO serialization via promise chaining is a well-understood pattern; real-timer tests (not mocked timers, per plan) directly observe ordering behavior. Correlation is HIGH.
- Proxy metrics for conflict prompt (P2): Moderately evidenced — string content assertions verify the prompt contains the required sections, but cannot verify Claude interprets the prompt correctly. Correlation is MEDIUM.
- Coverage (P3): Well-evidenced — `createMergeQueue` is a new function; if tests are written per the plan, function coverage cannot drop.
- Deferred coverage: Low-risk for D1 (the promise-chain serialization is well-tested locally); moderate-risk for D2 (real conflict scenarios are rare and hard to stage).

**What this evaluation CAN tell us:**
- Whether `createMergeQueue()` serializes async functions in FIFO order under normal and error conditions
- Whether the enhanced `buildConflictResolvePrompt` injects the required content sections into the prompt string
- Whether the wave loop restructuring is structurally present (concurrent launch pattern)
- Whether coverage thresholds are maintained with the new code
- Whether existing pipeline tests regress after the signature extension

**What this evaluation CANNOT tell us:**
- Whether real parallel autopilot runs actually benefit from the merge queue without race conditions (deferred to D1 / operational use)
- Whether the enriched conflict-resolve prompt leads to higher Claude subprocess success rates (deferred to D2 / real conflict observation)
- Whether the `Promise.all` concurrency actually executes steps simultaneously on the real Node.js event loop vs. remaining accidentally sequential (structural check is necessary but not sufficient)
- Whether ROADMAP.md and PLAN.md parsing is robust to formatting variations across different milestone structures

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-24*
