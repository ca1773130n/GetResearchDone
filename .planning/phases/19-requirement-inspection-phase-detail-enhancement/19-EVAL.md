# Evaluation Plan: Phase 19 — Requirement Inspection & Phase-Detail Enhancement

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** CLI command implementation (requirement get/list/traceability) + phase-detail enhancement
**Reference papers:** N/A (CLI implementation, not research)

## Evaluation Overview

Phase 19 implements developer tooling for requirement inspection and traceability. Unlike research phases that evaluate novel algorithms, this phase evaluates software engineering quality: correctness, robustness, usability, and integration.

This is a CLI implementation phase with two plans:
- **Plan 19-01:** Requirement parsing + three CLI commands (get, list, traceability)
- **Plan 19-02:** Phase-detail enhancement to show requirement summaries

The evaluation focuses on functional correctness (TDD tests), output quality (filter composition, format validation), and integration readiness (no regressions, coverage targets met).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test pass rate | Jest test suite | Validates functional correctness via TDD |
| Code coverage | Jest --coverage | Ensures new code is adequately tested (80% target per jest.config.js) |
| Filter composition correctness | Unit tests | Validates AND logic for --phase, --priority, --status, --category filters |
| Archived milestone fallback | Unit tests | Validates requirement lookup across current + archived REQUIREMENTS.md files |
| Output format validation | Unit tests + manual inspection | Ensures JSON schema consistency and TUI rendering correctness |
| Regression testing | Full test suite | Ensures new code doesn't break existing functionality |
| CLI integration | Manual smoke tests | Validates end-to-end CLI routing and error handling |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Basic functionality and format verification |
| Proxy (L2) | 6 | Automated metrics approximating real quality |
| Deferred (L3) | 2 | Real-world usage validation requiring integration |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: CLI Commands Execute Without Error
- **What:** All three requirement commands run without crashing
- **Command:**
  ```bash
  node bin/grd-tools.js requirement get REQ-31 --raw > /tmp/grd-test-req-get.json && \
  node bin/grd-tools.js requirement list --raw > /tmp/grd-test-req-list.json && \
  node bin/grd-tools.js requirement traceability --raw > /tmp/grd-test-req-trace.json && \
  echo "PASS"
  ```
- **Expected:** All three commands exit with code 0 and produce JSON output files
- **Failure means:** Basic CLI routing broken or command implementation missing

### S2: JSON Output Format Valid
- **What:** All commands produce valid JSON (parseable, no syntax errors)
- **Command:**
  ```bash
  node -e "JSON.parse(require('fs').readFileSync('/tmp/grd-test-req-get.json', 'utf8'))" && \
  node -e "JSON.parse(require('fs').readFileSync('/tmp/grd-test-req-list.json', 'utf8'))" && \
  node -e "JSON.parse(require('fs').readFileSync('/tmp/grd-test-req-trace.json', 'utf8'))" && \
  echo "PASS"
  ```
- **Expected:** All three JSON files parse without error
- **Failure means:** Output format broken or JSON serialization issue

### S3: Required Fields Present in Output
- **What:** `requirement get` output includes all required fields: id, title, priority, category, description, status
- **Command:**
  ```bash
  node bin/grd-tools.js requirement get REQ-31 --raw | \
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); \
  console.log(['id','title','priority','category','description','status'].every(f => f in d) ? 'PASS' : 'FAIL')"
  ```
- **Expected:** Output is "PASS"
- **Failure means:** Requirement parsing incomplete or field extraction broken

### S4: Filter Arguments Accepted
- **What:** `requirement list` accepts filter arguments without error
- **Command:**
  ```bash
  node bin/grd-tools.js requirement list --phase 19 --priority P0 --status Pending --category CLI --raw > /tmp/grd-test-filters.json && \
  echo "PASS"
  ```
- **Expected:** Command exits 0, no error messages
- **Failure means:** CLI argument parsing broken or filter handling missing

### S5: Invalid Subcommand Error Handling
- **What:** Invalid requirement subcommand produces clear error (not crash)
- **Command:**
  ```bash
  node bin/grd-tools.js requirement invalid 2>&1 | grep -q "invalid.*subcommand\|not.*recognized" && echo "PASS" || echo "FAIL"
  ```
- **Expected:** Output is "PASS" (error message detected)
- **Failure means:** CLI routing error handling incomplete

### S6: Phase-Detail Includes Requirements Section
- **What:** `phase-detail 19` output includes requirements data (JSON has requirements array, TUI has Requirements header)
- **Command:**
  ```bash
  node bin/grd-tools.js phase-detail 19 --raw | \
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('requirements' in d ? 'PASS' : 'FAIL')"
  ```
- **Expected:** Output is "PASS"
- **Failure means:** Phase-detail enhancement not integrated or parsing broken

### S7: Non-Existent Requirement ID Handled
- **What:** `requirement get` for non-existent ID returns error JSON (not crash)
- **Command:**
  ```bash
  node bin/grd-tools.js requirement get REQ-99999 --raw | \
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('error' in d ? 'PASS' : 'FAIL')"
  ```
- **Expected:** Output is "PASS" (error field present in JSON)
- **Failure means:** Error handling for missing requirements broken

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated metrics approximating real-world quality.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: TDD Test Coverage - Plan 19-01
- **What:** All unit tests for cmdRequirementGet, cmdRequirementList, cmdRequirementTraceability pass
- **How:** Run Jest tests with pattern filter
- **Command:** `npx jest tests/unit/commands.test.js --testNamePattern "cmdRequirement" --verbose`
- **Target:** 100% pass rate (15+ tests)
- **Evidence:** Plan 19-01 specifies TDD approach with 15+ tests covering get (5 tests), list (8 tests), traceability (4 tests)
- **Correlation with full metric:** HIGH — TDD tests directly validate functional requirements
- **Blind spots:** Tests may not cover all edge cases in real REQUIREMENTS.md files; filter logic may have undiscovered corner cases
- **Validated:** No — awaiting deferred validation via real-world usage

### P2: TDD Test Coverage - Plan 19-02
- **What:** All unit tests for cmdPhaseDetail requirements enhancement pass
- **How:** Run Jest tests with pattern filter
- **Command:** `npx jest tests/unit/commands.test.js --testNamePattern "cmdPhaseDetail requirements" --verbose`
- **Target:** 100% pass rate (5+ tests)
- **Evidence:** Plan 19-02 specifies 5 tests covering JSON output, field correctness, empty-requirements fallback, TUI rendering
- **Correlation with full metric:** HIGH — Tests validate both JSON and TUI output paths
- **Blind spots:** TUI rendering may have formatting issues not caught by tests; ROADMAP.md parsing may fail on edge cases
- **Validated:** No — awaiting deferred validation via real-world usage

### P3: Code Coverage Target
- **What:** New functions in lib/commands.js achieve >= 80% line coverage
- **How:** Jest coverage report filtered to new functions
- **Command:** `npx jest --coverage --testNamePattern "cmdRequirement|cmdPhaseDetail requirements" --collectCoverageFrom "lib/commands.js"`
- **Target:** >= 80% line coverage on cmdRequirementGet, cmdRequirementList, cmdRequirementTraceability, parseRequirements, parseTraceabilityMatrix, and cmdPhaseDetail enhancement
- **Evidence:** jest.config.js sets 80% line coverage threshold for lib/commands.js; Plans 19-01 and 19-02 both specify >= 80% coverage as success criteria
- **Correlation with full metric:** MEDIUM — High coverage doesn't guarantee correctness, but low coverage indicates untested code paths
- **Blind spots:** Coverage percentage doesn't validate logic correctness; edge cases may be covered but incorrectly handled
- **Validated:** No — coverage is a proxy for robustness, not a guarantee

### P4: Filter Composition Correctness
- **What:** Multiple filters compose correctly via AND logic
- **How:** Unit test validates that `--phase 19 --priority P0` returns only requirements matching BOTH filters
- **Command:** Manual inspection of test output (included in P1)
- **Target:** All filter composition tests pass (3 tests in Plan 19-01)
- **Evidence:** Plan 19-01 Task 1 specifies test case: "Filters compose: --phase 1 --priority P0 returns REQ-01 and REQ-03"
- **Correlation with full metric:** MEDIUM — Test validates composition on fixture data, but real REQUIREMENTS.md may have more complex filter interactions
- **Blind spots:** Fixture data may not represent all real-world filter combinations; phase number parsing (extracting "19" from "Phase 19") may fail on edge cases
- **Validated:** No — awaiting validation on real projects with diverse requirement sets

### P5: Regression Test Suite
- **What:** Full test suite passes with no failures (existing tests not broken by new code)
- **How:** Run full Jest suite
- **Command:** `npx jest --verbose`
- **Target:** 100% pass rate (1,305+ tests from v0.1.1 baseline + 20+ new tests)
- **Evidence:** Phase 19 plans specify "Full test suite passes with no regressions" as success criteria
- **Correlation with full metric:** HIGH — Passing regression tests strongly indicate no breakage of existing functionality
- **Blind spots:** Tests may not cover all integration points; existing tests may have false positives
- **Validated:** No — full integration validation deferred to Phase 21 (MCP wiring)

### P6: Output Format Consistency
- **What:** JSON output schemas match expected structure (requirement object has id/title/priority/category/description/status; list output has requirements array and count; traceability has matrix array)
- **How:** Schema validation via unit tests
- **Command:** Manual inspection of test assertions (included in P1 and P2)
- **Target:** All schema validation tests pass (5+ tests across get/list/traceability)
- **Evidence:** Plan 19-01 tests verify specific field presence and structure
- **Correlation with full metric:** MEDIUM — Tests validate schema on fixture data, but real usage may reveal serialization issues or missing edge case handling
- **Blind spots:** Schema may be valid but semantically incorrect; JSON may be correct but TUI rendering may mismatch
- **Validated:** No — awaiting validation via MCP server integration (Phase 21) which consumes JSON output

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or real-world usage.

### D1: MCP Tool Integration — DEFER-19-01
- **What:** All three requirement commands (get, list, traceability) work correctly when called via MCP server tools
- **How:** Phase 21 adds COMMAND_DESCRIPTORS entries; MCP integration tests validate tool invocation and JSON schema conformance
- **Why deferred:** Requires MCP server wiring from Phase 21 (REQ-37)
- **Validates at:** phase-21-mcp-extension-wiring
- **Depends on:** Phase 21 completion (MCP tool definitions + integration tests)
- **Target:** All MCP tools for requirement commands return valid JSON matching CLI output; no server crashes on valid or invalid input
- **Risk if unmet:** Commands unusable via MCP clients (e.g., Claude Desktop); may require JSON schema fixes or parameter handling changes
- **Fallback:** CLI commands remain usable directly; MCP wiring can be fixed in patch release

### D2: Real-World Requirement Complexity — DEFER-19-02
- **What:** Commands handle edge cases in real project REQUIREMENTS.md files (large traceability matrices, missing fields, special characters, archived milestones)
- **How:** Manual testing on 3+ real GRD projects with diverse requirement sets
- **Why deferred:** No real projects with complex REQUIREMENTS.md available during Phase 19 execution
- **Validates at:** post-v0.1.2 dogfooding
- **Depends on:** Dogfooding on real projects (not test fixtures)
- **Target:** No crashes, graceful handling of missing fields, correct filter results on 100+ requirement datasets
- **Risk if unmet:** Edge cases in real data may cause parsing errors, filter bugs, or incorrect results; may require parser hardening
- **Fallback:** Document known limitations; add validation to `grd-tools requirement` to warn on unsupported formats

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| v0.1.1 test suite | 1,305 tests passing | 1,305/1,305 (100%) | PROJECT.md v0.1.1 state |
| lib/commands.js coverage | 80% line coverage | >= 80% | jest.config.js threshold |
| Zero regressions | No existing tests fail | 0 failures | Continuous integration baseline |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/commands.test.js — TDD tests for requirement commands and phase-detail enhancement
tests/fixtures/planning/REQUIREMENTS.md — Test fixture with known requirements
tests/fixtures/planning/ROADMAP.md — Test fixture with Requirements field
```

**How to run full evaluation:**
```bash
# Level 1: Sanity checks (run manually or via script)
bash .planning/phases/19-requirement-inspection-phase-detail-enhancement/sanity-checks.sh

# Level 2: Proxy metrics (automated tests + coverage)
npx jest tests/unit/commands.test.js --testNamePattern "cmdRequirement" --verbose --coverage
npx jest tests/unit/commands.test.js --testNamePattern "cmdPhaseDetail requirements" --verbose --coverage
npx jest --verbose  # Full regression suite

# Level 3: Deferred (Phase 21 + dogfooding)
# See Phase 21 EVAL.md for MCP integration validation
# See post-v0.1.2 dogfooding plan for real-world validation
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: CLI commands execute | [PASS/FAIL] | [exit codes] | |
| S2: JSON format valid | [PASS/FAIL] | [parse results] | |
| S3: Required fields present | [PASS/FAIL] | [field check] | |
| S4: Filter arguments accepted | [PASS/FAIL] | [exit code] | |
| S5: Invalid subcommand error | [PASS/FAIL] | [error message] | |
| S6: Phase-detail requirements | [PASS/FAIL] | [requirements array check] | |
| S7: Non-existent ID handled | [PASS/FAIL] | [error JSON check] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: TDD tests (19-01) | 15+ pass, 0 fail | [N pass / M fail] | [MET/MISSED] | |
| P2: TDD tests (19-02) | 5+ pass, 0 fail | [N pass / M fail] | [MET/MISSED] | |
| P3: Code coverage | >= 80% | [X%] | [MET/MISSED] | |
| P4: Filter composition | All pass | [pass/fail count] | [MET/MISSED] | |
| P5: Regression suite | 1,305+ pass, 0 fail | [N pass / M fail] | [MET/MISSED] | |
| P6: Output schema | All pass | [pass/fail count] | [MET/MISSED] | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-19-01 | MCP tool integration | PENDING | Phase 21 |
| DEFER-19-02 | Real-world complexity | PENDING | post-v0.1.2 dogfooding |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** Adequate — 7 checks cover CLI routing, JSON format, error handling, and integration with phase-detail
- **Proxy metrics:** Well-evidenced — TDD approach with 80% coverage target and full regression suite provide strong quality signals
- **Deferred coverage:** Comprehensive — MCP integration (Phase 21) and real-world usage (dogfooding) cover integration and edge case validation

**What this evaluation CAN tell us:**
- Functional correctness of requirement parsing on well-formed REQUIREMENTS.md files
- Filter composition logic correctness (AND logic for multiple filters)
- JSON output schema conformance
- Regression safety (no breakage of existing functionality)
- Code coverage adequacy (>= 80% of new code paths exercised)
- CLI routing and error handling for basic cases

**What this evaluation CANNOT tell us:**
- Performance on very large traceability matrices (100+ requirements) — not tested at scale
- Robustness to malformed REQUIREMENTS.md files (missing headers, broken tables, etc.) — test fixtures are well-formed
- Usability and discoverability of CLI commands for new users — requires user studies
- Correctness of requirement status tracking across milestone boundaries — requires real projects with archived milestones
- MCP server integration correctness — requires Phase 21 wiring (DEFER-19-01)
- Edge case handling in diverse real-world projects — requires dogfooding (DEFER-19-02)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
