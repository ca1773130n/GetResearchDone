# Evaluation Plan: Phase 5 — CI/CD Pipeline

**Designed:** 2026-02-15
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** GitHub Actions CI/CD workflows
**Reference papers:** N/A (infrastructure phase, not research)

## Evaluation Overview

Phase 5 establishes automated quality gates via GitHub Actions. This is not a research phase evaluating algorithmic performance, but an infrastructure phase evaluating whether the CI/CD pipeline is correctly configured and functional.

**What we're evaluating:**
1. CI workflow (ci.yml) correctness: triggers, matrix strategy, steps, error handling
2. Release workflow (release.yml) correctness: version validation, test gating, release creation
3. README badge integration
4. Resolution of DEFER-02-03 (GitHub tracker end-to-end validation)

**What can be verified at this stage:**
- Sanity (L1): YAML syntax, file structure, content verification via grep/parsing
- Proxy (L2): Local workflow validation via `act` or manual step simulation
- Deferred (L3): Actual workflow execution on GitHub requires push to remote repository

**What cannot be verified without GitHub:**
- Actual workflow execution in GitHub Actions runner
- CI badge rendering in README.md on GitHub UI
- GitHub Release creation and draft status
- Matrix strategy execution across Node 18/20/22
- Branch protection rule integration

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| YAML validity | YAML spec | Prevents workflow parse errors |
| Workflow trigger correctness | GitHub Actions docs | Ensures CI runs on correct events |
| Matrix strategy completeness | ROADMAP success criteria | Phase requires Node 18/20/22 coverage |
| Version consistency validation | Plan 05-02 requirements | Release quality gate |
| Badge syntax | GitHub badge API | Visual CI status in README |
| DEFER-02-03 resolution | STATE.md deferred tracker | Closes Phase 2 validation gap |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 12 | Verify workflow files exist, parse correctly, and contain required elements |
| Proxy (L2) | 3 | Validate workflow logic locally without GitHub |
| Deferred (L3) | 5 | Full workflow execution on GitHub infrastructure |

## Level 1: Sanity Checks

**Purpose:** Verify basic workflow file correctness. These MUST ALL PASS before proceeding.

### S1: CI Workflow File Exists and Parses
- **What:** .github/workflows/ci.yml exists and is valid YAML
- **Command:** `test -f .github/workflows/ci.yml && echo "EXISTS" || echo "MISSING"`
- **Expected:** "EXISTS"
- **Failure means:** Plan 05-01 did not create the file

### S2: CI Workflow YAML Syntax Valid
- **What:** ci.yml parses without YAML syntax errors
- **Command:**
  ```bash
  node -e "const fs=require('fs'); const yaml=require('yaml'); yaml.parse(fs.readFileSync('.github/workflows/ci.yml','utf8')); console.log('VALID')" 2>/dev/null || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('VALID')"
  ```
- **Expected:** "VALID" (no parse errors)
- **Failure means:** YAML syntax error in ci.yml

### S3: CI Workflow Has Required Triggers
- **What:** ci.yml contains both push and pull_request triggers for main branch
- **Command:**
  ```bash
  grep -q "push:" .github/workflows/ci.yml && \
  grep -q "pull_request:" .github/workflows/ci.yml && \
  echo "TRIGGERS_OK" || echo "MISSING_TRIGGER"
  ```
- **Expected:** "TRIGGERS_OK"
- **Failure means:** Workflow won't run on expected events

### S4: CI Workflow Has Node Version Matrix
- **What:** ci.yml contains strategy.matrix with node-version array including 18, 20, 22
- **Command:**
  ```bash
  grep -A3 "matrix:" .github/workflows/ci.yml | grep -q "node-version:" && \
  grep "node-version:" .github/workflows/ci.yml | grep -E "(18|20|22)" | wc -l | grep -q "1" && \
  echo "MATRIX_OK" || echo "MATRIX_MISSING"
  ```
- **Expected:** "MATRIX_OK"
- **Failure means:** Node version matrix incomplete or missing

### S5: CI Workflow Has Required Steps
- **What:** ci.yml contains npm test, npm audit steps
- **Command:**
  ```bash
  grep -q "npm test" .github/workflows/ci.yml && \
  grep -q "npm audit" .github/workflows/ci.yml && \
  echo "STEPS_OK" || echo "STEPS_MISSING"
  ```
- **Expected:** "STEPS_OK"
- **Failure means:** Critical CI steps missing

### S6: CI Workflow Has Lint Step with Continue-on-Error
- **What:** ci.yml contains npm run lint with continue-on-error: true (temporary until Phase 6)
- **Command:**
  ```bash
  grep -A2 "npm run lint" .github/workflows/ci.yml | grep -q "continue-on-error: true" && \
  echo "LINT_OK" || echo "LINT_CONFIG_MISSING"
  ```
- **Expected:** "LINT_OK"
- **Failure means:** Lint step will fail CI (ESLint not configured until Phase 6)

### S7: Release Workflow File Exists and Parses
- **What:** .github/workflows/release.yml exists and is valid YAML
- **Command:**
  ```bash
  test -f .github/workflows/release.yml && \
  node -e "const fs=require('fs'); const yaml=require('yaml'); yaml.parse(fs.readFileSync('.github/workflows/release.yml','utf8')); console.log('VALID')" 2>/dev/null || \
  python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('VALID')"
  ```
- **Expected:** "VALID"
- **Failure means:** Plan 05-02 did not create valid file

### S8: Release Workflow Has Manual Trigger Only
- **What:** release.yml uses workflow_dispatch (no push/PR triggers)
- **Command:**
  ```bash
  grep -q "workflow_dispatch" .github/workflows/release.yml && \
  ! grep -q "push:" .github/workflows/release.yml && \
  echo "MANUAL_TRIGGER_OK" || echo "WRONG_TRIGGER"
  ```
- **Expected:** "MANUAL_TRIGGER_OK"
- **Failure means:** Release may trigger automatically (unwanted)

### S9: Release Workflow Has Version Consistency Check
- **What:** release.yml checks VERSION, plugin.json, and CHANGELOG.md
- **Command:**
  ```bash
  grep -q "VERSION" .github/workflows/release.yml && \
  grep -q "plugin.json" .github/workflows/release.yml && \
  grep -q "CHANGELOG" .github/workflows/release.yml && \
  echo "VERSION_CHECK_OK" || echo "VERSION_CHECK_MISSING"
  ```
- **Expected:** "VERSION_CHECK_OK"
- **Failure means:** Release won't validate version consistency

### S10: Release Workflow Creates Draft Release
- **What:** release.yml has draft: true for GitHub Release creation
- **Command:**
  ```bash
  grep -q "draft: true" .github/workflows/release.yml && \
  echo "DRAFT_OK" || echo "NOT_DRAFT"
  ```
- **Expected:** "DRAFT_OK"
- **Failure means:** Release will publish immediately (should be draft for review)

### S11: README Has CI Badge
- **What:** README.md contains GitHub Actions badge linking to ci.yml workflow
- **Command:**
  ```bash
  grep -q "actions/workflows/ci.yml/badge.svg" README.md && \
  grep -q "ca1773130n/GRD" README.md && \
  echo "BADGE_OK" || echo "BADGE_MISSING"
  ```
- **Expected:** "BADGE_OK"
- **Failure means:** Plan 05-01 did not add badge to README

### S12: DEFER-02-03 Resolved in STATE.md
- **What:** DEFER-02-03 marked as RESOLVED in STATE.md deferred validations table
- **Command:**
  ```bash
  grep "DEFER-02-03" .planning/STATE.md | grep -q "RESOLVED" && \
  echo "DEFER_RESOLVED" || echo "DEFER_PENDING"
  ```
- **Expected:** "DEFER_RESOLVED"
- **Failure means:** Plan 05-02 did not resolve the deferred validation

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Validate workflow logic locally without pushing to GitHub.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: CI Workflow Step Sequence Validation
- **What:** CI workflow steps execute in correct order locally
- **How:** Simulate CI steps manually in correct sequence
- **Command:**
  ```bash
  cd /Users/edward.seo/dev/private/project/harness/GRD && \
  npm ci 2>&1 | head -1 && \
  npm run lint 2>&1 | grep -q "exit" && echo "lint: runs (expected failure)" && \
  npm test 2>&1 | grep -q "PASS" && echo "test: passes" && \
  npm audit --audit-level=moderate 2>&1 | head -1 && \
  echo "STEP_SEQUENCE_OK"
  ```
- **Target:** All steps executable without crashes (lint expected to fail until Phase 6)
- **Evidence:** Simulates GitHub Actions runner behavior
- **Correlation with full metric:** MEDIUM — local env may differ from GitHub runner
- **Blind spots:** GitHub Actions-specific environment variables, runner OS differences
- **Validated:** No — awaiting deferred validation at GitHub push

### P2: Release Workflow Version Validation Script
- **What:** Version consistency check script logic works locally
- **How:** Extract and run version check shell script from release.yml
- **Command:**
  ```bash
  cd /Users/edward.seo/dev/private/project/harness/GRD && \
  VERSION_FILE=$(cat VERSION) && \
  PLUGIN_VERSION=$(node -e "console.log(require('./.claude-plugin/plugin.json').version)") && \
  CHANGELOG_HAS=$(grep -c "\\[$VERSION_FILE\\]" CHANGELOG.md || true) && \
  echo "VERSION file: $VERSION_FILE" && \
  echo "plugin.json:  $PLUGIN_VERSION" && \
  echo "CHANGELOG:    $CHANGELOG_HAS match(es)" && \
  [ "$VERSION_FILE" = "$PLUGIN_VERSION" ] && [ "$CHANGELOG_HAS" -gt 0 ] && \
  echo "VERSION_VALIDATION_OK" || echo "VERSION_MISMATCH"
  ```
- **Target:** "VERSION_VALIDATION_OK" (all versions match)
- **Evidence:** Direct execution of release.yml script logic
- **Correlation with full metric:** HIGH — identical script to workflow
- **Blind spots:** GitHub Actions context variables not available locally
- **Validated:** No — awaiting deferred validation at workflow execution

### P3: YAML Schema Compliance
- **What:** Workflow YAML structure matches GitHub Actions schema
- **How:** Parse YAML and verify required keys exist with correct types
- **Command:**
  ```bash
  node -e "
  const fs = require('fs');
  const yaml = require('yaml');
  const ci = yaml.parse(fs.readFileSync('.github/workflows/ci.yml', 'utf8'));
  const release = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf8'));
  const checks = [
    ci.on && ci.on.push && ci.on.pull_request,
    ci.jobs && ci.jobs.test && ci.jobs.test.strategy && ci.jobs.test.strategy.matrix,
    release.on && release.on.workflow_dispatch,
    release.jobs && Object.values(release.jobs)[0].steps
  ];
  console.log(checks.every(x => x) ? 'SCHEMA_OK' : 'SCHEMA_INVALID');
  "
  ```
- **Target:** "SCHEMA_OK"
- **Evidence:** Validates against GitHub Actions workflow structure requirements
- **Correlation with full metric:** HIGH — catches most schema violations
- **Blind spots:** Advanced workflow features (secrets, outputs, conditionals)
- **Validated:** No — awaiting deferred validation at workflow execution

## Level 3: Deferred Validations

**Purpose:** Full workflow validation requiring GitHub infrastructure.

### D1: CI Workflow Executes Successfully on GitHub — DEFER-05-01
- **What:** ci.yml runs successfully on push to main or PR
- **How:** Push workflows to GitHub, trigger CI via push or PR
- **Why deferred:** Requires GitHub Actions runner environment
- **Validates at:** First push to main after Phase 5 completion
- **Depends on:** GitHub repository with Actions enabled
- **Target:**
  - Workflow triggers on push/PR events
  - All three Node versions (18, 20, 22) complete
  - Test step passes
  - Lint step runs but continues on error (until Phase 6)
  - Audit step completes
- **Risk if unmet:** CI pipeline non-functional; must debug workflow configuration
- **Fallback:** Fix workflow YAML based on GitHub Actions logs, re-push

### D2: CI Workflow Matrix Strategy Runs All Node Versions — DEFER-05-02
- **What:** Matrix strategy executes jobs for Node 18, 20, and 22 independently
- **How:** Verify GitHub Actions run shows 3 parallel jobs in UI
- **Why deferred:** Requires GitHub Actions runner with matrix execution
- **Validates at:** First CI run on GitHub
- **Depends on:** GitHub Actions enabled, workflow triggered
- **Target:**
  - 3 jobs appear in Actions UI (one per Node version)
  - fail-fast: false allows all versions to run even if one fails
  - All 3 jobs must reach "test" step
- **Risk if unmet:** Limited Node version coverage; matrix misconfigured
- **Fallback:** Debug matrix YAML syntax, verify node-version array format

### D3: Release Workflow Validates Version Consistency — DEFER-05-03
- **What:** release.yml fails if VERSION != plugin.json or CHANGELOG missing entry
- **How:** Manually trigger release workflow with mismatched versions, verify failure
- **Why deferred:** Requires GitHub Actions workflow_dispatch trigger
- **Validates at:** Manual release workflow test after Phase 5
- **Depends on:** Workflow pushed to GitHub, workflow_dispatch enabled
- **Target:**
  - Workflow fails with error if VERSION != plugin.json version
  - Workflow fails with error if CHANGELOG.md has no entry for VERSION
  - Error messages use GitHub Actions ::error:: annotation
- **Risk if unmet:** Broken releases with version mismatches published
- **Fallback:** Fix version check script, add test cases for mismatches

### D4: CI Badge Renders Correctly in README — DEFER-05-04
- **What:** GitHub Actions badge in README shows "passing" or "failing" status
- **How:** View README.md on GitHub web UI, verify badge image loads and links to workflow
- **Why deferred:** Requires GitHub repository rendering and Actions API
- **Validates at:** After first CI run completes
- **Depends on:** ci.yml workflow executed at least once
- **Target:**
  - Badge image loads (not broken link)
  - Badge shows current status (passing/failing)
  - Badge links to correct workflow runs page
- **Risk if unmet:** No visual CI status in README; badge misconfigured
- **Fallback:** Correct badge URL format, verify repository name in badge path

### D5: Release Workflow Creates Draft GitHub Release — DEFER-05-05
- **What:** release.yml creates a draft release with notes from CHANGELOG
- **How:** Manually trigger release workflow, verify draft release appears
- **Why deferred:** Requires GitHub Release API and workflow execution
- **Validates at:** Manual release workflow trigger after Phase 5
- **Depends on:** Workflow pushed, VERSION tag exists or can be created
- **Target:**
  - Draft release appears in GitHub Releases page
  - Release notes extracted from CHANGELOG.md
  - Release is DRAFT status (not published)
  - Release tag matches VERSION
- **Risk if unmet:** Release automation broken; manual releases required
- **Fallback:** Debug release creation step, verify CHANGELOG parsing logic, check GitHub token permissions

## Ablation Plan

**No ablation plan** — This phase implements CI/CD workflows with no sub-components to isolate. Each workflow is an atomic unit tested independently.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| No CI pipeline | Current state (BASELINE.md) | 0 workflows | BASELINE.md: "CI/CD pipeline: None" |
| Manual version checks | Current release process | Error-prone | No automated version validation |
| No test automation | Current test coverage | 0% automated | BASELINE.md: "Test coverage: 0%" |

Phase 5 transitions from manual quality checks to automated CI gates.

## Evaluation Scripts

**Location of evaluation code:**
```
Sanity checks: Inline bash commands in EVAL.md (no separate script needed)
Proxy metrics: Inline node/bash commands in EVAL.md
Deferred validations: Manual GitHub Actions observation (no script)
```

**How to run full evaluation:**

```bash
# Sanity checks (all must pass)
cd /Users/edward.seo/dev/private/project/harness/GRD

# S1-S2: CI workflow exists and parses
test -f .github/workflows/ci.yml && echo "S1: PASS" || echo "S1: FAIL"
node -e "const yaml=require('yaml'); yaml.parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8')); console.log('S2: PASS')" 2>/dev/null || echo "S2: FAIL"

# S3-S6: CI workflow content checks
grep -q "push:" .github/workflows/ci.yml && grep -q "pull_request:" .github/workflows/ci.yml && echo "S3: PASS" || echo "S3: FAIL"
grep -A3 "matrix:" .github/workflows/ci.yml | grep -q "node-version:" && echo "S4: PASS" || echo "S4: FAIL"
grep -q "npm test" .github/workflows/ci.yml && grep -q "npm audit" .github/workflows/ci.yml && echo "S5: PASS" || echo "S5: FAIL"
grep -A2 "npm run lint" .github/workflows/ci.yml | grep -q "continue-on-error: true" && echo "S6: PASS" || echo "S6: FAIL"

# S7-S10: Release workflow checks
test -f .github/workflows/release.yml && node -e "const yaml=require('yaml'); yaml.parse(require('fs').readFileSync('.github/workflows/release.yml','utf8')); console.log('S7: PASS')" 2>/dev/null || echo "S7: FAIL"
grep -q "workflow_dispatch" .github/workflows/release.yml && ! grep -q "push:" .github/workflows/release.yml && echo "S8: PASS" || echo "S8: FAIL"
grep -q "VERSION" .github/workflows/release.yml && grep -q "plugin.json" .github/workflows/release.yml && grep -q "CHANGELOG" .github/workflows/release.yml && echo "S9: PASS" || echo "S9: FAIL"
grep -q "draft: true" .github/workflows/release.yml && echo "S10: PASS" || echo "S10: FAIL"

# S11-S12: README badge and DEFER resolution
grep -q "actions/workflows/ci.yml/badge.svg" README.md && echo "S11: PASS" || echo "S11: FAIL"
grep "DEFER-02-03" .planning/STATE.md | grep -q "RESOLVED" && echo "S12: PASS" || echo "S12: FAIL"

# Proxy metrics (indicative only)
echo "=== Proxy Metrics ==="
npm ci && npm test && echo "P1: Step sequence OK (test passes)" || echo "P1: Issues detected"

VERSION_FILE=$(cat VERSION)
PLUGIN_VERSION=$(node -e "console.log(require('./.claude-plugin/plugin.json').version)")
[ "$VERSION_FILE" = "$PLUGIN_VERSION" ] && echo "P2: Version validation OK" || echo "P2: Version mismatch"

node -e "const yaml=require('yaml'); const ci=yaml.parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8')); console.log(ci.on && ci.jobs ? 'P3: Schema OK' : 'P3: Schema invalid')"

# Deferred validations
echo "=== Deferred Validations ==="
echo "D1-D5: Require GitHub Actions execution — push workflows to GitHub to validate"
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: CI workflow exists | | | |
| S2: CI YAML valid | | | |
| S3: CI triggers present | | | |
| S4: Node matrix present | | | |
| S5: CI steps present | | | |
| S6: Lint continue-on-error | | | |
| S7: Release workflow valid | | | |
| S8: Manual trigger only | | | |
| S9: Version check present | | | |
| S10: Draft release | | | |
| S11: README badge | | | |
| S12: DEFER-02-03 resolved | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Step sequence | All steps executable | | | |
| P2: Version validation | Versions match | | | |
| P3: YAML schema | Schema valid | | | |

### Ablation Results

N/A — No ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-05-01 | CI workflow executes on GitHub | PENDING | First push to main |
| DEFER-05-02 | Matrix strategy runs all Node versions | PENDING | First CI run |
| DEFER-05-03 | Release workflow validates versions | PENDING | Manual release trigger |
| DEFER-05-04 | CI badge renders in README | PENDING | After first CI run |
| DEFER-05-05 | Release creates draft | PENDING | Manual release trigger |

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM-HIGH

**Justification:**
- **Sanity checks: ADEQUATE** — 12 checks cover all critical workflow elements (triggers, steps, matrix, version validation, badge, deferred resolution)
- **Proxy metrics: MODERATELY EVIDENCED** — Local execution approximates GitHub Actions but cannot replicate runner environment exactly; provides good confidence in script logic
- **Deferred coverage: COMPREHENSIVE** — All 5 deferred validations cover end-to-end workflow execution scenarios that absolutely require GitHub infrastructure

**What this evaluation CAN tell us:**
- Workflow YAML files are syntactically correct and well-formed
- Required workflow elements (triggers, steps, matrix) are present
- Version validation script logic is sound
- Local simulation of CI steps succeeds
- README badge syntax is correct
- DEFER-02-03 resolution is documented

**What this evaluation CANNOT tell us:**
- Whether workflows actually execute successfully on GitHub Actions runners — deferred to DEFER-05-01
- Whether matrix strategy creates 3 parallel jobs — deferred to DEFER-05-02
- Whether version validation fails correctly on mismatch — deferred to DEFER-05-03
- Whether CI badge renders and updates correctly — deferred to DEFER-05-04
- Whether release workflow creates draft releases — deferred to DEFER-05-05
- Whether GitHub Actions environment variables and secrets are handled correctly
- Whether workflows work across different GitHub runner OS versions (ubuntu-latest behavior)

**Recommendation:**
All sanity checks must pass before considering phase complete. Proxy metrics provide useful confidence but are not sufficient alone. Deferred validations should be executed immediately after pushing workflows to GitHub (can be done in Phase 5 or defer to Phase 7 verification milestone). Consider creating a manual test checklist for DEFER-05-01 through DEFER-05-05 to execute during or after Phase 5.

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-15*
