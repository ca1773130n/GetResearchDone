---
phase: 22
type: eval-plan
verification_level: proxy
---

# Evaluation Plan: Phase 22 — Execute-Phase Branching Fix

## Overview

This phase adds `base_branch` support to the execute-phase workflow, ensuring phase branches always fork from the latest base branch (default "main") rather than from whatever branch is currently active. The implementation spans config defaults, context output, command template, and test coverage.

## Tier 1: Sanity (< 10 seconds)

Quick structural and syntactic checks that verify the changes are present and well-formed.

### S1: Config Default Presence
**Metric:** `loadConfig` returns `base_branch` field
**Command:**
```bash
node -e "const {loadConfig} = require('./lib/utils'); const c = loadConfig('.'); console.log('base_branch:', c.base_branch);"
```
**Target:** Output contains `base_branch: main`
**Pass Threshold:** Field exists with default value "main"

### S2: Context Output Structure
**Metric:** `cmdInitExecutePhase` output includes `base_branch` field
**Command:**
```bash
node bin/grd-tools.js init execute-phase 22 --raw 2>/dev/null | node -e "process.stdin.setEncoding('utf8'); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const r=JSON.parse(d); console.log('base_branch:', r.base_branch);})"
```
**Target:** Output shows `base_branch: main` (or `base_branch: null` if branching is "none")
**Pass Threshold:** Field exists in JSON output

### S3: Template Syntax Check
**Metric:** Command template contains base_branch references
**Command:**
```bash
grep -c "base_branch" commands/execute-phase.md
```
**Target:** At least 3 occurrences (in parse line, checkout step, pull step)
**Pass Threshold:** ≥ 3 matches

### S4: No Syntax Errors in Modified Files
**Metric:** Node.js can parse all modified JavaScript files
**Command:**
```bash
node -c lib/utils.js && node -c lib/context.js && node -c tests/unit/context.test.js
```
**Target:** Exit code 0 for all files
**Pass Threshold:** All files parse without syntax errors

### S5: Test File Structure
**Metric:** Test file contains new base_branch test cases
**Command:**
```bash
grep -c "base_branch" tests/unit/context.test.js
```
**Target:** At least 6 occurrences (3 tests × ~2 references each)
**Pass Threshold:** ≥ 6 matches

## Tier 2: Proxy (< 2 minutes)

Automated functional tests and regression checks that verify behavior without requiring live git operations.

### P1: base_branch Unit Tests Pass
**Metric:** All 3 new base_branch tests pass
**Command:**
```bash
npx jest tests/unit/context.test.js --testNamePattern="base_branch" --verbose
```
**Target:**
- Test 1: "includes base_branch when branching_strategy is phase" → PASS
- Test 2: "base_branch is null when branching_strategy is none" → PASS
- Test 3: "base_branch reads custom value from config" → PASS

**Pass Threshold:** 3/3 tests pass (100%)

### P2: Context Test Suite Regression
**Metric:** All existing cmdInitExecutePhase tests still pass
**Command:**
```bash
npx jest tests/unit/context.test.js --testNamePattern="cmdInitExecutePhase" --verbose
```
**Target:** All tests in describe block pass (includes both existing + new tests)
**Pass Threshold:** 100% pass rate, 0 failures

### P3: Full Test Suite Regression
**Metric:** All unit and integration tests pass
**Command:**
```bash
npx jest --passWithNoTests 2>&1 | tail -5
```
**Target:**
- Test Suites: All passed
- Tests: All passed
- No snapshots failed
- No regressions in any test file

**Pass Threshold:**
- ≥ 1,357 tests pass (current baseline from success criteria)
- 0 failures
- 0 test suite failures

### P4: Config Schema Validation
**Metric:** Config with base_branch field validates correctly
**Command:**
```bash
cat > /tmp/test-config.json << 'EOF'
{
  "git": {
    "branching_strategy": "phase",
    "base_branch": "develop"
  }
}
EOF
node -e "const {loadConfig} = require('./lib/utils'); const c = loadConfig('/tmp'); console.log('Loaded base_branch:', c.base_branch); process.exit(c.base_branch === 'develop' ? 0 : 1);"
```
**Target:** Loaded base_branch: develop, exit code 0
**Pass Threshold:** Custom base_branch value loaded successfully

### P5: Context JSON Completeness
**Metric:** Init context includes all required fields per requirements
**Command:**
```bash
node bin/grd-tools.js init execute-phase 22 --raw 2>/dev/null | node -e "
process.stdin.setEncoding('utf8');
let d='';
process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const r=JSON.parse(d);
  const has_base = 'base_branch' in r;
  const has_strat = 'branching_strategy' in r;
  const has_name = 'branch_name' in r;
  console.log('base_branch:', has_base);
  console.log('branching_strategy:', has_strat);
  console.log('branch_name:', has_name);
  process.exit(has_base && has_strat && has_name ? 0 : 1);
});"
```
**Target:** All three fields present, exit code 0
**Pass Threshold:** base_branch, branching_strategy, and branch_name all present in output

### P6: Template Edge Case Coverage
**Metric:** Command template mentions all 4 edge case handlers
**Command:**
```bash
grep -E "(uncommitted changes|already on base|Could not checkout|Pull failed)" commands/execute-phase.md | wc -l
```
**Target:** 4 matches (one per edge case)
**Pass Threshold:** All 4 edge case warnings present in template

## Tier 3: Deferred (Integration Phase)

End-to-end validation requiring real git operations in a live test repository. These checks verify actual branching behavior with various git scenarios.

### D1: Clean Checkout and Pull
**Scenario:** Execute-phase with no uncommitted changes, base_branch exists, remote accessible
**Setup:**
1. Create test repo with remote
2. Create phase branch, commit work, complete phase
3. Add commits to main on remote
4. Run execute-phase for next phase

**Verification:**
```bash
# In test repo after execute-phase runs:
git branch --show-current  # Should be grd/v1.0/XX-phase-name
git log --oneline -1 origin/main..HEAD  # Should show 0 commits (branched from latest main)
git diff main..HEAD  # Should be empty (just branched, no work yet)
```
**Target:**
- New phase branch created from latest main
- Includes all commits from remote/main that weren't in previous branch

**Pass Threshold:** Phase branch successfully forks from updated main

### D2: Uncommitted Changes Warning
**Scenario:** Execute-phase with uncommitted changes in working directory
**Setup:**
1. Modify a file without committing
2. Run execute-phase

**Verification:**
```bash
# Workflow output should contain:
grep -q "Uncommitted changes detected" execute-phase.log
# Branch creation should proceed from current branch:
git branch --show-current  # Should be new phase branch despite warning
git status --porcelain  # Should show uncommitted changes preserved
```
**Target:**
- Warning message displayed
- Execution continues on current branch
- Uncommitted changes preserved

**Pass Threshold:** No crash, graceful warning, work preserved

### D3: Already On Base Branch
**Scenario:** Execute-phase when already on main
**Setup:**
1. Check out main manually
2. Run execute-phase

**Verification:**
```bash
# Workflow should skip checkout step, only pull:
grep -q "Skipping checkout" execute-phase.log || git reflog | grep -q "checkout: moving from main to main" | grep -qv .
# Should pull and create branch:
git branch --show-current  # Should be new phase branch
```
**Target:**
- Checkout step skipped
- Pull executed
- Branch created successfully

**Pass Threshold:** No redundant checkout, clean branch creation

### D4: Offline / No Remote
**Scenario:** Execute-phase with no network connectivity or no remote configured
**Setup:**
1. Remove remote: `git remote remove origin` OR block network
2. Run execute-phase

**Verification:**
```bash
# Workflow should warn but continue:
grep -q "Pull failed.*offline" execute-phase.log
# Branch still created from local main:
git branch --show-current  # Should be new phase branch
git rev-parse HEAD^  # Should equal local main commit
```
**Target:**
- Pull failure handled gracefully
- Warning displayed
- Branch created from local base_branch

**Pass Threshold:** No crash, warning shown, execution continues

### D5: Pull Conflict
**Scenario:** Execute-phase when pull would create merge conflict
**Setup:**
1. Create conflicting commits on local main vs remote main
2. Run execute-phase

**Verification:**
```bash
# Workflow should detect conflict and warn:
grep -q "Pull failed.*conflict" execute-phase.log
# Should continue from local state:
git branch --show-current  # Should be new phase branch
git status  # Should show clean working tree (no merge in progress)
```
**Target:**
- Conflict detected without manual intervention required
- Execution continues safely
- No partial merge state left behind

**Pass Threshold:** No crash, no broken git state, warning displayed

### D6: Custom base_branch Configuration
**Scenario:** Execute-phase with base_branch set to "develop" in config
**Setup:**
1. Configure `git.base_branch: "develop"` in config.json
2. Ensure develop branch exists with different commits than main
3. Run execute-phase

**Verification:**
```bash
# Should checkout and pull develop, not main:
git reflog | grep "checkout: moving from .* to develop"
# Phase branch should fork from develop:
git merge-base HEAD develop  # Should equal develop's HEAD
git merge-base HEAD main  # Should NOT equal main's HEAD if main has diverged
```
**Target:**
- Respects custom base_branch config
- Checks out develop instead of main
- Phase branch created from develop

**Pass Threshold:** Custom base branch used correctly throughout workflow

### D7: Full Execute-Phase Integration
**Scenario:** Complete execute-phase run after milestone completion (the original bug scenario)
**Setup:**
1. Complete a milestone (all phases done, on milestone branch)
2. Merge milestone to main (remote)
3. Without manually switching branches, start next phase with execute-phase

**Verification:**
```bash
# Starting from milestone branch (e.g., grd/v1.0/milestone-name):
echo "Starting branch: $(git branch --show-current)"
# Run execute-phase for phase 1 of next milestone
# Should automatically:
# 1. Checkout main
# 2. Pull latest
# 3. Create new phase branch from updated main
git branch --show-current  # Should be grd/v2.0/01-phase-name
git log --oneline main..HEAD  # Should show 0 commits (just branched)
git log --oneline origin/main..main  # Should show 0 commits (just pulled)
```
**Target:**
- Workflow automatically recovers from milestone branch
- Syncs with remote main
- New phase starts from clean, updated base

**Pass Threshold:** Original bug scenario resolved, no manual intervention needed

## Pass/Fail Summary

| ID | Check | Type | Target | Threshold | Tier |
|----|-------|------|--------|-----------|------|
| S1 | Config default presence | Structural | loadConfig returns base_branch | Field exists = "main" | 1 |
| S2 | Context output structure | Structural | cmdInitExecutePhase includes base_branch | Field exists in JSON | 1 |
| S3 | Template syntax | Structural | Template contains base_branch refs | ≥3 matches | 1 |
| S4 | No syntax errors | Parse | Modified files parse | Exit code 0 | 1 |
| S5 | Test file structure | Structural | Tests contain base_branch cases | ≥6 matches | 1 |
| P1 | base_branch unit tests | Functional | All 3 new tests pass | 3/3 pass (100%) | 2 |
| P2 | Context test regression | Functional | All cmdInitExecutePhase tests pass | 100% pass, 0 fail | 2 |
| P3 | Full test suite regression | Regression | All tests pass | ≥1357 pass, 0 fail | 2 |
| P4 | Config schema validation | Functional | Custom base_branch loads | Exit code 0 | 2 |
| P5 | Context JSON completeness | Functional | All branching fields present | All 3 fields exist | 2 |
| P6 | Template edge case coverage | Structural | All 4 edge cases documented | 4/4 present | 2 |
| D1 | Clean checkout and pull | E2E | Branch from latest main | Branch includes remote commits | 3 |
| D2 | Uncommitted changes warning | E2E | Graceful warning + continue | No crash, changes preserved | 3 |
| D3 | Already on base branch | E2E | Skip redundant checkout | No duplicate checkout | 3 |
| D4 | Offline / no remote | E2E | Graceful offline handling | Warning + local branch creation | 3 |
| D5 | Pull conflict | E2E | Conflict detection + recovery | No crash, no broken git state | 3 |
| D6 | Custom base_branch config | E2E | Respect config override | Checkout develop not main | 3 |
| D7 | Full execute-phase integration | E2E | Original bug scenario | Auto-recovery from milestone branch | 3 |

## Execution Plan

### In-Phase (During Phase 22 Execution)
Run Tier 1 (Sanity) and Tier 2 (Proxy) checks:
```bash
# Quick validation after implementation:
npm run eval:phase-22
# Or manually:
./scripts/eval-tier1-phase22.sh
./scripts/eval-tier2-phase22.sh
```

**Phase completion criteria:**
- All Tier 1 checks PASS (5/5)
- All Tier 2 checks PASS (6/6)
- Tier 3 checks documented with setup instructions for integration phase

### Integration Phase (Milestone Completion)
Run all Tier 3 (Deferred) end-to-end tests:
```bash
./scripts/eval-tier3-phase22.sh
```

**Integration pass criteria:**
- All Tier 3 checks PASS (7/7)
- No regressions from Tier 1 or Tier 2 re-runs

## Success Criteria Summary

**Minimum viable (phase completion):**
- Tier 1: 5/5 PASS (100%)
- Tier 2: 6/6 PASS (100%)
- Tier 3: Documented (not executed)

**Full success (integration):**
- Tier 1: 5/5 PASS (100%)
- Tier 2: 6/6 PASS (100%)
- Tier 3: 7/7 PASS (100%)

**Critical requirements (REQ-38, REQ-39):**
- REQ-38: Verified by P5 (base_branch in init output) + D1, D6, D7 (actual checkout behavior)
- REQ-39: Verified by D2, D3, D4, D5 (all 4 edge cases + graceful failure modes)

## Notes

1. **Verification Level:** This phase uses "proxy" verification, meaning Tier 3 checks are deferred but explicitly planned here for execution during integration.

2. **Test Execution:** Tier 2 tests (P1-P6) run automatically via `npx jest` as part of CI. Tier 3 tests (D1-D7) require manual execution in test git repositories during integration phase.

3. **Edge Case Priority:** All 4 edge cases (REQ-39) are equally critical. A failure in any Tier 3 D2-D5 check is considered a blocking issue even though this is "proxy" verification level.

4. **Baseline Tracking:** P3 establishes new test count baseline (1357 + 3 new = 1360 tests expected after this phase).

5. **Integration Checklist:** Before marking integration complete, run `./scripts/eval-tier3-phase22.sh` and document results in integration VERIFICATION.md.
