# Evaluation Plan: Phase 96 — Closed-Loop Metric-Driven Refinement

**Designed:** 2026-03-25
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** NERFIFY Stage 4 — 3-branch refinement loop adapted to GRD domain; critique agent spawning; convergence detection via epsilon-delta on metric snapshots
**Reference papers:** NERFIFY (internal design spec) — PSNR-minima ROI analysis adapted to test coverage minima, type error density, lint violation clustering

## Evaluation Overview

Phase 96 introduces a closed-loop refinement system to the autopilot pipeline. The deliverables are a new `lib/refinement.ts` module (5 exported functions), new types in `lib/types.ts`, a `grd-critique-agent.md` agent definition, two new functions in `lib/autopilot.ts` (`buildCritiqueAgentPrompt`, `runRefinementLoop`), wiring of the refinement loop into the autopilot execute-wave sequence, and integration tests.

The domain adaptation from NERFIFY is central to this phase. NERFIFY's PSNR-minima ROI analysis identifies regions of an image where reconstruction quality dips; the GRD adaptation identifies phases or iterations where test coverage dips (local minima) or type error / lint counts spike (local maxima). Convergence detection mirrors NERFIFY's pixel-convergence criterion but operates on three orthogonal quality dimensions: coverage, type errors, lint violations.

What can be verified now: type correctness, lint cleanliness, unit test pass rate, coverage thresholds on `lib/refinement.ts`, function export shape, and agent file structure. What cannot be verified now: end-to-end refinement loop behavior on a real project, effectiveness of critique agent patches on real codebases, whether convergence is achieved in a useful number of iterations in practice. Those validations require live autopilot runs on a real project and are deferred.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| lib/refinement.ts line coverage >= 85% | Plan 96-01 success criteria + jest.config.js threshold pattern | Direct proxy for function-level correctness on the core refinement logic |
| lib/refinement.ts branch coverage >= 75% | Plan 96-01 success criteria + jest.config.js threshold pattern | Ensures edge cases (< 3 snapshots, tie-break, epsilon boundary) are tested |
| lib/autopilot.ts coverage maintained (>= 83% lines, >= 75% branches) | Existing jest.config.js threshold (DO NOT LOWER) | Regression guard: plan 03 adds tests and wiring — coverage must not drop |
| npm run build:check passes (zero tsc errors) | Project standard (every plan verifies this) | Type safety invariant; this project uses strict: true with zero any |
| npm run lint passes (zero ESLint errors) | Project standard | Code style invariant; pre-commit hook enforces this |
| Full test suite passes with no regressions | Plan 96-03 success criteria | Integration gate: new code must not break 3,672 existing tests |
| runRefinementLoop integration tests: 6 scenarios | Plan 96-03 must_haves | Covers convergence, max-iterations, skip (agent missing), skip (config false), error non-blocking, status markers |
| buildCritiquePrompt branch tests: 5 scenarios | Plan 96-03 must_haves | All three branches (macro/geometry/generative) + empty/multiple minimaRegions |
| grd-critique-agent.md structural validity | Plan 96-02 must_haves | Agent file must have valid frontmatter and all three branch protocols |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Basic functionality, format, and export verification |
| Proxy (L2) | 5 | Automated quality metrics that approximate correctness |
| Deferred (L3) | 3 | Full validation requiring live autopilot runs or real-project execution |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: lib/refinement.ts exports all five functions

- **What:** The new module exports exactly the five functions required by the phase plan
- **Command:** `node -e "const r = require('./lib/refinement'); console.log(['collectMetrics','detectMinima','checkConvergence','classifyBranch','buildCritiquePrompt'].every(f => typeof r[f] === 'function') ? 'OK' : 'MISSING')"`  (run from `/Users/neo/Developer/Projects/GetResearchDone`)
- **Expected:** `OK`
- **Failure means:** Module was not created or was created with missing/renamed exports — plan 01 did not complete correctly

### S2: lib/types.ts contains all five new refinement type names

- **What:** The five new interfaces/types are present in lib/types.ts
- **Command:** `grep -c "RefinementMetrics\|MetricSnapshot\|CritiqueBranch\|ConvergenceConfig\|MinimaRegion" /Users/neo/Developer/Projects/GetResearchDone/lib/types.ts`
- **Expected:** `5` (each name appears at least once)
- **Failure means:** Type definitions were not added — downstream type imports will fail

### S3: npm run build:check passes (zero TypeScript errors)

- **What:** The TypeScript compiler reports no errors across the entire project
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check 2>&1 | tail -3`
- **Expected:** No output or `Found 0 errors.`
- **Failure means:** Type error introduced — must be fixed before proxy checks are meaningful

### S4: npm run lint passes (zero ESLint errors)

- **What:** ESLint reports no errors on bin/ and lib/
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint 2>&1 | tail -5`
- **Expected:** No errors reported (warnings acceptable if project policy permits)
- **Failure means:** Code style violation — pre-commit hook will block; fix before merging

### S5: agents/grd-critique-agent.md exists with valid frontmatter

- **What:** The critique agent definition file exists and has the required frontmatter keys
- **Command:** `head -10 /Users/neo/Developer/Projects/GetResearchDone/agents/grd-critique-agent.md`
- **Expected:** Frontmatter block with `effort: low` and `maxTurns: 20` visible
- **Failure means:** Plan 02 did not complete or agent file was written without required frontmatter

### S6: grd-critique-agent.md contains all three branch protocols

- **What:** The agent definition references all three branch names
- **Command:** `grep -c "Macro\|Geometry\|Generative\|macro\|geometry\|generative" /Users/neo/Developer/Projects/GetResearchDone/agents/grd-critique-agent.md`
- **Expected:** >= 6 (each branch name appears in at least two places)
- **Failure means:** One or more branch protocols are missing from the agent definition

### S7: runRefinementLoop is wired into autopilot execute-wave

- **What:** The function call appears in lib/autopilot.ts after knowledge mining
- **Command:** `grep -n "runRefinementLoop\|runKnowledgeMining" /Users/neo/Developer/Projects/GetResearchDone/lib/autopilot.ts | head -20`
- **Expected:** Lines showing both `runKnowledgeMining` and `runRefinementLoop` with `runRefinementLoop` appearing after `runKnowledgeMining` in the execute-wave sequence
- **Failure means:** Plan 03 wiring task did not complete — refinement loop will never run in production

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to proxy metrics.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and quality. These approximate real-world effectiveness but do not substitute for live-run validation.

**IMPORTANT:** All proxy metrics are tagged `validated: false`. They measure automated properties of the code, not end-to-end refinement effectiveness on a real project.

### P1: lib/refinement.ts unit tests — all pass with 85%+ line coverage

- **What:** TDD cycle completed; all unit tests for the five refinement functions pass and meet the coverage threshold added in jest.config.js
- **How:** Run jest with coverage on just the refinement test file
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/refinement.test.ts --coverage 2>&1 | grep -E "Tests:|refinement.ts|Lines"`
- **Target:** All tests PASS; `lib/refinement.ts` line coverage >= 85%, branch coverage >= 75%
- **Evidence:** Plan 96-01 explicitly requires this threshold and adds it to jest.config.js; the coverage threshold pattern is consistent with all other lib/ modules in the project (range 74–100%)
- **Correlation with full metric:** HIGH — unit tests directly verify parsing logic (collectMetrics), algorithmic correctness (detectMinima, checkConvergence), classification correctness (classifyBranch), and prompt structure (buildCritiquePrompt). These functions have deterministic behavior given controlled inputs.
- **Blind spots:** Unit tests use mock outputs from npm test/tsc/eslint. Real output formats may vary across Node/npm versions, causing collectMetrics to mis-parse. Convergence behavior under real multi-iteration sequences is not tested here.
- **Validated:** No — awaiting deferred validation at phase-100-evaluation-benchmark-framework

### P2: lib/autopilot.ts coverage thresholds maintained (>= 83% lines, >= 75% branches)

- **What:** Adding runRefinementLoop and buildCritiqueAgentPrompt and their integration tests does not drop coverage below the existing thresholds recorded in jest.config.js
- **How:** Run the full jest suite with coverage and verify autopilot.ts passes its threshold
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --coverage 2>&1 | grep -E "Tests:|autopilot.ts|Lines|Branches"`
- **Target:** Coverage >= 83% lines, >= 75% branches on lib/autopilot.ts (matching existing jest.config.js threshold); all autopilot tests pass
- **Evidence:** jest.config.js already enforces `'./lib/autopilot.ts': { lines: 83, functions: 91, branches: 75 }` — this threshold will fail the test run if coverage drops. Plan 96-03 adds 6 new runRefinementLoop integration tests to maintain coverage of the new code paths.
- **Correlation with full metric:** HIGH — Jest coverage threshold enforcement is binary: either the test run passes or it fails. No ambiguity.
- **Blind spots:** Mock-based tests for runRefinementLoop mock out spawnStep and refinement module — actual subprocess behavior is not covered. Coverage on exception paths depends on mock accuracy.
- **Validated:** No — awaiting deferred validation during live autopilot runs

### P3: Full test suite passes with no regressions (npm test)

- **What:** All 3,672+ existing tests continue to pass after phase 96 changes; no previously-passing test now fails
- **How:** Run the full npm test suite
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test 2>&1 | tail -10`
- **Target:** All test suites PASS; total test count >= 3,672 (net increase from new tests); zero failures
- **Evidence:** Plan 96-03 success criteria explicitly states "Full test suite (npm test) passes with no regressions." The project's established pattern is that every phase must not regress existing tests.
- **Correlation with full metric:** HIGH — a passing full suite is a necessary (not sufficient) condition for integration readiness
- **Blind spots:** Does not cover runtime behavior of the refinement loop when spawning real agents; does not cover whether convergence is reached in a useful number of iterations
- **Validated:** No — sufficient for merge readiness; effectiveness deferred

### P4: runRefinementLoop integration test scenarios — all 6 pass

- **What:** The six integration test scenarios specified in Plan 96-03 are present and passing: skip (agent missing), skip (config false), converge after 2 iterations, stop at max iterations, error non-blocking, status markers written
- **How:** Run autopilot test file with verbose output to confirm test names
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --verbose 2>&1 | grep -E "runRefinementLoop|✓|✗|PASS|FAIL" | head -20`
- **Target:** 6 new tests under the `runRefinementLoop` describe block, all passing
- **Evidence:** Plan 96-03 must_haves explicitly enumerates 6 test cases with specific behavioral expectations. Each test covers a distinct control-flow path through the loop.
- **Correlation with full metric:** MEDIUM — mock-based tests verify code branching logic but not real subprocess integration. The "converges after 2 iterations" test verifies the checkConvergence call sequence, not that the critique agent actually improves metrics.
- **Blind spots:** spawnStep is mocked — actual agent execution, its outputs, and metric re-collection are not exercised
- **Validated:** No — awaiting deferred validation via live autopilot run

### P5: buildCritiquePrompt branch tests — all 5 pass (all three branches covered)

- **What:** All three CritiqueBranch values (macro, geometry, generative) produce prompts with correct structural content; edge cases (empty minimaRegions, multiple minimaRegions) are covered
- **How:** Run refinement test file with verbose output
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/refinement.test.ts --verbose 2>&1 | grep -E "buildCritiquePrompt|✓|✗" | head -10`
- **Target:** 5 tests under the `buildCritiquePrompt` describe block, all passing
- **Evidence:** Plan 96-03 requires 5 buildCritiquePrompt tests covering all branch variants. The prompt content tests (checking that "coverage"/"macro", "type error"/"geometry", "lint"/"generative" appear) are the only mechanism to verify the critique agent will receive branch-appropriate instructions.
- **Correlation with full metric:** MEDIUM — prompt content correctness is necessary but not sufficient for the critique agent to successfully apply fixes; agent behavior depends on LLM interpretation of the prompt
- **Blind spots:** Does not verify that the critique agent actually reads and acts on the prompt; does not test prompt clarity for edge cases (zero metrics, all metrics at target)
- **Validated:** No — awaiting deferred validation at live autopilot run

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring live autopilot runs or real-project execution.

### D1: End-to-End Refinement Loop Effectiveness — DEFER-96-01

- **What:** Whether `runRefinementLoop` actually improves project metrics (coverage, type errors, lint) within the configured max_iterations when run on a real project
- **How:** Run autopilot on a test project with `refinement_loop: true` in config; observe metric snapshots before/after each iteration; verify convergence or max-iteration termination; compare final metrics to starting metrics
- **Why deferred:** Requires a live Claude Code environment with subprocess spawning capability; requires the critique agent to be spawned and to return a parseable CRITIQUE-RESULT block; requires real npm test/lint/build:check outputs to be collected and parsed
- **Validates at:** phase-100-evaluation-benchmark-framework (or first real autopilot run after phase 96 ships)
- **Depends on:** Functional autopilot with `refinement_loop: true` config, live Claude Code with agent-spawning, a project with measurable metric gaps to close
- **Target:** At least one quality dimension improves between iteration 0 and the final iteration; loop terminates without crashing; no autopilot regression (other phases still complete normally)
- **Risk if unmet:** The refinement loop exists but produces no measurable benefit — it wastes time (each iteration spawns an agent and runs the full test suite) without improving metrics. Fallback: disable the feature via `refinement_loop: false` config default (already the default); the feature is opt-in and skippable.
- **Fallback:** Feature is opt-in (`refinement_loop` defaults to `false`). If effectiveness cannot be demonstrated, the feature can remain dormant without blocking autopilot.

### D2: collectMetrics Parse Robustness on Real Tool Output — DEFER-96-02

- **What:** Whether the three output parsers in `collectMetrics` (Jest coverage output, tsc error output, eslint output) correctly handle the actual format variations produced by the project's current tool versions
- **How:** Run npm test, npm run build:check, and npm run lint on the GRD codebase itself; pass the real outputs to `collectMetrics`; verify the returned RefinementMetrics values match what a human would read from the same outputs
- **Why deferred:** Unit tests use hardcoded mock strings. Real Jest/tsc/ESLint output format depends on exact installed versions and may include ANSI escape codes, different summary line positions, or version-specific formatting. Mock coverage cannot catch format drift.
- **Validates at:** First live autopilot run with `refinement_loop: true` on the GRD project itself
- **Depends on:** Phase 96 shipped and enabled on GRD's own development cycle
- **Target:** Parsed coverage %, type error count, and lint violation count match values readable from raw output with < 5% error (accounting for timing differences)
- **Risk if unmet:** collectMetrics silently returns incorrect values (e.g., 0% coverage when tests pass, 0 errors when errors exist); convergence is detected incorrectly. Mitigation: add defensive logging in runRefinementLoop that prints parsed values before convergence check.

### D3: Critique Agent Patch Quality for All Three Branches — DEFER-96-03

- **What:** Whether the grd-critique-agent, when given a real classified branch and real metrics, produces code patches that are (a) syntactically valid, (b) non-regressive, and (c) actually improve the target metric dimension
- **How:** Manually trigger one iteration of each branch type (macro, geometry, generative) on a real project with known metric gaps; evaluate the critique agent's output against the CRITIQUE-RESULT block format and verify metrics_after > metrics_before
- **Why deferred:** Requires LLM judgment and real code context; cannot be unit tested. Requires a real project with specific metric gaps matching each branch's focus area.
- **Validates at:** Manual review during first real autopilot run with `refinement_loop: true`; or during phase-100-evaluation-benchmark-framework
- **Depends on:** Live Claude Code environment, real projects with metric gaps, human reviewer to assess patch quality
- **Target:** For each branch: metrics_after improves the target dimension by >= 1 unit (coverage +1%, type errors -1, lint violations -1); no regressions in other dimensions; CRITIQUE-RESULT block correctly formatted
- **Risk if unmet:** Critique agent makes unhelpful or regressive patches, causing the loop to waste iterations. Fallback: reduce max_iterations default to 1 (single-pass refinement); or restrict branch selection to geometry-only (type errors are deterministic).

---

## Ablation Plan

**Purpose:** Isolate component contributions.

### A1: collectMetrics with malformed output strings

- **Condition:** Pass empty strings, ANSI-escaped strings, and strings with no coverage/error summary to collectMetrics
- **Expected impact:** Function returns safe defaults (0.0 coverage, 0 errors, 0 violations) rather than throwing or returning NaN
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const {collectMetrics} = require('./lib/refinement'); console.log(collectMetrics('', '', ''))"`
- **Evidence:** Plan 96-01 task description requires parsing output strings — edge case behavior on malformed input determines robustness of the entire loop

### A2: checkConvergence with max_iterations boundary

- **Condition:** Pass a ConvergenceConfig with max_iterations: 2 and exactly 2 snapshots
- **Expected impact:** Returns `{ converged: true, reason: 'max iterations reached' }` regardless of delta values
- **Command:** Covered by unit test case "stops at max_iterations" in tests/unit/refinement.test.ts
- **Evidence:** Plan 96-01 explicitly specifies: "If snapshots.length >= config.max_iterations: return { converged: true, reason: 'max iterations reached' }"

### A3: classifyBranch tie-break order

- **Condition:** Pass RefinementMetrics where all three normalized gaps are equal
- **Expected impact:** Returns 'macro' (tie-break order: macro > geometry > generative, per plan spec)
- **Command:** Covered by unit test "returns 'macro' when coverage gap is largest" extended to equal-gap case
- **Evidence:** Plan 96-01 specifies tie-break order explicitly; incorrect tie-breaking would route to wrong branch and reduce refinement effectiveness

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All modified files are TypeScript modules and agent markdown definitions.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| lib/autopilot.ts coverage (pre-phase) | Existing coverage before phase 96 adds new functions | lines: 83%, functions: 91%, branches: 75% | jest.config.js existing threshold |
| Total test count (pre-phase) | Tests before phase 96 adds new tests | 3,672 tests | STATE.md performance metrics |
| npm test full suite (pre-phase) | All tests green before phase 96 | All pass, 0 failures | Established project invariant |
| npm run build:check (pre-phase) | Zero TypeScript errors | 0 errors | Established project invariant |
| npm run lint (pre-phase) | Zero ESLint errors | 0 errors | Established project invariant |

---

## Evaluation Scripts

**Location of evaluation code:** `tests/unit/refinement.test.ts` and additions to `tests/unit/autopilot.test.ts`

**How to run full evaluation:**

```bash
# Sanity checks
node -e "const r = require('./lib/refinement'); console.log(['collectMetrics','detectMinima','checkConvergence','classifyBranch','buildCritiquePrompt'].every(f => typeof r[f] === 'function') ? 'ALL EXPORTS OK' : 'MISSING EXPORT')"
grep -c "RefinementMetrics\|MetricSnapshot\|CritiqueBranch\|ConvergenceConfig\|MinimaRegion" lib/types.ts
npm run build:check
npm run lint
head -10 agents/grd-critique-agent.md
grep -c "Macro\|Geometry\|Generative\|macro\|geometry\|generative" agents/grd-critique-agent.md
grep -n "runRefinementLoop\|runKnowledgeMining" lib/autopilot.ts | head -20

# Proxy metrics
npx jest tests/unit/refinement.test.ts --coverage
npx jest tests/unit/autopilot.test.ts --coverage
npm test
npx jest tests/unit/autopilot.test.ts --verbose 2>&1 | grep -E "runRefinementLoop|✓|✗"
npx jest tests/unit/refinement.test.ts --verbose 2>&1 | grep -E "buildCritiquePrompt|✓|✗"
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: lib/refinement.ts exports 5 functions | | | |
| S2: types.ts has 5 new type names | | | |
| S3: npm run build:check passes | | | |
| S4: npm run lint passes | | | |
| S5: grd-critique-agent.md frontmatter valid | | | |
| S6: grd-critique-agent.md has 3 branch protocols | | | |
| S7: runRefinementLoop wired after runKnowledgeMining | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: refinement.ts line coverage | >= 85% | | | |
| P1: refinement.ts branch coverage | >= 75% | | | |
| P2: autopilot.ts line coverage | >= 83% | | | |
| P2: autopilot.ts branch coverage | >= 75% | | | |
| P3: Full npm test suite | 0 failures, >= 3672 tests | | | |
| P4: runRefinementLoop integration tests | 6 pass | | | |
| P5: buildCritiquePrompt branch tests | 5 pass | | | |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| A1: collectMetrics with empty strings | Returns safe defaults, no throw | | |
| A2: checkConvergence at max_iterations boundary | converged: true, reason: 'max iterations reached' | | |
| A3: classifyBranch tie-break | Returns 'macro' | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-96-01 | End-to-end loop effectiveness on real project | PENDING | phase-100 or first live autopilot run |
| DEFER-96-02 | collectMetrics parse robustness on real tool output | PENDING | First live autopilot run with refinement_loop: true |
| DEFER-96-03 | Critique agent patch quality for all three branches | PENDING | Manual review during first live run |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM

**Justification:**

- Sanity checks: adequate — seven checks covering file existence, export shape, TypeScript compilation, lint, agent file structure, and pipeline wiring. All are immediately verifiable and deterministic.
- Proxy metrics: well-evidenced for test pass rates and coverage thresholds (HIGH correlation with code correctness); MEDIUM correlation for mock-based integration tests (coverage is measured but actual subprocess behavior is not). No invented metrics — all proxy targets are derived directly from plan success criteria and existing jest.config.js patterns.
- Deferred coverage: partial — the three deferred items cover the most important gaps (loop effectiveness, parser robustness, agent patch quality). Phase 100 (Evaluation Benchmark Framework) is designed to close DEFER-96-01 systematically; DEFER-96-02 and DEFER-96-03 require real live runs that may not be explicitly scheduled.

**What this evaluation CAN tell us:**
- Whether the five refinement functions are correctly implemented and pass their unit tests
- Whether the coverage threshold (85/85/75) is met on lib/refinement.ts
- Whether type safety is maintained across the new types and function signatures
- Whether the autopilot integration does not regress any of the 3,672+ existing tests
- Whether the critique agent definition file is structurally complete
- Whether runRefinementLoop is reachable in the execute-wave sequence

**What this evaluation CANNOT tell us:**
- Whether the refinement loop actually improves metrics on a real project (DEFER-96-01 — validates at first live autopilot run)
- Whether collectMetrics correctly parses real Jest/tsc/ESLint output across tool versions (DEFER-96-02 — validates at first live run)
- Whether the critique agent's patches are non-regressive and effective in practice (DEFER-96-03 — validates at manual review)
- Whether 3 max iterations is an appropriate default for real projects (no data yet — empirical tuning deferred to post-ship observation)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-25*
