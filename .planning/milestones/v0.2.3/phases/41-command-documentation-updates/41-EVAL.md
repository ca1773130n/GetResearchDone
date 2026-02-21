# Evaluation Plan: Phase 41 — Command & Documentation Updates

**Designed:** 2026-02-21
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Bugfix (cmdInitNewMilestone new-style directory scanning), documentation update (execute-phase.md 4-option completion flow, CLAUDE.md git isolation section)
**Reference papers:** N/A — implementation phase with no research component

## Evaluation Overview

Phase 41 consists of two independent plans addressing different concerns: Plan 01 fixes a bugfix in `lib/context.js` where `cmdInitNewMilestone` fails to scan new-style `milestones/{version}/phases/` directories when computing `suggested_start_phase`, and Plan 02 updates the `commands/execute-phase.md` agent command to use the new 4-option worktree completion flow, and adds a Git Isolation section to `CLAUDE.md`.

Because this phase is a bugfix + documentation update — not a research or ML method implementation — there are no benchmark datasets, no paper metrics, and no proxy metrics with correlation coefficients. Evaluation is straightforward: does the bug get fixed, do the tests prove it, and does the documentation accurately describe the implemented behavior.

The primary evaluation strategy is: (1) unit tests for the bugfix, (2) structural content checks for the documentation changes, and (3) full test suite + lint for regression confidence. No deferred validations are required because all correctness can be verified within the phase.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit tests pass (context.test.js) | Plan 01 must_haves | Direct correctness proof of the bugfix |
| New tests cover new-style scanning | Plan 01 must_haves | Regression prevention for the specific bug |
| No merge_to_milestone or push_and_create_pr in execute-phase.md | Plan 02 must_haves | Absence proves old flow is removed |
| completion_flow step present in execute-phase.md | Plan 02 must_haves | Presence proves new flow is added |
| branching_strategy != none used as condition | Plan 02 must_haves | Field name correctness matches init JSON |
| Git Isolation section in CLAUDE.md | Plan 02 must_haves | Documentation completeness |
| Full test suite passes (npm test) | Quality gate from CLAUDE.md | Zero regressions across all 1,661 tests |
| Lint passes (npm run lint) | Quality gate from CLAUDE.md | Code quality, pre-commit hook requirement |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 10 checks | Basic correctness of code and docs |
| Proxy (L2) | 0 metrics | Not applicable — see rationale |
| Deferred (L3) | 0 validations | All validations achievable within phase |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

---

### Plan 01: cmdInitNewMilestone Bugfix

### S1: Focused unit test pass (context.test.js)

- **What:** All existing tests in `tests/unit/context.test.js` pass with no regressions after the bugfix is applied to `lib/context.js`
- **Command:** `npx jest tests/unit/context.test.js --no-coverage`
- **Expected:** All tests pass, exit code 0, no failures reported
- **Failure means:** The bugfix broke existing behavior in `cmdInitNewMilestone` or adjacent context functions

### S2: New tests cover new-style directory scanning

- **What:** At least 2 new tests exist in `tests/unit/context.test.js` that specifically exercise new-style `milestones/{version}/phases/` directory scanning
- **Command:** `npx jest tests/unit/context.test.js --no-coverage -t "new-style"`
- **Expected:** At least 2 tests matched and pass; exit code 0
- **Failure means:** The new scanning logic is untested — regression risk for future changes

### S3: New-style scan returns correct suggested_start_phase

- **What:** When only new-style directories exist (e.g., `milestones/v0.2.1/phases/36-some-phase/`), `suggested_start_phase` is computed correctly as highest phase number + 1 (37 or greater)
- **Command:** `npx jest tests/unit/context.test.js --no-coverage -t "new-style"`
- **Expected:** Assertions on `suggested_start_phase >= 37` pass
- **Failure means:** The scanning logic is incorrect — new-style directories are not being read

### S4: Old-style scan backward compatibility preserved

- **What:** Old-style `*-phases` directories still contribute to `highestArchivedPhase`
- **Command:** `npx jest tests/unit/context.test.js --no-coverage -t "combines old-style"`
- **Expected:** Test combining old-style phase 10 and new-style phase 36 yields `suggested_start_phase >= 37`
- **Failure means:** The new code broke old-style scanning or the highest-wins logic

### S5: Lint passes on lib/context.js

- **What:** The modified `lib/context.js` introduces no ESLint errors
- **Command:** `npm run lint`
- **Expected:** Exit code 0, zero errors reported; pre-commit hook will enforce this
- **Failure means:** Syntax or style error in the bugfix code — must be fixed before commit

---

### Plan 02: execute-phase.md and CLAUDE.md Documentation Updates

### S6: Old completion steps removed from execute-phase.md

- **What:** The deprecated `merge_to_milestone` and `push_and_create_pr` step names no longer appear in `commands/execute-phase.md`
- **Command:** `grep -c "merge_to_milestone\|push_and_create_pr" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md`
- **Expected:** Output is `0` (zero occurrences)
- **Failure means:** Old flow was not fully replaced; agent will use stale completion instructions

### S7: New completion_flow step is present in execute-phase.md

- **What:** The new `completion_flow` step and `worktree complete` CLI command appear in `commands/execute-phase.md`
- **Command:** `grep -c "completion_flow" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md && grep -c "worktree complete" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md`
- **Expected:** Both return >= 1
- **Failure means:** The new 4-option flow was not written into the command; execute-phase will present wrong UI

### S8: Conditions use correct field name (branching_strategy != none)

- **What:** Step conditions in `execute-phase.md` use `branching_strategy != none` to match the actual init JSON field emitted by `lib/context.js`
- **Command:** `grep -c "branching_strategy != none" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md`
- **Expected:** Returns >= 2 (at least setup_worktree and completion_flow conditions)
- **Failure means:** Conditions use a wrong field name (e.g., `git_enabled`); worktree steps will never execute

### S9: Git Isolation section present in CLAUDE.md

- **What:** `CLAUDE.md` contains a `## Git Isolation` section documenting `git.enabled`, worktree isolation model, and 4 completion options
- **Command:** `grep -c "Git Isolation" /Users/edward.seo/dev/private/project/harness/GetResearchDone/CLAUDE.md && grep -c "git\.enabled\|git.enabled" /Users/edward.seo/dev/private/project/harness/GetResearchDone/CLAUDE.md`
- **Expected:** Both return >= 1
- **Failure means:** Documentation update was missed or partially applied; CLAUDE.md does not describe the git model

### S10: Full test suite passes (regression check)

- **What:** All 1,661+ tests pass after both plans are complete
- **Command:** `npm test`
- **Expected:** All test suites pass, coverage thresholds met per `jest.config.js`, exit code 0
- **Failure means:** The bugfix in `lib/context.js` caused an unexpected regression elsewhere; must investigate before marking phase complete

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

### No Proxy Metrics

**Rationale:** Phase 41 is a bugfix and documentation update, not a research or performance optimization. There are no indirect metrics that meaningfully predict correctness or documentation quality better than the direct checks in Level 1. The unit tests (S1-S4) directly verify the bugfix correctness. The grep checks (S6-S9) directly verify the documentation changes.

Proxy metrics would be appropriate if, for example, the changes affected runtime performance or produced output that correlates with a harder-to-measure quality. Neither applies here.

**Recommendation:** Rely entirely on Level 1 sanity checks. All relevant correctness is verifiable within the phase.

## Level 3: Deferred Validations

No deferred validations are required for Phase 41. All correctness criteria are directly measurable within the phase:

- The bugfix correctness is proven by unit tests (S1-S4)
- The documentation accuracy is proven by structural grep checks (S6-S9) combined with manual review
- Regression safety is proven by the full test suite (S10)

No integration with external systems, future phases, or production data is required to validate this phase.

## Ablation Plan

**No ablation plan** — Phase 41 implements targeted fixes, not a system with decomposable sub-components. Plan 01 is a single additive code block to an existing scan loop. Plan 02 is a documentation rewrite. Neither has sub-components to isolate.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| All tests pass | Full Jest suite before phase | 1,661 tests, all green | STATE.md Performance Metrics |
| Lint passes | ESLint on bin/ and lib/ | 0 errors | CLAUDE.md commands section |
| context.js coverage | Jest coverage threshold for lib/context.js | lines >= 70%, functions >= 60%, branches >= 60% | jest.config.js |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/context.test.js  — unit tests for cmdInitNewMilestone bugfix
```

**How to run full evaluation:**
```bash
# Plan 01 checks
npx jest tests/unit/context.test.js --no-coverage
npm run lint

# Plan 02 checks
grep -c "merge_to_milestone\|push_and_create_pr" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md
grep -c "completion_flow" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md
grep -c "worktree complete" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md
grep -c "branching_strategy != none" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/execute-phase.md
grep -c "Git Isolation" /Users/edward.seo/dev/private/project/harness/GetResearchDone/CLAUDE.md
grep -c "git\.enabled" /Users/edward.seo/dev/private/project/harness/GetResearchDone/CLAUDE.md

# Full regression check
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: context.test.js pass | [PASS/FAIL] | | |
| S2: new-style tests exist | [PASS/FAIL] | | |
| S3: correct suggested_start_phase | [PASS/FAIL] | | |
| S4: old-style backward compat | [PASS/FAIL] | | |
| S5: lint passes | [PASS/FAIL] | | |
| S6: old steps removed | [PASS/FAIL] | count= | |
| S7: completion_flow + worktree complete | [PASS/FAIL] | count= | |
| S8: branching_strategy != none | [PASS/FAIL] | count= | |
| S9: Git Isolation in CLAUDE.md | [PASS/FAIL] | count= | |
| S10: full npm test | [PASS/FAIL] | tests= | |

### Proxy Results

No proxy metrics — see Level 2 rationale.

### Ablation Results

No ablation plan applicable.

### Deferred Status

No deferred validations.

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 10 checks covering both plans. Each check is a direct, executable verification of a stated requirement. The unit tests (S1-S4) provide machine-verified proof of bugfix correctness, and the grep checks (S6-S9) provide structural verification of documentation changes.
- Proxy metrics: Not applicable — direct verification is available for all requirements.
- Deferred coverage: N/A — no deferred items. Everything is verifiable within the phase.

**What this evaluation CAN tell us:**
- Whether the bugfix makes `cmdInitNewMilestone` correctly scan new-style milestone directories
- Whether old-style scanning backward compatibility is preserved
- Whether `execute-phase.md` reflects the actual 4-option completion flow available via `worktree complete --action`
- Whether `CLAUDE.md` documents the git isolation model that was implemented in phases 38-39
- Whether the changes introduce any regressions in the existing 1,661-test suite

**What this evaluation CANNOT tell us:**
- Whether the documentation in `execute-phase.md` is clear enough for an agent to execute correctly in production (requires real-world `/grd:execute-phase` run — addressed by end-to-end product verification in PRODUCT-QUALITY.md)
- Whether the `suggested_start_phase` logic is correct for all possible milestone directory structures beyond what the unit tests cover (mitigated by broad test coverage in S1-S4)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-21*
