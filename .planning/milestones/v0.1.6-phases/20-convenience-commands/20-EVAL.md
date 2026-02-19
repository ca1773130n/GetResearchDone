# Evaluation Plan: Phase 20 — Convenience Commands

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** TDD CLI feature development
**Reference papers:** N/A (CLI tooling, no research papers)

## Evaluation Overview

Phase 20 implements two CLI convenience commands for developers working with GRD planning artifacts:
1. **Plan 20-01 (Wave 1):** `grd-tools search <query>` — recursive text search across all `.planning/` markdown files
2. **Plan 20-02 (Wave 2):** `grd-tools requirement update-status <REQ-ID> <status>` — update requirement status in REQUIREMENTS.md traceability matrix

Both commands are built using Test-Driven Development (TDD) with 8 tests per command. The evaluation focuses on functional correctness, test coverage, error handling, and integration with the existing CLI tooling architecture.

Since this is CLI feature development (not research), there are no external benchmarks or paper metrics to compare against. Success is measured by:
- All TDD tests passing (16 total across both commands)
- Error handling for edge cases (invalid inputs, missing files)
- Round-trip correctness (write-then-read for update-status)
- No regressions in the full test suite
- Test coverage >= 80% on new functions

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test pass rate | Jest test runner | Direct measure of functional correctness |
| Test coverage | Jest coverage report | Ensures comprehensive testing of new code paths |
| Error handling | Manual CLI invocation | Validates user experience for invalid inputs |
| Round-trip correctness | Integration tests | Confirms data persistence and retrieval accuracy |
| Regression rate | Full test suite | Ensures no existing functionality broken |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 checks | Basic functionality and format verification |
| Proxy (L2) | 5 metrics | Automated test-based quality measurement |
| Deferred (L3) | 1 validation | MCP tool integration requiring Phase 21 |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Search Command Basic Invocation
- **What:** Verify `grd-tools search` can be invoked and returns valid JSON
- **Command:** `node bin/grd-tools.js search REQ-31 --raw`
- **Expected:** Valid JSON output with `matches` array and `count` field
- **Failure means:** Command routing broken or core function has syntax error

### S2: Search Command Empty Results
- **What:** Verify search with no matches returns empty array (not crash)
- **Command:** `node bin/grd-tools.js search NONEXISTENT_QUERY_12345 --raw`
- **Expected:** JSON with `{"matches": [], "count": 0, "query": "NONEXISTENT_QUERY_12345"}`
- **Failure means:** Error handling for no-match case is broken

### S3: Search Command Missing Query
- **What:** Verify missing query produces clear error message
- **Command:** `node bin/grd-tools.js search 2>&1`
- **Expected:** Error message containing "required" (exit code 1)
- **Failure means:** Input validation missing

### S4: Update-Status Command Basic Invocation
- **What:** Verify `grd-tools requirement update-status` updates status and returns success
- **Command:** `node bin/grd-tools.js requirement update-status REQ-31 Done --raw`
- **Expected:** JSON with `{"updated": true, "id": "REQ-31", "old_status": "...", "new_status": "Done"}`
- **Failure means:** Command routing or core function broken

### S5: Update-Status Invalid Status Error
- **What:** Verify invalid status produces clear error message
- **Command:** `node bin/grd-tools.js requirement update-status REQ-31 InvalidStatus --raw 2>&1`
- **Expected:** Error message containing "Invalid status" and list of valid statuses (exit code 1)
- **Failure means:** Status validation missing or error message unclear

### S6: Update-Status Non-existent REQ-ID Error
- **What:** Verify non-existent REQ-ID produces clear error message
- **Command:** `node bin/grd-tools.js requirement update-status REQ-999 Done --raw 2>&1`
- **Expected:** Error message containing "not found" or similar (exit code 1)
- **Failure means:** REQ-ID validation missing or error message unclear

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated test-based quality measurement.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: TDD Test Pass Rate
- **What:** Percentage of TDD tests passing for both commands
- **How:** Run targeted Jest tests for cmdSearch and cmdRequirementUpdateStatus
- **Command:** `npx jest tests/unit/commands.test.js --testNamePattern "cmdSearch|cmdRequirementUpdateStatus" --verbose`
- **Target:** 16/16 tests passing (100%)
- **Evidence:** TDD methodology ensures tests define functional correctness. Passing tests directly measure implementation success.
- **Correlation with full metric:** HIGH — TDD tests define requirements, so 100% pass = requirements met
- **Blind spots:** Tests may not cover undocumented edge cases or user experience issues not captured in test specs
- **Validated:** No — awaiting deferred validation at Phase 21 (MCP integration)

### P2: Test Coverage on New Functions
- **What:** Line coverage percentage for cmdSearch, cmdRequirementUpdateStatus, and helper functions
- **How:** Run Jest with coverage on the specific functions
- **Command:** `npx jest tests/unit/commands.test.js --coverage --collectCoverageFrom="lib/commands.js" --testNamePattern "cmdSearch|cmdRequirementUpdateStatus"`
- **Target:** >= 80% line coverage on new functions
- **Evidence:** Plan 20-01 and 20-02 both specify "All new functions have >= 80% test coverage via TDD" as a must-have truth
- **Correlation with full metric:** MEDIUM — High coverage reduces untested code paths but doesn't guarantee correctness
- **Blind spots:** Coverage doesn't measure test quality or edge case handling beyond what's in tests
- **Validated:** No — awaiting deferred validation at Phase 21

### P3: Full Test Suite Regression Rate
- **What:** Number of existing tests that fail after new commands are added
- **How:** Run full Jest test suite
- **Command:** `npx jest --verbose`
- **Target:** 0 regressions (all existing tests still pass)
- **Evidence:** Project constraint: "Backward compatibility — All existing commands must continue to work"
- **Correlation with full metric:** HIGH — Directly measures backward compatibility
- **Blind spots:** Tests may not cover all real-world usage patterns
- **Validated:** No — awaiting deferred validation at Phase 21

### P4: Round-Trip Correctness
- **What:** Update-status writes to disk, then get reads back the new status
- **How:** Automated test: update-status then cmdRequirementGet
- **Command:** Test in suite: "round-trip: update-status then get returns new status"
- **Target:** 100% of round-trip tests pass
- **Evidence:** Plan 20-02 includes "After update, `requirement get <REQ-ID>` returns the new status confirming round-trip correctness" as a must-have
- **Correlation with full metric:** HIGH — Directly measures data persistence integrity
- **Blind spots:** May not catch concurrency issues or file permission problems on different systems
- **Validated:** No — awaiting deferred validation at Phase 21

### P5: Multi-File Search Coverage
- **What:** Search command finds matches across multiple files (REQUIREMENTS.md, ROADMAP.md, phase plans)
- **How:** Automated test: search for "REQ-01" which appears in multiple fixture files
- **Command:** Test in suite: "returns matches across multiple files"
- **Target:** Matches found in at least 2 different files with correct relative paths
- **Evidence:** Plan 20-01 specifies "Search recurses into subdirectories: phases/, milestones/, codebase/, research/, todos/"
- **Correlation with full metric:** HIGH — Directly tests recursive search functionality
- **Blind spots:** Test fixtures may not represent all possible file structures in real projects
- **Validated:** No — awaiting deferred validation at Phase 21

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: MCP Tool Integration — DEFER-20-01
- **What:** New commands exposed as MCP tools with correct tool definitions
- **How:** Verify COMMAND_DESCRIPTORS in lib/mcp-server.js includes search and requirement update-status with proper schemas
- **Why deferred:** Requires Phase 21 MCP Server Extension (REQ-37)
- **Validates at:** Phase 21: MCP Server Extension
- **Depends on:** lib/mcp-server.js COMMAND_DESCRIPTORS updated, MCP server tests extended
- **Target:** Both commands callable via MCP protocol with proper parameter validation
- **Risk if unmet:** Commands work in CLI but not accessible to Claude via MCP — user experience gap
- **Fallback:** Add MCP tool definitions in a follow-up task within Phase 21 (low risk, mechanical update)

## Ablation Plan

**No ablation plan** — This phase implements standalone CLI commands with no sub-components to isolate. Each command is a single functional unit tested atomically.

## Baselines

No quantitative baselines apply (CLI feature development). Comparison baselines:

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing CLI commands | All existing grd-tools commands | 100% still work | Full test suite regression check |
| Test coverage (lib/commands.js) | Coverage before Phase 20 | Maintain or improve | Jest coverage report |

## Evaluation Scripts

**Location of evaluation code:**
- Tests: `tests/unit/commands.test.js` (append new describe blocks)
- Fixtures: `tests/fixtures/planning/REQUIREMENTS.md`, `tests/fixtures/planning/ROADMAP.md`
- Implementation: `lib/commands.js`, `bin/grd-tools.js`

**How to run full evaluation:**
```bash
# Run TDD tests for new commands
npx jest tests/unit/commands.test.js --testNamePattern "cmdSearch|cmdRequirementUpdateStatus" --verbose

# Run with coverage
npx jest tests/unit/commands.test.js --coverage --collectCoverageFrom="lib/commands.js" --testNamePattern "cmdSearch|cmdRequirementUpdateStatus"

# Full test suite (regression check)
npx jest --verbose

# Manual sanity checks
node bin/grd-tools.js search REQ-31 --raw
node bin/grd-tools.js search NONEXISTENT --raw
node bin/grd-tools.js requirement update-status REQ-31 Done --raw
node bin/grd-tools.js requirement update-status REQ-999 Done --raw 2>&1
node bin/grd-tools.js requirement update-status REQ-31 Invalid --raw 2>&1
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Search basic invocation | [PASS/FAIL] | [output] | |
| S2: Search empty results | [PASS/FAIL] | [output] | |
| S3: Search missing query | [PASS/FAIL] | [output] | |
| S4: Update-status basic invocation | [PASS/FAIL] | [output] | |
| S5: Update-status invalid status | [PASS/FAIL] | [output] | |
| S6: Update-status non-existent REQ-ID | [PASS/FAIL] | [output] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: TDD test pass rate | 16/16 (100%) | [actual] | [MET/MISSED] | |
| P2: Test coverage | >= 80% | [actual]% | [MET/MISSED] | |
| P3: Regression rate | 0 failures | [actual] failures | [MET/MISSED] | |
| P4: Round-trip correctness | 100% pass | [actual] | [MET/MISSED] | |
| P5: Multi-file search coverage | >= 2 files | [actual] files | [MET/MISSED] | |

### Ablation Results

N/A — No ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-20-01 | MCP tool integration | PENDING | Phase 21 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: ADEQUATE — 6 checks cover all critical paths (basic invocation, error cases, edge cases)
- Proxy metrics: WELL-EVIDENCED — TDD methodology provides strong correlation between test pass rate and functional correctness. All metrics trace to must-have truths in plans.
- Deferred coverage: COMPREHENSIVE — Only MCP integration deferred (appropriate, as it depends on Phase 21)

**What this evaluation CAN tell us:**
- Both commands work correctly for specified use cases (search, update-status)
- Error handling is robust (invalid inputs produce clear errors, not crashes)
- Data persistence is correct (round-trip write-read accuracy)
- No regressions introduced to existing CLI functionality
- Test coverage meets project standards (>= 80%)

**What this evaluation CANNOT tell us:**
- User experience quality (requires manual user testing — post-v1.0)
- Performance on very large `.planning/` directories (no performance benchmarks defined)
- MCP tool integration correctness (deferred to Phase 21)
- Real-world edge cases not covered by test fixtures (e.g., concurrent file access, special characters in queries)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
