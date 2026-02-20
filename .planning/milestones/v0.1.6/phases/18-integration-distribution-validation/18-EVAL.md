# Evaluation Plan: Phase 18 — Integration & Distribution Validation

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Phase type:** integrate
**Requirements validated:** REQ-20 (Integration & Cross-Feature Validation), REQ-30 (Distribution Validation)

## Evaluation Overview

Phase 18 validates that all v0.1.1 features work together end-to-end and that the npm distribution pipeline produces a functioning package. This is a full integration phase — not implementing new features, but proving existing features compose correctly.

**What we're validating:**
- E2E workflow: backend detection -> context init -> quality analysis -> doc drift -> MCP server tool call (REQ-20)
- npm distribution: pack -> install -> CLI execution -> MCP server startup -> plugin.json path resolution (REQ-30)
- Full test suite regression check: no failures, total count exceeds v0.1.0 baseline of 858 tests

**Phase characteristics:**
- Type: Integration (full system validation)
- No new features implemented — only tests that prove composition
- Success depends on all prerequisite phases (14-17) being complete and stable

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|-----------------|
| Test suite pass rate | Jest output | Regression detection — any failure indicates broken integration |
| Total test count | Jest summary | Growth metric — validates new tests added, compares to v0.1.0 baseline (858) |
| E2E workflow chain | Integration test | Proves features compose without errors |
| npm pack file list | npm pack --dry-run | Distribution validation — correct files included/excluded |
| npm install success | Exit code + file existence | Distribution validation — package is installable |
| Bin entry execution | CLI process output | Distribution validation — commands work from installed location |
| MCP server startup | MCP initialize handshake | Distribution validation — server works from tarball install |
| plugin.json resolution | File existence check | Distribution validation — paths resolve from npm_modules |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic checks — tests run, code validates, dependencies exist |
| Proxy (L2) | 8 | Automated integration metrics approximating production quality |
| Deferred (L3) | 2 | Validations requiring manual review or production environment |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Test Suite Executes Without Crash
- **What:** Full test suite runs to completion without uncaught exceptions or process crashes
- **Command:** `npx jest --no-coverage --listTests`
- **Expected:** Exit code 0, list of test files printed (24 files expected based on current project structure)
- **Failure means:** Test infrastructure is broken — file imports, syntax errors, or missing dependencies

### S2: Lint Passes
- **What:** ESLint runs clean across bin/ and lib/ with zero errors
- **Command:** `npm run lint`
- **Expected:** Exit code 0, no error messages
- **Failure means:** Code style regressions introduced during phase 18 work

### S3: Package.json Valid
- **What:** package.json is valid JSON with required fields for npm distribution
- **Command:** `node -e "const p = require('./package.json'); console.log(p.name, p.version, p.bin)"`
- **Expected:** Output shows name="grd-tools", version matches VERSION file, bin object with grd-tools and grd-mcp-server entries
- **Failure means:** Package metadata is broken — distribution will fail

### S4: Required Artifacts Exist
- **What:** All bin/ entry points, core lib/ modules, and plugin config exist
- **Command:**
```bash
test -f bin/grd-tools.js && \
test -f bin/grd-mcp-server.js && \
test -f bin/postinstall.js && \
test -f lib/backend.js && \
test -f lib/cleanup.js && \
test -f lib/context.js && \
test -f lib/mcp-server.js && \
test -f .claude-plugin/plugin.json && \
echo "All required artifacts present"
```
- **Expected:** "All required artifacts present" printed
- **Failure means:** Files deleted or moved — distribution will be incomplete

### S5: E2E Test File Structure
- **What:** E2E integration test file has expected test groups and reasonable size
- **Command:** `wc -l tests/integration/e2e-workflow.test.js`
- **Expected:** Line count >= 80 (per 18-01 PLAN.md must_haves)
- **Failure means:** E2E test is stub or incomplete

### S6: npm Pack Test File Structure
- **What:** npm pack test file has expected structure and reasonable size
- **Command:** `wc -l tests/integration/npm-pack.test.js`
- **Expected:** Line count >= 80 (per 18-02 PLAN.md must_haves)
- **Failure means:** npm pack test is stub or incomplete

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated integration validation approximating real-world quality.
**IMPORTANT:** Proxy metrics are NOT substitutes for production validation. Results indicate likely correctness but require deferred validation for full confidence.

### P1: Full Test Suite Pass Rate
- **What:** All tests pass with zero failures
- **How:** Run full test suite without coverage (faster execution)
- **Command:** `npx jest --no-coverage`
- **Target:** 100% pass rate (0 failures, 0 errors)
- **Evidence:** This is a direct measure — not a proxy. All tests must pass for integration to be valid.
- **Correlation with full metric:** HIGH — test failures directly indicate broken functionality
- **Blind spots:** Tests may not cover all edge cases; passing tests don't prove production readiness
- **Validated:** No — this is a direct measurement, not requiring deferred validation

### P2: Test Count Growth
- **What:** Total test count exceeds v0.1.0 baseline and meets phase 18 target
- **How:** Parse Jest output summary line
- **Command:** `npx jest --no-coverage 2>&1 | grep "Tests:"`
- **Target:** Total tests >= 950 (success criteria states "new tests bring total above 950")
- **Current:** 1243 tests before phase 18
- **Evidence:** STATE.md records 1243 tests after phase 17; phase 18 adds E2E and npm pack tests
- **Correlation with full metric:** MEDIUM — more tests correlate with better coverage, but quantity doesn't guarantee quality
- **Blind spots:** Test count doesn't measure test quality or actual coverage; could have many trivial tests
- **Validated:** No — quantity metric only, quality assessed separately

### P3: E2E Workflow Chain Completion
- **What:** E2E test successfully chains backend detection -> context init -> quality analysis -> doc drift -> MCP tool call without errors
- **How:** Run E2E integration test suite
- **Command:** `npx jest tests/integration/e2e-workflow.test.js --no-coverage`
- **Target:** All tests pass; specific "Sequential pipeline" test group validates full chain completes in < 10 seconds
- **Evidence:** Plan 18-01 PLAN.md specifies 5 test groups with sequential pipeline group as final validation
- **Correlation with full metric:** HIGH — successful chaining in test environment strongly predicts production success
- **Blind spots:** Test fixtures may not represent production data; timing may differ on different hardware
- **Validated:** No — awaiting production E2E validation (DEFER-18-01)

### P4: npm Pack File List Correctness
- **What:** npm pack includes required files and excludes unnecessary files
- **How:** Analyze npm pack --dry-run output
- **Command:** `npx jest tests/integration/npm-pack.test.js --no-coverage --testNamePattern="npm pack validation"`
- **Target:** All 4 pack validation tests pass (tarball produced, expected files present, no test/coverage files included)
- **Evidence:** Plan 18-02 specifies exact file list validation requirements
- **Correlation with full metric:** HIGH — dry-run output matches actual pack output
- **Blind spots:** File presence doesn't guarantee file contents are correct
- **Validated:** No — awaiting manual tarball inspection (DEFER-18-02)

### P5: npm Install from Tarball
- **What:** npm install from tarball completes successfully and creates expected directory structure
- **How:** Run npm install test group
- **Command:** `npx jest tests/integration/npm-pack.test.js --no-coverage --testNamePattern="npm install from tarball"`
- **Target:** All 4 install tests pass (install exits 0, node_modules/grd-tools exists, bin symlinks created)
- **Evidence:** Plan 18-02 specifies install validation test structure
- **Correlation with full metric:** HIGH — test environment install success predicts user install success
- **Blind spots:** Test uses temp directory on local machine; may not catch platform-specific issues (Windows vs Unix)
- **Validated:** No — awaiting CI multi-platform validation (CI runs on Node 18/20/22)

### P6: Bin Entry Execution
- **What:** Installed grd-tools and grd-mcp-server bin entries execute without errors
- **How:** Run bin execution test group
- **Command:** `npx jest tests/integration/npm-pack.test.js --no-coverage --testNamePattern="Bin entry execution"`
- **Target:** All 3 bin execution tests pass (grd-tools --help produces output, grd-mcp-server responds to initialize, postinstall is executable)
- **Evidence:** Plan 18-02 specifies bin execution validation
- **Correlation with full metric:** HIGH — successful execution from installed location predicts user experience
- **Blind spots:** Limited argument testing; doesn't validate all CLI commands work from installed location
- **Validated:** No — awaiting user acceptance testing in real environment

### P7: MCP Server Protocol Handshake
- **What:** MCP server completes initialize handshake and returns valid response
- **How:** E2E test MCP server test group + npm pack MCP server test
- **Command:** `npx jest --no-coverage --testNamePattern="MCP server"`
- **Target:** All MCP server tests pass across both E2E and npm pack test suites
- **Evidence:** Plan 18-01 specifies MCP server tool call validation; plan 18-02 specifies MCP server startup from tarball
- **Correlation with full metric:** HIGH — protocol handshake is binary (works or doesn't); success in test predicts production success
- **Blind spots:** Test validates initialize only; doesn't validate all 97 MCP tools work correctly (covered by phase 16 tests)
- **Validated:** No — awaiting MCP client integration testing with real Claude Code

### P8: plugin.json Path Resolution
- **What:** plugin.json exists at expected path when installed via npm and contains expected fields
- **How:** Run plugin.json path resolution test group
- **Command:** `npx jest tests/integration/npm-pack.test.js --no-coverage --testNamePattern="plugin.json path resolution"`
- **Target:** All 3 path resolution tests pass (file exists, valid JSON, uses ${CLAUDE_PLUGIN_ROOT} variable)
- **Evidence:** Plan 18-02 specifies plugin.json validation; phase 17 implemented ${CLAUDE_PLUGIN_ROOT} variable for dynamic path resolution
- **Correlation with full metric:** MEDIUM — file existence and variable usage predict correct resolution, but actual Claude Code plugin loading requires runtime test
- **Blind spots:** Doesn't test actual Claude Code plugin loading; variable substitution happens at Claude Code runtime, not validated here
- **Validated:** No — awaiting Claude Code plugin loading test (DEFER-18-03)

## Level 3: Deferred Validations

**Purpose:** Full validation requiring manual review, production environment, or downstream integration.

### D1: Production E2E Workflow Validation — DEFER-18-01
- **What:** Validate full feature chain in real user environment with real .planning/ project (not test fixtures)
- **How:** Manual testing in Claude Code with actual R&D project
- **Why deferred:** Requires Claude Code plugin installation + real project setup + human workflow execution
- **Validates at:** Post-npm-publish user acceptance testing
- **Depends on:** npm package published, Claude Code plugin configured, user with R&D project
- **Target:** User can run: detect backend -> init phase -> run quality analysis (with doc drift) -> MCP server tool call via Claude Code — all complete without errors
- **Risk if unmet:** Users encounter integration bugs in production that tests missed — requires hotfix release
- **Fallback:** Rapid patch release cycle; most common path covered by P3 proxy metric

### D2: Manual Tarball Inspection — DEFER-18-02
- **What:** Manual inspection of npm pack output to verify no sensitive files, correct directory structure, file permissions
- **How:** Run `npm pack`, extract tarball, review file list and permissions
- **Why deferred:** Subjective review requiring human judgment on file inclusion decisions
- **Validates at:** Pre-publish checklist (before npm publish command)
- **Depends on:** npm pack completes successfully (validated by P4)
- **Target:** Tarball contains only intended files (bin/, lib/, commands/, agents/, plugin.json), no .git/, no tests/, no coverage/, no .env
- **Risk if unmet:** Sensitive files or bloat shipped to npm registry — requires unpublish or deprecation
- **Fallback:** npm unpublish within 72 hours if critical files leaked; deprecate version if needed

### D3: Claude Code Plugin Loading Test — DEFER-18-03
- **What:** Validate plugin.json paths resolve correctly when Claude Code loads the plugin from npm-installed location
- **How:** Install grd-tools via npm, configure Claude Code plugin_path, restart Claude Code, verify plugin loads without errors
- **Why deferred:** Requires Claude Code runtime environment, not available in Jest test context
- **Validates at:** Post-npm-publish plugin installation testing
- **Depends on:** npm package published, grd-tools setup command run, Claude Code restarted
- **Target:** Claude Code loads plugin without errors; plugin appears in Claude Code plugin list; SessionStart hook executes successfully
- **Risk if unmet:** Plugin fails to load for users — requires path resolution fix and patch release
- **Fallback:** Document manual plugin.json configuration as workaround while patch is prepared

## Ablation Plan

**No ablation plan** — Phase 18 is integration validation, not feature implementation. Ablation (isolating component contributions) is not applicable. Integration tests validate composition, not individual component performance.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| v0.1.0 test count | Total tests in v0.1.0 milestone | 858 tests | STATE.md, v0.1.0 shipped 2026-02-16 |
| v0.1.1 pre-phase-18 test count | Total tests before phase 18 | 1243 tests | STATE.md, after phase 17 |
| Phase 18 target | Total tests after phase 18 | >= 950 tests (target greatly exceeded) | ROADMAP.md success criteria |
| Zero regressions | No test failures | 0 failures | Success criteria: "no regressions from v0.1.0" |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/integration/e2e-workflow.test.js    — E2E feature chain validation (plan 18-01)
tests/integration/npm-pack.test.js        — npm distribution validation (plan 18-02)
```

**How to run full evaluation:**
```bash
# Full test suite (all metrics)
npx jest --no-coverage

# E2E workflow validation only (P3)
npx jest tests/integration/e2e-workflow.test.js --no-coverage

# npm distribution validation only (P4-P8)
npx jest tests/integration/npm-pack.test.js --no-coverage

# Test count check (P2)
npx jest --no-coverage 2>&1 | grep "Tests:"

# Sanity checks (S1-S6)
npm run lint && \
npx jest --listTests && \
node -e "const p = require('./package.json'); console.log('Package:', p.name, p.version)" && \
test -f tests/integration/e2e-workflow.test.js && \
test -f tests/integration/npm-pack.test.js && \
echo "All sanity checks passed"
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Test suite executes | PENDING | | |
| S2: Lint passes | PENDING | | |
| S3: package.json valid | PENDING | | |
| S4: Required artifacts exist | PENDING | | |
| S5: E2E test structure | PENDING | | |
| S6: npm pack test structure | PENDING | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Test pass rate | 100% (0 failures) | PENDING | | |
| P2: Test count | >= 950 | PENDING | | |
| P3: E2E chain completion | All pass, < 10s | PENDING | | |
| P4: npm pack file list | All pass | PENDING | | |
| P5: npm install success | All pass | PENDING | | |
| P6: Bin entry execution | All pass | PENDING | | |
| P7: MCP protocol handshake | All pass | PENDING | | |
| P8: plugin.json resolution | All pass | PENDING | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-18-01 | Production E2E workflow | PENDING | Post-npm-publish UAT |
| DEFER-18-02 | Manual tarball inspection | PENDING | Pre-publish checklist |
| DEFER-18-03 | Claude Code plugin loading | PENDING | Post-npm-publish plugin test |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** Adequate — covers test infrastructure, code quality, package metadata, and file structure validation
- **Proxy metrics:** Well-evidenced — 8 automated metrics directly measure integration success across both E2E workflow and npm distribution
- **Deferred coverage:** Comprehensive — 3 deferred validations cover the gaps proxy metrics can't address (real user environment, manual review, Claude Code runtime)

**What this evaluation CAN tell us:**
- Full test suite regression status (pass/fail)
- Feature composition correctness in test environment (backend -> context -> quality -> drift -> MCP chain)
- npm distribution package structure validity (files included/excluded correctly)
- Basic installation and execution success (from tarball on local machine)
- MCP server protocol compliance (initialize handshake works)
- Test coverage growth vs v0.1.0 baseline

**What this evaluation CANNOT tell us:**
- Production environment behavior with real user data (deferred to DEFER-18-01 post-publish UAT)
- Platform-specific installation issues (partially mitigated by CI on Node 18/20/22)
- Claude Code plugin loading in real runtime (deferred to DEFER-18-03 plugin test)
- User experience and workflow usability (requires user acceptance testing)
- Performance at scale (test fixtures are small; real projects may be large)
- Security of distributed package (requires manual tarball inspection via DEFER-18-02)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
