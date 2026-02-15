# Evaluation Plan: Phase 8 — Status Dashboard

**Designed:** 2026-02-15
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** TUI visualization commands (dashboard, phase-detail, health)
**Reference papers:** N/A (implementation phase, not research)

## Evaluation Overview

Phase 8 implements three read-only TUI commands that aggregate and visualize existing GRD project state: `grd:dashboard` (full project tree), `grd:phase-detail <N>` (single-phase drill-down), and `grd:health` (project health indicators). These are pure data aggregation commands that parse ROADMAP.md, STATE.md, and phase directories to produce both structured JSON (with `--raw`) and formatted TUI output.

Evaluation focuses on functional correctness (accurate data extraction and aggregation), output format compliance (JSON structure for `--raw`, ui-brand.md patterns for TUI), and error handling (graceful degradation when data is missing or malformed).

This is an implementation phase with no research component, so evaluation is primarily functional testing rather than metric-based quality assessment. The tiered verification focuses on code correctness (unit tests), integration correctness (CLI route testing), and production readiness (edge case handling).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit test coverage | Jest coverage report | Ensures all data aggregation logic is tested |
| Integration test pass rate | Jest integration suite | Verifies CLI routes correctly dispatch to command functions |
| Edge case handling | Manual testing + unit tests | Confirms graceful degradation with missing/empty data |
| TUI format compliance | Visual inspection + integration tests | Ensures output matches ui-brand.md patterns |
| JSON structure validity | JSON schema validation in tests | Confirms `--raw` output is parseable and complete |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 checks | Basic functionality and format verification |
| Proxy (L2) | 4 metrics | Automated test coverage and output quality checks |
| Deferred (L3) | 2 validations | User acceptance and real-world usage validation |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Function Export Check
- **What:** All three command functions are exported from lib/commands.js
- **Command:** `node -e "const c = require('./lib/commands'); console.log(typeof c.cmdDashboard, typeof c.cmdPhaseDetail, typeof c.cmdHealth)"`
- **Expected:** `function function function`
- **Failure means:** Module extraction failed or exports are misconfigured

### S2: CLI Route Registration
- **What:** All three CLI routes are registered in bin/grd-tools.js
- **Command:** `grep -E "case 'dashboard':|case 'phase-detail':|case 'health':" bin/grd-tools.js | wc -l`
- **Expected:** `3` (three case statements)
- **Failure means:** CLI router not updated with new commands

### S3: Dashboard JSON Output
- **What:** dashboard command produces valid JSON with --raw flag
- **Command:** `node bin/grd-tools.js dashboard --raw 2>&1 | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log('milestones:',j.milestones?.length,'summary:',!!j.summary)})"`
- **Expected:** `milestones: 4 summary: true` (or similar counts matching current ROADMAP.md)
- **Failure means:** JSON output is malformed or missing required keys

### S4: Phase-Detail JSON Output
- **What:** phase-detail command produces valid JSON with --raw flag
- **Command:** `node bin/grd-tools.js phase-detail 4 --raw 2>&1 | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log('plans:',j.plans?.length,'phase:',j.phase_number)})"`
- **Expected:** `plans: 4 phase: 4` (matches phase 4's actual plan count)
- **Failure means:** JSON output is malformed or data extraction failed

### S5: Health JSON Output
- **What:** health command produces valid JSON with --raw flag
- **Command:** `node bin/grd-tools.js health --raw 2>&1 | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log('deferred:',j.deferred_validations?.total,'velocity:',!!j.velocity)})"`
- **Expected:** `deferred: 6 velocity: true` (matches STATE.md deferred validation count)
- **Failure means:** JSON output is malformed or STATE.md parsing failed

### S6: Command Markdown Files Exist
- **What:** All three command markdown files are created
- **Command:** `ls commands/dashboard.md commands/phase-detail.md commands/health.md 2>&1 | wc -l`
- **Expected:** `3` (all three files exist)
- **Failure means:** Command definitions not created for agent invocation

### S7: No Test Regressions
- **What:** Existing test suite still passes after new additions
- **Command:** `npm test 2>&1 | tail -1`
- **Expected:** Output contains "PASS" or "Tests passed" with exit code 0
- **Failure means:** New code broke existing functionality

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: Unit Test Coverage
- **What:** Line coverage for lib/commands.js after new functions added
- **How:** Run Jest with coverage on lib/commands.js module
- **Command:** `npx jest tests/unit/commands.test.js --coverage --collectCoverageFrom='lib/commands.js' 2>&1 | grep -A 2 'lib/commands.js'`
- **Target:** >= 80% line coverage (matches project-wide threshold from jest.config.js)
- **Evidence:** Phase 4 established 80% per-file coverage threshold (deep-dive: STATE.md decision "Per-file coverage thresholds instead of global")
- **Correlation with full metric:** HIGH — line coverage correlates strongly with code path testing
- **Blind spots:** Coverage doesn't measure test quality (assertions could be weak), doesn't catch logic errors in covered code
- **Validated:** No — awaiting deferred validation at manual UAT (DEFER-08-01)

### P2: Unit Test Count
- **What:** Number of unit tests added for the three new commands
- **How:** Count test cases in cmdDashboard, cmdPhaseDetail, cmdHealth describe blocks
- **Command:** `grep -E "it\('|test\(" tests/unit/commands.test.js | grep -A 1 "describe('cmd\(Dashboard\|PhaseDetail\|Health\)" | wc -l`
- **Target:** >= 22 test cases (per success criteria in 08-02-PLAN.md)
- **Evidence:** Plan 08-02 specifies minimum test counts: 8 for cmdDashboard + 6 for cmdPhaseDetail + 8 for cmdHealth = 22 total
- **Correlation with full metric:** MEDIUM — test count is a weak proxy for test quality, but ensures breadth of coverage
- **Blind spots:** Doesn't measure assertion quality, doesn't verify edge cases are actually tested
- **Validated:** No — awaiting deferred validation at code review (DEFER-08-02)

### P3: Integration Test Count
- **What:** Number of integration tests added for CLI routes
- **How:** Count test cases for dashboard/phase-detail/health in integration suite
- **Command:** `grep -E "it\('|test\(" tests/integration/cli.test.js | grep -E "dashboard|phase-detail|health" | wc -l`
- **Target:** >= 9 test cases (per success criteria in 08-02-PLAN.md: 3 per command)
- **Evidence:** Plan 08-02 specifies 3 integration tests per command (normal, --raw, edge case)
- **Correlation with full metric:** MEDIUM — integration tests verify CLI wiring but don't test all data paths
- **Blind spots:** Doesn't verify TUI formatting quality, doesn't test real-world usage patterns
- **Validated:** No — awaiting deferred validation at UAT (DEFER-08-01)

### P4: JSON Schema Compliance
- **What:** Structured JSON output contains all required keys
- **How:** Parse JSON output and verify presence of expected keys
- **Command:** Custom test in integration suite that validates JSON schema
- **Target:** All three commands produce JSON with documented structure (milestones/summary for dashboard, plans/decisions for phase-detail, blockers/velocity for health)
- **Evidence:** Plan 08-01 specifies exact JSON structure for each command
- **Correlation with full metric:** HIGH — schema compliance ensures downstream consumers can parse output reliably
- **Blind spots:** Doesn't verify semantic correctness of data (keys could be present but values wrong)
- **Validated:** No — awaiting deferred validation at real-world usage (DEFER-08-01)

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: User Acceptance Testing — DEFER-08-01
- **What:** Real-world usage validation of TUI commands by actual users
- **How:** Have GRD users invoke `/grd:dashboard`, `/grd:phase-detail <N>`, `/grd:health` on their own projects and report issues
- **Why deferred:** Requires real projects with diverse .planning/ structures beyond test fixtures
- **Validates at:** post-v0.0.5 user feedback period (not a specific phase)
- **Depends on:** v0.0.5 release, users with GRD projects
- **Target:** Zero crash reports, >= 90% user satisfaction with TUI clarity/usefulness
- **Risk if unmet:** Commands may not handle edge cases present in real projects (unusual ROADMAP.md formats, corrupted STATE.md, etc.) — mitigation: add defensive parsing and null checks proactively
- **Fallback:** Iterate on error handling based on user reports in v1.1 patch cycle

### D2: Code Review Quality Assessment — DEFER-08-02
- **What:** Manual code review of cmdDashboard, cmdPhaseDetail, cmdHealth functions
- **How:** grd-code-reviewer agent or human reviewer audits code for readability, maintainability, error handling
- **Why deferred:** Not part of Phase 8 scope (no REVIEW.md planned); Phase 8 uses autonomous execution without code review
- **Validates at:** optional post-phase code review if issues arise
- **Depends on:** Completed implementation (08-01-SUMMARY.md exists)
- **Target:** No critical issues (P0), <= 2 minor issues (P2) per function
- **Risk if unmet:** Code may be hard to maintain, poor error messages, inconsistent patterns — mitigation: follow existing command patterns from lib/commands.js closely
- **Fallback:** Refactor during v1.1 maintenance if maintainability issues surface

## Ablation Plan

**No ablation plan** — This phase implements three independent utility commands with no sub-components to isolate. Each command is a standalone data aggregation function. Ablation testing (e.g., testing dashboard with/without STATE.md parsing) is covered by unit tests as edge case handling, not as formal ablation conditions.

## Baselines

No quantitative baselines apply (this is not a performance or quality optimization phase). Qualitative baseline: Current state is no dashboard commands exist — users must manually inspect ROADMAP.md, STATE.md, and phase directories to understand project status.

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| N/A | No prior dashboard functionality | N/A | Phase 8 is net-new feature |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/commands.test.js (cmdDashboard, cmdPhaseDetail, cmdHealth tests)
tests/integration/cli.test.js (dashboard, phase-detail, health CLI route tests)
```

**How to run full evaluation:**
```bash
# Run all tests
npm test

# Run only dashboard-related tests
npx jest tests/unit/commands.test.js --testNamePattern="cmd(Dashboard|PhaseDetail|Health)"
npx jest tests/integration/cli.test.js --testNamePattern="(dashboard|phase-detail|health)"

# Run with coverage
npx jest tests/unit/commands.test.js --coverage --collectCoverageFrom='lib/commands.js'

# Manual sanity checks
node bin/grd-tools.js dashboard
node bin/grd-tools.js dashboard --raw | jq .
node bin/grd-tools.js phase-detail 4
node bin/grd-tools.js phase-detail 4 --raw | jq .
node bin/grd-tools.js health
node bin/grd-tools.js health --raw | jq .
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Function exports | [PASS/FAIL] | [output] | |
| S2: CLI routes | [PASS/FAIL] | [output] | |
| S3: Dashboard JSON | [PASS/FAIL] | [output] | |
| S4: Phase-detail JSON | [PASS/FAIL] | [output] | |
| S5: Health JSON | [PASS/FAIL] | [output] | |
| S6: Command files | [PASS/FAIL] | [output] | |
| S7: Test regressions | [PASS/FAIL] | [output] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Unit coverage | >= 80% | [actual]% | [MET/MISSED] | |
| P2: Unit test count | >= 22 | [actual] | [MET/MISSED] | |
| P3: Integration test count | >= 9 | [actual] | [MET/MISSED] | |
| P4: JSON schema compliance | All keys present | [status] | [MET/MISSED] | |

### Ablation Results

N/A — No ablation testing planned for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-08-01 | User acceptance testing | PENDING | post-v0.0.5 user feedback |
| DEFER-08-02 | Code review quality | PENDING | optional post-phase review |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** Adequate — 7 checks cover function exports, CLI routes, JSON output validity, and test regressions
- **Proxy metrics:** Well-evidenced — Coverage and test count metrics are standard software quality proxies; JSON schema compliance directly measures output correctness
- **Deferred coverage:** Comprehensive for this phase type — UAT and code review are appropriate deferred validations for utility commands; no critical gaps

**What this evaluation CAN tell us:**
- Whether the three commands execute without errors
- Whether JSON output is structurally valid and parseable
- Whether unit and integration tests provide adequate coverage
- Whether existing functionality is not broken by new additions
- Whether TUI output contains expected data elements (via integration tests)

**What this evaluation CANNOT tell us:**
- Whether TUI formatting is visually pleasing or usable (manual review needed)
- Whether commands handle all possible ROADMAP.md/STATE.md variations in real projects (UAT needed)
- Whether code is maintainable and follows best practices (code review needed)
- Whether performance is acceptable on very large projects (100+ phases) (performance testing needed, not in scope)
- Whether ui-brand.md patterns are correctly followed in all edge cases (visual inspection needed)

**Mitigation for limitations:**
- TUI formatting: Include visual inspection in S6 sanity check (manual run of all three commands)
- Real-world variation handling: Add defensive parsing and null checks proactively, based on known edge cases from existing codebase
- Maintainability: Follow existing command patterns in lib/commands.js closely; defer code review to post-implementation if issues arise

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-15*
