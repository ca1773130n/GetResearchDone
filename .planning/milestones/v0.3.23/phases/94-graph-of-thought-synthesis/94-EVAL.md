# Evaluation Plan: Phase 94 — Graph-of-Thought Synthesis

**Designed:** 2026-03-25
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Artifact DAG construction, topological sort (Kahn's algorithm), cycle detection (DFS), wave builder DAG integration
**Reference papers:** No external papers — internal algorithm design (Kahn's algorithm for topological sort, DFS cycle detection are standard CS fundamentals)

## Evaluation Overview

Phase 94 adds artifact-level dependency resolution to GRD. Plans declare `provides`, `requires`, and `integration_points` in YAML frontmatter. The `buildArtifactDAG()` function in `lib/deps.ts` constructs a directed graph from these declarations and returns a topologically sorted execution order. The `buildWaves()` function in `lib/parallel.ts` merges this graph with existing `depends_on` constraints to schedule plan execution waves.

What can be verified in-phase: All three tiers are achievable here because this is a pure-logic TypeScript feature with no external dependencies, no I/O, and well-defined inputs and outputs. The test suite (plan 94-03) is written in the same phase as the implementation, making full unit test coverage immediately available.

What requires deferral: Integration-level validation — specifically whether generated plans from `gd plan-phase` actually include the new frontmatter fields when prompted by the updated `buildPlanPrompt()`, and whether the wave scheduler produces measurably better execution ordering in real multi-phase projects — must be deferred to integration testing.

The implementation builds on existing patterns already in `lib/deps.ts` (`computeParallelGroups` uses Kahn's algorithm, `detectCycle` uses DFS). The new code follows the same structure, making the correctness properties well-understood.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | Project convention (`npm run build:check`) | Zero-tolerance for type errors in strict mode codebase |
| ESLint zero errors | Project convention (`npm run lint`, enforced by pre-commit hook) | Pre-commit hook blocks commits on lint failure |
| Unit test pass rate | REQ-189, plan 94-03 success criteria | Direct verification of algorithmic correctness |
| Line coverage >= 85% | REQ-189, jest.config.js thresholds (deps.ts: 94%, parallel.ts: 85%) | Project-enforced per-file coverage thresholds |
| Module exports present | Plan 94-01 and 94-02 verification commands | Verifies functions are correctly exported and callable |
| Topological sort correctness | Graph algorithm property: no node appears before its dependencies | Core correctness requirement for wave scheduling |
| Cycle detection accuracy | Graph algorithm property: all cycles identified, no false positives | Safety requirement — undetected cycles cause infinite loops |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality, format, and pipeline verification |
| Proxy (L2) | 5 | Test coverage, algorithmic correctness, and export validation |
| Deferred (L3) | 3 | Integration-level prompt effectiveness and real-world scheduling validation |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript compilation — no errors
- **What:** All new and modified files compile without TypeScript errors under `strict: true`
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no diagnostic output
- **Failure means:** Type error in the implementation — interface mismatch, missing property, or incorrect function signature

### S2: ESLint passes with zero errors
- **What:** New code in `lib/deps.ts`, `lib/parallel.ts`, `lib/types.ts`, `lib/autopilot.ts` passes lint
- **Command:** `npm run lint`
- **Expected:** Exit code 0, no errors or warnings
- **Failure means:** Code style violation — likely unused variable, `any` type, or missing `'use strict'`

### S3: Module exports present and callable
- **What:** `buildArtifactDAG`, `validateArtifactDAG` exported from `lib/deps.ts`; `buildWaves` exported from `lib/parallel.ts`
- **Command:** `node -e "const m = require('./lib/deps'); console.log(Object.keys(m).sort().join(','))"` and `node -e "const m = require('./lib/parallel'); console.log(Object.keys(m).sort().join(','))"`
- **Expected (deps.ts):** Output contains `buildArtifactDAG,buildDependencyGraph,cmdPhaseAnalyzeDeps,computeParallelGroups,detectCycle,parseDependsOn,validateArtifactDAG`
- **Expected (parallel.ts):** Output contains `buildParallelContext,buildWaves,cmdInitExecuteParallel,cmdParallelProgress,formatProgressBar,streamPhaseProgress,validateIndependentPhases`
- **Failure means:** Function not exported or file fails to load at require-time (syntax error, missing import)

### S4: Empty input returns empty DAG
- **What:** `buildArtifactDAG([])` returns the zero-element DAG without crashing
- **Command:** `node -e "const {buildArtifactDAG} = require('./lib/deps'); const r = buildArtifactDAG([]); console.log(JSON.stringify(r))"`
- **Expected:** `{"nodes":[],"edges":[],"sorted_plans":[],"providers":{}}`
- **Failure means:** Function crashes on empty input or returns unexpected structure

### S5: ArtifactDAG type interfaces present in lib/types.ts
- **What:** All four new interfaces exported from `lib/types.ts`
- **Command:** `grep -Ec "export interface ArtifactDAG\b|export interface ArtifactDAGNode|export interface ArtifactDAGEdge|export interface ArtifactDAGValidation" lib/types.ts`
- **Expected:** `4`
- **Failure means:** One or more interface definitions missing from types.ts

### S6: Unit test suite runs without crash
- **What:** The test files for deps and parallel can be loaded and executed by Jest without runtime errors
- **Command:** `npx jest tests/unit/deps.test.ts tests/unit/parallel.test.ts --no-coverage 2>&1 | tail -5`
- **Expected:** Test suite completes (pass or fail on individual tests is handled by proxy metrics); no "Cannot find module" or "SyntaxError" output
- **Failure means:** Import path broken, test file has syntax error, or module fails to load

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality and algorithmic correctness.
**IMPORTANT:** These proxy metrics measure the specific behaviors defined in REQ-186 through REQ-189. Because this is pure logic code with deterministic test inputs, these proxy metrics have HIGH correlation with actual correctness.

### P1: All unit tests pass
- **What:** The 24 test cases across `tests/unit/deps.test.ts` (15 tests) and `tests/unit/parallel.test.ts` (9 tests) all pass
- **How:** Run Jest on the two test files
- **Command:** `npx jest tests/unit/deps.test.ts tests/unit/parallel.test.ts`
- **Target:** 24/24 tests pass (0 failures)
- **Evidence:** Tests are written specifically to exercise the implemented logic — each test case maps to a stated requirement or algorithmic property. This is a direct correctness check, not an indirect proxy.
- **Correlation with full metric:** HIGH — test cases cover all named success criteria from plans 94-01 through 94-03
- **Blind spots:** Tests use synthetic `PlanArtifact` fixtures; behavior with real planner-generated plans (which may have varied artifact name formats) is deferred
- **Validated:** No — awaiting deferred validation at phase-95-integration or later autopilot run

### P2: Line coverage meets per-file thresholds
- **What:** Jest coverage on new code in `lib/deps.ts` and `lib/parallel.ts` meets or exceeds the thresholds set in `jest.config.js`
- **How:** Run Jest with `--coverage` flag; inspect per-file coverage report
- **Command:** `npx jest tests/unit/deps.test.ts tests/unit/parallel.test.ts --coverage --coverageReporters=text`
- **Target:** `lib/deps.ts` >= 94% lines (existing threshold, new code must not lower it); `lib/parallel.ts` >= 85% lines (existing threshold). REQ-189 specifies 85%+ on new code specifically.
- **Evidence:** Project enforces these thresholds in `jest.config.js` — the CI pipeline would fail at these same numbers. Thresholds chosen to ensure meaningful coverage rather than surface-level execution.
- **Correlation with full metric:** HIGH — coverage directly measures whether test paths execute the implemented logic
- **Blind spots:** Line coverage does not guarantee logical correctness — a test can cover a line without asserting the output. However, the specific test cases in plan 94-03 include assertions on return values, not just execution.
- **Validated:** No — coverage figures are static; runtime correctness in integration contexts deferred

### P3: Topological sort produces valid ordering
- **What:** For a 3-plan chain (A provides X, B requires X and provides Y, C requires Y), `sorted_plans` from `buildArtifactDAG` places A before B before C
- **How:** Inline node check
- **Command:** `node -e "const {buildArtifactDAG} = require('./lib/deps'); const plans = [{phase:'94-graph-of-thought-synthesis',plan:1,provides:['X'],requires:[],integration_points:[],objective:'A',files_modified:[],type:'execute',wave:1,depends_on:[],autonomous:true},{phase:'94-graph-of-thought-synthesis',plan:2,provides:['Y'],requires:['X'],integration_points:[],objective:'B',files_modified:[],type:'execute',wave:1,depends_on:[],autonomous:true},{phase:'94-graph-of-thought-synthesis',plan:3,provides:[],requires:['Y'],integration_points:[],objective:'C',files_modified:[],type:'execute',wave:1,depends_on:[],autonomous:true}]; const dag = buildArtifactDAG(plans); console.log(dag.sorted_plans.join(','))"`
- **Target:** Output is `94-01,94-02,94-03` (or equivalent — A before B before C)
- **Evidence:** Kahn's algorithm (level-based BFS topological sort) is a well-known algorithm that guarantees this property for DAGs. The plan specifies using Kahn's algorithm, matching the existing `computeParallelGroups` implementation in the same file.
- **Correlation with full metric:** HIGH — topological ordering is a binary correctness property
- **Blind spots:** Tests only verify simple linear and diamond patterns; complex multi-level graphs with many parallelizable nodes not stress-tested
- **Validated:** No — awaiting deferred validation

### P4: Cycle detection identifies multi-node cycles
- **What:** For a 3-plan cycle (A requires B's artifact, B requires C's artifact, C requires A's artifact), `validateArtifactDAG` returns `valid: false` with a non-empty `cycles` array
- **How:** Inline check using the constructed DAG
- **Command:** `node -e "const {buildArtifactDAG, validateArtifactDAG} = require('./lib/deps'); const plans = [{phase:'94-graph-of-thought-synthesis',plan:1,provides:['A'],requires:['C'],integration_points:[],objective:'P1',files_modified:[],type:'execute',wave:1,depends_on:[],autonomous:true},{phase:'94-graph-of-thought-synthesis',plan:2,provides:['B'],requires:['A'],integration_points:[],objective:'P2',files_modified:[],type:'execute',wave:1,depends_on:[],autonomous:true},{phase:'94-graph-of-thought-synthesis',plan:3,provides:['C'],requires:['B'],integration_points:[],objective:'P3',files_modified:[],type:'execute',wave:1,depends_on:[],autonomous:true}]; const dag = buildArtifactDAG(plans); const v = validateArtifactDAG(dag, plans); console.log('valid:' + v.valid + ' cycles:' + v.cycles.length)"`
- **Target:** `valid:false cycles:1` (or more cycles found)
- **Evidence:** DFS cycle detection is a standard algorithm; the plan specifies reusing the existing `detectCycle` pattern already in `lib/deps.ts`. The property is binary — either the cycle is found or it is not.
- **Correlation with full metric:** HIGH — cycle detection is a binary correctness property
- **Blind spots:** Does not test self-referencing cycles or cycles involving integration_point edges
- **Validated:** No — awaiting deferred validation

### P5: buildPlanPrompt updated with artifact field instruction
- **What:** The `buildPlanPrompt` function in `lib/autopilot.ts` includes text instructing the planner to declare `provides`, `requires`, `integration_points`
- **How:** Grep the autopilot source for the expected content
- **Command:** `grep -Ec "provides.*requires.*integration_points|integration_points.*provides.*requires|provides:.*\[\]" lib/autopilot.ts`
- **Target:** Count >= 1 (at least one line referencing all three fields in the prompt)
- **Evidence:** REQ-186 requires this instruction. The plan specifies appending the exact text to the existing prompt string. Greping for the content directly verifies the update landed.
- **Correlation with full metric:** MEDIUM — presence of the instruction text does not guarantee planners will comply, but it is the necessary condition. Planner compliance is deferred.
- **Blind spots:** Does not verify the quality or clarity of the instruction; does not verify planners follow it in practice
- **Validated:** No — planner compliance deferred to integration evaluation

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or observational data not available within the phase.

### D1: Planner compliance with artifact frontmatter instruction — DEFER-94-01
- **What:** When `gd plan-phase` is called, the generated PLAN.md files include `provides`, `requires`, and `integration_points` frontmatter fields with meaningful values (not just empty arrays)
- **How:** Run `gd plan-phase` on a real project after phase 94 ships; inspect generated plan YAML frontmatter for the three fields
- **Why deferred:** Requires a live planner agent run (Claude Code as subagent). The instruction added to `buildPlanPrompt` is a natural language directive to the planner — compliance depends on the planner model's behavior, not just the code change.
- **Validates at:** First autopilot run after v0.3.23 ships (phase 95 or later)
- **Depends on:** Phase 94 merged; live `gd plan-phase` invocation; real planner agent run
- **Target:** >= 80% of generated plans include non-empty `provides` and `requires` arrays when the phase has inter-plan dependencies
- **Risk if unmet:** Plans lack artifact declarations; `buildArtifactDAG` returns empty edges; wave scheduling falls back to `depends_on` only — functional but loses the GoT synthesis benefit. Impact: REQ-186 satisfied in code but not in practice.
- **Fallback:** Strengthen the prompt instruction; add a validation gate in `validateStructural` that warns when plans have empty `provides` despite describing new exports

### D2: Wave scheduling improves execution ordering in multi-plan phases — DEFER-94-02
- **What:** In a real multi-plan phase where plans have artifact dependencies, the `buildWaves()` result produces finer-grained wave assignments than `depends_on` alone
- **How:** Compare wave assignments from `buildWaves(plans, {})` vs `buildWaves(plans, { artifactDAG })` on the plans from a real phase like 94 itself (once all 3 plans have their SUMMARY.md files)
- **Why deferred:** No real phase with cross-plan artifact dependencies exists yet at the time of this evaluation. Phase 94 itself is the first phase with this structure.
- **Validates at:** phase-95 or first multi-plan phase after v0.3.23
- **Depends on:** Phase 94 complete; at least one subsequent phase with inter-plan artifact dependencies; plans generated with artifact frontmatter fields
- **Target:** Wave assignments from artifact DAG produce at least one additional wave boundary compared to `depends_on`-only scheduling for a phase with known inter-plan dependencies
- **Risk if unmet:** Wave builder integration is functionally correct (unit tests pass) but provides no observable benefit in practice. Impact: Low — the feature degrades gracefully to `depends_on`-only behavior.
- **Fallback:** Accept `depends_on`-only scheduling as sufficient; document artifact DAG as opt-in enhancement

### D3: No regression on existing parallel execution — DEFER-94-03
- **What:** The changes to `lib/parallel.ts` (adding `buildWaves`) do not break the existing `buildParallelContext` behavior used in `gd execute-phase --parallel`
- **How:** Run `gd execute-phase --parallel` on a real multi-phase project after v0.3.23 ships and verify wave-based execution proceeds as before
- **Why deferred:** Integration test requires a real multi-phase project execution. Unit tests cover `buildParallelContext` independently, but integration-level regression is not verifiable in-phase.
- **Validates at:** First parallel autopilot run after v0.3.23
- **Depends on:** v0.3.23 shipped; project with parallel phases available for test run
- **Target:** Zero regressions in parallel execution behavior — same wave assignments, same concurrency, same output format as before phase 94
- **Risk if unmet:** Parallel execution broken for all users. Impact: HIGH — this would be a blocking regression.
- **Fallback:** Revert `lib/parallel.ts` changes while keeping `lib/deps.ts` intact; ship DAG functions without wave builder integration

## Ablation Plan

**Purpose:** Isolate component contributions of the two-algorithm design.

### A1: Kahn's algorithm vs DFS topological sort
- **Condition:** Replace Kahn's algorithm in `buildArtifactDAG` with a DFS-based topological sort (which is also used by `detectCycle`)
- **Expected impact:** Same sorted order; slightly different performance profile on large graphs. Both are O(V+E). No functional difference expected for typical GRD phase sizes (< 20 plans).
- **Command:** Not run during phase — document as design validation noting the plan spec chose Kahn's to reuse the pattern from `computeParallelGroups`
- **Evidence:** Both algorithms are equivalent for DAG topological sort; the plan explicitly chose Kahn's for consistency with existing code

### A2: Separate DAG builder vs inline wave builder
- **Condition:** The current design separates `buildArtifactDAG` (in `lib/deps.ts`) from `buildWaves` (in `lib/parallel.ts`). An alternative is a single combined function.
- **Expected impact:** Separation allows `buildArtifactDAG` to be used independently for validation and display, without requiring wave scheduling. The `validateArtifactDAG` function consumes the same DAG, confirming separation is beneficial.
- **Command:** Not run — this is a design decision, not a measurable ablation
- **Evidence:** The separate `validateArtifactDAG` function reuses `ArtifactDAG` output, which would not be possible with a combined function

**No runtime ablations scheduled** — phase 94 implements deterministic algorithms with well-understood properties. The design choices (Kahn's algorithm, separate builder/validator) are validated by code structure, not by performance comparison.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 94 modifies `lib/deps.ts`, `lib/parallel.ts`, `lib/types.ts`, and `lib/autopilot.ts` (backend TypeScript modules only).

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| lib/deps.ts coverage threshold | Existing Jest per-file threshold | >= 94% lines, 100% functions, 87% branches | jest.config.js |
| lib/parallel.ts coverage threshold | Existing Jest per-file threshold | >= 85% lines, 100% functions, 80% branches | jest.config.js |
| lib/autopilot.ts coverage threshold | Existing Jest per-file threshold | >= 83% lines, 91% functions, 75% branches | jest.config.js |
| TypeScript strict mode | Zero type errors required | 0 errors | tsconfig.json (strict: true) |
| Lint error count | Zero lint errors on commit | 0 errors | pre-commit hook + npm run lint |
| File size (lib/deps.ts) | Must not exceed project file size guideline | <= 500 lines (currently 282; will grow to ~350+ after plan 94-01) | PRODUCT-QUALITY.md P0 |
| File size (lib/parallel.ts) | Must not exceed project file size guideline | <= 500 lines (currently 429; will grow to ~480+ after plan 94-02) | PRODUCT-QUALITY.md P0, plan 94-02 min_lines: 480 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/deps.test.ts      — buildArtifactDAG and validateArtifactDAG tests (plan 94-03)
tests/unit/parallel.test.ts  — buildWaves tests (plan 94-03)
```

**How to run full evaluation:**
```bash
cd /Users/neo/Developer/Projects/GetResearchDone

# Sanity: type check + lint
npm run build:check
npm run lint

# Sanity: module exports
node -e "const m = require('./lib/deps'); console.log(Object.keys(m).sort().join(','))"
node -e "const m = require('./lib/parallel'); console.log(Object.keys(m).sort().join(','))"

# Sanity: interface presence
grep -Ec "export interface ArtifactDAG\b|export interface ArtifactDAGNode|export interface ArtifactDAGEdge|export interface ArtifactDAGValidation" lib/types.ts

# Proxy: unit tests with coverage
npx jest tests/unit/deps.test.ts tests/unit/parallel.test.ts --coverage --coverageReporters=text

# Proxy: prompt update
grep -Ec "provides.*requires.*integration_points|provides:.*\[\]" lib/autopilot.ts
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | [PASS/FAIL] | | |
| S2: ESLint zero errors | [PASS/FAIL] | | |
| S3: Module exports present | [PASS/FAIL] | | |
| S4: Empty input returns empty DAG | [PASS/FAIL] | | |
| S5: ArtifactDAG interfaces in types.ts | [PASS/FAIL] | | |
| S6: Test suite runs without crash | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: All unit tests pass | 24/24 | | [MET/MISSED] | |
| P2: Line coverage lib/deps.ts | >= 94% | | [MET/MISSED] | |
| P2: Line coverage lib/parallel.ts | >= 85% | | [MET/MISSED] | |
| P3: Topological sort valid order | A before B before C | | [MET/MISSED] | |
| P4: Cycle detection multi-node | valid:false cycles:1+ | | [MET/MISSED] | |
| P5: buildPlanPrompt updated | grep count >= 1 | | [MET/MISSED] | |

### Ablation Results

No runtime ablations — design choices documented in ablation plan section.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-94-01 | Planner compliance with artifact frontmatter | PENDING | First autopilot run after v0.3.23 |
| DEFER-94-02 | Wave scheduling improves real-world ordering | PENDING | phase-95 or first multi-plan phase after v0.3.23 |
| DEFER-94-03 | No regression in parallel execution | PENDING | First parallel autopilot run after v0.3.23 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 6 checks covering compilation, lint, runtime loading, output structure, and interface presence. These catch the most common implementation failures.
- Proxy metrics: Well-evidenced — unit tests directly exercise the implemented algorithms with known-correct fixture data. Coverage thresholds are enforced by the project's existing `jest.config.js` (not invented for this evaluation). Topological sort and cycle detection are binary correctness properties, making the proxy correlation HIGH.
- Deferred coverage: Partial but appropriate — the three deferred items (planner compliance, scheduling improvement, regression check) all require live agent runs or real project execution that cannot be done within a single phase. The risk assessment for DEFER-94-03 is explicitly flagged HIGH because a parallel execution regression would affect all users.

**What this evaluation CAN tell us:**
- Whether `buildArtifactDAG` constructs a correct directed graph from `PlanArtifact` inputs
- Whether `validateArtifactDAG` correctly identifies cycles and missing dependencies
- Whether `buildWaves` produces topologically valid wave assignments from both `depends_on` and artifact DAG constraints
- Whether the code meets the project's TypeScript, lint, and coverage standards
- Whether the four new interfaces are correctly defined in `lib/types.ts`
- Whether `buildPlanPrompt` has been updated to mention the new frontmatter fields

**What this evaluation CANNOT tell us:**
- Whether real planner agents will generate plans with meaningful `provides`/`requires` values (DEFER-94-01 — validates at first post-v0.3.23 autopilot run)
- Whether the artifact DAG produces measurably better execution ordering on real multi-plan phases vs `depends_on`-only scheduling (DEFER-94-02 — validates at phase-95 or later)
- Whether `buildParallelContext` (the existing wave execution path) remains correct after the changes to `lib/parallel.ts` in production use (DEFER-94-03 — validates at first parallel autopilot run after v0.3.23)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-25*
