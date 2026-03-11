# Evaluation Plan: Phase 73 — Testing & Documentation

**Designed:** 2026-03-11
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Test coverage expansion (backend.test.ts, context.test.ts) + documentation update (CLAUDE.md)
**Reference papers:** N/A — this is a testing and documentation phase; no research papers apply

## Evaluation Overview

Phase 73 is a quality-assurance phase, not a feature-implementation phase. The two plans (73-01 and 73-02) add test coverage for capability flags and effort level resolution introduced in Phase 71, add init context field tests for Phase 71-72 outputs, and update CLAUDE.md to document effort levels, new hook events, and the memory model. There are no novel algorithms, no paper metrics, and no benchmarks to reproduce.

The evaluation question is: does the phase correctly capture what was built in Phases 71 and 72 through assertions, and does CLAUDE.md now accurately reflect the system? These questions have concrete, verifiable answers. Both plans declare `verification_level: sanity`, which accurately reflects that all meaningful verification is executable in-phase with no integration dependencies.

No proxy metrics are needed or meaningful here — the domain is test correctness and documentation accuracy, not performance optimization. All evaluation is either directly verifiable (tests pass/fail, documentation content present/absent) or deferred to the overall milestone completion check (full npm test suite on a real runtime after both phases land).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| npx jest tests/unit/backend.test.ts pass count | Plan 73-01 verification section | Directly measures test correctness |
| npx jest tests/unit/context.test.ts pass count | Plan 73-02 verification section | Directly measures test correctness |
| npm test (full suite) pass rate | Plan 73-02 success criterion 5 | Ensures no regressions from test additions |
| New test count in backend.test.ts | Plans 73-01 success criteria | Verifies all 3 new flags are exercised |
| CLAUDE.md contains "Effort" column | Plan 73-02 must_haves | Verifies REQ-101 documentation |
| CLAUDE.md contains "TeammateIdle" | Plan 73-02 must_haves | Verifies new hook event docs (REQ-99) |
| CLAUDE.md contains "Memory Model" | Plan 73-02 must_haves | Verifies REQ-99 auto-memory documentation |
| TypeScript build:check passes | Codebase standard | Tests must not introduce type errors |
| ESLint lint passes | Codebase standard | Tests must comply with project lint rules |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 10 | All verification is directly executable; tests pass or fail |
| Proxy (L2) | 0 | No proxy metrics applicable — domain has exact pass/fail criteria |
| Deferred (L3) | 2 | Full suite on real Claude Code runtime; milestone-level sign-off |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: backend.test.ts passes with zero failures

- **What:** The updated backend test suite, including all new effort/http_hooks/cron assertions, passes without errors
- **Command:** `npx jest tests/unit/backend.test.ts`
- **Expected:** `Tests: [N] passed, 0 failed` — N should be >= 122 (102 existing + ~20 new tests per plan 73-01 estimates)
- **Failure means:** A new test assertion is wrong (wrong expected value, wrong import), or Phase 71's backend.ts implementation does not match the test expectations — requiring either test correction or a bug fix in lib/backend.ts

### S2: No regressions in existing backend tests

- **What:** All 102 tests that pass before Phase 73 still pass after adding new test blocks
- **Command:** `npx jest tests/unit/backend.test.ts` (same command as S1 — regression is detected by any failure in the 102 pre-existing tests)
- **Expected:** No existing describe blocks show failures; test descriptions from the pre-73 suite all report `✓`
- **Failure means:** A new import or describe block broke test isolation (e.g., env var leak, module cache pollution)

### S3: context.test.ts passes with zero failures

- **What:** The updated context test suite, including new effort_level and cron_available field assertions, passes without errors
- **Command:** `npx jest tests/unit/context.test.ts`
- **Expected:** `Tests: [N] passed, 0 failed` — N should be >= 203 (199 existing + ~4 new tests per plan 73-02)
- **Failure means:** The effort_level or cron_available fields are not present in init context output (Phase 71/72 not implemented as expected), or test mock setup is incorrect

### S4: No regressions in existing context tests

- **What:** All 199 tests that pass before Phase 73 still pass after adding new blocks
- **Command:** `npx jest tests/unit/context.test.ts` (regression is detected by any failure in pre-existing tests)
- **Expected:** All pre-73 tests report `✓`
- **Failure means:** New test setup code interfered with existing fixtures or mock patterns

### S5: Full test suite passes with zero failures

- **What:** The complete `npm test` run (all 37 test files) passes after both plans land
- **Command:** `npm test`
- **Expected:** All test suites pass, 0 failures, coverage thresholds met
- **Failure means:** Test additions caused a cross-file interference, or coverage thresholds in jest.config.js were violated by changes to lib/backend.ts or lib/context/ made to support the new test cases

### S6: TypeScript type check passes

- **What:** No TypeScript errors introduced by test file changes
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no output (tsc --noEmit)
- **Failure means:** A test file introduced a type error — likely an incorrect import signature or a missing type for a new exported function (e.g., resolveEffortLevel)

### S7: ESLint passes

- **What:** No lint errors in test files or any files touched during the phase
- **Command:** `npm run lint`
- **Expected:** Exit code 0, no output
- **Failure means:** A test file violated the lint rules (unused variable without `_` prefix, etc.) — fixable without logic changes

### S8: CLAUDE.md contains effort columns in agent model profiles table

- **What:** The CLAUDE.md agent model profiles table has been updated with Effort (Quality/Balanced/Budget) columns as specified in plan 73-02 Task 2
- **Command:** `grep -c "Effort" CLAUDE.md` (expect >= 4: header + column headings) or read the table section and verify manually
- **Expected:** The table header row contains "Effort (Quality)", "Effort (Balanced)", "Effort (Budget)"; all 8 agent rows have effort level values
- **Failure means:** REQ-101 (Feature Sync Documentation) is not satisfied — effort level documentation is missing from CLAUDE.md

### S9: CLAUDE.md documents TeammateIdle, TaskCompleted, InstructionsLoaded hook events

- **What:** The three new hook events added in Phase 72 are documented in a Hook Events section in CLAUDE.md
- **Command:** `grep -c "TeammateIdle\|TaskCompleted\|InstructionsLoaded" CLAUDE.md`
- **Expected:** Count >= 3 (one match per event name in the hook events table)
- **Failure means:** REQ-99 (Auto-Memory Awareness) and/or REQ-101 (Feature Sync Documentation) are not fully satisfied

### S10: CLAUDE.md contains Memory Model section

- **What:** A "## Memory Model" section exists explaining STATE.md vs auto-memory interaction
- **Command:** `grep -c "## Memory Model" CLAUDE.md`
- **Expected:** Count = 1
- **Failure means:** REQ-99 (Auto-Memory Awareness) is not satisfied — the dual-memory architecture is not documented

**Sanity gate:** ALL 10 sanity checks must pass. Any failure blocks progression to Phase 73 completion.

## Level 2: Proxy Metrics

### No Proxy Metrics

**Rationale:** This phase produces test files and documentation, not performance-optimized components. The evaluation domain is binary: tests pass or fail, documentation sections are present or absent. There is no indirect metric that would add signal beyond the direct sanity checks above. Coverage percentages are captured by `npm test` (S5) and enforced by jest.config.js thresholds — they are already part of the sanity gate, not a separate proxy.

**Recommendation:** Rely exclusively on Level 1 sanity checks. All meaningful verification is available directly in-phase.

## Level 3: Deferred Validations

### D1: Full test suite on real Claude Code runtime — DEFER-73-01

- **What:** Verify that the new test assertions hold against a real Claude Code environment where effort levels are actually being selected by the backend (not just mocked)
- **How:** Run `npm test` inside a live Claude Code session with CLAUDE_CODE_ENTRYPOINT set, then observe that `resolveEffortLevel` produces values consistent with what the Claude Code CLI actually uses
- **Why deferred:** The unit tests mock the backend environment. They verify the logic is correct given the specified effort matrix, but cannot verify that the matrix itself matches Claude Code's actual behavior without a live runtime
- **Validates at:** milestone-v0.3.7-completion (after all three phases ship and GRD is run in a real session)
- **Depends on:** Phases 71 + 72 + 73 all merged; real Claude Code session available
- **Target:** All effort-related tests remain green; no discrepancy observed between mock behavior and live behavior
- **Risk if unmet:** Low — the effort matrix is specified explicitly in lib/backend.ts and is not runtime-discovered. A discrepancy would indicate the matrix needs updating, not that the tests are wrong. Budget ~1 hour for a matrix correction if needed.
- **Fallback:** Update effort matrix in lib/backend.ts to match observed Claude Code behavior; tests will then need updating to match

### D2: CLAUDE.md accuracy review against shipped milestone — DEFER-73-02

- **What:** Human review that CLAUDE.md accurately describes the features as they exist in the shipped v0.3.7 codebase (not as they were planned)
- **How:** Read CLAUDE.md after v0.3.7 ships and verify: effort table values match resolveEffortLevel output; hook event table matches plugin.json hooks; memory model description accurately describes STATE.md behavior
- **Why deferred:** Documentation accuracy depends on all implementation phases being complete. Phase 73 writes documentation based on the plan, but subtle implementation details may differ (e.g., exact effort level defaults, exact hook event names in plugin.json)
- **Validates at:** milestone-v0.3.7-completion
- **Depends on:** Phases 71 + 72 fully merged; plugin.json finalized
- **Target:** Every claim in the three new/updated CLAUDE.md sections is accurate (no outdated values, no missing events, no incorrect memory model description)
- **Risk if unmet:** Low — documentation inaccuracy does not break functionality; it creates confusion. Fix is a targeted CLAUDE.md patch.
- **Fallback:** Post-milestone documentation patch (no code changes required)

## Ablation Plan

**No ablation plan** — This phase implements no novel algorithmic components. The two plans are independent (73-01 modifies backend.test.ts; 73-02 modifies context.test.ts and CLAUDE.md) but both are necessary to satisfy REQ-99, REQ-100, and REQ-101. There are no sub-components to ablate.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All modified files are test files (`tests/unit/`) and documentation (`CLAUDE.md`).

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| backend.test.ts pre-73 | 102 tests passing before this phase | 102/102 pass | Measured 2026-03-11 via `npx jest tests/unit/backend.test.ts` |
| context.test.ts pre-73 | 199 tests passing before this phase | 199/199 pass | Measured 2026-03-11 via `npx jest tests/unit/context.test.ts` |
| Full suite pre-73 | All existing tests pass | 0 failures | Baseline — npm test must not regress |
| TypeScript pre-73 | No type errors | Clean (0 errors) | `npm run build:check` passes clean |
| ESLint pre-73 | No lint errors | Clean (0 errors) | `npm run lint` passes clean |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/backend.test.ts   (modified by plan 73-01)
tests/unit/context.test.ts   (modified by plan 73-02)
```

**How to run full evaluation:**
```bash
# Individual file checks (run after each plan lands)
npx jest tests/unit/backend.test.ts
npx jest tests/unit/context.test.ts

# Full suite gate (run after both plans land)
npm test

# Documentation checks (run after plan 73-02 lands)
grep -c "Effort" CLAUDE.md
grep -c "TeammateIdle\|TaskCompleted\|InstructionsLoaded" CLAUDE.md
grep -c "## Memory Model" CLAUDE.md

# Quality gates
npm run build:check
npm run lint
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: backend.test.ts passes | | | |
| S2: No backend regressions | | | |
| S3: context.test.ts passes | | | |
| S4: No context regressions | | | |
| S5: Full npm test passes | | | |
| S6: TypeScript check passes | | | |
| S7: ESLint passes | | | |
| S8: Effort columns in CLAUDE.md | | | |
| S9: Hook events in CLAUDE.md | | | |
| S10: Memory Model section in CLAUDE.md | | | |

### Proxy Results

No proxy metrics defined for this phase.

### Ablation Results

No ablation conditions defined for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-73-01 | resolveEffortLevel values match live Claude Code runtime | PENDING | milestone-v0.3.7-completion |
| DEFER-73-02 | CLAUDE.md accuracy review against shipped codebase | PENDING | milestone-v0.3.7-completion |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — every requirement (REQ-99, REQ-100, REQ-101) maps to at least one directly executable check. The domain (tests pass/fail, strings present/absent) has no measurement ambiguity.
- Proxy metrics: None — intentionally absent. The domain does not benefit from indirect measurement; direct checks are available for everything.
- Deferred coverage: Partial — the two deferred items cover runtime accuracy and documentation correctness post-ship, which are low-risk and have clear fallbacks. The deferred items do not gate milestone completion; they are post-ship confirmations.

**What this evaluation CAN tell us:**
- Whether the new test assertions are syntactically and logically correct (S1-S4)
- Whether the test additions introduce regressions in any existing test file (S5)
- Whether the test files compile and pass lint (S6, S7)
- Whether the three CLAUDE.md sections were added with the required content (S8-S10)

**What this evaluation CANNOT tell us:**
- Whether the effort matrix in lib/backend.ts matches what Claude Code v2.1.72 actually uses in production (deferred to DEFER-73-01 — addressable only with a live runtime)
- Whether the CLAUDE.md documentation is fully accurate against the final shipped codebase across all three phases (deferred to DEFER-73-02 — addressable only after all v0.3.7 phases merge)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-11*
