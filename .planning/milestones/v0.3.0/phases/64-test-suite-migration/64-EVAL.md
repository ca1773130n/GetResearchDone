# Evaluation Plan: Phase 64 — Test Suite Migration

**Designed:** 2026-03-02
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** TypeScript test migration via ts-jest transform, CJS proxy helper pattern, typed mock factories and subprocess helpers
**Reference requirements:** REQ-75 (Test Infrastructure Migration), REQ-76 (Unit Test Migration), REQ-77 (Integration and E2E Test Migration)

## Evaluation Overview

Phase 64 migrates 37 test files and 2 helper modules from JavaScript to TypeScript. This is the largest single-phase migration in v0.3.0: 31 unit test files (Plan 02 + Plan 03), 6 integration/E2E test files (Plan 04), and 2 shared helper modules (Plan 01). Unlike source-code migrations, test migration has a uniquely reliable verification mechanism: the test suite itself. If every test file compiles under ts-jest and every test in that file passes, the migration is behaviorally equivalent by construction — no separate quality metric is needed to assess correctness.

The evaluation strategy reflects this: Level 1 sanity checks confirm TypeScript compilation, file existence, and CJS proxy structure. Level 2 proxy metrics confirm behavioral equivalence (zero regressions) and structural quality (per-file coverage thresholds, type annotations present, no orphaned .js files). Level 3 deferred validations cover only the one thing that genuinely cannot be verified in-phase: whether the migrated test suite continues to function correctly after Phase 65 completes the CommonJS interop resolution under plain Node (DEFER-58-01, DEFER-59-01).

The primary risk in this phase is silent test loss: a `.test.js` file deleted before its `.test.ts` counterpart passes, or a `require()` path that resolves to an unexpected module through the CJS proxy chain, silently skipping test cases. The sanity checks and per-file run requirements in the plans directly address this risk.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| `npx tsc --noEmit` exits 0 (with tests included) | Plan 01 Task 2 — adds tests/**/*.ts to tsconfig include | Type-checks all migrated test files under strict mode; catches annotation gaps and interface mismatches |
| `npm test` (full suite) pass rate >= baseline | Plans 02-04 Task 3 final verify steps | Behavioral equivalence: if the test count stays stable and all pass, migration introduced no regressions |
| Total test count >= 2,676 (pre-migration count) | STATE.md Performance Metrics | Test count is the direct measure of zero test loss — file renames that silently drop tests reduce this number |
| Per-file coverage thresholds all met | jest.config.js coverageThreshold (22 files) | Coverage thresholds are calibrated for each lib/ module; threshold failure implies test cases were lost during migration |
| Zero `.test.js` files remaining after Plan 04 | Plan 04 Task 3 verify step | Migration completeness: all .test.js files replaced by .test.ts counterparts |
| Zero `.js` helper files remaining after Plan 04 | Plan 04 Task 3 verify step | CJS proxy helpers cleaned up after their bridging purpose is complete |
| `npm run lint` exits 0 | Plan 04 Task 3 final verify | Type annotations must not introduce lint violations (@typescript-eslint rules) |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 8 | TypeScript compilation, helper structure, tsconfig update, artifact existence, no silent drops |
| Proxy (L2) | 7 | Test suite behavioral equivalence, coverage thresholds, type annotation quality, migration completeness |
| Deferred (L3) | 2 | CommonJS interop under plain Node (no ts-jest) and dist/ runtime (Phase 65 integration) |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compilation — Full Project Including Tests

- **What:** `npx tsc --noEmit` reports zero errors after Plan 01 updates tsconfig.json to include `tests/**/*.ts`
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit code 0, no error output. (Note: unmigrated `.test.js` files are excluded by tsconfig — only `.ts` files are checked. Pre-Plan-01 state may show no test errors since tests are excluded; post-Plan-01 this checks the newly included `.ts` files.)
- **Failure means:** A migrated test file has a type error — incorrect annotation, wrong interface usage, or missing cast. Do not proceed to the next plan until tsc is clean.

### S2: Per-File TypeScript Compilation Check (per plan)

- **What:** Each newly created `.test.ts` file produces no tsc errors during its plan's execution
- **Command (Plan 01):** `npx tsc --noEmit --include tests/helpers/setup.ts tests/helpers/fixtures.ts`
- **Command (Plans 02-03):** `npx tsc --noEmit` after each file is migrated (covers the file via tsconfig include added in Plan 01)
- **Command (Plan 04):** `npx tsc --noEmit` after each integration test is migrated
- **Expected:** Exit code 0 for each per-plan check
- **Failure means:** The specific file has annotation errors. Fix before migrating the next file. This is the most actionable per-file gating check.

### S3: Helper CJS Proxy Structure (Plan 01)

- **What:** `tests/helpers/setup.js` and `tests/helpers/fixtures.js` contain the CJS proxy pattern, not the original JS logic
- **Command:**
  ```bash
  grep "require.*setup\.ts" /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/setup.js
  grep "require.*fixtures\.ts" /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/fixtures.js
  ```
- **Expected:** Each grep returns exactly one line containing `require('./setup.ts')` or `require('./fixtures.ts')` respectively
- **Failure means:** The helpers were not properly converted to proxies — original JS test files that `require('../helpers/setup')` will load the old untyped implementation instead of the typed `.ts` version.

### S4: Typed Helper Exports Present (Plan 01)

- **What:** `tests/helpers/setup.ts` exports `ExitSentinelError` interface and typed `captureOutput`, `captureError`, `captureOutputAsync` functions; `tests/helpers/fixtures.ts` exports typed `createFixtureDir` and `cleanupFixtureDir`
- **Command:**
  ```bash
  grep "ExitSentinelError" /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/setup.ts
  grep "captureOutput.*CaptureResult" /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/setup.ts
  grep "createFixtureDir.*string" /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/fixtures.ts
  ```
- **Expected:** Each grep returns at least one matching line confirming typed declarations
- **Failure means:** Helper migration is incomplete — type annotations are missing, which means test files importing these helpers won't get type-safe `captureOutput` return values.

### S5: tsconfig.json Updated to Include Tests (Plan 01)

- **What:** `tsconfig.json` include array contains `tests/**/*.ts` and the exclude array does NOT contain `"tests"`
- **Command:**
  ```bash
  node -e "const t=require('./tsconfig.json'); console.log('include:', JSON.stringify(t.include)); console.log('exclude:', JSON.stringify(t.exclude))"
  ```
- **Expected:** `include` contains `"tests/**/*.ts"`; `exclude` does NOT contain `"tests"` as a bare string (array may still contain `"testbed"`)
- **Failure means:** Test files are not type-checked by tsc even after migration — type errors in `.test.ts` files go undetected. This is a silent quality gap.

### S6: No `.test.js` Files Remain (Post-Plan-03 and Post-Plan-04)

- **What:** All unit and integration test directories contain only `.test.ts` files after migration is complete
- **Command (after Plan 03):**
  ```bash
  find /Users/neo/Developer/Projects/GetResearchDone/tests/unit -name '*.test.js' | wc -l
  ```
- **Command (after Plan 04):**
  ```bash
  find /Users/neo/Developer/Projects/GetResearchDone/tests -name '*.test.js' | wc -l
  ```
- **Expected:** 0 for both commands
- **Failure means:** At least one test file was not migrated — its tests are still running from the JS file, and the migration is incomplete. Also check: was a `.test.ts` created but the `.test.js` not yet deleted? This is the in-progress state during Plans 02-03, which is acceptable. After Plan 03 the unit dir should be clean; after Plan 04 all dirs should be clean.

### S7: Helper `.js` Proxy Files Cleaned Up (Post-Plan-04)

- **What:** After Plan 04 Task 3, the CJS proxy helper files are deleted since all test files are now `.ts`
- **Command:**
  ```bash
  ls /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/*.js 2>&1
  ```
- **Expected:** `No such file or directory` or empty output — no `.js` files remain in tests/helpers/
- **Failure means:** The cleanup step was skipped. The proxies are harmless at this point but constitute technical debt — leaving them implies the migration is not fully committed to TypeScript.

### S8: Individual Test File Passes Immediately After Migration

- **What:** Each migrated `.test.ts` file passes when run in isolation before the next file is migrated (the plans require this sequential per-file verification for large files)
- **Command (example for any file `X`):**
  ```bash
  npx jest tests/unit/X.test.ts --no-coverage
  ```
- **Expected:** All tests in that file pass; zero failures; no "Cannot find module" errors
- **Failure means:** The migration introduced a bug in that specific file — a broken `require()` path, a type assertion that crashes at runtime, or a deleted test case. Do not delete the original `.test.js` until this passes.

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to the next plan.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of migration quality and behavioral equivalence.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for Phase 65 integration evaluation. They confirm in-jest-environment behavior; runtime behavior under plain Node and dist/ execution is deferred.

### P1: Full Test Suite Pass Rate — Zero Regressions

- **What:** All tests that passed before Phase 64 continue to pass after each wave completes
- **How:** Run the full test suite after Plan 02 completes, after Plan 03 completes, and after Plan 04 completes
- **Command:** `npm test`
- **Target:** 100% of previously passing tests continue to pass. Pre-phase baseline from STATE.md: 2,661/2,676 tests passing (15 pre-existing failures: 2 npm-pack Node v24 failures per DEFER-59-01, 1 evolve-e2e flaky). These 15 are acceptable; any new failure beyond them is a regression.
- **Evidence:** Test files are being renamed, not logically changed. A rename that preserves the content must preserve the pass/fail status of every test. If any previously-passing test now fails, the migration introduced a defect in that specific test file.
- **Correlation with full metric:** HIGH — the test suite was designed to exercise the same public API before and after migration. A 1:1 rename with type annotations cannot change behavior; if tests fail, something structural changed (broken require path, deleted test, incorrect mock type).
- **Blind spots:** Tests run via ts-jest transform — does not validate behavior under plain `node` without ts-jest (deferred to DEFER-64-01). The 15 pre-existing failures are excluded from the regression signal.
- **Validated:** No — awaiting deferred validation at Phase 65.

### P2: Total Test Count >= Pre-Phase Baseline

- **What:** After migration completes, the total test count is at least 2,676 (the count recorded in STATE.md entering this phase)
- **How:** Extract test count from Jest output summary line
- **Command:**
  ```bash
  npm test 2>&1 | grep -E "Tests:.*passed"
  ```
- **Target:** Reported "passed" count >= 2,676 (accounting for the 15 pre-existing failures: total suite size should be >= 2,676, with passed >= 2,661)
- **Evidence:** Plans 02-04 success criteria all require "Total test count matches or exceeds baseline (2,184+ per success criteria)". The STATE.md records 2,676 as the current cumulative total. Test count is the direct measure of zero silent test loss during file rename.
- **Correlation with full metric:** HIGH — test count is a direct count, not a proxy. Any decrease means tests were lost during migration.
- **Blind spots:** Does not verify that the remaining test count represents the same tests (a test could be deleted and another added, preserving count while changing coverage). Coverage thresholds (P4) address this gap.
- **Validated:** No — awaiting deferred validation at Phase 65.

### P3: Per-File Coverage Thresholds All Met

- **What:** All 22 per-file coverage thresholds defined in `jest.config.js` are met after migration completes
- **How:** Run test suite with coverage and check threshold violations
- **Command:**
  ```bash
  npm test -- --coverage 2>&1 | grep -E "(FAIL|Jest.*threshold)"
  ```
- **Target:** Zero threshold violations. The 22 thresholds cover: autopilot, backend, cleanup, commands/index, context/index, deps, evolve/index, frontmatter, gates, long-term-roadmap, markdown-split, mcp-server, parallel, paths, phase, roadmap, scaffold, state, tracker, utils, verify, worktree (all with specific lines/functions/branches targets per jest.config.js)
- **Evidence:** Plans 02, 03, and 04 all include the instruction "Do NOT modify per-file coverage thresholds — if a threshold fails, the test file migration has a bug." This makes threshold pass/fail a direct regression signal for the migration quality.
- **Correlation with full metric:** HIGH — per-file thresholds were calibrated against the pre-migration test suite. If a threshold fails post-migration, it means tests that previously exercised that code path were accidentally dropped.
- **Blind spots:** Thresholds are per-lib-module, not per-test-file. A test file could exercise different code paths post-migration (if a require() path resolves differently), passing thresholds while covering subtly different code. This is unlikely for a pure rename migration.
- **Validated:** No — awaiting deferred validation at Phase 65.

### P4: Type Annotations Present in Migrated Test Files

- **What:** Key type annotation patterns are present in migrated test files — not just renamed from `.js` to `.ts` with no changes
- **How:** Spot-check pattern presence in the largest migrated files
- **Command:**
  ```bash
  # Check ExitSentinelError usage in any test file
  grep -l "ExitSentinelError\|CaptureResult\|as ExitSentinelError" /Users/neo/Developer/Projects/GetResearchDone/tests/unit/*.ts | wc -l
  # Check typed catch blocks
  grep -l "catch.*unknown\|catch.*e: unknown" /Users/neo/Developer/Projects/GetResearchDone/tests/unit/*.ts | wc -l
  # Check typed CLIResult in integration tests
  grep "CLIResult\|interface CLIResult" /Users/neo/Developer/Projects/GetResearchDone/tests/integration/cli.test.ts
  ```
- **Target:** First grep: >= 5 files using ExitSentinelError or CaptureResult (these helpers are used pervasively in captureOutput-heavy tests). Second grep: >= 10 files with typed catch blocks. Third grep: finds `CLIResult` interface definition in cli.test.ts.
- **Evidence:** Plans 02-04 all include must_haves.truths requiring "Type annotations added to mock factories, local helper functions, and test fixture variables" and "Type annotations added to mock factories, local helper functions, and complex test fixtures." A file renamed without annotations is a nominal migration, not a TypeScript migration.
- **Correlation with full metric:** MEDIUM — annotation presence is a structural proxy for type safety. The actual benefit (catching type errors at compile time) manifests over time as source types change. The annotation presence check confirms the migration was substantive.
- **Blind spots:** Annotation presence doesn't verify annotation correctness — a `as any` cast satisfies the structural check while providing no type safety. The tsc strict check (S1/S2) partially catches this, but explicit `any` escapes strict mode.
- **Validated:** No — awaiting deferred validation at Phase 65.

### P5: `npm run lint` Passes on Migrated Test Files

- **What:** ESLint reports no errors on migrated `.test.ts` files
- **How:** Run the project linter after Plan 04 completes
- **Command:** `npm run lint`
- **Target:** Exit code 0. The typescript-eslint rules (configured in Phase 58) apply to `.ts` files: `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any` (warn-level). Zero errors; warnings are acceptable if pre-existing.
- **Evidence:** Plan 04 Task 3 step 6 explicitly requires `npm run lint` as part of final verification. The eslint.config.js configured in Phase 58-02 uses `projectService: true` for type-aware linting, meaning lint errors on `.test.ts` files reflect genuine type issues, not just style.
- **Correlation with full metric:** MEDIUM — lint is a static check that catches common patterns (unused typed vars, explicit `any` without justification) but does not catch all type safety issues. It complements tsc rather than replacing it.
- **Blind spots:** ESLint does not run on `.test.js` files by default (the lint config targets `lib/**/*.ts` and `bin/**/*.ts`). If tests/unit/ is not in the lint glob, this check catches nothing. Verify the lint config includes test files, or this proxy has no signal.
- **Validated:** No — awaiting deferred validation at Phase 65.

### P6: `sample.test.ts` Still Passes Unchanged (Regression Anchor)

- **What:** The pre-existing `tests/unit/sample.test.ts` (created in Phase 58-03 as the first `.ts` test file) continues to pass throughout the migration — it is the regression anchor for ts-jest configuration
- **How:** Run the sample test at the start and end of the migration
- **Command:**
  ```bash
  npx jest tests/unit/sample.test.ts --no-coverage
  ```
- **Target:** PASS — all tests in the file pass
- **Evidence:** Plan 01 Task 1 verify step uses this file as the sanity check: "sample.test.ts must pass (Level 1: Sanity)." If ts-jest configuration breaks during migration (e.g., tsconfig.json changes break the transform), this file is the first to show it.
- **Correlation with full metric:** HIGH as an early-warning indicator — this file has no dependency on the migrated helpers or source modules. Its failure means the ts-jest pipeline itself is broken, not just one migrated file.
- **Blind spots:** This file tests a trivial sample module — it does not exercise the complex mock patterns in the real test files.
- **Validated:** No — awaiting deferred validation at Phase 65.

### P7: Integration Test Subprocess Helpers Typed (Plan 04)

- **What:** The `cli.test.ts` and `golden.test.ts` files define typed `CLIResult` interface and `runCLI(args: string[], cwd: string): CLIResult` helper
- **How:** Check for the interface and function signature in the migrated files
- **Command:**
  ```bash
  grep "interface CLIResult" /Users/neo/Developer/Projects/GetResearchDone/tests/integration/cli.test.ts
  grep "interface CLIResult" /Users/neo/Developer/Projects/GetResearchDone/tests/integration/golden.test.ts
  grep "runCLI.*string\[\].*string.*CLIResult" /Users/neo/Developer/Projects/GetResearchDone/tests/integration/cli.test.ts
  ```
- **Target:** Each grep returns at least one matching line
- **Evidence:** Plan 04 Task 1 explicitly defines the `CLIResult` interface and typed `runCLI` signature as the primary migration deliverable for integration tests. REQ-77 requires "type subprocess spawn helpers." These helpers are the most complex typing challenge in the phase — subprocess error catch blocks need explicit `err as { stdout?: string; status?: number }` patterns.
- **Correlation with full metric:** HIGH for subprocess typing specifically — if CLIResult exists and the function is typed, the pattern is in place. The integration tests passing (P1) confirms the typing doesn't break behavior.
- **Blind spots:** Checks only cli.test.ts and golden.test.ts. The other integration files (e2e-workflow, evolve-e2e, npm-pack, worktree-parallel) are not independently verified by this grep. Their pass/fail status in P1 is the actual signal.
- **Validated:** No — awaiting deferred validation at Phase 65.

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring Phase 65 integration environment.

### D1: Test Suite Runs Under Plain Node Without ts-jest — DEFER-64-01

- **What:** All migrated `.test.ts` files can be executed by Jest without ts-jest transform (i.e., after compilation to `.js` via `tsc`) and produce the same results
- **How:** Build the test files using `tsconfig.build.json` targeting a `tests-dist/` output, then run Jest against the compiled output with no transform
- **Why deferred:** The current test setup relies on ts-jest to transform `.ts` files on-the-fly. The migrated tests have never been compiled by tsc to raw `.js` and executed without the ts-jest intermediary. This is the same gap as DEFER-59-01 — the CJS interop under plain Node is unvalidated. In Phase 65, after REQ-64 CI pipeline adaptation, the full build pipeline will be exercised.
- **Validates at:** Phase 65 (Integration Validation & Documentation)
- **Depends on:** Phase 65 must configure a dist/-based test execution path; tsconfig.build.json must be extended to include test files
- **Target:** Same test count and pass rate as ts-jest execution (2,661+ passing, zero new failures)
- **Risk if unmet:** If the dist/ compilation of test files reveals TypeScript emit differences (e.g., `require()` path rewriting issues, `as const` narrowing differences), individual tests may fail. This would require adjusting specific annotations in affected test files. Risk is LOW — prior phases have established that ts-jest and tsc emit compatible CJS for lib/ modules.
- **Fallback:** Retain ts-jest as the sole test execution path for v0.3.0; dist/-based test execution deferred to a future milestone.

### D2: Coverage Thresholds Stable After Phase 65 Source Changes — DEFER-64-02

- **What:** Per-file coverage thresholds in `jest.config.js` remain met after Phase 65 modifies source files (REQ-64, REQ-78, REQ-80, REQ-81 may add or change lib/ code)
- **How:** Run `npm test -- --coverage` at the conclusion of Phase 65 and confirm zero threshold violations
- **Why deferred:** Phase 65 (Integration Validation & Documentation) will touch source files for documentation and final integration changes. Any new uncovered code paths in lib/ modules could push coverage below thresholds. This is not a Phase 64 issue — it validates that Phase 64's migration produced a stable coverage baseline that Phase 65 preserves.
- **Validates at:** Phase 65 (Integration Validation & Documentation)
- **Depends on:** Phase 65 complete with all source file changes finalized
- **Target:** Zero threshold violations in jest.config.js's 22 per-file thresholds after Phase 65 changes
- **Risk if unmet:** Phase 65 adds new lib/ code paths not covered by tests. Would require either adding test cases or lowering thresholds. The preference is always to add tests. Risk is MEDIUM — prior phases have occasionally required threshold adjustments (e.g., tracker.ts lowered from 85% to 84% in Phase 61-02).
- **Fallback:** Lower specific thresholds for affected modules with documented rationale in jest.config.js comments.

---

## Ablation Plan

No ablation plan applies to this phase. Phase 64 is a 1:1 rename-and-annotate migration. Every test file keeps all its test cases and assertions; the only changes are:
1. File extension `.js` → `.ts`
2. Type annotations added to helper functions, mock factories, and catch blocks
3. No logic changes, no test case additions or removals

There are no sub-components to isolate or alternative approaches to compare. The CJS proxy helper pattern (Plan 01) is established practice from Phases 59-63 — no ablation of this pattern is warranted. The ts-jest transform was configured in Phase 58-03 and is validated by the existing `sample.test.ts`.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 64 modifies only `tests/` directory files and `tsconfig.json`; no HTML, JSX, TSX, Vue, Svelte, CSS, or frontend route files are in scope.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Total tests pre-migration | Test count entering Phase 64 | 2,676 total (2,661 passing, 15 pre-existing failures) | STATE.md Phase 63 final verification (63-04-SUMMARY.md) |
| Test suite pass rate pre-migration | `npm test` result before any Phase 64 changes | 2,661/2,676 (99.4%) | 63-04-SUMMARY.md: "2661/2676 tests passing" |
| tsc --noEmit pre-migration | TypeScript compile state entering Phase 64 | 0 errors (tests excluded from tsconfig; lib/ + bin/ all clean from Phase 63) | 63-04-SUMMARY.md: "tsc --noEmit Zero errors" |
| Coverage baseline | Per-file thresholds in jest.config.js | All 22 thresholds met | jest.config.js (as of Phase 63 completion) |
| Pre-existing failures (excluded from regression signal) | npm-pack Node v24 failures + evolve-e2e flaky | 15 tests (2 npm-pack + 1 evolve-e2e + others) | DEFER-59-01, 63-04-SUMMARY.md |

---

## Evaluation Scripts

**Location of evaluation code:** All evaluation is via existing project tooling; no new scripts are required.

**How to run full Level 1 + Level 2 evaluation (post-Plan-04):**

```bash
# Level 1 — Sanity checks
# S1: Full tsc including tests
npx tsc --noEmit

# S3: Helper CJS proxy structure
grep "require.*setup\.ts" /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/setup.js
grep "require.*fixtures\.ts" /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/fixtures.js

# S4: Typed helper exports
grep "ExitSentinelError" /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/setup.ts
grep "captureOutput.*CaptureResult" /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/setup.ts

# S5: tsconfig includes tests
node -e "const t=require('./tsconfig.json'); console.log('include:', JSON.stringify(t.include)); console.log('exclude:', JSON.stringify(t.exclude))"

# S6: No .test.js files remain
find /Users/neo/Developer/Projects/GetResearchDone/tests -name '*.test.js' | wc -l

# S7: No .js helper files remain
ls /Users/neo/Developer/Projects/GetResearchDone/tests/helpers/*.js 2>&1

# Level 2 — Proxy metrics
# P1 + P2: Full suite pass rate and test count
npm test 2>&1 | grep -E "Tests:.*passed|Test Suites:"

# P3: Coverage thresholds
npm test -- --coverage 2>&1 | grep -E "(FAIL|threshold)"

# P4: Type annotation presence
grep -l "ExitSentinelError\|CaptureResult\|as ExitSentinelError" /Users/neo/Developer/Projects/GetResearchDone/tests/unit/*.ts | wc -l
grep -l "catch.*unknown" /Users/neo/Developer/Projects/GetResearchDone/tests/unit/*.ts | wc -l

# P5: Lint
npm run lint

# P6: Sample test anchor
npx jest tests/unit/sample.test.ts --no-coverage

# P7: Integration subprocess types
grep "interface CLIResult" /Users/neo/Developer/Projects/GetResearchDone/tests/integration/cli.test.ts
grep "interface CLIResult" /Users/neo/Developer/Projects/GetResearchDone/tests/integration/golden.test.ts
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: tsc --noEmit (with tests included) | | | |
| S2: Per-file tsc (per plan, each migrated file) | | | |
| S3: Helper CJS proxy pattern (2/2 files) | | | |
| S4: Typed helper exports present | | | |
| S5: tsconfig.json includes tests/**/*.ts | | | |
| S6: Zero .test.js files remaining (post-P03 unit, post-P04 all) | | | |
| S7: Zero .js helper files remaining (post-P04) | | | |
| S8: Each file passes individually before next migrated | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Full test suite pass rate | 2,661/2,676 (0 new failures) | | | |
| P2: Total test count | >= 2,676 | | | |
| P3: Per-file coverage thresholds | 0 violations (22 files) | | | |
| P4: Type annotations present | >= 5 files w/ ExitSentinelError; >= 10 w/ typed catch | | | |
| P5: npm run lint | Exit 0 | | | |
| P6: sample.test.ts passes (regression anchor) | PASS | | | |
| P7: CLIResult interface in integration tests | Found in cli.test.ts + golden.test.ts | | | |

### Ablation Results

No ablation — not applicable to this migration phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-64-01 | Test suite runs under plain Node without ts-jest | PENDING | Phase 65 |
| DEFER-64-02 | Coverage thresholds stable after Phase 65 source changes | PENDING | Phase 65 |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — tsc compilation is a hard binary check; CJS proxy grep is direct; test file existence checks are direct counts. The per-file individual run requirement (S8) is the most important regression safeguard and is explicitly required by the plans.
- Proxy metrics: Well-evidenced — P1 (full suite pass) and P2 (test count) are the gold standard for a test migration: if the count holds and all previously-passing tests still pass, the migration is behaviorally complete. P3 (coverage thresholds) provides a secondary signal that test cases weren't silently dropped. P4 (annotation presence) is a MEDIUM-confidence proxy for type quality — annotations can be present but trivial. P5 (lint) is a MEDIUM-confidence cross-check.
- Deferred coverage: Two items — one (DEFER-64-01) is the same plain-Node CJS gap that exists for all Phase 59-63 migrations; one (DEFER-64-02) is a forward-looking stability check. Both are specific, bounded, and have clear validates_at references.

**What this evaluation CAN tell us:**
- The TypeScript migration is type-correct under strict mode for test files (S1/S2)
- The CJS proxy helper chain resolves correctly so in-progress JS test files keep working (S3)
- The full test suite has zero behavioral regressions from the migration (P1, P2)
- No test cases were silently dropped — coverage thresholds remain met (P3)
- Type annotations were substantively added, not just the file renamed (P4, P7)
- The ts-jest transform pipeline continues to work throughout migration (P6)
- Integration test subprocess helpers are properly typed (P7)

**What this evaluation CANNOT tell us:**
- Whether migrated test files work correctly under plain Node without ts-jest transform (deferred to Phase 65 via DEFER-64-01)
- Whether Phase 65 source changes will destabilize the coverage thresholds (deferred to Phase 65 via DEFER-64-02)
- Whether type annotations added to mock factories are accurate enough to catch real future bugs — this is the long-term benefit of TypeScript that only manifests when source types change after the migration

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-02*
