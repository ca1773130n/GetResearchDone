# Evaluation Plan: Phase 7 — Validation, Cleanup, and Release

**Designed:** 2026-02-15
**Designer:** Claude (grd-eval-planner)
**Phase type:** Infrastructure — final validation and release preparation
**Context:** This is not an R&D phase (no papers/methods). This is the final quality gate before v0.0.5 release.

## Evaluation Overview

Phase 7 is the capstone of GRD v0.0.5development, completing three critical objectives:

1. **Input validation layer** (Plan 07-01) — Close the P1 gap "Input validation coverage: 100% of CLI entry points"
2. **JSDoc documentation** (Plan 07-02) — Close the P2 gap "JSDoc on public functions"
3. **Release preparation** (Plan 07-03) — Version bump to 0.0.5, CONTRIBUTING.md, full product verification

Unlike R&D phases, this phase has no proxy metrics for research quality. Instead, evaluation focuses on **completeness** (all targets met), **correctness** (tests pass, lint clean), and **product readiness** (all PRODUCT-QUALITY.md targets verified).

The evaluation plan must verify:
- Input validation rejects all invalid input categories (phase numbers, file paths, git refs, subcommands)
- JSDoc coverage reaches 100% of exported functions in lib/ modules
- All version sources sync (VERSION, plugin.json, CHANGELOG.md)
- All PRODUCT-QUALITY.md P0 and P1 targets are met
- All deferred validations from prior phases are resolved or accounted for

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Input validation coverage | PRODUCT-QUALITY.md P1 target | Security/UX requirement — all CLI entry points must reject invalid input |
| JSDoc coverage | PRODUCT-QUALITY.md P2 target | Developer documentation for contributors |
| Test pass rate | Continuous verification across all phases | Regression detection — any test failure blocks release |
| Lint/format compliance | PRODUCT-QUALITY.md P1 targets | Code quality enforcement established in Phase 6 |
| Version sync | PRODUCT-QUALITY.md P1 target | Release hygiene — all version sources must match |
| P0/P1 target verification | PRODUCT-QUALITY.md product verification criteria | Release gate — v0.0.5 cannot ship with unmet P0/P1 targets |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 15 | Basic functionality — files exist, syntax valid, commands don't crash |
| Proxy (L2) | 12 | Automated verification — test coverage, validation behavior, version consistency |
| Deferred (L3) | 1 | User acceptance testing of full product (post-v0.0.5) |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Plan 07-01 artifacts exist
- **What:** Validation helpers and tests created
- **Command:** `ls lib/utils.js tests/unit/validation.test.js`
- **Expected:** Both files exist
- **Failure means:** Plan 07-01 incomplete or files deleted

### S2: Validation functions exported from lib/utils.js
- **What:** New validation functions are exported
- **Command:** `grep -E "validatePhaseArg|validateFileArg|validateSubcommand|validateRequiredArg" lib/utils.js | head -4`
- **Expected:** All 4 function names appear in the file
- **Failure means:** Validation layer not implemented

### S3: CLI router imports validation functions
- **What:** bin/grd-tools.js uses new validation helpers
- **Command:** `grep "validate" bin/grd-tools.js | head -1`
- **Expected:** At least one validate function reference
- **Failure means:** Validation not wired into CLI router

### S4: Validation tests exist
- **What:** Comprehensive test coverage for validation functions
- **Command:** `grep -c "describe\|test\|it" tests/unit/validation.test.js`
- **Expected:** >= 20 (indicates >= 20 test cases based on plan requirements)
- **Failure means:** Insufficient test coverage

### S5: Plan 07-02 JSDoc additions
- **What:** JSDoc comments added to all lib/ modules
- **Command:** `grep -c "@param" lib/*.js | awk '{sum+=$1} END {print sum}'`
- **Expected:** >= 100 (108 functions documented per plan)
- **Failure means:** JSDoc coverage incomplete

### S6: All lib/ modules have JSDoc
- **What:** Every module updated with JSDoc
- **Command:** `for f in lib/*.js; do grep -q "@param" "$f" && echo "OK" || echo "MISSING: $f"; done | grep MISSING | wc -l`
- **Expected:** 0 (no modules missing JSDoc)
- **Failure means:** One or more modules not documented

### S7: Plan 07-03 artifacts exist
- **What:** CONTRIBUTING.md and version files updated
- **Command:** `ls CONTRIBUTING.md VERSION .claude-plugin/plugin.json CHANGELOG.md grd-file-manifest.json`
- **Expected:** All 5 files exist
- **Failure means:** Plan 07-03 incomplete

### S8: VERSION file updated to 0.0.5
- **What:** VERSION file contains new version
- **Command:** `cat VERSION`
- **Expected:** Exactly "0.0.5"
- **Failure means:** Version bump not applied

### S9: plugin.json version updated
- **What:** Plugin manifest has correct version
- **Command:** `node -e "console.log(require('./.claude-plugin/plugin.json').version)"`
- **Expected:** "0.0.5"
- **Failure means:** Plugin version not synced

### S10: CHANGELOG.md has 0.0.5 section
- **What:** Changelog updated with release notes
- **Command:** `grep -c "\[0.0.5\]" CHANGELOG.md`
- **Expected:** >= 1 (section header present)
- **Failure means:** Changelog not updated

### S11: CONTRIBUTING.md has required sections
- **What:** Contributor guide includes architecture, testing, PR guidelines
- **Command:** `grep -E "Architecture|Running Tests|PR Guidelines" CONTRIBUTING.md | wc -l`
- **Expected:** >= 3 (all three sections present)
- **Failure means:** CONTRIBUTING.md incomplete

### S12: Test suite passes
- **What:** All tests pass after Phase 7 changes
- **Command:** `npm test 2>&1 | grep -E "Tests:|passed"`
- **Expected:** "Tests: XX passed" with 0 failed
- **Failure means:** Regression introduced in Phase 7

### S13: Lint passes
- **What:** ESLint clean on all source files
- **Command:** `npm run lint`
- **Expected:** Exit code 0
- **Failure means:** Lint errors introduced (JSDoc or validation code)

### S14: Format check passes
- **What:** Prettier compliance maintained
- **Command:** `npm run format:check`
- **Expected:** Exit code 0
- **Failure means:** Formatting violations introduced

### S15: Manifest regenerated
- **What:** grd-file-manifest.json reflects final v0.0.5 state
- **Command:** `node bin/grd-manifest.js detect 2>&1`
- **Expected:** "No modifications detected" or similar success message
- **Failure means:** Manifest out of sync with current file state

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated verification of implementation quality and product readiness.
**IMPORTANT:** These are deterministic checks, not proxies for unmeasurable qualities. In an infrastructure project, these ARE the real metrics.

### P1: Input validation — invalid phase number rejection
- **What:** CLI rejects malformed phase number arguments
- **How:** Invoke CLI commands with invalid phase numbers
- **Command:** `node bin/grd-tools.js phase-detail "abc" 2>&1 | grep -i "invalid\|error"`
- **Target:** Error message about invalid phase number format
- **Evidence:** Plan 07-01 validation layer spec — validatePhaseArg rejects non-digit patterns
- **Correlation with full metric:** DIRECT — this IS the full metric for phase validation
- **Blind spots:** None — this directly tests the requirement
- **Validated:** No — first verification

### P2: Input validation — path traversal rejection
- **What:** CLI rejects path traversal attempts
- **How:** Invoke CLI commands with ../ in file path arguments
- **Command:** `node bin/grd-tools.js frontmatter get "../../etc/passwd" 2>&1 | grep -i "path\|error"`
- **Target:** Error message about path traversal or invalid path
- **Evidence:** Plan 07-01 validation layer spec — validateFileArg delegates to validateFilePath for traversal checks
- **Correlation with full metric:** DIRECT — this IS the security requirement
- **Blind spots:** None — directly tests path validation
- **Validated:** No — first verification

### P3: Input validation — unknown subcommand rejection
- **What:** CLI rejects invalid subcommands with helpful error
- **How:** Invoke CLI with unknown subcommand
- **Command:** `node bin/grd-tools.js state invalidcmd 2>&1 | grep -i "unknown\|available"`
- **Target:** Error message listing available subcommands
- **Evidence:** Plan 07-01 validation layer spec — validateSubcommand provides list of valid options
- **Correlation with full metric:** DIRECT — UX requirement for clear errors
- **Blind spots:** None — directly tests subcommand validation
- **Validated:** No — first verification

### P4: Input validation — git ref flag injection rejection
- **What:** CLI rejects git refs with leading dashes (flag injection)
- **How:** Invoke verify commits with flag-like git ref
- **Command:** `node bin/grd-tools.js verify commits "--inject" 2>&1 | grep -i "invalid\|error"`
- **Target:** Error message about invalid git ref
- **Evidence:** Plan 07-01 spec + Phase 2 validateGitRef implementation
- **Correlation with full metric:** DIRECT — security requirement
- **Blind spots:** None — directly tests git ref validation
- **Validated:** No — first verification

### P5: Validation test coverage
- **What:** Validation unit tests comprehensive and passing
- **How:** Run validation test file specifically
- **Command:** `npx jest tests/unit/validation.test.js --verbose 2>&1 | grep -E "Tests:|passed"`
- **Target:** >= 25 tests passed (per Plan 07-01: 4 functions × ~5 cases + 5-6 CLI integration)
- **Evidence:** Plan 07-01 Task 2 specification
- **Correlation with full metric:** DIRECT — test count requirement
- **Blind spots:** Test quality (covered by code review)
- **Validated:** No — first verification

### P6: JSDoc @param count
- **What:** All exported functions documented
- **How:** Count @param tags across all lib/ modules
- **Command:** `grep -h "@param" lib/*.js | wc -l`
- **Target:** >= 100 (conservative estimate for 108 functions; some have multiple params)
- **Evidence:** Plan 07-02 documents ~108 exported functions across 10 modules
- **Correlation with full metric:** HIGH — @param presence indicates JSDoc exists
- **Blind spots:** JSDoc quality/accuracy (covered by manual review)
- **Validated:** No — first verification

### P7: JSDoc @returns count
- **What:** Functions document return values
- **How:** Count @returns tags
- **Command:** `grep -h "@returns" lib/*.js | wc -l`
- **Target:** >= 90 (most functions return values; some void)
- **Evidence:** Plan 07-02 JSDoc format includes @returns
- **Correlation with full metric:** HIGH — indicates completeness
- **Blind spots:** Return type accuracy (covered by testing)
- **Validated:** No — first verification

### P8: Version consistency across sources
- **What:** VERSION, plugin.json, CHANGELOG.md all say 0.0.5
- **How:** Extract version from each source and compare
- **Command:** `cat VERSION && node -e "console.log(require('./.claude-plugin/plugin.json').version)" && grep -o "\[0.0.5\]" CHANGELOG.md | head -1`
- **Target:** All three outputs are "0.0.5" or "[0.0.5]"
- **Evidence:** PRODUCT-QUALITY.md P1 target "Version sync"
- **Correlation with full metric:** DIRECT — this IS version sync verification
- **Blind spots:** None
- **Validated:** No — first verification

### P9: Zero command injection vectors
- **What:** No execSync usage with user input
- **How:** Search for execSync in source files
- **Command:** `grep -r "execSync" bin/ lib/ 2>/dev/null | grep -v "execFileSync" | grep -v "require.*child_process" | wc -l`
- **Target:** 0 matches
- **Evidence:** PRODUCT-QUALITY.md P0 target established in Phase 2
- **Correlation with full metric:** DIRECT — this IS the security audit
- **Blind spots:** None — Phase 2 replaced all execSync with execFileSync
- **Validated:** Yes — verified in Phase 2, 4 (tests), 6 (lint); final check here

### P10: Test suite size and pass rate
- **What:** Full test suite passes with expected test count
- **How:** Run npm test and parse output
- **Command:** `npm test 2>&1 | tail -20`
- **Target:** >= 543 tests passed (Phase 6 count + new validation tests from 07-01)
- **Evidence:** STATE.md shows 543 tests after Phase 6; Plan 07-01 adds >= 25
- **Correlation with full metric:** DIRECT — regression detection
- **Blind spots:** None
- **Validated:** Continuous (tests run in every phase)

### P11: Test coverage maintained >= 80%
- **What:** Coverage thresholds still met after Phase 7 additions
- **How:** Run npm test with coverage
- **Command:** `npm test -- --coverage 2>&1 | grep -A 20 "Coverage summary"`
- **Target:** lib/ modules >= 80% line coverage (per-file thresholds in jest.config.js)
- **Evidence:** PRODUCT-QUALITY.md P0 target established in Phase 4
- **Correlation with full metric:** DIRECT — automated coverage reporting
- **Blind spots:** None — Jest coverage is deterministic
- **Validated:** Continuous (coverage enforced in jest.config.js)

### P12: All PRODUCT-QUALITY.md targets met
- **What:** Complete product verification against documented targets
- **How:** Manual checklist verification in Plan 07-03 Task 2
- **Command:** Documented in 07-03-SUMMARY.md with pass/fail table
- **Target:** All P0 targets pass, all P1 targets pass, all P2 targets pass
- **Evidence:** PRODUCT-QUALITY.md product verification criteria section
- **Correlation with full metric:** DIRECT — this IS the product verification
- **Blind spots:** None — comprehensive verification
- **Validated:** No — final verification in Plan 07-03

## Level 3: Deferred Validations

**Purpose:** Validations requiring user interaction or post-release feedback.

### D1: User acceptance testing (UAT) — DEFER-08-01
- **What:** Real users validate TUI dashboard commands (/grd:dashboard, /grd:phase-detail, /grd:health) meet expectations
- **How:** Collect user feedback post-v0.0.5release on:
  - TUI rendering quality (symbols, layout, readability)
  - Information completeness (do dashboards show all needed data?)
  - Performance (dashboards render quickly on real projects)
- **Why deferred:** UAT requires real users with diverse projects; cannot be simulated in dev
- **Validates at:** post-v0.0.5(user feedback collection period)
- **Depends on:** v0.0.5 release published and adopted by users
- **Target:** >= 80% user satisfaction with dashboard commands (qualitative feedback)
- **Risk if unmet:** Dashboard commands may need UX iteration in v1.1
- **Fallback:** Iterate on dashboard UX based on feedback; does not block v0.0.5release

**Note:** All other deferred validations from prior phases (DEFER-03-01, DEFER-03-02, DEFER-02-01, DEFER-02-02, DEFER-02-03, DEFER-06-01, DEFER-08-02) are RESOLVED per STATE.md. Only DEFER-08-01 remains pending.

## Baselines

Since this is an infrastructure project with no research benchmarks, baselines are current implementation metrics:

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test count (Phase 6) | Total test cases in Jest suite | 543 tests | STATE.md performance metrics |
| Validation coverage (Phase 6) | Input validation on CLI entry points | 0% (no validation layer) | PRODUCT-QUALITY.md gap analysis |
| JSDoc coverage (Phase 6) | Documented functions in lib/ | 0% (no JSDoc) | PRODUCT-QUALITY.md gap analysis |
| Version (Phase 6) | Current version number | 0.0.4 | VERSION file, ROADMAP.md Phase 1 |
| P0 targets met (Phase 6) | Product quality P0 metrics | 4/5 (test coverage met, injection-free met, CI exists, .gitignore exists; largest file still 724 lines in commands.js but accepted in Phase 3 decision) | PRODUCT-QUALITY.md + STATE.md decisions |

## Evaluation Scripts

**Location of evaluation code:**
- Validation tests: `tests/unit/validation.test.js` (created in Plan 07-01)
- Integration tests: `tests/integration/cli.test.js` (existing, may add validation scenarios)
- Coverage verification: `jest.config.js` thresholds (existing from Phase 4)

**How to run full evaluation:**
```bash
# Sanity checks (automated)
ls lib/utils.js tests/unit/validation.test.js CONTRIBUTING.md VERSION
cat VERSION
node -e "console.log(require('./.claude-plugin/plugin.json').version)"
grep "\[0.0.5\]" CHANGELOG.md
npm run lint
npm run format:check

# Proxy metrics (automated)
node bin/grd-tools.js phase-detail "abc" 2>&1
node bin/grd-tools.js frontmatter get "../../etc/passwd" 2>&1
node bin/grd-tools.js state invalidcmd 2>&1
npx jest tests/unit/validation.test.js --verbose
grep -h "@param" lib/*.js | wc -l
grep -h "@returns" lib/*.js | wc -l
npm test -- --coverage
grep -r "execSync" bin/ lib/ | grep -v "execFileSync" | wc -l

# Product verification (manual checklist in Plan 07-03)
# Documented in 07-03-SUMMARY.md
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Plan 07-01 artifacts exist | [PASS/FAIL] | [file list] | |
| S2: Validation functions exported | [PASS/FAIL] | [grep count] | |
| S3: CLI router imports validation | [PASS/FAIL] | [grep match] | |
| S4: Validation tests exist | [PASS/FAIL] | [test count] | |
| S5: JSDoc additions | [PASS/FAIL] | [@param count] | |
| S6: All modules have JSDoc | [PASS/FAIL] | [missing count] | |
| S7: Plan 07-03 artifacts exist | [PASS/FAIL] | [file list] | |
| S8: VERSION = 0.0.5 | [PASS/FAIL] | [content] | |
| S9: plugin.json = 0.0.5 | [PASS/FAIL] | [version] | |
| S10: CHANGELOG has 0.0.5 | [PASS/FAIL] | [section count] | |
| S11: CONTRIBUTING sections | [PASS/FAIL] | [section count] | |
| S12: Tests pass | [PASS/FAIL] | [pass count] | |
| S13: Lint passes | [PASS/FAIL] | [exit code] | |
| S14: Format check passes | [PASS/FAIL] | [exit code] | |
| S15: Manifest in sync | [PASS/FAIL] | [detect output] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Invalid phase rejection | Error message | [actual output] | [MET/MISSED] | |
| P2: Path traversal rejection | Error message | [actual output] | [MET/MISSED] | |
| P3: Unknown subcommand rejection | Error with list | [actual output] | [MET/MISSED] | |
| P4: Git ref flag injection rejection | Error message | [actual output] | [MET/MISSED] | |
| P5: Validation test count | >= 25 | [actual count] | [MET/MISSED] | |
| P6: @param count | >= 100 | [actual count] | [MET/MISSED] | |
| P7: @returns count | >= 90 | [actual count] | [MET/MISSED] | |
| P8: Version consistency | All 0.0.5 | [actual versions] | [MET/MISSED] | |
| P9: Zero execSync | 0 matches | [actual count] | [MET/MISSED] | |
| P10: Test suite size | >= 543 | [actual count] | [MET/MISSED] | |
| P11: Coverage >= 80% | Per-file thresholds | [coverage %] | [MET/MISSED] | |
| P12: All P0/P1 targets met | All pass | [checklist] | [MET/MISSED] | See 07-03-SUMMARY.md |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-08-01 | User acceptance testing of dashboard commands | PENDING | post-v0.0.5(user feedback) |

**All prior deferred validations:** RESOLVED (per STATE.md)

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** COMPREHENSIVE — 15 checks cover file existence, syntax, version consistency, and test/lint gates
- **Proxy metrics:** DIRECT METRICS (not proxies) — In an infrastructure project, automated tests ARE the verification. 12 deterministic checks verify all functional requirements.
- **Deferred coverage:** MINIMAL (only UAT) — Only user acceptance testing deferred; all technical verification automated

**What this evaluation CAN tell us:**
- Input validation layer correctly rejects all invalid input categories (phase, file path, git ref, subcommand)
- JSDoc documentation complete on all lib/ exports
- Version sources synced to 0.0.5
- All tests pass (no regressions)
- All PRODUCT-QUALITY.md P0 and P1 targets met
- Code quality maintained (lint clean, format compliant)
- Product is ready for v0.0.5 release from a technical perspective

**What this evaluation CANNOT tell us:**
- User satisfaction with documentation quality — deferred to DEFER-08-01 (post-release feedback)
- Real-world usability of validation error messages — deferred to DEFER-08-01 (user feedback)
- Whether CONTRIBUTING.md is clear to first-time contributors — deferred to post-v0.0.5onboarding

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-15*
