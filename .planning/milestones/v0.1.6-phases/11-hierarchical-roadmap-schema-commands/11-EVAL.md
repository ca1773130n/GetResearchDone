# Evaluation Plan: Phase 11 — Hierarchical Roadmap Schema & Commands

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** LONG-TERM-ROADMAP.md schema, parsing, validation, CLI commands
**Reference:** None (feature design, not paper-based)

## Evaluation Overview

Phase 11 implements the foundation for hierarchical roadmap planning via LONG-TERM-ROADMAP.md with Now/Next/Later milestone tiers. This is infrastructure work (schema, parsing, CLI) rather than research, so evaluation focuses on functional correctness, test coverage, and integration stability.

The phase delivers two core components:
1. **Data layer** (Plan 11-01): `lib/long-term-roadmap.js` module with parsing, validation, generation, and mode detection
2. **CLI layer** (Plan 11-02): `long-term-roadmap` CLI command with 5 subcommands exposing data layer functions

Unlike research phases with proxy metrics, this evaluation is straightforward: does it parse correctly? Does it validate correctly? Does it round-trip? Do the CLI commands work? Verification is primarily automated testing with deferred integration testing for end-to-end workflows.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test count | Jest test runner | Measures test coverage breadth (Plan 11-01: 30+ tests, Plan 11-02: 20+ tests) |
| Line coverage | Jest coverage report | Measures code path coverage (target: 80%+ per v0.0.5 standard) |
| Regression count | Jest total test count | Ensures no breakage of existing 690+ tests from v0.0.5 |
| Round-trip integrity | Generate-parse-validate cycle | Verifies schema correctness and parser robustness |
| CLI output format | JSON schema validation | Ensures CLI output is machine-parseable for orchestrator agents |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 8 | Basic functionality and format verification |
| Proxy (L2) | 6 | Automated functional correctness metrics |
| Deferred (L3) | 2 | End-to-end integration requiring Phase 15 |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module Exports
- **What:** lib/long-term-roadmap.js exports all expected functions
- **Command:** `node -e "const m = require('./lib/long-term-roadmap.js'); console.log(Object.keys(m).sort().join(','))"`
- **Expected:** Output contains: `formatLongTermRoadmap,generateLongTermRoadmap,getPlanningMode,parseLongTermRoadmap,validateLongTermRoadmap`
- **Failure means:** Module structure is incomplete or exports are missing

### S2: CLI Command Exists
- **What:** long-term-roadmap CLI command is registered and responds
- **Command:** `node bin/grd-tools.js long-term-roadmap 2>&1 | head -1`
- **Expected:** Output contains error message about required subcommand (not "Unknown command")
- **Failure means:** CLI routing is not wired correctly in bin/grd-tools.js

### S3: Unit Tests Compile
- **What:** New test files compile without syntax errors
- **Command:** `npx jest tests/unit/long-term-roadmap.test.js --listTests`
- **Expected:** Test file path listed without errors
- **Failure means:** Test file has syntax errors or missing dependencies

### S4: CLI Tests Compile
- **What:** New CLI test block compiles without syntax errors
- **Command:** `npx jest tests/unit/commands.test.js --listTests`
- **Expected:** Test file path listed without errors
- **Failure means:** CLI test additions have syntax errors

### S5: No Crashes on Valid Input
- **What:** Parser handles well-formed LONG-TERM-ROADMAP.md without crashes
- **Command:** Create fixture with valid content, run `node bin/grd-tools.js long-term-roadmap parse .planning/LONG-TERM-ROADMAP.md`
- **Expected:** JSON output (even if empty), no uncaught exceptions
- **Failure means:** Parser crashes on valid input

### S6: No Crashes on Invalid Input
- **What:** Parser handles malformed input gracefully
- **Command:** Run parse on empty file or missing file
- **Expected:** Error JSON (not crash), process exits 0 or 1
- **Failure means:** No error handling for edge cases

### S7: Mode Detection Filesystem Check
- **What:** Mode detection reads filesystem correctly
- **Command:** `node bin/grd-tools.js long-term-roadmap mode` in directory without LONG-TERM-ROADMAP.md
- **Expected:** `{ "mode": "progressive", "long_term_roadmap_exists": false }`
- **Failure means:** Filesystem checks are broken

### S8: ESLint Passes on New Code
- **What:** New files pass linting
- **Command:** `npx eslint lib/long-term-roadmap.js tests/unit/long-term-roadmap.test.js`
- **Expected:** Zero errors (warnings acceptable)
- **Failure means:** Code style violations present

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated functional correctness measurement.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full integration testing. Deferred validation in Phase 15 is required.

### P1: Test Count (Plan 11-01)
- **What:** Number of tests in long-term-roadmap.test.js
- **How:** Count test cases across 5 describe blocks (parseLongTermRoadmap, validateLongTermRoadmap, getPlanningMode, generateLongTermRoadmap, formatLongTermRoadmap)
- **Command:** `npx jest tests/unit/long-term-roadmap.test.js --listTests --verbose 2>&1 | grep -c "✓"`
- **Target:** >= 30 test cases
- **Evidence:** Plan 11-01 specifies 30+ tests covering all parse scenarios, validation rules, mode detection, generation, and formatting
- **Correlation with full metric:** HIGH — test count correlates directly with code path coverage
- **Blind spots:** Test count doesn't measure test quality or assertion strength
- **Validated:** No — awaiting deferred validation at Phase 15

### P2: Test Count (Plan 11-02)
- **What:** Number of tests in cmdLongTermRoadmap test block
- **How:** Count test cases across 6 describe groups (parse, validate, display, mode, generate, edge cases)
- **Command:** `npx jest tests/unit/commands.test.js --testNamePattern="cmdLongTermRoadmap" --listTests --verbose 2>&1 | grep -c "✓"`
- **Target:** >= 20 test cases
- **Evidence:** Plan 11-02 specifies 20+ tests covering all 5 subcommands plus edge cases
- **Correlation with full metric:** HIGH — CLI test count ensures each subcommand has verification
- **Blind spots:** Doesn't test orchestrator agent interaction with CLI
- **Validated:** No — awaiting deferred validation at Phase 15

### P3: Line Coverage
- **What:** Percentage of lines covered by tests in lib/long-term-roadmap.js
- **How:** Run Jest with coverage on long-term-roadmap module
- **Command:** `npx jest tests/unit/long-term-roadmap.test.js --coverage --collectCoverageFrom="lib/long-term-roadmap.js" --coverageReporters=text-summary`
- **Target:** >= 80% line coverage
- **Evidence:** v0.0.5 established 80%+ coverage as quality standard (see BASELINE.md and Phase 8 success criteria)
- **Correlation with full metric:** MEDIUM — high coverage correlates with thorough testing but doesn't guarantee correctness
- **Blind spots:** Coverage doesn't measure edge case handling or real-world robustness
- **Validated:** No — awaiting deferred validation at Phase 15

### P4: Round-Trip Integrity
- **What:** Generated LONG-TERM-ROADMAP.md parses back to equivalent structure
- **How:** Generate roadmap from milestones array, parse it, compare key fields
- **Command:** Automated test in long-term-roadmap.test.js (round-trip test case)
- **Target:** Test passes (generated content parses without errors and preserves milestone data)
- **Evidence:** Round-trip tests are the gold standard for parser/generator correctness in schema implementations
- **Correlation with full metric:** HIGH — if round-trip works, parser and generator are internally consistent
- **Blind spots:** Doesn't test real-world content variations or edge cases
- **Validated:** No — awaiting deferred validation at Phase 15

### P5: Regression Test Pass Rate
- **What:** Existing 690+ tests from v0.0.5 continue to pass
- **How:** Run full test suite
- **Command:** `npx jest --passWithNoTests`
- **Target:** 690+ tests pass (100% pass rate, zero new failures)
- **Evidence:** BASELINE.md reports 690 tests from v0.0.5; Phase 11 must not break any
- **Correlation with full metric:** HIGH — regression test failures directly indicate breaking changes
- **Blind spots:** Doesn't detect subtle behavioral changes that aren't covered by existing tests
- **Validated:** No — awaiting deferred validation at Phase 15

### P6: CLI Output Schema Validation
- **What:** All CLI subcommands return valid JSON (non-raw mode)
- **How:** Run each subcommand and validate JSON.parse succeeds
- **Command:** Run parse/validate/display/mode/generate subcommands, pipe to `jq .` (fails if invalid JSON)
- **Target:** All 5 subcommands produce valid JSON
- **Evidence:** Orchestrator agents consume CLI output as JSON; invalid JSON breaks agent workflows
- **Correlation with full metric:** HIGH — JSON validity is binary (valid or invalid)
- **Blind spots:** Doesn't validate JSON schema structure (only syntax)
- **Validated:** No — awaiting deferred validation at Phase 15

## Level 3: Deferred Validations

**Purpose:** Full integration testing requiring Phase 15 or later.

### D1: Long-Term Roadmap Round-Trip Integrity in Real Workflow — DEFER-11-01
- **What:** End-to-end workflow: create long-term roadmap via wizard -> display -> parse -> validate in a real GRD project
- **How:**
  1. Create new GRD project
  2. Run `/grd:long-term-roadmap` command (when implemented in Phase 12)
  3. Verify LONG-TERM-ROADMAP.md is created with correct schema
  4. Run `long-term-roadmap display` and verify tier indicators [Now]/[Next]/[Later]
  5. Parse and validate the file via CLI
  6. Manually inspect output for correctness
- **Why deferred:** Requires `/grd:long-term-roadmap` orchestrator command (not implemented until Phase 12) and integration with real project structure
- **Validates at:** Phase 15 (Integration & Validation)
- **Depends on:** Phase 12 completion (refine/promote commands), full Phase 15 integration testing
- **Target:** Wizard creates valid roadmap, display shows tiers, parse/validate return success, no errors in workflow
- **Risk if unmet:** Schema may be incompatible with orchestrator agent expectations; users cannot create valid roadmaps through wizard — requires schema redesign (1 additional iteration, 1-2 days)
- **Fallback:** Adjust schema based on integration failures, regenerate parser/generator logic

### D2: Planning Mode Auto-Detection in Real Projects — DEFER-11-02
- **What:** Verify mode detection correctly activates hierarchical mode when LONG-TERM-ROADMAP.md exists and preserves progressive mode otherwise
- **How:**
  1. Test in existing GRD project (progressive mode, no LONG-TERM-ROADMAP.md): verify `/grd:new-milestone` continues to work
  2. Create LONG-TERM-ROADMAP.md, verify mode switches to hierarchical
  3. Run `/grd:long-term-roadmap display` and verify it uses hierarchical mode
  4. Delete LONG-TERM-ROADMAP.md, verify mode reverts to progressive
- **Why deferred:** Requires interaction with existing milestone commands and orchestrator agents to verify no breaking changes
- **Validates at:** Phase 15 (Integration & Validation)
- **Depends on:** Existing `/grd:new-milestone` command, orchestrator agent mode-aware behavior
- **Target:** Progressive mode is default; hierarchical mode activates only when LONG-TERM-ROADMAP.md exists; no breaking changes to existing commands
- **Risk if unmet:** Mode detection interferes with existing progressive workflow — users cannot use GRD in current projects without breaking changes — requires mode detection logic redesign (1 iteration, 1 day)
- **Fallback:** Add explicit config flag to force mode, make hierarchical opt-in only

## Ablation Plan

**No ablation plan** — This phase implements a schema and CLI interface with no sub-components to isolate. All functions (parse, validate, generate, format, mode detect) are individually unit-tested. There are no alternative implementations to compare against.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test count | Existing test count from v0.0.5 | 690+ tests | BASELINE.md |
| Line coverage | v0.0.5 coverage standard | >= 80% on lib/ modules | Phase 8 success criteria, BASELINE.md |
| Zero regressions | All existing tests pass | 100% pass rate | v0.0.5 CI requirements |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/long-term-roadmap.test.js (Plan 11-01 tests)
tests/unit/commands.test.js (Plan 11-02 tests, cmdLongTermRoadmap block)
```

**How to run full evaluation:**
```bash
# Sanity checks
node -e "const m = require('./lib/long-term-roadmap.js'); console.log(Object.keys(m).sort().join(','))"
node bin/grd-tools.js long-term-roadmap 2>&1 | head -1
npx jest tests/unit/long-term-roadmap.test.js --listTests
npx eslint lib/long-term-roadmap.js tests/unit/long-term-roadmap.test.js

# Proxy metrics
npx jest tests/unit/long-term-roadmap.test.js --coverage --collectCoverageFrom="lib/long-term-roadmap.js"
npx jest tests/unit/commands.test.js --testNamePattern="cmdLongTermRoadmap"
npx jest --passWithNoTests

# CLI output validation
node bin/grd-tools.js long-term-roadmap mode | jq .
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module Exports | [PASS/FAIL] | [exports list] | |
| S2: CLI Command Exists | [PASS/FAIL] | [error message] | |
| S3: Unit Tests Compile | [PASS/FAIL] | [file list] | |
| S4: CLI Tests Compile | [PASS/FAIL] | [file list] | |
| S5: No Crashes on Valid Input | [PASS/FAIL] | [JSON output] | |
| S6: No Crashes on Invalid Input | [PASS/FAIL] | [error JSON] | |
| S7: Mode Detection Filesystem Check | [PASS/FAIL] | [mode JSON] | |
| S8: ESLint Passes | [PASS/FAIL] | [zero errors] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Test Count (Plan 11-01) | >= 30 | [actual] | [MET/MISSED] | |
| P2: Test Count (Plan 11-02) | >= 20 | [actual] | [MET/MISSED] | |
| P3: Line Coverage | >= 80% | [actual]% | [MET/MISSED] | |
| P4: Round-Trip Integrity | PASS | [PASS/FAIL] | [MET/MISSED] | |
| P5: Regression Test Pass Rate | 690+ pass | [actual] pass | [MET/MISSED] | |
| P6: CLI Output Schema Validation | All valid JSON | [N/5 valid] | [MET/MISSED] | |

### Ablation Results

N/A — No ablation analysis for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-11-01 | Long-term roadmap round-trip integrity in real workflow | PENDING | Phase 15 |
| DEFER-11-02 | Planning mode auto-detection in real projects | PENDING | Phase 15 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 8 checks cover module structure, CLI routing, compilation, filesystem checks, and linting
- Proxy metrics: Well-evidenced — test count and coverage targets derived from v0.0.5 standards (BASELINE.md), round-trip tests are industry-standard for parser validation, regression tests ensure backward compatibility
- Deferred coverage: Comprehensive — end-to-end workflow validation and mode detection integration are the only aspects requiring real project context

**What this evaluation CAN tell us:**
- Whether the parser correctly extracts Now/Next/Later tiers from LONG-TERM-ROADMAP.md content
- Whether validation catches schema violations per the spec
- Whether mode detection returns correct values based on filesystem state
- Whether CLI commands produce valid JSON output
- Whether round-trip (generate -> parse) preserves data integrity
- Whether new code meets v0.0.5 quality standards (80%+ coverage, zero regressions)

**What this evaluation CANNOT tell us:**
- Whether the schema design is usable for real-world roadmap planning — addressed at Phase 15 (DEFER-11-01)
- Whether mode detection interferes with existing progressive-mode workflows — addressed at Phase 15 (DEFER-11-02)
- Whether orchestrator agents can successfully consume CLI output for wizard workflows — addressed at Phase 12/15
- Whether the Now/Next/Later tier structure aligns with user mental models — user acceptance testing (post-v1.0)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
