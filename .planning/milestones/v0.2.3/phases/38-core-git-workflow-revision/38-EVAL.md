# Evaluation Plan: Phase 38 — Core Git Workflow Revision

**Designed:** 2026-02-21
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Config schema consolidation, project-local worktree paths, .gitignore injection, milestone branch helpers, strategy-aware PR targeting, context output updates
**Reference papers:** N/A — pure infrastructure/refactoring phase

## Evaluation Overview

Phase 38 is an infrastructure refactoring phase with no experimental components and no ML metrics. It implements two plans across two waves: Plan 01 consolidates the git config schema, moves worktree paths from `/tmp/` to project-local `.worktrees/`, adds `.gitignore` injection, and introduces milestone branch helpers; Plan 02 updates the context output layer (`cmdInitExecutePhase`, `buildParallelContext`) to emit the new config shape and project-local paths.

Evaluation is entirely behavioral: does the refactored code produce the correct outputs, pass all existing tests without regression, and satisfy the new behaviors required by REQ-70, REQ-71, and REQ-75? There is no experimental hypothesis to validate and no proxy metric that approximates a real-world quality measure. The meaningful question is binary — does it work correctly?

The deferred validation captures the one thing that cannot be tested at this phase boundary: the end-to-end execute-phase workflow consuming the new context shape to create worktrees in `.worktrees/` and run a real phase execution. That validation belongs to Phase 39.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test suite pass count (1,633 baseline) | STATE.md cumulative total | Zero-regression gate for refactoring |
| Affected test file counts | Plans 01 and 02 must_haves | Verify new behaviors added at unit level |
| Lint error count | eslint.config.js | Enforced by pre-commit hook; must be zero |
| Config migration correctness | REQ-75 | Core deliverable for this phase |
| .gitignore injection behavior | REQ-71 | Core deliverable for this phase |
| Worktree path prefix | REQ-71 | Changed from `/tmp/grd-worktree-*` to `.worktrees/` |
| `createMilestoneBranch` / `resolveTargetBranch` correctness | REQ-70 | New helpers must work for Phase 39 |
| `cmdInitExecutePhase` output shape | Plan 02 must_haves | Context layer must emit new fields |
| `buildParallelContext` output shape | Plan 02 must_haves | Parallel layer must use project-local paths |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 9 checks | Functionality, regression, and correctness verification |
| Proxy (L2) | 0 metrics | No meaningful proxy exists for infrastructure refactoring |
| Deferred (L3) | 1 validation | Full execute-phase workflow with real worktree creation |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Full test suite — zero regressions

- **What:** All 1,633 existing tests continue to pass after refactoring
- **Command:** `npx jest --no-coverage 2>&1 | tail -6`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 1,633 and zero failures
- **Failure means:** A regression was introduced in `lib/utils.js`, `lib/worktree.js`, `lib/context.js`, or `lib/parallel.js`; must be fixed before phase is complete

### S2: utils.test.js — loadConfig git.* nested section

- **What:** New tests for `loadConfig` reading from the nested `git` section, backward-compat precedence, and `worktree_dir` default
- **Command:** `npx jest tests/unit/utils.test.js --no-coverage 2>&1 | tail -5`
- **Expected:** Tests >= 90 passed (baseline: 87), zero failures — the 3+ new tests for git.* section must be present and passing
- **Failure means:** `loadConfig` does not correctly read the nested `git` section or `worktree_dir` default is missing

### S3: worktree.test.js — project-local paths, .gitignore, milestone helpers

- **What:** All existing worktree tests updated to expect `.worktrees/` paths; new tests for `.gitignore` injection (create, append, idempotency), `createMilestoneBranch` (create, error on wrong branch, idempotency), and `resolveTargetBranch` (phase -> base_branch, milestone -> milestone branch)
- **Command:** `npx jest tests/unit/worktree.test.js --no-coverage 2>&1 | tail -5`
- **Expected:** Tests >= 42 passed (baseline: 32), zero failures
- **Failure means:** Worktree path change broke existing tests OR new helper functions are absent/incorrect

### S4: context.test.js — updated output shape

- **What:** Existing `worktree_path` test updated to expect `.worktrees/` path; new tests for `worktree_dir`, `target_branch`, and `milestone_branch` fields
- **Command:** `npx jest tests/unit/context.test.js --no-coverage 2>&1 | tail -5`
- **Expected:** Tests >= 49 passed (baseline: 46), zero failures
- **Failure means:** `cmdInitExecutePhase` output shape is incorrect or old tmpdir-based assertions were not replaced

### S5: parallel.test.js — project-local worktree paths in per-phase context

- **What:** Existing `worktree_path` assertion updated to check `.worktrees` instead of tmpdir; new `target_branch` field present in per-phase context
- **Command:** `npx jest tests/unit/parallel.test.js --no-coverage 2>&1 | tail -5`
- **Expected:** Tests >= 34 passed (baseline: 32), zero failures
- **Failure means:** `buildParallelContext` still emits tmpdir-based paths or `target_branch` field is missing

### S6: Lint — zero errors

- **What:** ESLint passes on `bin/` and `lib/` with no errors
- **Command:** `npm run lint 2>&1`
- **Expected:** No output after the lint invocation line (exit code 0)
- **Failure means:** Unused variable, undefined reference (`generateSlugInternal`, `resolveTargetBranch`), or style violation introduced during implementation; pre-commit hook will also catch this

### S7: config.json migrated to nested git section

- **What:** `.planning/config.json` has a `git` nested section containing `branching_strategy`, `worktree_dir`, `base_branch`, `phase_branch_template`, and `milestone_branch_template`; top-level `branching_strategy`, `phase_branch_template`, and `milestone_branch_template` keys are removed
- **Command:** `node -e "const c = require('./.planning/config.json'); console.log(JSON.stringify(c.git, null, 2)); console.log('top-level branching_strategy:', c.branching_strategy);" 2>&1`
- **Expected:** `git` section printed with all five fields; `top-level branching_strategy: undefined`
- **Failure means:** Config migration in Task 1 of Plan 01 was not applied

### S8: worktree_path is project-local (not /tmp/)

- **What:** `cmdInitExecutePhase` output contains a `worktree_path` that starts with the project directory, not the system temp directory
- **Command:** `node -e "const {captureOutput}=require('./tests/helpers/setup'); const {cmdInitExecutePhase}=require('./lib/context'); const {stdout}=captureOutput(()=>cmdInitExecutePhase(process.cwd(),'38',new Set(),false)); const r=JSON.parse(stdout); console.log('worktree_path:', r.worktree_path); console.log('starts with cwd:', r.worktree_path && r.worktree_path.includes('.worktrees'));" 2>&1`
- **Expected:** `worktree_path` contains `.worktrees` and does NOT contain `grd-worktree-`
- **Failure means:** Plan 02 Task 1 was not applied to `cmdInitExecutePhase`

### S9: integration test suite still passes

- **What:** The `worktree-parallel-e2e.test.js` integration test suite (25 tests) still passes after the refactoring
- **Command:** `npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage 2>&1 | tail -5`
- **Expected:** `Tests: 25 passed, 25 total` (or more if new integration tests are added)
- **Failure means:** The integration layer relies on path patterns or export shapes that changed; update integration tests to match new conventions

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Phase 39.

## Level 2: Proxy Metrics

### No Proxy Metrics

**Rationale:** This phase is a pure infrastructure refactoring. There is no experimental method being introduced, no quality axis to approximate, and no ML metric that applies. The only meaningful evaluation is behavioral correctness — does the code do what the requirements say? This is fully captured by the sanity checks (test suite pass/fail, lint, config inspection). Inventing a proxy metric (e.g., "code coverage percentage") that does not correlate with the specific correctness requirements of this refactoring would create false confidence.

**Recommendation:** Rely entirely on Level 1 sanity checks. The per-file coverage thresholds enforced by `jest.config.js` (utils.js: 85% lines, worktree.js: no threshold set, context.js: 70% lines) serve as passive coverage gates — they will fail the test run if coverage drops below established floors, which is sufficient for an infrastructure phase.

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration with Phase 39.

### D1: End-to-end execute-phase workflow with project-local worktrees — DEFER-38-01

- **What:** A real phase execution that uses the `cmdInitExecutePhase` context output to create a worktree in `.worktrees/`, execute work inside it, and complete (merge/PR/keep/discard). Verifies that the new context shape is consumed correctly by the command template and that the worktree appears in the right directory on disk.
- **How:** Run `/grd:execute-phase` on a real test phase with `branching_strategy: phase` configured; verify `.worktrees/{milestone}-{phase}` directory is created, `.gitignore` contains `.worktrees/`, and worktree cleanup leaves the directory as expected per completion option.
- **Why deferred:** The execute-phase command template itself is Phase 39's deliverable. Phase 38 provides the config/helper layer; Phase 39 adds the caller-level guard and completion flow. Without Phase 39, there is no execute-phase command that reads the new context fields.
- **Validates at:** Phase 39 (core-completion-flow) completion
- **Depends on:** Phase 39 `execute-phase` command consuming `worktree_dir`, `target_branch`, and `milestone_branch` from `cmdInitExecutePhase` output
- **Target:** Worktree created at `{project-root}/.worktrees/{milestone}-{phase}`, `.gitignore` updated, worktree removed after merge or discard
- **Risk if unmet:** The context shape emitted by Phase 38 may not match what Phase 39's command template expects; this would require a targeted fix at the integration boundary before execute-phase is usable with worktrees
- **Fallback:** Align the context field names between Plan 02 output and Phase 39 command template via a follow-up fix; the refactoring itself is low-risk since tests verify the output shape

## Ablation Plan

**No ablation plan** — This phase implements a set of coordinated, individually necessary changes (config migration, path change, .gitignore injection, branch helpers, context output). Each change is required for a specific requirement (REQ-70, REQ-71, REQ-75) and there are no sub-components to compare against a simpler baseline. The Plan 01 / Plan 02 wave split is already the natural decomposition.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Total tests | Full suite before Phase 38 changes | 1,633 passing | STATE.md cumulative total |
| utils.test.js | Before new git.* section tests | 87 tests | Pre-execution run |
| worktree.test.js | Before path/helper changes | 32 tests | Pre-execution run |
| context.test.js | Before output shape changes | 46 tests | Pre-execution run |
| parallel.test.js | Before path/target_branch changes | 32 tests | Pre-execution run |
| integration (worktree-parallel-e2e) | Cross-module integration | 25 tests | Pre-execution run |
| Lint errors | Before Phase 38 changes | 0 errors | npm run lint baseline |

## Evaluation Scripts

**Location of evaluation code:**

```
tests/unit/utils.test.js       (existing, extended by Plan 01 Task 1)
tests/unit/worktree.test.js    (existing, updated by Plan 01 Tasks 2-3)
tests/unit/context.test.js     (existing, updated by Plan 02 Task 1)
tests/unit/parallel.test.js    (existing, updated by Plan 02 Task 2)
tests/integration/worktree-parallel-e2e.test.js  (existing, must still pass)
```

**How to run full evaluation:**

```bash
# Run all affected unit tests (Sanity S2-S5)
npx jest tests/unit/utils.test.js tests/unit/worktree.test.js tests/unit/context.test.js tests/unit/parallel.test.js --no-coverage

# Run integration sanity (Sanity S9)
npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage

# Run full suite — zero regression gate (Sanity S1)
npx jest --no-coverage

# Lint gate (Sanity S6)
npm run lint

# Config migration check (Sanity S7)
node -e "const c = require('./.planning/config.json'); console.log(JSON.stringify(c.git, null, 2)); console.log('top-level branching_strategy:', c.branching_strategy);"
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Full suite zero regressions | PENDING | | |
| S2: utils.test.js new git.* tests | PENDING | | |
| S3: worktree.test.js path + helpers | PENDING | | |
| S4: context.test.js output shape | PENDING | | |
| S5: parallel.test.js project-local paths | PENDING | | |
| S6: Lint zero errors | PENDING | | |
| S7: config.json migrated | PENDING | | |
| S8: worktree_path is project-local | PENDING | | |
| S9: Integration suite still passes | PENDING | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| (none) | — | — | N/A | No proxy metrics for infrastructure phase |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| (none) | — | — | No ablation applicable |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-38-01 | End-to-end execute-phase with project-local worktrees | PENDING | Phase 39 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**

- Sanity checks: Adequate. Nine concrete, executable checks cover every behavioral claim in Plans 01 and 02. Test counts provide regression protection; config inspection provides structural verification; lint provides style/correctness protection. All checks can run in under 60 seconds total.
- Proxy metrics: None designed — honest absence. For an infrastructure refactoring with fully-testable behavioral requirements, there is no meaningful proxy. The absence is intentional and documented.
- Deferred coverage: Comprehensive for what can be deferred. The one deferred item (end-to-end execute-phase) is the natural boundary of Phase 38 — it explicitly requires Phase 39's caller-level work to be meaningful.

**What this evaluation CAN tell us:**

- Whether `loadConfig` correctly reads git fields from the nested `git` section with backward compatibility
- Whether worktree paths are computed as `.worktrees/{milestone}-{phase}` instead of `/tmp/grd-worktree-*`
- Whether `.gitignore` injection is idempotent and handles the no-file case
- Whether `createMilestoneBranch` enforces the HEAD-on-base-branch precondition
- Whether `resolveTargetBranch` returns the correct branch for each strategy
- Whether `cmdInitExecutePhase` emits `worktree_dir`, `target_branch`, and `milestone_branch`
- Whether `buildParallelContext` emits project-local `worktree_path` and `target_branch`
- Whether zero regressions were introduced across all 1,633 existing tests
- Whether the config.json was correctly migrated to the nested git section

**What this evaluation CANNOT tell us:**

- Whether the execute-phase command template correctly consumes the new context shape (deferred to Phase 39 — requires the completion flow implementation)
- Whether real-world worktree creation in `.worktrees/` works under macOS and Linux without the real tmpdir symlink workaround (deferred to Phase 39 first real execution)
- Whether `cmdWorktreePushAndPR` with milestone strategy correctly targets the milestone branch in an end-to-end PR flow (deferred to Phase 39 — requires a live git remote)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-21*
