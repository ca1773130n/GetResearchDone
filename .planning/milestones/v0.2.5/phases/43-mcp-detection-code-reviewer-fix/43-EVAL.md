# Evaluation Plan: Phase 43 — MCP Detection & Code Reviewer Fix

**Designed:** 2026-02-21
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Chrome DevTools MCP availability detection waterfall; agent prompt exclusion rule for VERIFICATION.md
**Reference papers:** N/A — engineering implementation phase (no academic papers; detection waterfall pattern mirrors existing `detectBackend` in `lib/backend.js`)

## Evaluation Overview

Phase 43 delivers two independent engineering changes: (1) a new `detectWebMcp()` function added to `lib/backend.js` that exposes Chrome DevTools MCP availability in the init JSON outputs consumed by execute-phase, plan-phase, and verify-work workflows; and (2) a prompt fix to `agents/grd-code-reviewer.md` that prevents the reviewer from flagging missing `VERIFICATION.md` as a blocker when VERIFICATION.md is expected to be created by a later workflow step.

Both changes are deterministic and unit-testable. There are no benchmark datasets, no model quality metrics, and no numerical performance targets from external papers. Evaluation is therefore grounded in behavioral correctness (does the function return the right shape?), interface contracts (does the init JSON include the new fields?), and prompt fidelity (does the agent prompt contain the exclusion rule?).

No meaningful proxy metrics exist for the code reviewer prompt fix — LLM behavior cannot be verified by static analysis alone. The sanity checks cover static presence of the exclusion text; whether the running reviewer agent actually respects the rule requires a deferred integration test against a live execute-phase run.

The test suite baseline at phase start is 1,679 tests passing across 32 suites. Regression prevention is the primary quantitative success criterion for this phase.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| All 1,679 existing tests pass | `npm test` baseline | Regression gate — both changes must not break existing behavior |
| `detectWebMcp` returns correct shape | REQ-96 function contract | Direct verification of the API surface |
| `webmcp_available` present in init JSON | REQ-96 interface contract | Phase 44 depends on this field being present |
| `webmcp_skip_reason` non-null when unavailable | REQ-96 UX requirement | Agents need a human-readable explanation |
| `artifact_exclusions` step present in reviewer prompt | REQ-100 prompt fix | Static verification of the exclusion instruction |
| `VERIFICATION.md` exclusion text present | REQ-100 prompt fix | Guards against false blocker at code-review time |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 checks | Basic functionality, format, and crash-free operation |
| Proxy (L2) | 2 metrics | Test coverage delta and init JSON field presence via CLI |
| Deferred (L3) | 2 validations | Live reviewer behavior; Phase 44 MCP integration |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: backend.test.js passes with new detectWebMcp tests
- **What:** The `lib/backend.js` unit tests pass, including the new `describe('detectWebMcp')` block added by this phase
- **Command:** `npx jest tests/unit/backend.test.js --verbose 2>&1 | tail -20`
- **Expected:** All tests PASS, no failures. New `detectWebMcp` describe block appears in output.
- **Failure means:** The `detectWebMcp` function is missing, has the wrong signature, or its detection logic is broken for one of the tested conditions (config / env / default).

### S2: context.test.js passes with new webmcp_available tests
- **What:** The `lib/context.js` unit tests pass, including new cases that assert `webmcp_available` and `webmcp_skip_reason` are present in `cmdInitExecutePhase`, `cmdInitPlanPhase`, and `cmdInitVerifyWork` outputs
- **Command:** `npx jest tests/unit/context.test.js --verbose 2>&1 | tail -20`
- **Expected:** All tests PASS. New webmcp assertions appear and pass.
- **Failure means:** `lib/context.js` did not import or call `detectWebMcp`, or the fields were not added to one of the three init functions.

### S3: Full test suite passes — no regressions
- **What:** All 1,679 pre-existing tests (plus new tests from this phase) pass with no failures
- **Command:** `npm test -- --silent 2>&1 | tail -8`
- **Expected:** `Tests: [N] passed, [N] total` where N >= 1679 and 0 failures. `Test Suites: 32 passed` (or 32+ if new suite files added).
- **Failure means:** A regression was introduced in an existing test. The new code broke an existing interface contract.

### S4: detectWebMcp exported from lib/backend.js
- **What:** The function is actually exported and callable
- **Command:** `node -e "const b = require('./lib/backend'); console.log(typeof b.detectWebMcp);" 2>&1`
- **Expected:** Outputs `function`
- **Failure means:** The export was omitted from `module.exports` in `lib/backend.js`.

### S5: webmcp_available field present in init execute-phase JSON output
- **What:** The `cmdInitExecutePhase` CLI output includes the new field
- **Command:** `node bin/grd-tools.js init execute-phase 43 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); console.log('webmcp_available' in d, typeof d.webmcp_available);"`
- **Expected:** Outputs `true boolean`
- **Failure means:** The field was not added to the result object in `cmdInitExecutePhase`, or the command errors before outputting JSON.

### S6: grd-code-reviewer.md contains the artifact_exclusions step
- **What:** The agent prompt includes the dedicated exclusion step for VERIFICATION.md
- **Command:** `grep -c "artifact_exclusions" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-code-reviewer.md`
- **Expected:** Outputs `1` (exactly one occurrence of the step name)
- **Failure means:** The `artifact_exclusions` step was not added to the agent prompt, so the code reviewer will continue to flag missing VERIFICATION.md as a blocker.

### S7: grd-code-reviewer.md contains the VERIFICATION.md plan-alignment guard
- **What:** The plan alignment section (Stage 1.1) contains the explicit exclusion note
- **Command:** `grep -c "Exclude post-review artifacts" /Users/edward.seo/dev/private/project/harness/GetResearchDone/agents/grd-code-reviewer.md`
- **Expected:** Outputs `1` (the guard appears exactly once)
- **Failure means:** Only the `artifact_exclusions` step was added but the inline guard in Stage 1.1 Plan Alignment was missed, leaving a secondary path for the false blocker.

**Sanity gate:** ALL 7 sanity checks must pass. Any failure blocks progression to Phase 44.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: New test count delta — detectWebMcp and webmcp_available coverage
- **What:** The number of new passing tests added by this phase, confirming test surface matches the stated plan requirements
- **How:** Subtract pre-phase test count (1,679) from post-phase total
- **Command:** `npm test -- --silent 2>&1 | grep "Tests:" | grep -oE "[0-9]+ passed"`
- **Target:** At least 8 new tests (6 for `detectWebMcp` detection conditions + at least 2 for `webmcp_available` in context outputs). Total test count >= 1,687.
- **Evidence:** The plan explicitly lists 6 backend test cases and 3 context test cases for the new functionality. Minimum net addition is 8 after accounting for possible test merging.
- **Correlation with full metric:** HIGH — test count directly reflects whether the specified test cases were written. It does not verify test quality or coverage completeness, but presence of tests is a necessary condition.
- **Blind spots:** A developer could write 8 trivially-passing tests (e.g., `expect(true).toBe(true)`) and pass this metric. The metric counts tests, not test correctness. Correctness is partially covered by S1–S3.
- **Validated:** No — awaiting full suite pass at S3.

### P2: ESLint clean on modified files
- **What:** The files modified by this phase (`lib/backend.js`, `lib/context.js`, `agents/grd-code-reviewer.md`) pass ESLint with zero errors
- **How:** Run ESLint on the JS files only (the .md file is not linted)
- **Command:** `npm run lint 2>&1 | tail -5`
- **Target:** Zero lint errors. Exit code 0.
- **Evidence:** The project runs `npm run lint` as the pre-commit hook. Any lint error would block the commit. This metric ensures the implementation follows existing code style (single-quoted strings, `'use strict'`, no unused variables).
- **Correlation with full metric:** MEDIUM — lint compliance does not verify behavioral correctness, but it does enforce that the new function follows the same patterns as `detectBackend` (the existing analogous function).
- **Blind spots:** ESLint does not check logic correctness, async behavior, or edge case handling. A function can be lint-clean and still behave incorrectly.
- **Validated:** No — confirmed at commit time by pre-commit hook.

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Live code reviewer does not block on missing VERIFICATION.md — DEFER-43-01
- **What:** When the grd-code-reviewer agent runs as part of a real execute-phase workflow on a phase that has no VERIFICATION.md yet (because verify-phase has not run), the reviewer produces no BLOCKER finding for missing VERIFICATION.md
- **How:** Trigger a full `/grd:execute-phase 44` run with code review enabled. Inspect the generated REVIEW.md for any finding mentioning VERIFICATION.md.
- **Why deferred:** The grd-code-reviewer is an LLM agent. Its behavior depends on the full runtime context (prompt, live reading of PLAN.md, git history, etc.). Static grep of the prompt text (S6, S7) confirms the instruction is present but cannot confirm the model will follow it in practice.
- **Validates at:** phase-44-webmcp-integration (first real execute-phase run after this fix)
- **Depends on:** Phase 44 plan executed with code_review_enabled = true; resulting REVIEW.md exists
- **Target:** Zero BLOCKER or WARNING findings in REVIEW.md that reference "VERIFICATION.md" or "verification"
- **Risk if unmet:** The code reviewer continues to produce false blockers that halt execute-phase workflows. The fix may need to be strengthened (stronger negative instruction, moved to a more prominent section of the prompt, or system-level exclusion added to the review harness in execute-phase.md).
- **Fallback:** If the LLM still flags VERIFICATION.md despite the prompt fix, add a post-processing filter in the execute-phase orchestrator that removes VERIFICATION.md findings from the review output before the severity gate check.

### D2: Chrome DevTools MCP detection works in a live Chrome DevTools MCP environment — DEFER-43-02
- **What:** When Chrome DevTools MCP is actually running and configured (via `~/.claude.json` mcpServers or environment variable), `detectWebMcp()` correctly returns `{ available: true }` and downstream init JSON sets `webmcp_available: true`
- **How:** Set up a test environment with a Chrome DevTools MCP server entry in `~/.claude.json`, run `node bin/grd-tools.js init execute-phase 44` and verify `webmcp_available: true` in output
- **Why deferred:** The test environment for Phase 43 does not have Chrome DevTools MCP configured. Unit tests mock the filesystem reads; live integration requires actual MCP server configuration present in the developer's home directory.
- **Validates at:** phase-44-webmcp-integration (Phase 44 begins with WebMCP-aware workflows)
- **Depends on:** Chrome DevTools MCP server configured in `~/.claude.json` or `CHROME_DEVTOOLS_MCP=true` env var set; Phase 44 execute-phase run
- **Target:** `webmcp_available: true` in init JSON output; Phase 44 workflows proceed through WebMCP sanity checks without "MCP not available" skip messages
- **Risk if unmet:** Phase 44's conditional WebMCP features always see `webmcp_available: false` even when MCP is running, causing all WebMCP sanity checks to be silently skipped. Detection logic may need refinement (additional env var names, different config file paths, MCP socket detection).
- **Fallback:** Add `webmcp.enabled: true` to `.planning/config.json` as a manual override (the config-check branch of the detection waterfall handles this).

---

## Ablation Plan

**No ablation plan** — This phase implements two independent, single-component changes:
1. `detectWebMcp()` is a new function with no sub-variants to ablate.
2. The code reviewer prompt fix is a prompt-only change with one correct state (exclusion present) and one incorrect state (exclusion absent). No ablation needed.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test suite count | Number of passing tests before phase | 1,679 tests | `npm test` on main branch |
| Test suites | Number of passing suites before phase | 32 suites | `npm test` on main branch |
| Lint pass rate | Pre-phase lint status | 0 errors (enforced by pre-commit hook) | `npm run lint` |
| detectWebMcp exists | Pre-phase state | Does not exist | `grep -r detectWebMcp lib/` → no output |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/backend.test.js         (describe('detectWebMcp') block — added by this phase)
tests/unit/context.test.js         (webmcp_available assertions — added by this phase)
```

**How to run full evaluation:**
```bash
# Run all sanity checks in sequence
node -e "const b = require('./lib/backend'); console.log('S4 detectWebMcp exported:', typeof b.detectWebMcp)"
npx jest tests/unit/backend.test.js --verbose 2>&1 | tail -20
npx jest tests/unit/context.test.js --verbose 2>&1 | tail -20
npm test -- --silent 2>&1 | tail -8
node bin/grd-tools.js init execute-phase 43 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); console.log('S5 webmcp_available present:', 'webmcp_available' in d)"
grep -c "artifact_exclusions" agents/grd-code-reviewer.md
grep -c "Exclude post-review artifacts" agents/grd-code-reviewer.md
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: backend.test.js passes | | | |
| S2: context.test.js passes | | | |
| S3: Full suite — no regressions | | | |
| S4: detectWebMcp exported | | | |
| S5: webmcp_available in CLI output | | | |
| S6: artifact_exclusions step present | | | |
| S7: Exclude post-review artifacts guard present | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: New test count delta | >= 8 new tests (total >= 1,687) | | | |
| P2: ESLint clean on modified files | 0 errors | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-43-01 | Live reviewer does not block on missing VERIFICATION.md | PENDING | phase-44-webmcp-integration |
| DEFER-43-02 | detectWebMcp returns available:true with live MCP configured | PENDING | phase-44-webmcp-integration |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 7 checks cover both the function contract and the agent prompt change. Each check is independently executable with an exact command. The checks directly test the stated requirements (REQ-96 and REQ-100).
- Proxy metrics: Weakly-evidenced for behavioral correctness (test count and lint do not prove the detection logic is right), but they do enforce structural completeness. Confidence: MEDIUM.
- Deferred coverage: Comprehensive for the two risks that cannot be verified statically: LLM behavior (D1) and live-environment detection (D2). Both have clear validates_at references (Phase 44).

**What this evaluation CAN tell us:**
- Whether `detectWebMcp()` is exported and callable from `lib/backend.js`
- Whether the three init functions (`cmdInitExecutePhase`, `cmdInitPlanPhase`, `cmdInitVerifyWork`) include `webmcp_available` and `webmcp_skip_reason` in their JSON output
- Whether the detection waterfall logic passes the unit-tested conditions (config override, env var presence, default-false)
- Whether the agent prompt text contains the required exclusion instruction
- Whether any existing test was broken by the changes

**What this evaluation CANNOT tell us:**
- Whether the running grd-code-reviewer LLM actually follows the exclusion instruction (deferred to DEFER-43-01 at Phase 44)
- Whether `detectWebMcp()` correctly detects a live Chrome DevTools MCP instance in a real developer environment (deferred to DEFER-43-02 at Phase 44)
- Whether the `~/.claude.json` mcpServers detection path handles all real-world configuration shapes (deferred — depends on real MCP config file availability)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-21*
