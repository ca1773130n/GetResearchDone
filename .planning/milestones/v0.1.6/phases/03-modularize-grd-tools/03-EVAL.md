# Evaluation Plan: Phase 3 — Modularize grd-tools.js

**Designed:** 2026-02-12
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Code modularization (extract-module refactoring pattern)
**Reference papers:** None (infrastructure refactoring, not research)

## Evaluation Overview

This phase transforms a 5,721-line monolithic CLI tool into a testable modular architecture. Unlike research phases that implement novel methods from papers, this is a **software engineering refactoring phase** where success means preserving exact behavior while improving code structure.

The evaluation strategy uses **regression testing** as the primary quality signal. Golden reference outputs captured before modularization serve as the ground truth. Every CLI command must produce bit-for-bit identical output after modularization, with the only exceptions being non-deterministic fields (timestamps, temp paths).

This evaluation plan defines **what can be verified in-phase** (sanity checks and output regression) versus **what requires Phase 4** (test coverage, performance benchmarks, integration with agents/workflows).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| CLI output identity | Golden reference capture (Plan 03-01) | Direct verification that CLI interface is unchanged |
| Module line counts | `wc -l` on all lib/*.js and bin/grd-tools.js | Phase success criteria: no file > 500 lines, bin/grd-tools.js <= 300 lines |
| Circular dependency detection | Node.js require() runtime test | Ensures clean module boundaries |
| Valid JSON output | `jq` parse test on CLI output | Verifies all commands still produce parseable JSON |
| Function export coverage | Static analysis of module.exports | Ensures all functions are accessible |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Basic functionality and format verification |
| Proxy (L2) | 5 | Regression detection via golden reference diffs |
| Deferred (L3) | 4 | Full test coverage and integration validation |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality after each extraction. These MUST ALL PASS before proceeding to the next plan.

### S1: Module Loading
- **What:** All extracted lib/ modules can be required without error
- **Command:** `node -e "require('./lib/utils'); require('./lib/frontmatter'); require('./lib/state'); require('./lib/verify'); require('./lib/roadmap'); require('./lib/scaffold'); require('./lib/phase'); require('./lib/tracker'); require('./lib/context'); require('./lib/commands'); console.log('OK')"`
- **Expected:** Output: `OK` (no syntax errors, no circular dependencies, no missing dependencies)
- **Failure means:** Module extraction has syntax errors or circular dependency issues

### S2: CLI Executable
- **What:** bin/grd-tools.js remains executable and responds to help/version commands
- **Command:** `node bin/grd-tools.js --version && node bin/grd-tools.js state load`
- **Expected:** Version output on first command, JSON output on second command (no crashes)
- **Failure means:** CLI router is broken or imports are missing

### S3: Line Count Targets
- **What:** Verify file size constraints are met
- **Command:** `wc -l bin/grd-tools.js; for f in lib/*.js; do wc -l $f; done`
- **Expected:**
  - `bin/grd-tools.js` <= 300 lines
  - Each `lib/*.js` file <= 500 lines (documented exceptions: `lib/tracker.js` ~930 lines, `lib/context.js` ~718 lines, `lib/phase.js` ~848 lines per PLAN.md)
- **Failure means:** Extraction did not achieve modularization goals

### S4: Valid JSON Output Format
- **What:** All commands that should return JSON produce parseable JSON
- **Command:** `node bin/grd-tools.js state load | jq . > /dev/null && node bin/grd-tools.js roadmap analyze | jq . > /dev/null && node bin/grd-tools.js progress json | jq . > /dev/null`
- **Expected:** All three commands parse successfully (exit code 0)
- **Failure means:** JSON output structure broken during refactoring

### S5: No Circular Dependencies
- **What:** Module dependency graph is acyclic
- **Command:** `node -c lib/utils.js && node -c lib/frontmatter.js && node -c lib/state.js && node -c lib/verify.js && node -c lib/roadmap.js && node -c lib/scaffold.js && node -c lib/phase.js && node -c lib/tracker.js && node -c lib/context.js && node -c lib/commands.js`
- **Expected:** All files have valid syntax (exit code 0 for all)
- **Failure means:** Syntax errors or module resolution issues

### S6: Input/Output Format Preservation
- **What:** Commands accept expected arguments and produce expected output shape
- **Command:** `node bin/grd-tools.js generate-slug "hello world" && node bin/grd-tools.js current-timestamp --raw && node bin/grd-tools.js find-phase 3`
- **Expected:**
  - First command: slug format output
  - Second command: ISO date string
  - Third command: JSON with phase path
- **Failure means:** Command router or function signatures broken

### S7: Determinism Check
- **What:** Same input produces same output (for deterministic commands)
- **Command:** `OUT1=$(node bin/grd-tools.js generate-slug "test"); OUT2=$(node bin/grd-tools.js generate-slug "test"); [ "$OUT1" = "$OUT2" ] && echo "PASS" || echo "FAIL"`
- **Expected:** Output: `PASS`
- **Failure means:** Non-deterministic behavior introduced during refactoring

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to next plan.

## Level 2: Proxy Metrics

**Purpose:** Automated regression detection using golden reference outputs.
**IMPORTANT:** Proxy metrics detect most regressions but cannot verify semantic correctness of complex commands. Full validation requires Phase 4 integration tests.

### P1: Golden Reference Diff (Read-Only Commands)
- **What:** All read-only CLI commands produce identical output to golden references
- **How:** Capture current output for each command, diff against `tests/golden/output/*.json`
- **Command:** `bash tests/golden/capture.sh --output-dir tests/golden/current && diff -r tests/golden/output tests/golden/current`
- **Target:** Zero differences (or only expected differences in timestamps/paths)
- **Evidence:** Plan 03-01 captures golden references before any modularization
- **Correlation with full metric:** HIGH — output identity is the definition of behavior preservation for CLI tools
- **Blind spots:**
  - Does not detect semantic errors if original output was already wrong
  - Does not test error handling or edge cases not covered by golden captures
  - Does not test mutating commands (those use isolated temp dirs)
- **Validated:** false — awaiting Phase 4 integration tests

### P2: Module Export Coverage
- **What:** All functions that were in bin/grd-tools.js are now exported from lib/ modules
- **How:** Count function definitions in original vs. exported functions in modules
- **Command:** `grep -c "^function cmd" bin/grd-tools.js.backup; node -e "console.log(Object.keys(require('./lib/commands')).length + Object.keys(require('./lib/state')).length + Object.keys(require('./lib/phase')).length)"`
- **Target:** Count of exported functions >= count of original functions
- **Evidence:** All cmd* functions must be accessible via module.exports
- **Correlation with full metric:** MEDIUM — proves functions exist but not that they work
- **Blind spots:**
  - Does not verify function signatures are correct
  - Does not verify internal helper functions are properly shared
- **Validated:** false — awaiting Phase 4 test coverage

### P3: Command Router Completeness
- **What:** CLI router switch statement dispatches to all original commands
- **How:** Count case statements in bin/grd-tools.js router
- **Command:** `grep -c "case '" bin/grd-tools.js`
- **Target:** >= 64 case statements (all known commands)
- **Evidence:** ROADMAP.md documents "64 CLI commands"
- **Correlation with full metric:** MEDIUM — proves router is complete but not that dispatch works
- **Blind spots:**
  - Does not verify each case actually calls the correct function
  - Does not test command aliases or --help flags
- **Validated:** false — awaiting Phase 4 CLI integration tests

### P4: Module Dependency Analysis
- **What:** Verify no unexpected dependencies between modules
- **How:** Static analysis of require() calls in lib/ modules
- **Command:** `for f in lib/*.js; do echo "=== $f ==="; grep "require.*\./" $f || echo "no local requires"; done`
- **Target:** Only expected dependencies (e.g., all modules can require utils.js, but commands.js should not require tracker.js)
- **Evidence:** Design principle: utils as base layer, domain modules above, commands layer on top
- **Correlation with full metric:** LOW — clean dependencies correlate with testability but don't prove correctness
- **Blind spots:**
  - Static analysis misses dynamic requires
  - Cannot detect coupling through shared global state
- **Validated:** false — deferred to code review in Phase 6

### P5: File Size Distribution
- **What:** Verify code was distributed evenly across modules (no mega-modules)
- **How:** Compare line counts across all lib/ modules
- **Command:** `wc -l lib/*.js | sort -n`
- **Target:** No single module dominates (> 50% of total lib/ lines), except documented exceptions
- **Evidence:** Even distribution suggests good separation of concerns
- **Correlation with full metric:** LOW — size balance is aesthetic, not functional
- **Blind spots:**
  - Does not account for complexity differences (tracker.js is legitimately large)
  - Large modules may be appropriate if they have clear single responsibility
- **Validated:** false — design quality deferred to code review

**Proxy metric confidence:** MEDIUM-HIGH for P1 (golden diff), MEDIUM for P2-P3, LOW for P4-P5

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration testing, test coverage, or Phase 4 infrastructure.

### D1: All 64 Commands Functional — DEFER-03-01
- **What:** Every CLI command works correctly in real usage scenarios
- **How:** Jest integration test suite with fixtures for all 64 commands
- **Why deferred:** Requires Jest test framework installed in Phase 4
- **Validates at:** phase-04-test-suite
- **Depends on:** Jest installed, test fixtures created, `tests/integration/cli.test.js`
- **Target:** 64/64 commands pass integration tests (100%)
- **Risk if unmet:** Refactoring broke commands that weren't covered by golden references → rollback to monolith, identify which extractions failed, fix and retry
- **Fallback:** Keep `bin/grd-tools.js.backup` as rollback point

### D2: CLI JSON Output Unchanged — DEFER-03-02
- **What:** CLI JSON structure is bit-for-bit identical for all commands (validated with snapshots)
- **How:** Jest snapshot tests on all CLI JSON outputs
- **Why deferred:** Requires Jest snapshot testing in Phase 4
- **Validates at:** phase-04-test-suite
- **Depends on:** Jest configured, `tests/integration/cli.test.js` with snapshot assertions
- **Target:** All snapshots match golden references (zero snapshot failures)
- **Risk if unmet:** Subtle output format changes broke downstream consumers (agents, parsers) → identify which commands changed, fix serialization logic
- **Fallback:** Use golden reference diffs (Level 2) to narrow down which commands changed

### D3: Unit Test Coverage >= 80% — DEFER-03-03
- **What:** All lib/ modules have comprehensive unit test coverage
- **How:** Jest `--coverage` with per-module thresholds
- **Why deferred:** Requires Jest and unit tests created in Phase 4
- **Validates at:** phase-04-test-suite
- **Depends on:** `tests/unit/*.test.js` for each lib/ module
- **Target:** >= 80% line coverage per module (reported by Jest)
- **Risk if unmet:** Modules are not truly testable (too coupled, too stateful) → redesign module boundaries, extract pure functions, add dependency injection
- **Fallback:** Accept lower coverage for inherently hard-to-test modules (tracker.js with GitHub API calls), document rationale

### D4: Agent and Workflow Integration — DEFER-03-04
- **What:** All 19 agents still work correctly with modularized grd-tools.js
- **How:** Run end-to-end workflow tests (`/grd:new-project`, `/grd:plan-phase`, `/grd:execute-phase`)
- **Why deferred:** Requires full GRD plugin context and agent execution environment
- **Validates at:** phase-07-validation-release (final product verification)
- **Depends on:** All phases complete, v0.0.5 integration testing
- **Target:** All workflows complete without errors, produce expected artifacts
- **Risk if unmet:** CLI interface changes broke agent bash calls → identify which agents call which commands, add integration tests for those paths, fix CLI or agent
- **Fallback:** PRODUCT-QUALITY.md documents "All 19 agents functional" as operational requirement — this is a release gate

## Ablation Plan

**Purpose:** Isolate component contributions during modularization.

### A1: No Extraction (Baseline)
- **Condition:** Use original monolithic bin/grd-tools.js (before Plan 03-01)
- **Expected impact:** All commands work (baseline = 100% functional)
- **Command:** `git checkout HEAD~N bin/grd-tools.js && node bin/grd-tools.js state load`
- **Evidence:** Current behavior before any refactoring
- **Purpose:** Establish baseline for comparison

### A2: Single Module Extraction (lib/utils.js only)
- **Condition:** Extract only utils.js, leave everything else in bin/grd-tools.js
- **Expected impact:** Commands that use shared helpers should still work
- **Command:** After Plan 03-02, verify all commands still pass sanity checks
- **Purpose:** Verify the smallest atomic extraction works

### A3: Incremental Extraction (after each plan)
- **Condition:** Run golden reference diff after EACH plan (03-02, 03-03, 03-04, 03-05, 03-06, 03-07)
- **Expected impact:** Zero new regressions introduced by each extraction
- **Command:** `bash tests/golden/capture.sh --compare` after each plan
- **Purpose:** Isolate which extraction caused any regressions

**Note:** Ablations are really "incremental verification" in this refactoring context. Each plan is an ablation condition (partial modularization).

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Monolith (current) | bin/grd-tools.js at 5,721 lines, all 64 commands functional | 64/64 commands work | Current state (Phase 2 complete) |
| File size target | Largest file after modularization | <= 300 lines (bin/grd-tools.js) | PRODUCT-QUALITY.md, Phase 3 success criteria |
| Module count | Number of extracted modules | 10 modules (utils, frontmatter, state, verify, roadmap, scaffold, phase, tracker, context, commands) | ROADMAP.md Phase 3 scope |
| Zero regressions | CLI output unchanged | 100% golden reference match | Plan 03-01 captures baseline |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/golden/capture.sh            -- Created in Plan 03-01
tests/golden/README.md             -- Documentation of golden reference usage
tests/golden/output/*.json         -- Golden reference outputs (baseline)
tests/golden/fixtures/             -- Minimal .planning/ fixtures for testing
```

**How to run full evaluation:**

```bash
# Run after any plan completes to check for regressions
cd /Users/edward.seo/dev/private/project/harness/GRD

# Level 1: Sanity Checks
echo "=== Sanity Check S1: Module Loading ==="
node -e "require('./lib/utils'); require('./lib/frontmatter'); require('./lib/state'); require('./lib/verify'); require('./lib/roadmap'); require('./lib/scaffold'); require('./lib/phase'); require('./lib/tracker'); require('./lib/context'); require('./lib/commands'); console.log('OK')"

echo "=== Sanity Check S2: CLI Executable ==="
node bin/grd-tools.js --version
node bin/grd-tools.js state load | head -5

echo "=== Sanity Check S3: Line Count Targets ==="
echo "bin/grd-tools.js:"
wc -l bin/grd-tools.js
echo "lib/ modules:"
wc -l lib/*.js | sort -n

echo "=== Sanity Check S4: Valid JSON ==="
node bin/grd-tools.js state load | jq . > /dev/null && echo "PASS: state load"
node bin/grd-tools.js roadmap analyze | jq . > /dev/null && echo "PASS: roadmap analyze"
node bin/grd-tools.js progress json | jq . > /dev/null && echo "PASS: progress json"

echo "=== Sanity Check S5: No Circular Dependencies ==="
for f in lib/*.js; do node -c $f && echo "OK: $f"; done

echo "=== Sanity Check S6: Input/Output Format ==="
node bin/grd-tools.js generate-slug "hello world"
node bin/grd-tools.js current-timestamp --raw
node bin/grd-tools.js find-phase 3

echo "=== Sanity Check S7: Determinism ==="
OUT1=$(node bin/grd-tools.js generate-slug "test")
OUT2=$(node bin/grd-tools.js generate-slug "test")
[ "$OUT1" = "$OUT2" ] && echo "PASS: deterministic" || echo "FAIL: non-deterministic"

# Level 2: Proxy Metrics
echo "=== Proxy Metric P1: Golden Reference Diff ==="
bash tests/golden/capture.sh --compare

echo "=== Proxy Metric P2: Module Export Coverage ==="
echo "Exports from lib/commands.js, lib/state.js, lib/phase.js:"
node -e "console.log('commands:', Object.keys(require('./lib/commands')).length); console.log('state:', Object.keys(require('./lib/state')).length); console.log('phase:', Object.keys(require('./lib/phase')).length);"

echo "=== Proxy Metric P3: Command Router Completeness ==="
echo "Case statements in bin/grd-tools.js:"
grep -c "case '" bin/grd-tools.js || echo "0"

echo "=== Proxy Metric P4: Module Dependencies ==="
for f in lib/*.js; do echo "=== $f ==="; grep "require.*\./" $f || echo "no local requires"; done

echo "=== Proxy Metric P5: File Size Distribution ==="
wc -l lib/*.js | sort -n

echo ""
echo "=== EVALUATION COMPLETE ==="
echo "Review output above. All sanity checks must PASS. Proxy metrics should show zero regressions."
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module Loading | | | |
| S2: CLI Executable | | | |
| S3: Line Count Targets | | | |
| S4: Valid JSON Output | | | |
| S5: No Circular Dependencies | | | |
| S6: Input/Output Format | | | |
| S7: Determinism | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Golden Reference Diff | 0 differences | | | |
| P2: Module Export Coverage | >= 64 functions | | | |
| P3: Command Router Completeness | >= 64 cases | | | |
| P4: Module Dependencies | Clean graph | | | |
| P5: File Size Distribution | No mega-modules | | | |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| A1: No Extraction | 64/64 commands work | | Baseline |
| A2: utils.js only | No regressions | | |
| A3: After 03-02 | No regressions | | |
| A3: After 03-03 | No regressions | | |
| A3: After 03-04 | No regressions | | |
| A3: After 03-05 | No regressions | | |
| A3: After 03-06 | No regressions | | |
| A3: After 03-07 | No regressions | | Final state |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-03-01 | All 64 commands functional | PENDING | phase-04-test-suite |
| DEFER-03-02 | CLI JSON output unchanged | PENDING | phase-04-test-suite |
| DEFER-03-03 | Unit test coverage >= 80% | PENDING | phase-04-test-suite |
| DEFER-03-04 | Agent/workflow integration | PENDING | phase-07-validation-release |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** COMPREHENSIVE — 7 checks cover loading, execution, size constraints, output validity, dependencies, format, and determinism. These are all verifiable in-phase with simple commands.
- **Proxy metrics:** WELL-EVIDENCED — Golden reference diff (P1) is the gold standard for CLI regression testing. It directly measures "did behavior change?" Other proxy metrics (P2-P5) are weaker but provide additional signals.
- **Deferred coverage:** COMPREHENSIVE — All high-risk validations (full test coverage, integration tests) are explicitly deferred to Phase 4 where the test infrastructure exists.

**What this evaluation CAN tell us:**
- Whether modularization preserved CLI interface (golden reference diff)
- Whether modules load without circular dependencies
- Whether file size targets are met
- Whether basic command execution works
- Whether JSON output is valid
- Whether the refactoring introduced obvious breakage

**What this evaluation CANNOT tell us:**
- Whether internal logic is correct (only that output matches baseline)
- Whether error handling works (golden references may not cover all error paths)
- Whether edge cases work (depends on golden reference coverage)
- Whether agents/workflows still work (requires full plugin context)
- Whether code is testable (requires writing unit tests in Phase 4)
- Whether modularization actually improved code quality (subjective, requires code review)

**Why deferred validations are necessary:**
- **DEFER-03-01/02 (Phase 4):** Golden references are a proxy. Real validation requires comprehensive test suite with edge cases, error conditions, and integration scenarios that golden captures may not cover.
- **DEFER-03-03 (Phase 4):** Cannot measure test coverage without tests. Tests cannot be written efficiently against a monolith, so modularization must happen first.
- **DEFER-03-04 (Phase 7):** End-to-end agent workflows require the full plugin runtime environment and real `.planning/` state, which is impractical to set up in Phase 3.

**Evaluation limitations:**
1. **Golden references assume baseline is correct.** If the original monolith had bugs, golden diffs won't detect them. This is acceptable — Phase 3 is behavior preservation, not bug fixing.
2. **Golden references may miss edge cases.** Plan 03-01's fixture directory is minimal. Real-world `.planning/` structures may exercise different code paths. Mitigation: Phase 4 integration tests use diverse fixtures.
3. **Sanity checks don't prove semantic correctness.** S6 checks that outputs look right, but doesn't validate against expected values. Mitigation: Phase 4 unit tests with assertions on expected values.

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-12*
