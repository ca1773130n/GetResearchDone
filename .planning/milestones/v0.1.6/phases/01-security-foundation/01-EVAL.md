# Evaluation Plan: Phase 1 — Security Foundation

**Designed:** 2026-02-12
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Infrastructure setup (not research-based)
**Reference papers:** N/A — Infrastructure phase

## Evaluation Overview

Phase 1 establishes project infrastructure files and version synchronization across the GRD codebase. This is a foundational phase that creates `.gitignore` (security exclusions), `package.json` (Node.js manifest), `.editorconfig` (formatting standards), and syncs version strings across VERSION, plugin.json, package.json, and CHANGELOG.md to 0.0.4.

Unlike research phases that require proxy metrics and deferred validations, infrastructure phases are deterministic and fully verifiable in-phase through automated checks. Success is binary: files either exist with correct content, or they don't.

This evaluation plan uses primarily Tier 1 (Sanity) checks because infrastructure correctness can be validated immediately through file system inspection, pattern matching, and JSON validation. No runtime behavior or integration is required.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| File existence | PLAN.md must_haves.artifacts | Infrastructure files must exist |
| Pattern presence in .gitignore | ROADMAP.md success criteria | Security baseline requires specific exclusions |
| JSON validity | Standard practice | package.json and plugin.json must be parseable |
| Version consistency | ROADMAP.md success criteria | Version drift causes confusion and errors |
| Node.js engine constraint | PROJECT.md constraints | Plugin must declare supported Node versions |
| Config cleanup | ROADMAP.md success criteria | Deprecated keys must be removed |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 9 | File existence, content patterns, JSON validity, version consistency |
| Proxy (L2) | 0 | No proxy metrics — all checks are direct verification |
| Deferred (L3) | 0 | No deferred validations — infrastructure is self-contained |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: File Existence Check
- **What:** All 5 target files exist in expected locations
- **Command:** `ls .gitignore .editorconfig package.json VERSION .claude-plugin/plugin.json`
- **Expected:** All files exist, no "No such file or directory" errors
- **Failure means:** Core infrastructure files missing — phase did not complete

### S2: .gitignore Pattern Coverage
- **What:** .gitignore contains all required security exclusion patterns
- **Command:**
```bash
patterns=(".env" "node_modules/" ".DS_Store" "excalidraw.md" "grd-local-patches/" "*.key" "*.pem" "credentials" "secrets")
missing=0
for p in "${patterns[@]}"; do
  grep -q "$p" .gitignore || { echo "Missing: $p"; missing=1; }
done
exit $missing
```
- **Expected:** Exit code 0 (all patterns found)
- **Failure means:** Security baseline incomplete — sensitive files may enter git

### S3: .editorconfig Format Settings
- **What:** .editorconfig specifies 2-space indent, LF line endings, UTF-8
- **Command:**
```bash
grep -q "indent_size = 2" .editorconfig && \
grep -q "end_of_line = lf" .editorconfig && \
grep -q "charset = utf-8" .editorconfig
```
- **Expected:** All three patterns found (exit code 0)
- **Failure means:** Editor configuration incomplete or incorrect

### S4: package.json Validity
- **What:** package.json is valid JSON and parseable by Node.js
- **Command:** `node -e "require('./package.json')"`
- **Expected:** No output, exit code 0
- **Failure means:** Malformed JSON — npm commands will fail

### S5: package.json Engine Constraint
- **What:** package.json declares `engines.node >= 18` (from PROJECT.md)
- **Command:** `node -e "const p = require('./package.json'); if (p.engines && p.engines.node === '>=18') process.exit(0); else process.exit(1);"`
- **Expected:** Exit code 0
- **Failure means:** Node version constraint missing or incorrect

### S6: package.json Script Placeholders
- **What:** package.json has test, lint, format, format:check scripts
- **Command:** `node -e "const p = require('./package.json'); const scripts = Object.keys(p.scripts || {}); if (scripts.includes('test') && scripts.includes('lint') && scripts.includes('format') && scripts.includes('format:check')) process.exit(0); else process.exit(1);"`
- **Expected:** Exit code 0
- **Failure means:** Script placeholders missing — later phases expect these

### S7: Version Consistency Across All Files
- **What:** VERSION, plugin.json, package.json, CHANGELOG.md all reference 0.0.4
- **Command:**
```bash
version_file=$(cat VERSION | tr -d '\n')
version_plugin=$(node -e "console.log(require('./.claude-plugin/plugin.json').version)")
version_package=$(node -e "console.log(require('./package.json').version)")
changelog_has=$(grep -q '\[0.0.4\]' CHANGELOG.md && echo "0.0.4" || echo "missing")

if [ "$version_file" = "0.0.4" ] && [ "$version_plugin" = "0.0.4" ] && [ "$version_package" = "0.0.4" ] && [ "$changelog_has" = "0.0.4" ]; then
  exit 0
else
  echo "VERSION: $version_file, plugin.json: $version_plugin, package.json: $version_package, CHANGELOG: $changelog_has"
  exit 1
fi
```
- **Expected:** Exit code 0 (all four sources show 0.0.4)
- **Failure means:** Version drift — confusion about current release

### S8: config.json No github_integration Key
- **What:** .planning/config.json does not contain deprecated `github_integration` key
- **Command:** `grep -q '"github_integration"' .planning/config.json; [ $? -eq 1 ]`
- **Expected:** Exit code 0 (grep returns 1 because key is absent)
- **Failure means:** Deprecated config key not removed

### S9: package.json private Field
- **What:** package.json has `"private": true` to prevent accidental npm publish
- **Command:** `node -e "const p = require('./package.json'); if (p.private === true) process.exit(0); else process.exit(1);"`
- **Expected:** Exit code 0
- **Failure means:** Missing safety guard against accidental publish

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

### No Proxy Metrics

**Rationale:** Infrastructure phase with deterministic success criteria. All verification is direct (file existence, pattern matching, JSON parsing). There is no runtime behavior to approximate and no integration dependencies.

**Recommendation:** Sanity checks (Level 1) provide complete verification for this phase.

## Level 3: Deferred Validations

### No Deferred Validations

**Rationale:** All artifacts created in this phase are self-contained infrastructure files. They do not require integration with other components to validate.

**Future usage of these artifacts:**
- `.gitignore` will be used by git (validated immediately on `git status`)
- `package.json` will be used by npm in Phase 4 (test suite) — if malformed, npm will error immediately
- `.editorconfig` will be used by editors (no verification needed — editor UX only)
- Version consistency will be checked by CI in Phase 5 (CI/CD)

These are not deferred validations because they are not GRD-specific metrics that require later phases to measure. They are standard tool usage that will naturally surface errors if this phase fails.

## Ablation Plan

**No ablation plan** — This phase implements infrastructure setup with no sub-components to isolate. Each file serves an independent purpose:
- .gitignore (security)
- .editorconfig (formatting)
- package.json (npm manifest)
- VERSION sync (release management)

Removing any one file does not help evaluate the others.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Current state | No .gitignore, .editorconfig, package.json | 0 files exist | Verified by ls |
| VERSION | Currently 0.0.3 | Must change to 0.0.4 | Current VERSION file |
| plugin.json | Currently 0.0.3 | Must change to 0.0.4 | Current plugin.json |

## Evaluation Scripts

**Location of evaluation code:**
All evaluation is performed via inline bash commands (see Sanity checks above). No separate scripts required.

**How to run full evaluation:**
```bash
# Run all sanity checks in sequence
echo "S1: File existence"
ls .gitignore .editorconfig package.json VERSION .claude-plugin/plugin.json

echo "S2: .gitignore patterns"
patterns=(".env" "node_modules/" ".DS_Store" "excalidraw.md" "grd-local-patches/" "*.key" "*.pem" "credentials" "secrets")
for p in "${patterns[@]}"; do grep -q "$p" .gitignore || echo "Missing: $p"; done

echo "S3: .editorconfig settings"
grep "indent_size = 2" .editorconfig && grep "end_of_line = lf" .editorconfig && grep "charset = utf-8" .editorconfig

echo "S4: package.json validity"
node -e "require('./package.json')"

echo "S5: package.json engine"
node -e "const p = require('./package.json'); console.log('engines.node:', p.engines.node)"

echo "S6: package.json scripts"
node -e "const p = require('./package.json'); console.log('scripts:', Object.keys(p.scripts).join(', '))"

echo "S7: Version consistency"
echo "VERSION: $(cat VERSION)"
echo "plugin.json: $(node -e "console.log(require('./.claude-plugin/plugin.json').version)")"
echo "package.json: $(node -e "console.log(require('./package.json').version)")"
grep '\[0.0.4\]' CHANGELOG.md

echo "S8: config.json cleanup"
grep '"github_integration"' .planning/config.json || echo "Key absent (correct)"

echo "S9: package.json private"
node -e "const p = require('./package.json'); console.log('private:', p.private)"
```

**Automated verification:**
```bash
# Use grd-tools verify commands (to be created in Phase 3)
# For now, manual verification via commands above
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: File existence | [ ] PASS / [ ] FAIL | | |
| S2: .gitignore patterns | [ ] PASS / [ ] FAIL | | |
| S3: .editorconfig settings | [ ] PASS / [ ] FAIL | | |
| S4: package.json validity | [ ] PASS / [ ] FAIL | | |
| S5: package.json engine | [ ] PASS / [ ] FAIL | | |
| S6: package.json scripts | [ ] PASS / [ ] FAIL | | |
| S7: Version consistency | [ ] PASS / [ ] FAIL | | |
| S8: config.json cleanup | [ ] PASS / [ ] FAIL | | |
| S9: package.json private | [ ] PASS / [ ] FAIL | | |

### Proxy Results

N/A — No proxy metrics for this phase.

### Ablation Results

N/A — No ablation plan for this phase.

### Deferred Status

N/A — No deferred validations for this phase.

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: ADEQUATE — 9 checks cover all must_haves.artifacts and must_haves.truths from PLAN.md
- Proxy metrics: N/A — Not applicable for infrastructure phase
- Deferred coverage: N/A — All verification can be done in-phase

**What this evaluation CAN tell us:**
- All required files exist
- All required patterns/settings are present in files
- All files are valid (JSON parses, expected content structure)
- Version is synchronized across all version-bearing files
- Deprecated config keys are removed

**What this evaluation CANNOT tell us:**
- Whether `.gitignore` actually prevents git from tracking files (validated by git's own behavior)
- Whether editors respect `.editorconfig` (editor-specific, not testable here)
- Whether npm will work correctly with package.json (tested in Phase 4 when npm is used)
- Whether version 0.0.4 is correct per semver (human judgment — CHANGELOG.md justifies this)

**These limitations are acceptable** because:
1. Git/editor/npm behavior is their own responsibility, not ours to test
2. Version correctness is a product decision (documented in CHANGELOG), not a technical validation
3. Phase 4 (test suite) will exercise npm with this package.json, providing implicit validation

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-12*
