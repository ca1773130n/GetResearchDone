# Evaluation Plan: Phase 55 — Evolve Core Engine

**Designed:** 2026-02-22
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Evolve state layer, codebase discovery engine, priority selection heuristic, CLI/MCP wiring
**Reference papers:** None — implementation phase. Evaluation designed from first principles and requirement specifications (REQ-55, REQ-56, REQ-57).

## Evaluation Overview

Phase 55 introduces `lib/evolve.js` as a new module with three layered capabilities: (1) a state persistence layer for iteration handoff, (2) a deterministic codebase discovery engine across 6 dimensions, and (3) CLI/MCP exposure via `bin/grd-tools.js` and `lib/mcp-server.js`. The phase is purely a software engineering phase — no research papers, no machine learning models. All evaluation is therefore code-quality and correctness-focused rather than statistical.

Three waves execute in dependency order: Wave 1 creates the state data structures and disk I/O; Wave 2 adds the discovery and selection logic; Wave 3 wires CLI routing, MCP registration, and enforces coverage thresholds via jest.config.js. The evaluation plan mirrors this structure — sanity checks apply to every wave, proxy metrics focus on correctness and coverage, and the single deferred item (discovery quality on real codebases) waits for the integration phase (Phase 57).

The fundamental evaluation challenge for this phase is that the "real quality" of the discovery engine — whether it surfaces actionable, meaningful improvement items on arbitrary codebases — cannot be assessed mechanically. Automated tests can verify structure, field presence, and scoring arithmetic, but cannot judge whether a discovered work item is actually worth doing. This limitation is acknowledged honestly in the deferred tier.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit test pass rate | Standard TDD practice (27+ tests Wave 1, 47+ total Wave 2) | Directly verifies function contracts and edge cases |
| Line coverage >= 85% on lib/evolve.js | Plan 03 jest.config.js threshold | Established project standard for all lib/ modules |
| Function coverage >= 90% on lib/evolve.js | Plan 03 jest.config.js threshold | Per-file threshold consistent with existing modules |
| Branch coverage >= 70% on lib/evolve.js | Plan 03 jest.config.js threshold | Per-file threshold consistent with existing modules |
| ESLint zero errors | Project pre-commit hook enforces lint | Prevents merge of non-conforming code |
| Round-trip state fidelity | REQ-57 iteration handoff correctness | State written and read back must be identical |
| Discovery produces items across multiple dimensions | REQ-55 coverage across 6 dimensions | Core requirement — not just one dimension |
| Deterministic scoring | REQ-56 — no randomness in selection | Required for reproducible selection behavior |
| Full test suite (1,983+ tests) zero regressions | CI health | CLI additions must not break existing commands |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 8 | Basic load, lint, format, run-without-crash, output-shape checks |
| Proxy (L2) | 7 | Coverage thresholds, test counts, structural correctness, determinism, regression gate |
| Deferred (L3) | 1 | Qualitative assessment of discovery output on non-trivial real codebases |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module load without error
- **What:** `lib/evolve.js` loads and exports all expected symbols without throwing
- **Command:** `node -e "const e = require('./lib/evolve'); console.log(Object.keys(e).sort().join(', '))"`
- **Expected:** Comma-separated list includes at minimum: `advanceIteration, analyzeCodebaseForItems, cmdEvolveAdvance, cmdEvolveDiscover, cmdEvolveReset, cmdEvolveState, cmdInitEvolve, createInitialState, createWorkItem, evolveStatePath, mergeWorkItems, readEvolveState, runDiscovery, scoreWorkItem, selectPriorityItems, WORK_ITEM_DIMENSIONS, writeEvolveState`
- **Failure means:** Module has a syntax error, missing export, or broken require chain

### S2: Initial state shape
- **What:** `createInitialState` produces a valid state object with all required sections
- **Command:** `node -e "const e = require('./lib/evolve'); const s = e.createInitialState('v0.2.8', 5); const required = ['iteration','timestamp','milestone','items_per_iteration','selected','remaining','bugfix','completed','failed','history']; const missing = required.filter(k => !(k in s)); console.log(missing.length === 0 ? 'OK' : 'MISSING: ' + missing.join(', '))"`
- **Expected:** `OK`
- **Failure means:** State schema is incomplete; iteration handoff (REQ-57) will silently drop data

### S3: ESLint zero errors on all modified files
- **Command:** `npx eslint lib/evolve.js bin/grd-tools.js lib/mcp-server.js`
- **Expected:** No output (zero errors, zero warnings promoted to errors)
- **Failure means:** Code violates project style rules; pre-commit hook will block merge

### S4: CLI subcommands run without crash (state subcommand — no file needed)
- **What:** CLI routing is wired correctly and the state subcommand handles missing file gracefully
- **Command:** `node bin/grd-tools.js evolve state 2>/dev/null; echo "exit:$?"`
- **Expected:** `exit:0` — exits cleanly even when no state file exists
- **Failure means:** CLI routing is broken or the no-file path throws an unhandled error

### S5: CLI discover subcommand produces parseable JSON
- **What:** `evolve discover` runs on the GRD codebase itself and outputs JSON
- **Command:** `node bin/grd-tools.js evolve discover 2>/dev/null | node -e "process.stdin.setEncoding('utf8'); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log('OK: selected=' + j.selected.length)}catch(e){console.log('FAIL: ' + e.message)}})"`
- **Expected:** `OK: selected=5` (or a small non-negative number)
- **Failure means:** Discovery crashes or outputs non-JSON; CLI wiring is broken

### S6: `init evolve` produces parseable JSON with backend field
- **What:** Workflow initialization context is reachable and well-formed
- **Command:** `node bin/grd-tools.js init evolve 2>/dev/null | node -e "process.stdin.setEncoding('utf8'); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log('OK: backend=' + j.backend)}catch(e){console.log('FAIL: ' + e.message)}})"`
- **Expected:** `OK: backend=claude-code` (or another valid backend name)
- **Failure means:** `cmdInitEvolve` is missing, crashes, or produces invalid JSON

### S7: WORK_ITEM_DIMENSIONS contains exactly 6 entries
- **What:** All 6 required discovery dimensions are defined
- **Command:** `node -e "const e = require('./lib/evolve'); console.log(e.WORK_ITEM_DIMENSIONS.length === 6 ? 'OK' : 'FAIL: ' + e.WORK_ITEM_DIMENSIONS.length)"`
- **Expected:** `OK`
- **Failure means:** A discovery dimension is missing; REQ-55 coverage requirement not met

### S8: No NaN/undefined in scored items
- **What:** Scoring arithmetic produces valid numbers for all dimension/effort/source combinations
- **Command:** `node -e "const e = require('./lib/evolve'); const dims=['productivity','quality','usability','consistency','stability','new-features']; const efforts=['small','medium','large']; const sources=['discovery','bugfix','carryover']; let bad=0; dims.forEach(d=>efforts.forEach(ef=>sources.forEach(s=>{const item=e.createWorkItem(d,'test-slug','T','D',{effort:ef,source:s}); const score=e.scoreWorkItem(item); if(!Number.isFinite(score)||score<=0) bad++; }))); console.log(bad===0?'OK':'FAIL: '+bad+' invalid scores')"`
- **Expected:** `OK`
- **Failure means:** Scoring function has missing cases or arithmetic errors

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to proxy evaluation or phase completion.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and quality.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. All are tagged `validated: false` until confirmed by deferred validation.

### P1: Unit test count — Wave 1 minimum
- **What:** Ensures adequate test coverage of state layer functions from Plan 01
- **How:** Run jest with verbose flag and count passing tests in evolve.test.js
- **Command:** `npx jest tests/unit/evolve.test.js --verbose 2>&1 | grep -E "^\s+✓|✕|PASS|FAIL" | tail -5 && npx jest tests/unit/evolve.test.js 2>&1 | grep "Tests:"`
- **Target:** 27+ tests passing (per Plan 01 success criteria); 0 failing
- **Evidence:** Plan 01 explicitly specifies 27+ tests covering all 7 exported state functions with edge cases
- **Correlation with full metric:** HIGH — test count + coverage jointly measure whether all required behaviors are specified and verified
- **Blind spots:** Tests may pass with overconstrained fixtures that don't reflect real-world usage. Count alone does not guarantee test quality.
- **Validated:** No — test quality confirmed by code review, not automated metric

### P2: Unit test count — Wave 2 total
- **What:** Confirms discovery and selection tests were added on top of Wave 1 state tests
- **How:** Total test count in evolve.test.js after Wave 2 execution
- **Command:** `npx jest tests/unit/evolve.test.js 2>&1 | grep "Tests:"`
- **Target:** 47+ tests passing; 0 failing
- **Evidence:** Plan 02 adds 20+ new tests (5 per discovery function) on top of 27 from Plan 01
- **Correlation with full metric:** HIGH — discovery behavior contracts are explicitly specified in test cases
- **Blind spots:** Discovery tests use controlled fixture directories. Behavior on arbitrary real-world codebases is not tested here (see DEFER-55-01).
- **Validated:** No — awaiting deferred validation at Phase 57

### P3: Line coverage >= 85% on lib/evolve.js
- **What:** The coverage threshold enforced by jest.config.js matches the standard set for all lib/ modules
- **How:** Jest coverage report against lib/evolve.js specifically
- **Command:** `npx jest tests/unit/evolve.test.js --coverage --coverageReporters=text 2>&1 | grep "evolve.js"`
- **Target:** Lines >= 85%, Functions >= 90%, Branches >= 70%
- **Evidence:** Plan 03 adds `./lib/evolve.js: { lines: 85, functions: 90, branches: 70 }` to jest.config.js; this matches the floor applied to all lib/ modules (see jest.config.js existing thresholds: parallel.js=85, state.js=85, tracker.js=85, verify.js=85, worktree.js=85)
- **Correlation with full metric:** MEDIUM — coverage measures test execution paths, not test quality. An evolve.js with 85% coverage and bad assertions will pass but not actually catch bugs.
- **Blind spots:** Branch coverage at 70% means up to 30% of conditional paths are untested. Discovery helper functions (not exported) may fall below this threshold without jest flagging them individually.
- **Validated:** No — awaiting deferred validation at Phase 57

### P4: Full test suite zero regressions
- **What:** The 1,983+ existing tests still pass after CLI and MCP modifications
- **How:** Full `npm test` run
- **Command:** `npm test 2>&1 | tail -10`
- **Target:** Same number of passing tests as before Phase 55 changes; 0 new failures
- **Evidence:** Adding a new `case 'evolve':` in `bin/grd-tools.js` switch and new tool descriptors in `lib/mcp-server.js` are additive changes. If done correctly they cannot break existing command routing. The regression test catches any accidental modification of existing routes.
- **Correlation with full metric:** HIGH — if existing tests break, the phase introduced a regression regardless of evolve-specific functionality
- **Blind spots:** Integration tests may not cover all edge cases of CLI routing. A new import at the top of grd-tools.js that fails to resolve would crash all commands — caught here. A subtle routing conflict would only surface for that specific command.
- **Validated:** No — snapshot valid only at time of test run

### P5: Discovery produces items across at least 3 distinct dimensions
- **What:** The discovery engine does not degenerate to a single dimension on the GRD codebase
- **How:** Run discovery and check dimension diversity of results
- **Command:** `node bin/grd-tools.js evolve discover 2>/dev/null | node -e "process.stdin.setEncoding('utf8'); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const j=JSON.parse(d); const dims=new Set([...j.selected,...j.remaining].map(x=>x.dimension)); console.log('Dimensions found:', dims.size, [...dims].join(', '))})"`
- **Target:** >= 3 distinct dimensions represented across selected + remaining items
- **Evidence:** REQ-55 explicitly requires categorized items across 6 dimensions. The discovery engine has 6 independent helper functions. If the GRD codebase has any files, at least 3 dimensions should fire. The quality and consistency dimensions alone should surface multiple items (TODO comments, missing JSDoc, missing cmd* prefix patterns).
- **Correlation with full metric:** MEDIUM — dimension count is structural, not qualitative. 3 dimensions with trivial items is structurally compliant but functionally weak.
- **Blind spots:** Does not assess whether items are actionable or correctly categorized. Does not check that all 6 dimensions fired (only that 3 did).
- **Validated:** No — awaiting deferred validation at Phase 57

### P6: Scoring determinism
- **What:** Same item always scores identically; items ranked correctly by priority weights
- **How:** Score a quality/small/bugfix item and a new-features/large/carryover item; verify correct ordering
- **Command:** `node -e "const e = require('./lib/evolve'); const high=e.createWorkItem('quality','t1','T','D',{effort:'small',source:'bugfix'}); const low=e.createWorkItem('new-features','t2','T','D',{effort:'large',source:'carryover'}); const s1=e.scoreWorkItem(high); const s2=e.scoreWorkItem(low); console.log('high:', s1, 'low:', s2, s1>s2?'CORRECT':'FAIL')"`
- **Target:** `CORRECT` — quality/small/bugfix scores strictly higher than new-features/large/carryover
- **Evidence:** Plan 02 specifies scoring weights directly: quality=10, new-features=3, small=3, large=1, bugfix=5, carryover=1. The gap is (10+3+5)=18 vs (3+1+1)=5, so the ordering must hold.
- **Correlation with full metric:** HIGH — the scoring heuristic is fully deterministic arithmetic; this check directly validates the formula
- **Blind spots:** Does not test all 54 dimension/effort/source combinations exhaustively. Does not assess whether the weight choices themselves produce good real-world prioritization.
- **Validated:** No — weight appropriateness deferred to Phase 57

### P7: Round-trip state fidelity
- **What:** State written to disk and read back is byte-for-byte equivalent
- **How:** Write a state, read it back, compare JSON representations
- **Command:** `node -e "const e = require('./lib/evolve'); const os = require('os'); const tmp = os.tmpdir(); const s = e.createInitialState('v0.2.8', 5); e.writeEvolveState(tmp, s); const s2 = e.readEvolveState(tmp); const ok = JSON.stringify(s) === JSON.stringify(s2); console.log(ok ? 'ROUND-TRIP OK' : 'FAIL')"`
- **Target:** `ROUND-TRIP OK`
- **Evidence:** REQ-57 (iteration handoff) depends entirely on this property. If writeEvolveState and readEvolveState are inverses, iteration carry-over is reliable.
- **Correlation with full metric:** HIGH — directly measures the core property required by REQ-57
- **Blind spots:** Uses a freshly constructed state without work items. Does not test round-trip with large item arrays or unicode content in titles/descriptions.
- **Validated:** No — also tested by unit tests (S4 in test group 5 of Plan 01)

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or assessment not available during Phase 55 execution.

### D1: Work item discovery quality on non-trivial codebases — DEFER-55-01
- **What:** Whether the 6-dimension discovery engine produces actionable, meaningful, correctly-prioritized improvement items when run on real codebases beyond the GRD project itself
- **How:** Run `node bin/grd-tools.js evolve discover` on at least 2 non-trivial Node.js codebases (or on the GRD codebase after several more milestones of growth). Manually review 10 sampled items per codebase: are they real issues? are they actionable? are they correctly categorized by dimension? would a developer agree they are worth fixing?
- **Why deferred:** Discovery quality is a qualitative judgment. Automated tests verify structural correctness (field presence, valid dimensions, correct scoring arithmetic) but cannot determine whether a discovered "TODO comment" item is trivial noise or a genuine improvement opportunity. This requires human review of real output.
- **Validates at:** Phase 57 — Integration and Validation
- **Depends on:** Phase 55 execution complete (lib/evolve.js with discovery engine), Phase 57 integration test harness
- **Target:** >= 70% of sampled discovery items judged "actionable and correctly categorized" by the reviewer. Discovery spans all 6 dimensions (not just 1-2) on a sufficiently complex codebase.
- **Risk if unmet:** Discovery engine produces low-signal noise. The evolve loop selects low-value items, reducing autonomous improvement quality. Mitigation: refine per-dimension heuristics in a follow-on iteration; scoring weights may need tuning based on empirical review.
- **Fallback:** If discovery quality is poor at Phase 57, the evolve orchestrator (Phase 56) can be configured with a human-in-the-loop review step before committing to selected items, allowing quality filtering without blocking the overall loop.

## Ablation Plan

**No ablation plan** — Phase 55 implements a single, coherent module (`lib/evolve.js`) with no interchangeable sub-approaches. The discovery engine uses a fixed set of heuristics specified in the plan. The scoring formula uses specified fixed weights. There are no design choices to ablate within this phase.

The closest analog to ablation occurs at Phase 57, where the integration test will reveal whether individual discovery dimensions (productivity, quality, usability, consistency, stability, new-features) contribute meaningfully or whether specific helpers are generating noise.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 55 modifies only `lib/evolve.js`, `bin/grd-tools.js`, `lib/mcp-server.js`, and `jest.config.js`, which are all backend/CLI files with no frontend surface.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| lib/ module coverage floor | All lib/ modules must meet per-file thresholds | Lines >= 85%, Functions >= 90%, Branches >= 70% | jest.config.js existing thresholds (parallel.js, state.js, etc.) |
| Total test count | No regressions from current count | >= 1,983 tests passing | STATE.md "Total tests: 1,983" |
| Lint pass rate | Zero ESLint errors on modified files | 0 errors | Pre-commit hook; all existing lib/ modules lint-clean |
| evolve.js min lines (Wave 1) | Module is substantive, not stub | >= 120 lines | Plan 01 must_haves.artifacts min_lines |
| evolve.js min lines (Wave 3) | Module includes CLI cmd* functions | >= 300 lines | Plan 02 must_haves.artifacts min_lines |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/evolve.test.js   (created during phase execution)
lib/evolve.js               (created during phase execution)
```

**How to run full evaluation (after phase execution complete):**
```bash
# Sanity tier — run all at once
node -e "const e = require('./lib/evolve'); console.log(Object.keys(e).length + ' exports')" && \
node bin/grd-tools.js evolve state 2>/dev/null && echo "state: OK" && \
node bin/grd-tools.js evolve discover 2>/dev/null | node -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('discover: OK, selected='+j.selected.length)})" && \
node bin/grd-tools.js init evolve 2>/dev/null | node -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('init: OK, backend='+j.backend)})" && \
npx eslint lib/evolve.js bin/grd-tools.js lib/mcp-server.js && echo "lint: OK"

# Proxy tier — coverage + regression
npx jest tests/unit/evolve.test.js --coverage --coverageReporters=text 2>&1 | grep -E "evolve\.js|Tests:"
npm test 2>&1 | tail -5
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module load | | | |
| S2: Initial state shape | | | |
| S3: ESLint zero errors | | | |
| S4: CLI state subcommand | | | |
| S5: CLI discover JSON | | | |
| S6: init evolve JSON | | | |
| S7: WORK_ITEM_DIMENSIONS count | | | |
| S8: No NaN in scores | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Test count (Wave 1) | 27+ tests, 0 fail | | | |
| P2: Test count (Wave 2 total) | 47+ tests, 0 fail | | | |
| P3: Line coverage | Lines >= 85% | | | |
| P3: Function coverage | Functions >= 90% | | | |
| P3: Branch coverage | Branches >= 70% | | | |
| P4: Full suite regression | 0 new failures | | | |
| P5: Discovery dimension diversity | >= 3 dimensions | | | |
| P6: Scoring determinism | high > low: CORRECT | | | |
| P7: Round-trip state fidelity | ROUND-TRIP OK | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-55-01 | Work item discovery quality on real codebases | PENDING | Phase 57 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 8 checks cover all exported symbols, all CLI subcommands, and the critical state round-trip property. Each has an exact runnable command.
- Proxy metrics: Well-evidenced — coverage thresholds derive directly from jest.config.js patterns established across 19 existing modules. Test counts derive from plan success criteria. Scoring correctness derives from the specification's explicit numeric weights. The full-suite regression check is definitive.
- Deferred coverage: Honest — only one item deferred (DEFER-55-01), which is genuinely a qualitative judgment that cannot be automated. The deferred item has a concrete validates_at target (Phase 57) and a fallback plan.

**What this evaluation CAN tell us:**
- Whether `lib/evolve.js` loads, exports all required symbols, and produces structurally correct output
- Whether all unit tests pass and coverage thresholds are enforced
- Whether CLI routing is wired correctly and each subcommand returns parseable JSON
- Whether the scoring heuristic is deterministic and correctly ordered
- Whether state persistence round-trips with full fidelity
- Whether the evolve additions introduce any regressions in the existing 1,983-test suite

**What this evaluation CANNOT tell us:**
- Whether the discovered work items are actionable or meaningful on real-world codebases beyond GRD (deferred to Phase 57)
- Whether the scoring weights (quality=10, stability=9, etc.) produce good real-world prioritization outcomes (deferred to Phase 57 after observing real evolve loop runs)
- Whether the 6 discovery dimensions collectively surface the most impactful improvements (deferred to Phase 57 manual review)
- Whether `evolve advance` correctly carries state through multiple consecutive iterations end-to-end in a live evolve loop (deferred to Phase 56/57 integration)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-22*
