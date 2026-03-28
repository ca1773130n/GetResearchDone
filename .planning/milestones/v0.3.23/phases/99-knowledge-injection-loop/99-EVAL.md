# Evaluation Plan: Phase 99 — Knowledge Injection Loop

**Designed:** 2026-03-25
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** buildKnowledgeInjectionBlock (plan 01), autopilot prompt wiring (plan 02), extractModuleHints + phase-proximity scoring (plan 03)
**Reference:** Phase 99 CONTEXT.md, 99-01/02/03 PLAN.md files — REQ-191, REQ-192

## Evaluation Overview

Phase 99 closes the NERFIFY knowledge enhancement loop. Three plans implement three discrete capabilities: (1) `buildKnowledgeInjectionBlock` — the bridge between KNOWHOW.md storage and prompt injection, (2) wiring that function into `buildPlanPrompt`/`buildExecutePrompt` in lib/autopilot.ts and adding the missing `<knowhow_injection>` block to grd-executor.md, and (3) automatic module hint extraction (`extractModuleHints`) and phase-proximity scoring in `selectTopEntries`.

This is a pure software engineering phase with no ML models or paper benchmarks. The "product" is correct TypeScript with well-defined behavioral contracts: the right entries must be selected, formatted, and injected into the right prompts. Evaluation is dominated by unit-test correctness, type safety, and code quality — with integration-level outcomes (actual agents using the injected knowledge to produce better plans) explicitly deferred.

The core risk in this phase is subtle behavioral correctness: `selectTopEntries` must preserve recency as the primary sort while applying phase-proximity only as a tertiary tiebreaker. A sorting bug that silently inverts priorities would pass sanity checks while producing wrong results. The TDD structure (RED/GREEN/REFACTOR across both plans 01 and 03) directly mitigates this risk by specifying behavior before implementation.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | tsc --noEmit | Project code style requires strict TypeScript; no `any` types |
| ESLint zero warnings | CLAUDE.md code style, project convention | Pre-commit hook enforces lint; failures block commits |
| knowledge.test.ts pass count | 99-01/03 PLAN.md must_haves | Executable spec for all behavioral contracts |
| knowledge.ts coverage >= 85% lines | jest.config.js existing threshold | Existing contract; new functions must maintain or improve it |
| autopilot.ts coverage >= 83% lines | jest.config.js existing threshold | Existing contract; wiring changes must not drop coverage |
| Full test suite no regression | npm test | 99-02 modifies lib/autopilot.ts, an existing module with its own test file |
| Structural grep checks | 99-02 PLAN.md verification | Structural correctness when no new test file is written for wiring |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Type safety, module loading, export shape, empty-input behavior, structural presence |
| Proxy (L2) | 5 | Test counts, coverage thresholds, structural wiring correctness, sorting contract |
| Deferred (L3) | 2 | Real-world knowledge compounding across phases, prompt quality improvement in live runs |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compilation
- **What:** All modified files (lib/knowledge.ts, lib/autopilot.ts) compile with strict TypeScript after all three plans complete
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no type errors
- **Failure means:** Type interfaces malformed, new function signatures violate strict mode, import from knowledge in autopilot is wrongly typed, or `_phaseNum` prefix was omitted causing an unused-vars type error

### S2: ESLint Clean
- **What:** No lint errors in any modified file
- **Command:** `npm run lint`
- **Expected:** Exit code 0, zero errors or warnings
- **Failure means:** `_phaseNum` not prefixed with `_` (no-unused-vars), stray `any` type in new code, missing `'use strict'` at top of a file, or an unused import introduced in autopilot.ts wiring

### S3: Module Load Without Error
- **What:** lib/knowledge.ts and lib/autopilot.ts can be required without runtime error after phase completion
- **Command:** `node -e "require('./lib/knowledge'); require('./lib/autopilot'); console.log('OK')"`
- **Expected:** Prints `OK` with exit code 0
- **Failure means:** Module-level code throws on require (syntax error, missing dependency, circular import introduced by knowledge ↔ autopilot require chain)

### S4: New Exports Present on knowledge Module
- **What:** All three new functions are exported from lib/knowledge.ts
- **Command:** `node -e "const k=require('./lib/knowledge'); console.log(typeof k.buildKnowledgeInjectionBlock, typeof k.extractModuleHints)"`
- **Expected:** `function function`
- **Failure means:** One or both functions were implemented but not added to module.exports (common TDD mistake — GREEN passes tests via direct call, but module.exports step missed)

### S5: Empty-Input Behavior — buildKnowledgeInjectionBlock
- **What:** buildKnowledgeInjectionBlock returns empty string when KNOWHOW.md does not exist
- **Command:** `node -e "const {buildKnowledgeInjectionBlock}=require('./lib/knowledge'); const os=require('os'),path=require('path'),fs=require('fs'); const t=fs.mkdtempSync(path.join(os.tmpdir(),'grd-s5-')); const r=buildKnowledgeInjectionBlock(t,'99'); fs.rmSync(t,{recursive:true}); if(r!=='')throw new Error('Expected empty string, got: '+r); console.log('OK')"`
- **Expected:** Prints `OK` with exit code 0
- **Failure means:** Function returns non-empty string for missing KNOWHOW.md, which would inject garbage into agent prompts on first-time project setup

### S6: buildKnowledgeInjectionBlock in Autopilot
- **What:** lib/autopilot.ts contains a call to buildKnowledgeInjectionBlock (structural presence check)
- **Command:** `grep -c "buildKnowledgeInjectionBlock" lib/autopilot.ts`
- **Expected:** Output >= 3 (one require import + at least two call sites: buildPlanPrompt and buildExecutePrompt)
- **Failure means:** Plan 99-02 was not executed or wiring was partially applied

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and quality.
**IMPORTANT:** These proxy metrics are not validated substitutes for full integration testing. Treat results with appropriate skepticism.

### P1: knowledge.test.ts New Test Count — 12 tests
- **What:** Number of passing tests in the new describe blocks added by plans 01 and 03
- **How:** Count passing tests in the new describe blocks: `buildKnowledgeInjectionBlock` (5 tests from plan 01) + `extractModuleHints` (4 tests from plan 03) + `selectTopEntries phase-proximity` (3 tests from plan 03)
- **Command:** `npx jest tests/unit/knowledge.test.ts --no-coverage 2>&1 | grep -E "Tests:|passed"`
- **Target:** >= 12 new tests passing (5 + 4 + 3 from plans 01 and 03 task specifications); plus all pre-existing 32 tests continue to pass
- **Evidence:** 99-01-PLAN.md Task 1 action specifies exactly 5 test cases; 99-03-PLAN.md Task 1 Part A specifies 4 extractModuleHints cases + 3 phase-proximity cases
- **Correlation with full metric:** HIGH — the tests are the behavioral specification; all passing means all documented contracts are met
- **Blind spots:** Tests written by the same agent that writes the implementation; edge cases not enumerated in the plan (e.g., KNOWHOW.md with only 3 entries when top-5 is requested) may not be tested
- **Validated:** No — awaiting deferred validation at phase-100-evaluation-benchmark-framework

### P2: knowledge.ts Line Coverage >= 85%
- **What:** Line coverage on lib/knowledge.ts stays at or above the existing jest.config.js threshold after new functions are added
- **How:** Jest coverage report for knowledge.ts
- **Command:** `npx jest tests/unit/knowledge.test.ts --coverage --coverageReporters=text 2>&1 | grep "knowledge.ts"`
- **Target:** lines >= 85%, functions >= 100%, branches >= 75% (matching existing jest.config.js entry)
- **Evidence:** jest.config.js already enforces `{ lines: 85, functions: 100, branches: 75 }` for `./lib/knowledge.ts`. New functions added in plans 01 and 03 must be tested at the same density or npm test will fail.
- **Correlation with full metric:** HIGH — coverage failure = npm test failure = hard gate
- **Blind spots:** Coverage measures line execution, not assertion quality. A test that calls `buildKnowledgeInjectionBlock` without checking the `<knowhow_context>` tag wrapping still counts as coverage.
- **Validated:** No — threshold confirmation deferred until npm test runs with full coverage

### P3: Sorting Contract — Phase-Proximity is Tertiary
- **What:** selectTopEntries preserves recency as primary sort when phase-proximity is provided
- **How:** Run the specific plan-03 test case that validates sort ordering
- **Command:** `npx jest tests/unit/knowledge.test.ts -t "phase-proximity does not override recency" --no-coverage 2>&1 | tail -10`
- **Target:** Test passes (exit code 0)
- **Evidence:** 99-03-PLAN.md task description explicitly names this test: "phase-proximity does not override recency — entry at phase 98 (no hint match) should still rank above entry at phase 90 (with hint match)." This is the critical behavioral invariant — if violated, recent-but-irrelevant entries would be deprioritized, breaking the expected ordering that agents rely on.
- **Correlation with full metric:** HIGH — this single test case directly encodes the most important behavioral contract
- **Blind spots:** The test uses a constructed scenario with clear separation (phase 98 vs 90). Real KNOWHOW.md entries may have subtler distributions where the ordering boundary is less obvious.
- **Validated:** No — awaiting real-world validation at phase-100

### P4: autopilot.ts Coverage No Regression — >= 83% Lines
- **What:** Line coverage on lib/autopilot.ts does not drop below its existing jest.config.js threshold after the cwd parameter additions
- **How:** Jest coverage report for autopilot.ts
- **Command:** `npx jest tests/unit/autopilot.test.ts --coverage --coverageReporters=text 2>&1 | grep "autopilot.ts"`
- **Target:** lines >= 83%, functions >= 91%, branches >= 75% (matching existing jest.config.js entry)
- **Evidence:** jest.config.js threshold `{ lines: 83, functions: 91, branches: 75 }` for `./lib/autopilot.ts`. The new `cwd` parameter is optional; existing tests that call `buildPlanPrompt(phaseNum, backend)` without cwd will still pass, but the new knowhow injection code path (when cwd is provided) will not be exercised unless tests are updated or added. Coverage on the injection branch may be LOW — this is a known gap.
- **Correlation with full metric:** MEDIUM — the existing threshold may still be met if the injection code is a small fraction of total autopilot.ts lines. If coverage drops below threshold, npm test hard-fails.
- **Blind spots:** The optional cwd parameter means the injection branch (the new if-block) may be uncovered by existing tests. This is acceptable for the wiring phase but means the injection logic is tested only via knowledge.test.ts, not autopilot.test.ts.
- **Validated:** No — threshold confirmation deferred until npm test runs

### P5: Full Test Suite No Regression
- **What:** All pre-existing unit tests continue to pass after all three plans complete
- **How:** Run full test suite
- **Command:** `npm test`
- **Target:** Zero new test failures; same pass count as before phase 99
- **Evidence:** Plans 99-01 and 99-03 modify lib/knowledge.ts (which has its own test file); plan 99-02 modifies lib/autopilot.ts (which has its own test file). Both are existing modules with established test suites. Regression in either file's test suite indicates a behavioral change beyond the specified additions.
- **Correlation with full metric:** HIGH — regression = hard failure
- **Blind spots:** Unit tests mock filesystem calls; actual KNOWHOW.md read errors in production (e.g., permissions, encoding issues) will not be caught
- **Validated:** No — run after all three plans complete

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or live execution not available in this phase.

### D1: Knowledge Compounding Across Phases — DEFER-99-01
- **What:** Agents (planner, researcher, executor) demonstrably apply patterns from KNOWHOW.md when the injected `<knowhow_context>` block is present in their prompts, producing higher-quality plans or implementations than without injection
- **How:** Run two comparable phases with identical goals — one with KNOWHOW.md present (injection active), one without (empty injection block) — and compare plan quality, error rate, and implementation correctness
- **Why deferred:** This requires (a) a populated KNOWHOW.md from multiple prior phase executions, (b) a repeatable phase scenario for A/B comparison, and (c) human or automated evaluation of output quality. None of these are available during phase 99 development.
- **Validates at:** phase-100-evaluation-benchmark-framework (first phase explicitly designed to measure quality metrics across GRD phases)
- **Depends on:** KNOWHOW.md populated with >= 5 entries from prior milestones; phase-100 benchmark infrastructure; multiple autopilot runs with injection enabled
- **Target:** At least one measurable quality improvement (reduced plan errors, faster execution, fewer retries) attributable to knowledge injection in a controlled comparison
- **Risk if unmet:** Knowledge injection adds prompt tokens without improving outcomes — overhead with no benefit. In this case, the injection block should be made opt-in or the selectTopEntries relevance scoring should be made stricter.
- **Fallback:** Add a `--no-knowhow` flag to disable injection; instrument knowledge usage via agent self-reporting (agents log which KNOWHOW entry they applied)

### D2: Prompt Quality Improvement Measurement — DEFER-99-02
- **What:** The XML `<knowhow_context>` format chosen for injection is parseable and actionable by real Claude agents (the injected block influences agent behavior, not just token count)
- **How:** Review agent outputs (plans, code, summaries) from phases run after phase 99 completes, checking for explicit references to KNOWHOW pattern names or evidence of pattern application in commit messages and code
- **Why deferred:** Requires live autopilot runs with real agents. The format can only be validated by observing actual agent responses to the injected context, not by unit tests.
- **Validates at:** After the first autopilot run following phase 99 completion (milestone v0.3.23 phase 100 or later)
- **Depends on:** Phase 99 fully deployed, autopilot running with buildPlanPrompt/buildExecutePrompt wired to real cwd, KNOWHOW.md populated
- **Target:** At least one agent run references or applies a KNOWHOW pattern by name; no agent run shows evidence of the `<knowhow_context>` block being ignored or causing prompt-parsing errors
- **Risk if unmet:** The XML format may not be parsed correctly by agents — they may read it as literal text or skip it. Alternative: use a plain markdown section header (`## Relevant Patterns`) instead of XML tags; switch format and re-run.
- **Fallback:** Switch `<knowhow_context>` wrapping to a plain markdown heading; revert XML tags in `buildKnowledgeInjectionBlock` and re-deploy

---

## Ablation Plan

**No ablation plan** — Phase 99 implements three additive, non-overlapping capabilities. Plans 01, 02, and 03 are themselves an ablation structure: plan 01 (core function) can be verified independently, plan 02 (wiring) builds on plan 01, plan 03 (enhanced scoring) is parallel to plan 02. There are no sub-components within a single plan where alternative implementations need comparison.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All modified files are TypeScript library modules (`lib/knowledge.ts`, `lib/autopilot.ts`) and an agent definition markdown file (`agents/grd-executor.md`).

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| knowledge.ts existing tests | All 32 pre-existing tests in knowledge.test.ts pass before phase 99 starts | 100% pass | Current test suite |
| autopilot.ts existing tests | All autopilot.test.ts tests pass before plan 99-02 modifies the file | 100% pass | Current test suite |
| knowledge.ts coverage | Existing threshold in jest.config.js | lines >= 85%, functions >= 100%, branches >= 75% | jest.config.js |
| autopilot.ts coverage | Existing threshold in jest.config.js | lines >= 83%, functions >= 91%, branches >= 75% | jest.config.js |
| selectTopEntries recency sort | Existing selectTopEntries tests pass after plan 03 enhances the function | 8 tests passing | tests/unit/knowledge.test.ts selectTopEntries describe block |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/knowledge.test.ts  — new describe blocks appended by plans 01 and 03
lib/knowledge.ts              — implementation under test
lib/autopilot.ts              — wired call sites (structural, not unit-tested for injection path)
```

**How to run full evaluation:**
```bash
# Sanity checks
npm run build:check
npm run lint
node -e "require('./lib/knowledge'); require('./lib/autopilot'); console.log('OK')"
node -e "const k=require('./lib/knowledge'); console.log(typeof k.buildKnowledgeInjectionBlock, typeof k.extractModuleHints)"
grep -c "buildKnowledgeInjectionBlock" lib/autopilot.ts

# Proxy metrics
npx jest tests/unit/knowledge.test.ts --no-coverage
npx jest tests/unit/knowledge.test.ts -t "phase-proximity does not override recency" --no-coverage
npx jest tests/unit/knowledge.test.ts --coverage --coverageReporters=text
npx jest tests/unit/autopilot.test.ts --coverage --coverageReporters=text
npm test
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | [PASS/FAIL] | | |
| S2: ESLint clean | [PASS/FAIL] | | |
| S3: Module load without error | [PASS/FAIL] | | |
| S4: New exports present | [PASS/FAIL] | | |
| S5: Empty-input behavior | [PASS/FAIL] | | |
| S6: buildKnowledgeInjectionBlock in autopilot | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: New test count | >= 12 new passing | | [MET/MISSED] | |
| P2: knowledge.ts line coverage | >= 85% | | [MET/MISSED] | |
| P3: Sorting contract (tertiary) | Test passes | | [MET/MISSED] | |
| P4: autopilot.ts coverage no regression | >= 83% | | [MET/MISSED] | |
| P5: Full suite no regression | 0 new failures | | [MET/MISSED] | |

### Ablation Results

Not applicable — see Ablation Plan section.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-99-01 | Knowledge compounding across phases | PENDING | phase-100-evaluation-benchmark-framework |
| DEFER-99-02 | Prompt quality improvement measurement | PENDING | first autopilot run post phase-99 |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — all six checks are deterministic, fast (< 10 seconds total), and catch the most likely failure modes (type errors, missing exports, wiring not applied, empty-input crash)
- Proxy metrics: Well-evidenced — test counts are specified by the plan must_haves; coverage thresholds are pre-existing hard gates in jest.config.js; the sorting-contract test directly encodes the critical behavioral invariant; regression protection is automatic via npm test
- Deferred coverage: Honest — both deferred items require live agent execution that is explicitly out of scope for a software engineering phase; the gap is acknowledged rather than papered over with invented proxy metrics

**What this evaluation CAN tell us:**
- Whether buildKnowledgeInjectionBlock correctly reads, selects, and formats KNOWHOW entries in an XML block
- Whether extractModuleHints correctly parses PLAN.md frontmatter and deduplicates module basenames
- Whether selectTopEntries preserves recency as primary sort while treating phase-proximity as a tertiary tiebreaker only
- Whether the autopilot wiring is structurally present (call sites exist, import is correct, cwd parameter added)
- Whether existing autopilot and knowledge functionality regresses after the changes

**What this evaluation CANNOT tell us:**
- Whether agents actually read and apply the injected `<knowhow_context>` block in practice (DEFER-99-01 — validates at phase-100)
- Whether the XML format is the right format for agent consumption, versus plain markdown (DEFER-99-02 — validates after first live run)
- Whether the autopilot injection path is exercised in any existing autopilot.test.ts test (the cwd parameter is optional; the injection branch may be uncovered in autopilot.test.ts)
- Whether KNOWHOW.md entries from real prior phases contain enough signal for meaningful selection (depends on knowledge mining quality from phases 93-98)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-25*
