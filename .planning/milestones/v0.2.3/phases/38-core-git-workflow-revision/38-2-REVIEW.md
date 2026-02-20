---
phase: 38-core-git-workflow-revision
wave: 2
plans_reviewed: [38-02]
timestamp: 2026-02-21T12:30:00Z
blockers: 0
warnings: 1
info: 3
verdict: warnings_only
---

# Code Review: Phase 38 Wave 2

## Verdict: WARNINGS ONLY

Plan 38-02 is fully implemented with both tasks completed, 5 new tests added, all 1,655 tests passing, and zero lint errors. One warning for a skipped plan step (parallel.test.js worktree_path assertion update) that was not documented as a deviation.

## Stage 1: Spec Compliance

### Plan Alignment

Both plan tasks have corresponding commits:

| Task | Commit | Status |
|------|--------|--------|
| Task 1: Update cmdInitExecutePhase output with new git config shape | `1b9bb49` | Complete |
| Task 2: Update buildParallelContext with project-local worktree paths | `80abc17` | Complete |

**must_haves.truths verification:**

1. "cmdInitExecutePhase outputs git.branching_strategy, git.worktree_dir, and resolved target_branch for PRs based on strategy" -- VERIFIED. `lib/context.js` lines 77-121: `branching_strategy`, `worktree_dir`, and `target_branch` are all present in the output object. `target_branch` uses `resolveTargetBranch()` for strategy-aware resolution.

2. "cmdInitExecutePhase computes worktree_path using project-local .worktrees/ directory instead of os.tmpdir()" -- VERIFIED. `lib/context.js` lines 131-137 use `path.resolve(cwd, config.worktree_dir || '.worktrees/', ...)`. No `os` import present. This was actually done in wave 1 as a deviation fix; wave 2 did not need to change it.

3. "cmdInitExecutePhase includes milestone_branch when branching_strategy is milestone" -- VERIFIED. `lib/context.js` lines 124-128: `milestone_branch` is populated from `milestone_branch_template` only when strategy is `'milestone'`, null otherwise.

4. "buildParallelContext computes per-phase worktree_path using project-local .worktrees/ directory" -- VERIFIED. `lib/parallel.js` lines 91-95 use `path.resolve(cwd, config.worktree_dir || '.worktrees/', ...)`. This was also done in wave 1 as a deviation fix.

5. "buildParallelContext includes the resolved target branch in per-phase context" -- VERIFIED. `lib/parallel.js` line 110: `target_branch: resolveTargetBranch(cwd, milestone.version, generateSlugInternal(milestone.name))`.

6. "All existing context and parallel tests pass; new tests cover updated git config output shape and project-local worktree paths" -- VERIFIED. SUMMARY reports 1,655 tests passing. 4 new context tests + 1 new parallel test = 5 new tests total.

**must_haves.artifacts verification:**

| Artifact | Path | Contains | Status |
|----------|------|----------|--------|
| cmdInitExecutePhase with new git config output | `lib/context.js` | `worktree_dir` (line 81) | VERIFIED |
| buildParallelContext with project-local paths | `lib/parallel.js` | `.worktrees` (line 93) | VERIFIED |
| Tests for updated cmdInitExecutePhase | `tests/unit/context.test.js` | 4 new tests (lines 155-251) | VERIFIED |
| Tests for updated buildParallelContext | `tests/unit/parallel.test.js` | 1 new test (lines 261-272) | VERIFIED |

**must_haves.key_links verification:**

| From | To | Via | Status |
|------|-----|-----|--------|
| `lib/context.js` | `lib/utils.js` | `loadConfig` for `worktree_dir` and `branching_strategy` | VERIFIED (line 13, 59) |
| `lib/context.js` | `lib/worktree.js` | `resolveTargetBranch` for strategy-aware PR target | VERIFIED (line 27, 120) |
| `lib/parallel.js` | `lib/utils.js` | `loadConfig` for `worktree_dir` | VERIFIED (line 12) |

**Plan step compliance (detailed):**

| Plan Step | Status | Notes |
|-----------|--------|-------|
| Task 1 Step 1: Import resolveTargetBranch | Done | Line 27 |
| Task 1 Step 2: Add worktree_dir to output | Done | Line 81 |
| Task 1 Step 3: Add target_branch field | Done | Lines 118-121 |
| Task 1 Step 4: Add milestone_branch field | Done | Lines 123-128 |
| Task 1 Step 5: Update worktree_path computation | Already done in wave 1 | Lines 131-137 |
| Task 1 Step 6: Update branch_name computation | Done | Lines 109-116 |
| Task 1 Step 7: Remove os import | Already done in wave 1 | Confirmed absent |
| Task 1 Step 8: Replace worktree_path test | Already done in wave 1 | Line 133 |
| Task 1 Step 9: Add target_branch test | Done | Lines 155-160 |
| Task 1 Step 10: Add worktree_dir test | Done | Lines 162-166 |
| Task 1 Step 11: Add milestone_branch test | Done | Lines 227-251 |
| Task 1 Step 12: Update branch_name test | N/A | Existing test at line 152 already asserts branch_name == worktree_branch |
| Task 2 Step 1: Remove os import | Already done in wave 1 | Confirmed absent |
| Task 2 Step 2: Update worktree_path computation | Already done in wave 1 | Lines 91-95 |
| Task 2 Step 3: Add target_branch to per-phase context | Done | Line 110 |
| **Task 2 Step 4: Update worktree_path assertion** | **NOT DONE** | Test at line 250 still uses `toBeTruthy()` only |
| Task 2 Step 5: Add target_branch test | Done | Lines 261-272 |

### Research Methodology

N/A -- no research references in plans. This is a pure infrastructure refactoring phase.

### Known Pitfalls

N/A -- no KNOWHOW.md or LANDSCAPE.md exists for this milestone.

### Eval Coverage

The 38-EVAL.md defines checks S4 and S5 as relevant to wave 2 (Plan 02):

- **S4 (context.test.js output shape):** Expected >= 49 tests. Actual: 50 tests (baseline 46, +4). PASSES.
- **S5 (parallel.test.js project-local paths):** Expected >= 34 tests. Actual: 33 tests (baseline 32, +1). FALLS SHORT BY 1. The EVAL expected +2 (one for worktree_path assertion update, one for target_branch). The worktree_path assertion update (Task 2 Step 4) was not executed -- the existing test at line 250 still uses the loose `toBeTruthy()` assertion rather than checking for `.worktrees` content. The target_branch test was added correctly. This is a minor gap: the underlying code is correct and the test does pass, but the assertion is not specific enough to catch a regression to tmpdir-based paths.

The remaining eval checks (S1, S6) are cross-cutting and will be verified at eval time.

## Stage 2: Code Quality

### Architecture

The implementation is consistent with existing codebase patterns:

- **Imports** follow the established destructured `require()` pattern. `resolveTargetBranch` imported from `./worktree` (line 27 in context.js, line 17 in parallel.js).
- **`generateSlugInternal`** already imported in context.js (line 18); correctly added to parallel.js imports (line 12).
- **No duplicate utilities** introduced. The `resolveTargetBranch` function from wave 1 is reused, not reimplemented.
- **Separation of concerns** is clean: `branch_name` is always the phase branch (where the worktree lives), `target_branch` is where PRs point (strategy-dependent), and `milestone_branch` is the milestone branch name (informational). The comment at line 109 ("always the phase branch, regardless of strategy") clearly documents this design decision.
- **Null safety:** `milestone_branch` is null when strategy is not `'milestone'` (line 124). `target_branch` is null when strategy is `'none'` (line 119). This is consistent with how `base_branch` handles the `'none'` case (line 80).

The wave 1 review INFO #4 noted that context.js did not yet emit `worktree_dir` or `target_branch`. This has been fully resolved by this wave.

No issues found.

### Reproducibility

N/A -- no experimental code. This is deterministic infrastructure.

### Documentation

- Inline comments are clear and explain the purpose of each new field (lines 109, 118, 123, 130).
- The `branch_name` comment explicitly documents the design decision that it is always the phase branch regardless of strategy.
- The SUMMARY.md key-decisions section documents the two architectural decisions (branch_name always phase, milestone_branch null for non-milestone).

No issues found.

### Deviation Documentation

**SUMMARY claims:** "None - plan executed exactly as written."

**Actual:** Task 2 Step 4 was not executed. The plan said "Update the worktree_path assertion" in parallel.test.js to verify it contains `.worktrees` instead of checking for tmpdir path patterns. The existing test at line 250 still uses the loose `toBeTruthy()` assertion.

The SUMMARY also correctly notes that "Plan 38-01 had already handled the worktree_path migration (Rule 3 deviation), so this plan's worktree_path changes were already in place." This explains why steps 1-2, 5, 7-8 from Task 1 and steps 1-2 from Task 2 were not needed. However, the assertion update (Task 2 Step 4) is independent of the code change -- it is a test quality improvement that was called for by the plan and not done.

**Files modified vs declared:**

| Source | Files |
|--------|-------|
| Plan `files_modified` | lib/context.js, lib/parallel.js, tests/unit/context.test.js, tests/unit/parallel.test.js |
| Commit `1b9bb49` | lib/context.js, tests/unit/context.test.js |
| Commit `80abc17` | lib/parallel.js, tests/unit/parallel.test.js |
| SUMMARY `key-files.modified` | lib/context.js, lib/parallel.js, tests/unit/context.test.js, tests/unit/parallel.test.js |

All three sources agree exactly. No unexpected files modified.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 1 | Plan Alignment | Task 2 Step 4 not executed: parallel.test.js worktree_path assertion still uses `toBeTruthy()` instead of checking for `.worktrees` content; SUMMARY claims "no deviations" |
| 2 | INFO | 1 | Eval Coverage | EVAL S5 expects >= 34 parallel tests but actual is 33; the missing test is the worktree_path assertion upgrade from WARNING #1 |
| 3 | INFO | 1 | Plan Alignment | Wave 1 Review INFO #4 (context.js missing worktree_dir/target_branch fields) has been fully resolved by this wave |
| 4 | INFO | 2 | Architecture | Clean separation of branch_name (worktree branch), target_branch (PR target), and milestone_branch (informational) is a well-designed pattern that will simplify downstream consumption in Phase 39 |

## Recommendations

**WARNING #1:** Update the worktree_path test in `tests/unit/parallel.test.js` (line 250-258) to assert `.worktrees` content rather than just `toBeTruthy()`. The plan specifically called for this change (Task 2 Step 4). Suggested fix:

```js
test('phases array contains per-phase context with worktree_path', () => {
  fixtureDir = createFixtureDir();
  writeRoadmapAndPhases(fixtureDir);
  writeConfig(fixtureDir, { use_teams: true });

  const result = buildParallelContext(fixtureDir, ['1', '2']);
  expect(result.phases).toHaveLength(2);
  expect(result.phases[0].worktree_path).toContain('.worktrees');
  expect(result.phases[1].worktree_path).toContain('.worktrees');
});
```

This is non-blocking because the underlying code is correct and the existing test does pass. However, the loose assertion would not catch a regression back to tmpdir-based paths.
