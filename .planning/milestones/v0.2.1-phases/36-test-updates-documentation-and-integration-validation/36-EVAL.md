# Evaluation Plan: Phase 36 — Test Updates, Documentation & Integration Validation

**Designed:** 2026-02-20
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Test fixture migration, unit/golden/integration test updates, CLAUDE.md hierarchy documentation, deferred validation resolution (DEFER-34-01, DEFER-35-01, DEFER-35-02)
**Reference papers:** None — this is a pure integration and validation phase with no external paper methodology

## Evaluation Overview

Phase 36 is the integration closure of milestone v0.2.1. Its three core responsibilities are: (1) merge Phases 34 and 35 into main and ensure zero regressions across the 1,615-test baseline; (2) update every test fixture, unit test, golden test, and integration test that still references old-style `.planning/phases/` paths to use the new milestone-scoped hierarchy; and (3) update CLAUDE.md and docs to accurately document the new structure, and resolve the three deferred validations carried forward from Phases 34 and 35.

Because Phase 36 is a test and documentation maintenance phase, not a behavioral feature phase, there are no external benchmarks or paper metrics. Success is measured entirely by structural and functional properties: are old-path references eliminated from test files, do all tests pass after migration, and do the three deferred end-to-end scenarios produce the correct outcomes?

The evaluation design accordingly has no domain-specific proxy metrics. It relies on grep-based structural checks (can be computed immediately) and the test suite itself (the authoritative regression oracle). The three deferred validations from Phases 34 and 35 transition from PENDING to RESOLVED here — this is the first phase where the full Phase 32-35 stack is integrated and those end-to-end scenarios can actually execute.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Old-path reference count in tests/ | REQ-64, REQ-65 | Directly measures migration completeness |
| Old-path reference count in docs/ | REQ-68, REQ-69 | Directly measures documentation accuracy |
| Total tests passing / failing | REQ-66 | Zero-regression guarantee for v0.2.1 |
| DEFER-34-01 resolution | Phase 34 deferral | End-to-end milestone-scoped paths from init commands |
| DEFER-35-01 resolution | Phase 35 deferral | Real-world migrate-dirs on old-style layout |
| DEFER-35-02 resolution | Phase 35 deferral | End-to-end milestone completion with archived.json |
| Lint error count | ESLint config | Code quality gate; pre-commit hook enforces 0 |
| Format compliance | Prettier defaults | CI consistency gate |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Branch integrity, lint/format pass, test-suite viability, structural existence |
| Proxy (L2) | 6 | Old-path grep audit, test suite pass/regression count, deferred validation scenarios |
| Deferred (L3) | 0 | All prior deferrals resolve in this phase — no new deferrals created |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Merge commits present on main
- **What:** Both Phase 34 and Phase 35 feature branches have been merged into main with no-ff merge commits
- **Command:** `git log --oneline -10 | grep -E "phase (34|35)|Merge phase (34|35)"`
- **Expected:** At least two merge commit lines visible; no "CONFLICT" lines in git status
- **Failure means:** Plan 36-01 Task 1 was not completed or merge conflicts were not resolved

### S2: npm run lint exits 0
- **What:** ESLint reports zero errors on bin/ and lib/ after Phase 34+35 code is merged
- **Command:** `npm run lint 2>&1 | tail -5`
- **Expected:** Exit code 0, no error lines in output
- **Failure means:** Phase 34 or 35 changes introduced ESLint violations; run `npm run lint:fix` to identify and fix

### S3: npm run format:check exits 0
- **What:** Prettier finds no formatting violations in modified files
- **Command:** `npm run format:check 2>&1 | tail -5`
- **Expected:** Exit code 0
- **Failure means:** Phase 35 flagged 3 unformatted files; Plan 36-01 must run `npm run format` and commit before this passes

### S4: Test suite runs to completion without crash
- **What:** `npm test` produces a summary line with counts (passes, failures) and no process crash
- **Command:** `npm test 2>&1 | grep -E "Test Suites:|Tests:"`
- **Expected:** Two lines showing "Test Suites: N passed" and "Tests: N passed" — even if N has regressions, the suite must complete
- **Failure means:** A test file itself has a syntax error or import failure introduced by the merge; fix the failing file before proceeding

### S5: Test fixture directory uses milestone-scoped layout after Plan 36-02
- **What:** Old-style fixture paths no longer exist; new milestone-scoped paths do exist
- **Command:** `ls /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/fixtures/planning/milestones/anonymous/phases/ 2>/dev/null && echo EXISTS || echo MISSING`
- **Expected:** `EXISTS` (new path present)
- **Failure means:** Plan 36-02 Task 1 fixture migration was not completed

### S6: CLAUDE.md contains milestones/ in Planning Directory section after Plan 36-04
- **What:** The Planning Directory section in CLAUDE.md has been updated to show the new hierarchy
- **Command:** `grep -c 'milestones/' /Users/edward.seo/dev/private/project/harness/GetResearchDone/CLAUDE.md`
- **Expected:** Count >= 3 (multiple lines referencing milestones/ hierarchy)
- **Failure means:** Plan 36-04 Task 1 doc update was not completed

### S7: docs/CHANGELOG.md is unchanged
- **What:** The historical changelog is not modified — its old-path references are intentional history
- **Command:** `git diff HEAD -- docs/CHANGELOG.md | wc -l`
- **Expected:** `0` (no changes)
- **Failure means:** Plan 36-04 was too aggressive in updating docs; CHANGELOG.md historical entries must be preserved

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated metrics that directly measure migration completeness, regression safety, and deferred validation resolution.
**IMPORTANT:** These proxy metrics have high correlation with the actual success criteria because they measure the exact properties required by REQ-64 through REQ-69. They are not substitutes for human verification of content quality, but they are strong structural validators.

### P1: Zero old-path references in tests/unit/ after Plan 36-02
- **What:** No test file in tests/unit/ references `.planning/phases/`, `.planning/todos/`, `.planning/research/`, `.planning/codebase/`, or `.planning/quick/` (except test description string literals that are not path arguments)
- **How:** Grep for old-path patterns across unit test files
- **Command:** `grep -rn '\.planning/\(phases\|todos\|research\|codebase\|quick\)/' /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/unit/ 2>/dev/null | grep -v "milestones/" | wc -l`
- **Target:** 0
- **Evidence:** REQ-64 requires unit tests use new hierarchy; each remaining old-path reference is a test that would fail against a live new-hierarchy project
- **Correlation with full metric:** HIGH — old-path grep directly counts the migration gaps
- **Blind spots:** path.join() calls that construct paths programmatically may evade simple string grep; these require manual inspection of any remaining test setup code
- **Validated:** No — confirmed as PASS when deferred validations in Plan 36-04 run

### P2: Zero old-path references in tests/golden/ and tests/integration/ after Plan 36-03
- **What:** No file in tests/golden/ or tests/integration/ references old-style paths, except migrate-dirs tests in cli.test.js which intentionally use old-style directories as input
- **How:** Grep for old-path patterns in golden and integration directories, filtering for the intentional migrate-dirs exception
- **Command:** `grep -rn '\.planning/phases/' /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/integration/ /Users/edward.seo/dev/private/project/harness/GetResearchDone/tests/golden/ 2>/dev/null | grep -v "migrate-dirs" | wc -l`
- **Target:** 0
- **Evidence:** REQ-65 requires integration and golden tests use new hierarchy; migrate-dirs tests are explicitly excluded because they must test migration from the old layout
- **Correlation with full metric:** HIGH — direct count of remaining old-path gaps in golden/integration test layer
- **Blind spots:** Golden output JSON files (tests/golden/output/*.json) contain expected CLI output; these may have path fields that must also be updated — grep covers the JSON files too since they are text files
- **Validated:** No — awaiting full suite run in Plan 36-03

### P3: Full test suite — zero regressions after all plan merges
- **What:** All tests pass after the complete Phase 36 changes (Plans 01-04); test count at or above pre-Phase-36 baseline
- **How:** Run complete Jest suite with coverage; compare pass/fail counts to baseline
- **Command:** `npm test 2>&1 | grep -E "Tests:|Test Suites:"`
- **Target:** All tests passing, 0 failing; total count >= 1,615 (baseline before Phase 36 merge); all per-file coverage thresholds in jest.config.js met
- **Evidence:** Baseline confirmed at 1,615 tests passing (32 suites) immediately before Phase 36 on current main branch. REQ-66 mandates zero regressions. Any failure count > 0 is a blocker.
- **Correlation with full metric:** HIGH — the full test suite directly exercises all lib/ behaviors; any regression indicates a path migration error in test fixtures or test code
- **Blind spots:** Tests that were already broken before Phase 36 would not be detected as regressions; the 1,615 baseline is clean, so this is not a current concern. Coverage thresholds may not catch a correct-but-untested new code path.
- **Validated:** No — this is the primary gate; confirmed in Plan 36-03 and re-confirmed in Plan 36-04

### P4: DEFER-34-01 resolved — init commands produce milestone-scoped paths
- **What:** Running `grd-tools init execute-phase N` (or similar init commands) in a project with a named milestone produces JSON output where `phases_dir`, `research_dir`, `codebase_dir` fields all use the `milestones/{milestone}/` prefix
- **How:** Create a temp directory with a STATE.md containing a real milestone name (e.g., v1.0); run init commands; inspect JSON output fields
- **Command:** `cd $(mktemp -d) && mkdir -p .planning && printf '# State\n\n**Updated:** 2026-02-20\n\n## Current Position\n\n- **Active phase:** Phase 1\n- **Milestone:** v1.0 -- Foundation\n' > .planning/STATE.md && node /Users/edward.seo/dev/private/project/harness/GetResearchDone/bin/grd-tools.js init execute-phase 1 | node -e "const d=require('fs').readFileSync(0,'utf8'); const j=JSON.parse(d); console.log(j.phases_dir || j.phase_dir || 'NO_PATH_FIELD')"`
- **Target:** Output contains `milestones/v1.0/` in the path field
- **Evidence:** Phase 34 migrated all command files to consume init-derived path variables; lib/paths.js (Phase 32) and lib/context.js (Phase 33) provide the milestone-scoped fields. This deferred validation confirms the full chain from STATE.md -> paths.js -> context.js -> JSON output -> command consumption.
- **Correlation with full metric:** HIGH — this exercises the exact production code path that agents use to resolve directory locations at runtime
- **Blind spots:** Only tests one milestone name (v1.0); edge cases like anonymous milestone or milestone with special characters are covered by existing paths.js unit tests
- **Validated:** No — this is the deferred validation itself; confirmed RESOLVED when output contains milestones/v1.0/

### P5: DEFER-35-01 resolved — migrate-dirs succeeds on real old-style layout
- **What:** `grd-tools migrate-dirs` correctly migrates an actual old-style `.planning/` directory layout (phases, research, todos at top level) into the milestone-scoped hierarchy, and running it twice produces no change on the second run
- **How:** Create a temp directory with pre-migration layout (`.planning/phases/01-test/`, `.planning/research/`, `.planning/todos/pending/`); run migrate-dirs; verify all files appear at milestone-scoped locations; run migrate-dirs again; verify idempotency
- **Command:** See Plan 36-04 Task 2 — multi-step shell sequence in temp directory
- **Target:** First run: all source files appear at `.planning/milestones/{milestone}/phases/`, `.planning/milestones/{milestone}/research/`, `.planning/milestones/{milestone}/todos/`. Second run: output JSON shows `already_migrated: true` or equivalent no-op indicator; no files duplicated or deleted.
- **Evidence:** Phase 35 TDD suite tested this with synthetic fixtures; DEFER-35-01 validates the same logic against a more realistic project layout as specified in DEFER-35-01 from 35-EVAL.md
- **Correlation with full metric:** HIGH — directly exercises cmdMigrateDirs against a layout that more closely matches a real user project than the Phase 35 unit test fixtures
- **Blind spots:** This is a synthetic temp directory, not an actual user project; symlinks, nested directories with many files, and unusual file permissions are not tested
- **Validated:** No — confirmed RESOLVED when both runs succeed in Plan 36-04

### P6: DEFER-35-02 resolved — milestone completion writes archived.json, no redundant copy
- **What:** Calling `cmdMilestoneComplete` (or `grd-tools milestone complete`) on a project where phases are already under `.planning/milestones/{version}/phases/` writes `archived.json` into the milestone directory and does NOT create a redundant `.planning/milestones/{version}-phases/` copy
- **How:** Create a temp directory with milestone-scoped phases already in place; run milestone completion; verify archived.json exists and redundant archive does not
- **Command:** See Plan 36-04 Task 2 — multi-step shell sequence in temp directory
- **Target:** `archived.json` exists at `.planning/milestones/v1.0/archived.json` containing version, archived_date, and phase count fields; `.planning/milestones/v1.0-phases/` does NOT exist
- **Evidence:** Phase 35 Plan 35-02 implemented this behavior; DEFER-35-02 validates end-to-end with a realistic project directory rather than the minimal unit-test fixture
- **Correlation with full metric:** HIGH — directly tests the state transition that marks a milestone as complete in the new hierarchy
- **Blind spots:** The temp directory uses minimal plan frontmatter; the stat-gathering logic for accomplishments and task counts may produce lower counts than a real multi-plan phase
- **Validated:** No — confirmed RESOLVED when archived.json exists and redundant copy does not in Plan 36-04

## Level 3: Deferred Validations

**No new deferred validations.** Phase 36 is the terminal integration phase for milestone v0.2.1. All three deferred validations from prior phases (DEFER-34-01, DEFER-35-01, DEFER-35-02) are resolved here as Proxy metrics P4, P5, and P6.

If any of P4, P5, or P6 fail, the failure is addressed in a fixup commit within Phase 36 (not deferred to a future phase) because Phase 36 is the explicit validation point for these items.

## Ablation Plan

**No ablation plan** — Phase 36 is a migration and validation phase with no algorithm choices or component tradeoffs to isolate. The four plans execute sequentially with clear preconditions: merge (36-01) -> unit test migration (36-02, parallel with 36-03) -> doc update and deferred resolution (36-04).

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test count pre-Phase-36 | Total passing tests before Phase 36 merge | 1,615 | npm test on current main (2026-02-20) |
| Test suites | Total test suites before Phase 36 merge | 32 | npm test on current main (2026-02-20) |
| Lint errors | Pre-Phase-36 baseline | 0 | npm run lint on current main |
| Old-path refs in tests/ | Old-style path references in test files before Plan 36-02 | TBD by Plan 36-01 grep audit | Plan 36-01 Task 2 |
| Old-path refs in docs/ | Old-style path references in docs/ before Plan 36-04 | TBD by Plan 36-01 grep audit | Plan 36-01 Task 2 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/          (Plan 36-02: 8 unit test files updated)
tests/golden/        (Plan 36-03: capture.sh and output JSON files updated)
tests/integration/   (Plan 36-03: cli.test.js, golden.test.js updated)
CLAUDE.md            (Plan 36-04: Planning Directory section updated)
docs/long-term-roadmap-tutorial.md  (Plan 36-04: research path references updated)
```

**How to run full evaluation:**
```bash
# Sanity checks
git log --oneline -10 | grep -E "phase (34|35)|Merge phase (34|35)"
npm run lint
npm run format:check
npm test 2>&1 | grep -E "Test Suites:|Tests:"

# Proxy metric P1: old-path refs in unit tests
grep -rn '\.planning/\(phases\|todos\|research\|codebase\|quick\)/' tests/unit/ 2>/dev/null | grep -v "milestones/" | wc -l

# Proxy metric P2: old-path refs in golden/integration tests
grep -rn '\.planning/phases/' tests/integration/ tests/golden/ 2>/dev/null | grep -v "migrate-dirs" | wc -l

# Proxy metric P3: full suite
npm test

# Proxy metrics P4/P5/P6: deferred validation scenarios (run in temp dirs)
# See Plan 36-04 Task 2 for full step-by-step commands

# Documentation check
grep -c 'milestones/' CLAUDE.md
git diff HEAD -- docs/CHANGELOG.md | wc -l
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Merge commits present | [PASS/FAIL] | | |
| S2: npm run lint exits 0 | [PASS/FAIL] | | |
| S3: npm run format:check exits 0 | [PASS/FAIL] | | |
| S4: Test suite runs to completion | [PASS/FAIL] | | |
| S5: Fixture milestone-scoped layout exists | [PASS/FAIL] | | |
| S6: CLAUDE.md contains milestones/ hierarchy | [PASS/FAIL] | | |
| S7: docs/CHANGELOG.md unchanged | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Old-path refs in tests/unit/ | 0 | | [MET/MISSED] | |
| P2: Old-path refs in golden/integration | 0 (excl. migrate-dirs) | | [MET/MISSED] | |
| P3: Full test suite pass count | >= 1,615, 0 failures | | [MET/MISSED] | |
| P4: DEFER-34-01 — init milestone-scoped paths | Output contains milestones/v1.0/ | | [RESOLVED/FAILED] | |
| P5: DEFER-35-01 — migrate-dirs on old layout | All files at new locations, idempotent | | [RESOLVED/FAILED] | |
| P6: DEFER-35-02 — milestone completion archived.json | archived.json exists, no redundant copy | | [RESOLVED/FAILED] | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-34-01 | End-to-end init commands produce milestone-scoped paths | [PENDING/RESOLVED] | phase-36-integration (this phase) |
| DEFER-35-01 | Real-world migrate-dirs on old-style layout | [PENDING/RESOLVED] | phase-36-integration (this phase) |
| DEFER-35-02 | End-to-end milestone completion with archived.json | [PENDING/RESOLVED] | phase-36-integration (this phase) |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 7 checks cover branch integrity, toolchain (lint/format), test suite viability, structural fixture existence, documentation presence, and changelog preservation. All are fast and deterministic.
- Proxy metrics: Well-evidenced — P1 and P2 are direct grep counts of exactly the structural property required by REQ-64 and REQ-65; a count of 0 is unambiguous. P3 (full test suite) is the authoritative regression oracle. P4/P5/P6 are the deferred validations themselves, measured by running the exact production code paths on representative inputs.
- Deferred coverage: Complete — Phase 36 has no new deferrals. All three carried-forward deferrals (DEFER-34-01, DEFER-35-01, DEFER-35-02) are resolved as P4/P5/P6. After Phase 36, the v0.2.1 milestone has zero outstanding deferred validations from Phases 32-36.

**What this evaluation CAN tell us:**
- Whether all unit tests, golden tests, and integration tests have been migrated to use milestone-scoped paths (P1/P2)
- Whether Phase 34 and Phase 35 code integrates without regressions (P3)
- Whether the full Phase 32-35 stack produces milestone-scoped paths end-to-end from STATE.md through init output to command variables (P4)
- Whether the migrate-dirs command correctly handles a realistic pre-migration project layout (P5)
- Whether milestone completion in the new hierarchy produces the correct archived.json marker without creating a redundant copy (P6)
- Whether CLAUDE.md and docs accurately describe the new directory structure (S6, P2)

**What this evaluation CANNOT tell us:**
- Whether migrate-dirs handles edge cases not present in the temp directory fixture (symlinks, non-ASCII filenames, deeply nested directory trees) — these are accepted risks for v0.2.1; users with unusual layouts should inspect output before running
- Whether the new directory hierarchy causes any usability issues for users upgrading from pre-v0.2.1 projects — this is a user-acceptance concern addressed only through real-world usage after release
- Whether the CLAUDE.md documentation is clear and complete to a new contributor — content quality is not grep-measurable; it requires human review

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-20*
