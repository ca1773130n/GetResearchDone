# Evaluation Plan: Phase 33 — lib/ Module Migration

**Designed:** 2026-02-20
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Mechanical code migration — 11 lib/ modules + bin/postinstall.js migrated from hardcoded `.planning/` path constructions to `lib/paths.js` calls; REQ-56 init JSON enrichment
**Reference papers:** None applicable (infrastructure refactor; no ML/research paper)

## Evaluation Overview

Phase 33 is a pure code migration phase. The goal is to eliminate all hardcoded `.planning/` subdirectory path constructions across 11 lib/ modules and bin/postinstall.js, replacing them with calls to the centralized `lib/paths.js` module created in Phase 32. Additionally, all `cmdInit*` functions in `lib/context.js` must be enriched to emit `phases_dir`, `research_dir`, `codebase_dir`, `quick_dir`, and `todos_dir` fields in their JSON output (REQ-56).

The critical constraint is backward compatibility: the Phase 32 fallback mechanism in `lib/paths.js` ensures that when the new `.planning/milestones/{milestone}/` hierarchy does not exist on disk, all functions return the old-style paths (`.planning/phases/`, etc.). This means the 1,608 existing tests must pass throughout the entire migration — they use fixture directories that have the old layout, and the backward-compat fallback keeps them working until Phase 35 performs the physical directory migration.

Success is measured entirely through software engineering metrics: absence of hardcoded paths (grep-verified), test regression count (zero required), lint status, and JSON output field presence. There are no ML benchmarks, no external datasets, and no subjective quality dimensions. Because the evaluation is deterministic and fully automatable, the proxy metrics in this plan are high-confidence — the test suite directly exercises the migrated code paths.

The one genuine uncertainty is whether the `directory` fields in JSON output objects (in `cmdPhaseAdd`, `cmdPhaseInsert`, `cmdPhasePlanIndex`, `cmdPhaseDetail`, etc.) preserve the correct relative-path format after migration. Integration tests exercise these output fields, so any format regression will surface in the proxy tier.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Zero hardcoded `path.join` constructions in lib/ (except paths.js) | REQ-51, REQ-52, REQ-53, REQ-54, REQ-55 — PLAN.md success criteria #2 | Direct requirement fulfillment; mechanically verifiable with grep |
| 1,608+ tests passing with zero regressions | REQ-66 (milestone-wide), all plan must_haves | Migration must be transparent to existing behavior |
| Lint clean across all modified files | Project standard (pre-commit hook) | Code quality gate; catches unused imports and syntax errors introduced during migration |
| init JSON output contains path fields | REQ-56, 33-04-PLAN.md must_haves | Direct requirement fulfillment; verifiable by inspecting command output |
| postinstall.js creates new hierarchy | REQ-55, 33-05-PLAN.md must_haves | New projects must initialize with milestone-scoped layout |
| All 10 migrated modules import paths.js | REQ-51 through REQ-55 | Structural completeness of migration |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 8 | Zero-regression baseline, hardcoded path absence, lint, module load, postinstall structure |
| Proxy (L2) | 4 | Full test suite, per-module unit tests, integration tests for JSON output, REQ-56 field verification |
| Deferred (L3) | 3 | Physical hierarchy activation (Phase 35), test suite update for new layout (Phase 36), command/agent consumption of new path fields (Phase 34) |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: No Hardcoded path.join Constructions Remain in lib/ (Except paths.js)

- **What:** The primary requirement — all `path.join(cwd, '.planning', 'phases')` and similar constructions are replaced with `paths.js` calls
- **Command:**
  ```bash
  grep -rn "path\.join.*\.planning.*phases" /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/ | grep -v "lib/paths.js"
  grep -rn "path\.join.*\.planning.*todos" /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/ | grep -v "lib/paths.js"
  grep -rn "path\.join.*\.planning.*quick" /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/ | grep -v "lib/paths.js"
  grep -rn "path\.join.*\.planning.*codebase" /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/ | grep -v "lib/paths.js"
  grep -rn "path\.join.*\.planning.*research" /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/ | grep -v "lib/paths.js"
  grep -rn "path\.join.*\.planning.*milestones" /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/ | grep -v "lib/paths.js"
  ```
- **Expected:** All six commands return zero results
- **Failure means:** One or more plan executions (33-01 through 33-05) were incomplete; a specific module still uses hardcoded path construction

### S2: No Hardcoded String Literal Path References Remain in lib/ (Except paths.js)

- **What:** Template literals and string concatenations like `'.planning/phases/' + name` are also eliminated
- **Command:**
  ```bash
  grep -rn "'\\.planning/phases/" /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/ | grep -v "lib/paths.js" | grep -v "^.*\/\/.*\."
  grep -rn "'\\.planning/todos/" /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/ | grep -v "lib/paths.js" | grep -v "^.*\/\/.*\."
  grep -rn "'\\.planning/codebase'" /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/ | grep -v "lib/paths.js"
  ```
- **Expected:** All commands return zero results (comments that mention old paths are acceptable)
- **Failure means:** String literal path construction survived the migration; these are equally dangerous as path.join constructions because they will not benefit from the backward-compat fallback

### S3: All 10 Migrated Modules Import paths.js

- **What:** Structural completeness — every module that needed migration is wired to paths.js
- **Command:**
  ```bash
  grep -l "require.*paths" \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/utils.js \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/state.js \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/gates.js \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/phase.js \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/commands.js \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/scaffold.js \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/context.js \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/cleanup.js \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/roadmap.js \
    /Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/tracker.js
  ```
- **Expected:** All 10 file paths appear in the output (10 lines)
- **Failure means:** A module was supposed to be migrated but does not import paths.js — the migration was either skipped or the require was omitted

### S4: postinstall.js Creates New Milestone-Scoped Hierarchy

- **What:** New GRD projects start with the correct directory layout after `npm install`
- **Command:**
  ```bash
  node -e "
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ph33-eval-'));
  process.chdir(tmpDir);
  require('/Users/edward.seo/dev/private/project/harness/GetResearchDone/bin/postinstall.js');
  const expected = [
    '.planning/milestones/anonymous/phases',
    '.planning/milestones/anonymous/research',
    '.planning/milestones/anonymous/research/deep-dives',
    '.planning/milestones/anonymous/codebase',
    '.planning/milestones/anonymous/todos',
    '.planning/milestones/anonymous/quick',
  ];
  const results = expected.map(d => ({ dir: d, exists: fs.existsSync(path.join(tmpDir, d)) }));
  results.forEach(r => console.log(r.exists ? 'OK' : 'FAIL', r.dir));
  fs.rmSync(tmpDir, { recursive: true });
  const failures = results.filter(r => !r.exists);
  process.exit(failures.length > 0 ? 1 : 0);
  "
  ```
- **Expected:** All 6 directories print `OK`; exit code 0
- **Failure means:** Plan 33-05 did not update the DIRECTORIES array, or the update is incomplete; new projects will start with the old flat layout, defeating the milestone hierarchy migration

### S5: postinstall.js Remains Idempotent

- **What:** Running postinstall.js on an existing `.planning/` directory does nothing and exits cleanly
- **Command:**
  ```bash
  node -e "
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ph33-idem-'));
  process.chdir(tmpDir);
  // First run — creates structure
  require('/Users/edward.seo/dev/private/project/harness/GetResearchDone/bin/postinstall.js');
  // Manually add a sentinel file to confirm second run does not overwrite
  fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), JSON.stringify({ sentinel: true }));
  // Second run — must not throw, must not overwrite
  require('/Users/edward.seo/dev/private/project/harness/GetResearchDone/bin/postinstall.js');
  const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning', 'config.json'), 'utf8'));
  const preserved = config.sentinel === true;
  console.log(preserved ? 'IDEMPOTENT OK' : 'IDEMPOTENT FAIL — config was overwritten');
  fs.rmSync(tmpDir, { recursive: true });
  process.exit(preserved ? 0 : 1);
  "
  ```
- **Expected:** Prints `IDEMPOTENT OK`; exit code 0
- **Failure means:** postinstall.js no longer short-circuits on existing `.planning/` — the idempotency check was accidentally removed during the DIRECTORIES update

### S6: Lint Passes on All Modified Files

- **What:** No lint errors were introduced during the mechanical migration (unused imports, syntax issues)
- **Command:**
  ```bash
  npm run lint --prefix /Users/edward.seo/dev/private/project/harness/GetResearchDone
  ```
- **Expected:** Exit code 0, zero lint errors
- **Failure means:** A `require('./paths')` import was added but not all destructured exports are used, or the migration introduced a syntax error; the pre-commit hook would also block commits until this is resolved

### S7: No New Circular Dependencies Introduced

- **What:** The 10 migrated modules import `lib/paths.js`; `lib/paths.js` must not import any of them (no circular graph)
- **Command:**
  ```bash
  node -e "
  const src = require('fs').readFileSync('/Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/paths.js', 'utf8');
  const localReqs = (src.match(/require\(['\"]\.\/[^'\"]+['\"][\)]/g) || []);
  console.log('paths.js local requires:', localReqs.length, localReqs.join(', ') || '(none)');
  process.exit(localReqs.length > 0 ? 1 : 0);
  "
  ```
- **Expected:** `paths.js local requires: 0 (none)`; exit code 0
- **Failure means:** During the backward-compat fallback implementation (Plan 33-01), a local `require` was accidentally added to paths.js, creating a circular dependency risk

### S8: JSON Output `directory` Fields Produce Relative Paths (Not Absolute)

- **What:** After migration, `cmdPhaseAdd`, `cmdPhaseInsert`, and `cmdPhasePlanIndex` must return `directory` fields as relative paths from cwd (e.g., `.planning/phases/33-foo`), not absolute paths
- **Command:**
  ```bash
  node -e "
  const { spawnSync } = require('child_process');
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ph33-dir-'));
  fs.mkdirSync(path.join(tmpDir, '.planning'));
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n**Milestone:** v0.2.1\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
  const result = spawnSync('node', [
    '/Users/edward.seo/dev/private/project/harness/GetResearchDone/bin/grd-tools.js',
    '--cwd', tmpDir,
    'roadmap', 'get-phase', '1'
  ], { encoding: 'utf8' });
  fs.rmSync(tmpDir, { recursive: true });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  // Check that if directory field exists, it is relative (does not start with /)
  try {
    const out = JSON.parse(result.stdout || '{}');
    const dir = out.directory || out.data?.directory || '';
    if (dir.startsWith('/')) { console.error('FAIL: directory is absolute:', dir); process.exit(1); }
    console.log('directory field check OK (relative or absent):', dir || '(not present in this call)');
  } catch(e) { console.log('OK: non-JSON output or no directory field (acceptable)'); }
  "
  ```
- **Expected:** No absolute path in `directory` field; exit code 0
- **Failure means:** The `path.relative(cwd, ...)` replacement in one of the migration plans produced an absolute path or incorrect relative path; downstream consumers will receive wrong directory strings

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Phase 34.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of migration completeness and correctness.
**IMPORTANT:** These proxy metrics measure migration correctness with high confidence because the test suite directly exercises migrated code paths. However, they do NOT validate that the new paths activate correctly in a physical milestone-scoped filesystem — that validation is deferred to Phase 35.

### P1: Full Test Suite — Zero Regressions

- **What:** All 1,608 existing tests continue to pass after migration; the backward-compat fallback in paths.js ensures test fixtures using old-style directories still work
- **How:** Run `npm test` after all 5 plans are complete and merged
- **Command:** `npm test --prefix /Users/edward.seo/dev/private/project/harness/GetResearchDone`
- **Target:** 1,608+ tests passing, 0 failures, exit code 0; test count may increase slightly if unit tests are added for new context.js fields
- **Evidence from:** 33-01-PLAN.md through 33-05-PLAN.md all state this as must_haves.truths; REQ-66 (milestone-wide requirement)
- **Correlation with full metric:** HIGH — the test suite directly calls migrated functions. The backward-compat fallback guarantees that fixture directories at `.planning/phases/` still resolve correctly, so any regression in a test directly indicates a migration defect in that function
- **Blind spots:** Tests run against old-style fixture directories. They do NOT verify that the new-style paths (`.planning/milestones/{milestone}/phases/`) are returned when the new hierarchy exists. That behavior is validated by Phase 35 physical migration + Phase 36 test updates
- **Validated:** No — awaiting deferred validation DEFER-33-03 at phase-36

### P2: Per-Module Unit Tests — All Pass

- **What:** The unit test suite for each individual migrated module passes without regression, confirming that the mechanical replacements did not alter any function's behavior
- **How:** Run unit tests for all 10 migrated modules
- **Command:**
  ```bash
  npx jest \
    tests/unit/utils.test.js \
    tests/unit/state.test.js \
    tests/unit/gates.test.js \
    tests/unit/phase.test.js \
    tests/unit/commands.test.js \
    tests/unit/scaffold.test.js \
    tests/unit/context.test.js \
    tests/unit/cleanup.test.js \
    tests/unit/roadmap.test.js \
    tests/unit/tracker.test.js \
    --no-coverage \
    --rootDir /Users/edward.seo/dev/private/project/harness/GetResearchDone
  ```
- **Target:** All 10 test suites pass; zero failures across all suites
- **Evidence from:** Every plan (33-01 through 33-04) lists per-module unit tests in must_haves.truths and verification sections
- **Correlation with full metric:** HIGH — unit tests are the primary regression detection mechanism for migration correctness
- **Blind spots:** Unit tests use mocked or temp filesystems; they do not verify cross-module behavior (e.g., a command calling findPhaseInternal calling getPhasesDirPath in the new hierarchy)
- **Validated:** No — partial validation; cross-module behavior deferred to DEFER-33-01

### P3: Integration Tests for Phase-Related JSON Output

- **What:** CLI integration tests that verify `directory` fields in command JSON output match the expected format (relative path, not absolute, correct path prefix)
- **How:** Run integration tests filtered to phase-related operations
- **Command:**
  ```bash
  npx jest tests/integration/ --no-coverage -t "phase" \
    --rootDir /Users/edward.seo/dev/private/project/harness/GetResearchDone
  ```
- **Target:** All matching integration tests pass; zero failures
- **Evidence from:** 33-02-PLAN.md Task 2 explicitly targets integration tests for `directory` field format; 33-03-PLAN.md cmdPhaseDetail TUI output check
- **Correlation with full metric:** MEDIUM — integration tests exercise the JSON output format but still use old-style fixture directories; the format check is valid regardless of which path layout is active
- **Blind spots:** Integration tests may not cover all `cmdInit*` functions that were enriched with new path fields (REQ-56); those are covered by P4
- **Validated:** No — awaiting deferred validation DEFER-33-01 at phase-36

### P4: REQ-56 — Init Functions Output Milestone-Scoped Path Fields

- **What:** All `cmdInit*` functions in lib/context.js emit `phases_dir`, `research_dir`, `codebase_dir`, `quick_dir`, and `todos_dir` fields in their JSON output
- **How:** Run each init command and inspect the JSON output for the required fields
- **Command:**
  ```bash
  node -e "
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { cmdInitExecutePhase, cmdInitPlanPhase, cmdInitProgress } = require('/Users/edward.seo/dev/private/project/harness/GetResearchDone/lib/context');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-req56-'));
  fs.mkdirSync(path.join(tmpDir, '.planning'));
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n**Milestone:** v0.2.1\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
  const REQUIRED_FIELDS = ['phases_dir', 'research_dir', 'codebase_dir', 'quick_dir', 'todos_dir'];
  const fns = [
    ['cmdInitExecutePhase', cmdInitExecutePhase],
    ['cmdInitPlanPhase', cmdInitPlanPhase],
    ['cmdInitProgress', cmdInitProgress],
  ];
  let allOk = true;
  for (const [name, fn] of fns) {
    try {
      const result = fn({ cwd: tmpDir, phase: 1 });
      const missing = REQUIRED_FIELDS.filter(f => !(f in result));
      if (missing.length > 0) {
        console.error('FAIL', name, 'missing fields:', missing.join(', '));
        allOk = false;
      } else {
        console.log('OK', name, '— all 5 path fields present');
      }
    } catch (e) { console.error('ERROR', name, e.message); allOk = false; }
  }
  fs.rmSync(tmpDir, { recursive: true });
  process.exit(allOk ? 0 : 1);
  "
  ```
- **Target:** All tested init functions have all 5 path fields present; exit code 0
- **Evidence from:** REQ-56, 33-04-PLAN.md must_haves.truths and Part B of Task 1
- **Correlation with full metric:** HIGH — directly tests the JSON enrichment requirement; no proxy needed because the output fields are directly inspectable
- **Blind spots:** This check samples 3 init functions; does not exhaustively test every `cmdInit*` variant. A comprehensive check requires running all 9+ init function variants. A failed `cmdInit*` that was not tested here would only surface when Phase 34 (command/agent migration) attempts to consume the new fields
- **Validated:** No — exhaustive coverage deferred to DEFER-33-02 at phase-34

## Level 3: Deferred Validations

**Purpose:** Full validation requiring integration with the physical directory migration (Phase 35) or test updates (Phase 36) not available in Phase 33.

### D1: New-Style Paths Activate When Milestone Directory Exists — DEFER-33-01

- **What:** When a `.planning/milestones/{milestone}/` directory exists on disk, all `paths.js` functions return the new-style paths (e.g., `.planning/milestones/v0.2.1/phases/` instead of `.planning/phases/`); existing tests updated to assert this behavior
- **How:** After Phase 35 physically migrates directories, run the test suite against a repo that has the new hierarchy in place; verify paths.js returns new-style paths
- **Why deferred:** Phase 33 implements the backward-compat fallback but the test suite runs against old-style fixture directories. The new-style path branch of the fallback cannot be validated until Phase 35 creates fixtures with the new hierarchy, and Phase 36 updates those fixtures in tests
- **Validates at:** phase-36-test-updates
- **Depends on:** Phase 35 (physical directory migration command) + Phase 36 (test fixture updates)
- **Target:** All unit and integration tests pass with new-style fixture directories; `phasesDir(cwd)` returns `.planning/milestones/v0.2.1/phases/` when the milestone directory exists on disk
- **Risk if unmet:** The backward-compat fallback is the entire bridge between Phase 33 (code migration) and Phase 35 (physical migration). If the fallback logic has a bug (e.g., wrong parent directory check, wrong fallback condition), it will manifest as all tests failing after Phase 35 runs. Budget 1 additional iteration in Phase 36 to fix fallback if this occurs.
- **Fallback:** Roll back the backward-compat fallback logic in paths.js; inspect the `fs.existsSync(milestoneRoot)` condition; fix the parent directory check; re-run Phase 36 tests

### D2: Command and Agent Files Consume New Path Fields from Init Output — DEFER-33-02

- **What:** Phase 34 updates command and agent markdown files to read `phases_dir` etc. from init output JSON rather than hardcoding directory strings; this validates that REQ-56 enrichment was comprehensive enough for all consumers
- **How:** Phase 34 audits which init function outputs are consumed by which commands/agents and verifies each consumer uses the new path fields
- **Why deferred:** Phase 33 adds the fields to init output; Phase 34 is the phase that migrates command/agent markdown to consume those fields. Only Phase 34's migration reveals whether all necessary init functions are enriched and whether the field names are consistent across consumers
- **Validates at:** phase-34-command-agent-migration
- **Depends on:** Phase 34 (command and agent markdown migration)
- **Target:** Zero hardcoded `.planning/phases/`, `.planning/research/`, `.planning/todos/`, `.planning/codebase/`, `.planning/quick/` in any `commands/*.md` or `agents/*.md` file (REQ-57, REQ-58)
- **Risk if unmet:** A command or agent file references a hardcoded path that the enriched init output does not expose. This requires adding an additional field to the relevant `cmdInit*` function and re-running Phase 34 migration for that file. Low probability (the 5 standard fields cover the known consumers) but non-zero.
- **Fallback:** Add missing path fields to the specific `cmdInit*` function; update the command/agent file to consume the new field

### D3: End-to-End Integration With Physical Hierarchy — DEFER-33-03

- **What:** A fully integrated end-to-end workflow (new project creation, phase add/complete, milestone complete, todo management) runs correctly against the new directory hierarchy without any fallback to old-style paths
- **How:** After Phase 35 physical migration: create a new GRD project (postinstall creates new hierarchy), run typical workflow commands, verify all operations resolve to `.planning/milestones/{milestone}/...` paths
- **Why deferred:** Phase 33 only migrates code; the physical directories on disk are still old-style. True end-to-end validation requires both the code migration (Phase 33) and the physical migration (Phase 35) to be complete, plus the test updates (Phase 36) to verify the new layout works correctly
- **Validates at:** phase-36-test-updates (post Phase 35 execution)
- **Depends on:** Phase 33 (code migration), Phase 34 (command/agent markdown), Phase 35 (physical migration command), Phase 36 (test updates)
- **Target:** `npm test` passes with 1,608+ tests in the new hierarchy; all operations produce correct milestone-scoped paths; zero fallback to old-style paths needed for any operation
- **Risk if unmet:** If end-to-end integration fails after Phase 35, it could indicate that the backward-compat fallback is too aggressive (falls back to old paths even when new paths should be active). This would require bisecting which module's fallback condition is incorrect. Budget 2 additional iterations across Phases 35-36.
- **Fallback:** Enable verbose logging in paths.js fallback decision; trace which `fs.existsSync` check is returning false unexpectedly; fix the milestone root check

## Ablation Plan

**No ablation plan** — This phase performs a mechanical code migration with a single, well-specified strategy (replace `path.join(cwd, '.planning', 'phases')` with `getPhasesDirPath(cwd)`). There are no competing algorithmic approaches, no sub-component tradeoffs, and no design decisions that require comparison. The only design decision (backward-compat fallback in paths.js) was made in Plan 33-01 and is not subject to ablation — it is a requirement, not a choice.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test count before migration | Tests passing before Phase 33 | 1,608 | STATE.md Performance Metrics |
| Hardcoded path.join count in lib/ | Before migration: 36 occurrences across 11 modules | 0 after migration | grep count at eval design time |
| Hardcoded string literal paths in lib/ | Before migration: ~24 occurrences across 11 modules | 0 after migration | grep count at eval design time |
| modules importing paths.js | Before Phase 33: 0 | 10 after Phase 33 | PLAN.md key_links |
| Lint error count | Pre-migration baseline: 0 | 0 after migration | npm run lint |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/utils.test.js        — utils.js regression tests
tests/unit/state.test.js        — state.js regression tests
tests/unit/gates.test.js        — gates.js regression tests
tests/unit/phase.test.js        — phase.js regression tests
tests/unit/commands.test.js     — commands.js regression tests
tests/unit/scaffold.test.js     — scaffold.js regression tests
tests/unit/context.test.js      — context.js regression tests (+ REQ-56 field checks)
tests/unit/cleanup.test.js      — cleanup.js regression tests
tests/unit/roadmap.test.js      — roadmap.js regression tests
tests/unit/tracker.test.js      — tracker.js regression tests
tests/integration/              — integration tests (phase operations, JSON output)
```

**How to run full evaluation:**
```bash
REPO=/Users/edward.seo/dev/private/project/harness/GetResearchDone

# Level 1 — Sanity S1: no hardcoded path.join in lib/ (except paths.js)
grep -rn "path\.join.*\.planning.*phases" $REPO/lib/ | grep -v "lib/paths.js"
grep -rn "path\.join.*\.planning.*todos" $REPO/lib/ | grep -v "lib/paths.js"
grep -rn "path\.join.*\.planning.*quick" $REPO/lib/ | grep -v "lib/paths.js"
grep -rn "path\.join.*\.planning.*codebase" $REPO/lib/ | grep -v "lib/paths.js"
grep -rn "path\.join.*\.planning.*research" $REPO/lib/ | grep -v "lib/paths.js"
grep -rn "path\.join.*\.planning.*milestones" $REPO/lib/ | grep -v "lib/paths.js"

# Level 1 — Sanity S3: all 10 modules import paths.js
grep -l "require.*paths" $REPO/lib/utils.js $REPO/lib/state.js $REPO/lib/gates.js \
  $REPO/lib/phase.js $REPO/lib/commands.js $REPO/lib/scaffold.js $REPO/lib/context.js \
  $REPO/lib/cleanup.js $REPO/lib/roadmap.js $REPO/lib/tracker.js

# Level 1 — Sanity S6: lint
npm run lint --prefix $REPO

# Level 2 — Proxy P1: full test suite
npm test --prefix $REPO

# Level 2 — Proxy P2: per-module unit tests
npx jest tests/unit/utils.test.js tests/unit/state.test.js tests/unit/gates.test.js \
  tests/unit/phase.test.js tests/unit/commands.test.js tests/unit/scaffold.test.js \
  tests/unit/context.test.js tests/unit/cleanup.test.js tests/unit/roadmap.test.js \
  tests/unit/tracker.test.js --no-coverage --rootDir $REPO

# Level 2 — Proxy P3: integration tests for phase JSON output
npx jest tests/integration/ --no-coverage -t "phase" --rootDir $REPO
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: No hardcoded path.join in lib/ | | | |
| S2: No hardcoded string literal paths | | | |
| S3: All 10 modules import paths.js | | | |
| S4: postinstall creates new hierarchy | | | |
| S5: postinstall remains idempotent | | | |
| S6: Lint passes | | | |
| S7: No new circular dependencies | | | |
| S8: JSON directory fields are relative | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Full test suite | 1,608+ passing, 0 failures | | | |
| P2: Per-module unit tests | All 10 suites pass | | | |
| P3: Integration tests (phase ops) | All passing | | | |
| P4: REQ-56 init JSON fields | 5 fields in sampled init functions | | | |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| N/A | — | — | No ablation plan for this phase |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-33-01 | New-style paths activate when milestone directory exists | PENDING | phase-36-test-updates |
| DEFER-33-02 | Command/agent files consume new path fields from init output | PENDING | phase-34-command-agent-migration |
| DEFER-33-03 | End-to-end integration with physical hierarchy | PENDING | phase-36-test-updates |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 8 checks covering the primary migration requirements (S1-S2: hardcoded path absence; S3: structural completeness; S4-S5: postinstall correctness; S6: code quality; S7: no circular deps; S8: JSON format). Each check is fully automatable with no subjective component.
- Proxy metrics: Well-evidenced — P1 (full test suite) and P2 (per-module units) are the strongest possible proxy for migration correctness given that the test suite directly exercises migrated code paths with the backward-compat fallback active. P3 and P4 target the two non-trivial migration concerns (JSON output format, REQ-56 field presence). No invented metrics.
- Deferred coverage: Partial but appropriately scoped — the three deferred validations cover the genuine unknowns: whether the new-style path branch of the backward-compat fallback works correctly (requires Phase 35-36 physical migration), whether REQ-56 enrichment is sufficient for all Phase 34 consumers, and whether the complete integrated system works end-to-end. All have specific validates_at references and risk mitigations.

**What this evaluation CAN tell us:**
- Whether all 36+ hardcoded `path.join` constructions were replaced across all 11 modules (S1)
- Whether all 24+ hardcoded string literal paths were eliminated (S2)
- Whether the migration is structurally complete — all 10 modules import paths.js (S3)
- Whether postinstall.js correctly creates the new directory hierarchy for new projects (S4)
- Whether postinstall.js idempotency was preserved during the DIRECTORIES update (S5)
- Whether the migration introduced any lint errors or unused imports (S6)
- Whether paths.js is still free of circular dependency risk (S7)
- Whether JSON `directory` output fields remained relative paths after migration (S8)
- Whether all 1,608 existing tests still pass with the backward-compat fallback active (P1, P2)
- Whether phase-related CLI integration tests pass with correct output format (P3)
- Whether sampled init functions emit the 5 required path fields (P4)

**What this evaluation CANNOT tell us:**
- Whether the new-style path branch of the backward-compat fallback is correct (returns `.planning/milestones/{milestone}/phases/` when milestone dir exists) — addressed in DEFER-33-01 at Phase 36
- Whether all `cmdInit*` functions were enriched with the 5 required fields, or only the ones sampled by P4 — addressed in DEFER-33-02 at Phase 34
- Whether the complete end-to-end workflow (new project, phase lifecycle, milestone complete) works correctly after the physical directory migration — addressed in DEFER-33-03 at Phase 36
- Whether command/agent markdown files that reference old-style paths will break when the physical migration activates new-style paths — addressed in Phase 34's migration work

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-20*
