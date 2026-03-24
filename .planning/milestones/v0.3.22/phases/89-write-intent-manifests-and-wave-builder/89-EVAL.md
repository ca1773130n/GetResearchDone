# Evaluation Plan: Phase 89 — Write-Intent Manifests and Wave Builder

**Designed:** 2026-03-24
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Write-intent declaration in PLAN.md frontmatter, wave conflict detection, declared-vs-actual feedback logging
**Reference papers:** None — this is a software engineering feature with no associated academic literature. Evaluation designed from first principles and project quality requirements.

## Evaluation Overview

Phase 89 introduces three inter-dependent features to the autopilot system: (1) a `files_modified` field in PLAN.md frontmatter, parsed by `parseWriteIntent()`; (2) conflict-aware wave scheduling in `buildWaves()`, which separates phases declaring the same file into different waves; and (3) post-execution mismatch logging via `compareWriteIntent()`.

Because the complete feature involves the runtime autopilot loop — which requires a full project setup, real subagent execution, and multi-phase runs to observe wave-splitting in action — full end-to-end validation is not possible within this phase. However, the three new pure functions (`parseWriteIntent`, the `buildWaves` conflict logic, and `compareWriteIntent`) are individually unit-testable with high confidence. The proxy evaluation tier is therefore well-supported: unit tests directly exercise the correctness of each function under a range of inputs.

No academic benchmarks exist for this feature. Success is measured against the five explicit success criteria in the phase requirements: correct YAML parsing (both formats), conflict-driven wave splitting, `depends_on` preservation, `--force-parallel` override, and `[WRITE-INTENT-MISMATCH]` log emission. All five map directly to executable unit tests.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | Project build process — `npm run build:check` | Zero-tolerance policy; any type error blocks execution |
| ESLint pass rate | Project quality target — PRODUCT-QUALITY.md P1 | All commits must pass lint; pre-commit hook enforces this |
| Unit test pass rate (new tests) | Phase plans 01–03 success criteria | Plans specify exact test counts (6, 6, 7) and test cases |
| Regression: existing autopilot tests pass | Phase plan 01 success criterion | "All existing buildPlanPrompt tests continue to pass" |
| Coverage thresholds met | jest.config.js — autopilot.ts: lines 83, functions 93, branches 76 | Per-file threshold is enforced by jest; adding code without tests will drop coverage below floor |
| buildWaves backward compatibility | Phase plan 02 success criterion — existing 5 tests unchanged | Calling `buildWaves(phases)` without options must behave identically to before |
| WRITE-INTENT-MISMATCH log format | Phase plan 03 success criterion | Specific prefix required for downstream grep/monitoring compatibility |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 5 | Basic functionality and format verification |
| Proxy (L2) | 5 | Unit test suites directly measuring feature correctness |
| Deferred (L3) | 3 | Full integration validation requiring real autopilot runs |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compilation

- **What:** The two modified files (`lib/autopilot.ts`, `tests/unit/autopilot.test.ts`) compile without type errors after all three plans are applied
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no output (or only `> tsc --noEmit`)
- **Failure means:** A type error was introduced — likely a missing export, wrong return type on `parseWriteIntent`/`compareWriteIntent`, or incorrect `buildWaves` signature

### S2: ESLint Pass

- **What:** No lint errors in modified files
- **Command:** `npm run lint`
- **Expected:** Exit code 0, zero errors and zero warnings
- **Failure means:** A lint rule violation was introduced; pre-commit hook would block any commit anyway, so this must be clean before eval proceeds

### S3: Module Export Presence

- **What:** All three new symbols are exported from `lib/autopilot.ts`
- **Command:** `node -e "const m = require('./lib/autopilot'); console.log(typeof m.parseWriteIntent, typeof m.compareWriteIntent, typeof m.buildWaves)"`
- **Expected:** `function function function`
- **Failure means:** An export was forgotten in the module.exports block — the functions exist but are inaccessible to tests and the autopilot loop

### S4: No NaN/crash on empty input to new functions

- **What:** `parseWriteIntent` and `compareWriteIntent` handle empty/null-like input without throwing
- **Command:** `node -e "const { parseWriteIntent, compareWriteIntent } = require('./lib/autopilot'); console.log(JSON.stringify(parseWriteIntent(''))); console.log(JSON.stringify(compareWriteIntent([], [])))"`
- **Expected:** `[]` then `{"unexpected":[],"untouched":[],"matches":[]}`
- **Failure means:** A function throws on empty input — violating the graceful degradation requirement from plan 01 and 03

### S5: Existing test suite does not crash

- **What:** Running the autopilot test file completes without jest process-level failures (import errors, syntax errors)
- **Command:** `npx jest tests/unit/autopilot.test.ts --no-coverage --testNamePattern="buildPlanPrompt|buildWaves" 2>&1 | grep -E "PASS|FAIL|error"`
- **Expected:** `PASS tests/unit/autopilot.test.ts`
- **Failure means:** A syntax error, bad import, or module crash — nothing in the new code is loadable

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: parseWriteIntent Unit Tests (Plan 01)

- **What:** Correctness of YAML frontmatter parsing for `files_modified` in both inline array and dash-list formats, plus edge cases
- **How:** Run the 6 targeted unit tests specified in plan 01
- **Command:** `npx jest tests/unit/autopilot.test.ts --no-coverage -t "parseWriteIntent" --verbose`
- **Target:** 6/6 tests pass
- **Evidence:** Plan 01 specifies exact test cases covering both YAML formats, missing field, no frontmatter, empty array, and malformed input — these are direct correctness checks, not approximations
- **Correlation with full metric:** HIGH — the function is pure, deterministic, and the test cases directly probe all specified behaviors
- **Blind spots:** Does not test very large frontmatter blocks or frontmatter with special characters in file paths (e.g., paths with spaces). Does not test concurrent calls.
- **Validated:** No — awaiting deferred validation at phase-90-or-integration

### P2: buildPlanPrompt Instruction Injection (Plan 01)

- **What:** `buildPlanPrompt()` output contains the write-intent instruction
- **How:** Run existing buildPlanPrompt tests plus the new `.toContain('files_modified')` assertion
- **Command:** `npx jest tests/unit/autopilot.test.ts --no-coverage -t "buildPlanPrompt" --verbose`
- **Target:** All buildPlanPrompt tests pass (2 original + 1 updated assertion)
- **Evidence:** The test directly asserts on the prompt string content; if `files_modified` appears in the prompt, the planner will see the instruction. The instruction being present is the entire deliverable of Plan 01 Task 1 step 1.
- **Correlation with full metric:** HIGH — the prompt string is deterministic; presence of the substring is definitive. The question of whether a real planner will act on it is deferred.
- **Blind spots:** Does not verify the planner (subagent) actually generates `files_modified` in practice. Does not test that the instruction placement in the prompt is prominent enough to influence the model.
- **Validated:** No — awaiting deferred validation at phase-integration

### P3: buildWaves Write-Intent Conflict Detection (Plan 02)

- **What:** Correctness of wave-splitting logic when phases declare overlapping files
- **How:** Run the 6 targeted unit tests specified in plan 02
- **Command:** `npx jest tests/unit/autopilot.test.ts --no-coverage -t "write-intent conflict" --verbose`
- **Target:** 6/6 tests pass (backward compat, overlapping split, no overlap stays parallel, forceParallel override, cascading conflicts, mixed deps+write-intent)
- **Evidence:** Plan 02 specifies exact test conditions and expected wave assignments. The backward compatibility test (no writeIntents = old behavior) directly validates the non-regression requirement.
- **Correlation with full metric:** HIGH for the pure wave-splitting logic. MEDIUM overall because the integration of `parseWriteIntent` results into the autopilot loop call site is deferred.
- **Blind spots:** Does not test large numbers of phases (>20). Does not test phases with partially overlapping paths (e.g., `lib/foo.ts` vs `lib/foo-utils.ts` — should not conflict). Does not test performance of the conflict detection loop on a full milestone worth of phases.
- **Validated:** No — awaiting deferred validation at phase-integration

### P4: compareWriteIntent Unit Tests (Plan 03)

- **What:** Correctness of set-difference computation for declared vs actual file lists
- **How:** Run the 7 targeted unit tests specified in plan 03
- **Command:** `npx jest tests/unit/autopilot.test.ts --no-coverage -t "compareWriteIntent" --verbose`
- **Target:** 7/7 tests pass (perfect match, unexpected, untouched, both mismatches, empty declared, empty actual, both empty)
- **Evidence:** `compareWriteIntent` is a pure function operating on two arrays. The test cases cover all logical partitions of the input space. This is effectively a correctness proof for the finite cases.
- **Correlation with full metric:** HIGH — the function is purely computational; test correctness directly equals runtime correctness
- **Blind spots:** Does not test paths with different separators (POSIX vs Windows). Does not test duplicate entries within either array.
- **Validated:** No — awaiting deferred validation at phase-integration

### P5: Coverage Threshold Enforcement

- **What:** Adding new code with tests maintains autopilot.ts above the per-file coverage floor
- **How:** Run jest with coverage on the autopilot test file and compare against jest.config.js thresholds
- **Command:** `npx jest tests/unit/autopilot.test.ts --coverage --coverageThreshold='{}' 2>&1 | grep -E "autopilot|Lines|Functions|Branches"`
- **Target:** `lib/autopilot.ts` lines >= 83%, functions >= 93%, branches >= 76% (existing thresholds in jest.config.js — must not drop below floor)
- **Evidence:** The jest.config.js enforces these per-file thresholds. Phase 89 adds ~3 new exported functions (parseWriteIntent, compareWriteIntent, buildWaves enhancement). If the integration paths (compareWriteIntent in the autopilot loop) are not unit-testable, the new branch code may reduce coverage. The 19 new unit tests (6+6+7) should more than compensate.
- **Correlation with full metric:** MEDIUM — coverage measures test surface, not correctness. A well-covered wrong implementation passes coverage checks.
- **Blind spots:** The autopilot loop integration code for compareWriteIntent (the git diff call + file reading) is in async execution context and will likely be measured as uncovered. If this pushes lines below 83%, the threshold must be revisited or the integration code must be more thoroughly mocked.
- **Validated:** No — will be confirmed when full test suite runs with coverage

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Planner Produces files_modified in Practice — DEFER-89-01

- **What:** Real planner subagents (claude/codex/gemini) actually include `files_modified:` in generated PLAN.md files at a useful rate
- **How:** Run `gd autopilot` on a multi-phase project (e.g., the examples/taskmark tutorial) and inspect generated PLAN.md files for `files_modified` presence and accuracy
- **Why deferred:** Requires a real subagent execution with a live backend. The instruction presence (P2) is testable now, but model compliance is not.
- **Validates at:** First real autopilot run after phase 89 merges — manual observation. Formally validated when phase-90 or later phase uses write-intent data.
- **Depends on:** Phase 89 merged to main, live autopilot run with at least 3 phases, access to generated PLAN.md files
- **Target:** >= 80% of generated PLAN.md files contain a non-empty `files_modified` list
- **Risk if unmet:** The wave builder conflict detection (REQ-168) has no data to work with. Phases still execute correctly but the conflict prevention benefit is lost. Fix: strengthen instruction wording or add a post-planning validation that prompts the planner to retry if `files_modified` is missing.
- **Fallback:** Manual `files_modified` annotation in PLAN.md — human edits the field before execution

### D2: Wave Builder Actually Splits Conflicting Phases at Runtime — DEFER-89-02

- **What:** In a real `gd autopilot` run with phases declaring overlapping files, those phases are executed in separate waves (not parallel)
- **How:** Create a test scenario with two phases declaring `lib/autopilot.ts` and verify the autopilot log shows them in separate wave batches
- **Why deferred:** The `buildWaves` function is enhanced (Plan 02), but the call site in the autopilot loop is NOT updated in phase 89 (per plan 02 task 1 note: "The existing call site does NOT need to change yet"). The integration is explicitly deferred to a future phase.
- **Validates at:** The future phase that updates the `buildWaves(phases)` call site to pass `writeIntents` data
- **Depends on:** Call site integration (future phase), parseWriteIntent called in autopilot loop before buildWaves
- **Target:** Zero same-file parallel executions in a wave where both phases declared the conflicting file
- **Risk if unmet:** The feature exists but is dormant — wave splitting never triggers because the call site still passes no writeIntents. This would be a regression in the sense of unfinished work, not incorrect behavior.
- **Fallback:** Call site integration can be a small follow-up phase (< 1 day of work)

### D3: WRITE-INTENT-MISMATCH Log Appears in Real Runs — DEFER-89-03

- **What:** After a real phase execution where declared files differ from actual git diff output, the `[WRITE-INTENT-MISMATCH]` log lines appear in the autopilot log
- **How:** Inspect `.planning/autopilot/autopilot.log` after running a phase known to modify files not in its `files_modified` list (or vice versa)
- **Why deferred:** The compareWriteIntent function and its integration code are in the async autopilot loop. Unit tests verify the pure function. The integration (git diff call, file reading, log emission) runs only during actual phase execution.
- **Validates at:** First autopilot run after phase 89 merges — check `.planning/autopilot/autopilot.log` for `[WRITE-INTENT-MISMATCH]` entries
- **Depends on:** Phase 89 merged, at least one phase executed via `gd autopilot` with `files_modified` declared in its PLAN.md
- **Target:** `[WRITE-INTENT-MISMATCH]` log entries appear exactly when actual modified files diverge from declared; no log entries when they match exactly
- **Risk if unmet:** Feedback loop for planner accuracy improvement does not function. This is a P2 requirement (REQ-169), so it does not block the core functionality. Impact is limited to observability and future planner improvement.
- **Fallback:** Manual comparison of git diff output to PLAN.md frontmatter after each execution

## Ablation Plan

**No ablation plan** — Phase 89 implements three additive, independent functions. There are no sub-components to isolate against each other; each function (parseWriteIntent, buildWaves conflict logic, compareWriteIntent) is independently verifiable. Plan 02 explicitly tests backward compatibility (no writeIntents = old behavior), which is the closest equivalent.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All files modified are `lib/autopilot.ts` and `tests/unit/autopilot.test.ts`.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| autopilot.ts TypeScript compiles | Pre-phase compilation clean | 0 errors | `npm run build:check` output at phase start |
| autopilot.ts lines coverage | Per-file threshold | >= 83% | jest.config.js line 16 |
| autopilot.ts functions coverage | Per-file threshold | >= 93% | jest.config.js line 16 |
| autopilot.ts branches coverage | Per-file threshold | >= 76% | jest.config.js line 16 |
| Existing autopilot tests | Tests passing before phase | 5 buildWaves tests + 2 buildPlanPrompt tests pass | Confirmed by pre-phase test run |
| ESLint | No existing lint errors | 0 errors | `npm run lint` on unmodified codebase |

## Evaluation Scripts

**Location of evaluation code:**

```
tests/unit/autopilot.test.ts — all unit tests for this phase live here
lib/autopilot.ts — implementation under test
jest.config.js — coverage thresholds
```

**How to run full evaluation (run these in order):**

```bash
# S1 + S2: Compilation and lint
npm run build:check && npm run lint

# S3: Export presence
node -e "const m = require('./lib/autopilot'); console.log(typeof m.parseWriteIntent, typeof m.compareWriteIntent, typeof m.buildWaves)"

# S4: Graceful empty input
node -e "const { parseWriteIntent, compareWriteIntent } = require('./lib/autopilot'); console.log(JSON.stringify(parseWriteIntent(''))); console.log(JSON.stringify(compareWriteIntent([], [])))"

# P1: parseWriteIntent tests
npx jest tests/unit/autopilot.test.ts --no-coverage -t "parseWriteIntent" --verbose

# P2: buildPlanPrompt tests
npx jest tests/unit/autopilot.test.ts --no-coverage -t "buildPlanPrompt" --verbose

# P3: buildWaves write-intent tests
npx jest tests/unit/autopilot.test.ts --no-coverage -t "write-intent conflict" --verbose

# P4: compareWriteIntent tests
npx jest tests/unit/autopilot.test.ts --no-coverage -t "compareWriteIntent" --verbose

# P5 + regression: Full suite with coverage
npx jest tests/unit/autopilot.test.ts --coverage
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | [PASS/FAIL] | | |
| S2: ESLint pass | [PASS/FAIL] | | |
| S3: Export presence | [PASS/FAIL] | | |
| S4: Graceful empty input | [PASS/FAIL] | | |
| S5: Test suite loads cleanly | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: parseWriteIntent tests | 6/6 | | [MET/MISSED] | |
| P2: buildPlanPrompt tests | 3/3 | | [MET/MISSED] | |
| P3: buildWaves conflict tests | 6/6 | | [MET/MISSED] | |
| P4: compareWriteIntent tests | 7/7 | | [MET/MISSED] | |
| P5: Coverage — lines | >= 83% | | [MET/MISSED] | |
| P5: Coverage — functions | >= 93% | | [MET/MISSED] | |
| P5: Coverage — branches | >= 76% | | [MET/MISSED] | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-89-01 | Planner generates files_modified in practice | PENDING | First real autopilot run post-merge |
| DEFER-89-02 | Wave builder actually splits conflicting phases at runtime | PENDING | Future phase updating buildWaves call site |
| DEFER-89-03 | WRITE-INTENT-MISMATCH appears in real autopilot.log | PENDING | First autopilot run post-merge |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH for the pure function layer; LOW for the runtime integration layer.

**Justification:**
- Sanity checks: Adequate — TypeScript compilation and export verification give immediate signal on any structural problem
- Proxy metrics: Well-evidenced — all three new functions are pure and deterministic; unit tests directly measure correctness, not approximations. Coverage threshold enforcement provides a safety net against hollow implementations.
- Deferred coverage: Partial — the runtime integration (call site wiring, actual log emission in a live run) is deferred. This is an honest gap. The call site update is explicitly out of scope for phase 89 per plan 02.

**What this evaluation CAN tell us:**
- Whether `parseWriteIntent` correctly handles all YAML frontmatter formats and edge cases
- Whether `buildWaves` correctly detects and resolves file conflicts, preserves `depends_on` semantics, and respects `forceParallel`
- Whether `compareWriteIntent` correctly classifies unexpected, untouched, and matching files across all logical input partitions
- Whether the new code compiles, lints, and does not regress existing tests
- Whether coverage thresholds are maintained (or whether the new loop integration code pulls coverage below floor)

**What this evaluation CANNOT tell us:**
- Whether real planner subagents will include `files_modified` in generated PLAN.md files (DEFER-89-01, addressed in first real run)
- Whether the wave-splitting benefit materializes in practice, since the call site is not wired up in this phase (DEFER-89-02, addressed in follow-up phase)
- Whether the `[WRITE-INTENT-MISMATCH]` log integration works end-to-end with actual git operations in a worktree (DEFER-89-03, addressed in first real run)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-24*
