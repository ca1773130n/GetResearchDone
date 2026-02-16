# Evaluation Plan: Phase 17 — npm Distribution

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** npm package configuration, post-install automation, CLI setup command
**Reference requirements:** REQ-28, REQ-29

## Evaluation Overview

Phase 17 prepares GRD for npm distribution by configuring package.json with correct bin entries and files whitelist, implementing a post-install script to bootstrap the .planning/ directory structure, and adding a setup command to configure Claude Code integration. This is an implementation phase with no research papers involved — evaluation focuses on correctness of package configuration and installation automation.

The phase has two plans:
- Plan 17-01: npm package.json configuration + postinstall script + tests
- Plan 17-02: grd-tools setup command + tests

Evaluation must verify that the package can be installed via npm, the postinstall script creates necessary directories without failing, and the setup command provides correct plugin path information. Full end-to-end validation (npm pack + install from tarball) is deferred to Phase 18 integration testing.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test coverage | REQ-27 (MCP server requirement) + Phase 16 precedent (80% coverage) | Consistent quality bar across v0.1.1 implementation phases |
| Test pass rate | PRODUCT-QUALITY.md P0 requirement | All tests must pass before phase completion |
| package.json validity | REQ-28 (npm package configuration) | Npm publishing requires valid package.json with correct metadata |
| Post-install idempotency | REQ-29 (install scripts) | npm install may run postinstall multiple times; must be safe |
| Zero runtime dependencies | PRODUCT-QUALITY.md operational requirement | GRD design principle maintained since v0.0.5 |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Basic functionality and format verification |
| Proxy (L2) | 4 | Automated quality metrics approximating real installation |
| Deferred (L3) | 3 | Full npm pack/install validation requiring integration |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: package.json Valid JSON
- **What:** package.json is valid JSON and can be parsed by Node.js
- **Command:** `node -e "const pkg = require('./package.json'); console.log(pkg.name)"`
- **Expected:** Outputs `grd-tools` without errors
- **Failure means:** Syntax error in package.json; npm commands will fail

### S2: Bin Entries Point to Existing Files
- **What:** Both bin entries reference files that exist on disk
- **Command:** `node -e "const pkg = require('./package.json'); const fs = require('fs'); Object.values(pkg.bin).forEach(p => { if (!fs.existsSync(p)) throw new Error('Missing: ' + p); }); console.log('OK')"`
- **Expected:** Outputs `OK`
- **Failure means:** Broken bin entries; npm install will create broken symlinks

### S3: Files Whitelist Entries Exist
- **What:** All paths in files array exist on disk
- **Command:** `node -e "const pkg = require('./package.json'); const fs = require('fs'); pkg.files.forEach(p => { const path = p.replace(/\/$/, ''); if (!fs.existsSync(path)) throw new Error('Missing: ' + p); }); console.log('OK')"`
- **Expected:** Outputs `OK`
- **Failure means:** Files whitelist references non-existent paths; npm pack will warn

### S4: Post-Install Script Runs Without Error
- **What:** bin/postinstall.js can execute and exits with code 0
- **Command:** `node bin/postinstall.js 2>&1 && echo "Exit code: $?"`
- **Expected:** No error output, exit code 0
- **Failure means:** Post-install will fail during npm install, blocking installation

### S5: Post-Install Creates Directory Structure
- **What:** Running postinstall in a temp directory creates expected .planning/ structure
- **Command:** `mkdir -p /tmp/grd-test-$$ && cd /tmp/grd-test-$$ && node /Users/edward.seo/dev/private/project/harness/GetResearchDone/bin/postinstall.js && ls -d .planning .planning/phases .planning/research && rm -rf /tmp/grd-test-$$`
- **Expected:** All directories exist, no errors
- **Failure means:** Post-install directory creation logic is broken

### S6: Setup Command Runs Without Error
- **What:** grd-tools setup command executes and exits with code 0
- **Command:** `node bin/grd-tools.js setup --raw > /dev/null 2>&1 && echo "Exit code: $?"`
- **Expected:** No error output, exit code 0
- **Failure means:** Setup command is broken or not wired into CLI router

### S7: Setup Command Output Contains Plugin Path
- **What:** Setup command outputs plugin path information
- **Command:** `node bin/grd-tools.js setup --raw | grep -i "plugin"`
- **Expected:** Output contains the word "plugin" (case-insensitive)
- **Failure means:** Setup command output does not provide plugin configuration information

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: Test Coverage >= 80%
- **What:** Line coverage for new postinstall and setup modules
- **How:** Run Jest with coverage on postinstall.test.js and setup.test.js
- **Command:** `npx jest tests/unit/postinstall.test.js tests/unit/setup.test.js --coverage --collectCoverageFrom='bin/postinstall.js' --collectCoverageFrom='lib/commands.js' | grep -E '(Lines|postinstall|commands)'`
- **Target:** >= 80% line coverage on bin/postinstall.js and cmdSetup in lib/commands.js
- **Evidence:** Phase 16 precedent (REQ-27 requires >= 80% coverage for MCP server); consistent quality bar across v0.1.1
- **Correlation with full metric:** HIGH — test coverage correlates strongly with catching bugs before integration
- **Blind spots:** Coverage does not measure test quality; 80% coverage with weak assertions provides false confidence
- **Validated:** No — awaiting deferred validation in Phase 18

### P2: Test Suite Pass Rate 100%
- **What:** All existing tests plus new tests pass
- **How:** Run full test suite with new postinstall and setup tests
- **Command:** `npx jest tests/unit/postinstall.test.js tests/unit/setup.test.js --verbose`
- **Target:** All tests pass (0 failures)
- **Evidence:** PRODUCT-QUALITY.md P0 requirement; Phase 16 delivered 1208 passing tests
- **Correlation with full metric:** HIGH — unit test pass rate directly indicates implementation correctness
- **Blind spots:** Unit tests may not catch integration issues (e.g., path resolution differences between development and installed package)
- **Validated:** No — awaiting deferred validation in Phase 18

### P3: package.json Field Completeness
- **What:** All required npm publishing fields are present and correct
- **How:** Validate package.json structure against REQ-28 requirements
- **Command:** `node -e "const pkg = require('./package.json'); const checks = { name: pkg.name === 'grd-tools', private_absent: pkg.private === undefined, bin_count: Object.keys(pkg.bin || {}).length === 2, files_count: (pkg.files || []).length >= 5, engines_node: pkg.engines?.node === '>=18', no_deps: Object.keys(pkg.dependencies || {}).length === 0 }; console.log(JSON.stringify(checks, null, 2)); const failed = Object.entries(checks).filter(([k,v]) => !v); if (failed.length > 0) { console.error('Failed:', failed); process.exit(1); }"`
- **Target:** All checks pass (name=grd-tools, private absent, 2 bin entries, 5+ files entries, engines.node=>=18, zero dependencies)
- **Evidence:** REQ-28 specifies exact package.json structure for npm publishing
- **Correlation with full metric:** HIGH — correct package.json is prerequisite for successful npm publish
- **Blind spots:** Does not verify that npm pack produces correct tarball structure; does not verify bin symlinks work after global install
- **Validated:** No — awaiting deferred validation in Phase 18

### P4: Post-Install Idempotency
- **What:** Running postinstall multiple times in the same directory is safe
- **How:** Run postinstall, create custom content, run postinstall again, verify content unchanged
- **Command:** Unit test in postinstall.test.js covers this scenario
- **Target:** Custom .planning/config.json content is preserved after second postinstall run
- **Evidence:** npm may run postinstall multiple times (e.g., during npm rebuild); REQ-29 requires idempotency
- **Correlation with full metric:** MEDIUM — unit test simulates repeated install, but may not catch all edge cases in real npm install flow
- **Blind spots:** Unit test runs postinstall in isolated temp directory; does not test real npm install/rebuild scenarios
- **Validated:** No — awaiting deferred validation in Phase 18

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: npm pack Produces Valid Tarball — DEFER-17-01
- **What:** `npm pack` creates a .tgz tarball with correct structure
- **How:** Run `npm pack`, extract tarball, verify file list matches package.json files whitelist
- **Why deferred:** Requires clean git state and production-like environment; best validated as part of full integration testing
- **Validates at:** Phase 18 (Integration & Distribution Validation)
- **Depends on:** All Phase 17 implementation complete, git state clean
- **Target:** Tarball contains exactly the files specified in package.json files array plus package.json, VERSION, LICENSE (if exists)
- **Risk if unmet:** npm publish will distribute incorrect files; users may get incomplete installation
- **Fallback:** Adjust files whitelist in package.json and re-test

### D2: npm install from Tarball Works End-to-End — DEFER-17-02
- **What:** Global install from tarball makes grd-tools and grd-mcp-server commands available
- **How:** `npm pack`, then `npm install -g ./grd-tools-*.tgz` in a clean environment, verify `which grd-tools` succeeds
- **Why deferred:** Requires clean test environment (e.g., Docker container or fresh VM); destructive to local npm global installs
- **Validates at:** Phase 18 (Integration & Distribution Validation)
- **Depends on:** npm pack success (DEFER-17-01)
- **Target:** After global install, `grd-tools` and `grd-mcp-server` are in PATH; `grd-tools --help` works; post-install created .planning/ in expected location
- **Risk if unmet:** Package is not installable via npm; blocking issue for distribution
- **Fallback:** Debug bin entry configuration, post-install script working directory, or file permissions

### D3: Plugin Path Resolution After npm Install — DEFER-17-03
- **What:** grd-tools setup outputs correct plugin path when GRD is installed via npm (not from repo checkout)
- **How:** After npm install -g, run `grd-tools setup`, verify plugin_json path resolves to the globally installed package location
- **Why deferred:** Requires npm global install (DEFER-17-02); path resolution differs between development (repo) and production (npm global)
- **Validates at:** Phase 18 (Integration & Distribution Validation)
- **Depends on:** npm install success (DEFER-17-02), cmdSetup implementation in lib/commands.js
- **Target:** plugin_json path in setup output exists on disk and is readable; path is inside npm global install directory (e.g., /usr/local/lib/node_modules/grd-tools or similar)
- **Risk if unmet:** Users cannot configure Claude Code plugin after npm install; manual path resolution required
- **Fallback:** Update cmdSetup to handle npm global install path resolution (use `__dirname` or `process.execPath` logic)

## Ablation Plan

**No ablation plan** — This phase implements npm packaging configuration and automation scripts with no sub-components to isolate. Each component (package.json config, postinstall script, setup command) is independently necessary and not comparable to alternatives.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Current test count | Total passing tests before Phase 17 | 1208 tests | eval_context (Phase 16 baseline) |
| Current test coverage | Line coverage on lib/ modules | >= 80% | Phase 16 delivered 80%+ coverage for MCP server |
| Zero runtime dependencies | No entries in dependencies field | 0 dependencies | PRODUCT-QUALITY.md operational requirement |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/postinstall.test.js — Unit tests for bin/postinstall.js
tests/unit/setup.test.js — Unit tests for cmdSetup in lib/commands.js
```

**How to run full evaluation:**
```bash
# Run sanity checks
node -e "const pkg = require('./package.json'); console.log(pkg.name)"
node -e "const pkg = require('./package.json'); const fs = require('fs'); Object.values(pkg.bin).forEach(p => { if (!fs.existsSync(p)) throw new Error('Missing: ' + p); }); console.log('OK')"
node -e "const pkg = require('./package.json'); const fs = require('fs'); pkg.files.forEach(p => { const path = p.replace(/\/$/, ''); if (!fs.existsSync(path)) throw new Error('Missing: ' + p); }); console.log('OK')"
node bin/postinstall.js
node bin/grd-tools.js setup --raw

# Run proxy metrics
npx jest tests/unit/postinstall.test.js tests/unit/setup.test.js --coverage --verbose
node -e "const pkg = require('./package.json'); const checks = { name: pkg.name === 'grd-tools', private_absent: pkg.private === undefined, bin_count: Object.keys(pkg.bin || {}).length === 2, files_count: (pkg.files || []).length >= 5, engines_node: pkg.engines?.node === '>=18', no_deps: Object.keys(pkg.dependencies || {}).length === 0 }; console.log(JSON.stringify(checks, null, 2)); const failed = Object.entries(checks).filter(([k,v]) => !v); if (failed.length > 0) { console.error('Failed:', failed); process.exit(1); }"

# Dry-run npm pack (sanity check file list)
npm pack --dry-run
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: package.json Valid JSON | [PASS/FAIL] | [output] | |
| S2: Bin Entries Point to Existing Files | [PASS/FAIL] | [output] | |
| S3: Files Whitelist Entries Exist | [PASS/FAIL] | [output] | |
| S4: Post-Install Script Runs Without Error | [PASS/FAIL] | [output] | |
| S5: Post-Install Creates Directory Structure | [PASS/FAIL] | [output] | |
| S6: Setup Command Runs Without Error | [PASS/FAIL] | [output] | |
| S7: Setup Command Output Contains Plugin Path | [PASS/FAIL] | [output] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Test Coverage | >= 80% | [actual]% | [MET/MISSED] | |
| P2: Test Suite Pass Rate | 100% (0 failures) | [actual] | [MET/MISSED] | |
| P3: package.json Field Completeness | All checks pass | [actual] | [MET/MISSED] | |
| P4: Post-Install Idempotency | Preserved content | [actual] | [MET/MISSED] | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-17-01 | npm pack produces valid tarball | PENDING | Phase 18 |
| DEFER-17-02 | npm install from tarball works end-to-end | PENDING | Phase 18 |
| DEFER-17-03 | Plugin path resolution after npm install | PENDING | Phase 18 |

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM-HIGH

**Justification:**
- Sanity checks: ADEQUATE — 7 checks cover all critical paths (package.json validity, bin entries, files whitelist, postinstall execution, setup command)
- Proxy metrics: WELL-EVIDENCED — 4 metrics directly measure implementation correctness (test coverage, test pass rate, package.json structure, idempotency)
- Deferred coverage: COMPREHENSIVE — 3 deferred validations cover full npm distribution cycle (pack, install, plugin path resolution)

**What this evaluation CAN tell us:**
- package.json is correctly configured for npm publishing (name, version, bin entries, files whitelist, engines, zero runtime deps)
- Post-install script creates .planning/ directory structure idempotently without failing
- Setup command outputs correct plugin path information for Claude Code configuration
- Unit tests provide >= 80% coverage on new code with 100% pass rate
- All critical functionality works in development environment

**What this evaluation CANNOT tell us:**
- Whether npm pack produces the correct tarball structure — deferred to Phase 18 (DEFER-17-01)
- Whether the package installs correctly via `npm install -g` — deferred to Phase 18 (DEFER-17-02)
- Whether plugin path resolution works after npm install (vs. repo checkout) — deferred to Phase 18 (DEFER-17-03)
- Whether bin symlinks are created correctly on different operating systems — deferred to Phase 18 CI testing on Node 18/20/22
- Whether postinstall works correctly in all npm install scenarios (install, update, rebuild) — deferred to Phase 18

**Confidence rationale:** This is an implementation phase with clear, testable requirements. Proxy metrics (unit tests + package.json validation) provide high confidence for in-phase correctness. The primary risk is path resolution differences between development and production environments, which is appropriately deferred to Phase 18 integration testing.

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
