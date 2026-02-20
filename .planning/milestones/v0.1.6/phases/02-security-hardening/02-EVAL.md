# Evaluation Plan: Phase 2 — Security Hardening

**Designed:** 2026-02-12
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Shell injection prevention, git operation whitelisting, input validation
**Reference papers:** N/A (security infrastructure phase)

> **Note:** This file documents security evaluation commands using grep and test utilities.
> These are shell commands for verification, not code to be executed by the application.
> The phase being evaluated eliminates unsafe shell execution in bin/grd-tools.js.

## Evaluation Overview

Phase 2 eliminates command injection vectors in GRD's CLI tool by replacing all shell-concatenated commands with argument-array-based execFileSync calls, adding git operation whitelists to prevent destructive operations, and implementing comprehensive input validation for phase names, file paths, and git refs.

This is a security infrastructure phase, not an ML/research phase. There are no benchmarks from academic papers. Instead, evaluation focuses on security properties that can be verified through static analysis (grep), dynamic testing, and manual code review.

The tiered evaluation approach ensures both immediate verification of security properties (Level 1 sanity checks) and deferred end-to-end validation that the hardening doesn't break existing functionality (Level 3 deferred to Phase 4 test suite).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Zero unsafe shell calls | Static analysis (grep) | Command injection requires shell metacharacter expansion — execFileSync prevents this |
| Git whitelist enforcement | Code inspection + unit test | Prevents accidental destructive operations (config, push with force, reset with hard) |
| Input validation coverage | Code inspection | Path traversal and null byte injection blocked at entry points |
| CLI command regression | Integration test | Hardening must not break existing functionality |
| SECURITY.md completeness | Line count + keyword presence | Documentation ensures security model is maintainable |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 8 | Static analysis and smoke tests (run in seconds) |
| Proxy (L2) | 5 | Manual testing of security properties and core workflows |
| Deferred (L3) | 3 | Full CLI regression and GitHub tracker end-to-end validation |

## Level 1: Sanity Checks

**Purpose:** Verify basic security properties through static analysis. These MUST ALL PASS before proceeding.

### S1: Zero Unsafe Shell Calls

- **What:** Verify no shell-concatenated commands remain in bin/grd-tools.js
- **Command:** `grep -n "execSync(" /Users/edward.seo/dev/private/project/harness/GRD/bin/grd-tools.js`
- **Expected:** Exit code 1 (no matches found) — the string "execSync(" must not appear anywhere after Plan 02-02
- **Failure means:** Command injection vector still exists; incomplete migration to execFileSync

### S2: execFileSync Usage for Git

- **What:** Verify git operations use execFileSync with argument arrays
- **Command:** `grep -n "execFileSync('git'" /Users/edward.seo/dev/private/project/harness/GRD/bin/grd-tools.js | wc -l`
- **Expected:** >= 2 (at minimum in execGit and isGitIgnored functions)
- **Failure means:** Git operations may still use unsafe shell concatenation

### S3: Find Command Removed

- **What:** Verify shell-based find command replaced with fs.readdirSync
- **Command:** `grep -n "execSync('find " /Users/edward.seo/dev/private/project/harness/GRD/bin/grd-tools.js`
- **Expected:** Exit code 1 (no matches found)
- **Failure means:** Shell-based directory traversal still present

### S4: HOME Fallback Exists

- **What:** Verify process.env.HOME has os.homedir() fallback
- **Command:** `grep -n "os.homedir()" /Users/edward.seo/dev/private/project/harness/GRD/bin/grd-tools.js | wc -l`
- **Expected:** >= 1
- **Failure means:** Null HOME environment variable could cause crashes

### S5: Validation Functions Defined

- **What:** Verify input validation functions exist
- **Command:** `grep -c "function validatePhaseName\|function validateFilePath\|function validateGitRef" /Users/edward.seo/dev/private/project/harness/GRD/bin/grd-tools.js`
- **Expected:** >= 3 (one match per function definition)
- **Failure means:** Input validation layer incomplete

### S6: Git Whitelist Defined

- **What:** Verify git operation whitelist constants exist
- **Command:** `grep -n "GIT_BLOCKED_COMMANDS\|GIT_BLOCKED_FLAGS" /Users/edward.seo/dev/private/project/harness/GRD/bin/grd-tools.js | wc -l`
- **Expected:** >= 2 (both constants defined)
- **Failure means:** Git whitelist enforcement not implemented

### S7: SECURITY.md Exists

- **What:** Verify SECURITY.md documentation created
- **Command:** `test -f /Users/edward.seo/dev/private/project/harness/GRD/SECURITY.md && wc -l /Users/edward.seo/dev/private/project/harness/GRD/SECURITY.md`
- **Expected:** File exists with >= 30 lines
- **Failure means:** Security model not documented

### S8: Smoke Test — State Load

- **What:** Verify state load command works after hardening
- **Command:** `node /Users/edward.seo/dev/private/project/harness/GRD/bin/grd-tools.js state load`
- **Expected:** Valid JSON output (exit code 0, valid JSON structure)
- **Failure means:** Core functionality broken by security hardening

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Manual testing of security properties and core workflows.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: Path Traversal Rejection

- **What:** Verify phase name validation rejects path traversal attempts
- **How:** Test normalizePhaseName with malicious inputs
- **Command:** Test suite (to be created in Phase 4)
- **Target:** Exception thrown with message containing "path traversal" or "directory separators"
- **Evidence:** Input validation spec in Plan 02-01 Task 2
- **Correlation with full metric:** HIGH — path traversal is binary (blocked or not)
- **Blind spots:** May not catch all edge cases (symlinks, double encoding, Windows-style paths)
- **Validated:** No — awaiting deferred validation in Phase 4 test suite

### P2: Git Operation Whitelist

- **What:** Verify destructive git commands are blocked by default
- **How:** Inspect execGit function code for whitelist enforcement
- **Command:** Code inspection verifying whitelist check exists in execGit function
- **Target:** execGit function contains conditional check for GIT_BLOCKED_COMMANDS and GIT_BLOCKED_FLAGS
- **Evidence:** Plan 02-02 Task 1 Part B specifies whitelist enforcement
- **Correlation with full metric:** HIGH — code inspection directly verifies enforcement
- **Blind spots:** Runtime behavior not verified (code may have bugs); edge cases not tested
- **Validated:** No — awaiting deferred validation in Phase 4 test suite

### P3: Git Commands Smoke Test

- **What:** Verify core git operations still work after execFileSync migration
- **How:** Run git-touching CLI commands
- **Command:** Run verify commits and frontmatter get commands
- **Target:** Both commands exit with code 0, produce expected output
- **Evidence:** Smoke tests specified in Plan 02-01 and 02-02 verification sections
- **Correlation with full metric:** MEDIUM — tests only 2 of ~40 commands
- **Blind spots:** Doesn't test all git-touching commands; doesn't test edge cases
- **Validated:** No — awaiting full CLI regression in Phase 4

### P4: GitHub Tracker Argument Safety

- **What:** Verify gh CLI calls use execFileSync with argument arrays (no shell string interpolation)
- **How:** Manual code inspection of createGitHubTracker function
- **Command:** Verify ghExec uses execFileSync and no string concatenation in gh calls
- **Target:** ghExec function uses execFileSync; zero string concatenation in gh calls
- **Evidence:** Plan 02-02 Task 1 Part A specifies argument array conversion
- **Correlation with full metric:** HIGH — code inspection directly verifies safety
- **Blind spots:** Runtime behavior not tested; GitHub tracker integration not tested end-to-end
- **Validated:** No — awaiting deferred validation in Phase 5

### P5: SECURITY.md Completeness

- **What:** Verify SECURITY.md covers all required sections
- **How:** Keyword presence check
- **Command:** Check for required keywords: execFileSync, whitelist, validation, input
- **Target:** >= 1 match for each keyword (execFileSync, whitelist, validation, input)
- **Evidence:** Plan 02-02 Task 2 specifies required sections
- **Correlation with full metric:** MEDIUM — keyword presence doesn't guarantee quality
- **Blind spots:** Doesn't verify documentation accuracy or clarity
- **Validated:** No — manual review recommended

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Full CLI Regression — DEFER-02-01

- **What:** All 64 CLI commands work correctly after security hardening
- **How:** Integration test suite with golden output snapshots
- **Why deferred:** Test suite doesn't exist yet (created in Phase 4)
- **Validates at:** phase-04-test-suite
- **Depends on:** Jest test framework, test fixtures, golden output captures
- **Target:** 100% of CLI commands pass integration tests (exit code 0, output matches snapshot)
- **Risk if unmet:** Security hardening may have broken edge cases in git argument handling, phase name parsing, or file path resolution — would require rollback or iteration
- **Fallback:** Rollback to pre-hardening grd-tools.js from git history; re-plan hardening with different approach

### D2: CLI Output Unchanged — DEFER-02-02

- **What:** CLI command output is byte-for-byte identical to pre-hardening version (for non-security-related commands)
- **How:** Golden snapshot comparison (capture output before hardening, compare after)
- **Why deferred:** Golden snapshots not captured yet (captured in Phase 3 before modularization, validated in Phase 4)
- **Validates at:** phase-04-test-suite
- **Depends on:** Golden output capture process in Phase 3
- **Target:** >= 95% of commands produce identical output (some security-related error messages may change)
- **Risk if unmet:** Breaking changes in output format may break agents/workflows that parse CLI output — would require documentation update or output format fix
- **Fallback:** Document intentional output changes in CHANGELOG; update affected agents/workflows

### D3: GitHub Tracker End-to-End — DEFER-02-03

- **What:** GitHub tracker integration works correctly with hardened gh CLI calls
- **How:** End-to-end test creating issues, updating status, adding comments with real gh CLI
- **Why deferred:** Requires GitHub authentication and repository access; not available in security hardening phase
- **Validates at:** phase-05-ci-cd-pipeline
- **Depends on:** GitHub authentication configured, test repository, CI environment with gh CLI
- **Target:** All tracker operations succeed (create epic, create task, update status, add comment)
- **Risk if unmet:** Argument array conversion may have broken gh CLI flag syntax or body formatting — would require iteration to fix argument construction
- **Fallback:** Disable GitHub tracker in config until fixed; document known issue

## Ablation Plan

**No ablation plan** — This phase implements security hardening, not experimental methods. Security properties are binary (safe or unsafe), not measurable on a spectrum.

However, we can verify component necessity:

- **Ablation question:** Is execFileSync migration sufficient without input validation?
  - **Test:** Comment out validatePhaseName calls, test with traversal input
  - **Expected:** Path traversal still possible without input validation
  - **Conclusion:** Input validation is necessary defense-in-depth (execFileSync prevents shell injection, validation prevents path traversal)

- **Ablation question:** Is input validation sufficient without execFileSync migration?
  - **Test:** Revert to execSync with validation in place, test with shell metacharacters
  - **Expected:** Shell metacharacters bypass input validation
  - **Conclusion:** execFileSync is necessary (validation doesn't cover all metacharacters)

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-hardening unsafe shell calls | Count of execSync calls with user input | ~5-10 occurrences | Static analysis of current bin/grd-tools.js |
| Post-hardening unsafe shell calls | Count after security hardening | 0 | Phase 2 success criterion |
| Pre-hardening git whitelist | Destructive commands blocked | None (all commands allowed) | Current implementation |
| Post-hardening git whitelist | Destructive commands blocked | config, push, clean, and dangerous flags | Phase 2 spec |

## Evaluation Scripts

**Location of evaluation code:**
```
Phase 2 uses inline grep/test commands. Full test suite created in Phase 4:
  tests/unit/utils.test.js — validatePhaseName, validateFilePath, validateGitRef
  tests/unit/security.test.js — git whitelist, path traversal prevention
  tests/integration/cli.test.js — full CLI regression
```

**How to run full evaluation:**

All sanity checks use grep, wc, and test utilities to verify security properties through static analysis.
All proxy metrics use code inspection or manual testing of specific functionality.
All deferred validations wait for Phase 4 test suite and Phase 5 CI integration.

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Zero unsafe shell calls | [PASS/FAIL] | [grep output] | |
| S2: execFileSync usage for git | [PASS/FAIL] | [count] | |
| S3: Find command removed | [PASS/FAIL] | [grep output] | |
| S4: HOME fallback exists | [PASS/FAIL] | [count] | |
| S5: Validation functions defined | [PASS/FAIL] | [count] | |
| S6: Git whitelist defined | [PASS/FAIL] | [count] | |
| S7: SECURITY.md exists | [PASS/FAIL] | [line count] | |
| S8: Smoke test — state load | [PASS/FAIL] | [JSON valid?] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Path traversal rejection | Exception thrown | [actual result] | [MET/MISSED] | |
| P2: Git whitelist enforcement | Code check present | [present/absent] | [MET/MISSED] | |
| P3: Git commands smoke test | Exit code 0 | [exit code] | [MET/MISSED] | |
| P4: GitHub tracker safety | execFileSync present | [present/absent] | [MET/MISSED] | |
| P5: SECURITY.md completeness | >= 1 each keyword | [counts] | [MET/MISSED] | |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| execFileSync only (no validation) | Path traversal possible | [result] | [Input validation necessary] |
| Validation only (no execFileSync) | Shell injection possible | [result] | [execFileSync necessary] |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-02-01 | Full CLI regression | PENDING | phase-04-test-suite |
| DEFER-02-02 | CLI output unchanged | PENDING | phase-04-test-suite |
| DEFER-02-03 | GitHub tracker end-to-end | PENDING | phase-05-ci-cd-pipeline |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** Adequate — static analysis (grep) directly verifies security properties; smoke tests catch obvious breakage
- **Proxy metrics:** Well-evidenced — code inspection verifies implementation correctness; manual tests cover critical paths
- **Deferred coverage:** Comprehensive — Phase 4 test suite will validate all edge cases; Phase 5 CI will validate GitHub integration

**What this evaluation CAN tell us:**
- Whether command injection vectors have been eliminated (static analysis is deterministic)
- Whether git whitelist enforcement is implemented correctly (code inspection)
- Whether basic functionality still works (smoke tests)
- Whether SECURITY.md documents the security model (keyword presence)

**What this evaluation CANNOT tell us:**
- Whether all edge cases are handled correctly (requires full test suite in Phase 4)
- Whether the hardening breaks any of the 64 CLI commands (requires integration tests in Phase 4)
- Whether GitHub tracker works end-to-end (requires CI environment in Phase 5)
- Whether security properties hold under fuzzing or adversarial inputs (requires dedicated security testing — out of scope for v0.0.5)

**Risk assessment:**
- **Low risk:** Static analysis (grep) catches regressions immediately
- **Medium risk:** Smoke tests may miss edge cases; deferred validations may find issues after integration
- **Mitigation:** Phase 4 test suite provides comprehensive coverage; rollback to git history available if critical issues found

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-12*
