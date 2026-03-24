# Evaluation Plan: Phase 93 — Compositional Citation Recovery

**Designed:** 2026-03-24
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Citation graph construction, component dependency extraction, API-based citation resolution, configurable gate integration
**Reference papers:** No external papers — this phase implements an original feature within GRD's own R&D workflow.

## Evaluation Overview

Phase 93 adds a citation-recovery subsystem to GRD: a typed citation graph (`lib/citations.ts`), structured output fields in two agent prompts, and a configurable gate that blocks planning when critical dependencies remain unresolved. All work is implementation-against-spec, not paper reproduction, so there are no external benchmark figures to chase. Evaluation focuses on correctness of the TypeScript module, coverage of the test suite, and structural completeness of the agent prompt changes.

The phase decomposes into three plans executed in two waves. Plans 93-01 and 93-02 run in parallel (Wave 1); plan 93-03 depends on 93-01 (Wave 2). Sanity checks are applicable to all three plans. Proxy metrics are strongest for 93-03 (measurable coverage), moderate for 93-01 (export shape + type check), and weak for 93-02 (agent prompt content is structural only). No deferred validations require external integration beyond what ships in this phase, with one exception: end-to-end agent behavior when `grd-deep-diver` and `grd-phase-researcher` are actually run on a real research task.

No BENCHMARKS.md exists for this milestone. Targets are derived from the requirements (REQ-182 through REQ-185) and the project's established coverage conventions in `jest.config.js`.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compiles (zero errors) | Project convention — all phases | Type safety is the primary correctness signal for new lib/ modules |
| ESLint passes (zero errors) | Project convention — `npm run lint` | Enforces zero-`any`, unused-arg prefix, CommonJS pattern compliance |
| Module exports shape | REQ-183 — `buildCitationGraph`, `resolveCitations`, `findUnresolved` | Verifies public API surface matches what gates.ts and tests import |
| 85%+ line coverage on lib/citations.ts | REQ-185 — explicit percentage target | Coverage threshold enforced in jest.config.js, consistent with project norms (85–98% range across lib/) |
| 85%+ function coverage on lib/citations.ts | REQ-185 — derived from 85% line target | Ensures all five exported functions have test paths |
| 75%+ branch coverage on lib/citations.ts | REQ-185 — derived from 93-03 plan | Consistent with project's branch coverage floor (75% for most modules) |
| citation-gate in GATE_REGISTRY | REQ-184 — configurable gate | Gate only fires if wired; presence check is a structural correctness signal |
| Agent prompt section counts | REQ-182 — structured output | Counts of "Missing Components" / "Borrowed Components" / citation recovery strings are the only automated signal for agent prompt correctness |
| Existing test suite still passes | Project health — regression | Phase 93 modifies gates.ts; existing gates.test.ts must remain green |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 | Basic functionality and format verification across all three plans |
| Proxy (L2) | 5 | Test coverage, export shape, gate wiring, agent prompt structure |
| Deferred (L3) | 2 | End-to-end agent behavior in a live research run |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compiles Clean

- **What:** `lib/citations.ts` and `lib/types.ts` additions compile without errors
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no TypeScript errors in output
- **Failure means:** Type interface mismatch, missing import, or incompatible type annotation — block execution until fixed

### S2: ESLint Passes

- **What:** New and modified files (`lib/citations.ts`, `lib/gates.ts`, `lib/types.ts`) pass linting
- **Command:** `npm run lint`
- **Expected:** Exit code 0, zero lint errors and zero lint warnings
- **Failure means:** Code style violation (`any` use, missing unused-arg prefix, wrong CommonJS pattern) — fix before merging

### S3: Module Exports Shape

- **What:** `lib/citations.ts` exports exactly the expected public API functions
- **Command:** `node -e "const m = require('./lib/citations'); console.log(Object.keys(m).sort().join(','))"`
- **Expected:** `buildCitationGraph,findUnresolved,parseBorrowedComponents,parseMissingComponents,resolveCitations`
- **Failure means:** Function not exported or misspelled — indicates plan 93-01 or 93-03 execution gap

### S4: Citation Type Interfaces Present in lib/types.ts

- **What:** All six citation interfaces exist in `lib/types.ts`
- **Command:** `node -e "const t = require('./lib/types'); const names = ['CitationGraph','CitationNode','CitationEdge','MissingComponent','BorrowedComponent','ApiConfig']; console.log(names.every(n => n in t) ? 'OK' : 'MISSING')"`
- **Expected:** `OK`
- **Failure means:** Plan 93-01 Task 1 incomplete — type definitions not added

### S5: Citation Gate Wired in GATE_REGISTRY

- **What:** `citation-gate` is present in `GATE_REGISTRY` for the `plan-phase` key
- **Command:** `node -e "const { GATE_REGISTRY } = require('./lib/gates'); console.log((GATE_REGISTRY['plan-phase'] || []).includes('citation-gate') ? 'WIRED' : 'MISSING')"`
- **Expected:** `WIRED`
- **Failure means:** Plan 93-03 Task 2 incomplete — gate registered but not wired to plan-phase

### S6: Agent Prompt Sections Present

- **What:** `grd-deep-diver.md` and `grd-phase-researcher.md` contain the required structured output sections
- **Command:** `grep -c "Missing Components\|Borrowed Components\|missing_components\|borrowed_components" agents/grd-deep-diver.md && grep -c "citation.*recovery\|buildCitationGraph\|findUnresolved\|Citation Recovery\|citation_gate" agents/grd-phase-researcher.md`
- **Expected:** First count >= 6; second count >= 5
- **Failure means:** Plan 93-02 tasks incomplete — agent prompts not updated

### S7: No NaN/Error in Graph Construction

- **What:** `buildCitationGraph` runs on an empty directory without crashing
- **Command:** `node -e "const os=require('os'),path=require('path'),fs=require('fs'); const t=fs.mkdtempSync(path.join(os.tmpdir(),'grd-cite-')); const {buildCitationGraph}=require('./lib/citations'); const g=buildCitationGraph(t); console.log(typeof g.nodes, typeof g.edges, typeof g.built_at); fs.rmdirSync(t,{recursive:true})"`
- **Expected:** `object object string`
- **Failure means:** Crash on empty input — basic defensive coding gap in `buildCitationGraph`

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to proxy validation.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality and completeness.
**IMPORTANT:** These proxy metrics measure structural and coverage properties, not end-to-end citation recovery quality. Treat results with appropriate skepticism — a passing coverage number does not guarantee correct API parsing behavior in production.

### P1: Line Coverage on lib/citations.ts >= 85%

- **What:** Percentage of executable lines in `lib/citations.ts` exercised by `tests/unit/citations.test.ts`
- **How:** Jest coverage report, per-file threshold enforced
- **Command:** `npx jest tests/unit/citations.test.ts --coverage --coverageReporters=text 2>&1 | grep "citations.ts"`
- **Target:** Lines >= 85%, Functions >= 85%, Branches >= 75%
- **Evidence:** REQ-185 explicitly states 85%+ line coverage. Project `jest.config.js` shows all lib/ modules carry 80–98% thresholds; 85% is in the expected range and consistent with `lib/discussion.ts`, `lib/autoplan.ts`, `lib/verify.ts`, `lib/state.ts`.
- **Correlation with full metric:** MEDIUM — coverage measures test path completeness, not semantic correctness of the parsing logic or API response handling. A test that exercises the parsing code with a trivial fixture contributes to coverage without validating edge-case behavior.
- **Blind spots:** Coverage does not detect: (1) incorrect regex patterns that parse valid PAPERS.md sections incorrectly, (2) API timeout handling that silently swallows errors, (3) priority escalation logic for `code_available: false` that is tested but asserts the wrong value.
- **Validated:** No — awaiting deferred validation at phase-93-integration (DEFER-93-02)

### P2: Function Coverage on lib/citations.ts >= 85%

- **What:** All five exported functions (`buildCitationGraph`, `resolveCitations`, `findUnresolved`, `parseMissingComponents`, `parseBorrowedComponents`) have at least one test path
- **How:** Jest function coverage column in per-file report
- **Command:** `npx jest tests/unit/citations.test.ts --coverage --coverageReporters=text 2>&1 | grep "citations.ts"`
- **Target:** Functions >= 85% (at minimum 4/5 exported functions covered; target is 5/5)
- **Evidence:** Jest.config.js establishes function coverage as a tracked dimension for all lib/ modules. All five functions are independently useful to consumers (gates.ts, grd-phase-researcher), so each must have a viable test path.
- **Correlation with full metric:** MEDIUM — function presence in coverage does not mean edge cases are covered (see P1 blind spots).
- **Blind spots:** A function can register as covered by a single trivial test case even if its main branches are untested.
- **Validated:** No — awaiting deferred validation at phase-93-integration (DEFER-93-02)

### P3: Existing Test Suite Passes Without Regression

- **What:** `gates.test.ts`, `invariants.test.ts`, and all other existing tests still pass after plan 93-03 modifies `lib/gates.ts`
- **How:** Full test suite run
- **Command:** `npm test 2>&1 | tail -20`
- **Target:** 0 failing tests, 0 new test errors
- **Evidence:** Plan 93-03 adds `checkCitationGate` to `lib/gates.ts` and wires it into GATE_REGISTRY. Any import error or type conflict in gates.ts would cause the existing gates test suite to fail. This proxy directly measures whether the integration is non-breaking.
- **Correlation with full metric:** HIGH — a failing gates test immediately identifies a regression introduced by the citation gate addition.
- **Blind spots:** Existing tests do not cover the new `checkCitationGate` function path — that coverage comes from P1/P2.
- **Validated:** No — but this proxy has a clear binary outcome (pass/fail) with no ambiguity.

### P4: Coverage Threshold in jest.config.js Present

- **What:** `jest.config.js` contains a per-file threshold entry for `lib/citations.ts`
- **How:** Text search
- **Command:** `grep "citations.ts" jest.config.js`
- **Target:** Line contains `{ lines: 85, functions: 85, branches: 75 }` (or equivalent values meeting REQ-185)
- **Evidence:** REQ-185 and plan 93-03 Task 2 explicitly require this threshold. Its absence means coverage requirements are not enforced by CI runs.
- **Correlation with full metric:** HIGH — structural check with binary outcome.
- **Blind spots:** None for this specific check; threshold presence does not mean the threshold is actually met (P1 measures that).
- **Validated:** No (though this is a deterministic check with no ambiguity).

### P5: buildCitationGraph Correctly Classifies Priority

- **What:** When `code_available: false` is present in a missing component, the target node in the graph receives `priority: 'critical'`
- **How:** Construct a minimal PAPERS.md fixture with one code_available:false entry, run buildCitationGraph, check node priority
- **Command:** `node -e "
  const os=require('os'),path=require('path'),fs=require('fs');
  const t=fs.mkdtempSync(path.join(os.tmpdir(),'grd-cite-'));
  const papersContent = '# Papers\n\n## My Paper\n\n### Missing Components\n\n| Name | Source Paper | Description | Code Available |\n|------|-------------|-------------|----------------|\n| RoPE | vaswani-attention-2017 | Rotary embeddings | No |\n';
  fs.writeFileSync(path.join(t,'PAPERS.md'), papersContent);
  const {buildCitationGraph}=require('./lib/citations');
  const g=buildCitationGraph(t);
  const critical=g.nodes.filter(n=>n.priority==='critical');
  console.log('critical nodes:', critical.length);
  fs.rmdirSync(t,{recursive:true})
"`
- **Target:** `critical nodes: 1` (or greater, depending on parsing of the fixture)
- **Evidence:** REQ-183 and plan 93-01 Task 2 require priority escalation to 'critical' for nodes where code_available is false. This is a key correctness requirement for the citation gate to work — the gate only fires on `priority: 'critical'` nodes.
- **Correlation with full metric:** HIGH for this specific behavior — directly tests the priority escalation path.
- **Blind spots:** This fixture tests table format only; list format is tested separately in the unit suite (P1).
- **Validated:** No — awaiting deferred validation (DEFER-93-01) when a real PAPERS.md with component data is processed.

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring a live agent run or integration context not available during unit-phase execution.

### D1: End-to-End Agent Citation Output — DEFER-93-01

- **What:** `grd-deep-diver` actually produces correctly formatted `## Missing Components` and `## Borrowed Components` sections when analyzing a real paper, and `parseMissingComponents`/`parseBorrowedComponents` can parse the output without loss
- **How:** Run `grd-deep-diver` on a known paper (e.g., a Semantic Scholar entry), inspect the PAPERS.md output, then run `buildCitationGraph` on the result and verify the graph contains the expected nodes and edges
- **Why deferred:** Requires a live agent execution with a real paper — not automatable in unit tests. The format produced by an LLM agent may drift from the template defined in the agent prompt. The only way to verify round-trip fidelity (agent output -> parser input) is a live run.
- **Validates at:** First milestone that includes a research phase (v0.3.23 Phase 94 or Phase 95 if they run `grd-phase-researcher`)
- **Depends on:** A completed deep-dive where grd-deep-diver is invoked on a real arXiv paper
- **Target:** `buildCitationGraph` produces >= 1 node per paper, edges match expected dependency count (no truncation or parse failure)
- **Risk if unmet:** Parser regex may not match LLM output format — agent produces structured output but parser silently returns empty arrays, resulting in empty citation graphs and a non-functional gate. Recovery: update parser patterns to match actual LLM output and release a patch.
- **Fallback:** Manual inspection of PAPERS.md output + regex adjustment if needed. Risk is LOW — the template in the agent prompt is well-specified and simple; the parser handles both list and table formats.

### D2: Citation Recovery API Integration — DEFER-93-02

- **What:** `resolveCitations` successfully fetches real paper abstracts from arXiv and Semantic Scholar APIs (not mocked), correctly populates `technique_summary`, and marks nodes as resolved
- **How:** Run `resolveCitations` against a real `CitationGraph` with a known paper slug (e.g., `vaswani-attention-2017`) using live API calls with `arxiv_enabled: true` and `semantic_scholar_enabled: true`
- **Why deferred:** Unit tests use a mocked `fetchFn` to avoid network dependencies. Real API behavior — rate limits, XML/JSON format changes, network timeouts, CORS — cannot be validated in unit tests.
- **Validates at:** Manual integration test or a dedicated network-enabled test run (not part of the standard `npm test` suite)
- **Depends on:** Network access to `export.arxiv.org` and `api.semanticscholar.org`; valid paper title in the citation graph
- **Target:** >= 1 node resolved per run; `technique_summary` non-empty (> 20 characters); no unhandled promise rejection
- **Risk if unmet:** arXiv XML parse path or Semantic Scholar JSON path may be malformed — `resolveCitations` leaves nodes unresolved silently. Citation recovery pass in `grd-phase-researcher` would then report 0 resolved nodes despite working APIs. Recovery: fix the response parsing, add integration test to CI with VCR-style recorded responses.
- **Fallback:** Mocked unit tests still validate the logic paths. API integration is a quality-of-life improvement (faster recovery in the agent); the gate still functions correctly based on graph state.

---

## Ablation Plan

**No ablation plan** — Phase 93 implements new functionality (citation graph, gate) with no competing sub-methods to compare. The key design choice (injectable `fetchFn` for testability) is architectural, not performance-comparative. Verification is correctness-based, not trade-off-based.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All changes are in `lib/`, `agents/`, `tests/`, and `jest.config.js`.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| `lib/gates.ts` coverage | Existing coverage before phase 93 modifies it | Lines >= 98%, Functions >= 100%, Branches >= 82% | jest.config.js per-file threshold |
| `npm test` pass rate | All existing tests green before phase 93 starts | 100% (0 failing) | Pre-execution baseline |
| `npm run lint` | Zero lint errors before phase 93 starts | 0 errors | Pre-execution baseline |
| Per-file coverage floor | Project floor across lib/ modules | Lines: 74–98%, Functions: 80–100% | jest.config.js |

---

## Evaluation Scripts

**How to run sanity checks:**
```bash
npm run build:check
npm run lint
node -e "const m = require('./lib/citations'); console.log(Object.keys(m).sort().join(','))"
node -e "const t = require('./lib/types'); const names = ['CitationGraph','CitationNode','CitationEdge','MissingComponent','BorrowedComponent','ApiConfig']; console.log(names.every(n => n in t) ? 'OK' : 'MISSING')"
node -e "const { GATE_REGISTRY } = require('./lib/gates'); console.log((GATE_REGISTRY['plan-phase'] || []).includes('citation-gate') ? 'WIRED' : 'MISSING')"
grep -c "Missing Components\|Borrowed Components\|missing_components\|borrowed_components" agents/grd-deep-diver.md
grep -c "citation.*recovery\|buildCitationGraph\|findUnresolved\|Citation Recovery\|citation_gate" agents/grd-phase-researcher.md
```

**How to run proxy metrics:**
```bash
npx jest tests/unit/citations.test.ts --coverage --coverageReporters=text
npm test
grep "citations.ts" jest.config.js
```

**How to run full evaluation:**
```bash
npm run build:check && npm run lint && npx jest tests/unit/citations.test.ts --coverage --coverageReporters=text && npm test
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compiles | [PASS/FAIL] | | |
| S2: ESLint passes | [PASS/FAIL] | | |
| S3: Module exports shape | [PASS/FAIL] | | |
| S4: Citation type interfaces | [PASS/FAIL] | | |
| S5: Citation gate wired | [PASS/FAIL] | | |
| S6: Agent prompt sections | [PASS/FAIL] | counts: , | |
| S7: No crash on empty input | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Line coverage | >= 85% | | [MET/MISSED] | |
| P2: Function coverage | >= 85% | | [MET/MISSED] | |
| P3: Existing tests pass | 0 failures | | [MET/MISSED] | |
| P4: Coverage threshold in jest.config.js | Present | | [MET/MISSED] | |
| P5: Priority escalation (code_available:false) | critical nodes >= 1 | | [MET/MISSED] | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-93-01 | Agent round-trip: deep-diver output -> parser | PENDING | Phase 94 or 95 research run |
| DEFER-93-02 | resolveCitations against live arXiv/Semantic Scholar APIs | PENDING | Manual network integration test |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM

**Justification:**

- **Sanity checks:** ADEQUATE — 7 deterministic checks cover module shape, type safety, gate wiring, agent prompt structure, and crash-free execution on empty input. These are the strongest verification signals available at this stage.

- **Proxy metrics:** MODERATE — P1–P4 are well-evidenced by project conventions and explicit requirements. P5 is a targeted correctness check for the most consequential behavior (priority escalation that drives gate firing). The 85% coverage target is the weakest proxy because it measures path coverage, not semantic correctness of the parsing logic or API response handlers. The mocked `fetchFn` pattern in tests/unit/citations.test.ts is the right approach for unit testing but deliberately omits real API validation.

- **Deferred coverage:** ADEQUATE for the scope of a unit-level phase. The two deferred items are genuinely only validatable through live agent runs or network access — not appropriate for the standard test suite. Both have low risk (the fallback is a regex fix or parse adjustment, not an architectural change).

**What this evaluation CAN tell us:**
- Whether `lib/citations.ts` is type-safe and lint-compliant
- Whether the public API surface matches what consumers (gates.ts, grd-phase-researcher) expect
- Whether `buildCitationGraph`, `resolveCitations`, `findUnresolved`, `parseMissingComponents`, and `parseBorrowedComponents` have adequate test coverage
- Whether the citation gate is wired into `plan-phase` without breaking existing gates tests
- Whether agent prompt files contain the required structured output sections

**What this evaluation CANNOT tell us:**
- Whether `grd-deep-diver` LLM output actually matches the parser's expected format (DEFER-93-01 — validates at next research run)
- Whether `resolveCitations` correctly handles real arXiv XML and Semantic Scholar JSON responses (DEFER-93-02 — validates in manual network test)
- Whether the citation gate firing behavior is correct in a real `.planning/` context with an actual config.json containing `citation_gate: true`

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-24*
