# Evaluation Plan: Phase 77 — Testing and Documentation

**Designed:** 2026-03-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Unit test coverage, documentation completeness
**Reference papers:** N/A — this is a testing/documentation phase, no research papers

## Evaluation Overview

Phase 77 is a pure testing and documentation phase. It adds no new runtime features — all functional changes are made in Phases 74-76. What Phase 77 delivers is: (1) automated test assertions that verify Phase 74-76 changes are correctly implemented and will catch future regressions, and (2) updated CLAUDE.md documenting all v0.3.12 changes for developers and Claude agents.

Because this phase produces tests rather than features, the evaluation structure differs from a typical R&D phase. The primary question is not "does a new method work?" but rather: "do the tests accurately cover the things they claim to cover, and does the documentation accurately describe the system?"

The key risk in a testing phase is **false coverage**: tests that pass but don't actually catch the bugs they are designed to catch. The secondary risk is **stale documentation**: docs that describe intended behavior rather than actual implemented behavior.

No proxy metrics exist for documentation quality — that is deferred to a human review checkpoint. Test coverage is measurable immediately via Jest's coverage instrumentation.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Jest test pass/fail | jest test runner | Primary gate — tests must pass to be meaningful |
| Coverage percentages by file | jest --coverage | Per-file thresholds enforced in jest.config.js |
| Test assertion count (new) | grep/wc | Ensures the new test blocks are non-trivial |
| CLAUDE.md section presence | grep | Verifies each required documentation section was added |
| Lint pass | npm run lint | Ensures test code doesn't introduce lint errors |
| Type-check pass | npm run build:check | Ensures new test code is type-correct TypeScript |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Basic functionality and format verification |
| Proxy (L2) | 3 | Automated quality approximation |
| Deferred (L3) | 2 | Human review and integration validation |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Target test files exist

- **What:** All three test files referenced in Plan 77-01 have been modified (non-trivially)
- **Command:** `wc -l /Users/neo/Developer/Projects/GetResearchDone/tests/unit/backend.test.ts /Users/neo/Developer/Projects/GetResearchDone/tests/unit/context.test.ts /Users/neo/Developer/Projects/GetResearchDone/tests/unit/agent-audit.test.ts`
- **Expected:** backend.test.ts > 1165 lines (pre-phase baseline), context.test.ts > 3149 lines (baseline), agent-audit.test.ts > 161 lines (baseline). All three must grow.
- **Failure means:** Plan 77-01 was not executed or wrote to wrong paths.

### S2: Target test files pass in isolation

- **What:** The three test files run without error (no syntax errors, import failures, or crashes)
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/backend.test.ts tests/unit/context.test.ts tests/unit/agent-audit.test.ts --no-coverage 2>&1 | tail -20`
- **Expected:** Output contains "Tests: X passed" with 0 failures and 0 errors
- **Failure means:** New test code has a syntax error, broken import, or assertion that crashes the test runner. Fix before proceeding.

### S3: Full test suite passes with 0 failures

- **What:** No regressions introduced by Phase 77 edits
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test 2>&1 | tail -30`
- **Expected:** "Test Suites: X passed, X total" with 0 failures. All per-file coverage thresholds met (as defined in jest.config.js).
- **Failure means:** Either (a) new tests break existing assertions, (b) editing existing tests inadvertently changed their pass/fail behavior, or (c) coverage thresholds were lowered (forbidden by plan).

### S4: New v0.3.12 describe blocks are present in test files

- **What:** The specific new describe/test blocks from the plan exist in the files
- **Command:** `grep -c "v0.3.12\|mcp_elicitation_available\|model_overrides_available\|StopFailure\|PostCompact\|effort.*maxTurns\|Agent frontmatter" /Users/neo/Developer/Projects/GetResearchDone/tests/unit/backend.test.ts /Users/neo/Developer/Projects/GetResearchDone/tests/unit/context.test.ts /Users/neo/Developer/Projects/GetResearchDone/tests/unit/agent-audit.test.ts`
- **Expected:** Non-zero match count in each file for the relevant terms (backend.test.ts: "v0.3.12", context.test.ts: "mcp_elicitation_available", agent-audit.test.ts: "StopFailure" and "PostCompact")
- **Failure means:** The plan's required test blocks were not added. The executor must re-run.

### S5: CLAUDE.md required sections exist

- **What:** All five documentation sections required by Plan 77-02 are present
- **Command:** `grep -c "Backend Capabilities\|Agent Frontmatter\|effort.*slash\|CLAUDE_PLUGIN_DATA\|Backend-Specific Notes\|Codex.*realtime\|Gemini.*tracker\|OpenCode.*worktree" /Users/neo/Developer/Projects/GetResearchDone/CLAUDE.md`
- **Expected:** Match count >= 5 (at least one match per required section/topic)
- **Failure means:** Plan 77-02 was not executed or sections were added under different headings. Check the doc structure manually.

### S6: Lint passes on all modified files

- **What:** No new lint errors introduced by Phase 77
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint 2>&1 | tail -10`
- **Expected:** Exit code 0, no error lines in output
- **Failure means:** New test code has a lint violation. Common causes: unused variables, `any` type usage. Fix before marking phase complete.

### S7: TypeScript type-check passes

- **What:** New test code is type-correct TypeScript (no tsc errors)
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check 2>&1 | tail -20`
- **Expected:** Exit code 0, no type errors reported
- **Failure means:** New test code uses incorrect types. Common causes: `any` cast without justification, wrong interface shape. Fix before marking phase complete.

**Sanity gate:** ALL seven sanity checks must pass. Any failure blocks progression to proxy metric evaluation and blocks the phase from being marked complete.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of test quality and documentation completeness.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: New test assertion count

- **What:** Number of new `expect(...)` calls added across the three test files
- **How:** Count expect() calls in the diff of each test file against baseline
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && git diff HEAD~1 -- tests/unit/backend.test.ts tests/unit/context.test.ts tests/unit/agent-audit.test.ts | grep "^+.*expect(" | wc -l`
- **Target:** >= 25 new assertions (6 capability flags x 4 backends = 24 at minimum for backend alone; context adds 2+; agent-audit adds 4+)
- **Evidence:** Plan 77-01 specifies: 6 capability flags across 4 backends (24 assertions), 4 model mapping assertions, 2 init context field assertions, 2 hook registration assertions, 3 agent frontmatter assertions = 35+ total. 25 is a conservative floor.
- **Correlation with full metric:** MEDIUM — raw assertion count doesn't measure assertion quality, but a low count indicates the plan's requirements weren't fully implemented
- **Blind spots:** Assertions could be trivially weak (e.g., `expect(x).toBeDefined()` instead of value equality). Does not measure whether the assertions would catch a regression.
- **Validated:** No — awaiting deferred validation at phase-77-post-execution-review

### P2: backend.ts coverage maintained or improved

- **What:** Line and branch coverage on lib/backend.ts at or above pre-phase thresholds
- **How:** Run jest coverage on backend.ts specifically
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/backend.test.ts --coverage --collectCoverageFrom='lib/backend.ts' 2>&1 | grep -A5 "backend.ts"`
- **Target:** Lines >= 95%, Functions >= 100%, Branches >= 88% (matching jest.config.js thresholds for lib/backend.ts)
- **Evidence:** jest.config.js enforces these thresholds. Adding new tests for new code paths should maintain or increase coverage; if coverage drops, it means new source code was added in Phases 74-76 that the Phase 77 tests don't reach.
- **Correlation with full metric:** HIGH — jest coverage directly measures what we care about
- **Blind spots:** Coverage measures line execution, not correctness of assertions. A test that exercises a line without asserting anything meaningful still counts as covered.
- **Validated:** No — confirmed by full `npm test` run

### P3: CLAUDE.md line growth matches expected additions

- **What:** CLAUDE.md grew by approximately the expected number of lines for the new sections
- **How:** Compare CLAUDE.md line count before and after phase execution
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && git diff HEAD~1 -- CLAUDE.md | grep "^+" | wc -l`
- **Target:** >= 60 new lines added (capability flags table ~20 lines, agent frontmatter section ~10 lines, /effort note ~5 lines, plugin data boundary ~8 lines, backend-specific notes ~20 lines = ~63 lines minimum)
- **Evidence:** Each required section in Plan 77-02 has a defined scope. 60 lines is a conservative lower bound accounting for the capability flags table (15 flags x 4 backends) plus prose.
- **Correlation with full metric:** LOW — line count doesn't measure accuracy or completeness of the documentation. A section can add 60 lines of wrong information.
- **Blind spots:** Does not verify correctness, only presence. Accuracy requires human review (see deferred).
- **Validated:** No — accuracy deferred to DEFER-77-02

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring human judgment or integration not available at phase execution time.

### D1: Test regression-catching effectiveness — DEFER-77-01

- **What:** Whether the new tests would actually catch a future regression in the capability flags, model mappings, init context, hook registrations, or agent frontmatter they claim to test
- **How:** Introduce a deliberate regression in each tested area (e.g., change `smart_approvals` to `false` for codex in backend.ts) and confirm the new tests fail. Then revert.
- **Why deferred:** Requires deliberately breaking production code to verify test sensitivity — not appropriate during phase execution. Requires integration with the full suite to avoid noise.
- **Validates at:** phase-78-or-milestone-v0.3.12-ship (manual pre-ship validation step)
- **Depends on:** Phase 77 tests passing (S2, S3); a clean working tree to revert the deliberate regression
- **Target:** Each new test block catches its corresponding regression within 1 run
- **Risk if unmet:** Tests may be present but ineffective (testing the wrong thing or testing with weak assertions). False confidence: we think the system is covered but it isn't.
- **Fallback:** If regression-catching test is discovered to be weak, add targeted assertion strengthening as a follow-up plan (77-03 if needed)

### D2: CLAUDE.md documentation accuracy review — DEFER-77-02

- **What:** Whether the documentation added in Plan 77-02 accurately describes the actual implemented behavior of Phases 74-76
- **How:** Human reviewer cross-checks each documentation claim against source code (lib/backend.ts BACKEND_CAPABILITIES, EFFORT_PROFILES; .claude-plugin/plugin.json hooks; agents/ frontmatter)
- **Why deferred:** Automated tools can verify presence of sections (S5) and line growth (P3) but cannot verify accuracy of technical claims. Accuracy requires a human reading both the doc and the source.
- **Validates at:** phase-78-or-milestone-v0.3.12-ship
- **Depends on:** CLAUDE.md updated (Plan 77-02 complete), Phases 74-76 all complete so source is final
- **Target:** Zero factual inaccuracies in the capability flags table or backend-specific notes
- **Risk if unmet:** Incorrect documentation misleads future Claude agents and developers. The capability flags table in particular is consumed by agent prompts — wrong values cause wrong behavior.
- **Fallback:** Documentation correction is low-cost (no test impact). Correction can be a quick-task rather than a full phase.

---

## Ablation Plan

**No ablation plan** — Phase 77 adds tests and documentation, not new algorithms or components. There are no sub-components to isolate or compare. The plans (77-01 and 77-02) are independently verifiable via their own sanity checks.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 77 modifies only test files and CLAUDE.md.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| backend.test.ts line count | Pre-phase line count | 1165 lines | `wc -l tests/unit/backend.test.ts` at phase start |
| context.test.ts line count | Pre-phase line count | 3149 lines | `wc -l tests/unit/context.test.ts` at phase start |
| agent-audit.test.ts line count | Pre-phase line count | 161 lines | `wc -l tests/unit/agent-audit.test.ts` at phase start |
| backend.ts coverage: lines | Per jest.config.js threshold | >= 95% | jest.config.js |
| backend.ts coverage: functions | Per jest.config.js threshold | >= 100% | jest.config.js |
| backend.ts coverage: branches | Per jest.config.js threshold | >= 88% | jest.config.js |
| Full suite pass | Pre-phase state | 0 failures | `npm test` before phase |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/backend.test.ts
tests/unit/context.test.ts
tests/unit/agent-audit.test.ts
```

**How to run sanity checks:**
```bash
# S1: File size check
wc -l /Users/neo/Developer/Projects/GetResearchDone/tests/unit/backend.test.ts \
       /Users/neo/Developer/Projects/GetResearchDone/tests/unit/context.test.ts \
       /Users/neo/Developer/Projects/GetResearchDone/tests/unit/agent-audit.test.ts

# S2: Target files in isolation
cd /Users/neo/Developer/Projects/GetResearchDone && \
  npx jest tests/unit/backend.test.ts tests/unit/context.test.ts tests/unit/agent-audit.test.ts --no-coverage

# S3: Full suite
cd /Users/neo/Developer/Projects/GetResearchDone && npm test

# S4: New describe blocks present
grep -c "v0.3.12\|mcp_elicitation_available\|StopFailure\|PostCompact\|Agent frontmatter" \
  /Users/neo/Developer/Projects/GetResearchDone/tests/unit/backend.test.ts \
  /Users/neo/Developer/Projects/GetResearchDone/tests/unit/context.test.ts \
  /Users/neo/Developer/Projects/GetResearchDone/tests/unit/agent-audit.test.ts

# S5: CLAUDE.md sections
grep -c "Backend Capabilities\|Agent Frontmatter\|CLAUDE_PLUGIN_DATA\|Backend-Specific Notes\|Codex.*realtime\|Gemini.*tracker\|OpenCode.*worktree" \
  /Users/neo/Developer/Projects/GetResearchDone/CLAUDE.md

# S6: Lint
cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint

# S7: Type-check
cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check
```

**How to run proxy metrics:**
```bash
# P1: New assertions count
cd /Users/neo/Developer/Projects/GetResearchDone && \
  git diff HEAD~1 -- tests/unit/backend.test.ts tests/unit/context.test.ts tests/unit/agent-audit.test.ts \
  | grep "^+.*expect(" | wc -l

# P2: backend.ts coverage
cd /Users/neo/Developer/Projects/GetResearchDone && \
  npx jest tests/unit/backend.test.ts --coverage --collectCoverageFrom='lib/backend.ts' \
  2>&1 | grep -A5 "backend.ts"

# P3: CLAUDE.md line growth
cd /Users/neo/Developer/Projects/GetResearchDone && \
  git diff HEAD~1 -- CLAUDE.md | grep "^+" | wc -l
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: File sizes grown | [PASS/FAIL] | [wc -l output] | |
| S2: Target files pass isolation | [PASS/FAIL] | [test counts] | |
| S3: Full suite 0 failures | [PASS/FAIL] | [suite summary] | |
| S4: New describe blocks present | [PASS/FAIL] | [grep counts] | |
| S5: CLAUDE.md sections exist | [PASS/FAIL] | [grep count] | |
| S6: Lint passes | [PASS/FAIL] | [lint output] | |
| S7: Type-check passes | [PASS/FAIL] | [tsc output] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: New assertion count | >= 25 | [actual] | [MET/MISSED] | |
| P2: backend.ts coverage lines | >= 95% | [actual %] | [MET/MISSED] | |
| P2: backend.ts coverage branches | >= 88% | [actual %] | [MET/MISSED] | |
| P3: CLAUDE.md line growth | >= 60 lines | [actual] | [MET/MISSED] | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-77-01 | Test regression-catching effectiveness | PENDING | phase-78-or-v0.3.12-ship |
| DEFER-77-02 | CLAUDE.md documentation accuracy | PENDING | phase-78-or-v0.3.12-ship |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM

**Justification:**
- Sanity checks: Adequate — all seven checks are fully automated, deterministic, and directly measure whether the phase's required artifacts exist and function
- Proxy metrics: Weakly evidenced for P1 and P3 (line count / assertion count are coarse proxies), HIGH evidence for P2 (jest coverage is exactly what we want to measure for test coverage)
- Deferred coverage: Partial — the most important question (do tests actually catch regressions?) is deferred. This is unavoidable without dedicated mutation testing tooling.

**What this evaluation CAN tell us:**
- Whether the required tests were added (S1-S4)
- Whether all tests pass without failure (S2, S3)
- Whether CLAUDE.md was updated with the required sections (S5)
- Whether no lint or type errors were introduced (S6, S7)
- Whether backend.ts coverage was maintained above the project threshold (P2)

**What this evaluation CANNOT tell us:**
- Whether the test assertions are strong enough to catch a real regression in Phase 74-76 code (deferred to DEFER-77-01)
- Whether the CLAUDE.md documentation accurately reflects the actual behavior vs. intended behavior (deferred to DEFER-77-02)
- Whether the capability flags table values in CLAUDE.md are factually correct (requires human cross-check against lib/backend.ts)

**Note on phase dependency:** Phase 77 tests are designed to verify Phase 74-76 changes. If Phases 74-76 are not yet complete (or are only partially complete), some tests in Plan 77-01 will fail because the source code they test does not yet have the expected values. The sanity checks (S2, S3) will surface this immediately. This is expected behavior — Phase 77 should only be executed after Phases 74-76 are shipped.

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-19*
