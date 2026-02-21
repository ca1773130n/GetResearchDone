---
phase: 46-hybrid-worktree-execution
wave: 1
plans_reviewed: [46-01, 46-02]
timestamp: 2026-02-21T13:00:00Z
blockers: 0
warnings: 2
info: 3
verdict: warnings_only
---

# Code Review: Phase 46 Wave 1

## Verdict: WARNINGS ONLY

Plans 46-01 and 46-02 execute their stated tasks correctly. All new fields (isolation_mode, main_repo_path, native_isolation, options.branch, enriched hook remove) are implemented and tested. Two warnings: (1) commit hash mismatches in both SUMMARY.md files, and (2) cmdInitExecuteParallel does not pass nativeWorktreeAvailable to buildParallelContext.

## Stage 1: Spec Compliance

### Plan Alignment

**Plan 46-01 (Native Isolation Context Fields)**

| Task | Plan Description | Status | Commit |
|------|------------------|--------|--------|
| 1 | Add isolation_mode and main_repo_path to cmdInitExecutePhase | DONE | ec20dad |
| 2 | Adapt buildParallelContext for native isolation skip path | DONE | e49701e |

Both tasks are implemented exactly as specified:

- `isolation_mode` in `lib/context.js` lines 260-265: correctly derives `'none'` when branching_strategy is `'none'`, `'native'` when backend has native_worktree_isolation, `'manual'` otherwise.
- `main_repo_path` in `lib/context.js` lines 266-269: uses `fs.realpathSync(cwd)` when branching_strategy is not `'none'`, `null` otherwise.
- `buildParallelContext` in `lib/parallel.js` lines 68-69: accepts optional `options` parameter with `nativeWorktreeAvailable` defaulting to `false`.
- Per-phase context in `lib/parallel.js` lines 101-112: when `nativeWorktreeAvailable` is true, sets `worktree_path: null` and `native_isolation: true`.

5 new context tests + 3 new parallel tests = 8 new tests, matching SUMMARY claim. All 175 tests across the three suites pass.

**Plan 46-02 (Flexible Branch Handling & Hook Extension)**

| Task | Plan Description | Status | Commit |
|------|------------------|--------|--------|
| 1 | Add explicit branch parameter to cmdWorktreeMerge | DONE | 0b2ae9a |
| 2 | Extend cmdWorktreeHookRemove with state cleanup info | DONE | 2421541 |

Both tasks are implemented exactly as specified:

- `cmdWorktreeMerge` in `lib/worktree.js` line 562: `const phaseBranch = options.branch || worktreeBranch(...)` -- a single-line backward-compatible change.
- `cmdWorktreeHookRemove` in `lib/worktree.js` lines 772-782: uses `parseWorktreeName` for best-effort metadata extraction, wrapped in try/catch.
- `cmdWorktreePushAndPR` confirmed to read branch from HEAD (lines 408-412) -- no code change needed, just verification + test added.

6 new worktree tests, matching SUMMARY claim of 58 total (52 baseline + 6).

### Research Methodology

N/A -- no research references in plans. This is infrastructure work.

### Known Pitfalls

N/A -- no KNOWHOW.md exists for this milestone.

### Eval Coverage

EVAL.md (46-EVAL.md) defines:
- S2: context.test.js passes (>= 82 tests) -- actual: 87 (exceeds target)
- S3: parallel.test.js passes (>= 34 tests) -- actual: 35 (exceeds target)
- S4: worktree.test.js passes (>= 56 tests) -- actual: 53+6=58 (exceeds target)
- S5/S6: isolation_mode and main_repo_path fields present -- confirmed in code
- S7: buildParallelContext native_isolation field -- confirmed in code
- S8: cmdWorktreeMerge accepts explicit branch -- confirmed in code

All Wave 1-relevant eval criteria (S1-S8) can be computed from current implementation. No interface mismatches.

## Stage 2: Code Quality

### Architecture

All changes follow existing project patterns:

- CommonJS module style with `'use strict'` (worktree.js line 11, context.js follows established pattern)
- Options object pattern for backward-compatible function extension (parallel.js line 68-69, worktree.js line 562) -- consistent with project CLAUDE.md conventions
- `getBackendCapabilities(backend).native_worktree_isolation` access pattern matches Phase 45 established usage (context.js line 263)
- `parseWorktreeName` reuse in hook remove handler (worktree.js line 775) -- avoids duplicate parsing logic

No architectural conflicts.

### Reproducibility

N/A -- no experimental code in this phase. All changes are deterministic infrastructure.

### Documentation

- Phase 46 comment labels added at appropriate locations:
  - `lib/context.js` line 259: `// Isolation mode and main repo path (Phase 46)`
  - `lib/parallel.js` lines 99-100: `// When native isolation is available, skip worktree_path pre-computation`
  - `lib/worktree.js` lines 772-773: `// Try to extract phase/milestone metadata from the worktree path`
- JSDoc parameter documentation updated for `buildParallelContext` (parallel.js lines 64-66) and `cmdWorktreeMerge` (worktree.js line 551)

Adequate documentation for infrastructure code.

### Deviation Documentation

**WARNING: Commit hash mismatches in SUMMARY files.**

46-01-SUMMARY.md claims:
- Task 1 commit: `0b2ae9a` -- INCORRECT. Actual commit is `ec20dad` (feat(46-01): add isolation_mode and main_repo_path)
- Task 2 commit: `e49701e` -- Correct

46-02-SUMMARY.md claims:
- Task 1 commit: `0b2ae9a` -- Correct
- Task 2 commit: `e49701e` -- INCORRECT. Actual commit is `2421541` (feat(46-02): extend cmdWorktreeHookRemove)

The SUMMARY files have swapped/incorrect commit hashes. The actual code changes are correct and attributable to the right plan by their commit messages, but the SUMMARY metadata is misleading.

**Files modified vs SUMMARY key-files:**

Git diff `ec20dad^..e49701e` shows 6 files modified: lib/context.js, lib/parallel.js, lib/worktree.js, tests/unit/context.test.js, tests/unit/parallel.test.js, tests/unit/worktree.test.js. This includes worktree.js files from Plan 46-02 because the commits interleave chronologically (both plans executed in parallel in wave 1). This is expected behavior for parallel wave execution.

46-01-SUMMARY key-files: lib/context.js, lib/parallel.js, tests/unit/context.test.js, tests/unit/parallel.test.js -- matches plan scope.
46-02-SUMMARY key-files: lib/worktree.js, tests/unit/worktree.test.js -- matches plan scope.

Both SUMMARYs claim "Deviations from Plan: None" which is accurate -- all tasks were implemented as described.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Deviation Documentation | 46-01-SUMMARY.md lists commit 0b2ae9a for Task 1 but actual commit is ec20dad; 46-02-SUMMARY.md lists commit e49701e for Task 2 but actual commit is 2421541 |
| 2 | WARNING | 1 | Plan Alignment | cmdInitExecuteParallel (lib/parallel.js:204) calls buildParallelContext without passing nativeWorktreeAvailable, so the CLI `init execute-parallel` command always defaults to manual mode even on Claude backend |
| 3 | INFO | 2 | Architecture | Options object pattern ({nativeWorktreeAvailable}) is well-chosen for backward compatibility -- all existing callers including cmdInitExecuteParallel continue to work without modification |
| 4 | INFO | 2 | Architecture | parseWorktreeName reuse in cmdWorktreeHookRemove avoids introducing duplicate parsing logic |
| 5 | INFO | 1 | Plan Alignment | Test counts exceed EVAL.md baselines: context 87 (target 82), parallel 35 (target 34), worktree 58 (target 56) |

## Recommendations

**For WARNING #1 (Commit hash mismatch):** Update the SUMMARY.md files to reference the correct commit hashes:
- 46-01-SUMMARY.md Task 1: change `0b2ae9a` to `ec20dad`
- 46-02-SUMMARY.md Task 2: change `e49701e` to `2421541`

This is a documentation-only fix that does not affect code correctness.

**For WARNING #2 (cmdInitExecuteParallel nativeWorktreeAvailable gap):** The `cmdInitExecuteParallel` function at lib/parallel.js:204 should detect whether native isolation is available and pass it to buildParallelContext. Suggested fix:

```javascript
// In cmdInitExecuteParallel, before calling buildParallelContext:
const backend = detectBackend(cwd);
const capabilities = getBackendCapabilities(backend);
const context = buildParallelContext(cwd, phaseNumbers, {
  nativeWorktreeAvailable: capabilities.native_worktree_isolation === true
});
```

This is a low-risk gap because Plan 46-03 (Wave 2) will update the execute-phase orchestrator template which is the primary consumer of this context. The `cmdInitExecuteParallel` CLI command may be a secondary consumer that could be addressed in Wave 2 or later. The existing behavior (defaulting to manual) is safe -- it just does not leverage native isolation when available through this particular code path.
