# Evaluation Plan: Phase 95 — Agentic Knowledge Enhancement

**Designed:** 2026-03-25
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Knowledge mining pipeline, KNOWHOW.md storage model, conditional agent context injection
**Reference papers:** None — this phase is an original feature design (no research papers)

## Evaluation Overview

Phase 95 introduces a new subsystem with three integrated pieces: (1) `lib/knowledge.ts` — a module for parsing, formatting, appending, and selecting KNOWHOW.md entries; (2) two updated agent definitions (`grd-planner.md`, `grd-phase-researcher.md`) with conditional KNOWHOW.md injection; and (3) a new pipeline step in `lib/autopilot.ts` that spawns `grd-knowledge-miner` after execute and before post-pipeline.

This phase has no external research paper to benchmark against. Correctness is evaluated entirely from the requirements specification (REQ-190 through REQ-193), the TypeScript compiler, ESLint, and Jest tests designed to exercise the module's contractual guarantees. The three plans (95-01 through 95-03) deliver in dependency order: data model and module first, agent updates second, pipeline integration and tests third.

The primary risk is the autopilot integration in plan 95-03: it touches `lib/autopilot.ts`, a large pipeline-critical module with existing coverage thresholds. The mining step must be genuinely non-blocking — a failure in the mining step that silently halts post-pipeline would be a regression. Integration tests are mandatory to verify the non-halt contract.

The `grd-knowledge-miner` agent definition itself cannot be fully evaluated without running a live autopilot session; that validation is deferred to a real-world compounding-improvement check.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | Project standard (`npm run build:check`) | Zero-tolerance type safety requirement |
| ESLint pass rate | Project standard (`npm run lint`) | Enforced pre-commit hook; failures block commits |
| Jest test pass rate | REQ-193 explicit requirement | Correctness contract for `lib/knowledge.ts` functions |
| Coverage thresholds | `jest.config.js` per-file thresholds pattern | Existing project convention; plan 95-03 adds `./lib/knowledge.ts: { lines: 85, functions: 100, branches: 75 }` |
| Agent definition structure | REQ-190 specification | Verifiable via grep/structural checks without running the agent |
| KNOWHOW.md format compliance | REQ-191 specification | Parse-roundtrip test validates format correctness |
| Pipeline non-halt contract | REQ-192 specification | Most critical integration property — must be explicitly tested |
| Backward compatibility | REQ-192, plan 95-03 truths | Pipeline must degrade gracefully when agent def is absent |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality: format, exports, build, lint, file existence |
| Proxy (L2) | 5 | Test coverage, structural correctness, parse-roundtrip, non-halt isolation |
| Deferred (L3) | 3 | Real compounding loop, planner behavior with live KNOWHOW entries, autopilot E2E |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compilation
- **What:** All new and modified TypeScript files compile cleanly with `strict: true`
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no TypeScript errors
- **Failure means:** Type error in `lib/knowledge.ts`, `lib/types.ts`, or `lib/autopilot.ts` — must be fixed before any other check

### S2: ESLint Pass
- **What:** New and modified files pass ESLint with zero errors
- **Command:** `npm run lint`
- **Expected:** Exit code 0, zero errors, zero warnings (project uses `--max-warnings 0`)
- **Failure means:** Code style violation in `lib/knowledge.ts` or `lib/autopilot.ts` — lint errors block the pre-commit hook

### S3: Module Exports Check
- **What:** `lib/knowledge.ts` exports exactly the four functions specified in REQ-191
- **Command:** `node -e "const m = require('./lib/knowledge'); console.log(Object.keys(m).sort().join(','))"`
- **Expected:** `appendKnowhowEntries,formatKnowhowEntry,parseKnowhowEntries,selectTopEntries`
- **Failure means:** Missing or misnamed export — plan 95-03 imports depend on exact names

### S4: KnowhowEntry Interface Presence
- **What:** `lib/types.ts` exports `KnowhowEntry` with all six required fields
- **Command:** `node -e "const ts = require('fs').readFileSync('lib/types.ts','utf8'); ['pattern_name','source','applicability','code_snippet','phase_number','created_at'].forEach(f => { if (!ts.includes(f)) throw new Error('Missing field: ' + f); }); console.log('all fields present')"`
- **Expected:** `all fields present`
- **Failure means:** Interface is incomplete — downstream consumers will fail type checking

### S5: Agent Definition File Exists
- **What:** `agents/grd-knowledge-miner.md` exists with required structural markers
- **Command:** `test -f agents/grd-knowledge-miner.md && grep -q "KNOWHOW-ENTRY" agents/grd-knowledge-miner.md && grep -q "mining_heuristics\|mining heuristics" agents/grd-knowledge-miner.md && grep -q "output_format\|output format" agents/grd-knowledge-miner.md && echo "agent OK"`
- **Expected:** `agent OK`
- **Failure means:** Agent definition missing or malformed — pipeline check in `lib/autopilot.ts` will skip mining silently, masking a delivery failure

### S6: Knowhow Injection Present in Both Agents
- **What:** Both `grd-planner.md` and `grd-phase-researcher.md` reference `KNOWHOW.md`
- **Command:** `grep -l "KNOWHOW.md" agents/grd-planner.md agents/grd-phase-researcher.md | wc -l | tr -d ' '`
- **Expected:** `2`
- **Failure means:** Plan 95-02 not delivered — planner or researcher lacks the compounding-knowledge loop

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and integration quality.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: Full Test Suite Pass
- **What:** All Jest tests pass including new unit tests for `lib/knowledge.ts` and integration tests for the autopilot knowledge mining step
- **How:** Run Jest with coverage
- **Command:** `npm test`
- **Target:** Exit code 0, all suites green, coverage thresholds met for `./lib/knowledge.ts` (lines >= 85, functions == 100, branches >= 75)
- **Evidence:** Project established per-file coverage thresholds in `jest.config.js` for every `lib/` module; plan 95-03 task 3 adds the `./lib/knowledge.ts` threshold explicitly
- **Correlation with full metric:** HIGH — tests directly exercise the contractual behaviors (parse, format, append, deduplicate, select, non-halt)
- **Blind spots:** Tests can only verify behaviors that were thought of during test design; emergent integration failures in live autopilot sessions are not covered
- **Validated:** No — awaiting deferred validation at phase-95-end-to-end

### P2: Parse-Roundtrip Fidelity
- **What:** `parseKnowhowEntries(formatKnowhowEntry(entry)) === entry` for all fields — the format is invertible
- **How:** Covered by unit tests in `tests/unit/knowledge.test.ts` via the "formats a complete KnowhowEntry back to markdown" + "parses a well-formed KNOWHOW.md" test combination
- **Command:** `npx jest tests/unit/knowledge.test.ts --no-coverage --verbose`
- **Target:** All roundtrip-related test cases pass; no field is lost in serialize/deserialize
- **Evidence:** Plan 95-01 spec defines matching formats for `formatKnowhowEntry` and `parseKnowhowEntries`; roundtrip integrity is verifiable without a live agent
- **Correlation with full metric:** HIGH — if the format is not invertible, entries accumulated in KNOWHOW.md will be silently corrupted on re-read
- **Blind spots:** Only covers the synthetic test fixture; actual agent output may include whitespace variations or encoding edge cases not represented in fixtures
- **Validated:** No — awaiting deferred validation at phase-95-end-to-end

### P3: Autopilot Non-Halt Contract
- **What:** When the knowledge mining step throws, the pipeline continues to post-pipeline without halting
- **How:** Integration test in `tests/integration/autopilot-knowledge.test.ts` — "Pipeline non-halt behavior" suite mocks `spawnStep` to reject and asserts pipeline continues
- **Command:** `npx jest tests/integration/autopilot-knowledge.test.ts --no-coverage --verbose`
- **Target:** "Pipeline non-halt behavior" suite passes; `writeStatusMarker` called with `'failed'` state; no exception propagated
- **Evidence:** Plan 95-03 task 2 explicitly requires try/catch wrapping with continue; the integration test is the only verifiable proxy for this contract without running a full autopilot session
- **Correlation with full metric:** MEDIUM — mocked `spawnStep` does not reproduce the full async failure modes a real agent spawn can produce; OS-level process failures (signal, timeout, OOM) may not be captured by the mock
- **Blind spots:** Does not cover the case where `appendKnowhowEntries` throws (filesystem full, permissions); does not cover signal-based process termination in real agent spawning
- **Validated:** No — awaiting deferred validation at DEFER-95-03

### P4: Backward Compatibility — No Agent Definition
- **What:** When `agents/grd-knowledge-miner.md` does not exist, the pipeline skips the mining step silently
- **How:** Integration test "Pipeline skip behavior" suite mocks `fs.existsSync` to return false for the agent def path
- **Command:** `npx jest tests/integration/autopilot-knowledge.test.ts --no-coverage --verbose`
- **Target:** "Pipeline skip behavior" suite passes; `spawnStep` not called; no error thrown
- **Evidence:** Plan 95-03 requirement: "If agents/grd-knowledge-miner.md does not exist, the mining step is skipped silently (backward compatible) with a log message"
- **Correlation with full metric:** HIGH — the existence check is a simple boolean gate; the mock faithfully replicates the condition
- **Blind spots:** Does not test the path where the file exists but is malformed YAML
- **Validated:** No — awaiting deferred validation at DEFER-95-01

### P5: Autopilot Coverage Threshold Still Met
- **What:** Modifying `lib/autopilot.ts` does not drop coverage below its existing threshold (`lines: 83, functions: 91, branches: 75`)
- **How:** `npm test` collects coverage across all files; `jest.config.js` enforces per-file thresholds
- **Command:** `npm test -- --coverage`
- **Target:** `lib/autopilot.ts` coverage remains at or above `{ lines: 83, functions: 91, branches: 75 }`
- **Evidence:** `jest.config.js` already has this threshold for `./lib/autopilot.ts`; the new mining step code paths must be covered by `tests/integration/autopilot-knowledge.test.ts`
- **Correlation with full metric:** MEDIUM — branch coverage specifically may drop if the new `if (fs.existsSync(agentDefPath))` block adds uncovered branches not tested in existing suites
- **Blind spots:** Coverage percentage doesn't distinguish between critical and trivial branches; a branch being covered doesn't mean the behavior is correct
- **Validated:** No — awaiting deferred validation at DEFER-95-02

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring live agent execution or runtime conditions not available in-phase.

### D1: Real Autopilot Session with Knowledge Mining — DEFER-95-01
- **What:** Running `gd autopilot` on a real milestone actually invokes `grd-knowledge-miner`, the agent produces valid `---KNOWHOW-ENTRY---` blocks, and `KNOWHOW.md` is populated with parseable entries after phase completion
- **How:** Run autopilot on a subsequent milestone phase, inspect `KNOWHOW.md` for non-empty, well-formed entries after phase completes
- **Why deferred:** Requires a live agent spawn via the backend; cannot be simulated by unit or integration tests because the agent's reasoning is the object being evaluated
- **Validates at:** next-autopilot-session (first time autopilot runs a phase after phase 95 merges)
- **Depends on:** `agents/grd-knowledge-miner.md` deployed, `lib/autopilot.ts` changes merged, backend available
- **Target:** At least 1 well-formed KNOWHOW.md entry per autopilot phase; entries parse cleanly via `parseKnowhowEntries`
- **Risk if unmet:** The compounding improvement loop does not activate; phases run without accumulated knowledge context. Impact is missed improvement opportunity rather than breakage. Fallback: adjust agent prompt heuristics and retry.

### D2: Planner Consumes KNOWHOW Entries in Real Planning — DEFER-95-02
- **What:** `grd-planner.md` reads an existing `KNOWHOW.md` and references at least one applicable entry in a generated PLAN.md (pattern_name referenced in a task action block)
- **How:** Run `/grd:plan-phase` on a phase that follows a knowledge-mined phase; inspect the output PLAN.md for KNOWHOW entry references or "following the X pattern" language
- **Why deferred:** Agent behavior under real conditions cannot be verified without running the planner against actual KNOWHOW.md content; the `<knowhow>` injection is instruction-following behavior, not code logic
- **Validates at:** next-planning-session (first planning run after KNOWHOW.md is populated by D1)
- **Depends on:** D1 validated (KNOWHOW.md has entries), grd-planner.md updated with `<knowhow>` section
- **Target:** At least 1 PLAN.md in 3 consecutive planning runs references a KNOWHOW pattern explicitly
- **Risk if unmet:** The injection section exists but agents ignore it. Fallback: strengthen the `<knowhow>` section instructions; add explicit `REQUIRED:` directives; reduce injected entries to improve signal-to-noise.

### D3: Autopilot Coverage Threshold Integrity Under Full Suite — DEFER-95-03
- **What:** The new `lib/autopilot.ts` mining step branches are exercised by real integration tests, and the overall test suite continues passing after 3 subsequent phases add more code
- **How:** Run `npm test` after phase 96+ adds code; verify `lib/autopilot.ts` threshold still met
- **Why deferred:** New branches introduced in plan 95-03 may interact with future pipeline changes in unexpected ways; coverage drift is only detectable over time
- **Validates at:** phase-96 (or next phase that modifies `lib/autopilot.ts`)
- **Depends on:** Phase 96 plan executed with tests passing
- **Target:** `lib/autopilot.ts` maintains `{ lines: 83, functions: 91, branches: 75 }` or better
- **Risk if unmet:** Gradual coverage erosion; addressed by the existing per-file threshold enforcement in `jest.config.js` (threshold will fail CI automatically)

---

## Ablation Plan

**No ablation plan** — Phase 95 implements a new integrated feature (knowledge mining pipeline) not decomposed into sub-techniques with tradeoffs. The three plans (95-01, 95-02, 95-03) are sequential dependencies, not alternative implementations. Each is individually necessary for the feature to function.

The closest ablation-equivalent is the backward-compatibility check (P4): verifying that the feature's absence (no agent definition) degrades gracefully to the pre-95 state. This is covered as a proxy metric rather than an ablation.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 95 touches `lib/`, `agents/`, and `tests/` only.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| `lib/autopilot.ts` coverage | Existing threshold before mining step added | lines >= 83, functions >= 91, branches >= 75 | `jest.config.js` |
| `npm test` (pre-phase) | All existing tests passing before phase 95 changes | 100% pass rate, all thresholds met | Current green CI state |
| `npm run lint` (pre-phase) | ESLint clean before adding `lib/knowledge.ts` | 0 errors | Current green state |
| `npm run build:check` (pre-phase) | TypeScript compiles before new interfaces added | 0 errors | Current green state |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/knowledge.test.ts        (created in plan 95-03, task 1)
tests/integration/autopilot-knowledge.test.ts  (created in plan 95-03, task 4)
```

**How to run full evaluation:**
```bash
# All sanity checks (run in project root)
npm run build:check
npm run lint
node -e "const m = require('./lib/knowledge'); console.log(Object.keys(m).sort().join(','))"
node -e "const ts = require('fs').readFileSync('lib/types.ts','utf8'); ['pattern_name','source','applicability','code_snippet','phase_number','created_at'].forEach(f => { if (!ts.includes(f)) throw new Error('Missing field: ' + f); }); console.log('all fields present')"
test -f agents/grd-knowledge-miner.md && grep -q "KNOWHOW-ENTRY" agents/grd-knowledge-miner.md && grep -q "mining_heuristics\|mining heuristics" agents/grd-knowledge-miner.md && grep -q "output_format\|output format" agents/grd-knowledge-miner.md && echo "agent OK"
grep -l "KNOWHOW.md" agents/grd-planner.md agents/grd-phase-researcher.md | wc -l | tr -d ' '

# All proxy metrics
npm test
npx jest tests/unit/knowledge.test.ts --no-coverage --verbose
npx jest tests/integration/autopilot-knowledge.test.ts --no-coverage --verbose
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | | | |
| S2: ESLint pass | | | |
| S3: Module exports check | | | |
| S4: KnowhowEntry interface presence | | | |
| S5: Agent definition file exists | | | |
| S6: Knowhow injection in both agents | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Full test suite pass | Exit 0, all green, knowledge.ts thresholds met | | | |
| P2: Parse-roundtrip fidelity | All roundtrip test cases pass | | | |
| P3: Autopilot non-halt contract | Non-halt suite passes | | | |
| P4: Backward compat — no agent def | Skip suite passes, no error thrown | | | |
| P5: Autopilot coverage threshold | lines >= 83, functions >= 91, branches >= 75 | | | |

### Ablation Results

Not applicable — see Ablation Plan section.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-95-01 | Real autopilot session populates KNOWHOW.md | PENDING | next-autopilot-session |
| DEFER-95-02 | Planner references KNOWHOW entries in PLAN.md | PENDING | next-planning-session |
| DEFER-95-03 | Autopilot coverage threshold intact after future changes | PENDING | phase-96 |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM-HIGH

**Justification:**
- Sanity checks: adequate — six specific, runnable checks cover every deliverable file with grep-level structural verification
- Proxy metrics: well-evidenced for the code-level contracts (P1 through P5); the test suite directly exercises parse, format, append, deduplicate, select, non-halt, and skip behaviors as specified in the plan truths
- Deferred coverage: partial — the agent's actual reasoning quality (does it extract meaningful patterns?) cannot be evaluated without live execution; this is an inherent limitation of agent prompt evaluation

**What this evaluation CAN tell us:**
- Whether `lib/knowledge.ts` implements the correct algorithmic behavior for all four functions
- Whether `lib/autopilot.ts` correctly gates the mining step on agent definition existence
- Whether the mining step failure genuinely does not halt the pipeline (in the mocked integration test sense)
- Whether both agent definitions contain the structural KNOWHOW injection sections
- Whether the TypeScript types and ESLint rules are satisfied

**What this evaluation CANNOT tell us:**
- Whether `grd-knowledge-miner` extracts patterns that are genuinely useful for future planning (addressed at DEFER-95-01 via live session)
- Whether `grd-planner` actually uses the injected KNOWHOW entries when planning (addressed at DEFER-95-02 via real planning run)
- Whether the agent output format (`---KNOWHOW-ENTRY---` blocks) is stable across different backend models and prompt responses (addressed at DEFER-95-01)
- Whether mining step failures in production (agent timeout, OOM, signal) are handled as gracefully as in the mocked tests (addressed at DEFER-95-03)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-25*
