# Evaluation Plan: Phase 28 — PR Workflow from Worktree

**Designed:** 2026-02-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** cmdWorktreePushAndPR, execute-phase worktree lifecycle, grd-executor worktree awareness
**Reference papers:** None — this is software engineering, not research. Metrics derived from REQ-41, PRODUCT-QUALITY.md targets, and the existing test-suite baseline (1,456 tests / 80% coverage target).

## Evaluation Overview

Phase 28 delivers the PR creation layer that sits on top of Phase 27's worktree infrastructure. Two plans are in scope: Plan 01 implements `cmdWorktreePushAndPR` (library function, CLI subcommand `worktree push-pr`, MCP tool `grd_worktree_push_pr`) using TDD; Plan 02 modifies the `execute-phase.md` command template and `grd-executor.md` agent instructions to thread worktree paths through the entire execution lifecycle.

What can be verified now (within-phase):
- Library function exports, input/output contracts, and error path behavior via unit tests
- CLI routing (missing subcommand returns a structured error, not a crash)
- MCP descriptor registration (tool appears in the tools list)
- Markdown file structure (worktree steps present, old `handle_branching` step absent)
- Full test suite regression (1,456 baseline tests still pass after changes)

What cannot be verified now:
- Actually pushing a branch to a real GitHub remote and creating a real PR (requires GitHub auth, which is not available in the test environment)
- End-to-end execution of a complete phase through the updated `execute-phase.md` template (requires integration with Phases 29-30 and a live agent session)
- Correctness of the `worktree_path`-scoped executor behavior in a real agent run

No academic papers are involved. There is no BENCHMARKS.md for this domain. All targets derive from the existing product quality baseline and the phase success criteria in ROADMAP.md.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test count delta | PRODUCT-QUALITY.md target >= 80% coverage on lib/ | TDD plan mandates 8-10 new tests; zero regressions is a hard gate |
| Full suite pass rate | Baseline: 1,456 tests / 28 suites passing | Regression guard for the two implementation files |
| CLI subcommand response | Plan 01 success criteria | Verifies CLI routing without requiring live GitHub |
| MCP tool registration | Plan 01 must_haves.artifacts | MCP server must expose the new tool |
| Structural markdown checks | Plan 02 success criteria | Verifies template and agent files were modified correctly |
| No `handle_branching` references | Plan 02 success criteria | Old pattern must be fully replaced |
| WORKTREE_PATH injection | Plan 02 success criteria | Agents receive the working directory path |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 checks | Basic functionality: runs, produces output, no crash on bad input |
| Proxy (L2) | 5 metrics | Test count, suite pass rate, CLI routing, MCP descriptor, markdown structure |
| Deferred (L3) | 3 validations | Real GitHub push, E2E phase execution, worktree-scoped agent behavior |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Library function export present
- **What:** `cmdWorktreePushAndPR` is exported from `lib/worktree.js`
- **Command:** `node -e "const w = require('./lib/worktree'); console.log(typeof w.cmdWorktreePushAndPR)"`
- **Expected:** `function`
- **Failure means:** Plan 01 implementation task did not complete or export was omitted

### S2: CLI subcommand responds to missing phase flag
- **What:** `worktree push-pr` without `--phase` returns structured error JSON, does not crash or hang
- **Command:** `node bin/grd-tools.js worktree push-pr 2>&1`
- **Expected:** JSON object containing an `"error"` field mentioning the missing phase; exit code 0 (not 1)
- **Failure means:** CLI routing missing, function crashes on missing input, or error path uses `process.exit(1)` instead of `output()`

### S3: CLI subcommand registered in available list
- **What:** `push-pr` appears in the error message when an invalid subcommand is used
- **Command:** `node bin/grd-tools.js worktree invalid-sub 2>&1`
- **Expected:** Error message lists `push-pr` among available subcommands
- **Failure means:** CLI routing table was not updated to include `push-pr`

### S4: MCP descriptor registered
- **What:** `grd_worktree_push_pr` appears in the MCP server's tool list
- **Command:** `node -e "const s = require('./lib/mcp-server'); const tools = s.TOOL_DESCRIPTORS || s.getTools(); console.log(tools.map(t=>t.name).includes('grd_worktree_push_pr'))"`
- **Expected:** `true`
- **Failure means:** MCP descriptor was not added to `lib/mcp-server.js`, or the import of `cmdWorktreePushAndPR` is missing

### S5: execute-phase.md contains worktree setup step
- **What:** The `setup_worktree` step exists in `commands/execute-phase.md`
- **Command:** `grep -c "setup_worktree" commands/execute-phase.md`
- **Expected:** `1` or higher
- **Failure means:** Plan 02 task 1 did not complete or the step was named differently

### S6: execute-phase.md has no old handle_branching step
- **What:** The old `handle_branching` step is fully replaced
- **Command:** `grep -c "handle_branching" commands/execute-phase.md`
- **Expected:** `0`
- **Failure means:** Old branching pattern was not removed; two conflicting branching steps may coexist

### S7: grd-executor.md contains worktree_execution section
- **What:** The executor agent has instructions for worktree-scoped operation
- **Command:** `grep -c "worktree_execution\|WORKTREE_PATH" agents/grd-executor.md`
- **Expected:** `4` or higher (multiple references indicating a substantive section)
- **Failure means:** Plan 02 task 2 did not complete; executor agents will not know how to scope file operations

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to proxy evaluation.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of implementation quality and completeness.
**IMPORTANT:** These proxy metrics approximate but do not substitute for the full integration validation at Phase 31.

### P1: New test count — TDD coverage of cmdWorktreePushAndPR
- **What:** Number of new test cases added for the PR creation function
- **How:** Count tests in the new `cmdWorktreePushAndPR` describe block in `tests/unit/worktree.test.js`
- **Command:** `npx jest tests/unit/worktree.test.js --no-coverage --verbose 2>&1 | grep -c "✓\|✗\|○"`
- **Target:** Total worktree tests >= 28 (20 existing + 8 minimum new)
- **Evidence:** Plan 01 specifies 8-10 new test cases; TDD protocol requires tests before implementation
- **Correlation with full metric:** HIGH — unit tests for a function with injected dependencies are the primary quality signal for library code
- **Blind spots:** Tests cannot call a real `gh pr create` without GitHub auth; the gh CLI integration path is tested only via error handling, not success path. Real push success is tested with a bare remote but only in the local test environment.
- **Validated:** No — awaiting deferred validation at phase-31-integration

### P2: Full test suite regression — zero regressions
- **What:** All 1,456 baseline tests still pass after Phase 28 changes
- **How:** Run the complete Jest suite
- **Command:** `npx jest --no-coverage 2>&1 | tail -5`
- **Target:** `Tests: 1456+ passed, 0 failed` (delta >= 8 new passing tests, 0 failures)
- **Evidence:** Baseline established in STATE.md — 1,456 tests / 28 suites passing before Phase 28 begins
- **Correlation with full metric:** HIGH — the test suite covers all lib/ modules; regressions in worktree.js, bin/grd-tools.js, or lib/mcp-server.js would surface here
- **Blind spots:** Tests for `execute-phase.md` and `agents/grd-executor.md` are markdown documents with no automated test coverage; structural changes to them are only validated by the markdown checks in P3/P4
- **Validated:** No — full regression confirmation deferred to phase-31-integration

### P3: execute-phase.md structural completeness
- **What:** All four required worktree steps exist and old pattern is absent
- **How:** Pattern count checks on the modified command template
- **Command:**
  ```bash
  echo "setup_worktree:$(grep -c 'setup_worktree' commands/execute-phase.md)"
  echo "push_and_create_pr:$(grep -c 'push_and_create_pr' commands/execute-phase.md)"
  echo "cleanup_worktree:$(grep -c 'cleanup_worktree' commands/execute-phase.md)"
  echo "WORKTREE_PATH:$(grep -c 'WORKTREE_PATH' commands/execute-phase.md)"
  echo "worktree_total:$(grep -c 'worktree' commands/execute-phase.md)"
  echo "handle_branching_old:$(grep -c 'handle_branching' commands/execute-phase.md)"
  ```
- **Target:** setup_worktree >= 1, push_and_create_pr >= 1, cleanup_worktree >= 1, WORKTREE_PATH >= 3, worktree_total >= 10, handle_branching_old = 0
- **Evidence:** Plan 02 task 1 success criteria specifies these exact grep thresholds
- **Correlation with full metric:** MEDIUM — structural presence of steps does not guarantee the steps are correctly written (e.g., command flags could be wrong), but absence guarantees failure
- **Blind spots:** Does not verify that bash commands within the steps reference the correct grd-tools CLI flags, or that the `branching_strategy=none` bypass is correctly conditioned
- **Validated:** No — awaiting deferred validation at phase-31-integration

### P4: grd-executor.md worktree instruction density
- **What:** Executor agent has substantive worktree instructions, not just a token mention
- **How:** Count keyword occurrences indicating real content
- **Command:**
  ```bash
  echo "worktree_count:$(grep -c 'worktree' agents/grd-executor.md)"
  echo "WORKTREE_PATH_count:$(grep -c 'WORKTREE_PATH' agents/grd-executor.md)"
  ```
- **Target:** worktree_count >= 8, WORKTREE_PATH_count >= 4
- **Evidence:** Plan 02 task 2 verify step specifies these exact thresholds
- **Correlation with full metric:** MEDIUM — keyword density is a proxy for instruction completeness; an agent could have 8 "worktree" mentions that are all preamble without actionable rules
- **Blind spots:** Does not verify that the 6 enumerated rules (file paths, bash cwd, git commits, STATE.md targeting) are present and correctly stated
- **Validated:** No — awaiting deferred validation at phase-31-integration

### P5: lint passes on modified JS files
- **What:** ESLint reports zero errors on the modified source files
- **How:** Run ESLint on the three JS files modified by Plan 01
- **Command:** `npx eslint lib/worktree.js bin/grd-tools.js lib/mcp-server.js --max-warnings 0 2>&1 | tail -5`
- **Target:** Zero errors, zero warnings (or a clean exit with no output)
- **Evidence:** PRODUCT-QUALITY.md P1 target: ESLint pass rate 100% (zero errors)
- **Correlation with full metric:** HIGH — lint failures in these files would propagate to CI failures at Phase 31
- **Blind spots:** ESLint catches style and common errors but not logical correctness of the gh CLI integration
- **Validated:** No — CI pipeline validation deferred to phase-31-integration

## Level 3: Deferred Validations

**Purpose:** Full validation requiring live GitHub environment or integrated agent execution.

### D1: Real branch push and PR creation — DEFER-28-01
- **What:** `cmdWorktreePushAndPR` successfully pushes a branch to `origin` and creates a real GitHub PR via `gh pr create`; returns `{ pr_url, branch, title, base, number }`
- **How:** Run `node bin/grd-tools.js worktree push-pr --phase 31 --title "Integration test PR"` from a worktree with a real GitHub remote configured
- **Why deferred:** `gh pr create` requires GitHub CLI authentication and a real remote with push access. The test environment has no GitHub auth; the unit tests mock this path via error handling. A bare-remote test verifies push mechanics but not the gh CLI success path.
- **Validates at:** phase-31-integration
- **Depends on:** GitHub CLI (`gh`) installed and authenticated; real remote repository; Phase 31 integration environment
- **Target:** Command returns JSON with `pr_url` containing a valid GitHub PR URL; PR appears in the GitHub UI
- **Risk if unmet:** The PR creation feature is the primary deliverable of Phase 28. If the gh CLI integration is broken (wrong flags, wrong cwd, wrong output parsing), the entire v0.2.0 worktree-to-PR pipeline fails. Fallback: manual PR creation by the developer, with Phase 28 needing a fix iteration.
- **Fallback:** If `gh` is unavailable, output should include `push_succeeded: true` and `error` describing the gh failure, so the branch is at least pushed. This partial-success path is tested in unit tests.

### D2: End-to-end execute-phase worktree lifecycle — DEFER-28-02
- **What:** Running `/grd:execute-phase` on a real phase uses the new worktree lifecycle: creates worktree, passes `WORKTREE_PATH` to executor agents, all file writes land in the worktree, PR is created, worktree is cleaned up
- **How:** Execute a test phase using the updated `execute-phase.md` template in a live Claude Code agent session; inspect git log on the created PR branch to confirm commits came from the worktree
- **Why deferred:** The `execute-phase.md` and `grd-executor.md` are command templates, not code. Their behavior can only be validated by running a real agent session. No automated test covers agent prompt execution.
- **Validates at:** phase-31-integration
- **Depends on:** Phase 29 (dependency analysis), Phase 30 (parallel execution) — Phase 31 validates the full pipeline including Phase 28's PR step. Also depends on DEFER-22-01 (end-to-end git branching workflow) which was targeted at Phase 31.
- **Target:** Per ROADMAP.md Phase 31 success criteria SC-1: "End-to-end single-phase worktree execution: init -> worktree create -> plan execute in worktree -> PR create -> worktree cleanup"
- **Risk if unmet:** Executor agents may write files to the main checkout instead of the worktree (no isolation), or the PR body may be malformed. This degrades the worktree isolation guarantee of v0.2.0. Mitigation: Phase 31 has an explicit integration validation budget.
- **Fallback:** If template changes are wrong, they can be patched without a new phase (markdown edits are low-risk). If agent behavior is wrong, a targeted fix in the executor instructions suffices.

### D3: Backward compatibility with branching_strategy=none — DEFER-28-03
- **What:** Existing usage of `execute-phase` without worktree (`branching_strategy: "none"`) continues to work exactly as before Phase 28
- **How:** Run a real execute-phase session with `branching_strategy: "none"` set in config; confirm no worktree is created, no PR step is triggered, files land in the normal working directory
- **Why deferred:** Requires a live agent session. The markdown conditions (`condition="branching_strategy != none"`) are intent, not enforced logic — only agent execution can confirm the branch is taken correctly.
- **Validates at:** phase-31-integration
- **Depends on:** Live agent session with non-worktree config
- **Target:** Zero behavioral difference from pre-Phase-28 execution when `branching_strategy=none`
- **Risk if unmet:** Breaking change to existing users who do not use worktrees. This is the most serious backward-compat risk for Phase 28.
- **Fallback:** The `condition=` attribute is the sole guard. If it is present in the template (verified by P3), regression probability is low but not zero.

## Ablation Plan

**No ablation plan.** Phase 28 does not implement a technique with sub-components that can be isolated. It implements a defined interface (`cmdWorktreePushAndPR`) and modifies command templates. The unit tests in Plan 01 serve as component-level validation (push step vs. PR creation step are independently testable paths in the function). No additional ablation structure is needed.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test suite count | Tests passing before Phase 28 begins | 1,456 | STATE.md performance metrics |
| Test suite pass rate | Suites passing before Phase 28 begins | 28/28 (100%) | STATE.md performance metrics |
| Worktree unit tests | Existing tests before new PR tests added | 20 | Confirmed via `npx jest worktree.test.js` |
| Worktree CLI subcommands | Available before push-pr added | create, remove, list (3) | Confirmed via `node bin/grd-tools.js worktree` |
| execute-phase.md worktree refs | Before Plan 02 | 0 (no worktree integration) | Confirmed via `grep -c worktree commands/execute-phase.md` |
| handle_branching refs | Before Plan 02 | 1 (old step exists) | Confirmed via `grep commands/execute-phase.md` |

## Evaluation Scripts

**Location of evaluation code:** `tests/unit/worktree.test.js` (unit tests for cmdWorktreePushAndPR)

**How to run full evaluation:**

```bash
# Level 1 — Sanity (run in project root)
node -e "const w = require('./lib/worktree'); console.log('S1:', typeof w.cmdWorktreePushAndPR)"
node bin/grd-tools.js worktree push-pr 2>&1 | head -3
node bin/grd-tools.js worktree invalid-sub 2>&1 | grep push-pr
node -e "const s = require('./lib/mcp-server'); const t = s.TOOL_DESCRIPTORS || []; console.log('S4:', t.some(x=>x.name==='grd_worktree_push_pr'))"
grep -c "setup_worktree" commands/execute-phase.md
grep -c "handle_branching" commands/execute-phase.md
grep -c "WORKTREE_PATH" agents/grd-executor.md

# Level 2 — Proxy
npx jest tests/unit/worktree.test.js --no-coverage --verbose 2>&1 | tail -10
npx jest --no-coverage 2>&1 | tail -5
grep -c "setup_worktree\|push_and_create_pr\|cleanup_worktree\|WORKTREE_PATH\|handle_branching" commands/execute-phase.md
grep -c "worktree\|WORKTREE_PATH" agents/grd-executor.md
npx eslint lib/worktree.js bin/grd-tools.js lib/mcp-server.js --max-warnings 0 2>&1 | tail -5
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: lib export present | | | |
| S2: CLI missing-phase error | | | |
| S3: push-pr in subcommand list | | | |
| S4: MCP descriptor registered | | | |
| S5: setup_worktree step present | | | |
| S6: handle_branching absent | | | |
| S7: executor worktree section | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: new test count (total worktree tests) | >= 28 | | | |
| P2: full suite pass rate | 1456+ pass, 0 fail | | | |
| P3: execute-phase.md structure | all 6 checks pass | | | |
| P4: executor instruction density | worktree>=8, WORKTREE_PATH>=4 | | | |
| P5: ESLint on modified JS files | 0 errors, 0 warnings | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-28-01 | Real branch push + GitHub PR creation | PENDING | phase-31-integration |
| DEFER-28-02 | End-to-end execute-phase worktree lifecycle | PENDING | phase-31-integration |
| DEFER-28-03 | Backward compat: branching_strategy=none | PENDING | phase-31-integration |

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM

**Justification:**
- Sanity checks: Adequate. Seven checks cover all three artifacts (lib function, CLI routing, MCP descriptor) and both template files. Each check is a deterministic command with a specific expected value.
- Proxy metrics: Well-evidenced for the JS code (P1, P2, P5 directly measure testable properties). Weakly evidenced for the markdown files (P3, P4 measure keyword presence, not semantic correctness). This is an honest limitation — markdown templates have no automated semantic validation.
- Deferred coverage: Comprehensive. All three deferred items have clear validates_at references (phase-31-integration) and cover the three gaps that cannot be closed without a live agent environment and real GitHub auth.

**What this evaluation CAN tell us:**
- Whether `cmdWorktreePushAndPR` exists, is importable, and handles its error paths correctly (unit tests + sanity)
- Whether the CLI and MCP routing layers expose the new function (S2, S3, S4)
- Whether `execute-phase.md` and `grd-executor.md` were modified to include the required worktree lifecycle keywords and steps (P3, P4)
- Whether the Phase 28 changes introduce any regression in the existing 1,456-test suite (P2)

**What this evaluation CANNOT tell us:**
- Whether a real `git push` + `gh pr create` sequence succeeds against a live GitHub remote (deferred to phase-31 via DEFER-28-01)
- Whether executor agents correctly scope all file operations to `WORKTREE_PATH` in practice (deferred to phase-31 via DEFER-28-02)
- Whether the `branching_strategy=none` bypass works correctly when an agent actually runs the template (deferred to phase-31 via DEFER-28-03)
- Whether the PR body content built from SUMMARY.md files is well-formatted and readable (no automated check exists for generated markdown quality)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-19*
