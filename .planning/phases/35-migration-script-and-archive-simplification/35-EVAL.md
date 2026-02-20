# Evaluation Plan: Phase 35 — Migration Script & Archive Simplification

**Designed:** 2026-02-20
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** cmdMigrateDirs (new), cmdMilestoneComplete (simplified), CLI routing (migrate-dirs)
**Reference papers:** None — this is a tooling/infrastructure phase with no external paper methodology

## Evaluation Overview

Phase 35 delivers three concrete, testable artifacts: the `cmdMigrateDirs` function that physically moves old-style `.planning/` subdirectories into the milestone-scoped hierarchy; a simplified `cmdMilestoneComplete` that avoids redundant archiving when phases are already in the correct location; and the CLI wiring that exposes `migrate-dirs` as a `grd-tools` subcommand.

Because this is a pure infrastructure phase with no performance model or benchmark dataset, there are no paper-derived metrics and no domain-specific quality scores to chase. Success is binary and structural: does the migration move the right files to the right places, does it do so idempotently, and does nothing in the existing 1,615-test suite regress? These properties are fully testable within the phase itself.

The deferred validations that remain — real-world execution against a live project with old-style layout, and the full integration sweep in Phase 36 — are deferred because they require an actual pre-migration filesystem state that cannot be fabricated in unit test fixtures without significant risk of false confidence. The TDD proxy suite provides strong evidence for correctness; Phase 36 validates the end-to-end contract.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit test pass rate (cmdMigrateDirs — 10 cases) | Plan 35-01 TDD specification | Directly exercises REQ-61, REQ-62, REQ-63 with file I/O |
| Unit test pass rate (cmdMilestoneComplete — 3 new cases) | Plan 35-02 TDD specification | Directly exercises REQ-59, REQ-60 |
| Full test suite regression count | npm test baseline (1,615 tests) | Zero-regression guarantee for milestone v0.2.1 |
| Lint error count | eslint.config.js enforcement | Code quality gate; pre-commit hook requires 0 |
| Format check | Prettier defaults | Consistency gate; CI-safe |
| CLI help text includes migrate-dirs | Plan 35-03 wiring | Confirms command is registered and discoverable |
| lib/commands.js coverage (lines) | jest.config.js threshold: 80% lines | Per-file coverage enforcement; blocks if dropped |
| lib/phase.js coverage (lines) | jest.config.js threshold: 80% lines | Per-file coverage enforcement; blocks if dropped |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic existence, exportability, CLI availability, format/lint pass |
| Proxy (L2) | 5 | TDD test suites, full regression suite, coverage thresholds |
| Deferred (L3) | 2 | Real-world migration on live project; Phase 36 integration sweep |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: cmdMigrateDirs is exported from lib/commands.js
- **What:** The function exists in source and is in the module.exports object
- **Command:** `node -e "const { cmdMigrateDirs } = require('./lib/commands'); console.log(typeof cmdMigrateDirs)"`
- **Expected:** `function`
- **Failure means:** Plan 35-01 Task 2 was not completed or export was omitted

### S2: migrate-dirs appears in CLI help text
- **What:** The command is registered in the grd-tools.js router and usage string
- **Command:** `node bin/grd-tools.js 2>&1 | grep -o 'migrate-dirs'`
- **Expected:** `migrate-dirs`
- **Failure means:** Plan 35-03 Task 1 wiring step was not completed

### S3: migrate-dirs produces JSON output without crashing
- **What:** The command runs to completion when invoked against a directory with no old-style layout
- **Command:** `node bin/grd-tools.js migrate-dirs 2>&1 | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ JSON.parse(d); console.log('valid JSON'); })"`
- **Expected:** `valid JSON` (exit code 0, parseable JSON)
- **Failure means:** cmdMigrateDirs throws an uncaught error or writes non-JSON output

### S4: archived.json is written after cmdMilestoneComplete for new-style layout
- **What:** The archive marker file exists at the expected path after milestone completion
- **Command:** Run in a temp directory with `.planning/milestones/v1.0/phases/01-test/` containing one plan file; call `cmdMilestoneComplete(tmpDir, 'v1.0', {}, false)` and check `fs.existsSync(path.join(tmpDir, '.planning/milestones/v1.0/archived.json'))`
- **Expected:** `true`
- **Failure means:** Plan 35-02 Task 2 Change 2 (archive marker) was not implemented

### S5: npm run lint passes with zero errors
- **What:** ESLint reports no errors on bin/ and lib/ after Phase 35 changes
- **Command:** `npm run lint 2>&1 | tail -5`
- **Expected:** Exit code 0, no error lines
- **Failure means:** New code in lib/commands.js or lib/phase.js violates ESLint rules (pre-commit hook would also block)

### S6: npm run format:check passes
- **What:** Prettier finds no formatting violations in modified files
- **Command:** `npm run format:check 2>&1 | tail -5`
- **Expected:** Exit code 0
- **Failure means:** New code was not formatted before commit; run `npm run format` to fix

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and non-regression.
**IMPORTANT:** These TDD proxy metrics directly exercise the intended behavior with real file I/O, giving them high correlation with the actual success criteria. They are not validated substitutes for real-world migration, which is deferred.

### P1: cmdMigrateDirs TDD suite — 10 test cases
- **What:** Unit tests covering all specified migration behaviors: move phases, research, codebase, todos (to milestone-scoped), quick (to anonymous), idempotency, skip-missing, anonymous-fallback, mkdir-on-demand, merge-without-overwrite
- **How:** Jest test suite in describe('cmdMigrateDirs') within tests/unit/commands.test.js
- **Command:** `npx jest tests/unit/commands.test.js -t "cmdMigrateDirs" --no-coverage 2>&1 | tail -10`
- **Target:** 10 passing, 0 failing
- **Evidence:** Plan 35-01 explicitly specifies all 10 test cases; each corresponds 1:1 to an atomic REQ-61/62/63 behavior
- **Correlation with full metric:** HIGH — tests use real fs operations in temp directories; they exercise the same code path as live migration
- **Blind spots:** Tests use synthetic `.planning/` layouts; a real project may have additional files or symlinks not covered; merge behavior with deeply nested structures is not explicitly tested
- **Validated:** No — awaiting deferred validation at phase-36-integration

### P2: cmdMilestoneComplete TDD suite — 3 new test cases + existing regression guard
- **What:** New tests for skip-archive-when-in-place (REQ-59), archived.json marker creation (REQ-60), and marker field validation; plus confirmation that all pre-existing cmdMilestoneComplete tests still pass
- **How:** Jest test suite in describe('cmdMilestoneComplete') within tests/unit/phase.test.js
- **Command:** `npx jest tests/unit/phase.test.js -t "cmdMilestoneComplete" --no-coverage 2>&1 | tail -10`
- **Target:** All tests passing including 3 new + all existing (no regression count > 0)
- **Evidence:** Plan 35-02 specifies tests 1-3 as new and explicitly mandates existing tests remain passing as backward-compat coverage
- **Correlation with full metric:** HIGH for archive marker and skip-copy behavior; MEDIUM for real-world timing edge cases (date field in marker)
- **Blind spots:** Tests use one-liner plan frontmatter; stat-gathering from milestonePhaseDir (phase count, plan count, task count) may diverge from real project structures
- **Validated:** No — awaiting deferred validation at phase-36-integration

### P3: Full test suite — zero regressions
- **What:** All 1,615 existing tests continue to pass after Phase 35 changes
- **How:** Run complete Jest suite with coverage
- **Command:** `npm test 2>&1 | tail -20`
- **Target:** 1,615+ tests passing, 0 failing; all per-file coverage thresholds met (commands.js: 80% lines / 90% funcs / 60% branches; phase.js: 80% lines / 85% funcs / 60% branches)
- **Evidence:** Baseline confirmed 1,615 tests passing immediately before Phase 35. Any new cmdMigrateDirs tests added by Plan 35-01 will raise the total count. Regression count must be exactly 0.
- **Correlation with full metric:** HIGH — the full suite directly tests all existing lib/ behaviors; any regression indicates Phase 35 broke existing functionality
- **Blind spots:** Golden tests snapshot CLI output; if output format changes, they may fail for reasons unrelated to correctness. Integration tests may be slower under load.
- **Validated:** No — deferred full integration confirmed at phase-36

### P4: Coverage thresholds — lib/commands.js and lib/phase.js not degraded
- **What:** Per-file coverage for the two primarily modified files meets jest.config.js thresholds after Phase 35 additions
- **How:** Extract per-file coverage from npm test output
- **Command:** `npm test -- --coverage 2>&1 | grep -E "commands\.js|phase\.js"`
- **Target:** commands.js >= 80% lines, >= 90% funcs, >= 60% branches; phase.js >= 80% lines, >= 85% funcs, >= 60% branches (current: commands.js 89.14% lines; phase.js 83.04% lines)
- **Evidence:** jest.config.js enforces these thresholds; test suite will fail if dropped
- **Correlation with full metric:** MEDIUM — coverage measures what tests exercise, not that tests assert correctly; cmdMigrateDirs tests with real fs operations will add statement coverage but branch coverage depends on test completeness
- **Blind spots:** Coverage cannot distinguish a correct assertion from a missing assertion; a test that calls the code but asserts nothing contributes to coverage
- **Validated:** No

### P5: Integration test for migrate-dirs CLI invocation
- **What:** End-to-end subprocess test that invokes `node bin/grd-tools.js migrate-dirs` in a real temp directory and validates JSON output structure
- **How:** Jest integration test in tests/integration/cli.test.js following existing subprocess pattern
- **Command:** `npx jest tests/integration/cli.test.js -t "migrate-dirs" --no-coverage 2>&1 | tail -5`
- **Target:** 1 test passing
- **Evidence:** Plan 35-03 Task 2 specifies this test; it validates the full CLI path (router -> cmdMigrateDirs -> JSON output) rather than just the unit function
- **Correlation with full metric:** HIGH for CLI wiring; MEDIUM for complete migration correctness (temp dir setup in integration test may be simpler than real project)
- **Blind spots:** Integration test may not exercise `--raw` flag or error paths
- **Validated:** No — awaiting real-world migration validation at phase-36

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring a live project with an actual old-style layout, or the completed Phase 36 integration sweep.

### D1: Real-world migration on a live project with old-style .planning/ layout — DEFER-35-01
- **What:** Run `grd-tools migrate-dirs` against an actual GRD project that has never been upgraded to the milestone-scoped hierarchy, and verify all directories end up in the correct locations with no data loss
- **How:** Identify or construct a test project with pre-v0.2.1 directory layout; run migrate-dirs; manually inspect all moved directories; verify backward-compatible path resolution works via paths.js after migration
- **Why deferred:** No such live project exists in the current test environment; constructing one from scratch in Phase 35 would be a fixture, not a real-world test; the risk of subtle file-system edge cases (symlinks, permissions, non-ASCII filenames) is only observable in a real project
- **Validates at:** phase-36-integration
- **Depends on:** Phase 36 test infrastructure; a real or realistic pre-migration project fixture
- **Target:** Zero files lost, zero data corrupted; all paths.js functions resolve correctly after migration; second run produces `already_migrated: true`
- **Risk if unmet:** If merge logic corrupts files or silently skips entries, data loss could occur in real user upgrades. Impact: HIGH. Fallback: add explicit content-hash verification to migration output before v0.2.1 release.

### D2: End-to-end milestone completion flow with new-style layout — DEFER-35-02
- **What:** Complete a full milestone cycle — create phases under `.planning/milestones/{version}/phases/`, then call `cmdMilestoneComplete` — and verify (a) no redundant copy occurs, (b) archived.json is written with correct fields, (c) milestone is distinguishable from active ones in subsequent grd-tools commands
- **How:** Phase 36 integration test or E2E workflow test that exercises the complete v0.2.1 lifecycle
- **Why deferred:** Requires the full Phase 33-35 stack to be functional end-to-end; in Phase 35, cmdMilestoneComplete is tested with synthetic phase directories that may not match real plan frontmatter formats
- **Validates at:** phase-36-integration
- **Depends on:** Phase 36 test update sweep; real phase directories with proper frontmatter for stat-gathering (phaseCount, totalPlans, totalTasks, accomplishments)
- **Target:** archived.json contains correct version, archived_date, phases count, plans count; `.planning/milestones/v0.2.1-phases/` does NOT exist (no redundant copy); `.planning/milestones/v0.2.1/phases/` still intact
- **Risk if unmet:** If stat-gathering from milestonePhaseDir produces incorrect counts, MILESTONES.md summary will be inaccurate. Impact: LOW (cosmetic). Fallback: correct stat-gathering logic in Phase 36 fixup.

## Ablation Plan

**No ablation plan** — Phase 35 implements two distinct but non-overlapping components (cmdMigrateDirs and cmdMilestoneComplete simplification) and one wiring step. There are no sub-components within cmdMigrateDirs to isolate via ablation, and the TDD approach already verifies each behavior independently via individual test cases.

The closest analog to an ablation is the backward-compat condition in cmdMilestoneComplete (old-style layout still triggers copy+delete), which is covered by the existing test at ~line 382 of phase.test.js.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test count | Total passing tests before Phase 35 | 1,615 | STATE.md / npm test 2026-02-20 |
| Test suites | Total test suites | 32 | npm test 2026-02-20 |
| lib/commands.js line coverage | Pre-Phase-35 coverage | 89.14% | npm test coverage report |
| lib/phase.js line coverage | Pre-Phase-35 coverage | 83.04% | npm test coverage report |
| Lint errors | Pre-Phase-35 baseline | 0 | npm run lint |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/commands.test.js       (P1: cmdMigrateDirs TDD suite — created in Plan 35-01)
tests/unit/phase.test.js          (P2: cmdMilestoneComplete new tests — added in Plan 35-02)
tests/integration/cli.test.js     (P5: migrate-dirs integration test — added in Plan 35-03)
```

**How to run full evaluation:**
```bash
# Sanity checks (S1-S4 require node invocation; S5-S6 are npm scripts)
node -e "const { cmdMigrateDirs } = require('./lib/commands'); console.log(typeof cmdMigrateDirs)"
node bin/grd-tools.js 2>&1 | grep -o 'migrate-dirs'
npm run lint
npm run format:check

# Proxy metrics
npx jest tests/unit/commands.test.js -t "cmdMigrateDirs" --no-coverage
npx jest tests/unit/phase.test.js -t "cmdMilestoneComplete" --no-coverage
npx jest tests/integration/cli.test.js -t "migrate-dirs" --no-coverage
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: cmdMigrateDirs exported | [PASS/FAIL] | | |
| S2: migrate-dirs in help text | [PASS/FAIL] | | |
| S3: migrate-dirs JSON output | [PASS/FAIL] | | |
| S4: archived.json written | [PASS/FAIL] | | |
| S5: Lint passes | [PASS/FAIL] | | |
| S6: Format check passes | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: cmdMigrateDirs TDD (10 cases) | 10/10 pass | | [MET/MISSED] | |
| P2: cmdMilestoneComplete TDD (3 new + existing) | 0 regressions | | [MET/MISSED] | |
| P3: Full suite regression count | 0 regressions | | [MET/MISSED] | |
| P4: commands.js coverage (lines) | >= 80% | | [MET/MISSED] | |
| P4: phase.js coverage (lines) | >= 80% | | [MET/MISSED] | |
| P5: migrate-dirs integration test | 1/1 pass | | [MET/MISSED] | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-35-01 | Real-world migration on live project | PENDING | phase-36-integration |
| DEFER-35-02 | End-to-end milestone complete (new-style layout) | PENDING | phase-36-integration |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 6 checks cover existence, CLI wiring, JSON output validity, lint, and format. These are fast, deterministic, and directly test the observable outputs of the phase.
- Proxy metrics: Well-evidenced — the TDD approach means each proxy test case was written before implementation, eliminating the risk of tests written to match buggy implementation. Tests use real filesystem operations in temp directories, giving them strong correlation with the actual migration contract. Full regression suite (P3) provides the non-regression guarantee with direct evidence (1,615 baseline tests).
- Deferred coverage: Partial — DEFER-35-01 (real-world migration) and DEFER-35-02 (E2E milestone lifecycle) cover the two scenarios where synthetic test fixtures may diverge from reality. Both are scheduled for Phase 36 and have explicit fallback mitigations.

**What this evaluation CAN tell us:**
- Whether cmdMigrateDirs correctly handles all 10 specified migration scenarios (including idempotency and anonymous fallback) under synthetic filesystem conditions
- Whether cmdMilestoneComplete correctly skips redundant archiving and writes the archived.json marker
- Whether Phase 35 changes introduce any regressions in the 1,615-test baseline
- Whether the CLI router correctly dispatches `migrate-dirs` to cmdMigrateDirs and produces parseable JSON

**What this evaluation CANNOT tell us:**
- Whether the merge logic handles edge cases not in test fixtures (symlinks, empty subdirectories, non-ASCII filenames) — addressed in DEFER-35-01 at phase-36-integration
- Whether stat-gathering for phaseCount/totalPlans/totalTasks works correctly from milestonePhaseDir with real project plan files — addressed in DEFER-35-02 at phase-36-integration
- Whether the `--raw` flag produces correct human-readable output format (integration test may not cover this path) — should be added to Phase 36 sweep

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-20*
