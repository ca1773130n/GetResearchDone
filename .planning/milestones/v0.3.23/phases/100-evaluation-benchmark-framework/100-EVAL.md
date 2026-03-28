# Evaluation Plan: Phase 100 — Evaluation Benchmark Framework

**Designed:** 2026-03-25
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** NERFIFY-BENCH adaptation — benchmark corpus management, semantic implementation scoring, trainability/executability metrics, composite quality scoring
**Reference papers:** NERFIFY-BENCH (paper-to-code synthesis evaluation — category taxonomy from Figure 7)

## Evaluation Overview

Phase 100 introduces `lib/benchmark.ts` as a structured evaluation module for paper-to-code synthesis quality. The module contains nine exported functions split across two TDD plans (waves 1 and 2), plus two agent definitions updated in wave 2. Because this is a TypeScript library with full unit tests, the evaluation is unusually well-covered at the proxy level: the TDD workflow forces tests to exist and coverage thresholds are enforced in `jest.config.js`. There is no upstream ML system to evaluate here — the benchmark framework is itself the artifact being assessed.

What cannot be verified at this stage is whether the category taxonomy correctly reflects real-world paper difficulty (the NERFIFY-BENCH Figure 7 taxonomy is adapted, not reproduced), and whether the composite scoring weights (`semantic_weight: 0.6, trainability_weight: 0.4`) produce rankings that agree with human expert judgment. These qualitative validations require either a labeled corpus of ground-truth paper-to-code evaluations, or domain expert review — neither is available now.

The agent definition updates in plan 100-03 are prose documents and have no automated correctness test. Structural validation (frontmatter fields present, named functions referenced) stands in as sanity-level verification only.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit test pass rate | TDD plan design (`must_haves.truths`) | Phase is TDD-first; passing tests is the definition of functional correctness |
| Line coverage >= 85% | `jest.config.js` threshold pattern (all other lib modules) | Consistent with project-wide per-file coverage thresholds |
| Function coverage >= 85% | `jest.config.js` threshold pattern | Ensures exported API is exercised |
| Branch coverage >= 75% | `jest.config.js` threshold pattern | Ensures conditional paths (category priority, clamping, empty input) are tested |
| TypeScript type check | Project standard (`npm run build:check`) | All lib modules must compile with `tsc --noEmit` |
| Lint pass | Project standard (`npm run lint`) | Pre-commit hook enforces zero lint errors |
| Export count | Plan 100-01 / 100-02 `must_haves.artifacts` | Verifies neither plan left stub functions unexported |
| Agent frontmatter validity | Plan 100-03 `must_haves.truths` | Agents must have `name`, `description`, `tools`, `effort` to be loadable |
| Composite score math | Plan 100-01 formula (scoreComposite spec) | Verifiable algebraic invariant: `semantic_weight + trainability_weight = 1.0` |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Basic functionality and format verification |
| Proxy (L2) | 5 | Automated code quality and scoring correctness |
| Deferred (L3) | 3 | Human/integration validation that cannot be automated now |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript type check
- **What:** `lib/benchmark.ts` and `lib/types.ts` compile without type errors
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check 2>&1 | tail -5`
- **Expected:** Zero type errors, process exits 0
- **Failure means:** Type definitions are inconsistent; module.exports contract is broken; downstream lib imports will fail at build time

### S2: Module exports — wave 1 (5 functions)
- **What:** `lib/benchmark.ts` exports exactly the five wave-1 functions after plan 100-01
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const b = require('./lib/benchmark'); const fns = ['loadCorpus','saveCorpusEntry','scoreComposite','createDefaultRubric','formatBenchmarkReport']; fns.forEach(f => { if(typeof b[f] !== 'function') throw new Error('missing: ' + f); }); console.log('OK: all 5 exports present');" 2>&1`
- **Expected:** `OK: all 5 exports present`
- **Failure means:** A function was not implemented or not added to `module.exports`; the wave-2 evaluation pipeline and agent integrations cannot proceed

### S3: Module exports — wave 2 (9 functions total)
- **What:** After plan 100-02, `lib/benchmark.ts` exports all nine functions
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const b = require('./lib/benchmark'); const fns = ['loadCorpus','saveCorpusEntry','scoreComposite','createDefaultRubric','formatBenchmarkReport','classifyEntry','scoreSemanticFromSummary','assessTrainability','evaluateEntry']; fns.forEach(f => { if(typeof b[f] !== 'function') throw new Error('missing: ' + f); }); console.log('OK: all 9 exports present');" 2>&1`
- **Expected:** `OK: all 9 exports present`
- **Failure means:** Wave-2 plan left stub functions or failed to add exports

### S4: No NaN/Infinity in scoreComposite
- **What:** `scoreComposite` returns a finite number clamped to [0, 1] for edge inputs
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const { scoreComposite, createDefaultRubric } = require('./lib/benchmark'); const rubric = createDefaultRubric(); const semantic = {novelty_capture:0,api_surface_match:0,algorithmic_fidelity:0,notes:''}; const train = {build_success:false,runtime_stable:false,convergence_detected:false,execution_time_ms:0,error_log:''}; const score = scoreComposite(semantic, train, rubric, 'directly-integrable'); if(isNaN(score) || !isFinite(score) || score < 0 || score > 1) throw new Error('invalid score: ' + score); console.log('OK: score=' + score);" 2>&1`
- **Expected:** `OK: score=0`
- **Failure means:** Clamping logic is absent; floating-point edge cases could corrupt composite scores in downstream reports

### S5: createDefaultRubric weights sum to 1.0
- **What:** `semantic_weight + trainability_weight === 1.0` exactly as designed
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const { createDefaultRubric } = require('./lib/benchmark'); const r = createDefaultRubric(); const sum = r.semantic_weight + r.trainability_weight; if(Math.abs(sum - 1.0) > 0.0001) throw new Error('weights sum to ' + sum); console.log('OK: weights sum to 1.0');" 2>&1`
- **Expected:** `OK: weights sum to 1.0`
- **Failure means:** Composite score formula is mathematically incorrect; scores will not be on a 0-1 scale even with perfect sub-scores

### S6: Agent files exist with required frontmatter fields
- **What:** Both agent markdown files exist and contain `name:`, `description:`, `tools:`, and `effort:` in frontmatter
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && for f in agents/grd-eval-planner.md agents/grd-eval-reporter.md; do for field in name description tools effort; do grep -q "^$field:" "$f" || echo "MISSING $field in $f"; done; done && echo "OK: all frontmatter fields present"`
- **Expected:** `OK: all frontmatter fields present`
- **Failure means:** Agent definitions are malformed and will not load in GRD's agent dispatch system

### S7: Agent files reference lib/benchmark.ts functions
- **What:** `grd-eval-planner.md` references `loadCorpus` and `evaluateEntry`; `grd-eval-reporter.md` references `formatBenchmarkReport`
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && grep -q "loadCorpus" agents/grd-eval-planner.md && grep -q "evaluateEntry" agents/grd-eval-planner.md && grep -q "formatBenchmarkReport" agents/grd-eval-reporter.md && echo "OK: benchmark references present" || echo "FAIL: missing references"`
- **Expected:** `OK: benchmark references present`
- **Failure means:** Agent definitions are disconnected from the benchmark module they are supposed to orchestrate; integration is nominal only

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to proxy evaluation.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: Unit test pass rate — full benchmark suite
- **What:** All unit tests for `lib/benchmark.ts` pass after each wave
- **How:** Run jest on the benchmark test file
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/benchmark.test.ts --no-coverage 2>&1 | tail -10`
- **Target:** `Tests: N passed, N total` with zero failures
- **Evidence:** TDD methodology: tests are the specification. Every `must_haves.truths` entry in the plans maps to one or more test cases. Passing tests = behavioral specification satisfied.
- **Correlation with full metric:** HIGH — tests were written from the same spec as the implementation; they cover all category priority orderings, clamping edge cases, and orchestration wiring
- **Blind spots:** Tests are written by the same agent that writes the code; they may share assumptions. Edge cases not imagined during plan authorship will not be covered. Real corpus files (heterogeneous JSON, malformed entries) may reveal parsing gaps not exercised by synthetic test fixtures.
- **Validated:** No — awaiting deferred validation D1

### P2: Line coverage >= 85% on lib/benchmark.ts
- **What:** Jest line coverage for `lib/benchmark.ts` meets the project-standard threshold
- **How:** Run jest with coverage and check per-file report
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/benchmark.test.ts --coverage --coverageReporters=text 2>&1 | grep -A3 "benchmark.ts"`
- **Target:** Lines >= 85%, Functions >= 85%, Branches >= 75% (matching threshold set in `jest.config.js`)
- **Evidence:** Project pattern: all 30 existing `lib/*.ts` modules have per-file thresholds in `jest.config.js` in the range 74-100%. The plan explicitly sets `85/85/75` in `jest.config.js`, matching the project median. Coverage at this level means the scoreComposite formula, trainability boolean logic, and classifyEntry priority cascade are all exercised.
- **Correlation with full metric:** MEDIUM — coverage measures execution paths hit, not correctness. A test that calls a function but asserts nothing can inflate coverage while missing bugs. However, the `jest.config.js` threshold also enforces the threshold at CI time, so any shortfall will block the commit.
- **Blind spots:** Branch coverage at 75% means up to 25% of conditional branches are untested. The most likely uncovered paths are error handling in `loadCorpus` (malformed JSON) and regex edge cases in `scoreSemanticFromSummary`. These are low-risk for the current use case (internal tooling with controlled inputs) but could surface in real corpus evaluation.
- **Validated:** No — awaiting deferred validation D1

### P3: Lint zero errors
- **What:** `npm run lint` exits 0 after all three plans execute
- **How:** Run ESLint on `lib/` and `bin/`
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint 2>&1 | tail -5`
- **Target:** No errors reported, exit code 0
- **Evidence:** Pre-commit hook enforces this for all files. Project style (`'use strict'`, no `any`, unused args prefixed `_`) applies to `lib/benchmark.ts`. The plan explicitly requires `npm run lint` as a verification step after each GREEN phase.
- **Correlation with full metric:** HIGH for code style conformance; unrelated to functional correctness
- **Blind spots:** Lint does not catch logical errors, incorrect scoring math, or taxonomy misclassification.
- **Validated:** No

### P4: scoreComposite algebraic invariants
- **What:** Composite score behaves correctly under boundary and representative inputs
- **How:** Spot-check against algebraically derivable expected values from the plan spec
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "
const { scoreComposite, createDefaultRubric } = require('./lib/benchmark');
const r = createDefaultRubric();
// Perfect semantic, perfect trainability, directly-integrable => 1.0
const s1 = {novelty_capture:1,api_surface_match:1,algorithmic_fidelity:1,notes:''};
const t1 = {build_success:true,runtime_stable:true,convergence_detected:true,execution_time_ms:100,error_log:''};
const c1 = scoreComposite(s1,t1,r,'directly-integrable');
// Expected: (1.0*0.6 + 1.0*0.4)*1.0 = 1.0
if(Math.abs(c1-1.0)>0.001) throw new Error('expected 1.0 got '+c1);
// No convergence, out-of-scope => lower score
const t2 = {build_success:true,runtime_stable:true,convergence_detected:false,execution_time_ms:100,error_log:''};
const c2 = scoreComposite(s1,t2,r,'out-of-scope');
// Expected: (1.0*0.6 + (0.4+0.3)*0.4)*0.5 = (0.6+0.28)*0.5 = 0.44
if(Math.abs(c2-0.44)>0.001) throw new Error('expected 0.44 got '+c2);
console.log('OK: algebraic invariants pass, c1='+c1+' c2='+c2);
" 2>&1`
- **Target:** `OK: algebraic invariants pass, c1=1 c2=0.44`
- **Evidence:** The scoring formula is fully specified in the plan (`scoreComposite` task in 100-01). These expected values are derivable by hand from the formula: `semantic_sub = avg(novelty_capture, api_surface_match, algorithmic_fidelity)`, `trainability_sub = 0.4*build + 0.3*runtime + 0.3*convergence`, `composite = (sem*0.6 + train*0.4) * category_adj`. No correlation uncertainty — this is a deterministic mathematical property.
- **Correlation with full metric:** HIGH for implementation correctness of the formula; does not validate that the weights are well-calibrated for real-world use
- **Blind spots:** Does not test `classifyEntry` × `scoreComposite` integration. Does not test floating-point accumulation across large result sets.
- **Validated:** No

### P5: classifyEntry priority ordering
- **What:** When multiple category indicators are present in tags, `out-of-scope` takes precedence over all others
- **How:** Invoke `classifyEntry` with a multi-indicator entry and verify priority cascade
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "
const { classifyEntry } = require('./lib/benchmark');
const now = new Date().toISOString();
// All categories fire: out-of-scope should win
const e1 = {id:'t1',title:'T',source:'',category:'directly-integrable',tags:['hardware-specific','pretrained','novel-loss'],added_at:now};
const r1 = classifyEntry(e1);
if(r1!=='out-of-scope') throw new Error('expected out-of-scope got '+r1);
// Only external model indicator
const e2 = {id:'t2',title:'T',source:'',category:'directly-integrable',tags:['fine-tuned'],added_at:now};
const r2 = classifyEntry(e2);
if(r2!=='requires-external-models') throw new Error('expected requires-external-models got '+r2);
// No indicators => default
const e3 = {id:'t3',title:'T',source:'',category:'directly-integrable',tags:['attention','transformer'],added_at:now};
const r3 = classifyEntry(e3);
if(r3!=='directly-integrable') throw new Error('expected directly-integrable got '+r3);
console.log('OK: priority cascade correct');
" 2>&1`
- **Target:** `OK: priority cascade correct`
- **Evidence:** The NERFIFY-BENCH Figure 7 taxonomy priority is specified explicitly in plan 100-02: `out-of-scope > requires-external-models > novelty-coverage > directly-integrable`. This is a correctness invariant for the category system — if the priority is wrong, the corpus will misclassify papers and apply incorrect difficulty multipliers in scoring.
- **Correlation with full metric:** HIGH for taxonomy correctness; does not validate that the taxonomy labels agree with human expert judgment on actual paper difficulty
- **Blind spots:** Tests only synthetic entries; real papers may have ambiguous tags that fall into unexpected categories.
- **Validated:** No — awaiting deferred validation D2

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Real corpus evaluation accuracy — DEFER-100-01
- **What:** Whether `loadCorpus` + `evaluateEntry` + `formatBenchmarkReport` produce correct results against a real benchmark corpus (actual paper entries with known ground-truth difficulty ratings)
- **How:** Assemble a labeled corpus of 10-20 papers with human-assigned `IntegrationCategory` labels. Run `evaluateEntry` for each and compare `classifyEntry` output against the human labels. Compute agreement rate.
- **Why deferred:** No labeled corpus exists. Building one requires domain expert review of each paper and judgment on integration difficulty — not automatable from the codebase alone.
- **Validates at:** Manual review milestone or when a real corpus is assembled in `.planning/benchmark/corpus/`
- **Depends on:** A labeled benchmark corpus with >= 10 entries; domain expert availability for ground-truth labeling
- **Target:** Category agreement >= 70% between `classifyEntry` heuristic and human-assigned labels (heuristics are intentionally conservative)
- **Risk if unmet:** The taxonomy is a useful heuristic but not validated. Papers may be systematically misclassified (e.g., transformer papers with `fine-tuned` tags incorrectly elevated to `requires-external-models` even when the paper's contribution is architecture-only). Misclassification propagates to wrong `category_adjustments` multipliers and biased composite scores.
- **Fallback:** Add a `category_override` field to `BenchmarkEntry` so humans can correct misclassifications without modifying tag heuristics

### D2: Semantic scoring weight calibration — DEFER-100-02
- **What:** Whether the default rubric weights (`semantic_weight: 0.6, trainability_weight: 0.4`) produce composite scores that rank papers in an order consistent with expert judgment on synthesis quality
- **How:** For a set of papers with human-ranked synthesis quality, compute composite scores using `createDefaultRubric()` and compare rank ordering. Compute Spearman correlation.
- **Why deferred:** Requires human expert rankings of paper-to-code synthesis quality — not available during phase development. The weights are adapted from NERFIFY-BENCH's design philosophy (semantic fidelity prioritized over executability) but not validated on GRD's specific synthesis outputs.
- **Validates at:** First real benchmark run after corpus assembly, ideally alongside DEFER-100-01
- **Depends on:** Human-ranked synthesis evaluations; real benchmark corpus; at least one full paper-to-code synthesis run through GRD to generate actual `TrainabilityMetrics`
- **Target:** Spearman rank correlation >= 0.6 between composite scores and expert rankings
- **Risk if unmet:** Composite scores mislead about synthesis quality. If `trainability_weight` is too low, papers that fail to build rank similarly to papers that build and run correctly. If `semantic_weight` is too high, cosmetically correct code (plausible-looking) ranks higher than functionally correct code.
- **Fallback:** Expose rubric weights as configuration (already done via `ScoringRubric` interface) so they can be tuned based on empirical validation without code changes

### D3: Agent integration — eval-planner and eval-reporter coordination — DEFER-100-03
- **What:** Whether `grd-eval-planner` and `grd-eval-reporter` agent definitions, when executed as live Claude Code subagents, correctly call the benchmark functions and produce a usable EVAL.md report
- **How:** Run a live evaluation session: spawn `grd-eval-planner` against a test corpus directory, spawn `grd-eval-reporter` against the resulting JSON results, verify the EVAL.md output contains a valid markdown table with correct composite scores.
- **Why deferred:** Agent definitions are prose documents. Their correctness cannot be verified without running them as live Claude Code agents with a real corpus and real synthesis outputs. The agent definitions do not have unit tests — they guide agent behavior at inference time.
- **Validates at:** First real GRD paper-to-code synthesis evaluation run (milestone v0.3.24 or later)
- **Depends on:** Working benchmark corpus; `lib/benchmark.ts` fully deployed; a completed paper-to-code synthesis phase that produces build/run outputs for evaluation
- **Target:** Agent produces valid `EVAL.md` with populated results table, no missing entries, composite scores in [0, 1]
- **Risk if unmet:** Agents reference functions correctly in their prose but fail to use them correctly at runtime (wrong argument order, incorrect JSON path, etc.). This would mean the benchmark integration exists in code but is not operationalized by the agents.
- **Fallback:** Add explicit function call examples with correct argument signatures to agent definition prose, referencing the TypeScript function signatures directly

---

## Ablation Plan

**No formal ablation conditions** — this phase implements a new module with no competing architectural alternatives. The design decisions are:

1. **Weight rationale (semantic 0.6 / trainability 0.4):** Not ablated here. Rationale from plan: semantic fidelity matters more for paper-to-code synthesis than executability, since a paper may describe a method that cannot be trained to convergence on standard hardware. The calibration is deferred to DEFER-100-02.

2. **Category adjustment values:** The `out-of-scope` multiplier of 0.5 halves composite scores for papers requiring proprietary resources. This is a design choice, not something testable within the phase. An ablation would require comparing ranking quality with different multiplier sets — deferred to DEFER-100-02.

3. **scoreSemanticFromSummary parsing strategy:** Line-by-line regex vs. structured format. The plan specifies regex. No ablation needed; the format is fully within GRD's control (agents produce the summaries).

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Zero-score entry | All semantic scores = 0, all trainability = false | composite = 0.0 | Algebraic from formula |
| Perfect entry (directly-integrable) | All semantic = 1.0, all trainability = true | composite = 1.0 | Algebraic from formula |
| Perfect entry (out-of-scope) | All semantic = 1.0, all trainability = true, category_adj = 0.5 | composite = 0.5 | Algebraic from formula |
| Build-only pass (no convergence) | semantic = 1.0, build=true, runtime=true, convergence=false, directly-integrable | composite = 0.88 | `(1.0*0.6 + 0.7*0.4)*1.0 = 0.88` |
| Existing lib coverage median | Lines coverage for existing lib modules | ~85-92% | jest.config.js thresholds |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/benchmark.test.ts   — primary test suite (TDD, covers all 9 functions)
lib/benchmark.ts               — module under test
lib/types.ts                   — type definitions (BenchmarkEntry, BenchmarkResult, etc.)
```

**How to run full evaluation (after phase completion):**
```bash
# Type check
cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check

# Lint
cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint

# Unit tests with coverage
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/benchmark.test.ts --coverage

# Algebraic invariant spot-check (P4)
cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const {scoreComposite,createDefaultRubric}=require('./lib/benchmark');const r=createDefaultRubric();const s={novelty_capture:1,api_surface_match:1,algorithmic_fidelity:1,notes:''};const t={build_success:true,runtime_stable:true,convergence_detected:true,execution_time_ms:100,error_log:''};console.log(scoreComposite(s,t,r,'directly-integrable'));"

# Export presence check (S3, after wave 2)
cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const b=require('./lib/benchmark');['loadCorpus','saveCorpusEntry','scoreComposite','createDefaultRubric','formatBenchmarkReport','classifyEntry','scoreSemanticFromSummary','assessTrainability','evaluateEntry'].forEach(f=>{if(typeof b[f]!=='function')throw new Error('missing: '+f)});console.log('all 9 exports OK');"
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript type check | — | | |
| S2: Wave-1 exports (5 functions) | — | | |
| S3: Wave-2 exports (9 functions) | — | | |
| S4: scoreComposite no NaN/Inf | — | | |
| S5: Rubric weights sum to 1.0 | — | | |
| S6: Agent frontmatter fields | — | | |
| S7: Agent benchmark references | — | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Unit test pass rate | 0 failures | — | — | |
| P2: Line coverage | >= 85% | — | — | |
| P2: Function coverage | >= 85% | — | — | |
| P2: Branch coverage | >= 75% | — | — | |
| P3: Lint errors | 0 | — | — | |
| P4: Algebraic invariants | c1=1.0, c2=0.44 | — | — | |
| P5: classifyEntry priority | out-of-scope wins | — | — | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-100-01 | Real corpus category agreement >= 70% | PENDING | Manual corpus assembly |
| DEFER-100-02 | Rubric weight Spearman >= 0.6 | PENDING | First real benchmark run |
| DEFER-100-03 | Agent integration live test | PENDING | Milestone v0.3.24+ |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH for code correctness, LOW for domain calibration

**Justification:**
- Sanity checks: adequate — cover module exports, type safety, mathematical invariants, and agent structural validity
- Proxy metrics: well-evidenced for code quality (TDD coverage, lint, algebraic invariants); weakly-evidenced for domain correctness (whether the NERFIFY-BENCH taxonomy and weights are well-calibrated for GRD's actual synthesis outputs)
- Deferred coverage: comprehensive for the identified gaps — corpus labeling, weight calibration, and live agent integration are all explicitly tracked

**What this evaluation CAN tell us:**
- Whether `lib/benchmark.ts` is correctly implemented per its specification (all 9 functions, correct formula, correct taxonomy priority)
- Whether the module meets GRD's TypeScript/lint/coverage standards
- Whether agent definition files are structurally valid and reference the right functions
- Whether composite scores are mathematically sound (clamped, weights correct, category adjustments applied)

**What this evaluation CANNOT tell us:**
- Whether the category taxonomy correctly reflects real-world paper integration difficulty (deferred to DEFER-100-01 — needs labeled corpus)
- Whether the default rubric weights (`0.6 / 0.4`) produce rankings that agree with expert judgment (deferred to DEFER-100-02 — needs human evaluation)
- Whether the agents work correctly when executed as live subagents against a real corpus (deferred to DEFER-100-03 — needs live evaluation run)
- Whether `scoreSemanticFromSummary` is robust to the variety of evaluation summary formats that grd-eval-planner will actually produce (not tested with production agent outputs)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-25*
