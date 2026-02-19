# Evaluation Plan: Phase 06 — Code Style

**Designed:** 2026-02-15
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** ESLint + Prettier code style enforcement
**Reference papers:** N/A (tooling integration, not research)

## Evaluation Overview

Phase 06 establishes code style enforcement for the GRD CLI tool using industry-standard tooling (ESLint + Prettier). This is an infrastructure phase, not a research phase, so evaluation focuses on tool integration quality and behavioral preservation rather than algorithmic performance.

The evaluation must verify that:
1. **Tooling works correctly** — ESLint and Prettier run without configuration errors
2. **Style enforcement succeeds** — All 6,779 lines of source code pass lint and format checks
3. **Functionality preserved** — Existing test suite (300+ tests, 80%+ coverage) continues to pass
4. **CI enforcement active** — Lint failures block CI (no continue-on-error)

This phase validates DEFER-06-01 ("lint rules do not break valid codebase patterns") by running ESLint on the entire codebase and verifying zero errors. Success requires ESLint rules to be compatible with existing code patterns OR for the code to be refactored to meet reasonable style standards.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Lint errors/warnings count | ESLint exit code + output | Zero errors/warnings is the product requirement (ROADMAP success criteria) |
| Format consistency | Prettier --check exit code | All files must match .prettierrc configuration |
| Test pass rate | Jest exit code | Proves formatting did not break functionality |
| CI enforcement | .github/workflows/ci.yml | Ensures lint failures block merges (product quality gate) |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 5 | Configuration validity and tool execution |
| Proxy (L2) | 5 | Code quality and behavioral preservation |
| Deferred (L3) | 0 | All validation possible in-phase |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Configuration Files Valid
- **What:** ESLint and Prettier configuration files are valid JSON and parseable
- **Command:** `node -e "JSON.parse(require('fs').readFileSync('.eslintrc.json','utf8')); JSON.parse(require('fs').readFileSync('.prettierrc','utf8')); console.log('PASS')"`
- **Expected:** Prints "PASS" without JSON parse errors
- **Failure means:** Configuration syntax error — fix JSON before proceeding

### S2: Tooling Installed
- **What:** ESLint and Prettier are installed as devDependencies with version numbers
- **Command:** `node -e "const p=require('./package.json'); if (p.devDependencies.eslint && p.devDependencies.prettier) { console.log('PASS'); } else { process.exit(1); }"`
- **Expected:** Prints "PASS" and exits 0
- **Failure means:** npm install failed or package.json not updated — re-run Plan 06-01

### S3: Lint Script Functional
- **What:** npm run lint invokes ESLint (not placeholder error)
- **Command:** `npm run lint --help 2>&1 | grep -q "eslint" && echo "PASS" || echo "FAIL"`
- **Expected:** Prints "PASS" (ESLint help text appears)
- **Failure means:** package.json script still contains placeholder — verify Plan 06-01 completion

### S4: Format Script Functional
- **What:** npm run format:check invokes Prettier (not placeholder error)
- **Command:** `npm run format:check --help 2>&1 | grep -q "prettier" && echo "PASS" || echo "FAIL"`
- **Expected:** Prints "PASS" (Prettier help text appears)
- **Failure means:** package.json script still contains placeholder — verify Plan 06-01 completion

### S5: Ignore Files Present
- **What:** .prettierignore exists and excludes expected directories
- **Command:** `test -f .prettierignore && grep -q "coverage/" .prettierignore && grep -q "node_modules/" .prettierignore && echo "PASS" || echo "FAIL"`
- **Expected:** Prints "PASS"
- **Failure means:** .prettierignore missing or incomplete — verify Plan 06-01 completion

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Verify code quality and behavioral preservation.
**IMPORTANT:** These metrics directly measure the product requirement (zero lint errors, all files formatted, tests pass). This phase has no gap between proxy and real metrics — what we measure IS the product quality.

### P1: Zero Lint Errors
- **What:** ESLint reports zero errors and zero warnings across all source files
- **How:** Run ESLint on bin/ and lib/ directories
- **Command:** `npm run lint 2>&1 | tee /tmp/lint-output.txt && test ${PIPESTATUS[0]} -eq 0 && echo "PASS"`
- **Target:** Exit code 0, output contains "0 problems"
- **Evidence:** ROADMAP Phase 6 success criteria: "npm run lint passes with zero errors, zero warnings"
- **Correlation with full metric:** DIRECT — this IS the product requirement
- **Blind spots:** None — this is the complete metric
- **Validated:** N/A — this is not a proxy, this is the actual product metric

### P2: Zero Format Violations
- **What:** Prettier reports all files are formatted according to .prettierrc
- **How:** Run Prettier --check on all JS files
- **Command:** `npm run format:check 2>&1 | tee /tmp/format-output.txt && test ${PIPESTATUS[0]} -eq 0 && echo "PASS"`
- **Target:** Exit code 0, no files listed as unformatted
- **Evidence:** ROADMAP Phase 6 success criteria: "npm run format:check passes (all files formatted)"
- **Correlation with full metric:** DIRECT — this IS the product requirement
- **Blind spots:** None — this is the complete metric
- **Validated:** N/A — this is not a proxy, this is the actual product metric

### P3: Test Suite Behavioral Preservation
- **What:** Full Jest test suite passes with existing coverage thresholds (80%+)
- **How:** Run npm test with coverage
- **Command:** `npm test 2>&1 | tee /tmp/test-output.txt && test ${PIPESTATUS[0]} -eq 0 && echo "PASS"`
- **Target:** Exit code 0, all tests pass, coverage thresholds met
- **Evidence:** ROADMAP Phase 6 success criteria: "Existing code style preserved" — test pass proves no behavioral change
- **Correlation with full metric:** HIGH — 300+ tests with 80% coverage is strong behavioral verification
- **Blind spots:** Edge cases not covered by existing tests (but these would also fail in Phase 4)
- **Validated:** No — but Phase 4 already validated test suite completeness

### P4: Source Line Count Unchanged
- **What:** Total line count of bin/ and lib/ JS files is within 5% of baseline (6,779 lines)
- **How:** Count lines with wc -l, compare to baseline
- **Command:** `wc -l bin/*.js lib/*.js | tail -1 | awk '{print $1}' > /tmp/line-count.txt && test $(cat /tmp/line-count.txt) -ge 6400 && test $(cat /tmp/line-count.txt) -le 7100 && echo "PASS"`
- **Target:** 6,440 - 7,118 lines (95%-105% of 6,779)
- **Evidence:** Large line count changes suggest unintended code additions or deletions
- **Correlation with full metric:** MEDIUM — detects major formatting issues but not semantic changes
- **Blind spots:** Line count can change without behavioral change (comments, whitespace), or stay same with bugs introduced
- **Validated:** No — but P3 test suite validates semantics

### P5: DEFER-06-01 Validation
- **What:** ESLint rules are compatible with all codebase patterns (no rule-vs-pattern conflicts)
- **How:** Run lint with zero errors AND document rule overrides with rationale
- **Command:** `npm run lint 2>&1 | grep "0 problems" && cat .eslintrc.json | grep -A 10 '"rules"' > /tmp/rule-overrides.txt && echo "PASS"`
- **Target:** Zero lint errors + documented rule overrides in SUMMARY.md
- **Evidence:** DEFER-06-01 from Phase 2: "Lint rules do not break valid codebase patterns"
- **Correlation with full metric:** DIRECT — if lint passes, rules are compatible
- **Blind spots:** Could achieve zero errors via excessive eslint-disable comments (bad practice) — SUMMARY must verify minimal inline disables
- **Validated:** No — but this resolves the deferred item

**Proxy confidence:** HIGH — these are not proxies, they are direct measurements of product requirements.

## Level 3: Deferred Validations

**Purpose:** None needed — all validation possible in-phase.

**Rationale:** Phase 06 is tooling integration with clear, testable acceptance criteria. All metrics can be measured immediately:
- Lint errors: measurable via ESLint exit code
- Format violations: measurable via Prettier exit code
- Behavioral preservation: measurable via existing test suite
- CI enforcement: measurable via inspection of .github/workflows/ci.yml

No integration with other components required. No subjective quality assessment needed. No external data dependencies.

## Ablation Plan

**No ablation plan** — This phase integrates two independent tools (ESLint, Prettier). No sub-components to isolate.

Potential future ablations (post-v0.0.5):
- Remove Prettier, keep only ESLint (tests if formatting rules are sufficient)
- Remove ESLint, keep only Prettier (tests if linting is necessary)
- Add eslint-plugin-jest (tests if Jest-specific rules improve test quality)

These are out-of-scope for v0.0.5.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-formatting line count | Total lines in bin/ + lib/ before Prettier | 6,779 lines | wc -l output |
| Pre-lint test pass rate | Test suite pass rate before ESLint auto-fix | 100% (Phase 4 established) | npm test |
| Pre-lint coverage | Code coverage before style changes | 80%+ (Phase 4 established) | npm test --coverage |

## Evaluation Scripts

**Location of evaluation code:**
```
No custom evaluation scripts needed. Use standard npm scripts:
- npm run lint
- npm run format:check
- npm test
```

**How to run full evaluation:**
```bash
#!/bin/bash
# Phase 06 Full Evaluation

echo "=== Sanity Checks ==="
echo "S1: Configuration validity"
node -e "JSON.parse(require('fs').readFileSync('.eslintrc.json','utf8')); JSON.parse(require('fs').readFileSync('.prettierrc','utf8')); console.log('PASS')"

echo "S2: Tooling installed"
node -e "const p=require('./package.json'); if (p.devDependencies.eslint && p.devDependencies.prettier) { console.log('PASS'); } else { process.exit(1); }"

echo "S3: Lint script functional"
npm run lint --help 2>&1 | grep -q "eslint" && echo "PASS" || echo "FAIL"

echo "S4: Format script functional"
npm run format:check --help 2>&1 | grep -q "prettier" && echo "PASS" || echo "FAIL"

echo "S5: Ignore files present"
test -f .prettierignore && grep -q "coverage/" .prettierignore && grep -q "node_modules/" .prettierignore && echo "PASS" || echo "FAIL"

echo ""
echo "=== Proxy Metrics ==="
echo "P1: Zero lint errors"
npm run lint 2>&1 | tee /tmp/lint-output.txt
echo "Lint exit code: $?"

echo "P2: Zero format violations"
npm run format:check 2>&1 | tee /tmp/format-output.txt
echo "Format exit code: $?"

echo "P3: Test suite preservation"
npm test 2>&1 | tee /tmp/test-output.txt
echo "Test exit code: $?"

echo "P4: Line count check"
wc -l bin/*.js lib/*.js | tail -1 | awk '{print $1}' > /tmp/line-count.txt
cat /tmp/line-count.txt
echo "Target range: 6440-7118 lines"

echo "P5: DEFER-06-01 validation"
cat .eslintrc.json | grep -A 10 '"rules"'
echo "Check SUMMARY.md for rule override rationale"

echo ""
echo "=== CI Enforcement Check ==="
grep -A 5 "name: Lint" .github/workflows/ci.yml | grep "continue-on-error" && echo "FAIL: Lint has continue-on-error" || echo "PASS: Lint enforced"
grep "format:check" .github/workflows/ci.yml && echo "PASS: Format check in CI" || echo "FAIL: No format check"
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Configuration validity | | | |
| S2: Tooling installed | | | |
| S3: Lint script functional | | | |
| S4: Format script functional | | | |
| S5: Ignore files present | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Zero lint errors | 0 problems | | | |
| P2: Zero format violations | All formatted | | | |
| P3: Test suite passes | 100% pass | | | |
| P4: Line count | 6440-7118 | | | |
| P5: DEFER-06-01 validation | Documented + 0 errors | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| N/A | All validation in-phase | N/A | N/A |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: ADEQUATE — 5 checks cover configuration validity, tool installation, and script functionality
- Proxy metrics: NOT PROXIES — these are direct measurements of product requirements (lint errors, format violations, test pass rate)
- Deferred coverage: N/A — no deferred validations needed

**What this evaluation CAN tell us:**
- ESLint and Prettier are correctly installed and configured
- All 6,779 lines of source code pass lint with zero errors/warnings
- All source files are formatted according to .prettierrc
- Code formatting did not break any functionality (test suite passes)
- CI enforces lint and format checks (failures block merge)
- DEFER-06-01 is resolved (lint rules compatible with codebase)

**What this evaluation CANNOT tell us:**
- Code quality beyond what ESLint detects (e.g., architectural issues, performance bugs)
- Whether .prettierrc settings match developer preferences (subjective — but ROADMAP requires "existing style preserved")
- Future maintainability improvements from consistent style (long-term benefit, not immediately measurable)

**Critical success path:**
1. Sanity checks confirm tools installed and configured
2. P1 confirms zero lint errors (DEFER-06-01 resolution)
3. P2 confirms all files formatted
4. P3 confirms no behavioral regression
5. CI inspection confirms enforcement active

If any of P1-P3 fail, phase fails. Iteration required (max 2 per ROADMAP iteration strategy).

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-15*
