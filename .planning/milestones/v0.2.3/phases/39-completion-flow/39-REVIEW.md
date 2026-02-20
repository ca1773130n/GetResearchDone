---
phase: 39-completion-flow
wave: all
plans_reviewed: [01, 02]
timestamp: 2026-02-21T12:00:00Z
blockers: 1
warnings: 2
info: 3
verdict: blocker_found
---

# Code Review: Phase 39 (All Plans)

## Verdict: BLOCKERS FOUND

Phase 39 delivers 5 helper functions and a `cmdWorktreeComplete` orchestrator with CLI routing and 60 passing tests. Plan alignment and test coverage are strong. However, the `finally`-block cleanup for the PR path will not execute in production because `output()` calls `process.exit(0)`, which terminates immediately without running `finally` blocks. This is masked in tests where `process.exit` is mocked to throw an exception instead.

## Stage 1: Spec Compliance

### Plan Alignment

**Plan 01 (Wave 1):**

| Task | Plan Description | Commit | Status |
|------|-----------------|--------|--------|
| 1 | Implement runTestGate and cleanupWorktree | eb83b02 | DONE -- matches plan |
| 2 | Implement mergeWorktree, discardWorktree, keepWorktree | 3d12ed6 | DONE -- matches plan |

All 5 helper functions are implemented and exported from `lib/worktree.js`. All must_haves truths are satisfied:
- `runTestGate` returns `{ passed, exitCode, stdout, stderr }` -- verified in code and smoke test
- `cleanupWorktree` never throws -- verified in code and smoke test with invalid paths
- `mergeWorktree` aborts on conflict -- verified in tests
- `discardWorktree` is idempotent -- verified in tests
- `keepWorktree` is a no-op -- verified in code

Deviations properly documented in SUMMARY:
1. Shell-based `execSync` used instead of `execFileSync` for `runTestGate` (handles quoted arguments correctly)
2. `cleanupTestRepo` scoped to test-repo-owned worktrees only

Both deviations are justified and correctly documented.

**Plan 02 (Wave 2):**

| Task | Plan Description | Commit | Status |
|------|-----------------|--------|--------|
| 1 | Implement cmdWorktreeComplete orchestrator | ed969cb | DONE -- matches plan with deviation |
| 2 | Wire CLI routing and add comprehensive tests | 73e444a | DONE -- matches plan |

Deviations documented in SUMMARY:
1. `worktreePath()` helper used instead of `config.worktree_dir` for path resolution -- correctly aligns with `cmdWorktreeCreate`.

No issues found with plan alignment.

### Research Methodology

N/A -- no research references in plans. This is a pure infrastructure phase.

### Known Pitfalls

N/A -- no KNOWHOW.md for milestone v0.2.3.

### Eval Coverage

The EVAL.md (39-EVAL.md) defines 10 sanity checks (S1-S10), no proxy metrics, and 1 deferred validation (DEFER-39-01 for Phase 41 integration). All 10 sanity checks are structured to be runnable against the current implementation:

- S1-S2: Test suite counts -- executable
- S3-S4: Smoke tests via `node -e` -- executable and verified during this review
- S5-S8: Targeted jest test runs -- executable
- S9: CLI routing check -- verified during this review (returns structured JSON)
- S10: Integration suite reference -- executable

Eval coverage is adequate for this infrastructure phase.

## Stage 2: Code Quality

### Architecture

The new code follows existing project patterns well:

- CommonJS `require`/`module.exports` pattern -- consistent
- Result-object pattern (no `process.exit` in helpers) -- consistent with plan's design intent
- `execGit` with `{ allowBlocked: true }` for blocked git flags (`-D`, `--force`) -- consistent with existing worktree commands
- JSDoc comments on all functions -- consistent
- Function placement: helpers above CLI commands section, exports at bottom -- consistent

**BLOCKER: `finally`-block cleanup will not execute in production for the PR path.**

In `cmdWorktreeComplete`, the PR path (lines 744-841 of `lib/worktree.js`) relies on a `finally` block at line 836-841 to call `cleanupWorktree(cwd, wtPath)`. However, `output()` (from `lib/utils.js`) calls `process.exit(0)` at line 455, which terminates the Node.js process immediately without executing `finally` blocks.

The `finally` block only runs in tests because `captureOutput` mocks `process.exit` to throw an exception (a throw DOES trigger `finally` blocks). The plan acknowledged this on line 326-327 ("since `process.exit` is mocked in tests and `output()` throws through the mock"), but the design does not address production behavior.

**Impact:** After a successful PR creation OR after a `gh` failure (when push succeeded), the worktree directory will remain on disk in production. The merge path is unaffected because it calls `cleanupWorktree()` synchronously before any `output()` call. The discard path is also unaffected because `discardWorktree()` handles cleanup internally.

**Fix options:**
1. Call `cleanupWorktree(cwd, wtPath)` explicitly before each `output()` call in the PR path (matching the merge path pattern)
2. Restructure to collect the result object, call cleanup, then call `output()` at the very end after cleanup

**WARNING: Unused variable `actionResult` in try block.**

`actionResult` is declared with `let` at line 707 outside the `if (action === 'merge')` block but is only assigned and used inside the merge branch. This variable could be scoped inside the merge block as `const`. Minor style issue.

**WARNING: PR logic duplicated from `cmdWorktreePushAndPR`.**

The PR creation logic in `cmdWorktreeComplete` (lines 746-834) is a near-copy of `cmdWorktreePushAndPR` (lines 500-607). The plan explicitly documents this duplication as intentional (to avoid nested `output()`/`process.exit` calls), and the justification is sound given the current `output()` design. However, this creates a maintenance burden -- any future change to PR creation logic must be applied in both places.

This is not a blocker since it was a deliberate design choice, but it should be tracked for future refactoring (e.g., extracting a `pushAndCreatePR()` helper that returns a result object without calling `output()`).

### Reproducibility

N/A -- no experimental code. This is deterministic infrastructure.

### Documentation

All 6 new functions have complete JSDoc comments with `@param` and `@returns` type annotations. The deviation from `execFileSync` to `execSync` is documented with an inline comment explaining why (shell-style quoting support) and why it is safe (config-sourced input). Documentation is adequate.

**INFO:** The `cleanupWorktree` JSDoc says "errors are silently absorbed" -- the actual behavior returns `{ cleaned: false, error: ... }` which technically surfaces the error in the return value. The "silently" is slightly misleading but the contract is clear from the `@returns` annotation.

**INFO:** The section comment `// -- Completion Flow Helpers --` clearly delineates the new code from existing helpers. Good organization.

### Deviation Documentation

SUMMARY.md files match git history:

- Plan 01 SUMMARY claims commits eb83b02 and 3d12ed6 -- confirmed in git log
- Plan 02 SUMMARY claims commits ed969cb and 73e444a -- confirmed in git log
- Files modified match `git diff --name-only`: `lib/worktree.js`, `bin/grd-tools.js`, `tests/unit/worktree.test.js`, plus `39-01-SUMMARY.md`
- Plan 02 SUMMARY also mentions `39-02-SUMMARY.md` was created (commit 05b32c6, which is the docs commit)

All deviations documented in SUMMARYs are legitimate and properly explained.

**INFO:** Plan 01 SUMMARY claims 49 tests total; Plan 02 SUMMARY claims 60 tests total. The current test file has 60 tests passing, consistent with Plan 02's final count.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | BLOCKER | 2 | Architecture | `finally`-block cleanup for PR path will not execute in production -- `output()` calls `process.exit(0)` which terminates immediately |
| 2 | WARNING | 2 | Architecture | `actionResult` declared with `let` outside merge block but only used inside it; could be `const` scoped within the block |
| 3 | WARNING | 2 | Architecture | PR creation logic duplicated between `cmdWorktreeComplete` and `cmdWorktreePushAndPR`; intentional per plan but creates maintenance burden |
| 4 | INFO | 1 | Plan Alignment | `execSync` used instead of `execFileSync` for `runTestGate`; deviation properly documented and justified |
| 5 | INFO | 2 | Documentation | `cleanupWorktree` JSDoc says "silently absorbed" but errors are surfaced in return value |
| 6 | INFO | 2 | Architecture | Good code organization with section comments separating helpers from CLI commands |

## Recommendations

### BLOCKER Fix (Finding #1)

Move `cleanupWorktree()` call before `output()` in the PR path. The simplest fix is to restructure the PR path to collect the result, call cleanup, then output:

```js
// In the PR path of cmdWorktreeComplete, after successful PR creation:
const prResult = {
  action: 'pr', phase, milestone,
  pr_url: prUrl, pr_number: prNumber,
  branch, base: prBase, title: prTitle, test_passed: true,
};
cleanupWorktree(cwd, wtPath);  // cleanup BEFORE output
output(prResult, raw);
```

Similarly for the PR error paths -- call `cleanupWorktree(cwd, wtPath)` before `output()`. The `finally` block can then be removed entirely.

This matches the merge path pattern where `cleanupWorktree()` is called explicitly before any `output()`.

### WARNING Fix (Finding #2)

Move `actionResult` declaration inside the merge block:

```js
if (action === 'merge') {
  cleanupWorktree(cwd, wtPath);
  const actionResult = mergeWorktree(cwd, { branch, baseBranch });
  // ...
}
```

### WARNING Note (Finding #3)

Track as technical debt: extract a `pushAndCreatePR()` helper that returns a result object without calling `output()`. Both `cmdWorktreePushAndPR` and `cmdWorktreeComplete` would then call this helper.

---

*Review by: Claude (grd-code-reviewer)*
*Review date: 2026-02-21*
