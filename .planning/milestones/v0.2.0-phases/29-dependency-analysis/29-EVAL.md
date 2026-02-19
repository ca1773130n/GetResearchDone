# Evaluation Plan: Phase 29 — Phase Dependency Analysis

**Designed:** 2026-02-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Dependency graph construction (Kahn's algorithm topological sort), DFS cycle detection, ROADMAP.md `depends_on` field parsing
**Reference:** REQ-43 (Phase Dependency Analysis), ROADMAP.md Phase 29 success criteria, Plans 29-01 and 29-02

## Evaluation Overview

Phase 29 delivers a CLI tooling feature — not an ML/performance system — so there are no benchmark datasets or model quality metrics. The evaluation strategy is correctness-focused: does the dependency analysis module produce accurate graphs, correct parallel groupings, and reliable cycle detection from ROADMAP.md input?

The phase implements two waves: Plan 01 creates `lib/deps.js` (pure functions: `parseDependsOn`, `buildDependencyGraph`, `computeParallelGroups`, `detectCycle`, `cmdPhaseAnalyzeDeps`) and refactors `lib/roadmap.js` to extract `analyzeRoadmap`. Plan 02 wires the CLI subcommand (`phase analyze-deps`) and MCP tool descriptor (`grd_phase_analyze_deps`).

What can be verified in-phase is comprehensive for this type of feature: unit tests cover all algorithmic paths, integration tests cover the CLI end-to-end, and the real ROADMAP.md serves as a live fixture for correctness verification. What must be deferred is the only thing that truly cannot be tested in isolation: whether Phase 30's parallel executor correctly consumes the `parallel_groups` output to spawn teammate agents.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test count (unit) | Plan 29-01 spec (~26 tests) | TDD: tests define the behavioral contract |
| Test count (integration) | Plan 29-02 spec (~5 tests) | Verifies CLI routing end-to-end |
| Regression delta | STATE.md baseline (1,487 tests) | Zero regressions required by all phases |
| Parallel groups correctness | v0.2.0 roadmap structure (known answer) | Verifiable against known dependency graph |
| Cycle detection correctness | Graph algorithm properties | Known-correct for hand-crafted cyclic inputs |
| CLI JSON schema | Plan 01/02 must_haves.truths | Defines required output fields |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 5 checks | Module exports, CLI routing, JSON validity, no crashes |
| Proxy (L2) | 4 metrics | Algorithmic correctness, test coverage, regression safety |
| Deferred (L3) | 1 validation | Integration with Phase 30 parallel executor |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module Exports All Five Functions

- **What:** `lib/deps.js` exists and exports `parseDependsOn`, `buildDependencyGraph`, `computeParallelGroups`, `detectCycle`, `cmdPhaseAnalyzeDeps`
- **Command:** `node -e "const d = require('./lib/deps'); console.log(Object.keys(d).join(','))"`
- **Expected:** Output contains all five names: `parseDependsOn,buildDependencyGraph,computeParallelGroups,detectCycle,cmdPhaseAnalyzeDeps`
- **Failure means:** Module was not created, was created with wrong export names, or has a syntax error

### S2: CLI Subcommand Routed (Not "Unknown Subcommand")

- **What:** `grd-tools phase analyze-deps` is recognized by the CLI router
- **Command:** `node bin/grd-tools.js phase analyze-deps 2>&1 | head -5`
- **Expected:** Output begins with `{` (JSON), not `Error: Unknown phase subcommand`
- **Failure means:** Plan 02 wiring was not applied — `analyze-deps` missing from `PHASE_SUBS` array or routing block

### S3: CLI Output Is Valid JSON With Required Fields

- **What:** The command produces parseable JSON containing `nodes`, `edges`, `parallel_groups`, `has_cycle`
- **Command:** `node bin/grd-tools.js phase analyze-deps 2>&1 | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(['nodes','edges','parallel_groups','has_cycle'].every(k=>k in j))"`
- **Expected:** `true`
- **Failure means:** Output schema is wrong — missing required fields, or output is not valid JSON

### S4: analyzeRoadmap Exported From lib/roadmap.js

- **What:** The `analyzeRoadmap` extraction refactor was applied correctly
- **Command:** `node -e "const r = require('./lib/roadmap'); console.log(typeof r.analyzeRoadmap)"`
- **Expected:** `function`
- **Failure means:** Refactor in Plan 01 was not completed; `cmdPhaseAnalyzeDeps` cannot call `analyzeRoadmap` without crashing

### S5: MCP Descriptor Registered

- **What:** `grd_phase_analyze_deps` appears in `lib/mcp-server.js` COMMAND_DESCRIPTORS
- **Command:** `grep -c "grd_phase_analyze_deps" lib/mcp-server.js`
- **Expected:** `1` or greater
- **Failure means:** Plan 02 MCP wiring was not applied; tool not accessible via MCP protocol

**Sanity gate:** ALL five sanity checks must pass. Any failure blocks progression to proxy metric evaluation.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of algorithmic correctness and integration quality.
**IMPORTANT:** These proxy metrics measure the feature's correctness comprehensively for a CLI tool. For algorithm-correctness problems (unlike ML quality), passing unit tests against a well-specified test suite IS strong evidence of correctness, not merely a proxy.

### P1: Unit Test Suite Passes (All ~26 Tests in deps.test.js)

- **What:** The `tests/unit/deps.test.js` test suite created in Plan 01 passes completely
- **How:** Run Jest on the deps test file, check pass count and failure count
- **Command:** `npx jest tests/unit/deps.test.js --no-coverage 2>&1 | tail -10`
- **Target:** 0 failures; test count >= 26
- **Evidence:** Plan 29-01 specifies the exact test cases: 7 for `parseDependsOn`, 5 for `buildDependencyGraph`, 6 for `computeParallelGroups`, 4 for `detectCycle`, 5 for `cmdPhaseAnalyzeDeps`. These cover all behavioral contracts.
- **Correlation with full metric:** HIGH — for a pure function algorithmic module, passing a comprehensive specification-derived test suite directly verifies the correctness property that matters
- **Blind spots:** Tests use fixture ROADMAP.md files; real ROADMAP.md may expose parser edge cases not anticipated in fixtures
- **Validated:** No — confirmed by P4 (real ROADMAP.md correctness check) and deferred validation at Phase 31

### P2: Parallel Groups Correct for v0.2.0 Roadmap Structure

- **What:** The live ROADMAP.md (v0.2.0 with phases 27-31 and known dependency structure) produces the correct parallel grouping
- **How:** Run the CLI against the actual project ROADMAP.md and verify the `parallel_groups` field
- **Command:** `node bin/grd-tools.js phase analyze-deps 2>&1 | node -e "const j=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(JSON.stringify(j.parallel_groups))"`
- **Target:** `parallel_groups` must satisfy: phases 27 and 29 appear in the same group (both have no dependencies), phase 31 appears last (depends on all others). Exact expected output: `[["27","29"],["28","30"],["31"]]` (or equivalent with sorted inner arrays)
- **Evidence:** The v0.2.0 dependency structure is fully specified in ROADMAP.md and Plan 29-01 test case 4 (computeParallelGroups test #4 covers this exact structure). This is a known-answer correctness test, not an approximation.
- **Correlation with full metric:** HIGH — if the algorithm correctly groups the actual project's phases, it will correctly group any similar real-world roadmap
- **Blind spots:** Only tests the current roadmap structure; does not stress-test at scale (100+ phases) or validate parser robustness for unusual ROADMAP.md formatting
- **Validated:** No — full validation at Phase 31 when parallel execution consumes this output

### P3: Zero Regressions on Full Test Suite

- **What:** All 1,487 pre-existing tests continue to pass after Phase 29 changes
- **How:** Run the full Jest test suite
- **Command:** `npx jest --no-coverage 2>&1 | tail -5`
- **Target:** Tests: 1,487 + N passed (where N >= 31, the new deps tests), 0 failed. Test Suites: all passed.
- **Evidence:** Every prior phase in GRD has maintained zero regressions. The refactoring of `cmdRoadmapAnalyze` into `analyzeRoadmap` + thin wrapper is behavior-preserving — existing roadmap tests cover the same output and must still pass.
- **Correlation with full metric:** HIGH — existing tests cover CLI routing, roadmap parsing, and all existing commands that could be affected by the `lib/roadmap.js` refactor
- **Blind spots:** Does not detect performance regressions or memory leaks introduced by the new module
- **Validated:** No — confirmed at each plan execution; considered validated if all 28 test suites pass

### P4: Cycle Detection Returns Cycle Path (Not Crash or Hang)

- **What:** When given a circular dependency, `cmdPhaseAnalyzeDeps` returns a structured error with `has_cycle: true` and a `cycle_path` array, not an exception or infinite loop
- **How:** Run the function against a minimal cyclic ROADMAP.md fixture
- **Command:** `node -e "
const { cmdPhaseAnalyzeDeps } = require('./lib/deps');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-eval-'));
fs.mkdirSync(path.join(tmp, '.planning'));
fs.writeFileSync(path.join(tmp, '.planning', 'ROADMAP.md'),
  '## Milestone v1\n### Phase 1: A\n**Goal:** X\n**Depends on:** Phase 2\n### Phase 2: B\n**Goal:** Y\n**Depends on:** Phase 1\n');
let out = '';
const orig = process.stdout.write.bind(process.stdout);
process.stdout.write = (s) => { out += s; return true; };
cmdPhaseAnalyzeDeps(tmp, false);
process.stdout.write = orig;
const j = JSON.parse(out);
console.log('has_cycle:', j.has_cycle, 'cycle_path_len:', (j.cycle_path || []).length);
fs.rmSync(tmp, { recursive: true });
"`
- **Target:** Output: `has_cycle: true cycle_path_len: 2` (or greater; cycle path contains both nodes)
- **Evidence:** Plan 29-01 detectCycle test case 2 specifies this behavior directly. DFS-based cycle detection with path reconstruction is a standard algorithm with well-known correctness properties.
- **Correlation with full metric:** HIGH — directly tests the success criterion "Circular dependency detection reports an error with the cycle path rather than hanging or crashing"
- **Blind spots:** Only tests a 2-node cycle; 3+ node cycles are covered by unit tests but not this sanity script
- **Validated:** No — this is a direct functional test; considered validated when unit tests pass

**Proxy gate:** P3 (zero regressions) is required. P1, P2, and P4 are required for phase completion sign-off. Any proxy failure triggers review before proceeding to Phase 30.

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration with Phase 30 components not yet built.

### D1: Parallel Executor Consumes analyze-deps Output Correctly — DEFER-29-01

- **What:** Phase 30's parallel execution orchestrator reads `grd-tools phase analyze-deps` JSON output and correctly uses `parallel_groups` to spawn independent teammate agents in separate worktrees
- **How:** Run Phase 30 execution with a multi-phase roadmap containing known independent phases; verify that phases in the same parallel group execute concurrently (separate worktrees, parallel timeline) rather than sequentially
- **Why deferred:** Phase 30 (`lib/parallel.js` and execute-phase multi-phase orchestration) does not exist yet. The integration point — `parallel_groups` consumed by a spawning orchestrator — cannot be tested without Phase 30.
- **Validates at:** phase-31-integration
- **Depends on:** Phase 27 (worktree infrastructure), Phase 28 (PR workflow), Phase 30 (parallel execution + teammate spawning)
- **Target:** Two independent phases (e.g., 27 and 29 from v0.2.0) execute in separate worktrees simultaneously; their combined wall-clock time is less than sequential execution time; both produce PRs with correct branch names
- **Risk if unmet:** The `parallel_groups` schema or field names may not match what Phase 30's executor expects, requiring a breaking change to the JSON output format. Impact: 1 iteration to align schemas before Phase 31 integration tests can pass.
- **Fallback:** If schema mismatch is detected at Phase 30, update `cmdPhaseAnalyzeDeps` output fields to match Phase 30's interface. This is a low-risk schema change with no algorithmic impact.

## Ablation Plan

**No ablation plan** — Phase 29 implements a single dependency analysis module with no sub-components to isolate against each other. The four pure functions (`parseDependsOn`, `buildDependencyGraph`, `computeParallelGroups`, `detectCycle`) are individually covered by their own unit test describe blocks, which serves the purpose an ablation would serve in an ML context.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Full test suite | Tests passing before Phase 29 | 1,487 tests, 0 failures | STATE.md performance metrics (28-02 completion) |
| Phase subcommands | Currently supported: next-decimal, add, insert, remove, complete | 5 subcommands | CLI output before Phase 29 |
| MCP tool count | MCP tools before Phase 29 | 105 tools (from CLAUDE.md v0.1.3 reference) | Codebase history |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/deps.test.js   — created during phase execution (Plan 01 Task 1)
```

**How to run full evaluation:**
```bash
# Level 1: All sanity checks
node -e "const d = require('./lib/deps'); console.log(Object.keys(d).join(','))"
node bin/grd-tools.js phase analyze-deps 2>&1 | head -3
node bin/grd-tools.js phase analyze-deps 2>&1 | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(['nodes','edges','parallel_groups','has_cycle'].every(k=>k in j))"
node -e "const r = require('./lib/roadmap'); console.log(typeof r.analyzeRoadmap)"
grep -c "grd_phase_analyze_deps" lib/mcp-server.js

# Level 2: Proxy metrics
npx jest tests/unit/deps.test.js --no-coverage 2>&1 | tail -10
node bin/grd-tools.js phase analyze-deps 2>&1 | node -e "const j=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(JSON.stringify(j.parallel_groups))"
npx jest --no-coverage 2>&1 | tail -5
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module exports | | | |
| S2: CLI subcommand routed | | | |
| S3: CLI output valid JSON | | | |
| S4: analyzeRoadmap exported | | | |
| S5: MCP descriptor registered | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Unit tests pass | >= 26 tests, 0 failures | | | |
| P2: Parallel groups for v0.2.0 | [["27","29"],["28","30"],["31"]] | | | |
| P3: Zero regressions | 1,487 + N passed, 0 failed | | | |
| P4: Cycle detection | has_cycle: true, cycle_path present | | | |

### Ablation Results

N/A — no ablation conditions defined.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-29-01 | Parallel executor consumes analyze-deps output | PENDING | phase-31-integration |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — five targeted checks cover module availability, CLI routing, output schema, dependency between modules (`analyzeRoadmap` extraction), and MCP registration. All are deterministic and take under 2 seconds total.
- Proxy metrics: Well-evidenced — for a pure-function algorithmic CLI module, a TDD test suite derived from the behavioral specification is a strong correctness signal, not a weak proxy. The v0.2.0 known-answer test (P2) directly exercises the exact use case that Phase 30 will depend on.
- Deferred coverage: Comprehensive — the one deferred item is the only thing that genuinely cannot be tested in isolation: the consumer of this module's output. Everything else is verifiable in-phase.

**What this evaluation CAN tell us:**
- Whether `parseDependsOn` handles all ROADMAP.md `depends_on` string variants (Nothing, Phase N, Phase N and Phase M, comma-separated, null)
- Whether `computeParallelGroups` correctly groups the actual v0.2.0 roadmap phases
- Whether `detectCycle` returns a cycle path rather than hanging or throwing on circular input
- Whether the CLI subcommand and MCP tool are correctly wired (routing, schema, field names)
- Whether the `lib/roadmap.js` refactor is behavior-preserving (zero regressions on 1,487 existing tests)

**What this evaluation CANNOT tell us:**
- Whether Phase 30's executor will correctly interpret `parallel_groups` without schema negotiation (resolved at Phase 31)
- Whether the parser handles ROADMAP.md formatting variants not present in current fixtures (e.g., multi-line depends_on values, inconsistent spacing) — this is a low-probability risk given the ROADMAP.md format is controlled

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-19*
