# Evaluation Plan: Phase 32 — Centralized Path Resolution Module

**Designed:** 2026-02-20
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** TDD implementation of `lib/paths.js` — centralized `.planning/` path resolver
**Reference papers:** None applicable (infrastructure module; no ML/research paper)

## Evaluation Overview

Phase 32 is a pure infrastructure phase with no ML/research component and no benchmark datasets. The goal is to produce a correct, well-tested Node.js module (`lib/paths.js`) that centralizes all `.planning/` subdirectory path construction. Success is entirely measurable through software engineering metrics: module exports, path correctness, test coverage, and regression absence.

Because this is deterministic path logic with a complete specification in the PLAN.md, the evaluation can be performed almost entirely in-phase. Every function has a precise, stated contract (e.g., `phasesDir(cwd, 'v0.2.1')` must return `path.join(cwd, '.planning', 'milestones', 'v0.2.1', 'phases')`). This makes sanity checks highly specific and fully automatable.

There are no meaningful proxy metrics for this phase — the full evaluation is achievable in-phase via the test suite. The one deferred validation is whether downstream lib/ modules (Phases 33–36) successfully consume `paths.js` without regression, which requires integration work not available here.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Module exports (9 functions) | REQ-48, PLAN.md must_haves.artifacts | Direct contract fulfillment |
| `currentMilestone` correctness | REQ-49, PLAN.md truths | STATE.md parsing is the sole I/O operation |
| Path return values | REQ-46, REQ-47, REQ-48, PLAN.md truths | Pure path construction — deterministic, fully testable |
| Test line coverage >= 90% | REQ-67, jest.config.js pattern | Project standard for all lib/ modules |
| Test function coverage = 100% | PLAN.md Task 2 threshold | Small focused module; all functions must be tested |
| Test branch coverage >= 85% | PLAN.md Task 2 threshold | Branching is limited (milestone default logic) |
| Zero regressions (1,577+ tests) | REQ-66 (milestone-wide) | Foundation phase must not break existing behavior |
| No lib/ circular dependencies | PLAN.md truths | `lib/paths.js` must import only Node built-ins |
| Module line count >= 80 | PLAN.md must_haves.artifacts.min_lines | Completeness of implementation |
| Test line count >= 150 | PLAN.md must_haves.artifacts.min_lines | Completeness of test suite |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Basic functionality, format, and correctness verification |
| Proxy (L2) | 0 | No meaningful proxy needed — full verification is in-phase |
| Deferred (L3) | 1 | Cross-module consumption by lib/ modules (Phase 33) |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module Loads Without Error

- **What:** `lib/paths.js` can be required by Node without throwing
- **Command:** `node -e "const p = require('./lib/paths'); console.log(Object.keys(p).join(','))"`
- **Expected:** Prints `currentMilestone,milestonesDir,phasesDir,phaseDir,researchDir,codebaseDir,todosDir,quickDir,archivedPhasesDir` (all 9 exports, in any order)
- **Failure means:** Module has a syntax error, missing export, or runtime crash on load

### S2: All Nine Functions Are Exported

- **What:** Module exports exactly the nine functions specified in REQ-48 and REQ-49
- **Command:** `node -e "const p = require('./lib/paths'); const required = ['currentMilestone','milestonesDir','phasesDir','phaseDir','researchDir','codebaseDir','todosDir','quickDir','archivedPhasesDir']; const missing = required.filter(fn => typeof p[fn] !== 'function'); if (missing.length) { console.error('MISSING:', missing.join(',')); process.exit(1); } else { console.log('ALL EXPORTS OK'); }"`
- **Expected:** `ALL EXPORTS OK`
- **Failure means:** One or more required exports are absent or not functions

### S3: No lib/ Circular Dependencies

- **What:** `lib/paths.js` imports only Node built-in modules (`fs`, `path`) — no `require('./...')` of other lib/ modules
- **Command:** `node -e "const Module = require('module'); const orig = Module._resolveFilename.bind(Module); const seen = []; Module._resolveFilename = function(req, ...args) { if (req.startsWith('.') && !req.includes('paths')) seen.push(req); return orig(req, ...args); }; require('./lib/paths'); if (seen.length) { console.error('CIRCULAR DEPS:', seen); process.exit(1); } else { console.log('NO CIRCULAR DEPS'); }"` or inspect imports directly: `node -e "const src = require('fs').readFileSync('./lib/paths.js','utf8'); const localReqs = src.match(/require\(['\"]\.\//g) || []; console.log('local requires:', localReqs.length); process.exit(localReqs.length > 0 ? 1 : 0)"`
- **Expected:** Exit code 0, zero local `require('./...`)` calls found
- **Failure means:** Module has a circular dependency risk that will cause import ordering problems when downstream lib/ modules consume it

### S4: Path Functions Return Correct Values

- **What:** Each path function returns the exact string specified in PLAN.md truths
- **Command:**
  ```bash
  node -e "
  const p = require('./lib/paths');
  const cwd = '/tmp/testgrd';
  const checks = [
    [p.milestonesDir(cwd), '/tmp/testgrd/.planning/milestones'],
    [p.phasesDir(cwd, 'v0.2.1'), '/tmp/testgrd/.planning/milestones/v0.2.1/phases'],
    [p.phaseDir(cwd, 'v0.2.1', '32-foo'), '/tmp/testgrd/.planning/milestones/v0.2.1/phases/32-foo'],
    [p.researchDir(cwd, 'v0.2.1'), '/tmp/testgrd/.planning/milestones/v0.2.1/research'],
    [p.codebaseDir(cwd, 'v0.2.1'), '/tmp/testgrd/.planning/milestones/v0.2.1/codebase'],
    [p.todosDir(cwd, 'v0.2.1'), '/tmp/testgrd/.planning/milestones/v0.2.1/todos'],
    [p.quickDir(cwd), '/tmp/testgrd/.planning/milestones/anonymous/quick'],
    [p.archivedPhasesDir(cwd, 'v0.1.6'), '/tmp/testgrd/.planning/milestones/v0.1.6-phases'],
  ];
  const failures = checks.filter(([got, want]) => got !== want).map(([got, want]) => 'got=' + got + ' want=' + want);
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  console.log('ALL PATH CHECKS PASS');
  "
  ```
- **Expected:** `ALL PATH CHECKS PASS`
- **Failure means:** Path construction logic is incorrect — will cause wrong directory lookups in all downstream consumers

### S5: currentMilestone Reads STATE.md Correctly

- **What:** `currentMilestone(cwd)` extracts the version string from STATE.md `**Milestone:**` field; returns `'anonymous'` on missing/empty file
- **Command:**
  ```bash
  node -e "
  const p = require('./lib/paths');
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-eval-'));
  fs.mkdirSync(path.join(tmp, '.planning'));

  // Test 1: version extracted
  fs.writeFileSync(path.join(tmp, '.planning', 'STATE.md'),
    '# State\n**Milestone:** v0.2.1 — Hierarchical Planning Directory\n');
  const got1 = p.currentMilestone(tmp);
  if (got1 !== 'v0.2.1') { console.error('FAIL T1: got', got1); process.exit(1); }

  // Test 2: missing STATE.md returns anonymous
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-eval2-'));
  const got2 = p.currentMilestone(tmp2);
  if (got2 !== 'anonymous') { console.error('FAIL T2: got', got2); process.exit(1); }

  // Test 3: no Milestone field returns anonymous
  fs.mkdirSync(path.join(tmp2, '.planning'));
  fs.writeFileSync(path.join(tmp2, '.planning', 'STATE.md'), '# State\n**Updated:** 2026-01-01\n');
  const got3 = p.currentMilestone(tmp2);
  if (got3 !== 'anonymous') { console.error('FAIL T3: got', got3); process.exit(1); }

  console.log('currentMilestone: ALL CHECKS PASS');
  "
  ```
- **Expected:** `currentMilestone: ALL CHECKS PASS`
- **Failure means:** STATE.md parsing is broken; downstream modules that default to `currentMilestone(cwd)` will resolve paths incorrectly

### S6: Unit Tests Pass With Required Coverage

- **What:** `tests/unit/paths.test.js` runs without failures and meets the coverage thresholds in `jest.config.js`
- **Command:** `npx jest tests/unit/paths.test.js --coverage --collectCoverageFrom='lib/paths.js' 2>&1 | tail -30`
- **Expected:**
  - All tests: `Tests: N passed, N total` (zero failures)
  - Line coverage >= 90%
  - Function coverage = 100%
  - Branch coverage >= 85%
- **Failure means:** Implementation is incomplete or test suite does not adequately exercise the module

### S7: Full Test Suite Passes With Zero Regressions

- **What:** All 1,577+ existing tests still pass after adding `lib/paths.js` and `tests/unit/paths.test.js`
- **Command:** `npm test 2>&1 | tail -20`
- **Expected:**
  - `Tests: 1577+ passed` (count increases by the paths tests, none decrease)
  - No coverage threshold failures
  - Exit code 0
- **Failure means:** `lib/paths.js` has caused a circular dependency, name collision, or jest.config.js threshold regression in an existing module

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Phase 33.

## Level 2: Proxy Metrics

### No Proxy Metrics

**Rationale:** This phase delivers a pure path-construction module with a fully specified contract. Every requirement (REQ-46 through REQ-50, REQ-67) is directly testable in-phase via the unit test suite. The sanity checks (S4, S5, S6, S7) are the full evaluation — they directly verify correctness, not indirectly proxy it. Inventing proxy metrics here (e.g., "code complexity score" or "API consistency score") would add noise without additional signal.

**Recommendation:** Rely entirely on sanity checks (L1). Sanity checks S4 and S5 are functional correctness checks that would normally require integration; for this module they are doable in-phase because `lib/paths.js` has no runtime dependencies beyond Node built-ins.

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration not available in Phase 32.

### D1: Cross-Module Consumption Without Regression — DEFER-32-01

- **What:** All lib/ modules that currently hardcode `.planning/phases/` or other `.planning/` subdirectory paths can successfully migrate to `paths.js` calls without behavioral change
- **How:** Run the full test suite after Phase 33 migrates all 11+ lib/ modules to import from `lib/paths.js`
- **Why deferred:** Phase 32 only creates the module; Phase 33 does the actual migration. Correctness of path-based refactoring in existing modules cannot be verified until those refactors are written
- **Validates at:** `phase-33-lib-module-migration`
- **Depends on:** Phase 33 — all lib/ modules updated to use `paths.js`
- **Target:** All 1,577+ tests pass after Phase 33 migration; zero `.planning/phases/` hardcoded strings remain in lib/ modules (verified by `grep -r "path.join.*\.planning.*phases" lib/` returning only `lib/paths.js`)
- **Risk if unmet:** If Phase 33 migration causes regressions, the paths.js API design may need adjustment (e.g., function signatures, default behavior). Budget: 1 additional iteration in Phase 33
- **Fallback:** Roll back lib/ module changes in Phase 33; adjust `lib/paths.js` API to better fit callers; re-migrate

## Ablation Plan

**No ablation plan** — This phase implements a single, self-contained utility module with no sub-components to isolate. The functions are independent path constructors sharing only the `currentMilestone` helper. There is no tradeoff between algorithmic variants.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing test count | Tests passing before Phase 32 | 1,577 | STATE.md Performance Metrics |
| Existing lib/ module count | lib/ modules before Phase 32 | 18 (17 existing + 1 new) | STATE.md |
| Per-file coverage pattern | Other lib/ modules at 75-90% line coverage | >= 90% for paths.js | jest.config.js thresholds |
| Module size ceiling | No JS file exceeds 500 lines (project standard) | lib/paths.js < 500 lines | PRODUCT-QUALITY.md P0 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/paths.test.js     — unit test suite (written in Task 1)
lib/paths.js                 — implementation under test (written in Task 2)
jest.config.js               — coverage thresholds (updated in Task 2)
```

**How to run full evaluation:**
```bash
# Sanity S1–S3: module load and export checks (inline node commands above)

# Sanity S4–S5: path correctness checks (inline node commands above)

# Sanity S6: unit tests with coverage
npx jest tests/unit/paths.test.js --coverage --collectCoverageFrom='lib/paths.js'

# Sanity S7: full regression suite
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module loads | | | |
| S2: All 9 exports | | | |
| S3: No circular deps | | | |
| S4: Path return values | | | |
| S5: currentMilestone correctness | | | |
| S6: Unit tests + coverage | | | |
| S7: Full suite regression | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| N/A | — | — | — | No proxy metrics for this phase |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| N/A | — | — | No ablation plan for this phase |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-32-01 | Cross-module consumption without regression | PENDING | phase-33-lib-module-migration |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 7 checks covering all specified behaviors. Checks S4 and S5 are functionally equivalent to integration tests because `lib/paths.js` has no external dependencies. Check S6 enforces REQ-67 coverage thresholds directly. Check S7 ensures the foundation phase cannot silently break existing behavior.
- Proxy metrics: None designed — this is intentional, not a gap. The evaluation does not need proxies because the full specification is directly testable in-phase.
- Deferred coverage: Partial but appropriate — DEFER-32-01 captures the one genuinely unavailable validation (cross-module consumption), which requires Phase 33's refactoring work.

**What this evaluation CAN tell us:**
- Whether `lib/paths.js` exports all 9 required functions with correct signatures
- Whether every path function returns the exact string specified in the contract
- Whether `currentMilestone` correctly parses STATE.md across all edge cases (missing file, missing field, whitespace, version variants)
- Whether the module has no circular dependency risk
- Whether the test suite achieves >90% line / 100% function / 85% branch coverage
- Whether adding this module causes any regression in the 1,577 existing tests

**What this evaluation CANNOT tell us:**
- Whether the API design (function signatures, parameter ordering) is ergonomic for the 11+ lib/ modules that will import it — addressed in Phase 33
- Whether the `milestone` defaulting behavior (falling back to `currentMilestone(cwd)`) behaves correctly in all real-world call sites — addressed in Phase 33
- Whether `archivedPhasesDir` backward compatibility is sufficient for all existing archive layouts in production `.planning/milestones/` directories — addressed in Phase 35's migration command

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-20*
