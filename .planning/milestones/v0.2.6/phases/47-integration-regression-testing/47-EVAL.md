# Evaluation Plan: Phase 47 — Integration & Regression Testing

**Designed:** 2026-02-22
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Test gap coverage for native/manual worktree isolation paths (REQ-109)
**Reference papers:** N/A — testing phase for Phase 45/46 infrastructure changes

## Evaluation Overview

Phase 47 is a pure testing phase. Its deliverable is an expanded test suite, not new product code. This changes the evaluation structure: the primary success signal is not "does the feature work?" but "does the test suite correctly exercise the feature?" — and "does it do so without disturbing what already works?"

Three plans cover three distinct test domains. Plan 47-01 adds unit tests to `context.test.js` and `parallel.test.js` for gemini/opencode isolation paths and worktree_path/branch-naming assertions that were identified as genuine gaps from Phase 46. Plan 47-02 extends `worktree.test.js` with hook handler edge cases and adds plugin.json hook registration tests to `agent-audit.test.js`. Plan 47-03 adds cross-module integration tests to `worktree-parallel-e2e.test.js` that validate the full native and manual isolation pipelines end-to-end between `context.js`, `parallel.js`, and `backend.js`.

The three deferred items from Phase 46 (DEFER-46-01, DEFER-46-02, DEFER-46-03) all pointed to Phase 47 as their validation target. However, those deferrals require a live Claude Code runtime environment — they cannot be resolved by automated testing alone. This evaluation plan is honest about that constraint: the Phase 47 automated tests can validate module wiring and isolation mode logic, but they cannot run actual Claude Code Task spawning. The Phase 46 deferred items remain PENDING and are re-catalogued here with updated rationale.

Because no benchmarks or quality metrics exist for a testing phase, Proxy Metrics are narrow: test count thresholds and coverage maintenance. These are meaningful proxies for "did the required tests get written?" and "did new code paths regress existing coverage?" respectively.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Zero regressions on existing tests | REQ-109 and Phase 47 success criteria | Primary correctness signal — new tests must not break the baseline |
| Test count increase per file | Plan 47-01/02/03 minimum counts | Confirms the required new tests were actually written |
| Coverage thresholds met (context.js) | jest.config.js lines 43-47 (70% lines / 60% functions / 60% branches) | Enforced CI gate; any newly uncovered branch in context.js fails CI |
| plugin.json hook registration present | Plan 47-02 success criteria | Validates structural correctness of WorktreeCreate/Remove registration |
| Cross-module native/manual pipeline consistency | Plan 47-03 success criteria | Integration-level validation that context.js + parallel.js + backend.js agree |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 8 | Test suite runs, counts correct, no regressions, plugin.json structurally valid |
| Proxy (L2) | 3 | Coverage thresholds, full unit suite count, integration test count |
| Deferred (L3) | 3 | Live Claude Code runtime — cannot be resolved by automated tests |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Existing worktree-related unit tests pass without modification

- **What:** All tests in `context.test.js`, `parallel.test.js`, `worktree.test.js`, and `agent-audit.test.js` that existed BEFORE Phase 47 pass with no failures
- **Command:** `npx jest tests/unit/context.test.js tests/unit/parallel.test.js tests/unit/worktree.test.js tests/unit/agent-audit.test.js --no-coverage --verbose 2>&1 | tail -5`
- **Expected:** `Tests: [N] passed, [N] total` with zero failures; N >= 181 (82 + 35 + 58 + 6 baseline counts)
- **Failure means:** Phase 47 edits introduced a regression in an existing test — investigate before marking complete

### S2: context.test.js test count meets minimum after Plan 47-01

- **What:** `context.test.js` contains at least the baseline 82 tests PLUS the 3 new tests required by Plan 47-01 (gemini isolation, opencode isolation, worktree_path non-null for manual mode)
- **Command:** `npx jest tests/unit/context.test.js --no-coverage 2>&1 | tail -3`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 85
- **Failure means:** Fewer than 3 new context tests were written — Plan 47-01 Task 2 is incomplete

### S3: parallel.test.js test count meets minimum after Plan 47-01

- **What:** `parallel.test.js` contains at least the baseline 35 tests PLUS the 1 new test required by Plan 47-01 (worktree_branch present when nativeWorktreeAvailable=true)
- **Command:** `npx jest tests/unit/parallel.test.js --no-coverage 2>&1 | tail -3`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 36
- **Failure means:** The worktree_branch assertion for native isolation was not written — Plan 47-01 Task 2 is incomplete

### S4: worktree.test.js test count meets minimum after Plan 47-02

- **What:** `worktree.test.js` contains at least the baseline 58 tests PLUS the 5 new edge-case tests required by Plan 47-02 (empty-string path, empty-string branch, rename on phase-number path, undefined path, special-character path)
- **Command:** `npx jest tests/unit/worktree.test.js --no-coverage 2>&1 | tail -3`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 63
- **Failure means:** Fewer than 5 new hook handler edge-case tests were written — Plan 47-02 Task 2 is incomplete

### S5: agent-audit.test.js test count meets minimum after Plan 47-02

- **What:** `agent-audit.test.js` contains at least the baseline 6 tests PLUS the 6 new plugin.json registration tests required by Plan 47-02 (hooks object, WorktreeCreate registered, WorktreeRemove registered, SessionStart registered, all hooks have error suppression, command env vars present)
- **Command:** `npx jest tests/unit/agent-audit.test.js --no-coverage 2>&1 | tail -3`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 12
- **Failure means:** Fewer than 6 new plugin.json registration tests were written — Plan 47-02 Task 1 is incomplete

### S6: plugin.json structurally validates WorktreeCreate and WorktreeRemove hooks

- **What:** Direct structural check that plugin.json contains the required hook entries referenced by Plan 47-02 tests, so test assertions have a real target
- **Command:** `node -e "const p = require('./.claude-plugin/plugin.json'); const hc = p.hooks && p.hooks.WorktreeCreate; const hr = p.hooks && p.hooks.WorktreeRemove; console.log('WorktreeCreate_present:', Array.isArray(hc), 'WorktreeRemove_present:', Array.isArray(hr), 'create_has_command:', hc && hc[0] && hc[0].hooks && hc[0].hooks[0] && hc[0].hooks[0].type === 'command', 'remove_has_command:', hr && hr[0] && hr[0].hooks && hr[0].hooks[0] && hr[0].hooks[0].type === 'command');"`
- **Expected:** `WorktreeCreate_present: true WorktreeRemove_present: true create_has_command: true remove_has_command: true`
- **Failure means:** plugin.json does not have the expected hook structure — Plan 47-02's registration tests will fail or test the wrong thing; plugin.json must be fixed before tests can be meaningful

### S7: Integration test suite passes with minimum count after Plan 47-03

- **What:** `worktree-parallel-e2e.test.js` passes with at least the baseline 25 tests PLUS the 9 new integration tests required by Plan 47-03 (native end-to-end x3, manual end-to-end x3, consistency x3)
- **Command:** `npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage 2>&1 | tail -3`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 34
- **Failure means:** Fewer than 9 new integration tests were written — Plan 47-03 Task 2 is incomplete; or a new test revealed a real bug in the module wiring

### S8: Full unit test suite has no regressions and count increases

- **What:** All 28 unit test suites continue to pass and total count increases by at least 15 (4 context + 1 parallel + 5 worktree + 6 agent-audit = 16 minimum new unit tests)
- **Command:** `npm run test:unit 2>&1 | tail -5`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 1560 (1544 baseline + 16 minimum new unit tests); zero failures
- **Failure means:** A regression was introduced in a non-worktree module (unexpected) or fewer new tests were written than required

**Sanity gate:** ALL sanity checks must pass. Any failure blocks phase completion.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of test quality and coverage maintenance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: lib/context.js coverage still meets enforced threshold

- **What:** Line, function, and branch coverage for `lib/context.js` after new tests are added — no regression from the new describe blocks and no coverage loss from any code added by mistake
- **How:** Run Jest with coverage collection focused on context.js
- **Command:** `npx jest tests/unit/context.test.js --coverage --collectCoverageFrom='lib/context.js' 2>&1 | grep -A 5 'context.js'`
- **Target:** Lines >= 70%, Functions >= 60%, Branches >= 60% (per jest.config.js enforced thresholds)
- **Evidence:** `jest.config.js` lines 43-47 enforce these thresholds. Phase 47's new tests for gemini/opencode/worktree_path should increase branch coverage for the isolation_mode conditional, not decrease it. If new tests cause a coverage drop, that indicates the new code paths are not exercised.
- **Correlation with full metric:** MEDIUM — meeting enforced thresholds is necessary but not sufficient; the new tests could pass while covering only already-exercised branches
- **Blind spots:** Does not verify that new tests exercise genuinely NEW code paths (only that total coverage does not regress)
- **Validated:** No — this is a structural proxy; whether the tested behaviors reflect production behavior remains unvalidated

### P2: lib/backend.js coverage still meets enforced threshold

- **What:** Phase 47-03 imports `getBackendCapabilities` directly — verify that integration test usage does not accidentally lower backend.js coverage by exposing untested branches
- **How:** Run Jest with coverage collection on backend.js
- **Command:** `npx jest tests/unit/backend.test.js tests/integration/worktree-parallel-e2e.test.js --coverage --collectCoverageFrom='lib/backend.js' 2>&1 | grep -A 5 'backend.js'`
- **Target:** Lines >= 90%, Functions >= 100%, Branches >= 90% (per jest.config.js enforced thresholds — backend.js has the highest enforced thresholds in the project)
- **Evidence:** `jest.config.js` lines 58-62 enforce these strict thresholds. The 4-backend capability test in Plan 47-03 (loop over claude/codex/gemini/opencode) should maintain or improve branch coverage for `getBackendCapabilities`.
- **Correlation with full metric:** HIGH — backend.js has near-complete coverage already; the threshold is meaningful because it's near the theoretical maximum
- **Blind spots:** Does not validate that backend detection works correctly in a live environment; only unit-level logic is tested
- **Validated:** No — awaiting deferred validation for live Claude Code backend detection

### P3: Total test count increase indicates required tests were written across all plans

- **What:** Combined test count across the 5 target test files after all 3 plans complete; a count below the minimum means some plans wrote fewer tests than specified
- **How:** Sum counts from individual file runs
- **Command:** `npx jest tests/unit/context.test.js tests/unit/parallel.test.js tests/unit/worktree.test.js tests/unit/agent-audit.test.js tests/integration/worktree-parallel-e2e.test.js --no-coverage 2>&1 | grep '^Tests:'`
- **Target:** Total >= 225 (82+35+58+6+25 = 206 baseline + 4+1+5+6+9 = 25 minimum new tests = 231 minimum; 225 is a conservative floor accounting for any plan overlap)
- **Evidence:** Each plan specifies minimum new test counts: 47-01 = 4 new, 47-02 = 11 new (6 agent-audit + 5 worktree), 47-03 = 9 new. The aggregate minimum across all plans is 24 new tests; 225 provides a small buffer.
- **Correlation with full metric:** HIGH for "were the tests written?"; MEDIUM for "are they the right tests?" — count confirms quantity but not quality of assertions
- **Blind spots:** A test file with many trivial no-op tests would satisfy count thresholds without providing meaningful coverage. The sanity checks (S2-S7) address this by verifying specific test types are present.
- **Validated:** No — count proxy only; correctness of assertions requires human review of the test code

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring a live Claude Code runtime. These validations were first identified in Phase 46 and remain unresolvable by automated test suites.

### D1: Native Task spawning with isolation:'worktree' creates correct worktree — DEFER-46-01 (continued)

- **What:** End-to-end validation that execute-phase.md orchestrator, when `isolation_mode: 'native'`, spawns executor agents with `isolation: "worktree"` Task parameter, Claude Code creates worktrees natively, and the branch name is captured correctly from the Task result
- **How:** Run a complete `execute-phase` workflow with Claude Code backend, observe that: (1) no manual `worktree create` call is made, (2) executor receives `<native_isolation>` block in its prompt, (3) worktree is created automatically, (4) branch name is discovered via `git worktree list`
- **Why deferred:** Phase 47's integration tests validate module wiring at the JavaScript level (context.js → parallel.js → backend.js), but they cannot execute `execute-phase.md` as an AI orchestrator instruction. The template's conditional logic requires a live Claude Code run to exercise.
- **Validates at:** Live run with Claude Code backend (post Phase 47 merge, requires manual execution)
- **Depends on:** Phase 46 merged (done), Phase 47 merged, live Claude Code v2.1.50+ environment with native worktree support
- **Target:** No manual `worktree create` call in logs; executor prompt contains `<native_isolation>` block with valid `MAIN_REPO_PATH`; worktree branch captured without error
- **Risk if unmet:** execute-phase.md conditional logic may fall through to manual path on Claude Code backend. Mitigation: manual path is unchanged and fully functional — degraded experience (GRD pre-creates worktrees) rather than a failure.
- **Fallback:** Manual worktree path continues to work for all backends including Claude Code; native isolation is additive

### D2: STATE.md writes route to main_repo_path during native isolation — DEFER-46-02 (continued)

- **What:** Validate that executors running in native worktree isolation correctly write STATE.md to `main_repo_path` (the main repository) rather than the worktree copy
- **How:** Run a native isolation phase execution; after completion, verify `git diff main -- .planning/STATE.md` in the main repo shows expected state updates; worktree STATE.md copy should not contain updates
- **Why deferred:** Phase 47 tests verify that `main_repo_path` is present in the init JSON and non-null (from Phase 46 S5/S6). They cannot verify that executors follow the instruction to `cd "${MAIN_REPO_PATH}" && ...` for state operations — that requires a live executor run.
- **Validates at:** Live run with Claude Code backend (post Phase 47 merge, requires manual execution)
- **Depends on:** DEFER-46-01 resolved (native Task spawning working), live Claude Code environment
- **Target:** After native isolation execution, STATE.md updates appear in main repo; worktree STATE.md copy does not persist after merge
- **Risk if unmet:** This is the highest-risk deferred item. State updates lost to worktree instead of main repo means silent data loss on phase completion.
- **Fallback:** Worktree merge step can be extended to explicitly copy STATE.md from worktree to main repo before worktree deletion

### D3: 4-option completion flow works with native branch names — DEFER-46-03 (continued)

- **What:** Validate all four completion options (merge/PR/keep/discard) function correctly when the branch name is captured from a Claude Code Task result rather than GRD's computed template
- **How:** After native isolation execution, test each option: merge locally, push and create PR, keep branch, discard; verify all succeed without requiring a `grd/{milestone}/{phase}-{slug}` branch format
- **Why deferred:** Phase 47 tests verify `cmdWorktreeMerge` accepts an explicit branch parameter (from Phase 46 S8 and S4). They cannot test the complete orchestrated flow where the branch name originates from a Task result and flows through to completion.
- **Validates at:** Live run with Claude Code backend (post Phase 47 merge, requires manual execution)
- **Depends on:** DEFER-46-01, DEFER-46-02 resolved; live Claude Code environment with a completed native isolation execution
- **Target:** All 4 completion options execute without error for non-GRD branch names
- **Risk if unmet:** Merge/PR options may be blocked for native isolation. Fallback: user can run `git merge` manually; branch is preserved.
- **Fallback:** Manual `git merge` on the native branch; no data loss, only convenience impact

---

## Ablation Plan

**No ablation plan** — Phase 47 adds tests, not algorithmic components. The three plans are complementary test layers (unit gaps, hook edge cases, cross-module integration) rather than competing implementations of the same goal. No component can be removed to measure contribution — all three plan outputs are required to satisfy REQ-109.

The closest ablation-equivalent is the "zero regressions" criterion itself: if removing Phase 47's tests caused the suite to return to 206 tests, the 25+ new tests would represent the isolated contribution of Phase 47. This is implicit in the baseline counts (S1-S8) and does not need a separate ablation condition.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

Phase 47 modifies only test files (`tests/unit/context.test.js`, `tests/unit/parallel.test.js`, `tests/unit/worktree.test.js`, `tests/unit/agent-audit.test.js`, `tests/integration/worktree-parallel-e2e.test.js`). None of these are frontend views.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| context.test.js | Existing test count before Phase 47 | 82 passing | `npx jest tests/unit/context.test.js` pre-phase run |
| parallel.test.js | Existing test count before Phase 47 | 35 passing | `npx jest tests/unit/parallel.test.js` pre-phase run |
| worktree.test.js | Existing test count before Phase 47 | 58 passing | `npx jest tests/unit/worktree.test.js` pre-phase run |
| agent-audit.test.js | Existing test count before Phase 47 | 6 passing | `npx jest tests/unit/agent-audit.test.js` pre-phase run |
| worktree-parallel-e2e.test.js | Existing test count before Phase 47 | 25 passing | `npx jest tests/integration/worktree-parallel-e2e.test.js` pre-phase run |
| unit test suite | All unit tests combined | 1,544 passing | `npm run test:unit` pre-phase run |
| All 5 target files combined | Aggregate baseline | 206 passing | All 5 file run |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/context.test.js                 — Plan 47-01 new gemini/opencode isolation + worktree_path tests
tests/unit/parallel.test.js                — Plan 47-01 new branch naming with native isolation test
tests/unit/worktree.test.js                — Plan 47-02 new hook handler edge-case tests
tests/unit/agent-audit.test.js             — Plan 47-02 new plugin.json registration tests
tests/integration/worktree-parallel-e2e.test.js — Plan 47-03 new cross-module native/manual tests
```

**How to run full evaluation:**
```bash
# Regression gate (Level 1 — run first)
npx jest tests/unit/context.test.js tests/unit/parallel.test.js tests/unit/worktree.test.js tests/unit/agent-audit.test.js tests/integration/worktree-parallel-e2e.test.js --no-coverage

# Per-plan targeted sanity checks
npx jest tests/unit/context.test.js tests/unit/parallel.test.js --no-coverage --verbose
npx jest tests/unit/worktree.test.js tests/unit/agent-audit.test.js --no-coverage --verbose
npx jest tests/integration/worktree-parallel-e2e.test.js --no-coverage --verbose

# Coverage proxy metrics (Level 2)
npx jest tests/unit/context.test.js --coverage --collectCoverageFrom='lib/context.js'
npx jest tests/unit/backend.test.js tests/integration/worktree-parallel-e2e.test.js --coverage --collectCoverageFrom='lib/backend.js'

# Full unit suite health check
npm run test:unit

# Plugin.json structural check (for S6)
node -e "const p = require('./.claude-plugin/plugin.json'); const hc = p.hooks && p.hooks.WorktreeCreate; const hr = p.hooks && p.hooks.WorktreeRemove; console.log('WorktreeCreate_present:', Array.isArray(hc), 'WorktreeRemove_present:', Array.isArray(hr));"
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Existing tests pass (>= 181 combined) | | | |
| S2: context.test.js count >= 85 | | | |
| S3: parallel.test.js count >= 36 | | | |
| S4: worktree.test.js count >= 63 | | | |
| S5: agent-audit.test.js count >= 12 | | | |
| S6: plugin.json WorktreeCreate/Remove structure valid | | | |
| S7: Integration test count >= 34 | | | |
| S8: Full unit suite >= 1560, zero failures | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: context.js coverage (lines/functions/branches) | >= 70% / 60% / 60% | | | |
| P2: backend.js coverage (lines/functions/branches) | >= 90% / 100% / 90% | | | |
| P3: Combined 5-file test count | >= 225 | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-46-01 | Native Task spawning with isolation:'worktree' creates correct worktree | PENDING | Live Claude Code run post-merge |
| DEFER-46-02 | STATE.md writes route to main_repo_path during native isolation | PENDING | Live Claude Code run post-merge |
| DEFER-46-03 | 4-option completion flow works with native branch names | PENDING | Live Claude Code run post-merge |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH (for the testing phase itself)

**Justification:**
- Sanity checks: Strong — each check has an exact command, a numeric minimum count derived from each plan's specified minimum new test count, and a clear failure interpretation. Test count thresholds directly measure "were the required tests written?" which is the primary question for a testing phase.
- Proxy metrics: Well-evidenced for what they measure. Coverage thresholds are enforced by jest.config.js (CI gate), not advisory. The combined count proxy (P3) complements the per-file sanity checks. The blind spot (count does not prove assertion quality) is acknowledged and partially mitigated by sanity checks specifying test type.
- Deferred coverage: Honest. The three Phase 46 deferrals require a live Claude Code runtime that no automated test can substitute for. This plan does not pretend otherwise. Phase 47's integration tests validate module wiring but explicitly cannot validate the orchestrator template's runtime behavior.

**What this evaluation CAN tell us:**
- Whether all required new tests across the 3 plans were written (S2-S7, P3)
- Whether existing tests continue to pass after Phase 47 changes (S1, S8)
- Whether plugin.json has the required WorktreeCreate/WorktreeRemove hook structure (S6)
- Whether coverage thresholds for context.js and backend.js are maintained (P1, P2)
- Whether gemini and opencode backends produce `isolation_mode: 'manual'` at the unit level (S2 new tests)
- Whether `worktree_path` is non-null when `isolation_mode` is 'manual' (S2 new tests)
- Whether `worktree_branch` is still populated when `nativeWorktreeAvailable: true` (S3 new test)
- Whether hook handlers handle empty-string, undefined, and special-character paths without crashing (S4 new tests)
- Whether the full native/manual isolation pipeline is wired correctly between context.js, parallel.js, and backend.js (S7 new integration tests)

**What this evaluation CANNOT tell us:**
- Whether execute-phase.md orchestrator correctly follows native isolation branching in a live Claude Code run (DEFER-46-01 — requires live execution)
- Whether executors write STATE.md to main_repo_path rather than the worktree at runtime (DEFER-46-02 — requires live execution)
- Whether the 4-option completion flow works with non-GRD branch names in practice (DEFER-46-03 — requires live execution)
- Whether hook handlers behave correctly when Claude Code invokes them in a real worktree lifecycle (unit tests mock the filesystem; live invocation may surface edge cases in path parsing)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-22*
